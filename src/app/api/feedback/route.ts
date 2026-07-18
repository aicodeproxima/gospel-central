// POST /api/feedback — the ONLY real (non-mock) write surface in the app.
//
// WHY THIS IS NOT AN MSW HANDLER, AND MUST NEVER BECOME ONE:
// prod runs the in-bundle MSW mock (NEXT_PUBLIC_MOCK_API=true), which patches
// window.fetch in-page. A `/feedback` entry in src/mocks/handlers.ts would be
// answered IN THE BROWSER and would never reach a server — feedback would land in
// a module-scope array that is wiped on the next page reload and read by nobody.
// That is the exact bug this route exists to fix, so the path is deliberately
// absent from the mock handlers: src/mocks/browser.ts:58 passes unmatched requests
// through to the network, and a specific route segment outranks the
// src/app/api/[...path] catch-all (which hard-404s under IS_MOCK). Net effect: this
// runs server-side in BOTH mock and real mode, and survives the prod flip untouched.
//
// IDENTITY IS SELF-ASSERTED. In mock mode the browser holds `mock-jwt-token-<id>`,
// not a Supabase session, so there is nothing to verify against. The submitter
// fields are recorded as unverified metadata (submitter_verified=false) and labelled
// that way in the email. Never treat them as an authenticated claim.
//
// HONESTY CONTRACT: this route returns 2xx only when at least one sink actually
// accepted the submission. A misconfigured deploy 503s rather than returning a
// success the UI would turn into "your feedback was received".

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  validateFeedbackPayload,
  formatFeedbackEmail,
  type FeedbackPayload,
} from '@/lib/utils/feedback';

export const dynamic = 'force-dynamic';

/** Postgres unique_violation — the idempotency key already landed. */
const PG_UNIQUE_VIOLATION = '23505';

/**
 * Best-effort burst guard, per warm serverless instance. This is NOT real rate
 * limiting — instances are ephemeral and horizontally scaled, so a determined
 * flood walks straight past it. It exists to stop a runaway client loop from
 * emailing us 500 times, and is documented as weak rather than pretended strong.
 * A real limit belongs at the edge (Vercel WAF) if this ever gets abused.
 */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;
const recentHits: number[] = [];

function rateLimited(): boolean {
  const now = Date.now();
  while (recentHits.length && now - recentHits[0] > RATE_WINDOW_MS) recentHits.shift();
  if (recentHits.length >= RATE_MAX) return true;
  recentHits.push(now);
  return false;
}

function fail(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ message, code, details }, { status });
}

/**
 * Store to public.feedback with the service-role key (RLS bypassed — see the
 * migration header for why there is no insert policy). Returns the row id, or
 * null when Supabase isn't configured for this deploy.
 *
 * A duplicate clientRequestId is a SUCCESS, not an error: the outbox replays, and
 * replaying a write that already landed must be a no-op rather than a second row.
 */
async function store(
  p: FeedbackPayload,
  emailed: boolean,
): Promise<{ id: string; createdAt: string } | null> {
  // Server-only SUPABASE_URL first, falling back to the public one used by the
  // real-mode client. Prefer the server-only name so a mock-mode prod deploy can
  // reach the database WITHOUT adding a NEXT_PUBLIC_ var — those are inlined into
  // the client bundle, and this route has no business changing what ships there.
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await db
    .from('feedback')
    .insert({
      client_request_id: p.clientRequestId,
      category: p.category,
      subject: p.subject,
      message: p.message,
      submitter_id: p.submitterId ?? null,
      submitter_name: p.submitterName ?? null,
      submitter_role: p.submitterRole ?? null,
      // Always false today: no deploy authenticates the submitter against
      // Supabase. Flip this only when a verified session actually backs it.
      submitter_verified: false,
      app_version: p.appVersion ?? null,
      page_url: p.pageUrl ?? null,
      user_agent: null,
      delivered_email: emailed,
    })
    .select('id, created_at')
    .single();

  if (error) {
    if (error.code === PG_UNIQUE_VIOLATION) {
      const { data: existing } = await db
        .from('feedback')
        .select('id, created_at')
        .eq('client_request_id', p.clientRequestId)
        .single();
      if (existing) return { id: existing.id, createdAt: existing.created_at };
      return { id: p.clientRequestId, createdAt: new Date().toISOString() };
    }
    throw new Error(`feedback insert failed: ${error.message}`);
  }
  return { id: data.id, createdAt: data.created_at };
}

/**
 * Notify via Resend's REST API. Called with `fetch` rather than the `resend` SDK
 * on purpose — one less dependency in a repo that already stages 11 local vendor
 * packages by hand. Returns false (never throws) when unconfigured or refused, so
 * a dead mailbox can't sink a submission the table already accepted.
 */
async function notify(p: FeedbackPayload, stored: boolean): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.FEEDBACK_TO_EMAIL;
  if (!key || !to) return false;

  const from = process.env.FEEDBACK_FROM_EMAIL || 'Gospel Central <onboarding@resend.dev>';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `[Gospel Central: ${p.category}] ${p.subject}`,
        // text/plain, never html — subject and message are user-controlled.
        text: formatFeedbackEmail(p, stored),
      }),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (rateLimited()) {
    return fail(429, 'VALIDATION_ERROR', 'Too many submissions — try again in a minute.');
  }

  const body = await request.json().catch(() => undefined);
  const parsed = validateFeedbackPayload(body);
  if (!parsed.ok) {
    return fail(400, 'VALIDATION_ERROR', parsed.message, { field: parsed.field });
  }
  const payload = parsed.value;

  // Email first so the stored row can record whether a human was actually
  // notified; the two sinks are independent on purpose, because prod currently
  // has no Supabase env rows and email is the only live path there.
  const emailed = await notify(payload, false);

  let saved: { id: string; createdAt: string } | null = null;
  let storeError: string | null = null;
  try {
    saved = await store(payload, emailed);
  } catch (err) {
    storeError = err instanceof Error ? err.message : 'unknown store failure';
  }

  if (!saved && !emailed) {
    // Nothing accepted it. Say so plainly — the entire point of this route is
    // that the UI must never claim delivery that did not happen.
    return fail(
      503,
      'UNKNOWN',
      'Feedback delivery is not configured on this deploy — nothing was sent.',
      { stored: false, emailed: false, storeError },
    );
  }

  return NextResponse.json(
    {
      id: saved?.id ?? payload.clientRequestId,
      createdAt: saved?.createdAt ?? new Date().toISOString(),
      stored: Boolean(saved),
      emailed,
    },
    { status: 201 },
  );
}
