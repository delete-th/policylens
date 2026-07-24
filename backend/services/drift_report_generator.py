"""DriftReportGeneratorNode. Runs synchronously right after recheck+scoring,
in the same request — no job status."""

from collections import Counter
from uuid import UUID

from backend.db.client import get_supabase


def generate_report(
    playbook_id: UUID,
    old_version_id: UUID | None,
    new_version_id: UUID,
    compliance_results: list[dict],
    risk_scores: list[dict],
    clause_changes: list[dict],
) -> dict:
    supabase = get_supabase()

    tier_counts = Counter(rs["tier"] for rs in risk_scores)
    change_counts = Counter(cc["change_type"] for cc in clause_changes)

    summary_counts = {
        "total_findings": len(compliance_results),
        "risk": {"high": tier_counts.get("high", 0), "medium": tier_counts.get("medium", 0), "low": tier_counts.get("low", 0)},
        "clause_changes": {
            "added": change_counts.get("added", 0),
            "removed": change_counts.get("removed", 0),
            "modified": change_counts.get("modified", 0),
        },
    }

    row = (
        supabase.table("drift_reports")
        .insert(
            {
                "playbook_id": str(playbook_id),
                "old_version_id": str(old_version_id) if old_version_id else None,
                "new_version_id": str(new_version_id),
                "summary_counts": summary_counts,
                "finding_ids": [cr["id"] for cr in compliance_results],
            }
        )
        .execute()
        .data[0]
    )
    return row
