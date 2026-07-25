"""DriftReportGeneratorNode. Runs synchronously right after recheck+scoring,
in the same request — no job status."""

from collections import Counter
from uuid import UUID

from backend.db.client import get_supabase
from backend.services import ai_summary


def generate_report(
    playbook_id: UUID,
    old_version_id: UUID | None,
    new_version_id: UUID,
    compliance_results: list[dict],
    risk_scores: list[dict],
    clause_changes: list[dict],
) -> dict:
    supabase = get_supabase()

    # Risk tier only means something for confirmed violations — "compliant"/
    # "uncertain" findings ("Looks Fine" in the UI) never asserted a problem,
    # so they should not contribute to the risk histogram at all (not even
    # "low"), rather than inflating it with non-issues.
    risk_by_ccr_id = {rs["compliance_check_result_id"]: rs for rs in risk_scores}
    tier_counts = Counter(
        risk_by_ccr_id[cr["id"]]["tier"]
        for cr in compliance_results
        if cr["result"] == "non_compliant" and cr["id"] in risk_by_ccr_id
    )
    change_counts = Counter(cc["change_type"] for cc in clause_changes)

    by_check_type = {}
    for check_type in ("policy_compliance", "precedent"):
        results = Counter(
            cr["result"] for cr in compliance_results if cr["check_type"] == check_type
        )
        by_check_type[check_type] = {
            "non_compliant": results.get("non_compliant", 0),
            "uncertain": results.get("uncertain", 0),
            "compliant": results.get("compliant", 0),
        }

    summary_counts = {
        "total_findings": len(compliance_results),
        "risk": {"high": tier_counts.get("high", 0), "medium": tier_counts.get("medium", 0), "low": tier_counts.get("low", 0)},
        "clause_changes": {
            "added": change_counts.get("added", 0),
            "removed": change_counts.get("removed", 0),
            "modified": change_counts.get("modified", 0),
        },
        "by_check_type": by_check_type,
    }

    summary_text = ai_summary.generate_summary(summary_counts, compliance_results, risk_scores)

    row = (
        supabase.table("drift_reports")
        .insert(
            {
                "playbook_id": str(playbook_id),
                "old_version_id": str(old_version_id) if old_version_id else None,
                "new_version_id": str(new_version_id),
                "summary_counts": summary_counts,
                "ai_summary": summary_text,
                "finding_ids": [cr["id"] for cr in compliance_results],
            }
        )
        .execute()
        .data[0]
    )
    return row
