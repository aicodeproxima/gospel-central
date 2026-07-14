/**
 * ============================================================================
 * HYPOTHETICAL CHURCH WEEK — MOCK SCENARIO (v3: 2 churches, biblical names)
 * ============================================================================
 *
 * This file generates a complete mock dataset representing a hypothetical
 * active week across the 2 Zion churches in the Hampton Roads area of
 * Virginia. (v3, 2026-07 overhaul Phase 1: the former Chesapeake, Norfolk and
 * Williamsburg congregations consolidated into these two — Williamsburg into
 * Newport News, Chesapeake/Norfolk into Virginia Beach. The story is recorded
 * in the seeded audit-log entries; no live id/name references a dead branch.)
 *
 * All data is mock and lives in this file. To replace with real data when
 * the Go backend is live, set `NEXT_PUBLIC_MOCK_API=false` and MSW will
 * stop intercepting — this file becomes dead code.
 *
 * Scenario overview
 * -----------------
 *   Roles (no Teacher role; Teacher is a TAG):
 *     - 2 Devs:            Michael, Stephen Wright
 *     - 1 Overseer:        Gabriel
 *     - 2 Branch Leaders:  Joseph (Newport News), Simon Peter (Virginia Beach)
 *     - 10 Group Leaders:  5 per church (groups 1–5 NN, 6–10 VB)
 *     - 18 Team Leaders:   15 numbered teams + the 3 ex-Branch-Leaders
 *                          (Zechariah, John the Baptist, Simeon — now TLs at VB;
 *                          their u-branch-2/3/4 ids + branch2/3/4 logins kept)
 *     - 99 Members:        round-robin across the 18 teams (6 or 5 each)
 *     ------
 *     132 users total — biblical names #1–132 from the prepared list
 *     Newport News = 75 people · Virginia Beach = 54 · +3 church-wide (Devs, Overseer)
 *
 *   Churches (each is a physical location with its own area):
 *     1. Newport News Zion  — main church, 9 rooms (BS1–4, Conference, Sanctuary,
 *        Fellowship, TRE, Barnes and Noble partner space)
 *     2. Virginia Beach Zion — 6 rooms (Study Rooms 1–3, Conference, ODU Library,
 *        Living Room)
 *
 *   Tags (orthogonal to role; multiple per user allowed):
 *     - 'teacher'          — can lead Bible Study bookings
 *     - 'co_group_leader'  — supports the primary group leader
 *     - 'co_team_leader'   — supports the primary team leader
 *     All Branch / Group / Team leaders carry 'teacher' by default.
 *     One Co-Group Leader per group (10 total) and one Co-Team Leader per
 *     team (18 total) are picked from members and tagged.
 *     ~20 additional Members are also tagged 'teacher'.
 *
 *   Contacts: 50 contacts across all 6 statuses (every status present in BOTH
 *   churches — see CONTACT_STAGES). Biblical names #133–182. NN 30 / VB 20.
 *
 *   Bookings: Bible studies + admin meetings spread across both churches.
 *   Sabbath services are NOT bookings — they live in BLOCKED_SLOTS instead.
 *
 *   Blocked slots: 4 weekly global blocks for service times that no role can
 *   override. See scenarioBlockedSlots below.
 * ============================================================================
 */

import {
  Activity,
  BookingStatus,
  BookingType,
  ContactStatus,
  PIPELINE_STAGE_CONFIG,
  PipelineStage,
  UserRole,
  KNOWN_TAGS,
} from '@/lib/types';
import type {
  Area,
  AuditLogEntry,
  BlockedSlot,
  Booking,
  Contact,
  TimelineEntry,
  User,
} from '@/lib/types';
import type { TeacherMetrics } from '@/lib/types/user';
import { pickAvatarForUser, isFemaleFirstName } from '@/lib/avatars';
import { CURRICULUM } from '@/lib/curriculum';
import { now as mockNow, nowMs as mockNowMs } from './mock-clock';

// ---------------------------------------------------------------------------
// Deterministic PRNG so mock data stays stable between renders
// ---------------------------------------------------------------------------
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}
const rand = seeded(42);
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

