'use client';

import { useEffect } from 'react';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'react-hot-toast';
import { MSWProvider } from './MSWProvider';
import {
  usePreferencesStore,
  applyThemeToDOM,
  applyBackgroundToDOM,
} from '@/lib/stores/preferences-store';
import { GoldStarTrail } from './GoldStarTrail';
import { ThemedBackground, ANIMATED_DARK_THEMES, ANIMATED_LIGHT_THEMES } from './ThemedBackground';
import { BackgroundRenderer } from './BackgroundRenderer';

/**
 * Applies the persisted color theme on mount so the CSS custom
 * properties are set before the first paint.
 */
function ThemeApplier() {
  const colorTheme = usePreferencesStore((s) => s.colorTheme);
  useEffect(() => {
    applyThemeToDOM(colorTheme);
  }, [colorTheme]);
  return null;
}

/**
 * Applies the persisted animated-background choice to <html data-bg> so the
 * `html[data-bg]` CSS (transparent body + content lift + dark glass) is in
 * place before the BackgroundRenderer mounts.
 */
function BackgroundApplier() {
  const backgroundStyle = usePreferencesStore((s) => s.backgroundStyle);
  useEffect(() => {
    applyBackgroundToDOM(backgroundStyle);
  }, [backgroundStyle]);
  return null;
}

/**
 * Mounts per-theme visual effects. Each effect subtree is conditionally
 * rendered so it fully unmounts (and tears down listeners/canvas) the
 * moment the user switches themes.
 */
function ThemeEffects() {
  const colorTheme = usePreferencesStore((s) => s.colorTheme);
  const backgroundStyle = usePreferencesStore((s) => s.backgroundStyle);

  // An explicitly chosen animated background takes precedence over the theme's
  // own canvas (so the two never stack) and renders on EVERY page, including
  // Groups. It reads the active palette tokens, so it stays theme-tinted. On
  // Groups it coexists with the 3D tree's WebGL context = 2 total, well within
  // the browser cap; the rapid-churn risk is handled in the customizer.
  if (backgroundStyle !== 'none') {
    return (
      <>
        <BackgroundRenderer />
        {colorTheme === 'marble' && <GoldStarTrail />}
      </>
    );
  }

  if (colorTheme === 'marble') {
    return <GoldStarTrail />;
  }
  const isDark = ANIMATED_DARK_THEMES.has(colorTheme);
  const isLight = ANIMATED_LIGHT_THEMES.has(colorTheme);
  if (isDark || isLight) {
    return (
      <>
        <ThemedBackground theme={colorTheme} fixed />
        {/* Gold trail only on the two "space" themes */}
        {(colorTheme === 'starfield' || colorTheme === 'deepspace') && <GoldStarTrail />}
      </>
    );
  }
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MSWProvider>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <ThemeApplier />
        <BackgroundApplier />
        <ThemeEffects />
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            className: '!bg-card !text-card-foreground !border !border-border',
            duration: 3000,
          }}
        />
      </ThemeProvider>
    </MSWProvider>
  );
}
