# Diamond — Hypothetical Church Week Mock Scenario

> **This is mock data for frontend testing and demos.** None of the people,
> contacts, bookings, or events below represent real individuals or activities.
> See "Removing or replacing the mock data" at the bottom to switch to a
> real backend.

## Overview

Diamond currently runs against a frozen, deterministic mock dataset that
simulates an **active week across five branches** of a church community,
with everyone booking every activity through the app.

The scenario lives entirely in one file:
[`src/mocks/scenario-church-week.ts`](./src/mocks/scenario-church-week.ts)

The study curriculum lives in
[`src/mocks/subjects.ts`](./src/mocks/subjects.ts).

## Organization Hierarchy

| Level | Count | Notes |
|---|---|---|
| Developer (Admin) | 2 | **Michael** (no last name), **Stephen Wright** |
| Overseer | 1 | **Gabriel** — every branch reports up under him |
| Branch Leader | 5 | Joseph, Zechariah, John the Baptist, Simeon, Simon Peter — male biblical names, one per branch |
| Group Leader | 10 | Two per branch. All carry the `teacher` tag and have study metrics. |
| Team Leader | 15 | Distributed across the 10 group leaders. All carry `teacher` and have study metrics. |
| Member | 99 | All baptized, distributed across the 15 teams. ~20 carry the `teacher` tag. |
| **Total users** | **132** | |

Stephen Wright sits as a second top-level admin alongside Michael. Every
operational reporting line is: Michael → Gabriel (Overseer) → Branch
Leader → Group Leader → Team Leader → Member.

## Branches

5 branches under Gabriel, each with its own `area` (physical location):

| Branch (area) | Branch Leader | Rooms |
|---|---|---|
| Newport News Zion (main) | Joseph | Bible Study Room 1–4, Conference Room, Sanctuary, Fellowship, TRE Room |
| Chesapeake Zion | Zechariah | Study Room 1, 2, 3, Conference Room |
| Norfolk Zion | John the Baptist | Study Room 1, 2, Living Room, ODU Library, ODU Web Center, HU Library, HU Student Center |
| Virginia Beach Zion | Simeon | Study Room 1, 2, Conference Room |
| Williamsburg Zion | Simon Peter | Study Room 1, Barnes and Noble |

## Tags

Tags are orthogonal capability flags on a user (replacing the prior
Teacher role). The seed populates:

- `teacher` — every Group + Team Leader (and ~20 Members) carry it. Required to be assigned as the leader of a Bible Study booking.
- `co_group_leader` — exactly 1 per group (10 total).
- `co_team_leader` — exactly 1 per team (15 total).

New tag ids can be added at any time via the admin Tags tab; the data
model is `tags: string[]`.

## Contacts (Unbaptized)

- **50 contacts** total, all unbaptized, distributed across all 5 branches.
- About half are currently studying one of the 50 Bible study subjects.
- Pipeline stages used: `FIRST_STUDY`, `REGULAR_STUDY`, `PROGRESSING`, `BAPTISM_READY`, `BAPTIZED`. (`INITIAL_CONTACT` was removed in v1 of the overhaul — don't reference it.)
- Each studying contact has:
  - `currentlyStudying: true`
  - `currentStep` (1–5)
  - `currentSubject` (one of the 50 titles)
  - Realistic session counts (2–16) and recent `lastSessionDate`

### Bible Study Curriculum — 5 steps × 10 subjects = 50

The full list is in `src/mocks/subjects.ts`. Structured as:

- **Step 1:** Forgiveness of Sins, Savior of Each Age, Jerusalem Mother,
  Sabbath, Passover, Cross-Reverence, Baptism, …
- **Step 2:** Whom the Bible Testifies About, King David, Zion, Heavenly
  Wedding Banquet, Abraham's Family, Daniel 2 & 7, Revelation 13, 17, 18, …
- **Step 3:** Trinity, Melchizedek, Mother the Source of Water of Life,
  Weeds and Wheat, The Church Bought With God's Blood, …
- **Step 4:** Church Established by the Root of David, The Last Adam,
  Biblical Sabbath, True Meaning of the Passover, …
- **Step 5:** Words of God Are Absolute, Watch Out for False Prophets,
  Second Coming, Coming on the Clouds, God's Coming From the East, …

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

The seed defines 4 default global blocked slots (apply to all 5 branches,
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
   - `src/mocks/browser.ts`
   - `public/mockServiceWorker.js`
   - `src/components/shared/MSWProvider.tsx` (and its usage in `Providers.tsx`)

No production code (pages, components, API client, stores) references
the mock files directly — they're entirely behind the MSW flag.
