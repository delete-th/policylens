"""Shared embedding + similarity search utility.

Called by PolicyIngestionNode, ContractIngestionNode, and ContractEvaluatorNode.
Spec: policylens-spec_v4_0.json section 8c_embedding_service.
"""

from uuid import UUID

from backend.config import settings
from backend.db.client import get_supabase
from backend.schemas import ContractRecord, PolicyClause
from backend.services._azure_client import get_azure_client


def embed_text(text: str) -> list[float]:
    client = get_azure_client()
    response = client.embeddings.create(
        model=settings.azure_ai_embedding_deployment,
        input=text,
    )
    return response.data[0].embedding


def embed_batch(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    client = get_azure_client()
    response = client.embeddings.create(
        model=settings.azure_ai_embedding_deployment,
        input=texts,
    )
    return [item.embedding for item in response.data]


def find_similar_policy_clauses(
    embedding: list[float],
    policy_version_id: UUID,
    top_k: int = 5,
    threshold: float = 0.7,
) -> list[PolicyClause]:
    supabase = get_supabase()
    result = supabase.rpc(
        "match_policy_clauses",
        {
            "query_embedding": embedding,
            "p_policy_version_id": str(policy_version_id),
            "match_threshold": threshold,
            "match_count": top_k,
        },
    ).execute()
    return [PolicyClause(**row) for row in result.data]


def find_similar_contract_clauses(
    embedding: list[float],
    playbook_id: UUID,
    exclude_contract_id: UUID,
    top_k: int = 5,
    threshold: float = 0.7,
) -> list[ContractRecord]:
    supabase = get_supabase()
    result = supabase.rpc(
        "match_contract_clauses",
        {
            "query_embedding": embedding,
            "p_playbook_id": str(playbook_id),
            "p_exclude_contract_id": str(exclude_contract_id),
            "match_threshold": threshold,
            "match_count": top_k,
        },
    ).execute()
    return [ContractRecord(**row) for row in result.data]
