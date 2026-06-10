'use client';

import { useEffect, useState } from 'react';

import { isDeadBackendBuild } from './mock-guard';

const MOCK = process.env.NEXT_PUBLIC_MOCK_API === 'true';

// Build-time-inlined env, stable for the life of the bundle: a build with
// the mock OFF whose API_BASE still points at the localhost dev fallback
// can never reach a backend. Self-announce instead of letting every fetch
// die and surface fake auth errors (the original iPhone trap).
const DEAD_BACKEND = isDeadBackendBuild();

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

  // Evict any service worker left over from pre-Loop-10 builds that
  // registered mockServiceWorker.js — on a returning device (esp. iOS
  // Safari) a stale SW would otherwise keep intercepting fetches with the
  // OLD broken logic. The app itself registers no service worker anymore.
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => {});
    }
  }, []);

  // Warn — don't block the app — when this artifact shipped without env
  // flags (mock off + localhost API base): every fetch will die, so tell
  // the user instead of faking "Invalid credentials".
  const banner = DEAD_BACKEND ? (
    <div className="fixed inset-x-0 top-0 z-[9999] bg-amber-500 px-4 py-2 text-center text-sm font-medium text-black">
      Demo data isn’t active on this build — open the mock preview link instead.
    </div>
  ) : null;

  if (!ready) {
    return (
      <>
        {banner}
        <div className="flex min-h-dvh items-center justify-center bg-background">
          <div className="animate-pulse text-muted-foreground">Loading…</div>
        </div>
      </>
    );
  }

  return (
    <>
      {banner}
      {children}
    </>
  );
}
