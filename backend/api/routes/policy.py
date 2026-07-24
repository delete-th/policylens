from uuid import UUID

from fastapi import APIRouter, File, UploadFile, Form

from backend.db.client import get_supabase
from backend.services import pipeline, policy_ingestion, policy_versioning

router = APIRouter(prefix="/api/v1/policy", tags=["policy"])


@router.post("/upload")
async def upload_policy(file: UploadFile = File(...), playbook_id: UUID = Form(...)):
    file_bytes = await file.read()
    clauses = policy_ingestion.ingest_policy(file_bytes, file.filename)
    versioning_result = policy_versioning.create_version(playbook_id, file.filename, clauses)
    new_version = versioning_result["version"]

    old_version = policy_versioning.get_prior_version(playbook_id, new_version["version_number"])
    old_version_id = old_version["id"] if old_version else None

    drift_report = pipeline.run_drift_pipeline(playbook_id, old_version_id, new_version["id"])

    return {"policy_version_id": new_version["id"], "drift_report_id": drift_report["id"]}


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
