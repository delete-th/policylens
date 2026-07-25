"""DiffEngineNode. Aligns old vs new policy clauses by embedding similarity
(not category — category is a coarse ~13-value LLM bucket, not a clause
identity, and multiple clauses can legitimately share one; matching by it
also let same-category clauses silently clobber each other). Called inline
right after versioning (no event/queue).

Also maintains per-clause amendment lineage (lineage_id/amended_at), used
by the Policy Center to show each clause's real "last amended" time and
each policy set's aggregate one — an unchanged re-upload leaves both alone
rather than bumping them just because a new version row was created.
"""

from datetime import datetime, timezone
from uuid import UUID

from backend.config import settings
from backend.db.client import get_supabase


def _best_matches_raw(new_embedding: list[float], old_version_id: UUID) -> list[dict]:
    # Raw RPC call (not embedding.find_similar_policy_clauses) because the
    # greedy-consume matching below needs the `similarity` score, which the
    # shared PolicyClause-typed wrapper used elsewhere doesn't expose.
    supabase = get_supabase()
    result = supabase.rpc(
        "match_policy_clauses",
        {
            "query_embedding": new_embedding,
            "p_policy_version_id": str(old_version_id),
            "match_threshold": settings.clause_identity_threshold,
            "match_count": 5,
            "p_clause_ids": None,
        },
    ).execute()
    return result.data


def diff_versions(playbook_id: UUID, old_version_id: UUID | None, new_version_id: UUID) -> list[dict]:
    supabase = get_supabase()
    now_iso = datetime.now(timezone.utc).isoformat()

    new_clauses = (
        supabase.table("policy_clauses")
        .select("*")
        .eq("policy_version_id", str(new_version_id))
        .execute()
        .data
    )

    if not old_version_id:
        # First version of a brand-new policy set — every clause is
        # "added", each starting its own lineage.
        changes = []
        for new_clause in new_clauses:
            _stamp(supabase, new_clause["id"], new_clause["id"], now_iso)
            changes.append(_change("added", playbook_id, None, new_version_id, new_clause, None, new_clause))
        return supabase.table("clause_changes").insert(changes).execute().data if changes else []

    old_clauses = (
        supabase.table("policy_clauses")
        .select("*")
        .eq("policy_version_id", str(old_version_id))
        .execute()
        .data
    )
    old_by_id = {c["id"]: c for c in old_clauses}

    # Candidate matches gathered up front so a single global greedy pass
    # (sorted by similarity descending) can consume old clauses as they're
    # claimed — prevents two new clauses from both matching the same old
    # one (e.g. a clause that got split in two).
    candidates: list[tuple[float, dict, dict]] = []
    for new_clause in new_clauses:
        for m in _best_matches_raw(new_clause["embedding"], old_version_id):
            old_clause = old_by_id.get(m["id"])
            if old_clause:
                candidates.append((m["similarity"], new_clause, old_clause))
    candidates.sort(key=lambda t: t[0], reverse=True)

    matched_old_for_new: dict[str, dict] = {}
    consumed_old_ids: set[str] = set()
    for _similarity, new_clause, old_clause in candidates:
        if new_clause["id"] in matched_old_for_new or old_clause["id"] in consumed_old_ids:
            continue
        matched_old_for_new[new_clause["id"]] = old_clause
        consumed_old_ids.add(old_clause["id"])

    changes = []
    for new_clause in new_clauses:
        old_clause = matched_old_for_new.get(new_clause["id"])
        if old_clause is None:
            _stamp(supabase, new_clause["id"], new_clause["id"], now_iso)
            changes.append(_change("added", playbook_id, old_version_id, new_version_id, new_clause, None, new_clause))
        elif old_clause["clause_text"] != new_clause["clause_text"]:
            lineage_id = old_clause.get("lineage_id") or old_clause["id"]
            _stamp(supabase, new_clause["id"], lineage_id, now_iso)
            changes.append(_change("modified", playbook_id, old_version_id, new_version_id, new_clause, old_clause, new_clause))
        else:
            # Unchanged — carry the lineage's existing amended_at forward
            # untouched rather than bumping it to now, and don't emit a
            # clause_changes row at all: nothing here should re-trigger
            # contract re-evaluation or move the set's "Last Updated".
            lineage_id = old_clause.get("lineage_id") or old_clause["id"]
            amended_at = old_clause.get("amended_at") or now_iso
            _stamp(supabase, new_clause["id"], lineage_id, amended_at)

    for old_clause in old_clauses:
        if old_clause["id"] not in consumed_old_ids:
            changes.append(_change("removed", playbook_id, old_version_id, new_version_id, old_clause, old_clause, None))

    return supabase.table("clause_changes").insert(changes).execute().data if changes else []


def _stamp(supabase, clause_id: str, lineage_id: str, amended_at: str) -> None:
    supabase.table("policy_clauses").update(
        {"lineage_id": str(lineage_id), "amended_at": amended_at}
    ).eq("id", clause_id).execute()


def _change(change_type, playbook_id, old_version_id, new_version_id, category_source, old_clause, new_clause) -> dict:
    return {
        "playbook_id": str(playbook_id),
        "old_version_id": str(old_version_id) if old_version_id else None,
        "new_version_id": str(new_version_id),
        "change_type": change_type,
        "category": category_source["category"],
        "old_text": old_clause["clause_text"] if old_clause else None,
        "new_text": new_clause["clause_text"] if new_clause else None,
        "old_rule": old_clause["extracted_rule"] if old_clause else None,
        "new_rule": new_clause["extracted_rule"] if new_clause else None,
        # lets the pipeline scope contract re-evaluation to just the clauses
        # that were actually added/modified, instead of the whole policy
        "new_clause_id": new_clause["id"] if new_clause else None,
    }
