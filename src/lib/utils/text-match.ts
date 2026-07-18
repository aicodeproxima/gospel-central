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
 * REV3 #3 (user spec 2026-07-17): the DEFAULT search semantic is "prefix of
 * the full visible label" — typing "B" matches only names that START with B
 * ("Abidan Ben-Gideoni" does NOT match via its surname). Returns the single
 * highlight range covering the matched prefix, or null.
 */
export function fullPrefixRange(text: string, query: string): MatchRange[] | null {
  const q = query.trim().toLowerCase();
  if (!q || !text) return null;
  return text.toLowerCase().startsWith(q) ? [{ start: 0, end: q.length }] : null;
}

/**
 * Which highlight (if any) a query earns on a contact's NAME — kept in
 * lockstep with the filter semantics of each searchField (REV3 #3):
 *  - 'all' (the default tiered search): full-label prefix ONLY. A surname
 *    word-start ("B" in "Elizur Ben-Shedeur") must NOT highlight — that row
 *    matched via a preaching partner and shows "via <partner>" instead.
 *  - 'contact' (scoped name search): the word-start matcher it filters by.
 *  - any other scoped field: the name was not the match basis — no highlight.
 */
export function nameHighlightRanges(
  name: string,
  query: string,
  searchField: string = 'all',
): MatchRange[] | null {
  if (searchField === 'all') return fullPrefixRange(name, query);
  if (searchField === 'contact') return prefixMatch(name, query);
  return null;
}

/**
 * Same lockstep for a preaching-PARTNER's name: the default search highlights
 * a partner only on a full-label prefix (the tier-2 match); a scoped
 * 'branches' search keeps the word-start matcher it filters by.
 */
export function partnerHighlightRanges(
  partnerName: string,
  query: string,
  searchField: string = 'all',
): MatchRange[] | null {
  if (searchField === 'all') return fullPrefixRange(partnerName, query);
  if (searchField === 'branches') return prefixMatch(partnerName, query);
  return null;
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
