import { api } from './client';
import type { Area, BlockedSlot, Booking, BookingFormData } from '../types';

export const bookingsApi = {
  getAreas() {
    return api.get<Area[]>('/areas');
  },
  getBookings(params: { start: string; end: string; areaId?: string; roomId?: string }) {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return api.get<Booking[]>(`/bookings?${qs}`);
  },
  getBooking(id: string) {
    return api.get<Booking>(`/bookings/${id}`);
  },
  createBooking(data: BookingFormData) {
    return api.post<Booking>('/bookings', data);
  },
  updateBooking(id: string, data: Partial<BookingFormData>) {
    return api.put<Booking>(`/bookings/${id}`, data);
  },
  deleteBooking(id: string) {
    return api.delete<void>(`/bookings/${id}`);
  },
  cancelBooking(id: string, reason: string) {
    return api.post<Booking>(`/bookings/${id}/cancel`, { reason });
  },
  restoreBooking(id: string) {
    return api.post<Booking>(`/bookings/${id}/restore`);
  },
  /**
   * 2026-07 overhaul (Decision 11): set a booking's outcome status
   * ('bible_study' | 'completed' | 'no_show' | 'rescheduled'). Cancelled is
   * excluded — use cancelBooking/restoreBooking for the cancel lifecycle.
   * Server gates via canSetBookingStatus (teacher | creator | leader-in-scope).
   */
  setBookingStatus(id: string, status: 'bible_study' | 'completed' | 'no_show' | 'rescheduled') {
    return api.patch<Booking>(`/bookings/${id}/status`, { status });
  },

  // Areas (a.k.a. branches' physical locations) — admin CRUD.
  /**
   * Returns active areas with active rooms by default. Pass
   * `includeInactive: true` to receive everything (used by RoomsTab).
   */
  getAreasFull(opts: { includeInactive?: boolean } = {}) {
    const qs = opts.includeInactive ? '?includeInactive=1' : '';
    return api.get<Area[]>(`/areas${qs}`);
  },
  createArea(data: { name: string; description?: string }) {
    return api.post<Area>('/areas', data);
  },
  updateArea(id: string, data: { name?: string; description?: string; isActive?: boolean }) {
    return api.put<Area>(`/areas/${id}`, data);
  },
  deactivateArea(id: string) {
    return api.post<Area>(`/areas/${id}/deactivate`);
  },
  restoreArea(id: string) {
    return api.post<Area>(`/areas/${id}/restore`);
  },

  // Rooms — admin CRUD inside an area.
  createRoom(
    areaId: string,
    data: { name: string; capacity?: number; features?: string[] },
  ) {
    return api.post<{ id: string; areaId: string; name: string; capacity: number; features?: string[]; isActive?: boolean }>(
      `/areas/${areaId}/rooms`,
      data,
    );
  },
  updateRoom(
    id: string,
    data: { name?: string; capacity?: number; features?: string[]; isActive?: boolean },
  ) {
    return api.put<{ id: string; areaId: string; name: string; capacity: number; features?: string[]; isActive?: boolean }>(
      `/rooms/${id}`,
      data,
    );
  },
  deactivateRoom(id: string) {
    return api.post(`/rooms/${id}/deactivate`);
  },
  restoreRoom(id: string) {
    return api.post(`/rooms/${id}/restore`);
  },

  // Blocked slots — service times and admin-defined blackout windows.
  // Returns global slots + (when areaId is provided) that area's slots.
  getBlockedSlots(areaId?: string) {
    const qs = areaId ? `?areaId=${encodeURIComponent(areaId)}` : '';
    return api.get<BlockedSlot[]>(`/blocked-slots${qs}`);
  },
  createBlockedSlot(data: Omit<BlockedSlot, 'id' | 'createdAt'> & { actorId?: string }) {
    return api.post<BlockedSlot>('/blocked-slots', data);
  },
  updateBlockedSlot(id: string, data: Partial<BlockedSlot> & { actorId?: string }) {
    return api.put<BlockedSlot>(`/blocked-slots/${id}`, data);
  },
  // Soft-deletes the slot (is_active=false). Routes through `api` so the Supabase
  // router intercepts it in real-backend mode; the actor is derived from auth.uid()
  // server-side (the old actorId body was dead weight and is dropped).
  deleteBlockedSlot(id: string, _actorId?: string) {
    return api.delete<void>(`/blocked-slots/${id}`);
  },
};