// ---------------------------------------------------------------------------
// Biblical names (1–182). User-provided list, mapped 1:1 to seed entities.
// ---------------------------------------------------------------------------
// Index 0 is unused so #1 = Jesus, #2 = Gabriel, etc.
// We don't seed Jesus (#1) or Mary mother of Jesus (#3) into any specific
// role — they're skipped to preserve the venerated naming. The Devs keep
// their existing names (Michael, Stephen Wright) which are independently
// biblical (Archangel Michael; Stephen the protomartyr).
// ---------------------------------------------------------------------------
const BIBLICAL_NAMES: { first: string; last: string; female?: boolean }[] = [
  { first: '', last: '' },                                                      // 0 (placeholder)
  { first: 'Jesus', last: '' },                                                 // 1
  { first: 'Gabriel', last: '' },                                               // 2
  { first: 'Mary', last: 'of Nazareth', female: true },                         // 3
  { first: 'Joseph', last: '' },                                                // 4
  { first: 'Elizabeth', last: '', female: true },                               // 5
  { first: 'Zechariah', last: '' },                                             // 6
  { first: 'John', last: 'the Baptist' },                                       // 7
  { first: 'Simeon', last: '' },                                                // 8
  { first: 'Anna', last: 'the Prophetess', female: true },                      // 9
  { first: 'Simon', last: 'Peter' },                                            // 10
  { first: 'Andrew', last: '' },                                                // 11
  { first: 'James', last: 'son of Zebedee' },                                   // 12
  { first: 'John', last: 'son of Zebedee' },                                    // 13
  { first: 'Philip', last: 'the Apostle' },                                     // 14
  { first: 'Bartholomew', last: '' },                                           // 15
  { first: 'Thomas', last: '' },                                                // 16
  { first: 'Matthew', last: '' },                                               // 17
  { first: 'James', last: 'son of Alphaeus' },                                  // 18
  { first: 'Jude', last: 'son of James' },                                      // 19
  { first: 'Simon', last: 'the Zealot' },                                       // 20
  { first: 'Matthias', last: '' },                                              // 21
  { first: 'Paul', last: '' },                                                  // 22
  { first: 'Barnabas', last: '' },                                              // 23
  { first: 'Silas', last: '' },                                                 // 24
  { first: 'Timothy', last: '' },                                               // 25
  { first: 'Titus', last: '' },                                                 // 26
  { first: 'Luke', last: '' },                                                  // 27
  { first: 'John', last: 'Mark' },                                              // 28
  { first: 'Apollos', last: '' },                                               // 29
  { first: 'Aquila', last: '' },                                                // 30
  { first: 'Priscilla', last: '', female: true },                               // 31
  { first: 'Lydia', last: '', female: true },                                   // 32
  { first: 'Phoebe', last: '', female: true },                                  // 33
  { first: 'Stephen', last: 'the Deacon' },                                     // 34
  { first: 'Philip', last: 'the Evangelist' },                                  // 35
  { first: 'Ananias', last: 'of Damascus' },                                    // 36
  { first: 'Dorcas', last: '', female: true },                                  // 37
  { first: 'Cornelius', last: '' },                                             // 38
  { first: 'Agabus', last: '' },                                                // 39
  { first: 'Simeon', last: 'Niger' },                                           // 40
  { first: 'Lucius', last: 'of Cyrene' },                                       // 41
  { first: 'Manaen', last: '' },                                                // 42
  { first: 'Rhoda', last: '', female: true },                                   // 43
  { first: 'Mary', last: 'mother of Mark', female: true },                      // 44
  { first: 'James', last: "the Lord's brother" },                               // 45
  { first: 'Jude', last: "the Lord's brother" },                                // 46
  { first: 'Joses', last: "the Lord's brother" },                               // 47
  { first: 'Simon', last: "the Lord's brother" },                               // 48
  { first: 'Mary', last: 'Magdalene', female: true },                           // 49
  { first: 'Mary', last: 'mother of James and Joses', female: true },           // 50
  { first: 'Salome', last: '', female: true },                                  // 51
  { first: 'Joanna', last: '', female: true },                                  // 52
  { first: 'Susanna', last: '', female: true },                                 // 53
  { first: 'Martha', last: '', female: true },                                  // 54
  { first: 'Mary', last: 'of Bethany', female: true },                          // 55
  { first: 'Lazarus', last: '' },                                               // 56
  { first: 'Nicodemus', last: '' },                                             // 57
  { first: 'Joseph', last: 'of Arimathea' },                                    // 58
  { first: 'Zacchaeus', last: '' },                                             // 59
  { first: 'Bartimaeus', last: '' },                                            // 60
  { first: 'Jairus', last: '' },                                                // 61
  { first: 'Cleopas', last: '' },                                               // 62
  { first: 'Simon', last: 'of Cyrene' },                                        // 63
  { first: 'Alexander', last: 'son of Simon' },                                 // 64
  { first: 'Rufus', last: '' },                                                 // 65
  { first: 'Joseph', last: 'Barsabbas' },                                       // 66
  { first: 'Justus', last: 'of Corinth' },                                      // 67
  { first: 'Crispus', last: '' },                                               // 68
  { first: 'Sosthenes', last: '' },                                             // 69
  { first: 'Erastus', last: '' },                                               // 70
  { first: 'Gaius', last: '' },                                                 // 71
  { first: 'Aristarchus', last: '' },                                           // 72
  { first: 'Secundus', last: '' },                                              // 73
  { first: 'Sopater', last: '' },                                               // 74
  { first: 'Tychicus', last: '' },                                              // 75
  { first: 'Trophimus', last: '' },                                             // 76
  { first: 'Epaphroditus', last: '' },                                          // 77
  { first: 'Epaphras', last: '' },                                              // 78
  { first: 'Onesimus', last: '' },                                              // 79
  { first: 'Philemon', last: '' },                                              // 80
  { first: 'Apphia', last: '', female: true },                                  // 81
  { first: 'Archippus', last: '' },                                             // 82
  { first: 'Nympha', last: '', female: true },                                  // 83
  { first: 'Chloe', last: '', female: true },                                   // 84
  { first: 'Stephanas', last: '' },                                             // 85
  { first: 'Fortunatus', last: '' },                                            // 86
  { first: 'Achaicus', last: '' },                                              // 87
  { first: 'Andronicus', last: '' },                                            // 88
  { first: 'Junia', last: '', female: true },                                   // 89
  { first: 'Ampliatus', last: '' },                                             // 90
  { first: 'Urbanus', last: '' },                                               // 91
  { first: 'Stachys', last: '' },                                               // 92
  { first: 'Apelles', last: '' },                                               // 93
  { first: 'Aristobulus', last: '' },                                           // 94
  { first: 'Herodion', last: '' },                                              // 95
  { first: 'Tryphaena', last: '', female: true },                               // 96
  { first: 'Tryphosa', last: '', female: true },                                // 97
  { first: 'Persis', last: '', female: true },                                  // 98
  { first: 'Asyncritus', last: '' },                                            // 99
  { first: 'Phlegon', last: '' },                                               // 100
  { first: 'Hermes', last: '' },                                                // 101
  { first: 'Patrobas', last: '' },                                              // 102
  { first: 'Hermas', last: '' },                                                // 103
  { first: 'Philologus', last: '' },                                            // 104
  { first: 'Julia', last: '', female: true },                                   // 105
  { first: 'Nereus', last: '' },                                                // 106
  { first: 'Olympas', last: '' },                                               // 107
  { first: 'Euodia', last: '', female: true },                                  // 108
  { first: 'Syntyche', last: '', female: true },                                // 109
  { first: 'Clement', last: '' },                                               // 110
  { first: 'Carpus', last: '' },                                                // 111
  { first: 'Eubulus', last: '' },                                               // 112
  { first: 'Pudens', last: '' },                                                // 113
  { first: 'Linus', last: '' },                                                 // 114
  { first: 'Claudia', last: '', female: true },                                 // 115
  { first: 'Zenas', last: '' },                                                 // 116
  { first: 'Artemas', last: '' },                                               // 117
  { first: 'Crescens', last: '' },                                              // 118
  { first: 'Onesiphorus', last: '' },                                           // 119
  { first: 'Lois', last: '', female: true },                                    // 120
  { first: 'Eunice', last: '', female: true },                                  // 121
  { first: 'Jason', last: '' },                                                 // 122
  { first: 'Mnason', last: '' },                                                // 123
  { first: 'Dionysius', last: 'the Areopagite' },                               // 124
  { first: 'Damaris', last: '', female: true },                                 // 125
  { first: 'Sergius', last: 'Paulus' },                                         // 126
  { first: 'Julius', last: 'the Centurion' },                                   // 127
  { first: 'Publius', last: '' },                                               // 128
  { first: 'Eutychus', last: '' },                                              // 129
  { first: 'Gamaliel', last: '' },                                              // 130
  { first: 'Theophilus', last: '' },                                            // 131
  { first: 'Simon', last: 'the Tanner' },                                       // 132
  // ---- Contacts (133–182) ----
  { first: 'Ethiopian', last: 'Eunuch' },                                       // 133
  { first: 'Samaritan', last: 'Woman', female: true },                          // 134
  { first: 'Repentant', last: 'Thief' },                                        // 135
  { first: 'Adam', last: '' },                                                  // 136
  { first: 'Abel', last: '' },                                                  // 137
  { first: 'Enoch', last: '' },                                                 // 138
  { first: 'Noah', last: '' },                                                  // 139
  { first: 'Abraham', last: '' },                                               // 140
  { first: 'Sarah', last: '', female: true },                                   // 141
  { first: 'Isaac', last: '' },                                                 // 142
  { first: 'Rebekah', last: '', female: true },                                 // 143
  { first: 'Jacob', last: '' },                                                 // 144
  { first: 'Leah', last: '', female: true },                                    // 145
  { first: 'Rachel', last: '', female: true },                                  // 146
  { first: 'Joseph', last: 'son of Jacob' },                                    // 147
  { first: 'Judah', last: '' },                                                 // 148
  { first: 'Tamar', last: '', female: true },                                   // 149
  { first: 'Perez', last: '' },                                                 // 150
  { first: 'Hezron', last: '' },                                                // 151
  { first: 'Amminadab', last: '' },                                             // 152
  { first: 'Boaz', last: '' },                                                  // 153
  { first: 'Rahab', last: '', female: true },                                   // 154
  { first: 'Ruth', last: '', female: true },                                    // 155
  { first: 'Obed', last: '' },                                                  // 156
  { first: 'Jesse', last: '' },                                                 // 157
  { first: 'David', last: '' },                                                 // 158
  { first: 'Solomon', last: '' },                                               // 159
  { first: 'Hezekiah', last: '' },                                              // 160
  { first: 'Josiah', last: '' },                                                // 161
  { first: 'Shealtiel', last: '' },                                             // 162
  { first: 'Zerubbabel', last: '' },                                            // 163
  { first: 'Eliakim', last: '' },                                               // 164
  { first: 'Zadok', last: '' },                                                 // 165
  { first: 'Moses', last: '' },                                                 // 166
  { first: 'Aaron', last: '' },                                                 // 167
  { first: 'Joshua', last: '' },                                                // 168
  { first: 'Samuel', last: '' },                                                // 169
  { first: 'Elijah', last: '' },                                                // 170
  { first: 'Elisha', last: '' },                                                // 171
  { first: 'Isaiah', last: '' },                                                // 172
  { first: 'Jeremiah', last: '' },                                              // 173
  { first: 'Daniel', last: '' },                                                // 174
  { first: 'Jonah', last: '' },                                                 // 175
  { first: 'Job', last: '' },                                                   // 176
  { first: 'Lot', last: '' },                                                   // 177
  { first: 'Melchizedek', last: '' },                                           // 178
  { first: 'Gideon', last: '' },                                                // 179
  { first: 'Barak', last: '' },                                                 // 180
  { first: 'Samson', last: '' },                                                // 181
  { first: 'Jephthah', last: '' },                                              // 182
];

function nameAt(idx: number): { first: string; last: string; female?: boolean } {
  return BIBLICAL_NAMES[idx] ?? { first: 'Unknown', last: '' };
}

// ---------------------------------------------------------------------------
// Areas / Rooms — 2 churches (2026-07 overhaul Phase 1 consolidation).
// The former Chesapeake/Norfolk congregations merged into Virginia Beach Zion
// and Williamsburg merged into Newport News Zion; that history lives in the
// seeded audit-log entries, NOT in any live id/name (grep gate: no dead-branch
// names outside generateAuditLog + this comment).
// ---------------------------------------------------------------------------
export const scenarioAreas: Area[] = [
  {
    id: 'area-newport-news',
    name: 'Newport News Zion',
    description: 'Main church location — full facility with Sanctuary, Fellowship hall, and TRE Room.',
    rooms: [
      { id: 'rm-nn-bs1',     areaId: 'area-newport-news', name: 'Bible Study Room 1', capacity: 6, features: ['Whiteboard'] },
      { id: 'rm-nn-bs2',     areaId: 'area-newport-news', name: 'Bible Study Room 2', capacity: 6, features: ['Whiteboard'] },
      { id: 'rm-nn-bs3',     areaId: 'area-newport-news', name: 'Bible Study Room 3', capacity: 6, features: ['Whiteboard', 'Zoom Setup'] },
      { id: 'rm-nn-bs4',     areaId: 'area-newport-news', name: 'Bible Study Room 4', capacity: 6, features: ['Whiteboard', 'Zoom Setup'] },
      { id: 'rm-nn-conf',    areaId: 'area-newport-news', name: 'Conference Room',    capacity: 20, features: ['Projector', 'Video Conf'] },
      // ROOM-1: Sanctuary + Fellowship are service-only spaces. They
      // appear in the room list for completeness but the BookingWizard
      // filters them out so users don't try to book a Bible Study during
      // service hours and hit the blocked-slot 409.
      { id: 'rm-nn-sanct',   areaId: 'area-newport-news', name: 'Sanctuary',          capacity: 300, features: ['Stage', 'Sound System', 'Live Stream'], isBookable: false },
      { id: 'rm-nn-fellow',  areaId: 'area-newport-news', name: 'Fellowship',         capacity: 60, features: ['Kitchen', 'Tables'], isBookable: false },
      { id: 'rm-nn-tre',     areaId: 'area-newport-news', name: 'TRE Room',           capacity: 15, features: ['Training Setup'] },
      // Inherited public partner space from the Peninsula consolidation.
      { id: 'rm-nn-bn',      areaId: 'area-newport-news', name: 'Barnes and Noble',   capacity: 6, features: ['Public Space'] },
    ],
  },
  {
    id: 'area-virginia-beach',
    name: 'Virginia Beach Zion',
    description: 'Southside church — expanded after the consolidation; uses public spaces (ODU, host homes) for outreach studies.',
    rooms: [
      { id: 'rm-vb-sr1',     areaId: 'area-virginia-beach', name: 'Virginia Beach Study Room 1', capacity: 6, features: ['Whiteboard'] },
      { id: 'rm-vb-sr2',     areaId: 'area-virginia-beach', name: 'Virginia Beach Study Room 2', capacity: 6, features: ['Whiteboard'] },
      { id: 'rm-vb-conf',    areaId: 'area-virginia-beach', name: 'Conference Room',             capacity: 16, features: ['Projector'] },
      { id: 'rm-vb-sr3',     areaId: 'area-virginia-beach', name: 'Virginia Beach Study Room 3', capacity: 6, features: ['Whiteboard'] },
      { id: 'rm-vb-odu-lib', areaId: 'area-virginia-beach', name: 'ODU Library',                 capacity: 6, features: ['Public Space'] },
      { id: 'rm-vb-living',  areaId: 'area-virginia-beach', name: 'Living Room',                 capacity: 8, features: ['Casual'] },
    ],
  },
];

