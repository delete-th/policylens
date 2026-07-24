"""Orchestrates the two sync workflows from spec section 7_workflows:
policy-update-and-drift, and manual-recheck. Both end in a DriftReport
generated in the same request/response cycle — no polling, no queue.
"""

from uuid import UUID

from backend.db.client import get_supabase
from backend.services import contract_evaluator, diff_engine, drift_report_generator, risk_scoring


def run_drift_pipeline(
    playbook_id: UUID,
    old_version_id: UUID | None,
    new_version_id: UUID,
    run_diff: bool = True,
) -> dict:
    supabase = get_supabase()

    clause_changes = (
        diff_engine.diff_versions(playbook_id, old_version_id, new_version_id) if run_diff else []
    )

    contract_records = (
        supabase.table("contract_records")
        .select("*")
        .eq("playbook_id", str(playbook_id))
        .execute()
        .data
    )

    compliance_results = []
    risk_scores = []
    for record in contract_records:
        compliance_result = contract_evaluator.evaluate_contract(record, new_version_id)
        compliance_results.append(compliance_result)
        risk_scores.append(risk_scoring.score(compliance_result))

    return drift_report_generator.generate_report(
        playbook_id, old_version_id, new_version_id, compliance_results, risk_scores, clause_changes
    )
