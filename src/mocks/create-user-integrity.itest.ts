import { describe, it, expect, afterEach } from 'vitest';
import { API_BASE } from '@/lib/api/client';
import { resetMockState } from '@/mocks/handlers';

/**
 * REGRESSION GATE — a created account must be STRUCTURALLY COMPLETE.
 *
 * Two defects from the 2026-07-19 account-creation audit, both of which produced
 * an account that looked created but was subtly broken:
 *
 * 1. locationId was never set. Creation wrote no home area, so the new person was
 *    dropped by the Users-tab location filter, excluded from getChurchUserIds (so
 *    every church-scoped report undercounted them), and rendered with no location
 *    on their org-tree node. To an admin it looked like the account had not been
 *    created. Live-confirmed on prod: a wizard-created user came back with
 *    locationId '(none)'.
 *
 * 2. parentId was stored verbatim with NO validation — not existence, not active,
 *    not rank. canCreateUser short-circuits for admin tier before ever inspecting
 *    the parent, so a stale parentId from the wizard (pick a parent, then raise
 *    the role — the <select> silently keeps the now-ineligible id) persisted an
 *    INVERTED org edge, e.g. a Group Leader reporting to a Team Leader. Every
 *    descendant consumer inherits that corruption.
 *
 * Cell isolation (audit-anti-drift G6): resetMockState between cells.
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

type SeedUser = { id: string; username: string; role: string; locationId?: string };

async function allUsers(token: string): Promise<SeedUser[]> {
  return fetch(`${API}/users`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
}

function create(token: string, body: Record<string, unknown>) {
  return fetch(`${API}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

const base = { firstName: 'New', lastName: 'Person', email: 'new.person@example.com' };

describe('POST /users — home location is assigned', () => {
  it('inherits locationId from the parent chain', async () => {
    const dev = await login('admin');
    const users = await allUsers(dev.token);
    const groupLeader = users.find((u) => u.username === 'group1')!;
    expect(groupLeader.locationId, 'seed precondition: group1 has a location').toBeTruthy();

    const res = await create(dev.token, {
      ...base,
      username: 'loc_inherit',
      role: 'member',
      parentId: groupLeader.id,
    });
    expect(res.status).toBe(201);
    const { user } = (await res.json()) as { user: SeedUser };
    expect(user.locationId).toBe(groupLeader.locationId);
  });

  it('walks PAST an ancestor that has no location', async () => {
    // Overseers carry no location; a user parented under one must not silently
    // inherit "undefined" when a located ancestor exists further up... and when
    // none does, must stay unset rather than guessing.
    const dev = await login('admin');
    const users = await allUsers(dev.token);
    const overseer = users.find((u) => u.username === 'overseer1')!;
    expect(overseer.locationId, 'seed precondition: overseer spans locations').toBeFalsy();

    const res = await create(dev.token, {
      ...base,
      username: 'loc_walkup',
      role: 'branch_leader',
      parentId: overseer.id,
    });
    expect(res.status).toBe(201);
    const { user } = (await res.json()) as { user: SeedUser };
    expect(user.locationId).toBeUndefined();
  });

  it('leaves Overseer/Dev unset — they span all locations, like the seed', async () => {
    // Parent under the Dev: an Overseer outranks every Branch Leader, so
    // parenting one under a branch is (correctly) rejected by the rank guard.
    const dev = await login('admin');
    const res = await create(dev.token, {
      ...base,
      username: 'loc_overseer',
      role: 'overseer',
      parentId: dev.user.id,
    });
    expect(res.status).toBe(201);
    const { user } = (await res.json()) as { user: SeedUser };
    expect(user.locationId).toBeUndefined();
  });

  it('an explicit locationId wins, but must be a real active area', async () => {
    const dev = await login('admin');
    const users = await allUsers(dev.token);
    const groupLeader = users.find((u) => u.username === 'group1')!;

    const bad = await create(dev.token, {
      ...base,
      username: 'loc_bogus',
      role: 'member',
      parentId: groupLeader.id,
      locationId: 'area-does-not-exist',
    });
    expect(bad.status).toBe(400);

    const areas = await fetch(`${API}/areas`, {
      headers: { Authorization: `Bearer ${dev.token}` },
    }).then((r) => r.json() as Promise<Array<{ id: string }>>);
    const other = areas.find((a) => a.id !== groupLeader.locationId)!;
    const ok = await create(dev.token, {
      ...base,
      username: 'loc_explicit',
      role: 'member',
      parentId: groupLeader.id,
      locationId: other.id,
    });
    expect(ok.status).toBe(201);
    const { user } = (await ok.json()) as { user: SeedUser };
    expect(user.locationId).toBe(other.id);
  });
});

describe('POST /users — parent integrity', () => {
  it('rejects a parent that does not exist', async () => {
    const dev = await login('admin');
    const res = await create(dev.token, {
      ...base,
      username: 'orphan_one',
      role: 'member',
      parentId: 'u-does-not-exist',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a deactivated parent', async () => {
    const dev = await login('admin');
    const users = await allUsers(dev.token);
    const teamLeader = users.find((u) => u.username === 'team1')!;
    const off = await fetch(`${API}/users/${teamLeader.id}/deactivate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${dev.token}` },
      body: JSON.stringify({ actorId: dev.user.id, cascade: false }),
    });
    expect(off.status).toBe(200);

    const res = await create(dev.token, {
      ...base,
      username: 'under_dead',
      role: 'member',
      parentId: teamLeader.id,
    });
    expect(res.status).toBe(400);
  });

  it('rejects a Member as a parent', async () => {
    const dev = await login('admin');
    const users = await allUsers(dev.token);
    const member = users.find((u) => u.role === 'member')!;
    const res = await create(dev.token, {
      ...base,
      username: 'under_member',
      role: 'member',
      parentId: member.id,
    });
    expect(res.status).toBe(400);
  });

  it('rejects an INVERTED edge — a Team Leader cannot parent a Group Leader', async () => {
    // This is the exact shape the stale-parentId wizard bug produced, and a Dev
    // creator reaches it because canCreateUser returns true for admin tier before
    // any parent inspection. Without this guard the 201 was silent.
    const dev = await login('admin');
    const users = await allUsers(dev.token);
    const teamLeader = users.find((u) => u.username === 'team1')!;
    const res = await create(dev.token, {
      ...base,
      username: 'inverted_edge',
      role: 'group_leader',
      parentId: teamLeader.id,
    });
    expect(res.status).toBe(400);
  });

  it('still accepts a correctly-ranked parent', async () => {
    // Guard against "fixed it by rejecting everything".
    const dev = await login('admin');
    const users = await allUsers(dev.token);
    const groupLeader = users.find((u) => u.username === 'group1')!;
    const res = await create(dev.token, {
      ...base,
      username: 'valid_child',
      role: 'team_leader',
      parentId: groupLeader.id,
    });
    expect(res.status).toBe(201);
    const { user } = (await res.json()) as { user: SeedUser & { parentId: string } };
    expect(user.parentId).toBe(groupLeader.id);
  });

  it('same-rank parenting is still allowed (peer under peer)', async () => {
    const dev = await login('admin');
    const users = await allUsers(dev.token);
    const groupLeader = users.find((u) => u.username === 'group1')!;
    const res = await create(dev.token, {
      ...base,
      username: 'peer_child',
      role: 'group_leader',
      parentId: groupLeader.id,
    });
    expect(res.status).toBe(201);
  });
});