// ---------------------------------------------------------------------------
// Users — hierarchy under Gabriel (Overseer) → 5 Branch Leaders → ...
// ---------------------------------------------------------------------------

const today = () => mockNow().toISOString();

interface UserSeed {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  parentId?: string;
  tags?: string[];
}

function makeUser(s: UserSeed): User {
  return {
    id: s.id,
    username: s.username,
    firstName: s.firstName,
    lastName: s.lastName,
    email: `${s.username}@diamond.org`,
    phone: undefined,
    role: s.role,
    parentId: s.parentId,
    tags: s.tags ?? [],
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: today(),
  };
}

// --- Devs (2) — names kept intentionally; both happen to be biblical already ---
const uMichael = makeUser({
  id: 'u-michael', username: 'admin', firstName: 'Michael', lastName: '',
  role: UserRole.DEV,
});
const uStephen = makeUser({
  id: 'u-stephen', username: 'stephen', firstName: 'Stephen', lastName: 'Wright',
  role: UserRole.DEV,
});

// --- Overseer (1) — Gabriel (#2) ---
const uOverseer = makeUser({
  id: 'u-overseer-gabriel',
  username: 'overseer1',
  firstName: nameAt(2).first,
  lastName: nameAt(2).last,
  role: UserRole.OVERSEER,
  parentId: uMichael.id,
});

// --- Branch Leaders (2) — one per church post-consolidation ---
//   #4  Joseph       → Newport News Zion (main)      [test-pinned: u-branch-1]
//   #10 Simon Peter  → Virginia Beach Zion            [test-pinned: u-branch-5
//                       must lead a DIFFERENT branch than u-branch-1 — see
//                       docs/qa/stable-personas.md]
// Ids/usernames are carried explicitly (they can no longer derive from the
// array index — Simon Peter keeps his historical u-branch-5 identity).
const BRANCH_LEADER_SEEDS: { id: string; username: string; areaId: string; nameIdx: number }[] = [
  { id: 'u-branch-1', username: 'branch1', areaId: 'area-newport-news',   nameIdx: 4 },
  { id: 'u-branch-5', username: 'branch5', areaId: 'area-virginia-beach', nameIdx: 10 },
];
const branchLeaders: User[] = BRANCH_LEADER_SEEDS.map((s) => {
  const n = nameAt(s.nameIdx);
  return makeUser({
    id: s.id,
    username: s.username,
    firstName: n.first,
    lastName: n.last,
    role: UserRole.BRANCH_LEADER,
    parentId: uOverseer.id,
    tags: [KNOWN_TAGS.TEACHER],
  });
});

// --- Group Leaders (10) — names #5, #9, #11–18 ---
// 5 groups per church: groups 1–5 → Newport News, groups 6–10 → Virginia Beach
const GROUP_LEADER_NAME_INDICES = [5, 9, 11, 12, 13, 14, 15, 16, 17, 18];
const groupLeaders: User[] = GROUP_LEADER_NAME_INDICES.map((nameIdx, i) => {
  const parent = i < 5 ? branchLeaders[0] : branchLeaders[1];
  const n = nameAt(nameIdx);
  return makeUser({
    id: `u-group-${i + 1}`,
    username: `group${i + 1}`,
    firstName: n.first,
    lastName: n.last,
    role: UserRole.GROUP_LEADER,
    parentId: parent.id,
    tags: [KNOWN_TAGS.TEACHER],
  });
});

// --- Team Leaders (15 numbered + 3 ex-Branch-Leaders = 18 teams) ---
// Numbered teams distribute across the 10 groups exactly as before: groups
// 0-4 (NN) → 2 teams each (10), groups 5-9 (VB) → 1 team each (5). Total 15.
const TEAM_LEADER_NAME_INDICES = [19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33];
const teamToGroupIndex: number[] = [
  0, 0,    // group 0 → teams 0,1
  1, 1,    // group 1 → teams 2,3
  2, 2,    // group 2 → teams 4,5
  3, 3,    // group 3 → teams 6,7
  4, 4,    // group 4 → teams 8,9
  5,       // group 5 → team 10
  6,       // group 6 → team 11
  7,       // group 7 → team 12
  8,       // group 8 → team 13
  9,       // group 9 → team 14
];
const numberedTeamLeaders: User[] = TEAM_LEADER_NAME_INDICES.map((nameIdx, i) => {
  const groupIdx = teamToGroupIndex[i];
  const n = nameAt(nameIdx);
  return makeUser({
    id: `u-team-${i + 1}`,
    username: `team${i + 1}`,
    firstName: n.first,
    lastName: n.last,
    role: UserRole.TEAM_LEADER,
    parentId: groupLeaders[groupIdx].id,
    tags: [KNOWN_TAGS.TEACHER],
  });
});

// --- Former Branch Leaders (3) — now Team Leaders at Virginia Beach ---
// The 2026-07 consolidation demoted the three freed BLs to shepherd
// transplant teams under VB groups 6–8 (audit-log entries record the story).
// WARNING: the id prefix `u-branch-` NO LONGER implies role — the `role`
// field is authoritative. Do NOT "clean up" these ids or usernames: logins
// branch2/branch3/branch4 and the ids are load-bearing in history + tests.
const FORMER_BRANCH_LEADER_SEEDS: { id: string; username: string; nameIdx: number; parentId: string }[] = [
  { id: 'u-branch-2', username: 'branch2', nameIdx: 6, parentId: groupLeaders[5].id }, // Zechariah → Philip's group
  { id: 'u-branch-3', username: 'branch3', nameIdx: 7, parentId: groupLeaders[6].id }, // John the Baptist → Bartholomew's group
  { id: 'u-branch-4', username: 'branch4', nameIdx: 8, parentId: groupLeaders[7].id }, // Simeon → Thomas's group
];
const formerBlTeamLeaders: User[] = FORMER_BRANCH_LEADER_SEEDS.map((s) => {
  const n = nameAt(s.nameIdx);
  return makeUser({
    id: s.id,
    username: s.username,
    firstName: n.first,
    lastName: n.last,
    role: UserRole.TEAM_LEADER,
    parentId: s.parentId,
    tags: [KNOWN_TAGS.TEACHER],
  });
});

// Numbered teams FIRST (order is load-bearing: tests resolve "first TL under
// the first VB group" to u-team-11, and the member round-robin below fills
// slots 0-17 in this exact order). Declared BEFORE the members map — the map
// dereferences teamLeaders at module init.
const teamLeaders: User[] = [...numberedTeamLeaders, ...formerBlTeamLeaders];

// --- Members (99) — names #34–132 ---
// Distribute across 15 teams (~6-7 per team).
const MEMBER_NAME_INDICES = range(99).map((i) => 34 + i);  // 34..132
const members: User[] = MEMBER_NAME_INDICES.map((nameIdx, i) => {
  const team = teamLeaders[i % teamLeaders.length];
  const n = nameAt(nameIdx);
  return makeUser({
    id: `u-mem-${i + 1}`,
    username: `member${i + 1}`,
    firstName: n.first,
    lastName: n.last,
    role: UserRole.MEMBER,
    parentId: team.id,
    tags: [],     // tags applied below
  });
});

// --- Apply Co-Group Leader tag to one member of each group ---
groupLeaders.forEach((gl, gi) => {
  // Find a member in this group's subtree (any of its team members)
  const groupTeamIds = teamLeaders.filter((t) => t.parentId === gl.id).map((t) => t.id);
  const candidate = members.find((m) => groupTeamIds.includes(m.parentId!));
  if (candidate) {
    candidate.tags = [...(candidate.tags ?? []), KNOWN_TAGS.CO_GROUP_LEADER, KNOWN_TAGS.TEACHER];
  }
});

// --- Apply Co-Team Leader tag to one member of each team ---
teamLeaders.forEach((tl, ti) => {
  const teamMembers = members.filter((m) => m.parentId === tl.id);
  // Skip the first member if it's already tagged as Co-GL (so they're different people)
  const candidate = teamMembers.find((m) => !m.tags?.includes(KNOWN_TAGS.CO_GROUP_LEADER)) ?? teamMembers[0];
  if (candidate) {
    candidate.tags = [...(candidate.tags ?? []), KNOWN_TAGS.CO_TEAM_LEADER, KNOWN_TAGS.TEACHER];
  }
});

// --- Tag ~20 additional Members as Teacher (in addition to Co-leaders) ---
// Spread roughly evenly so each team has at least one extra teacher.
const TEACHER_MEMBER_INDICES = [
  3, 8, 13, 18, 23, 28, 33, 38, 43, 48,
  53, 58, 63, 68, 73, 78, 83, 88, 93, 98,
];
TEACHER_MEMBER_INDICES.forEach((i) => {
  const m = members[i];
  if (m && !m.tags?.includes(KNOWN_TAGS.TEACHER)) {
    m.tags = [...(m.tags ?? []), KNOWN_TAGS.TEACHER];
  }
});

// Defensive pin: u-mem-3 (username member3) is the heaviest e2e persona and
// MUST carry the teacher tag (docs/qa/stable-personas.md). Today it emerges
// from the co-leader loops; this guard makes the constraint order-independent.
if (!members[2].tags?.includes(KNOWN_TAGS.TEACHER)) {
  members[2].tags = [...(members[2].tags ?? []), KNOWN_TAGS.TEACHER];
}

