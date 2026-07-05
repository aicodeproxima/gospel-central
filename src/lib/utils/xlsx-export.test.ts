import { describe, it, expect } from 'vitest';
import { buildReportWorkbook, type WorkbookData } from './xlsx-export';
import { BookingStatus, BookingType, type Booking, type Area } from '@/lib/types/booking';
import { ContactStatus, PipelineStage, type Contact } from '@/lib/types/contact';
import { UserRole, type User } from '@/lib/types/user';
import type { AuditLogEntry } from '@/lib/types/group';

// ---------------------------------------------------------------------------
// Fixtures — minimal but fully typed (no `as any`).
// ---------------------------------------------------------------------------

const areas: Area[] = [
  {
    id: 'area1',
    name: 'Newport News Zion',
    rooms: [
      { id: 'room1', areaId: 'area1', name: 'Room A', capacity: 4 },
      { id: 'room2', areaId: 'area1', name: 'Room B', capacity: 4 },
    ],
  },
  {
    id: 'area2',
    name: 'Virginia Beach Zion',
    rooms: [{ id: 'room3', areaId: 'area2', name: 'Room C', capacity: 6 }],
  },
];

const users: User[] = [
  {
    id: 'user1',
    username: 'stephen',
    firstName: 'Stephen',
    lastName: 'Phillips',
    email: 'stephen@example.com',
    role: UserRole.BRANCH_LEADER,
    tags: [],
    locationId: 'area1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'user2',
    username: 'michael',
    firstName: 'Michael',
    lastName: 'Cardoza',
    email: 'michael@example.com',
    role: UserRole.TEAM_LEADER,
    tags: ['teacher'],
    parentId: 'user1',
    locationId: 'area1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'user3',
    username: 'overseer1',
    firstName: 'John',
    lastName: 'Overseer',
    email: 'overseer1@example.com',
    role: UserRole.OVERSEER,
    tags: [],
    isActive: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const contacts: Contact[] = [
  {
    id: 'contact1',
    firstName: 'Mary',
    lastName: 'Jones',
    groupName: 'Zion',
    type: BookingType.UNBAPTIZED_CONTACT,
    status: ContactStatus.ACTIVE,
    pipelineStage: PipelineStage.FIRST_STUDY,
    assignedTeacherId: 'user2',
    preachingPartnerIds: ['user1', 'user2', null],
    totalSessions: 3,
    currentStep: 2,
    currentSubject: 'Salvation',
    subjectsStudied: ['Salvation', 'Baptism'],
    createdBy: 'user1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'contact2',
    firstName: 'Peter',
    lastName: 'Smith',
    type: BookingType.BAPTIZED_IN_PERSON,
    status: ContactStatus.CONVERTED,
    pipelineStage: PipelineStage.BAPTIZED,
    totalSessions: 10,
    createdBy: 'user1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const bookings: Booking[] = [
  {
    id: 'booking1',
    roomId: 'room1',
    areaId: 'area1',
    type: BookingType.UNBAPTIZED_CONTACT,
    title: 'Bible Study with Mary',
    startTime: '2026-07-01T20:00:00.000Z',
    endTime: '2026-07-01T21:00:00.000Z',
    createdBy: 'user1',
    teacherId: 'user2',
    contactId: 'contact1',
    participants: [],
    status: BookingStatus.COMPLETED,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  },
  {
    id: 'booking2',
    roomId: 'room3',
    areaId: 'area2',
    type: BookingType.GROUP_ACTIVITIES,
    title: 'Group Activity',
    startTime: '2026-07-02T18:00:00.000Z',
    endTime: '2026-07-02T19:30:00.000Z',
    createdBy: 'user1',
    participants: [],
    status: BookingStatus.BIBLE_STUDY,
    createdAt: '2026-07-02T00:00:00.000Z',
    updatedAt: '2026-07-02T00:00:00.000Z',
  },
];

const auditEntries: AuditLogEntry[] = [
  {
    id: 'audit1',
    action: 'create',
    entityType: 'booking',
    entityId: 'booking1',
    userId: 'user1',
    userName: 'Stephen Phillips',
    details: 'Created booking',
    before: undefined,
    after: { status: 'bible_study' },
    relatedUserIds: ['user1', 'user2'],
    timestamp: '2026-07-01T00:00:00.000Z',
  },
  {
    id: 'audit2',
    action: 'update',
    entityType: 'contact',
    entityId: 'contact1',
    userId: 'user2',
    userName: 'Michael Cardoza',
    details: 'Updated pipeline stage',
    timestamp: '2026-07-02T00:00:00.000Z',
  },
];

const fixtures: WorkbookData = { bookings, contacts, users, areas, auditEntries };

// ---------------------------------------------------------------------------

describe('buildReportWorkbook', () => {
  it('creates exactly the 4 expected worksheets, in order, by exact name', async () => {
    const workbook = await buildReportWorkbook(fixtures);
    const names = workbook.worksheets.map((ws) => ws.name);
    expect(names).toEqual(['Bookings', 'Contacts', 'Users & Groups', 'Audit Log']);
  });

  it('Bookings sheet has fixtures.length + 1 rows (header + data)', async () => {
    const workbook = await buildReportWorkbook(fixtures);
    const sheet = workbook.getWorksheet('Bookings')!;
    expect(sheet.rowCount).toBe(bookings.length + 1);
  });

  it('Contacts sheet has fixtures.length + 1 rows', async () => {
    const workbook = await buildReportWorkbook(fixtures);
    const sheet = workbook.getWorksheet('Contacts')!;
    expect(sheet.rowCount).toBe(contacts.length + 1);
  });

  it('Users & Groups sheet has fixtures.length + 1 rows', async () => {
    const workbook = await buildReportWorkbook(fixtures);
    const sheet = workbook.getWorksheet('Users & Groups')!;
    expect(sheet.rowCount).toBe(users.length + 1);
  });

  it('Audit Log sheet has fixtures.length + 1 rows', async () => {
    const workbook = await buildReportWorkbook(fixtures);
    const sheet = workbook.getWorksheet('Audit Log')!;
    expect(sheet.rowCount).toBe(auditEntries.length + 1);
  });

  it('every sheet header row is bold', async () => {
    const workbook = await buildReportWorkbook(fixtures);
    for (const name of ['Bookings', 'Contacts', 'Users & Groups', 'Audit Log']) {
      const sheet = workbook.getWorksheet(name)!;
      const headerRow = sheet.getRow(1);
      expect(headerRow.font?.bold).toBe(true);
    }
  });

  it('empty arrays produce sheets with just the header row and never throw', async () => {
    const empty: WorkbookData = { bookings: [], contacts: [], users: [], areas: [], auditEntries: [] };
    const workbook = await buildReportWorkbook(empty);
    for (const name of ['Bookings', 'Contacts', 'Users & Groups', 'Audit Log']) {
      const sheet = workbook.getWorksheet(name)!;
      expect(sheet.rowCount).toBe(1);
    }
  });

  it('resolves a booking teacher id to the teacher name (not the raw id)', async () => {
    const workbook = await buildReportWorkbook(fixtures);
    const sheet = workbook.getWorksheet('Bookings')!;
    // Column order: Date, Start, End, Area, Room, Status, Teacher, Contact, Type
    const teacherCell = sheet.getRow(2).getCell(7).value;
    expect(teacherCell).toBe('Michael Cardoza');
    expect(teacherCell).not.toBe('user2');
  });

  it('resolves a booking area + room name', async () => {
    const workbook = await buildReportWorkbook(fixtures);
    const sheet = workbook.getWorksheet('Bookings')!;
    const row = sheet.getRow(2);
    expect(row.getCell(4).value).toBe('Newport News Zion');
    expect(row.getCell(5).value).toBe('Room A');
  });

  it('resolves a booking status to its BOOKING_STATUS_CONFIG label', async () => {
    const workbook = await buildReportWorkbook(fixtures);
    const sheet = workbook.getWorksheet('Bookings')!;
    expect(sheet.getRow(2).getCell(6).value).toBe('Completed Bible Study');
  });

  it('writes an ISO-8601 timestamp on the booking Start cell', async () => {
    const workbook = await buildReportWorkbook(fixtures);
    const sheet = workbook.getWorksheet('Bookings')!;
    const startCell = sheet.getRow(2).getCell(2).value;
    expect(startCell).toBe('2026-07-01T20:00:00.000Z');
    expect(new Date(startCell as string).toISOString()).toBe(startCell);
  });

  it('resolves a contact assigned teacher name and preaching partner names', async () => {
    const workbook = await buildReportWorkbook(fixtures);
    const sheet = workbook.getWorksheet('Contacts')!;
    const row = sheet.getRow(2); // contact1 = Mary Jones
    // Columns: Name, Status, PipelineStage, Type, Church, AssignedTeacher, CurrentStep, CurrentSubject, TotalSessions, SubjectsStudiedCount, PreachingPartners
    expect(row.getCell(1).value).toBe('Mary Jones');
    expect(row.getCell(6).value).toBe('Michael Cardoza');
    expect(row.getCell(10).value).toBe(2); // subjectsStudied.length
    expect(row.getCell(11).value).toBe('Stephen Phillips, Michael Cardoza');
  });

  it('resolves a user parent name and role label in Users & Groups', async () => {
    const workbook = await buildReportWorkbook(fixtures);
    const sheet = workbook.getWorksheet('Users & Groups')!;
    const row = sheet.getRow(3); // user2 = Michael Cardoza
    // Columns: Name, Username, Role, Parent, Location, Active
    expect(row.getCell(1).value).toBe('Michael Cardoza');
    expect(row.getCell(3).value).toBe('Team Leader');
    expect(row.getCell(4).value).toBe('Stephen Phillips');
    expect(row.getCell(5).value).toBe('Newport News Zion');
  });

  it('writes ISO timestamp + JSON before/after + joined relatedUserIds in Audit Log', async () => {
    const workbook = await buildReportWorkbook(fixtures);
    const sheet = workbook.getWorksheet('Audit Log')!;
    const row = sheet.getRow(2); // audit1
    // Columns: Timestamp, Action, EntityType, EntityId, User, Details, Before, After, RelatedUserIds
    expect(row.getCell(1).value).toBe('2026-07-01T00:00:00.000Z');
    expect(row.getCell(7).value).toBe('');
    expect(row.getCell(8).value).toBe('{"status":"bible_study"}');
    expect(row.getCell(9).value).toBe('user1, user2');
  });

  it('worksheets have a frozen header row view', async () => {
    const workbook = await buildReportWorkbook(fixtures);
    for (const name of ['Bookings', 'Contacts', 'Users & Groups', 'Audit Log']) {
      const sheet = workbook.getWorksheet(name)!;
      expect(sheet.views).toEqual([{ state: 'frozen', ySplit: 1 }]);
    }
  });
});
