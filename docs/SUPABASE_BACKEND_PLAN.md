# Gospel Central — Supabase Backend Plan (DRAFT)

Status: **draft for review** (2026-07-05). Solo build (Mike is off the project);
target = our Supabase project `imjsdsepmhgazracegog`. This replaces the MSW mock as the
real backend. Derived from three ground-truth maps: the data model (`src/lib/types/*`),
the exact permission-scope semantics (`docs/PERMISSIONS.md` + `permissions.ts`), and the
API/authz contract (`docs/BACKEND_GAPS.md` + `docs/MIKE_HANDOFF.md`). The security-critical
authz gaps the UI audit re-confirmed live (KO-3/4/5/6) are closed **by construction** here.

---

## 0. Strategy in one paragraph

Postgres schema + **RLS as the single enforcement layer** (the frontend permission
helpers become "UX only" as the docs already say). Supabase **Auth** gives httpOnly-cookie
sessions via `@supabase/ssr` — which closes audit item **C-2 for free**. The org-tree
permission scope (`User.parentId` descendant closure) becomes a `SECURITY DEFINER`
recursive-CTE function that every policy calls. Logic that can't live in a row policy
(booking conflict rejection, audit emission, study-field side-effects, cascades) becomes
**database triggers + RPC functions** — so it is impossible to bypass from any client
(closes H-01 audit emission and the "no one overrides a blocked slot" universal by
construction). The frontend keeps `NEXT_PUBLIC_MOCK_API` for local/dev/tests; production
points `supabase-js` at the real project.

**Why RLS-first, not a Node/Go API tier:** the whole permission model is row-scoped
(who-can-see/edit-which-rows), which is exactly what RLS expresses natively. A separate
API tier would re-implement `permissions.ts` a third time (after the frontend + the mock)
and re-open the "gate is UX only, server forgot to re-check" gap that BACKEND_GAPS.md is
full of. RLS makes the DB the one enforcement point.

---

## 1. Auth model

- **`auth.users`** (Supabase-managed) holds credentials + session. **`public.users`**
  is a 1:1 profile (`public.users.id = auth.users.id`) holding `role`, `parent_id`,
  `tags`, `location_id`, `group_id`, `is_active`, etc. A trigger on `auth.users` insert
  seeds the profile row.
- **Login is username-based today, Supabase Auth is email-based** — a real mismatch to
  resolve (see §9, Decision D-1). Recommended: keep `username` as the UI login field and
  resolve `username → email` before `signInWithPassword` (seed users already have emails
  like `branch1@diamond.org`). Alternative: migrate the login form to email.
- **Role for RLS is read from `public.users`, NOT from JWT claims** (Decision D-2). A
  `SECURITY DEFINER STABLE` helper reads the profile by `auth.uid()`. This makes a role or
  `parent_id` change take effect **immediately** — critical for a security boundary; JWT
  custom claims would stay stale until the next token refresh. At 132 users the per-query
  cost is negligible; add an index and mark helpers `STABLE` so the planner caches within
  a statement.
- **`C-2` closed:** `@supabase/ssr` sets `HttpOnly; SameSite=Lax; Secure` cookies; the
  frontend stops persisting tokens to `localStorage` (retire the `diamond-session`
  localStorage mirror + the non-httpOnly XSS risk noted in CLAUDE.md).
- **`#11-b` closed:** RLS derives the actor from `auth.uid()` only — there is no
  `body.actorId` path to spoof.

---

## 2. Enums (Postgres types — 1:1 with the 13 TS enums)

```sql
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
-- curriculum_section ('foundation','growth') stays app-side reference data (not persisted).
```

Store `role` as the enum but expose a `role_level(user_role) returns int immutable`
function (member=0 … dev=5) because ~every rule is a `>=`/`<` on the level.

## 3. Tables (core shapes; full DDL in the migration)

Naming: snake_case columns, `uuid` PKs (`default gen_random_uuid()`), `created_at`/
`updated_at timestamptz` with an `updated_at` trigger. Soft-delete per the map.

- **`users`** — id (=auth.users.id), username (unique, CHECK `^[a-z0-9_.-]{3,32}$` → closes
  C-05), email (unique), first_name, last_name, phone, `role user_role`, `gender user_gender`,
  `tags text[] not null default '{}'`, `group_id uuid`, `parent_id uuid references users(id)`,
  `location_id uuid references areas(id)`, `is_active bool default true`,
  `deactivated_cascade_id text`, `must_change_password bool default false`, `avatar_url`,
  `export_import_enabled bool` (nullable override; effective value computed, see §5.7).
  Index: `(parent_id)`, GIN `(tags)`.
