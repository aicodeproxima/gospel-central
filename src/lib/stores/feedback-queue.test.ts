import { describe, it, expect } from 'vitest';
import { pruneQueue, type QueuedFeedback } from './feedback-queue';

const NOW = new Date('2026-07-18T12:00:00.000Z').getTime();

function entry(id: string, ageMs: number): QueuedFeedback {
  return {
    payload: {
      clientRequestId: id,
      category: 'bug',
      subject: 's',
      message: 'm',
    },
    queuedAt: new Date(NOW - ageMs).toISOString(),
  };
}

const HOUR = 60 * 60 * 1000;

describe('pruneQueue', () => {
  it('keeps recent entries', () => {
    const kept = pruneQueue([entry('a', HOUR), entry('b', 2 * HOUR)], NOW);
    expect(kept.map((e) => e.payload.clientRequestId)).toEqual(['a', 'b']);
  });

  it('drops entries older than 24h — stale text must not resurface later', () => {
    const kept = pruneQueue([entry('old', 25 * HOUR), entry('fresh', HOUR)], NOW);
    expect(kept.map((e) => e.payload.clientRequestId)).toEqual(['fresh']);
  });

  it('caps at 5, keeping the newest', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id, i) =>
      entry(id, (7 - i) * 1000),
    );
    const kept = pruneQueue(many, NOW);
    expect(kept).toHaveLength(5);
    expect(kept.map((e) => e.payload.clientRequestId)).toEqual(['c', 'd', 'e', 'f', 'g']);
  });

  it('discards entries with an unparseable timestamp rather than keeping them forever', () => {
    const bad = { ...entry('bad', 0), queuedAt: 'not-a-date' };
    expect(pruneQueue([bad, entry('ok', HOUR)], NOW)).toHaveLength(1);
  });

  it('handles an empty queue', () => {
    expect(pruneQueue([], NOW)).toEqual([]);
  });
});
