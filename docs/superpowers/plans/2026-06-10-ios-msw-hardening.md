# Diamond iPhone/MSW — Close-the-Bug, Harden & Resilience Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Status anchor (re-derive, do not trust):** This plan was written against **git HEAD `7a32dfd`** (branch `feat/mobile-opt-main`, Loop 11), tree clean. Before executing, run the Boot Ritual (§Resilience R-1) and reconcile against the *current* `git rev-parse --short HEAD`. If HEAD has moved, re-read changed files before editing.

**Goal:** Take the already-committed SW-free MSW fix (`fbfe7ea`) from "architecturally correct, Chromium-verified" to "provably closed on real iOS Safari and structurally impossible to silently re-break," and bake in measures against hallucination, drift, memory loss, and context rot.

**Architecture:** The fix itself is *correct and approved* — do **not** rewrite it. The mock now patches `window.fetch`/XHR in-page via `@mswjs/interceptors` and routes to existing MSW handlers through `getResponse()`; no service worker. This plan adds: (1) a real-iOS verification ladder, (2) defense-in-depth so a mis-built deploy or a ghost SW can't reproduce the symptom, (3) durable regression guards, (4) documentation/state reconciliation, and (5) a standing resilience protocol.

**Tech Stack:** Next.js 16.2.3, React 19.2.4, `msw@^2.13.2`, `@mswjs/interceptors@0.41.3` (currently transitive), Vitest 4, Vercel, Tailwind, react-three-fiber.

---

## 0. Evidence base (what this plan is built on)

Produced by a 22-agent research+audit workflow (`w905968zi`), then **adversarially verified: 13/14 claims confirmed**, 1 refuted (a tangential "Mirage/fetch-mock are commonly cited" aside — irrelevant here). Source-of-truth citations are `file:line`, `node_modules` internals, and the live Vercel env.

**Confirmed GOOD (approve, do not touch the mechanism):**
- `getResponse` is a public, stable msw 2.x export; `@mswjs/interceptors@0.41.3` awaits async `request` listeners before the request proceeds; `controller.respondWith` / `request.clone()` / no-match passthrough are all correct; subpath imports (`/fetch`, `/XMLHttpRequest`) are the right Turbopack/SSR fix; `startMockNetwork()` is idempotent under StrictMode. Interception is active *synchronously* before any child can fetch (`MSWProvider` awaits it). **The iOS service-worker failure class is eliminated by construction.**

**Confirmed OPEN (this plan addresses each):**

