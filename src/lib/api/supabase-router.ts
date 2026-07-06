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
// teacher_metrics_guarded returns 4 of the 7 TeacherMetrics fields; fill the rest safely.
const mapMetrics = (r: { userId: string; totalStudents: number; currentlyStudying: number; totalSessionsLed: number }): TeacherMetrics => ({
  userId: r.userId, totalStudents: r.totalStudents, activeStudents: r.totalStudents,
  currentlyStudying: r.currentlyStudying, continuedStudying: 0, baptizedSinceStudying: 0,
  totalSessionsLed: r.totalSessionsLed,
});
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
  // ---------- AUTH (minimal; full httpOnly cutover is Phase C) ----------
  // username -> email convention (seed uses <username>@diamond.org). signInWithPassword
  // establishes the supabase-js session that authenticates every subsequent router read.
  { method: 'POST', re: /^\/login$/, h: async ({ body }) => {
    const username = String(body.username || '');
    const email = username.includes('@') ? username : `${username}@diamond.org`;
    const { data, error } = await supabase().auth.signInWithPassword({ email, password: String(body.password || '') });
    if (error || !data.session) throw new ApiError({ status: 401, code: 'UNAUTHORIZED', message: 'Invalid credentials', details: error });
    const profile = await sb<User>(supabase().from('users').select('*').eq('id', data.user!.id).single());
    const flag = await rpc<boolean>('can_export_import').catch(() => false);
    return { token: data.session.access_token, user: { ...profile, exportImportEnabled: flag } };
  } },
  { method: 'POST', re: /^\/logout$/, h: async () => { await supabase().auth.signOut(); return {}; } },
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
    let q = supabase().from('contacts').select('*');
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
  { method: 'PUT', re: /^\/contacts\/([^/?]+)$/, h: ({ id, body }) => sb(supabase().from('contacts').update(snakeize(strip(body)) as never).eq('id', id!).select().single()) },
  { method: 'DELETE', re: /^\/contacts\/([^/?]+)$/, h: ({ id }) => rpc('set_contact_inactive', { cid: id }) },
  { method: 'PUT', re: /^\/users\/([^/?]+)\/tags$/, h: ({ id, body }) => rpc('set_user_tags', { target: id, new_tags: body.tags }) },
  { method: 'PUT', re: /^\/users\/([^/?]+)\/username$/, h: ({ id, body }) => rpc('change_username', { target: id, new_name: body.username }) },
  { method: 'POST', re: /^\/users\/([^/?]+)\/deactivate$/, h: ({ id }) => rpc('deactivate_user', { target: id }) },
  { method: 'POST', re: /^\/users\/([^/?]+)\/restore$/, h: ({ id }) => rpc('restore_user', { target: id }) },
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
