"""Orchestrates the two sync workflows from spec section 7_workflows:
policy-update-and-drift, and manual-recheck. Both end in a DriftReport
generated in the same request/response cycle — no polling, no queue.
"""

from uuid import UUID

from backend.config import settings
from backend.db.client import get_supabase
from backend.services import contract_evaluator, diff_engine, drift_report_generator, risk_scoring
from backend.services._concurrency import run_parallel


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

    # When a real diff was computed, scope re-evaluation of already-stored
    # contracts to just the policy clauses that were added/modified — they've
    # already been checked against everything else. A brand-new contract
    # upload or a manual recheck without a version pair (run_diff=False)
    # still needs the full policy, since nothing's been checked yet.
    policy_clause_scope = None
    if run_diff:
        amended_clause_ids = [
            cc["new_clause_id"]
            for cc in clause_changes
            if cc["change_type"] in ("added", "modified") and cc["new_clause_id"]
        ]
        if not amended_clause_ids:
            # diff ran but nothing was added/modified (e.g. only removals) —
            # no existing contract needs re-checking against this update.
            return drift_report_generator.generate_report(
                playbook_id, old_version_id, new_version_id, [], [], clause_changes
            )
        policy_clause_scope = amended_clause_ids

    contract_records = (
        supabase.table("contract_records")
        .select("*")
        .eq("playbook_id", str(playbook_id))
        .execute()
        .data
    )

    def process_record(record: dict) -> tuple[list[dict], list[dict]]:
        results = contract_evaluator.evaluate_contract(
            record, new_version_id, policy_clause_ids=policy_clause_scope
        )
        scores = [risk_scoring.score(r) for r in results]
        return results, scores

    per_record = run_parallel(process_record, contract_records, settings.llm_concurrency)
    compliance_results = [r for results, _ in per_record for r in results]
    risk_scores = [s for _, scores in per_record for s in scores]

    return drift_report_generator.generate_report(
        playbook_id, old_version_id, new_version_id, compliance_results, risk_scores, clause_changes
    )
