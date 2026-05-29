# Role-matrix testing harness

A re-runnable probe script for verifying that Diamond's server-side
permission enforcement matches `docs/PERMISSIONS.md`. Born from the
2026-05-07 deep stress-test audit
([`docs/AUDIT_REPORT.md`](AUDIT_REPORT.md)) — Wave 3 used this to
confirm that **every authenticated user can do everything** in the
mock backend (audit C-01).

The harness is intended to be re-run:

1. **Before Mike's backend cutover** — to confirm the gap is still
   present (against MSW); the expected output is "every probe
   succeeds for every role" — that's the sentinel pattern showing
   server-side enforcement is not yet wired.
2. **After Mike's backend cutover** — to confirm enforcement now
   works; the expected output flips to "Member fails most probes,
   Branch L+ succeeds at most".

## When to run

Re-run the harness whenever any of these change:

- Helpers in `src/lib/utils/permissions.ts`
- The matrix in `docs/PERMISSIONS.md`
- Mike's middleware on the Go backend (especially after each new
  permission rule lands server-side)
- The MSW handlers in `src/mocks/handlers.ts` (these are the
  reference impl; the harness catches drift from the matrix)

## How to run

### Manual (browser DevTools console)

1. Open https://diamond-delta-eight.vercel.app in a browser
2. Open DevTools console
3. Paste the probe script from
   [§ Probe script](#probe-script) below
4. Inspect the returned `matrix` object

The script runs through six logins (admin → overseer1 → branch1 →
group1 → team1 → member1) and probes the privileged endpoints from
each session. The browser console output is a row-per-role table of
HTTP statuses.

### Via Playwright MCP (preferred for CI / agent runs)

Use `mcp__playwright__browser_evaluate` with the script body. The
return value is JSON-serializable; stash it as the harness output
and diff against the expected fixtures below.

### Programmatic (Node + fetch)

The script is plain async JS — drop it into a Node script with
`undici` or native `fetch` and point it at any deployed Diamond URL.
Authentication relies on the mock `/login` accepting any seeded
username with password `'admin'`; against a real backend, replace
the seeded passwords with actual credentials.

## Expected outcomes — sentinels for backend status

| Role | Probe | MSW today (no enforcement) | Mike's backend (enforced) |
|---|---|:-:|:-:|
| `member1` | POST /users with `role:'member'` | 201 | **403 PERMISSION_DENIED** |
| `member1` | POST /users with `role:'overseer'` | 201 | **403 PERMISSION_DENIED** |
| `member1` | PUT /users/self `{role:'overseer'}` | 200 | **403 PERMISSION_DENIED** |
| `member1` | POST /users/:other/reset-password | 200 | **403 PERMISSION_DENIED** |
| `member1` | POST /blocked-slots | 201 | **403 PERMISSION_DENIED** |
| `member1` | POST /areas | 201 | **403 PERMISSION_DENIED** |
| `member1` | PUT /users/:other/tags | 200 | **403 PERMISSION_DENIED** |
| `member1` | DELETE /contacts/:id | 200 | **403 PERMISSION_DENIED** (or 405 if soft-delete-only) |
| `team1` | POST /users with `role:'overseer'` | 201 | **403 PERMISSION_DENIED** |
| `team1` | PUT /users/:other/tags | 200 | **403 PERMISSION_DENIED** (matrix: TL "≤ Member") |
| `branch1` | POST /users with `role:'overseer'` | 201 | **403 PERMISSION_DENIED** |
| `branch1` | PUT /users/:other/tags | 200 | 200 (matrix: BL "≤ Branch L, no Dev") |
| `branch1` | POST /areas | 201 | **403 PERMISSION_DENIED** (matrix: Overseer+ only) |
| `overseer1` | POST /users with `role:'overseer'` | 201 | **403 PERMISSION_DENIED** (cannot grant peer Overseer) |
| `overseer1` | POST /areas | 201 | 201 (matrix: Overseer+) |
| `admin` (Dev) | every probe | 201/200 | 201/200 |

The sentinel pattern: **as Mike's enforcement lands, more rows flip
from 200/201 to 403.** The audit will be considered fully closed
when every Critical / High row is 403 for the unauthorized role.

## Probe script

Copy-paste-runnable. Authenticated session is preserved between
probes via `localStorage` + `Authorization: Bearer …` header.

```js
async function runRoleMatrixProbe() {
  const log = [];
  const note = (k, v) => log.push({ k, v });

  const loginAs = async (username) => {
    const r = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: 'admin' }),
    });
    if (!r.ok) return null;
    return r.json();
  };

  const roles = ['admin', 'overseer1', 'branch1', 'group1', 'team1', 'member1'];
  const matrix = {};

  // Pick a target user for permission probes
  const allUsers = await fetch('/api/users').then((r) => r.json());
  const probeTarget =
    allUsers.find((u) => u.username === 'member3') ||
    allUsers[allUsers.length - 1];

  for (const username of roles) {
    const lb = await loginAs(username);
    if (!lb) {
      matrix[username] = { login: 'FAIL' };
      continue;
    }
    const auth = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${lb.token}`,
    };
    const me = lb.user;
    const result = { role: me.role };

    // Probe 1: GET /users — does server scope-filter?
    const usersRes = await fetch('/api/users', { headers: auth });
    const usersList = await usersRes.json();
    result.GET_users = { status: usersRes.status, count: usersList.length };

    // Probe 2: GET /audit-log — branch-scoped for BL, all for Overseer/Dev
    const auditRes = await fetch('/api/audit-log?limit=1', { headers: auth });
    result.GET_audit = { status: auditRes.status };

    // Probe 3: POST /users with role=member
    const createRes = await fetch('/api/users', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        username: `probe-${username}-${Date.now()}`,
        firstName: 'Probe', lastName: 'Created',
        email: `probe-${username}-${Date.now()}@x.com`,
        role: 'member',
        createdById: me.id,
      }),
    });
    result.POST_user_member = { status: createRes.status };

    // Probe 4: POST /users with role=overseer (only Dev should succeed)
    const escalateRes = await fetch('/api/users', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        username: `probe-up-${username}-${Date.now()}`,
        firstName: 'Probe', lastName: 'Up',
        email: `probe-up-${username}-${Date.now()}@x.com`,
        role: 'overseer',
        createdById: me.id,
      }),
    });
    result.POST_user_overseer = { status: escalateRes.status };

    // Probe 5: PUT /users/:other (canEditUser server-side?)
    const putRes = await fetch(`/api/users/${probeTarget.id}`, {
      method: 'PUT',
      headers: auth,
      body: JSON.stringify({ phone: `555-${username}`, actorId: me.id }),
    });
    result.PUT_user_other = { status: putRes.status };

    // Probe 6: PUT /users/self with role=overseer (privilege escalation)
    const selfEscRes = await fetch(`/api/users/${me.id}`, {
      method: 'PUT',
      headers: auth,
      body: JSON.stringify({ role: 'overseer', actorId: me.id }),
    });
    const selfEscBody = await selfEscRes.json();
    result.PUT_self_role_overseer = {
      status: selfEscRes.status,
      role_after: selfEscBody.role,
    };
    // Restore self role (mock-only; real backend will 403)
    if (selfEscBody.role === 'overseer' && me.role !== 'overseer') {
      await fetch(`/api/users/${me.id}`, {
        method: 'PUT',
        headers: auth,
        body: JSON.stringify({ role: me.role, actorId: me.id }),
      });
    }

    // Probe 7: POST /users/:other/reset-password (Branch L+ only per matrix)
    const resetRes = await fetch(
      `/api/users/${probeTarget.id}/reset-password`,
      {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ actorId: me.id }),
      },
    );
    result.POST_reset_password_other = { status: resetRes.status };

    // Probe 8: POST /blocked-slots (Branch L+ only per matrix)
    const blockedRes = await fetch('/api/blocked-slots', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        scope: 'global',
        recurrence: 'weekly',
        reason: `Probe ${username}`,
        dayOfWeek: 3,
        startTime: '12:00',
        endTime: '13:00',
        actorId: me.id,
      }),
    });
    result.POST_blocked_slot = { status: blockedRes.status };
    // Cleanup
    if (blockedRes.ok) {
      const slot = await blockedRes.json();
      await fetch(`/api/blocked-slots/${slot.id}`, {
        method: 'DELETE',
        headers: auth,
        body: JSON.stringify({ actorId: me.id }),
      });
    }

    // Probe 9: POST /areas (Overseer+ only per matrix)
    const areaRes = await fetch('/api/areas', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ name: `Probe area ${username} ${Date.now()}` }),
    });
    result.POST_area = { status: areaRes.status };

    // Probe 10: PUT /users/:other/tags (canManageTags server-side?)
    const tagsRes = await fetch(`/api/users/${probeTarget.id}/tags`, {
      method: 'PUT',
      headers: auth,
      body: JSON.stringify({ tags: ['teacher'], actorId: me.id }),
    });
    result.PUT_tags_other = { status: tagsRes.status };

    // Probe 11: DELETE /contacts/:id (universal rule #7: soft-delete only)
    const contacts = await fetch('/api/contacts').then((r) => r.json());
    if (contacts.length > 0) {
      const cid = contacts[Math.floor(contacts.length / 2)].id;
      const dRes = await fetch(`/api/contacts/${cid}`, {
        method: 'DELETE',
        headers: auth,
      });
      const after = await fetch('/api/contacts').then((r) => r.json());
      result.DELETE_contact = {
        status: dRes.status,
        hardDelete: !after.some((c) => c.id === cid),
      };
    }

    matrix[username] = result;
  }

  note('role_matrix', matrix);
  console.table(
    Object.entries(matrix).map(([role, r]) => ({
      role,
      'POST users(member)': r.POST_user_member?.status,
      'POST users(overseer)': r.POST_user_overseer?.status,
      'PUT self->overseer': r.PUT_self_role_overseer?.status,
      'POST reset-pw': r.POST_reset_password_other?.status,
      'POST blocked-slot': r.POST_blocked_slot?.status,
      'POST area': r.POST_area?.status,
      'PUT tags(other)': r.PUT_tags_other?.status,
      'DELETE contact': r.DELETE_contact?.status,
      'DELETE hardDel?': r.DELETE_contact?.hardDelete,
    })),
  );
  return matrix;
}

