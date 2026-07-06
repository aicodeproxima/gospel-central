-- Gospel Central — 0001 schema: enums, tables, org-tree scope functions, RLS.
-- Authored against Supabase (uses auth.users + auth.uid()). Apply via the Supabase
-- CLI (`supabase db push`) or the dashboard SQL editor. Validate role scoping after
-- apply. Logic (conflict/audit/side-effect triggers + privileged RPCs) is 0002.
--
-- Enforcement model: RLS is the single gate. The frontend permission helpers become
-- UX-only. Scope = descendant closure over users.parent_id (Decision-10 split:
-- Branch-Leader+ READ all, but only Overseer/Dev WRITE all — BL writes own branch).

set check_function_bodies = off;

-- ============================================================ enums
create type user_role       as enum ('member','team_leader','group_leader','branch_leader','overseer','dev');
create type user_gender     as enum ('brother','sister');
create type contact_status  as enum ('active','inactive','converted');
create type pipeline_stage  as enum ('first_study','unbaptized','potential','baptism_ready','needs_help','baptized');
create type timeline_action as enum ('created','stage_change','session','partner_change','note','updated');
create type booking_status  as enum ('bible_study','completed','no_show','rescheduled','cancelled');
create type booking_type    as enum ('unbaptized_contact','baptized_persecuted','unbaptized_zoom','baptized_in_person','baptized_zoom','group_activities','team_activities');
create type activity        as enum ('bible_study','group_activity','special_video','team_meeting','group_meeting','function_meeting','committee_meeting','committee_mission');
create type blocked_scope   as enum ('global','area');
create type blocked_recur   as enum ('weekly','one-off');
create type audit_action    as enum ('create','update','delete','cancel','restore','export','login','login_failed','reset_password','rename','tag_grant','tag_revoke','role_change','reassign');
create type audit_entity    as enum ('booking','contact','user','group','report','tag','permission','area','room','blocked_slot','password_reset','username_change','login_success','login_failed','role_change','group_assignment');

-- ============================================================ small functions
-- Numeric role level (member=0 … dev=5). IMMUTABLE — most rules are a >= on this.
create or replace function public.role_level(r user_role) returns int
  language sql immutable as $$
  select case r
    when 'member' then 0 when 'team_leader' then 1 when 'group_leader' then 2
    when 'branch_leader' then 3 when 'overseer' then 4 when 'dev' then 5 end
$$;

create or replace function public.set_updated_at() returns trigger
  language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

-- ============================================================ tables
create table public.areas (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  is_active   boolean not null default true
);

create table public.rooms (
  id          uuid primary key default gen_random_uuid(),
  area_id     uuid not null references public.areas(id) on delete cascade,
  name        text not null,
  capacity    int  not null default 0,
  features    text[] not null default '{}',
  is_active   boolean not null default true,
  is_bookable boolean not null default true,
  unique (area_id, name)
);

-- Profile table: 1:1 with auth.users. Role/hierarchy/tags live here (read by RLS).
create table public.users (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text not null unique check (username ~ '^[a-z0-9_.-]{3,32}$'),  -- C-05
  first_name    text not null default '',
  last_name     text not null default '',
  email         text not null unique,
  phone         text,
  role          user_role not null default 'member',
  gender        user_gender,
  tags          text[] not null default '{}',
  group_id      uuid,                                   -- FK added after groups exists
  parent_id     uuid references public.users(id) on delete set null,  -- the scope tree
  location_id   uuid references public.areas(id) on delete set null,
  is_active     boolean not null default true,
  deactivated_cascade_id text,
  must_change_password   boolean not null default false,
  avatar_url    text,
  export_import_enabled  boolean,                        -- nullable per-node override
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index users_parent_idx   on public.users(parent_id);
create index users_role_idx      on public.users(role);
create index users_tags_gin      on public.users using gin(tags);
create trigger users_set_updated before update on public.users
  for each row execute function public.set_updated_at();

create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  parent_id   uuid references public.groups(id) on delete set null,
  leader_id   uuid not null references public.users(id) on delete cascade,
  leader_role user_role not null,
  member_count int not null default 0,
  created_at  timestamptz not null default now()
);
alter table public.users
  add constraint users_group_fk foreign key (group_id) references public.groups(id) on delete set null;

