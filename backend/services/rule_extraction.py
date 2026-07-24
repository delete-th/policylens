"""Clause text -> structured rule value. Spec section 3: RuleExtractionNode."""

import json

from backend.config import settings
from backend.services._azure_client import get_azure_client

_SYSTEM_PROMPT = """You extract the single most important structured rule from a contract or \
policy clause, if one exists (e.g. a liability cap amount, a notice period in days, a \
retention period in years).

Respond with strict JSON: {"field": "...", "value": "...", "unit": "..."}
If the clause carries no extractable numeric/structured rule, respond with \
{"field": null, "value": null, "unit": null}."""


def extract_rule(clause_text: str, category: str) -> dict:
    client = get_azure_client()
    response = client.chat.completions.create(
        model=settings.azure_ai_deployment,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": f"Category: {category}\nClause: {clause_text}"},
        ],
        response_format={"type": "json_object"},
    )
    return json.loads(response.choices[0].message.content)
