'use client';

import { useMemo } from 'react';
import { format, addDays, isSameDay, isValid } from 'date-fns';
import { now as clockNow } from '@/mocks/mock-clock';
import { Calendar as CalendarIcon, UserCheck, Monitor } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { formatDuration, type TimeSlot } from '@/lib/utils/availability';

export interface WhenStepProps {
  date: Date;
  onDateChange: (d: Date) => void;
  /** false for group/team activities → hide BOTH segmented controls. */
  showStudyControls: boolean;
  mode: 'in_person' | 'zoom' | null;
  onModeChange: (m: 'in_person' | 'zoom') => void;
  baptism: 'unbaptized' | 'baptized' | null;
  onBaptismChange: (b: 'unbaptized' | 'baptized') => void;
  /** 30-min slots for the selected day (from getDaySlots) — render label from
   *  slot.label, disabled state from slot.occupied, tooltip from
   *  slot.blockedReason ?? slot.occupiedBy. At the When step only global
   *  blocked slots are known, so most slots are enabled. */
  slots: TimeSlot[];
  /** Selected range as indexes into `slots`: start inclusive, end EXCLUSIVE.
   *  null = nothing selected. */
  startIdx: number | null;
  endIdxExclusive: number | null;
  onRangeChange: (startIdx: number | null, endIdxExclusive: number | null) => void;
}

type PeriodKey = 'morning' | 'afternoon' | 'evening';

/** Partition boundary per the asset: Morning < 12, Afternoon 12–16 (inclusive
 *  of the 16:30 slot), Evening >= 17. */
function periodOf(slot: TimeSlot): PeriodKey {
  if (slot.hour < 12) return 'morning';
  if (slot.hour < 17) return 'afternoon';
  return 'evening';
}

/** Finds the longest run of consecutive free (!occupied) slots. Ties break
 *  toward the earliest run. Returns null if every slot is occupied. */
function longestFreeRun(slots: TimeSlot[]): { start: number; endExclusive: number } | null {
  let bestStart = -1;
  let bestLen = 0;
  let curStart = -1;
  let curLen = 0;
  for (let i = 0; i < slots.length; i++) {
    if (!slots[i].occupied) {
      if (curLen === 0) curStart = i;
      curLen++;
      if (curLen > bestLen) {
        bestLen = curLen;
        bestStart = curStart;
      }
    } else {
      curLen = 0;
    }
  }
  if (bestLen === 0) return null;
  return { start: bestStart, endExclusive: bestStart + bestLen };
}

