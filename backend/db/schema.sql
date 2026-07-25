-- PolicyLens database schema (Supabase Postgres + pgvector)
-- Spec: proj-spec/policylens-spec_v4_0.json section 8b_supabase_schema
-- Run this whole block in the Supabase SQL editor for a from-scratch install.
--
-- This file is kept in sync with db/migrations/*.sql — it represents the
-- CURRENT full schema, not just the original base. If you're migrating an
-- existing database, run the numbered migration files instead of this one.
--
-- ivfflat indexes need rows to build lists — for the hackathon, seed data
-- first (see /scripts/seed_demo_data.py) then run the CREATE INDEX
-- statements at the bottom of this file.

create extension if not exists "uuid-ossp";
create extension if not exists vector;

-- ── Enums ─────────────────────────────────────────────────────
create type change_type_enum as enum ('added', 'removed', 'modified');
create type compliance_result_enum as enum ('compliant', 'non_compliant', 'uncertain');
create type risk_tier_enum as enum ('high', 'medium', 'low');
create type compliance_check_type_enum as enum ('policy_compliance', 'precedent');
create type decision_status_enum as enum ('accepted', 'rejected', 'edited');

-- ── policy_playbooks (parent of policy_versions; not in section 4) ─
create table policy_playbooks (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_at timestamptz not null default now()
);

-- ── policy_versions ───────────────────────────────────────────
create table policy_versions (
  id uuid primary key default uuid_generate_v4(),
  playbook_id uuid not null references policy_playbooks(id) on delete cascade,
  version_number int not null,
  is_current boolean not null default false,
  source_file_name text,
  pdf_storage_path text,
  created_at timestamptz not null default now()
);

create index policy_versions_playbook_idx on policy_versions(playbook_id);
create unique index policy_versions_current_idx
  on policy_versions(playbook_id) where is_current;

-- ── policy_clauses ────────────────────────────────────────────
create table policy_clauses (
  id uuid primary key default uuid_generate_v4(),
  policy_version_id uuid not null references policy_versions(id) on delete cascade,
  category text,
  title text,
  -- The real top-level heading this clause sits under in the source PDF
  -- (e.g. "ARTICLE 5 — LIABILITY"), captured by the regex structural
  -- splitter BEFORE the LLM sub-splits the section — unlike `title`, this
  -- is never LLM-generated and never echoes the clause body. Null for
  -- clauses ingested before this column existed, or whose section wasn't
  -- structurally split at all.
  section_heading text,
  clause_text text,
  extracted_rule jsonb,
  embedding vector(1536),
  -- lineage_id: stable id shared across versions by clauses diff_engine.py
  -- has matched as "the same real-world rule" (via embedding similarity),
  -- so a set's per-clause amendment history can be tracked. amended_at is
  -- only bumped when the clause's text actually changed, not on every
  -- re-upload — that's what drives the Policy Center "Last Updated" column.
  lineage_id uuid,
  amended_at timestamptz
);

create index policy_clauses_version_idx on policy_clauses(policy_version_id);
create index policy_clauses_lineage_idx on policy_clauses(lineage_id);

-- ── clause_changes ────────────────────────────────────────────
create table clause_changes (
  id uuid primary key default uuid_generate_v4(),
  playbook_id uuid not null references policy_playbooks(id) on delete cascade,
  old_version_id uuid references policy_versions(id) on delete set null,
  new_version_id uuid not null references policy_versions(id) on delete cascade,
  change_type change_type_enum not null,
  category text,
  old_text text,
  new_text text,
  old_rule jsonb,
  new_rule jsonb,
  -- the amended (added/modified) policy_clauses row this change produced —
  -- lets the pipeline scope re-evaluation of past contracts to just the
  -- clauses that actually changed, instead of the whole policy.
  new_clause_id uuid references policy_clauses(id) on delete set null,
  created_at timestamptz not null default now()
);

create index clause_changes_playbook_idx on clause_changes(playbook_id);
create index clause_changes_new_version_idx on clause_changes(new_version_id);
create index clause_changes_new_clause_idx on clause_changes(new_clause_id);

-- ── contracts (parent of contract_records; not in section 4) ──
create table contracts (
  id uuid primary key default uuid_generate_v4(),
  title text,
  source_file_name text,
  uploaded_at timestamptz not null default now()
);

-- ── contract_records ──────────────────────────────────────────
create table contract_records (
  id uuid primary key default uuid_generate_v4(),
  contract_id uuid not null references contracts(id) on delete cascade,
  playbook_id uuid not null references policy_playbooks(id) on delete cascade,
  policy_version_id_at_upload uuid references policy_versions(id) on delete set null,
  category text,
  title text,
  -- See policy_clauses.section_heading — same concept, contract side.
  section_heading text,
  clause_text text,
  sequence_order int,
  extracted_rule jsonb,
  embedding vector(1536),
  created_at timestamptz not null default now()
);

create index contract_records_contract_idx on contract_records(contract_id);
create index contract_records_playbook_idx on contract_records(playbook_id);

-- ── compliance_check_results ──────────────────────────────────
-- One row per check_type per violated rule per contract clause per
-- evaluation (or one row when there's nothing violated) — so each
-- violation is independently reviewable, and policy-compliance vs
-- precedent findings are independently reviewable from each other too.
create table compliance_check_results (
  id uuid primary key default uuid_generate_v4(),
  contract_record_id uuid not null references contract_records(id) on delete cascade,
  checked_against_version_id uuid not null references policy_versions(id) on delete cascade,
  check_type compliance_check_type_enum not null default 'policy_compliance',
  result compliance_result_enum not null,
  reason text,
  suggested_text text,
  violating_text text,
  matched_policy_clause_ids uuid[],
  matched_precedent_ids uuid[],
  -- set true (never deleted) when cascading re-evaluation on an accepted
  -- sibling decision supersedes this row with a fresh one — keeps
  -- review_decisions/drift_reports.finding_ids references valid.
  superseded boolean not null default false,
  created_at timestamptz not null default now()
);

create index compliance_check_results_record_idx on compliance_check_results(contract_record_id);

-- ── risk_scores ───────────────────────────────────────────────
create table risk_scores (
  id uuid primary key default uuid_generate_v4(),
  compliance_check_result_id uuid not null references compliance_check_results(id) on delete cascade,
  tier risk_tier_enum not null,
  numeric_score float,
  rationale text
);

create index risk_scores_check_result_idx on risk_scores(compliance_check_result_id);

-- ── review_decisions ──────────────────────────────────────────
-- Accept/Reject/Edit persistence. Unique on compliance_check_result_id so
-- flip-flopping a decision (accept -> edit -> reject) is a simple upsert.
create table review_decisions (
  id uuid primary key default uuid_generate_v4(),
  compliance_check_result_id uuid not null unique
    references compliance_check_results(id) on delete cascade,
  status decision_status_enum not null,
  final_text text,
  decided_at timestamptz not null default now()
);

create index review_decisions_check_result_idx on review_decisions(compliance_check_result_id);

-- ── drift_reports ─────────────────────────────────────────────
create table drift_reports (
  id uuid primary key default uuid_generate_v4(),
  playbook_id uuid not null references policy_playbooks(id) on delete cascade,
  old_version_id uuid references policy_versions(id) on delete set null,
  new_version_id uuid not null references policy_versions(id) on delete cascade,
  generated_at timestamptz not null default now(),
  summary_counts jsonb,
  ai_summary text,
  finding_ids uuid[]
);

create index drift_reports_playbook_idx on drift_reports(playbook_id);

-- ── RAG similarity search RPCs (called via supabase-py .rpc(), see
-- backend/services/embedding.py) ──────────────────────────────────────────

create or replace function match_policy_clauses(
  query_embedding vector(1536),
  p_policy_version_id uuid,
  match_threshold float default 0.7,
  match_count int default 5,
  p_clause_ids uuid[] default null
)
returns table (
  id uuid,
  policy_version_id uuid,
  category text,
  title text,
  clause_text text,
  extracted_rule jsonb,
  similarity float
)
language sql stable
as $$
  select
    pc.id, pc.policy_version_id, pc.category, pc.title, pc.clause_text, pc.extracted_rule,
    1 - (pc.embedding <=> query_embedding) as similarity
  from policy_clauses pc
  where pc.policy_version_id = p_policy_version_id
    and (p_clause_ids is null or pc.id = any(p_clause_ids))
    and 1 - (pc.embedding <=> query_embedding) > match_threshold
  order by pc.embedding <=> query_embedding
  limit match_count;
$$;

create or replace function match_contract_clauses(
  query_embedding vector(1536),
  p_playbook_id uuid,
  p_exclude_contract_id uuid,
  match_threshold float default 0.7,
  match_count int default 5
)
returns table (
  id uuid,
  contract_id uuid,
  playbook_id uuid,
  policy_version_id_at_upload uuid,
  category text,
  title text,
  clause_text text,
  extracted_rule jsonb,
  similarity float
)
language sql stable
as $$
  select
    cr.id, cr.contract_id, cr.playbook_id, cr.policy_version_id_at_upload, cr.category, cr.title, cr.clause_text, cr.extracted_rule,
    1 - (cr.embedding <=> query_embedding) as similarity
  from contract_records cr
  where cr.playbook_id = p_playbook_id
    and cr.contract_id != p_exclude_contract_id
    and 1 - (cr.embedding <=> query_embedding) > match_threshold
  order by cr.embedding <=> query_embedding
  limit match_count;
$$;

-- Unscoped by playbook (only match_policy_clauses is), restricted to
-- current versions — used by policy_matching.py to detect which existing
-- policy set (if any) a newly uploaded document's clauses belong to.
create or replace function match_policy_clauses_global(
  query_embedding vector(1536),
  match_threshold float default 0.7,
  match_count int default 5
)
returns table (
  id uuid,
  policy_version_id uuid,
  playbook_id uuid,
  category text,
  title text,
  clause_text text,
  similarity float
)
language sql stable
as $$
  select
    pc.id, pc.policy_version_id, pv.playbook_id, pc.category, pc.title, pc.clause_text,
    1 - (pc.embedding <=> query_embedding) as similarity
  from policy_clauses pc
  join policy_versions pv on pv.id = pc.policy_version_id
  where pv.is_current
    and 1 - (pc.embedding <=> query_embedding) > match_threshold
  order by pc.embedding <=> query_embedding
  limit match_count;
$$;

-- Detects likely-duplicate contract uploads within one playbook, before the
-- new contract's rows exist yet (so no exclude-contract param, unlike
-- match_contract_clauses).
create or replace function match_contract_clauses_within_playbook(
  query_embedding vector(1536),
  p_playbook_id uuid,
  match_threshold float default 0.7,
  match_count int default 5
)
returns table (
  id uuid,
  contract_id uuid,
  category text,
  title text,
  clause_text text,
  similarity float
)
language sql stable
as $$
  select
    cr.id, cr.contract_id, cr.category, cr.title, cr.clause_text,
    1 - (cr.embedding <=> query_embedding) as similarity
  from contract_records cr
  where cr.playbook_id = p_playbook_id
    and 1 - (cr.embedding <=> query_embedding) > match_threshold
  order by cr.embedding <=> query_embedding
  limit match_count;
$$;

-- ── ivfflat indexes ─────────────────────────────────────────────────────
-- Run these AFTER seeding initial data (ivfflat needs rows to build lists).
--
-- create index policy_clauses_embedding_idx on policy_clauses
--   using ivfflat (embedding vector_cosine_ops) with (lists = 100);
--
-- create index contract_records_embedding_idx on contract_records
--   using ivfflat (embedding vector_cosine_ops) with (lists = 100);
