'use client';

import { forwardRef, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface PredictiveInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'list'> {
  /**
   * List of known values to offer as app-rendered suggestions.
   * This intentionally avoids native datalist so the popup can be aligned,
   * themed, and captured consistently across browsers.
   */
  suggestions?: string[];
  onSuggestionSelect?: (value: string) => void;
}

/**
 * Text input with an app-owned predictive popup. Users can type anything, but
 * known values show up as suggestions as they type.
 */
export const PredictiveInput = forwardRef<HTMLInputElement, PredictiveInputProps>(
  function PredictiveInput({
    suggestions = [],
    className,
    onBlur,
    onChange,
    onFocus,
    onKeyDown,
    onSuggestionSelect,
    value,
    ...rest
  }, ref) {
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const inputValue = typeof value === 'string' ? value : '';

    const filtered = useMemo(() => {
      const q = inputValue.trim().toLowerCase();
      if (!q) return [];
      const unique = Array.from(new Set(suggestions.filter((s) => s && s.trim())));
      return unique
        .filter((s) => s.toLowerCase().includes(q))
        .sort((a, b) => {
          const al = a.toLowerCase();
          const bl = b.toLowerCase();
          const aStarts = al.startsWith(q);
          const bStarts = bl.startsWith(q);
          if (aStarts !== bStarts) return aStarts ? -1 : 1;
          return a.localeCompare(b);
        })
        .slice(0, 8);
    }, [inputValue, suggestions]);

    const emitValue = (nextValue: string) => {
      onSuggestionSelect?.(nextValue);
      if (!onSuggestionSelect) {
        onChange?.({
          target: { value: nextValue },
          currentTarget: { value: nextValue },
        } as React.ChangeEvent<HTMLInputElement>);
      }
    };

    const commitSuggestion = (nextValue: string) => {
      emitValue(nextValue);
      setOpen(false);
      setActiveIndex(0);
    };

    const showSuggestions = open && filtered.length > 0;

    return (
      <div className="relative min-w-0 flex-1">
        <Input
          ref={ref}
          value={value}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={showSuggestions}
          className={className}
          onChange={(event) => {
            setOpen(true);
            setActiveIndex(0);
            onChange?.(event);
          }}
          onFocus={(event) => {
            setOpen(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            window.setTimeout(() => setOpen(false), 100);
            onBlur?.(event);
          }}
          onKeyDown={(event) => {
            if (showSuggestions && event.key === 'ArrowDown') {
              event.preventDefault();
              setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
              return;
            }
            if (showSuggestions && event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveIndex((i) => Math.max(i - 1, 0));
              return;
            }
            if (showSuggestions && event.key === 'Enter') {
              event.preventDefault();
              commitSuggestion(filtered[activeIndex]);
              return;
            }
            if (event.key === 'Escape') {
              setOpen(false);
            }
            onKeyDown?.(event);
          }}
          {...rest}
        />

        {showSuggestions && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-xl ring-1 ring-foreground/10">
            <ul className="max-h-56 overflow-y-auto py-1">
              {filtered.map((suggestion, index) => (
                <li key={suggestion}>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => commitSuggestion(suggestion)}
                    className={cn(
                      'w-full px-3 py-2 text-left text-sm transition-colors',
                      index === activeIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
                    )}
                  >
                    {suggestion}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  },
);
