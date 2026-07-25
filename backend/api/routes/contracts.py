import asyncio
from uuid import UUID

from fastapi import APIRouter, File, UploadFile, Form, HTTPException

from backend.db.client import get_supabase
from backend.services import contract_ingestion, contract_matching

router = APIRouter(prefix="/api/v1/contracts", tags=["contracts"])


@router.post("/upload")
async def upload_contract(
    file: UploadFile = File(...),
    playbook_id: UUID = Form(...),
    policy_version_id_at_upload: UUID = Form(...),
    force: bool = Form(False),
):
    file_bytes = await file.read()
    clauses = await asyncio.to_thread(contract_ingestion.extract_clauses, file_bytes, file.filename)

    if not force:
        duplicate_id = await asyncio.to_thread(
            contract_matching.find_duplicate_contract, playbook_id, [c["embedding"] for c in clauses]
        )
        if duplicate_id is not None:
            existing = (
                get_supabase()
                .table("contracts")
                .select("title, uploaded_at")
                .eq("id", str(duplicate_id))
                .execute()
                .data
            )
            existing_desc = (
                f"'{existing[0]['title']}' (uploaded {existing[0]['uploaded_at']})" if existing else "an existing contract"
            )
            raise HTTPException(
                409,
                f"This looks like a duplicate of an already-uploaded contract, {existing_desc}. "
                "Upload again with force=true to proceed anyway.",
            )

    records = await asyncio.to_thread(
        contract_ingestion.persist_contract, file.filename, playbook_id, policy_version_id_at_upload, clauses
    )
    return {"contract_record_ids": [r["id"] for r in records]}


@router.get("")
async def list_contracts(playbook_id: UUID | None = None):
    """One row per real contract (not per clause) — for the Upload page's
    contract management list. clause_count comes from contract_records."""
    return await asyncio.to_thread(_list_contracts_sync, playbook_id)


def _list_contracts_sync(playbook_id: UUID | None) -> list[dict]:
    supabase = get_supabase()
    records_query = supabase.table("contract_records").select("id, contract_id")
    if playbook_id is not None:
        records_query = records_query.eq("playbook_id", str(playbook_id))
    records = records_query.execute().data
    if not records:
        return []

    counts: dict[str, int] = {}
    record_ids_by_contract: dict[str, list[str]] = {}
    for r in records:
        counts[r["contract_id"]] = counts.get(r["contract_id"], 0) + 1
        record_ids_by_contract.setdefault(r["contract_id"], []).append(r["id"])

    contracts = supabase.table("contracts").select("*").in_("id", list(counts)).execute().data

    # Synchronous status shortcut: uploading a new policy version already
    # re-evaluates every contract_record in the playbook inline (see
    # pipeline.run_drift_pipeline), so compliance_check_results for the
    # CURRENT version already exist by the time this list is read — no
    # background job/pending state needed yet. Status is just "does any of
    # this contract's clauses have a non-superseded policy_compliance
    # violation checked against the playbook's current version."
    violating_contract_ids: set[str] = set()
    current_version_id = None
    if playbook_id is not None:
        current = (
            supabase.table("policy_versions")
            .select("id")
            .eq("playbook_id", str(playbook_id))
            .eq("is_current", True)
            .limit(1)
            .execute()
            .data
        )
        current_version_id = current[0]["id"] if current else None

    if current_version_id:
        all_record_ids = [rid for ids in record_ids_by_contract.values() for rid in ids]
        violations = (
            supabase.table("compliance_check_results")
            .select("contract_record_id")
            .in_("contract_record_id", all_record_ids)
            .eq("checked_against_version_id", current_version_id)
            .eq("check_type", "policy_compliance")
            .eq("result", "non_compliant")
            .eq("superseded", False)
            .execute()
            .data
        )
        violating_record_ids = {v["contract_record_id"] for v in violations}
        violating_contract_ids = {
            contract_id
            for contract_id, record_ids in record_ids_by_contract.items()
            if any(rid in violating_record_ids for rid in record_ids)
        }

    result = [
        {
            "id": c["id"],
            "title": c["title"],
            "source_file_name": c["source_file_name"],
            "uploaded_at": c["uploaded_at"],
            "clause_count": counts.get(c["id"], 0),
            "status": (
                "violates" if c["id"] in violating_contract_ids
                else "valid" if current_version_id else None
            ),
        }
        for c in contracts
    ]
    result.sort(key=lambda r: r["uploaded_at"], reverse=True)
    return result


@router.delete("/{contract_id}")
async def delete_contract(contract_id: UUID):
    """Deletes a contract and everything under it — records, findings, risk
    scores, and review decisions (via schema.sql's FK cascade). Same full
    real-blast-radius treatment as deleting a policy set."""
    supabase = get_supabase()
    existing = supabase.table("contracts").select("id").eq("id", str(contract_id)).execute()
    if not existing.data:
        raise HTTPException(404, "Contract not found")
    await asyncio.to_thread(
        lambda: supabase.table("contracts").delete().eq("id", str(contract_id)).execute()
    )
    return {"deleted": str(contract_id)}
