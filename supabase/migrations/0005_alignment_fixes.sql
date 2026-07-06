-- Gospel Central — 0005 alignment fixes (FE↔BE cutover, Phase A).
-- Closes gaps found by the 3-agent alignment scan + live grant introspection:
--   * CRITICAL: authenticated had UPDATE on ALL columns of users/contacts (Supabase
--     default GRANT ALL), and the self-update RLS policy doesn't restrict columns, so a
--     member could PATCH their own role/tags/parent_id → self-escalation. Lock down.
--   * DELETE/TRUNCATE granted to authenticated on every table + FOR ALL policies on
--     areas/rooms/tag_definitions → real client hard-delete/cascade. Revoke + narrow.
--   * Missing change_username / deactivate_user RPCs (username/is_active are RPC-only).
--   * booking_conflict_guard extracted dow/time under the session TZ (UTC), not the ET
--     the slots were authored in → a "no one overrides a blocked slot" bypass.
-- Depends on 0001–0004.

set check_function_bodies = off;

-- ============================================================ A. privilege lockdown
-- Column-restrict UPDATE (RPCs are SECURITY DEFINER and bypass these grants, so role/
-- tags/username/parent_id/is_active mutations still work via their RPCs).
revoke update on public.users from authenticated;
grant  update (first_name, last_name, phone, avatar_url, gender) on public.users to authenticated;

revoke update on public.contacts from authenticated;
grant  update (first_name, last_name, email, phone, address, group_name, type, status,
               pipeline_stage, notes, current_step, current_subject, currently_studying,
               subjects_studied, last_session_date, total_sessions, preaching_partner_ids,
               retain_until) on public.contacts to authenticated;
-- created_by / assigned_teacher_id withheld → reassignment must use reassign_contact RPC.

-- Never allow client hard-delete or truncate anywhere: everything is soft-delete via
-- RPC or an is_active/status UPDATE. (RLS already denied most; this is defense-in-depth.)
revoke delete, truncate on all tables in schema public from authenticated;
revoke delete, truncate on all tables in schema public from anon;

-- ============================================================ B. FOR ALL -> explicit
-- Drop the catch-all write policies (which implied DELETE) and re-express as INSERT+UPDATE.
drop policy if exists areas_write on public.areas;
create policy areas_insert on public.areas for insert to authenticated with check (public.is_admin_tier());
create policy areas_update on public.areas for update to authenticated using (public.is_admin_tier()) with check (public.is_admin_tier());

drop policy if exists rooms_write on public.rooms;
create policy rooms_insert on public.rooms for insert to authenticated with check (public.is_admin_tier());
create policy rooms_update on public.rooms for update to authenticated using (public.is_admin_tier()) with check (public.is_admin_tier());

drop policy if exists tagdef_write on public.tag_definitions;
create policy tagdef_insert on public.tag_definitions for insert to authenticated with check (public.auth_level() >= 4);
create policy tagdef_update on public.tag_definitions for update to authenticated using (public.auth_level() >= 4) with check (public.auth_level() >= 4);

-- ============================================================ C. missing RPCs
-- Username is RPC-only. canChangeOwnUsername = universal; canChangeUsername(others) =
-- Overseer+ only, and only Dev may rename an Overseer+ (SEC-4). Enforce regex + uniqueness.
create or replace function public.change_own_username(new_name text) returns public.users
  language plpgsql security definer set search_path = public as $$
declare r public.users;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED' using errcode='P0001'; end if;
  if new_name !~ '^[a-z0-9_.-]{3,32}$' then raise exception 'INVALID_USERNAME' using errcode='P0001'; end if;
  if exists (select 1 from public.users where username = new_name and id <> auth.uid())
    then raise exception 'USERNAME_TAKEN' using errcode='P0001'; end if;
  update public.users set username = new_name where id = auth.uid() returning * into r;
  return r;
end $$;

create or replace function public.change_username(target uuid, new_name text) returns public.users
  language plpgsql security definer set search_path = public as $$
