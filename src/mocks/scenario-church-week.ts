/**
 * ============================================================================
 * HYPOTHETICAL CHURCH WEEK — MOCK SCENARIO (v2: 5 branches, biblical names)
 * ============================================================================
 *
 * This file generates a complete mock dataset representing a hypothetical
 * active week across 5 collaborating Zion branches in the Hampton Roads
 * area of Virginia.
 *
 * All data is mock and lives in this file. To replace with real data when
 * the Go backend is live, set `NEXT_PUBLIC_MOCK_API=false` and MSW will
 * stop intercepting — this file becomes dead code.
 *
 * Scenario overview
 * -----------------
 *   Roles (no Teacher role; Teacher is a TAG):
 *     - 2 Devs:           Michael, Stephen Wright
 *     - 1 Overseer:       Gabriel
 *     - 5 Branch Leaders: one per branch (all male biblical names)
 *     - 10 Group Leaders: 2 per branch
 *     - 15 Team Leaders:  ~3 per branch
 *     - 99 Members:       distributed across teams
 *     ------
 *     132 users total — biblical names #1–132 from the prepared list
 *
 *   Branches (each is a physical church location with its own area):
 *     1. Newport News Zion  — main church, 8 rooms (BS1–4, Conference, Sanctuary, Fellowship, TRE)
 *     2. Chesapeake Zion    — 4 rooms (Chesapeake Study Rooms 1–3, Conference Room)
 *     3. Norfolk Zion       — 7 rooms (Norfolk Study 1–2, Living Room, ODU Library, ODU Web Center, HU Library, HU Student Center)
 *     4. Virginia Beach Zion — 3 rooms (Virginia Beach Study Rooms 1–2, Conference Room)
 *     5. Williamsburg Zion  — 2 rooms (Williamsburg Study Room 1, Barnes and Noble)
 *
 *   Tags (orthogonal to role; multiple per user allowed):
 *     - 'teacher'          — can lead Bible Study bookings
 *     - 'co_group_leader'  — supports the primary group leader
 *     - 'co_team_leader'   — supports the primary team leader
 *     All Branch / Group / Team leaders carry 'teacher' by default.
 *     One Co-Group Leader per group (10 total) and one Co-Team Leader per
 *     team (15 total) are picked from members and tagged.
 *     ~20 random Members are also tagged 'teacher'.
 *
 *   Contacts: 50 unbaptized contacts in various pipeline stages, distributed
 *   across all 5 branches. Biblical names #133–182.
 *
 *   Bookings: Bible studies + admin meetings spread across all 5 branches.
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
  OrgNode,
  TimelineEntry,
  User,
} from '@/lib/types';
import type { TeacherMetrics } from '@/lib/types/user';
import { pickAvatarForUser, isFemaleFirstName } from '@/lib/avatars';
import { STUDY_SUBJECTS } from './subjects';

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
// Areas / Rooms — 5 branches with a per-branch room layout
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
    ],
  },
  {
    id: 'area-chesapeake',
    name: 'Chesapeake Zion',
    description: 'Chesapeake branch.',
    rooms: [
      { id: 'rm-ch-sr1',  areaId: 'area-chesapeake', name: 'Chesapeake Study Room 1', capacity: 6, features: ['Whiteboard'] },
      { id: 'rm-ch-sr2',  areaId: 'area-chesapeake', name: 'Chesapeake Study Room 2', capacity: 6, features: ['Whiteboard'] },
      { id: 'rm-ch-sr3',  areaId: 'area-chesapeake', name: 'Chesapeake Study Room 3', capacity: 6, features: ['Whiteboard', 'Zoom Setup'] },
      { id: 'rm-ch-conf', areaId: 'area-chesapeake', name: 'Conference Room',         capacity: 16, features: ['Projector'] },
    ],
  },
  {
    id: 'area-norfolk',
    name: 'Norfolk Zion',
    description: 'Norfolk branch — uses several public spaces (ODU, HU) for outreach studies.',
    rooms: [
      { id: 'rm-nf-sr1',     areaId: 'area-norfolk', name: 'Norfolk Study Room 1',  capacity: 6, features: ['Whiteboard'] },
      { id: 'rm-nf-sr2',     areaId: 'area-norfolk', name: 'Norfolk Study Room 2',  capacity: 6, features: ['Whiteboard'] },
      { id: 'rm-nf-living',  areaId: 'area-norfolk', name: 'Living Room',           capacity: 8, features: ['Casual'] },
      { id: 'rm-nf-odu-lib', areaId: 'area-norfolk', name: 'ODU Library',           capacity: 6, features: ['Public Space'] },
      { id: 'rm-nf-odu-web', areaId: 'area-norfolk', name: 'ODU Web Center',        capacity: 6, features: ['Public Space', 'Wi-Fi'] },
      { id: 'rm-nf-hu-lib',  areaId: 'area-norfolk', name: 'HU Library',            capacity: 6, features: ['Public Space'] },
      { id: 'rm-nf-hu-stu',  areaId: 'area-norfolk', name: 'HU Student Center',     capacity: 8, features: ['Public Space'] },
    ],
  },
  {
    id: 'area-virginia-beach',
    name: 'Virginia Beach Zion',
    description: 'Virginia Beach branch.',
    rooms: [
      { id: 'rm-vb-sr1',  areaId: 'area-virginia-beach', name: 'Virginia Beach Study Room 1', capacity: 6, features: ['Whiteboard'] },
      { id: 'rm-vb-sr2',  areaId: 'area-virginia-beach', name: 'Virginia Beach Study Room 2', capacity: 6, features: ['Whiteboard'] },
      { id: 'rm-vb-conf', areaId: 'area-virginia-beach', name: 'Conference Room',             capacity: 16, features: ['Projector'] },
    ],
  },
  {
    id: 'area-williamsburg',
    name: 'Williamsburg Zion',
    description: 'Williamsburg branch — small footprint, partners with Barnes & Noble for outreach studies.',
    rooms: [
      { id: 'rm-wb-sr1', areaId: 'area-williamsburg', name: 'Williamsburg Study Room 1', capacity: 6, features: ['Whiteboard'] },
      { id: 'rm-wb-bn',  areaId: 'area-williamsburg', name: 'Barnes and Noble',          capacity: 6, features: ['Public Space'] },
    ],
  },
];

// ---------------------------------------------------------------------------
// Users — hierarchy under Gabriel (Overseer) → 5 Branch Leaders → ...
// ---------------------------------------------------------------------------

const today = () => new Date().toISOString();

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

// --- Branch Leaders (5) — male biblical names, mapped to the 5 branches ---
//   #4  Joseph              → Newport News Zion (main)
//   #6  Zechariah            → Chesapeake Zion
//   #7  John the Baptist     → Norfolk Zion
//   #8  Simeon               → Virginia Beach Zion
//   #10 Simon Peter          → Williamsburg Zion
const BRANCH_LEADER_SEEDS: { areaId: string; nameIdx: number }[] = [
  { areaId: 'area-newport-news',   nameIdx: 4 },
  { areaId: 'area-chesapeake',     nameIdx: 6 },
  { areaId: 'area-norfolk',        nameIdx: 7 },
  { areaId: 'area-virginia-beach', nameIdx: 8 },
  { areaId: 'area-williamsburg',   nameIdx: 10 },
];
const branchLeaders: User[] = BRANCH_LEADER_SEEDS.map((s, i) => {
  const n = nameAt(s.nameIdx);
  return makeUser({
    id: `u-branch-${i + 1}`,
    username: `branch${i + 1}`,
    firstName: n.first,
    lastName: n.last,
    role: UserRole.BRANCH_LEADER,
    parentId: uOverseer.id,
    tags: [KNOWN_TAGS.TEACHER],
  });
});

/** Helper — branch leader for a given areaId. */
function branchLeaderFor(areaId: string): User {
  const idx = BRANCH_LEADER_SEEDS.findIndex((s) => s.areaId === areaId);
  return branchLeaders[idx];
}

