# Diamond Run-2 — out-of-scope findings (backend-acceptance criteria)

> **Scope discipline (audit-anti-drift G10):** the B1–B50 List is the Run-2 contract. Anything found
> *beyond* the 50 cells is logged here, NOT scope-crept into a fix this round. Everything below is a
> **server-authorization gap**: the in-page MSW mock is permissive (UI enforces it today), so the real Go
> backend (`gospel-experience`, Mike) MUST gate it. **Do NOT "fix" these in the mock** — the mock is the
> permanent test oracle; masking the gap there hides it from the backend acceptance pass. Each is pinned in
> the suite as an `it.todo` (see `src/mocks/listb.itest.ts` + `src/mocks/adversarial.itest.ts`) so it stays
> visible until the backend gates it.

## Why these are findings, not bugs
The UI already blocks each action (e.g. a Member is redirected from `/reports` — proven by `e2e/smoke.spec.ts`;
a non-owner opens a booking read-only — `e2e/permissions.spec.ts` B11). The *handler*, however, accepts the
mutation from any authed actor. That **UI-blocks / handler-allows divergence is the finding** (cross-source-of-
truth, G3): a non-browser client (curl, a future mobile app) hitting the API directly would bypass the UI gate.

## The 4 NEW gaps surfaced this round (List-B lanes)
| # | Endpoint | Required gate | Today (mock) | List-B cells |
|---|---|---|---|---|
| 1 | `PUT /users/:id/username` | `canChangeUsername` (Overseer+, peer-Overseer → Dev only) | ungated — renames any user | B41 |
| 2 | `GET /audit-log` | `canAccessReports` (Branch Leader+) | returns to **any** authed user | B44, B47 |
| 3 | `PUT /contacts/:id {assignedTeacherId}` | `canReassignContact` (owner-subtree leader) | spreads body ungated | (F1 reassign; contacts family) |
| 4 | `PUT /bookings/:id` + `POST /bookings/:id/cancel` | `canEditBooking` (owner/teacher or in-scope leader) | checks only slot conflicts, not the actor | B12 |

## The 3 previously-known gaps (carried, still open — contacts family)
These were found in the 2026-06-17 role audit and remain mock-permissive (documented in `docs/BACKEND_GAPS.md`):
- `POST /contacts` — accepts mass-assigned `createdBy` / `convertedToUserId` (no ownership enforcement).
- `POST /contacts/:id/convert {role:dev}` — **mints an elevated user (privilege escalation)** for a Member token.
- `POST /bookings/:id/cancel` — hardcodes `cancelledBy: u-michael` (audit mis-attribution) and does not check the actor's scope.

## What IS gated server-side today (the §7 SHIM — validates the pattern, locked by `adversarial.itest.ts`)
`POST /areas` (Overseer+), `POST /areas/:id/rooms` + `PUT /rooms/:id` (admin-tier), `POST /blocked-slots`
(BL+), `PUT /settings/export-import` (admin-tier + own-branch scope), `POST /users` (create-user ceiling —
even an Overseer can't grant Overseer), `PUT /users/:id/tags` (`canManageTags`), parent reassign (BL+ subtree,
cycle-rejecting), self safe-field edit (200) vs self-elevate (403). The asymmetry (these gated, the four above
not) reads as an **incomplete hardening pass**, not a design choice — so the four are acceptance criteria, not
"won't fix."

## Handoff
Fold these into `docs/MIKE_HANDOFF.md` / `docs/BACKEND_GAPS.md` as the backend authz acceptance checklist. When
the Go backend gates each, flip the corresponding `it.todo` → `it` in the integration suite and assert the 403.

---

## Propagation audit (2026-06-25) — new findings beyond the catalog

From the code-grounded propagation audit (`PROPAGATION.md`, `propagation-graph.md`) + the ultracode
completeness-critic (full list: `propagation-graph-gaps.md`). These are real surface findings, NOT covered by
the executed cells:

- **Reports "Top Contributors" leaderboard MIS-ATTRIBUTES all booking cancels/updates to Michael.** The cancel
  handler hardcodes `userId:'u-michael'` / `cancelledBy:'u-michael'` (handlers.ts ~1157), so the
  Top-Contributors aggregation (reports/page.tsx ~330-340, grouped by `userId`) credits every cancel to one
  user regardless of the real actor. This extends the already-known `cancelledBy` gap to the **leaderboard
  surface**. Classification: KNOWN backend-gap (the mock hardcode — do NOT patch the mock; the real backend
  must attribute to the JWT actor).
- **Groups "Bearing Fruit" — count is STATIC but the drill-down LIST is LIVE** (internal inconsistency).
  `bearingFruit` *count* derives from static `teacherMetrics.baptizedSinceStudying` (org-metrics.ts:66), while
  the fruit-filter contact *list* is computed live from `pipelineStage==='baptized'` (OrgNode.tsx:97,
  Tree3D.tsx:615). Editing a contact to `baptized` changes what the fruit popup shows while the badge number
  stays frozen — the graph marks the badge wholly STATIC, which is only half true. Classification: STATIC-by-
  design partial / candidate FRONTEND inconsistency for the follow-up.

### Graph completeness gaps (missed-consumer = false-PASS risk) — see `propagation-graph-gaps.md`
A1 `contacts.currentlyStudying` → Dashboard "Active Contacts" (dashboard/page.tsx:125-133, not just stage);
A2 `contacts.{totalSessions,currentStep,currentSubject,groupName}` → Dashboard stat dialogs (370-380,462-472);
A3 `pipelineStage===PROGRESSING` → Dashboard trend (149-151);
A4 `contacts.{assignedTeacherId,lastSessionDate,totalSessions}` → Groups tree-node live metrics (a reassign
silently moves metrics between nodes — org-metrics.ts:34-63); A6 the whole `/admin` family was uncited.
These edges should enter the graph before claiming full coverage.

### Cells DEFERRED (harness limit, not app defects)
C2/C2b (contact reassign + member scope) — opening ContactDetailDialog crashes the Playwright renderer
(page-close) reproducibly. Behavior verified by workflow source-trace + the F1 feature (prod-verified) + Run-2
specs. C2b correction: a Member is NOT denied the reassign *field* — for their own contact the Select renders
with exactly one option (self), a no-op; the gate holds by offering no other target.
