import threading

from openai import AzureOpenAI

from backend.config import settings

# Same reasoning as backend/db/client.py: one client per thread rather than
# one shared global singleton, to avoid sharing a single httpx connection
# pool across the ThreadPoolExecutor workers used for parallel LLM calls.
_thread_local = threading.local()


def get_azure_client() -> AzureOpenAI:
    if not settings.azure_ai_endpoint or not settings.azure_ai_api_key:
        raise RuntimeError(
            "AZURE_AI_ENDPOINT / AZURE_AI_API_KEY are not set — copy .env.example to .env and fill them in."
        )
    if not hasattr(_thread_local, "client"):
        _thread_local.client = AzureOpenAI(
            azure_endpoint=settings.azure_ai_endpoint,
            api_key=settings.azure_ai_api_key,
            api_version=settings.azure_ai_api_version,
        )
    return _thread_local.client
