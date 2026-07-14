-- 0014_reassign_scope_tier.sql
-- Audit-remediation security finding (2026-07-13 verification pass): the
-- teacher-target gate in set_contact_teacher used is_admin_tier(), which
-- includes Branch Leader — letting a BL reassign a contact to a teacher in
-- ANOTHER branch. docs/PERMISSIONS.md matrix row "Reassign owner" scopes a
-- Branch Leader to their OWN branch; cross-branch placement is Overseer/Dev
-- only (create-assign deliberately stays "any branch" for BL — that row is
-- unchanged). Same class of bug as the BL cross-branch user-edit fix.
-- Client parity: permissions.ts canReassignContact + the MSW PATCH gate were
-- tightened in the same commit. Idempotent (create-or-replace, 0012 pattern).

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
  -- Reassign target scope: Overseer/Dev anywhere; everyone else only within
  -- their own manageable subtree (self allowed). Replaces is_admin_tier().
  if teacher is not null and not (
    public.auth_role() in ('overseer','dev')
    or teacher = auth.uid()
    or teacher in (select public.subtree_user_ids(auth.uid()))
  ) then
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
