-- Adds a soft-delete flag used by cascading re-evaluation: when an accepted
-- decision changes a clause's effective text, sibling findings (other
-- pending policy violations, and the whole precedent set) may need fresh
-- verdicts. Rows are never deleted, only marked superseded, so existing
-- review_decisions/drift_reports.finding_ids references stay valid.

alter table compliance_check_results add column if not exists superseded boolean not null default false;
