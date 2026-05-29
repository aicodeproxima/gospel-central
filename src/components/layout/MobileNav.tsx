'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Calendar, Users, Contact, BookOpen, Settings, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/stores/auth-store';
import { canSeeAdminPage } from '@/lib/utils/permissions';

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
];

export function MobileNav() {
  const pathname = usePathname();
  // Bug C from Phase 2 audit — Admin link was missing here. Branch Leaders
  // on mobile had no way to reach /admin without typing the URL.
  const user = useAuthStore((s) => s.user);
  const items: NavItem[] = canSeeAdminPage(user)
    ? [...baseItems, { href: '/admin', label: 'Admin', icon: Shield }]
    : baseItems;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card md:hidden">
      <div className="flex items-center justify-around">
        {items.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center gap-1 px-3 py-2 text-xs transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
