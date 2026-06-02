import { http, HttpResponse } from 'msw';
import {
  mockUsers,
  mockAreas,
  mockBookings,
  mockContacts,
  mockOrgTree,
  mockTeacherMetrics,
  mockAuditLog,
} from './data';

// Must match the client's API base (src/lib/api/client.ts) so handlers register
// on the same URLs the app calls. Relative '/api' default — never localhost,
// which is the device itself on a real phone.
const API = process.env.NEXT_PUBLIC_API_URL || '/api';

/**
 * Mutable in-memory copies so PUT/DELETE/POST actually mutate and subsequent
 * GETs reflect the change. This keeps everything client-side and ephemeral —
 * a refresh resets everything back to the scenario.
 *
 * Call `resetMockState()` from auth-store.logout() so a second demo-user
 * session starts with a clean slate instead of carrying over the previous
 * user's mutations (audit L-6).
 */
const contactsState = [...mockContacts];
const bookingsState = [...mockBookings];
const initialAuditLogLength = mockAuditLog.length;

export function resetMockState() {
  contactsState.splice(0, contactsState.length, ...mockContacts);
  bookingsState.splice(0, bookingsState.length, ...mockBookings);
  // Trim any audit log entries that accumulated during this session.
  if (mockAuditLog.length > initialAuditLogLength) {
    mockAuditLog.splice(initialAuditLogLength);
  }
}

