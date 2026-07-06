-- Gospel Central — 0002 logic: triggers (conflict, audit, side-effects) + privileged RPCs.
-- Depends on 0001. Triggers are the UNBYPASSABLE core: they fire for every writer incl.
-- SECURITY DEFINER RPCs and the service role.
--
-- NOTE — three operations are NOT pure-DB and live as Edge Functions (0003, service key +
-- Auth admin API), because they must create/modify auth.users or emit auth-event audit:
--   * create_user (auth.admin.createUser + metadata -> handle_new_user seeds profile)
--   * reset_password / change_password (auth admin; NEVER log the temp password)
--   * login_success / login_failed audit (Supabase Auth hook)
-- Everything else is below.

set check_function_bodies = off;

-- ============================================================ booking conflict guard
-- "No one overrides a blocked slot" (PERMISSIONS.md:246) + room/teacher double-booking.
-- Runs BEFORE INSERT/UPDATE for EVERY role incl. Dev. Cancelled bookings free the slot.
-- TZ note: weekly blocked slots compare on the booking's timestamptz dow/time; confirm
-- the session TZ matches how slots were authored (America/New_York) during wiring.
create or replace function public.booking_conflict_guard() returns trigger
  language plpgsql as $$
declare v_dow int; v_start time; v_end time;
begin
  if new.status = 'cancelled' then return new; end if;

  -- blocked-slot overlap (global or same-area, active)
  v_dow   := extract(dow from new.start_time)::int;
  v_start := new.start_time::time;
  v_end   := new.end_time::time;
  if exists (
    select 1 from public.blocked_slots b
    where b.is_active
      and (b.scope = 'global' or b.area_id = new.area_id)
      and (
        (b.recurrence = 'weekly'  and b.day_of_week = v_dow
           and b.start_time < v_end and b.end_time > v_start)
        or
        (b.recurrence = 'one-off' and b.start_datetime < new.end_time
           and b.end_datetime > new.start_time)
      )
  ) then
    raise exception 'BLOCKED_SLOT_CONFLICT: booking overlaps a blocked slot'
      using errcode = 'P0001';
  end if;

  -- room double-booking (any other non-cancelled booking, same room, overlapping)
  if exists (
    select 1 from public.bookings x
    where x.id <> new.id and x.room_id = new.room_id and x.status <> 'cancelled'
      and x.start_time < new.end_time and x.end_time > new.start_time
  ) then
    raise exception 'ROOM_CONFLICT: room already booked for that time'
      using errcode = 'P0001';
  end if;

  -- teacher double-booking across areas
  if new.teacher_id is not null and exists (
    select 1 from public.bookings x
    where x.id <> new.id and x.teacher_id = new.teacher_id and x.status <> 'cancelled'
      and x.start_time < new.end_time and x.end_time > new.start_time
  ) then
    raise exception 'TEACHER_CONFLICT: teacher already booked for that time'
      using errcode = 'P0001';
  end if;

  return new;
end $$;
create trigger bookings_conflict_guard before insert or update on public.bookings
  for each row execute function public.booking_conflict_guard();

-- teacher_id must reference an active user carrying the 'teacher' tag (booking leadership)
create or replace function public.booking_teacher_tag_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.teacher_id is not null and not exists (
    select 1 from public.users u
    where u.id = new.teacher_id and u.is_active and u.tags @> array['teacher']
  ) then
    raise exception 'INVALID_TEACHER: assigned teacher must be active and carry the teacher tag'
      using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger bookings_teacher_tag_guard before insert or update on public.bookings
  for each row execute function public.booking_teacher_tag_guard();

-- ============================================================ audit emission (H-01)
-- Generic AFTER trigger. SECURITY DEFINER => writes audit_log despite its append-only RLS.
-- TG_ARGV[0] = entity_type. related_user_ids computed per entity for the alerts feed.
create or replace function public.audit_row() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_action audit_action;
  v_entity audit_entity := tg_argv[0]::audit_entity;
  v_row jsonb := to_jsonb(coalesce(new, old));
  v_id text := coalesce((v_row->>'id'), '');
  v_related uuid[] := '{}';
