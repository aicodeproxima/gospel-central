'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import {
  CURRENT_COMMIT,
  fetchDeployedCommit,
  isUpdateAvailable,
} from '@/lib/version-check';

const POLL_MS = 5 * 60 * 1000; // re-check every 5 minutes
const DISMISS_KEY = 'diamond-update-dismissed';

/**
 * Tier-2 "update available" detector. Polls /version.json and, when the
 * deployed commit differs from the commit baked into this running bundle, shows
 * a non-intrusive banner. Reload is USER-initiated — never auto-reload (it would
 * discard unsaved booking-wizard / form state). Dismiss hides it for the
 * current deployed SHA this session; a newer deploy re-shows it.
 *
 * Mounted globally in Providers. Mirrors the MSWProvider dead-backend banner's
 * fixed / top-0 / z-[9999] / safe-area treatment, but uses the theme primary
 * color (amber is reserved for the dead-backend error state). No entrance
 * animation, so it's reduced-motion-safe by construction.
 */
export function UpdateBanner() {
  const { t } = useTranslation();
  const [deployedCommit, setDeployedCommit] = useState<string | null>(null);

  const check = useCallback(async () => {
    const commit = await fetchDeployedCommit();
    if (commit && isUpdateAvailable(CURRENT_COMMIT, commit)) {
      setDeployedCommit(commit);
    }
  }, []);

  useEffect(() => {
    void check();
    const iv = window.setInterval(() => {
      if (!document.hidden) void check();
    }, POLL_MS);
    // Re-check when the user returns to the tab / window (caught a deploy while away).
    const onActive = () => {
      if (!document.hidden) void check();
    };
    document.addEventListener('visibilitychange', onActive);
    window.addEventListener('focus', onActive);
    return () => {
      window.clearInterval(iv);
      document.removeEventListener('visibilitychange', onActive);
      window.removeEventListener('focus', onActive);
    };
  }, [check]);

  // Dismissed for this exact deployed SHA? (per-SHA so a newer build re-shows it.)
  const dismissed =
    deployedCommit !== null &&
    typeof window !== 'undefined' &&
    window.sessionStorage.getItem(DISMISS_KEY) === deployedCommit;

  if (deployedCommit === null || dismissed) return null;

  const onDismiss = () => {
    try {
      window.sessionStorage.setItem(DISMISS_KEY, deployedCommit);
    } catch {
      /* sessionStorage unavailable — fall back to in-memory hide */
    }
    setDeployedCommit(null);
  };

  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-[9999] bg-primary px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-primary-foreground"
    >
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm font-medium">
        <span>{t('banner.updateAvailable')}</span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex min-h-11 items-center rounded-md bg-primary-foreground/15 px-4 font-semibold transition-colors hover:bg-primary-foreground/25"
        >
          {t('banner.reload')}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-lg leading-none transition-colors hover:bg-primary-foreground/20"
        >
          ×
        </button>
      </div>
    </div>
  );
}
