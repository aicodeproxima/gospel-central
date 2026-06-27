/**
 * One-time localStorage key migration for the Diamond → Gospel Central rename.
 *
 * The persisted-store keys were renamed (`diamond-*` → `gospel-central-*`). To
 * keep existing users' saved data (theme/language/view, custom entities) intact
 * across the rename, copy any legacy value to the new key the FIRST time the new
 * key is absent, then drop the legacy key. Call this at module load BEFORE the
 * store's `create(persist(...))` runs, so the store hydrates from the new key.
 *
 * The copied value is the raw persisted blob (the `{state, version}` wrapper),
 * so each store's own `version`/`migrate` logic still applies unchanged.
 */
export function migrateLegacyLocalStorageKey(oldKey: string, newKey: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (window.localStorage.getItem(newKey) != null) return; // already migrated/native
    const legacy = window.localStorage.getItem(oldKey);
    if (legacy != null) {
      window.localStorage.setItem(newKey, legacy);
      window.localStorage.removeItem(oldKey);
    }
  } catch {
    /* storage unavailable (private mode / lockdown) — nothing to migrate */
  }
}
