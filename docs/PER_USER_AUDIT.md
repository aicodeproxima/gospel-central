# Diamond — Per-User Smoke Audit

**Audit date:** 2026-05-08
**Branch audited:** `feat/admin-system` @ post-§7-shim
**Method:** vitest sweep of 12 representative seed users covering the per-user variance categories from `docs/AUDIT_REPORT.md` §9 + Addendum 2.
**Scope:** permission helpers + `buildVisibilityScope` + tag-combination + display-name edge cases. Visual / FE-render coverage is **NOT** included in this pass — the Playwright + Chrome MCPs were both unavailable when this audit ran. See §6 below.

---

## 1. Why per-user, not per-role

The original `AUDIT_REPORT.md` Wave 3 sweep covered the 6 canonical
roles. But within the same role, two seed users can hit different
code paths because:

- **Visibility scope shape** differs per leader (Joseph's branch vs
  Simon Peter's branch).
- **Subtree depth/width** differs (Group Leaders 0-4 have 2 child
  teams; 5-9 have only 1).
- **Optional-field edges** differ (Michael's `lastName: ''`).
- **Tag combinations** vary among Members (`[]`, `['teacher']`,
  `['co_team_leader', 'teacher']`, `['co_group_leader', 'teacher']`).
- **Position in org tree** differs (a Team Leader at the start of a
  group vs the end).

This audit pins the per-user invariants that should hold across
every seed user, so a future refactor that breaks (e.g.) the
`kind:'all'` sentinel for admin-tier surfaces a CI failure rather
than a Tuesday-morning Slack message.

## 2. The 12 representative viewers

Picked to span the variance categories above:

| # | User id | Username | Why representative |
|---|---|---|---|
| 1 | `u-michael` | admin | Dev with empty `lastName` |
| 2 | `u-stephen` | stephen | Second Dev (role-duplication edge) |
| 3 | `u-overseer-gabriel` | overseer1 | Only Overseer (singleton role) |
| 4 | `u-branch-1` | branch1 | BL of Newport News (largest area) |
| 5 | `u-branch-5` | branch5 | BL of Williamsburg (smallest area) |
| 6 | `u-group-1` | group1 | GL with 2 child teams (canonical) |
| 7 | `u-group-9` | group9 | GL with 1 child team (leaf-ish) |
| 8 | `u-team-1` | team1 | TL with members |
| 9 | `u-team-15` | team15 | Last TL in distribution |
| 10 | `u-mem-1` | member1 | First Member |
| 11 | `u-mem-50` | member50 | Mid-roster Member |
| 12 | `u-mem-99` | member99 | Last Member (edge of distribution) |

## 3. Test harness

`src/mocks/per-user-smoke.test.ts` — **51 assertions across 7
describe blocks**, runs in 350ms on `npm test`. Categories:

| Block | Assertions | What it pins |
|---|---|---|
| every viewer is in the seed roster | 12 | catches roster regressions |
| visibility scope is well-formed for every viewer | 12 | per-role `kind` + `userIds` shape |
| permission helpers never throw across viewer × target | 12 (each = 25 helper calls) | 300 helper invocations don't throw |
| display-name rendering survives optional-field edges | 3 | Michael's empty lastName; username regex on every seed user |
| tag-combination variance is present in seed data | 4 | Members with `[]`, `['teacher']`, `['co_team_leader']`, `['co_group_leader']` all exist |
| cross-user invariants hold across the matrix | 5 | self-grant prevention; admin-tier vs Member; subtree non-emptiness |
| visibility-scope monotonicity within a kind | 2 | GL ≥ TL ≥ Member; `kind:'all'` sentinel |

**Result:** 51/51 pass. Grand total `npm test` is now **172 passing**
(121 baseline + 51 new). Build clean.

## 4. Real finding from this audit

### F-1 — `kind: 'all'` sentinel is undocumented in helper signatures

**Severity:** Low (documentation gap, not a bug)

The first run of the per-user test failed 5 assertions because I
assumed `buildVisibilityScope(adminTierViewer).userIds` would
contain ~all 132 user ids. It does not — it returns `[]` by
convention because admin-tier sees everyone (no filter needed).

The convention IS documented at `src/lib/utils/permissions.ts`
line 641-643:

> For `kind: 'all'` (Branch L+), every IDs field is empty by
> convention — the caller should NOT filter; "empty" means
> "everything is in scope."

But the helper signature `buildVisibilityScope(viewer, allUsers):
VisibilityScope` doesn't telegraph this. A future contributor (or
LLM!) writing a consumer can easily fall into:

```ts
const subtree = buildVisibilityScope(viewer, allUsers).userIds;
if (subtree.length === 0) {
  // BUG: would treat admin-tier as "no access" instead of "all access"
  return [];
}
```

**Audit of existing consumers** (verified clean): every consumer in
`src/lib/utils/permissions.ts` and `src/components/admin/dialogs/EditUserDialog.tsx`
correctly short-circuits `isAdminTier(viewer) === true` (or its
synonyms) BEFORE doing `subtreeUserIds.includes(...)`. So today
there's no live bug. The risk is purely future-regression.

**Mitigation shipped in this audit:**
- Test `admin-tier (kind:"all") returns empty userIds sentinel — NOT a "no-access" signal` pins the contract.
- Test `Admin-tier viewers (kind:"all") pass canEditContact regardless of contact ownership` would fail if a future consumer "fixes" admin-tier without knowing about the sentinel.

**Recommended doc tweak (deferred):** the `VisibilityScope`
TypeScript interface could include a JSDoc warning on `userIds`
that summarizes the sentinel. Nice-to-have, not required.

## 5. Empty-state surface spot-check

Statically grep'd `src/components/**` for `.map()` patterns and
spot-checked the 13 candidates that lacked obvious empty-state
guards (`length === 0`, `No `, `empty`, etc.).

| Component | Verdict |
|---|---|
| `OrgNode.tsx` | ✅ defends with `hasChildren = node.children.length > 0` + `hasSomethingToExpand` flag |
| `MonthView.tsx`, `WeekView.tsx`, `DayView.tsx` | ✅ calendar grids are date-driven; empty bookings array is the dominant case |
| `Sidebar.tsx`, `MobileNav.tsx` | ✅ navigate over a fixed nav-items array — not user-data-driven |
| `PermissionsTab.tsx` | ✅ rows are spec-fixed (universal-rule + 8 sections), not data-driven |
| `TagsTab.tsx` | ⚠ low-risk; admin can have 0 tag definitions in theory |
| `PredictiveInput.tsx`, `StepSubjectPicker.tsx` | ✅ short empty list = no dropdown shown |
| `ContactForm.tsx` | ✅ form maps fixed field arrays |

**No empty-state crash bugs found.** OrgNode in particular is
well-defended for the per-user variance most likely to surface
empty subtrees (a Group Leader with 0 active teams, a Team Leader
with 0 active members). The matrix's "every leader has a non-empty
subtree" invariant is also asserted by the test harness, so a
future seed change that produces zero-child leaders would fail CI.

## 6. What this audit does NOT cover

| Coverage gap | Why deferred | Mitigation |
|---|---|---|
| **Visual rendering per user** (login as each user, walk dashboard / calendar / contacts / groups / reports / settings / admin, capture FE crashes) | Both Playwright and Claude-in-Chrome MCPs were unavailable for this session | Run via Playwright once it's back. The §7 shim now ensures a Member's direct API attacks fail with 403 anyway, so the "visual sweep" mostly catches FE-render edge cases (those tend to be per-page not per-user). |
| **Per-user persistent preferences** (Zustand `diamond-preferences` corruption) | Browser-only state | Future audit when MCP restored |
| **First-login redirect chain edge cases** | Requires actual browser session | Same |
| **Browser/PWA/Capacitor stale state** | Same | Same |
| **Property-based fuzz of buildVisibilityScope on random org-tree shapes** | Out of scope for this pass | Future B-batch if perceived risk is high |

## 7. Recommended follow-ups

### Immediate (this session)

1. ✅ **Per-user smoke test landed** in `src/mocks/per-user-smoke.test.ts` — 51 assertions, runs in CI on every `npm test`.
2. **Error boundary + `viewer.id` stamping** — wrap `(dashboard)/layout.tsx` in a React `<ErrorBoundary>` that posts `{message, stack, viewerId, viewerRole, url, ts}` to a new `/api/error-log` MSW endpoint. Once Mike's backend lands, swap MSW for Sentry. This is the durable insurance against future per-user bugs that don't show up in the seed roster (a real production user with a tag combo we didn't seed). **Going to ship this next.**

### Future (B-batch when MCP back)

3. **Per-user visual sweep via Playwright** — log in as each of the 12 users, walk the 8 main pages, capture screenshots + console errors. Catches per-user render bugs the helper sweep can't.
4. **Visibility-scope fuzz** — generate 50 random org trees, run `buildVisibilityScope` on every node, assert no throw + monotonicity holds. Property-based via `vitest`.

## 8. Verdict

| Question | Answer |
|---|---|
| Do the helpers behave consistently across every seed user? | **Yes** — 300 helper × target invocations across 12 viewers, no throws, all invariants hold. |
| Is the `kind:'all'` sentinel correctly handled by every consumer today? | **Yes** — verified via static + targeted unit tests. |
| Are there per-user empty-state crash risks in the FE? | **No** for high-risk components (OrgNode, calendar). Lower-risk paths defend by structure. |
| Is the visual surface covered? | **No** — visual rendering per user is deferred until Playwright/Chrome MCP returns. |
| What's the durable answer to "ensure each user has no bugs of their own"? | **Error boundary with viewer-id stamping** (next commit) → catches future per-user bugs we can't predict from the seed roster. |

---

*Per-user audit produced 2026-05-08 against `feat/admin-system`. Test harness in `src/mocks/per-user-smoke.test.ts`. Run with `npm test -- --run src/mocks/per-user-smoke.test.ts`.*
