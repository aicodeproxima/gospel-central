'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

      setColorTheme: (theme) => {
        applyThemeToDOM(theme);
        set({ colorTheme: theme });
      },
      setLanguage: (lang) => set({ language: lang }),
      setCalendarDefaultView: (view) => set({ calendarDefaultView: view }),
      setTimeFormat: (fmt) => set({ timeFormat: fmt }),
      setNotification: (key, value) =>
        set({ notifications: { ...get().notifications, [key]: value } }),
      setProfilePhoto: (base64) => set({ profilePhotoBase64: base64 }),
      setBackgroundStyle: (style) => {
        applyBackgroundToDOM(style);
        set({ backgroundStyle: style });
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
    }),
    {
      name: 'diamond-preferences',
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
