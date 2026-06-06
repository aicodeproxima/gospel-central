'use client';

import { useEffect, useState } from 'react';

const MOCK = process.env.NEXT_PUBLIC_MOCK_API === 'true';

/**
 * Starts the SW-FREE mock network (see `src/mocks/browser.ts`) before rendering
 * the app in mock mode.
 *
 * Patching `window.fetch`/XHR in-page is synchronous, so once the dynamic import
 * resolves the interception is already active and we can render immediately.
 * There is deliberately NO service-worker "is it controlling the page yet?"
 * gate and NO one-time reload here — both were iOS-Safari failure points (the
 * SW frequently never claimed the page on real iPhones, so the splash hung or
 * the first fetch escaped to the dead backend).
 */
export function MSWProvider({ children }: { children: React.ReactNode }) {
  // Non-mock builds (real backend) never gate.
  const [ready, setReady] = useState(!MOCK);

  useEffect(() => {
    if (!MOCK) return;
    let cancelled = false;
    (async () => {
      const { startMockNetwork } = await import('@/mocks/browser');
      startMockNetwork();
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return <>{children}</>;
}
