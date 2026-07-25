import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")


class Settings:
    azure_ai_endpoint: str = os.getenv("AZURE_AI_ENDPOINT", "")
    azure_ai_api_key: str = os.getenv("AZURE_AI_API_KEY", "")
    azure_ai_deployment: str = os.getenv("AZURE_AI_DEPLOYMENT", "")
    azure_ai_deployment_prod: str = os.getenv("AZURE_AI_DEPLOYMENT_PROD", "")
    azure_ai_embedding_deployment: str = os.getenv("AZURE_AI_EMBEDDING_DEPLOYMENT", "")
    azure_ai_api_version: str = os.getenv("AZURE_AI_API_VERSION", "2025-04-01-preview")

    supabase_url: str = os.getenv("SUPABASE_URL", "")
    supabase_key: str = os.getenv("SUPABASE_KEY", "")

    cors_origins: list[str] = [
        o.strip()
        for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
        if o.strip()
    ]

    # Max concurrent LLM calls for independent per-clause work (rule
    # extraction, contract evaluation). Conservative default — Azure rate
    # limits for this deployment haven't been load-tested at higher values.
    llm_concurrency: int = int(os.getenv("LLM_CONCURRENCY", "5"))

    # RAG retrieval threshold for "is this policy rule / precedent clause
    # relevant enough to hand to the LLM for a compliance check" — NOT an
    # identity claim, just relevance. Empirically measured against real
    # data: this embedding model produces surprisingly low absolute cosine
    # similarity even for obviously-correct matches on short legal clauses
    # (e.g. a contract's "Late Payment Interest" clause against the
    # policy's own "Rule 3.2 — Late Payment Interest" scored only 0.53).
    # The old 0.7 default was silently discarding most real matches before
    # the LLM ever saw them, undercounting real violations. Recall matters
    # more than precision here — an irrelevant candidate that sneaks in is
    # cheap (the LLM just won't flag it), but a real violation whose rule
    # never gets retrieved at all is invisible and unrecoverable.
    retrieval_threshold: float = float(os.getenv("RETRIEVAL_THRESHOLD", "0.5"))

    # Policy-set dedup / clause-lineage thresholds — best-guess defaults,
    # tunable without touching matching logic. Much stricter than
    # retrieval_threshold since these are identity claims ("this is the
    # SAME clause/set, just possibly amended"), not just relevance.
    clause_identity_threshold: float = float(os.getenv("CLAUSE_IDENTITY_THRESHOLD", "0.82"))
    playbook_match_threshold: float = float(os.getenv("PLAYBOOK_MATCH_THRESHOLD", "0.82"))
    playbook_match_coverage: float = float(os.getenv("PLAYBOOK_MATCH_COVERAGE", "0.5"))


settings = Settings()