// --- Group Leaders (10) — names #5, #9, #11–18 ---
// 2 groups per branch
const GROUP_LEADER_NAME_INDICES = [5, 9, 11, 12, 13, 14, 15, 16, 17, 18];
const groupLeaders: User[] = GROUP_LEADER_NAME_INDICES.map((nameIdx, i) => {
  const branchIdx = Math.floor(i / 2); // 2 groups per branch
  const parent = branchLeaders[branchIdx];
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

// --- Team Leaders (15) — names #19–33. 3 teams per branch (uneven) ---
// Distribute 15 teams across 10 groups: each group gets 1 team, then
// the first 5 groups get a second team. So: groups 0-4 → 2 teams each
// (10), groups 5-9 → 1 team each (5). Total 15.
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
const teamLeaders: User[] = TEAM_LEADER_NAME_INDICES.map((nameIdx, i) => {
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

// ---------------------------------------------------------------------------
// Contacts — 50 contacts assigned to members across all 5 branches
// ---------------------------------------------------------------------------
const teacherPool = [
  ...branchLeaders, ...groupLeaders, ...teamLeaders,
  ...members.filter((m) => (m.tags ?? []).includes(KNOWN_TAGS.TEACHER)),
];

function historicalBaseline(stage: PipelineStage): number {
  switch (stage) {
    case PipelineStage.FIRST_STUDY:    return 1 + Math.floor(rand() * 3);
    case PipelineStage.REGULAR_STUDY:  return 5 + Math.floor(rand() * 8);
    case PipelineStage.PROGRESSING:    return 15 + Math.floor(rand() * 11);
    case PipelineStage.BAPTISM_READY:  return 25 + Math.floor(rand() * 11);
    case PipelineStage.BAPTIZED:       return 30 + Math.floor(rand() * 21);
    default:                           return 0;
  }
}

function subjectForStage(stage: PipelineStage, seed: number) {
  const stepForStage: Record<PipelineStage, number[]> = {
    [PipelineStage.FIRST_STUDY]:   [1],
    [PipelineStage.REGULAR_STUDY]: [1, 2],
    [PipelineStage.PROGRESSING]:   [2, 3],
    [PipelineStage.BAPTISM_READY]: [4, 5],
    [PipelineStage.BAPTIZED]:      [5],
  };
  const validSteps = stepForStage[stage];
  const pool = STUDY_SUBJECTS.filter((s) => validSteps.includes(s.step));
  return pool[seed % pool.length];
}

function subjectsStudiedForStage(stage: PipelineStage, seed: number): string[] {
  const all = STUDY_SUBJECTS;
  const byStep = (step: number) => all.filter((s) => s.step === step).map((s) => s.title);
  switch (stage) {
    case PipelineStage.FIRST_STUDY:
      return byStep(1).slice(0, 1 + (seed % 3));
    case PipelineStage.REGULAR_STUDY:
      return [...byStep(1), ...byStep(2).slice(0, 2 + (seed % 4))];
    case PipelineStage.PROGRESSING:
      return [...byStep(1), ...byStep(2), ...byStep(3).slice(0, 3 + (seed % 5))];
    case PipelineStage.BAPTISM_READY:
      return [...byStep(1), ...byStep(2), ...byStep(3), ...byStep(4), ...byStep(5).slice(0, 2 + (seed % 4))];
    case PipelineStage.BAPTIZED:
      return all.map((s) => s.title);
    default:
      return [];
  }
}

function stageForIndex(i: number): PipelineStage {
  if (i < 4)  return PipelineStage.BAPTIZED;
  if (i < 10) return PipelineStage.BAPTISM_READY;
  if (i < 22) return PipelineStage.PROGRESSING;
  if (i < 40) return PipelineStage.REGULAR_STUDY;
  return PipelineStage.FIRST_STUDY;
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
  const createdDate = new Date('2024-06-01');
  const memberName = `${member.firstName} ${member.lastName}`.trim();

  timeline.push({
    date: createdDate.toISOString(),
    action: 'created',
    details: `Contact created by ${memberName}`,
    userId: member.id,
    userName: memberName,
  });

  const stageOrder: PipelineStage[] = [
    PipelineStage.FIRST_STUDY,
    PipelineStage.REGULAR_STUDY,
    PipelineStage.PROGRESSING,
    PipelineStage.BAPTISM_READY,
    PipelineStage.BAPTIZED,
  ];
  const stageIdx = stageOrder.indexOf(stage);
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

  const sessions = historicalBaseline(stage);
  const sessionSpread = Math.min(sessions, 8);
  for (let s = 0; s < sessionSpread; s++) {
    const sessionDate = new Date(Date.now() - (sessionSpread - s) * 7 * DAY + Math.floor(rand() * 3 * DAY));
    timeline.push({
      date: sessionDate.toISOString(),
      action: 'session',
      details: `Bible study session conducted`,
      userId: member.id,
      userName: partnerName,
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
    lastSessionDate: new Date(Date.now() - Math.floor(rand() * 10) * DAY).toISOString(),
    currentlyStudying: isStudying,
    currentStep: isStudying ? subject.step : undefined,
    currentSubject: isStudying ? subject.title : undefined,
    subjectsStudied: subjectsStudiedForStage(stage, i),
    notes: isBaptized
      ? `Baptized after completing the curriculum. ${fullContactName} is now an active member of ${branch.firstName} ${branch.lastName}'s branch.`
      : `Currently on Step ${subject.step} — ${subject.title}`,
    timeline,
    createdBy: member.id,
    createdAt: '2024-06-01T00:00:00Z',
    updatedAt: today(),
  };
});

// ---------------------------------------------------------------------------
// Bookings — Bible studies + admin meetings spread across all 5 branches
// (NO Sabbath service bookings — those live in scenarioBlockedSlots above.)
// ---------------------------------------------------------------------------

function weekStart(): Date {
  const d = new Date();
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

function tryAddBooking(spec: BookingSpec): boolean {
  const start = new Date(spec.startTime);
  const end = new Date(spec.endTime);
  if (overlapsBlockedSlot(spec.areaId, start, end)) return false;
  if (!isFree(spec.roomId, start, end)) return false;
  markOccupied(spec.roomId, start, end);
  bookings.push({
    id: `b-${++bookingCounter}`,
    createdAt: today(),
    updatedAt: today(),
    ...spec,
  });
  return true;
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

// One Branch Committee meeting in each branch's primary admin room
branchLeaders.forEach((leader, i) => {
  const areaId = BRANCH_LEADER_SEEDS[i].areaId;
  const adminRoom = areaId === 'area-newport-news'   ? 'rm-nn-conf'
                  : areaId === 'area-chesapeake'     ? 'rm-ch-conf'
                  : areaId === 'area-norfolk'        ? 'rm-nf-living'
                  : areaId === 'area-virginia-beach' ? 'rm-vb-conf'
                  : 'rm-wb-sr1';
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

// Special video sessions in Newport News Sanctuary
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
  createdBy: branchLeaders[1].id,
  participants: [],
});

// Outreach planning at Williamsburg Barnes & Noble
tryAddBooking({
  areaId: 'area-williamsburg', roomId: 'rm-wb-bn',
  type: BookingType.GROUP_ACTIVITIES, activity: Activity.COMMITTEE_MISSION,
  title: 'Williamsburg Outreach Planning',
  startTime: isoAt(dayOf(2), 14),
  endTime: isoAt(dayOf(2), 15, 30),
  createdBy: branchLeaders[4].id,
  participants: [branchLeaders[4].id],
});

// New Teachers Training in Newport News TRE Room
tryAddBooking({
  areaId: 'area-newport-news', roomId: 'rm-nn-tre',
  type: BookingType.TEAM_ACTIVITIES, activity: Activity.TEAM_MEETING,
  title: 'New Teachers Training',
  startTime: isoAt(dayOf(3), 13),
  endTime: isoAt(dayOf(3), 15),
  createdBy: branchLeaders[2].id,
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
    for (let dayOffset = 0; dayOffset < 6; dayOffset++) {
      const day = dayOf((i + s * 3 + dayOffset) % 6);
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
          if (added) {
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
for (let i = 0; i < Math.min(3, bookings.length); i++) {
  const idx = 5 + i * 8;
  if (bookings[idx]) {
    bookings[idx] = {
      ...bookings[idx],
      status: BookingStatus.CANCELLED,
      cancelledAt: new Date(Date.now() - (3 - i) * 86400000).toISOString(),
      cancelReason: cancelReasons[i],
      cancelledBy: uMichael.id,
    } as Booking;
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

// ---------------------------------------------------------------------------
// Org tree — nested, with rolled-up metrics per level
// ---------------------------------------------------------------------------
function rollupMetrics(userIds: string[]) {
  const rows = scenarioTeacherMetrics.filter((m) => userIds.includes(m.userId));
  return rows.reduce(
    (acc, r) => ({
      totalStudents: acc.totalStudents + r.totalStudents,
      activeStudents: acc.activeStudents + r.activeStudents,
      currentlyStudying: acc.currentlyStudying + r.currentlyStudying,
      continuedStudying: acc.continuedStudying + r.continuedStudying,
      baptizedSinceStudying: acc.baptizedSinceStudying + r.baptizedSinceStudying,
    }),
    { totalStudents: 0, activeStudents: 0, currentlyStudying: 0, continuedStudying: 0, baptizedSinceStudying: 0 },
  );
}

function memberNode(member: User): OrgNode {
  return {
    id: member.id,
    name: `${member.firstName} ${member.lastName}`.trim(),
    role: member.role,
    avatarUrl: member.avatarUrl,
    metrics: rollupMetrics([member.id]),
    children: [],
  };
}

function teamNode(team: User): OrgNode {
  const teamMembers = members.filter((m) => m.parentId === team.id);
  const memberIds = teamMembers.map((m) => m.id);
  return {
    id: team.id,
    name: `${team.firstName} ${team.lastName}`.trim(),
    role: team.role,
    avatarUrl: team.avatarUrl,
    groupName: `Team ${team.username.replace('team', '')}`,
    metrics: rollupMetrics([team.id, ...memberIds]),
    children: teamMembers.map(memberNode),
  };
}

function groupNode(group: User): OrgNode {
  const myTeams = teamLeaders.filter((t) => t.parentId === group.id);
  const teamIds = myTeams.map((t) => t.id);
  const memberIds = members.filter((m) => teamIds.includes(m.parentId!)).map((m) => m.id);
  return {
    id: group.id,
    name: `${group.firstName} ${group.lastName}`.trim(),
    role: group.role,
    avatarUrl: group.avatarUrl,
    groupName: `Group ${group.username.replace('group', '')}`,
    metrics: rollupMetrics([group.id, ...teamIds, ...memberIds]),
    children: myTeams.map(teamNode),
  };
}

function branchNodeFor(branch: User): OrgNode {
  const myGroups = groupLeaders.filter((g) => g.parentId === branch.id);
  const groupIds = myGroups.map((g) => g.id);
  const teamIds = teamLeaders.filter((t) => groupIds.includes(t.parentId!)).map((t) => t.id);
  const memberIds = members.filter((m) => teamIds.includes(m.parentId!)).map((m) => m.id);
  const areaId = areaIdForBranch(branch);
  const branchAreaName = scenarioAreas.find((a) => a.id === areaId)?.name ?? 'Branch';
  return {
    id: branch.id,
    name: `${branch.firstName} ${branch.lastName}`.trim(),
    role: branch.role,
    avatarUrl: branch.avatarUrl,
    groupName: branchAreaName,
    metrics: rollupMetrics([...groupIds, ...teamIds, ...memberIds]),
    children: myGroups.map(groupNode),
  };
}

const overseerMetrics = rollupMetrics([
  ...branchLeaders.map((b) => b.id),
  ...groupLeaders.map((g) => g.id),
  ...teamLeaders.map((t) => t.id),
  ...members.map((m) => m.id),
]);

export const scenarioOrgTree: OrgNode[] = [
  {
    id: uMichael.id,
    name: 'Michael',
    role: uMichael.role,
    avatarUrl: uMichael.avatarUrl,
    children: [
      {
        id: uOverseer.id,
        name: `${uOverseer.firstName} ${uOverseer.lastName}`.trim(),
        role: uOverseer.role,
        avatarUrl: uOverseer.avatarUrl,
        metrics: overseerMetrics,
        children: branchLeaders.map(branchNodeFor),
      },
    ],
  },
  {
    id: uStephen.id,
    name: 'Stephen Wright',
    role: uStephen.role,
    avatarUrl: uStephen.avatarUrl,
    children: [],
  },
];

// ---------------------------------------------------------------------------
// Audit log — ~120 entries across the past 30 days
// ---------------------------------------------------------------------------
function generateAuditLog(): AuditLogEntry[] {
  const entries: AuditLogEntry[] = [];
  let id = 1;
  const now = Date.now();
  const DAY = 86400000;

  const actors = [
    { id: uMichael.id, name: 'Michael' },
    { id: uStephen.id, name: 'Stephen Wright' },
    { id: uOverseer.id, name: `${uOverseer.firstName} ${uOverseer.lastName}`.trim() },
    ...branchLeaders.map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`.trim() })),
    ...groupLeaders.map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`.trim() })),
    ...teamLeaders.slice(0, 6).map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`.trim() })),
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
      'Cancelled booking due to schedule conflict',
      'Removed duplicate booking entry',
    ],
    'create-contact': [
      'Created new contact: {name}',
      'Added new Bible study contact',
      'Registered walk-in visitor as contact',
    ],
    'update-contact': [
      'Updated pipeline stage to Regular Study',
      'Updated pipeline stage to Progressing',
      'Updated pipeline stage to Baptism Ready',
      'Updated pipeline stage to Baptized',
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
      });
    }
  }

  entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return entries;
}

export const scenarioAuditLog: AuditLogEntry[] = generateAuditLog();
