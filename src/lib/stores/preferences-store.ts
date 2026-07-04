'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { migrateLegacyLocalStorageKey } from './migrate-storage';

// Diamond → Gospel Central: carry over saved prefs (theme/language/view/…) across
// the key rename. Runs before the store below hydrates from the new key.
migrateLegacyLocalStorageKey('diamond-preferences', 'gospel-central-preferences');

export type ColorTheme =
  // 'basic' = the attribute-less neutral palette (renamed from 'default' in the
  // v4 prefs migration when Marble became the app default — Decision 8). It
  // still removes `data-theme` from <html>, so its DOM behavior is unchanged.
  | 'basic'
  | 'ocean'
  | 'purple'
  | 'forest'
  | 'sunset'
  | 'rose'
  | 'marble'
  | 'starfield'
  | 'aurora'
  | 'galaxy'
  | 'jellyfish'
  | 'rain'
  | 'matrix'
  | 'constellation'
  | 'synapse'
  | 'deepspace';
export type Language = 'en' | 'es';
export type CalendarView = 'day' | 'week' | 'month';
export type TimeFormat = '12h' | '24h';

/**
 * Animated WebGL backgrounds (React-Bits). This is a SEPARATE axis from
 * `colorTheme`: the palette (colorTheme) owns the accent/surfaces, while
 * `backgroundStyle` owns which animation paints behind everything. When set,
 * the background reads the active palette's CSS tokens at runtime so it is
 * always tinted to the current theme. `'none'` = no animated background
 * (the palette behaves exactly as before).
 */
export type BackgroundStyle =
  | 'none'
  | 'liquid-chrome'
  | 'beams'
  | 'galaxy'
  | 'floating-lines'
  | 'light-pillar'
  | 'prismatic-burst';

/** Per-background user overrides — only keys the user explicitly changed are
 *  stored; everything else falls back to the theme-derived default. */
export type BackgroundConfig = Record<string, Record<string, unknown>>;

export interface NotificationPreferences {
  bookingConfirmations: boolean;
  bookingCancellations: boolean;
  contactStageChanges: boolean;
  weeklySummary: boolean;
}

interface PreferencesState {
  colorTheme: ColorTheme;
  language: Language;
  calendarDefaultView: CalendarView;
  timeFormat: TimeFormat;
  notifications: NotificationPreferences;
  profilePhotoBase64: string | null;
  backgroundStyle: BackgroundStyle;
  backgroundConfig: BackgroundConfig;
  /**
   * 2026-07 overhaul Phase 2 (packet: Dashboard > per-church metrics): the
   * user's saved default church for the DASHBOARD toggle only — contacts/
   * groups stay role-scope-filtered, calendar keeps its own area selector.
   * `null` = no default saved (dashboard opens on the first area). Additive
   * key: no persist-version bump needed (zustand shallow-merges defaults;
   * there is no partialize list to keep in sync).
   */
  dashboardChurchId: string | null;
  /**
   * Toggle-to-revert support (2026-07 UX request): clicking the ALREADY-
   * ACTIVE color theme swatch a second time reverts to whatever was
   * selected immediately before it, rather than doing nothing. These track
   * one step of history per axis — not a full undo stack — and swap on
   * every revert (so repeated clicks on the same two swatches alternate
   * cleanly between them). `null` = no prior value known yet (first-ever
   * selection); reverting is then a no-op. Additive keys: no persist-version
   * bump needed (no partialize list to keep in sync).
   */
  previousColorTheme: ColorTheme | null;
  previousBackgroundStyle: BackgroundStyle | null;
  /**
   * 2026-07 overhaul Phase 6 G1 (packet: Groups > "List view becomes first in
   * nav toggle + allow per-user default view choice"): which Groups view the
   * page OPENS in. Default 'list' (the packet promotes list to primary; 3D
   * stays one tap away). The legacy localStorage key
   * `gospel-central-tree-view` is migrated into this pref once by the groups
   * page on mount, then removed. Additive key: no persist-version bump
   * needed (zustand shallow-merges defaults; no partialize list).
   */
  groupsDefaultView: '3d' | 'list';
  /**
   * 2026-07 overhaul Phase 7 (packet: Settings > Alerts page): the timestamp of
   * the newest alert-relevant event the user has SEEN. The Alerts nav badge
   * counts relevant events with `timestamp > alertsLastSeenAt`; visiting
   * /alerts marks-seen by setting this to the newest relevant event's
   * timestamp. Stored as the event's OWN ISO timestamp (not wall-clock now) so
   * it stays in the same time domain as the audit log — which mixes mock-dated
   * seed entries and real-clock runtime entries. `null` = nothing seen yet
   * (every relevant event counts). Additive key: no persist-version bump.
   */
  alertsLastSeenAt: string | null;

