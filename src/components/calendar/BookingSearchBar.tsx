'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { Search, X, ChevronRight, CalendarDays, Clock, MapPin } from 'lucide-react';
import { format, parseISO, compareAsc } from 'date-fns';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BOOKING_TYPE_CONFIG, ROLE_LABELS } from '@/lib/types';
import type { Booking, User, Room } from '@/lib/types';
import { useTimeFormat } from '@/lib/hooks/useTimeFormat';

/**
 * Calendar-side search. Type a name → predictive dropdown listing ONLY
 * teachers/leaders who currently have bookings in the loaded range.
 * Selecting a match opens a scrollable popup listing every booking of
 * theirs, grouped by day.
 *
 * Mirrors the UX of the Groups page TreeSearchBar (same input style,
 * same arrow-key navigation, same outside-click dismissal) so the two
 * pages feel consistent.
 */
interface BookingSearchBarProps {
  bookings: Booking[];
  users: User[];
  rooms: Room[];
  /** When the user picks a booking from the popup, jump the calendar to that day. */
  onJumpToBooking?: (booking: Booking) => void;
}

interface TeacherEntry {
  userId: string;
  name: string;
  roleLabel: string;
  bookingCount: number;
}

export function BookingSearchBar({
  bookings,
  users,
  rooms,
  onJumpToBooking,
}: BookingSearchBarProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { time } = useTimeFormat();

  // Build an index of teachers who have at least one booking in the
  // currently loaded bookings list. Keyed by userId so duplicates collapse.
  const index = useMemo<TeacherEntry[]>(() => {
    const byId = new Map<string, { count: number; user?: User }>();
    for (const b of bookings) {
      if (!b.teacherId || b.status === 'cancelled') continue;
      const existing = byId.get(b.teacherId) || {
        count: 0,
        user: users.find((u) => u.id === b.teacherId),
      };
      existing.count += 1;
      byId.set(b.teacherId, existing);
    }
    const entries: TeacherEntry[] = [];
    for (const [userId, { count, user }] of byId.entries()) {
      if (!user) continue;
      entries.push({
        userId,
        name: `${user.firstName} ${user.lastName}`.trim(),
        roleLabel: ROLE_LABELS[user.role] ?? user.role,
        bookingCount: count,
      });
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    return entries;
  }, [bookings, users]);

  // Predictive filter — case-insensitive substring match on name + role.
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return index;
    return index.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.roleLabel.toLowerCase().includes(q),
    );
  }, [index, query]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [results]);

  const handleSelect = (entry: TeacherEntry) => {
    setSelectedTeacherId(entry.userId);
    setQuery('');
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[activeIndex]) handleSelect(results[activeIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const selectedTeacher = selectedTeacherId
    ? users.find((u) => u.id === selectedTeacherId) || null
    : null;
  const selectedBookings = useMemo(() => {
    if (!selectedTeacherId) return [];
    return bookings
      .filter((b) => b.teacherId === selectedTeacherId && b.status !== 'cancelled')
      .slice()
      .sort((a, b) => compareAsc(parseISO(a.startTime), parseISO(b.startTime)));
  }, [bookings, selectedTeacherId]);

  return (
    <>
      <div ref={containerRef} className="relative w-full max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder="Search teacher / leader bookings..."
            className="pl-9 pr-9"
            aria-autocomplete="list"
            aria-expanded={open}
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setOpen(false);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {open && (
          <div className="absolute left-0 right-0 top-full mt-1 rounded-md border border-border bg-popover shadow-xl z-50 overflow-hidden">
            {results.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                {index.length === 0
                  ? 'No teachers have bookings in this range'
                  : 'No matches'}
              </div>
            ) : (
              <ul className="max-h-80 overflow-y-auto py-1">
                {results.map((entry, i) => {
                  const isActive = i === activeIndex;
                  return (
                    <li key={entry.userId}>
                      <button
                        type="button"
                        onClick={() => handleSelect(entry)}
                        onMouseEnter={() => setActiveIndex(i)}
                        className={cn(
                          'w-full px-3 py-2 text-left transition-colors touch-manipulation',
                          // Taller tap target on phones/tablets; desktop unchanged.
                          'max-xl:py-2.5',
                          isActive ? 'bg-accent' : 'hover:bg-accent/60',
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{entry.name}</div>
                            <div className="text-[11px] text-muted-foreground flex items-center gap-1 flex-wrap">
                              <span className="rounded bg-muted/60 px-1 py-0.5">
                                {entry.roleLabel}
                              </span>
                            </div>
                          </div>
                          <div className="shrink-0 text-[11px] text-muted-foreground">
                            {entry.bookingCount}{' '}
                            {entry.bookingCount === 1 ? 'slot' : 'slots'}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      <Dialog
        open={!!selectedTeacherId}
        onOpenChange={(o) => !o && setSelectedTeacherId(null)}
      >
        <DialogContent className="max-h-[85vh] overflow-hidden flex flex-col sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <CalendarDays className="h-5 w-5 text-primary" />
              {selectedTeacher
                ? `${selectedTeacher.firstName} ${selectedTeacher.lastName}`.trim()
                : 'Bookings'}
            </DialogTitle>
            {selectedTeacher && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="text-[11px] font-normal">
                  {ROLE_LABELS[selectedTeacher.role] ?? selectedTeacher.role}
                </Badge>
                <span>•</span>
                <span>
                  {selectedBookings.length} scheduled{' '}
                  {selectedBookings.length === 1 ? 'slot' : 'slots'}
                </span>
              </div>
            )}
          </DialogHeader>

          {selectedBookings.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-10 text-sm text-muted-foreground">
              No bookings for this teacher in the current range.
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto pr-1 -mr-1 space-y-2">
              {groupBookingsByDay(selectedBookings).map((dayGroup) => (
                <div key={dayGroup.dayKey} className="space-y-1.5">
                  <div className="sticky top-0 bg-background/95 backdrop-blur-sm py-1 z-10">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                      {format(dayGroup.date, 'EEEE, MMMM d, yyyy')}
                    </div>
                  </div>
                  {dayGroup.bookings.map((b) => {
                    const cfg = BOOKING_TYPE_CONFIG[b.type];
                    const room = rooms.find((r) => r.id === b.roomId);
                    const start = parseISO(b.startTime);
                    const end = parseISO(b.endTime);
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => {
                          onJumpToBooking?.(b);
                          setSelectedTeacherId(null);
                        }}
                        className={cn(
                          'w-full text-left rounded-md border px-3 py-2 transition-colors touch-manipulation',
                          'hover:bg-accent/70',
                          cfg?.bgColor,
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold truncate text-foreground">
                              {b.title}
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground flex-wrap">
                              <span className="inline-flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {time(start)} – {time(end)}
                              </span>
                              {room && (
                                <>
                                  <span>•</span>
                                  <span className="inline-flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {room.name}
                                  </span>
                                </>
                              )}
                            </div>
                            {b.subject && (
                              <div className="mt-0.5 text-[11px] text-muted-foreground truncate">
                                {b.subject}
                              </div>
                            )}
                          </div>
                          <Badge
                            variant="outline"
                            className={cn('shrink-0 text-[10px]', cfg?.color)}
                          >
                            {cfg?.label ?? b.type}
                          </Badge>
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          <div className="pt-3 flex justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelectedTeacherId(null)}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function groupBookingsByDay(bookings: Booking[]) {
  const groups = new Map<string, { dayKey: string; date: Date; bookings: Booking[] }>();
  for (const b of bookings) {
    const d = parseISO(b.startTime);
    const key = format(d, 'yyyy-MM-dd');
    if (!groups.has(key)) {
      groups.set(key, { dayKey: key, date: d, bookings: [] });
    }
    groups.get(key)!.bookings.push(b);
  }
  return Array.from(groups.values()).sort((a, b) => compareAsc(a.date, b.date));
}
