// scripts/verify-schema.mjs — turn "migration N is applied" from passdown prose into a
// command that can FAIL.
//
// There is NO supabase_migrations ledger on this project (the 15 migrations were
// hand-applied via the Management API), so "applied vs committed" was unverifiable
// prose. This script asserts, for every supabase/migrations/00NN_*.sql, a MARKER that
// migration introduced — derived by READING the migration file (each assertion cites
// its source line) — plus the overall schema shape.
//
// HONEST SEMANTICS: a green run means "marker N exists / has shape X in the live DB",
// NOT "migration N was applied cleanly" (unprovable retroactively — which is exactly
// why there is deliberately no ledger backfill). For create-or-replace chains
// (audit_row 0002→0012→0013→0015, set_contact_teacher 0007→0012→0014,
// booking_completion_sideeffect 0002→0009→0011) each marker is text that must SURVIVE
// into the chain's final body, so every link in the chain stays checkable.
//
// Read-only: information_schema / pg_catalog SELECTs only. Creates nothing.
// Transport: same Management-API pattern as scripts/sbq.mjs (SB_PAT env var, sbp_...).
//
// usage: SB_PAT=sbp_... node scripts/verify-schema.mjs

const REF = 'imjsdsepmhgazracegog';
const PAT = process.env.SB_PAT;
if (!PAT) {
  console.error('SB_PAT env var is required (Supabase personal access token, sbp_...)');
  process.exit(2);
}

async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

// ---------- gather live schema (read-only) ----------
const tables = (await q(
  `select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1`,
)).map((r) => r.table_name);

const blockedCols = (await q(
  `select column_name from information_schema.columns where table_schema='public' and table_name='blocked_slots'`,
)).map((r) => r.column_name);

const auditCols = (await q(
  `select column_name from information_schema.columns where table_schema='public' and table_name='audit_log'`,
)).map((r) => r.column_name);

const funcRows = await q(
  `select p.proname n, pg_get_functiondef(p.oid) d from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public'`,
);
const funcs = new Map(); // name -> concatenated defs (overload-safe)
for (const r of funcRows) funcs.set(r.n, (funcs.get(r.n) ?? '') + '\n' + r.d);

const trigRows = await q(
  `select t.tgname n, c.relname r from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace ns on ns.oid=c.relnamespace where ns.nspname='public' and not t.tgisinternal`,
);
const trigs = new Set(trigRows.map((r) => `${r.n}@${r.r}`));

const authTrig = await q(
  `select t.tgname n from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace ns on ns.oid=c.relnamespace where ns.nspname='auth' and not t.tgisinternal and t.tgname='on_auth_user_created'`,
);

const polRows = await q(
  `select tablename t, policyname n, coalesce(qual,'') q, coalesce(with_check,'') w from pg_policies where schemaname='public'`,
);
const pols = new Map(polRows.map((r) => [`${r.n}@${r.t}`, r]));

const [userParity] = await q(
  `select (select count(*) from auth.users)::int au, (select count(*) from public.users)::int pu`,
);

// ---------- assertion helpers ----------
const results = [];
const A = (mig, marker, ok, detail = '') => results.push({ mig, marker, ok, detail });
const fnHas = (name, needle) => (funcs.get(name) ?? '').includes(needle);
const fnLacks = (name, needle) => funcs.has(name) && !(funcs.get(name) ?? '').includes(needle);

// ---------- per-migration markers (each cites the migration line it derives from) ----------
// 0001_schema.sql
for (const t of ['areas', 'rooms', 'users', 'groups', 'contacts', 'contact_timeline', 'bookings', 'blocked_slots', 'tag_definitions', 'audit_log'])
  A('0001', `table ${t}`, tables.includes(t)); // 0001:39,46,58,85,98,132,144,174,194,201
A('0001', 'fn subtree_user_ids', funcs.has('subtree_user_ids')); // 0001:242
A('0001', 'trg users_set_updated', trigs.has('users_set_updated@users')); // 0001:82
A('0001', 'trg on_auth_user_created (auth.users)', authTrig.length === 1); // 0001:303
A('0001', 'policy users_select', pols.has('users_select@users')); // 0001:320

// 0002_logic.sql
for (const [t, r] of [['audit_users', 'users'], ['audit_contacts', 'contacts'], ['audit_bookings', 'bookings'], ['audit_blocked', 'blocked_slots'], ['audit_rooms', 'rooms'], ['audit_areas', 'areas'], ['audit_groups', 'groups']])
  A('0002', `trg ${t}`, trigs.has(`${t}@${r}`)); // 0002:140-146
