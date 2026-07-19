/**
 * SW-FREE mock network layer.
 *
 * Previously this exported an MSW `setupWorker(...)` worker, which intercepts
 * requests through a **service worker**. iOS Safari is chronically unreliable
 * about downloading/keeping service workers (script not fetched, SW evicted by
 * memory management), so on real iPhones the SW never claimed the page → the
 * login `fetch` escaped to the dead real backend → was caught and surfaced as
 * the misleading "Invalid credentials" toast.
 *
 * Instead we patch `window.fetch` + `XMLHttpRequest` IN-PAGE with
 * `@mswjs/interceptors` (the low-level library MSW itself is built on) and route
 * matched requests through the existing MSW `handlers` via MSW's public
 * `getResponse()` helper. No service worker, no registration, no reload — works
 * in any browser, in-app webview, or Private mode, on any device. Bonus: it is
 * actually verifiable from Chromium because there is no SW involved.
 *
 * NOTE: we import the interceptor classes from their own subpaths rather than
 * the `presets/browser` bundle. That preset only declares `browser`/`node:null`
 * conditions, so Turbopack's SSR pass (which compiles client components for the
 * server too) can't resolve it. The `/fetch` and `/XMLHttpRequest` subpaths add
 * `import`/`default` fallbacks, so they resolve for both the browser and SSR
 * builds; only the browser build is ever executed (apply() runs client-side).
 */
import { BatchInterceptor } from '@mswjs/interceptors';
import { FetchInterceptor } from '@mswjs/interceptors/fetch';
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest';
import { getResponse } from 'msw';
import { handlers, initMockPersistence, scheduleMockSnapshot } from './handlers';

const interceptor = new BatchInterceptor({
  name: 'gospel-central-mock-network',
  interceptors: [new FetchInterceptor(), new XMLHttpRequestInterceptor()],
});

let started = false;

/**
 * Patch fetch/XHR and route matched requests to the mock handlers.
 *
 * Idempotent — safe to call more than once. Interception is active the moment
 * `interceptor.apply()` returns (synchronous), so the caller can render
 * immediately without racing a not-yet-controlling service worker.
 */
export function startMockNetwork(): void {
  if (started) return;
  started = true;

  // Rehydrate per-device state BEFORE the first request is served — created
  // accounts and edits survive reload + logout on this device (2026-07-18).
  initMockPersistence();
  interceptor.apply();
  interceptor.on('request', async ({ request, controller }) => {
    try {
      // Clone so a matched handler that reads the body never consumes the
      // original request that an unmatched (passthrough) path still needs.
      const response = await getResponse(handlers, request.clone());
      if (response) {
        controller.respondWith(response);
        // Persist whatever the handler just mutated (debounced inside).
        scheduleMockSnapshot();
      }
      // No match → don't respond; the request passes through to the real
      // network (mirrors the previous `onUnhandledRequest: 'bypass'`).
    } catch {
      // A resolver threw — let the request pass through rather than hang it.
    }
  });
}
