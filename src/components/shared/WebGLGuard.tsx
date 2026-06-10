'use client';

import React from 'react';

// WebGL availability is stable for the life of a page load; cache the probe
// so remounts (e.g. the groups 3d/list toggle) don't create a new orphan
// canvas + GL context each cycle (browsers cap live contexts at ~16).
let cachedWebGL: boolean | undefined;

/** True when the browser can actually create a WebGL context. iOS Lockdown
 * Mode and some webviews disable WebGL entirely — without this check an R3F
 * <Canvas> fails after login and blanks the view, which reads as "app broken
 * on iPhone" (indistinguishable from the login bug this app just fixed). */
export function detectWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  if (cachedWebGL !== undefined) return cachedWebGL;
  try {
    const canvas = document.createElement('canvas');
    cachedWebGL = !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    cachedWebGL = false;
  }
  return cachedWebGL;
}

/** Test hook — clears the module-level probe cache. */
export function resetWebGLCacheForTests(): void {
  cachedWebGL = undefined;
}

interface WebGLGuardProps {
  children: React.ReactNode;
  /** Rendered when WebGL is unavailable or the canvas crashes. */
  fallback: React.ReactNode;
}

interface State {
  failed: boolean;
}

/**
 * Error boundary + WebGL feature gate around a react-three-fiber Canvas.
 *
 * Two layers of protection:
 *  1. componentDidMount feature-detects WebGL (client-only, so SSR/prerender
 *     renders children markup harmlessly — the Canvas itself is client-side)
 *     and swaps in the fallback. In practice this wins the race because r3f
 *     defers renderer creation until its ResizeObserver reports a nonzero
 *     size (async, post-commit) — and layer 2 covers any remainder.
 *  2. getDerivedStateFromError catches runtime canvas crashes (context loss,
 *     driver failures, r3f bugs) that slip past the upfront detection.
 *
 * Reporting: a missing-WebGL device is an expected, recoverable environment,
 * not a bug — that case is NOT reported. But a crash while WebGL IS available
 * is a real defect, so componentDidCatch forwards it to /api/error-log like
 * the app-wide ErrorBoundary (best-effort, never awaited).
 */
export class WebGLGuard extends React.Component<WebGLGuardProps, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // GL available yet the canvas crashed → genuine bug, not Lockdown Mode.
    if (!detectWebGL()) return;
    fetch('/api/error-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `[WebGLGuard] canvas crashed with WebGL available: ${error.message}`,
        stack: error.stack ?? null,
        componentStack: info?.componentStack ?? null,
        url: typeof location !== 'undefined' ? location.pathname : null,
        userAgent:
          typeof navigator !== 'undefined' ? navigator.userAgent : 'server',
        timestamp: new Date().toISOString(),
      }),
      credentials: 'same-origin',
    }).catch(() => {
      /* swallow — the fallback is already rendered */
    });
  }

  componentDidMount() {
    if (!detectWebGL()) this.setState({ failed: true });
  }

  render() {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}
