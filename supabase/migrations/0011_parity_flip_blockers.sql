-- 0011_parity_flip_blockers.sql
-- Close the material mock↔real divergences the 3AgentScan found where the REAL
-- backend was behind the mock (the mock is the behavioral reference here):
--   H1  booking_completion_sideeffect — add the session contact_timeline row,
--       one-way First-Study→Unbaptized auto-promotion, current_subject, keep the
--       MOST-RECENT last_session_date, and the un-complete REVERSAL; key on
--       activity='bible_study' to match the mock's applyStudyCompletion.
--       (current_step parity still needs a curriculum table on the DB — not here.)
--   H4  convert_contact — idempotency guard (never mint a duplicate user) +
--       retain_until (Phase-5 retention window).
--   H5  restore_user_cascade — add the same authz gate as deactivate_user_cascade.
-- All create-or-replace / idempotent.

-- ============================================================ H1: booking completion + reversal
create or replace function public.booking_completion_sideeffect() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_subjects   text[];
  v_primary    text;
  v_actor      uuid;
  v_actor_name text;
begin
  -- Only Bible-study bookings tied to a contact carry study side-effects. Keyed on
  -- activity (matching the mock's applyStudyCompletion), not booking type.
  if new.contact_id is null or new.activity is distinct from 'bible_study' then
    return new;
  end if;

  v_actor := coalesce(new.teacher_id, new.created_by);
  select coalesce(nullif(btrim(u.first_name || ' ' || u.last_name), ''), u.username)
    into v_actor_name from public.users u where u.id = v_actor;

  -- FORWARD: a booking entering 'completed'
  if new.status = 'completed' and old.status is distinct from 'completed' then
    v_subjects := array(
      select e from unnest(
        case when array_length(new.subjects_studied, 1) > 0 then new.subjects_studied
             when new.subject is not null and btrim(new.subject) <> '' then array[new.subject]
             else '{}'::text[] end
      ) e where e is not null and btrim(e) <> ''
    );
    v_primary := v_subjects[1];

    -- session row FIRST (logical order: session, then any promotion stage_change)
    insert into public.contact_timeline (contact_id, date, action, details, user_id, user_name)
    values (new.contact_id, new.start_time::date, 'session',
      case when v_primary is not null
           then 'Completed Bible study — ' || array_to_string(v_subjects, ', ')
           else 'Completed Bible study session (subject TBD)' end,
      v_actor, coalesce(v_actor_name, 'System'));

    update public.contacts c set
      total_sessions     = c.total_sessions + 1,
      last_session_date  = greatest(coalesce(c.last_session_date, '-infinity'::date), new.start_time::date),
      currently_studying = true,
      current_subject    = coalesce(v_primary, c.current_subject),
      subjects_studied   = (
        select array(select distinct e from unnest(c.subjects_studied || v_subjects) e
                     where e is not null and btrim(e) <> '')
      ),
      -- one-way auto-promotion at 2 completed studies (mirrors the mock). The 0010
      -- contacts_stage_timeline trigger then emits the stage_change timeline row.
      pipeline_stage     = case when c.pipeline_stage = 'first_study' and c.total_sessions + 1 >= 2
                                then 'unbaptized' else c.pipeline_stage end,
      updated_at = now()
    where c.id = new.contact_id;

  -- REVERSE: a booking leaving 'completed' (status correction or cancel). Never
  -- reverses the one-way auto-promotion — matches the mock.
  elsif old.status = 'completed' and new.status is distinct from 'completed' then
    update public.contacts set
      total_sessions = greatest(0, total_sessions - 1),
      updated_at = now()
    where id = new.contact_id;

    insert into public.contact_timeline (contact_id, date, action, details, user_id, user_name)
    values (new.contact_id, current_date, 'updated',
      'Study completion reverted for "' || new.title || '"',
      v_actor, coalesce(v_actor_name, 'System'));
  end if;

  return new;
end $$;

-- ============================================================ H4: convert idempotency + retention
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
      or c.created_by in (select public.subtree_user_ids(auth.uid()))
      or (c.assigned_teacher_id is not null and c.assigned_teacher_id in (select public.subtree_user_ids(auth.uid()))) )
    then raise exception 'PERMISSION_DENIED: cannot convert this contact' using errcode='P0001'; end if;
  nu := public.create_user(p || jsonb_build_object('role', coalesce(p->>'role','member')));
  update public.contacts set
    status = 'converted', converted_to_user_id = nu.id,
    retain_until = current_date + 183,   -- ~6-month retention window (mock parity)
    updated_at = now()
  where id = cid;
  return nu;
end $$;

-- ============================================================ H5: restore cascade authz
create or replace function public.restore_user_cascade(target uuid) returns int
  language plpgsql security definer set search_path = public as $$
declare t public.users; cid text; n int;
begin
  select * into t from public.users where id = target;
  if t.id is null then raise exception 'NOT_FOUND' using errcode='P0001'; end if;
  -- Same gate as deactivate_user_cascade: NOT self + canEditUser (role-ceiling, dev-guard).
  if target = auth.uid() then raise exception 'PERMISSION_DENIED' using errcode='P0001'; end if;
  if not ( public.auth_level() >= 1 and public.role_level(t.role) <= public.auth_level()
           and (t.role <> 'dev' or public.auth_role() = 'dev') ) then
    raise exception 'PERMISSION_DENIED' using errcode='P0001'; end if;
  cid := t.deactivated_cascade_id;
  if cid is null then
    update public.users set is_active = true where id = target; return 1;  -- non-cascade restore
  end if;
  update public.users set is_active = true, deactivated_cascade_id = null where deactivated_cascade_id = cid;
  get diagnostics n = row_count;
  return n;
end $$;