// --- Assign avatars ---
const _rawUsers: User[] = [
  uMichael,
  uStephen,
  uOverseer,
  ...branchLeaders,
  ...groupLeaders,
  ...teamLeaders,
  ...members,
];
for (const u of _rawUsers) {
  const isFemale =
    BIBLICAL_NAMES.find(
      (n) => n.first === u.firstName && (n.last === '' || n.last === u.lastName),
    )?.female ?? isFemaleFirstName(u.firstName);
  // 2026-07 overhaul: Brother/Sister tag on every account, inferred from the
  // name (user-editable in Settings). Drives booking-card color (Decision 4).
  u.gender = isFemale ? 'sister' : 'brother';
  u.avatarUrl = pickAvatarForUser(u.role, u.id, isFemale);
}
export const scenarioUsers: User[] = _rawUsers;

// ---------------------------------------------------------------------------
// Helpers — lookups used by contacts + bookings + org tree
// ---------------------------------------------------------------------------

/** Resolve which branch a member belongs to via parentId chain. */
function branchForMember(member: User): User {
  const team = teamLeaders.find((t) => t.id === member.parentId);
  const group = team ? groupLeaders.find((g) => g.id === team.parentId) : undefined;
  const branch = group ? branchLeaders.find((b) => b.id === group.parentId) : undefined;
  return branch ?? branchLeaders[0];
}

function areaIdForBranch(branchUser: User): string {
  const idx = branchLeaders.findIndex((b) => b.id === branchUser.id);
  return idx >= 0 ? BRANCH_LEADER_SEEDS[idx].areaId : 'area-newport-news';
}

