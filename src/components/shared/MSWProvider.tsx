'use client';

import { useEffect, useState } from 'react';

const MOCK = process.env.NEXT_PUBLIC_MOCK_API === 'true';
const RELOAD_FLAG = 'msw-reloaded-for-sw-control';

/**
 * Wait until the MSW service worker actually CONTROLS this page.
 *
 * `worker.start()` only guarantees the SW is registered + activated — it does
 * NOT guarantee the SW is controlling the page that registered it. On a slower
 * device (real mobile) the data components can mount and `fetch()` before the
 * SW claims the client, so the request escapes to the dead real backend →
 * "Failed to fetch". We wait for `navigator.serviceWorker.controller`; if it
 * still hasn't claimed us after a short budget, reload ONCE — a freshly-loaded
 * page is controlled by an already-active SW. A sessionStorage guard prevents
 * any reload loop.
 */
async function ensureControlled(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (navigator.serviceWorker.controller) return;

  await new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    navigator.serviceWorker.addEventListener('controllerchange', done, { once: true });
    setTimeout(done, 3000); // budget — don't hang the splash forever
  });

  if (!navigator.serviceWorker.controller) {
    try {
      if (!sessionStorage.getItem(RELOAD_FLAG)) {
        sessionStorage.setItem(RELOAD_FLAG, '1');
        window.location.reload();
        // The reload tears down this context; block so we never setReady first.
        await new Promise<void>(() => {});
      }
    } catch {
      /* sessionStorage unavailable — fall through and render anyway */
    }
  }
}

export function MSWProvider({ children }: { children: React.ReactNode }) {
  // Non-mock builds (real backend) never gate.
  const [ready, setReady] = useState(!MOCK);

  useEffect(() => {
    if (!MOCK) return;
    let cancelled = false;
    (async () => {
      const { worker } = await import('@/mocks/browser');
      await worker.start({ onUnhandledRequest: 'bypass' });
      await ensureControlled();
      if (cancelled) return;
      try {
        sessionStorage.removeItem(RELOAD_FLAG);
      } catch {
        /* noop */
      }
      setReady(true);
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
