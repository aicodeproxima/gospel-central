# Diamond — Propagation Graph (code-cited) — 2026-06-25

Forward (`entity.field → consumer @ file:symbol`) + reverse + per-surface tags. Derived from source at
`59a81fa` (3 Explore passes + re-verification). Tags: **clock** = real|mock (mock-clock pins only the SEED;
date-bounded surfaces read real `new Date()`); **instance** = desktop|mobile|both (post-fix `layout.tsx:197`
renders `{children}` ONCE — most surfaces are a single shared mount, so default desktop; `both`/`mobile` only
for genuinely viewport-divergent surfaces); **STATIC** = seed-only by design (do not flag).

## Isolation mechanics (verified)
- Mock is in-page `@mswjs/interceptors` (`src/mocks/browser.ts`), module-level state; a FULL document reload
  re-imports `handlers.ts` → re-seeds. `resetMockState` (handlers.ts:118) is called by `auth-store.logout()`.
- **Each propagation cell = one Playwright test() = a FRESH context** → fresh in-page mock seed + EMPTY
  localStorage. This sidesteps the persisted-pref leak (R1): `diamond-preferences` / `diamond-custom-entities`
  / `contacts.view` / `diamond-tree-view` survive a bare reload and logout deliberately keeps theme/lang/
  timeFormat (auth-store.ts:81-85), but a fresh context starts them empty.

## settings/preferences (LEAK-PRONE — batch 1)  [store: preferences-store.ts:109, persist `diamond-preferences` v3]
- `profilePhotoBase64` → **Sidebar avatar** `Sidebar.tsx:42,47` (img alt="" object-cover) [instance both: Sidebar(desktop) vs MobileNav] + **settings preview** `settings/page.tsx:302` (img alt="Profile"). PASS=DOM img src null→data: . blast: persistent. ✔ S1 PASS.
- `language` → **useTranslation** `i18n.ts:714` → Sidebar nav `Sidebar.tsx:56` + every translated string. PASS=DOM nav labels en→es. ✔ S2 PASS.
- `colorTheme` → `applyThemeToDOM` (preferences-store.ts:82-90) → `<html data-theme>` (default REMOVES attr). ✔ S3 PASS (set+inverse).
- `backgroundStyle` → `applyBackgroundToDOM` (preferences-store.ts:99-105) → `<html data-bg>` (none REMOVES attr) + BackgroundRenderer.tsx:61. ✔ S4 PASS.
- `timeFormat` → **useTimeFormat** `useTimeFormat.ts:24` → BookingCard time + calendar axis + dashboard + wizard slot picker (≈9 consumers). PASS oracle = rendered DOM (R4, NOT the store). clock:n/a. ✔ S5 PASS (12h→24h reaches calendar 18:00, no am/pm).
- `calendarDefaultView` → calendar init `calendar/page.tsx:61`. `notifications` → settings only (no delivery). [pending cells]

## contacts (stage/type/subjects/timeline/totalSessions/owner)  [store: none — refetch-based]
- `pipelineStage` → ContactCard badge + **stage-chip counts** `contacts/page.tsx:261 stageCounts` (same-page) + Kanban column + dashboard Active/Baptisms `dashboard/page.tsx:125,144` (clock:n/a) + **StudentPipeline** (LIVE `StudentPipeline.tsx:18`). ✔ Z0/C1 PASS. **must-NOT-change: `type`** (PUT /contacts blind body-spread, handlers.ts:1266 — R6). ✔ C1 verified.
- `assignedTeacherId` (owner) → ContactCard teacher + **audit `reassign` row** (handlers.ts:1287-1307) → reports Change Log. SCOPE-SENSITIVE: branch1 sees reassign UI, member3 does NOT (paired multi-role). fetch corroboration INVALID for scope (GET unscoped — R7). [pending C2]
- `totalSessions`/`currentStep`/`currentSubject`/timeline `session` row → set by the **study cascade** (handlers.ts:1004-1056) on POST /bookings(bible_study). Card + ContactDetailDialog. **Cancel does NOT reverse this** (handlers.ts:1147 — R5; BACKEND_GAPS.md:135 wrongly says "mirrored"). [pending C4 study, C-cancel must-not-reverse]
- **Teacher-Metrics tab** `TeacherMetricsCards` ← `GET /metrics/teachers` = STATIC `mockTeacherMetrics` (handlers.ts:1464). Tree node `bearingFruit` ← static `teacherMetrics.baptizedSinceStudying` (org-metrics.ts:66) = STATIC; `currentlyStudying`/`totalStudies` LIVE. **Do not flag the metrics tab / fruit badge.**

## bookings  [calendar refetch on submit; in-place setBookings on cancel/restore/delete]
- create/cancel/restore → calendar Day/Week/Month(≥md) vs Agenda(<md) [instance both] + BookingCard status + **dashboard Upcoming/Sessions** `dashboard/page.tsx:115-142` (**clock:real** — reads `new Date()`; restrict to clock-invariant deltas, R3) + **audit rows** (booking.create/cancel) → reports. Layout single-mount confirmed (no dual-render bug). [pending C3 cancel↔restore]

## users / org tree (role/parent/tags/active)
- role/parent/tags/isActive → Tree3D + OrgNode + List + **manageable/visibility scope** (buildManageableScope/buildVisibilityScope) + sidebar role-gated nav + audit rows (reassign/tag_grant/tag_revoke/delete/restore, handlers.ts:1744,2027,1849,1907). reparent cycle-rejected; deactivate cascades subtree. SCOPE-SENSITIVE → paired multi-role. [pending batch 2]

## rooms / areas / blocked-slots → calendar grid + area selector + wizard availability + audit rows. [pending batch 2]
## audit log → reports dashboard stats/pie/Top-Contributors + Change Log + CSV. clock:real (this-month windows). [pending batch 2]

## KNOWN backend-gap (UNGATED — classify KNOWN-gap, never a propagation leak; do NOT patch mock)
username rename, GET /audit-log (unscoped), PUT /contacts reassign, PUT/cancel bookings, convert priv-esc, cancelledBy=`u-michael` hardcoded. Source: `docs/qa/out-of-scope-findings.md`, `docs/BACKEND_GAPS.md`.

## Completeness + batch-2 (ultracode workflow, 2026-06-25)
- **Missing edges found by the completeness critic** → `propagation-graph-gaps.md` (A1-A6: dashboard
  currentlyStudying/stat-dialogs, tree-node live metrics moved by reassign, /admin family). Fold into the graph
  before claiming full coverage.
- **Ready-to-execute batch-2 catalog** (tags/rooms/areas/role/deactivate/blocked-slots, code-cited recipes,
  ranked by automatability) → `propagation-catalog.md`.
- **New findings** (Top-Contributors mis-attribution; Bearing-Fruit count-static/list-live inconsistency) →
  `out-of-scope-findings.md`.