- **`contacts`** — the full field set incl. `created_by uuid not null references users`,
  `assigned_teacher_id uuid references users`, `preaching_partner_ids uuid[]`,
  `type booking_type`, `status contact_status`, `pipeline_stage pipeline_stage`,
  `subjects_studied text[]`, `converted_to_user_id uuid`, `retain_until date`,
  study fields. **Soft-delete:** `DELETE` policy denied; deletion = `status='inactive'`
  via RPC (closes C-04). CHECK: `converted_to_user_id` non-null only if `status='converted'`.
- **`contact_timeline`** — child table (NOT JSONB) so it's queryable/appendable:
  contact_id, date, `action timeline_action`, details, user_id, user_name. Append-only.
- **`bookings`** — room_id, area_id, `type booking_type`, `activity activity`,
  `status booking_status`, start_time/end_time `timestamptz`, created_by, teacher_id,
  contact_id, `participants uuid[]`, cancel fields, `subjects_studied text[]`. Never
  hard-deleted (cancel = `status='cancelled'`).
- **`areas`** (is_active) / **`rooms`** (area_id, capacity, `features text[]`, is_active,
  `is_bookable default true`). (Drop the embedded `Area.rooms` JSON — use the FK.)
- **`blocked_slots`** — `scope blocked_scope`, area_id (null for global), `recurrence blocked_recur`,
  day_of_week + start_time/end_time `time` (weekly) OR start_dt/end_dt `timestamptz` (one-off),
  reason, created_by, is_active. CHECK: weekly ⇒ day_of_week+times present; one-off ⇒ datetimes present.
- **`groups`** — org node: name, `parent_id uuid references groups(id)`, leader_id,
  `leader_role user_role`, member_count. (Note the model quirk: a node's identity is its
  leader's user id — but a dedicated `groups` table is cleaner than overloading users;
  the scope walk uses `users.parent_id`, not this table — see §4.)
- **`audit_log`** — `action audit_action`, `entity_type audit_entity`, entity_id,
  user_id (actor), user_name, details, `before jsonb`, `after jsonb`, reason,
  `related_user_ids uuid[]`, `timestamp timestamptz default now()`. Append-only; written
  by triggers (SECURITY DEFINER), never by clients.
- **`tag_definitions`** — catalog (id text PK matching `^[a-z0-9_]{3,32}$`, label, is_system)
  for the Tags-tab CRUD (`canManageTagDefinitions` = Overseer+). Actual tag assignment
  stays `users.tags text[]` (Decision D-3: low frontend churn; `'teacher' = ANY(tags)`
  is trivial for the booking CHECK).
- Curriculum (35 studies): **not a table** — stays `src/lib/curriculum.ts` reference data;
  `contacts.subjects_studied` stores titles.

## 4. The org-tree scope functions (THE CRUX)

Scope is the **descendant closure over `users.parent_id`** (groupId/locationId are NOT
used for scope). `S(V) = {V} ∪ {u : u.parent_id ∈ S(V)}`.

```sql
-- who am I (fails closed if unauthenticated)
create function auth_role() returns user_role language sql stable security definer set search_path=public as $$
  select role from users where id = auth.uid()
$$;
create function auth_level() returns int language sql stable as $$ select role_level(auth_role()) $$;
create function is_leader()     returns bool language sql stable as $$ select coalesce(auth_level() >= 1, false) $$;
create function is_admin_tier() returns bool language sql stable as $$ select coalesce(auth_level() >= 3, false) $$;

-- descendant closure of an arbitrary root (used for the current viewer via auth.uid())
create function subtree_user_ids(root uuid) returns setof uuid language sql stable security definer set search_path=public as $$
  with recursive s as (
    select id from users where id = root
    union                                   -- UNION (not ALL) => cycle-safe, terminates
    select u.id from users u join s on u.parent_id = s.id
  ) select id from s
$$;
```

Two reusable predicates encode the **visibility vs manageable split** (Decision-10):

