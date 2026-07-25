-- Adds a similarity RPC used to detect likely-duplicate contract uploads
-- (mirrors match_policy_clauses_global's role for policy sets, but scoped
-- to one playbook since contracts are independent documents, not an
-- evolving single document — there's no "exclude this contract" param
-- because the check runs before the new contract exists yet).

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
