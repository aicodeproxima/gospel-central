'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { usePreferencesStore } from '@/lib/stores/preferences-store';
import { useTranslation } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { WeekView } from '@/components/calendar/WeekView';
import { DayView } from '@/components/calendar/DayView';
import { MonthView } from '@/components/calendar/MonthView';
import { AgendaView } from '@/components/calendar/AgendaView';
import { BookingSearchBar } from '@/components/calendar/BookingSearchBar';
import { BookingWizard } from '@/components/booking/BookingWizard';
import { ExportDropdown } from '@/components/shared/ExportDropdown';
import { useTopbarSlot } from '@/components/layout/TopbarSlot';
import { useBookingStore } from '@/lib/stores/booking-store';
import { useAuthStore } from '@/lib/stores/auth-store';
import { canExportImport } from '@/lib/utils/permissions';
import { bookingsApi } from '@/lib/api/bookings';
import { contactsApi } from '@/lib/api/contacts';
import { usersApi } from '@/lib/api/users';
import { Badge } from '@/components/ui/badge';
import { BOOKING_TYPE_CONFIG } from '@/lib/types';
import type { Area, BlockedSlot, Booking, BookingFormData, Contact, User } from '@/lib/types';
import { InfoButton } from '@/components/shared/InfoButton';
import { calendarHelp } from '@/components/shared/pageHelp';
import {
  format,
  addDays,
  addWeeks,
  addMonths,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfDay,
  endOfDay,
} from 'date-fns';

