import { describe, it, expect } from 'vitest';
import {
  validateFeedbackPayload,
  formatFeedbackEmail,
  formatFeedbackSubject,
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
    subject: 'Something broke',
    message: 'Here is what happened.',
    submitterName: 'Stephen Phillips',
    submitterUsername: 'stephen',
    submitterRole: 'dev',
    submitterId: 'u-stephen',
  };

  it('renders the five fields in order, then the message', () => {
    const body = formatFeedbackEmail(payload, true);
    const order = ['Name:', 'Username:', 'Subject:', 'Category:'].map((k) => body.indexOf(k));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(body).toContain('Stephen Phillips');
    expect(body).toContain('stephen');
    expect(body).toContain('Something broke');
    expect(body).toContain('Bug');
    expect(body.indexOf('Here is what happened.')).toBeGreaterThan(body.indexOf('Category:'));
  });

  it('still tells the reader the identity is not authenticated', () => {
    // Dropped from the field list, kept in the footer: someone acting on a
    // complaint must not read the name as a verified claim.
    expect(formatFeedbackEmail(payload, true)).toContain('self-asserted');
  });

  it('warns ONLY when the row failed to store — silence is the normal case', () => {
    expect(formatFeedbackEmail(payload, false)).toContain('NOT STORED');
    expect(formatFeedbackEmail(payload, false)).toContain('req-1');
    expect(formatFeedbackEmail(payload, true)).not.toContain('NOT STORED');
  });

  it('falls back to the username, then Unknown, when the name is missing', () => {
    expect(formatFeedbackEmail({ ...payload, submitterName: undefined }, true)).toContain('Unknown');
    const anon = formatFeedbackEmail(
      { ...payload, submitterName: undefined, submitterUsername: undefined },
      true,
    );
    expect(anon).toContain('Name:     Unknown');
    expect(anon).toContain('Username: unknown');
  });
});

describe('formatFeedbackSubject', () => {
  const base: FeedbackPayload = {
    ...valid,
    category: 'bug',
    submitterName: 'Stephen Phillips',
    submitterUsername: 'stephen',
  };

  it('is "GS Feedback: <first name> - <Category>"', () => {
    expect(formatFeedbackSubject(base)).toBe('GS Feedback: Stephen - Bug');
  });

  it.each([
    ['idea', 'GS Feedback: Stephen - Idea'],
    ['question', 'GS Feedback: Stephen - Question'],
    ['other', 'GS Feedback: Stephen - Other'],
  ] as const)('capitalizes category %s', (category, expected) => {
    expect(formatFeedbackSubject({ ...base, category })).toBe(expected);
  });

  it('uses only the FIRST name, not the full name', () => {
    expect(formatFeedbackSubject({ ...base, submitterName: 'Mary Jane Watson' })).toBe(
      'GS Feedback: Mary - Bug',
    );
  });

  it('never renders an empty name slot', () => {
    // A blank/absent name previously would have produced "GS Feedback:  - Bug".
    expect(formatFeedbackSubject({ ...base, submitterName: '   ' })).toBe(
      'GS Feedback: stephen - Bug',
    );
    expect(
      formatFeedbackSubject({ ...base, submitterName: undefined, submitterUsername: undefined }),
    ).toBe('GS Feedback: Unknown - Bug');
  });
});
