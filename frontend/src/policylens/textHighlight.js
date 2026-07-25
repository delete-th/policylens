// Locates `needle` (the LLM's violating_text) within `fullText` (the real
// clause text), trying progressively looser matches since the model isn't
// guaranteed to return a byte-exact substring even when told to. Returns
// null rather than guessing when nothing matches closely enough — a wrong
// highlight is worse than no highlight.
export function findRobustSpan(fullText, needle) {
  if (!fullText || !needle) return null;

  let idx = fullText.indexOf(needle);
  if (idx !== -1) return { start: idx, end: idx + needle.length };

  const lowerFull = fullText.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  idx = lowerFull.indexOf(lowerNeedle);
  if (idx !== -1) return { start: idx, end: idx + needle.length };

  // Whitespace-collapsed match: build a map from each character of a
  // whitespace-collapsed copy of fullText back to its original offset, so a
  // match found in the collapsed string can be translated back to a real
  // {start, end} range in fullText.
  const map = [];
  let collapsed = "";
  let lastWasSpace = false;
  for (let i = 0; i < fullText.length; i++) {
    const ch = fullText[i];
    if (/\s/.test(ch)) {
      if (!lastWasSpace) {
        collapsed += " ";
        map.push(i);
        lastWasSpace = true;
      }
    } else {
      collapsed += ch;
      map.push(i);
      lastWasSpace = false;
    }
  }

  const collapsedNeedle = needle.replace(/\s+/g, " ").trim();
  const cIdx = collapsed.toLowerCase().indexOf(collapsedNeedle.toLowerCase());
  if (cIdx !== -1 && collapsedNeedle.length > 0) {
    const start = map[cIdx];
    const endCollapsedIdx = Math.min(cIdx + collapsedNeedle.length - 1, map.length - 1);
    const end = map[endCollapsedIdx] + 1;
    if (start !== undefined) return { start, end };
  }

  return null;
}

// suggested_text is the FULL clause with only the violating_text span
// replaced (the backend splices it in server-side — see
// backend/services/text_span.py — so nothing outside that span was
// touched). The parts of suggested_text before/after the replacement are
// therefore byte-identical to currentText's before/after the violating
// span, so the replacement's length — and hence its location within
// suggested_text — can be derived purely from string lengths, with no
// extra data from the backend needed.
export function findSuggestedSpan(currentText, violatingText, suggestedText) {
  const currentSpan = findRobustSpan(currentText, violatingText);
  if (!currentSpan || !suggestedText) return null;
  const untouchedLen = currentText.length - (currentSpan.end - currentSpan.start);
  const replacementLen = suggestedText.length - untouchedLen;
  if (replacementLen < 0 || currentSpan.start + replacementLen > suggestedText.length) return null;
  return { start: currentSpan.start, end: currentSpan.start + replacementLen };
}
