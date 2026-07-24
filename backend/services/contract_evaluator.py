"""ContractEvaluatorNode (renamed from ApprovalEvaluator).

RAG: retrieve top-K relevant policy clauses + top-K precedent contract
clauses by embedding similarity, send only those matches + the contract
clause to the LLM for compliance comparison. Spec section 3, rag_detail.
"""

import json
from uuid import UUID

from backend.config import settings
from backend.db.client import get_supabase
from backend.services import embedding
from backend.services._azure_client import get_azure_client

_SYSTEM_PROMPT = """You are a contract compliance checker. Compare the given contract clause \
against the matched policy rules and precedent clauses from past contracts. Decide whether \
the contract clause is compliant, non_compliant, or uncertain, and explain why in one or \
two sentences.

Respond with strict JSON: {"result": "compliant|non_compliant|uncertain", "reason": "..."}"""


def evaluate_contract(contract_record: dict, policy_version_id: UUID) -> dict:
    supabase = get_supabase()
    contract_embedding = contract_record["embedding"]

    matched_policy_clauses = embedding.find_similar_policy_clauses(
        contract_embedding, policy_version_id
    )
    matched_precedents = embedding.find_similar_contract_clauses(
        contract_embedding,
        contract_record["playbook_id"],
        contract_record["contract_id"],
    )

    if not matched_policy_clauses:
        result, reason = "uncertain", "No matching policy rule found for this clause."
    else:
        result, reason = _compare_via_llm(contract_record, matched_policy_clauses, matched_precedents)

    row = (
        supabase.table("compliance_check_results")
        .insert(
            {
                "contract_record_id": contract_record["id"],
                "checked_against_version_id": str(policy_version_id),
                "result": result,
                "reason": reason,
                "matched_policy_clause_ids": [c.id if hasattr(c, "id") else c["id"] for c in matched_policy_clauses],
                "matched_precedent_ids": [c.id if hasattr(c, "id") else c["id"] for c in matched_precedents],
            }
        )
        .execute()
        .data[0]
    )
    return row


def _compare_via_llm(contract_record: dict, matched_policy_clauses, matched_precedents) -> tuple[str, str]:
    client = get_azure_client()
    payload = {
        "contract_clause": contract_record["clause_text"],
        "matched_policy_rules": [
            {"category": c.category, "text": c.clause_text, "rule": c.extracted_rule} for c in matched_policy_clauses
        ],
        "matched_precedent_clauses": [
            {"category": c.category, "text": c.clause_text} for c in matched_precedents
        ],
    }
    response = client.chat.completions.create(
        model=settings.azure_ai_deployment,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(payload)},
        ],
        response_format={"type": "json_object"},
    )
    parsed = json.loads(response.choices[0].message.content)
    return parsed["result"], parsed["reason"]
