import { APP_VERSION } from './version';

/**
 * True only when the deployed manifest commit differs from the commit baked
 * into THIS running bundle. Both 'unknown' (no git / dev / preview build) and
 * an empty value on either side return false — we nag ONLY on a confident
 * mismatch, so dev and edge cases never show a false "update available".
 */
export function isUpdateAvailable(
  currentCommit: string,
  manifestCommit?: string | null,
): boolean {
  if (!manifestCommit || manifestCommit === 'unknown') return false;
  if (!currentCommit || currentCommit === 'unknown') return false;
  return manifestCommit !== currentCommit;
}

/**
 * Fetch the deployed build's commit from /version.json. The file is served at
 * the site root — OUTSIDE the `/api` namespace the SW-free MSW mock intercepts
 * (unmatched requests pass through), so this reaches the real static file.
 * `cache:'no-store'` + a `?ts=` cache-bust defeat HTTP/CDN caching (the file is
 * also sent with no-store headers via next.config). Any failure (404 in dev,
 * offline, malformed JSON) resolves to `null` = no-op, never throws.
 */
export async function fetchDeployedCommit(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?ts=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const commit = (data as { commit?: unknown })?.commit;
    return typeof commit === 'string' ? commit : null;
  } catch {
    return null;
  }
}

/** The commit baked into the running bundle (what the user is currently on). */
export const CURRENT_COMMIT: string = APP_VERSION.commit;
