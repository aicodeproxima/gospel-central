# Admin Page Optimization Plan — every tab, fit + proportion + redesign where warranted

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (implementer + spec review + quality review per cluster) or `superpowers:executing-plans`. Checkbox steps.
>
> **Status anchor (re-derive, don't trust):** written against git HEAD `f8010c8` (`feat/mobile-opt-main`), tree clean, preview `diamond-2vqxh1vbm`. Run the Boot Ritual (ledger header) before executing. The Resilience Protocol from `2026-06-10-ios-msw-hardening.md` §Resilience is **in force** (git = truth; VERIFIED-vs-EXPECTED labels; one concern per commit; ledger update per cluster; engine-tagged verification).

**Goal:** Make every admin tab fit, read, and operate proportionately at 275px / 768px / 1440px — structural redesign for the two broken-at-phone tabs (Groups, Export/Import), targeted fixes everywhere else — while reusing the app's own proven patterns.

**Architecture:** No new dependencies. Reuse the in-repo pattern library: dual table/card render (UsersTab gold standard), bottom-Sheet filters, ⋯ row-action menus (ContactsTable/UserActionsMenu), labeled `SelectValue` children, `touch-manipulation max-xl:h-11` tap-target convention, sticky-first-column tables (PermissionsTab), stage-pill counts (contacts). One MODERATE addition: a `ui/accordion.tsx` wrapper over the installed `@base-ui/react` accordion export (for Permissions phone view, optional Phase D-5b).

**Tech stack:** Next.js 16, React 19, Tailwind 4 (container queries available in core), base-ui 1.3.0, existing `src/components/ui/*` (22 primitives incl. sheet/popover/table/tabs/command — accordion/collapsible NOT yet wrapped).

---

## 0. Evidence base & verification honesty

- **Recon:** 41 artifacts — 10 tabs × {275×596, 768×1024, 1440×900} + 275×2000 full-content pass + `measurements.json` — crawled from the deployed preview as Developer (all tabs visible, all POPULATED except `system` = placeholder). Archive: `C:\Users\aicod\.claude\scratch\admin-recon\`.
- **Analysis:** 11 vision+code agents (one per tab + shell), 3 research agents (mobile-admin UX with external sources; in-app design-language audit; implementation-cost constraints). Full structured output: the Loop-14 workflow output file (154KB JSON) — findings cite screenshot + `file:line`.
- **⚠️ Verification caveat:** the adversarial-verification phase (16 agents) died on a session limit — **0 independent verdicts**. Compensating spot-checks done by the controller directly: groups header collapse + nameless nodes (screenshots eyeballed — TRUE), export-import nameless rows / overlapping TriState / clipped "Off" (TRUE), ContactsAdminTab hook-order violation (source — TRUE: `return null` :138 before `useMemo` :141), shell deep-link scroll gap (source — TRUE: `scrollIntoView` only in onClick :258, no effect on mount). One cross-agent contradiction resolved in the shell's favor. **Executors: re-read the cited file:line before each edit; treat un-spot-checked medium/low findings as EXPECTED until touched.**
- **Mechanical-crawl blind spot (lesson):** `scrollWidth` checks reported every tab "clean" while two tabs were unusable — ancestor `overflow` clipping hides width starvation. Width-starved flex rows (`shrink-0` chrome > viewport) must be caught visually or by checking computed widths of `min-w-0` columns.

### Verdict table

| Tab | Verdict | Phone 275 | Tablet 768 | Desktop 1440 |
|---|---|---|---|---|
| groups | **REDESIGN (phone)** | 3 critical — unusable | clean | tap-targets only |
| export-import | **REDESIGN (phone)** | 3 critical — unusable | clean | small tri-state segments |
| users | fixes | toolbar targets, card density, pager | table gated too high (xl) | toolbar heights, CTA wrap |
| rooms | fixes | badge collision, 3×-tall rows | minor | small icon buttons |
| blocked | fixes | header squeeze, tall cards + **dialog shows raw ids/enums** | minor | small targets |
| contacts (admin) | fixes | **hook-order crash (all)** + minor | minor | minor |
| audit | fixes | 4-row toolbar, no content above fold | minor | minor |
| tags | fixes | header ribbon squeeze | minor | minor |
| permissions | fixes | 1-of-6 columns visible; bare initials (all) | initials | initials |
| system | clean | placeholder | — | — |
| shell | fixes | nav hides ¾ of tabs, no affordance; deep-link pill offscreen | same | phase badges leak |

---

## Decisions for the user (recommendations first)

- **D1 — Permissions on phone:** (a) *(Recommended)* keep the sticky-column matrix but cap the pinned column (`max-xl:max-w-[110px]` + wrap) and add the role legend — cheap, ships in Phase D; (b) role-first transposed view (pick role → grouped capability list) per research — better UX, needs the accordion wrapper, +1 cluster. → Plan assumes (a) now, (b) optional follow-up.
- **D2 — Audit log phone presentation:** (a) *(Recommended)* fix the toolbar (grid the selects, clamp the description) and keep the existing card list; (b) day-grouped sentence-feed redesign per research. → Plan assumes (a); (b) parked.
- **D3 — Bulk actions (select mode + sticky bar) for admin users/contacts:** research supports it; nothing is broken without it. → Parked unless you want it.
- **D4 — `system` tab:** placeholder is fine (clean verdict); only the phase-badge leak is fixed (Phase A). OK?

Execution proceeds with the recommended options unless you say otherwise.

---

## Phase A — Correctness first (crashes & lying UI; ~1 session)

### Task A1: Fix the Rules-of-Hooks violation in ContactsAdminTab ⚠ latent crash
**Files:** Modify `src/components/admin/ContactsAdminTab.tsx:107-145`.
- [ ] Move `if (!viewer) return null;` (:138) BELOW the `userById` memo (:141-145) — i.e., after ALL hooks. The memo has no dependency on the guard.
- [ ] `npm test` (260/260) + `npm run build` green. Commit: `fix(admin): hooks before early return in ContactsAdminTab (latent crash on auth transition)`.

### Task A2: SlotFormDialog — four bare `<SelectValue/>`s render raw values
**Files:** Modify `src/components/admin/dialogs/SlotFormDialog.tsx` (locate via grep `SlotFormDialog`; the bare usages correspond to BlockedSlotsTab's dialog: Day shows `0`–`6`, Area shows `area-newport-news`, Scope shows `global|area`, Recurrence shows `weekly|one-off`).
- [ ] Read the dialog fully; give each `SelectValue` children per the established pattern (`UsersTab.tsx:827`):
  - Day: `<SelectValue>{DAY_LABELS[dayOfWeek]}</SelectValue>` (find/declare the labels array used by the list items).
  - Area: `<SelectValue>{areas.find(a => a.id === areaId)?.name ?? 'Pick an area'}</SelectValue>`
  - Scope: `<SelectValue>{scope === 'global' ? 'Global (all areas)' : 'Single area'}</SelectValue>` (match the SelectItem labels exactly).
  - Recurrence: same approach, mirror the item labels.
- [ ] Manual check in deployed preview after Phase E deploy: open Admin → Blocked Slots → Add/Edit dialog; every trigger shows words, never ids/numerals.
- [ ] Commit: `fix(admin): SlotFormDialog selects show labels, not raw values (base-ui SelectValue fallback)`.
- [ ] **Sweep step:** grep all remaining bare `<SelectValue />` in `src/` (settings ×2, reports ×1, contacts ×1, BlockedSlotsTab list-filter ×3 at :411/:423/:455) — for each, check whether its Select's values are ids/enums (fix) or human strings (leave; note in commit body). One commit: `fix(ui): label every id-valued bare SelectValue`.

### Task A3: Strip internal phase-planning badges from the shell
**Files:** Modify `src/app/(dashboard)/admin/page.tsx` (side-nav badge render + `phase` field usage; TAB_SPECS keeps the field for docs or drops it entirely — executor's call, keep diff minimal).
- [ ] Remove P3/P4/P5/P7/P8 badges from the ≥xl side-nav (end users see internal planning artifacts — `admin-users-desktop1440.png`). If a marker is wanted for the unbuilt System tab, render a single `Soon` badge keyed on an explicit `implemented: false` flag instead.
- [ ] Build green. Commit: `fix(admin): internal phase badges no longer rendered to users`.

---

## Phase B — The two phone redesigns (core of this plan)

> Shared root cause (VERIFIED visually + chrome math): single-row flex with fixed `shrink-0` chrome exceeding 275px starves the one `min-w-0` column to **zero width** → names invisible, meta wraps one-word-per-line, trailing controls clip at the viewport edge (unreachable — page doesn't h-scroll). The fix shape is the same in both: **stack on phone**.

### Task B1: GroupsTab phone redesign
**Files:** Modify `src/components/admin/GroupsTab.tsx` (header :166-205, NodeHeader :494-545, meta :520-522). Desktop/tablet (≥sm/md) stay byte-identical where possible.
- [ ] **Header (critical #1):** below `sm`, stack: title + description full-width block; actions row beneath (`flex flex-wrap gap-2`). Shorten the phone description to one line ("Tap a node to expand.") — full text stays ≥sm and in the page-help InfoButton. Pattern reference: RoomsTab header (the in-admin reference implementation per design-language research).
- [ ] **NodeHeader (criticals #2/#3):** restructure `<sm` as a two-line card row:
  - Line 1: chevron (44px) + kind icon + **name** (`min-w-0 flex-1 truncate` — must win) + role badge (`hidden min-[360px]:inline-flex`; the kind is already in the meta).
  - Line 2: compact meta (`'2 nodes · 28 members'` — drop "in subtree" on phone; `truncate` guard) + actions.
  - **Actions:** `<sm` collapse Add Group / Add Team / Edit into ONE ⋯ `DropdownMenu` (pattern: `UserActionsMenu` in UsersTab.tsx:591-664 — shared, permission-gated). ≥sm keep inline buttons as today.
- [ ] **Header tap targets (high):** `touch-manipulation max-xl:h-11` on Refresh/Export/Add Branch (Export via className passthrough — see C1).
- [ ] Tests + build green; visual check at 275/768/1440 in Phase E. Commits: one for header, one for NodeHeader (`feat(admin): groups header stacks on phone` / `feat(admin): groups node rows are two-line cards with overflow actions on phone`).

### Task B2: ExportImportTab phone redesign
**Files:** Modify `src/components/admin/ExportImportTab.tsx` (row :308-345, TriState :397-410, indent :310).
- [ ] **Row (criticals #1/#3):** below `md`, two-line structure: line 1 = chevron + icon + name (`min-w-0 truncate`, wins) + badge (hide `<360px` or move to line 2); line 2 = compact meta (`'Effective: Off · inherited'`) + the TriState control. Add `overflow-hidden` to the min-w-0 column as a defensive guard for ≥md.
- [ ] **TriState (critical #2):** give it its own line slot below `md` (`self-end` or full-width 3-equal-segment grid). Segments get `max-xl:h-11`; at desktop bump from 24px to ≥28px (still compact, off the WCAG floor).
- [ ] **Indent:** replace `style={{marginLeft: depth*16}}` with responsive indent (`depth*8` below md, or a 2px left rail) so depth-2 rows fit.
- [ ] Tests + build green. Commit: `feat(admin): export-import rows stack on phone; tri-state control reachable + 44px`.

---

## Phase C — Shared conventions (one fix, ten tabs benefit)

### Task C1: ExportDropdown size passthrough
**Files:** Modify `src/components/shared/ExportDropdown.tsx` (trigger size :61) + call sites in admin tabs.
- [ ] Add optional `triggerClassName` prop merged onto the trigger Button; do NOT change the default (Calendar/Groups/Audit page usages stay as-is). In admin call sites pass `triggerClassName="touch-manipulation max-xl:h-11"`.
- [ ] Commit: `feat(shared): ExportDropdown trigger size override; admin exports hit the 44px floor`.

### Task C2: Tab-header stacking pattern for blocked / tags / audit (+ users toolbar targets)
**Files:** Modify `BlockedSlotsTab.tsx` (header), `TagsTab.tsx` (header), `AuditLogTab.tsx` (toolbar + description), `UsersTab.tsx` (Filters trigger :272, Add User :344).
- [ ] Blocked + tags: same `<sm` header stack as B1 (full-width title/description, actions wrap below). Audit: grid the two selects `grid grid-cols-2 gap-2` below md, Export joins the search row, description `line-clamp-2` on phone (full text in page-help).
- [ ] Users: `max-xl:h-11` on Filters + Add User (completes the tab's own incomplete pass).
- [ ] One commit per file. Verify no h-scroll at 275 in Phase E.

### Task C3: Shell — pill-nav affordance + deep-link scroll + (already-correct bits stay)
**Files:** Modify `src/app/(dashboard)/admin/page.tsx`.
- [ ] **Edge fade:** right-edge gradient mask on the pill scroller (`[mask-image:linear-gradient(to_right,black_85%,transparent)]` adjusted, or an absolutely-positioned fade div) so users see there are more tabs. (10 tabs, ~¾ hidden at 275 — VERIFIED.)
- [ ] **Deep-link scroll:** `useEffect` keyed on `[active]` that `scrollIntoView({inline:'center', block:'nearest'})`s the active pill via a ref map — covers `?tab=` deep links + role-gated fallback (the existing onClick :258 handles clicks only — VERIFIED).
- [ ] Optional polish: per-tab description block `line-clamp-2` on phone (audit/permissions descriptions are long — shell finding medium).
- [ ] Commit: `feat(admin): tab nav signals overflow + centers active pill on deep-link`.

---

## Phase D — Per-tab targeted fixes

### Task D1: Users
**Files:** `UsersTab.tsx`.
- [ ] Table gate xl→**lg** (`hidden lg:block` / `lg:hidden`; overflow-x-auto already guards). Card list becomes `grid gap-2 sm:grid-cols-2` for the sm–lg band (kills the 660px stretched cards at 768 — VERIFIED screenshot).
- [ ] Card density: Role + Status badges inline on one row under name/@username; Tags row only when tags exist (~165px→~90px per card).
- [ ] Top paging affordance `<xl`: extend the result line to `132 matches · page 1/6` with inline chevron pair (bottom pager stays).
- [ ] Desktop toolbar: normalize control heights (one size), `ml-auto` pins Add User to the row end (no orphan wrap).
- [ ] Badge typography: `text-[10px]`→`text-xs` on the card variant.
- [ ] One commit per concern (≈3 commits).

### Task D2: Rooms
**Files:** `RoomsTab.tsx` (:298 header row; row actions).
- [ ] `flex-wrap` on the area-header row (badge/Edit collision — VERIFIED).
- [ ] `<md`: collapse per-row Edit/Deactivate into one ⋯ menu (UserActionsMenu pattern) → room names stop wrapping to 3 lines.
- [ ] Commit: `fix(admin): rooms headers wrap; room rows single-line with overflow actions on phone`.

### Task D3: Blocked Slots
**Files:** `BlockedSlotsTab.tsx`.
- [ ] Card layout `<sm`: hide decorative Ban icon, actions move to card top-right (relative/absolute) or ⋯ menu — content column gets full width (145px→~90px cards).
- [ ] List-filter selects (:411/:423/:455): covered by A2's sweep.
- [ ] Commit: `fix(admin): blocked-slot cards compact on phone`.

### Task D4: Audit
**Files:** `AuditLogTab.tsx`. (Toolbar handled in C2.)
- [ ] Confirm post-C2 fold shows ≥2 entries at 275×596. Remaining mediums (relative timestamps etc.) only if trivial. Commit if touched.

### Task D5: Permissions (per D1 decision = option a)
**Files:** `PermissionsTab.tsx` (:191-209 sticky matrix).
- [ ] Role-initial legend: compact pill strip above the first section (`M Member · TL Team Leader · GL Group Leader · BL Branch Leader · O Overseer · D Developer`) + `<abbr title>`/`title` on each `th`.
- [ ] Cap pinned column on small screens: `max-xl:max-w-[110px]` + `whitespace-normal` (action labels wrap to 2 lines) + tighter cell padding → 2-3 role columns visible per swipe at 275 (vs 1 — VERIFIED).
- [ ] Keep the existing "← scroll" affordance + sticky pattern (it's the in-repo reference; don't regress).
- [ ] Commit: `fix(admin): permissions matrix legible on phone — legend, capped pinned column`.
- [ ] **D5b (only if D1=b):** new `ui/accordion.tsx` over `@base-ui/react/accordion` + role-first transposed phone view. Separate cluster, plan amendment required.

### Task D6: Tags + remaining contacts-admin/lows
- [ ] Tags header (C2 covers). Sweep remaining medium/low findings per tab from the workflow archive ONLY where the file is already being touched (no while-I'm-here on untouched files; list skipped items in the ledger).

---

## Phase E — Verification loop (after each phase lands; full pass at the end)

- [ ] `npm test` (260/260 baseline) + `npm run build` + `npx tsc --noEmit` per commit (executors), per phase minimum.
- [ ] Deploy preview (`vercel deploy` — plain deploys are mock-on since Loop 12).
- [ ] **Re-run the recon crawl** (`C:\Users\aicod\.claude\scratch\webkit-check\admin-recon.mjs <preview>` + the tall pass) → diff measurements (h-scroll must stay zero; smallTargets count must DROP to ~0 below xl) + eyeball the groups/export-import tall screenshots against the before-images.
- [ ] **Add a width-starvation probe to the crawl** (lesson from the blind spot): for every `min-w-0` column inside admin rows, assert computed width ≥ 80px at 275 — catches the zero-width-name class mechanically next time.
- [ ] Desktop spot-check at 1440: users table, groups tree, permissions matrix — unchanged or improved, no regressions.
- [ ] Ledger entry (Loop 14): files · VERIFIED evidence (screenshots/measurements) · commits · pending. Push after each phase.

---

## Do-not-regress list (admin already does these RIGHT — preserve through every edit)
- Loading / destructive-error-with-retry / icon+CTA empty state triad on every data tab.
- Soft-delete badge grammar; motion accents; permission-gated actions (UserActionsMenu pattern).
- Shell: sticky pill row mechanics, `?tab=` deep links + role-fallback (Bug-A guard), side-nav ≥xl.
- PermissionsTab sticky-first-column + scroll hint (improve, don't replace).

## Research → task traceability (what backs what)
- Card-collapse default + UsersTab dual-render gold standard → B1/B2 row structure, D1 gate change.
- Carbon/touch: ≤2 actions inline else ⋯ overflow; overflow persists on touch → B1 node actions, D2/D3.
- WCAG 2.5.8 / Material 48dp / HIG 44pt → C1/C2 target floor (`max-xl:h-11` convention already in-repo).
- Material scrollable-tabs (affordance + auto-scroll active) → C3.
- Pencil&Paper sticky-first-column + mandatory scroll affordance → D5 (keep + cap).
- GitLab Pajamas tiered destructive confirmation → parked with D3 follow-ups (current dialogs acceptable).
- Tailwind 4 container queries → available if any tab panel needs width-not-viewport gating (side-nav steals 256px at xl); use `@container` only where a plain breakpoint misfires.

## Effort map (from constraints research)
CHEAP: everything in Phases A–D except D5b (existing primitives, shipped patterns). MODERATE: D5b accordion wrapper (base-ui export unwrapped). EXPENSIVE/skip: virtualization (132 rows max — pointless).