  setColorTheme: (theme: ColorTheme) => void;
  setLanguage: (lang: Language) => void;
  setCalendarDefaultView: (view: CalendarView) => void;
  setTimeFormat: (fmt: TimeFormat) => void;
  setNotification: (key: keyof NotificationPreferences, value: boolean) => void;
  setProfilePhoto: (base64: string | null) => void;
  setBackgroundStyle: (style: BackgroundStyle) => void;
  /** Merge a partial override map for a background; pass {} (or call
   *  resetBackgroundConfig) to clear back to theme-derived colors. */
  setBackgroundConfig: (style: BackgroundStyle, values: Record<string, unknown>) => void;
  resetBackgroundConfig: (style: BackgroundStyle) => void;
  setDashboardChurchId: (areaId: string | null) => void;
  setGroupsDefaultView: (view: '3d' | 'list') => void;
  /** Mark alerts seen up to the given event ISO timestamp (the newest relevant
   *  event at visit time). Pass the event's own timestamp, not wall-clock. */
  setAlertsLastSeen: (iso: string) => void;
}

/**
 * Applies the color theme to the `<html>` element so CSS selectors
 * like `.dark[data-theme="ocean"]` can override custom properties.
 */
export function applyThemeToDOM(theme: ColorTheme) {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  // 'basic' (formerly 'default') is the attribute-less palette — it carries no
  // `data-theme`, so globals.css falls through to the :root/.dark tokens.
  if (theme === 'basic') {
    html.removeAttribute('data-theme');
  } else {
    html.setAttribute('data-theme', theme);
  }
}

/**
 * Applies the animated background to the `<html>` element via a `data-bg`
 * attribute. The `html[data-bg]` CSS in globals.css then gives the app the
 * same dark-glass / transparent-body / content-lift treatment the animated
 * themes use, so the fixed WebGL canvas shows through behind the UI — works
 * on top of ANY palette. `'none'` removes the attribute (no treatment).
 */
export function applyBackgroundToDOM(style: BackgroundStyle) {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  if (style === 'none') {
    html.removeAttribute('data-bg');
  } else {
    html.setAttribute('data-bg', style);
  }
}

/**
 * Persisted-blob migration for the preferences store. Extracted as a named
 * export so the v1/v2/v3→v4 upgrade paths can be unit-tested against
 * hand-crafted blobs (a single-shot prod-storage migration deserves direct
 * coverage). Migrations are cumulative — apply every step whose version the
 * persisted blob predates, then return the upgraded object.
 *   v1→v2: had no background fields; default to no animated background
 *          (keep all other prefs: theme/language/view/timeFormat/…).
 *   v2→v3: removed the 'voronoi' and 'smoke' color themes; a user who had one
 *          selected falls back to the neutral palette so they aren't stranded
 *          on a theme the picker no longer offers.
 *   v3→v4: (2026-07 overhaul Phase 7, Decision 8) Marble becomes the app
 *          default palette. FORCE every pre-v4 blob to Marble regardless of its
 *          prior selection (one-time), AND rename the old 'default' literal →
 *          'basic' anywhere it persisted (colorTheme is force-set, but the
 *          revert-history field can still carry the dead literal → strand a
 *          later revert on a value no longer in the ColorTheme union).
 */
