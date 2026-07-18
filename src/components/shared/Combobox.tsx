'use client';

import { useRef, useState, useMemo } from 'react';
import { Check, Plus, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

export interface ComboOption {
  id: string;
  label: string;
  sublabel?: string;
  disabled?: boolean;
  disabledReason?: string;
}

interface ComboboxProps {
  options: ComboOption[];
  value: string | null;
  onChange: (id: string) => void;
  placeholder?: string;
  allowAddNew?: boolean;
  onAddNew?: (name: string) => void;
  emptyMessage?: string;
  className?: string;
  /**
   * Render the option list unconditionally with the search box auto-focused —
   * the ORIGINAL behavior, right when the Combobox IS the step's primary UI
   * (the BookingWizard's room/teacher/contact picker steps).
   *
   * Default FALSE = collapsed-until-focus (REV3 #5): a form field must not
   * dump its entire option list on mount (the ContactForm "Assigned teacher"
   * rendered all 73 users expanded). Collapsed, the input displays the
   * current selection; focusing switches it to search mode and opens the
   * list; blur outside / Escape / selection close it again.
   */
  alwaysOpen?: boolean;
}

/**
 * Scrollable autocomplete combobox with "+ Add new" at the top.
 * Used by the booking wizard (alwaysOpen) and as a collapsed-until-focus
 * form field in the contact form / contact-detail dialog.
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Search...',
  allowAddNew = false,
  onAddNew,
  emptyMessage = 'No results',
  className,
  alwaysOpen = false,
}: ComboboxProps) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const open = alwaysOpen || focused;

  const selectedLabel = useMemo(
    () => options.find((o) => o.id === value)?.label ?? '',
    [options, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.sublabel?.toLowerCase().includes(q));
  }, [options, query]);

  const handleAdd = () => {
    if (!query.trim() || !onAddNew) return;
    onAddNew(query.trim());
    setQuery('');
  };

  const close = () => {
    setFocused(false);
    setQuery('');
  };

  return (
    <div
      className={cn('rounded-lg border border-border bg-card', className)}
      // Blur that leaves the whole widget closes it; moving focus to an
      // option button inside keeps it open long enough for the click.
      onBlur={(e) => {
        if (alwaysOpen) return;
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) close();
      }}
      onKeyDown={(e) => {
        if (!alwaysOpen && e.key === 'Escape') {
          close();
          inputRef.current?.blur();
        }
      }}
    >
      <div className={cn('relative p-2', open && 'border-b border-border')}>
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          // Collapsed, the field shows WHAT is selected; focused, it is a
          // search box (empty query lists everything, matching the old UX).
          value={open ? query : selectedLabel || query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          placeholder={selectedLabel || placeholder}
          className="pl-9 pr-9 h-9"
          autoFocus={alwaysOpen}
        />
        {open && query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && (
        <div className="max-h-72 overflow-y-auto px-2 pb-2 pt-1">
          {/* Add new row at TOP */}
          {allowAddNew && query.trim() && onAddNew && (
            <button
              type="button"
              onClick={handleAdd}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-primary hover:bg-accent"
            >
              <Plus className="h-4 w-4" />
              Add new: <span className="font-semibold">&ldquo;{query.trim()}&rdquo;</span>
            </button>
          )}
          {allowAddNew && !query.trim() && onAddNew && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              Type a name above to add a new entry
            </div>
          )}

          {filtered.length === 0 && !query.trim() && (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">{emptyMessage}</div>
          )}

          {filtered.map((opt) => {
            const selected = value === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                disabled={opt.disabled}
                onClick={() => {
                  if (opt.disabled) return;
                  onChange(opt.id);
                  if (!alwaysOpen) {
                    close();
                    inputRef.current?.blur();
                  }
                }}
                title={opt.disabledReason}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors',
                  selected && 'bg-primary/10 text-primary',
                  !selected && !opt.disabled && 'hover:bg-accent',
                  opt.disabled && 'opacity-40 cursor-not-allowed',
                )}
              >
                <div className="flex-1">
                  <div className="font-medium">{opt.label}</div>
                  {opt.sublabel && (
                    <div className="text-xs text-muted-foreground">{opt.sublabel}</div>
                  )}
                  {opt.disabled && opt.disabledReason && (
                    <div className="text-[10px] text-muted-foreground">{opt.disabledReason}</div>
                  )}
                </div>
                {selected && <Check className="h-4 w-4 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
