'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Users, Download, FileText } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n';
import { buildYourGroup } from '@/lib/utils/church';
import { canExportMemberList } from '@/lib/utils/permissions';
import { exportCSV, downloadCSV } from '@/lib/utils/csv';
import { ROLE_LABELS, UserRole, type User } from '@/lib/types/user';

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

// Leader roles shown as numbered groups under "below" — MEMBER is
// deliberately excluded here and rendered as a count-only line instead
// (packet Decision 13: full member list is export-only, not on-screen).
const BELOW_LEADER_ROLES: UserRole[] = [
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

  const { above, lateral, below, memberCount } = useMemo(
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

  return (
    <motion.div variants={item}>
      <h2 className="mb-4 text-xl font-semibold">{t('dash.yourGroup')}</h2>
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

          {lateral.length > 0 && (
            <div className="space-y-1.5 border-t border-border pt-3">
              <div className="text-xs font-semibold uppercase text-muted-foreground">
                {tRole(viewer.role) || ROLE_LABELS[viewer.role]}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                {lateral.map((u) => (
                  <span key={u.id}>{u.firstName} {u.lastName}</span>
                ))}
              </div>
            </div>
          )}

          {BELOW_LEADER_ROLES.map((role) => {
            const list = below.get(role);
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
        </CardContent>
      </Card>
    </motion.div>
  );
}