| # | Severity | Finding | Evidence |
|---|----------|---------|----------|
| O1 | **HIGH** | Mock mode depends on a build-time `--build-env NEXT_PUBLIC_MOCK_API=true` that lives in **no committed file**; a plain deploy → `MOCK=false` → fetch hits dead `localhost` → **identical "Invalid credentials" symptom**. `NEXT_PUBLIC_API_URL=/api` is set only in Vercel **Production** scope, not Preview/Development. | `MSWProvider.tsx:5`, `client.ts:1`, empty `next.config.ts`, `.gitignore:34`, Vercel env API |
| O2 | **HIGH** | `API_BASE` falls back to `http://localhost:8080/api` (mixed-content-blocked on HTTPS iOS) on preview builds; any interception miss dies silently. | `client.ts:1`, `handlers.ts:33` |
| O3 | **HIGH** | Catch-all `toast.error('Invalid credentials')` fires for **any** error incl. transport. *Verifier nuance:* the naive fix `isApiError && status===401` won't match because `client.ts:135` throws a **bare** `Error('Unauthorized')` for 401 — the 401 path must be re-typed too. | `use-auth.ts:32`, `client.ts:116-135` |
| O4 | **HIGH** | Ghost SW: a returning iPhone that loaded a pre-fix build still has `mockServiceWorker.js` registered & controlling; nothing unregisters it. `public/mockServiceWorker.js` still exists. | `public/mockServiceWorker.js`, `proxy.ts:37`, research §3 finding 5 |
| O5 | MED | `@mswjs/interceptors` imported directly but only transitive (unpinned) via msw. A future msw bump can break the fix with no compile error. | `package.json:34`, `browser.ts:25-27` |
| O6 | MED | Vestigial 3× `IS_MOCK` retry loop + stale "MSW service worker not controlling" comments in `client.ts` (the fix removed the SW; this misleads the next debugger and adds ~600ms hang). | `client.ts:3-5,105,121` |
| O7 | MED | Global 401 → `window.location.href='/login'` full-reloads on a *wrong-password* login, destroying the toast. | `client.ts:126-136` |
| O8 | **HIGH** | **Zero** automated coverage of the `getResponse`→handlers seam (the fix itself). Existing tests only `readFileSync` + regex over `handlers.ts` source. | `critical-scenarios.test.ts:8-11,43-46` |
| O9 | MED→HIGH | **Doc drift:** `SESSION_PASSDOWN.md` one loop stale (asserts HEAD `fbfe7ea`); `HANDOFF.md` *wholly* stale & dangerous (wrong repo `C:\Users\aicod\Diamond`, wrong branch `feat/admin-system`, wrong deploy, calls MSW a "service worker"); ledger `:8` branch line wrong. | `SESSION_PASSDOWN.md:14,39`, `HANDOFF.md:13,104,108`, `MOBILE_AUDIT_PROGRESS.md:8` |
| O10 | LOW | `hydrate()` reads `localStorage.getItem` outside try/catch → uncaught throw on a returning Private/Lockdown/webview visit. | `auth-store.ts:91-108` |
| O11 | LOW | `diamond-session` cookie missing `Secure`. | `auth-store.ts:18-23` |
| O12 | LOW | Lockdown Mode disables WebGL/WASM → R3F dashboard blanks *after* login, misread as "login broken on iPhone." | `Tree3D.tsx`, research §3 risk A |

---

## Resilience Protocol (the four measures — woven into every task)

These are **operating rules for whoever executes this plan**, derived from failures we actually hit this session (three disagreeing HEAD descriptions; a toast that lied; comments describing a deleted architecture; a build flag in no file).

### R-1 · Anti-hallucination — *claims must be grounded, never recalled*
- **Single source of truth = the git working tree.** Never state project state from a narrative doc. Re-derive: `git rev-parse --short HEAD`, `git status --short`, `git log --oneline -8`.
- **Label every claim `VERIFIED` (cite `file:line` / command output / screenshot / URL) or `EXPECTED` (untested).** "Fixed" requires *observed runtime behavior on the target engine*, not a clean diff or a passing Chromium run.
- **Engine-parity rule:** never assert iOS behavior from Chromium/Android/Playwright-Chromium. Tie each verification claim to the exact engine tested.
- **Trust the error path, not the toast.** Before believing any UI error string, grep it and read its `catch`/mapping. (This is literally why O3 hid the original bug.)
- **Research the live surface, not memory.** Confirm library APIs from `node_modules` internals + current docs (as the workflow did for `getResponse`/interceptors), not training recall.
- **Re-read the real file region immediately before editing; grep helpers/constants before reuse.**

### R-2 · Anti-drift — *work stays aligned; code matches its own docs*
- **Designate ONE authoritative state doc** (recommended: `MOBILE_AUDIT_PROGRESS.md`, the ledger). Demote all others (Task 11).
- **Stop embedding literal HEAD SHAs in prose** — they rot. Reference "git HEAD" + the ledger Loop number.
- **Comments must track code.** Stale SW comments (O6) are drift; rewrite them in the same commit that removes the retry loop.
- **One concern per commit;** no "while I'm here." (systematic-debugging discipline.)
- **After each unit, update the ledger:** files · `VERIFIED` evidence · commit SHA · pending.

