import { create } from 'zustand';
import type { Booking } from '../types';
import { now as mockNow } from '../../mocks/mock-clock';

type CalendarView = 'day' | 'week' | 'month';

interface BookingState {
  selectedDate: Date;
  view: CalendarView;
  selectedAreaId: string | null;
  selectedBooking: Booking | null;
  isBookingModalOpen: boolean;
  bookingSlot: { roomId: string; start: string; end: string } | null;

  setDate: (date: Date) => void;
  setView: (view: CalendarView) => void;
  setAreaId: (id: string) => void;
  openBookingModal: (slot?: { roomId: string; start: string; end: string }) => void;
  openEditModal: (booking: Booking) => void;
  closeBookingModal: () => void;
}

export const useBookingStore = create<BookingState>((set) => ({
  // mockNow() is the real clock in prod (no override) — identical behavior — but the
  // PINNED date under test (NEXT_PUBLIC_MOCK_DATE / window.__MOCK_DATE__), so the
  // calendar's default day aligns with the deterministic seed week instead of drifting
  // with the real clock (fixes the lifecycle-E2E real-clock dependency; was R3).
  selectedDate: mockNow(),
  view: 'day',
  selectedAreaId: null,
  selectedBooking: null,
  isBookingModalOpen: false,
  bookingSlot: null,

  setDate: (date) => set({ selectedDate: date }),
  setView: (view) => set({ view }),
  setAreaId: (id) => set({ selectedAreaId: id }),
  openBookingModal: (slot) => set({ isBookingModalOpen: true, bookingSlot: slot || null, selectedBooking: null }),
  openEditModal: (booking) => set({ isBookingModalOpen: true, selectedBooking: booking, bookingSlot: null }),
  closeBookingModal: () => set({ isBookingModalOpen: false, selectedBooking: null, bookingSlot: null }),
}));
