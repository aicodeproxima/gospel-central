'use client';

import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { ACTIVITY_CONFIG, Activity, BookingStatus, BOOKING_STATUS_CONFIG } from '@/lib/types';
import type { Booking } from '@/lib/types';
import type { User } from '@/lib/types/user';
import type { Contact } from '@/lib/types/contact';
import { parseISO } from '@/lib/utils/date';
import { useTimeFormat } from '@/lib/hooks/useTimeFormat';
import { useTranslation } from '@/lib/i18n';
import {
  getBookingCardColor,
  getBaptismBorder,
  BAPTISM_BORDER_CLASS,
  activityGroupOf,
  bookingStatusI18nKey,
} from '@/lib/utils/booking-display';

interface BookingCardProps {
  booking: Booking;
  onClick: (booking: Booking) => void;
  absolute?: boolean;
  style?: React.CSSProperties;
  teacher?: User | null;
  contact?: Contact | null;
}

const COMPACT_WIDTH_THRESHOLD = 60; // px — below this, show color block only

export function BookingCard({ booking, onClick, absolute, style, teacher, contact }: BookingCardProps) {
  const cardColor = getBookingCardColor(teacher);
  const { time } = useTimeFormat();
  const { t } = useTranslation();
  const activityLabel = booking.activity ? ACTIVITY_CONFIG[booking.activity as Activity]?.label : null;
  const ref = useRef<HTMLButtonElement>(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCompact(entry.contentRect.width < COMPACT_WIDTH_THRESHOLD);
      }
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const isCancelled = booking.status === 'cancelled';
  const isBibleStudy = activityGroupOf(booking.type) === 'bible_study';
  const border = getBaptismBorder(booking, contact);
  const statusLabel = t(bookingStatusI18nKey(booking));
  const statusColor = BOOKING_STATUS_CONFIG[booking.status ?? BookingStatus.BIBLE_STUDY].color;
  const start = parseISO(booking.startTime);
  const end = parseISO(booking.endTime);
  const startStr = time(start);
  const endStr = time(end);
  const startHour = startStr;
  const endHour = endStr;

  const contactLine = isBibleStudy && contact ? `C. ${contact.firstName} ${contact.lastName}` : null;
  const teacherLine = teacher
    ? `${isBibleStudy ? 'T.' : 'L.'} ${teacher.firstName} ${teacher.lastName}`
    : null;

  const tooltipTitle = isBibleStudy && contact ? `C. ${contact.firstName} ${contact.lastName}` : booking.title;
  const tooltip = isCancelled
    ? `CANCELLED: ${booking.title}\n${startStr} — ${endStr}\nReason: ${booking.cancelReason || 'No reason given'}`
    : `${tooltipTitle}\n${startStr} — ${endStr}${activityLabel ? `\n${activityLabel}` : ''}\n${statusLabel}`;

  return (
    <motion.button
      ref={ref}
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: isCancelled ? 1.0 : 1.05, zIndex: 10 }}
      onClick={(e) => { e.stopPropagation(); onClick(booking); }}
      style={style}
      title={tooltip}
      className={cn(
        'relative block h-full w-full overflow-hidden rounded-md border text-left text-xs transition-shadow',
        // touch-manipulation removes the 300ms tap delay + double-tap zoom on
        // phones/tablets so opening a booking feels instant. Additive only —
        // no effect on the ≥1280 mouse render.
        'touch-manipulation',
        absolute && 'absolute inset-x-1',
        isCancelled ? 'opacity-35 border-dashed' : 'hover:shadow-lg',
        cardColor.bgColor,
        border && BAPTISM_BORDER_CLASS[border],
        compact ? 'px-0.5 py-1' : 'px-2 py-1',
      )}
    >
      {/* Diagonal strikethrough for cancelled bookings */}
      {isCancelled && (
        <div
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            background: 'linear-gradient(to top right, transparent calc(50% - 1px), rgba(239,68,68,0.5) calc(50% - 1px), rgba(239,68,68,0.5) calc(50% + 1px), transparent calc(50% + 1px))',
          }}
        />
      )}
      {compact ? (
        // Narrow mode: vertically-rotated start and end times
        <div className={cn('flex h-full w-full flex-col items-center justify-between py-1 leading-none', cardColor.color)}>
          <div
            className="text-[9px] font-bold whitespace-nowrap tracking-tight"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            {startHour}
          </div>
          <div className="h-px w-3 bg-current opacity-40" />
          <div
            className="text-[9px] font-bold whitespace-nowrap tracking-tight"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            {endHour}
          </div>
        </div>
      ) : (
        <>
          {isBibleStudy ? (
            <div className={cn('font-semibold truncate', cardColor.color)}>
              {contactLine ?? booking.title}
            </div>
          ) : (
            <div className={cn('font-semibold truncate', cardColor.color)}>{booking.title}</div>
          )}
          {teacherLine && (
            <div className="truncate text-foreground">{teacherLine}</div>
          )}
          {activityLabel && (
            <div className="truncate text-[10px] opacity-80">{activityLabel}</div>
          )}
          <div className="truncate text-muted-foreground">
            {startStr} - {endStr}
          </div>
          <div className={cn('truncate text-[10px] font-medium', statusColor)}>
            {statusLabel}
          </div>
        </>
      )}
    </motion.button>
  );
}