A('0002', 'trg bookings_conflict_guard', trigs.has('bookings_conflict_guard@bookings')); // 0002:67
A('0002', 'trg bookings_teacher_tag_guard', trigs.has('bookings_teacher_tag_guard@bookings')); // 0002:83
A('0002', 'trg bookings_completion_sideeffect', trigs.has('bookings_completion_sideeffect@bookings')); // 0002:170
for (const f of ['audit_row', 'create_contact', 'set_contact_inactive', 'create_booking', 'cancel_booking', 'change_user_role', 'set_user_tags', 'teacher_metrics', 'teacher_metrics_guarded'])
  A('0002', `fn ${f}`, funcs.has(f)); // 0002:89,178,200,218,235,252,271,287,304

// 0003_admin_rpcs.sql
A('0003', 'fn create_user', funcs.has('create_user')); // 0003:17
A('0003', 'fn reset_user_password', funcs.has('reset_user_password')); // 0003:74

// 0004_orgnode_rpcs.sql
for (const f of ['resolve_export_import', 'can_export_import', 'reassign_user', 'reassign_contact', 'convert_contact'])
  A('0004', `fn ${f}`, funcs.has(f)); // 0004:13,27,39,62,85

// 0005_alignment_fixes.sql
for (const f of ['change_own_username', 'change_username', 'deactivate_user', 'restore_user'])
  A('0005', `fn ${f}`, funcs.has(f)); // 0005:50,62,82,96
for (const [p, t] of [['areas_update', 'areas'], ['rooms_insert', 'rooms'], ['rooms_update', 'rooms'], ['tagdef_insert', 'tag_definitions'], ['tagdef_update', 'tag_definitions']])
  A('0005', `policy ${p}`, pols.has(`${p}@${t}`)); // 0005:37,40,41,44,45

// 0006_blocked_slot_colnames.sql
A('0006', 'col blocked_slots.start_date_time', blockedCols.includes('start_date_time')); // 0006:10
A('0006', 'col blocked_slots.end_date_time', blockedCols.includes('end_date_time')); // 0006:11
A('0006', 'booking_conflict_guard uses start_date_time', fnHas('booking_conflict_guard', 'b.start_date_time < new.end_time')); // 0006:25

// 0007_write_gaps.sql
for (const f of ['set_contact_teacher', 'set_export_import_override', 'deactivate_user_cascade', 'restore_user_cascade'])
  A('0007', `fn ${f}`, funcs.has(f)); // 0007:10,31,45,61

// 0008_auth_observability.sql
A('0008', 'table error_log', tables.includes('error_log')); // 0008:45
A('0008', 'fn log_login_attempt', funcs.has('log_login_attempt')); // 0008:17
A('0008', 'policy error_log_insert', pols.has('error_log_insert@error_log')); // 0008:63
A('0008', 'policy error_log_select', pols.has('error_log_select@error_log')); // 0008:66

// 0009_fix_booking_completion_enum.sql — null-safe enum compare must survive 0011's body
A('0009', 'completion_sideeffect null-safe enum compare', fnHas('booking_completion_sideeffect', "old.status is distinct from 'completed'")); // 0009:25 (survives 0011:34)

// 0010_contact_stage_timeline.sql
A('0010', 'fn contact_stage_timeline', funcs.has('contact_stage_timeline')); // 0010:14
A('0010', 'trg contacts_stage_timeline', trigs.has('contacts_stage_timeline@contacts')); // 0010:50

// 0011_parity_flip_blockers.sql
A('0011', 'completion keyed on bible_study activity', fnHas('booking_completion_sideeffect', "is distinct from 'bible_study'")); // 0011:25
A('0011', 'completion reversal branch', fnHas('booking_completion_sideeffect', 'Study completion reverted')); // 0011:78
A('0011', 'convert idempotency guard', fnHas('convert_contact', 'ALREADY_CONVERTED')); // 0011:96
A('0011', 'convert retention window', fnHas('convert_contact', 'retain_until')); // 0011:106
A('0011', 'restore_cascade authz + cascade id', fnHas('restore_user_cascade', 'deactivated_cascade_id')); // 0011:124

// 0012_parity_audit_and_area_tier.sql
A('0012', "set_contact_teacher emits 'reassign' audit row", fnHas('set_contact_teacher', "'reassign', 'contact'")); // 0012:83 (survives 0014:36)
{
  const p = pols.get('areas_insert@areas'); // 0012:93-95 replaced 0005's admin-tier check
  A('0012', 'areas_insert requires auth_level() >= 4', !!p && /auth_level\(\)\s*>=\s*4/.test(p.w));
}

// 0013_audit_cancel_reason.sql — cancel-reason lift must survive 0015's audit_row
A('0013', 'audit_row lifts cancel_reason', fnHas('audit_row', 'cancel_reason')); // 0013:36 (survives 0015:56)

