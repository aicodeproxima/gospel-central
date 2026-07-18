import { describe, it, expect } from 'vitest';
import {
  validateFeedbackPayload,
  formatFeedbackEmail,
  SUBJECT_MAX,
  MESSAGE_MAX,
  type FeedbackPayload,
} from './feedback';

/**
 * The server route runs this same validator on untrusted input, so these pins
 * are the API contract — not just unit coverage of a helper.
 */

const valid = {
  clientRequestId: 'req-1',
  category: 'bug',
  subject: 'Something broke',
  message: 'Here is what happened.',
};

describe('validateFeedbackPayload', () => {
  it('accepts a well-formed payload and trims', () => {
    const r = validateFeedbackPayload({ ...valid, subject: '  padded  ' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.subject).toBe('padded');
      expect(r.value.category).toBe('bug');
    }
  });

  it.each(['bug', 'idea', 'question', 'other'])('accepts category %s', (category) => {
    expect(validateFeedbackPayload({ ...valid, category }).ok).toBe(true);
  });

  it('rejects an unknown category rather than defaulting to bug', () => {
    const r = validateFeedbackPayload({ ...valid, category: 'complaint' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('category');
  });

  it('rejects a missing idempotency key — replays could not be deduped without it', () => {
    const r = validateFeedbackPayload({ ...valid, clientRequestId: '   ' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('clientRequestId');
  });

  it.each([
    ['subject', { subject: '' }],
    ['message', { message: '   ' }],
  ])('rejects empty %s', (field, patch) => {
    const r = validateFeedbackPayload({ ...valid, ...patch });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe(field);
  });

  it('REJECTS over-length input instead of silently truncating it', () => {
    // Truncating would store a mangled report while telling the user it sent
    // fine — the same "looked like it worked" failure this feature removes.
    const long = validateFeedbackPayload({ ...valid, message: 'x'.repeat(MESSAGE_MAX + 1) });
    expect(long.ok).toBe(false);
    const longSubject = validateFeedbackPayload({ ...valid, subject: 'x'.repeat(SUBJECT_MAX + 1) });
    expect(longSubject.ok).toBe(false);
  });

  it('accepts exactly-at-limit input (boundary is inclusive, matching the SQL check)', () => {
    expect(validateFeedbackPayload({ ...valid, message: 'x'.repeat(MESSAGE_MAX) }).ok).toBe(true);
    expect(validateFeedbackPayload({ ...valid, subject: 'x'.repeat(SUBJECT_MAX) }).ok).toBe(true);
  });

  it('tolerates garbage input without throwing', () => {
    for (const bad of [undefined, null, 'string', 42, [], { category: {} }]) {
      expect(() => validateFeedbackPayload(bad)).not.toThrow();
      expect(validateFeedbackPayload(bad).ok).toBe(false);
    }
  });
});

describe('formatFeedbackEmail', () => {
  const payload: FeedbackPayload = {
    ...valid,
    category: 'bug',
    submitterName: 'Michael',
    submitterRole: 'dev',
    submitterId: 'u-michael',
  };

  it('labels the identity as self-asserted so a reader never treats it as authenticated', () => {
    expect(formatFeedbackEmail(payload, true)).toContain('SELF-ASSERTED');
  });

  it('states plainly when the email is the only copy', () => {
    expect(formatFeedbackEmail(payload, false)).toContain('only copy');
    expect(formatFeedbackEmail(payload, true)).toContain('public.feedback');
  });

  it('carries the idempotency ref so a duplicate email is identifiable', () => {
    expect(formatFeedbackEmail(payload, true)).toContain('req-1');
  });
});
