-- 0010_contact_stage_timeline.sql
-- Real-backend parity for the app-testing-routine finding (cells 68/77) + the
-- mock fix shipped in dd7124d: a runtime pipeline_stage change must append a
-- 'stage_change' row to contact_timeline, exactly as the mock PUT /contacts now
-- does and as the seed represents stage history. Without it, the client fruit/
-- baptism leaderboards (church.ts scans the timeline for a 'Baptized'
-- stage_change in a recent window) would never count a runtime baptism.
--
-- Fulfils the 0001_schema.sql:374 "inserts via trigger/RPC" promise for the
-- contact_timeline table. SECURITY DEFINER so the AFTER UPDATE trigger can
-- INSERT even though `authenticated` only holds SELECT on contact_timeline.
-- Idempotent (create or replace + drop trigger if exists).

create or replace function public.contact_stage_timeline() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_label text;
  v_uid   uuid;
  v_name  text;
begin
  if new.pipeline_stage is distinct from old.pipeline_stage then
    -- Label must byte-match PIPELINE_STAGE_CONFIG[stage].label (contact.ts) so
    -- the client analytics' `details.includes('Baptized')` scan keeps working.
    v_label := case new.pipeline_stage
      when 'first_study'   then 'First Study'
      when 'unbaptized'    then 'Unbaptized'
      when 'potential'     then 'Potential'
      when 'baptism_ready' then 'Baptism Ready'
      when 'needs_help'    then 'Needs Help'
      when 'baptized'      then 'Baptized'
      else new.pipeline_stage::text
    end;
    -- Attribute to the JWT actor (auth.uid()); fall back to the contact's
    -- creator for non-request contexts (both columns are NOT NULL FKs to users).
    v_uid := coalesce(auth.uid(), new.created_by);
    select coalesce(nullif(btrim(u.first_name || ' ' || u.last_name), ''), u.username)
      into v_name
      from public.users u
     where u.id = v_uid;

    insert into public.contact_timeline (contact_id, date, action, details, user_id, user_name)
    values (new.id, current_date, 'stage_change',
            'Pipeline stage changed to ' || v_label,
            v_uid, coalesce(v_name, 'System'));
  end if;
  return new;
end $$;

drop trigger if exists contacts_stage_timeline on public.contacts;
create trigger contacts_stage_timeline
  after update on public.contacts
  for each row execute function public.contact_stage_timeline();
