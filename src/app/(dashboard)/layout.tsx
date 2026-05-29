'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { MobileNav } from '@/components/layout/MobileNav';
import { TopbarSlotProvider } from '@/components/layout/TopbarSlot';
import { useAuthStore } from '@/lib/stores/auth-store';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { Menu, X } from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [immersiveOpen, setImmersiveOpen] = useState(false);
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
                <Sidebar collapsed={false} onToggle={() => setImmersiveOpen(false)} />
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
        {/* Desktop sidebar */}
        <div className="hidden md:block">
          <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
        </div>

        {/* Main content */}
        <motion.main
          initial={false}
          animate={{ marginLeft: collapsed ? 72 : 256 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          className="hidden flex-1 flex-col md:flex"
        >
          {needsTopbar && <Topbar />}
          <div className="flex-1 overflow-auto p-6">
            <ErrorBoundary viewer={user} url={pathname}>
              {children}
            </ErrorBoundary>
          </div>
        </motion.main>

        {/* Mobile layout — H-03/H-05 follow-up: min-w-0 lets the flex
             column shrink below its content's intrinsic min-width so
             pages like /admin?tab=blocked don't blow out the viewport
             when an inner element (mobile pill nav, matrix table) has
             a natural width > 430px. Without this the column inherits
             min-width: auto from its row-flex parent and the whole
             page horizontally scrolls. */}
        <div className="flex min-w-0 flex-1 flex-col md:hidden">
          {needsTopbar && <Topbar />}
          <div className="min-w-0 flex-1 overflow-auto p-4 pb-20">
            <ErrorBoundary viewer={user} url={pathname}>
              {children}
            </ErrorBoundary>
          </div>
          <MobileNav />
        </div>
      </div>
    </TopbarSlotProvider>
  );
}
