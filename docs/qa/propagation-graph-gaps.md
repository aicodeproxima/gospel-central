# Propagation graph — completeness-critic gaps (missing edges + static-vs-live) — 2026-06-25

> Found by the ultracode completeness critic. A MISSED consumer reads as a false PASS, so these edges must enter the graph before claiming coverage.

Confirmed: the cancel handler does NOT touch the contact study fields — R5 holds (cancel does not reverse the cascade). It also confirms `cancelledBy: 'u-michael'` hardcoded (already a known gap). And the cancel audit `userId: 'u-michael'` is hardcoded — meaning the **reports Top-Contributors leaderboard mis-attributes** all booking cancels/updates to Michael regardless of actual actor (already partly noted as a known gap, but worth flagging for the leaderboard surface specifically).

I have thorough evidence across all surfaces the prompt named. Compiling the gap list now.

## Gap list — MISSING propagation edges + STATIC-marked-but-product-expects-LIVE surfaces

Audit basis: read `propagation-graph.md` at repo HEAD `2a71e47` (graph derived at `59a81fa`; `git diff 59a81fa HEAD` touched only the QA harness, so all file:line cites remain valid). Reconciled against every reader of bookings/contacts/users/rooms/areas/audit.

### A. MISSING consumer-surface edges (a mutation reaches these; the graph does not list them → a missed consumer reads as a false PASS)

**A1. `contacts.currentlyStudying` → Dashboard "Active Contacts" card+dialog @ `dashboard/page.tsx:125-133`** — the Active count predicate is `pipelineStage !== BAPTIZED && c.currentlyStudying`. The graph maps Active to `pipelineStage` only (`dashboard/page.tsx:125,144`); it never lists `currentlyStudying` as a dashboard input. A study booking flips `currentlyStudying=true` (cascade `handlers.ts:1040`) and an edit can clear it — the Active card moves but the graph wouldn't diff it.

**A2. `contacts.{totalSessions,currentStep,currentSubject,groupName}` → Dashboard stat dialogs @ `dashboard/page.tsx:370-380,462-472`** — the Active-Contacts and Baptisms drill-down dialogs render `Step {currentStep}: {currentSubject}`, `{totalSessions} sessions`, and `{groupName}`. The graph confines these fields to "Card + ContactDetailDialog" (C4); the dashboard dialogs are an uncited second surface.

**A3. `contacts.pipelineStage === PROGRESSING` → Dashboard "Active Contacts" trend line @ `dashboard/page.tsx:149-151`** — `progressingCount` is a distinct stage-derived metric shown as the card sub-trend. Not in the graph's stage-chip/dashboard list.

**A4. `contacts.{assignedTeacherId,lastSessionDate,totalSessions,currentlyStudying}` → Groups tree-node `currentlyStudying`/`totalStudies` icons @ `org-metrics.ts:34-63` (rendered `OrgNode.tsx:182-208`, `Tree3D.tsx:167,238-252`)** — the graph says these node metrics are "LIVE" but never cites their field-level inputs. `currentlyStudying` reads `lastSessionDate` (30-day window) falling back to `currentlyStudying`; `totalStudies` sums `totalSessions`; both scope by `assignedTeacherId` (`getContactsForSubtree`). A reassign (changing `assignedTeacherId`) silently moves both metrics between nodes — an edge the graph omits.

**A5. `contacts.pipelineStage === 'baptized'` → Groups "Bearing Fruit" drill-down list (LIVE) @ `OrgNode.tsx:97` and `Tree3D.tsx:615`** — distinct from the static `bearingFruit` *count*. The fruit-filter contact LIST is computed live from `pipelineStage`. The graph marks the whole fruit badge STATIC ("do not flag"), which is only half true: the count is static but the expand-list is live, so editing a contact to `baptized` changes what the fruit popup shows while the badge number stays frozen — an internal inconsistency the graph doesn't surface.

**A6. Whole `/admin` page family is uncited.** The graph references admin only via the sidebar role-gate. These are real, independent consumer surfaces:
  - **`contacts.{pipelineStage,assignedTeacherId,totalSessions,lastSessionDate,status,convertedToUserId}` → `ContactsAdminTab` table+cards @ `ContactsAdminTab.tsx:347-380,418-473`** + its own search index (`:126`) + its own CSV export (`:154-167`). A contact mutation must re-reflect here too.
  - **`audit.* → AuditLogTab` @ `AuditLogTab.tsx:109-148,318-323`** — a SECOND audit consumer surface (own filter/table/detail/CSV), fully separate from the reports page. Every audited mutation should appear in BOTH; the graph's audit line lists only "reports … + Change Log + CSV."
  - **`users.{role,tags,isActive,parentId} → UsersTab` @ `UsersTab.tsx:172-181,221-242,260-262`** — role/tag/status filters, parent-derived "N people under" child-count, and CSV export. The graph's users line lists "Tree3D + OrgNode + List"; UsersTab's derived child-count and its CSV are not cited.

