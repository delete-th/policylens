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
    drift_report = pipeline.run_drift_pipeline(
        body.playbook_id, body.old_version_id, new_version_id, run_diff=run_diff
    )
    return {"drift_report_id": drift_report["id"]}


@router.get("/api/v1/drift-reports/{report_id}")
async def get_drift_report(report_id: UUID):
    supabase = get_supabase()
    result = supabase.table("drift_reports").select("*").eq("id", str(report_id)).execute()
    if not result.data:
        raise HTTPException(404, "Drift report not found")
    return result.data[0]


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
