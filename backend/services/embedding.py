"""Shared embedding + similarity search utility.

Called by PolicyIngestionNode, ContractIngestionNode, and ContractEvaluatorNode.
Spec: policylens-spec_v4_0.json section 8c_embedding_service.
"""

from uuid import UUID

from backend.config import settings
from backend.db.client import get_supabase
from backend.schemas import ContractRecord, PolicyClause
from backend.services._azure_client import get_azure_client

# Must match the `vector(1536)` columns in db/schema.sql. text-embedding-3-large
# defaults to 3072 dims but supports truncation via `dimensions`, so 1536 is
# requested explicitly on every call rather than left to the model default.
EMBEDDING_DIMENSIONS = 1536


def embed_text(text: str) -> list[float]:
    client = get_azure_client()
    response = client.embeddings.create(
        model=settings.azure_ai_embedding_deployment,
        input=text,
        dimensions=EMBEDDING_DIMENSIONS,
    )
    return response.data[0].embedding


def embed_batch(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    client = get_azure_client()
    response = client.embeddings.create(
        model=settings.azure_ai_embedding_deployment,
        input=texts,
        dimensions=EMBEDDING_DIMENSIONS,
    )
    return [item.embedding for item in response.data]


def _dedupe_by_text(rows: list[dict], top_k: int) -> list[dict]:
    """Rows arrive ordered by similarity descending. Near-duplicate source
    rows (e.g. from repeated test uploads of the same document) otherwise
    let the same real clause fill multiple retrieval slots — keep only the
    first (highest-similarity) occurrence of each distinct clause_text."""
    seen: set[str] = set()
    out = []
    for row in rows:
        key = (row.get("clause_text") or "").strip().lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(row)
        if len(out) >= top_k:
            break
    return out


def find_similar_policy_clauses(
    embedding: list[float],
    policy_version_id: UUID,
    top_k: int = 5,
    threshold: float = settings.retrieval_threshold,
    policy_clause_ids: list[UUID] | None = None,
) -> list[PolicyClause]:
    """policy_clause_ids, when given, scopes the search to just those clauses
    (e.g. only clauses amended in the latest policy diff) instead of the
    whole policy version."""
    supabase = get_supabase()
    result = supabase.rpc(
        "match_policy_clauses",
        {
            "query_embedding": embedding,
            "p_policy_version_id": str(policy_version_id),
            "match_threshold": threshold,
            "match_count": top_k * 3,
            "p_clause_ids": [str(i) for i in policy_clause_ids] if policy_clause_ids else None,
        },
    ).execute()
    return [PolicyClause(**row) for row in _dedupe_by_text(result.data, top_k)]


def find_similar_contract_clauses(
    embedding: list[float],
    playbook_id: UUID,
    exclude_contract_id: UUID,
    top_k: int = 5,
    threshold: float = settings.retrieval_threshold,
) -> list[ContractRecord]:
    supabase = get_supabase()
    result = supabase.rpc(
        "match_contract_clauses",
        {
            "query_embedding": embedding,
            "p_playbook_id": str(playbook_id),
            "p_exclude_contract_id": str(exclude_contract_id),
            "match_threshold": threshold,
            "match_count": top_k * 3,
        },
    ).execute()
    return [ContractRecord(**row) for row in _dedupe_by_text(result.data, top_k)]
