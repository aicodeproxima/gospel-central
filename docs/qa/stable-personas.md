# Stable-persona manifest (Phase 1 seed reorg — HARD constraints)

> Generated 2026-07-03 by grepping `e2e/**` + `src/**/*.test.ts` for referenced user ids/usernames
> (overhaul plan, Phase 1 input; protocol rule 5 — this file is ground truth for the 2-church reorg
> and every later phase). If the reorg cannot honor a row, the TESTS change in the same commit —
> never silently break a relationship.

## Users that MUST keep id + username + role tier

| id | username | role | referenced by | relationship constraints that must survive |
|---|---|---|---|---|
| `u-michael` | `admin` | Dev | 15 test refs, e2e loginAs ×5+ | root of tree; `mockUsers[0]` (login-contract fallback assumption) |
| `u-stephen` | `stephen` | Dev | login-contract | NOT mockUsers[0] (used to detect auth round-trip breakage) |
| `u-overseer-gabriel` | `overseer1` | Overseer | 7 refs | singleton Overseer; parent = u-michael |
| `u-branch-1` (Joseph) | `branch1` | Branch Leader | 7 refs + e2e ×30 | **BL of Newport News** (named in tests); has GL children |
| `u-branch-5` (Simon Peter) | `branch5` | Branch Leader | cross-branch matrix (#23) | **must remain a BL of a DIFFERENT branch than u-branch-1** → post-reorg: **BL of Virginia Beach**; must have ≥1 GL whose parentId === u-branch-5 |
| `u-group-1` | `group1` | Group Leader | 4 refs | per-user-smoke: "GL with 2 child teams" → keep ≥2 teams |
| `u-group-9` | `group9` | Group Leader | per-user-smoke | "GL with 1 child team (leaf-ish)" → keep exactly 1 team |
| `u-team-1` | `team1` | Team Leader | 5 refs + e2e ×6 | "TL with members" → keep ≥1 member child |
| `u-team-15` | `team15` | Team Leader | contact-scope tests | must exist as TL; test contacts reference them as teacher/creator |
| `u-mem-1` | (member1) | Member | 19 refs | parentId MUST be a Team Leader (booking-status matrix test walks member.parentId as TL) |
| `u-mem-3` | `member3` | Member + `teacher` tag | e2e ×51 (heaviest e2e persona) | keeps teacher tag; must own/teach contacts in scope |
| `u-mem-50` | — | Member | per-user-smoke | exists |
| `u-mem-99` | — | Member | 6 refs | exists; used as the UNRELATED member in permission negatives (must NOT be creator/teacher/leader-in-scope of test bookings/contacts) |

## Freed personas (roles MAY change in the reorg)

- `u-branch-2` (Zechariah, Chesapeake), `u-branch-3` (John the Baptist, Norfolk), `u-branch-4`
  (Simeon, Virginia Beach today): not referenced by any test as BLs. The orchestration decides their
  fate (demotion to GL/TL, reassignment) — note u-branch-4 currently leads VB but `u-branch-5` takes
  VB post-reorg (see above), so u-branch-4 is freed too.
- All GLs except u-group-1/u-group-9, all TLs except u-team-1/u-team-15, all members except the four
  listed: free to regroup.

## Non-user seed constraints referenced by tests

- Areas: tests never pin area COUNT except the new Phase-1 gate (`getAreas()` returns exactly 2).
- `per-user-smoke` "why" strings mention old branch names (Williamsburg etc.) — update those comment
  strings in the same commit as the reorg.
- Rooms: `rm-nn-conf` referenced by the booking-status transition tests (must keep id).
- 4 global weekly blocked slots (Tue 20–21, Sat 9–10/15–16/20–21) — keep global.
- Default login `admin`/`admin`; all seeded passwords `admin` (login-contract + CLAUDE.md).
