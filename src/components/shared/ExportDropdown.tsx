'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { exportCSV } from '@/lib/utils/csv';
import { Download } from 'lucide-react';

/**
 * ExportDropdown — shared "Current view + All in scope" CSV export
 * dropdown. Used by Users, Calendar, GroupsTab, and (future) Audit Log.
 *
 * Centralizes:
 *   - the trigger Button + Download icon styling
 *   - filename conventions: `${filenamePrefix}-current.csv` and
 *     `${filenamePrefix}-all.csv`
 *   - row-count badges in the menu items so users see what they're
 *     about to export
 *
 * Pass `currentRows` (filtered list visible on the page) and `allRows`
 * (the full in-scope dataset; pre-filtered server-side or client-side
 * for the viewer's permissions). Pass a `toRow` mapper that turns each
 * item into a CSV cell array.
 *
 * If "all" mode requires an async fetch (e.g. calendar pulls a wider
 * date range), pass `loadAll` instead of `allRows`. The menu item
 * disables itself while the fetch is in-flight.
 */
type Cell = string | number | undefined | null;

interface Props<T> {
  currentRows: T[];
  /** Either provide allRows synchronously OR pass loadAll for an async fetch. */
  allRows?: T[];
  loadAll?: () => Promise<T[]>;
  columns: string[];
  toRow: (item: T) => Cell[];
  filenamePrefix: string;
  triggerLabel?: string;
  size?: 'sm' | 'default' | 'icon';
  variant?: 'outline' | 'default' | 'ghost' | 'secondary';
  /** Optional override for the menu items' label text. */
  currentLabel?: string;
  allLabel?: string;
}

export function ExportDropdown<T>({
  currentRows,
  allRows,
  loadAll,
  columns,
  toRow,
  filenamePrefix,
  triggerLabel = 'Export',
  size = 'sm',
  variant = 'outline',
  currentLabel,
  allLabel,
}: Props<T>) {
  const handleCurrent = () => {
    exportCSV(columns, currentRows.map(toRow), `${filenamePrefix}-current.csv`);
  };

  const handleAll = async () => {
    const rows = allRows ?? (loadAll ? await loadAll() : []);
    exportCSV(columns, rows.map(toRow), `${filenamePrefix}-all.csv`);
  };

  // The "All" option needs SOME source. If neither allRows nor loadAll
  // was provided, we still render the menu so the layout doesn't shift,
  // but disable that item.
  const allDisabled = allRows === undefined && loadAll === undefined;
  const allCount =
    allRows !== undefined ? ` (${allRows.length})` : loadAll ? ' (fetch)' : '';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant={variant} size={size} className="gap-1.5" />}
      >
        <Download className="h-4 w-4" />
        {triggerLabel}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>CSV</DropdownMenuLabel>
        <DropdownMenuItem onClick={handleCurrent}>
          {currentLabel ?? 'Current view'} ({currentRows.length})
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleAll} disabled={allDisabled}>
          {allLabel ?? 'All I can see'}
          {allCount}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
