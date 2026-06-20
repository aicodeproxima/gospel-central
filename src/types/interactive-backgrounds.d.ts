// Ambient module declarations for all interactive background packages.
// NOTE: no top-level imports — keeps this file an ambient (global) script
// so `declare module` creates new module shims rather than augmenting.

declare module 'interactive-aurora-background' {
  import type { ComponentType, CSSProperties } from 'react';
  export interface AuroraBackgroundProps {
    fixed?: boolean;
    zIndex?: number;
    className?: string;
    style?: CSSProperties;
    maxDpr?: number;
    stripCount?: number;
    hueRange?: [number, number];
    speed?: number;
  }
  export const AuroraBackground: ComponentType<AuroraBackgroundProps>;
  const def: ComponentType<AuroraBackgroundProps>;
  export default def;
}

declare module 'interactive-galaxy-swirl-background' {
  import type { ComponentType, CSSProperties } from 'react';
  export interface GalaxySwirlBackgroundProps {
    fixed?: boolean;
    zIndex?: number;
    className?: string;
    style?: CSSProperties;
    maxDpr?: number;
    particleCount?: number;
    armCount?: number;
    twist?: number;
    spinSpeed?: number;
    hueRange?: [number, number];
  }
  export const GalaxySwirlBackground: ComponentType<GalaxySwirlBackgroundProps>;
  const def: ComponentType<GalaxySwirlBackgroundProps>;
  export default def;
}

declare module 'interactive-jellyfish-background' {
  import type { ComponentType, CSSProperties } from 'react';
  export interface JellyfishBackgroundProps {
    fixed?: boolean;
    zIndex?: number;
    className?: string;
    style?: CSSProperties;
    maxDpr?: number;
    jellyCount?: number;
    tendrilsPerJelly?: number;
    segmentsPerTendril?: number;
    hueRange?: [number, number];
    interactive?: boolean;
  }
  export const JellyfishBackground: ComponentType<JellyfishBackgroundProps>;
  const def: ComponentType<JellyfishBackgroundProps>;
  export default def;
}

declare module 'interactive-rain-background' {
  import type { ComponentType, CSSProperties } from 'react';
  export interface RainBackgroundProps {
    fixed?: boolean;
    zIndex?: number;
    className?: string;
    style?: CSSProperties;
    maxDpr?: number;
    dropCount?: number;
    mode?: 'rain' | 'snow';
    gravity?: number;
    windStrength?: number;
    color?: string;
    interactive?: boolean;
  }
  export const RainBackground: ComponentType<RainBackgroundProps>;
  const def: ComponentType<RainBackgroundProps>;
  export default def;
}

declare module 'interactive-matrix-rain-background' {
  import type { ComponentType, CSSProperties } from 'react';
  export interface MatrixRainBackgroundProps {
    fixed?: boolean;
    zIndex?: number;
    className?: string;
    style?: CSSProperties;
    maxDpr?: number;
    fontSize?: number;
    hue?: number;
    glyphs?: string;
    fadeAlpha?: number;
  }
  export const MatrixRainBackground: ComponentType<MatrixRainBackgroundProps>;
  const def: ComponentType<MatrixRainBackgroundProps>;
  export default def;
}

declare module 'interactive-constellation-background' {
  import type { ComponentType, CSSProperties } from 'react';
  export interface ConstellationBackgroundProps {
    fixed?: boolean;
    zIndex?: number;
    className?: string;
    style?: CSSProperties;
    maxDpr?: number;
    dotCount?: number;
    linkDistance?: number;
    hue?: number;
    interactive?: boolean;
  }
  export const ConstellationBackground: ComponentType<ConstellationBackgroundProps>;
  const def: ComponentType<ConstellationBackgroundProps>;
  export default def;
}

declare module 'interactive-neural-synapse-background' {
  import type { ComponentType, CSSProperties } from 'react';
  export interface NeuralSynapseBackgroundProps {
    fixed?: boolean;
    zIndex?: number;
    className?: string;
    style?: CSSProperties;
    maxDpr?: number;
    nodeCount?: number;
    firingRange?: number;
    fireChance?: number;
    hue?: number;
    interactive?: boolean;
  }
  export const NeuralSynapseBackground: ComponentType<NeuralSynapseBackgroundProps>;
  const def: ComponentType<NeuralSynapseBackgroundProps>;
  export default def;
}

declare module 'interactive-deepspace-background' {
  import type { ComponentType, CSSProperties } from 'react';
  export interface DeepSpaceBackgroundProps {
    fixed?: boolean;
    zIndex?: number;
    className?: string;
    style?: CSSProperties;
    maxDpr?: number;
    starCount?: number;
    galaxyCount?: number;
    shootingStarCount?: number;
  }
  export const DeepSpaceBackground: ComponentType<DeepSpaceBackgroundProps>;
  const def: ComponentType<DeepSpaceBackgroundProps>;
  export default def;
}
