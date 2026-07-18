-- Gospel Central — 0016 feedback: member-submitted feedback from Settings.
-- Phase 7 carry-forward (overhaul plan Decision 7). The Settings "Send Feedback"
-- card shipped toast-only with delivery deferred: it told the user "your feedback
-- was received" while sending nothing anywhere. This table is the durable sink.
--
-- Enforcement model: writes arrive ONLY through the server route
-- src/app/api/feedback/route.ts using the SERVICE-ROLE key (RLS bypassed). Prod
-- runs the in-bundle MSW mock and has no Supabase session to authenticate against,
-- so there is deliberately NO insert policy here — no browser-held key can write to
-- this table, and no one can edit or erase a submission after the fact. Reads are
-- overseer/dev only: feedback may name a person, so it is NOT audit-log material
-- (the audit log is readable, searchable and CSV-exportable by Branch-Leader+).
--
-- submitter_* is SELF-ASSERTED. In mock mode the browser holds a mock JWT, not a
-- Supabase session, so identity is unverified metadata — submitter_verified records
-- which it was. Never treat a submitter_verified=false row as an authenticated claim.
--
-- Apply: node scripts/sbq.mjs --file supabase/migrations/0016_feedback.sql --tx
-- Idempotent (create ... if not exists).

set check_function_bodies = off;

-- ============================================================ table
create table if not exists public.feedback (
  id                 uuid primary key default gen_random_uuid(),
  client_request_id  text not null unique,
  category           text not null check (category in ('bug','idea','question','other')),
  subject            text not null check (length(subject) between 1 and 200),
  message            text not null check (length(message) between 1 and 5000),
  submitter_id       text,
  submitter_name     text,
  submitter_role     text,
  submitter_verified boolean not null default false,
  app_version        text,
  page_url           text,
  user_agent         text,
  delivered_email    boolean not null default false,
  created_at         timestamptz not null default now()
);

comment on column public.feedback.client_request_id is
  'Client-minted idempotency key. Unique: a replayed outbox entry conflicts into a no-op instead of duplicating a submission.';
comment on column public.feedback.submitter_verified is
  'False when identity was self-asserted (mock-mode browser JWT). A false row is NOT an authenticated claim.';
comment on column public.feedback.delivered_email is
  'True only if the Resend notification was accepted. False means the row is the sole copy — nothing notified a human.';

create index if not exists feedback_created_at_idx on public.feedback (created_at desc);

-- ============================================================ rls
alter table public.feedback enable row level security;

-- Read: overseer/dev only. No insert/update/delete policy by design — the
-- service-role route is the only writer, and submissions are immutable.
drop policy if exists feedback_select on public.feedback;
create policy feedback_select on public.feedback for select to authenticated
  using (public.auth_role() in ('overseer','dev'));