export default function CalendarPage() {
  const { tBookingType } = useTranslation();
  const viewer = useAuthStore((s) => s.user);
  const { selectedDate, view, selectedAreaId, setDate, setView, setAreaId, openBookingModal, openEditModal } = useBookingStore();
  const [areas, setAreas] = useState<Area[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  // BLOCK-1: fetch blocked slots so the wizard can grey out service times
  // and the backend's 409 contract is mirrored visually before submit.
  const [blockedSlots, setBlockedSlots] = useState<BlockedSlot[]>([]);
  const [loading, setLoading] = useState(true);

  // Apply preferred default view from settings on first mount
  const prefView = usePreferencesStore((s) => s.calendarDefaultView);
  useEffect(() => {
    setView(prefView);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load areas, users, contacts once
  useEffect(() => {
    bookingsApi
      .getAreas()
      .then((data) => {
        const safe = Array.isArray(data) ? data : [];
        setAreas(safe);
        if (safe.length > 0 && !selectedAreaId) setAreaId(safe[0].id);
        // Empty-state: nothing for the bookings effect to load — flip the
        // page out of "loading" so we render the empty CTA instead of an
        // infinite spinner. (Bug observed against an empty real backend.)
        if (safe.length === 0) setLoading(false);
      })
      .catch(() => {
        setAreas([]);
        setLoading(false);
      });
    usersApi.getAll().then((d) => setUsers(Array.isArray(d) ? d : [])).catch(() => {});
    contactsApi.getContacts().then((d) => setContacts(Array.isArray(d) ? d : [])).catch(() => {});
    bookingsApi
      .getBlockedSlots()
      .then((d) => setBlockedSlots(Array.isArray(d) ? d : []))
      .catch(() => setBlockedSlots([]));
  }, [selectedAreaId, setAreaId]);

  // Shared view-aware bookings reload — computes the SAME range the load effect
  // uses, so a post-mutation refetch (handleBookingSubmit) can't diverge from the
  // active view. (C4: the old submit-refetch hardcoded a WEEK window regardless of
  // view, hiding out-of-week creates in Day/Month against a range-honoring backend.)
  const reloadBookings = useCallback(async () => {
    if (!selectedAreaId) return;
    let start: Date, end: Date;
    if (view === 'day') { start = startOfDay(selectedDate); end = endOfDay(selectedDate); }
    else if (view === 'week') { start = startOfWeek(selectedDate, { weekStartsOn: 1 }); end = endOfWeek(selectedDate, { weekStartsOn: 1 }); }
    else { start = startOfMonth(selectedDate); end = endOfMonth(selectedDate); }
    try {
      const data = await bookingsApi.getBookings({ start: start.toISOString(), end: end.toISOString(), areaId: selectedAreaId });
      setBookings(Array.isArray(data) ? data : []);
    } catch {
      setBookings([]);
    }
  }, [selectedDate, view, selectedAreaId]);

  // Load bookings (shows the page spinner; the submit-path refetch skips it).
  useEffect(() => {
    if (!selectedAreaId) return;
    setLoading(true);
    reloadBookings().finally(() => setLoading(false));
  }, [reloadBookings, selectedAreaId]);

  const selectedArea = areas.find((a) => a.id === selectedAreaId);
  const rooms = selectedArea?.rooms || [];

  const navigate = useCallback((dir: 1 | -1) => {
    if (view === 'day') setDate(addDays(selectedDate, dir));
    else if (view === 'week') setDate(addWeeks(selectedDate, dir));
    else setDate(addMonths(selectedDate, dir));
  }, [view, selectedDate, setDate]);

  // Swipe-to-navigate: detect horizontal swipe gestures on the
  // calendar grid so users can swipe left/right to go forward/back.
  // `fromHScroller` is set at touch-start when the gesture begins inside an
  // element that can actually scroll horizontally (Day/Week grids on mobile).
  // In that case we let the native inner scroll win and DON'T navigate, so
  // dragging the week sideways scrolls the columns instead of jumping a week.
  const touchStartRef = useRef<{ x: number; y: number; t: number; fromHScroller: boolean } | null>(null);
  const swipeContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = swipeContainerRef.current;
    if (!el) return;

    const SWIPE_THRESHOLD = 60; // px minimum horizontal distance
    const MAX_VERTICAL = 80;    // px max vertical drift (ignore diagonal)
    const MAX_TIME = 500;       // ms max swipe duration

    // Does the gesture start inside a horizontally-scrollable, overflowing
    // element (between the touch target and the swipe container)? If so the
    // user is scrolling the grid, not navigating periods.
    const startedInHorizontalScroller = (target: EventTarget | null): boolean => {
      let node = target as HTMLElement | null;
      while (node && node !== el) {
        if (node.scrollWidth > node.clientWidth + 1) {
          const overflowX = getComputedStyle(node).overflowX;
          if (overflowX === 'auto' || overflowX === 'scroll') return true;
        }
        node = node.parentElement;
      }
      return false;
    };

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        t: Date.now(),
        fromHScroller: startedInHorizontalScroller(e.target),
      };
    };

    const onTouchEnd = (e: TouchEvent) => {
      const start = touchStartRef.current;
      if (!start) return;
      touchStartRef.current = null;

      // Gesture was scrolling an inner horizontal scroller — leave it alone.
      if (start.fromHScroller) return;

      const touch = e.changedTouches[0];
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      const dt = Date.now() - start.t;

      if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dy) < MAX_VERTICAL && dt < MAX_TIME) {
        navigate(dx < 0 ? 1 : -1);
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [navigate]);

  const handleSlotClick = (roomId: string, date: Date, time: string) => {
    const [h, m] = time.split(':').map(Number);
    const start = new Date(date);
    start.setHours(h, m, 0, 0);
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + 60);
    openBookingModal({
      roomId,
      start: format(start, "yyyy-MM-dd'T'HH:mm"),
      end: format(end, "yyyy-MM-dd'T'HH:mm"),
    });
  };

  const handleDayClick = (date: Date) => {
    setDate(date);
    setView('day');
  };

  const handleBookingSubmit = async (data: BookingFormData) => {
    const editing = useBookingStore.getState().selectedBooking;
    if (editing) {
      await bookingsApi.updateBooking(editing.id, data);
    } else {
      await bookingsApi.createBooking(data);
    }
    // View-aware refetch (C4) — no setLoading, so the grid doesn't flash a
    // spinner on submit; the Array.isArray guard lives inside reloadBookings.
    await reloadBookings();
    // STUDY-1: a study booking can auto-create a contact and/or update its
    // study fields server-side — refresh contacts so the wizard picker shows
    // the now-real contact (and dropped custom label) on next open.
    contactsApi
      .getContacts()
      .then((d) => setContacts(Array.isArray(d) ? d : []))
      .catch(() => {});
  };

  const handleBookingDelete = async (id: string) => {
    await bookingsApi.deleteBooking(id);
    setBookings((prev) => prev.filter((b) => b.id !== id));
  };

  const handleBookingCancel = async (id: string, reason: string) => {
    const updated = await bookingsApi.cancelBooking(id, reason);
    setBookings((prev) => prev.map((b) => (b.id === id ? updated : b)));
  };

  const handleBookingRestore = async (id: string) => {
    const updated = await bookingsApi.restoreBooking(id);
    setBookings((prev) => prev.map((b) => (b.id === id ? updated : b)));
  };

  const dateLabel = useMemo(() => {
    if (view === 'day') return format(selectedDate, 'EEEE, MMMM d, yyyy');
    if (view === 'week') {
      const ws = startOfWeek(selectedDate, { weekStartsOn: 1 });
      const we = endOfWeek(selectedDate, { weekStartsOn: 1 });
      return `${format(ws, 'MMM d')} - ${format(we, 'MMM d, yyyy')}`;
    }
    return format(selectedDate, 'MMMM yyyy');
  }, [selectedDate, view]);

  // Short label for the compact (<xl) toolbar — the full `dateLabel` is too
  // wide for a phone's single toolbar row.
  const dateLabelShort = useMemo(() => {
    if (view === 'day') return format(selectedDate, 'EEE, MMM d');
    if (view === 'week') {
      const ws = startOfWeek(selectedDate, { weekStartsOn: 1 });
      const we = endOfWeek(selectedDate, { weekStartsOn: 1 });
      return `${format(ws, 'MMM d')} – ${format(we, 'MMM d')}`;
    }
    return format(selectedDate, 'MMM yyyy');
  }, [selectedDate, view]);

  // EXPORT-3: row mapper + columns for the calendar CSV export. Resolves
  // foreign-key fields (room/area/teacher/contact) from the lists already
  // loaded on the page.
  const allRoomsFlat = useMemo(() => areas.flatMap((a) => a.rooms), [areas]);
  const userById = useMemo(() => {
    const m = new Map<string, User>();
    users.forEach((u) => m.set(u.id, u));
    return m;
  }, [users]);
  const contactById = useMemo(() => {
    const m = new Map<string, Contact>();
    contacts.forEach((c) => m.set(c.id, c));
    return m;
  }, [contacts]);
  const areaById = useMemo(() => {
    const m = new Map<string, Area>();
    areas.forEach((a) => m.set(a.id, a));
    return m;
  }, [areas]);

  const bookingColumns = [
    'Title',
    'Type',
    'Activity',
    'Area',
    'Room',
    'Start',
    'End',
    'Teacher',
    'Contact',
    'Status',
    'Cancel reason',
  ];
  const bookingToRow = (b: Booking) => {
    const room = allRoomsFlat.find((r) => r.id === b.roomId);
    const area = areaById.get(b.areaId);
    const teacher = b.teacherId ? userById.get(b.teacherId) : undefined;
    const contact = b.contactId ? contactById.get(b.contactId) : undefined;
    return [
      b.title,
      b.type,
      b.activity ?? '',
      area?.name ?? b.areaId,
      room?.name ?? b.roomId,
      b.startTime,
      b.endTime,
      teacher ? `${teacher.firstName} ${teacher.lastName}`.trim() : '',
      contact ? `${contact.firstName} ${contact.lastName}`.trim() : '',
      b.status ?? 'active',
      b.cancelReason ?? '',
    ];
  };

  // "All I can see" — fetch a 5-year window (no areaId) on demand. The
  // calendar matrix says every role sees all branches, so we don't filter
  // by area here. Wider than 5 years is overkill for a Bible-study app.
  const loadAllBookings = useCallback(async () => {
    const start = new Date();
    start.setFullYear(start.getFullYear() - 2);
    const end = new Date();
    end.setFullYear(end.getFullYear() + 3);
    const data = await bookingsApi.getBookings({
      start: start.toISOString(),
      end: end.toISOString(),
    });
    return Array.isArray(data) ? data : [];
  }, []);

  // Mount the page's toolbar into the global Topbar so the calendar grid
  // gets the full content area below. Re-runs whenever any value the JSX
  // references changes — include them all in the deps.
  //
  // MOBILE: the Topbar is a fixed single 64px row (components/layout/Topbar),
  // so the full desktop toolbar (8 controls) overflows it below xl. We
  // dual-render: the ORIGINAL toolbar is gated `hidden xl:flex` (byte-identical
  // ≥1280), and a COMPACT toolbar (`xl:hidden`) holds just the essentials in a
  // single row that scrolls horizontally INSIDE itself (overflow-x-auto +
  // overscroll-contain) so the page body never scrolls sideways. The search bar
  // and CSV export are relocated out of the cramped topbar into a dedicated
  // full-width control row at the top of the page body (also `xl:hidden`).
  useTopbarSlot(
    (
      <>
        {/* ≥1280: untouched desktop toolbar. */}
        <div className="hidden min-w-0 flex-1 items-center gap-3 xl:flex">
          <Button variant="outline" size="sm" onClick={() => setDate(new Date())}>
            Today
          </Button>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
              aria-label="Previous period"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(1)}
              aria-label="Next period"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          <h2 className="hidden whitespace-nowrap text-base font-semibold lg:block">
            {dateLabel}
          </h2>
          <InfoButton {...calendarHelp} />

          <div className="min-w-[180px] flex-1 max-w-sm">
            <BookingSearchBar
              bookings={bookings}
              users={users}
              rooms={rooms}
              onJumpToBooking={(b) => {
                const d = new Date(b.startTime);
                setDate(d);
                setView('day');
              }}
            />
          </div>

          <Select value={selectedAreaId || ''} onValueChange={(v) => v && setAreaId(v)}>
            <SelectTrigger className="w-[150px]">
              {/* base-ui SelectValue renders the raw VALUE (the area id) when
                  given no children — render the church name from state like
                  the other labeled selects (UsersTab/AuditLogTab) do. */}
              <SelectValue>{selectedArea?.name ?? 'Select church'}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {areas.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* EXPORT-3: dual-mode CSV export of bookings. Current view = the
               area + date-range slice on screen. All = wider 5-year window
               across all branches. Admin-tier only unless canExportImport's
               feature flag is enabled. */}
          {canExportImport(viewer) && (
            <ExportDropdown
              currentRows={bookings}
              loadAll={loadAllBookings}
              columns={bookingColumns}
              toRow={bookingToRow}
              filenamePrefix="diamond-bookings"
              allLabel="All bookings (5-year window)"
            />
          )}

          <Tabs value={view} onValueChange={(v) => setView(v as 'day' | 'week' | 'month')}>
            <TabsList>
              <TabsTrigger value="day">Day</TabsTrigger>
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="month">Month</TabsTrigger>
            </TabsList>
          </Tabs>

          <Button onClick={() => openBookingModal()} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Book
          </Button>
        </div>

        {/* <1280: compact single-row toolbar. Scrolls horizontally INSIDE
             itself if it can't fit (e.g. a long area name on a 320px phone) so
             the page body never gains a horizontal scrollbar. Search + export
             live in the in-page control row below instead. */}
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto overscroll-x-contain py-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden xl:hidden">
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => setDate(new Date())}
          >
            Today
          </Button>
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
              aria-label="Previous period"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(1)}
              aria-label="Next period"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          {/* Compact date label — shown from sm up; on the very narrowest
               phones it's hidden (the in-page row repeats it) to save space. */}
          <h2 className="hidden shrink-0 whitespace-nowrap text-sm font-semibold sm:block">
            {dateLabelShort}
          </h2>

          {/* Segmented view switcher — single letters on the tightest screens. */}
          <Tabs
            value={view}
            onValueChange={(v) => setView(v as 'day' | 'week' | 'month')}
            className="shrink-0"
          >
            <TabsList>
              <TabsTrigger value="day" aria-label="Day view">
                <span className="max-[420px]:hidden">Day</span>
                <span className="hidden max-[420px]:inline" aria-hidden="true">D</span>
              </TabsTrigger>
              <TabsTrigger value="week" aria-label="Week view">
                <span className="max-[420px]:hidden">Week</span>
                <span className="hidden max-[420px]:inline" aria-hidden="true">W</span>
              </TabsTrigger>
              <TabsTrigger value="month" aria-label="Month view">
                <span className="max-[420px]:hidden">Month</span>
                <span className="hidden max-[420px]:inline" aria-hidden="true">M</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Button
            onClick={() => openBookingModal()}
            size="sm"
            className="shrink-0 gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Book
          </Button>

          {/* Church picker — the closed trigger always reads a static
               "Church" (the selected church's full name is too wide for a
               phone row); the open list still shows full names. The actual
               selection is conveyed to assistive tech via aria-label. */}
          <Select value={selectedAreaId || ''} onValueChange={(v) => v && setAreaId(v)}>
            <SelectTrigger
              className="ml-auto w-auto shrink-0"
              aria-label={'Church: ' + (selectedArea?.name ?? 'none selected')}
            >
              <span>Church</span>
            </SelectTrigger>
            <SelectContent>
              {areas.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Legend popover — the Topbar is a FIXED 64px row, so an
               inline-expanding disclosure would overflow it; the chips float
               over the page in a popover instead. ≥md the in-page chip row
               already shows the legend, so the trigger is phone-only. */}
          <Popover>
            <PopoverTrigger
              render={
                <Button variant="outline" size="sm" className="shrink-0 gap-1.5 md:hidden" />
              }
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
              Legend
            </PopoverTrigger>
            <PopoverContent align="end" className="flex w-auto max-w-[280px] flex-row flex-wrap gap-2">
              {Object.entries(BOOKING_TYPE_CONFIG).map(([type, config]) => (
                <Badge key={type} variant="outline" className={`${config.bgColor} ${config.color} text-[11px]`}>
                  {tBookingType(type)}
                </Badge>
              ))}
            </PopoverContent>
          </Popover>
        </div>
      </>
    ),
    [
      dateLabel,
      dateLabelShort,
      view,
      selectedAreaId,
      // The compact Church trigger's aria-label + the Legend popover chips
      // are rendered in the slot JSX now — both must invalidate it.
      selectedArea,
      tBookingType,
      areas,
      bookings,
      users,
      rooms,
      navigate,
      setDate,
      setView,
      setAreaId,
      openBookingModal,
      // Export deps: row-mapper closures depend on these too.
      bookingColumns,
      bookingToRow,
      loadAllBookings,
    ],
  );

  return (
    <div className="space-y-4 md:flex md:h-full md:min-h-0 md:flex-col md:gap-4 md:space-y-0">
      {/* In-page control row — ONLY <xl. The desktop toolbar (≥xl) keeps search
           + export in the Topbar; below xl that single 64px row can't hold them
           without overflow, so they stack full-width here. Stays inside the
           page body (no horizontal page scroll). */}
      <div className="space-y-2 xl:hidden">
        {/* Full date label, so phones that hide it in the compact toolbar
             (below sm) still always see the current period. */}
        <h2 className="whitespace-nowrap text-sm font-semibold sm:hidden">
          {dateLabel}
        </h2>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <BookingSearchBar
              bookings={bookings}
              users={users}
              rooms={rooms}
              onJumpToBooking={(b) => {
                const d = new Date(b.startTime);
                setDate(d);
                setView('day');
              }}
            />
          </div>
          {canExportImport(viewer) && (
            <div className="shrink-0">
              <ExportDropdown
                currentRows={bookings}
                loadAll={loadAllBookings}
                columns={bookingColumns}
                toRow={bookingToRow}
                filenamePrefix="diamond-bookings"
                allLabel="All bookings (5-year window)"
              />
            </div>
          )}
        </div>
      </div>

      {/* Legend — full chip row on ≥md (unchanged on desktop). Phones get the
           Legend popover in the compact topbar instead, so no vertical space
           is spent above the calendar here. */}
      <div className="hidden flex-wrap gap-2 md:flex">
        {Object.entries(BOOKING_TYPE_CONFIG).map(([type, config]) => (
          <Badge key={type} variant="outline" className={`${config.bgColor} ${config.color} text-[11px]`}>
            {tBookingType(type)}
          </Badge>
        ))}
      </div>

      {/* Calendar — swipe left/right to navigate periods */}
      <div ref={swipeContainerRef} className="touch-pan-y md:flex md:min-h-0 md:flex-1 md:flex-col">
        {loading ? (
          <div className="flex h-96 items-center justify-center">
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : areas.length === 0 ? (
          <div className="flex h-96 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/50 p-8 text-center">
            <div className="text-base font-semibold">No locations set up yet</div>
            <p className="max-w-md text-sm text-muted-foreground">
              The calendar needs at least one area with rooms before bookings can be made.
              Ask an admin (Overseer or Developer) to create one from{' '}
              <span className="font-medium">Settings → Manage Locations</span>, or contact your
              backend administrator to seed initial rooms.
            </p>
          </div>
        ) : rooms.length === 0 ? (
          <div className="flex h-96 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/50 p-8 text-center">
            <div className="text-base font-semibold">This area has no rooms yet</div>
            <p className="max-w-md text-sm text-muted-foreground">
              Pick a different location from the dropdown above, or ask an admin to add rooms to{' '}
              <span className="font-medium">{selectedArea?.name || 'this area'}</span>.
            </p>
          </div>
        ) : (
          <>
            {/* ≥md: the multi-room time grid (desktop unchanged ≥1280). */}
            <div className="hidden md:flex md:min-h-0 md:flex-1 md:flex-col">
              {view === 'week' && (
                <WeekView date={selectedDate} rooms={rooms} bookings={bookings} onSlotClick={handleSlotClick} onBookingClick={openEditModal} />
              )}
              {view === 'day' && (
                <DayView date={selectedDate} rooms={rooms} bookings={bookings} onSlotClick={handleSlotClick} onBookingClick={openEditModal} />
              )}
              {view === 'month' && (
                <MonthView date={selectedDate} bookings={bookings} onDayClick={handleDayClick} onBookingClick={openEditModal} />
              )}
            </div>
            {/* <md: phone agenda — a readable chronological list of the loaded
                 range, grouped by day. Avoids the cramped multi-room grid. */}
            <div className="md:hidden">
              <AgendaView bookings={bookings} rooms={rooms} date={selectedDate} view={view} onBookingClick={openEditModal} />
            </div>
          </>
        )}
      </div>

      {/* Booking Wizard */}
      <BookingWizard
        areas={areas}
        bookings={bookings}
        users={users}
        contacts={contacts}
        blockedSlots={blockedSlots}
        onSubmit={handleBookingSubmit}
        onDelete={handleBookingDelete}
        onCancel={handleBookingCancel}
        onRestore={handleBookingRestore}
      />
    </div>
  );
}
