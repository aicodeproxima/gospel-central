'use client';

import { Calendar, Users, Contact, Settings, BarChart3, BookOpen, Shield, Bell } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '@/lib/hooks/use-auth';
import { canAccessReports, canSeeAdminPage } from '@/lib/utils/permissions';
import { useTranslation } from '@/lib/i18n';

/**
 * The primary navigation set, shared by the two surfaces that render it:
 * `FloatingNav` (the standard dashboard dock) and `Sidebar` (the /groups
 * immersive overlay). They present the list very differently, but the list
 * itself — hrefs, order, and the permission gates — must never drift apart.
 */

export interface NavItemEntry {
  href: string;
  label: string;
  icon: LucideIcon;
}

const navItemDefs = [
  { href: '/dashboard', i18nKey: 'nav.dashboard', icon: BookOpen },
  { href: '/calendar', i18nKey: 'nav.calendar', icon: Calendar },
  { href: '/contacts', i18nKey: 'nav.contacts', icon: Contact },
  { href: '/groups', i18nKey: 'nav.groups', icon: Users },
  { href: '/settings', i18nKey: 'nav.settings', icon: Settings },
  { href: '/alerts', i18nKey: 'nav.alerts', icon: Bell },
];

export function useNavItems(): NavItemEntry[] {
  const { user } = useAuth();
  const { t } = useTranslation();

  return [
    ...navItemDefs.map((d) => ({ href: d.href, label: t(d.i18nKey), icon: d.icon })),
    ...(user && canAccessReports(user.role)
      ? [{ href: '/reports', label: t('nav.reports'), icon: BarChart3 }]
      : []),
    // Admin: Branch Leader and above. Hidden for Group Leader / Team Leader /
    // Member — those tiers manage their people via /groups.
    ...(canSeeAdminPage(user) ? [{ href: '/admin', label: 'Admin', icon: Shield }] : []),
  ];
}

/** Shared active-route rule: exact match, or any nested route beneath it. */
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + '/');
}
