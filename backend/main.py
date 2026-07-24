from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.routes import contracts, drift, policy
from backend.config import settings

app = FastAPI(title="PolicyLens API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(policy.router)
app.include_router(contracts.router)
app.include_router(drift.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