create table public.contacts (
  id            uuid primary key default gen_random_uuid(),
  first_name    text not null,
  last_name     text not null,
  email         text,
  phone         text,
  address       text,
  group_name    text,
  type          booking_type   not null,
  status        contact_status not null default 'active',
  pipeline_stage pipeline_stage not null default 'first_study',
  assigned_teacher_id uuid references public.users(id) on delete set null,
  preaching_partner_ids uuid[] not null default '{}',
  notes         text,
  total_sessions int not null default 0,
  last_session_date date,
  currently_studying boolean not null default false,
  current_step  int,
  current_subject text,
  subjects_studied text[] not null default '{}',
  converted_to_user_id uuid references public.users(id) on delete set null,
  retain_until  date,
  created_by    uuid not null references public.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- converted contacts must carry the linked user id; non-converted must not
  constraint contact_conversion_ck check (
    (status = 'converted') = (converted_to_user_id is not null))
);
create index contacts_created_by_idx on public.contacts(created_by);
create index contacts_teacher_idx    on public.contacts(assigned_teacher_id);
create trigger contacts_set_updated before update on public.contacts
  for each row execute function public.set_updated_at();

create table public.contact_timeline (
  id         uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  date       date not null default current_date,
  action     timeline_action not null,
  details    text not null,
  user_id    uuid not null references public.users(id),
  user_name  text not null,
  created_at timestamptz not null default now()
);
create index contact_timeline_contact_idx on public.contact_timeline(contact_id);

create table public.bookings (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.rooms(id),
  area_id     uuid not null references public.areas(id),
  type        booking_type not null,
  activity    activity,
  subject     text,
  title       text not null,
  description text,
  start_time  timestamptz not null,
  end_time    timestamptz not null,
  created_by  uuid not null references public.users(id),
  teacher_id  uuid references public.users(id),
  contact_id  uuid references public.contacts(id) on delete set null,
  participants uuid[] not null default '{}',
  edit_reason text,
  status      booking_status not null default 'bible_study',
  cancelled_at timestamptz,
  cancel_reason text,
  cancelled_by uuid references public.users(id),
  subjects_studied text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint booking_time_ck check (end_time > start_time)
);
create index bookings_room_time_idx on public.bookings(room_id, start_time, end_time);
create index bookings_area_time_idx on public.bookings(area_id, start_time, end_time);
create trigger bookings_set_updated before update on public.bookings
  for each row execute function public.set_updated_at();

create table public.blocked_slots (
  id          uuid primary key default gen_random_uuid(),
  scope       blocked_scope not null,
  area_id     uuid references public.areas(id) on delete cascade,
  recurrence  blocked_recur not null,
  day_of_week int,                 -- 0..6 (weekly)
  start_time  time,                -- weekly
  end_time    time,                -- weekly
  start_datetime timestamptz,      -- one-off
  end_datetime   timestamptz,      -- one-off
  reason      text not null,
  created_by  uuid not null references public.users(id),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint blocked_scope_ck check ((scope='area') = (area_id is not null)),
  constraint blocked_weekly_ck check (
    (recurrence='weekly'  and day_of_week is not null and start_time is not null and end_time is not null)
    or (recurrence='one-off' and start_datetime is not null and end_datetime is not null))
);

create table public.tag_definitions (
  id        text primary key check (id ~ '^[a-z0-9_]{3,32}$'),
  label     text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  action      audit_action not null,
  entity_type audit_entity not null,
  entity_id   text not null,
  user_id     uuid references public.users(id),   -- actor (null for anon login_failed)
  user_name   text not null,
  details     text not null default '',
  before      jsonb,
  after       jsonb,
  reason      text,
  related_user_ids uuid[] not null default '{}',
  "timestamp" timestamptz not null default now()
);
create index audit_actor_idx   on public.audit_log(user_id);
create index audit_related_gin on public.audit_log using gin(related_user_ids);
create index audit_time_idx    on public.audit_log("timestamp" desc);

-- ============================================================ scope functions
-- SECURITY DEFINER so they can read public.users WITHOUT re-triggering RLS on it
-- (avoids infinite recursion in the users_select policy) and so the owner (postgres)
-- bypasses RLS while computing scope. STABLE so the planner caches within a statement.

create or replace function public.auth_role() returns user_role
  language sql stable security definer set search_path = public as $$
  select role from public.users where id = auth.uid()
$$;

create or replace function public.auth_level() returns int
  language sql stable as $$ select public.role_level(public.auth_role()) $$;

create or replace function public.is_leader() returns boolean
  language sql stable as $$ select coalesce(public.auth_level() >= 1, false) $$;

create or replace function public.is_admin_tier() returns boolean
  language sql stable as $$ select coalesce(public.auth_level() >= 3, false) $$;

create or replace function public.can_access_reports() returns boolean
  language sql stable as $$ select coalesce(public.auth_level() >= 3, false) $$;

