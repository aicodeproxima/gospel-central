'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Lock, Check, X as XIcon } from 'lucide-react';
import { ROLE_LABELS, UserRole } from '@/lib/types';

/**
 * PermissionsTab — read-only matrix viewer.
 *
 * Renders the role × resource × action matrix from docs/PERMISSIONS.md.
 * Visible to all admin-tier users; nobody can edit it from the UI
 * (changes go through the source-of-truth doc + permission utilities).
 *
 * Phase 7c — closes the audit's "permissions tab read-only display" gap.
 */

const ROLES: UserRole[] = [
  UserRole.MEMBER,
  UserRole.TEAM_LEADER,
  UserRole.GROUP_LEADER,
  UserRole.BRANCH_LEADER,
  UserRole.OVERSEER,
  UserRole.DEV,
];

interface MatrixRow {
  action: string;
  cells: Array<string | boolean>;  // boolean → ✓/✗; string → custom note
}

interface MatrixSection {
  title: string;
  description?: string;
  rows: MatrixRow[];
}

const SECTIONS: MatrixSection[] = [
  {
    title: 'Users',
    rows: [
      { action: 'View own profile', cells: ['self', 'self', 'self', 'self', 'self', 'self'] },
      { action: 'View other users', cells: [false, true, true, true, true, true] },
      { action: 'Create user', cells: [false, '≤ Member', '≤ Team L', '≤ Group L', '≤ Branch L', 'any'] },
      { action: 'Edit role / parent / status', cells: [false, '≤ Member', '≤ Team L', '≤ Group L', '≤ Branch L, no Dev', 'all'] },
      { action: 'Reset password (others)', cells: [false, '≤ Member', '≤ Team L', '≤ Group L', '≤ Branch L, no Dev', 'all'] },
      { action: 'Add / remove tags on others', cells: [false, '≤ Member', '≤ Team L', '≤ Group L', '≤ Branch L, no Dev', 'all'] },
      { action: 'Deactivate / Restore', cells: [false, '≤ Member', '≤ Team L', '≤ Group L', '≤ Branch L, no Dev', 'all'] },
      { action: 'Self-rename own username', cells: [true, true, true, true, true, true] },
      { action: 'Rename someone else', cells: [false, false, false, false, '≤ Branch L', 'all'] },
    ],
  },
  {
    title: 'Org tree (Branch / Group / Team)',
    rows: [
      { action: 'View tree', cells: ['own subtree', 'own subtree', 'own subtree', 'all', 'all', 'all'] },
      { action: 'Create new Branch', cells: [false, false, false, false, true, true] },
      { action: 'Create Group', cells: [false, false, false, 'own branch', 'any', 'any'] },
      { action: 'Create Team', cells: [false, false, 'own group', 'any branch', 'any', 'any'] },
      { action: 'Rename node', cells: [false, 'own team', 'own group', 'any branch', 'all', 'all'] },
      { action: 'Deactivate / Restore', cells: [false, false, false, 'own branch (G/T only)', 'all', 'all'] },
      { action: 'Reassign user', cells: [false, 'within team', 'within group', 'any branch', 'all', 'all'] },
    ],
  },
  {
    title: 'Rooms / Areas',
    rows: [
      { action: 'View list', cells: [true, true, true, true, true, true] },
      { action: 'Create Area', cells: [false, false, false, false, true, true] },
      { action: 'Create Room', cells: [false, false, false, 'any area', 'any', 'any'] },
      { action: 'Edit / rename Room or Area', cells: [false, false, false, 'any area', 'any', 'any'] },
      { action: 'Deactivate / Restore', cells: [false, false, false, 'any area', 'any', 'any'] },
    ],
  },
  {
    title: 'Blocked time slots',
    description: 'Reserved windows that prevent ANY booking — no role can override.',
    rows: [
      { action: 'See on calendar', cells: [true, true, true, true, true, true] },
      { action: 'Create / edit / delete', cells: [false, false, false, true, true, true] },
    ],
  },
  {
    title: 'Contacts',
    rows: [
      { action: 'View', cells: ['own + assigned', 'team', 'group', 'all', 'all', 'all'] },
      { action: 'Create (owner = self)', cells: [true, true, true, true, true, true] },
      { action: 'Create for other', cells: [false, 'team', 'group', 'any branch', 'all', 'all'] },
      { action: 'Edit own', cells: [true, true, true, true, true, true] },
      { action: 'Edit others', cells: [false, 'team', 'group', 'any branch', 'all', 'all'] },
      { action: 'Reassign owner', cells: [false, 'team', 'group', 'any branch', 'all', 'all'] },
      { action: 'Deactivate / Restore', cells: ['own only', 'team', 'group', 'any branch', 'all', 'all'] },
      { action: 'Convert contact → user', cells: [false, 'team', 'group', 'any branch', 'all', 'all'] },
    ],
  },
  {
    title: 'Bookings (calendar)',
    rows: [
      { action: 'View calendar', cells: ['all', 'all', 'all', 'all', 'all', 'all'] },
      { action: 'Create own booking', cells: [true, true, true, true, true, true] },
      { action: 'Edit / cancel own', cells: [true, true, true, true, true, true] },
      { action: 'Edit / cancel others', cells: [false, 'team', 'group', 'any branch', 'all', 'all'] },
    ],
  },
  {
    title: 'Reports & Audit Log',
    rows: [
      { action: 'View Reports', cells: [false, false, false, 'branch', 'all', 'all'] },
      { action: 'Export CSV', cells: [false, false, false, 'branch', 'all', 'all'] },
      { action: 'View Audit Log', cells: [false, false, false, 'branch', 'all', 'all'] },
    ],
  },
  {
    // H-05: PERMISSIONS.md lines 165-176 specify per-tab admin visibility,
    // but this matrix viewer was missing the section entirely. Members /
    // Team / Group leaders cannot reach /admin at all — those cells are X.
    title: 'Admin page tabs',
    description: 'Visibility of /admin tabs by role. Sub-Admin-tier roles cannot reach /admin at all.',
    rows: [
      { action: '/admin link in sidebar', cells: [false, false, false, true, true, true] },
      { action: 'Users tab', cells: [false, false, false, 'branch-scoped', 'all (no Dev)', 'all'] },
      { action: 'Groups tab', cells: [false, false, false, 'branch-scoped', 'all', 'all'] },
      { action: 'Rooms / Areas tab', cells: [false, false, false, 'any branch', 'all', 'all'] },
      { action: 'Blocked Slots tab', cells: [false, false, false, 'any', 'all', 'all'] },
      { action: 'Contacts tab', cells: [false, false, false, 'branch-scoped', 'all', 'all'] },
      { action: 'Audit Log tab', cells: [false, false, false, 'branch-scoped', 'all', 'all'] },
      { action: 'Tags tab', cells: [false, false, false, 'view only', 'full', 'full'] },
      { action: 'Permissions tab', cells: [false, false, false, 'view only', 'view only', 'view only'] },
      { action: 'System Config tab', cells: [false, false, false, false, false, true] },
    ],
  },
];

