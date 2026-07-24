"""PolicyIngestionNode.

Extract raw text, segment+classify clauses in one LLM call, extract a
structured rule per clause, then embed each clause. Returns clause dicts
ready for PolicyVersioningNode to persist (policy_version_id not yet known).
"""

from backend.services import clause_classifier, embedding, rule_extraction
from backend.services._file_extraction import extract_text


def ingest_policy(file_bytes: bytes, filename: str) -> list[dict]:
    raw_text = extract_text(file_bytes, filename)
    segments = clause_classifier.segment_and_classify(raw_text)

    clauses = []
    for segment in segments:
        text = segment["text"]
        category = segment["category"]
        rule = rule_extraction.extract_rule(text, category)
        clauses.append({"category": category, "clause_text": text, "extracted_rule": rule})

    texts = [c["clause_text"] for c in clauses]
    embeddings = embedding.embed_batch(texts)
    for clause, vector in zip(clauses, embeddings):
        clause["embedding"] = vector

    return clauses