// Seed each person's HOME LOCATION (= their branch's area). Walk parentId up to
// the branch leader, then map to its area. Overseer/Dev span all locations and
// stay unset. This makes `locationId` a real, queryable attribute from day one
// so the org can model relocations (e.g. moving people to the new VA Beach area).
(() => {
  const byId = new Map(scenarioUsers.map((u) => [u.id, u] as const));
  for (const u of scenarioUsers) {
    if (u.role === UserRole.OVERSEER || u.role === UserRole.DEV) continue;
    let cur: User | undefined = u;
    const seen = new Set<string>(); // guard against a parentId cycle (audit #10)
    while (cur && cur.role !== UserRole.BRANCH_LEADER && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    if (cur && cur.role === UserRole.BRANCH_LEADER) u.locationId = areaIdForBranch(cur);
  }
})();

// ---------------------------------------------------------------------------
// Blocked slots — service times no role can override
// ---------------------------------------------------------------------------
export const scenarioBlockedSlots: BlockedSlot[] = [
  {
    id: 'bs-tue-evening',
    scope: 'global',
    recurrence: 'weekly',
    dayOfWeek: 2,    // Tuesday
    startTime: '20:00',
    endTime: '21:00',
    reason: 'Tuesday service',
    createdBy: uOverseer.id,
    createdAt: '2024-01-01T00:00:00Z',
    isActive: true,
  },
  {
    id: 'bs-sat-morning',
    scope: 'global',
    recurrence: 'weekly',
    dayOfWeek: 6,    // Saturday
    startTime: '09:00',
    endTime: '10:00',
    reason: 'Sabbath morning service',
    createdBy: uOverseer.id,
    createdAt: '2024-01-01T00:00:00Z',
    isActive: true,
  },
  {
    id: 'bs-sat-afternoon',
    scope: 'global',
    recurrence: 'weekly',
    dayOfWeek: 6,
    startTime: '15:00',
    endTime: '16:00',
    reason: 'Sabbath afternoon service',
    createdBy: uOverseer.id,
    createdAt: '2024-01-01T00:00:00Z',
    isActive: true,
  },
  {
    id: 'bs-sat-evening',
    scope: 'global',
    recurrence: 'weekly',
    dayOfWeek: 6,
    startTime: '20:00',
    endTime: '21:00',
    reason: 'Sabbath evening service',
    createdBy: uOverseer.id,
    createdAt: '2024-01-01T00:00:00Z',
    isActive: true,
  },
];

// Edge case (finding 236): one fully-closed day for Virginia Beach — a
// realistic one-off building closure that makes the booking wizard's
// 'No availability this day' room reason reachable with seed data.
{
  const closed = mockNow();
  // NEXT week's Wednesday: seeded bookings only span the current Mon–Sun
  // week (pinned invariant), so a next-week closure can never overlap one.
  closed.setDate(closed.getDate() + (((3 - closed.getDay() + 7) % 7) || 7) + 7);
  closed.setHours(0, 0, 0, 0);
  const closedEnd = new Date(closed);
  closedEnd.setHours(23, 59, 0, 0);
  scenarioBlockedSlots.push({
    id: 'bs-vb-convention-day',
    scope: 'area',
    areaId: 'area-virginia-beach',
    recurrence: 'one-off',
    startDateTime: closed.toISOString(),
    endDateTime: closedEnd.toISOString(),
    reason: 'Building closed — regional convention',
    createdBy: uOverseer.id,
    createdAt: '2026-07-01T00:00:00Z',
    isActive: true,
  });
}

// ---------------------------------------------------------------------------
// Contacts — 50 contacts assigned to members across all 5 branches
// ---------------------------------------------------------------------------
const teacherPool = [
  ...branchLeaders, ...groupLeaders, ...teamLeaders,
  ...members.filter((m) => (m.tags ?? []).includes(KNOWN_TAGS.TEACHER)),
];

function historicalBaseline(stage: PipelineStage): number {
  switch (stage) {
    case PipelineStage.FIRST_STUDY:    return 1 + Math.floor(rand() * 2);
    case PipelineStage.UNBAPTIZED:     return 5 + Math.floor(rand() * 8);
    case PipelineStage.POTENTIAL:      return 15 + Math.floor(rand() * 11);
    case PipelineStage.NEEDS_HELP:     return 8 + Math.floor(rand() * 8);
    case PipelineStage.BAPTISM_READY:  return 25 + Math.floor(rand() * 11);
    case PipelineStage.BAPTIZED:       return 30 + Math.floor(rand() * 21);
    default:                           return 0;
  }
}

/**
 * Curriculum progress model (2026-07 overhaul): a contact's history is a
 * contiguous PREFIX of the 35-study curriculum — `prefixLen` studies done,
 * currently on study `prefixLen + 1`. Ranges per status keep the G2 pipeline
 * buckets (studies 1–4 / 5–10, Foundation-complete, in-Growth) realistically
 * populated. BAPTISM_READY+ always has Foundation (1–12) complete.
 */
function prefixLenForStage(stage: PipelineStage, seed: number): number {
  switch (stage) {
    case PipelineStage.FIRST_STUDY:   return 1 + (seed % 3);   // 1–3
    case PipelineStage.UNBAPTIZED:    return 3 + (seed % 6);   // 3–8
    case PipelineStage.POTENTIAL:     return 8 + (seed % 7);   // 8–14
    case PipelineStage.NEEDS_HELP:    return 5 + (seed % 8);   // 5–12 (stalled)
    case PipelineStage.BAPTISM_READY: return 12 + (seed % 8);  // 12–19
    case PipelineStage.BAPTIZED:      return CURRICULUM.length;
    default:                          return 0;
  }
}

function subjectForStage(stage: PipelineStage, seed: number) {
  const len = prefixLenForStage(stage, seed);
  return CURRICULUM[Math.min(len, CURRICULUM.length - 1)];
}

function subjectsStudiedForStage(stage: PipelineStage, seed: number): string[] {
  return CURRICULUM.slice(0, prefixLenForStage(stage, seed)).map((s) => s.title);
}

/**
 * Per-contact stage assignment (2026-07 Phase 1 reorg): an explicit 50-entry
 * literal instead of contiguous blocks, interleaved so that EVERY one of the
 * 6 statuses appears in BOTH churches (contact i's church follows member
 * (i*2)%99's team → group → branch chain; per-church result:
 * NN 3B/4R/7P/8U/2N/6F, VB 1B/2R/5P/6U/2N/4F). Totals preserved exactly:
 * 4 baptized, 6 baptism-ready, 12 potential, 14 unbaptized, 4 needs-help,
 * 10 first-study. c-2 stays BAPTIZED and c-50 stays FIRST_STUDY (test-pinned
 * personas teach them — see docs/qa/stable-personas.md).
 */
const B = PipelineStage.BAPTIZED;
const R = PipelineStage.BAPTISM_READY;
const P = PipelineStage.POTENTIAL;
const U = PipelineStage.UNBAPTIZED;
const N = PipelineStage.NEEDS_HELP;
const F = PipelineStage.FIRST_STUDY;
const CONTACT_STAGES: PipelineStage[] = [
  B, B, B, R, R, B, R, N, P, R,  // c-1..c-10
  R, P, P, P, R, U, P, F, P, P,  // c-11..c-20
  P, P, U, U, P, U, N, U, U, U,  // c-21..c-30
  U, U, F, P, U, U, U, U, N, N,  // c-31..c-40
  F, F, P, U, F, F, F, F, F, F,  // c-41..c-50
];

function stageForIndex(i: number): PipelineStage {
  return CONTACT_STAGES[i] ?? PipelineStage.FIRST_STUDY;
}

export const scenarioContacts: Contact[] = range(50).map((i) => {
  // Distribute contacts across all 99 members so they fall under all 5 branches.
  const member = members[(i * 2) % members.length];
  const branch = branchForMember(member);
  const stage = stageForIndex(i);
  const isBaptized = stage === PipelineStage.BAPTIZED;
  const isStudying = !isBaptized;
  const subject = subjectForStage(stage, i);

  // Contact gets a biblical name from the contacts pool (#133–182)
  const n = nameAt(133 + i);
  const fullContactName = `${n.first} ${n.last}`.trim();

  // 3 preaching partners: the assigned member + 2 rotating teacher pool
  const partner1 = member.id;
  const partner2 = teacherPool[(i + 1) % teacherPool.length].id;
  const partner3 = teacherPool[(i + 2) % teacherPool.length].id;
  const partnerName = `${teacherPool[(i + 1) % teacherPool.length].firstName} ${teacherPool[(i + 1) % teacherPool.length].lastName}`.trim();

  // Realistic timeline based on pipeline stage
  const timeline: TimelineEntry[] = [];
  const DAY = 86400000;
  // Noon UTC, not midnight: midnight-UTC instants render as the PREVIOUS day
  // for viewers west of UTC (finding 145); noon keeps the calendar date
  // stable across all realistic timezones, and derived stage/partner dates
  // inherit the anchor.
  const createdDate = new Date('2024-06-01T12:00:00Z');
  const memberName = `${member.firstName} ${member.lastName}`.trim();

  timeline.push({
    date: createdDate.toISOString(),
    action: 'created',
    details: `Contact created by ${memberName}`,
    userId: member.id,
    userName: memberName,
  });

  // NEEDS_HELP is not part of the linear journey — those contacts progress to
  // Unbaptized normally, then get manually flagged Needs Help (see below).
  const stageOrder: PipelineStage[] = [
    PipelineStage.FIRST_STUDY,
    PipelineStage.UNBAPTIZED,
    PipelineStage.POTENTIAL,
    PipelineStage.BAPTISM_READY,
    PipelineStage.BAPTIZED,
  ];
  const stageIdx = stage === PipelineStage.NEEDS_HELP ? 1 : stageOrder.indexOf(stage);
  for (let s = 1; s <= stageIdx; s++) {
    const stageDate = new Date(createdDate.getTime() + s * 45 * DAY + Math.floor(rand() * 30 * DAY));
    const cfg = PIPELINE_STAGE_CONFIG[stageOrder[s]];
    timeline.push({
      date: stageDate.toISOString(),
      action: 'stage_change',
      details: `Pipeline stage changed to ${cfg.label}`,
      userId: member.id,
      userName: memberName,
    });
  }
  if (stage === PipelineStage.NEEDS_HELP) {
    timeline.push({
      date: new Date(createdDate.getTime() + 120 * DAY + Math.floor(rand() * 30 * DAY)).toISOString(),
      action: 'stage_change',
      details: 'Pipeline stage changed to Needs Help',
      userId: member.id,
      userName: memberName,
    });
  }

  const sessions = historicalBaseline(stage);
  const sessionSpread = Math.min(sessions, 8);
  for (let s = 0; s < sessionSpread; s++) {
    const sessionDate = new Date(mockNowMs() - (sessionSpread - s) * 7 * DAY + Math.floor(rand() * 3 * DAY));
    timeline.push({
      date: sessionDate.toISOString(),
      action: 'session',
      details: `Bible study session conducted`,
      // userName must name the SAME person as userId (finding 147: the seed
      // paired partner1's id with partner2's name, so 'by {userName}' in the
      // timeline contradicted the stored actor).
      userId: member.id,
      userName: memberName,
    });
  }

  timeline.push({
    date: new Date(createdDate.getTime() + 7 * DAY).toISOString(),
    action: 'partner_change',
    details: `Preaching partners assigned: ${memberName}, ${partnerName}`,
    userId: member.id,
    userName: memberName,
  });

  timeline.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return {
    id: `c-${i + 1}`,
    firstName: n.first,
    lastName: n.last,
    email: `contact${i + 1}@diamond.org`,
    phone: `757-${(1000 + i).toString().slice(-4)}`,
    groupName: scenarioAreas.find((a) => a.id === areaIdForBranch(branch))?.name ?? 'Unknown',
    type: isBaptized ? BookingType.BAPTIZED_IN_PERSON : BookingType.UNBAPTIZED_CONTACT,
    status: ContactStatus.ACTIVE,
    pipelineStage: stage,
    assignedTeacherId: member.id,
    preachingPartnerIds: [partner1, partner2, partner3],
    totalSessions: historicalBaseline(stage),
    lastSessionDate: new Date(mockNowMs() - Math.floor(rand() * 10) * DAY).toISOString(),
    currentlyStudying: isStudying,
    currentStep: isStudying ? subject.number : undefined,
    currentSubject: isStudying ? subject.title : undefined,
    subjectsStudied: subjectsStudiedForStage(stage, i),
    notes: isBaptized
      ? `Baptized after completing the curriculum. ${fullContactName} is now an active member of ${branch.firstName} ${branch.lastName}'s branch.`
      : `Currently on Study ${subject.number} — ${subject.title}`,
    timeline,
    createdBy: member.id,
    createdAt: '2024-06-01T00:00:00Z',
    updatedAt: today(),
  };
});

// ---------------------------------------------------------------------------
// G3 tree personas (2026-07-04) — contacts under ANY role + the 15-contact
// stress persona ("test 1 person with 15 contacts in varied situations").
// The 3D layout used to DROP a branch node's own contacts (tree-layout
// place() branch-path bug) and the 50 contacts above are assigned exclusively
// to teacher-tagged MEMBERS, so leader-owned contacts were never exercised:
//  - u-team-3 (a TL with member children → a BRANCH node when expanded) owns
//    FIFTEEN contacts covering all 6 statuses with varied sessions/partners/
//    recency — also stresses the CONTACT_COLS grid wrap + collision
//    invariants pinned in tree-layout.test.ts.
//  - u-overseer-gabriel + u-group-5 each own ONE direct contact — the
//    packet's "overseer with a direct contact must show in the tree".
// Every row is currentlyStudying:false ON PURPOSE — the weekly-booking
// generator below creates bookings only for studying contacts, so these rows
// add ZERO bookings and leave the KPI/booking-count world untouched.
// ---------------------------------------------------------------------------
const G3_DAY = 86400000;
const g3UserById = new Map(scenarioUsers.map((u) => [u.id, u] as const));

function g3AreaNameFor(ownerId: string): string {
  // Walk the parent chain up to a branch leader; the overseer/dev tier sits
  // ABOVE both churches, so it defaults to the first area.
  let cur = g3UserById.get(ownerId);
  for (let hop = 0; cur && hop < 6; hop++) {
    const bl = branchLeaders.find((b) => b.id === cur!.id);
    if (bl) return scenarioAreas.find((a) => a.id === areaIdForBranch(bl))?.name ?? 'Unknown';
    cur = cur.parentId ? g3UserById.get(cur.parentId) : undefined;
  }
  return scenarioAreas[0].name;
}

interface G3ContactSpec {
  first: string;
  last: string;
  stage: PipelineStage;
  /** Days since the last logged session (undefined = never logged). */
  lastSessionDaysAgo?: number;
  sessions: number;
  /** How many preaching partners to attach (1–3, first = the owner). */
  partners: 1 | 2 | 3;
  /** Surface an in-progress study step on the card (stage-derived). */
  onStep?: boolean;
}

function g3Contact(ownerId: string, idx: number, spec: G3ContactSpec): Contact {
  const owner = g3UserById.get(ownerId)!;
  const ownerName = `${owner.firstName} ${owner.lastName}`.trim();
  const isBaptized = spec.stage === PipelineStage.BAPTIZED;
  const subject = subjectForStage(spec.stage, idx);
  const created = new Date(mockNowMs() - 200 * G3_DAY);
  const timeline: TimelineEntry[] = [
    {
      date: created.toISOString(),
      action: 'created',
      details: `Contact created by ${ownerName}`,
      userId: owner.id,
      userName: ownerName,
    },
  ];
  if (spec.stage !== PipelineStage.FIRST_STUDY) {
    timeline.push({
      date: new Date(created.getTime() + 60 * G3_DAY).toISOString(),
      action: 'stage_change',
      details: `Pipeline stage changed to ${PIPELINE_STAGE_CONFIG[spec.stage].label}`,
      userId: owner.id,
      userName: ownerName,
    });
  }
  const n = 51 + idx;
  return {
    id: `c-${n}`,
    firstName: spec.first,
    lastName: spec.last,
    email: `contact${n}@diamond.org`,
    phone: `757-${(1000 + n).toString().slice(-4)}`,
    groupName: g3AreaNameFor(owner.id),
    type: isBaptized ? BookingType.BAPTIZED_IN_PERSON : BookingType.UNBAPTIZED_CONTACT,
    status: ContactStatus.ACTIVE,
    pipelineStage: spec.stage,
    assignedTeacherId: owner.id,
    preachingPartnerIds: [
      owner.id,
      spec.partners >= 2 ? teacherPool[(idx + 3) % teacherPool.length].id : null,
      spec.partners >= 3 ? teacherPool[(idx + 7) % teacherPool.length].id : null,
    ],
    totalSessions: spec.sessions,
    lastSessionDate:
      spec.lastSessionDaysAgo === undefined
        ? undefined
        : new Date(mockNowMs() - spec.lastSessionDaysAgo * G3_DAY).toISOString(),
    currentlyStudying: false,
    currentStep: spec.onStep ? subject.number : undefined,
    currentSubject: spec.onStep ? subject.title : undefined,
    subjectsStudied: subjectsStudiedForStage(spec.stage, idx),
    notes: `Direct contact of ${ownerName}.`,
    timeline,
    createdBy: owner.id,
    createdAt: created.toISOString(),
    updatedAt: today(),
  };
}

// 15 contacts on ONE person (u-team-3): 3×First Study, 3×Unbaptized,
// 3×Potential, 2×Baptism Ready, 2×Needs Help, 2×Baptized — every status
// present, mixed recency (2–75 days), mixed partner counts, mixed steps.
const G3_TL_SPECS: G3ContactSpec[] = [
  { first: 'Ahira', last: 'Ben-Enan', stage: F, sessions: 1, lastSessionDaysAgo: 3, partners: 1 },
  { first: 'Nahshon', last: 'of Judah', stage: F, sessions: 2, lastSessionDaysAgo: 12, partners: 2, onStep: true },
  { first: 'Zuriel', last: 'Ben-Abihail', stage: F, sessions: 1, partners: 1 },
  { first: 'Elzaphan', last: 'Ben-Uzziel', stage: U, sessions: 6, lastSessionDaysAgo: 5, partners: 2, onStep: true },
  { first: 'Elishama', last: 'Ben-Ammihud', stage: U, sessions: 9, lastSessionDaysAgo: 40, partners: 3 },
  { first: 'Elizur', last: 'Ben-Shedeur', stage: U, sessions: 7, lastSessionDaysAgo: 2, partners: 2, onStep: true },
  { first: 'Shelomith', last: 'of Dan', stage: P, sessions: 17, lastSessionDaysAgo: 6, partners: 3, onStep: true },
  { first: 'Abidan', last: 'Ben-Gideoni', stage: P, sessions: 20, lastSessionDaysAgo: 25, partners: 2 },
  { first: 'Shelumiel', last: 'of Simeon', stage: P, sessions: 15, lastSessionDaysAgo: 9, partners: 1, onStep: true },
  { first: 'Ithamar', last: 'Ben-Aaron', stage: R, sessions: 28, lastSessionDaysAgo: 4, partners: 3, onStep: true },
  { first: 'Ahiezer', last: 'Ben-Ammishaddai', stage: R, sessions: 26, lastSessionDaysAgo: 18, partners: 2 },
  { first: 'Kemuel', last: 'of Ephraim', stage: N, sessions: 11, lastSessionDaysAgo: 50, partners: 1 },
  { first: 'Gamaliel', last: 'of Manasseh', stage: N, sessions: 9, lastSessionDaysAgo: 65, partners: 2 },
  { first: 'Pagiel', last: 'Ben-Ocran', stage: B, sessions: 34, lastSessionDaysAgo: 30, partners: 3 },
  { first: 'Eliasaph', last: 'Ben-Deuel', stage: B, sessions: 38, lastSessionDaysAgo: 75, partners: 2 },
];

scenarioContacts.push(
  ...G3_TL_SPECS.map((spec, i) => g3Contact('u-team-3', i, spec)),
  // Leaders with a DIRECT contact — must render under ANY role in the tree.
  g3Contact('u-overseer-gabriel', 15, {
    first: 'Cornelius', last: 'of Caesarea', stage: P, sessions: 12, lastSessionDaysAgo: 8, partners: 2, onStep: true,
  }),
  g3Contact('u-group-5', 16, {
    first: 'Lydia', last: 'of Thyatira', stage: U, sessions: 5, lastSessionDaysAgo: 14, partners: 1, onStep: true,
  }),
);

// ---------------------------------------------------------------------------
// Edge-case contacts (audit-remediation wave 2) — make documented-but-dormant
// UI branches reachable with seed data: inactive row + Restore in Admin
// (findings 51/420/151), the 'Unassigned' teacher placeholder (64), the
// converted-status display (62), and the retention-expired badge (61).
// Appended with fresh ids so existing ids and per-stage counts stay stable.
// ---------------------------------------------------------------------------
scenarioContacts.push(
  {
    // Soft-deleted: hidden from the default list; Admin (includeInactive)
    // renders it dimmed with an Inactive badge + Restore control.
    ...g3Contact('u-team-3', 17, {
      first: 'Demas', last: 'of Thessalonica', stage: F, sessions: 2, lastSessionDaysAgo: 90, partners: 1,
    }),
    status: ContactStatus.INACTIVE,
  },
  {
    // No teacher anywhere in the chain: the 'Unassigned' placeholder renders.
    ...g3Contact('u-group-5', 18, {
      first: 'Rhoda', last: 'of Jerusalem', stage: F, sessions: 0, partners: 1,
    }),
    assignedTeacherId: undefined,
    preachingPartnerIds: [null, null, null],
  },
  {
    // Converted, retention window still running: converted status surfaces.
    ...g3Contact('u-team-3', 19, {
      first: 'Apollos', last: 'of Alexandria', stage: B, sessions: 30, lastSessionDaysAgo: 20, partners: 2,
    }),
    status: ContactStatus.CONVERTED,
    convertedToUserId: 'u-mem-88',
    retainUntil: new Date(mockNowMs() + 180 * G3_DAY).toISOString(),
  },
  {
    // Converted with LAPSED retention: GET /contacts computes
    // retentionExpired=true on read → the retention-expired badge renders.
    ...g3Contact('u-group-5', 20, {
      first: 'Crispus', last: 'of Corinth', stage: B, sessions: 26, lastSessionDaysAgo: 60, partners: 2,
    }),
    status: ContactStatus.CONVERTED,
    convertedToUserId: 'u-mem-89',
    retainUntil: new Date(mockNowMs() - 10 * G3_DAY).toISOString(),
  },
);

// ---------------------------------------------------------------------------
// Bookings — Bible studies + admin meetings spread across all 5 branches
// (NO Sabbath service bookings — those live in scenarioBlockedSlots above.)
// ---------------------------------------------------------------------------

function weekStart(): Date {
  const d = mockNow();
  const day = d.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + offset);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isoAt(baseDay: Date, hour: number, min = 0): string {
  const d = new Date(baseDay);
  d.setHours(hour, min, 0, 0);
  return d.toISOString();
}

const WEEK_START = weekStart();
const dayOf = (offset: number) => {
  const d = new Date(WEEK_START);
  d.setDate(d.getDate() + offset);
  return d;
};

const bookings: Booking[] = [];
let bookingCounter = 0;
const occupied = new Set<string>(); // key = roomId|YYYY-M-D|HH:MM

function slotKeys(roomId: string, start: Date, end: Date): string[] {
  const keys: string[] = [];
  const dateStr = `${start.getFullYear()}-${start.getMonth()}-${start.getDate()}`;
  const startMin = start.getHours() * 60 + start.getMinutes();
  const endMin = end.getHours() * 60 + end.getMinutes();
  for (let m = startMin; m < endMin; m += 30) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    keys.push(`${roomId}|${dateStr}|${h.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`);
  }
  return keys;
}

