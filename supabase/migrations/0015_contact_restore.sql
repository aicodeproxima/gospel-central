-- 0015_contact_restore.sql
-- Audit-remediation finding 151 (wave 2): contact delete is a soft delete
-- (status='inactive') but NO restore flow existed anywhere — restore RPCs/routes
-- exist for users/areas/rooms/bookings, not contacts. This adds:
--   1. set_contact_active(cid) — inverse of set_contact_inactive (0002), same
--      permission gate.
--   2. audit_row(): the contact branch gains the restore direction
--      (inactive→active → action='restore'), mirroring the booking branch.
--      Re-creates on top of 0013's version (cancel-reason lift preserved).
-- Mock parity: POST /contacts/:id/restore handler added in the same commit.
-- Idempotent (create-or-replace).

create or replace function public.set_contact_active(cid uuid) returns public.contacts
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
  update public.contacts set status='active', updated_at=now() where id=cid returning * into r;
  return r;
end $$;

grant execute on function public.set_contact_active(uuid) to authenticated;

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
  v_reason text := null;
begin
  select coalesce(first_name||' '||last_name, username, 'system')
    into v_actor_name from public.users where id = v_actor;

  if tg_op = 'INSERT' then v_action := 'create';
  elsif tg_op = 'DELETE' then v_action := 'delete';
  else
    v_action := 'update';
    if v_entity = 'booking' then
      if (to_jsonb(new)->>'status') = 'cancelled' and (to_jsonb(old)->>'status') is distinct from 'cancelled' then
        v_action := 'cancel';
        -- cancel_booking(p_reason) persists the actor's explanation on the row;
        -- surface it as the structured audit reason (feeds the Reason row).
        v_reason := nullif(trim(to_jsonb(new)->>'cancel_reason'), '');
      elsif (to_jsonb(old)->>'status') = 'cancelled' and (to_jsonb(new)->>'status') is distinct from 'cancelled' then
        v_action := 'restore';
      end if;
    elsif v_entity = 'contact' then
      -- soft-delete → 'delete'; un-delete → 'restore' (mock parity: the
      -- DELETE and /restore handlers record the same semantic actions)
      if (to_jsonb(new)->>'status') = 'inactive' and (to_jsonb(old)->>'status') is distinct from 'inactive' then
        v_action := 'delete';
      elsif (to_jsonb(old)->>'status') = 'inactive' and (to_jsonb(new)->>'status') is distinct from 'inactive' then
        v_action := 'restore';
      end if;
    end if;
  end if;

  if v_entity = 'contact' then
    v_related := array_remove(array[(v_row->>'created_by')::uuid, (v_row->>'assigned_teacher_id')::uuid], null);
  elsif v_entity = 'booking' then
    v_related := array_remove(array[(v_row->>'created_by')::uuid, (v_row->>'teacher_id')::uuid], null);
  elsif v_entity = 'user' then
    v_related := array_remove(array[(v_row->>'id')::uuid], null);
  end if;

  insert into public.audit_log(action, entity_type, entity_id, user_id, user_name, details, reason, before, after, related_user_ids)
  values (
    v_action, v_entity, v_id, v_actor, coalesce(v_actor_name,'system'),
    v_entity || ' ' || v_action,
    v_reason,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end,
    v_related
  );
  return coalesce(new, old);
end $$;
