from functools import lru_cache

from openai import AzureOpenAI

from backend.config import settings


@lru_cache
def get_azure_client() -> AzureOpenAI:
    if not settings.azure_ai_endpoint or not settings.azure_ai_api_key:
        raise RuntimeError(
            "AZURE_AI_ENDPOINT / AZURE_AI_API_KEY are not set — copy .env.example to .env and fill them in."
        )
    return AzureOpenAI(
        azure_endpoint=settings.azure_ai_endpoint,
        api_key=settings.azure_ai_api_key,
        api_version=settings.azure_ai_api_version,
    )
