@AGENTS.md

# Gospel Central — project rules & facts

Gospel Central (renamed from "Diamond" 2026-06-27) is a **Bible-study room-booking admin/dashboard** app (frontend only). Mock backend; real Go
backend cutover to Mike's `gospel-experience` is pending. This file loads automatically when working in
this repo — keep it current.

## Stack
- **Next.js 16.2.3** (App Router, Turbopack) · **React 19.2.4** · TypeScript 5 · **Tailwind CSS v4**
  (CSS-first `@theme` in `src/app/globals.css`, **NO tailwind.config**) · shadcn/ui · framer-motion 12 ·
  **MSW ^2.13** · zustand 5 · next-themes 0.4.
- **Groups 3D org chart:** @react-three/fiber 9 + drei 10 + three 0.183. **recharts 3** for metrics.
- **11 local `vendor/interactive-*-background` packages** (`file:` deps) — stage deliberately; `git add -A`
  can sweep their node_modules.
- iOS-Safari mock fix pins **`@mswjs/interceptors` at exact `0.41.3`** (not `^`).

## Repo / hosting
- Canonical checkout: `C:\Users\aicod\Projects\_src\diamond-live` on branch **`feat/mobile-opt-main`**.
  A second worktree at `C:\Users\aicod\Diamond` exists on the OLDER `feat/mobile-optimization` branch —
  the user keeps both deliberately; do NOT edit `C:\Users\aicod\Diamond` without confirming.
- Origin `github.com/aicodeproxima/gospel-central` (renamed from `Diamond` 2026-06-27; GitHub redirects the old path). Vercel project **`gospel-central`**, team `aicodeproximas-projects`
  (`team_vILmEnHlW1iEzWxhM3UJhzim`), git-connected; production branch `main` auto-deploys prod in ~40–90s.
- **Prod URL is `gospel-central.vercel.app`** (legacy `diamond-delta-eight.vercel.app` also still resolves;
  the Vercel **project** is `gospel-central`). SSO/Deployment Protection is **era-dependent — always check current `ssoProtection` before
  assuming.** During mobile testing it has been DISABLED (plain previews open on any device); other eras
  use `all_except_custom_domains` (prod public, preview/hash URLs 401 → need the bypass dance).

## Mock backend (no real DB)
- `NEXT_PUBLIC_MOCK_API=true`, set in Vercel for **preview + development + production** so plain deploys
  are mock-on; CLI previews still need `--build-env NEXT_PUBLIC_MOCK_API=true`.
- API base derives from **`API_BASE`, exported ONLY from `src/lib/api/client.ts`** (single source — was
  once copied across files and a stale copy broke blocked-slot delete; never re-derive it elsewhere).
  Mock mode resolves **same-origin `/api`** (NOT `http://localhost:8080` — that caused iOS mixed-content
  failures on HTTPS).
- **MSW runs SW-FREE.** `src/mocks/browser.ts` patches `window.fetch`/XHR in-page via `@mswjs/interceptors`
  (`BatchInterceptor` over `FetchInterceptor` + `XMLHttpRequestInterceptor`) and routes matched requests to
  the existing `handlers` through MSW's public `getResponse()`. iOS Safari drops service workers, so the old
  `setupWorker` SW never claimed the page → login `fetch` escaped to the dead backend → misleading "Invalid
  credentials". **Import interceptors from the `/fetch` + `/XMLHttpRequest` subpaths, NOT `presets/browser`**
  (Turbopack SSR can't resolve that preset). `src/components/shared/MSWProvider.tsx` (NOTE: under
  `components/shared/`, not `mocks/`) no longer SW-gates or reloads; it evicts ghost SWs and shows a
  dead-backend banner. `public/mockServiceWorker.js` is intentionally deleted.
- Seed scenario `"church-week"` in `src/mocks/scenario-church-week.ts` (re-exported by `data.ts`, seeded into
  in-memory module scope by `handlers.ts`). **In-memory, NO persistence** — every page reload RESETS to seed.
  Prod and every preview share identical data; nothing to "copy" between them; edits vanish on refresh.
