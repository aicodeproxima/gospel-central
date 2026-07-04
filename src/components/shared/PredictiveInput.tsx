'use client';

import { forwardRef, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface PredictiveInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'list'> {
  /**
   * List of known values to offer as app-rendered autocomplete suggestions.
   */
  suggestions?: string[];
  onSuggestionSelect?: (value: string) => void;
}

/**
 * Text input with predictive search powered by an app-rendered option list.
 * Users can type anything, but known values show up as suggestions as they
 * type. Use this anywhere the app already knows likely values
 * (names, groups, subjects, rooms, etc.).
 */
export const PredictiveInput = forwardRef<HTMLInputElement, PredictiveInputProps>(
  function PredictiveInput({
    suggestions = [],
    onSuggestionSelect,
    className,
    value,
    onChange,
    onFocus,
    onBlur,
    onKeyDown,
    ...rest
  }, ref) {
    const [focused, setFocused] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const textValue = value == null ? '' : String(value);
    const trimmedQuery = textValue.trim().toLowerCase();

    const matches = useMemo(() => {
      const unique = Array.from(new Set(suggestions.filter((s) => s && s.trim())));
      const filtered = trimmedQuery
        ? unique.filter((s) => s.toLowerCase().includes(trimmedQuery))
        : unique;
      return filtered.sort((a, b) => a.localeCompare(b)).slice(0, 8);
    }, [suggestions, trimmedQuery]);

    const open = focused && matches.length > 0;
    const safeActiveIndex = matches.length === 0 ? -1 : Math.min(activeIndex, matches.length - 1);

    const emitValue = (nextValue: string) => {
      if (onSuggestionSelect) {
        onSuggestionSelect(nextValue);
        return;
      }
      onChange?.({
        target: { value: nextValue },
        currentTarget: { value: nextValue },
      } as React.ChangeEvent<HTMLInputElement>);
    };

    return (
      <div className="relative min-w-0 flex-1">
        <Input
          ref={ref}
          value={value}
          onChange={onChange}
          onFocus={(e) => {
            setFocused(true);
            setActiveIndex(0);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            window.setTimeout(() => setFocused(false), 120);
            onBlur?.(e);
          }}
          onKeyDown={(e) => {
            if (open && e.key === 'ArrowDown') {
              e.preventDefault();
              setActiveIndex(Math.min(safeActiveIndex + 1, matches.length - 1));
            } else if (open && e.key === 'ArrowUp') {
              e.preventDefault();
              setActiveIndex(Math.max(safeActiveIndex - 1, 0));
            } else if (open && e.key === 'Enter' && matches[safeActiveIndex]) {
              e.preventDefault();
              emitValue(matches[safeActiveIndex]);
              setFocused(false);
            } else if (e.key === 'Escape') {
              setFocused(false);
            } else {
              onKeyDown?.(e);
            }
          }}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          className={className}
          {...rest}
        />
        {open && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-lg">
            <ul className="max-h-56 overflow-y-auto py-1">
              {matches.map((suggestion, index) => (
                <li key={suggestion}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      emitValue(suggestion);
                      setFocused(false);
                    }}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={cn(
                      'w-full px-3 py-2 text-left text-sm transition-colors',
                      index === safeActiveIndex ? 'bg-accent' : 'hover:bg-accent/60',
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
