-- PolicyLens migration 0003: scope contract re-evaluation to amended policy
-- clauses only, when a policy version diff is available.
-- Run in the Supabase SQL editor.

alter table clause_changes add column if not exists new_clause_id uuid references policy_clauses(id) on delete set null;
create index if not exists clause_changes_new_clause_idx on clause_changes(new_clause_id);
