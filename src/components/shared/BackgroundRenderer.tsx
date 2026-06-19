'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo } from 'react';
import {
  usePreferencesStore,
  type BackgroundStyle,
} from '@/lib/stores/preferences-store';
import type { BackgroundId } from '@/lib/background/schemas';
import { buildBackgroundProps } from '@/lib/background/props';
import { useThemeColors } from './useThemeColors';
import { WebGLGuard } from './WebGLGuard';

// ssr:false — these are WebGL components and must never run on the server.
const LiquidChrome = dynamic(() => import('@/components/backgrounds/LiquidChrome'), { ssr: false });
const Beams = dynamic(() => import('@/components/backgrounds/Beams'), { ssr: false });
const Galaxy = dynamic(() => import('@/components/backgrounds/Galaxy'), { ssr: false });
const FloatingLines = dynamic(() => import('@/components/backgrounds/FloatingLines'), { ssr: false });
const LightPillar = dynamic(() => import('@/components/backgrounds/LightPillar'), { ssr: false });
const PrismaticBurst = dynamic(() => import('@/components/backgrounds/PrismaticBurst'), { ssr: false });

// Dynamic dispatch table. Each value is a ComponentType with its own Props
// interface; we drive them with a runtime-built prop bag, so the table is typed
// to the common "accepts a prop bag" shape (a deliberate, localized typing for
// the dispatch — not `as any`).
const COMPONENTS = {
  'liquid-chrome': LiquidChrome,
  beams: Beams,
  galaxy: Galaxy,
  'floating-lines': FloatingLines,
  'light-pillar': LightPillar,
  'prismatic-burst': PrismaticBurst,
} as unknown as Record<BackgroundId, React.ComponentType<Record<string, unknown>>>;

interface BackgroundRendererProps {
  /** Override the persisted style (used by the customizer preview). */
  style?: BackgroundStyle;
  /** Override the persisted per-background config (customizer preview). */
  config?: Record<string, unknown>;
  /** Enable the background's mouse/touch interactivity. Default false. */
  interactive?: boolean;
  /**
   * true (default): pinned full-viewport behind everything at z-index 0.
   * false: fills its parent (the customizer preview stage).
   */
  fixed?: boolean;
}

/**
 * Renders the active animated background, tinted to the current theme. Mounted
 * globally by `ThemeEffects` when `backgroundStyle !== 'none'`. The `html[data-bg]`
 * CSS gives the app the transparent-body + content-lift + dark-glass treatment
 * so this fixed canvas shows through behind the UI on any palette.
 */
export function BackgroundRenderer({
  style: styleProp,
  config: configProp,
  interactive = false,
  fixed = true,
}: BackgroundRendererProps) {
  const storeStyle = usePreferencesStore((s) => s.backgroundStyle);
  const storeConfig = usePreferencesStore((s) => s.backgroundConfig);
  const colors = useThemeColors();
  const style = styleProp ?? storeStyle;
  const id: BackgroundId | null = style === 'none' ? null : (style as BackgroundId);
  const overrides = configProp ?? (id ? storeConfig[id] : undefined);

  // Beams uses @react-three/fiber, whose <Canvas> auto-sizes from a window
  // resize (react-use-measure) — but the component arrives via an async
  // dynamic import, so a few fixed early nudges can all fire before it has
  // mounted, leaving the canvas stuck at the 300×150 default. Poll a resize
  // every 200ms until the bg canvas is actually sized (or we give up), which
  // is robust to however long the chunk takes to load. No-op for the others
  // (the ogl/three ones size themselves on mount).
  useEffect(() => {
    if (style !== 'beams' || typeof window === 'undefined') return;
    let tries = 0;
    const iv = window.setInterval(() => {
      window.dispatchEvent(new Event('resize'));
      tries += 1;
      const c = document.querySelector('[aria-hidden] canvas') as HTMLCanvasElement | null;
      if (tries >= 25 || (c && c.width > 400)) window.clearInterval(iv);
    }, 200);
    return () => window.clearInterval(iv);
  }, [style]);

  // Memoize the prop bag so the color array/object props keep a STABLE identity
  // across re-renders. themePropsFor() builds fresh arrays each call, so without
  // this the components' WebGL init effects (esp. FloatingLines' linesGradient
  // dep) would tear down + recreate the GL context on every unrelated re-render.
  const props = useMemo(
    () => (id ? buildBackgroundProps(id, colors, overrides, { interactive }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, interactive, JSON.stringify(colors), JSON.stringify(overrides)],
  );

  if (!id || !props) return null;
  const Comp = COMPONENTS[id];
  if (!Comp) return null;

  // Decorative layer wrapped in WebGLGuard: on WebGL-off engines (iOS Lockdown
  // Mode / locked-down webviews) or a canvas crash, render nothing instead of
  // throwing and taking the whole page down. Keyed by style so switching resets
  // the boundary + remounts the component (re-tint flows via the component's own
  // prop effects, no flicker).
  const inner = (
    <WebGLGuard key={id} fallback={null}>
      <Comp {...props} />
    </WebGLGuard>
  );

  if (!fixed) return inner;

  return (
    <div
      aria-hidden
      style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}
    >
      {inner}
    </div>
  );
}
