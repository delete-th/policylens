import asyncio
import os
from uuid import UUID

from fastapi import APIRouter, File, UploadFile, Form, HTTPException

from backend.db.client import get_supabase
from backend.services import file_storage, pipeline, policy_ingestion, policy_matching, policy_versioning

router = APIRouter(prefix="/api/v1/policy", tags=["policy"])


@router.post("/upload")
async def upload_policy(file: UploadFile = File(...), playbook_id: UUID | None = Form(None)):
    file_bytes = await file.read()
    # Both of these can involve many (now-parallelized) LLM calls — offload
    # so a slow upload doesn't freeze the event loop for other requests.
    clauses = await asyncio.to_thread(policy_ingestion.ingest_policy, file_bytes, file.filename)

    if playbook_id is None:
        # No set specified — decide whether this document's clauses belong
        # to an existing policy set or need a brand-new one.
        playbook_id = await asyncio.to_thread(
            policy_matching.find_matching_playbook, [c["embedding"] for c in clauses]
        )
        name = os.path.splitext(file.filename)[0]
        if playbook_id is None:
            new_playbook = get_supabase().table("policy_playbooks").insert({"name": name}).execute().data[0]
            playbook_id = UUID(new_playbook["id"])
        else:
            # Keep the set's display name in sync with whatever was most
            # recently uploaded to it — otherwise a matched upload can
            # silently land under a stale name from whenever the row was
            # first created, making it look like the import did nothing.
            get_supabase().table("policy_playbooks").update({"name": name}).eq(
                "id", str(playbook_id)
            ).execute()

    versioning_result = policy_versioning.create_version(playbook_id, file.filename, clauses)
    new_version = versioning_result["version"]

    pdf_path = file_storage.upload_pdf(
        file_storage.POLICY_PDF_BUCKET, f"{new_version['id']}.pdf", file_bytes
    )
    supabase = get_supabase()
    supabase.table("policy_versions").update({"pdf_storage_path": pdf_path}).eq(
        "id", new_version["id"]
    ).execute()

    old_version = policy_versioning.get_prior_version(playbook_id, new_version["version_number"])
    old_version_id = old_version["id"] if old_version else None

    drift_report = await asyncio.to_thread(
        pipeline.run_drift_pipeline, playbook_id, old_version_id, new_version["id"]
    )

    return {"policy_version_id": new_version["id"], "drift_report_id": drift_report["id"]}


@router.get("/playbooks")
async def list_playbooks():
    """Real policy sets for the Policy Center table — replaces the old
    hardcoded mock list."""
    return await asyncio.to_thread(_list_playbooks_sync)


def _list_playbooks_sync() -> list[dict]:
    supabase = get_supabase()
    playbooks = supabase.table("policy_playbooks").select("*").execute().data
    if not playbooks:
        return []

    playbook_ids = [p["id"] for p in playbooks]
    current_versions = (
        supabase.table("policy_versions")
        .select("*")
        .in_("playbook_id", playbook_ids)
        .eq("is_current", True)
        .execute()
        .data
    )
    version_by_playbook = {v["playbook_id"]: v for v in current_versions}

    version_ids = [v["id"] for v in current_versions]
    clauses = (
        supabase.table("policy_clauses")
        .select("id, policy_version_id, amended_at")
        .in_("policy_version_id", version_ids)
        .execute()
        .data
        if version_ids
        else []
    )
    clauses_by_version: dict[str, list[dict]] = {}
    for c in clauses:
        clauses_by_version.setdefault(c["policy_version_id"], []).append(c)

    result = []
    for p in playbooks:
        version = version_by_playbook.get(p["id"])
        version_clauses = clauses_by_version.get(version["id"], []) if version else []
        amended_ats = [c["amended_at"] for c in version_clauses if c.get("amended_at")]
        # "Last Updated" reflects the most recent real clause amendment, not
        # just "a new version was uploaded" — falls back to the version's
        # own created_at only when no clause has an amended_at yet (e.g.
        # rows from before this feature existed).
        last_updated = max(amended_ats) if amended_ats else (version["created_at"] if version else p["created_at"])
        result.append(
            {
                "id": p["id"],
                "name": p["name"],
                "current_version_id": version["id"] if version else None,
                "source_file_name": version["source_file_name"] if version else None,
                "version_number": version["version_number"] if version else None,
                "clause_count": len(version_clauses),
                "last_updated": last_updated,
            }
        )
    # last_updated is computed in Python (not a plain column), so the sort
    # happens here rather than via .order() on the query — without this the
    # row order was whatever Postgres felt like on a given scan, which made
    # the table's row order shuffle unpredictably between reloads.
    result.sort(key=lambda r: r["last_updated"] or "", reverse=True)
    return result


@router.get("/playbooks/{playbook_id}/clauses")
async def list_playbook_clauses(playbook_id: UUID):
    """The drill-down clause table for one policy set's current version."""
    return await asyncio.to_thread(_list_playbook_clauses_sync, playbook_id)


def _list_playbook_clauses_sync(playbook_id: UUID) -> list[dict]:
    supabase = get_supabase()
    version = (
        supabase.table("policy_versions")
        .select("id")
        .eq("playbook_id", str(playbook_id))
        .eq("is_current", True)
        .limit(1)
        .execute()
    )
    if not version.data:
        return []
    return (
        supabase.table("policy_clauses")
        .select("id, category, title, clause_text, lineage_id, amended_at")
        .eq("policy_version_id", version.data[0]["id"])
        .execute()
        .data
    )


@router.delete("/playbooks/{playbook_id}")
async def delete_playbook(playbook_id: UUID):
    """Deletes a policy set and everything under it — versions, clauses,
    clause_changes, and (via schema.sql's FK cascade) every contract_record,
    compliance_check_result, risk_score, review_decision, and drift_report
    tied to a contract that was ever checked against this playbook. This is
    intentionally the full real blast radius, not a soft delete."""
    supabase = get_supabase()
    existing = supabase.table("policy_playbooks").select("id").eq("id", str(playbook_id)).execute()
    if not existing.data:
        raise HTTPException(404, "Policy set not found")
    await asyncio.to_thread(
        lambda: supabase.table("policy_playbooks").delete().eq("id", str(playbook_id)).execute()
    )
    return {"deleted": str(playbook_id)}


@router.get("/playbooks/{playbook_id}/changes")
async def list_playbook_changes(playbook_id: UUID):
    """Real clause_changes rows for one policy set — replaces the mock
    "Recent Changes" panel; the data already exists, this just queries it."""
    supabase = get_supabase()
    result = await asyncio.to_thread(
        lambda: supabase.table("clause_changes")
        .select("*")
        .eq("playbook_id", str(playbook_id))
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )
    return result.data


@router.get("/{version_id}/pdf-url")
async def get_policy_pdf_url(version_id: UUID):
    supabase = get_supabase()
    result = (
        supabase.table("policy_versions")
        .select("pdf_storage_path")
        .eq("id", str(version_id))
        .execute()
    )
    if not result.data or not result.data[0]["pdf_storage_path"]:
        raise HTTPException(404, "No PDF stored for this policy version")
    return {"url": file_storage.get_signed_url(file_storage.POLICY_PDF_BUCKET, result.data[0]["pdf_storage_path"])}


@router.get("/{playbook_id}/versions")
async def list_versions(playbook_id: UUID):
    supabase = get_supabase()
    result = (
        supabase.table("policy_versions")
        .select("*")
        .eq("playbook_id", str(playbook_id))
        .order("version_number", desc=True)
        .execute()
    )
    return result.data
