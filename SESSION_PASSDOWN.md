# Gospel Central (formerly "Diamond") — Session Passdown (cold-start for the next session)

> **RENAME (2026-06-27): the app is now "Gospel Central".** GitHub repo `aicodeproxima/gospel-central` (was `Diamond`; old path redirects), Vercel project `gospel-central`, prod URL **`gospel-central.vercel.app`** (legacy `diamond-delta-eight.vercel.app` still resolves). Internal storage keys were renamed `diamond-*` → `gospel-central-*` WITH migration; the proxy still accepts the legacy `diamond-session` cookie. The local worktree dir `C:\Users\aicod\Diamond`, historical/QA docs, and this file's siblings named `*diamond*`/`MOBILE_AUDIT_PROGRESS.md` keep the old name (records). **Do NOT re-introduce "Diamond" as the app's display name.**

> **OVERHAUL IN PROGRESS (2026-07-03):** the app is mid-way through the user's full overhaul packet
> ("Gospel Central Overhaul and Deliverables - Final"). **Approved plan:**
> `C:\Users\aicod\.claude\plans\structured-scribbling-steele.md` (13 locked decisions + phase specs +
> the anti-hallucination/drift/context-rot protocol — READ IT before any overhaul work).
> **Progress ledger:** `OVERHAUL_PROGRESS.md` (repo root, untracked, append-only — the resume point).
> **Phases 0 + 1 are COMPLETE + deployed** (`fbaaaed` on main): 6-status contact model, booking
> outcome statuses w/ status-gated metrics, 35-study curriculum, gender tags, dropdown fixes, AND the
> 2-church seed consolidation (Newport News 75 / Virginia Beach 54; Joseph + Simon Peter as the 2 BLs;
> ex-BLs are VB Team Leaders keeping branch2/3/4 logins; all 6 statuses in both churches; persona
> manifest at `docs/qa/stable-personas.md`). WebKit e2e project is blocked by a pre-existing
> Secure-cookie-on-http limitation (chip task_17530de7); chromium/mobile/visual e2e green.
> **Phase 2 (dashboard) is COMPLETE + deployed** (`0bb8145`): church toggle + set-default, Completed-
> only current-month KPIs, Your Group (GL+-gated member export), two leaderboards — executed under
> the plan's MODEL-ROUTING protocol (sonnet built the volume, Fable reviewed/gated/deployed; tier
> record in the ledger). **NEXT: Phase 3 — Calendar** (booking-card redesign with the prop-contract
> spec, status controls Fable-inline, day-view alignment on opus; see the plan's routing table).
> The DESKTOP FREEZE IS LIFTED (plan Decision 3) and frontend-to-main deploys are user-authorized —
> the permission classifier may still demand a fresh in-chat "yes" each session.

> This is the action-oriented handoff. `HANDOFF.md` is the authoritative packet (Mike + new devs); `MOBILE_AUDIT_PROGRESS.md` is the durable historical ledger. Where any doc disagrees with code, **code wins** (`src/lib/api/*`, `src/mocks/handlers.ts`). Trust `git` + live browser over any SHA/claim written here.

---

## 0. FIRST 60 SECONDS (re-anchor ritual — before ANY edit)
```
cd C:\Users\aicod\Projects\_src\diamond-live   # the ONLY correct repo. NOT C:\Users\aicod\Diamond (older worktree, do not edit)
git fetch --all --prune
git branch --show-current        # expect: feat/mobile-opt-main
git rev-parse --short HEAD       # ground truth — trust THIS, not any SHA in a doc (was 9d49f62 at handoff)
git log --oneline -8
git status --short               # expect clean (only untracked scratch: "Background Ideas/", "Diamond Quotes.txt", "Organization Tree Ideas/")
```
**Anti-hallucination (in force):** re-Read the real file region before every edit; grep helpers/constants before reuse; label status **VERIFIED** (cite screenshot/DOM/tool output) or **EXPECTED** (untested); "fixed" needs observed browser behavior on prod, not a clean diff; if memory disagrees with git/screenshots, trust the evidence.

---

## 1. IDENTITY, BRANCH & DEPLOY
- **App:** Gospel Central — Bible-study room-booking + discipleship/org-management (church). **Frontend-only**; mock backend is PERMANENT (Mike's Go backend `gospel-experience` is the planned flag-flip cutover, NOT a code removal).
- **Repo:** `C:\Users\aicod\Projects\_src\diamond-live`, GitHub `aicodeproxima/gospel-central`. **Branch `feat/mobile-opt-main`** is the work branch; `main` is prod.
- **Hosting:** Vercel project `gospel-central` (team `aicodeproximas-projects`, **Project ID `prj_3kVmKXbbTlGBZGsXn3np062CtxAY`**), **git-connected** — pushing `main` auto-builds Production (~40–90s) and repoints the prod alias. Prod domains: **`gospel-central.vercel.app`** (primary) + `diamond-delta-eight.vercel.app` (legacy, still live). No `vercel --prod` CLI deploy.
- **FRONTEND-to-main is AUTHORIZED** (user, 2026-06-18; standing authorization 2026-06-25). "The whole front end is ours to change." **Mike owns the BACKEND only** — coordinate backend, don't push backend changes.
- **DEPLOY FLOW (what actually works):** commit on `feat/mobile-opt-main`, then:
  ```
  git checkout main
  git merge --ff-only feat/mobile-opt-main
  git push origin main            # RUN UNCHAINED — alone, while ON main
  git checkout feat/mobile-opt-main
  ```
  Then verify: poll `curl -s https://gospel-central.vercel.app/version.json` until `.commit` == the pushed SHA (the version manifest == deployed commit — see §3).
- **DEPLOY GOTCHAS:** (a) the `~/.claude/hooks/bash-guard.ps1` H4 rule false-positives when `git push origin main` is CHAINED in one command with anything containing `feat/mobile-opt-main` (greedy regex spans `&&`) — keep the push on its own line. (b) The auto-mode permission classifier may demand a fresh in-chat "yes" for `git push origin main` EACH new session — it won't accept a memory/self-edit as authorization. Frontend-to-main IS user-authorized; just re-confirm in chat if it blocks. `origin/feat/mobile-opt-main` intentionally lags `origin/main` (feature-branch push often blocked) — prod = `origin/main`.

---

## 2. WHAT SHIPPED MOST RECENTLY (2026-06-27, all live on prod, verified)
1. **Version stamp (Tier 1) + "update available" detector (Tier 2)** — commits `dda84ed` + `6031401`. Settings ▸ **About** card (Version/Build/Built/Branch) + sidebar footer `v<ver> · <shortSHA>`. A global `UpdateBanner` polls `/version.json` and prompts "Reload" when the deployed commit ≠ the running bundle. `package.json` version = **1.0.0**.
2. **"Built by AccessorySeezin.com" attribution REMOVED** (user request) — the sidebar footer shows the version stamp instead. Do NOT re-add. (Overrides the global "attribution on every app" default for THIS client app.)
3. **Full rename Diamond → Gospel Central** — commit `da03bbd` (code + storage-key migration) + `9d49f62` (live docs) + infra (repo/project/domain renamed via `gh` + Vercel dashboard). All connections re-verified end-to-end.

---

## 3. ARCHITECTURE QUICK-FACTS (verify against code before relying on)
- **Stack:** Next.js 16.2.3 (App Router, Turbopack) · React 19.2.4 · TS 5 · Tailwind v4 (CSS-first `@theme`, NO tailwind.config) · shadcn/ui + `@base-ui` · framer-motion 12 · zustand 5 · next-themes · MSW `^2.13` (`@mswjs/interceptors` pinned **exact 0.41.3**) · R3F/drei/three (Groups 3D) · recharts. 11 `vendor/interactive-*-background` `file:` deps (don't let `git add -A` sweep their node_modules).
- **MSW is SW-FREE** — `src/mocks/browser.ts` patches `window.fetch`/XHR in-page via `BatchInterceptor` (import from `/fetch`+`/XMLHttpRequest` subpaths, NOT `presets/browser`). Unmatched (non-`/api`) requests pass through. No service worker (MSWProvider evicts ghosts). Prod runs `NEXT_PUBLIC_MOCK_API=true` (set in Vercel env for all scopes). `API_BASE` (only in `src/lib/api/client.ts`) = env `NEXT_PUBLIC_API_URL` → `/api` in mock → localhost fallback.
- **Auth is mock + client-side.** Seeded logins, all **password `admin`**: `admin`(Dev/Michael), `overseer1`(Gabriel), `branch1`(Joseph, Branch Leader), `group1`(Elizabeth), `team1`(Jude, Team Leader), `member3`(Ananias, member+teacher — `member1` is NOT teacher-tagged). Wrong pw = real 401; logout **resets the mock to seed** (can't create-a-user-then-relogin-as-them). Contacts are owner-scoped. Seed: `src/mocks/scenario-church-week.ts` (re-seeds to the CURRENT week every load).
- **Version system (new):** `scripts/generate-version.mjs` runs as the **`prebuild`** npm hook (fires on Vercel + local build) and writes BOTH `public/version.json` (served, gitignored artifact) AND `src/lib/version.ts` (`APP_VERSION`, baked into the bundle) from ONE run. Commit source = `VERCEL_GIT_COMMIT_SHA` ‖ `git rev-parse HEAD` ‖ `'unknown'`. `next.config.ts` sends `/version.json` `no-store`. `src/proxy.ts` PUBLIC_PREFIXES includes `/version.json` (else the auth gate 307s it → detector breaks). `src/lib/version-check.ts` = `isUpdateAvailable()` + fetch. Banner mounted in `Providers` after `<ThemeEffects/>`.
- **Rename migration:** `src/lib/stores/migrate-storage.ts` copies legacy `diamond-*` localStorage keys → `gospel-central-*` before the zustand stores hydrate. `src/proxy.ts` accepts BOTH `gospel-central-session` and legacy `diamond-session` cookies; `auth-store.ts` clears both on logout. tree-view reads legacy as fallback.
- **`src/proxy.ts`** = the Next 16 middleware (renamed from `middleware.ts`; shows as "Proxy" in build output) — server-side auth gate via `diamond-session`/`gospel-central-session` cookie + a PUBLIC_PREFIXES allowlist.

---

## 4. VERIFICATION (how to test — prod is the source of truth)
- **NO local dev server for casual checks; verify on the deployed prod URL.** Primary tool = **Chrome MCP** (`mcp__Claude_in_Chrome__*`) in the user's real, signed-in Chrome (has a persisted session). Fallback = chrome-devtools MCP (separate Chrome — may need a fresh `admin`/`admin` login) for faithful device emulation. **Hard-reload after a deploy** (open tab serves the previous cached JS until reload).
- **Version-stamp proof = 5-way cross-source-of-truth, all must equal:** `git rev-parse origin/main` == `vercel inspect <prod alias>` deployed commit == `GET /version.json .commit` == Settings About-card SHA == sidebar SHA.
- **Tests:** `npm test` (vitest unit + integration, ~338 pass/7 todo) · `npm run test:integration` · `npm run e2e` (Playwright: chromium + `mobile-s24`) · `npm run e2e:update` (regen visual baselines — do this whenever brand/layout changes; visual specs are chromium, skip-in-CI).
- **e2e cold-start is slow** (`npm run e2e`'s 120s webServer timeout often trips on this heavy app). Reliable pattern: start the dev server in the BACKGROUND, poll, then run playwright (it reuses the server):
  ```
  # background:  NEXT_PUBLIC_MOCK_API=true NEXT_PUBLIC_MOCK_DATE=2026-06-22T12:00:00 npm run dev
  # poll ready:  curl --retry 40 --retry-delay 5 --retry-all-errors --retry-connrefused -s -o /dev/null -w "%{http_code}" http://localhost:3000/login
  # run:         npx playwright test <spec> --project=chromium
  # (foreground `sleep` is blocked here; use curl --retry or `ping -n N 127.0.0.1` as a timer)
  ```
- **Device widths:** Galaxy **S24 Ultra** — verify at BOTH `412×915` (standard) AND the narrow **`275×596` @ DPR 5.24** (Samsung display-size zoom; the project's worst-case). Tap targets ≥44px, no horizontal page pan, no iOS-specific claims from Chromium.
- **`src/lib/version.ts` churn:** a local `npm run build` rewrites it (tracked + build-overwritten). After a local build, `git checkout -- src/lib/version.ts` before committing (deploy's prebuild regenerates it with the real main SHA).

---

## 5. OPEN / DEFERRED (nothing blocking; pick up as prioritized)
- **Real iOS Safari proof of the SW-free MSW fix still PENDING** — Chromium/emulators can't prove it; needs a physical iPhone tap (login admin/admin → dashboard with data).
- **Backend authz gaps = Mike's, do NOT "fix" in the mock** (masks the real gap): contacts-family (`POST/PUT/DELETE /contacts`, convert), `PUT /users/:id/username`, `GET /audit-log`, `PUT /contacts/:id {assignedTeacherId}`, `PUT /bookings/:id`+cancel. Full list: `docs/qa/out-of-scope-findings.md`, `docs/BACKEND_GAPS.md`.
- **Settings component-internal dual-shell** — the theme/background picker double-renders responsively (separate from the already-fixed `(dashboard)/layout.tsx` dual-mount). Needs its own pass.
- **Calendar/wizard minors:** no UI Delete affordance (only soft-cancel; DELETE handler unreachable), wizard blocked-slot tooltip reads "Occupied by: undefined", a few 275px tap targets <44 (Close-X ~36, duration btns ~40).
- **Secondary docs still say "Diamond"** (optional sweep, not done): `docs/MIKE_HANDOFF.md` and the GitHub repo *description*. Historical/QA docs (`docs/qa/*`, `AUDIT_REPORT.md`, `MOBILE_AUDIT_PROGRESS.md`) are intentionally left as records.
- **QUEUED (not run):** Settings cross-page propagation stress test (16 workflows) — approved plan `C:\Users\aicod\.claude\plans\peaceful-weaving-sundae.md`; report-only, `audit-anti-drift`, browser UI. Run when the user asks.
- **`MEMORY.md` compaction** — the auto-memory index is over its load limit; a task chip (`task_a8b25a29`) was spawned for it.

---

## 6. GOTCHAS (durable)
- **Browser bundle cache after deploy** — the same tab serves OLD JS until a hard reload; hard-refresh before verifying (this is literally what the Tier-2 update banner exists to surface).
- **Grep/ripgrep has NO lookahead** — `(?!…)` silently returns no matches; use alternation + post-filter.
- **`@base-ui` DropdownMenu/Select** don't open from a synchronous `.click()` in an eval — use a real pointer click (chrome-devtools `click` on a snapshot uid) or async click + await the portal.
- **SPA nav can briefly show the prior page / a stale tab-context title** — confirm `location.pathname` + a page selector (or re-`get_page_text`) before asserting.
- **PowerShell is the default shell** — no `&&`/`||`, consumes `--`; use the Bash tool for POSIX (git chains, curl retry loops).
- **Playwright `browser_click` acts as drag-start on `draggable`/WebGL surfaces** — use the element's real DOM `.click()`. Keep Claude-in-Chrome OFF `/groups` (WebGL/GPU). Repeated reloads of `/groups` (2 WebGL contexts) can exhaust the GPU pool browser-wide → node cards stop mounting; recover via a separate Chrome process.

---

## 7. POINTERS
- **Authoritative packet:** `HANDOFF.md` (repo root) — status, stack, deploy, QA evidence, backend handoff.
- **Backend cutover:** `docs/MIKE_HANDOFF.md`, `docs/BACKEND_GAPS.md`. **Testing:** `docs/TESTING.md` (3-tier suite). **Permissions:** `docs/PERMISSIONS.md`.
- **Auto-memory:** `project_diamond_mobile_audit.md` (cross-session status — the DONE entries at the bottom are the recent history; file keeps its old name deliberately).
- **Email:** "email me / email it to me" → **accessoryseezin@gmail.com** (send via Gmail-web as aicodeproxima@gmail.com; classifier blocks novel recipients).

## 8. WORKFLOW CONVENTIONS
- Commit + push without asking; one commit per coherent step; end messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Investigate + plan before non-trivial changes** (the user asks for this explicitly). **Honest status** — tie every "verified" claim to the exact engine/surface tested; surface failures immediately.
- Stage app source only — never commit the scratch dirs (`Background Ideas/`, `Organization Tree Ideas/`, `Diamond Quotes.txt`).
- Records keep the old name (local `C:\Users\aicod\Diamond` worktree, dated QA/audit docs); only LIVE current-state docs (`CLAUDE.md`, `HANDOFF.md`, this file) carry "Gospel Central".
