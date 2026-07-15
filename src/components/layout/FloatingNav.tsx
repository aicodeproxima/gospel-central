'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { BookOpen, LogOut, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/hooks/use-auth';
import { ROLE_LABELS } from '@/lib/types';
import { useTranslation } from '@/lib/i18n';
import { usePreferencesStore } from '@/lib/stores/preferences-store';
import { useAlerts } from '@/lib/hooks/use-alerts';
import { useMotionDefaults } from '@/lib/hooks/use-reduced-motion-safe';
import { APP_VERSION } from '@/lib/version';
import { useNavItems, isNavItemActive } from './nav-items';
import type { UseDockGlideResult } from '@/lib/hooks/use-dock-glide';

/**
 * "Dock and Glide" — the md+ primary navigation.
 *
 * A 52px launcher floating over the page that glides open to a 256px panel on
 * hover, focus, or a pin click, replacing the old always-there sidebar. Ported
 * from `Assets/GPT Assets/Floating Menu Concept A - Dock and Glide.html`; the
 * behavior lives in `useDockGlide`, the geometry and glass are here.
 *
 * Below md this never renders — the bottom `MobileNav` owns navigation there.
 * The /groups immersive overlay still renders `Sidebar` instead; both draw
 * their items from `useNavItems` so the two lists cannot drift.
 */
export function FloatingNav({ dock }: { dock: UseDockGlideResult }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const profilePhotoBase64 = usePreferencesStore((s) => s.profilePhotoBase64);
  const { unseen } = useAlerts();
  const { reduced } = useMotionDefaults();
  const items = useNavItems();

  // Destructure once, up front: reaching through `dock.*` inside the JSX reads
  // as a ref access during render to react-hooks/refs.
  const { open, pinned, hostRef, bodyRef, toggleRef, hostHandlers, onToggleClick, onItemActivated } = dock;
  // The app has no global prefers-reduced-motion CSS — honoring it is each
  // component's own job (see use-reduced-motion-safe).
  const glide = reduced ? 'transition-none' : 'duration-[220ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]';
  const toggleLabel = pinned ? t('nav.unpinClose') : t('nav.pinOpen');

  const avatar = profilePhotoBase64 ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={profilePhotoBase64} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
  ) : user ? (
    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
      {user.firstName?.[0] ?? ''}
      {user.lastName?.[0] ?? ''}
    </div>
  ) : null;

  return (
    <aside
      ref={hostRef}
      aria-label={t('nav.primary')}
      data-testid="floating-nav"
      data-open={open}
      data-pinned={pinned}
      {...hostHandlers}
      // z-[47] keeps the sidebar's old stacking contract: above the page and
      // the Topbar, below dialogs (z-50).
      className={cn(
        'fixed left-3.5 top-3.5 z-[47] h-[52px] w-[52px] transition-[width,height]',
        glide,
        // The ≥1280 `:root { zoom: 0.9 }` (globals.css) scales authored px but
        // NOT vh: 100vh keeps resolving to the full device height, so an
        // uncorrected calc(100vh-28px) renders 10% short and leaves a ~100px
        // gap beneath the panel. Only the vh term needs converting into
        // authored space (×1/0.9 — the same factor ui/select.tsx uses); the
        // 28px of inset is already authored and the zoom scales it for us.
        open && 'h-[calc(100vh-28px)] w-64 min-[1280px]:h-[calc(100vh*1.1111111111-28px)]',
      )}
    >
      {/* data-slot hooks the per-theme glass rules in globals.css (marble,
          starfield, the animated themes, and html[data-bg]). Themes without
          such a rule have an opaque --card, so bg-card alone is correct there
          and no backdrop-blur utility is needed. */}
      <div
        data-slot="sidebar-container"
        className={cn(
          'h-full w-full overflow-hidden rounded-[11px] border border-border bg-card shadow-xl transition-[border-radius]',
          glide,
          open && 'rounded-xl',
        )}
      >
        <div
          className={cn(
            'flex h-[52px] items-center gap-2 border-b border-transparent transition-[height]',
            glide,
            open && 'h-14 border-border',
          )}
        >
          <button
            ref={toggleRef}
            type="button"
            onClick={onToggleClick}
            aria-expanded={open}
            aria-pressed={pinned}
            aria-label={toggleLabel}
            title={toggleLabel}
            className={cn(
              'grid h-[50px] w-[50px] min-w-[50px] place-items-center rounded-lg text-foreground transition-all outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50',
              glide,
              open && 'h-[54px] w-[54px] min-w-[54px]',
              pinned && 'bg-accent text-accent-foreground',
            )}
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>

          <div
            aria-hidden="true"
            className={cn(
              'flex min-w-0 flex-1 -translate-x-2 items-center gap-2 whitespace-nowrap pr-3 opacity-0 transition',
              reduced ? 'transition-none' : 'duration-150',
              open && 'translate-x-0 opacity-100',
            )}
          >
            <span className="grid h-7 w-7 flex-none place-items-center rounded-[7px] bg-primary text-primary-foreground">
              <BookOpen className="h-[15px] w-[15px]" />
            </span>
            <span className="truncate text-[15px] font-bold">Gospel Central</span>
          </div>
        </div>

        {/* Collapsed content is inert AND aria-hidden: not focusable, not
            clickable, and absent from the accessibility tree. min-w keeps the
            labels from reflowing while the panel is mid-glide. */}
        <div
          ref={bodyRef}
          inert={!open}
          aria-hidden={!open}
          data-testid="floating-nav-body"
          className={cn(
            'flex h-[calc(100%-56px)] min-h-0 min-w-[254px] flex-col overflow-y-auto pointer-events-none opacity-0 transition-opacity [scrollbar-width:thin]',
            reduced ? 'transition-none' : 'duration-[120ms]',
            open && 'pointer-events-auto opacity-100 delay-[70ms]',
          )}
        >
          <nav aria-label={t('nav.primary')} className="flex-1 p-2.5">
            {items.map((item) => {
              const isActive = isNavItemActive(pathname, item.href);
              const Icon = item.icon;
              const showBadge = item.href === '/alerts' && unseen > 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onItemActivated}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'relative my-px flex min-h-[42px] items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors [@media(pointer:coarse)]:min-h-[46px]',
                    isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="floating-nav-active"
                      aria-hidden="true"
                      className="absolute left-0 h-5 w-[3px] rounded-full bg-primary"
                      transition={reduced ? { duration: 0 } : { duration: 0.2 }}
                    />
                  )}
                  <Icon className="h-[18px] w-[18px] flex-none" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                  {showBadge && (
                    <span
                      className="ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-extrabold leading-none text-white"
                      aria-label={`${unseen} unread alerts`}
                    >
                      {unseen > 9 ? '9+' : unseen}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="flex-none border-t border-border p-2.5">
            {user && (
              <div className="flex items-center gap-2.5 rounded-lg bg-accent/50 px-2.5 py-2">
                {avatar}
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-bold">
                    {user.firstName} {user.lastName}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">{ROLE_LABELS[user.role]}</p>
                </div>
              </div>
            )}
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={(event) => {
                  onItemActivated(event);
                  logout();
                }}
                className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                {t('nav.signOut')}
              </button>
              <div className="flex-1 text-center text-[9px] text-muted-foreground">
                v{APP_VERSION.version} · <span className="font-mono">{APP_VERSION.shortCommit}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
