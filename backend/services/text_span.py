"""Locates a substring (an LLM's `violating_text`) within a larger text,
robust to minor whitespace/case differences the model isn't guaranteed to
avoid even when told to return an exact substring. Python port of
frontend/src/policylens/textHighlight.js::findRobustSpan — keep the two in
sync if either changes.
"""


def find_robust_span(full_text: str, needle: str) -> tuple[int, int] | None:
    if not full_text or not needle:
        return None

    idx = full_text.find(needle)
    if idx != -1:
        return (idx, idx + len(needle))

    lower_full = full_text.lower()
    lower_needle = needle.lower()
    idx = lower_full.find(lower_needle)
    if idx != -1:
        return (idx, idx + len(needle))

    # Whitespace-collapsed match, mapped back to real offsets in full_text.
    mapping: list[int] = []
    collapsed_chars: list[str] = []
    last_was_space = False
    for i, ch in enumerate(full_text):
        if ch.isspace():
            if not last_was_space:
                collapsed_chars.append(" ")
                mapping.append(i)
                last_was_space = True
        else:
            collapsed_chars.append(ch)
            mapping.append(i)
            last_was_space = False
    collapsed = "".join(collapsed_chars)

    collapsed_needle = " ".join(needle.split())
    if not collapsed_needle:
        return None
    c_idx = collapsed.lower().find(collapsed_needle.lower())
    if c_idx != -1:
        start = mapping[c_idx]
        end_collapsed_idx = min(c_idx + len(collapsed_needle) - 1, len(mapping) - 1)
        end = mapping[end_collapsed_idx] + 1
        return (start, end)

    return None


def splice_replacement(full_text: str, violating_text: str, replacement: str) -> str:
    """Replaces ONLY the located violating_text span within full_text with
    `replacement`, leaving everything else byte-for-byte untouched. This is
    what guarantees accepting a suggestion can never silently drop unrelated
    parts of a clause (e.g. a long multi-condition termination clause) —
    which happens if the LLM is trusted to reproduce the whole clause
    itself, since it isn't reliable for long/multi-part clauses. Falls back
    to the replacement alone if the span can't be located (should only
    happen if the LLM's violating_text wasn't actually verbatim)."""
    span = find_robust_span(full_text, violating_text)
    if span is None:
        return replacement
    start, end = span
    return full_text[:start] + replacement + full_text[end:]
