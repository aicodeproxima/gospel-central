'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { Search, X, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { buildSearchIndex, searchEntriesWithTotal, type SearchEntry } from '@/lib/utils/tree-search';
import type { OrgNode, Contact } from '@/lib/types';

interface TreeSearchBarProps {
  roots: OrgNode[];
  /** Contacts render as leaves in the tree, so search resolves them too (REV3 #1). */
  contacts?: Contact[];
  onSelect: (entry: SearchEntry) => void;
  /** Focus the input on mount (used by the phone magnifier expansion, REV3 #2). */
  autoFocus?: boolean;
}

/**
 * Search bar with predictive dropdown for the org tree.
 * Type any name, role, or group → press Enter or click a result
 * to focus the 3D camera on that node and auto-expand its ancestors.
 * Contacts match by NAME and open their detail dialog under their teacher.
 */
export function TreeSearchBar({ roots, contacts, onSelect, autoFocus }: TreeSearchBarProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const index = useMemo(() => buildSearchIndex(roots, contacts ?? []), [roots, contacts]);
  const { entries: results, total } = useMemo(
    () => searchEntriesWithTotal(index, query, 10),
    [index, query],
  );

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

  // Reset active index when results change
  useEffect(() => {
    setActiveIndex(0);
  }, [results]);

  const handleSelect = (entry: SearchEntry) => {
    onSelect(entry);
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

  return (
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
          placeholder="Search users, contacts, teams..."
          autoFocus={autoFocus}
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

      {open && query.trim() && (
        <div className="absolute left-0 right-0 top-full mt-1 rounded-md border border-border bg-popover shadow-xl z-50 overflow-hidden">
          {results.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">
              No matches found
            </div>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1">
              {results.map((entry, i) => {
                const isActive = i === activeIndex;
                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(entry)}
                      onMouseEnter={() => setActiveIndex(i)}
                      className={cn(
                        'w-full px-3 py-2 text-left transition-colors',
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
                            {entry.groupName && <span>• {entry.groupName}</span>}
                          </div>
                          {entry.ancestors.length > 0 && (
                            <div className="mt-0.5 flex items-center gap-0.5 text-[10px] text-muted-foreground/80">
                              {entry.ancestors.map((a, j) => (
                                <span key={j} className="flex items-center gap-0.5">
                                  {j > 0 && <ChevronRight className="h-2.5 w-2.5" />}
                                  <span className="truncate">{a}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
              {total > results.length && (
                // Overflow hint — the list is capped at 10; without this a
                // broad search silently hid the rest (finding 349).
                <li
                  aria-live="polite"
                  className="px-3 py-1.5 text-center text-[11px] text-muted-foreground border-t border-border/60"
                >
                  +{total - results.length} more match{total - results.length === 1 ? '' : 'es'} — keep typing to narrow
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
