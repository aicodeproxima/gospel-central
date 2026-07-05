'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Calendar, Users, Contact, BookOpen, Settings, Shield, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/stores/auth-store';
import { canSeeAdminPage } from '@/lib/utils/permissions';
import { useAlerts } from '@/lib/hooks/use-alerts';

interface NavItem {
  href: string;
  label: string;
  icon: typeof BookOpen;
}

const baseItems: NavItem[] = [
  { href: '/dashboard', label: 'Home', icon: BookOpen },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/contacts', label: 'Contacts', icon: Contact },
  { href: '/groups', label: 'Groups', icon: Users },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/alerts', label: 'Alerts', icon: Bell },
];

export function MobileNav() {
  const pathname = usePathname();
  // Bug C from Phase 2 audit — Admin link was missing here. Branch Leaders
  // on mobile had no way to reach /admin without typing the URL.
  const user = useAuthStore((s) => s.user);
  const { unseen } = useAlerts();
  const items: NavItem[] = canSeeAdminPage(user)
    ? [...baseItems, { href: '/admin', label: 'Admin', icon: Shield }]
    : baseItems;

  return (
    // bg-background, NOT bg-card: --card is deliberately translucent under the
    // glass-look themes (marble 0.75, animated 0.35–0.4 alpha), so a bg-card bar
    // let scrolled content bleed through and collide with the nav labels at
    // 275px (audit F-0001). --background is opaque in every theme.
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background pb-safe md:hidden">
      <div className="flex items-stretch justify-around">
        {items.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;
          const showBadge = item.href === '/alerts' && unseen > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              // gap/padding/label tightened so the 7-item BL+ nav (Admin added)
              // fits the 275px S24 width without clipping the last label.
              className={cn(
                'flex min-h-[56px] flex-1 touch-manipulation flex-col items-center justify-center gap-1 px-0.5 py-2 text-[10px] leading-tight transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <span className="relative">
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
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
