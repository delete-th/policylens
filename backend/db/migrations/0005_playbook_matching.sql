-- Adds per-clause amendment lineage columns and a cross-playbook similarity
-- RPC used to detect which existing policy set (if any) a newly uploaded
-- PDF's clauses belong to.

alter table policy_clauses add column if not exists lineage_id uuid;
alter table policy_clauses add column if not exists amended_at timestamptz;

-- Backfill existing rows: no real cross-version identity info exists for
-- clauses ingested before this migration, so each starts as its own
-- lineage (same accepted-limitation pattern as `title`/`sequence_order`
-- backfills earlier this project) and inherits its version's created_at
-- as a best-available "last amended" approximation.
update policy_clauses set lineage_id = id where lineage_id is null;
update policy_clauses pc
set amended_at = pv.created_at
from policy_versions pv
where pc.policy_version_id = pv.id and pc.amended_at is null;

create index if not exists policy_clauses_lineage_idx on policy_clauses(lineage_id);

-- clause_changes had no timestamp at all — needed to order the Policy
-- Center's "Recent Changes" panel chronologically.
alter table clause_changes add column if not exists created_at timestamptz not null default now();

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
