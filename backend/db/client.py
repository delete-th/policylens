import threading

from supabase import Client, create_client

from backend.config import settings

# One client per thread, not one shared globally (was @lru_cache singleton) —
# sharing a single supabase-py client's connection pool across the
# ThreadPoolExecutor workers introduced in the parallelized ingestion/
# evaluation loops caused real "Server disconnected" errors under concurrent
# load. Each worker thread gets its own client, created once and reused for
# the rest of that thread's lifetime.
_thread_local = threading.local()


def get_supabase() -> Client:
    if not settings.supabase_url or not settings.supabase_key:
        raise RuntimeError(
            "SUPABASE_URL / SUPABASE_KEY are not set — copy .env.example to .env and fill them in."
        )
    if not hasattr(_thread_local, "client"):
        _thread_local.client = create_client(settings.supabase_url, settings.supabase_key)
    return _thread_local.client
