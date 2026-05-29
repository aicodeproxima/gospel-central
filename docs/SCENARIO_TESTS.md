# Diamond — Scenario Test Plan

**Purpose:** Twenty-five multi-step, multi-page user-journey scenarios that exercise UI/UX, functionality, and reliability beyond what smoke tests (`page loads`, `button clicks`) can catch. **12 of 25 are 🔴 Critical** (#1, #2, #7, #9, #13, #16, #20, #21, #22, #23, #24, #25). Each scenario:

- Pins a real user journey, not a synthetic component test
- Touches **2+ pages** with **3+ user actions**
- Has explicit **pass criteria** + a **"beyond smoke" angle** (the bug class it catches that a smoke test would miss)
- Names a **persona** from the seed roster so the runner can pick the right login
- Targets **viewport, theme, role, and persona variance** in combination

**How to run:** every scenario is independent; run any subset. Today these are manual / Playwright-driven; future B-batch may automate with vitest-browser or Playwright fixtures. Capture screenshot evidence for every Critical / High failure.

**Severity legend:** 🔴 Critical (blocks production) · 🟠 High (degrades UX in the worst-case path) · 🟡 Medium (annoying but recoverable) · 🟢 Low (cosmetic / aspirational)

---

## Summary table — all 25 scenarios at a glance

| # | Title | Persona | Sev | Steps | Pages → Tabs / Sub-views touched |
|---|---|---|:-:|:-:|---|
| 1 | New Member's First Booking via Forced First-Login | converted member | 🔴 | 8 | `/login` → `/first-login` → `/dashboard` (Quick Access tiles) → `/calendar` (day view) → **BookingWizard** dialog (4 steps: area→room→time→activity) → `/calendar` re-render → `/dashboard` counter |
| 2 | BL Creates Group → Blocks Time → Conflict-Detects Booking | u-branch-1 (Joseph) | 🔴 | 7 | `/admin?tab=groups` → `/admin?tab=blocked` (create row + 'Add Blocked Slot' dialog) → `/calendar` (week view) → **BookingWizard** (rejected attempt + retry) → `/admin?tab=audit` (filter Action+Actor+Date) |
| 3 | Member Direct-API Escalation Attempt | u-mem-1 | 🟠 | 6 | `/login` → `/dashboard` (sidebar inspection) → DevTools console (3 fetch probes) → URL bar nav `/admin` → `/dashboard` (redirect) |
| 4 | Mobile Contact Pipeline Drag → Detail → Persistence | u-team-1 @ 430×932 | 🟠 | 7 | `/contacts` (kanban view, 5 stage columns) → drag/dropdown stage change → **ContactDetailDialog** (notes + sessions tabs) → `/contacts` (verify column) → hard-refresh |
| 5 | Audit Log Filter + Pagination + Search Race | u-michael | 🟡 | 9 | `/admin?tab=audit` (Action filter, EntityType filter, search input, page-3 pagination, refresh, debounced re-search, mid-debounce filter switch) |
| 6 | Multi-Step Wizard + Theme Switch Mid-Flow | u-michael | 🟡 | 8 | `/admin?tab=users` → **CreateUserWizard** (step 1 name/email + step 2 role/parent) → `/settings` (Theme card) → back to `/admin?tab=users` → wizard re-open |
| 7 | Concurrent Booking Race in Two Tabs | u-team-1 ×2 tabs | 🔴 | 6 | Tab A: `/calendar` → **BookingWizard**; Tab B: `/calendar` → **BookingWizard** (same slot); both submit; both refresh-converge |
| 8 | Profile Photo Upload Survives Logout/Login + Theme | u-mem-1 | 🟡 | 8 | `/settings` (Profile section, photo upload widget) → `/dashboard` (sidebar avatar) → refresh → `/settings` (Theme card, switch to galaxy) → `/dashboard` (verify) → `/login` (logout) → `/dashboard` (re-login + verify) |
| 9 | Forced-Password-Change Loop Cannot Be Bypassed | u-mem-50 + reset | 🔴 | 9 | `/login` → `/first-login` (forced) → URL bar nav `/dashboard`, `/calendar`, `/contacts`, `/admin` (all redirect) → 4 invalid password attempts (= temp, <6 chars, empty, non-match) → valid set → `/dashboard` |
| 10 | Role Promotion Cascades to UI Affordances | u-overseer-gabriel → promotes u-mem-99 | 🟠 | 8 | `/admin?tab=users` → **EditUserDialog** (role + parent picker) → `/admin?tab=audit` (verify role_change + group_assignment rows) → logout/login → `/dashboard` (sidebar gains Reports link) → `/contacts` (Convert affordance now visible) |
| 11 | Cross-Tab Logout Sync | u-michael ×2 tabs | 🟡 | 5 | Tab A: `/dashboard`; Tab B: `/admin?tab=users` → tab A logout → tab B action attempt → tab B redirect to `/login` → tab B refresh confirmation |
| 12 | Booking Edit Requires Reason → Audit Carries It | u-team-1 | 🟡 | 7 | `/calendar` (find past booking) → **BookingWizard** edit-mode (room change, missing-reason validation block, reason fill, save) → `/admin?tab=audit` (filter EntityType=booking Action=update, verify details field) |
| 13 | Contact-to-User Conversion Atomicity | u-michael | 🔴 | 10 | `/contacts` (list view, baptism_ready filter) → **ContactDetailDialog** (Convert tab) → role+parent submit → `/admin?tab=users` (verify new user, mustChangePassword=true) → `/admin?tab=audit` (verify paired user.create + contact.update rows) → `/contacts` (verify status='converted') → row menu DELETE → verify soft-delete (record stays, status=inactive) |
| 14 | Search-Across-Animated-Theme Switch | u-stephen | 🟡 | 10 | `/contacts` (search debounce) → tab to `/settings` (Color Accent tile, switch to voronoi) → back to `/contacts` (verify search persists) → stage filter add → `/settings` (back to default) → `/contacts` (verify search+filter combined) → clear search |
| 15 | Mobile First-Login on Animated Theme | u-mem-50 + reset @ 430×932 + theme=matrix | 🟡 | 8 | `/login` (with prior matrix theme in localStorage) → `/first-login` (form vs virtual keyboard, canvas z-index, contrast check) → password set → `/dashboard` (mobile bottom-nav appears, sidebar hidden) → scroll perf check |
| 16 | Network-Drop Mid-Booking → Recovery Without Duplicate | u-team-1 | 🔴 | 7 | `/calendar` → **BookingWizard** → DevTools Network=Offline → Submit (error toast) → Network=Online → Submit retry → `/calendar` (verify exactly 1 booking, optional tab-close+reopen replay test) |
| 17 | Permissions Tab Visibility Across All 6 Roles | sequential: Dev → Overseer → BL → GL → TL → Member | 🟢 | 6 | `/admin?tab=permissions` (Dev: 8 sections × 6 roles matrix) → logout/login as Overseer (verify identical) → BL (verify view-only access) → GL/TL/Member (URL `/admin` → redirect to `/dashboard`) |
| 18 | Reports Date-Range → CSV Export → Audit Trail | u-michael | 🟡 | 8 | `/reports` (charts: bookings/contacts/sessions, date-range picker last-7-days) → CSV export button → browser download → CSV vs chart row-count comparison → `/admin?tab=audit` (filter EntityType=report Action=export) |
| 19 | All 12 Mode-Fixed Themes Show Correct Disabled-Toggle UX | u-michael | 🟢 | 12 (1 per theme) | `/settings` (Theme card) — cycle through marble, starfield, aurora, galaxy, jellyfish, rain, matrix, voronoi, constellation, smoke, synapse, deepspace; each verifies disabled Dark/Light/System buttons + caption; then verify default + ocean re-enable |
| 20 | Error Boundary Catches → Posts to /api/error-log → Reset Recovers | u-mem-1 (trigger) + u-michael (verify) | 🔴 | 7 | `/dashboard` (force render error via console) → **ErrorBoundary fallback** (heading, "Try again" + "Back to dashboard" buttons) → "Try again" reset → `/dashboard` re-render → logout/login as Dev → `curl /api/error-log` → verify viewerId+role+url+stack present |
| 21 | Session Token Expiry Mid-Action → Graceful Re-auth | u-team-1 | 🔴 | 9 | `/calendar` → **BookingWizard** (filled, not submitted) → DevTools (clear token + cookie) → submit → 401 surfaces → `/login` (re-auth) → `/calendar` (verify zero duplicates) → optional localStorage queue replay |
| 22 | Audit Log Tamper Attempt — Append-Only Contract | u-michael | 🔴 | 7 | `/admin?tab=audit` (capture target row) → DevTools (5 tamper probes: PUT, DELETE, PATCH, POST-with-fabricated-id, bulk DELETE) → `/admin?tab=audit` (verify all 4xx/405) → row + count integrity → search `userId='attacker'` returns zero |
| 23 | Cross-Branch Resource Access Matrix Verification | u-branch-1 (Joseph @ Newport News) on Williamsburg-owned resources | 🔴 | 10 | Setup as Michael → re-login as Joseph → `/contacts` (cross-branch read) → **ContactDetailDialog** (cross-branch edit) → cross-branch convert → `/calendar` (area=`area-williamsburg` filter, cross-branch booking) → `/admin?tab=users` (cross-branch password reset) → `/admin?tab=audit` (filter `userId=u-branch-1`, verify 4 cross-branch rows) |
| 24 | Soft-Delete + Restore Round-Trip Across All 5 Entity Types | u-michael | 🔴 | 25 (5 entity types × 5 verifications) | `/admin?tab=users` (User deactivate→restore) → `/admin?tab=rooms` (Room deactivate→restore) → `/admin?tab=blocked` (BlockedSlot delete→`?includeInactive=1` verify) → `/admin?tab=contacts` (Contact delete→status='inactive' check) → `/calendar` (Booking soft-cancel→restore); each cycle verifies UX hide, includeInactive reveal, paired audit rows, before/after snapshots, idempotent restore |
| 25 | Booking Double-Submit / Button-Mash Idempotency | u-team-1 | 🔴 | 9 | `/calendar` → **BookingWizard** (filled) → DevTools (mash submit 2× synchronously, then 5×) → `/calendar` (verify exactly 1 booking) → `/admin?tab=audit` (filter EntityType=booking Action=create, verify exactly 1 row per mash test) |

**Totals:** 219 steps across 25 scenarios; **5 use multi-tab / multi-window setups** (#7, #11, plus #14 which jumps between settings + contacts); **9 require dialogs/wizards** (BookingWizard, CreateUserWizard, EditUserDialog, ContactDetailDialog, ErrorBoundary fallback); **all 9 admin tabs touched** when including #24's cross-tab walk (`users`, `groups`, `blocked`, `audit`, `permissions`, `rooms`, `tags` via #19, `contacts` admin tab via #24, plus `system` still uncovered).

**Distinct admin tabs covered:** `users` (#6, #10, #13), `groups` (#2), `blocked` (#2), `audit` (#2, #5, #10, #12, #13, #18), `permissions` (#17), plus implicit `rooms`/`tags` reachable via #2 / #19 follow-ons. **Not covered by these 20:** `system` (Dev-only config) and `contacts` admin table (covered indirectly via #13's contact flow). Add a 21st scenario if you want explicit System Config coverage.

---

## 1. New Member's First Booking via Forced First-Login 🔴

**Persona:** A converted contact → user (mock: deactivate `member1`'s password and reset). **Pages:** `/login` → `/first-login` → `/dashboard` → `/calendar` → BookingWizard → back to `/calendar`. **Why this matters:** the *most common cold-start path* a new church member walks. Bug here = bad first impression for every onboarded user.

**Steps:**
1. Admin resets the user's password (capture the temp password from the toast).
2. Open an incognito window; login with the temp password.
3. Forced-redirect lands on `/first-login`; set new password (≥6 chars, ≠ temp).
4. Land on `/dashboard`; verify quick-access cards render with non-empty counts where relevant.
5. Click Calendar quick-access tile.
6. Open BookingWizard; pick area `area-newport-news`, room `rm-nn-bs1`, today + 1h, activity `bible_study`, self as teacher.
7. Submit; expect 201 + toast.
8. Verify booking appears in `/calendar` grid AND the dashboard counter incremented (refresh to be sure).

**Pass criteria:** New password persists; `mustChangePassword` cleared; booking reflects on **both** `/calendar` and `/dashboard` without manual refresh; zero console errors.

**Beyond smoke:** Catches the forced-state redirect chain breaking on edge users (Capacitor/PWA install state, stale tokens), `mustChangePassword` flag-clear timing bug, dashboard counter not invalidating cache after booking creation.

---

## 2. Branch Leader Creates Group → Blocks Time → Conflict-Detects Booking 🔴

**Persona:** `u-branch-1` (Joseph, Newport News BL). **Pages:** `/admin?tab=groups` → `/admin?tab=blocked` → `/calendar` → BookingWizard → `/admin?tab=audit`.

**Steps:**
1. Login as Joseph; create a new group `"Tuesday Bible Study"` under his branch.
2. Switch to Blocked Slots tab; create a global Tuesday 19:00-21:00 weekly block, reason `"Service hours"`.
3. Navigate to `/calendar`; pick a Tuesday in the next 4 weeks.
4. Try to book the new group leader for Tuesday 20:00; expect 409 `BLOCKED_SLOT_CONFLICT` toast naming the slot's reason.
5. Reschedule to Tuesday 18:00; expect success.
6. Open `/admin?tab=audit`; filter by today + Joseph as actor.
7. Verify 4 rows in order: `group.create`, `blocked_slot.create`, `booking.create` (the second attempt), and the rejected attempt's `booking_failed` (if emitted) or absence of a successful row for the first attempt.

**Pass criteria:** Conflict toast matches the slot's `reason`; success path completes; audit log captures the journey.

**Beyond smoke:** Catches the Wave-2 "BLOCKED_SLOT_CONFLICT details payload" regression (verified clean in the audit but worth re-running after refactors), audit-log filter-by-actor on the same day, and the rare BL writes-then-reads-own-write race condition.

---

## 3. Member Direct-API Escalation Attempt 🟠

**Persona:** `u-mem-1`. **Pages:** `/login` → `/dashboard` → DevTools console → manual nav to `/admin`.

**Steps:**
1. Login as `member1`.
2. Verify sidebar lacks Admin / Reports links (FE gate).
3. Open DevTools; run:
   ```js
   const t = localStorage.getItem('token');
   const r = await fetch('/api/users', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
     body: JSON.stringify({ username: 'esc', firstName: 'Esc', lastName: 'Esc', email: 'e@x.com', role: 'overseer', createdById: 'u-mem-1' }),
   });
   console.log(r.status, await r.json());
   ```
4. Verify response is `403 PERMISSION_DENIED` with a useful `message`.
5. Manually navigate the URL bar to `/admin`; verify redirect to `/dashboard`.
6. Verify no boundary triggered; no toast leaked the API error.

**Pass criteria:** §7 shim returns 403; FE redirect honors `canSeeAdminPage`; user-visible app stays clean.

**Beyond smoke:** Catches drift between FE permission helpers and the §7 server-side gates (audit Critical-tier).

---

## 4. Mobile Contact Pipeline Drag → Detail Dialog → Persistence 🟠

**Persona:** `u-team-1` on **430×932** viewport (iPhone Pro Max). **Pages:** `/contacts` (kanban) → ContactDetailDialog → `/contacts` (verify) → refresh.

**Steps:**
1. Login as `team1` on mobile viewport (DevTools device emulation).
2. Open `/contacts`; switch to kanban view if not default.
3. Find a contact in `first_study` column.
4. Drag (touch) to `regular_study` — OR if drag is desktop-only, use the per-card stage dropdown (the mobile fallback affordance must exist).
5. Tap card to open ContactDetailDialog; verify pipelineStage shows `regular_study`.
6. Close dialog; verify card stays in `regular_study` column.
7. Hard-refresh the page; verify change persists.

**Pass criteria:** Mobile has a drag-or-fallback affordance; state persists across refresh; dialog reflects post-update state.

**Beyond smoke:** Catches the **mobile drag affordance gap** (touch drag is unreliable on iOS — requires a fallback) AND the optimistic-update rollback bug if the PUT fails.

---

## 5. Audit Log Filter + Pagination + Search Race 🟡

**Persona:** `u-michael`. **Pages:** `/admin?tab=audit`.

**Steps:**
1. Open audit log.
2. Set filter: Action=`create`, EntityType=`user`.
3. Wait for fetch; verify counts match `total`.
4. Click page 3.
5. While on page 3, change EntityType to `booking` — verify pagination resets to page 1.
6. Refresh the page; verify filters are still applied (URL state OR sticky state).
7. Clear filters; type `@member1` into search.
8. Mid-debounce (within 200ms), switch entity filter to `blocked_slot`.
9. Verify final result reflects BOTH search + filter intersection (not stale).

**Pass criteria:** Filter changes reset pagination; debounced search doesn't fire stale results; refresh preserves intent.

**Beyond smoke:** Catches **out-of-order async response handling** (request 1 returns after request 2; without abort handling, stale data clobbers).

---

## 6. Multi-Step Wizard + Theme Switch Mid-Flow 🟡

**Persona:** `u-michael`. **Pages:** `/admin?tab=users` → CreateUserWizard → `/settings` → back.

**Steps:**
1. Open Create User wizard; fill step 1 (firstName, lastName, email).
2. Advance to step 2 (role + parent).
3. Open `/settings` in same tab.
4. Switch theme from `default` → `starfield`.
5. Navigate back to `/admin?tab=users`.
6. Re-open Create User wizard.
7. Inspect: form should EITHER be reset (preferred — wizards usually don't survive navigation) OR show a "resume draft" prompt.
8. Re-fill; submit; verify user created.

**Pass criteria:** No silent data loss; theme switch during multi-step doesn't crash anything; user is never confused about which form-state they're in.

**Beyond smoke:** Catches **state-restoration ambiguity** (the user expectation is "I came back, my work is here" or "I lost it on purpose" — never "I think it's there but it isn't").

---

## 7. Concurrent Booking Race in Two Tabs 🔴

**Persona:** `u-team-1` in two tabs. **Pages:** `/calendar` in both.

**Steps:**
1. Open `/calendar` in tab A; same in tab B.
2. In tab A, start booking creation: Tuesday 10:00, room `rm-nn-bs1`, activity `meeting`.
3. In tab B, start the same: Tuesday 10:00, room `rm-nn-bs1`.
4. Submit tab B first → expect 201.
5. Submit tab A → expect 409 if room-collision detection exists, OR 201 with audit row showing two bookings overlap.
6. Refresh both tabs; verify they show the SAME state (no fork).

**Pass criteria:** No silent corruption; either pre-write detection rejects the second, or the audit log honestly records the collision; both tabs converge.

**Beyond smoke:** Catches **concurrent-write inconsistency** — the most common reliability bug after permission gates. Tests optimistic UI rollback paths.

---

## 8. Profile Photo Upload Survives Logout/Login + Theme + Reset 🟡

**Persona:** `u-mem-1`. **Pages:** `/settings` → upload → `/dashboard` → refresh → logout → login → `/dashboard`.

**Steps:**
1. Login as `member1`; navigate to `/settings`.
2. Upload a profile photo (per memory: stored as base64 in localStorage).
3. Verify preview shows in the Profile section.
4. Navigate to `/dashboard`; verify avatar in sidebar shows the uploaded photo.
5. Hard-refresh; photo persists.
6. Switch theme to `galaxy` (animated); photo still renders correctly above the canvas.
7. Logout; login again as `member1`.
8. Verify photo persists (since it's tied to user-keyed localStorage per memory file).

**Pass criteria:** Photo survives all 4 lifecycle events without re-upload.

**Beyond smoke:** Catches **localStorage key collision** between users (storing photo as `profile-photo-base64` global vs `profile-photo-${userId}`), and theme-switch-clears-localStorage regressions (the env-var corruption pattern from memory files).

---

## 9. Forced-Password-Change Loop Cannot Be Bypassed 🔴

**Persona:** `u-mem-50` after admin password reset. **Pages:** `/login` → `/first-login` → manual nav attempts.

**Steps:**
1. As `u-michael`, reset `member50`'s password.
2. Login as `member50` with the temp password.
3. On `/first-login`, try to manually navigate to `/dashboard` via URL — expect redirect back.
4. Try to navigate to `/calendar`, `/contacts`, `/admin` — all redirect.
5. Try to set new password = the temp password — reject (validation).
6. Try new password `"abc"` (too short) — reject.
7. Try new password = empty — reject.
8. Set valid password; redirect to `/dashboard`; `mustChangePassword` clears.
9. Manually navigate to `/first-login` — verify redirect to `/dashboard` (no longer forced).

**Pass criteria:** Loop is escapable only via valid password; manual nav blocked at every page; `mustChangePassword` flag clears exactly once.

**Beyond smoke:** Catches **forced-state escape via direct URL** — a real security hole if the hydration race lets the user briefly see protected pages before the redirect kicks in.

---

## 10. Role Promotion Cascades to UI Affordances 🟠

**Persona:** `u-overseer-gabriel` promoting `u-mem-99` → `team_leader`. **Pages:** `/admin?tab=users` → EditUserDialog → logout → login → `/dashboard`.

**Steps:**
1. As Gabriel, open `/admin?tab=users`.
2. Find `member99`; open Edit dialog.
3. Change role: `member` → `team_leader`; pick a Group Leader as parent.
4. Save; verify success toast + audit row (`role_change` + `group_assignment`).
5. Logout; login as `member99` (now Team Leader).
6. Verify sidebar shows the admin-tier links the promoted role earns. Reports remains hidden (matrix gates Reports at BL+; see `canAccessReports` at `src/lib/utils/permissions.ts:545-549` + `docs/PERMISSIONS.md` line 168). When promoting a Member → BL+ instead, Reports DOES appear; for TL the promotion unlocks `canConvertContacts` + `canCreateUser(MEMBER)` instead.
7. Verify `/contacts` now shows the "Convert to User" affordance on contact detail.
8. Verify `member99` can create bookings on behalf of subordinates (was member-only before).

**Pass criteria:** Permission propagates; UI affordances change without manual refresh after re-login; audit log is paired correctly.

**Beyond smoke:** Catches **stale UI gates** that didn't get the role-change memo (e.g., a sidebar link that reads `viewer.role` once at mount).

---

## 11. Cross-Tab Logout Sync 🟡

**Persona:** `u-michael` in two tabs. **Pages:** `/dashboard` (tab A), `/admin` (tab B).

**Steps:**
1. Open `/dashboard` in tab A; `/admin` in tab B.
2. In tab A, click Logout; confirm `/login` lands.
3. In tab B (still showing `/admin`), wait 2-3s; click any action button (e.g., "Add User").
4. Verify tab B detects the logout and either redirects to `/login` OR shows a "Session expired" message.
5. Refresh tab B; verify clean `/login` state.

**Pass criteria:** Tab B doesn't silently let an unauthenticated user mutate data; cross-tab session state stays consistent within a few seconds OR on next user action.

**Beyond smoke:** Catches **stale session in second tab** — without a `storage` event listener or BroadcastChannel, tab B happily keeps acting as Michael until it 401s on the next mutation.

---

## 12. Booking Edit Requires Reason → Audit Carries It 🟡

**Persona:** `u-team-1`. **Pages:** `/calendar` → BookingWizard edit → `/admin?tab=audit`.

**Steps:**
1. Find a yesterday's booking on `/calendar` (or create one with `startTime` in the past via console).
2. Click to open BookingWizard in edit mode.
3. Change the room.
4. Try to save WITHOUT entering an `editReason` — expect validation block.
5. Enter `"Room changed due to AC issue"`; save.
6. Navigate to `/admin?tab=audit`; filter EntityType=`booking`, Action=`update`.
7. Find the row; verify `details` field includes the reason string verbatim.

**Pass criteria:** Required-field validation fires; audit row carries the reason; filter+search find the row.

**Beyond smoke:** Catches **conditionally-required fields** (only required for past bookings) and the audit-emission completeness for that path.

---

## 13. Contact-to-User Conversion Atomicity 🔴

**Persona:** `u-michael`. **Pages:** `/contacts` → ContactDetailDialog → `/admin?tab=users` → `/admin?tab=audit` → `/contacts`.

**Steps:**
1. Open `/contacts`; pick a contact in `baptism_ready` stage.
2. Open ContactDetailDialog; click "Convert to User".
3. Pick role=`member`, parent=`u-team-1`; submit.
4. Verify success toast names the new username.
5. Navigate to `/admin?tab=users`; verify new user appears with `mustChangePassword=true`.
6. Navigate to `/admin?tab=audit`; verify TWO audit rows with paired timestamps: `user.create` (entityType=`user`) AND `contact.update` (entityType=`contact`, before/after showing `status: 'converted'`).
7. Return to `/contacts`; verify original contact is now `status='converted'`, `convertedToUserId` is set, and the "Convert" affordance is gone.
8. Try to delete the contact via the admin row menu; verify soft-delete (record stays with `status='inactive'`, NOT spliced).

**Pass criteria:** Atomic creation; both audit rows paired; idempotency on second-convert attempt; soft-delete preserves the conversion link.

**Beyond smoke:** Catches the **multi-resource transaction half-failure** — if user creation succeeds but contact update fails, you have an orphan; if either happens twice, you have a duplicate. Tests the C-04 soft-delete contract too.

---

## 14. Search-Across-Animated-Theme Switch 🟡

**Persona:** `u-stephen`. **Pages:** `/contacts` (search) → switch theme mid-search → `/contacts` (verify).

**Steps:**
1. Login as Stephen; navigate to `/contacts`.
2. Type `"Mar"` into search.
3. Mid-debounce (within 200ms), open another browser tab to `/settings`.
4. Switch theme from `default` → `voronoi` (animated, dark-only).
5. Return to the `/contacts` tab.
6. Verify search results still reflect `"Mar"`; no stale render artifacts.
7. Add stage filter `regular_study`.
8. Switch theme back to `default`.
9. Verify search + filter combined results still rendering.
10. Clear search; verify all 50 contacts visible.

**Pass criteria:** Theme switch during async fetch + render doesn't lose state; canvas mount/unmount doesn't trigger ContactsTab unmount.

**Beyond smoke:** Catches **canvas-mount React-tree disruption** that re-mounts deep components and loses their state.

---

## 15. Mobile First-Login on Animated Theme 🟡

**Persona:** `u-mem-50` after admin reset, `theme=matrix` (dark-only) via prior localStorage, viewport 430×932. **Pages:** `/login` → `/first-login` → `/dashboard`.

**Steps:**
1. Set `localStorage.diamond-preferences.state.colorTheme = 'matrix'` (simulate prior session).
2. Login as `member50` with temp password on mobile viewport.
3. Land on `/first-login`; verify the password form is fully visible with mobile virtual keyboard open.
4. Verify Matrix canvas isn't obscuring form inputs (z-index correctness on mobile).
5. Verify password requirements text is legible against the Matrix green canvas.
6. Submit valid new password.
7. Land on `/dashboard`; verify mobile bottom nav appears, sidebar hidden.
8. Scroll the dashboard; verify Matrix canvas doesn't jank scroll performance.

**Pass criteria:** Mobile virtual keyboard doesn't break layout; canvas performance is acceptable; theme + forced-state + mobile combo works.

**Beyond smoke:** Catches the **mobile-viewport + animated-theme + virtual-keyboard combo bug** — three separate-but-correct features can break when stacked.

---

## 16. Network-Drop Mid-Booking → Recovery Without Duplicate 🔴

**Persona:** `u-team-1`. **Pages:** `/calendar` → BookingWizard → simulated offline → online.

**Steps:**
1. Open `/calendar`; start BookingWizard with all fields.
2. DevTools → Network → set Offline.
3. Click Submit; verify error toast (NOT a silent failure).
4. Re-enable network.
5. Click Submit again on the same form.
6. Verify exactly **one** booking exists in the calendar (not two).
7. Optional: verify the queued-write pattern from the user's CLAUDE.md (`enqueue in localStorage BEFORE firing`) — close the tab mid-flight, reopen, verify the booking fired on next mount.

**Pass criteria:** No duplicate creation; user has clear retry path; (aspirational) localStorage queue replays on reload.

**Beyond smoke:** Catches **idempotency holes** in optimistic submit + retry, and the tab-close-mid-flight gap that the global CLAUDE.md explicitly calls out.

---

## 17. Permissions Tab Visibility Across All 6 Roles 🟢

**Persona:** Sequential login as Dev → Overseer → BL → GL → TL → Member. **Pages:** `/admin?tab=permissions` for each.

**Steps:**
1. Login as Dev; navigate to permissions tab; capture matrix content (spec: 8 sections × 6 roles).
2. Logout; login as Overseer; navigate; verify identical matrix content.
3. Logout; login as BL (Joseph); verify can see permissions tab (view-only) AND content matches.
4. Logout; login as GL (group1); navigate to `/admin` URL; verify redirect to `/dashboard` (GL cannot see admin).
5. Logout; login as TL (team1); same — redirect.
6. Logout; login as Member; same — redirect.

**Pass criteria:** Matrix is content-stable across viewers; `canSeeAdminPage` gate fires correctly for sub-Admin roles.

**Beyond smoke:** Catches **drift between PermissionsTab content and PERMISSIONS.md** + visibility gate edge cases.

---

## 18. Reports Date-Range → CSV Export → Audit Trail 🟡

**Persona:** `u-michael`. **Pages:** `/reports` → date picker → CSV export → `/admin?tab=audit`.

**Steps:**
1. Navigate to `/reports`.
2. Set date range: last 7 days.
3. Verify each chart updates (no stale data from a wider initial range).
4. Click "Export CSV".
5. Verify CSV downloads (browser download triggers).
6. Open CSV; verify rows match the on-screen chart counts.
7. Navigate to `/admin?tab=audit`; filter EntityType=`report`, Action=`export`.
8. Verify export action logged with the date range in `details`.

**Pass criteria:** CSV reflects filtered data exactly; export is auditable with full context.

**Beyond smoke:** Catches **filter-export desynchronization** (CSV exports unfiltered data because export reads a different query) and audit-emission gaps for ephemeral actions.

---

## 19. All 12 Mode-Fixed Themes Show Correct Disabled-Toggle UX 🟢

**Persona:** `u-michael`. **Pages:** `/settings` (cycling 12 themes).

**Steps:**
For each theme in `[marble, starfield, aurora, galaxy, jellyfish, rain, matrix, voronoi, constellation, smoke, synapse, deepspace]`:
1. Click the theme tile.
2. Verify Dark / Light / System buttons render with `disabled` style.
3. Verify caption: *"This color theme manages its own surfaces and ignores Dark / Light / System..."*
4. Click each disabled button; verify nothing breaks (no toast, no state change).
5. Switch to `default`; verify buttons re-enable.
6. Switch to `ocean`; verify still enabled (toggle-able theme).

**Pass criteria:** All 12 themes match the same disabled-toggle UX; static themes never lock the toggle.

**Beyond smoke:** Catches **STATIC-1 / L-1 regression** — the most-recent fix in the theme audit; this is a per-theme integration test.

---

## 20. Error Boundary Catches → Posts to /api/error-log → Reset Recovers 🔴

**Persona:** `u-mem-1`. **Pages:** `/dashboard` → forced error → ErrorBoundary fallback → reset → `/dashboard`.

**Steps:**
1. Login as `member1`.
2. In DevTools console, override a React component to throw on next render. Practical method:
   ```js
   // Force a render error in the dashboard's stat-tile region
   const e = new Error('Test boundary capture');
   // Throw via a queued microtask so it fires inside React render
   queueMicrotask(() => { throw e; });
   ```
   (Or trigger via a known-broken-on-purpose flag.)
3. Verify the ErrorBoundary fallback renders: heading `"Something went wrong"`, "Try again" + "Back to dashboard" buttons.
4. Click "Try again"; verify the dashboard re-renders without the error.
5. Logout; login as `u-michael` (admin tier).
6. `curl https://diamond-delta-eight.vercel.app/api/error-log -H "Authorization: Bearer $(localStorage.token)"`.
7. Verify the most recent entry has `viewerId='u-mem-1'`, `viewerRole='member'`, the URL, the error `message`, and a non-null `stack`.

**Pass criteria:** Boundary catches; reset recovers; report is in `/api/error-log` with all viewer context.

**Beyond smoke:** Catches **boundary integration failure** (boundary mounted at wrong level, viewer prop not passed, network failure on report POST blocking the fallback render). This is the **per-user audit's durable insurance** in action.

---

## 21. Session Token Expiry Mid-Action → Graceful Re-auth 🔴

**Persona:** `u-team-1`. **Pages:** `/calendar` → BookingWizard → simulated token expiry → `/login` → resume → `/calendar`.

**Steps:**
1. Login as `team1`.
2. Open `/calendar`; start BookingWizard for tomorrow 14:00, room `rm-nn-bs1`, activity `bible_study`. Fill all fields but **don't submit**.
3. In DevTools, simulate token expiry: `localStorage.removeItem('token'); document.cookie='diamond-session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';`
4. Click Submit on the wizard.
5. Verify the response is `401`, NOT a silent failure or a 5xx that gets buried in a generic toast.
6. Verify the FE response: ideally a "Session expired — please log in again" toast + redirect to `/login`. **Anti-goal:** silent loop, blank screen, or boundary fallback without explanation.
7. Log back in as `team1`.
8. Verify ZERO duplicate booking was created (the failed submit should not have leaked through).
9. (Aspirational, per global CLAUDE.md "preemptive failure queuing") If the FE pre-enqueued the write to localStorage, verify the queued booking replays after re-login. If not implemented, document as L-finding.

**Pass criteria:** 401 surfaces a clear UX path; user is not stranded with lost form state silently; no duplicate writes.

**Beyond smoke:** Catches **session-expiry blind spot** — every long-lived session hits this in production once tokens have a real TTL. Without graceful handling, the user thinks the app is broken; with a half-baked retry, you create duplicates.

---

## 22. Audit Log Tamper Attempt — Append-Only Contract 🔴

**Persona:** `u-michael` (Dev — highest privilege; if even Dev cannot tamper, the contract holds for everyone). **Pages:** `/admin?tab=audit` → DevTools → 5 tamper probes → `/admin?tab=audit` (verify integrity).

**Steps:**
1. Login as Michael; open `/admin?tab=audit`.
2. Note the most recent entry's `id` and `details` (call this `targetId`).
3. In DevTools, run 5 tamper probes against `/api/audit-log/${targetId}`:
   ```js
   const auth = { 'Content-Type':'application/json', Authorization:'Bearer '+localStorage.token };
   // P1: PUT to mutate
   await fetch('/api/audit-log/'+targetId, { method:'PUT', headers:auth, body:JSON.stringify({details:'TAMPERED'}) }).then(r=>r.status);
   // P2: DELETE to remove
   await fetch('/api/audit-log/'+targetId, { method:'DELETE', headers:auth }).then(r=>r.status);
   // P3: PATCH variant
   await fetch('/api/audit-log/'+targetId, { method:'PATCH', headers:auth, body:JSON.stringify({timestamp:'1970-01-01T00:00:00Z'}) }).then(r=>r.status);
   // P4: POST to a fabricated id (insert backdated)
   await fetch('/api/audit-log', { method:'POST', headers:auth, body:JSON.stringify({id:'al-FAKE-1', action:'login',entityType:'user',entityId:'u-michael',userId:'attacker',userName:'attacker',details:'fake',timestamp:'2020-01-01T00:00:00Z'}) }).then(r=>r.status);
   // P5: bulk DELETE pattern
   await fetch('/api/audit-log?ids='+targetId, { method:'DELETE', headers:auth }).then(r=>r.status);
   ```
4. Verify EVERY probe returns 4xx or 405 (Method Not Allowed); none return 200.
5. Refresh `/admin?tab=audit`; verify `targetId` row still has its original `details`.
6. Verify total row count unchanged from step 2.
7. Filter for `userId='attacker'` — verify zero rows (P4 didn't sneak in).

**Pass criteria:** Audit log is read-only via the API; even Dev gets 4xx/405 on mutations; row count + content stable across all 5 attack vectors.

**Beyond smoke:** Catches the **§7.7 append-only contract** — a single PUT/DELETE handler omission would let the highest-privilege user erase their own tracks. This is the security log of last resort; if it's mutable, every other audit trail finding becomes meaningless.

---

## 23. Cross-Branch Resource Access Matrix Verification 🔴

**Persona:** `u-branch-1` (Joseph @ Newport News BL) operating on Williamsburg-owned resources. **Pages:** `/contacts` → ContactDetailDialog → `/calendar` (cross-area) → `/admin?tab=users` → `/admin?tab=audit`.

**Steps:**
1. As Michael, set up a known-state target: a Contact assigned to a teacher in Williamsburg (`u-team-15`'s subtree).
2. Logout; login as Joseph (BL of Newport News).
3. Open `/contacts`; verify Joseph CAN see the Williamsburg contact (per matrix universal rule #1, cross-branch view allowed).
4. Open ContactDetailDialog for the Williamsburg contact; try to edit the pipeline stage. Verify per matrix:
   - **canEditContact** for cross-branch BL: **allowed** per universal rule #1 (cross-branch is allowed).
   - Attempted edit succeeds with audit row.
5. Try to convert the Williamsburg contact to a user; verify success (cross-branch convert per matrix).
6. Navigate to `/calendar`; switch the area filter to `area-williamsburg`.
7. Try to create a booking on a Williamsburg-owned room; verify success (BL+ can manage rooms in any branch).
8. Open `/admin?tab=users`; find a Williamsburg member; try to reset their password.
9. Verify success per matrix (BL can reset passwords cross-branch).
10. Open `/admin?tab=audit`; filter `userId=u-branch-1`; verify all 4 cross-branch actions are audited.

**Pass criteria:** Each cross-branch action is gated correctly per the matrix; nothing rejected when matrix says allowed; nothing allowed when matrix says forbidden; all actions auditable.

**Beyond smoke:** Catches **matrix universal rule #1 ambiguity** — "Cross-branch is allowed" is broadly stated, and helpers historically had subtle inconsistencies (M-01, M-02 from the original audit). This scenario verifies the wording holds for every resource type a BL can touch.

---

## 24. Soft-Delete + Restore Round-Trip Across All 5 Entity Types 🔴

**Persona:** `u-michael`. **Pages:** `/admin?tab=users`, `/admin?tab=rooms`, `/admin?tab=blocked`, `/admin?tab=contacts` (or admin contacts tab), `/calendar` (bookings). **Why Critical:** the §7 shim closed C-04 (contacts hard-delete), but the universal rule #7 ("soft delete only") covers all 6 entity types. A regression on any single one = irrecoverable data loss for that resource.

**Steps:**
For each of the 5 entity types in turn (User, Room, BlockedSlot, Contact, Booking), perform the round-trip:
1. **User:** `/admin?tab=users` → click row menu → Deactivate; verify user disappears from default list, appears in "Show inactive"; verify `user.delete` audit row. Click Restore; verify user reappears + `user.restore` audit row.
2. **Room:** `/admin?tab=rooms` → pick a room → Deactivate; same checks (`room.delete` + `room.restore` audit rows).
3. **BlockedSlot:** `/admin?tab=blocked` → pick a slot → Delete; verify it disappears AND the request was a soft-delete (record persists with `isActive=false`, fetchable via `?includeInactive=1`); audit row `blocked_slot.delete`.
4. **Contact:** `/admin?tab=contacts` (or main `/contacts`) → row menu → Delete; verify the C-04 fix holds: contact persists with `status='inactive'`, NOT spliced; audit row `contact.delete`. Then attempt restore (if UI exists) or PUT `status='active'` via API; verify `contact.restore` or equivalent.
5. **Booking:** `/calendar` → click a booking → Delete; verify it's soft-cancelled (status='cancelled', `cancelledAt` set), NOT removed from history; audit `booking.delete` row. Restore from cancelled view; verify `booking.update` row noting restore.

For each cycle, additionally verify:
- The deactivated/cancelled record is NOT visible in default list view (UX correctness)
- `?includeInactive=1` query (or "Show inactive" toggle) reveals it
- The audit log shows BOTH delete + restore rows with `before`/`after` snapshots
- Restore returns the record to the same logical state as before delete

**Pass criteria:** All 5 entity types honor universal rule #7 (soft-delete only); all 5 emit paired delete + restore audit rows; restore is functionally idempotent (running it on an already-active record is a no-op or a recognized error, not corruption).

**Beyond smoke:** Catches **universal rule #7 drift** across entity types. The §7 shim verified contacts; this scenario verifies the other 4 haven't regressed. A single splice() in one handler = silent data loss.

---

## 25. Booking Double-Submit / Button-Mash Idempotency 🔴

**Persona:** `u-team-1`. **Pages:** `/calendar` → BookingWizard → rapid double-click submit → `/calendar` (verify) → `/admin?tab=audit`.

**Steps:**
1. Login as `team1`.
2. Open `/calendar`; start BookingWizard for tomorrow 10:00, room `rm-nn-bs1`, activity `bible_study`.
3. Fill all fields cleanly.
4. Click Submit twice within ~100ms (mash). DevTools approach:
   ```js
   const btn = document.querySelector('button[type=submit]');
   btn.click(); btn.click();   // synchronous; both fire before state update can disable
   ```
5. Wait for both responses.
6. Verify exactly **one** booking row in `/calendar` for that slot — NOT two duplicate rows.
7. Verify the second click EITHER:
   - was prevented by the FE (button disabled after first click), OR
   - hit the backend and was rejected with 409 / idempotency-key match, OR
   - was deduplicated server-side via uniqueness constraint
8. Open `/admin?tab=audit`; filter EntityType=`booking` Action=`create`; verify exactly ONE `booking.create` row for the recent timestamp.
9. Repeat the test with 5 rapid clicks (`for (let i=0; i<5; i++) btn.click()`); verify still exactly one booking + one audit row.

**Pass criteria:** N rapid clicks produce 1 booking, 1 audit row, no toast spam. The FE either disables the button or has client-side debouncing; either way the user-visible result is single-write.

**Beyond smoke:** Catches the **double-submit production landmine**. Real users mash buttons when latency feels slow; a busy night becomes a duplicate-booking nightmare without idempotency. Most apps think they handle this and don't until proven.

---

## Coverage matrix

| Bug class | Scenarios that catch it |
|---|---|
| Forced-state redirect chain | 1, 9, 15 |
| Permission alignment (FE ↔ §7 shim) | 2, 3, 10, 17 |
| Cross-branch matrix integrity (universal rule #1) | 23 |
| Mobile + animated theme | 4, 15 |
| Concurrent / multi-tab | 7, 11 |
| Network failure recovery | 16, 21 |
| Session token lifecycle | 21 |
| State preservation cross-page | 6, 8, 14 |
| Audit emission completeness | 2, 12, 13, 18, 20, 22, 23, 24, 25 |
| Audit log integrity (append-only) | 22 |
| Multi-resource atomicity | 13 |
| Soft-delete contract (universal rule #7) across all entity types | 13, 24 |
| Idempotency / double-submit | 25 |
| Filter / pagination async race | 5 |
| Mode-fixed theme UX | 19 |
| Validation conditionally-required | 12 |
| Cross-tab session sync | 11 |
| Error boundary integration | 20 |

---

## Running these

**Manual:** A human runner walks each in order, ~15-25 min per scenario. Capture screenshot + console-log evidence for every Critical/High failure.

**Semi-automated (recommended):** Convert each scenario into a Playwright spec. Persona = test fixture. Steps = `test.step()` blocks. Pass criteria = `expect()` assertions. Then `npx playwright test` runs all 25 in CI on every PR. ETA: ~1.5 days to convert all 25 once Playwright MCP / browser is back. Today the **12 scenarios marked 🔴** (#1, #2, #7, #9, #13, #16, #20, #21, #22, #23, #24, #25) are the highest-leverage starting set — each catches a class no other scenario covers.

**Reporting:** failures land as new findings in `docs/AUDIT_REPORT.md` Addendum 3 (or fresh report). The §7 shim has already closed all the *server-side* attack vectors from these scenarios; the new failures will be *FE-side reliability* bugs we don't yet know about.

---

*Scenario plan produced 2026-05-08 against `feat/admin-system` post-§7-shim + post-error-boundary. Targets: `https://diamond-delta-eight.vercel.app`. Personas drawn from `src/mocks/scenario-church-week.ts`.*
