import asyncio
from uuid import UUID

from fastapi import APIRouter, HTTPException

from backend.db.client import get_supabase
from backend.schemas import DriftRecheckRequest
from backend.services import pipeline

router = APIRouter(tags=["drift"])


@router.post("/api/v1/drift/recheck")
async def recheck(body: DriftRecheckRequest):
    supabase = get_supabase()

    new_version_id = body.new_version_id
    if new_version_id is None:
        current = (
            supabase.table("policy_versions")
            .select("id")
            .eq("playbook_id", str(body.playbook_id))
            .eq("is_current", True)
            .limit(1)
            .execute()
        )
        if not current.data:
            raise HTTPException(404, "No current policy version for this playbook")
        new_version_id = current.data[0]["id"]

    run_diff = body.old_version_id is not None and body.new_version_id is not None
    # This can involve many sequential-looking-but-now-parallelized LLM calls
    # across every contract in the playbook — offload so it doesn't block the
    # event loop (and every other concurrent request) for the whole duration.
    drift_report = await asyncio.to_thread(
        pipeline.run_drift_pipeline, body.playbook_id, body.old_version_id, new_version_id, run_diff=run_diff
    )
    return {"drift_report_id": drift_report["id"]}


@router.get("/api/v1/drift-reports/{report_id}")
async def get_drift_report(report_id: UUID):
    supabase = get_supabase()
    result = supabase.table("drift_reports").select("*").eq("id", str(report_id)).execute()
    if not result.data:
        raise HTTPException(404, "Drift report not found")
    return result.data[0]


@router.get("/api/v1/drift-reports/{report_id}/final-document")
async def get_final_document(report_id: UUID, contract_id: UUID):
    supabase = get_supabase()

    report = supabase.table("drift_reports").select("finding_ids").eq("id", str(report_id)).execute()
    if not report.data:
        raise HTTPException(404, "Drift report not found")
    finding_ids = report.data[0]["finding_ids"]

    contract_records = (
        supabase.table("contract_records")
        .select("*")
        .eq("contract_id", str(contract_id))
        .order("sequence_order")
        .execute()
        .data
    )
    if not contract_records:
        raise HTTPException(404, "No contract records found for this contract")

    record_ids = [r["id"] for r in contract_records]
    findings = (
        supabase.table("compliance_check_results")
        .select("*")
        .in_("id", finding_ids)
        .in_("contract_record_id", record_ids)
        .eq("superseded", False)
        .execute()
        .data
        if finding_ids
        else []
    )

    decisions = (
        supabase.table("review_decisions")
        .select("*")
        .in_("compliance_check_result_id", [f["id"] for f in findings])
        .execute()
        .data
        if findings
        else []
    )
    decisions_by_finding = {d["compliance_check_result_id"]: d for d in decisions}

    # A clause can now have MULTIPLE findings per check_type (one per
    # violated rule), not just one — group as a list, not overwrite-by-key.
    findings_by_record: dict[str, list[dict]] = {}
    for f in findings:
        findings_by_record.setdefault(f["contract_record_id"], []).append(f)

    document = []
    for record in contract_records:
        record_findings = findings_by_record.get(record["id"], [])
        final_text = record["clause_text"]
        was_changed = False
        changed_by = None  # which check_type's decision drove the change, for the
        # track-changes annotation ("Approved — aligned to policy compliance" etc.)

        # policy_compliance decisions win over precedent decisions when both
        # exist. Within one check_type, multiple violations can each be
        # independently accepted — cascading re-evaluation means every
        # later accepted decision's final_text already reflects every
        # earlier accepted change on this same clause, so the MOST
        # RECENTLY decided one is the cumulative final state, not just
        # "whichever finding happened to be first."
        for check_type in ("policy_compliance", "precedent"):
            best_decision = None
            for finding in record_findings:
                if finding["check_type"] != check_type:
                    continue
                decision = decisions_by_finding.get(finding["id"])
                if not decision or decision["status"] not in ("accepted", "edited") or not decision["final_text"]:
                    continue
                if best_decision is None or decision["decided_at"] > best_decision["decided_at"]:
                    best_decision = decision
            if best_decision:
                final_text = best_decision["final_text"]
                was_changed = True
                changed_by = check_type
                break

        document.append(
            {
                "sequence_order": record["sequence_order"],
                "category": record["category"],
                "title": record.get("title") or record["category"],
                "section_heading": record.get("section_heading"),
                "original_text": record["clause_text"],
                "final_text": final_text,
                "was_changed": was_changed,
                "changed_by": changed_by,
            }
        )

    return document


@router.get("/api/v1/drift-reports/{report_id}/findings")
async def list_findings(report_id: UUID):
    """Batch version of get_finding_detail — assembles ALL findings for a
    report in a fixed small number of queries instead of one request (with
    ~7 queries each) per finding. Also folds in what used to be a separate
    /decisions call, since there's no reason to make the frontend round-trip
    twice."""
    return await asyncio.to_thread(_list_findings_sync, report_id)


