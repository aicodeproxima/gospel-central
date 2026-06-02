'use client';

import { useEffect, useState } from 'react';

export function MSWProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Mock mode is default-ON for this backend-less demo: a missing build-env
    // (e.g. a Vercel preview that didn't inherit NEXT_PUBLIC_MOCK_API) must
    // still mock, or every fetch hits a non-existent backend and the whole UI
    // shows "Failed to fetch". Set NEXT_PUBLIC_MOCK_API=false explicitly once a
    // real backend is wired.
    if (process.env.NEXT_PUBLIC_MOCK_API === 'false') {
      setReady(true);
      return;
    }

    let cancelled = false;
    import('@/mocks/browser').then(({ worker }) => {
      worker.start({ onUnhandledRequest: 'bypass' }).then(async () => {
        // worker.start() resolves when the SW is *activated*, not when it
        // *controls* this page. On a real (slower) device, components can mount
        // and fetch before the SW claims the client — those requests escape the
        // mock to the dead backend. Wait for control; if still uncontrolled,
        // reload once (guarded) so the reloaded page starts controlled.
        if (
          typeof navigator !== 'undefined' &&
          'serviceWorker' in navigator &&
          !navigator.serviceWorker.controller
        ) {
          const RELOAD_FLAG = 'msw-reloaded-once';
          if (!sessionStorage.getItem(RELOAD_FLAG)) {
            sessionStorage.setItem(RELOAD_FLAG, '1');
            window.location.reload();
            return;
          }
        }
        if (!cancelled) setReady(true);
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return <>{children}</>;
}
