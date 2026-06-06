# Diamond Mobile — Session Passdown (cold-start for the next session)

> Companion to `MOBILE_AUDIT_PROGRESS.md` (durable ledger). Read BOTH. This is the action-oriented handoff.
> **Updated end of "Diamond Mobile 3" (session `53458c63-619e-4ad4-b7e6-58a4ad469eb5`), context near full.**
> Prior content (Groups-3D rework era) is fully superseded — see the ledger Loops 0–9 for history.

---

## 0. FIRST 60 SECONDS (re-anchor ritual — before ANY edit)
```
cd C:\Users\aicod\Projects\_src\diamond-live   # the ONLY correct repo. NOT C:\Users\aicod\Diamond (stale clone)
git fetch --all --prune
git branch --show-current        # expect: feat/mobile-opt-main
git rev-parse --short HEAD       # expect: b2ff683 (or later)
git log --oneline -8
git status --short               # expect clean
```
Then read: this file → `MOBILE_AUDIT_PROGRESS.md` (ledger, esp. "Loop 9") → plan `C:\Users\aicod\.claude\plans\i-just-realized-that-humming-bentley.md`.
**Anti-hallucination (in force):** re-Read the real file region before every edit; grep helpers/constants before reuse; label status **VERIFIED** (cite screenshot/DOM measurement) or **EXPECTED** (untested); "fixed" needs observed browser behavior, not a clean diff; if memory disagrees with git/screenshots, trust the evidence.

---

## 1. ⛔ TOP PRIORITY — THE OPEN BUG: iPhone login fails ("invalid credentials")
**Status: diagnosed, fix planned, NOT implemented. Awaiting user go-ahead.**

- **Symptom:** on a real **iPhone (iOS Safari)**, `admin`/`admin` → "invalid credentials", data blank. **Works on Android + desktop.** Reproduced on the user's iPhone AND a friend's (link texted, opened in real Safari) → it's iOS-Safari-specific, NOT lost data.
- **Root cause (confirmed):** the mock data + login are powered by **MSW = a service worker**, and **iOS Safari has chronic SW failures** (script not downloaded, SW evicted by memory mgmt). When the SW doesn't intercept, the login `fetch` falls through to `client.ts` `API_BASE = http://localhost:8080/api` — dead from a phone + HTTP-from-HTTPS mixed-content-blocked → throws → caught.
- **"Invalid credentials" is a LIE / catch-all:** `src/lib/hooks/use-auth.ts` (~L32) does `catch { toast.error('Invalid credentials') }` for ANY failure (incl. network). It does **not** mean wrong password. Always trace the catch, don't trust the toast.
- **⚠️ VERIFICATION TRAP (I fell in it):** I "verified working" via Playwright/chrome-devtools = **Chromium**, which is **NOT iOS Safari** for service workers. Chromium/Android emulation proves SSO + app logic but **cannot prove iOS-Safari SW behavior**. Never claim "works on iPhone" from a Chromium/emulator test.
- **THE FIX (planned, researched):** make the mock run **without a service worker** — `@mswjs/interceptors` `browserInterceptors` preset (FetchInterceptor + XHRInterceptor) patches `window.fetch`/XHR in-page and routes to the existing handlers. Works in any browser / in-app webview / Private mode, on any device — and IS verifiable from Chromium (plain JS, no SW). Files: `src/mocks/browser.ts` (replaces `setupWorker`), `src/components/shared/MSWProvider.tsx` (drop the SW gate/reload → patch fetch synchronously, `setReady(true)` immediately), reuse `src/mocks/handlers.ts`. MSW ships `@mswjs/interceptors` as a dep; handler dispatch via `handler.run({request})` (MSW v2) — verify the version/API first.
- **Pending decision (last question asked the user):** (a) implement the SW-free mock now, or (b) first answer Q4/Q5 — iOS version + Safari settings (Private tab? Lockdown Mode? content blockers? "Block All Cookies"? iCloud Private Relay?). The SW-free fix makes Q4/Q5 moot, so (a) is recommended.
- Full research + sources are in the recon doc (see §5).

---

