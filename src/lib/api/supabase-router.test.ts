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

/**
 * POST /login email-resolution pins (flip-blocker, 2026-07-18).
 * create_user stores the ADMIN-ENTERED email as the auth identity, so a plain
 * username must be resolved through login_email_for_username (0017); the
 * `${username}@diamond.org` convention is only the fallback for convention-seeded
 * accounts and un-migrated backends.
 */
function fakeLoginDb(opts: { resolvedEmail?: string | null; resolverFails?: boolean }) {
  const rpc = vi.fn((fn: string) => {
    if (fn === 'login_email_for_username') {
      return Promise.resolve(
        opts.resolverFails
          ? { data: null, error: { message: 'function not found' } }
          : { data: opts.resolvedEmail ?? null, error: null },
      );
    }
    return Promise.resolve({ data: true, error: null }); // log_login_attempt, can_export_import
  });
  const signInWithPassword = vi.fn(() =>
    Promise.resolve({
      data: { session: { access_token: 'tok' }, user: { id: 'u-1' } },
      error: null,
    }),
  );
  const from = vi.fn(() => ({
    select: () => ({
      eq: () => ({ single: () => Promise.resolve({ data: { id: 'u-1' }, error: null }) }),
    }),
  }));
  return { rpc, signInWithPassword, db: { rpc, auth: { signInWithPassword }, from } as unknown as SupabaseClient };
}
const signInEmail = (signInWithPassword: ReturnType<typeof vi.fn>) =>
  ((signInWithPassword.mock.calls[0] as unknown[])[0] as { email: string }).email;

describe('supabaseRouter POST /login — username -> auth email resolution', () => {
  it('signs in with the RPC-resolved email, not the @diamond.org convention', async () => {
    const { signInWithPassword, db } = fakeLoginDb({ resolvedEmail: 'probe.logintest@example.com' });
    await supabaseRouter(db, 'POST', '/login', { username: 'probe_login', password: 'Gc-x' });
    expect(signInEmail(signInWithPassword)).toBe('probe.logintest@example.com');
  });

  it('falls back to the convention when the resolver finds no row', async () => {
    const { signInWithPassword, db } = fakeLoginDb({ resolvedEmail: null });
    await supabaseRouter(db, 'POST', '/login', { username: 'admin', password: 'admin' });
    expect(signInEmail(signInWithPassword)).toBe('admin@diamond.org');
  });

  it('falls back to the convention when the resolver RPC is missing (un-migrated backend)', async () => {
    const { signInWithPassword, db } = fakeLoginDb({ resolverFails: true });
    await supabaseRouter(db, 'POST', '/login', { username: 'admin', password: 'admin' });
    expect(signInEmail(signInWithPassword)).toBe('admin@diamond.org');
  });

  it('passes an email-typed username straight through without calling the resolver', async () => {
    const { rpc, signInWithPassword, db } = fakeLoginDb({ resolvedEmail: 'ignored@example.com' });
    await supabaseRouter(db, 'POST', '/login', { username: 'probe.logintest@example.com', password: 'Gc-x' });
    expect(signInEmail(signInWithPassword)).toBe('probe.logintest@example.com');
    expect(rpc).not.toHaveBeenCalledWith('login_email_for_username', expect.anything());
  });

  it('normalizes keyboard-mangled usernames (autocapitalize, stray spaces) before resolving', async () => {
    const { rpc, signInWithPassword, db } = fakeLoginDb({ resolvedEmail: null });
    await supabaseRouter(db, 'POST', '/login', { username: '  Admin ', password: 'admin' });
    expect(signInEmail(signInWithPassword)).toBe('admin@diamond.org');
    expect(rpc).toHaveBeenCalledWith('login_email_for_username', { uname: 'admin' });
  });
});