export function WhenStep({
  date,
  onDateChange,
  showStudyControls,
  mode,
  onModeChange,
  baptism,
  onBaptismChange,
  slots,
  startIdx,
  endIdxExclusive,
  onRangeChange,
}: WhenStepProps) {
  const { t } = useTranslation();

  // 7-day strip centered on the selected date (3 before, 3 after).
  const dayStrip = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(date, i - 3)),
    [date],
  );

  const columns = useMemo(() => {
    const groups: Record<PeriodKey, { slot: TimeSlot; index: number }[]> = {
      morning: [],
      afternoon: [],
      evening: [],
    };
    slots.forEach((slot, index) => {
      groups[periodOf(slot)].push({ slot, index });
    });
    return groups;
  }, [slots]);

  const hasSelection = startIdx !== null && endIdxExclusive !== null;

  function handleSlotClick(i: number) {
    const slot = slots[i];
    if (!slot || slot.occupied) return;

    // No selection yet → start a new one.
    if (startIdx === null || endIdxExclusive === null) {
      onRangeChange(i, i + 1);
      return;
    }

    // Click on the current start slot again → clear.
    if (i === startIdx) {
      onRangeChange(null, null);
      return;
    }

    // Click a later free slot → treat it as the END TIME. The booking runs
    // start→clicked slot, so the clicked slot is the EXCLUSIVE end boundary,
    // not an extra booked block (10:00 → 11:00 is a 60-min booking, not 90).
    // Require every 30-min block that actually gets booked — [startIdx, i) — to
    // be free (the end-boundary slot itself is not occupied by this booking).
    if (i > startIdx) {
      for (let j = startIdx; j < i; j++) {
        if (!slots[j] || slots[j].occupied) return; // ignore, no toast
      }
      onRangeChange(startIdx, i);
      return;
    }

    // Click on an earlier slot → restart the range there.
    onRangeChange(i, i + 1);
  }

  function handleAllDay() {
    const run = longestFreeRun(slots);
    if (!run) return;
    // Cap at 8 slots (4h). Before a room is chosen the grid is nearly empty
    // (only global blocked slots), so the raw longest run can be the whole
    // 16-hour day — a range no real room ever fits, which would grey out
    // every room on the next step (ultracode-gate F3).
    const endExclusive = Math.min(run.endExclusive, run.start + 8);
    onRangeChange(run.start, endExclusive);
  }

  function handleClear() {
    onRangeChange(null, null);
  }

  const summaryLine = hasSelection
    ? `${slots[startIdx!].label} – ${slots[endIdxExclusive!]?.label ?? 'end of day'} · ${formatDuration((endIdxExclusive! - startIdx!) * 30)}`
    : null;

  // Retroactive entry is allowed (recording a study that already happened) but
  // must be deliberate: surface a notice instead of blocking (remediation
  // decision 2026-07-13, finding 292's real story — nothing downstream rejects
  // past times, so an unnoticed misclick used to create a silent past booking).
  const pastSelection =
    hasSelection && slots[startIdx!] && slots[startIdx!].start.getTime() < clockNow().getTime();

  const periodMeta: { key: PeriodKey; label: string }[] = [
    { key: 'morning', label: t('wizard.morning') },
    { key: 'afternoon', label: t('wizard.afternoon') },
    { key: 'evening', label: t('wizard.evening') },
  ];

  return (
    <div className="mx-auto w-full max-w-[672px] space-y-4">
      {/* Date field + day strip */}
      <div>
        <Label className="text-base font-semibold">{t('wizard.date')}</Label>
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5">
            <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Input
              type="date"
              value={isValid(date) ? format(date, 'yyyy-MM-dd') : ''}
              onChange={(e) => {
                if (!e.target.value) return;
                const next = new Date(e.target.value + 'T00:00');
                // Chrome's native date input emits transient values V8 cannot
                // parse (e.g. 5-6 digit years while retyping); an Invalid Date
                // reaching state throws in format() at render and destroys the
                // wizard (finding 223).
                if (isNaN(next.getTime())) return;
                onDateChange(next);
              }}
              className="h-10 border-0 bg-transparent px-0 focus-visible:ring-0"
            />
          </div>

          <div className="grid grid-cols-7 gap-1">
            {dayStrip.map((d) => {
              const selected = isSameDay(d, date);
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  onClick={() => onDateChange(d)}
                  className={cn(
                    'flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg border px-1 py-1.5 text-xs font-semibold transition-colors touch-manipulation',
                    selected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border text-foreground hover:bg-accent',
                  )}
                >
                  <span className="text-[0.65rem] uppercase opacity-80">{format(d, 'EEE')}</span>
                  <span>{format(d, 'd')}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Segmented controls — hidden for group/team activities */}
      {showStudyControls && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <div className="text-[0.65rem] font-bold uppercase tracking-wide text-muted-foreground">
              {t('wizard.mode')}
            </div>
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-card p-1">
              {(
                [
                  { key: 'in_person', label: t('wizard.inPerson'), icon: UserCheck },
                  { key: 'zoom', label: 'Zoom', icon: Monitor },
                ] as const
              ).map((m) => {
                const Icon = m.icon;
                const selected = mode === m.key;
                return (
                  <button
                    key={m.key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onModeChange(m.key)}
                    className={cn(
                      'flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 text-xs font-semibold transition-colors touch-manipulation',
                      selected
                        ? 'border-primary bg-primary/15 text-foreground'
                        : 'text-muted-foreground hover:bg-accent',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-[0.65rem] font-bold uppercase tracking-wide text-muted-foreground">
              {t('wizard.contact')}
            </div>
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-card p-1">
              {(
                [
                  { key: 'unbaptized', label: t('wizard.unbaptized') },
                  { key: 'baptized', label: t('wizard.baptized') },
                ] as const
              ).map((b) => {
                const selected = baptism === b.key;
                return (
                  <button
                    key={b.key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onBaptismChange(b.key)}
                    className={cn(
                      'flex min-h-8 items-center justify-center rounded-md border border-transparent px-1.5 text-xs font-semibold transition-colors touch-manipulation',
                      selected
                        ? 'border-primary bg-primary/15 text-foreground'
                        : 'text-muted-foreground hover:bg-accent',
                    )}
                  >
                    {b.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Time slot grid */}
      <div className="space-y-2 border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label className="text-base font-semibold">{t('wizard.time')}</Label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAllDay}
              className="inline-flex h-7 items-center rounded-md border border-border bg-card px-2 text-xs font-semibold transition-colors hover:bg-accent touch-manipulation"
            >
              {t('wizard.allDay')}
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex h-7 items-center rounded-md border border-border bg-card px-2 text-xs font-semibold transition-colors hover:bg-accent touch-manipulation"
            >
              {t('wizard.clearRange')}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {periodMeta.map(({ key, label }) => (
            <div key={key} className="min-w-0 rounded-lg border border-border bg-accent/20 p-1.5">
              <div className="mb-1 px-0.5 text-xs font-semibold text-foreground">{label}</div>
              <div className="grid gap-1">
                {columns[key].map(({ slot, index: i }) => {
                  const isStart = startIdx === i;
                  // The end-TIME slot (the exclusive boundary) is highlighted as
                  // the range's end marker; interior blocks sit between it and start.
                  const isEnd = endIdxExclusive !== null && endIdxExclusive === i;
                  const isInterior =
                    hasSelection && i > startIdx! && i < endIdxExclusive!;
                  return (
                    <button
                      key={slot.label}
                      type="button"
                      disabled={slot.occupied}
                      onClick={() => handleSlotClick(i)}
                      title={slot.blockedReason ?? slot.occupiedBy}
                      className={cn(
                        'min-h-11 max-md:min-h-11 rounded-md border px-2 py-1.5 text-xs font-medium transition-all touch-manipulation sm:min-h-8 sm:py-1',
                        slot.occupied && 'opacity-30 cursor-not-allowed bg-muted',
                        !slot.occupied &&
                          !isStart &&
                          !isEnd &&
                          !isInterior &&
                          'border-border hover:bg-accent',
                        !slot.occupied &&
                          (isStart || isEnd) &&
                          'bg-primary text-primary-foreground border-primary',
                        !slot.occupied && isInterior && 'bg-primary/40 border-primary/40',
                      )}
                    >
                      {slot.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {summaryLine && (
          <p className="text-xs text-muted-foreground">{summaryLine}</p>
        )}
        {pastSelection && (
          <p role="status" className="text-xs font-medium text-amber-600 dark:text-amber-500">
            This time is in the past — you&apos;re recording a study that already happened.
          </p>
        )}
      </div>
    </div>
  );
}
