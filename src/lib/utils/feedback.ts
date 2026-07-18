/**
 * Feedback — pure payload contract + validation, shared by the client wrapper
 * (src/lib/api/feedback.ts), the server route (src/app/api/feedback/route.ts)
 * and the outbox (src/lib/stores/feedback-queue.ts).
 *
 * Kept dependency-free so the route can validate WITHOUT trusting the client:
 * the browser checks to keep the button honest, the server checks because the
 * browser is not a security boundary. Both run this same code, so the two can
 * never drift apart.
 */

export const FEEDBACK_CATEGORIES = ['bug', 'idea', 'question', 'other'] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

/** Mirrors the length checks in supabase/migrations/0016_feedback.sql. Keep in sync. */
export const SUBJECT_MAX = 200;
export const MESSAGE_MAX = 5000;

export interface FeedbackPayload {
  /** Client-minted idempotency key — a replayed outbox entry must not duplicate. */
  clientRequestId: string;
  category: FeedbackCategory;
  subject: string;
  message: string;
  /** Self-asserted; the server records these as unverified in mock mode. */
  submitterId?: string;
  submitterName?: string;
  submitterRole?: string;
  appVersion?: string;
  pageUrl?: string;
}

export interface FeedbackAccepted {
  id: string;
  createdAt: string;
  /** Which sinks actually accepted it. Both false is impossible — the route 503s. */
  stored: boolean;
  emailed: boolean;
}

export type FeedbackValidation =
  | { ok: true; value: FeedbackPayload }
  | { ok: false; field: string; message: string };

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Validate an untrusted feedback payload. Rejects rather than coerces: a
 * silently-truncated or silently-defaulted submission is exactly the class of
 * "looked like it worked" failure this feature exists to remove.
 */
export function validateFeedbackPayload(input: unknown): FeedbackValidation {
  const body = (input ?? {}) as Record<string, unknown>;

  const clientRequestId = str(body.clientRequestId);
  if (!clientRequestId) {
    return { ok: false, field: 'clientRequestId', message: 'Missing request id' };
  }
  if (clientRequestId.length > 100) {
    return { ok: false, field: 'clientRequestId', message: 'Request id too long' };
  }

  const category = str(body.category);
  if (!(FEEDBACK_CATEGORIES as readonly string[]).includes(category)) {
    return { ok: false, field: 'category', message: 'Unknown category' };
  }

  const subject = str(body.subject);
  if (!subject) return { ok: false, field: 'subject', message: 'Subject is required' };
  if (subject.length > SUBJECT_MAX) {
    return { ok: false, field: 'subject', message: `Subject must be ${SUBJECT_MAX} characters or fewer` };
  }

  const message = str(body.message);
  if (!message) return { ok: false, field: 'message', message: 'Message is required' };
  if (message.length > MESSAGE_MAX) {
    return { ok: false, field: 'message', message: `Message must be ${MESSAGE_MAX} characters or fewer` };
  }

  const optional = (v: unknown, max: number): string | undefined => {
    const s = str(v);
    return s ? s.slice(0, max) : undefined;
  };

  return {
    ok: true,
    value: {
      clientRequestId,
      category: category as FeedbackCategory,
      subject,
      message,
      submitterId: optional(body.submitterId, 100),
      submitterName: optional(body.submitterName, 200),
      submitterRole: optional(body.submitterRole, 50),
      appVersion: optional(body.appVersion, 100),
      pageUrl: optional(body.pageUrl, 500),
    },
  };
}

/**
 * Plain-text email body for the dev notification. Deliberately text/plain, not
 * HTML: the subject and message are user-controlled, and text/plain has no
 * injection surface to get wrong.
 */
export function formatFeedbackEmail(p: FeedbackPayload, stored: boolean): string {
  const identity = p.submitterName
    ? `${p.submitterName}${p.submitterRole ? ` (${p.submitterRole})` : ''}`
    : 'unknown';
  return [
    `Category: ${p.category}`,
    `From:     ${identity}  [SELF-ASSERTED — not an authenticated identity]`,
    `User id:  ${p.submitterId ?? 'unknown'}`,
    `Build:    ${p.appVersion ?? 'unknown'}`,
    `Page:     ${p.pageUrl ?? 'unknown'}`,
    `Stored:   ${stored ? 'yes — public.feedback' : 'NO — this email is the only copy'}`,
    `Ref:      ${p.clientRequestId}`,
    '',
    '---',
    '',
    p.message,
  ].join('\n');
}
