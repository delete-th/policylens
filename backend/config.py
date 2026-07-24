import os

from dotenv import load_dotenv

load_dotenv()


class Settings:
    azure_ai_endpoint: str = os.getenv("AZURE_AI_ENDPOINT", "")
    azure_ai_api_key: str = os.getenv("AZURE_AI_API_KEY", "")
    azure_ai_deployment: str = os.getenv("AZURE_AI_DEPLOYMENT", "")
    azure_ai_embedding_deployment: str = os.getenv(
        "AZURE_AI_EMBEDDING_DEPLOYMENT", "text-embedding-3-small"
    )
    azure_ai_api_version: str = os.getenv("AZURE_AI_API_VERSION", "2024-10-21")

    supabase_url: str = os.getenv("SUPABASE_URL", "")
    supabase_key: str = os.getenv("SUPABASE_KEY", "")

    cors_origins: list[str] = [
        o.strip()
        for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
        if o.strip()
    ]


settings = Settings()