**A7. `users.{name,role,parent,groupName} → TreeSearchBar / JumpToTreePicker search index @ `tree-search.ts:21-45` (rendered `TreeSearchBar.tsx:26-27`)** — the Groups search index haystack is `name + roleLabel + groupName + ancestors`. A user rename / role change / reparent / group change must re-index here. The graph's users line never names the search index as a consumer (the prompt's "global/contact search index" item). Note the index is built from `roots` (org-tree users) only — it does **not** index contacts, which is itself worth recording so the graph doesn't over-claim a unified search.

**A8. `bookings.{teacherId,status,title,startTime,roomId,subject} → BookingSearchBar index+popup @ `BookingSearchBar.tsx:60-83,136-142`** — a per-teacher booking search/index on the calendar. Create/cancel changes the teacher's slot count and dialog list (cancelled rows are filtered out at `:64,139`). The graph's bookings line lists calendar grid + BookingCard + dashboard + audit, but not this search surface.

**A9. `bookings.* → CSV export @ `calendar/page.tsx:306-337` (and contacts CSV `contacts/page.tsx:390-404`, admin-contacts CSV `ContactsAdminTab.tsx:154-167`)** — the graph's "CSV" appears only on the audit line. Bookings and contacts each have their own CSV exporters that resolve FK fields (room/area/teacher/contact) live; a mutation changes exported rows. These are uncited export consumers.

### B. Reports dashboard — action-whitelist gaps (graph asserts "audit log → stats/pie/Top-Contributors" without the filter)

**B1. `audit.action ∈ {reassign,restore,role_change,tag_grant,tag_revoke,reset_password,rename,login,login_failed} → SILENTLY DROPPED from the reports pie @ `reports/page.tsx:322`** — `pieData` hard-seeds only `{create,update,delete,cancel,export}`; any other action increments a key that's never charted. The handlers emit all of those verbs (`handlers.ts:1297,1747,1732,2030,2043,1954,2140,407,385`). So a contact reassign or a tag grant produces an audit row that the Change Log + Top-Contributors show but the **pie chart never reflects** — a mutation whose "should-update" surface set the graph treats as uniform actually isn't.

**B2. Reports "Creates"/"Cancellations" stat cards count only `action==='create'`/`'cancel'` @ `reports/page.tsx:304-305,655,663`** — a `reassign`, `restore`, `role_change`, `tag_grant/revoke`, `rename`, or `reset_password` increments **none** of the four headline cards (only "Total actions" and "This month"). The graph implies audit rows feed the stat cards generically; they don't.

**B3. Reports "Top Contributors" mis-attribution @ `reports/page.tsx:330-340`** — the leaderboard groups by `audit.userId`. Booking cancel/edit/delete hardcode `userId:'u-michael'` (`handlers.ts:1157,1166,1105`), so every cancel inflates Michael's count regardless of actor. This is downstream of a known backend gap (cancelledBy hardcoded) but the *leaderboard* is a concrete surface that silently mis-renders; the graph lists Top-Contributors as a clean consumer.

### C. STATIC-by-design that the PRODUCT documents as LIVE (real gap, not a do-not-flag)

**C1. Groups "Bearing Fruit" icon is STATIC but pageHelp promises LIVE.** Code: `bearingFruit` = sum of static `teacherMetrics.baptizedSinceStudying` (`org-metrics.ts:66-68`); `mockTeacherMetrics` is **never mutated** (only read at `handlers.ts:1460,1465` — grep shows zero writes). Product claims to the contrary:
  - `pageHelp.ts:102`: "reads the **live** contact list to compute the 3 metric icons (currently studying, total studies, **bearing fruit**) … Editing a contact's **pipeline stage** … updates the org tree **immediately**."
  - `pageHelp.ts:138-139` ("Live updates"): "**All** metrics are derived from the current contacts list … Editing **any** contact updates the icons."
  Reality: editing a contact's stage to `baptized` updates `currentlyStudying`/`totalStudies` but **not** `bearingFruit`. The help text over-promises; this is a genuine STATIC-vs-expected-LIVE gap, distinct from the graph's blanket "do not flag the fruit badge." (The whole **Teacher-Metrics tab** at `TeacherMetrics.tsx:48-119` inherits the same frozen source — `totalStudents/currentlyStudying/activeStudents/continued%/baptized%` never move — which the graph correctly calls STATIC, but `BACKEND_GAPS.md` "Org tree + metrics" gives `GET /metrics/teachers` no recompute contract, so the product intent is ambiguous-leaning-live.)

**C2. (Already noted by the graph, re-confirmed) Study cascade not reversed on cancel** — `BACKEND_GAPS.md:135` says the bible_study side-effect is "Mirrored on cancel," but the cancel handler (`handlers.ts:1147-1170`) does not touch `currentlyStudying/totalSessions/lastSessionDate/currentStep`. Listed here only to confirm the graph's R5 note matches code; not a new gap.

### Notes / non-gaps verified
- StudentPipeline (`StudentPipeline.tsx:18`) is correctly LIVE on `pipelineStage` per the graph.
- ContactsTable / ContactCard / KanbanView consume `pipelineStage,totalSessions,assignedTeacherId,currentlyStudying,lastSessionDate,currentSubject,currentStep` as the graph's C-cluster implies (these are within "Card"); flagged above only where a *second distinct surface* (dashboard dialogs, admin tab) renders them.
- contacts-page search predicate (`contacts/page.tsx:233`) already matches `notes,currentSubject,email,phone,groupName` (CONT-7) — that is the contacts search index; it is page-local and correctly refetch-driven, so no missing edge there beyond noting it exists separately from the org-tree search (A7).

Highest-severity items: **C1** (documented-live metric that is frozen), **B1/B2** (reassign/tag/role audit rows invisible in pie + headline cards), and **A6** (entire admin consumer family — especially the second audit surface AuditLogTab — absent from the graph).