function isFree(roomId: string, start: Date, end: Date): boolean {
  return slotKeys(roomId, start, end).every((k) => !occupied.has(k));
}

function markOccupied(roomId: string, start: Date, end: Date): void {
  slotKeys(roomId, start, end).forEach((k) => occupied.add(k));
}

/** True if [start,end) overlaps any blocked slot (global or for the booking's area). */
function overlapsBlockedSlot(areaId: string, start: Date, end: Date): boolean {
  const day = start.getDay();
  const startMin = start.getHours() * 60 + start.getMinutes();
  const endMin = end.getHours() * 60 + end.getMinutes();
  for (const slot of scenarioBlockedSlots) {
    if (slot.scope === 'area' && slot.areaId !== areaId) continue;
    if (slot.recurrence !== 'weekly') continue;
    if (slot.dayOfWeek !== day) continue;
    const [sh, sm] = (slot.startTime ?? '0:0').split(':').map(Number);
    const [eh, em] = (slot.endTime ?? '0:0').split(':').map(Number);
    const blockStart = sh * 60 + sm;
    const blockEnd = eh * 60 + em;
    if (startMin < blockEnd && endMin > blockStart) return true;
  }
  return false;
}

interface BookingSpec {
  areaId: string;
  roomId: string;
  type: BookingType;
  activity: Activity;
  title: string;
  description?: string;
  subject?: string;
  startTime: string;
  endTime: string;
  createdBy: string;
  teacherId?: string;
  contactId?: string;
  participants: string[];
}

function tryAddBooking(spec: BookingSpec): Booking | null {
  const start = new Date(spec.startTime);
  const end = new Date(spec.endTime);
  if (overlapsBlockedSlot(spec.areaId, start, end)) return null;
  if (!isFree(spec.roomId, start, end)) return null;
  markOccupied(spec.roomId, start, end);
  // 2026-07 overhaul (Decision 9): past bookings seed as Completed (with a
  // sprinkle of No Show / Rescheduled for realism), future ones as scheduled
  // ('bible_study'). Metrics derive ONLY from Completed — seed and runtime
  // agree by construction.
  let status: BookingStatus = BookingStatus.BIBLE_STUDY;
  if (end.getTime() < mockNowMs()) {
    const r = rand();
    status =
      r < 0.08 ? BookingStatus.NO_SHOW
      : r < 0.14 ? BookingStatus.RESCHEDULED
      : BookingStatus.COMPLETED;
  }
  const booking: Booking = {
    id: `b-${++bookingCounter}`,
    createdAt: today(),
    updatedAt: today(),
    status,
    ...spec,
  } as Booking;
  bookings.push(booking);
  return booking;
}

function findFreeTime(
  areaId: string,
  roomId: string,
  day: Date,
  durationSlots: number,
  startHour = 8,
  endHour = 22,
): { start: Date; end: Date } | null {
  for (let h = startHour; h < endHour; h++) {
    for (const m of [0, 30]) {
      const start = new Date(day);
      start.setHours(h, m, 0, 0);
      const end = new Date(start.getTime() + durationSlots * 30 * 60000);
      if (end.getHours() >= endHour && !(end.getHours() === endHour && end.getMinutes() === 0)) continue;
      if (overlapsBlockedSlot(areaId, start, end)) continue;
      if (isFree(roomId, start, end)) return { start, end };
    }
  }
  return null;
}