### R-3 · Anti-memory-loss — *durable capture outside the context window*
- **Encode intent as executable guards.** The `getResponse` contract test (Task 8) means "admin/admin must keep working" survives even if every human forgets why — a future breaking bump fails CI.
- **Put the build config in source** (Task 1). Relying on a human remembering `--build-env` *is* memory loss; it is O1, the top risk.
- **Promote this session's learnings to `~/.claude` memory** (Task 13) — the recon doc's memory-ops table was written but never applied; that gap is memory loss in the wild.
- **Boot Ritual** at session start re-establishes ground truth from git and cross-checks the inherited narrative against it.

### R-4 · Anti-context-rot — *long sessions degrade; structure to resist it*
- **Externalize state continuously** to the ledger/files; never hold "what's done" only in context.
- **Fan wide research/audit to sub-agents/workflows** so raw file dumps never pollute the main context (this audit spent 1.8M tokens in subagents, returned only structured findings).
- **Small, verifiable, committed increments** so any context reset resumes cleanly from git.
- **Re-anchor checkpoint** when context feels full *or* at each work session: re-run the Boot Ritual, re-read the ledger, distrust in-context memory of state.
- **Reconciliation pass** (Task 11) periodically: does every state doc match git HEAD?

**Boot Ritual (run before ANY edit):**
```powershell
Set-Location 'C:\Users\aicod\Projects\_src\diamond-live'   # the ONLY correct repo (NOT C:\Users\aicod\Diamond)
git fetch --all --prune
git branch --show-current        # expect: feat/mobile-opt-main
git rev-parse --short HEAD        # record THIS as ground truth; ignore any SHA a doc asserts
git log --oneline -8
git status --short                # expect clean
```
Then read the ledger `MOBILE_AUDIT_PROGRESS.md`, then this plan. If a doc's claimed HEAD ≠ the command output, **trust the command** and note the drift.

---

## Decisions needed before execution (genuine forks — recommendations given)

- **D1 — O1 build-env reproducibility (pick one, recommend a+c):**
  **(a)** Set `NEXT_PUBLIC_MOCK_API=true` + `NEXT_PUBLIC_API_URL=/api` in Vercel **Preview + Development** scopes (mirror Production) so *every* deploy of this branch is self-consistently mock — safe because there is **no real backend yet**. **(b)** Dedicated mock alias/branch only. **(c)** Runtime guard: if `API_BASE` is still localhost, show a "mock build not active" banner instead of the silent lie. **(d)** Just document the `--build-env` requirement. → *Recommend **a + c**: a makes plain `git push` previews (and texted links) work; c is the foot-gun backstop.*
- **D2 — `HANDOFF.md` (O9):** delete, or add a prominent `> SUPERSEDED` banner pointing to the ledger? → *Recommend **banner** (preserve history, neutralize the wrong-repo danger).* 
- **D3 — Single source of truth (R-2):** confirm the **ledger** `MOBILE_AUDIT_PROGRESS.md` as authoritative; passdown becomes a thin pointer. → *Recommend yes.*
- **D4 — Verification depth (Phase A):** Rung 0 Playwright-WebKit (I can run, Windows) → Rung 1 real-device cloud (TestMu/BrowserStack free tier, the authoritative proof) → Rung 3 your iPhone/friend as backup. → *Recommend Rung 0 now + Rung 1 for sign-off; don't gate solely on your manual tap.*
- **D5 — Retry loop (O6):** drop the mock 3× retry to 1 attempt now, or keep for the future real backend? → *Recommend drop now; reintroduce a real-backend retry when the backend lands.*

---

## Phase A — Verify before changing (close the "is it even on?" gap)

> Rationale: O1 means the symptom can appear for a *non*-iOS reason. Establish what the deployed artifact actually does **before** editing, so we don't chase a ghost.

