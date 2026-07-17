# FLIP-PRECONDITIONS — real-backend cutover runbook

> **The flip itself is owner-gated. This document changes nothing; it exists so the gap
> below cannot be missed on flip day.** Every claim carries its evidence and date (G10 —
> prose without proof rots; that is how a dead "`dc549c7` WILL NEED MERGING" survived in a
> passdown for a week).

## THE GAP (verified live, `vercel env ls`, 2026-07-17)

| name | value | environments | age |
|---|---|---|---|
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Encrypted | Preview (`feat/supabase-cutover`) | 11d |
| NEXT_PUBLIC_SUPABASE_URL | Encrypted | Preview (`feat/supabase-cutover`) | 11d |
| NEXT_PUBLIC_MOCK_API | Encrypted | Preview (`feat/supabase-cutover`) | 11d |
| NEXT_PUBLIC_API_URL | `/api` | Preview, Development | 37d |
| NEXT_PUBLIC_MOCK_API | `true` | Preview, Development | 37d |
| NEXT_PUBLIC_API_URL | Encrypted | **Production** | 99d |
| NEXT_PUBLIC_MOCK_API | Encrypted | **Production** | 99d |

**Production has NO `NEXT_PUBLIC_SUPABASE_URL` and NO `NEXT_PUBLIC_SUPABASE_ANON_KEY`.**
The three real-backend rows exist only branch-scoped to `feat/supabase-cutover` previews.
Flipping `MOCK_API=false` in Production today ships a prod build with no backend at all.

## Ordering (the part that bites)

1. Add `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` to **Production FIRST**
   (anon key is browser-safe by design; RLS enforces).
2. **Verify the rows took** — `vercel env pull --environment=production` and check both keys
   are present. (Vercel env vars are per-environment rows; a wrong-env edit fails silently.
   A "Sensitive"-marked var pulls empty — that emptiness is the proof it took.)
3. Only then flip `NEXT_PUBLIC_MOCK_API=false` in Production.
4. Redeploy prod (env changes need a new build) and run the post-flip probes below.

**Reversing steps 1 and 3 = live outage.**

## Other preconditions (carried from `diamond-preflip-remaining` + reference memories, as of 2026-07-17)

- [ ] **Username→email login shim.** Supabase Auth is email-based; all 132 seed users log in
      as `<login>@diamond.org` / `gospelseed1`. The app's username login must map
      username→email before the flip, or nobody can sign in.
- [ ] **Write-path parity gaps** — the remaining mock↔real divergences (see
      `Case Study/archive/wt-mock-parity-uncommitted-2026-07-17.patch` for the salvaged
      unfinished parity work: GET /bookings roomId/start/end filtering, GET /contacts
      RLS-parity visibility scoping).
- [ ] **CSP pass** — still open.
- [ ] **Real-iOS-Safari check** — plain preview link on a physical iPhone, no bypass query,
      no cached cookie (Chromium/emulator results do not count).
- [ ] **Schema markers green** — `SB_PAT=… node scripts/verify-schema.mjs` exits 0
      (80/80 markers as of 2026-07-17; the script derives every assertion from
      `supabase/migrations/*.sql`, so extend it with each new migration).
- [ ] **Cutover branch fast-forwarded to `main`** so its branch-scoped previews test the
      code actually shipping (cutover is kept ONLY as the real-backend preview channel;
      it contains no unique commits — verified ancestor of main 2026-07-17).

## Post-flip verification (probes proven 2026-07-13/14)

- `GET /api/me` returns a **UUID** id (real backend), NOT `u-michael` (mock seed id).
- An unknown `/api/*` route returns **501 JSON**, NOT the HTML app shell (mock's
  passthrough serves the shell; the real router 501s unknown routes).
- Log in as `admin@diamond.org` / `gospelseed1` through the browser UI and complete one
  booking round-trip (create → see it on the calendar → cancel with reason → reason
  visible in the audit detail dialog).

## Rollback

Set Production `NEXT_PUBLIC_MOCK_API=true` and redeploy — the mock backend is fully
self-contained in the bundle (SW-free MSW), so reverting the flag reverts the app. The
Supabase rows may stay in place; they are inert while `MOCK_API=true`.
