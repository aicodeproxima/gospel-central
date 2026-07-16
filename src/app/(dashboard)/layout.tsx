'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Sidebar } from '@/components/layout/Sidebar';
import { FloatingNav } from '@/components/layout/FloatingNav';
import { Topbar } from '@/components/layout/Topbar';
import { MobileNav } from '@/components/layout/MobileNav';
import { TopbarSlotProvider } from '@/components/layout/TopbarSlot';
import { useAuthStore } from '@/lib/stores/auth-store';
import { useDockGlide } from '@/lib/hooks/use-dock-glide';
import { useMotionDefaults } from '@/lib/hooks/use-reduced-motion-safe';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { Menu, X } from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [immersiveOpen, setImmersiveOpen] = useState(false);
  // The floating nav's machine lives here, above the immersive/standard fork,
  // for two reasons: the main column has to react to `open` for its margin, and
  // keeping the hook mounted across the fork means a pinned menu survives a
  // round-trip through /groups (which renders the overlay Sidebar instead).
  const dock = useDockGlide();
  const { reduced } = useMotionDefaults();
  // ≥768px (md+). Gates the nav marginLeft on the single main column (see
  // the consolidated standard layout below) so mobile has NO left offset. Lazy-
  // init from matchMedia so desktop paints at the correct margin on the first
  // post-hydration render (no 0→80 slide). SSR/hydration is covered by the
  // `if (!hydrated)` spinner gate below, so there's no hydration mismatch.
  const [isMdUp, setIsMdUp] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches,
  );
  const { isAuthenticated, hydrated, hydrate, user } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const isImmersive = pathname === '/groups';
  // Only /calendar renders the Topbar — it hosts the calendar's toolbar
  // (navigation, view switcher, search). The other pages don't need a
  // top chrome row; theme controls live in /settings instead.
  const needsTopbar = pathname === '/calendar';

  // Run once on mount so the store reflects persisted auth state.
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Only redirect AFTER hydration has settled — prevents a login flash
  // on the first paint when the store is still empty but localStorage
  // does in fact have a valid session.
  // Phase 6: also redirect to /first-login when the user is authenticated
  // but carries the `mustChangePassword` flag (set on account creation +
  // admin password reset). Locks the rest of the app until they choose
  // their own password.
  useEffect(() => {
    if (!hydrated) return;
    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }
    if (user?.mustChangePassword === true) {
      router.replace('/first-login');
    }
  }, [hydrated, isAuthenticated, user, router]);

  // Close the overlay sidebar when leaving the immersive page.
  // Kept ABOVE the hydration gate so rules-of-hooks order is preserved.
  useEffect(() => {
    if (!isImmersive) setImmersiveOpen(false);
  }, [isImmersive]);

  // Track md+ (the nav margin gate). Client-only (post-hydration) so there's no
  // SSR width mismatch. The old 768–1279 "tablet rail" band is gone: the dock is
  // a 52px launcher at every md+ width, so there is no rail to force.
  useEffect(() => {
    const mdMq = window.matchMedia('(min-width: 768px)');
    const apply = () => setIsMdUp(mdMq.matches);
    apply();
    mdMq.addEventListener('change', apply);
    return () => mdMq.removeEventListener('change', apply);
  }, []);

  // Block render until hydration finishes. Avoids both the flash and
  // the stale-user-data problem where a component reads `user` before
  // localStorage has been consulted.
  if (!hydrated) {
    return (
      <div className="flex h-full items-center justify-center">
        <div
          className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent"
          aria-label="Loading session"
        />
      </div>
    );
  }

  // -- Immersive layout (Groups page) ---------------------------------------
  if (isImmersive) {
    return (
      <div className="relative h-full w-full overflow-hidden">
        {/* Fullscreen content — wrapped so a render error in /groups
             reports to /api/error-log with the viewer's id/role/url */}
        <div className="h-full w-full">
          <ErrorBoundary viewer={user} url={pathname}>
            {children}
          </ErrorBoundary>
        </div>

        {/* Floating hamburger / close button — slides to the sidebar's right
            edge when the menu is open so it doesn't cover the sidebar header. */}
        <motion.button
          type="button"
          onClick={() => setImmersiveOpen((v) => !v)}
          aria-label={immersiveOpen ? 'Close menu' : 'Open menu'}
          initial={false}
          animate={{ left: immersiveOpen ? 208 : 16 }}
          transition={{ type: 'spring', damping: 24, stiffness: 260 }}
          className="fixed top-4 z-50 rounded-full border border-white/20 bg-card/90 p-2.5 text-foreground shadow-lg backdrop-blur-md transition hover:bg-card hover:scale-105"
        >
          {immersiveOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </motion.button>

        {/* Slide-in sidebar overlay */}
        <AnimatePresence>
          {immersiveOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setImmersiveOpen(false)}
                className="fixed inset-0 z-[46] bg-black/50 backdrop-blur-sm"
              />
              <motion.div
                initial={{ x: -280 }}
                animate={{ x: 0 }}
                exit={{ x: -280 }}
                transition={{ type: 'spring', damping: 24, stiffness: 260 }}
                className="fixed left-0 top-0 z-[46] h-full"
              >
                <Sidebar onClose={() => setImmersiveOpen(false)} />
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Mobile bottom nav stays so small screens can still navigate */}
        <div className="md:hidden">
          <MobileNav />
        </div>
      </div>
    );
  }

  // -- Standard layout ------------------------------------------------------
  return (
    <TopbarSlotProvider>
      <div className="flex h-full">
        {/* Desktop + tablet navigation: the floating "Dock and Glide" menu
            (fixed, out of flow). Hidden below md — mobile uses the bottom nav. */}
        <div className="hidden md:block">
          <FloatingNav dock={dock} />
        </div>

        {/* SINGLE main column — renders {children} EXACTLY ONCE. Previously the
            layout had two CSS-gated siblings (a desktop motion.main + a mobile
            div), both always mounted, so React mounted the page TWICE; a page
            with component-local state (e.g. /calendar's `bookings`) had two live
            instances and a mutation updated only one → stale UI until nav
            (FINDING-1). Consolidated to one render:
              - marginLeft (room for the floating nav) is gated to md+ via
                isMdUp, so there is NO sub-768 shift; at ≥md it clears the
                launcher (80) or the opened panel (284) — the page is never
                underneath the menu.
              - mobile padding (p-4 + bottom-nav inset) is re-expressed as
                responsive classes that reset to the old desktop p-6 at md+.
              - min-w-0 keeps the tablet/mobile reflow (H-03/H-05); inert at ≥1280. */}
        <motion.main
          initial={false}
          animate={{ marginLeft: isMdUp ? (dock.open ? 284 : 80) : 0 }}
          transition={reduced ? { duration: 0 } : { duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
          className="flex min-w-0 flex-1 flex-col"
        >
          {needsTopbar && <Topbar />}
          <div className="min-w-0 flex-1 overflow-auto p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] md:p-6 md:pb-6">
            <ErrorBoundary viewer={user} url={pathname}>
              {children}
            </ErrorBoundary>
          </div>
        </motion.main>

        {/* Mobile bottom nav — fixed; only below md. */}
        <div className="md:hidden">
          <MobileNav />
        </div>
      </div>
    </TopbarSlotProvider>
  );
}
