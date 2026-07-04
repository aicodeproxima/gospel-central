'use client';

import type { MatchRange } from '@/lib/utils/text-match';

export interface HighlightedTextProps {
  text: string;
  /** Ranges from prefixMatch — may be null/undefined → render plain text. */
  ranges?: MatchRange[] | null;
  className?: string;
}

/**
 * Renders `text` with the given match `ranges` wrapped in a theme-safe
 * `<mark>` highlight. Used for Outlook-style prefix-match search results
 * (see src/lib/utils/text-match.ts). Never uses dangerouslySetInnerHTML —
 * segments are built and rendered as plain React children so casing and
 * original characters are preserved exactly.
 */
export function HighlightedText({ text, ranges, className }: HighlightedTextProps) {
  if (!ranges || ranges.length === 0) {
    return <span className={className}>{text}</span>;
  }

  const segments: { text: string; highlighted: boolean }[] = [];
  let cursor = 0;

  for (const { start, end } of ranges) {
    if (start > cursor) {
      segments.push({ text: text.slice(cursor, start), highlighted: false });
    }
    segments.push({ text: text.slice(start, end), highlighted: true });
    cursor = end;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), highlighted: false });
  }

  return (
    <span className={className}>
      {segments.map((segment, i) =>
        segment.highlighted ? (
          <mark key={i} className="rounded-[2px] bg-primary/25 text-inherit">
            {segment.text}
          </mark>
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      )}
    </span>
  );
}
