import { describe, it, expect, vi } from 'vitest';
import { supabaseRouter } from './supabase-router';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * POST /contacts payload-hygiene pins (CSV-import regression, 2026-07-13).
 * create_contact casts created_by with ::uuid, so the router must drop any
 * non-uuid createdBy (old builds sent the 'import' sentinel → 22P02 → every
 * imported row failed) while passing a real uuid through for the leader
 * on-behalf-of create, which the RPC itself re-gates.
 */
function fakeDb() {
  const rpc = vi.fn(() => Promise.resolve({ data: { id: 'c-new' }, error: null }));
  return { rpc, db: { rpc } as unknown as SupabaseClient };
}
const row = { firstName: 'Lydia', lastName: 'Thyatira', totalSessions: 0 };
const rpcPayload = (rpc: ReturnType<typeof vi.fn>) =>
  (rpc.mock.calls[0] as unknown[])[1] as { p: Record<string, unknown> };

describe('supabaseRouter POST /contacts — created_by hygiene', () => {
  it("drops the non-uuid 'import' sentinel so the RPC defaults to auth.uid()", async () => {
    const { rpc, db } = fakeDb();
    await supabaseRouter(db, 'POST', '/contacts', { ...row, createdBy: 'import' });
    expect(rpc).toHaveBeenCalledWith('create_contact', expect.anything());
    const { p } = rpcPayload(rpc);
    expect(p).not.toHaveProperty('created_by');
    expect(p.first_name).toBe('Lydia');
  });

  it('drops a non-string createdBy', async () => {
    const { rpc, db } = fakeDb();
    await supabaseRouter(db, 'POST', '/contacts', { ...row, createdBy: 42 });
    expect(rpcPayload(rpc).p).not.toHaveProperty('created_by');
  });

  it('passes a valid uuid createdBy through (leader on-behalf-of create)', async () => {
    const uuid = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
    const { rpc, db } = fakeDb();
    await supabaseRouter(db, 'POST', '/contacts', { ...row, createdBy: uuid });
    expect(rpcPayload(rpc).p.created_by).toBe(uuid);
  });

  it('leaves createdBy absent when the client omits it, and still strips actor keys', async () => {
    const { rpc, db } = fakeDb();
    await supabaseRouter(db, 'POST', '/contacts', { ...row, actorId: 'u-1' });
    const { p } = rpcPayload(rpc);
    expect(p).not.toHaveProperty('created_by');
    expect(p).not.toHaveProperty('actor_id');
  });
});
