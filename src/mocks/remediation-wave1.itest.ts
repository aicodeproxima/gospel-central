import { describe, it, expect, afterEach } from 'vitest';
import { API_BASE } from '@/lib/api/client';
import { resetMockState } from '@/mocks/handlers';

/**
 * Remediation wave-1 INTEGRATION pins — one test per fixed audit finding so a
 * regression re-opens the finding loudly. Finding numbers reference
 * `Case Study/Available Actions.md` cells (see REMEDIATION.md ledger).
 * Cell isolation: resetMockState between tests.
 */
const API = API_BASE;
afterEach(() => resetMockState());

async function login(username: string) {
  const r = await fetch(`${API}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'admin' }),
  });
  expect(r.status, `login ${username}`).toBe(200);
  return (await r.json()) as { token: string; user: { id: string; role: string } };
}
function authed(method: string, path: string, token: string | null, body?: unknown) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

describe('Remediation wave 1 — findings 78/151 (inactive list hygiene)', () => {
  it('GET /contacts excludes soft-deleted by default; includeInactive=1 restores them (admin surface)', async () => {
    const admin = await login('admin');
    const all = (await (await authed('GET', '/contacts', admin.token)).json()) as { id: string }[];
    expect(all.length).toBeGreaterThan(0);
    const victim = all[0];

    const del = await authed('DELETE', `/contacts/${victim.id}`, admin.token);
    expect(del.status).toBe(200);

    // Default list read: the deleted contact must NOT resurface (finding 78's
    // "bulk delete resurrects on refetch").
    const after = (await (await authed('GET', '/contacts', admin.token)).json()) as { id: string }[];
    expect(after.some((c) => c.id === victim.id)).toBe(false);

    // Admin read: includeInactive=1 must still surface it (finding 151's
    // dimmed-row display in ContactsAdminTab depends on this).
    const adminView = (await (
      await authed('GET', '/contacts?includeInactive=1', admin.token)
    ).json()) as { id: string; status?: string }[];
    const dimmed = adminView.find((c) => c.id === victim.id);
    expect(dimmed).toBeDefined();
    expect(dimmed?.status).toBe('inactive');
  });
});

describe('Remediation wave 2 — finding 151 (contact restore flow)', () => {
  it('POST /contacts/:id/restore revives a soft-deleted contact and writes a restore audit row', async () => {
    const admin = await login('admin');
    const all = (await (await authed('GET', '/contacts', admin.token)).json()) as { id: string }[];
    const victim = all[0];
    expect((await authed('DELETE', `/contacts/${victim.id}`, admin.token)).status).toBe(200);

    // Restoring a non-deleted contact is a 409, not a silent success.
    const other = all[1];
    expect((await authed('POST', `/contacts/${other.id}/restore`, admin.token)).status).toBe(409);

    const res = await authed('POST', `/contacts/${victim.id}/restore`, admin.token);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { contact: { status: string } };
    expect(body.contact.status).toBe('active');

    // Back in the default list read…
    const after = (await (await authed('GET', '/contacts', admin.token)).json()) as { id: string }[];
    expect(after.some((c) => c.id === victim.id)).toBe(true);

    // …and the audit trail shows the semantic restore action.
    const log = (await (
      await authed('GET', `/audit-log?action=restore&limit=9999`, admin.token)
    ).json()) as { entries: { entityType: string; entityId: string }[] };
    expect(log.entries.some((e) => e.entityType === 'contact' && e.entityId === victim.id)).toBe(true);
  });
});

describe('Remediation wave 1 — finding 497 (audit reason on cancel)', () => {
  it('POST /bookings/:id/cancel writes the structured audit reason field', async () => {
    const admin = await login('admin');
    const bookings = (await (await authed('GET', '/bookings', admin.token)).json()) as {
      id: string;
      status: string;
    }[];
    const target = bookings.find((b) => b.status !== 'cancelled');
    expect(target, 'need a non-cancelled seeded booking').toBeDefined();

    const reason = 'room double-booked (wave-1 pin)';
    const cancel = await authed('POST', `/bookings/${target!.id}/cancel`, admin.token, { reason });
    expect(cancel.status).toBe(200);

    const log = (await (
      await authed('GET', `/audit-log?action=cancel&limit=9999`, admin.token)
    ).json()) as { entries: { entityId: string; reason?: string; details: string }[] };
    const row = log.entries.find((e) => e.entityId === target!.id);
    expect(row, 'cancel must write an audit row').toBeDefined();
    // The Reason row in the audit detail dialog renders from this field —
    // it must carry the actor's explanation, not just the details string.
    expect(row?.reason).toBe(reason);
    expect(row?.details).toContain(reason);
  });
});
