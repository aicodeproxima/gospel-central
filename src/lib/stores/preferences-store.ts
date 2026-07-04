'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { migrateLegacyLocalStorageKey } from './migrate-storage';

// Diamond → Gospel Central: carry over saved prefs (theme/language/view/…) across
// the key rename. Runs before the store below hydrates from the new key.
migrateLegacyLocalStorageKey('diamond-preferences', 'gospel-central-preferences');

export type ColorTheme =
  | 'default'
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
}

/**
 * Applies the color theme to the `<html>` element so CSS selectors
 * like `.dark[data-theme="ocean"]` can override custom properties.
 */
export function applyThemeToDOM(theme: ColorTheme) {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  if (theme === 'default') {
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

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set, get) => ({
      colorTheme: 'default',
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
    }),
    {
      name: 'gospel-central-preferences',
      version: 3,
      // Migrations are cumulative — apply every step whose version the
      // persisted blob predates, then return the upgraded object.
      //   v1→v2: had no background fields; default to no animated background
      //          (keep all other prefs: theme/language/view/timeFormat/…).
      //   v2→v3: removed the 'voronoi' and 'smoke' color themes; a user who
      //          had one selected falls back to 'default' so they aren't
      //          stranded on a theme the picker no longer offers and that no
      //          longer exists in the ColorTheme union.
      migrate: (persisted, version) => {
        const p = { ...((persisted ?? {}) as Partial<PreferencesState>) };
        if (version < 2) {
          p.backgroundStyle = 'none';
          p.backgroundConfig = {};
        }
        // 'voronoi'/'smoke' were removed from ColorTheme — cast to string to
        // compare against the now-nonexistent literals, then fall back to the
        // default palette so the persisted value is valid again.
        const stored = p.colorTheme as string | undefined;
        if (stored === 'voronoi' || stored === 'smoke') {
          p.colorTheme = 'default';
        }
        return p as PreferencesState;
      },
    },
  ),
);
