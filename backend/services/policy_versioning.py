"""PolicyVersioningNode. Store clauses as a new version, unset prior current."""

from uuid import UUID

from backend.db.client import get_supabase


def create_version(playbook_id: UUID, source_file_name: str, clauses: list[dict]) -> dict:
    supabase = get_supabase()

    supabase.table("policy_versions").update({"is_current": False}).eq(
        "playbook_id", str(playbook_id)
    ).eq("is_current", True).execute()

    prior = (
        supabase.table("policy_versions")
        .select("version_number")
        .eq("playbook_id", str(playbook_id))
        .order("version_number", desc=True)
        .limit(1)
        .execute()
    )
    next_version_number = (prior.data[0]["version_number"] + 1) if prior.data else 1

    version_row = (
        supabase.table("policy_versions")
        .insert(
            {
                "playbook_id": str(playbook_id),
                "version_number": next_version_number,
                "is_current": True,
                "source_file_name": source_file_name,
            }
        )
        .execute()
        .data[0]
    )

    clause_rows = [{**c, "policy_version_id": version_row["id"]} for c in clauses]
    inserted_clauses = (
        supabase.table("policy_clauses").insert(clause_rows).execute().data
        if clause_rows
        else []
    )

    return {"version": version_row, "clauses": inserted_clauses}


def get_prior_version(playbook_id: UUID, before_version_number: int) -> dict | None:
    supabase = get_supabase()
    result = (
        supabase.table("policy_versions")
        .select("*")
        .eq("playbook_id", str(playbook_id))
        .lt("version_number", before_version_number)
        .order("version_number", desc=True)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None
