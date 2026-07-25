-- PolicyLens migration 0004: real clause titles, violation-text highlighting,
-- and a real (non-fake) AI-generated drift report summary.
-- Run in the Supabase SQL editor.

-- ── New columns (all nullable, no default — instant metadata-only change) ─
alter table policy_clauses           add column if not exists title text;
alter table contract_records         add column if not exists title text;
alter table compliance_check_results add column if not exists violating_text text;
alter table drift_reports            add column if not exists ai_summary text;

-- ── match_contract_clauses: add cr.title to the return shape ─────────────
-- Live signature matches what's checked into schema.sql already, safe to
-- drop directly from that file's definition.
drop function match_contract_clauses(vector(1536), uuid, uuid, float, int);

create function match_contract_clauses(
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

-- ── match_policy_clauses: add pc.title to the return shape ────────────────
-- IMPORTANT: the live signature already includes p_clause_ids (added earlier
-- this session directly via SQL editor, never saved to a migration file
-- until now) — schema.sql was stale on this point. This DROP must match
-- that 5-argument live signature, not the 4-argument one from the original
-- schema.sql.
drop function match_policy_clauses(vector(1536), uuid, float, int, uuid[]);

create function match_policy_clauses(
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
