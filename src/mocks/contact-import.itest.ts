import { describe, it, expect, afterEach } from 'vitest';
import { API_BASE } from '@/lib/api/client';
import { resetMockState } from '@/mocks/handlers';
import { PipelineStage, BookingType, ContactStatus } from '@/lib/types';

/**
 * CSV-import regression pins (2026-07-13). ImportCSVDialog used to send
 * `createdBy: 'import'`; the real backend's create_contact RPC casts
 * created_by with ::uuid, so every imported row 400-failed (22P02) while the
 * mock silently accepted the sentinel. Pins:
 *  1. the exact post-fix import payload (NO createdBy) creates a contact
 *     owned by the authenticated viewer — the RPC's auth.uid() default;
 *  2. same for a non-admin viewer (owner still defaults to self);
 *  3. a createdBy that doesn't reference a real user is a 400, not a silent
 *     accept — the mock now matches the real backend's rejection.
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

/** The exact payload shape ImportCSVDialog builds per CSV row (post-fix: no createdBy). */
function importRowPayload(firstName: string, lastName: string) {
  return {
    firstName,
    lastName,
    phone: '757-555-0101',
    email: `${firstName.toLowerCase()}@example.com`,
    groupName: 'Newport News Zion',
    pipelineStage: PipelineStage.FIRST_STUDY,
    type: BookingType.UNBAPTIZED_CONTACT,
    status: ContactStatus.ACTIVE,
    totalSessions: 0,
    notes: 'CSV import pin',
  };
}

describe('Contacts CSV import — createdBy derives from the viewer', () => {
  it('import rows (no createdBy) create successfully, owned by the importing admin', async () => {
    const admin = await login('admin');
    for (const [first, last] of [['Priscilla', 'Rome'], ['Aquila', 'Rome']]) {
      const res = await authed('POST', '/contacts', admin.token, importRowPayload(first, last));
      expect(res.status, `import row ${first}`).toBe(201);
      const c = (await res.json()) as { id: string; firstName: string; createdBy: string };
      expect(c.firstName).toBe(first);
      expect(c.createdBy, 'owner defaults to the authenticated viewer').toBe(admin.user.id);
    }
  });

  it('a non-admin importer also gets rows owned by themselves', async () => {
    const member = await login('member1');
    const res = await authed('POST', '/contacts', member.token, importRowPayload('Lydia', 'Thyatira'));
    expect(res.status).toBe(201);
    const c = (await res.json()) as { createdBy: string };
    expect(c.createdBy).toBe(member.user.id);
  });

  it("the old `createdBy: 'import'` sentinel is rejected as bad input (real-backend parity)", async () => {
    const admin = await login('admin');
    const res = await authed('POST', '/contacts', admin.token, {
      ...importRowPayload('Sentinel', 'Row'),
      createdBy: 'import',
    });
    expect(res.status, 'non-user owner must not be silently accepted').toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('VALIDATION_ERROR');
  });
});
