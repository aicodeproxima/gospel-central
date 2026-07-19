-- Gospel Central — 0017: login username -> auth email resolver (flip-blocker fix).
--   create_user (0003) stores the ADMIN-ENTERED email as the auth identity, but the
--   login route derived it by convention (`${username}@diamond.org`) — every account
--   whose auth email isn't the convention (i.e. every wizard-created account that
--   carried a real email) was locked out with "Invalid credentials". The login route
--   now resolves the real auth email from public.users via this RPC; a fresh login
--   has no session and users_select is authenticated-only, so SECURITY DEFINER is
--   the only read path.
-- Abuse surface (anon-executable, like 0008 log_login_attempt): reveals which
--   usernames exist and their login email. Accepted: seeded emails ARE the public
--   convention (<username>@diamond.org), and wizard-created emails are visible to
--   every leader via the authenticated users_select policy anyway. Input is
--   truncated, exact-match only (no pattern), one row out.
-- Apply via the Management API (same as 0001–0016):
--   SB_PAT=<sbp_ personal access token> node scripts/sbq.mjs --file supabase/migrations/0017_login_email_resolver.sql --tx
set check_function_bodies = off;

create or replace function public.login_email_for_username(uname text)
returns text
language plpgsql security definer set search_path = public as $$
begin
  return (select u.email from public.users u
           where lower(u.username) = lower(left(trim(coalesce(uname, '')), 64))
           limit 1);
end $$;

revoke all on function public.login_email_for_username(text) from public;
grant execute on function public.login_email_for_username(text) to anon, authenticated;
