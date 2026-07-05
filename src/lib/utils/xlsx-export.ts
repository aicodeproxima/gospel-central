/**
 * Multi-sheet .xlsx report export builder (pure — no DOM, no fetching).
 *
 * The caller (reports page orchestrator) fetches bookings/contacts/users/areas/
 * audit entries and passes plain arrays in; this module builds a styled exceljs
 * Workbook from them and, separately, can trigger a browser download of it.
 *
 * exceljs is dynamically imported so it stays out of the main bundle — this is
 * a click-time export, not something every page load needs.
 */
import type { Booking, Contact, User, AuditLogEntry, Area } from '@/lib/types';
import { BOOKING_STATUS_CONFIG } from '@/lib/types/booking';
import { ROLE_LABELS } from '@/lib/types/user';

export interface WorkbookData {
  bookings: Booking[];
  contacts: Contact[];
  users: User[];
  /** For resolving area/room names + a Groups sheet context. */
  areas: Area[];
  auditEntries: AuditLogEntry[];
}

/** Header row styling shared by every sheet: bold font + light-grey fill. */
const HEADER_FILL: import('exceljs').Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE5E7EB' },
};

/** Freeze the header row (row 1) on a worksheet. */
const FROZEN_HEADER_VIEWS: import('exceljs').WorksheetViewFrozen[] = [{ state: 'frozen', ySplit: 1 }];

function styleHeaderRow(row: import('exceljs').Row): void {
  row.font = { bold: true };
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
  });
}

/** ISO-8601 string for a date-ish input; '' when absent/invalid. */
function toIso(value: string | undefined | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString();
}

function userName(user: User | undefined): string {
  if (!user) return '';
  return `${user.firstName} ${user.lastName}`.trim();
}

/** Resolve an Area + Room name pair for a booking's roomId/areaId. */
function resolveAreaRoom(areas: Area[], areaId: string, roomId: string): { areaName: string; roomName: string } {
  const area = areas.find((a) => a.id === areaId);
  const room = area?.rooms.find((r) => r.id === roomId);
  return { areaName: area?.name ?? '', roomName: room?.name ?? '' };
}

/**
 * Build the styled workbook and return it. Pure — no DOM, safe to call from
 * a test or a server context. Never throws on empty input arrays.
 */
