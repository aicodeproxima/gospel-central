# Diamond — Frontend Handoff Packet (authoritative)

_Last updated 2026-06-27 · supersedes all prior HANDOFF/SESSION_PASSDOWN drafts (old content lives in git history)._

This is the entry point for anyone receiving this repo. It states the **current** truth and points to the
detailed docs. Where this disagrees with code, the code wins (`src/lib/api/*`, `src/mocks/handlers.ts`).

## 0. Status at a glance
| | |
|---|---|
| **What** | Diamond — a Bible-study room-booking + discipleship/org-management app for a church community. **Frontend-only**; a real Go backend ("Mike's") is the planned cutover. |
| **Repo** | `github.com/aicodeproxima/Diamond` · canonical checkout `C:\Users\aicod\Projects\_src\diamond-live`. |
| **Branch / deploy** | Work on `feat/mobile-opt-main`; ship by fast-forwarding into **`main`**. The Vercel project `diamond` (team `aicodeproximas-projects`) is **git-connected** — pushing `main` auto-builds Production (~40s) and repoints the prod alias. **No `vercel --prod` CLI deploy** (the old handoff's CLI flow is obsolete). |
| **Live** | **https://diamond-delta-eight.vercel.app** — current prod = `main` HEAD (`b8e5b11`), build Ready. |
| **Backend state** | Mock is PERMANENT (the API contract + Mike's test oracle). Cutover = a two-flag env flip, not a code change. See [`docs/MIKE_HANDOFF.md`](docs/MIKE_HANDOFF.md). |
| **Quality** | 3AgentScan grade **A**. vitest **332 pass / 7 todo**; Playwright green on chromium + mobile-s24; both gate CI. |

## 1. Stack
Next.js 16 (App Router, Turbopack) · React 19 · TypeScript 5 · Tailwind v4 (CSS-first `@theme`, no tailwind.config) ·
shadcn/ui · Framer Motion · **@react-three/fiber + drei** (the 3D org tree) · recharts · **MSW ^2 (SW-FREE)** ·
zustand 5 · next-themes. In-repo `vendor/interactive-*-background` packages power the animated themes.

## 2. The mock backend (how it runs with no server)
- **SW-free MSW**: `src/mocks/browser.ts` patches `window.fetch`/XHR in-page via `@mswjs/interceptors` and resolves
  same-origin `/api` (service workers were dropped — they silently failed on iOS Safari). There is **no**
  `public/mockServiceWorker.js`.
- Seed: `src/mocks/scenario-church-week.ts` (re-exported by `data.ts`, loaded by `handlers.ts`). In-memory, **resets
  to seed on every page reload**. Current seed: **132 users · 50 contacts · 104 bookings · 5 areas · ~26 rooms ·
  4 blocked-slots · 83 audit rows**.
- Determinism: `src/mocks/mock-clock.ts` — the seed (and the calendar's default date) read `now()`, which returns
  the real clock in prod and a **pinned date** under test (`NEXT_PUBLIC_MOCK_DATE` / `window.__MOCK_DATE__`).
- **Env contract** (`.env.example`): `NEXT_PUBLIC_MOCK_API=true` + `NEXT_PUBLIC_API_URL=/api` (mock mode, what prod
  runs today). Cutover: flip `MOCK_API=false` + point `API_URL` at Mike's backend — the mock code stays untouched.
- Default login: **`admin` / `admin`** (all seeded accounts use password `admin`). Roles: `admin`(Dev), `overseer1`,
  `branch1-5`, `group1-10`, `team1-15`, `member1-99` (member3 = a teacher-tagged Member).

## 3. Run & test
```bash
npm run dev            # local dev (mock mode). NOTE: the team tests on the LIVE Vercel URL, not localhost.
npm run build          # typecheck + production build
npm test               # vitest: 332 pass / 7 todo (unit + integration projects)
npm run e2e            # Playwright (chromium desktop + webkit + mobile-pixel5 + mobile-s24)
npm run e2e:update     # regenerate visual baselines (platform-specific; skipped in CI)
npm run qa:run2        # regenerate docs/qa/RUN2.md from machine reporters
npm run qa:propagation # regenerate docs/qa/PROPAGATION.md from the propagation log
```
Three test tiers (see [`docs/TESTING.md`](docs/TESTING.md)): **unit** (pure fns, real clock), **integration**
(`*.itest.ts`, msw/node + pinned clock — handler authz + cascades), **E2E** (Playwright vs an ephemeral `next dev`
in mock+pinned mode). CI (`.github/workflows/test.yml`) gates vitest + build + chromium e2e + **mobile-s24** e2e.

## 4. What's verified (QA evidence — all under `docs/qa/`)
- **Run-1** (50 manual member workflows, 3-browser): `C:\Users\aicod\DiamondQA\REPORT.md` — 46 PASS / 1 PARTIAL / 3 BLOCKED.
- **Run-2** (List B, lane-routed, machine-generated): [`docs/qa/RUN2.md`](docs/qa/RUN2.md) — 29 PASS + 4 backend-acceptance todo + 17 deferred = 50.
- **Propagation audit** (catalog-only, code-grounded): [`docs/qa/PROPAGATION.md`](docs/qa/PROPAGATION.md) — 11 PASS / 2 deferred / **0 frontend leaks**; graph in `propagation-graph.md`, gaps in `propagation-graph-gaps.md`, ready batch-2 recipes in `propagation-catalog.md`.
- **A-grade closeout**: driven booking-lifecycle E2E (reschedule/cancel/restore, `e2e/booking.spec.ts`) + S24 tap-targets ≥44 (`e2e/mobile.spec.ts`) — prod-verified live at the S24 viewport; desktop render proven frozen (visual baselines unchanged).

## 5. Backend handoff (for Mike — the cutover)
Full contract: **[`docs/MIKE_HANDOFF.md`](docs/MIKE_HANDOFF.md)** (endpoint inventory, audit-log union, error
envelopes, server-side permission rules, auth pivot). The mock handlers in `src/mocks/handlers.ts` are the reference
implementation. **Backend-acceptance items** (UI-enforced today, the server MUST gate) are tracked as `it.todo`
markers + listed in **[`docs/qa/out-of-scope-findings.md`](docs/qa/out-of-scope-findings.md)** +
[`docs/BACKEND_GAPS.md`](docs/BACKEND_GAPS.md):
- `PUT /users/:id/username` (no `canChangeUsername`), `GET /audit-log` (unscoped — no `canAccessReports`),
  `PUT /contacts/:id {assignedTeacherId}` (no `canReassignContact`), `PUT /bookings/:id` + `/cancel` (no
  `canEditBooking`), `POST /contacts/:id/convert {role}` (privilege-escalation), audit `userId`/`cancelledBy`
  hardcoded `u-michael` (mis-attributes the reports leaderboard).
- Do **NOT** "fix" these in the mock — that masks the gap. Permission helpers live in `src/lib/utils/permissions.ts`
  (pinned by `permissions.test.ts`); the server must re-run them all. When gated, flip each `it.todo`→`it` and assert 403.

## 6. Mobile
Primary device = **Galaxy S24 Ultra**. Guarded by `e2e/mobile.spec.ts` on the `mobile-s24` project: **no horizontal
pan** + **tap targets ≥44×44** (actionable controls; text inputs/switches/secondary pill-chips held to the AA-24
floor). All tap-target fixes are `max-md:`/`max-xl:` scoped — **desktop render is frozen** (proven by the visual
baselines still matching). iOS Safari uses the SW-free MSW path; **real-iPhone proof is still pending** (Chromium /
WebKitGTK cannot prove iOS Safari — confirm on a real device before declaring iOS done).

## 7. Known limitations / deferred
- **iOS Safari** real-device verification pending (above).
- **Propagation batch-2** cells (deactivate↔restore, reparent, blocked-slots, log-study wizard) are cataloged +
  ready but not yet executed (`propagation-catalog.md`); the contacts detail-dialog cells (C2/C2b) are deferred (a
  Playwright renderer crash) — behavior verified by source-trace instead.
- **Graph-completeness edges** A1–A6 (dashboard/admin consumers) noted in `propagation-graph-gaps.md` — fold in
  before claiming full propagation coverage.
- Revoke the two preview **bypass secrets** at final sign-off (no longer needed while prod is public).

## 8. Deploy mechanics (gotchas)
- Ship path: commit on `feat/mobile-opt-main` → `git checkout main` → `git merge --ff-only feat/mobile-opt-main` →
  `git push origin main` → `git checkout feat/mobile-opt-main`. **Run the `git push origin main` UN-CHAINED** — the
  `~/.claude/hooks/bash-guard.ps1` H4 guard false-positives when a `push` is chained with a later `git checkout
  feat/...`.
- Vercel env vars are per-environment rows; `NEXT_PUBLIC_MOCK_API=true` is set for prod (mock-on). `NEXT_PUBLIC_MOCK_DATE`
  is **test-only** (playwright.config) — never set in prod, so the prod calendar uses the real clock.

## 9. Doc index
| Doc | Purpose |
|---|---|
| `docs/MIKE_HANDOFF.md` | Backend cutover contract (the one Mike reads). |
| `docs/TESTING.md` | The 3 test tiers + determinism + how to add tests. |
| `docs/PERMISSIONS.md` | Permission matrix (source of truth for authz). |
| `docs/BACKEND_GAPS.md` | Server-side acceptance criteria / known mock-permissive gaps. |
| `docs/qa/RUN2.md`, `PROPAGATION.md`, `out-of-scope-findings.md` | Machine-generated QA reports + findings backlog. |
| `docs/AUDIT_REPORT.md`, `PER_USER_AUDIT.md`, `ROLE_MATRIX_TESTING.md` | Earlier audit campaigns. |
| `CLAUDE.md` (repo root) | Project rules + facts (auto-loads in-repo for AI sessions). |
| `MOBILE_AUDIT_PROGRESS.md` | The mobile-optimization project log. |

## 10. Quick start for the next person
1. Read this packet + `CLAUDE.md`. 2. `npm ci && npm run dev` (mock mode) — or just use the live URL.
3. Make changes on `feat/mobile-opt-main`; `npm run build` + `npm test` + relevant `npm run e2e`.
4. Ship via §8; verify on the live URL (browser-truth, not localhost). 5. Mobile changes must keep desktop frozen
   (`max-md:`/`max-xl:` only) — prove it with the visual baselines. 6. Don't edit `C:\Users\aicod\Diamond` (a second,
   older worktree the user keeps deliberately) — this `_src\diamond-live` tree is canonical.
