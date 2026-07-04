import { describe, test, expect } from 'vitest';
import { prefixMatch } from './text-match';

describe('prefixMatch', () => {
  test('"D" matches "David Kim" at the leading D', () => {
    expect(prefixMatch('David Kim', 'D')).toEqual([{ start: 0, end: 1 }]);
  });

  test('"D" does NOT match "Amanda" (the D is not word-initial)', () => {
    expect(prefixMatch('Amanda', 'D')).toBeNull();
  });

  test('case-insensitive: "dav" matches "David"', () => {
    expect(prefixMatch('David', 'dav')).toEqual([{ start: 0, end: 3 }]);
  });

  test('word-start: "kim" matches "David Kim" over the "Kim" word', () => {
    expect(prefixMatch('David Kim', 'kim')).toEqual([{ start: 6, end: 9 }]);
  });

  test('"avid" does NOT match "David" (mid-word, not a word start)', () => {
    expect(prefixMatch('David', 'avid')).toBeNull();
  });

  test('multi-token: "da ki" matches "David Kim" with two ranges', () => {
    expect(prefixMatch('David Kim', 'da ki')).toEqual([
      { start: 0, end: 2 },
      { start: 6, end: 8 },
    ]);
  });

  test('multi-token: "da zz" fails because "zz" has no matching word', () => {
    expect(prefixMatch('David Kim', 'da zz')).toBeNull();
  });

  test('hyphen word starts: "ma" matches "Anna-Marie" at the "Marie" segment', () => {
    expect(prefixMatch('Anna-Marie', 'ma')).toEqual([{ start: 5, end: 7 }]);
  });

  test("apostrophe word starts: \"br\" matches \"O'Brien\" at the B after the apostrophe", () => {
    expect(prefixMatch("O'Brien", 'br')).toEqual([{ start: 2, end: 4 }]);
  });

  test('empty query returns null', () => {
    expect(prefixMatch('David Kim', '')).toBeNull();
  });

  test('whitespace-only query returns null', () => {
    expect(prefixMatch('David Kim', '   ')).toBeNull();
  });

  test('empty text with non-empty query returns null', () => {
    expect(prefixMatch('', 'd')).toBeNull();
  });

  test('ranges are sorted and non-overlapping when tokens hit different words', () => {
    // Query tokens given "out of order" relative to the text should still
    // produce ranges sorted by start position.
    const result = prefixMatch('David Kim', 'ki da');
    expect(result).toEqual([
      { start: 0, end: 2 },
      { start: 6, end: 8 },
    ]);
    // non-overlapping:
    expect(result![0].end).toBeLessThanOrEqual(result![1].start);
  });

  test('identical repeated token ("da da") on "David" returns null: only one word ' +
    'is available to claim, so the second occurrence of the token has nothing ' +
    'left to match against (each unclaimed word may be claimed by at most one token)', () => {
    expect(prefixMatch('David', 'da da')).toBeNull();
  });
});
