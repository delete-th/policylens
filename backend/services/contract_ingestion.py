"""ContractIngestionNode (renamed from ApprovalIngestion).

Same flow as PolicyIngestion: extract text -> one LLM call segment+classify
-> extract rules per clause (in parallel) -> embed each clause -> persist
contract + contract_records.

Split into extract_clauses() (pure — no DB writes) and persist_contract()
so the upload route can run duplicate detection (contract_matching.py)
against the real embeddings before anything is written to the database.
"""

from uuid import UUID

from backend.config import settings
from backend.db.client import get_supabase
from backend.services import clause_classifier, embedding, rule_extraction
from backend.services._concurrency import run_parallel
from backend.services._file_extraction import extract_text


def extract_clauses(file_bytes: bytes, filename: str) -> list[dict]:
    raw_text = extract_text(file_bytes, filename)
    segments = clause_classifier.segment_and_classify(raw_text)

    def process_segment(segment: dict) -> dict:
        text = segment["text"]
        category = segment["category"]
        rule = rule_extraction.extract_rule(text, category)
        return {
            "category": category,
            "title": segment.get("title"),
            "section_heading": segment.get("section_heading"),
            "text": text,
            "extracted_rule": rule,
        }

    clauses = run_parallel(process_segment, segments, settings.llm_concurrency)

    texts = [c["text"] for c in clauses]
    embeddings = embedding.embed_batch(texts)
    for clause, vector in zip(clauses, embeddings):
        clause["embedding"] = vector

    return clauses


def persist_contract(
    filename: str,
    playbook_id: UUID,
    policy_version_id_at_upload: UUID,
    clauses: list[dict],
) -> list[dict]:
    supabase = get_supabase()
    contract_row = (
        supabase.table("contracts")
        .insert({"title": filename, "source_file_name": filename})
        .execute()
        .data[0]
    )

    clause_rows = []
    for i, c in enumerate(clauses):
        clause_text = c.pop("text")
        clause_rows.append(
            {
                **c,
                "contract_id": contract_row["id"],
                "playbook_id": str(playbook_id),
                "policy_version_id_at_upload": str(policy_version_id_at_upload),
                "clause_text": clause_text,
                "sequence_order": i,
            }
        )
    return supabase.table("contract_records").insert(clause_rows).execute().data if clause_rows else []


def ingest_contract(
    file_bytes: bytes,
    filename: str,
    playbook_id: UUID,
    policy_version_id_at_upload: UUID,
) -> list[dict]:
    """Convenience wrapper for callers that don't need to inspect clauses
    between extraction and persistence."""
    clauses = extract_clauses(file_bytes, filename)
    return persist_contract(filename, playbook_id, policy_version_id_at_upload, clauses)
