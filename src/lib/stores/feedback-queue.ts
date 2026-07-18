/**
 * Feedback outbox — enqueue BEFORE firing, dequeue on confirmed success.
 *
 * If the tab closes mid-flight, the next mount replays. Deliberately a plain
 * module rather than a zustand persist slice (the pattern used by
 * custom-entities-store.ts): nothing renders from this state, so a store would
 * buy re-render plumbing we'd never use. It still mirrors that file's contract —
 * `gospel-central-`-prefixed key, explicit STORAGE_VERSION with a discarding
 * migrate, and a hard cap.
 *
 * Duplicate-submission safety lives in `clientRequestId`: it is minted once at
 * enqueue and reused on every replay, and public.feedback has a unique index on
 * it, so a replay of a write that already landed conflicts into a no-op instead
 * of filing the same complaint twice.
 *
 * PRIVACY: entries hold plaintext feedback that may name a person, so the queue
 * is cleared on logout (auth-store) and self-expires — a shared device must not
 * surface one user's unsent message to whoever signs in next.
 */

import type { FeedbackPayload } from '../utils/feedback';

const STORAGE_KEY = 'gospel-central-feedback-queue';
const STORAGE_VERSION = 1;
const MAX_ENTRIES = 5;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface QueuedFeedback {
  payload: FeedbackPayload;
  queuedAt: string;
}

interface Envelope {
  version: number;
  entries: QueuedFeedback[];
}

/**
 * Drop expired entries and enforce the cap (newest kept). Pure — exported so the
 * expiry/cap rules are pinned by tests without touching localStorage.
 */
export function pruneQueue(entries: QueuedFeedback[], now: number): QueuedFeedback[] {
  return entries
    .filter((e) => {
      const t = new Date(e.queuedAt).getTime();
      return Number.isFinite(t) && now - t < MAX_AGE_MS;
    })
    .slice(-MAX_ENTRIES);
}

function read(): QueuedFeedback[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Envelope;
    // Version mismatch → discard rather than guess at an old shape.
    if (!parsed || parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.entries)) {
      return [];
    }
    return pruneQueue(parsed.entries, Date.now());
  } catch {
    return [];
  }
}

function write(entries: QueuedFeedback[]): void {
  if (typeof window === 'undefined') return;
  try {
    const envelope: Envelope = { version: STORAGE_VERSION, entries };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    /* quota or private-mode denial — the in-flight POST is still the primary path */
  }
}

export function enqueueFeedback(payload: FeedbackPayload): void {
  const next = pruneQueue([...read(), { payload, queuedAt: new Date().toISOString() }], Date.now());
  write(next);
}

/** Remove by idempotency key. Called only after a confirmed 2xx. */
export function dequeueFeedback(clientRequestId: string): void {
  write(read().filter((e) => e.payload.clientRequestId !== clientRequestId));
}

export function listQueuedFeedback(): QueuedFeedback[] {
  return read();
}

/** Wipe the outbox. Called from auth-store.logout() — see the privacy note above. */
export function clearFeedbackQueue(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}
