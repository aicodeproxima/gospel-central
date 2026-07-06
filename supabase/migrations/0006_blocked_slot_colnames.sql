-- Gospel Central — 0006: rename blocked_slots one-off datetime columns so the generic
-- camelize/snakeize round-trips cleanly with the BlockedSlot type's startDateTime/endDateTime.
--   start_datetime  <-> startDatetime   (WRONG: type wants startDateTime)
--   start_date_time <-> startDateTime   (correct round-trip)
-- The CHECK constraint expression auto-updates on rename; the trigger function body does NOT
-- (it's opaque text), so booking_conflict_guard is re-created with the new names.

set check_function_bodies = off;

alter table public.blocked_slots rename column start_datetime to start_date_time;
alter table public.blocked_slots rename column end_datetime   to end_date_time;

create or replace function public.booking_conflict_guard() returns trigger
  language plpgsql as $$
declare v_dow int; v_start time; v_end time; tz constant text := 'America/New_York';
begin
  if new.status = 'cancelled' then return new; end if;
  v_dow   := extract(dow from (new.start_time at time zone tz))::int;
  v_start := (new.start_time at time zone tz)::time;
  v_end   := (new.end_time   at time zone tz)::time;
  if exists (
    select 1 from public.blocked_slots b
    where b.is_active and (b.scope='global' or b.area_id=new.area_id)
      and ((b.recurrence='weekly'  and b.day_of_week=v_dow and b.start_time < v_end and b.end_time > v_start)
        or (b.recurrence='one-off' and b.start_date_time < new.end_time and b.end_date_time > new.start_time))
  ) then raise exception 'BLOCKED_SLOT_CONFLICT: booking overlaps a blocked slot' using errcode='P0001'; end if;
  if exists (
    select 1 from public.bookings x where x.id<>new.id and x.room_id=new.room_id and x.status<>'cancelled'
      and x.start_time < new.end_time and x.end_time > new.start_time
  ) then raise exception 'ROOM_CONFLICT: room already booked for that time' using errcode='P0001'; end if;
  if new.teacher_id is not null and exists (
    select 1 from public.bookings x where x.id<>new.id and x.teacher_id=new.teacher_id and x.status<>'cancelled'
      and x.start_time < new.end_time and x.end_time > new.start_time
  ) then raise exception 'TEACHER_CONFLICT: teacher already booked for that time' using errcode='P0001'; end if;
  return new;
end $$;