begin
  select coalesce(first_name||' '||last_name, username, 'system')
    into v_actor_name from public.users where id = v_actor;

  if tg_op = 'INSERT' then v_action := 'create';
  elsif tg_op = 'DELETE' then v_action := 'delete';
  else
    -- 'update' by default; only bookings carry cancel/restore. Compare status via
    -- JSON text, NOT new.status/old.status — those are the row's own enum type, so a
    -- literal 'cancelled' would be coerced to e.g. contact_status and throw on non-
    -- booking tables (this trigger is generic across 7 tables).
    v_action := 'update';
    if v_entity = 'booking' then
      if (to_jsonb(new)->>'status') = 'cancelled' and (to_jsonb(old)->>'status') is distinct from 'cancelled' then
        v_action := 'cancel';
      elsif (to_jsonb(old)->>'status') = 'cancelled' and (to_jsonb(new)->>'status') is distinct from 'cancelled' then
        v_action := 'restore';
      end if;
    end if;
  end if;

  -- affected users for the per-user alerts feed
  if v_entity = 'contact' then
    v_related := array_remove(array[(v_row->>'created_by')::uuid, (v_row->>'assigned_teacher_id')::uuid], null);
  elsif v_entity = 'booking' then
    v_related := array_remove(array[(v_row->>'created_by')::uuid, (v_row->>'teacher_id')::uuid], null);
  elsif v_entity = 'user' then
    v_related := array_remove(array[(v_row->>'id')::uuid], null);
  end if;

  insert into public.audit_log(action, entity_type, entity_id, user_id, user_name, details, before, after, related_user_ids)
  values (
    v_action, v_entity, v_id, v_actor, coalesce(v_actor_name,'system'),
    v_entity || ' ' || v_action,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end,
    v_related
  );
  return coalesce(new, old);
end $$;

create trigger audit_users    after insert or update or delete on public.users        for each row execute function public.audit_row('user');
create trigger audit_contacts after insert or update or delete on public.contacts     for each row execute function public.audit_row('contact');
create trigger audit_bookings after insert or update or delete on public.bookings     for each row execute function public.audit_row('booking');
create trigger audit_blocked  after insert or update or delete on public.blocked_slots for each row execute function public.audit_row('blocked_slot');
create trigger audit_rooms    after insert or update or delete on public.rooms        for each row execute function public.audit_row('room');
create trigger audit_areas    after insert or update or delete on public.areas        for each row execute function public.audit_row('area');
create trigger audit_groups   after insert or update or delete on public.groups       for each row execute function public.audit_row('group');

-- ============================================================ contact study side-effects
-- When a bible-study booking with a contact flips to Completed, advance the contact's
-- study fields (mirrors the mock's CONT-6). AFTER UPDATE on bookings.
create or replace function public.booking_completion_sideeffect() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed' and coalesce(old.status,'') <> 'completed'
     and new.contact_id is not null
     and new.type in ('unbaptized_contact','baptized_persecuted','unbaptized_zoom','baptized_in_person','baptized_zoom')
  then
    update public.contacts c set
      total_sessions = c.total_sessions + 1,
      last_session_date = new.start_time::date,
      currently_studying = true,
      subjects_studied = (
        select array(select distinct e from unnest(c.subjects_studied || new.subjects_studied) e where e is not null)
      ),
      updated_at = now()
    where c.id = new.contact_id;
  end if;
  return new;
end $$;
create trigger bookings_completion_sideeffect after update on public.bookings
  for each row execute function public.booking_completion_sideeffect();

-- ============================================================ privileged RPCs
-- Each re-checks its permission helper server-side (C-01) then acts. SECURITY DEFINER so
-- they can touch privileged columns / RPC-only tables; the triggers above still fire.

-- create a contact (canCreateContact: self | admin-tier | leader-with-owner-in-subtree)
create or replace function public.create_contact(p jsonb) returns public.contacts
  language plpgsql security definer set search_path = public as $$
declare v_owner uuid := coalesce((p->>'created_by')::uuid, auth.uid()); r public.contacts;
begin
  if not (
    v_owner = auth.uid() or public.is_admin_tier()
    or (public.is_leader() and v_owner in (select public.subtree_user_ids(auth.uid())))
  ) then raise exception 'PERMISSION_DENIED' using errcode='P0001'; end if;

  insert into public.contacts(first_name,last_name,email,phone,address,group_name,type,status,pipeline_stage,
                              assigned_teacher_id,preaching_partner_ids,notes,created_by)
  select p->>'first_name', p->>'last_name', p->>'email', p->>'phone', p->>'address', p->>'group_name',
         (p->>'type')::booking_type, coalesce((p->>'status')::contact_status,'active'),
         coalesce((p->>'pipeline_stage')::pipeline_stage,'first_study'),
         (p->>'assigned_teacher_id')::uuid,
         coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p->'preaching_partner_ids') x),'{}'),
         p->>'notes', v_owner
  returning * into r;
  return r;
