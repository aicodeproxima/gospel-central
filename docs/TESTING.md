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
- ⏳ Phase 3 (adversarial): per-role gating, role-grant ceilings, non-owner can't edit/cancel, owner-scoping, handler-level
  rejection of unauthorized mutations (+ `it.todo` backend-acceptance for the known mock-permissive contacts gaps).
- ⏳ Phase 4 (mobile + visual): S24 Ultra journeys (no horizontal pan, ≥44px tap targets, Agenda at phone width) + visual
  baselines for calendar / groups tree / contacts / wizard / settings.