```sql
-- READ membership: Branch Leader+ see everything; below that, own subtree only.
create function can_read_owner(owner uuid) returns bool language sql stable as $$
  select is_admin_tier() or owner in (select subtree_user_ids(auth.uid()))
$$;

-- WRITE membership: ONLY Overseer/Dev unrestricted; Branch Leader is own-branch subtree.
create function can_write_owner(owner uuid) returns bool language sql stable as $$
  select coalesce(auth_level() >= 4, false)         -- overseer/dev = all
      or owner in (select subtree_user_ids(auth.uid()))  -- BL/GL/TL = descendant closure
$$;
```

## 5. RLS policies per table (the enforcement)

`alter table … enable row level security` on every table. Policies below are the load-
bearing ones; each maps to a cited helper. `INSERT` uses `with check`, `UPDATE` uses both.

### 5.1 users
```sql
-- READ: self, or any leader reads everyone (canViewUser, permissions.ts:81-85)
create policy users_select on users for select using ( id = auth.uid() or is_leader() );
-- UPDATE by others: canEditUser (level(target) <= level(viewer); only dev edits dev; member none; peer-edit ok)
create policy users_update_other on users for update using (
  id <> auth.uid()
  and auth_level() >= 1
  and role_level(role) <= auth_level()
  and (role <> 'dev' or auth_role() = 'dev')
) with check ( role_level(role) <= auth_level() and (role <> 'dev' or auth_role()='dev') );
-- SELF update is separate + field-restricted (SAFE_SELF_FIELDS) — do via an RPC that
-- whitelists first_name/last_name/phone/email/avatar_url, NOT a broad self-UPDATE policy
-- (a raw self-UPDATE policy can't restrict columns → privilege-escalation trap, permissions.ts:242).
```
`INSERT` (create user) is an **RPC** (`create_user`) that re-checks `canCreateUser`
(role ceiling + subtree for TL/GL, BL+ anywhere) — closes C-01/BE-5. Role change, deactivate,
reset-password, username-change, tag-manage are each their own RPC enforcing their exact
helper (§4.1 of the permissions map), because they mutate privileged columns that a generic
UPDATE must never touch.

### 5.2 contacts (Decision-10 split lives here)
```sql
-- READ: canViewContact — BL+ all; assigned/creator; or assigned/creator in my VISIBILITY subtree
create policy contacts_select on contacts for select using (
  is_admin_tier()
  or assigned_teacher_id = auth.uid()
  or created_by = auth.uid()
  or assigned_teacher_id in (select subtree_user_ids(auth.uid()))
  or created_by        in (select subtree_user_ids(auth.uid()))
);
-- EDIT/DELETE: canEditContact — ONLY overseer/dev unrestricted; member = own creations;
-- everyone else = creator/teacher in MANAGEABLE subtree (Branch Leader = own branch, NOT all)
create policy contacts_update on contacts for update using (
  auth_role() in ('overseer','dev')
  or (auth_level() = 0 and created_by = auth.uid())     -- member: own creations only
  or created_by = auth.uid()
  or created_by in (select subtree_user_ids(auth.uid()))
  or (assigned_teacher_id is not null and assigned_teacher_id in (select subtree_user_ids(auth.uid())))
);
```
DELETE denied (soft-delete via `set_contact_inactive` RPC → C-04). INSERT via `create_contact`
RPC (canCreateContact). **This closes KO-4 (POST/PUT/DELETE /contacts ungated) and the
GET /contacts unscoping.**

### 5.3 bookings (org-wide caretaking — NOT the split)
```sql
-- READ: everyone sees every calendar (PERMISSIONS.md:174)
create policy bookings_select on bookings for select using ( auth.uid() is not null );
-- EDIT: canEditBooking — creator/teacher, OR admin-tier ANY booking (isAdminTier, not the split),
-- OR TL/GL creator/teacher-in-subtree
create policy bookings_update on bookings for update using (
  created_by = auth.uid() or teacher_id = auth.uid() or is_admin_tier()
  or created_by in (select subtree_user_ids(auth.uid()))
  or (teacher_id is not null and teacher_id in (select subtree_user_ids(auth.uid())))
);
```
INSERT (create booking) via `create_booking` RPC so the **conflict checks run inside the
transaction** (§6). Cancel/restore/status are RPCs = `canEditBooking`.

### 5.4 blocked_slots
```sql
create policy blocked_select on blocked_slots for select using ( auth.uid() is not null );
create policy blocked_write  on blocked_slots for all    using ( is_admin_tier() ) with check ( is_admin_tier() );
```
(BL+ any slot, any branch — `canManageBlockedSlot` = isAdminTier.)

