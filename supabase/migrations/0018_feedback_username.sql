-- Gospel Central — 0018 feedback.submitter_username
-- The notification email now leads with Name / Username / Subject / Category /
-- Message (user request 2026-07-19). Username was never captured: 0016 stored
-- submitter_id (an opaque uuid) and submitter_name, neither of which tells you
-- which ACCOUNT to look up when triaging.
--
-- Nullable with no default and no backfill: rows written before this migration
-- genuinely did not carry a username, and inventing one would misattribute a
-- submission. Self-asserted like every other submitter_* column — see the 0016
-- header for why (mock mode has no Supabase session to verify against).
--
-- Apply: node scripts/sbq.mjs --file supabase/migrations/0018_feedback_username.sql --tx
-- Idempotent (add column if not exists).

alter table public.feedback add column if not exists submitter_username text;

comment on column public.feedback.submitter_username is
  'Self-asserted login name of the submitter. NULL for rows written before 0018.';