end $$;

-- soft-delete a contact (C-04): canEditContact, then status='inactive' (never hard delete)
create or replace function public.set_contact_inactive(cid uuid) returns public.contacts
  language plpgsql security definer set search_path = public as $$
declare c public.contacts; r public.contacts;
begin
  select * into c from public.contacts where id = cid;
  if c.id is null then raise exception 'NOT_FOUND' using errcode='P0001'; end if;
  if not (
    public.auth_role() in ('overseer','dev')
    or (public.auth_level()=0 and c.created_by = auth.uid())
    or c.created_by = auth.uid()
    or c.created_by in (select public.subtree_user_ids(auth.uid()))
    or (c.assigned_teacher_id is not null and c.assigned_teacher_id in (select public.subtree_user_ids(auth.uid())))
  ) then raise exception 'PERMISSION_DENIED' using errcode='P0001'; end if;
  update public.contacts set status='inactive', updated_at=now() where id=cid returning * into r;
  return r;
end $$;

-- create a booking (every role may create own; conflict trigger enforces slots)
create or replace function public.create_booking(p jsonb) returns public.bookings
  language plpgsql security definer set search_path = public as $$
declare r public.bookings;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED' using errcode='P0001'; end if;
  insert into public.bookings(room_id,area_id,type,activity,subject,title,description,start_time,end_time,
                              created_by,teacher_id,contact_id,participants)
  values ((p->>'room_id')::uuid,(p->>'area_id')::uuid,(p->>'type')::booking_type,
          (p->>'activity')::activity,p->>'subject',p->>'title',p->>'description',
          (p->>'start_time')::timestamptz,(p->>'end_time')::timestamptz,
          auth.uid(),(p->>'teacher_id')::uuid,(p->>'contact_id')::uuid,
          coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p->'participants') x),'{}'))
  returning * into r;
  return r;
end $$;

-- cancel a booking (canEditBooking)
create or replace function public.cancel_booking(bid uuid, p_reason text) returns public.bookings
  language plpgsql security definer set search_path = public as $$
declare b public.bookings; r public.bookings;
begin
  select * into b from public.bookings where id=bid;
  if b.id is null then raise exception 'NOT_FOUND' using errcode='P0001'; end if;
  if not (
    b.created_by=auth.uid() or b.teacher_id=auth.uid() or public.is_admin_tier()
    or b.created_by in (select public.subtree_user_ids(auth.uid()))
    or (b.teacher_id is not null and b.teacher_id in (select public.subtree_user_ids(auth.uid())))
  ) then raise exception 'PERMISSION_DENIED' using errcode='P0001'; end if;
  update public.bookings set status='cancelled', cancelled_at=now(), cancel_reason=p_reason,
    cancelled_by=auth.uid(), updated_at=now() where id=bid returning * into r;
  return r;
end $$;

-- change a user's role (canChangeRole: editable target + newRole strictly below own level, dev any)
create or replace function public.change_user_role(target uuid, new_role user_role) returns public.users
  language plpgsql security definer set search_path = public as $$
