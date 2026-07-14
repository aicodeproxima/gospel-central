-- 0013_audit_cancel_reason.sql
-- Audit-remediation finding 497: the audit detail dialog has a Reason row that
-- can never render because nothing populates audit_log.reason (the column has
-- existed since 0001). Worst on the real backend: the user-typed cancel reason
-- was being DISCARDED — cancel_booking stores it on bookings.cancel_reason, but
-- the audit trail only got the generic 'booking cancel' detail.
-- Fix: audit_row() lifts cancel_reason off the NEW row into audit_log.reason
-- whenever a booking transitions to cancelled. Mock parity: the MSW cancel
-- handler now sets the same field (src/mocks/handlers.ts, PATCH cancel path).
-- Idempotent (create-or-replace, 0012 pattern).

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