- **Default login: `admin` / `admin`** (Michael = Dev). All seeded users use password `admin`. Sample logins:
  `stephen` (Dev), `overseer1`, `branch1` (BL Newport News) + `branch5` (BL Virginia Beach) — `branch2`–`branch4`
  are ex-Branch-Leaders now seeded as Team Leaders (2026-07 Phase 1 consolidation; ids/logins kept) —
  `group1`–`group10`, `team1`–`team15`, `member1`–`member99`. Seed is 132 biblically-named users / 6 roles /
  **2 areas (15 rooms: Newport News Zion, Virginia Beach Zion)** / 50 contacts (all 6 statuses in BOTH
  churches) / weekly bookings / 4 default global blocked slots. (Exact seed counts drift — read the
  scenario file if an exact number matters.)

## Routing / auth shell
- `src/proxy.ts` IS the Next 16 middleware (renamed from `middleware.ts` — Next 16 deprecated that filename;
  `export function proxy()`). Redirects non-public routes to `/login` when the `diamond-session` cookie is
  absent; add a route to `PUBLIC_PREFIXES` to expose it unauthenticated.
- The `diamond-session` cookie is mirrored from localStorage by `auth-store`, is **NOT httpOnly** (known XSS
  risk, audit C-2) and is `Secure`. Real-backend cutover must move tokens to httpOnly Set-Cookie.
- Dashboard shell `src/app/(dashboard)/layout.tsx` splits desktop/mobile; `/groups` gets an immersive
  fullscreen layout (Tree3D + floating hamburger).
- **md+ primary nav = the "Dock and Glide" floating menu** (`components/layout/FloatingNav.tsx` +
  headless machine `lib/hooks/use-dock-glide.ts`, ported 2026-07-15 from
  `Assets/GPT Assets/Floating Menu Concept A - Dock and Glide.html`): 52px launcher at 14px inset →
  256px glass panel on hover/focus/pin; main margin animates 80↔284. The old always-visible sidebar
  and the 768–1279 icon "tablet rail" are GONE — touch tablets tap the hamburger to pin (hover is
  pointer-EVENT-gated, `pointerType !== 'touch'`). `Sidebar.tsx` is DELETED (2026-07-16): /groups
  uses the same dock, floating over the fullscreen canvas (no margin dance there); items come
  from `components/layout/nav-items.tsx` (`useNavItems`).
  Nav state is transient (not persisted); a pin survives every client-side route change, /groups
  included. e2e: `floating-nav.spec.ts` (chromium+webkit), `groups-overlay.spec.ts` (/groups dock)
  + `floating-nav-touch.spec.ts` (tablet-touch project, real taps).
- `use-auth.ts` catch is a **catch-all** — a transport failure looks like an auth error unless you read it.
  Typed errors distinguish `NETWORK_ERROR` (status 0) from a real `401 UNAUTHORIZED`; `skipAuthRedirect`
  keeps the login toast honest. A dead-backend banner self-announces a flag-less build.

## Permissions (security-critical)
- **`docs/PERMISSIONS.md` is the source of truth.** Implemented as pure `(viewer, target?) => boolean` helpers
  in `src/lib/utils/permissions.ts`, pinned by the full matrix in `src/lib/utils/permissions.test.ts`.
- Two scope helpers — **do not confuse them**: `buildVisibilityScope` (READ scope; Branch Leader sees all) vs
  `buildManageableScope` (WRITE scope; Branch Leader only own subtree). The manageable-scope split fixed a
  real Branch-Leader cross-branch edit bug.
- **Server/handler `resolveViewer` reads the JWT ONLY — never `body.actorId`.** Returns undefined on
  missing/invalid auth → 401.
- `src/mocks/handlers.ts` opens with centralized helpers in fixed order (`resolveViewer`, `permissionDenied`
  403, `unauthorized` 401, `validationError` 400, `methodNotAllowed` 405, `viewerSubtreeUserIds`,
  `findBookingBlockedConflict`, `findBookingRoomConflict`, `resolveActor`). Reuse these — don't inline new
  error shapes.

## Themes
- **16 themes** (per the `ColorTheme` union in `src/lib/stores/preferences-store.ts` — the source of
  truth): 6 toggleable (basic [renamed from 'default' in the v4 prefs migration], ocean, purple, forest,
  sunset, rose) + 10 mode-fixed (marble [the app default since Phase 7] + 9 animated: starfield, aurora,
  galaxy, jellyfish, rain, matrix, constellation, synapse, deepspace). `voronoi` and `smoke` were REMOVED
  in the v2→v3 persist migration (their vendor packages linger in package.json unreferenced). Mode-fixed
  themes disable the dark/light/system toggle.
