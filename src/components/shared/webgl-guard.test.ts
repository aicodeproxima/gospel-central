/**
 * Pins the WebGL feature detection that gates every r3f <Canvas> mount.
 *
 * iOS Lockdown Mode (and some WKWebView contexts) disables WebGL entirely;
 * without detectWebGL() an R3F Canvas fails AFTER a successful login and
 * blanks the view — users report it as "app broken on iPhone",
 * indistinguishable from the login bug this app just fixed.
 *
 * Scope note: only detectWebGL() is tested here. The WebGLGuard boundary's
 * render/fallback path needs a DOM renderer (@testing-library/react +
 * happy-dom), which this suite intentionally doesn't install — the vitest
 * environment is plain node (see vitest.config.ts). The boundary logic is
 * a thin getDerivedStateFromError/componentDidMount shell around this
 * detector, so the detector carries the behavioral weight.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectWebGL } from './WebGLGuard';

describe('detectWebGL', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns false when document is undefined (SSR / node env)', () => {
    // The vitest node environment has no DOM — exactly the SSR/prerender
    // case the typeof guard exists for.
    expect(typeof document).toBe('undefined');
    expect(detectWebGL()).toBe(false);
  });

  it('returns false when createElement throws (locked-down webview)', () => {
    vi.stubGlobal('document', {
      createElement: () => {
        throw new Error('canvas creation blocked');
      },
    });
    expect(detectWebGL()).toBe(false);
  });

  it('returns false when no GL context is available (Lockdown Mode)', () => {
    // Lockdown Mode behavior: <canvas> exists but getContext('webgl'/'webgl2')
    // returns null.
    vi.stubGlobal('document', {
      createElement: () => ({ getContext: () => null }),
    });
    expect(detectWebGL()).toBe(false);
  });

  it('returns true when a WebGL context can be created', () => {
    vi.stubGlobal('document', {
      createElement: () => ({
        getContext: (kind: string) => (kind === 'webgl' ? {} : null),
      }),
    });
    expect(detectWebGL()).toBe(true);
  });
});
