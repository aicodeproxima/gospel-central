'use client';

import { Component, type ReactNode } from 'react';
import type { User } from '@/lib/types';

/**
 * ErrorBoundary — durable insurance for per-user bugs.
 *
 * The audit pinned permission/scope/data invariants for 12 representative
 * seed users in `src/mocks/per-user-smoke.test.ts`. But the seed roster is
 * a small slice of what real production users will look like (different
 * tag combinations, longer names with diacritics, edge browser states,
 * profile-photo upload races, etc.).
 *
 * This boundary catches React render / lifecycle errors anywhere in the
 * authenticated app and POSTs a structured report to `/api/error-log`
 * with the current viewer's id/role and the URL. Mike's backend swaps
 * MSW for Sentry/Datadog/etc.; the contract stays the same.
 *
 * Usage:
 *   <ErrorBoundary viewer={user} url={pathname}>
 *     ...children...
 *   </ErrorBoundary>
 *
 * The wrapping functional parent supplies the viewer (read via Zustand)
 * — class components can't use hooks, so we pass it down as a prop.
 */
interface Props {
  /** Current authenticated user (may be null on logout flicker). */
  viewer: User | null | undefined;
  /** Current URL — usePathname() in the parent. */
  url: string;
  children: ReactNode;
  /** Optional override for the report endpoint. Defaults to /api/error-log. */
  endpoint?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // Best-effort POST to the error-log endpoint. We deliberately do not
    // await — if the network is also down (the most common reason a real
    // production user surfaces a render bug), the boundary still renders
    // its fallback UI without blocking on a failed fetch.
    const endpoint = this.props.endpoint ?? '/api/error-log';
    const payload = {
      message: error.message,
      stack: error.stack ?? null,
      componentStack: info?.componentStack ?? null,
      viewerId: this.props.viewer?.id ?? 'anonymous',
      viewerRole: this.props.viewer?.role ?? 'anonymous',
      viewerUsername: this.props.viewer?.username ?? null,
      url: this.props.url,
      userAgent:
        typeof navigator !== 'undefined' ? navigator.userAgent : 'server',
      timestamp: new Date().toISOString(),
    };
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      // Keep credentials so MSW can resolveViewer in dev / prod alike.
      credentials: 'same-origin',
    }).catch(() => {
      /* swallow — we already have the fallback rendered */
    });

    // Echo to console for dev visibility (real backend strips this in prod).
    if (typeof console !== 'undefined') {
      console.error('[ErrorBoundary]', payload);
    }
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center p-6">
          <div className="max-w-md rounded-lg border border-destructive/30 bg-card p-6 shadow-lg">
            <h2 className="mb-2 text-lg font-semibold text-foreground">
              Something went wrong
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">
              The page hit an unexpected error. The team has been notified
              with a copy of what happened.
            </p>
            <details className="mb-4 text-xs text-muted-foreground">
              <summary className="cursor-pointer">Technical details</summary>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 font-mono text-[10px]">
                {this.state.error.message}
              </pre>
            </details>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => window.location.assign('/dashboard')}
                className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
              >
                Back to dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
