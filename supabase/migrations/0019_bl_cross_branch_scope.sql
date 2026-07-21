-- 0019_bl_cross_branch_scope.sql
-- (Renumbered 0018→0019 2026-07-21: collided with 0018_feedback_username.sql, which was
--  created two days earlier and keeps the number. Content unchanged; live DB already carries it.)
-- USER-APPROVED POLICY REVERSAL (decided 2026-07-17, recorded REV3 #20; shipped 2026-07-21):
-- Branch Leaders alternate physically between branch locations, so a Branch Leader may now
-- MANAGE (write) contacts across EVERY branch subtree — deliberately reversing the earlier
-- own-branch-only tightening (including 0014's reassign-target scope). READ scope is
-- untouched (BL already reads all). Writes above the branches (overseer/dev-owned records
-- outside any branch subtree) remain Overseer/Dev-only. Peer-branch writes are legal but
-- flagged: new audit_log.cross_branch, computed by audit_row() for branch_leader actors.
-- Client mirror: buildManageableScope seeds from all Branch Leaders (same commit) — the
-- mock and this RLS flip TOGETHER.
-- Idempotent (create-or-replace / drop-create policy / add column if not exists).

-- ============================================================ the write scope
-- manageable_user_ids(root): the WRITE analog of subtree_user_ids. For a
-- branch_leader: the union of every branch leader's subtree. Everyone else:
-- their own subtree (unchanged). SECURITY DEFINER so policies/RPCs can call it
-- without RLS recursion (same pattern as subtree_user_ids/can_read_contact).
create or replace function public.manageable_user_ids(root uuid) returns setof uuid
  language plpgsql stable security definer set search_path = public as $$
begin
  if (select role from public.users where id = root) = 'branch_leader' then
    return query
      select distinct s
      from public.users bl,
           lateral public.subtree_user_ids(bl.id) s
      where bl.role = 'branch_leader';
  else
    return query select * from public.subtree_user_ids(root);
  end if;
end $$;

-- ============================================================ audit flag
alter table public.audit_log add column if not exists cross_branch boolean not null default false;

-- audit_row(): 0015's body + cross_branch computation for branch_leader actors
-- (owner of the affected row outside the actor's OWN subtree). All 0013/0015
-- markers preserved (cancel_reason lift, contact restore edge).
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
  v_cross boolean := false;
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

  -- REV3 #20: flag a branch_leader acting on a contact owned OUTSIDE their own
  -- branch subtree (legal under the cross-branch policy; flagged for the trail).
  if public.auth_role() = 'branch_leader' and v_entity = 'contact'
     and (v_row->>'created_by') is not null
     and (v_row->>'created_by')::uuid <> v_actor then
    v_cross := not exists (
      select 1 from public.subtree_user_ids(v_actor) s
      where s = (v_row->>'created_by')::uuid
    );
  end if;

  insert into public.audit_log(action, entity_type, entity_id, user_id, user_name, details, reason, before, after, related_user_ids, cross_branch)
  values (
    v_action, v_entity, v_id, v_actor, coalesce(v_actor_name,'system'),
    v_entity || ' ' || v_action,
    v_reason,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end,
    v_related,
    v_cross
  );
  return coalesce(new, old);
end $$;

-- ============================================================ contact write gates
-- contacts_update policy: subtree -> manageable (BL = every branch).
drop policy if exists contacts_update on public.contacts;
create policy contacts_update on public.contacts for update to authenticated
  using (
    public.auth_role() in ('overseer','dev')
    or (public.auth_level() = 0 and created_by = auth.uid())
    or created_by = auth.uid()
    or created_by in (select public.manageable_user_ids(auth.uid()))
    or (assigned_teacher_id is not null and assigned_teacher_id in (select public.manageable_user_ids(auth.uid())))
  ) with check (
    public.auth_role() in ('overseer','dev')
    or (public.auth_level() = 0 and created_by = auth.uid())
    or created_by = auth.uid()
    or created_by in (select public.manageable_user_ids(auth.uid()))
    or (assigned_teacher_id is not null and assigned_teacher_id in (select public.manageable_user_ids(auth.uid())))
  );

-- set_contact_teacher: 0014's body with both gates on manageable_user_ids —
-- edit gate widens to any-branch for BL; the reassign-TARGET gate (0014's
-- tightening) widens the same way: any-branch targets are now legal for BL,
-- still subtree-bound for Group/Team Leaders, Overseer/Dev anywhere.
create or replace function public.set_contact_teacher(cid uuid, teacher uuid) returns public.contacts
  language plpgsql security definer set search_path = public as $$
declare c public.contacts; r public.contacts; v_cross boolean := false;
begin
  select * into c from public.contacts where id = cid;
  if c.id is null then raise exception 'NOT_FOUND' using errcode='P0001'; end if;
  if not (
    public.auth_role() in ('overseer','dev')
    or (public.auth_level()=0 and c.created_by = auth.uid())
    or c.created_by = auth.uid()
    or c.created_by in (select public.manageable_user_ids(auth.uid()))
    or (c.assigned_teacher_id is not null and c.assigned_teacher_id in (select public.manageable_user_ids(auth.uid())))
  ) then raise exception 'PERMISSION_DENIED' using errcode='P0001'; end if;
  -- Reassign target scope: Overseer/Dev anywhere; everyone else within their
  -- MANAGEABLE subtree (self allowed) — for a Branch Leader that now spans
  -- every branch (REV3 #20; replaces 0014's own-subtree bound).
  if teacher is not null and not (
    public.auth_role() in ('overseer','dev')
    or teacher = auth.uid()
    or teacher in (select public.manageable_user_ids(auth.uid()))
  ) then
    raise exception 'PERMISSION_DENIED' using errcode='P0001';
  end if;
  if public.auth_role() = 'branch_leader' and c.created_by is not null and c.created_by <> auth.uid() then
    v_cross := not exists (select 1 from public.subtree_user_ids(auth.uid()) s where s = c.created_by);
  end if;
  update public.contacts set assigned_teacher_id = teacher, updated_at = now() where id = cid returning * into r;
  insert into public.audit_log(action, entity_type, entity_id, user_id, user_name, details, before, after, related_user_ids, cross_branch)
  values ('reassign', 'contact', cid::text, auth.uid(),
    coalesce((select first_name||' '||last_name from public.users where id = auth.uid()), 'system'),
    'contact reassign',
    jsonb_build_object('assigned_teacher_id', c.assigned_teacher_id),
    jsonb_build_object('assigned_teacher_id', teacher),
    array_remove(array[c.assigned_teacher_id, teacher], null),
    v_cross);
  return r;
end $$;

-- set_contact_inactive (0002 body, gate on manageable_user_ids).
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
    or c.created_by in (select public.manageable_user_ids(auth.uid()))
    or (c.assigned_teacher_id is not null and c.assigned_teacher_id in (select public.manageable_user_ids(auth.uid())))
  ) then raise exception 'PERMISSION_DENIED' using errcode='P0001'; end if;
  update public.contacts set status='inactive', updated_at=now() where id=cid returning * into r;
  return r;
end $$;

-- set_contact_active (0015 body, gate on manageable_user_ids).
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
    or c.created_by in (select public.manageable_user_ids(auth.uid()))
    or (c.assigned_teacher_id is not null and c.assigned_teacher_id in (select public.manageable_user_ids(auth.uid())))
  ) then raise exception 'PERMISSION_DENIED' using errcode='P0001'; end if;
  update public.contacts set status='active', updated_at=now() where id=cid returning * into r;
  return r;
end $$;

-- reassign_contact (0004 body, both gates on manageable_user_ids).
create or replace function public.reassign_contact(cid uuid, new_owner uuid)
  returns public.contacts
  language plpgsql security definer set search_path = public as $$
declare c public.contacts; r public.contacts;
begin
  select * into c from public.contacts where id = cid;
  if c.id is null then raise exception 'NOT_FOUND' using errcode='P0001'; end if;
  if not ( public.auth_role() in ('overseer','dev')
      or (public.auth_level()=0 and c.created_by = auth.uid())
      or c.created_by = auth.uid()
      or c.created_by in (select public.manageable_user_ids(auth.uid()))
      or (c.assigned_teacher_id is not null and c.assigned_teacher_id in (select public.manageable_user_ids(auth.uid()))) )
    then raise exception 'PERMISSION_DENIED: cannot edit this contact' using errcode='P0001'; end if;
  if not ( new_owner = auth.uid() or public.is_admin_tier()
      or (public.is_leader() and new_owner in (select public.manageable_user_ids(auth.uid()))) )
    then raise exception 'PERMISSION_DENIED: cannot assign to that owner' using errcode='P0001'; end if;
  update public.contacts set created_by = new_owner, updated_at = now() where id = cid returning * into r;
  return r;
end $$;

-- convert_contact (0011 body — idempotency + retention preserved — edit gate
-- on manageable_user_ids).
create or replace function public.convert_contact(cid uuid, p jsonb)
  returns public.users
  language plpgsql security definer set search_path = public as $$
declare c public.contacts; nu public.users;
begin
  if not public.is_leader() then raise exception 'PERMISSION_DENIED' using errcode='P0001'; end if;
  select * into c from public.contacts where id = cid;
  if c.id is null then raise exception 'NOT_FOUND' using errcode='P0001'; end if;
  -- idempotency: never mint a second user for an already-converted contact (mock returns 409).
  if c.status = 'converted' or c.converted_to_user_id is not null then
    raise exception 'ALREADY_CONVERTED' using errcode='P0001';
  end if;
  if not ( public.auth_role() in ('overseer','dev')
      or c.created_by = auth.uid()
      or c.created_by in (select public.manageable_user_ids(auth.uid()))
      or (c.assigned_teacher_id is not null and c.assigned_teacher_id in (select public.manageable_user_ids(auth.uid()))) )
    then raise exception 'PERMISSION_DENIED: cannot convert this contact' using errcode='P0001'; end if;
  nu := public.create_user(p || jsonb_build_object('role', coalesce(p->>'role','member')));
  update public.contacts set
    status = 'converted', converted_to_user_id = nu.id,
    retain_until = current_date + 183,   -- ~6-month retention window (mock parity)
    updated_at = now()
  where id = cid;
  return nu;
end $$;

grant execute on function public.manageable_user_ids(uuid) to authenticated;