### Task A0: Confirm the tested deployment is actually built in mock mode
**Files:** none (operational).
- [ ] **Step 1:** Identify the exact URL you open on the iPhone. Confirm it is the `--build-env NEXT_PUBLIC_MOCK_API=true` preview (or the Production alias), **not** a plain `git push` preview.
- [ ] **Step 2:** Verify in the deployed bundle, not locally. In the preview's Safari/Chromium console: `!!window.fetch && performance.getEntriesByType('resource')` — or simpler, attempt login and in DevTools Network confirm `POST .../api/login` returns **200 in-page** and there is **no** request to `http://localhost:8080`.
- [ ] **Step 3:** Record result in the ledger as `VERIFIED (engine=<x>)` or `EXPECTED`. If mock is off, fix the deploy (Task 1) before any iOS conclusion.

### Task A1: Rung 0 — Playwright WebKit engine-plumbing check (Windows-runnable)
**Files:** Create `tests/e2e/login-webkit.spec.ts` (or run ad-hoc).
- [ ] **Step 1:** `npx playwright install webkit`
- [ ] **Step 2:** Script: WebKit → open the mock preview URL → fill `admin`/`admin` → Sign In → assert URL is `/dashboard` and a known dashboard element renders; assert `await page.evaluate(() => navigator.serviceWorker?.controller)` is `null`.
- [ ] **Step 3:** Run. **Report as "engine plumbing OK (WebKit/JSCore), NOT iOS-verified."** (Playwright WebKit on Windows is WebKitGTK, not iOS Safari — it cannot prove SW-eviction/ITP/memory behavior. Confirmed.)

### Task A2: Rung 1 — Real iOS Safari proof (authoritative; per D4)
**Files:** none (operational checklist).
- [ ] **Step 1:** Sign up for a real-device cloud free tier — **TestMu AI (ex-LambdaTest)** real iPhone, or **BrowserStack Live** (~30 min trial, no card).
- [ ] **Step 2:** On a **fresh/clean** device session (rules out a leftover SW) open the *plain* preview URL in real iOS **Safari**.
- [ ] **Step 3:** Log in `admin`/`admin`. **Do not judge by the toast** — open Safari Web Inspector and confirm `POST /api/login` is intercepted in-page (200, mock token), dashboard data loads.
- [ ] **Step 4:** Repeat once in an **in-app webview** (open a texted link from Messages) — the WKWebview path is the strongest confirmation.
- [ ] **Step 5:** Only after ONE clean-session real-iOS success, upgrade status to "fixed on iPhone." Until then: *"root cause removed; Chromium + WebKit-engine verified; real-iOS confirmation pending."*

---

## Phase B — Make the fix impossible to silently re-break

### Task 1: Put mock-mode config in source / make a flag-less deploy safe (O1) — *anti-memory-loss*
**Files:**
- Decision D1(a): Vercel env (Preview + Development scopes) — operational.
- Decision D1(c): Modify `src/components/shared/MSWProvider.tsx`.
- Modify: `src/lib/api/client.ts:1-6` (see Task 2 — same edit region).

- [ ] **Step 1 (D1a):** In Vercel project `diamond`, add to **Preview** and **Development** scopes: `NEXT_PUBLIC_MOCK_API=true`, `NEXT_PUBLIC_API_URL=/api` (mirror Production). Record that this is valid only while there is no real backend.
- [ ] **Step 2 (D1c) — write the failing test:** `src/components/shared/__tests__/mock-guard.test.tsx` asserting that when `API_BASE` resolves to a localhost URL, a `MockNotActiveBanner` is rendered. (jsdom; render `MSWProvider` with `NEXT_PUBLIC_MOCK_API` unset.)
- [ ] **Step 3:** Run → FAIL (no banner).
- [ ] **Step 4 — implement:** in `MSWProvider`, compute `const apiBaseLooksDead = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080/api').startsWith('http://localhost');` and when true render a fixed banner: *"Demo data isn't active on this build. Open the mock preview link."* instead of silently letting login fail.
- [ ] **Step 5:** Run → PASS. Manual: a flag-less build now shows the banner, never the "Invalid credentials" lie.
- [ ] **Step 6:** Commit `fix(mock): make a non-mock build self-announce instead of faking an auth error`.