-- Descendant closure of a root user over parent_id. UNION (not ALL) => cycle-safe.
create or replace function public.subtree_user_ids(root uuid) returns setof uuid
  language sql stable security definer set search_path = public as $$
  with recursive s as (
    select id from public.users where id = root
    union
    select u.id from public.users u join s on u.parent_id = s.id
  ) select id from s
$$;

-- READ membership: Branch-Leader+ see everything; below that, own subtree only.
create or replace function public.can_read_owner(owner uuid) returns boolean
  language sql stable as $$
  select public.is_admin_tier()
      or owner in (select public.subtree_user_ids(auth.uid()))
$$;

-- WRITE membership (Decision-10): ONLY Overseer/Dev unrestricted; everyone else
-- (incl. Branch Leader) is the descendant closure = own branch/group/team.
create or replace function public.can_write_owner(owner uuid) returns boolean
  language sql stable as $$
  select coalesce(public.auth_level() >= 4, false)
      or owner in (select public.subtree_user_ids(auth.uid()))
$$;

-- Contact read gate reused by contact_timeline (SECURITY DEFINER = no RLS recursion)
create or replace function public.can_read_contact(cid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.contacts c
    where c.id = cid and (
      public.is_admin_tier()
      or c.assigned_teacher_id = auth.uid()
      or c.created_by = auth.uid()
      or c.assigned_teacher_id in (select public.subtree_user_ids(auth.uid()))
      or c.created_by in (select public.subtree_user_ids(auth.uid()))
    ))
$$;

-- ============================================================ auth.users -> profile
-- Seed a profile row on signup. Role/parent/etc come from user metadata (seed passes
-- them); safe fallbacks otherwise. SECURITY DEFINER to insert into public.users.
create or replace function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, username, email, first_name, last_name, role, gender, parent_id, group_id, location_id, tags, must_change_password)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'first_name',''),
    coalesce(new.raw_user_meta_data->>'last_name',''),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'member'),
    (new.raw_user_meta_data->>'gender')::user_gender,
    (new.raw_user_meta_data->>'parent_id')::uuid,
    (new.raw_user_meta_data->>'group_id')::uuid,
    (new.raw_user_meta_data->>'location_id')::uuid,
    coalesce((select array_agg(x) from jsonb_array_elements_text(new.raw_user_meta_data->'tags') x), '{}'),
    coalesce((new.raw_user_meta_data->>'must_change_password')::boolean, false)
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================ RLS
alter table public.areas            enable row level security;
alter table public.rooms            enable row level security;
alter table public.users            enable row level security;
alter table public.groups           enable row level security;
alter table public.contacts         enable row level security;
alter table public.contact_timeline enable row level security;
alter table public.bookings         enable row level security;
alter table public.blocked_slots    enable row level security;
alter table public.tag_definitions  enable row level security;
alter table public.audit_log        enable row level security;

-- ---- users ----
-- READ: self, or any leader reads everyone (canViewUser, permissions.ts:81-85)
create policy users_select on public.users for select to authenticated
  using ( id = auth.uid() or public.is_leader() );