export const handlers = [
  // Auth
  http.post(`${API}/login`, async ({ request }) => {
    const body = (await request.json()) as Record<string, string>;
    const user = mockUsers.find((u) => u.username === body.username);
    if (!user || body.password !== 'admin') return HttpResponse.json({ message: 'Invalid credentials' }, { status: 401 });
    return HttpResponse.json({ token: 'mock-jwt-token-' + user.id, user });
  }),

  http.get(`${API}/me`, () => {
    return HttpResponse.json(mockUsers[0]);
  }),

  // Areas & Rooms
  http.get(`${API}/areas`, () => {
    return HttpResponse.json(mockAreas);
  }),

  // Bookings
  http.get(`${API}/bookings`, ({ request }) => {
    const url = new URL(request.url);
    const areaId = url.searchParams.get('areaId');
    let filtered = bookingsState;
    if (areaId) filtered = filtered.filter((b) => b.areaId === areaId);
    return HttpResponse.json(filtered);
  }),

  http.get(`${API}/bookings/:id`, ({ params }) => {
    const booking = bookingsState.find((b) => b.id === params.id);
    if (!booking) return HttpResponse.json({ message: 'Not found' }, { status: 404 });
    return HttpResponse.json(booking);
  }),

  http.post(`${API}/bookings`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const newBooking = {
      id: 'b' + Date.now(),
      ...body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as typeof bookingsState[number];
    bookingsState.push(newBooking);
    return HttpResponse.json(newBooking, { status: 201 });
  }),

  http.put(`${API}/bookings/:id`, async ({ request, params }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const idx = bookingsState.findIndex((b) => b.id === params.id);
    if (idx === -1) return HttpResponse.json({ message: 'Not found' }, { status: 404 });
    const updated = { ...bookingsState[idx], ...body, updatedAt: new Date().toISOString() };
    bookingsState[idx] = updated as typeof bookingsState[number];
    // M-6 follow-up: when the BookingWizard supplies an editReason,
    // persist an audit log entry so the Reports page reflects it.
    const reason =
      typeof body.editReason === 'string' ? body.editReason.trim() : '';
    if (reason) {
      mockAuditLog.push({
        id: 'al-' + Date.now(),
        action: 'update',
        entityType: 'booking',
        entityId: updated.id,
        userId: 'u-michael',
        userName: 'Michael',
        details: `Edited booking: ${reason}`,
        timestamp: new Date().toISOString(),
      });
    }
    return HttpResponse.json(updated);
  }),

  http.delete(`${API}/bookings/:id`, ({ params }) => {
    const idx = bookingsState.findIndex((b) => b.id === params.id);
    if (idx !== -1) bookingsState.splice(idx, 1);
    return HttpResponse.json({ success: true });
  }),

  // Cancel a booking (soft-delete with reason tracking + audit log)
  http.post(`${API}/bookings/:id/cancel`, async ({ request, params }) => {
    const body = (await request.json()) as { reason?: string };
    const idx = bookingsState.findIndex((b) => b.id === params.id);
    if (idx === -1) return HttpResponse.json({ message: 'Not found' }, { status: 404 });
    const booking = bookingsState[idx];
    const updated = {
      ...booking,
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
      cancelReason: (body.reason || '').trim(),
      cancelledBy: 'u-michael',
      updatedAt: new Date().toISOString(),
    };
    bookingsState[idx] = updated as typeof bookingsState[number];
    mockAuditLog.push({
      id: 'al-' + Date.now(),
      action: 'cancel',
      entityType: 'booking',
      entityId: updated.id,
      userId: 'u-michael',
      userName: 'Michael',
      details: `Cancelled booking "${booking.title}": ${body.reason || 'No reason'}`,
      timestamp: new Date().toISOString(),
    });
    return HttpResponse.json(updated);
  }),

  // Restore a cancelled booking
  http.post(`${API}/bookings/:id/restore`, ({ params }) => {
    const idx = bookingsState.findIndex((b) => b.id === params.id);
    if (idx === -1) return HttpResponse.json({ message: 'Not found' }, { status: 404 });
    const booking = bookingsState[idx];
    const updated = {
      ...booking,
      status: 'active',
      cancelledAt: undefined,
      cancelReason: undefined,
      cancelledBy: undefined,
      updatedAt: new Date().toISOString(),
    };
    bookingsState[idx] = updated as typeof bookingsState[number];
    mockAuditLog.push({
      id: 'al-' + Date.now(),
      action: 'update',
      entityType: 'booking',
      entityId: updated.id,
      userId: 'u-michael',
      userName: 'Michael',
      details: `Restored cancelled booking "${booking.title}"`,
      timestamp: new Date().toISOString(),
    });
    return HttpResponse.json(updated);
  }),

  // Contacts — supports search, type, stage, sort
  http.get(`${API}/contacts`, ({ request }) => {
    const url = new URL(request.url);
    const search = url.searchParams.get('search')?.toLowerCase();
    const type = url.searchParams.get('type');
    const stage = url.searchParams.get('stage');
    const sort = url.searchParams.get('sort') || 'name';
    const sortDir = url.searchParams.get('sortDir') || 'asc';

    let filtered = [...contactsState];
    if (search) filtered = filtered.filter((c) =>
      `${c.firstName} ${c.lastName} ${c.email || ''} ${c.phone || ''} ${c.groupName || ''}`.toLowerCase().includes(search),
    );
    if (type && type !== 'all') filtered = filtered.filter((c) => c.type === type);
    if (stage && stage !== 'all') filtered = filtered.filter((c) => c.pipelineStage === stage);

    // Sort
    const dir = sortDir === 'desc' ? -1 : 1;
    const stageOrder: Record<string, number> = {
      first_study: 0, regular_study: 1, progressing: 2, baptism_ready: 3, baptized: 4,
    };
    filtered.sort((a, b) => {
      switch (sort) {
        case 'sessions': return (a.totalSessions - b.totalSessions) * dir;
        case 'stage': return ((stageOrder[a.pipelineStage] || 0) - (stageOrder[b.pipelineStage] || 0)) * dir;
        case 'updated': return (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * dir;
        default: return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`) * dir;
      }
    });

    return HttpResponse.json(filtered);
  }),

  http.post(`${API}/contacts`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const newContact = {
      id: 'c' + Date.now(),
      ...body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as typeof contactsState[number];
    contactsState.push(newContact);
    return HttpResponse.json(newContact, { status: 201 });
  }),

  http.put(`${API}/contacts/:id`, async ({ request, params }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const idx = contactsState.findIndex((c) => c.id === params.id);
    if (idx === -1) return HttpResponse.json({ message: 'Not found' }, { status: 404 });
    const updated = { ...contactsState[idx], ...body, updatedAt: new Date().toISOString() };
    contactsState[idx] = updated as typeof contactsState[number];
    return HttpResponse.json(updated);
  }),

  http.delete(`${API}/contacts/:id`, ({ params }) => {
    const idx = contactsState.findIndex((c) => c.id === params.id);
    if (idx !== -1) contactsState.splice(idx, 1);
    return HttpResponse.json({ success: true });
  }),

  // Groups / Org
  http.get(`${API}/groups/tree`, () => {
    return HttpResponse.json(mockOrgTree);
  }),

  http.get(`${API}/metrics/teachers`, () => {
    return HttpResponse.json(mockTeacherMetrics);
  }),

  // Audit — supports filtering, search, and pagination
  http.get(`${API}/audit-log`, ({ request }) => {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    const entityType = url.searchParams.get('entityType');
    const userId = url.searchParams.get('userId');
    const search = url.searchParams.get('search')?.toLowerCase();
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '25', 10);

    let filtered = [...mockAuditLog];
    if (action) filtered = filtered.filter((e) => e.action === action);
    if (entityType) filtered = filtered.filter((e) => e.entityType === entityType);
    if (userId) filtered = filtered.filter((e) => e.userId === userId);
    if (search) {
      filtered = filtered.filter(
        (e) =>
          e.details.toLowerCase().includes(search) ||
          e.userName.toLowerCase().includes(search) ||
          e.action.includes(search) ||
          e.entityType.includes(search) ||
          e.entityId.toLowerCase().includes(search),
      );
    }
    if (startDate) {
      const s = new Date(startDate).getTime();
      filtered = filtered.filter((e) => new Date(e.timestamp).getTime() >= s);
    }
    if (endDate) {
      const en = new Date(endDate).getTime();
      filtered = filtered.filter((e) => new Date(e.timestamp).getTime() <= en);
    }

    const total = filtered.length;
    const start = (page - 1) * limit;
    const entries = filtered.slice(start, start + limit);

    return HttpResponse.json({ entries, total, page, limit });
  }),

  // Users
  http.get(`${API}/users`, () => {
    return HttpResponse.json(mockUsers);
  }),
];