// Run it:
runRoleMatrixProbe().then((m) => console.log(JSON.stringify(m, null, 2)));
```

## Reading the output

The `console.table` view renders one row per role with the HTTP
status of each probe. You're looking for two things:

1. **For each role's `POST users(overseer)` column:** only `admin`
   should be 201 once enforcement lands. Anyone else returning 201
   means the server still accepts role escalations from sub-Dev
   tier — re-check the `canCreateUser` / `canChangeRole` middleware.

2. **For each role's `DELETE contact` column:** the `hardDelete?`
   sub-field should be `false` (or the status should be 405) once
   the soft-delete refactor lands. `true` means
   `splice(idx, 1)` is still happening server-side.

## Fixtures: pre-cutover snapshot (2026-05-07)

The audit captured this baseline. Re-running the harness should
match this until Mike's enforcement lands:

| Role | POST users(overseer) | PUT self→overseer | POST area | DELETE hardDelete? |
|---|:-:|:-:|:-:|:-:|
| admin (Dev) | 201 | 200 | 201 | true |
| overseer1 | 201 | 200 | 201 | true |
| branch1 | 201 | 200 | 201 | true |
| group1 | 201 | 200 | 201 | true |
| team1 | 201 | 200 | 201 | true |
| member1 | **201** | **200** | **201** | **true** |

The `member1` row shows the audit's headline finding (C-01): a
Member can perform every privileged mutation. **Any row in the
member1 line that is NOT 403 after Mike's cutover is a regression.**

## Fixtures: post-cutover expected (after Mike's §0 work)

| Role | POST users(overseer) | PUT self→overseer | POST area | DELETE hardDelete? |
|---|:-:|:-:|:-:|:-:|
| admin (Dev) | 201 | 200 | 201 | false (soft) |
| overseer1 | **403** | **403** | 201 | false |
| branch1 | **403** | **403** | **403** | false |
| group1 | **403** | **403** | **403** | false |
| team1 | **403** | **403** | **403** | false |
| member1 | **403** | **403** | **403** | false |

Diff against the live output to see what's still gapped.