export function PermissionsTab() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            Permissions matrix
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Read-only view of who can do what. The source of truth is{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
              docs/PERMISSIONS.md
            </code>
            . Every helper in{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
              src/lib/utils/permissions.ts
            </code>{' '}
            and every server-side gate must match it exactly.
          </p>
        </CardHeader>
      </Card>

      <Card>
        <CardContent className="space-y-1 pt-6 text-sm">
          <h3 className="text-base font-semibold">Universal rules</h3>
          {/* H-05: break-words so long bullet text wraps cleanly on small
              viewports instead of pushing the page wide. */}
          <ul className="ml-5 list-disc space-y-1 break-words text-muted-foreground">
            <li><strong className="text-foreground">Cross-branch is allowed.</strong> Leaders can act on records in any branch.</li>
            <li><strong className="text-foreground">Peer-edit at leader tier is allowed.</strong> Branch Leader can edit Branch Leader, etc. — Members and Teachers cannot edit other Members.</li>
            <li><strong className="text-foreground">Cannot modify above own level.</strong> Universal — no exceptions.</li>
            <li><strong className="text-foreground">Cannot grant a role at-or-above own level.</strong> Only a Dev can create another Dev.</li>
            <li><strong className="text-foreground">Soft delete only.</strong> Deactivate sets <code>isActive=false</code>; no hard deletes from any UI.</li>
            <li><strong className="text-foreground">Members and Teacher-tagged users have identical permissions.</strong> Teacher is a capability tag, not a privilege tag.</li>
          </ul>
        </CardContent>
      </Card>

      {SECTIONS.map((section) => (
        // H-05: overflow-hidden contains the matrix table's min-w-[600px]
        // inside the Card. CardContent's overflow-x-auto then scrolls
        // horizontally within the Card's bounds instead of pushing the
        // whole page wider than the viewport on phones.
        <Card key={section.title} className="overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{section.title}</CardTitle>
            {section.description && (
              <p className="text-xs text-muted-foreground">{section.description}</p>
            )}
          </CardHeader>
          <CardContent className="overflow-x-auto pt-0">
            <table className="w-full min-w-[600px] text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 pr-2 text-left font-medium text-muted-foreground">Action</th>
                  {ROLES.map((role) => (
                    <th key={role} className="px-1.5 py-2 text-center font-medium text-muted-foreground">
                      {ROLE_LABELS[role].split(' ').map((w) => w[0]).join('')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {section.rows.map((row) => (
                  <tr key={row.action} className="border-b border-border/50 last:border-0">
                    <td className="py-1.5 pr-2 align-top">{row.action}</td>
                    {row.cells.map((cell, i) => (
                      <td key={i} className="px-1.5 py-1.5 text-center">
                        {cell === true ? (
                          <Check className="mx-auto h-3.5 w-3.5 text-green-500" />
                        ) : cell === false ? (
                          <XIcon className="mx-auto h-3.5 w-3.5 text-muted-foreground/40" />
                        ) : (
                          <Badge variant="outline" className="text-[10px]">{cell}</Badge>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
