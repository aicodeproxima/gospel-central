-- Gospel Central — 0004 org-tree + export RPCs.
-- reassign_user (the core tree mutation), contact reassign/convert, and the Decision-13
-- export gate + nearest-ancestor override resolver. All SECURITY DEFINER, re-checking the
-- exact permission helper server-side.
-- DEFERRED: groups-table node CRUD (create/rename/deactivate group node, L-01 own-branch).
-- The org page renders from the users.parent_id tree; confirm how the frontend uses the
-- separate groups table before building its CRUD (may be derivable from the user tree).

set check_function_bodies = off;

-- Export/import gate — Decision-13 (permissions.ts:660-666). Floor: Member/Team Leader
-- NEVER (even with a group override); BL+ always; GL = nearest-ancestor override.
create or replace function public.resolve_export_import(uid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  with recursive chain as (
    select id, parent_id, export_import_enabled, 0 as depth from public.users where id = uid
    union all
    select u.id, u.parent_id, u.export_import_enabled, c.depth + 1
    from public.users u join chain c on u.id = c.parent_id
    where c.export_import_enabled is null     -- climb until the nearest override is found
  )
  select coalesce(
    (select export_import_enabled from chain where export_import_enabled is not null order by depth limit 1),
    false)
$$;

create or replace function public.can_export_import() returns boolean
  language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then false
    when public.is_admin_tier() then true                 -- BL+ always
    when public.auth_level() < 2 then false               -- floor: member/team-leader never
    else public.resolve_export_import(auth.uid())          -- GL: per-group override
  end
$$;

-- reassign a user to a new parent — canReassignUserToGroup (permissions.ts:402-415):
-- admin-tier reassigns anyone anywhere; TL/GL require BOTH ends in their subtree.
create or replace function public.reassign_user(target uuid, new_parent uuid)
  returns public.users
  language plpgsql security definer set search_path = public as $$
declare r public.users;
begin
  if target is null or new_parent is null then raise exception 'MISSING_FIELDS' using errcode='P0001'; end if;
  if not public.is_admin_tier() then
    if not public.is_leader() then raise exception 'PERMISSION_DENIED' using errcode='P0001'; end if;
    if target not in (select public.subtree_user_ids(auth.uid()))
       or new_parent not in (select public.subtree_user_ids(auth.uid())) then
      raise exception 'PERMISSION_DENIED: both ends must be within your subtree' using errcode='P0001';
    end if;
  end if;
  -- cycle guard: a node cannot be reparented under its own descendant (or itself)
  if new_parent = target or new_parent in (select public.subtree_user_ids(target)) then
    raise exception 'CYCLE: new parent is within the target subtree' using errcode='P0001';
  end if;
  update public.users set parent_id = new_parent, updated_at = now() where id = target returning * into r;
  return r;
end $$;

-- reassign a contact's owner — canReassignContact (permissions.ts:531-541):
-- canEditContact(current) AND canCreateContact(newOwner).
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
      or c.created_by in (select public.subtree_user_ids(auth.uid()))
      or (c.assigned_teacher_id is not null and c.assigned_teacher_id in (select public.subtree_user_ids(auth.uid()))) )
    then raise exception 'PERMISSION_DENIED: cannot edit this contact' using errcode='P0001'; end if;
  if not ( new_owner = auth.uid() or public.is_admin_tier()
      or (public.is_leader() and new_owner in (select public.subtree_user_ids(auth.uid()))) )
    then raise exception 'PERMISSION_DENIED: cannot assign to that owner' using errcode='P0001'; end if;
  update public.contacts set created_by = new_owner, updated_at = now() where id = cid returning * into r;
  return r;
end $$;

-- convert a contact into a user — canConvertContact (permissions.ts:543-550): leader+ and
-- canEditContact. Creates the auth user (via create_user, which re-checks canCreateUser)
-- then links + flags the contact converted. `p` is the create_user payload (needs password).
create or replace function public.convert_contact(cid uuid, p jsonb)
  returns public.users
  language plpgsql security definer set search_path = public as $$
declare c public.contacts; nu public.users;
begin
  if not public.is_leader() then raise exception 'PERMISSION_DENIED' using errcode='P0001'; end if;
  select * into c from public.contacts where id = cid;
  if c.id is null then raise exception 'NOT_FOUND' using errcode='P0001'; end if;
  if not ( public.auth_role() in ('overseer','dev')
      or c.created_by = auth.uid()
      or c.created_by in (select public.subtree_user_ids(auth.uid()))
      or (c.assigned_teacher_id is not null and c.assigned_teacher_id in (select public.subtree_user_ids(auth.uid()))) )
    then raise exception 'PERMISSION_DENIED: cannot convert this contact' using errcode='P0001'; end if;
  nu := public.create_user(p || jsonb_build_object('role', coalesce(p->>'role','member')));
  update public.contacts set status = 'converted', converted_to_user_id = nu.id, updated_at = now() where id = cid;
  return nu;
end $$;

grant execute on function
  public.can_export_import(), public.reassign_user(uuid, uuid),
  public.reassign_contact(uuid, uuid), public.convert_contact(uuid, jsonb)
to authenticated;
