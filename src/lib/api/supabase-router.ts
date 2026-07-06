// Supabase read/write router (Phase B). Dispatched from client.ts request() when
// NEXT_PUBLIC_MOCK_API !== 'true'. Translates the frontend's REST-style (method, path)
// calls into supabase-js queries/RPCs and returns CAMELCASE data via the sb() helpers,
// so every src/lib/api/* module + the UI stay unchanged. Spec: 3-agent router map.

import { supabase, sb, rpc, camelize, snakeize, pgErrorToApiError } from './supabase';
import { ApiError } from './client';
import { buildOrgTree } from '../utils/org-tree';
import type { User, TeacherMetrics } from '../types/user';

/* ---- helpers ---- */
const ACTOR_KEYS = ['actorId', 'createdById', 'userId', 'actor'];
const strip = (b: Record<string, unknown> | undefined) => {
  if (!b) return {};
  const o = { ...b };
  for (const k of ACTOR_KEYS) delete o[k];
  return o;
};
// mock derives retentionExpired on read (retainUntil < now); Postgres doesn't return it.
const deriveRetention = <T extends { retainUntil?: string | null }>(rows: T[]): T[] =>
  rows.map((c) => (c.retainUntil && Date.parse(c.retainUntil) < Date.now() ? { ...c, retentionExpired: true } : c));
// teacher_metrics_guarded (0007) returns 6 of the 7 fields; activeStudents mirrors total (mock parity).
const mapMetrics = (r: { userId: string; totalStudents: number; currentlyStudying: number; continuedStudying: number; baptizedSinceStudying: number; totalSessionsLed: number }): TeacherMetrics => ({
  userId: r.userId, totalStudents: r.totalStudents, activeStudents: r.totalStudents,
  currentlyStudying: r.currentlyStudying, continuedStudying: r.continuedStudying,
  baptizedSinceStudying: r.baptizedSinceStudying, totalSessionsLed: r.totalSessionsLed,
});
// temp password for admin-created / converted / reset users (must_change_password forces rotation).
const tempPassword = () => 'Gc-' + Math.random().toString(36).slice(2, 10) + 'X9';
const genUsername = (first: string, last: string) =>
  (`${first}${last}`.toLowerCase().replace(/[^a-z0-9]/g, '') || 'user').slice(0, 24) + Math.floor(Math.random() * 900 + 100);
async function authUid(): Promise<string> {
  const { data } = await supabase().auth.getUser();
  if (!data.user) throw new ApiError({ status: 401, code: 'UNAUTHORIZED', message: 'No session' });
  return data.user.id;
}

type Ctx = { id?: string; sub?: string; qs: URLSearchParams; body: Record<string, unknown> };
type Handler = (c: Ctx) => Promise<unknown>;
interface Route { method: string; re: RegExp; h: Handler }

