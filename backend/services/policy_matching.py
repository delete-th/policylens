"""Detects which existing policy set (playbook), if any, a newly uploaded
document's clauses belong to — called from the policy upload route before
policy_versioning.create_version() when no playbook_id was given explicitly.
"""

from collections import Counter
from uuid import UUID

from backend.config import settings
from backend.db.client import get_supabase


def find_matching_playbook(clause_embeddings: list[list[float]]) -> UUID | None:
    """For each new clause, take its best cross-set match (if any) above
    playbook_match_threshold; tally matches per playbook. If the top
    playbook covers at least playbook_match_coverage of the new document's
    clauses, that's the match — otherwise None, meaning "make a new set"."""
    if not clause_embeddings:
        return None

    supabase = get_supabase()
    votes: Counter[str] = Counter()
    for emb in clause_embeddings:
        result = supabase.rpc(
            "match_policy_clauses_global",
            {
                "query_embedding": emb,
                "match_threshold": settings.playbook_match_threshold,
                "match_count": 1,
            },
        ).execute()
        if result.data:
            votes[result.data[0]["playbook_id"]] += 1

    if not votes:
        return None

    playbook_id, count = votes.most_common(1)[0]
    coverage = count / len(clause_embeddings)
    return UUID(playbook_id) if coverage >= settings.playbook_match_coverage else None
