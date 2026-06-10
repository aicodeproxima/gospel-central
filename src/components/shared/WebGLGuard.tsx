'use client';

import React from 'react';

/** True when the browser can actually create a WebGL context. iOS Lockdown
 * Mode and some webviews disable WebGL entirely — without this check an R3F
 * <Canvas> fails after login and blanks the view, which reads as "app broken
 * on iPhone" (indistinguishable from the login bug this app just fixed). */
export function detectWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
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
 *     and swaps in the fallback BEFORE r3f ever asks for a GL context.
 *  2. getDerivedStateFromError catches runtime canvas crashes (context loss,
 *     driver failures) that slip past the upfront detection.
 *
 * Kept self-contained on purpose — unlike the app-wide ErrorBoundary it does
 * not report to /api/error-log: a missing-WebGL device is an expected,
 * recoverable environment, not a bug.
 */
export class WebGLGuard extends React.Component<WebGLGuardProps, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidMount() {
    if (!detectWebGL()) this.setState({ failed: true });
  }

  render() {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}
