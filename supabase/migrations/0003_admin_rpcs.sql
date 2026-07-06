-- Gospel Central — 0003 admin auth RPCs (create_user, reset_password).
-- These are the operations that need to touch auth.users, which the plan slotted as Edge
-- Functions. Implemented instead as SECURITY DEFINER SQL RPCs using pgcrypto crypt() +
-- an auth.identities row — deployable via the same Management-API path as 0001/0002, no
-- Edge-Function/CLI infra, and validated by a real password login (see the session log).
-- Self-service login + own-password-change go through GoTrue directly in the client
-- (supabase.auth.signInWithPassword / updateUser) — no server code. Login-event audit is
-- captured natively by GoTrue in auth.audit_log_entries; mirroring it into public.audit_log
-- is a deferred nice-to-have (noted at bottom).

set check_function_bodies = off;
create extension if not exists pgcrypto with schema extensions;

-- create_user — canCreateUser (permissions.ts:182-199): leader+, role strictly below own
-- (dev any), BL+ any parent, TL/GL parent must be in own subtree. Creates the auth user
-- (crypt password + identity) so on_auth_user_created seeds the profile from metadata.
create or replace function public.create_user(p jsonb)
  returns public.users
  language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  v_role user_role := (p->>'role')::user_role;
  v_parent uuid := (p->>'parent_id')::uuid;
  v_id uuid := gen_random_uuid();
  r public.users;
begin
  -- permission gate
  if not public.is_leader() then raise exception 'PERMISSION_DENIED' using errcode='P0001'; end if;
  if public.auth_role() <> 'dev' then
    if public.role_level(v_role) >= public.auth_level() then
      raise exception 'PERMISSION_DENIED: cannot create at or above own level' using errcode='P0001';
    end if;
    if not public.is_admin_tier() then
      -- TL/GL: the new user's parent must be self or within the caller's subtree
      if v_parent is not null and v_parent <> auth.uid()
         and v_parent not in (select public.subtree_user_ids(auth.uid())) then
        raise exception 'PERMISSION_DENIED: parent outside your subtree' using errcode='P0001';
      end if;
    end if;
  end if;

  if p->>'email' is null or p->>'password' is null or p->>'username' is null then
    raise exception 'MISSING_FIELDS: email, password, username required' using errcode='P0001';
  end if;

  -- The token columns MUST be '' not NULL: GoTrue scans them into non-nullable Go
  -- strings and a NULL breaks the password-login lookup ("invalid credentials").
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                          confirmation_token, recovery_token, email_change, email_change_token_new)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', p->>'email',
          extensions.crypt(p->>'password', extensions.gen_salt('bf')), now(), now(), now(),
          '{"provider":"email","providers":["email"]}'::jsonb,
          jsonb_strip_nulls(jsonb_build_object(
            'username', p->>'username', 'first_name', p->>'first_name', 'last_name', p->>'last_name',
            'role', p->>'role', 'gender', p->>'gender', 'parent_id', p->>'parent_id',
            'group_id', p->>'group_id', 'location_id', p->>'location_id',
            'must_change_password', coalesce(p->>'must_change_password','true'))
          ) || jsonb_build_object('tags', coalesce(p->'tags','[]'::jsonb)),
          '', '', '', '');

  -- NB: auth.identities.email is a GENERATED column (derived from identity_data->>'email')
  -- in this GoTrue version — must NOT be in the insert column list.
  insert into auth.identities (provider_id, user_id, identity_data, provider,
                               last_sign_in_at, created_at, updated_at)
  values (v_id::text, v_id, jsonb_build_object('sub', v_id::text, 'email', p->>'email'),
          'email', now(), now(), now());

  select * into r from public.users where id = v_id;   -- seeded by on_auth_user_created
  return r;
end $$;

-- reset_user_password — canResetPassword (permissions.ts:159-163): NOT self, else canEditUser.
-- Sets a new password and flags must_change_password so the user is forced to rotate it.
create or replace function public.reset_user_password(target uuid, new_password text)
  returns void
  language plpgsql security definer set search_path = public, auth, extensions as $$
declare t public.users;
begin
  if target = auth.uid() then raise exception 'PERMISSION_DENIED: use change-own-password' using errcode='P0001'; end if;
  select * into t from public.users where id = target;
  if t.id is null then raise exception 'NOT_FOUND' using errcode='P0001'; end if;
  -- canEditUser: leader+, target at/below own level, only dev edits dev
  if not ( public.auth_level() >= 1
           and public.role_level(t.role) <= public.auth_level()
           and (t.role <> 'dev' or public.auth_role() = 'dev') ) then
    raise exception 'PERMISSION_DENIED' using errcode='P0001';
  end if;
  if length(coalesce(new_password,'')) < 6 then raise exception 'WEAK_PASSWORD' using errcode='P0001'; end if;
  update auth.users set encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf')),
                        updated_at = now() where id = target;
  update public.users set must_change_password = true, updated_at = now() where id = target;
end $$;

grant execute on function public.create_user(jsonb), public.reset_user_password(uuid, text) to authenticated;

-- DEFERRED (login-event audit): GoTrue already records sign-in / sign-out / failures in
-- auth.audit_log_entries. A trigger mirroring the login/logout rows into public.audit_log
-- (action login/login_failed) can be added later; not required for the app to function.
