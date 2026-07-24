from functools import lru_cache

from supabase import Client, create_client

from backend.config import settings


@lru_cache
def get_supabase() -> Client:
    if not settings.supabase_url or not settings.supabase_key:
        raise RuntimeError(
            "SUPABASE_URL / SUPABASE_KEY are not set — copy .env.example to .env and fill them in."
        )
    return create_client(settings.supabase_url, settings.supabase_key)
