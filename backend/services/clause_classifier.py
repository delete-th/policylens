"""Shared LLM prompt/schema used inline by policy + contract ingestion.

segment_and_classify() is the one function PolicyIngestionNode /
ContractIngestionNode call to turn raw document text into classified
clauses. It tries a deterministic, regex-based structural split first
(_split_into_sections) — asking an LLM to invent clause boundaries for an
entire document in one shot is unreliable for longer/more complex
documents: it can duplicate the same sentence across multiple "clauses"
with different categories, or omit sentences entirely, because boundary
detection and classification are being asked of the model simultaneously
with no scaffolding. Splitting on the document's own numbered/titled
top-level headings in code is exact and duplicate-free by construction;
the LLM is then only asked to classify — and, if warranted, further split
into sub-rules — each already-correctly-bounded section
(_classify_and_split_section), which is a much easier, more reliable task.
Sub-rule splitting is judged by the LLM rather than pattern-matched by
regex, since different policy PDFs enumerate sub-rules in different
conventions ("1.1 Title.", "Rule 1.1 — Title.", "(a) Title:", ...) and a
fixed regex can only ever cover the exact formats it was written for.

Falls back to the old whole-document LLM segmentation (_llm_segment_and_classify)
only when the regex pass can't find enough real top-level headings to trust
(e.g. a document that doesn't follow a numbered/titled section convention
at all).
"""

import json
import re

from backend.config import settings
from backend.services._azure_client import get_azure_client
from backend.services._concurrency import run_parallel

SUGGESTED_CATEGORIES = [
    "Definitions", "Term", "Payment", "Termination", "Confidentiality",
    "Liability", "Indemnity", "IP Ownership", "Renewal", "Data Retention",
    "Governing Law", "Force Majeure", "Other",
]

# Splits + classifies ONE already-bounded top-level section — deliberately
# format-agnostic rather than pattern-matching a specific numbering
# convention (a fixed regex for "Rule N.M —" only handles documents that
# happen to use exactly that phrasing; a different policy PDF might use
# "1.1 Title.", "(a) Title:", lettered/roman lists, or no visual marker at
# all). Judging "does this section actually enumerate distinct sub-rules"
# is exactly the kind of small, well-bounded task the section-first design
# already relies on being reliable.
_SECTION_SPLIT_PROMPT = f"""You are given one section of a policy or contract document, already
identified by its own top-level heading. Some sections are one single cohesive rule; others
enumerate multiple genuinely distinct, independently-meaningful sub-rules, in ANY numbering or
labeling convention — "1.1 Title. Body", "Rule 1.1 — Title. Body", "(a) Title: Body", bare
"1.1 Body" with no title, lettered or roman-numeral lists. Do not assume any one convention —
read the actual text. Default to NOT splitting; only split when you are confident the section
truly contains multiple separate rules.

Do NOT split out:
- A trailing machine-readable summary/annotation line (e.g. "RULE | key: value [CHANGED]") that
  restates or summarizes a rule already explained in the prose above it, just because it happens
  to start with a word like "Rule" — it belongs to the SAME clause as the prose it summarizes,
  never its own entry, and must never cause the prose to be duplicated either.
- A table, price/threshold tier list, or set of examples that only make sense together as part
  of ONE rule (e.g. tiered dollar-amount approval thresholds, a list of approved jurisdictions)
  — these stay as ONE clause even though they list multiple items.
- Ordinary prose that merely has multiple sentences, with no distinct rule-style labels at all.

Decide whether this section should be split:
- If it enumerates multiple distinct, independently-meaningful sub-rules, split into one entry
  per sub-rule. For each, use its own label/title exactly as it appears in the source if it has
  one (e.g. "Rule 1.2 — Auto-Renewal Cap", "1.1 No Assignment Without Consent", "(a) Data
  Security"); if a sub-rule has no explicit title of its own, write a short (3-6 word)
  descriptive title yourself — a short label describing what the sub-rule is ABOUT, never the
  sub-rule's own body text or a long phrase copied from it. The title must always be
  meaningfully shorter than the clause text itself and must never just restate/echo it.
- Otherwise, return the ENTIRE section as a single entry using the section's own heading (given
  to you) as the title.
- Every sentence of the section's text must appear in EXACTLY ONE output entry — never drop
  text, never duplicate the same sentence or the section as a whole across two entries, never
  split a sentence in half.

Also classify each resulting entry's category — a coarse bucket used for retrieval/matching,
keep it short. Use the closest match, or another short category name if none fit:
{", ".join(SUGGESTED_CATEGORIES)}.

Respond with strict JSON: {{"clauses": [{{"text": "...", "title": "...", "category": "...", "confidence": 0.0-1.0}}]}}"""

