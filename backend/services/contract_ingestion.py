"""ContractIngestionNode (renamed from ApprovalIngestion).

Same flow as PolicyIngestion: extract text -> one LLM call segment+classify+
extract rules -> embed each clause -> persist contract + contract_records.
"""

from uuid import UUID

from backend.db.client import get_supabase
from backend.services import clause_classifier, embedding, rule_extraction
from backend.services._file_extraction import extract_text


def ingest_contract(
    file_bytes: bytes,
    filename: str,
    playbook_id: UUID,
    policy_version_id_at_upload: UUID,
) -> list[dict]:
    raw_text = extract_text(file_bytes, filename)
    segments = clause_classifier.segment_and_classify(raw_text)

    clauses = []
    for segment in segments:
        text = segment["text"]
        category = segment["category"]
        rule = rule_extraction.extract_rule(text, category)
        clauses.append({"category": category, "text": text, "extracted_rule": rule})

    texts = [c["text"] for c in clauses]
    embeddings = embedding.embed_batch(texts)
    for clause, vector in zip(clauses, embeddings):
        clause["embedding"] = vector

    supabase = get_supabase()
    contract_row = (
        supabase.table("contracts")
        .insert({"title": filename, "source_file_name": filename})
        .execute()
        .data[0]
    )

    clause_rows = []
    for c in clauses:
        clause_text = c.pop("text")
        clause_rows.append(
            {
                **c,
                "contract_id": contract_row["id"],
                "playbook_id": str(playbook_id),
                "policy_version_id_at_upload": str(policy_version_id_at_upload),
                "clause_text": clause_text,
            }
        )
    return supabase.table("contract_records").insert(clause_rows).execute().data if clause_rows else []