### Task 2: Same-origin API base in mock mode (O2) — *defense-in-depth*
**Files:** Modify `src/lib/api/client.ts:1-6`; Modify `src/mocks/handlers.ts:33`.

- [ ] **Step 1 — write the failing test:** add to the Task 8 contract test a case asserting the resolved mock base is **not** an `http://localhost` URL when `IS_MOCK` is true.
- [ ] **Step 2 — implement `client.ts`:** reorder so `IS_MOCK` precedes `API_BASE`:
```ts
const IS_MOCK = process.env.NEXT_PUBLIC_MOCK_API === 'true';
// Mock mode: same-origin '/api' so an UNMATCHED request fails as a fast same-origin
// 404 instead of an iOS-Safari mixed-content block (http://localhost from HTTPS).
const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (IS_MOCK ? '/api' : 'http://localhost:8080/api');
```
- [ ] **Step 3 — implement `handlers.ts:33`** with the IDENTICAL expression so request URLs and handler patterns stay coupled:
```ts
const API =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NEXT_PUBLIC_MOCK_API === 'true' ? '/api' : 'http://localhost:8080/api');
```
> Note for the engineer: in **Node/vitest** `IS_MOCK` is false, so both resolve to the absolute `http://localhost:8080/api` — the contract test (Task 8) builds absolute request URLs and matches. In the **browser** mock build, both resolve to `/api` (same-origin); MSW resolves the relative handler pattern against `location.origin`, matching the absolute fetch. Keep the two expressions character-identical.
- [ ] **Step 4:** Run the contract test → PASS. `npm run build` → green.
- [ ] **Step 5:** Commit `fix(mock): resolve API base to same-origin /api in mock mode (no http://localhost on HTTPS)`.

### Task 3: Evict ghost service workers + retire the orphan (O4) — *defense-in-depth*
**Files:** Modify `src/components/shared/MSWProvider.tsx`; Delete `public/mockServiceWorker.js`; Modify `src/proxy.ts:37`; Modify `package.json` (`msw.workerDirectory` block, ~`:61-65`).

