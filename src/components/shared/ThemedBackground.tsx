'use client';

import dynamic from 'next/dynamic';
import type { ColorTheme } from '@/lib/stores/preferences-store';

// Each background is dynamically imported with ssr: false so the canvas
// code never runs on the server. They share a common "fullscreen fixed
// canvas" convention and all accept an optional `fixed` prop.
const Starfield = dynamic(
  () => import('interactive-star-background').then((m) => m.ParticleBackground ?? m.default),
  { ssr: false },
);
const Aurora = dynamic(
  () => import('interactive-aurora-background').then((m) => m.AuroraBackground ?? m.default),
  { ssr: false },
);
const Galaxy = dynamic(
  () =>
    import('interactive-galaxy-swirl-background').then(
      (m) => m.GalaxySwirlBackground ?? m.default,
    ),
  { ssr: false },
);
const Jellyfish = dynamic(
  () =>
    import('interactive-jellyfish-background').then((m) => m.JellyfishBackground ?? m.default),
  { ssr: false },
);
const Rain = dynamic(
  () => import('interactive-rain-background').then((m) => m.RainBackground ?? m.default),
  { ssr: false },
);
const Matrix = dynamic(
  () =>
    import('interactive-matrix-rain-background').then(
      (m) => m.MatrixRainBackground ?? m.default,
    ),
  { ssr: false },
);
const Constellation = dynamic(
  () =>
    import('interactive-constellation-background').then(
      (m) => m.ConstellationBackground ?? m.default,
    ),
  { ssr: false },
);
const Synapse = dynamic(
  () =>
    import('interactive-neural-synapse-background').then(
      (m) => m.NeuralSynapseBackground ?? m.default,
    ),
  { ssr: false },
);
const DeepSpace = dynamic(
  () =>
    import('interactive-deepspace-background').then((m) => m.DeepSpaceBackground ?? m.default),
  { ssr: false },
);

interface ThemedBackgroundProps {
  theme: ColorTheme;
  /** Pin canvas to viewport when true; fill parent when false. */
  fixed?: boolean;
}

/**
 * Returns the right canvas background for an animated theme. Returns null
 * for themes that don't have a canvas (default, ocean, etc. — just palettes).
 */
export function ThemedBackground({ theme, fixed = true }: ThemedBackgroundProps) {
  switch (theme) {
    case 'starfield':
      return (
        <Starfield
          fixed={fixed}
          zIndex={0}
          starHueRange={[260, 300]}
          particleHueRange={[265, 305]}
          mouseGlowHue={280}
        />
      );
    case 'aurora':
      return <Aurora fixed={fixed} zIndex={0} stripCount={7} hueRange={[140, 300]} />;
    case 'galaxy':
      return <Galaxy fixed={fixed} zIndex={0} particleCount={1200} armCount={4} />;
    case 'jellyfish':
      return (
        <Jellyfish
          fixed={fixed}
          zIndex={0}
          jellyCount={6}
          tendrilsPerJelly={6}
          hueRange={[170, 260]}
        />
      );
    case 'rain':
      return <Rain fixed={fixed} zIndex={0} dropCount={400} mode="rain" />;
    case 'matrix':
      return <Matrix fixed={fixed} zIndex={0} fontSize={18} hue={140} />;
    case 'constellation':
      return (
        <Constellation fixed={fixed} zIndex={0} dotCount={90} linkDistance={140} hue={210} />
      );
    case 'synapse':
      return <Synapse fixed={fixed} zIndex={0} nodeCount={70} hue={195} />;
    case 'deepspace':
      return (
        <DeepSpace
          fixed={fixed}
          zIndex={0}
          starCount={600}
          galaxyCount={4}
          shootingStarCount={22}
        />
      );
    default:
      return null;
  }
}

/**
 * The set of themes that paint a dark, animated canvas behind everything.
 * Used to decide whether app content needs the "transparent body + z-index
 * stacking" treatment like the starfield theme already uses.
 */
export const ANIMATED_DARK_THEMES: ReadonlySet<ColorTheme> = new Set<ColorTheme>([
  'starfield',
  'galaxy',
  'jellyfish',
  'rain',
  'matrix',
  'constellation',
  'synapse',
  'deepspace',
]);

/** Themes that animate but with a lighter/colored base (need different glass treatment). */
export const ANIMATED_LIGHT_THEMES: ReadonlySet<ColorTheme> = new Set<ColorTheme>([
  'aurora',
]);
