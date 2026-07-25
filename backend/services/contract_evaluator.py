"""ContractEvaluatorNode (renamed from ApprovalEvaluator).

RAG: retrieve top-K relevant policy clauses + top-K precedent contract
clauses by embedding similarity, send both to the LLM in one call that
independently evaluates the clause against EACH matched rule/clause —
one compliance_check_results row per violated rule (never merged into one
combined verdict, so each is independently reviewable and a fix for one
doesn't risk drifting the legal meaning of another), or a single summary
row when nothing's violated.

reevaluate_single_rule() and reevaluate_precedent() are the cascading-
re-evaluation primitives used by review.py: when an accepted/edited
decision changes a clause's effective text, other pending findings on that
same clause need fresh verdicts against the new text, not the stale
original.
"""

import json
from uuid import UUID

from backend.config import settings
from backend.db.client import get_supabase
from backend.services import embedding, text_span
from backend.services._azure_client import get_azure_client

_SYSTEM_PROMPT = """You are a contract review assistant. You are given a contract clause, a \
set of matched policy rules (each with an "index"), and a set of matched precedent clauses \
from past contracts under the same playbook (each with an "index").

Evaluate the contract clause against EACH matched policy rule and EACH matched precedent \
clause INDEPENDENTLY. Never merge two distinct violations into one entry — each violated rule \
gets its own entry so it can be reviewed and fixed independently of the others.

A contract clause only needs to satisfy policy rules that are relevant to the same topic. If \
the contract clause is about exclusivity and the matched policy rule is about indemnification, \
they are unrelated — mark it "compliant" (with a reason noting the rule is not applicable to \
this clause's subject matter) rather than "non_compliant". Do not flag a clause as non_compliant \
with a policy rule that covers a different subject matter — the contract may satisfy that policy \
rule in a different article.

For "policy_compliance":
- If matched_policy_rules is empty: exactly one entry, {"index": null, "result": "uncertain", \
"reason": "No matching policy rule found for this clause.", "suggested_replacement_text": null, "violating_text": null}.
- If the clause complies with EVERY matched rule, OR the remaining rules are simply not \
applicable to this clause's subject matter (see above) — i.e. NONE are actually violated: \
exactly one entry summarizing that, {"index": null, "result": "compliant", "reason": "...", \
"suggested_replacement_text": null, "violating_text": null}.
- If the clause violates one or more matched rules: ONE ENTRY PER VIOLATED RULE (omit entries \
for rules it complies with, or that are not applicable — those don't need their own row and \
must NEVER be folded into a violated rule's entry either). Each entry's "index" MUST be that \
rule's exact position in matched_policy_rules — never null, never the wrong rule, never two \
rules' evaluations merged into one entry even when they cover related topics (e.g. renewal \
length and renewal notice period are different rules — each violated one gets its own entry). \
"result" is "non_compliant", "reason" explains ONLY that one violation. A non_compliant entry \
MUST always include both violating_text and suggested_replacement_text below — never leave \
either null when result is non_compliant.
  - "violating_text" is the exact verbatim substring from contract_clause — copied \
  character-for-character, not paraphrased — that is the specific problematic (or, for a \
  missing-right violation, the most relevant existing) language for THIS violation. This exact \
  substring will be mechanically cut out of contract_clause and replaced by \
  "suggested_replacement_text" — nothing else in contract_clause will be touched.
  - "suggested_replacement_text" is ONLY the replacement for that violating_text span — never \
  the full clause, never any part of contract_clause outside that span. It must read naturally \
  when substituted in violating_text's exact place (match capitalization/punctuation at the \
  boundaries). If the fix is a wrong phrase, replace just that phrase. If the violation is \
  something MISSING (e.g. an absent right) rather than something wrong, set violating_text to \
  the smallest existing sentence nearest where the addition belongs, and make \
  suggested_replacement_text that same original sentence PLUS the added text, so nothing from \
  the original is lost. Do not resolve the other violations here — each has its own entry.

Same logic for "precedent": if the clause is at least as good a deal as EVERY matched precedent, \
exactly one summarizing entry, {"index": null, "result": "compliant", ...}. If it's WORSE than \
one or more matched precedents, ONE ENTRY PER precedent it's worse than — each entry's "index" \
MUST be that precedent's exact position in matched_precedent_clauses (never null, never merged \
with another precedent's evaluation), "result": "non_compliant", and it MUST always include \
both violating_text and suggested_replacement_text (never null for a non_compliant entry). If \
matched_precedent_clauses is empty: one entry with result "uncertain", reason "No precedent \
contracts available for comparison."

Respond with strict JSON:
{"policy_compliance": [{"index": null_or_int, "result": "...", "reason": "...", "suggested_replacement_text": null, "violating_text": null}],
 "precedent": [{"index": null_or_int, "result": "...", "reason": "...", "suggested_replacement_text": null, "violating_text": null}]}"""