// 0014_reassign_scope_tier.sql — the target gate is scope-bound, NOT admin-tier.
// CHAIN NOTE: 0018 replaced 0014's own-subtree bound with manageable_user_ids
// (the user-approved BL cross-branch reversal) — 0014's surviving marker is
// that the raw 0012 admin-tier form stays gone; the scope-bound form now
// reads manageable_user_ids (asserted under 0018).
A('0014', 'retired 0012 admin-tier target gate ABSENT', fnLacks('set_contact_teacher', 'public.is_admin_tier() or teacher in')); // 0012:78 form must be gone

// 0015_contact_restore.sql
A('0015', 'fn set_contact_active', funcs.has('set_contact_active')); // 0015:13
A('0015', 'audit_row contact restore edge', fnHas('audit_row', "(to_jsonb(old)->>'status') = 'inactive' and (to_jsonb(new)->>'status') is distinct from 'inactive'")); // 0015:65

// 0016_feedback.sql (2026-07-18, feedback real-delivery)
A('0016', 'table feedback', tables.includes('feedback')); // 0016:24
A('0016', 'policy feedback_select', pols.has('feedback_select@feedback')); // 0016:56

// 0017_login_email_resolver.sql (2026-07-18, wizard-account login fix)
A('0017', 'fn login_email_for_username', funcs.has('login_email_for_username')); // 0017:20
A('0017', 'resolver is exact-match on lower(username)', fnHas('login_email_for_username', 'lower(u.username) = lower(left(trim(coalesce(uname')); // 0017:24

// 0018_bl_cross_branch_scope.sql (2026-07-21, USER-APPROVED BL cross-branch reversal)
A('0018', 'fn manageable_user_ids', funcs.has('manageable_user_ids')); // 0018:19
A('0018', 'manageable_user_ids unions ALL branch subtrees for a BL', fnHas('manageable_user_ids', "where bl.role = 'branch_leader'")); // 0018:26
A('0018', 'col audit_log.cross_branch', auditCols.includes('cross_branch')); // 0018:34
A('0018', 'audit_row computes cross_branch for BL actors', fnHas('audit_row', 'v_cross')); // 0018:92-99
{
  const p = pols.get('contacts_update@contacts'); // 0018: contacts_update on manageable scope
  A('0018', 'contacts_update gates on manageable_user_ids', !!p && /manageable_user_ids/.test(p.q));
}
A('0018', 'set_contact_teacher edit+target gates on manageable_user_ids', fnHas('set_contact_teacher', 'teacher in (select public.manageable_user_ids(auth.uid()))')); // 0018:150
A('0018', "set_contact_teacher 'reassign' row carries cross_branch", fnHas('set_contact_teacher', 'v_cross')); // 0018:158
A('0018', 'set_contact_inactive gates on manageable_user_ids', fnHas('set_contact_inactive', 'manageable_user_ids')); // 0018:172
A('0018', 'set_contact_active gates on manageable_user_ids', fnHas('set_contact_active', 'manageable_user_ids')); // 0018:188
A('0018', 'reassign_contact gates on manageable_user_ids', fnHas('reassign_contact', 'manageable_user_ids')); // 0018:204
A('0018', 'convert_contact gates on manageable_user_ids', fnHas('convert_contact', 'manageable_user_ids')); // 0018:226

// ---------- shape baseline (derived from the files, not from survey prose) ----------
// tables: 10 (0001) + error_log (0008) + feedback (0016) = 12
A('shape', `tables == 12 (live ${tables.length})`, tables.length === 12);
// functions: 12(0001)+12(0002)+2(0003)+5(0004)+4(0005)+4(0007)+1(0008)+1(0010)+1(0015)+1(0017)+1(0018) = 44
A('shape', `functions == 44 (live ${funcs.size})`, funcs.size === 44);
// public non-internal triggers: 3(0001)+10(0002)+1(0010) = 14 (+ on_auth_user_created in auth).
// NOTE: the 2026-07-14 survey prose said "19 triggers" — that number is not derivable from
// the migration files (G7), so the FILE-derived 14 is asserted here.
A('shape', `public triggers == 14 (live ${trigs.size})`, trigs.size === 14);
// policies: 19 (0001) - 3 dropped (0005) + 6 (0005) + 2 (0008) + 1 (0016) = 25
A('shape', `policies == 25 (live ${pols.size})`, pols.size === 25);
A('shape', `auth.users == public.users (${userParity.au} vs ${userParity.pu})`, userParity.au === userParity.pu);

// ---------- report ----------
let fails = 0;
let lastMig = '';
for (const r of results) {
  if (r.mig !== lastMig) { console.log(`\n— ${r.mig} —`); lastMig = r.mig; }
  console.log(`  ${r.ok ? 'OK     ' : 'MISSING'}  ${r.marker}${r.detail ? `  (${r.detail})` : ''}`);
  if (!r.ok) fails++;
}
console.log(`\n${results.length - fails}/${results.length} markers OK${fails ? ` — ${fails} MISSING` : ''}`);
process.exit(fails ? 1 : 0);