-- SELF field-limited update (SAFE_SELF_FIELDS via column GRANT below — a raw self
-- UPDATE policy can't restrict columns, so privileged cols are withheld at GRANT).
create policy users_update_self on public.users for update to authenticated
  using ( id = auth.uid() ) with check ( id = auth.uid() );
-- UPDATE others: canEditUser — target at/below own level; only dev edits dev; member
-- edits nobody but self; peer-edit allowed. (permissions.ts:98-105)
create policy users_update_other on public.users for update to authenticated
  using (
    id <> auth.uid() and public.auth_level() >= 1
    and public.role_level(role) <= public.auth_level()
    and (role <> 'dev' or public.auth_role() = 'dev')
  ) with check (
    public.role_level(role) <= public.auth_level()
    and (role <> 'dev' or public.auth_role() = 'dev')
  );
-- Column grant caps what ANY update policy can touch: role/tags/username/parent_id/
-- group_id/is_active/role are RPC-only (0002). This is the self-escalation guard.
grant select on public.users to authenticated;
grant update (first_name, last_name, phone, email, avatar_url, gender) on public.users to authenticated;

-- ---- contacts (Decision-10 split) ----
create policy contacts_select on public.contacts for select to authenticated
  using (
    public.is_admin_tier()
    or assigned_teacher_id = auth.uid()
    or created_by = auth.uid()
    or assigned_teacher_id in (select public.subtree_user_ids(auth.uid()))
    or created_by in (select public.subtree_user_ids(auth.uid()))
  );
-- EDIT: canEditContact — only overseer/dev unrestricted; member = own creations;
-- others = creator/teacher in MANAGEABLE subtree (BL = own branch, NOT all).
create policy contacts_update on public.contacts for update to authenticated
  using (
    public.auth_role() in ('overseer','dev')
    or (public.auth_level() = 0 and created_by = auth.uid())
    or created_by = auth.uid()
    or created_by in (select public.subtree_user_ids(auth.uid()))
    or (assigned_teacher_id is not null and assigned_teacher_id in (select public.subtree_user_ids(auth.uid())))
  ) with check (
    public.auth_role() in ('overseer','dev')
    or (public.auth_level() = 0 and created_by = auth.uid())
    or created_by = auth.uid()
    or created_by in (select public.subtree_user_ids(auth.uid()))
    or (assigned_teacher_id is not null and assigned_teacher_id in (select public.subtree_user_ids(auth.uid())))
  );
-- No DELETE policy => hard delete denied for all (soft-delete via RPC in 0002 = C-04).
-- No INSERT policy => create_contact RPC only (canCreateContact, 0002).
grant select, update on public.contacts to authenticated;

-- ---- contact_timeline ----
create policy timeline_select on public.contact_timeline for select to authenticated
  using ( public.can_read_contact(contact_id) );
grant select on public.contact_timeline to authenticated;   -- inserts via trigger/RPC

-- ---- bookings (org-wide caretaking, not the split) ----
create policy bookings_select on public.bookings for select to authenticated
  using ( auth.uid() is not null );  -- everyone sees every calendar
create policy bookings_update on public.bookings for update to authenticated
  using (
    created_by = auth.uid() or teacher_id = auth.uid() or public.is_admin_tier()
    or created_by in (select public.subtree_user_ids(auth.uid()))
    or (teacher_id is not null and teacher_id in (select public.subtree_user_ids(auth.uid())))
  ) with check ( true );  -- conflict re-check is enforced by the BEFORE trigger (0002)
grant select, update on public.bookings to authenticated;   -- INSERT via create_booking RPC

-- ---- blocked_slots (canManageBlockedSlot = isAdminTier, any area) ----
create policy blocked_select on public.blocked_slots for select to authenticated
  using ( auth.uid() is not null );
create policy blocked_write on public.blocked_slots for insert to authenticated
  with check ( public.is_admin_tier() );
create policy blocked_update on public.blocked_slots for update to authenticated
  using ( public.is_admin_tier() ) with check ( public.is_admin_tier() );  -- soft-delete = is_active=false
grant select, insert, update on public.blocked_slots to authenticated;

-- ---- areas / rooms (isAdminTier, any area) ----
create policy areas_select on public.areas for select to authenticated using ( auth.uid() is not null );
create policy areas_write  on public.areas for all to authenticated using ( public.is_admin_tier() ) with check ( public.is_admin_tier() );
create policy rooms_select on public.rooms for select to authenticated using ( auth.uid() is not null );
create policy rooms_write  on public.rooms for all to authenticated using ( public.is_admin_tier() ) with check ( public.is_admin_tier() );
grant select, insert, update on public.areas to authenticated;
grant select, insert, update on public.rooms to authenticated;

-- ---- groups (read all; mutate via RPC enforcing L-01 own-branch rules) ----
create policy groups_select on public.groups for select to authenticated using ( auth.uid() is not null );
grant select on public.groups to authenticated;

-- ---- tag_definitions (admin tab reads; catalog write = Overseer+) ----
create policy tagdef_select on public.tag_definitions for select to authenticated
  using ( public.is_admin_tier() );
create policy tagdef_write on public.tag_definitions for all to authenticated
  using ( public.auth_level() >= 4 ) with check ( public.auth_level() >= 4 );
grant select, insert, update, delete on public.tag_definitions to authenticated;

-- ---- audit_log (KO-5 + KO-6: BL+ or actor/related; append-only) ----
create policy audit_select on public.audit_log for select to authenticated
  using (
    public.is_admin_tier()               -- admin audit tab (branch-scoped refinement in the reports RPC)
    or user_id = auth.uid()              -- alerts feed: I am the actor
    or auth.uid() = any(related_user_ids)-- ...or I am an affected user
  );
-- No INSERT/UPDATE/DELETE policy => clients can never write/modify the log. Rows are
-- written by SECURITY DEFINER triggers (0002), which run as owner and bypass RLS.
grant select on public.audit_log to authenticated;

-- ============================================================ execute grants
grant usage on schema public to anon, authenticated;
-- (RPCs get explicit EXECUTE grants in 0002.)