_FALLBACK_VERDICT = {
    "policy_compliance": [
        {
            "index": None,
            "result": "uncertain",
            "reason": "No matching policy rule found for this clause.",
            "suggested_replacement_text": None,
            "violating_text": None,
        }
    ],
    "precedent": [
        {
            "index": None,
            "result": "uncertain",
            "reason": "No precedent contracts available for comparison.",
            "suggested_replacement_text": None,
            "violating_text": None,
        }
    ],
}

_SINGLE_RULE_PROMPT = """You are a contract review assistant re-checking one contract clause \
against ONE specific policy rule or precedent clause, after the clause's text was just edited \
to fix a different, unrelated issue. Determine whether the CURRENT (possibly updated) clause \
text now satisfies this one rule.

If it now complies, result is "compliant" — the earlier edit already resolved this too — and \
suggested_replacement_text/violating_text are null.
If it still violates the rule, result is "non_compliant"; you MUST always include both \
suggested_replacement_text and violating_text in that case — never leave either null when \
result is non_compliant. Regenerate both based on the CURRENT clause text you were given, not \
any prior version. \
violating_text must be an exact verbatim substring of the CURRENT clause text — it will be \
mechanically cut out and replaced by suggested_replacement_text, so nothing else in the clause \
is touched. suggested_replacement_text is ONLY the replacement for that span, never the full \
clause. If the fix requires adding something missing rather than correcting existing wrong \
language, set violating_text to the smallest existing sentence nearest where the addition \
belongs, and make suggested_replacement_text that sentence plus the addition.

Respond with strict JSON: {"result": "...", "reason": "...", "suggested_replacement_text": null, "violating_text": null}"""

_PRECEDENT_ONLY_PROMPT = """You are a contract review assistant. You are given a contract \
clause and a set of matched precedent clauses from past contracts under the same playbook \
(each with an "index"). This clause's text may have just been edited to fix an unrelated \
policy issue — evaluate it fresh against precedent; do not assume any prior verdict still holds.

Evaluate the clause against EACH matched precedent clause independently — one entry per \
distinct issue, never merged.
- If matched_precedent_clauses is empty: exactly one entry, {"index": null, "result": \
"uncertain", "reason": "No precedent contracts available for comparison.", "suggested_replacement_text": null, "violating_text": null}.
- If the clause is at least as good a deal as EVERY matched precedent: exactly one entry, \
{"index": null, "result": "compliant", "reason": "...", "suggested_replacement_text": null, "violating_text": null}.
- If the clause is WORSE than one or more matched precedents: ONE ENTRY PER precedent it's \
worse than — "index" MUST be that precedent's exact position in matched_precedent_clauses \
(never null, never merged with another precedent's evaluation), "result": "non_compliant", \
"reason" explains only that one comparison, and violating_text/suggested_replacement_text below \
must always both be present — never null for a non_compliant entry. "violating_text" is the \
exact verbatim substring from contract_clause \
— copied character-for-character — that is the specific problematic (or, for a missing-right \
issue, the most relevant existing) language for THIS comparison; it will be mechanically cut \
out and replaced by "suggested_replacement_text", so nothing else in the clause is touched. \
"suggested_replacement_text" is ONLY the replacement for that span, never the full clause — if \
the issue is something missing, set violating_text to the smallest existing sentence nearest \
where the addition belongs and make suggested_replacement_text that sentence plus the addition.

Respond with strict JSON:
{"precedent": [{"index": null_or_int, "result": "...", "reason": "...", "suggested_replacement_text": null, "violating_text": null}]}"""


def rows_from_verdicts(
    verdicts: list[dict], matched_candidates: list, check_type: str, clause_text: str
) -> list[dict]:
    """Turns a list of {index, result, reason, suggested_replacement_text,
    violating_text} verdicts into compliance_check_results-shaped dicts
    (contract_record_id/checked_against_version_id not yet set — callers
    add those before inserting) — resolves each verdict's `index` back to
    the one specific matched clause id it refers to. Exported so review.py's
    cascading precedent refresh can build rows the same way evaluate_contract
    does, instead of duplicating this mapping logic.

    The LLM only returns a REPLACEMENT FRAGMENT for the violating_text span
    (not a full-clause rewrite, which isn't reliable for long/multi-part
    clauses — it can silently drop unrelated content). `suggested_text`
    persisted here is always the full clause, with only that span spliced
    in via text_span.splice_replacement — accepting a suggestion can never
    lose any part of the clause outside the flagged violation."""
    rows = []
    for v in verdicts:
        idx = v.get("index")
        if idx is not None and 0 <= idx < len(matched_candidates):
            matched_ids = [str(matched_candidates[idx].id)]
        elif matched_candidates:
            matched_ids = [str(c.id) for c in matched_candidates]
        else:
            matched_ids = []
        suggested_text = v.get("suggested_replacement_text")
        violating_text = v.get("violating_text")
        if v["result"] == "non_compliant" and suggested_text and violating_text:
            suggested_text = text_span.splice_replacement(clause_text, violating_text, suggested_text)
        rows.append(
            {
                "check_type": check_type,
                "result": v["result"],
                "reason": v["reason"],
                "suggested_text": suggested_text,
                "violating_text": violating_text,
                "matched_policy_clause_ids": matched_ids if check_type == "policy_compliance" else [],
                "matched_precedent_ids": matched_ids if check_type == "precedent" else [],
            }
        )
    return rows