- Cascade in `src/app/globals.css` keyed by `[data-theme="X"]` on `<html>`. `ANIMATED_DARK_THEMES` /
  `ANIMATED_LIGHT_THEMES` + the theme→background dispatch live in
  `src/components/shared/ThemedBackground.tsx`; each animated theme wraps a `vendor/interactive-*` package via
  `dynamic({ ssr:false })`.
- **Theme state lives in TWO localStorage keys** — to force a theme headlessly set BOTH then reload:
  `gospel-central-preferences` (zustand-persist v4 — write `{"state":{"colorTheme":"<t>"},"version":4}`;
  the legacy `diamond-preferences` key is only migrated FROM) AND `theme` (next-themes; `'dark'`/`'light'`).
- The fixed mobile bottom nav (and any future fixed/sticky chrome content scrolls under) must use an
  opaque `bg-background` or a real backdrop blur — `--card` is deliberately translucent under marble
  (0.75) and the animated themes (0.35–0.4), which caused audit finding F-0001 (nav bleed-through).
  Guarded by the `F-0001` e2e test in `e2e/mobile.spec.ts`.

## Groups 3D tree
- Layout `src/lib/utils/tree-layout.ts` · scene `src/components/groups/Tree3D.tsx` · toolbar/focus
  `src/app/(dashboard)/groups/page.tsx` · list view `src/components/groups/OrgNode.tsx`.
- **Desktop freeze LIFTED (2026-07 overhaul, user decision):** the compact-gate era (`max-width:1279px`,
  desktop frozen ≥1280) ended with the approved overhaul plan (`~/.claude/plans/structured-scribbling-steele.md`).
  Changes now apply at ALL widths; every phase verifies at desktop ≥1280 + 412×915 + 275×596@5.24.
  Progress ledger: `OVERHAUL_PROGRESS.md` (repo root, untracked).
- **Known overlap risk:** stacked contacts can overlap vertically (`CONTACT_GAP` < world-scaled card height).
  Verify by screenshot, not just rects.

## Contacts (Loop 9 redesign)
- **"Branches" on a contact = their up-to-3 PREACHING PARTNERS (`preachingPartnerIds`)** — the people
  who invited/preach to them (the contact becomes their "fruit") — **NOT the org-tree/church branch**
  (user, 2026-07-04). Main branch = `preachingPartnerIds[0]` (purple highlight). The church lives in
  `groupName` and is a separate concept everywhere contacts are displayed/searched/filtered.
- `ViewMode = 'grid' | 'kanban' | 'table'`; `src/components/contacts/ContactsTable.tsx` +
  `src/lib/utils/contact-helpers.ts`. Default Table ≥lg / Grid below (localStorage-persisted).