- [ ] **Step 1 — implement boot-time unregister** (runs on every load, mock or not — the app uses no SW):
```ts
useEffect(() => {
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => regs.forEach((r) => r.unregister()))
      .catch(() => {});
  }
}, []);
```
- [ ] **Step 2:** Delete `public/mockServiceWorker.js`; remove the `'/mockServiceWorker.js'` entry from `PUBLIC_PREFIXES` in `proxy.ts:37`; remove the `"msw": { "workerDirectory": ... }` block in `package.json`.
- [ ] **Step 3:** `npm run build` → green; grep confirms zero `setupWorker`/`serviceWorker.register` references remain.
- [ ] **Step 4:** Commit `fix(mock): unregister any ghost service worker on boot and remove orphaned SW residue`.
> **Residual (document, don't over-engineer):** a *returning* device's ghost SW may still control the very first navigation before our JS runs; the unregister clears it from the next load. The honest iOS test (Task A2) uses a fresh/private session, so this does not affect sign-off.

### Task 4: Pin `@mswjs/interceptors` as a direct dependency (O5) — *anti-drift*
**Files:** Modify `package.json` (`dependencies`).
- [ ] **Step 1:** Add `"@mswjs/interceptors": "0.41.3"` to `dependencies` (exact pin = the version msw currently resolves).
- [ ] **Step 2:** `npm install`; confirm the lockfile still dedupes a single top-level copy (no nested `msw/node_modules/@mswjs/interceptors`).
- [ ] **Step 3:** `npm run build` → green; login still works in the preview.
- [ ] **Step 4:** Commit `chore(deps): pin @mswjs/interceptors directly so the SW-free import contract can't drift under msw`.

---

## Phase C — Stop the lie and remove the dead SW model (O3, O6, O7)

### Task 5: Type network + 401 errors and split the catch (O3, O7) — *anti-hallucination (no more lying toast)*
**Files:** Modify `src/lib/api/client.ts` (`ApiErrorCode`, `RequestOptions`, `request()`); Modify `src/lib/api/auth.ts`; Modify `src/lib/hooks/use-auth.ts`.

- [ ] **Step 1 — write failing tests** (`src/lib/api/__tests__/client-errors.test.ts`, jsdom): (a) a thrown `fetch` → `request()` rejects with `isApiError(e) && e.status === 0 && e.code === 'NETWORK_ERROR'`; (b) a 401 response with `skipAuthRedirect` → rejects with `isApiError(e) && e.status === 401` and does **not** set `window.location`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3 — `client.ts` changes:**
  - Add `'NETWORK_ERROR'` to the `ApiErrorCode` union.
  - Add `skipAuthRedirect?: boolean` to `RequestOptions`.
  - Replace the retry loop (O6) with a single attempt that throws a typed network error:
```ts
let res: Response;
try {
  res = await fetch(`${API_BASE}${path}`, { ...init, headers, signal: init.signal });
} catch (err) {
  if (isAbortError(err)) throw err;
  throw new ApiError({
    status: 0,
    code: 'NETWORK_ERROR',
    message: err instanceof Error ? err.message : 'Network request failed',
  });
}
```
  - Guard the global 401 redirect and re-type it so it no longer escapes as a bare `Error`:
```ts
if (res.status === 401 && !init.skipAuthRedirect) {
  try { localStorage.removeItem('token'); } catch { /* noop */ }
  if (typeof window !== 'undefined') window.location.href = '/login';
  throw new ApiError({ status: 401, code: 'PERMISSION_DENIED', message: 'Unauthorized' });
}
// login 401 (skipAuthRedirect) falls through to the !res.ok block, which already
// throws ApiError({ status: 401, ... }) with the handler's body message.
```
- [ ] **Step 4 — `auth.ts`:** make login skip the redirect so a wrong password surfaces as a toast, not a reload:
```ts
login(username: string, password: string) {
  return api.post<AuthResponse>('/login', { username, password }, { skipAuthRedirect: true });
}
```
- [ ] **Step 5 — `use-auth.ts`:** discriminate the error:
```ts
import { isApiError } from '../api/client';
// ...
} catch (e) {
  if (isApiError(e) && e.status === 401) {
    toast.error('Invalid credentials');
  } else {
    toast.error('Can’t reach the server — please try again.');
  }
  throw new Error('Login failed');
}
```
- [ ] **Step 6:** Run tests → PASS. Manual on preview: wrong password → toast stays (no reload); a simulated transport failure → "Can't reach the server", **never** "Invalid credentials."
- [ ] **Step 7:** Commit `fix(auth): stop the catch-all 'Invalid credentials' lie — type network vs 401, keep login 401 out of the global redirect`.

### Task 6: Purge the dead SW model from `client.ts` comments (O6) — *anti-drift*
**Files:** Modify `src/lib/api/client.ts:3-6` (and any remaining `:121` comment if the retry loop wasn't fully removed in Task 5).
- [ ] **Step 1:** Replace the "MSW service worker can briefly not be controlling the page…" comment block with an accurate one: the mock is SW-free (`src/mocks/browser.ts`); interception is synchronous and active before first render; a mock-mode network failure is therefore genuine.
- [ ] **Step 2:** `npm run build` → green.
- [ ] **Step 3:** Commit `docs(client): remove stale service-worker comments; the mock is SW-free since Loop 10`.

---

## Phase D — Durable regression guards (O8) + small hardening (O10, O11)

### Task 8: `getResponse` login-contract test — *anti-memory-loss / anti-drift (the keystone guard)*
**Files:** Create `src/mocks/login-contract.test.ts`.
- [ ] **Step 1 — write the test:**
```ts
import { describe, it, expect } from 'vitest';
import { getResponse } from 'msw';
import { handlers } from './handlers';

// In Node, NEXT_PUBLIC_MOCK_API is unset, so handlers resolve the absolute
// localhost base; build matching absolute request URLs here.
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api';
const json = (url: string, init: RequestInit) =>
  new Request(url, { headers: { 'content-type': 'application/json' }, ...init });

describe('mock login transport contract (guards the SW-free fix)', () => {
  it('admin/admin → 200 with a mock token', async () => {
    const res = await getResponse(
      handlers,
      json(`${API}/login`, { method: 'POST', body: JSON.stringify({ username: 'admin', password: 'admin' }) }),
    );
    expect(res?.status).toBe(200);
    const body = await res!.json();
    expect(String(body.token)).toMatch(/^mock-jwt-token-/); // confirm field name against handlers.ts AuthResponse
  });

  it('admin/wrong → 401', async () => {
    const res = await getResponse(
      handlers,
      json(`${API}/login`, { method: 'POST', body: JSON.stringify({ username: 'admin', password: 'nope' }) }),
    );
    expect(res?.status).toBe(401);
  });

  it('GET /me with Bearer → 200', async () => {
    const login = await getResponse(
      handlers,
      json(`${API}/login`, { method: 'POST', body: JSON.stringify({ username: 'admin', password: 'admin' }) }),
    );
    const token = (await login!.json()).token as string;
    const res = await getResponse(handlers, new Request(`${API}/me`, { headers: { Authorization: `Bearer ${token}` } }));
    expect(res?.status).toBe(200);
  });
});
```
- [ ] **Step 2:** Run `npm test -- login-contract` → it should PASS against current handlers. (If the token field name differs, read `handlers.ts:341-395` + the `AuthResponse` type and adjust the assertion — keep the status assertions, they are the load-bearing guard.)
- [ ] **Step 3:** Confirm it FAILS if you temporarily rename the import to a wrong symbol (proves it guards `getResponse` drift), then revert.
- [ ] **Step 4:** Commit `test(mock): pin the getResponse→login contract so a future msw/interceptors bump fails CI`.

### Task 9: Harden `hydrate()` storage reads (O10)
**Files:** Modify `src/lib/stores/auth-store.ts:91-108`.
- [ ] **Step 1:** Wrap the `localStorage.getItem` reads in `try/catch` (treat a throw as logged-out) so a returning Private/Lockdown/webview visit can't throw uncaught.
- [ ] **Step 2:** `npm run build` → green. Commit `fix(auth): tolerate localStorage read failures in hydrate (iOS Private/Lockdown)`.

### Task 10: Add `Secure` to the session cookie (O11)
**Files:** Modify `src/lib/stores/auth-store.ts:18-28`.
- [ ] **Step 1:** Append `; secure` in `setSessionCookie` and `clearSessionCookie` (all-HTTPS Vercel; harmless, blocks plaintext-downgrade leak).
- [ ] **Step 2:** Verify on the HTTPS preview the cookie is still set and login still gates. Commit `fix(auth): mark diamond-session cookie Secure`.

---

## Phase E — Reconcile state docs & capture memory (O9) — *anti-drift / anti-memory-loss*

### Task 11: Establish a single source of truth (D2, D3)
**Files:** Modify `MOBILE_AUDIT_PROGRESS.md:8`; Modify `SESSION_PASSDOWN.md`; Modify or delete `HANDOFF.md`.
- [ ] **Step 1:** Fix the ledger `:8` branch line to `feat/mobile-opt-main`. Add a one-line header: *"This ledger is the single source of truth for Diamond mobile-audit state. Re-derive HEAD from git, not from any prose SHA."*
- [ ] **Step 2:** `HANDOFF.md` (D2): add a top banner `> ⚠️ SUPERSEDED — points to the wrong repo/branch/deploy. Authoritative state: MOBILE_AUDIT_PROGRESS.md + git.` (or delete if you prefer).
- [ ] **Step 3:** `SESSION_PASSDOWN.md`: remove literal `HEAD <sha>` assertions (§§1,2 ritual line) → replace with "run the Boot Ritual; trust `git rev-parse HEAD`." Add a Loop 11 line. Make it a thin pointer to the ledger.
- [ ] **Step 4:** Commit `docs: single source of truth = ledger+git; neutralize stale HANDOFF; de-SHA the passdown`.

### Task 12: Update the ledger with Phases A–D outcomes
**Files:** Modify `MOBILE_AUDIT_PROGRESS.md` (new Loop entry).
- [ ] **Step 1:** Record each shipped task: files · `VERIFIED`-vs-`EXPECTED` evidence (cite engine for any iOS claim) · commit SHA · pending. Commit.

### Task 13: Promote learnings to persistent memory — *anti-memory-loss*
**Files:** `~/.claude/memory/*` + `~/.claude/MEMORY.md` (and the recon doc's pending table).
- [ ] **Step 1:** Create/update memory files from the recon doc's never-applied table: `feedback_msw_ios_safari_swfree.md` (SW-free fix + `getResponse`/interceptors pattern), the **engine-parity caveat** in `feedback_verify_prod_playwright.md`, the **build-env-not-in-source** gotcha, the catch-all-toast rule. Add one-line pointers to `MEMORY.md`. Cross-link `[[reference_devtools_mobile_emulation_loop]]`.
- [ ] **Step 2:** Update `project_diamond_mobile_audit.md` to current truth (branch, 275px, SSO off, Loop 11, this plan's path).

---

## Adjacent cleanups (out of the iOS critical path — schedule separately)
- **O12 — WebGL/Lockdown error boundary** around every R3F `Canvas` (`Tree3D.tsx`, `BookingWizard.tsx`, settings) with a non-3D fallback, so Lockdown Mode blanks gracefully instead of reading as "login broken." (Login is unaffected.)
- **Mislabeled test** `per-user-smoke.test.ts:231-249` asserts `canEditUser` for a `canEditContact` case → read the file, switch the assertion to `canEditContact(viewer, arbitraryContact, subtree)`. (False confidence today; not iOS-related.)

---

## Self-Review (run against the findings table)

- **Coverage:** O1→T1; O2→T2; O3→T5; O4→T3; O5→T4; O6→T5/T6; O7→T5; O8→T8; O9→T11/T12; O10→T9; O11→T10; O12→Adjacent. Verification gap→Phase A. Four resilience measures→§Resilience + tagged tasks. ✅ No finding unaddressed.
- **Type consistency:** `skipAuthRedirect` defined in `RequestOptions` (T5) and consumed in `auth.ts` (T5) and `request()` (T5); `'NETWORK_ERROR'` added to `ApiErrorCode` (T5) before use; `isApiError` already exported from `client.ts` and imported in `use-auth.ts` (T5). `API`/`API_BASE` expression identical across `client.ts` + `handlers.ts` (T2). ✅
- **Placeholder scan:** code steps carry real code; the only deliberately-deferred specifics are the exact token field name (T8 Step 2, with a read-and-confirm instruction) and the `per-user-smoke` assertion (Adjacent, explicitly "read the file first") — both flagged, not silent. ✅
- **Ordering risk:** Phase A first (don't edit before knowing the deployed artifact's behavior). T2 depends on T8 existing for its assertion — T8 can be written first or the T2 assertion added when T8 lands; noted inline.

---

## Execution Handoff

Phases A–E are independently shippable. **Recommended order:** A (verify) → B (un-break-ability) → C (stop the lie) → D (guards) → E (docs/memory). Adjacent cleanups separately.

Per the project rule *"investigate + plan before doing anything"* — this is the plan; **no code has been changed.** Awaiting your go-ahead and your calls on D1–D5.