export async function buildReportWorkbook(data: WorkbookData): Promise<import('exceljs').Workbook> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();

  const usersById = new Map<string, User>(data.users.map((u) => [u.id, u]));
  const contactsById = new Map<string, Contact>(data.contacts.map((c) => [c.id, c]));

  // ---------------------------------------------------------------------
  // Sheet 1: Bookings
  // ---------------------------------------------------------------------
  const bookingsSheet = workbook.addWorksheet('Bookings', { views: FROZEN_HEADER_VIEWS });
  bookingsSheet.columns = [
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Start', key: 'start', width: 22 },
    { header: 'End', key: 'end', width: 22 },
    { header: 'Area', key: 'area', width: 20 },
    { header: 'Room', key: 'room', width: 20 },
    { header: 'Status', key: 'status', width: 20 },
    { header: 'Teacher', key: 'teacher', width: 22 },
    { header: 'Contact', key: 'contact', width: 22 },
    { header: 'Type', key: 'type', width: 24 },
  ];
  for (const booking of data.bookings) {
    const { areaName, roomName } = resolveAreaRoom(data.areas, booking.areaId, booking.roomId);
    const teacher = booking.teacherId ? usersById.get(booking.teacherId) : undefined;
    const contact = booking.contactId ? contactsById.get(booking.contactId) : undefined;
    const statusLabel = booking.status ? BOOKING_STATUS_CONFIG[booking.status].label : '';
    bookingsSheet.addRow({
      date: toIso(booking.startTime).slice(0, 10),
      start: toIso(booking.startTime),
      end: toIso(booking.endTime),
      area: areaName,
      room: roomName,
      status: statusLabel,
      teacher: userName(teacher),
      contact: contact ? `${contact.firstName} ${contact.lastName}`.trim() : '',
      type: booking.type ?? '',
    });
  }
  styleHeaderRow(bookingsSheet.getRow(1));

  // ---------------------------------------------------------------------
  // Sheet 2: Contacts (+ curriculum progress)
  // ---------------------------------------------------------------------
  const contactsSheet = workbook.addWorksheet('Contacts', { views: FROZEN_HEADER_VIEWS });
  contactsSheet.columns = [
    { header: 'Name', key: 'name', width: 24 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Pipeline Stage', key: 'pipelineStage', width: 16 },
    { header: 'Type', key: 'type', width: 24 },
    { header: 'Church', key: 'groupName', width: 18 },
    { header: 'Assigned Teacher', key: 'assignedTeacher', width: 22 },
    { header: 'Current Step', key: 'currentStep', width: 14 },
    { header: 'Current Subject', key: 'currentSubject', width: 22 },
    { header: 'Total Sessions', key: 'totalSessions', width: 14 },
    { header: 'Subjects Studied', key: 'subjectsStudiedCount', width: 16 },
    { header: 'Preaching Partners', key: 'preachingPartners', width: 30 },
  ];
  for (const contact of data.contacts) {
    const assignedTeacher = contact.assignedTeacherId ? usersById.get(contact.assignedTeacherId) : undefined;
    const partnerNames = (contact.preachingPartnerIds ?? [])
      .filter((id): id is string => Boolean(id))
      .map((id) => userName(usersById.get(id)))
      .filter(Boolean)
      .join(', ');
    contactsSheet.addRow({
      name: `${contact.firstName} ${contact.lastName}`.trim(),
      status: contact.status ?? '',
      pipelineStage: contact.pipelineStage ?? '',
      type: contact.type ?? '',
      groupName: contact.groupName ?? '',
      assignedTeacher: userName(assignedTeacher),
      currentStep: contact.currentStep ?? '',
      currentSubject: contact.currentSubject ?? '',
      totalSessions: contact.totalSessions ?? 0,
      subjectsStudiedCount: contact.subjectsStudied?.length ?? 0,
      preachingPartners: partnerNames,
    });
  }
  styleHeaderRow(contactsSheet.getRow(1));

  // ---------------------------------------------------------------------
  // Sheet 3: Users & Groups
  // ---------------------------------------------------------------------
  const usersSheet = workbook.addWorksheet('Users & Groups', { views: FROZEN_HEADER_VIEWS });
  usersSheet.columns = [
    { header: 'Name', key: 'name', width: 24 },
    { header: 'Username', key: 'username', width: 18 },
    { header: 'Role', key: 'role', width: 16 },
    { header: 'Parent', key: 'parent', width: 22 },
    { header: 'Location', key: 'location', width: 20 },
    { header: 'Active', key: 'isActive', width: 10 },
  ];
  for (const user of data.users) {
    const parent = user.parentId ? usersById.get(user.parentId) : undefined;
    const location = user.locationId ? data.areas.find((a) => a.id === user.locationId) : undefined;
    usersSheet.addRow({
      name: userName(user),
      username: user.username ?? '',
      role: ROLE_LABELS[user.role],
      parent: userName(parent),
      location: location?.name ?? '',
      isActive: user.isActive ?? true,
    });
  }
  styleHeaderRow(usersSheet.getRow(1));

  // ---------------------------------------------------------------------
  // Sheet 4: Audit Log
  // ---------------------------------------------------------------------
  const auditSheet = workbook.addWorksheet('Audit Log', { views: FROZEN_HEADER_VIEWS });
  auditSheet.columns = [
    { header: 'Timestamp', key: 'timestamp', width: 24 },
    { header: 'Action', key: 'action', width: 16 },
    { header: 'Entity Type', key: 'entityType', width: 16 },
    { header: 'Entity ID', key: 'entityId', width: 22 },
    { header: 'User', key: 'userName', width: 22 },
    { header: 'Details', key: 'details', width: 40 },
    { header: 'Before', key: 'before', width: 30 },
    { header: 'After', key: 'after', width: 30 },
    { header: 'Related User IDs', key: 'relatedUserIds', width: 30 },
  ];
  for (const entry of data.auditEntries) {
    auditSheet.addRow({
      timestamp: toIso(entry.timestamp),
      action: entry.action ?? '',
      entityType: entry.entityType ?? '',
      entityId: entry.entityId ?? '',
      userName: entry.userName ?? '',
      details: entry.details ?? '',
      before: entry.before !== undefined ? JSON.stringify(entry.before) : '',
      after: entry.after !== undefined ? JSON.stringify(entry.after) : '',
      relatedUserIds: (entry.relatedUserIds ?? []).join(', '),
    });
  }
  styleHeaderRow(auditSheet.getRow(1));

  return workbook;
}

/**
 * Build the workbook and trigger a browser download. Not unit-tested (DOM-only
 * path) — buildReportWorkbook carries all the logic under test.
 */
export async function exportReportWorkbook(data: WorkbookData, filename = 'gospel-central-report.xlsx'): Promise<void> {
  const workbook = await buildReportWorkbook(data);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    URL.revokeObjectURL(url);
  }
}