_SEGMENT_SYSTEM_PROMPT = f"""You are a contract/policy clause segmenter and classifier.
Given raw extracted document text, identify the document's real substantive clauses/rules
and classify each one. The raw text comes straight from a PDF text layer — page headers,
footers, and the document's own title may appear multiple times verbatim; treat repeats of
the same heading/title text as ONE occurrence, not one clause per repeat.

Do NOT emit a clause for non-substantive text — skip it entirely, do not classify it as
"Other" or anything else:
- The document's own title/cover heading (e.g. "SPONSORSHIP AND SERVICES AGREEMENT"),
  wherever and however many times it appears.
- Page headers, footers, and page numbers.
- Signature blocks and closing boilerplate ("[Signature pages follow]", "IN WITNESS WHEREOF",
  witness/notary blocks).
A short recitals/preamble paragraph that only names the parties and effective date (no
obligation) may be classified as "Definitions" or "Term" if it fits, but should not be
duplicated if the same preamble text recurs.

Keep each numbered/lettered section (and its sub-clauses, e.g. 9.1, 9.2 under "9. ASSIGNMENT
AND CHANGE OF CONTROL") together as ONE clause covering that whole rule, rather than splitting
every sentence or sub-clause into its own entry. Every sentence of the source text must appear
in EXACTLY ONE output clause — never emit the same sentence, sub-clause, or section more than
once across multiple entries, even if it looks like it could belong to two categories.

For "category" — a coarse bucket used for retrieval/matching, keep it short. Use the closest
match, or another short category name if none fit:
{", ".join(SUGGESTED_CATEGORIES)}.

For "title" — use the document's OWN section/rule heading text, copied verbatim as it appears
in the source (e.g. "9. ASSIGNMENT AND CHANGE OF CONTROL", "TERM AND DURATION", "TERMINATION
AND CURE PERIODS"), NOT the coarse category. Only write a short descriptive title yourself if
the clause truly has no heading anywhere in or near it in the source text — in that case the
title must be a short (3-6 word) label describing what the clause is about, never the clause's
own body text or a long phrase copied from it.

Respond with strict JSON: {{"clauses": [{{"text": "...", "category": "...", "title": "...", "confidence": 0.0-1.0}}]}}"""

# A heading line is either "ARTICLE 1 — ..." / "SECTION 9 ..." or a numbered
# line ("9. ASSIGNMENT AND CHANGE OF CONTROL", "9.1 No Assignment Without
# Consent") whose remainder reads like a short title, not a sentence
# ("1.1 NovaStar shall provide ..." — starts with a capitalized proper noun
# but "shall" gives it away as body text, not a heading). Deliberately
# requires a number/ARTICLE prefix rather than also matching bare all-caps
# lines: real-world PDFs are full of short capitalized lines that aren't
# section headings at all (letterhead/company name, "Effective: 10 May
# 2025" metadata, table-of-contents fragments) and a bare-line heuristic
# false-positived on exactly those in testing. Numbered sections are also
# what every example we've been given actually uses.
_ARTICLE_RE = re.compile(r"^(ARTICLE|SECTION)\s+[IVXLCDM\d]+\b", re.IGNORECASE)
_NUMBERED_RE = re.compile(r"^\d{1,3}(?:\.\d{1,3})*\.?\s+(\S.*)$")
_MIN_HEADINGS_FOR_STRUCTURAL_SPLIT = 3
_MIN_SECTION_LENGTH = 20


