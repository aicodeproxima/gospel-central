'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { BookOpen, LogOut, X } from 'lucide-react';
import { useAuth } from '@/lib/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { ROLE_LABELS } from '@/lib/types';
import { useTranslation } from '@/lib/i18n';
import { usePreferencesStore } from '@/lib/stores/preferences-store';
import { useAlerts } from '@/lib/hooks/use-alerts';
import { APP_VERSION } from '@/lib/version';
import { useNavItems, isNavItemActive } from './nav-items';

interface SidebarProps {
  /** Dismiss the overlay. */
  onClose: () => void;
}

/**
 * The slide-in navigation for the /groups immersive layout — its ONLY caller.
 * The standard dashboard uses `FloatingNav`; both take their items from
 * `useNavItems` so the two lists stay in lockstep.
 *
 * Always expanded. It used to carry a `collapsed` prop for the old md+ rail,
 * but the overlay only ever passed `false`, so every collapsed branch was
 * unreachable — and its toggle still announced "Collapse sidebar, expanded"
 * for a button that dismisses an overlay. Dropped with the rail.
 */
export function Sidebar({ onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const profilePhotoBase64 = usePreferencesStore((s) => s.profilePhotoBase64);
  const { unseen } = useAlerts();
  const items = useNavItems();

  // Avatar for the footer — the profile photo set in Settings now propagates
  // here (it used to live only on the Settings page). Falls back to initials.
  const renderAvatar = () =>
    profilePhotoBase64 ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={profilePhotoBase64} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
    ) : user ? (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
        {user.firstName?.[0] ?? ''}{user.lastName?.[0] ?? ''}
      </div>
    ) : null;

  return (
    <motion.aside
      initial={false}
      animate={{ width: 256 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      // z-[47] sits above the immersive overlay backdrop (z-[46]) so
      // nav-link clicks reach the <Link> instead of being swallowed by
      // the backdrop.
      className="fixed inset-y-0 left-0 z-[47] flex flex-col border-r border-border bg-card"
    >
      {/* Header */}
      <div className="flex h-16 items-center justify-between border-b border-border px-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BookOpen className="h-4 w-4" />
          </div>
          <span className="text-lg font-bold">Gospel Central</span>
        </motion.div>
      </div>

      {/* Nav */}
      <nav aria-label={t('nav.pages')} className="flex-1 space-y-1 p-3">
        {items.map((item) => {
          const isActive = isNavItemActive(pathname, item.href);
          const Icon = item.icon;
          const showBadge = item.href === '/alerts' && unseen > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-lg bg-primary/10"
                  transition={{ duration: 0.2 }}
                />
              )}
              <span className="relative z-10 shrink-0">
                <Icon className="h-5 w-5" />
                {showBadge && (
                  <span
                    className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white"
                    aria-label={`${unseen} unread alerts`}
                  >
                    {unseen > 9 ? '9+' : unseen}
                  </span>
                )}
              </span>
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative z-10">
                {item.label}
              </motion.span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-3">
        {user && (
          <div className="mb-3 flex items-center gap-2.5 rounded-lg bg-accent/50 px-3 py-2">
            {renderAvatar()}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user.firstName} {user.lastName}</p>
              <p className="truncate text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</p>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="shrink-0"
            title={t('nav.closeMenu')}
            aria-label={t('nav.closeMenu')}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="sm" onClick={logout} className="flex-1 justify-start gap-2 text-muted-foreground">
            <LogOut className="h-4 w-4" />
            {t('nav.signOut')}
          </Button>
        </div>
        <div className="mt-3 pt-3 border-t border-border/50 text-center text-[10px] text-muted-foreground/70">
          v{APP_VERSION.version} · <span className="font-mono">{APP_VERSION.shortCommit}</span>
        </div>
      </div>
    </motion.aside>
  );
}
