"""DiffEngineNode. Aligns old vs new policy clauses by category, called inline
right after versioning (no event/queue)."""

from uuid import UUID

from backend.db.client import get_supabase


def diff_versions(playbook_id: UUID, old_version_id: UUID | None, new_version_id: UUID) -> list[dict]:
    supabase = get_supabase()

    new_clauses = (
        supabase.table("policy_clauses")
        .select("*")
        .eq("policy_version_id", str(new_version_id))
        .execute()
        .data
    )
    old_clauses = (
        supabase.table("policy_clauses")
        .select("*")
        .eq("policy_version_id", str(old_version_id))
        .execute()
        .data
        if old_version_id
        else []
    )

    old_by_category = {c["category"]: c for c in old_clauses}
    new_by_category = {c["category"]: c for c in new_clauses}

    changes = []
    for category, new_clause in new_by_category.items():
        old_clause = old_by_category.get(category)
        if old_clause is None:
            changes.append(_change("added", playbook_id, old_version_id, new_version_id, category, None, new_clause))
        elif old_clause["clause_text"] != new_clause["clause_text"]:
            changes.append(_change("modified", playbook_id, old_version_id, new_version_id, category, old_clause, new_clause))

    for category, old_clause in old_by_category.items():
        if category not in new_by_category:
            changes.append(_change("removed", playbook_id, old_version_id, new_version_id, category, old_clause, None))

    inserted = supabase.table("clause_changes").insert(changes).execute().data if changes else []
    return inserted


def _change(change_type, playbook_id, old_version_id, new_version_id, category, old_clause, new_clause) -> dict:
    return {
        "playbook_id": str(playbook_id),
        "old_version_id": str(old_version_id) if old_version_id else None,
        "new_version_id": str(new_version_id),
        "change_type": change_type,
        "category": category,
        "old_text": old_clause["clause_text"] if old_clause else None,
        "new_text": new_clause["clause_text"] if new_clause else None,
        "old_rule": old_clause["extracted_rule"] if old_clause else None,
        "new_rule": new_clause["extracted_rule"] if new_clause else None,
    }
