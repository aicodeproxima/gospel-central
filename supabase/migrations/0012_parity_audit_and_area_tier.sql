-- 0012_parity_audit_and_area_tier.sql
-- Remaining real-backend parity items from the 3AgentScan:
--   * Semantic audit actions to match the mock's Reports action-filter:
--       - contact soft-delete emits action='delete' (was generic 'update')
--       - contact teacher reassign emits an extra action='reassign' row
--         (so real = 'update' [trigger] + 'reassign' [manual], matching the mock's two rows)
--   * area-create tier: Overseer+ only (matches canCreateArea / docs/PERMISSIONS.md),
--     was Branch-Leader+ (is_admin_tier).
-- Idempotent (create-or-replace / drop-create policy).

-- ============================================================ semantic audit actions
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
    v_action := 'update';
    if v_entity = 'booking' then
      if (to_jsonb(new)->>'status') = 'cancelled' and (to_jsonb(old)->>'status') is distinct from 'cancelled' then
        v_action := 'cancel';
      elsif (to_jsonb(old)->>'status') = 'cancelled' and (to_jsonb(new)->>'status') is distinct from 'cancelled' then
        v_action := 'restore';
      end if;
    elsif v_entity = 'contact' then
      -- soft-delete → 'delete' (mock DELETE /contacts records action='delete', not 'update')
      if (to_jsonb(new)->>'status') = 'inactive' and (to_jsonb(old)->>'status') is distinct from 'inactive' then
        v_action := 'delete';
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

-- set_contact_teacher: same gate as before + emit a distinct action='reassign' audit row
-- (in addition to the generic 'update' the audit_contacts trigger fires), matching the mock.
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
  insert into public.audit_log(action, entity_type, entity_id, user_id, user_name, details, before, after, related_user_ids)
  values ('reassign', 'contact', cid::text, auth.uid(),
    coalesce((select first_name||' '||last_name from public.users where id = auth.uid()), 'system'),
    'contact reassign',
    jsonb_build_object('assigned_teacher_id', c.assigned_teacher_id),
    jsonb_build_object('assigned_teacher_id', teacher),
    array_remove(array[c.assigned_teacher_id, teacher], null));
  return r;
end $$;

-- ============================================================ area-create tier → Overseer+
drop policy if exists areas_insert on public.areas;
create policy areas_insert on public.areas for insert to authenticated
  with check (public.auth_level() >= 4);