def _list_findings_sync(report_id: UUID) -> dict:
    supabase = get_supabase()

    report = (
        supabase.table("drift_reports")
        .select("finding_ids, new_version_id")
        .eq("id", str(report_id))
        .execute()
    )
    if not report.data:
        raise HTTPException(404, "Drift report not found")
    finding_ids = report.data[0]["finding_ids"]
    new_version_id = report.data[0]["new_version_id"]

    if not finding_ids:
        return {"findings": [], "decisions": {}}

    ccrs = (
        supabase.table("compliance_check_results")
        .select("*")
        .in_("id", finding_ids)
        .eq("superseded", False)
        .execute()
        .data
    )
    ccr_ids = [c["id"] for c in ccrs]

    risk_scores = (
        supabase.table("risk_scores").select("*").in_("compliance_check_result_id", ccr_ids).execute().data
        if ccr_ids
        else []
    )
    risk_by_ccr = {r["compliance_check_result_id"]: r for r in risk_scores}

    # One report = one new_version_id, so fetch all changes for that version
    # once and pick the first match per category client-side — same
    # first-match semantics as the single-finding route's .limit(1).
    all_changes = (
        supabase.table("clause_changes").select("*").eq("new_version_id", str(new_version_id)).execute().data
    )
    change_by_category: dict[str, dict] = {}
    for c in all_changes:
        change_by_category.setdefault(c["category"], c)

    contract_record_ids: set[str] = set()
    policy_clause_ids: set[str] = set()
    for c in ccrs:
        contract_record_ids.add(c["contract_record_id"])
        contract_record_ids.update(c.get("matched_precedent_ids") or [])
        policy_clause_ids.update(c.get("matched_policy_clause_ids") or [])

    contract_records = (
        supabase.table("contract_records").select("*").in_("id", list(contract_record_ids)).execute().data
        if contract_record_ids
        else []
    )
    contract_by_id = {r["id"]: r for r in contract_records}

    policy_clauses = (
        supabase.table("policy_clauses").select("*").in_("id", list(policy_clause_ids)).execute().data
        if policy_clause_ids
        else []
    )
    policy_by_id = {p["id"]: p for p in policy_clauses}

    decisions = (
        supabase.table("review_decisions").select("*").in_("compliance_check_result_id", ccr_ids).execute().data
        if ccr_ids
        else []
    )
    decisions_by_finding = {d["compliance_check_result_id"]: d for d in decisions}

    findings = []
    for ccr in ccrs:
        contract_record = contract_by_id.get(ccr["contract_record_id"])
        clause_change = change_by_category.get(contract_record["category"]) if contract_record else None
        matched_policy = [
            policy_by_id[i] for i in (ccr.get("matched_policy_clause_ids") or []) if i in policy_by_id
        ]
        matched_precedents = [
            contract_by_id[i] for i in (ccr.get("matched_precedent_ids") or []) if i in contract_by_id
        ]
        findings.append(
            {
                "compliance_check_result": ccr,
                "risk_score": risk_by_ccr.get(ccr["id"]),
                "clause_change": clause_change,
                "contract_record": contract_record,
                "matched_policy_clauses": matched_policy,
                "matched_precedents": matched_precedents,
            }
        )

    return {"findings": findings, "decisions": decisions_by_finding}


@router.get("/api/v1/drift-reports/{report_id}/findings/{finding_id}")
async def get_finding_detail(report_id: UUID, finding_id: UUID):
    supabase = get_supabase()

    report = supabase.table("drift_reports").select("finding_ids").eq("id", str(report_id)).execute()
    if not report.data or str(finding_id) not in report.data[0]["finding_ids"]:
        raise HTTPException(404, "Finding not found on this drift report")

    compliance_check_result = (
        supabase.table("compliance_check_results").select("*").eq("id", str(finding_id)).execute()
    )
    if not compliance_check_result.data:
        raise HTTPException(404, "Finding not found")
    compliance_check_result = compliance_check_result.data[0]

    risk_score = (
        supabase.table("risk_scores")
        .select("*")
        .eq("compliance_check_result_id", str(finding_id))
        .limit(1)
        .execute()
    )
    contract_record = (
        supabase.table("contract_records")
        .select("*")
        .eq("id", compliance_check_result["contract_record_id"])
        .execute()
    )
    clause_change = (
        supabase.table("clause_changes")
        .select("*")
        .eq("category", contract_record.data[0]["category"])
        .eq("new_version_id", compliance_check_result["checked_against_version_id"])
        .limit(1)
        .execute()
    )
    matched_policy_clauses = (
        supabase.table("policy_clauses")
        .select("*")
        .in_("id", compliance_check_result["matched_policy_clause_ids"])
        .execute()
        if compliance_check_result["matched_policy_clause_ids"]
        else None
    )
    matched_precedents = (
        supabase.table("contract_records")
        .select("*")
        .in_("id", compliance_check_result["matched_precedent_ids"])
        .execute()
        if compliance_check_result["matched_precedent_ids"]
        else None
    )

    return {
        "compliance_check_result": compliance_check_result,
        "risk_score": risk_score.data[0] if risk_score.data else None,
        "clause_change": clause_change.data[0] if clause_change.data else None,
        "contract_record": contract_record.data[0],
        "matched_policy_clauses": matched_policy_clauses.data if matched_policy_clauses else [],
        "matched_precedents": matched_precedents.data if matched_precedents else [],
    }
