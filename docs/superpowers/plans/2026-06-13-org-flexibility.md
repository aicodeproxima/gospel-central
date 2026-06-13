# Org flexibility — adapt to role churn + relocation (VA Beach scenario)

**Goal (user, 2026-06-13):** the org must adapt to arbitrary change — anyone's role can change, and a branch leader + their members + contacts may relocate to a new physical location and take on new roles. The app must reflect this, and the app must *know where people are*.

**Approved scope:** make the tree adapt live + model location on people + subtree-move + close the branch-removal gap.

## Root causes (verified)
1. **Static tree.** `GET /groups/tree` returns a frozen `scenarioOrgTree` snapshot (handlers.ts:1359-1361). Role/reassignment edits mutate `usersState` (Users tab + audit reflect them) but never rebuild the tree, so the Groups view never restructures → the app *looks* inflexible. A real backend rebuilds from `parentId` per request.
2. **No location on people.** `User` has `groupId`/`parentId` but no `locationId` (user.ts:88-119). "Location" exists only for room bookings (`Area`); people aren't placed at one. Seed data half-models it via `areaIdForBranch` (scenario:574) but it isn't persisted on the user.
3. **Branch removal orphans.** Deactivating a branch leader leaves descendants pointing at an inactive parent; no cascade; deactivation isn't even in the GroupsTab UI.

## Design decisions
- **Location = an existing `Area`.** Reuse Areas (the "Church" locations) rather than invent a parallel entity. Add `User.locationId?: string` → an Area id. "Who's at VA Beach" = users whose `locationId` is the VA Beach area. Reuses Area create/deactivate that already exist.
- **Tree is derived, never stored.** A single `buildOrgTree(users, metrics, areas)` util builds `OrgNode[]` from live `parentId`. The mock `/groups/tree` calls it against `usersState` — matching how a real backend behaves. Node `groupName` shows the person's **location** (area name), so the tree visualizes who is where.
- **Subtrees follow their root.** Because children reference their parent by id, re-parenting a leader carries the whole downline automatically. Splitting a branch is per-person; we add a "move + optionally cascade location to subtree" affordance.

## Phases
- **A (keystone, this pass):** `buildOrgTree` util; add `User.locationId`; seed every person's `locationId` from their branch's area; `/groups/tree` → live build from `usersState`; `PUT /users/:id` accepts `locationId` (+ audit). Proof: change a role / reassign in Users tab → Groups tree restructures live.
- **B:** EditUserDialog gains a **Location** picker (+ "apply to whole subtree"); Users tab gains a location filter/badge; tree shows location.
- **C:** "Move person/subtree to another leader" flow; GroupsTab branch **deactivate with cascade choice** (deactivate subtree, or require reassign first) — closes the orphaning gap.
- **D:** tests + full deployed-preview run of the VA Beach scenario (new area → relocate a branch leader + downline with new roles → tree + location views adapt).

## Anti-regression
Keep `scenarioOrgTree` exported (tests/back-compat); the handler simply stops using it. `tsc` + full vitest + deployed-preview verification each phase. Desktop unchanged.
