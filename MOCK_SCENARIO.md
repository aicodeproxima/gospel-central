# Diamond — Hypothetical Church Week Mock Scenario

> **This is mock data for frontend testing and demos.** None of the people,
> contacts, bookings, or events below represent real individuals or activities.
> See "Removing or replacing the mock data" at the bottom to switch to a
> real backend.

## Overview

Gospel Central currently runs against a frozen, deterministic mock dataset
that simulates an **active week across two churches** (2026-07 overhaul
Phase 1: the former Chesapeake, Norfolk and Williamsburg congregations
consolidated into Newport News + Virginia Beach; the merge story is seeded
into the audit log).

The scenario lives entirely in one file:
[`src/mocks/scenario-church-week.ts`](./src/mocks/scenario-church-week.ts)

The study curriculum lives in
[`src/lib/curriculum.ts`](./src/lib/curriculum.ts) (35 studies: Foundation
1–12 / Growth 13–35).

## Organization Hierarchy

| Level | Count | Notes |
|---|---|---|
| Developer (Admin) | 2 | **Michael** (no last name), **Stephen Wright** |
| Overseer | 1 | **Gabriel** — both churches report up under him |
| Branch Leader | 2 | Joseph (Newport News), Simon Peter (Virginia Beach) |
| Group Leader | 10 | Five per church. All carry the `teacher` tag and have study metrics. |
| Team Leader | 18 | 15 numbered teams + the 3 ex-Branch-Leaders (Zechariah, John the Baptist, Simeon — ids `u-branch-2/3/4` and logins `branch2/3/4` kept). |
| Member | 99 | All baptized, round-robin across the 18 teams. ~20 carry the `teacher` tag. |
| **Total users** | **132** | |

Stephen Wright sits as a second top-level admin alongside Michael. Every
operational reporting line is: Michael → Gabriel (Overseer) → Branch
Leader → Group Leader → Team Leader → Member.

## Churches

2 churches under Gabriel, each with its own `area` (physical location):

| Church (area) | Branch Leader | Rooms |
|---|---|---|
| Newport News Zion (main) | Joseph | Bible Study Room 1–4, Conference Room, Sanctuary, Fellowship, TRE Room, Barnes and Noble |
| Virginia Beach Zion | Simon Peter | Study Room 1–3, Conference Room, ODU Library, Living Room |

## Tags

Tags are orthogonal capability flags on a user (replacing the prior
Teacher role). The seed populates:

- `teacher` — every Group + Team Leader (and ~20 Members) carry it. Required to be assigned as the leader of a Bible Study booking.
- `co_group_leader` — exactly 1 per group (10 total).
- `co_team_leader` — exactly 1 per team (18 total).

New tag ids can be added at any time via the admin Tags tab; the data
model is `tags: string[]`.

## Contacts (Unbaptized)

- **50 contacts** total, distributed across both churches (NN 30 / VB 20).
- Statuses (2026-07 overhaul, 6 values): `FIRST_STUDY`, `UNBAPTIZED`, `POTENTIAL`,
  `BAPTISM_READY`, `NEEDS_HELP`, `BAPTIZED` — every status present in BOTH
  churches (see `CONTACT_STAGES` in the scenario file).
- Each studying contact has:
  - `currentlyStudying: true`
  - `currentStep` (their current study number, 1–35)
  - `currentSubject` (one of the 35 curriculum titles)
  - Session totals derived from Completed bookings + historical baseline

### Bible Study Curriculum — 35 studies (Foundation 1–12, Growth 13–35)

The canonical list is in `src/lib/curriculum.ts` (2026-07 overhaul: replaced
the old 50-subject/5-step list). A contact's history is a contiguous prefix
of the curriculum; `currentStep` is the study number they're on.

- **Foundation (1–12, required before baptism):** Secret of the Forgiveness
  of Sins, Keep the Sabbath Day Holy, Tree of Life, Cross-Reverence is
  Idolatry, Weeds and Wheat, Jerusalem Mother, …
- **Growth (13–35):** Passover the Way to Eternal Life, Daniel's Prophecy,
  Seal of God, Holy Trinity, …, The Words of God Are Absolute

## Activities

Bookings can be tagged with one of 8 activity types (orthogonal to the 7
booking types):

