'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Users, Download, FileText, ChevronDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n';
import { usePreferencesStore } from '@/lib/stores/preferences-store';
import { buildYourGroup } from '@/lib/utils/church';
import { canExportMemberList } from '@/lib/utils/permissions';
import { exportCSV, downloadCSV } from '@/lib/utils/csv';
import { ROLE_LABELS, UserRole, type User } from '@/lib/types/user';

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

// Roles shown as numbered sections from the viewer's DIRECT reports (user
// decision 2026-07-03: Your Group shows direct relationships only — a TL sees
// just their team's members, a GL just their own TLs, the overseer just the
// branch leaders). MEMBER is included here because a Team Leader's direct
// reports ARE their team members and should be listed; for higher roles no
// direct MEMBER children exist, so the section simply doesn't render. The
// church-wide member total stays a count-only rollup line below (full list is
// export-only, GL+ — Decision 13).
const DIRECT_REPORT_ROLES: UserRole[] = [
  UserRole.MEMBER,
  UserRole.TEAM_LEADER,
  UserRole.GROUP_LEADER,
  UserRole.BRANCH_LEADER,
  UserRole.OVERSEER,
];

interface YourGroupProps {
  viewer: User;
  users: User[];
}

export function YourGroup({ viewer, users }: YourGroupProps) {
  const { t, tRole } = useTranslation();

  const { above, lateral, directReports, below, memberCount } = useMemo(
    () => buildYourGroup(viewer, users),
    [viewer, users],
  );

  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u] as const)), [users]);

  const canExport = canExportMemberList(viewer);

  const handleExportCSV = () => {
    const members = below.get(UserRole.MEMBER) ?? [];
    const rows = members.map((m) => {
      const team = m.parentId ? usersById.get(m.parentId) : undefined;
      const teamName = team ? `${team.firstName} ${team.lastName}` : '';
      return [`${m.firstName} ${m.lastName}`, m.username, ROLE_LABELS[m.role], teamName];
    });
    exportCSV(['Name', 'Username', 'Role', 'Team'], rows, 'gospel-central-members.csv');
  };

  const handleExportTXT = () => {
    const members = below.get(UserRole.MEMBER) ?? [];
    const lines = members.map((m) => {
      const team = m.parentId ? usersById.get(m.parentId) : undefined;
      const teamName = team ? `${team.firstName} ${team.lastName}` : '';
      return `${m.firstName} ${m.lastName}\tUsername: ${m.username}\tRole: ${ROLE_LABELS[m.role]}\tTeam: ${teamName}`;
    });
    downloadCSV(lines.join('\n'), 'gospel-central-members.txt');
  };

  // REV3 #18: collapsible, COLLAPSED by default, persisted in the preferences
  // store (not a loose localStorage key — the store already owns dashboard
  // prefs like dashboardChurchId). The member-count summary stays visible in
  // the header so the section still informs at a glance while collapsed.
  const open = usePreferencesStore((s) => s.dashboardYourGroupOpen);
  const setOpen = usePreferencesStore((s) => s.setDashboardYourGroupOpen);

  return (
    <motion.div variants={item}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="mb-4 flex w-full touch-manipulation items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-2 text-xl font-semibold">
          {t('dash.yourGroup')}
          {memberCount > 0 && (
            <span className="flex items-center gap-1 text-sm font-normal text-muted-foreground">
              <Users className="h-4 w-4 text-primary" />
              {memberCount} {t('dash.members')}
            </span>
          )}
        </span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
      <Card>
        <CardContent className="space-y-4 p-5">
          {above.length > 0 && (
            <div className="space-y-1.5">
              {above.map((u) => (
                <div key={u.id} className="text-sm">
                  <span className="text-muted-foreground">{tRole(u.role) || ROLE_LABELS[u.role]}:</span>{' '}
                  <span className="font-medium">{u.firstName} {u.lastName}</span>
                </div>
              ))}
            </div>
          )}

          {/* A member's peers are their team — show them (packet: a converted
              contact placed on a team sees their fellow members). Leader roles
              don't list their peers: direct relationships only. */}
          {viewer.role === UserRole.MEMBER && lateral.length > 0 && (
            <div className="space-y-1.5 border-t border-border pt-3">
              <div className="text-xs font-semibold uppercase text-muted-foreground">
                {t('dash.teamMembers')} ({lateral.length})
              </div>
              <ol className="space-y-1 text-sm">
                {lateral.map((u, i) => (
                  <li key={u.id} className="flex gap-2">
                    <span className="text-muted-foreground">{i + 1}.</span>
                    <span>{u.firstName} {u.lastName}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {DIRECT_REPORT_ROLES.map((role) => {
            const list = directReports.get(role);
            if (!list || list.length === 0) return null;
            return (
              <div key={role} className="space-y-1.5 border-t border-border pt-3">
                <div className="text-xs font-semibold uppercase text-muted-foreground">
                  {(tRole(role) || ROLE_LABELS[role])} ({list.length})
                </div>
                <ol className="space-y-1 text-sm">
                  {list.map((u, i) => (
                    <li key={u.id} className="flex gap-2">
                      <span className="text-muted-foreground">{i + 1}.</span>
                      <span>{u.firstName} {u.lastName}</span>
                    </li>
                  ))}
                </ol>
              </div>
            );
          })}

          {/* Members-count row is meaningless for viewers with no subtree
              (plain members see their team-mates in the lateral list above). */}
          {memberCount > 0 && (
          <div className="flex items-center justify-between border-t border-border pt-3">
            <div className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-primary" />
              <span className="text-muted-foreground">{t('dash.members')}:</span>
              <span className="font-semibold">{memberCount}</span>
            </div>
            {canExport && memberCount > 0 && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportCSV}>
                  <Download className="h-3.5 w-3.5" /> {t('dash.exportCsv')}
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportTXT}>
                  <FileText className="h-3.5 w-3.5" /> {t('dash.exportTxt')}
                </Button>
              </div>
            )}
          </div>
          )}
        </CardContent>
      </Card>
      )}
    </motion.div>
  );
}
