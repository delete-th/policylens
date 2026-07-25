"""PolicyIngestionNode.

Extract raw text, segment+classify clauses in one LLM call, extract a
structured rule per clause (in parallel — independent per-clause calls),
then embed each clause. Returns clause dicts ready for PolicyVersioningNode
to persist (policy_version_id not yet known).
"""

from backend.config import settings
from backend.services import clause_classifier, embedding, rule_extraction
from backend.services._concurrency import run_parallel
from backend.services._file_extraction import extract_text


def ingest_policy(file_bytes: bytes, filename: str) -> list[dict]:
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
            "clause_text": text,
            "extracted_rule": rule,
        }

    clauses = run_parallel(process_segment, segments, settings.llm_concurrency)

    texts = [c["clause_text"] for c in clauses]
    embeddings = embedding.embed_batch(texts)
    for clause, vector in zip(clauses, embeddings):
        clause["embedding"] = vector

    return clauses