export function migratePreferences(
  persisted: unknown,
  version: number,
): PreferencesState {
  const p = { ...((persisted ?? {}) as Partial<PreferencesState>) };
  if (version < 2) {
    p.backgroundStyle = 'none';
    p.backgroundConfig = {};
  }
  // 'voronoi'/'smoke' were removed from ColorTheme — normalize to the neutral
  // palette. (For version < 4 this is overwritten by the Marble force below,
  // but it keeps the intermediate value inside the union.)
  const stored = p.colorTheme as string | undefined;
  if (stored === 'voronoi' || stored === 'smoke') {
    p.colorTheme = 'basic';
  }
  if (version < 4) {
    p.colorTheme = 'marble';
    // Sanitize the revert-history field too, or a later toggle-to-revert could
    // strand colorTheme on a literal no longer in the ColorTheme union: rename
    // the old default → 'basic', and drop the removed 'voronoi'/'smoke'
    // (null = no revert target, which setColorTheme treats as a no-op).
    const prev = p.previousColorTheme as string | undefined;
    if (prev === 'default') p.previousColorTheme = 'basic';
    else if (prev === 'voronoi' || prev === 'smoke') p.previousColorTheme = null;
  }
  return p as PreferencesState;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set, get) => ({
      // New-user default is Marble (Decision 8 — 2026-07 overhaul Phase 7).
      colorTheme: 'marble',
      language: 'en',
      calendarDefaultView: 'day',
      timeFormat: '12h',
      notifications: {
        bookingConfirmations: true,
        bookingCancellations: true,
        contactStageChanges: true,
        weeklySummary: false,
      },
      profilePhotoBase64: null,
      backgroundStyle: 'none',
      backgroundConfig: {},
      dashboardChurchId: null,
      groupsDefaultView: 'list',
      alertsLastSeenAt: null,
      previousColorTheme: null,
      previousBackgroundStyle: null,

      setColorTheme: (theme) => {
        const current = get().colorTheme;
        // Clicking the already-active swatch again reverts to whatever was
        // selected before it, instead of doing nothing.
        if (theme === current) {
          const prev = get().previousColorTheme;
          if (prev === null || prev === current) return; // nothing to revert to
          applyThemeToDOM(prev);
          set({ colorTheme: prev, previousColorTheme: current });
          return;
        }
        applyThemeToDOM(theme);
        set({ colorTheme: theme, previousColorTheme: current });
      },
      setLanguage: (lang) => set({ language: lang }),
      setCalendarDefaultView: (view) => set({ calendarDefaultView: view }),
      setTimeFormat: (fmt) => set({ timeFormat: fmt }),
      setNotification: (key, value) =>
        set({ notifications: { ...get().notifications, [key]: value } }),
      setProfilePhoto: (base64) => set({ profilePhotoBase64: base64 }),
      setBackgroundStyle: (style) => {
        const current = get().backgroundStyle;
        // Same toggle-to-revert behavior as setColorTheme, including when the
        // active swatch is "None" — clicking it again restores the prior
        // animated background rather than being a permanent one-way switch.
        if (style === current) {
          const prev = get().previousBackgroundStyle;
          if (prev === null || prev === current) return;
          applyBackgroundToDOM(prev);
          set({ backgroundStyle: prev, previousBackgroundStyle: current });
          return;
        }
        applyBackgroundToDOM(style);
        set({ backgroundStyle: style, previousBackgroundStyle: current });
      },
      setBackgroundConfig: (style, values) =>
        set({
          backgroundConfig: {
            ...get().backgroundConfig,
            [style]: { ...(get().backgroundConfig[style] ?? {}), ...values },
          },
        }),
      resetBackgroundConfig: (style) => {
        const next = { ...get().backgroundConfig };
        delete next[style];
        set({ backgroundConfig: next });
      },
      setDashboardChurchId: (areaId) => set({ dashboardChurchId: areaId }),
      setGroupsDefaultView: (view) => set({ groupsDefaultView: view }),
      setAlertsLastSeen: (iso) => set({ alertsLastSeenAt: iso }),
    }),
    {
      name: 'gospel-central-preferences',
      // v4 (2026-07 overhaul Phase 7): Marble force + 'default'→'basic' rename.
      // See migratePreferences above (extracted for unit testing).
      version: 4,
      migrate: (persisted, version) => migratePreferences(persisted, version),
    },
  ),
);
