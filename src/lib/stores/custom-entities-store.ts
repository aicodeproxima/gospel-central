'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { migrateLegacyLocalStorageKey } from './migrate-storage';

/**
 * User-added entities (rooms, teachers, contacts, groups) that persist
 * across sessions via localStorage. Added via the "+ Add new" option at
 * the top of any Combobox. These are merged with the server/mock data
 * so they appear in all future pickers.
 *
 * Hardening pass (audit H-7):
 *
 *  - **Versioned storage**: `version` bumps invalidate any older shape
 *    on load so a future schema change can't hydrate stale data.
 *  - **Collision-safe IDs**: `custom-{kind}-{Date.now()}` collides when
 *    two entities are added in the same millisecond. We now append a
 *    short random suffix AND an internal counter.
 *  - **Name de-duplication**: `add()` returns the existing entity if one
 *    with the same (kind, trimmed, case-insensitive name) already
 *    exists. Prevents silent dupes when a user types the same teacher
 *    name into two forms.
 *  - **Cap**: a soft upper bound (`MAX_ENTITIES`) prevents unbounded
 *    localStorage growth. Oldest-first trim beyond that.
 *  - **`clearAll()`**: logout / backend-migration day will call this.
 *  - **`isBackendManagedId()`**: the public guard used by forms so they
 *    know whether to submit the ID to the backend or treat the name as
 *    a free-text value to reconcile server-side. Backend-flip day will
 *    strip these prefixes from all submissions.
 */

const STORAGE_KEY = 'gospel-central-custom-entities';
// Diamond → Gospel Central: carry over user-added entities across the key rename.
migrateLegacyLocalStorageKey('diamond-custom-entities', STORAGE_KEY);
const STORAGE_VERSION = 2;
const MAX_ENTITIES = 500;
const ID_PREFIX = 'custom-';

export interface CustomEntity {
  id: string;
  name: string;
  kind: 'room' | 'teacher' | 'contact' | 'group' | 'other';
  createdAt: string;
}

interface CustomEntitiesState {
  entities: CustomEntity[];
  add: (kind: CustomEntity['kind'], name: string) => CustomEntity;
  remove: (id: string) => void;
  byKind: (kind: CustomEntity['kind']) => CustomEntity[];
  clearAll: () => void;
}

/** Backend-flip helper: any ID matching this prefix is NOT a real
 *  backend ID and should be stripped before submit. */
export function isBackendManagedId(id: string): boolean {
  return !id.startsWith(ID_PREFIX);
}

let counter = 0;
function makeId(kind: CustomEntity['kind']): string {
  counter = (counter + 1) % 100000;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ID_PREFIX}${kind}-${Date.now()}-${counter}-${rand}`;
}

function normalizeName(s: string): string {
  return s.trim().toLowerCase();
}

export const useCustomEntitiesStore = create<CustomEntitiesState>()(
  persist(
    (set, get) => ({
      entities: [],
      add: (kind, name) => {
        const trimmed = name.trim();
        if (!trimmed) {
          // Sentinel "empty" record so callers that mis-call us still
          // get a consistent shape back; never actually stored.
          return {
            id: makeId(kind),
            name: trimmed,
            kind,
            createdAt: new Date().toISOString(),
          };
        }
        // Dedup: return existing entity if one matches already.
        const norm = normalizeName(trimmed);
        const existing = get().entities.find(
          (e) => e.kind === kind && normalizeName(e.name) === norm,
        );
        if (existing) return existing;

        const entity: CustomEntity = {
          id: makeId(kind),
          name: trimmed,
          kind,
          createdAt: new Date().toISOString(),
        };
        set((s) => {
          const next = [...s.entities, entity];
          // Cap growth — drop oldest first.
          if (next.length > MAX_ENTITIES) {
            next.splice(0, next.length - MAX_ENTITIES);
          }
          return { entities: next };
        });
        return entity;
      },
      remove: (id) =>
        set((s) => ({ entities: s.entities.filter((e) => e.id !== id) })),
      byKind: (kind) => get().entities.filter((e) => e.kind === kind),
      clearAll: () => set({ entities: [] }),
    }),
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      // Any persisted payload from an older version is discarded so
      // stale mock IDs can't leak into a new schema.
      migrate: (persisted: unknown, version: number) => {
        if (version !== STORAGE_VERSION) {
          return { entities: [] as CustomEntity[] };
        }
        return persisted as { entities: CustomEntity[] };
      },
    },
  ),
);
