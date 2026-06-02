'use client';

import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { BOOKING_TYPE_CONFIG, ACTIVITY_CONFIG, Activity } from '@/lib/types';
import type { Booking } from '@/lib/types';
import { format, parseISO, formatHour12 } from '@/lib/utils/date';

interface BookingCardProps {
  booking: Booking;
  onClick: (booking: Booking) => void;
  absolute?: boolean;
  style?: React.CSSProperties;
}

const COMPACT_WIDTH_THRESHOLD = 60; // px — below this, show color block only

export function BookingCard({ booking, onClick, absolute, style }: BookingCardProps) {
  const config = BOOKING_TYPE_CONFIG[booking.type];
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
  const start = parseISO(booking.startTime);
  const end = parseISO(booking.endTime);
  const startStr = format(start, 'h:mm aaa');
  const endStr = format(end, 'h:mm aaa');
  const startHour = formatHour12(start.getHours(), start.getMinutes());
  const endHour = formatHour12(end.getHours(), end.getMinutes());
  const tooltip = isCancelled
    ? `CANCELLED: ${booking.title}\n${startStr} — ${endStr}\nReason: ${booking.cancelReason || 'No reason given'}`
    : `${booking.title}\n${startStr} — ${endStr}${activityLabel ? `\n${activityLabel}` : ''}`;

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
        config.bgColor,
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
        <div className={cn('flex h-full w-full flex-col items-center justify-between py-1 leading-none', config.color)}>
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
          <div className={cn('font-semibold truncate', config.color)}>{booking.title}</div>
          {activityLabel && (
            <div className="truncate text-[10px] opacity-80">{activityLabel}</div>
          )}
          <div className="truncate text-muted-foreground">
            {startStr} - {endStr}
          </div>
        </>
      )}
    </motion.button>
  );
}
