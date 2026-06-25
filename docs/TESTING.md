# Testing

Three tiers, all running against the in-page MSW mock (the backend-contract oracle).

| Tier | Runner | Env | Clock | Gates PRs? | Command |
|---|---|---|---|---|---|
| **Unit** | vitest `unit` project | node | **real** | yes | `npm run test:unit` |
| **Integration** | vitest `integration` project | happy-dom + `msw/node` | **pinned** | yes | `npm run test:integration` |
| **E2E** | Playwright | real browsers + `next dev` | **pinned** | chromium smoke gates; full matrix on-demand | `npm run e2e` |

`npm test` runs both vitest projects. `npm run e2e -- --project=chromium` runs just the gating subset.

## Determinism (the important bit)
The seed (`src/mocks/scenario-church-week.ts`) lays out bookings/contacts/blocked-slots **relative to "now"**, so
without pinning, tests drift by day. All seed clock reads go through **`src/mocks/mock-clock.ts`** (`now()` / `nowMs()`),
which is a no-op in production (override unset ⇒ real time) but can be **pinned**:

- **Integration:** `vitest.pin-clock.ts` sets `globalThis.__MOCK_DATE__` and is the **first** entry in the integration
  project's `setupFiles` — it must run before the seed module is imported (ESM hoists imports, so the pin can't live in
  the same file as the `msw/node` server setup). Pinned to **2026-06-22 (a Monday)**.
- **E2E:** `e2e/fixtures.ts` injects `window.__MOCK_DATE__` via `addInitScript` (runs before page scripts), and the dev
  server also gets `NEXT_PUBLIC_MOCK_DATE`. `mock-clock` reads the override eagerly at module init.

Never reintroduce a bare `new Date()` / `Date.now()` in the seed — route it through `mock-clock`.

## Adding tests
- **Integration** (`src/**/*.itest.ts(x)`): render components with `@testing-library/react` or hit the mock via `fetch`
  (`msw/node` intercepts). Auth: `POST ${API_BASE}/login {username, password:'admin'}` returns a token. Seeded accounts
  (all pw `admin`): `admin` (Dev), `overseer1`, `branch1`, `group1`, `team1`, `member3` (Member + teacher tag).
- **E2E** (`e2e/*.spec.ts`): `import { test, expect } from './fixtures'` (pins the clock) and `loginAs(page, 'branch1')`
  for the physical login flow. Projects: `chromium`, `webkit`, `mobile-pixel5`, `mobile-s24` (Galaxy S24 Ultra, the
  primary device).
- **Visual** (Phase 4, `e2e/*.visual.spec.ts`): `toHaveScreenshot()` with masks on volatile regions; **non-gating** /
  nightly (OS/font-flaky). Generate baselines with `npm run e2e:update`.

## What's covered / planned
- ✅ Unit: permissions matrix, availability, tree layout/focus, theme, fit math, seed invariants (317).
- ✅ Integration foundation: pinned clock + msw/node login (+401) + deterministic seed week.
- ✅ E2E smoke + permission boundaries: member login; Member redirected from `/admin` `/reports`; Branch Leader allowed.
- ✅ Phase 3 (adversarial): handler-level §7-SHIM gates (`adversarial.itest.ts` — area-create Overseer+, member can't edit
  others/self-elevate, grant ceiling, reparent-cycle, 401-not-403) + E2E boundaries (`permissions.spec.ts` — Export gated
  to Branch Leader+, Add-User to Team Leader+, a non-owner opens a booking read-only) + 3 `it.todo` backend-acceptance
  markers for the known mock-permissive contacts/cancel gaps.
- ✅ Phase 4 (mobile + visual): `mobile.spec.ts` (mobile-pixel5 + mobile-s24 projects) — **no horizontal page pan** on
  dashboard/contacts/settings/calendar, Agenda renders at phone width, the booking wizard fits the viewport; `visual.spec.ts`
  — `toHaveScreenshot` baselines for login/dashboard/contacts/settings (chromium, **skipped in CI** since baselines are
  platform-specific; regenerate with `npm run e2e:update`). Project scoping: desktop specs `testIgnore` mobile; mobile
  projects `testMatch` only `mobile.spec`.

## Run 2 (List B) — generated coverage report
`docs/qa/RUN2.md` is **machine-generated** from the JSON reporters by `scripts/render-run2.mjs` — it never asserts a
status by hand (audit-anti-drift G1/G13). It reconciles all 50 List-B cells (`DiamondQA/WORKFLOWS.md`) against the
reporters by B-token, derives an environment fingerprint (git SHA, pinned `MOCK_DATE`, tool versions, reporter counts),
and **exits non-zero on any orphan or FAIL** — so a green render is itself an integrity check.

```
npm run qa:run2        # regenerate both reporters + render RUN2.md (+ integrity gate)
node scripts/render-run2.mjs   # render only, from existing docs/qa/run2-{int,e2e}.json
```

Lanes: **INT** (handler authz — `src/mocks/listb.itest.ts`), **E2E** (`e2e/{booking,contacts,groups,reports,coverage}.spec.ts`
+ `mobile`/`visual` variants), **GAP** (`it.todo` backend-acceptance — the UI enforces it but the mock handler doesn't;
these are acceptance criteria for the real Go backend, see `docs/qa/out-of-scope-findings.md`), **DEFERRED** (enumerated
honestly with a reason — not faked). The two cells the plan earmarked MANUAL (B19 CSV import, B50 cover-a-teammate) were
automatable after all (`setInputFiles` + the unit-proven `canEditBooking` subtree rule), so there is no manual lane.
