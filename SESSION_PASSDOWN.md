# Gospel Central (formerly "Diamond") — Session Passdown (cold-start for the next session)

> **RENAME (2026-06-27): the app is now "Gospel Central".** GitHub repo `aicodeproxima/gospel-central` (was `Diamond`; old path redirects), Vercel project `gospel-central`, prod URL **`gospel-central.vercel.app`** (legacy `diamond-delta-eight.vercel.app` still resolves). Internal storage keys were renamed `diamond-*` → `gospel-central-*` WITH migration; the proxy still accepts the legacy `diamond-session` cookie. The local worktree dir `C:\Users\aicod\Diamond` and historical/QA docs keep the old name (records). Do NOT re-introduce "Diamond" as the app's display name.

> Companion to `MOBILE_AUDIT_PROGRESS.md` (durable ledger). Read BOTH. This is the action-oriented handoff.
> **Updated end of "Diamond Mobile 3" (session `53458c63-619e-4ad4-b7e6-58a4ad469eb5`), context near full.**
> Prior content (Groups-3D rework era) is fully superseded — see the ledger Loops 0–9 for history.

---

## 0. FIRST 60 SECONDS (re-anchor ritual — before ANY edit)
```
cd C:\Users\aicod\Projects\_src\diamond-live   # the ONLY correct repo. NOT C:\Users\aicod\Diamond (stale clone)
git fetch --all --prune
git branch --show-current        # expect: feat/mobile-opt-main
git rev-parse --short HEAD       # ground truth — trust THIS, not any SHA written in a doc
git log --oneline -8
git status --short               # expect clean
```
Then read: this file → `MOBILE_AUDIT_PROGRESS.md` (ledger, esp. "Loop 9") → plan `C:\Users\aicod\.claude\plans\i-just-realized-that-humming-bentley.md`.
**Anti-hallucination (in force):** re-Read the real file region before every edit; grep helpers/constants before reuse; label status **VERIFIED** (cite screenshot/DOM measurement) or **EXPECTED** (untested); "fixed" needs observed browser behavior, not a clean diff; if memory disagrees with git/screenshots, trust the evidence.

---

## 1. ✅ RESOLVED (commit `fbfe7ea`) — pending iPhone sign-off — iPhone login "invalid credentials"
**Status: FIXED in code + Chromium-verified (2026-06-06). ⚠️ ONLY remaining step: user confirms on a real iPhone.** Subsequent hardening (same-origin API base, typed auth errors, dead-backend banner, ghost-SW eviction, pinned interceptors) landed 2026-06-10 — see ledger.

- **Symptom (was):** on a real **iPhone (iOS Safari)**, `admin`/`admin` → "invalid credentials", data blank. Worked on Android + desktop. Reproduced on two iPhones → iOS-Safari-specific, not lost data.
- **Root cause (confirmed):** the mock data + login ran on **MSW = a service worker**, and **iOS Safari has chronic SW failures** (script not downloaded, SW memory-evicted). When the SW didn't intercept, the login `fetch` fell through to `client.ts` `API_BASE = http://localhost:8080/api` (dead from a phone) → threw → caught.
- **"Invalid credentials" is a LIE / catch-all:** `src/lib/hooks/use-auth.ts:32` does `catch { toast.error('Invalid credentials') }` for ANY failure (incl. network). Trace the catch; don't trust the toast.
- **⚠️ VERIFICATION TRAP (carry forward):** Chromium/Android emulation (Playwright, chrome-devtools) proves app logic but **cannot prove iOS-Safari SW behavior**. Never claim "works on iPhone" from an emulator test.
- **THE FIX (DONE):** the mock now runs **with no service worker** — `src/mocks/browser.ts` patches `window.fetch`/XHR in-page via `@mswjs/interceptors` (`BatchInterceptor` = `FetchInterceptor` + `XMLHttpRequestInterceptor`) and dispatches to the existing `handlers` through MSW's public `getResponse(handlers, request)`; `src/components/shared/MSWProvider.tsx` dropped the SW gate/reload and renders immediately. Import interceptors from the `/fetch`+`/XMLHttpRequest` subpaths, NOT `presets/browser` (its `node:null`/no-`import` export map breaks Turbopack's SSR compile). handlers.ts/client.ts/use-auth.ts unchanged. Full detail: **ledger Loop 10**.
- **VERIFIED (Chromium, S24 emulation, preview `diamond-5iuhd8ttj`):** login → `/dashboard` with data; `serviceWorker.controller===null`; 0 SW regs; direct `POST /api/login` intercepted in-page (200); build green (local + Vercel); vitest 242/242.
- **➡️ TO CLOSE THE BUG:** user opens `https://diamond-5iuhd8ttj-aicodeproximas-projects.vercel.app/login` in **real iPhone Safari** and logs in admin/admin → should reach the dashboard with data. (SSO protection is OFF; opens on any device.)
- Original research + sources are in the recon doc (see §5).

