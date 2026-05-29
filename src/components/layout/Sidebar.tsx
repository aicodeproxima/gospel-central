'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  Calendar,
  Users,
  Contact,
  Settings,
  BarChart3,
  BookOpen,
  LogOut,
  ChevronLeft,
} from 'lucide-react';
import { useAuth } from '@/lib/hooks/use-auth';
import { canAccessReports } from '@/lib/utils/permissions';
import { Button } from '@/components/ui/button';
import { ROLE_LABELS } from '@/lib/types';
import { useTranslation } from '@/lib/i18n';

const navItemDefs = [
  { href: '/dashboard', i18nKey: 'nav.dashboard', icon: BookOpen },
  { href: '/calendar', i18nKey: 'nav.calendar', icon: Calendar },
  { href: '/contacts', i18nKey: 'nav.contacts', icon: Contact },
  { href: '/groups', i18nKey: 'nav.groups', icon: Users },
  { href: '/settings', i18nKey: 'nav.settings', icon: Settings },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { t } = useTranslation();

  const navItems = navItemDefs.map((d) => ({ ...d, label: t(d.i18nKey) }));
  const items = [
    ...navItems,
    ...(user && canAccessReports(user.role) ? [{ href: '/reports', label: t('nav.reports'), icon: BarChart3 }] : []),
  ];

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 72 : 256 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      // z-[47] sits above the immersive overlay backdrop (z-[46]) so
      // nav-link clicks reach the <Link> instead of being swallowed by
      // the backdrop. In the standard dashboard layout the value is
      // still fine — nothing else claims z-40+ outside dialogs (z-50).
      className="fixed inset-y-0 left-0 z-[47] flex flex-col border-r border-border bg-card"
    >
      {/* Header */}
      <div className="flex h-16 items-center justify-between border-b border-border px-4">
        {!collapsed && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <BookOpen className="h-4 w-4" />
            </div>
            <span className="text-lg font-bold">Diamond</span>
          </motion.div>
        )}
        {collapsed && (
          <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BookOpen className="h-4 w-4" />
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 p-3">
        {items.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
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
              <Icon className="relative z-10 h-5 w-5 shrink-0" />
              {!collapsed && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative z-10">
                  {item.label}
                </motion.span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-3">
        {user && !collapsed && (
          <div className="mb-3 rounded-lg bg-accent/50 px-3 py-2">
            <p className="text-sm font-medium">{user.firstName} {user.lastName}</p>
            <p className="text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</p>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="shrink-0"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
          >
            <motion.div animate={{ rotate: collapsed ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </motion.div>
          </Button>
          {!collapsed && (
            <Button variant="ghost" size="sm" onClick={logout} className="flex-1 justify-start gap-2 text-muted-foreground">
              <LogOut className="h-4 w-4" />
              {t('nav.signOut')}
            </Button>
          )}
        </div>
        {!collapsed && (
          <div className="mt-3 pt-3 border-t border-border/50 text-center text-[10px] text-muted-foreground">
            Built by{' '}
            <a
              href="https://accessoryseezin.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              AccessorySeezin.com
            </a>
          </div>
        )}
      </div>
    </motion.aside>
  );
}