### 5.5 audit_log — closes KO-5 + KO-6
```sql
-- READ: BL+ only; relatedTo is VIEWER-ENFORCED (never caller-honored) — audit KO-6
create policy audit_select on audit_log for select using (
  is_admin_tier()                              -- admin tab (canSeeAdminTab 'audit')
  or user_id = auth.uid()                      -- the alerts feed: I'm the actor
  or auth.uid() = any(related_user_ids)        -- ...or I'm an affected user
);
-- APPEND-ONLY: no UPDATE/DELETE policy exists for anyone; INSERT only via SECURITY DEFINER triggers
create policy audit_no_insert on audit_log for insert with check ( false );
```
A Member can no longer pass `relatedTo=<anyone>` — the policy only returns rows where they
are the actor or in `related_user_ids`. Overseer/Dev/BL get the admin view via `is_admin_tier()`.

### 5.6 metrics/reports — closes KO-3
No `metrics` table; `TeacherMetrics` is computed. Expose it as a `SECURITY INVOKER` view
or an RPC `teacher_metrics()` that **starts with `if not can_access_reports() then raise
exception 'PERMISSION_DENIED'`** (level ≥ branch_leader) and scopes rows to the manageable
subtree for Branch Leader, all for Overseer/Dev. A Team Leader with no Reports access gets
403 — the exact gap the audit caught.

### 5.7 groups / areas / rooms / tags
- **groups**: SELECT = authenticated (org page visible to all; per-node subtree filtering is
  a UI concern). create/rename/deactivate via RPCs enforcing `canCreateGroupNode` /
  `canRenameGroup` / `canDeactivateGroup` (BL own-branch for group/team; branch-level =
  Overseer+ — L-01).
- **areas/rooms**: SELECT = authenticated; write = `is_admin_tier()` (any area, no subtree).
- **tag_definitions**: SELECT = admin-tier (Tags tab); write = `auth_level() >= 4`
  (`canManageTagDefinitions`, Overseer+).
- **export/import** (Decision-13 floor): enforced in the export RPC — `is_admin_tier()` →
  allow; `auth_level() < 2` → deny (Member/TL never, even with a group override);
  GL → the resolved per-group `export_import_enabled` flag. `canExportMemberList` = level ≥ 2.

## 6. Triggers + RPC (logic RLS can't express)

- **Booking conflict — `BEFORE INSERT OR UPDATE ON bookings`** raises on: overlap with an
  active blocked slot for the area (weekly day+time or one-off range), room double-booking,
  teacher cross-area double-booking. `raise exception using errcode='...' , message=...` →
  the client maps to `409 BLOCKED_SLOT_CONFLICT / ROOM_CONFLICT / TEACHER_CONFLICT`.
  **Runs before any role gate, for every role incl. Dev** → the "no one overrides" universal
  is enforced by construction.