declare t public.users; r public.users;
begin
  select * into t from public.users where id=target;
  if t.id is null then raise exception 'NOT_FOUND' using errcode='P0001'; end if;
  -- canEditUser
  if not ( target<>auth.uid() and public.auth_level()>=1
           and public.role_level(t.role) <= public.auth_level()
           and (t.role<>'dev' or public.auth_role()='dev') )
    then raise exception 'PERMISSION_DENIED' using errcode='P0001'; end if;
  -- canChangeRole: dev any; else newRole strictly below own level
  if not ( public.auth_role()='dev' or public.role_level(new_role) < public.auth_level() )
    then raise exception 'PERMISSION_DENIED' using errcode='P0001'; end if;
  update public.users set role=new_role where id=target returning * into r;
  return r;
end $$;

-- set a user's tags (canManageTags: NOT self, else canEditUser)
create or replace function public.set_user_tags(target uuid, new_tags text[]) returns public.users
  language plpgsql security definer set search_path = public as $$
declare t public.users; r public.users;
begin
  if target = auth.uid() then raise exception 'PERMISSION_DENIED' using errcode='P0001'; end if;  -- no self-tag
  select * into t from public.users where id=target;
  if t.id is null then raise exception 'NOT_FOUND' using errcode='P0001'; end if;
  if not ( public.auth_level()>=1 and public.role_level(t.role) <= public.auth_level()
           and (t.role<>'dev' or public.auth_role()='dev') )
    then raise exception 'PERMISSION_DENIED' using errcode='P0001'; end if;
  update public.users set tags=new_tags where id=target returning * into r;
  return r;
end $$;

-- teacher metrics — closes KO-3: guard on can_access_reports (Branch Leader+),
-- scope rows to the manageable subtree for BL, all for Overseer/Dev.
create or replace function public.teacher_metrics()
  returns table(user_id uuid, total_students int, currently_studying int, total_sessions_led int)
  language sql stable security definer set search_path = public as $$
  with scope as (
    select case when public.auth_level() >= 4 then null   -- overseer/dev: all
                else array(select public.subtree_user_ids(auth.uid())) end as ids
  )
  select u.id,
    (select count(*) from public.contacts c where c.assigned_teacher_id = u.id)::int,
    (select count(*) from public.contacts c where c.assigned_teacher_id = u.id and c.currently_studying)::int,
    (select count(*) from public.bookings b where b.teacher_id = u.id and b.status = 'completed')::int
  from public.users u, scope s
  where public.can_access_reports()                        -- else zero rows (RPC also pre-checks below)
    and u.tags @> array['teacher']
    and (s.ids is null or u.id = any(s.ids))
$$;
-- Wrapper that hard-fails (not just empty) for a non-Reports caller, matching the 403 contract.
create or replace function public.teacher_metrics_guarded()
  returns table(user_id uuid, total_students int, currently_studying int, total_sessions_led int)
  language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_access_reports() then raise exception 'PERMISSION_DENIED' using errcode='P0001'; end if;
  return query select * from public.teacher_metrics();
end $$;

-- ============================================================ execute grants
grant execute on function
  public.create_contact(jsonb), public.set_contact_inactive(uuid),
  public.create_booking(jsonb), public.cancel_booking(uuid,text),
  public.change_user_role(uuid,user_role), public.set_user_tags(uuid,text[]),
  public.teacher_metrics_guarded()
to authenticated;
-- The plain teacher_metrics() is internal; only the guarded wrapper is client-callable.

-- ============================================================ still-to-scaffold (0003)
-- Edge Functions (service key): create_user (auth.admin.createUser + metadata),
--   reset_password/change_password, login_success/login_failed audit hooks.
-- RPCs: create_group_node / rename_group / deactivate_group (L-01 own-branch),
--   reassign_user_to_group, convert_contact, reassign_contact, export gates
--   (canExportImport Decision-13 floor), resolve_export_import (nearest-ancestor override).
