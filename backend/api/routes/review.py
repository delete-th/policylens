import asyncio
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, HTTPException

from backend.db.client import get_supabase
from backend.schemas import DecisionRequest
from backend.services import contract_evaluator, embedding, risk_scoring, text_span

router = APIRouter(prefix="/api/v1", tags=["review"])


@router.patch("/findings/{finding_id}/decision")
async def set_decision(finding_id: UUID, body: DecisionRequest):
    # Accepting/editing can now trigger cascading re-evaluation (several
    # LLM calls) — offload so it doesn't block the event loop.
    return await asyncio.to_thread(_set_decision_sync, finding_id, body)


def _set_decision_sync(finding_id: UUID, body: DecisionRequest) -> dict:
    supabase = get_supabase()

    finding = supabase.table("compliance_check_results").select("*").eq("id", str(finding_id)).execute()
    if not finding.data:
        raise HTTPException(404, "Finding not found")
    finding = finding.data[0]

    if body.status == "edited" and not body.final_text:
        raise HTTPException(400, "final_text is required when status is 'edited'")

    if body.status == "rejected":
        final_text = None
    elif body.status == "accepted":
        final_text = body.final_text or finding["suggested_text"]
    else:
        final_text = body.final_text

    decision = (
        supabase.table("review_decisions")
        .upsert(
            {
                "compliance_check_result_id": str(finding_id),
                "status": body.status.value,
                "final_text": final_text,
                "decided_at": datetime.now(timezone.utc).isoformat(),
            },
            on_conflict="compliance_check_result_id",
        )
        .execute()
        .data[0]
    )

    updated_findings: list[dict] = []
    if body.status in ("accepted", "edited") and final_text:
        updated_findings = _cascade_reevaluation(finding, final_text, body.report_id)

    return {"decision": decision, "updated_findings": updated_findings}