- Bible Study
- Group Activity
- Special Video
- Team Meeting
- Group Meeting
- Function Meeting
- Committee Meeting
- Committee Mission

Activity lives in `Booking.activity` and is defined by the `Activity` enum
in `src/lib/types/activity.ts`.

## Blocked time slots

The seed defines 4 default global blocked slots (apply to both churches,
no role can override):

| Day | Time | Reason |
|---|---|---|
| Tuesday | 20:00–21:00 | Tuesday service |
| Saturday | 09:00–10:00 | Sabbath morning service |
| Saturday | 15:00–16:00 | Sabbath afternoon service |
| Saturday | 20:00–21:00 | Sabbath evening service |

Service times live exclusively in `scenarioBlockedSlots` — they are NOT
seeded as bookings. Booking attempts overlapping a blocked slot must be
rejected with 409 by the backend (today the MSW mock and frontend gate
this; see `BLOCK-*` audit findings).

## A Week in the Life

The scenario auto-generates bookings for **the current calendar week**
(Monday through Sunday) across all 5 branches. Every render uses the same
deterministic PRNG seed so the data stays stable between refreshes.

Typical week includes ~70–80 bookings:

- **~30 Bible study sessions** across the various study rooms (in-person and Zoom).
- **15 team meetings** (one per team).
- **10 group meetings** in Conference Rooms and Fellowship.
- **Branch Committee meetings** (one per branch, 5 total).
- **2 committee mission** sessions (outreach planning, report review).
- **2 special video** sessions.
- **1 monthly function meeting** (Overseer + all leaders).
- Youth fellowship night, new teachers training, etc.

> **No church service bookings.** Sabbath morning/afternoon/evening and
> Tuesday service are blocked slots, not bookings — this is a Bible-study
> management app, not a service booking app.

## "Currently Studying" metric

Teachers and every level above them track **how many of their students
(or rolled-up subtree) are currently studying a Bible subject right now**.

- `TeacherMetrics.currentlyStudying` — per-teacher count.
- `OrgNode.metrics.currentlyStudying` — rolled up for every level
  (team → group → branch → overseer).
- Displayed as a cyan graduation-cap icon in the org tree and the
  Teacher Metrics cards on the Groups page.

## Credentials

All mock accounts use password **`admin`**. Key usernames:

- `admin` — Michael (Dev, top of tree)
- `stephen` — Stephen Wright (Dev, sibling)
- `overseer1` — Gabriel (Overseer)
- `branch1` … `branch5` — branch leaders (Joseph, Zechariah, John the Baptist, Simeon, Simon Peter)
- `group1` … `group10` — group leaders (also teachers)
- `team1` … `team15` — team leaders (also teachers)
- `member1` … `member99` — members

## Removing or replacing the mock data

The entire scenario is **isolated to 2 files**:

1. `src/mocks/scenario-church-week.ts` — all generated users, areas,
   rooms, contacts, bookings, blocked slots, metrics, org tree, audit log.
2. `src/mocks/subjects.ts` — the 50 Bible study subjects.

`src/mocks/data.ts` simply re-exports from `scenario-church-week.ts`, so
switching to a different scenario is a single-file edit.

### To use the real backend

1. In Vercel (or `.env.local`), set:

   ```
   NEXT_PUBLIC_MOCK_API=false
   NEXT_PUBLIC_API_URL=https://your-backend.example.com/api
   ```

2. Redeploy. MSW will stop intercepting requests — all API calls will hit
   the real Go backend. The files in `src/mocks/` are never bundled into
   the production code path when mocks are disabled (MSWProvider lazy-loads
   them only when the flag is on).

3. Optional cleanup: once the real backend is live and you no longer need
   the mocks, you can safely delete:
   - `src/mocks/scenario-church-week.ts`
   - `src/mocks/subjects.ts`
   - `src/mocks/data.ts`
   - `src/mocks/handlers.ts`
   - `src/mocks/browser.ts` (in-page fetch/XHR interception — the mock layer is
     service-worker-free; there is no SW script in `public/` to remove)
   - `src/components/shared/MSWProvider.tsx` (and its usage in `Providers.tsx`)

No production code (pages, components, API client, stores) references
the mock files directly — they're entirely behind the MSW flag.