---

## 2. PROJECT STATE
- **App:** Diamond (Bible-study room booking), Next.js 16 / React / Tailwind / framer-motion / react-three-fiber. Repo `C:\Users\aicod\Projects\_src\diamond-live`, GitHub `github.com/aicodeproxima/Diamond`.
- **Branch:** `feat/mobile-opt-main` (off current `origin/main`). **Pushed; re-derive current HEAD from git.** NEVER push/merge to `main` (integration is the user's deliberate call). Ignore stale `feat/mobile-realdevice`.
- **Device target:** Galaxy **S24 Ultra = 275×596 CSS @ DPR 5.24** (NOT 412×915 — that's the S20 Ultra preset; corrected this project). Design/verify to the narrowest realistic width.
- **DONE + shipped (this project):**
  - Mobile audit **Loops 1–8** (shell/calendar/groups-3D/contacts/dashboard/settings/admin/reports/login) — verified 275→1440, desktop unchanged.
  - **Contacts redesign Loop 9** (commits `f287a9b` A, `5d7e91e` B, `3a51683` C, `0ed329a` D, `b2ff683` ledger): dense desktop **Table view** (`ContactsTable.tsx`) default ≥lg; `ViewMode = grid|kanban|table`; page `max-w-[1600px] mx-auto` + grid `2xl:grid-cols-4` (fixed the 2048 sparse-card stretch); cards/dialog surface **assigned teacher + Step N/5** (`contact-helpers.ts`); deep-link filters `?stage/?type/?q/?view/?id` synced to URL via **`history.replaceState`** (NOT `router.replace`); sticky bulk bar; kanban `min-w-[260px]`+`ring-2`.
  - **Loop 11** (commit d916046): booking-conflict reason surfaced + contact card opens at top.
- **OPEN:** none code-side — §1 (iPhone/MSW) is FIXED + Chromium-verified (commit `fbfe7ea`), pending only the user's on-device iPhone tap. Desktop 2048 polish for OTHER screens remains the user's separately-deferred phase.

---

## 3. VERIFICATION LOOP (how to test)
- **NO local dev server. NO Android emulator** (too slow for the R3F page). Test on a **deployed Vercel mock preview** via chrome-devtools MCP (Chromium) — BUT remember §1: Chromium ≠ iOS Safari.
- **Build gate:** PowerShell only (Git Bash mangles args); `Set-Location` every call (cwd resets). `npm run build` (use `npm install`, not `npm ci`). Or just `vercel deploy` (builds remotely + reports errors).
- **Deploy mock preview:** `Set-Location 'C:\Users\aicod\Projects\_src\diamond-live'; vercel deploy --build-env NEXT_PUBLIC_MOCK_API=true 2>&1 | Select-String 'Preview:'` (deploys the WORKING TREE; `--build-env` turns MSW on — do NOT flip the mock default in code).
- **Vercel Deployment Protection is now DISABLED** (`ssoProtection:null`, set via API this session) → **plain preview URLs work on any device, no Vercel login, no bypass query needed.** The bypass secret `diamondMobileAudit2026realdevXYZ` is therefore no longer needed for access (re-enable protection + revoke the secret at final sign-off if desired). To re-enable: `PATCH https://api.vercel.com/v9/projects/diamond?teamId=<id>` body `{"ssoProtection":{"deploymentType":"all_except_custom_domains"}}` (Vercel token: `%APPDATA%\com.vercel.cli\Data\auth.json` `.token`; teamId via `GET /v2/teams` slug `aicodeproximas-projects`, or `config.json` `currentTeam` — do token-read + call in ONE PowerShell invocation).
- **Open + log in (chrome-devtools):** `emulate viewport="275x596x5.24,mobile,touch" userAgent="…Android 14; SM-S928B…Chrome/126…Mobile…"` → `navigate <preview>/login` → wait → fill admin/admin → Sign In. **Re-apply `emulate` after EVERY cross-origin navigation** (new preview subdomain silently resets viewport+UA). **Re-login per new preview origin.** Latest preview: `https://diamond-5iuhd8ttj-aicodeproximas-projects.vercel.app` (Loop 10 SW-free fix; SSO OFF → opens on any device). Prior Loop 9: `diamond-nq73ywcmy`.
- Mock creds **admin/admin**. View mode persists in `localStorage['contacts.view']`. Browser UX is the source of truth — screenshots, not rect-math alone.

---

## 4. GOTCHAS (carried + new this session)
- **MSW + iOS Safari** — §1. The crux open issue.
- **chrome-devtools `emulate` RESETS on cross-origin nav** — re-apply viewport+UA after navigating to a new preview subdomain.
- **Grep/ripgrep has NO lookahead** (Rust regex) — `(?!…)` silently returns "No matches" (false negative). Use plain alternation + filter in code.
- **base-ui (`@base-ui`) DropdownMenu/Select** don't open from a synchronous `.click()` in `evaluate_script` — use the chrome-devtools native `click` tool (real pointer events) on a snapshot uid, or async click + await the portal.
- **SPA nav can briefly show the prior page** — confirm `location.pathname` + a page-specific selector before asserting.
- **MSW SW-control timing** — HISTORICAL: the SW-control gate + one-time reload were removed when the mock went SW-free (§1); `MSWProvider.tsx` now starts the in-page interceptor and additionally unregisters any ghost SW on boot.
- **Vercel cookie-bypass** (only if you re-enable protection): the bypass HEADER doesn't cover the SW script; use `?x-vercel-protection-bypass=<secret>&x-vercel-set-bypass-cookie=true`. (Moot while protection is off.)

---

## 5. POINTERS
- **Ledger:** `MOBILE_AUDIT_PROGRESS.md` (Loops 0–9, evidence + commits).
- **Plan:** `C:\Users\aicod\.claude\plans\i-just-realized-that-humming-bentley.md` (Contacts redesign plan + safeguards).
- **Recon doc (learnings to fold into memory/CLAUDE.md — not yet applied):** `C:\Users\aicod\Documents\Claude Improvement Results\Diamond Mobile 3 - 53458c63-619e-4ad4-b7e6-58a4ad469eb5.md`. Contains the MSW/iOS findings + sources, the SW-free fix, the "don't disable SSO" exception, tooling gotchas, and a file-ops table.
- **Email:** "email me / email it to me" → **accessoryseezin@gmail.com** (send via Gmail-web-through-Playwright as aicodeproxima@gmail.com). Don't infer other addresses (classifier blocks novel recipients).
- Architecture quick-facts: `client.ts` exports `API_BASE` (the ONLY base-URL derivation — env `NEXT_PUBLIC_API_URL`, else `/api` in mock mode, else localhost dev fallback); `NEXT_PUBLIC_MOCK_API==='true'` gates the in-page mock (env now set in Vercel for ALL scopes); rich `Contact` model in `src/lib/types/contact.ts`; mock seed `src/mocks/scenario-church-week.ts` (50 contacts); auth handler in `src/mocks/handlers.ts` (`POST /login`, seeded users use password `admin`; wrong password = real 401 `UNAUTHORIZED`, transport failure = `NETWORK_ERROR` — the toast no longer lies).

## 6. WORKFLOW CONVENTIONS
- Commit + push without asking; one commit per coherent step; end messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Update `MOBILE_AUDIT_PROGRESS.md` after each unit (files · VERIFIED evidence + screenshot/measurement · commit · pending).
- **"Built by AccessorySeezin" attribution REMOVED (user request, 2026-06-27) — do NOT re-add.** (The sidebar footer now shows the app version stamp instead.) No backend wiring (mock UX only). Investigate + plan before non-trivial changes (the user asks for this explicitly). Honest status — tie verification claims to the actual engine/platform tested.
- `HANDOFF.md` (sibling) may be an older artifact — this file is the current passdown.