def _cascade_reevaluation(decided_finding: dict, effective_text: str, report_id: UUID | None) -> list[dict]:
    """An accepted/edited decision changes this clause's effective text —
    every OTHER still-pending finding on the same contract_record may need
    a fresh verdict against that new text. Policy violations are a 1:1
    targeted refresh (same specific rule they were already tied to);
    precedent is a full fresh retrieval + re-check, since the accepted fix
    could introduce a brand-new inconsistency or change which precedent
    clause is even the closest match."""
    supabase = get_supabase()
    contract_record_id = decided_finding["contract_record_id"]
    checked_against_version_id = decided_finding["checked_against_version_id"]

    contract_record = (
        supabase.table("contract_records").select("*").eq("id", contract_record_id).execute().data[0]
    )

    # Every full recheck of a contract inserts a brand-new generation of
    # compliance_check_results rows for each clause without marking the
    # PREVIOUS generation superseded (that pipeline predates the
    # `superseded` mechanism, which only the cascade below writes to).
    # Repeated rechecks on the same contract_record therefore leave
    # multiple non-superseded "generations" of rows sharing one
    # contract_record_id. Filtering by contract_record_id + superseded
    # alone pulls in stale rows from an EARLIER recheck as if they were
    # live siblings of the finding just decided — reevaluating/merging
    # them corrupts the report the user is actually looking at. Scoping
    # to the current report's own finding_ids keeps the cascade confined
    # to that one generation.
    report_finding_ids: set[str] | None = None
    if report_id:
        report = supabase.table("drift_reports").select("finding_ids").eq("id", str(report_id)).execute().data
        if report:
            report_finding_ids = set(report[0]["finding_ids"] or [])

    all_for_record = (
        supabase.table("compliance_check_results")
        .select("*")
        .eq("contract_record_id", contract_record_id)
        .eq("superseded", False)
        .execute()
        .data
    )
    if report_finding_ids is not None:
        all_for_record = [f for f in all_for_record if f["id"] in report_finding_ids]
    candidates = [f for f in all_for_record if f["id"] != decided_finding["id"]]
    candidate_ids = [f["id"] for f in candidates]
    decided_ids: set[str] = set()
    if candidate_ids:
        decided_ids = {
            d["compliance_check_result_id"]
            for d in supabase.table("review_decisions")
            .select("compliance_check_result_id")
            .in_("compliance_check_result_id", candidate_ids)
            .execute()
            .data
        }

    policy_siblings = [
        f for f in candidates
        if f["id"] not in decided_ids and f["check_type"] == "policy_compliance" and f["result"] == "non_compliant"
    ]
    pending_precedent = [
        f for f in candidates if f["id"] not in decided_ids and f["check_type"] == "precedent"
    ]

    updated: list[dict] = []
    new_finding_ids: list[str] = []

    # ── Policy siblings: targeted 1:1 refresh, same rule, new text ──
    for sib in policy_siblings:
        matched_ids = sib.get("matched_policy_clause_ids") or []
        if not matched_ids:
            continue
        rule = supabase.table("policy_clauses").select("*").eq("id", matched_ids[0]).execute().data
        if not rule:
            continue
        rule = rule[0]
        verdict = contract_evaluator.reevaluate_single_rule(
            effective_text,
            {"category": rule["category"], "text": rule["clause_text"], "rule": rule.get("extracted_rule")},
        )
        suggested_text = verdict.get("suggested_replacement_text")
        violating_text = verdict.get("violating_text")
        if verdict["result"] == "non_compliant" and suggested_text and violating_text:
            suggested_text = text_span.splice_replacement(effective_text, violating_text, suggested_text)
        updated_row = (
            supabase.table("compliance_check_results")
            .update(
                {
                    "result": verdict["result"],
                    "reason": verdict["reason"],
                    "suggested_text": suggested_text,
                    "violating_text": violating_text,
                }
            )
            .eq("id", sib["id"])
            .execute()
            .data[0]
        )
        risk_scoring.update_score(updated_row)
        updated.append(updated_row)

    # ── Precedent: full fresh retrieval + re-check against the new text ──
    if pending_precedent:
        for p in pending_precedent:
            supabase.table("compliance_check_results").update({"superseded": True}).eq("id", p["id"]).execute()

        fresh_embedding = embedding.embed_text(effective_text)
        matched_precedents = embedding.find_similar_contract_clauses(
            fresh_embedding, contract_record["playbook_id"], contract_record["contract_id"]
        )
        fresh_verdicts = contract_evaluator.reevaluate_precedent(effective_text, matched_precedents)
        row_dicts = contract_evaluator.rows_from_verdicts(fresh_verdicts, matched_precedents, "precedent", effective_text)
        for rd in row_dicts:
            row = (
                supabase.table("compliance_check_results")
                .insert(
                    {
                        **rd,
                        "contract_record_id": contract_record_id,
                        "checked_against_version_id": checked_against_version_id,
                    }
                )
                .execute()
                .data[0]
            )
            risk_scoring.score(row)
            updated.append(row)
            new_finding_ids.append(row["id"])

    if report_id and new_finding_ids and report_finding_ids is not None:
        merged = list(report_finding_ids) + new_finding_ids
        supabase.table("drift_reports").update({"finding_ids": merged}).eq("id", str(report_id)).execute()

    return [_build_finding_response(row, contract_record) for row in updated]


def _build_finding_response(ccr: dict, contract_record: dict) -> dict:
    supabase = get_supabase()
    risk_score = (
        supabase.table("risk_scores")
        .select("*")
        .eq("compliance_check_result_id", ccr["id"])
        .limit(1)
        .execute()
        .data
    )
    policy_ids = ccr.get("matched_policy_clause_ids") or []
    matched_policy = (
        supabase.table("policy_clauses").select("*").in_("id", policy_ids).execute().data if policy_ids else []
    )
    precedent_ids = ccr.get("matched_precedent_ids") or []
    matched_precedents = (
        supabase.table("contract_records").select("*").in_("id", precedent_ids).execute().data
        if precedent_ids
        else []
    )
    return {
        "compliance_check_result": ccr,
        "risk_score": risk_score[0] if risk_score else None,
        "contract_record": contract_record,
        "matched_policy_clauses": matched_policy,
        "matched_precedents": matched_precedents,
    }


@router.get("/drift-reports/{report_id}/decisions")
async def list_decisions(report_id: UUID):
    supabase = get_supabase()

    report = supabase.table("drift_reports").select("finding_ids").eq("id", str(report_id)).execute()
    if not report.data:
        raise HTTPException(404, "Drift report not found")

    finding_ids = report.data[0]["finding_ids"]
    if not finding_ids:
        return []

    decisions = (
        supabase.table("review_decisions")
        .select("*")
        .in_("compliance_check_result_id", finding_ids)
        .execute()
    )
    return decisions.data
