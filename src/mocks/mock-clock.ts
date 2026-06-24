/**
 * Deterministic clock for the in-page mock SEED.
 *
 * The scenario seed (`scenario-church-week.ts`) lays out bookings/contacts/blocked
 * slots RELATIVE to "now" (`new Date()`), so without pinning, automated tests and
 * E2E runs drift by day. This module lets the clock be overridden:
 *   - `globalThis.__MOCK_DATE__` (set by the vitest integration setup, or a
 *     Playwright `addInitScript`, BEFORE this module loads),
 *   - a `?__mockDate=<ISO>` query param (browser / E2E),
 *   - the `NEXT_PUBLIC_MOCK_DATE` env var,
 *   - or `setMockNow(d)` at runtime.
 *
 * In PRODUCTION none of these are set, so `now()`/`nowMs()` are exactly
 * `new Date()`/`Date.now()` — zero behavior change. The override is read EAGERLY at
 * module init so it is in place before the seed module (which imports this) computes
 * its dates. Only the seed uses this; live mutation timestamps stay real.
 */

let override: number | null = null;

function parse(v: string | number | undefined | null): number | null {
  if (v == null) return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}

function readInitialOverride(): number | null {
  // 1. Explicit global (vitest setup / Playwright initScript set this first).
  const g = (globalThis as { __MOCK_DATE__?: string | number }).__MOCK_DATE__;
  const fromGlobal = parse(g);
  if (fromGlobal != null) return fromGlobal;
  // 2. `?__mockDate=` query param in the browser.
  if (typeof window !== 'undefined' && window.location?.search) {
    const fromParam = parse(new URLSearchParams(window.location.search).get('__mockDate'));
    if (fromParam != null) return fromParam;
  }
  // 3. NEXT_PUBLIC_MOCK_DATE env.
  const fromEnv = parse(
    typeof process !== 'undefined' ? process.env?.NEXT_PUBLIC_MOCK_DATE : undefined,
  );
  if (fromEnv != null) return fromEnv;
  return null;
}

override = readInitialOverride();

/** Pin (or clear with `null`) the mock clock at runtime. */
export function setMockNow(d: Date | string | number | null): void {
  override = parse(d as string | number | null | undefined);
}

/** The seed's "now" as a Date (real time unless an override is set). */
export function now(): Date {
  return override != null ? new Date(override) : new Date();
}

/** The seed's "now" in ms (real time unless an override is set). */
export function nowMs(): number {
  return override != null ? override : Date.now();
}