// ============================================================================
// Per-branch admin meetings (committee, team meetings)
// ============================================================================

// One Branch Committee meeting in each church's primary admin room
branchLeaders.forEach((leader, i) => {
  const areaId = BRANCH_LEADER_SEEDS[i].areaId;
  const adminRoom = areaId === 'area-newport-news' ? 'rm-nn-conf' : 'rm-vb-conf';
  // Day rotates so meetings don't all collide on one day
  tryAddBooking({
    areaId, roomId: adminRoom,
    type: BookingType.TEAM_ACTIVITIES, activity: Activity.COMMITTEE_MEETING,
    title: `${leader.firstName} ${leader.lastName} — Branch Committee`,
    startTime: isoAt(dayOf(i), 10),
    endTime: isoAt(dayOf(i), 11, 30),
    createdBy: leader.id,
    participants: [leader.id, uOverseer.id],
  });
});

// One Function Meeting at the main church on Monday evening
tryAddBooking({
  areaId: 'area-newport-news', roomId: 'rm-nn-conf',
  type: BookingType.TEAM_ACTIVITIES, activity: Activity.FUNCTION_MEETING,
  title: 'Monthly Function Meeting',
  startTime: isoAt(dayOf(0), 19),
  endTime: isoAt(dayOf(0), 20, 30),
  createdBy: uOverseer.id,
  participants: [uOverseer.id, ...branchLeaders.map((b) => b.id), ...groupLeaders.map((g) => g.id)],
});

// Special video sessions in Newport News Sanctuary. (Seeding into the
// non-bookable Sanctuary via tryAddBooking is intentional existing behavior —
// isBookable only filters the wizard's picker, not seeded history.)
tryAddBooking({
  areaId: 'area-newport-news', roomId: 'rm-nn-sanct',
  type: BookingType.GROUP_ACTIVITIES, activity: Activity.SPECIAL_VIDEO,
  title: 'Special Video: Heavenly Wedding Banquet',
  startTime: isoAt(dayOf(2), 19),
  endTime: isoAt(dayOf(2), 20),
  createdBy: uOverseer.id,
  participants: [uOverseer.id],
});
tryAddBooking({
  areaId: 'area-newport-news', roomId: 'rm-nn-sanct',
  type: BookingType.GROUP_ACTIVITIES, activity: Activity.SPECIAL_VIDEO,
  title: 'Special Video: Prophecy of Daniel',
  startTime: isoAt(dayOf(3), 11),
  endTime: isoAt(dayOf(3), 12, 30),
  // branchLeaders[1] now resolves to Simon Peter (VB) — deliberate creator
  // change from the pre-consolidation seed (was the ex-Chesapeake BL).
  createdBy: branchLeaders[1].id,
  participants: [],
});

// Outreach planning — one per church, in each church's public partner space.
tryAddBooking({
  areaId: 'area-newport-news', roomId: 'rm-nn-bn',
  type: BookingType.GROUP_ACTIVITIES, activity: Activity.COMMITTEE_MISSION,
  title: 'Peninsula Outreach Planning',
  startTime: isoAt(dayOf(2), 14),
  endTime: isoAt(dayOf(2), 15, 30),
  createdBy: branchLeaders[0].id,
  participants: [branchLeaders[0].id],
});
tryAddBooking({
  areaId: 'area-virginia-beach', roomId: 'rm-vb-odu-lib',
  type: BookingType.GROUP_ACTIVITIES, activity: Activity.COMMITTEE_MISSION,
  title: 'Southside Outreach Planning',
  startTime: isoAt(dayOf(2), 14),
  endTime: isoAt(dayOf(2), 15, 30),
  createdBy: branchLeaders[1].id,
  participants: [branchLeaders[1].id],
});

// New Teachers Training in Newport News TRE Room — run by Zechariah, the
// ex-Chesapeake Branch Leader (now a VB Team Leader; deliberate narrative:
// the most experienced freed leader trains the new teachers).
tryAddBooking({
  areaId: 'area-newport-news', roomId: 'rm-nn-tre',
  type: BookingType.TEAM_ACTIVITIES, activity: Activity.TEAM_MEETING,
  title: 'New Teachers Training',
  startTime: isoAt(dayOf(3), 13),
  endTime: isoAt(dayOf(3), 15),
  createdBy: formerBlTeamLeaders[0].id,
  participants: [],
});

// ============================================================================
// Team meetings (15 teams, weeknight evenings, in their branch's rooms)
// ============================================================================
teamLeaders.forEach((leader, i) => {
  // Find which branch this team belongs to (via group → branch)
  const group = groupLeaders.find((g) => g.id === leader.parentId);
  const branch = group ? branchLeaders.find((b) => b.id === group.parentId) : branchLeaders[0];
  if (!branch) return;
  const areaId = areaIdForBranch(branch);
  // Try this team's branch's rooms first (any non-Sanctuary room)
  const branchRooms = scenarioAreas
    .find((a) => a.id === areaId)!
    .rooms.filter((r) => !r.name.toLowerCase().includes('sanctuary'))
    .map((r) => r.id);
  const preferredDay = dayOf(i % 5);
  for (const room of branchRooms) {
    const slot = findFreeTime(areaId, room, preferredDay, 2, 17, 22);
    if (slot) {
      tryAddBooking({
        areaId, roomId: room,
        type: BookingType.TEAM_ACTIVITIES, activity: Activity.TEAM_MEETING,
        title: `${leader.firstName}'s Team Meeting`,
        startTime: slot.start.toISOString(),
        endTime: slot.end.toISOString(),
        createdBy: leader.id,
        teacherId: leader.id,
        participants: [
          leader.id,
          ...members.filter((m) => m.parentId === leader.id).slice(0, 3).map((m) => m.id),
        ],
      });
      break;
    }
  }
});

// ============================================================================
// Group meetings (10 groups)
// ============================================================================
groupLeaders.forEach((leader, i) => {
  const branch = branchLeaders.find((b) => b.id === leader.parentId);
  if (!branch) return;
  const areaId = areaIdForBranch(branch);
  const branchRooms = scenarioAreas
    .find((a) => a.id === areaId)!
    .rooms.filter((r) => !r.name.toLowerCase().includes('sanctuary'))
    .map((r) => r.id);
  const preferredDay = dayOf(i % 5);
  for (const room of branchRooms) {
    const slot = findFreeTime(areaId, room, preferredDay, 3, 17, 22);
    if (slot) {
      tryAddBooking({
        areaId, roomId: room,
        type: BookingType.GROUP_ACTIVITIES, activity: Activity.GROUP_MEETING,
        title: `${leader.firstName}'s Group Meeting`,
        startTime: slot.start.toISOString(),
        endTime: slot.end.toISOString(),
        createdBy: leader.id,
        teacherId: leader.id,
        participants: [leader.id],
      });
      break;
    }
  }
});

// ============================================================================
// Bible studies for currently-studying contacts
// ============================================================================
const studyingContacts = scenarioContacts.filter((c) => c.currentlyStudying);
studyingContacts.forEach((contact, i) => {
  const teacher = scenarioUsers.find((u) => u.id === contact.assignedTeacherId)!;
  const branch = branchForMember(teacher);
  const areaId = areaIdForBranch(branch);
  const sessionsThisWeek = 1 + (i % 2);
  const isZoom = i % 4 === 0;

  // Pick rooms named like "Study Room" or similar — any non-Sanctuary room
  const studyRooms = scenarioAreas
    .find((a) => a.id === areaId)!
    .rooms.filter(
      (r) =>
        r.name.toLowerCase().includes('study') ||
        r.name.toLowerCase().includes('library') ||
        r.name.toLowerCase().includes('living') ||
        r.name.toLowerCase().includes('barnes') ||
        r.name.toLowerCase().includes('web') ||
        r.name.toLowerCase().includes('center'),
    )
    .map((r) => r.id);
  if (studyRooms.length === 0) return;  // shouldn't happen — early-out forEach iteration

  for (let s = 0; s < sessionsThisWeek; s++) {
    let placed = false;
    // Spread studies across ALL 7 days of the current week (Mon=0 … Sun=6) so
    // whatever day "today" is, the calendar isn't empty on open. (Meetings stay
    // on weekdays; studies legitimately happen any day. `tryAddBooking` still
    // skips blocked Sabbath slots + room double-books, so nothing breaks.)
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const day = dayOf((i + s * 3 + dayOffset) % 7);
      for (const room of studyRooms) {
        const slot = findFreeTime(areaId, room, day, 2, 9, 18);
        if (slot) {
          const added = tryAddBooking({
            areaId, roomId: room,
            type: isZoom ? BookingType.UNBAPTIZED_ZOOM : BookingType.UNBAPTIZED_CONTACT,
            activity: Activity.BIBLE_STUDY,
            subject: contact.currentSubject,
            title: `Study: ${contact.firstName} ${contact.lastName} — ${contact.currentSubject}`,
            description: `Step ${contact.currentStep}`,
            startTime: slot.start.toISOString(),
            endTime: slot.end.toISOString(),
            createdBy: teacher.id,
            teacherId: teacher.id,
            contactId: contact.id,
            participants: [teacher.id],
          });
          // Status-gated metrics (Decision 9): only a COMPLETED session
          // counts toward the contact's totals — future/scheduled ones don't.
          if (added && added.status === BookingStatus.COMPLETED) {
            contact.totalSessions += 1;
            contact.lastSessionDate = slot.start.toISOString();
          }
          placed = true;
          break;
        }
      }
      if (placed) break;
    }
  }
});

