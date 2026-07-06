-- Gospel Central — 0008: Phase C observability floor (plan C10).
--   log_login_attempt — login_success/login_failed mirror into public.audit_log,
--                       callable by anon (a failed login has no session).
--   error_log         — destination for ErrorBoundary/WebGLGuard crash reports
--                       (replaces the mock's in-memory /api/error-log buffer).
-- Apply via the Management API (same as 0001–0007):
--   SB_PAT=<sbp_ personal access token> node scripts/sbq.mjs --file supabase/migrations/0008_auth_observability.sql --tx
set check_function_bodies = off;

-- ============================================================ login audit mirror
-- SECURITY DEFINER: audit_log has no INSERT grant (rows normally come from the
-- 0002 audit triggers); this function is the only write path for login events.
-- Abuse surface (anon-executable): inputs are truncated, no caller-controlled
-- ids are trusted — user_id comes ONLY from auth.uid(), and only for successes.
-- GoTrue independently records auth events in auth.audit_log_entries; this
-- mirror exists so the app's own audit surface (and the Alerts feed) sees them.
create or replace function public.log_login_attempt(uname text, success boolean)
  returns void
  language plpgsql security definer set search_path = public as $$
declare
  attempted text := left(coalesce(uname, ''), 64);
  resolved  public.users;
begin
  -- Resolve the attempted username/email to a profile for a friendly user_name.
  select * into resolved from public.users
   where username = attempted or email = attempted or email = attempted || '@diamond.org'
   limit 1;

  insert into public.audit_log (action, entity_type, entity_id, user_id, user_name, details)
  values (
    case when success then 'login'::audit_action else 'login_failed'::audit_action end,
    case when success then 'login_success'::audit_entity else 'login_failed'::audit_entity end,
    coalesce(resolved.id::text, attempted),
    case when success then auth.uid() else null end,   -- never trust the caller for identity
    coalesce(resolved.first_name || ' ' || resolved.last_name, attempted),
    case when success then 'Signed in'
         else 'Failed login attempt for "' || attempted || '"' end
  );
end $$;

revoke all on function public.log_login_attempt(text, boolean) from public;
grant execute on function public.log_login_attempt(text, boolean) to anon, authenticated;

-- ============================================================ error_log
create table if not exists public.error_log (
  id              uuid primary key default gen_random_uuid(),
  at              timestamptz not null default now(),
  user_id         uuid references public.users(id) on delete set null,
  user_role       text,
  username        text,
  url             text,
  message         text not null,
  stack           text,
  component_stack text,
  user_agent      text
);
create index if not exists error_log_at_idx on public.error_log(at desc);

alter table public.error_log enable row level security;

-- Any signed-in user may file a crash report (the boundary wraps the
-- authenticated app; anonymous crashes are dropped by design — see router).
create policy error_log_insert on public.error_log for insert to authenticated
  with check (true);
-- Reading reports is an admin-tier (Branch Leader+) surface, like the audit log.
create policy error_log_select on public.error_log for select to authenticated
  using (public.is_admin_tier());

grant insert, select on public.error_log to authenticated;
