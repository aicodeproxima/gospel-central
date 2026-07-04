/**
 * Outlook-style prefix matching for contact search.
 *
 * A query is split into whitespace-separated tokens. Each token must match a
 * "word start" in the target text — either the very start of the string, or
 * the start of a word segment (a word boundary is whitespace, a hyphen, or an
 * apostrophe). Matching is case-insensitive but preserves original casing in
 * the returned ranges (the ranges index into the ORIGINAL string).
 */

export interface MatchRange {
  start: number;
  end: number;
}

interface WordStart {
  /** Index into the original text where this word begins. */
  index: number;
  /** Lowercased word text, used for prefix comparisons. */
  lower: string;
}

/**
 * Finds every word-start position in `text`. A word starts at index 0 (if
 * the text is non-empty) and immediately after any run of whitespace,
 * hyphens, or apostrophes.
 */
function findWordStarts(text: string): WordStart[] {
  const starts: WordStart[] = [];
  const isBoundary = (ch: string) => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '-' || ch === "'";

  for (let i = 0; i < text.length; i++) {
    const atStringStart = i === 0;
    const prevIsBoundary = i > 0 && isBoundary(text[i - 1]);
    const currentIsBoundary = isBoundary(text[i]);

    if (currentIsBoundary) continue;
    if (atStringStart || prevIsBoundary) {
      // Word runs until the next boundary char (or end of string).
      let end = i;
      while (end < text.length && !isBoundary(text[end])) end++;
      starts.push({ index: i, lower: text.slice(i, end).toLowerCase() });
    }
  }

  return starts;
}

/**
 * Prefix matcher. Case-insensitive. A query token matches at the start of a
 * "word" (word = segment after whitespace, hyphen, or apostrophe — which
 * includes the very start of the string). Every whitespace-separated query
 * token must match some word; tokens claim the FIRST as-yet-unclaimed word
 * they prefix, scanning words in the order they appear in `text`. Returns
 * matched ranges sorted by start, non-overlapping, or null if any token
 * fails to match.
 */
export function prefixMatch(text: string, query: string): MatchRange[] | null {
  const trimmedQuery = query.trim();
  if (trimmedQuery === '') return null;

  const tokens = trimmedQuery.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return null;

  if (text.length === 0) return null;

  const wordStarts = findWordStarts(text);
  const claimed = new Set<number>(); // indexes into wordStarts already used

  const ranges: MatchRange[] = [];

  for (const token of tokens) {
    const lowerToken = token.toLowerCase();
    let matchedWordIdx = -1;

    for (let i = 0; i < wordStarts.length; i++) {
      if (claimed.has(i)) continue;
      if (wordStarts[i].lower.startsWith(lowerToken)) {
        matchedWordIdx = i;
        break;
      }
    }

    if (matchedWordIdx === -1) return null;

    claimed.add(matchedWordIdx);
    const wordStart = wordStarts[matchedWordIdx];
    ranges.push({ start: wordStart.index, end: wordStart.index + token.length });
  }

  ranges.sort((a, b) => a.start - b.start);
  return ranges;
}