declare t public.users; r public.users;
begin
  if target = auth.uid() then return public.change_own_username(new_name); end if;
  select * into t from public.users where id = target;
  if t.id is null then raise exception 'NOT_FOUND' using errcode='P0001'; end if;
  if public.auth_level() < 4 then raise exception 'PERMISSION_DENIED' using errcode='P0001'; end if;      -- Overseer+ to rename others
  if public.role_level(t.role) >= 4 and public.auth_role() <> 'dev'
    then raise exception 'PERMISSION_DENIED' using errcode='P0001'; end if;                                -- only Dev renames Overseer+
  if not (public.role_level(t.role) <= public.auth_level() and (t.role <> 'dev' or public.auth_role()='dev'))
    then raise exception 'PERMISSION_DENIED' using errcode='P0001'; end if;                                -- canEditUser
  if new_name !~ '^[a-z0-9_.-]{3,32}$' then raise exception 'INVALID_USERNAME' using errcode='P0001'; end if;
  if exists (select 1 from public.users where username = new_name and id <> target)
    then raise exception 'USERNAME_TAKEN' using errcode='P0001'; end if;
  update public.users set username = new_name where id = target returning * into r;
  return r;
end $$;

-- Soft-delete a user: canDeactivateUser = NOT self, then canEditUser.
create or replace function public.deactivate_user(target uuid) returns public.users
  language plpgsql security definer set search_path = public as $$
declare t public.users; r public.users;
begin
  if target = auth.uid() then raise exception 'PERMISSION_DENIED' using errcode='P0001'; end if;           -- no self-deactivate
  select * into t from public.users where id = target;
  if t.id is null then raise exception 'NOT_FOUND' using errcode='P0001'; end if;
  if not (public.auth_level() >= 1 and public.role_level(t.role) <= public.auth_level()
          and (t.role <> 'dev' or public.auth_role()='dev'))
    then raise exception 'PERMISSION_DENIED' using errcode='P0001'; end if;
  update public.users set is_active = false where id = target returning * into r;
  return r;
end $$;

create or replace function public.restore_user(target uuid) returns public.users
  language plpgsql security definer set search_path = public as $$
declare t public.users; r public.users;
begin
  select * into t from public.users where id = target;
  if t.id is null then raise exception 'NOT_FOUND' using errcode='P0001'; end if;
  if not (public.auth_level() >= 1 and public.role_level(t.role) <= public.auth_level()
          and (t.role <> 'dev' or public.auth_role()='dev'))
    then raise exception 'PERMISSION_DENIED' using errcode='P0001'; end if;
  update public.users set is_active = true where id = target returning * into r;
  return r;
end $$;

grant execute on function public.change_own_username(text), public.change_username(uuid,text),
  public.deactivate_user(uuid), public.restore_user(uuid) to authenticated;

-- ============================================================ D. booking-conflict TZ fix
-- Extract dow/time in the authoring timezone (America/New_York), NOT the session TZ.
-- `timestamptz at time zone 'America/New_York'` yields the ET wall-clock timestamp.
create or replace function public.booking_conflict_guard() returns trigger
  language plpgsql as $$
declare v_dow int; v_start time; v_end time; tz constant text := 'America/New_York';
begin
  if new.status = 'cancelled' then return new; end if;
  v_dow   := extract(dow from (new.start_time at time zone tz))::int;
  v_start := (new.start_time at time zone tz)::time;
  v_end   := (new.end_time   at time zone tz)::time;
  if exists (
    select 1 from public.blocked_slots b
    where b.is_active and (b.scope='global' or b.area_id=new.area_id)
      and ((b.recurrence='weekly'  and b.day_of_week=v_dow and b.start_time < v_end and b.end_time > v_start)
        or (b.recurrence='one-off' and b.start_datetime < new.end_time and b.end_datetime > new.start_time))
  ) then raise exception 'BLOCKED_SLOT_CONFLICT: booking overlaps a blocked slot' using errcode='P0001'; end if;
  if exists (
    select 1 from public.bookings x where x.id<>new.id and x.room_id=new.room_id and x.status<>'cancelled'
      and x.start_time < new.end_time and x.end_time > new.start_time
  ) then raise exception 'ROOM_CONFLICT: room already booked for that time' using errcode='P0001'; end if;
  if new.teacher_id is not null and exists (
    select 1 from public.bookings x where x.id<>new.id and x.teacher_id=new.teacher_id and x.status<>'cancelled'
      and x.start_time < new.end_time and x.end_time > new.start_time
  ) then raise exception 'TEACHER_CONFLICT: teacher already booked for that time' using errcode='P0001'; end if;
  return new;
end $$;

-- NOTE (Phase B): RPC raise-messages are already ApiErrorCode tokens (PERMISSION_DENIED,
-- BLOCKED_SLOT_CONFLICT, ROOM_CONFLICT, TEACHER_CONFLICT, USERNAME_TAKEN, NOT_FOUND,
-- UNAUTHORIZED, INVALID_TEACHER, INVALID_USERNAME) carried on PG errcode P0001 → the
-- frontend supabase adapter maps `P0001` + message-prefix → the ApiErrorCode union.