# Minor words conventionally left lowercase in a Title Case heading
# ("Termination for Convenience", "Purpose and Scope") — only the other,
# "content" words need to be capitalized for a line to count as a heading.
_MINOR_WORDS = {
    "a", "an", "the", "and", "or", "nor", "but", "for", "of", "in", "on",
    "at", "to", "vs", "with", "by", "as", "per",
}


def _looks_like_title_words(remainder: str) -> bool:
    words = remainder.split()
    if not words or len(words) > 10:
        return False
    for w in words:
        core = w.strip("().,-")
        if not core or not core[0].isalpha():
            continue
        if core.lower() in _MINOR_WORDS:
            continue
        if not core[0].isupper():
            return False
    return True


def _is_heading_line(line: str) -> bool:
    s = line.strip()
    if not s or len(s) > 90:
        return False
    if s.endswith((",", ";")):
        return False
    if _ARTICLE_RE.match(s):
        return True
    m = _NUMBERED_RE.match(s)
    if m:
        return _looks_like_title_words(m.group(1).rstrip("."))
    return False


def _split_into_sections(raw_text: str) -> list[dict]:
    lines = raw_text.split("\n")
    sections: list[dict] = []
    heading = None
    buf: list[str] = []

    def flush():
        text = "\n".join(buf).strip()
        if len(text) >= _MIN_SECTION_LENGTH:
            sections.append({"heading": heading, "text": text})

    for line in lines:
        if _is_heading_line(line):
            flush()
            heading = line.strip()
            buf = []
        else:
            buf.append(line)
    flush()
    return sections


def _classify_and_split_section(text: str, heading: str) -> list[dict]:
    client = get_azure_client()
    payload = {"section_heading": heading, "section_text": text}
    response = client.chat.completions.create(
        model=settings.azure_ai_deployment,
        messages=[
            {"role": "system", "content": _SECTION_SPLIT_PROMPT},
            {"role": "user", "content": json.dumps(payload)},
        ],
        response_format={"type": "json_object"},
        temperature=0,
    )
    clauses = json.loads(response.choices[0].message.content).get("clauses") or []
    if not clauses:
        clauses = [{"text": text, "title": heading, "category": "Other", "confidence": 0.3}]
    # The LLM's own JSON schema doesn't carry the parent heading through —
    # attach it here in code, since it's the one reliable "real title from
    # the PDF" (regex-detected, never LLM-generated/echoed) each sub-item
    # should be displayable under, regardless of what `title` ends up being.
    for c in clauses:
        c["section_heading"] = heading
    return clauses


def _classify_sections(sections: list[dict]) -> list[dict]:
    # The leading heading=None section (if any) is everything before the
    # document's first detected heading — title page, recitals, party
    # naming boilerplate, letterhead. Same call as the LLM prompt's rule:
    # not a substantive clause, so it's dropped rather than becoming a
    # stray "Other" entry.
    real_sections = [s for s in sections if s["heading"]]

    def classify_one(section: dict) -> list[dict]:
        return _classify_and_split_section(section["text"], section["heading"])

    nested = run_parallel(classify_one, real_sections, settings.llm_concurrency)
    return [clause for group in nested for clause in group]


def _llm_segment_and_classify(raw_text: str) -> list[dict]:
    client = get_azure_client()
    response = client.chat.completions.create(
        model=settings.azure_ai_deployment,
        messages=[
            {"role": "system", "content": _SEGMENT_SYSTEM_PROMPT},
            {"role": "user", "content": raw_text},
        ],
        response_format={"type": "json_object"},
        temperature=0,
    )
    parsed = json.loads(response.choices[0].message.content)
    return parsed.get("clauses", [])


def segment_and_classify(raw_text: str) -> list[dict]:
    sections = _split_into_sections(raw_text)
    if sum(1 for s in sections if s["heading"]) >= _MIN_HEADINGS_FOR_STRUCTURAL_SPLIT:
        return _classify_sections(sections)
    return _llm_segment_and_classify(raw_text)
