-- 0009_fix_booking_completion_enum.sql
--
-- FIX a flip-blocker found by the write-parity sweep (2026-07-09, run-write-20260709000850):
-- EVERY update to public.bookings failed with
--   22P02 invalid input value for enum booking_status: ""
-- so completing / cancelling / restoring / rescheduling / editing ANY booking was
-- impossible on the real backend (INSERT worked; the entire booking-mutation surface
-- beyond create was dead). The read-parity + RLS harnesses could not see this — it is a
-- write-path-only defect.
--
-- ROOT CAUSE — public.booking_completion_sideeffect() (migration 0002, line ~154):
--   if new.status = 'completed' and coalesce(old.status,'') <> 'completed' ...
-- old.status is the booking_status ENUM; coalesce(old.status, '') forces the ''
-- literal to be coerced to booking_status ('' ::booking_status), which is not a valid
-- enum value. The trigger is AFTER UPDATE, so this expression is evaluated on every
-- booking update and always throws (that is why INSERT — no such trigger — was fine).
--
-- FIX: use the null-safe enum comparison `old.status is distinct from 'completed'`
-- (old.status is NOT NULL on UPDATE anyway; no empty-string cast needed). Behaviour is
-- otherwise identical: advance the contact's study fields only on the bible_study→Completed edge.

create or replace function public.booking_completion_sideeffect() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed'
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
-- trigger bookings_completion_sideeffect (0002) already points at this function — replacing
-- the function body is sufficient; no trigger re-creation needed.
