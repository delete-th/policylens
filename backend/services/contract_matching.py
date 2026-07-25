"""Detects likely-duplicate contract uploads within a playbook — warns
rather than auto-merging (unlike policy sets), since contracts are
independent documents, not an evolving single document; two different real
contracts should never be silently merged just because they're similar.
"""

from collections import Counter
from uuid import UUID

from backend.config import settings
from backend.db.client import get_supabase


def find_duplicate_contract(playbook_id: UUID, clause_embeddings: list[list[float]]) -> UUID | None:
    """For each new clause, take its best match (if any) among existing
    contract_records in this playbook; tally matches per contract_id. If the
    top contract covers at least playbook_match_coverage of the new
    document's clauses, it's very likely the same real contract already
    uploaded — the route surfaces this as a warning before persisting,
    rather than blocking silently."""
    if not clause_embeddings:
        return None

    supabase = get_supabase()
    votes: Counter[str] = Counter()
    for emb in clause_embeddings:
        result = supabase.rpc(
            "match_contract_clauses_within_playbook",
            {
                "query_embedding": emb,
                "p_playbook_id": str(playbook_id),
                "match_threshold": settings.playbook_match_threshold,
                "match_count": 1,
            },
        ).execute()
        if result.data:
            votes[result.data[0]["contract_id"]] += 1

    if not votes:
        return None

    contract_id, count = votes.most_common(1)[0]
    coverage = count / len(clause_embeddings)
    return UUID(contract_id) if coverage >= settings.playbook_match_coverage else None