## 2. PROJECT STATE
- **App:** Diamond (Bible-study room booking), Next.js 16 / React / Tailwind / framer-motion / react-three-fiber. Repo `C:\Users\aicod\Projects\_src\diamond-live`, GitHub `github.com/aicodeproxima/Diamond`.
- **Branch:** `feat/mobile-opt-main` (off current `origin/main`). **Pushed. HEAD `b2ff683`.** NEVER push/merge to `main` (integration is the user's deliberate call). Ignore stale `feat/mobile-realdevice`.
- **Device target:** Galaxy **S24 Ultra = 275×596 CSS @ DPR 5.24** (NOT 412×915 — that's the S20 Ultra preset; corrected this project). Design/verify to the narrowest realistic width.
- **DONE + shipped (this project):**
  - Mobile audit **Loops 1–8** (shell/calendar/groups-3D/contacts/dashboard/settings/admin/reports/login) — verified 275→1440, desktop unchanged.
  - **Contacts redesign Loop 9** (commits `f287a9b` A, `5d7e91e` B, `3a51683` C, `0ed329a` D, `b2ff683` ledger): dense desktop **Table view** (`ContactsTable.tsx`) default ≥lg; `ViewMode = grid|kanban|table`; page `max-w-[1600px] mx-auto` + grid `2xl:grid-cols-4` (fixed the 2048 sparse-card stretch); cards/dialog surface **assigned teacher + Step N/5** (`contact-helpers.ts`); deep-link filters `?stage/?type/?q/?view/?id` synced to URL via **`history.replaceState`** (NOT `router.replace`); sticky bulk bar; kanban `min-w-[260px]`+`ring-2`.
- **OPEN:** §1 (iPhone/MSW). Desktop 2048 polish for OTHER screens remains the user's separately-deferred phase.

---

## 3. VERIFICATION LOOP (how to test)
- **NO local dev server. NO Android emulator** (too slow for the R3F page). Test on a **deployed Vercel mock preview** via chrome-devtools MCP (Chromium) — BUT remember §1: Chromium ≠ iOS Safari.
- **Build gate:** PowerShell only (Git Bash mangles args); `Set-Location` every call (cwd resets). `npm run build` (use `npm install`, not `npm ci`). Or just `vercel deploy` (builds remotely + reports errors).
- **Deploy mock preview:** `Set-Location 'C:\Users\aicod\Projects\_src\diamond-live'; vercel deploy --build-env NEXT_PUBLIC_MOCK_API=true 2>&1 | Select-String 'Preview:'` (deploys the WORKING TREE; `--build-env` turns MSW on — do NOT flip the mock default in code).
- **Vercel Deployment Protection is now DISABLED** (`ssoProtection:null`, set via API this session) → **plain preview URLs work on any device, no Vercel login, no bypass query needed.** The bypass secret `diamondMobileAudit2026realdevXYZ` is therefore no longer needed for access (re-enable protection + revoke the secret at final sign-off if desired). To re-enable: `PATCH https://api.vercel.com/v9/projects/diamond?teamId=<id>` body `{"ssoProtection":{"deploymentType":"all_except_custom_domains"}}` (Vercel token: `%APPDATA%\com.vercel.cli\Data\auth.json` `.token`; teamId via `GET /v2/teams` slug `aicodeproximas-projects`, or `config.json` `currentTeam` — do token-read + call in ONE PowerShell invocation).
- **Open + log in (chrome-devtools):** `emulate viewport="275x596x5.24,mobile,touch" userAgent="…Android 14; SM-S928B…Chrome/126…Mobile…"` → `navigate <preview>/login` → wait → fill admin/admin → Sign In. **Re-apply `emulate` after EVERY cross-origin navigation** (new preview subdomain silently resets viewport+UA). **Re-login per new preview origin.** Latest preview: `https://diamond-nq73ywcmy-aicodeproximas-projects.vercel.app` (all A–D).
- Mock creds **admin/admin**. View mode persists in `localStorage['contacts.view']`. Browser UX is the source of truth — screenshots, not rect-math alone.

---

## 4. GOTCHAS (carried + new this session)
- **MSW + iOS Safari** — §1. The crux open issue.
- **chrome-devtools `emulate` RESETS on cross-origin nav** — re-apply viewport+UA after navigating to a new preview subdomain.
- **Grep/ripgrep has NO lookahead** (Rust regex) — `(?!…)` silently returns "No matches" (false negative). Use plain alternation + filter in code.
- **base-ui (`@base-ui`) DropdownMenu/Select** don't open from a synchronous `.click()` in `evaluate_script` — use the chrome-devtools native `click` tool (real pointer events) on a snapshot uid, or async click + await the portal.
- **SPA nav can briefly show the prior page** — confirm `location.pathname` + a page-specific selector before asserting.
- **MSW SW-control timing** (relevant if you keep the SW): the SW doesn't control the page that registered it until reload; `MSWProvider.tsx` already gates + reloads once. (Going SW-free per §1 removes this entirely.)
- **Vercel cookie-bypass** (only if you re-enable protection): the bypass HEADER doesn't cover the SW script; use `?x-vercel-protection-bypass=<secret>&x-vercel-set-bypass-cookie=true`. (Moot while protection is off.)

---

## 5. POINTERS
- **Ledger:** `MOBILE_AUDIT_PROGRESS.md` (Loops 0–9, evidence + commits).
- **Plan:** `C:\Users\aicod\.claude\plans\i-just-realized-that-humming-bentley.md` (Contacts redesign plan + safeguards).
- **Recon doc (learnings to fold into memory/CLAUDE.md — not yet applied):** `C:\Users\aicod\Documents\Claude Improvement Results\Diamond Mobile 3 - 53458c63-619e-4ad4-b7e6-58a4ad469eb5.md`. Contains the MSW/iOS findings + sources, the SW-free fix, the "don't disable SSO" exception, tooling gotchas, and a file-ops table.
- **Email:** "email me / email it to me" → **accessoryseezin@gmail.com** (send via Gmail-web-through-Playwright as aicodeproxima@gmail.com). Don't infer other addresses (classifier blocks novel recipients).
- Architecture quick-facts: `client.ts` `API_BASE=http://localhost:8080/api`; `NEXT_PUBLIC_MOCK_API==='true'` gates MSW; rich `Contact` model in `src/lib/types/contact.ts`; mock seed `src/mocks/scenario-church-week.ts` (50 contacts); auth handler in `src/mocks/handlers.ts` (`POST /login`, seeded users use password `admin`).

## 6. WORKFLOW CONVENTIONS
- Commit + push without asking; one commit per coherent step; end messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Update `MOBILE_AUDIT_PROGRESS.md` after each unit (files · VERIFIED evidence + screenshot/measurement · commit · pending).
- Keep "Built by AccessorySeezin". No backend wiring (mock UX only). Investigate + plan before non-trivial changes (the user asks for this explicitly). Honest status — tie verification claims to the actual engine/platform tested.
- `HANDOFF.md` (sibling) may be an older artifact — this file is the current passdown.
