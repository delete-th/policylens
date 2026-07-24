"""Shared LLM prompt/schema used inline by policy + contract ingestion.

Not a standalone pipeline step — segment_and_classify() is the one LLM call
PolicyIngestionNode / ContractIngestionNode make to turn raw document text
into classified clauses; classify_clause() is the single-clause primitive
described in spec section 3 (in: clause text, out: category, confidence).
"""

import json

from backend.config import settings
from backend.services._azure_client import get_azure_client

SUGGESTED_CATEGORIES = [
    "Definitions", "Term", "Payment", "Termination", "Confidentiality",
    "Liability", "Indemnity", "IP Ownership", "Renewal", "Data Retention",
    "Governing Law", "Force Majeure", "Other",
]

_SEGMENT_SYSTEM_PROMPT = f"""You are a contract/policy clause segmenter and classifier.
Given raw extracted document text, split it into individual clauses and classify each one.
Suggested categories (use the closest match, or another short category name if none fit):
{", ".join(SUGGESTED_CATEGORIES)}.

Respond with strict JSON: {{"clauses": [{{"text": "...", "category": "...", "confidence": 0.0-1.0}}]}}"""

_CLASSIFY_SYSTEM_PROMPT = f"""You are a contract/policy clause classifier.
Classify the single clause given by the user into the closest category.
Suggested categories: {", ".join(SUGGESTED_CATEGORIES)}.

Respond with strict JSON: {{"category": "...", "confidence": 0.0-1.0}}"""


def segment_and_classify(raw_text: str) -> list[dict]:
    client = get_azure_client()
    response = client.chat.completions.create(
        model=settings.azure_ai_deployment,
        messages=[
            {"role": "system", "content": _SEGMENT_SYSTEM_PROMPT},
            {"role": "user", "content": raw_text},
        ],
        response_format={"type": "json_object"},
    )
    parsed = json.loads(response.choices[0].message.content)
    return parsed.get("clauses", [])


def classify_clause(text: str) -> dict:
    client = get_azure_client()
    response = client.chat.completions.create(
        model=settings.azure_ai_deployment,
        messages=[
            {"role": "system", "content": _CLASSIFY_SYSTEM_PROMPT},
            {"role": "user", "content": text},
        ],
        response_format={"type": "json_object"},
    )
    return json.loads(response.choices[0].message.content)
