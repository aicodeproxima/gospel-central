'use client';

import { useEffect } from 'react';

/**
 * GoldStarTrail
 *
 * Mounts a mousemove listener that spawns small gold star SVGs along
 * the cursor path. Each star fades + drifts upward over ~620ms and then
 * cleans itself up. The spawn is distance-throttled so it doesn't create
 * thousands of nodes on fast movement.
 *
 * Only mount this when the marble theme is active — done from Providers.
 */
export function GoldStarTrail() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Disable on touch devices (no cursor) and reduced-motion users.
    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    if (prefersReducedMotion) return;

    const MIN_DIST = 18; // px between spawns
    let lastX: number | null = null;
    let lastY: number | null = null;

    const spawnStar = (x: number, y: number) => {
      const el = document.createElement('div');
      el.className = 'gold-star-trail';
      // Inline SVG — small 5-point star
      el.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor" width="100%" height="100%" aria-hidden="true">
          <path d="M12 2l2.9 6.9 7.1.6-5.4 4.6 1.7 7-6.3-3.8-6.3 3.8 1.7-7-5.4-4.6 7.1-.6z"/>
        </svg>
      `;
      // The app sets `:root { zoom: 0.9 }` at >=1280px, which scales these
      // position:fixed pixel lengths at paint time — an unadjusted clientX/Y
      // renders every star at 0.9x its coordinate (~10% drift toward the
      // top-left, growing to ~130px at the far corner; REV3 #8). Divide by the
      // effective root zoom, same as BookingSearchBar's portal positioning.
      const zoom =
        parseFloat(getComputedStyle(document.documentElement).zoom || '1') || 1;
      el.style.left = `${x / zoom}px`;
      el.style.top = `${y / zoom}px`;
      document.body.appendChild(el);
      // Auto-cleanup after the CSS animation completes.
      window.setTimeout(() => {
        el.remove();
      }, 650);
    };

    const onMove = (e: MouseEvent) => {
      const { clientX: x, clientY: y } = e;
      if (lastX === null || lastY === null) {
        lastX = x;
        lastY = y;
        return;
      }
      const dx = x - lastX;
      const dy = y - lastY;
      if (Math.hypot(dx, dy) < MIN_DIST) return;
      lastX = x;
      lastY = y;
      spawnStar(x, y);
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      // Remove any stars still lingering in the DOM when theme changes.
      document.querySelectorAll('.gold-star-trail').forEach((el) => el.remove());
    };
  }, []);

  return null;
}
