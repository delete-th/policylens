-- PolicyLens migration 0002: policy management + two-level review workflow
-- Run in the Supabase SQL editor. Additive only — safe against the existing
-- live schema and data (no drops, no renames).

-- ── PDF storage (view the originally uploaded policy PDF) ────────────────
alter table policy_versions add column if not exists pdf_storage_path text;

-- ── Clause ordering (needed to reassemble a contract in original order) ──
alter table contract_records add column if not exists sequence_order int;
alter table contract_records add column if not exists created_at timestamptz not null default now();

-- ── Two-level compliance split: policy_compliance vs precedent ──────────
-- One contract_evaluator.evaluate_contract() call now produces TWO rows per
-- clause instead of one — each independently reviewable/decidable.
do $$ begin
  create type compliance_check_type_enum as enum ('policy_compliance', 'precedent');
exception when duplicate_object then null;
end $$;

alter table compliance_check_results
  add column if not exists check_type compliance_check_type_enum not null default 'policy_compliance',
  add column if not exists suggested_text text;

-- ── Review decisions (Accept / Reject / Edit persistence) ────────────────
do $$ begin
  create type decision_status_enum as enum ('accepted', 'rejected', 'edited');
exception when duplicate_object then null;
end $$;

create table if not exists review_decisions (
  id uuid primary key default uuid_generate_v4(),
  compliance_check_result_id uuid not null unique
    references compliance_check_results(id) on delete cascade,
  status decision_status_enum not null,
  final_text text,
  decided_at timestamptz not null default now()
);

create index if not exists review_decisions_check_result_idx
  on review_decisions(compliance_check_result_id);
