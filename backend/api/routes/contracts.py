from uuid import UUID

from fastapi import APIRouter, File, UploadFile, Form

from backend.db.client import get_supabase
from backend.services import contract_ingestion

router = APIRouter(prefix="/api/v1/contracts", tags=["contracts"])


@router.post("/upload")
async def upload_contract(
    file: UploadFile = File(...),
    playbook_id: UUID = Form(...),
    policy_version_id_at_upload: UUID = Form(...),
):
    file_bytes = await file.read()
    records = contract_ingestion.ingest_contract(
        file_bytes, file.filename, playbook_id, policy_version_id_at_upload
    )
    return {"contract_record_ids": [r["id"] for r in records]}


@router.get("")
async def list_contracts(playbook_id: UUID | None = None):
    supabase = get_supabase()
    query = supabase.table("contract_records").select("*")
    if playbook_id is not None:
        query = query.eq("playbook_id", str(playbook_id))
    return query.execute().data
