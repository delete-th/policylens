-- Persists the real top-level section heading a clause sits under in the
-- source PDF (e.g. "ARTICLE 1 — SUPPLY OF PRODUCTS AND SERVICES"), captured
-- by the regex structural splitter (clause_classifier.py::_split_into_sections)
-- before the LLM sub-splits the section. Unlike `title` (which for headingless
-- sub-clauses can be an LLM-generated title, or occasionally echo the clause
-- body), this is never LLM-authored and is the reliable "title from the PDF"
-- for display purposes.

alter table policy_clauses add column if not exists section_heading text;
alter table contract_records add column if not exists section_heading text;