// Mark a few bookings as cancelled for demo purposes
const cancelReasons = [
  'Schedule conflict with branch committee',
  'Contact rescheduled to next week',
  'Room unavailable due to maintenance',
];
// Only cancel still-scheduled (future) bookings — cancelling a seeded
// Completed one would leave a phantom +1 on its contact's totals.
const cancellable = bookings
  .map((b, idx) => ({ b, idx }))
  .filter(({ b }) => b.status === BookingStatus.BIBLE_STUDY);
for (let i = 0; i < Math.min(3, cancellable.length); i++) {
  const { idx } = cancellable[(5 + i * 8) % cancellable.length];
  bookings[idx] = {
    ...bookings[idx],
    status: BookingStatus.CANCELLED,
    cancelledAt: new Date(mockNowMs() - (3 - i) * 86400000).toISOString(),
    cancelReason: cancelReasons[i],
    cancelledBy: uMichael.id,
  } as Booking;
}

// Edge case (finding 303): a booking whose contact id no longer resolves —
// realistic residue of a hard-deleted contact from an older era. Booking
// cards must fall back to the stored title. Slotted at 06:00 yesterday,
// before the 08:00 seed window, so it can never collide with a seeded room.
{
  const template = bookings.find((b) => b.status === BookingStatus.COMPLETED);
  if (template) {
    // Monday 06:00 of the CURRENT week (inside the pinned Mon–Sun booking
    // window, before the 08:00 seed grid so no room collision); status
    // follows the seed's own past→Completed rule.
    const start = weekStart();
    start.setHours(6, 0, 0, 0);
    const end = new Date(start.getTime() + 30 * 60000);
    bookings.push({
      ...template,
      id: `b-${++bookingCounter}`,
      title: 'Bible Study: Titus with a former contact — Foundations',
      contactId: 'c-legacy-removed',
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      status: end.getTime() < mockNowMs() ? BookingStatus.COMPLETED : BookingStatus.BIBLE_STUDY,
    } as Booking);
  }
}

export const scenarioBookings: Booking[] = bookings;

// ---------------------------------------------------------------------------
// Teacher metrics — per-user counts derived from the contacts the user owns
// ---------------------------------------------------------------------------
const metricUsers = [
  ...members,
  ...branchLeaders, ...groupLeaders, ...teamLeaders,
];
export const scenarioTeacherMetrics: TeacherMetrics[] = metricUsers.map((u) => {
  const myContacts = scenarioContacts.filter((c) => c.assignedTeacherId === u.id);
  const studying = myContacts.filter((c) => c.currentlyStudying).length;
  const baptized = myContacts.filter((c) => c.pipelineStage === PipelineStage.BAPTIZED).length;
  return {
    userId: u.id,
    totalStudents: myContacts.length,
    activeStudents: myContacts.length,
    currentlyStudying: studying,
    continuedStudying: myContacts.filter((c) => c.totalSessions > 1).length,
    baptizedSinceStudying: baptized,
    totalSessionsLed: myContacts.reduce((s, c) => s + c.totalSessions, 0),
  };
});

// NOTE: the org tree is no longer a static snapshot. It is built LIVE from the
// current user records by buildOrgTree (src/lib/utils/org-tree.ts), which the
// /groups/tree handler calls against usersState — so role changes, reassignments
// and relocations restructure it immediately. The old static scenarioOrgTree +
// its per-level node builders were removed (audit #8/#13) to keep one source of
// truth and prevent silent divergence.

// ---------------------------------------------------------------------------
// Audit log — ~120 entries across the past 30 days
// ---------------------------------------------------------------------------
function generateAuditLog(): AuditLogEntry[] {
  const entries: AuditLogEntry[] = [];
  let id = 1;
  const now = mockNowMs();
  const DAY = 86400000;

  const actors = [
    { id: uMichael.id, name: 'Michael' },
    { id: uStephen.id, name: 'Stephen Wright' },
    { id: uOverseer.id, name: `${uOverseer.firstName} ${uOverseer.lastName}`.trim() },
    ...branchLeaders.map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`.trim() })),
    ...groupLeaders.map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`.trim() })),
    ...teamLeaders.slice(0, 6).map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`.trim() })),
    // Ex-Branch-Leaders stay active in the audit trail post-consolidation.
    ...formerBlTeamLeaders.map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`.trim() })),
  ];

  const actions: AuditLogEntry['action'][] = ['create', 'update', 'delete', 'export'];
  const entityTypes: AuditLogEntry['entityType'][] = ['booking', 'contact', 'user', 'group', 'report'];

  const detailTemplates: Record<string, string[]> = {
    'create-booking': [
      'Created Bible Study booking for {area}',
      'Created Group Meeting booking',
      'Created Team Activity booking',
      'Created Branch Committee meeting',
    ],
    'update-booking': [
      'Rescheduled booking to a later time slot',
      'Changed booking room',
      'Updated booking participants list',
      'Extended booking duration by 30 minutes',
    ],
    'delete-booking': [
      // Deletes must not READ as cancellations: the Cancellations report card
      // counts action='cancel' only, and a delete row saying "Cancelled…"
      // looked like a miscount (finding 516).
      'Deleted booking (schedule conflict)',
      'Removed duplicate booking entry',
    ],
    'create-contact': [
      'Created new contact: {name}',
      'Added new Bible study contact',
      'Registered walk-in visitor as contact',
    ],
    'update-contact': [
      'Updated status to Unbaptized',
      'Updated status to Potential',
      'Updated status to Baptism Ready',
      'Updated status to Baptized',
      'Changed preaching partners',
      'Added study subjects',
      'Updated phone number',
      'Moved contact to a different group',
    ],
    'delete-contact': [
      'Removed inactive contact',
      'Deleted duplicate contact record',
    ],
    'create-user': [
      'Created new member account',
      'Added new team leader',
    ],
    'update-user': [
      'Promoted member to Team Leader',
      'Updated user profile information',
      'Changed user role assignment',
      'Transferred user to different branch',
    ],
    'update-group': [
      'Reorganized team assignments',
      'Updated group name',
      'Merged two teams under new leader',
    ],
    'export-report': [
      'Exported weekly activity report',
      'Exported monthly contacts summary',
      'Exported booking utilization report',
      'Exported branch performance data',
      'Exported audit log as CSV',
    ],
  };

  const contactNames = scenarioContacts.slice(0, 20).map((c) => `${c.firstName} ${c.lastName}`);
  const areaNames = scenarioAreas.map((a) => a.name);

  for (let dayOffset = 0; dayOffset < 30; dayOffset++) {
    const entriesForDay = dayOffset < 7 ? 4 + Math.floor(rand() * 4) : 1 + Math.floor(rand() * 3);
    for (let j = 0; j < entriesForDay; j++) {
      const actor = actors[Math.floor(rand() * actors.length)];
      const action = actions[Math.floor(rand() * (dayOffset < 7 ? 4 : 3))];
      const entityType = action === 'export'
        ? 'report'
        : entityTypes[Math.floor(rand() * 4)];

      const key = `${action}-${entityType}`;
      const templates = detailTemplates[key] || [`${action} ${entityType} record`];
      let detail = templates[Math.floor(rand() * templates.length)];
      detail = detail
        .replace('{area}', areaNames[Math.floor(rand() * areaNames.length)])
        .replace('{name}', contactNames[Math.floor(rand() * contactNames.length)]);

      const hour = 8 + Math.floor(rand() * 12);
      const minute = Math.floor(rand() * 60);
      const ts = new Date(now - dayOffset * DAY);
      ts.setHours(hour, minute, 0, 0);

      entries.push({
        id: `al-${id++}`,
        action,
        entityType,
        entityId: `${entityType.charAt(0)}-${Math.floor(rand() * 100)}`,
        userId: actor.id,
        userName: actor.name,
        details: detail,
        timestamp: ts.toISOString(),
        // Seed entityIds are synthetic (not tied to a real user/contact), so
        // the acting user is the only real relevant party for the Alerts feed.
        relatedUserIds: [actor.id],
      });
    }
  }

  // --- Consolidation history (2026-07 Phase 1) ---------------------------
  // The ONLY place the dead branch names may appear: the audit log records
  // the merge story (grep-gate allowlist; see the header comment).
  const gabriel = { id: uOverseer.id, name: `${uOverseer.firstName} ${uOverseer.lastName}`.trim() };
  const consolidation: { dayOffset: number; entityType: AuditLogEntry['entityType']; details: string }[] = [
    { dayOffset: 28, entityType: 'group', details: 'Merged Chesapeake Zion into Virginia Beach Zion' },
    { dayOffset: 28, entityType: 'group', details: 'Merged Norfolk Zion into Virginia Beach Zion' },
    { dayOffset: 27, entityType: 'group', details: 'Merged Williamsburg Zion into Newport News Zion' },
    { dayOffset: 26, entityType: 'user', details: 'Reassigned Zechariah (former Chesapeake Branch Leader) to Team Leader, Virginia Beach' },
    { dayOffset: 26, entityType: 'user', details: 'Reassigned John the Baptist (former Norfolk Branch Leader) to Team Leader, Virginia Beach' },
    { dayOffset: 25, entityType: 'group', details: 'Opened Virginia Beach Study Room 3' },
  ];
  for (const c of consolidation) {
    const ts = new Date(now - c.dayOffset * DAY);
    ts.setHours(9, 30, 0, 0);
    entries.push({
      id: `al-${id++}`,
      action: 'update',
      entityType: c.entityType,
      entityId: c.entityType === 'group' ? 'area-consolidation' : 'user-reassignment',
      userId: gabriel.id,
      userName: gabriel.name,
      details: c.details,
      timestamp: ts.toISOString(),
      relatedUserIds: [gabriel.id],
    });
  }

  entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return entries;
}

export const scenarioAuditLog: AuditLogEntry[] = generateAuditLog();
