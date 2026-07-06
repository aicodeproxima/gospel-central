-- Gospel Central — 0007: RPCs the frontend write paths need (Phase B gap-closure).
--   set_contact_teacher      — assign a contact's teacher (assigned_teacher_id is not UPDATE-granted)
--   set_export_import_override — per-node export flag (export_import_enabled is not UPDATE-granted)
--   deactivate_user_cascade / restore_user_cascade — subtree soft-delete (mock parity)
--   teacher_metrics(+guarded)  — extended with continued_studying + baptized_since_studying
set check_function_bodies = off;

-- assign a contact's teacher. Gate = canEditContact, and the new teacher must be in the
-- editor's visibility (subtree) or the editor is admin-tier — prevents assigning to arbitrary users.
create or replace function public.set_contact_teacher(cid uuid, teacher uuid) returns public.contacts
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
  if teacher is not null and not (public.is_admin_tier() or teacher in (select public.subtree_user_ids(auth.uid()))) then
    raise exception 'PERMISSION_DENIED' using errcode='P0001';
  end if;
  update public.contacts set assigned_teacher_id = teacher, updated_at = now() where id = cid returning * into r;
  return r;
end $$;

-- per-node export/import override (Decision-13). Admin-tier, own manageable subtree (or overseer/dev all).
create or replace function public.set_export_import_override(node uuid, val boolean) returns public.users
  language plpgsql security definer set search_path = public as $$
declare r public.users;
begin
  if not public.is_admin_tier() then raise exception 'PERMISSION_DENIED' using errcode='P0001'; end if;
  if not (public.auth_level() >= 4 or node in (select public.subtree_user_ids(auth.uid()))) then
    raise exception 'PERMISSION_DENIED' using errcode='P0001';
  end if;
  update public.users set export_import_enabled = val where id = node returning * into r;
  if r.id is null then raise exception 'NOT_FOUND' using errcode='P0001'; end if;
  return r;
end $$;

-- cascade deactivate: target + its whole subtree, stamped with a shared cascade id.
create or replace function public.deactivate_user_cascade(target uuid) returns int
  language plpgsql security definer set search_path = public as $$
declare t public.users; cid text := gen_random_uuid()::text; n int;
begin
  select * into t from public.users where id = target;
  if t.id is null then raise exception 'NOT_FOUND' using errcode='P0001'; end if;
  if target = auth.uid() then raise exception 'PERMISSION_DENIED' using errcode='P0001'; end if;  -- no self
  if not ( public.auth_level()>=1 and public.role_level(t.role) <= public.auth_level()
           and (t.role<>'dev' or public.auth_role()='dev') ) then
    raise exception 'PERMISSION_DENIED' using errcode='P0001'; end if;
  update public.users set is_active=false, deactivated_cascade_id=cid
    where id in (select public.subtree_user_ids(target)) and is_active;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.restore_user_cascade(target uuid) returns int
  language plpgsql security definer set search_path = public as $$
declare cid text; n int;
begin
  select deactivated_cascade_id into cid from public.users where id = target;
  if cid is null then
    update public.users set is_active=true where id = target; return 1;  -- non-cascade restore
  end if;
  update public.users set is_active=true, deactivated_cascade_id=null where deactivated_cascade_id = cid;
  get diagnostics n = row_count;
  return n;
end $$;

-- extended teacher metrics (add continued_studying + baptized_since_studying to match the mock).
drop function if exists public.teacher_metrics_guarded();
drop function if exists public.teacher_metrics();
create function public.teacher_metrics()
  returns table(user_id uuid, total_students int, currently_studying int,
                continued_studying int, baptized_since_studying int, total_sessions_led int)
  language sql stable security definer set search_path = public as $$
  with scope as (
    select case when public.auth_level() >= 4 then null
                else array(select public.subtree_user_ids(auth.uid())) end as ids)
  select u.id,
    (select count(*) from public.contacts c where c.assigned_teacher_id=u.id)::int,
    (select count(*) from public.contacts c where c.assigned_teacher_id=u.id and c.currently_studying)::int,
    (select count(*) from public.contacts c where c.assigned_teacher_id=u.id and c.total_sessions>1)::int,
    (select count(*) from public.contacts c where c.assigned_teacher_id=u.id and c.pipeline_stage='baptized')::int,
    (select count(*) from public.bookings b where b.teacher_id=u.id and b.status='completed')::int
  from public.users u, scope s
  where public.can_access_reports() and u.tags @> array['teacher'] and (s.ids is null or u.id = any(s.ids))
$$;
create function public.teacher_metrics_guarded()
  returns table(user_id uuid, total_students int, currently_studying int,
                continued_studying int, baptized_since_studying int, total_sessions_led int)
  language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_access_reports() then raise exception 'PERMISSION_DENIED' using errcode='P0001'; end if;
  return query select * from public.teacher_metrics();
end $$;

grant execute on function public.set_contact_teacher(uuid,uuid), public.set_export_import_override(uuid,boolean),
  public.deactivate_user_cascade(uuid), public.restore_user_cascade(uuid), public.teacher_metrics_guarded()
to authenticated;
