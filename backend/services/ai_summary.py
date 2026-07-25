"""Generates a real, LLM-produced executive summary for a drift report.
Called once, when the report is generated (see drift_report_generator.py) —
not on-demand per page load, so it never adds latency to a page view.
"""

import json

from backend.config import settings
from backend.services._azure_client import get_azure_client

_SYSTEM_PROMPT = """You are a contract compliance assistant. Given a drift report's summary \
counts and its highest-risk findings, write a short executive summary (2-4 sentences) a \
reviewer can read at a glance — mention the most important policy violations and precedent \
inconsistencies if there are any. If there are no findings needing attention, say so plainly \
rather than inventing something to report.

Respond with strict JSON: {"summary": "..."}"""

_MAX_FINDINGS_IN_PROMPT = 15


def generate_summary(summary_counts: dict, compliance_results: list[dict], risk_scores: list[dict]) -> str:
    risk_by_ccr = {r["compliance_check_result_id"]: r for r in risk_scores}
    non_compliant = [cr for cr in compliance_results if cr["result"] == "non_compliant"]
    non_compliant.sort(key=lambda cr: risk_by_ccr.get(cr["id"], {}).get("numeric_score", 0), reverse=True)

    seen = set()
    top_findings = []
    for cr in non_compliant:
        key = (cr["check_type"], cr.get("reason", "")[:50])
        if key in seen:
            continue
        seen.add(key)
        top_findings.append({"check_type": cr["check_type"], "reason": cr["reason"]})
        if len(top_findings) >= _MAX_FINDINGS_IN_PROMPT:
            break

    client = get_azure_client()
    payload = {"summary_counts": summary_counts, "top_findings": top_findings}
    response = client.chat.completions.create(
        model=settings.azure_ai_deployment,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(payload)},
        ],
        response_format={"type": "json_object"},
    )
    return json.loads(response.choices[0].message.content)["summary"]