/* ---- routes (ordered: concrete before param before collection) ---- */
const R: Route[] = [
  // ---------- AUTH (Phase C: cookie sessions via @supabase/ssr in supabase.ts) ----------
  // username -> email convention (seed uses <username>@diamond.org). signInWithPassword
  // establishes the supabase-js session that authenticates every subsequent router read.
  // Both outcomes are mirrored into public.audit_log via the anon-executable
  // log_login_attempt RPC (migration 0008) — fire-and-forget so a missing/old
  // backend can never break login itself.
  { method: 'POST', re: /^\/login$/, h: async ({ body }) => {
    const username = String(body.username || '');
    const email = username.includes('@') ? username : `${username}@diamond.org`;
    const { data, error } = await supabase().auth.signInWithPassword({ email, password: String(body.password || '') });
    if (error || !data.session) {
      void supabase().rpc('log_login_attempt', { uname: username.slice(0, 64), success: false }).then(() => {}, () => {});
      throw new ApiError({ status: 401, code: 'UNAUTHORIZED', message: 'Invalid credentials', details: error });
    }
    void supabase().rpc('log_login_attempt', { uname: username.slice(0, 64), success: true }).then(() => {}, () => {});
    const profile = await sb<User>(supabase().from('users').select('*').eq('id', data.user!.id).single());
    const flag = await rpc<boolean>('can_export_import').catch(() => false);
    return { token: data.session.access_token, user: { ...profile, exportImportEnabled: flag } };
  } },
  { method: 'POST', re: /^\/logout$/, h: async () => { await supabase().auth.signOut(); return {}; } },
  // ErrorBoundary/WebGLGuard crash reports -> public.error_log (migration 0008).
  // Explicit field mapping (NOT blind snakeize): viewerId is 'anonymous' or a mock
  // slug in some payloads — only a real uuid may reach the uuid column.
  { method: 'POST', re: /^\/error-log$/, h: async ({ body }) => {
    const vid = typeof body.viewerId === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.viewerId)
      ? body.viewerId : null;
    const s = (v: unknown, max: number) => (v == null ? null : String(v).slice(0, max));
    const { error } = await supabase().from('error_log').insert({
      user_id: vid,
      user_role: s(body.viewerRole, 32),
      username: s(body.viewerUsername, 64),
      url: s(body.url, 512),
      message: s(body.message, 2000) ?? 'unknown',
      stack: s(body.stack, 8000),
      component_stack: s(body.componentStack, 8000),
      user_agent: s(body.userAgent, 512),
    } as never);
    if (error) throw pgErrorToApiError(error);
    return { ok: true };
  } },
  // ---------- READS ----------
  { method: 'GET', re: /^\/me$/, h: async () => {
    const uid = await authUid();
    const profile = await sb<User>(supabase().from('users').select('*').eq('id', uid).single());
    const flag = await rpc<boolean>('can_export_import').catch(() => false);
    return { ...profile, exportImportEnabled: flag };
  } },
  { method: 'GET', re: /^\/bookings\/([^/?]+)$/, h: async ({ id }) =>
    sb(supabase().from('bookings').select('*').eq('id', id).maybeSingle()).then((r) => {
      if (!r) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Booking not found' });
      return r;
    }) },
  { method: 'GET', re: /^\/bookings$/, h: async ({ qs }) => {
    let q = supabase().from('bookings').select('*');
    const s = qs.get('start'), e = qs.get('end'), a = qs.get('areaId'), rm = qs.get('roomId');
    if (s) q = q.gte('start_time', s);
    if (e) q = q.lt('start_time', e);
    if (a) q = q.eq('area_id', a);
    if (rm) q = q.eq('room_id', rm);
    return sb(q.order('start_time'));
  } },
  { method: 'GET', re: /^\/contacts\/([^/?]+)$/, h: async ({ id }) => {
    const c = await sb<{ retainUntil?: string | null } | null>(supabase().from('contacts').select('*').eq('id', id).maybeSingle());
    if (!c) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Contact not found' });
    return deriveRetention([c])[0];
  } },
  { method: 'GET', re: /^\/contacts$/, h: async ({ qs }) => {
    // Hide soft-deleted contacts (status='inactive') from the main list — matches the mock.
    let q = supabase().from('contacts').select('*').neq('status', 'inactive');
    const type = qs.get('type'), stage = qs.get('stage'), search = qs.get('search') || qs.get('q');
    if (type && type !== 'all') q = q.eq('type', type);
    if (stage && stage !== 'all') q = q.eq('pipeline_stage', stage);
    if (search) { const s = search.replace(/[%,]/g, ''); q = q.or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%,group_name.ilike.%${s}%`); }
    const sort = qs.get('sort'), desc = qs.get('sortDir') === 'desc';
    if (sort === 'sessions') q = q.order('total_sessions', { ascending: !desc });
    else if (sort === 'stage') q = q.order('pipeline_stage', { ascending: !desc });
    else if (sort === 'updated') q = q.order('updated_at', { ascending: !desc });
    else q = q.order('first_name', { ascending: !desc }).order('last_name', { ascending: !desc });
    return deriveRetention(await sb<{ retainUntil?: string | null }[]>(q));
  } },
  { method: 'GET', re: /^\/areas$/, h: async ({ qs }) => {
    if (qs.get('includeInactive')) return sb(supabase().from('areas').select('*, rooms(*)').order('name'));
    return sb(supabase().from('areas').select('*, rooms(*)').eq('is_active', true).eq('rooms.is_active', true).order('name'));
  } },
  { method: 'GET', re: /^\/blocked-slots$/, h: async ({ qs }) => {
    let q = supabase().from('blocked_slots').select('*').eq('is_active', true);
    const a = qs.get('areaId');
    if (a) q = q.or(`scope.eq.global,area_id.eq.${a}`);
    return sb(q);
  } },
  { method: 'GET', re: /^\/groups\/tree$/, h: async () => {
    const users = await sb<User[]>(supabase().from('users').select('*'));
    const metricsRaw = await rpc<Parameters<typeof mapMetrics>[0][]>('teacher_metrics_guarded').catch(() => []);
    const areas = await sb<{ id: string; name: string }[]>(supabase().from('areas').select('id, name'));
    return buildOrgTree(users, metricsRaw.map(mapMetrics), areas as never);
  } },
  { method: 'GET', re: /^\/users$/, h: async () =>
    sb(supabase().from('users').select('*').order('first_name').order('last_name')) },
  { method: 'GET', re: /^\/metrics\/teachers$/, h: async ({ qs }) => {
    const rows = (await rpc<Parameters<typeof mapMetrics>[0][]>('teacher_metrics_guarded')).map(mapMetrics);
    const uid = qs.get('userId');
    return uid ? rows.filter((r) => r.userId === uid) : rows;
  } },
  { method: 'GET', re: /^\/settings\/export-import$/, h: async () => {
    const users = await sb<{ id: string; exportImportEnabled: boolean | null }[]>(supabase().from('users').select('id, export_import_enabled'));
    const overrides: Record<string, boolean> = {};
    for (const u of users) if (u.exportImportEnabled != null) overrides[u.id] = u.exportImportEnabled;
    return { overrides, default: false };
  } },
  { method: 'GET', re: /^\/audit-log$/, h: async ({ qs }) => {
    const page = Number(qs.get('page') || 1), limit = Number(qs.get('limit') || 50);
    let q = supabase().from('audit_log').select('*', { count: 'exact' }).order('timestamp', { ascending: false });
    const action = qs.get('action'), et = qs.get('entityType'), uid = qs.get('userId'), rel = qs.get('relatedTo'), search = qs.get('search'), sd = qs.get('startDate'), ed = qs.get('endDate');
    if (action) q = q.eq('action', action);
    if (et) q = q.eq('entity_type', et);
    if (uid) q = q.eq('user_id', uid);
    if (rel) q = q.or(`user_id.eq.${rel},related_user_ids.cs.{${rel}}`);
    if (search) { const s = search.replace(/[%,]/g, ''); q = q.or(`details.ilike.%${s}%,user_name.ilike.%${s}%,entity_id.ilike.%${s}%`); }
    if (sd) q = q.gte('timestamp', sd);
    if (ed) q = q.lte('timestamp', ed);
    const from = (page - 1) * limit;
    const { data, error, count } = await q.range(from, from + limit - 1);
    if (error) throw pgErrorToApiError(error);
    return { entries: camelize(data), total: count ?? 0, page, limit };
  } },

  // ---------- WRITES ----------
  { method: 'POST', re: /^\/bookings$/, h: ({ body }) => rpc('create_booking', { p: snakeize(strip(body)) }) },
  { method: 'PUT', re: /^\/bookings\/([^/?]+)$/, h: ({ id, body }) => sb(supabase().from('bookings').update(snakeize(strip(body)) as never).eq('id', id!).select().single()) },
  { method: 'POST', re: /^\/bookings\/([^/?]+)\/cancel$/, h: ({ id, body }) => rpc('cancel_booking', { bid: id, p_reason: body.reason }) },
  { method: 'POST', re: /^\/bookings\/([^/?]+)\/restore$/, h: ({ id }) => sb(supabase().from('bookings').update({ status: 'bible_study', cancelled_at: null, cancel_reason: null, cancelled_by: null } as never).eq('id', id!).select().single()) },
  { method: 'PATCH', re: /^\/bookings\/([^/?]+)\/status$/, h: ({ id, body }) => sb(supabase().from('bookings').update({ status: body.status } as never).eq('id', id!).select().single()) },
  { method: 'POST', re: /^\/contacts$/, h: ({ body }) => rpc('create_contact', { p: snakeize(strip(body)) }) },
  { method: 'PUT', re: /^\/contacts\/([^/?]+)$/, h: async ({ id, body }) => {
    const b = strip(body) as Record<string, unknown>;
    // assigned_teacher_id / created_by are NOT update-granted; teacher reassign goes via RPC.
    if ('assignedTeacherId' in b) { await rpc('set_contact_teacher', { cid: id, teacher: b.assignedTeacherId }); delete b.assignedTeacherId; }
    delete b.createdBy;
    return Object.keys(b).length
      ? sb(supabase().from('contacts').update(snakeize(b) as never).eq('id', id!).select().single())
      : sb(supabase().from('contacts').select('*').eq('id', id!).single());
  } },
  { method: 'DELETE', re: /^\/contacts\/([^/?]+)$/, h: ({ id }) => rpc('set_contact_inactive', { cid: id }) },
  { method: 'POST', re: /^\/contacts\/([^/?]+)\/convert$/, h: async ({ id, body }) => {
    const contact = await sb<{ firstName: string; lastName: string; email?: string }>(supabase().from('contacts').select('*').eq('id', id!).single());
    const username = genUsername(contact.firstName, contact.lastName);
    const p = { ...strip(body), username, email: contact.email || `${username}@diamond.org`, password: tempPassword(), mustChangePassword: true };
    const user = await rpc('convert_contact', { cid: id, p: snakeize(p) });
    return { user, contact: await sb(supabase().from('contacts').select('*').eq('id', id!).single()) };
  } },
  { method: 'POST', re: /^\/users$/, h: ({ body }) => {
    const b = strip(body) as Record<string, unknown>;
    const username = (b.username as string) || genUsername(String(b.firstName || ''), String(b.lastName || ''));
    return rpc('create_user', { p: snakeize({ ...b, username, email: b.email || `${username}@diamond.org`, password: tempPassword(), mustChangePassword: true }) });
  } },
  { method: 'POST', re: /^\/users\/([^/?]+)\/reset-password$/, h: async ({ id }) => {
    const pw = tempPassword();
    await rpc('reset_user_password', { target: id, new_password: pw });
    return { tempPassword: pw, user: await sb(supabase().from('users').select('*').eq('id', id!).single()) };
  } },
  { method: 'POST', re: /^\/users\/([^/?]+)\/change-password$/, h: async ({ id, body }) => {
    await sb(supabase().auth.updateUser({ password: String(body.newPassword) }));
    return sb(supabase().from('users').update({ must_change_password: false } as never).eq('id', id!).select().single());
  } },
  { method: 'PUT', re: /^\/users\/([^/?]+)\/tags$/, h: ({ id, body }) => rpc('set_user_tags', { target: id, new_tags: body.tags }) },
  { method: 'PUT', re: /^\/users\/([^/?]+)\/username$/, h: ({ id, body }) => rpc('change_username', { target: id, new_name: body.username }) },
  { method: 'POST', re: /^\/users\/([^/?]+)\/deactivate$/, h: async ({ id, body }) => {
    if (body.cascade) { const n = await rpc<number>('deactivate_user_cascade', { target: id }); return { ...(await sb(supabase().from('users').select('*').eq('id', id!).single()) as object), deactivatedCount: n }; }
    return rpc('deactivate_user', { target: id });
  } },
  { method: 'POST', re: /^\/users\/([^/?]+)\/restore$/, h: async ({ id, body }) => {
    if (body.cascade) { const n = await rpc<number>('restore_user_cascade', { target: id }); return { ...(await sb(supabase().from('users').select('*').eq('id', id!).single()) as object), restoredCount: n }; }
    return rpc('restore_user', { target: id });
  } },
  { method: 'PUT', re: /^\/settings\/export-import$/, h: async ({ body }) => {
    await rpc('set_export_import_override', { node: body.nodeId, val: body.value });
    const users = await sb<{ id: string; exportImportEnabled: boolean | null }[]>(supabase().from('users').select('id, export_import_enabled'));
    const overrides: Record<string, boolean> = {};
    for (const u of users) if (u.exportImportEnabled != null) overrides[u.id] = u.exportImportEnabled;
    return { overrides, default: false };
  } },
  { method: 'PUT', re: /^\/users\/([^/?]+)$/, h: ({ id, body }) => {
    const SAFE = ['firstName', 'lastName', 'phone', 'avatarUrl', 'gender'];
    const patch: Record<string, unknown> = {};
    for (const k of SAFE) if (k in body) patch[k] = body[k];
    return sb(supabase().from('users').update(snakeize(patch) as never).eq('id', id!).select().single());
  } },
  { method: 'PUT', re: /^\/areas\/([^/?]+)$/, h: ({ id, body }) => sb(supabase().from('areas').update(snakeize(strip(body)) as never).eq('id', id!).select('*, rooms(*)').single()) },
  { method: 'POST', re: /^\/areas\/([^/?]+)\/deactivate$/, h: ({ id }) => sb(supabase().from('areas').update({ is_active: false } as never).eq('id', id!).select('*, rooms(*)').single()) },
  { method: 'POST', re: /^\/areas\/([^/?]+)\/restore$/, h: ({ id }) => sb(supabase().from('areas').update({ is_active: true } as never).eq('id', id!).select('*, rooms(*)').single()) },
  { method: 'POST', re: /^\/areas\/([^/?]+)\/rooms$/, h: ({ id, body }) => sb(supabase().from('rooms').insert({ ...snakeize(strip(body)) as object, area_id: id } as never).select().single()) },
  { method: 'POST', re: /^\/areas$/, h: ({ body }) => sb(supabase().from('areas').insert(snakeize(strip(body)) as never).select('*, rooms(*)').single()) },
  { method: 'PUT', re: /^\/rooms\/([^/?]+)$/, h: ({ id, body }) => sb(supabase().from('rooms').update(snakeize(strip(body)) as never).eq('id', id!).select().single()) },
  { method: 'POST', re: /^\/rooms\/([^/?]+)\/deactivate$/, h: ({ id }) => sb(supabase().from('rooms').update({ is_active: false } as never).eq('id', id!).select().single()) },
  { method: 'POST', re: /^\/rooms\/([^/?]+)\/restore$/, h: ({ id }) => sb(supabase().from('rooms').update({ is_active: true } as never).eq('id', id!).select().single()) },
  { method: 'POST', re: /^\/blocked-slots$/, h: ({ body }) => sb(supabase().from('blocked_slots').insert(snakeize(strip(body)) as never).select().single()) },
  { method: 'PUT', re: /^\/blocked-slots\/([^/?]+)$/, h: ({ id, body }) => sb(supabase().from('blocked_slots').update(snakeize(strip(body)) as never).eq('id', id!).select().single()) },
  { method: 'DELETE', re: /^\/blocked-slots\/([^/?]+)$/, h: ({ id }) => sb(supabase().from('blocked_slots').update({ is_active: false } as never).eq('id', id!).select().single()) },
];

/** Dispatch a REST-style call to Supabase. Throws ApiError (from sb()) on failure. */
export async function supabaseRouter(method: string, path: string, body?: unknown): Promise<unknown> {
  const url = new URL(path, 'http://x');
  for (const route of R) {
    if (route.method !== method) continue;
    const m = route.re.exec(url.pathname);
    if (!m) continue;
    return route.h({ id: m[1], qs: url.searchParams, body: (body as Record<string, unknown>) || {} });
  }
  throw new ApiError({ status: 501, code: 'UNKNOWN', message: `No Supabase route for ${method} ${url.pathname}` });
}
