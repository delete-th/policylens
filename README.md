# PolicyLens

**Automated policy-drift detection for contract compliance teams.**

When a company updates its internal policy, every contract that was already approved under the *old* policy should, in theory, be re-checked — but in practice that re-check almost never happens. Approvals quietly go stale, and nobody notices until an audit or a dispute. PolicyLens closes that gap: upload a new policy version and, in the same request, it diffs it against the previous version, re-evaluates every stored contract against the new rules, scores the risk of each finding, and returns a drift report — no polling, no batch job to wait on.

## Table of contents

- [How it works](#how-it-works)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [API](#api)
- [Getting started](#getting-started)
- [Project structure](#project-structure)
- [Status](#status)
- [License](#license)

## How it works

1. **Upload a policy** (PDF/DOCX). It's parsed into individual clauses, embedded, and versioned against the playbook's history.
2. **Diff** the new version against the previous one to isolate exactly what changed.
3. **Re-evaluate** every contract already on file for that playbook: each contract clause is compared against the *new* policy clauses via retrieval-augmented generation (top-K similar clauses/precedents pulled from a vector index, then judged by an LLM) rather than a blind full-document re-read.
4. **Risk-score** every finding and assemble a **drift report** — returned inline, in the same request that started the upload.
5. **Reviewers** work the report: drill into a finding to see the clause change, the compliance verdict, and exactly which policy clauses and precedents the model compared it against.

Two roles drive the flow: a **Policy Admin** who uploads policies and can trigger manual rechecks, and a **Reviewer** who uploads contracts and works through drift findings.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Zustand, react-router, axios, lucide-react |
| Backend | Python 3.11, FastAPI, uvicorn |
| Database | Supabase (Postgres) with `pgvector` for embeddings + similarity search |
| LLM / embeddings | Azure AI Foundry (GPT-4o + `text-embedding-3-large`) via the OpenAI SDK |
| Document parsing | `pdfplumber` (primary) / `PyPDF2` (fallback) for PDFs, `python-docx` for DOCX |
| Deployment | Azure Static Web Apps (frontend) + Azure App Service (backend), auto-deployed from GitHub Actions |

## Architecture

```
                         ┌──────────────────────────┐
  Browser (React) ─────▶ │        FastAPI API        │
                         │  policy / contracts /     │
                         │  drift / review routers    │
                         └───────────┬───────────────┘
                                     │
                pipeline runs inline, same request:
                     ingest → version → diff →
              embed → retrieve (pgvector) → LLM
              compliance check → risk score → report
                                     │
                         ┌───────────▼───────────────┐
                         │   Supabase (Postgres +     │
                         │        pgvector)           │
                         └────────────────────────────┘
                                     │
                         ┌───────────▼───────────────┐
                         │  Azure AI Foundry (LLM +   │
                         │   embedding model)         │
                         └────────────────────────────┘
```

The backend never re-sends whole documents to the LLM for a recheck — it retrieves the smaller set of clauses/precedents likely to be relevant (via cosine similarity over embeddings) and only asks the model to judge those, which is what keeps a full-playbook recheck fast enough to return synchronously.

## API

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/v1/policy/upload` | Upload + version a policy, run the full pipeline, return a drift report id |
| `POST` | `/api/v1/contracts/upload` | Register a contract's clauses and generate embeddings |
| `POST` | `/api/v1/drift/recheck` | Manually re-run diff + evaluation for a playbook |
| `GET` | `/api/v1/drift-reports/:id` | Fetch a drift report |
| `GET` | `/api/v1/drift-reports/:id/findings/:findingId` | Finding detail — verdict, risk score, and the exact clauses/precedents the LLM compared |
| `GET` | `/api/v1/policy/:playbookId/versions` | Policy version history for a playbook |
| `GET` | `/api/v1/contracts` | Contract history, optionally filtered by playbook |

Full request/response contracts live in [`project-spec/policylens-spec_v4_0.json`](project-spec/policylens-spec_v4_0.json).

## Getting started

### Backend

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env   # fill in Azure AI Foundry + Supabase credentials
```

Run `db/schema.sql` against your Supabase Postgres instance (SQL editor or `psql`) before starting the API — it creates the tables, the `pgvector` extension, and the `match_policy_clauses` / `match_contract_clauses` RPCs the retrieval step depends on. The `ivfflat` indexes at the bottom of that file are commented out; run them after seeding data, since `ivfflat` needs existing rows to build its index lists.

```bash
uvicorn backend.main:app --reload --port 8000
```

Optionally seed a demo playbook with the sample procurement policy PDFs:

```bash
python scripts/seed_demo_data.py
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env   # VITE_API_URL, defaults to http://localhost:8000/api/v1
npm run dev
```

The frontend never talks to Supabase directly — all data fetching goes through `src/services/api.js`, a shared axios instance pointed at `VITE_API_URL`.

## Project structure

```
backend/
  api/routes/       policy, contracts, drift, review endpoints
  db/                schema.sql, Supabase client setup
  services/          ingestion, diffing, embedding/retrieval, LLM evaluation, risk scoring
  schemas.py         Pydantic request/response models
  main.py            FastAPI app + router wiring
frontend/
  src/policylens/    Upload / Review / Final / Policy pages, shared components + store
  src/services/      API client
project-spec/        Full system spec (data models, node graph, workflows)
scripts/             Demo data seeding
```

## Status

This started as a hackathon build (HackXperience). Both sides are fully wired end-to-end and functional: uploading a policy or contract through the UI hits the live FastAPI backend, which parses the file, generates embeddings, persists clauses/versions/contracts to Supabase, stores the source PDF, and runs the drift pipeline synchronously — the Upload → Review → Final → Policy pages all read and write real data through the API, with no mock layer.

## License

MIT — see [LICENSE](LICENSE).
