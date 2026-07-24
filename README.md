# PolicyLens

Policy drift detection: upload a new policy version, get an inline diff + recheck
of already-uploaded contracts + risk-scored drift report, same request.
Spec: `project-spec/policylens-spec_v4_0.json`.

## Backend

```
cd backend
pip install -r requirements.txt
cp .env.example .env   # fill in Azure AI Foundry + Supabase credentials
```

Run `db/schema.sql` against your Supabase Postgres instance (via the SQL editor
or `psql`) before starting the API — it creates the tables, the pgvector
extension, and the `match_policy_clauses` / `match_contract_clauses` RPCs the
RAG retrieval step depends on. The `ivfflat` indexes at the bottom of that file
are commented out; run them after seeding data (see below), since `ivfflat`
needs existing rows to build its index lists.

```
uvicorn backend.main:app --reload --port 8000
```

Optionally seed a demo playbook with the sample procurement policy PDFs:

```
python scripts/seed_demo_data.py
```

## Frontend

```
cd frontend
npm install
cp .env.example .env   # fill in VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev
```

`src/lib/supabaseClient.js` sets up a Supabase client using the browser-safe
publishable key (separate from the backend's `SUPABASE_KEY`, which should be
the service role key — never put the service role key in a `VITE_`-prefixed
var, it ends up in the client bundle). Nothing imports this client yet.

The frontend currently runs fully on mocked data (`USE_MOCK` in
`src/policylens/data.jsx`) and does not yet call the backend API or Supabase
directly — wiring it up is the next step, pending a decision on how the
Upload → Review → Final → Policy flow maps to the spec's drift-report flow.