- Deep-link filters `?stage / ?type / ?q / ?view / ?id` sync to the URL via **`history.replaceState`**, NOT
  `router.replace` (router.replace didn't reflect to the address bar).
- Rich Contact model in `src/lib/types/contact.ts`.

## Verification standard

### THE USER'S EXPERIENCE ON PROD IS GOSPEL (this governs everything below)
- **The source of truth is the deployed app, driven in a browser, as the USER experiences it.**
  Nothing passes until it is fixed AND confirmed that way. Not "tests green", not "the DOM says
  `data-open=true`", not "the code is right" — those are evidence, never proof.
- **Reproduce the ISSUE and the FIX through the user's own journey.** Re-create their gesture, then
  LOOK at the result (screenshot / see it), then re-run the same gesture after the fix.
- **Headless is fine** — this is NOT a rule about visible windows. It is a rule about WHAT is
  verified: their real journey on the deployed app, never a proxy that stands in for it.
- **Only exception:** the defect is genuinely invisible to a user (build gate, type error, a race
  with no observable surface). If a user can see or feel it, an assertion is not proof.
- **A repro that cannot fail for the claimed reason disproves the diagnosis, not the bug.**
- **Check the surfaces the user compares.** A fix that is "correct" on one page but inconsistent
  with the others is not fixed — consistency is part of the experience.
- WHY (both earned 2026-07-16/17 on the Dock-and-Glide nav, both mine):
  (1) For "the menu pinned itself", the headless repro clicked at (40,40) — inside the launcher's
  own 13–60px box. It proved "a button behaves like a button", was declared root cause, and
  shipped a wrong fix. The real chain sat in that same probe's output, misread.
  (2) A /groups-only fix silently broke "the menu works the same everywhere". 609 vitest +
  chromium + webkit + live DOM assertions were ALL green. The user found it in seconds by
  hovering the menu on two pages. Nobody had looked.

- **Mobile device target = Galaxy S24 Ultra = 275×596 CSS @ DPR ~5.24.** This is the INTENTIONAL Samsung
  "Display size" zoom width — it is NOT the global 412×915 S24 rule and NOT a contradiction of it; Samsung's
  Display-size setting shifts CSS width and the user verifies at this narrowest realistic width. (412×915 is
  the S20-Ultra-ish preset that silently rendered ~14% too wide for months — do not revert to it here.)
- Verify on **deployed Vercel mock previews** via **chrome-devtools MCP Device Mode** (`emulate` viewport
  `275x596x5.24,mobile,touch`) — desktop-speed, exact CSS width, avoids the WebGL-slow Android emulator. See
  `reference_devtools_mobile_emulation_loop`. Re-apply `emulate` after every cross-origin `navigate_page`
  (it resets on each new `diamond-<hash>` subdomain). SW-free MSW requests do NOT appear in
  `list_network_requests` — probe with an `evaluate_script` fetch.
- **chrome-devtools / Chromium can NEVER prove iOS-Safari** behavior (SW, ITP). The user texts plain preview
  links to a real iPhone → previews MUST work on fresh iOS Safari with a plain link (no bypass query, no
  cached cookie). Confirm iOS on a real device before declaring done.
- Integration gate after multi-file changes: clean `npm run build` (`next build`) + ALL `npm run test`
  (`vitest run`) green. **The suite grows every audit loop — run it; never assert a fixed test count.**
- Browser automation: **Chrome MCP / chrome-devtools MCP primary**; Playwright is the fallback only.
  This is not a formality — Chrome MCP runs in the user's REAL Chrome, so they can watch and catch
  what an assertion misses. A whole nav feature was "verified" via raw headless Playwright scripts
  the user never saw, and shipped visibly broken (2026-07-17). Playwright suites remain the
  regression gate; they are not the UX verification.

## NEVER / ALWAYS
- **NEVER call anything fixed/done/passing until it is confirmed on the deployed app through the
  USER'S OWN EXPERIENCE** — their gesture, their journey, and then actually LOOK at it. Green
  tests and DOM assertions are evidence, not proof; they have been fully green while the feature
  was visibly broken. Reproduce the ISSUE the same way before claiming a root cause. Only a defect
  a user can never see or feel (build/type/invisible race) is exempt. See "Verification standard →
  THE USER'S EXPERIENCE ON PROD IS GOSPEL" — that section governs this whole file.
- **NEVER merge or push `feat/mobile-opt-main` to `main`** — integration is the user's deliberate,
  still-pending decision (needs Mike coordination). The real-backend cutover contract lives on `main`
  (`docs/MIKE_HANDOFF.md`, `docs/BACKEND_GAPS.md`).
- **ALWAYS `git fetch` + compare to `origin/main`, and enumerate branches (`git branch -a`) before editing
  or building** — Diamond has had overlapping mobile branches rebuild the same surface (AgendaView, Tree3D,
  MSW SW-gate). Deployed/pushed is truth.
- **ALWAYS reuse the existing `AgendaView.tsx`** (mobile calendar = agenda/list, not a responsive grid) —
  it has been rebuilt three times.
- **NEVER commit local handoff docs** (`PASSDOWN.md` / `SESSION_PASSDOWN.md` / `MOBILE_AUDIT_PROGRESS.md`)
  if they are intentionally untracked.

## Cross-references (global memory)
- `reference_cardoza_codeserver` — Mike's code-server (`code.cardozaservices.com`) where the frontend is
  uploaded; `gospel-experience` there is Mike's Go/SQL backend (DON'T touch it).
- `reference_devtools_mobile_emulation_loop` — the chrome-devtools Device Mode loop + Vercel SSO cookie-bypass.
- `feedback_msw_ios_safari_swfree`, `feedback_deployed_is_truth`, `feedback_verify_prod_playwright`.