def evaluate_contract(
    contract_record: dict, policy_version_id: UUID, policy_clause_ids: list[UUID] | None = None
) -> list[dict]:
    """policy_clause_ids, when given, scopes evaluation to just those policy
    clauses (e.g. clauses amended in the latest diff) rather than the whole
    policy version — used when re-checking contracts already evaluated
    against the prior version. Left None for a brand-new contract or a full
    manual recheck, which need the complete policy."""
    supabase = get_supabase()
    contract_embedding = contract_record["embedding"]

    matched_policy_clauses = embedding.find_similar_policy_clauses(
        contract_embedding, policy_version_id, policy_clause_ids=policy_clause_ids
    )
    matched_precedents = embedding.find_similar_contract_clauses(
        contract_embedding,
        contract_record["playbook_id"],
        contract_record["contract_id"],
    )

    if not matched_policy_clauses and not matched_precedents:
        verdicts = _FALLBACK_VERDICT
    else:
        verdicts = _compare_via_llm(contract_record["clause_text"], matched_policy_clauses, matched_precedents)

    clause_text = contract_record["clause_text"]
    row_dicts = rows_from_verdicts(
        verdicts["policy_compliance"], matched_policy_clauses, "policy_compliance", clause_text
    ) + rows_from_verdicts(verdicts["precedent"], matched_precedents, "precedent", clause_text)

    rows = []
    for rd in row_dicts:
        row = (
            supabase.table("compliance_check_results")
            .insert(
                {
                    **rd,
                    "contract_record_id": contract_record["id"],
                    "checked_against_version_id": str(policy_version_id),
                }
            )
            .execute()
            .data[0]
        )
        rows.append(row)
    return rows


def _compare_via_llm(clause_text: str, matched_policy_clauses, matched_precedents) -> dict:
    client = get_azure_client()
    payload = {
        "contract_clause": clause_text,
        "matched_policy_rules": [
            {"index": i, "category": c.category, "text": c.clause_text, "rule": c.extracted_rule}
            for i, c in enumerate(matched_policy_clauses)
        ],
        "matched_precedent_clauses": [
            {"index": i, "category": c.category, "text": c.clause_text} for i, c in enumerate(matched_precedents)
        ],
    }
    response = client.chat.completions.create(
        model=settings.azure_ai_deployment,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(payload)},
        ],
        response_format={"type": "json_object"},
        temperature=0,
    )
    parsed = json.loads(response.choices[0].message.content)
    return {
        "policy_compliance": parsed.get("policy_compliance") or _FALLBACK_VERDICT["policy_compliance"],
        "precedent": parsed.get("precedent") or _FALLBACK_VERDICT["precedent"],
    }


def reevaluate_single_rule(clause_text: str, matched_clause: dict) -> dict:
    """Cascading re-evaluation: re-checks one clause against the ONE rule a
    specific pending violation was already tied to, using the clause's
    current effective text (post any already-accepted sibling decision).
    matched_clause is {"category", "text", "rule"?} — the same shape used
    in the main evaluator's payload for one candidate."""
    client = get_azure_client()
    payload = {"contract_clause": clause_text, "matched_rule": matched_clause}
    response = client.chat.completions.create(
        model=settings.azure_ai_deployment,
        messages=[
            {"role": "system", "content": _SINGLE_RULE_PROMPT},
            {"role": "user", "content": json.dumps(payload)},
        ],
        response_format={"type": "json_object"},
        temperature=0,
    )
    return json.loads(response.choices[0].message.content)


def reevaluate_precedent(clause_text: str, matched_precedents) -> list[dict]:
    """Cascading re-evaluation: full fresh precedent-only re-check against
    the clause's current effective text. Unlike reevaluate_single_rule,
    this is not a 1:1 refresh of one already-cited match — an accepted
    policy fix can introduce a brand-new inconsistency, or change which
    precedent clause is even the closest match, so retrieval is re-run
    (by the caller, which re-embeds clause_text) and evaluation starts
    fresh rather than re-checking a single fixed prior pairing."""
    if not matched_precedents:
        return [dict(_FALLBACK_VERDICT["precedent"][0])]
    client = get_azure_client()
    payload = {
        "contract_clause": clause_text,
        "matched_precedent_clauses": [
            {"index": i, "category": c.category, "text": c.clause_text} for i, c in enumerate(matched_precedents)
        ],
    }
    response = client.chat.completions.create(
        model=settings.azure_ai_deployment,
        messages=[
            {"role": "system", "content": _PRECEDENT_ONLY_PROMPT},
            {"role": "user", "content": json.dumps(payload)},
        ],
        response_format={"type": "json_object"},
        temperature=0,
    )
    parsed = json.loads(response.choices[0].message.content)
    return parsed.get("precedent") or [dict(_FALLBACK_VERDICT["precedent"][0])]