- **Audit emission — `AFTER INSERT/UPDATE/DELETE`** triggers (SECURITY DEFINER) on users,
  contacts, bookings, blocked_slots, areas, rooms, groups, tags → write the `audit_log` row
  with before/after JSON + `related_user_ids`. **Closes H-01** (audit can't be forgotten or
  bypassed — it's not caller-dependent). Password-reset trigger records that a reset happened,
  **never the temp password**.
- **Contact study side-effects — trigger on bookings** when a `type` bible-study booking with
  a `contact_id` flips to `completed`: bump `contacts.total_sessions`, `last_session_date`,
  `currently_studying`, merge `subjects_studied` (mirrors the mock's CONT-6 behavior).
- **Cascade deactivate — RPC** stamps a shared `deactivated_cascade_id` so restore doesn't
  resurrect independently-deactivated users.
- **teacher-tag booking rule — trigger/CHECK**: a booking's `teacher_id` must reference an
  active user whose `tags @> '{teacher}'`.
- **Auth events**: emit `login_success` / `login_failed` audit rows via a Supabase Auth hook
  (or the sign-in RPC).

## 7. KO-gap closure map (audit → mechanism)

| Audit / gap | Closed by |
|---|---|
| **KO-3** `/metrics/teachers` ungated | `teacher_metrics()` RPC guards on `can_access_reports()` (§5.6) |
| **KO-4** `/contacts` POST/PUT/DELETE ungated + GET unscoped | contacts RLS + create/update/soft-delete RPCs (§5.2) |
| **KO-5** `/audit-log` unscoped | `audit_select` policy: admin-tier or actor/related only (§5.5) |
| **KO-6** `relatedTo` caller-honored | same policy — viewer-enforced, `relatedTo` param ignored (§5.5) |
| C-1 route enforcement | RLS makes `/admin`,`/reports` data inaccessible regardless of route reach |
| C-2 httpOnly cookie | `@supabase/ssr` (§1) |
| C-04 soft-delete contacts | DELETE denied + `set_contact_inactive` RPC (§5.2) |
| C-05 username regex | CHECK on `users.username` (§3) |
| H-01 audit emission | AFTER triggers (§6) |
| #11-b actorId spoof | actor = `auth.uid()` only (§1) |
| blocked-slot override | BEFORE INSERT/UPDATE trigger (§6) |

## 8. Frontend rewire (thin, flag-gated)

- Add `@supabase/supabase-js` + `@supabase/ssr`. One client from `NEXT_PUBLIC_SUPABASE_URL`
  + anon key (`reference_supabase_gospel_central`).
- `src/lib/api/client.ts` stays the single source of the base + a mode switch:
  `NEXT_PUBLIC_MOCK_API=true` → MSW (dev/tests, unchanged); else → supabase-js.
- `src/lib/api/*` modules: reads → `supabase.from(...).select()` (RLS scopes them); writes
  that need transaction/logic → `supabase.rpc('create_booking', …)` etc.
- `auth-store` → Supabase session (`getSession` / `onAuthStateChange`); drop the localStorage
  token mirror. `src/proxy.ts` middleware → `@supabase/ssr` cookie refresh + the public-route
  gate stays.
- Login form: `username → email` lookup then `signInWithPassword` (Decision D-1).
- **MSW stays** as the dev/test/demo backend — the audit harness + the vitest/e2e suites keep
  working against it.

## 9. Open decisions (need your call)

- **D-1 Login identity:** keep username (resolve → email before sign-in) **[recommended]**,
  or migrate the UI to email login? Usernames are load-bearing in the current UI.
- **D-2 Role source for RLS:** helper reads `public.users` **[recommended — instant
  revocation]** vs JWT custom-claims hook (faster, but role changes lag a token refresh).
- **D-3 Tags:** `users.tags text[]` **[recommended — least churn]** vs a `user_tags` join
  table (stricter integrity).
- **D-4 Server logic home:** DB triggers + RPC **[recommended — RLS-native, unbypassable]**
  vs Supabase Edge Functions vs a thin server route layer.
- **D-5 Seed:** port the 132-user `scenario-church-week` to a SQL seed (needs auth users
  created via the admin API with a known password) vs start minimal? Passwords: the mock's
  universal `admin` won't carry over — decide the seed-user password scheme.
- **D-6 Migration tooling:** Supabase CLI local dev (Docker + DB password from the dashboard)
  vs dashboard SQL editor for first cut.

## 10. Phased rollout

1. **Schema** migration: enums, tables, `role_level`, scope functions, RLS policies. Verify
   with `set role`/`request.jwt` simulation of each of the 6 roles against a tiny seed.
2. **Logic** migration: conflict + audit + side-effect triggers, the RPCs (create/update/
   soft-delete/role-change/tag/export/metrics).
3. **Seed** (D-5): port the church-week scenario so the app looks identical to today.
4. **Frontend swap behind the flag**, read-paths first (bookings/contacts/users GET) — prove
   RLS returns the same rows the mock scoped; then write-paths via RPC; then auth cutover.
5. **Auth cutover**: Supabase Auth + httpOnly cookies replace mock login (C-2).
6. **Parity gate**: re-run vitest + e2e (they hit MSW) AND a new RLS policy test suite
   (assert each role sees/edits exactly the documented rows — port `permissions.test.ts`
   cells into SQL/integration tests). Then re-run the UI-audit harness against the
   Supabase-backed deploy; the KO-3/4/5/6 probes must now return 403/scoped, not 200.

## 11. First concrete step (on your go)

Write `supabase/migrations/0001_schema.sql` (enums + tables + `role_level` + the four scope
functions + RLS policies from §4–5) and a `0002_logic.sql` (triggers + RPCs from §6), then
apply to `imjsdsepmhgazracegog` and smoke-test role scoping with the service key. I can
scaffold `0001` in full next.
