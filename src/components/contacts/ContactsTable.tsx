'use client';

import { memo } from 'react';
import { format, parseISO } from 'date-fns';
import { ArrowUpDown, MoreHorizontal, Pencil, Trash2, Eye } from 'lucide-react';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PIPELINE_STAGE_CONFIG } from '@/lib/types';
import type { Contact, User } from '@/lib/types';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import {
  getAssignedTeacher,
  initialsOf,
  stepLabel,
  type ContactSortKey,
} from '@/lib/utils/contact-helpers';

interface ContactsTableProps {
  contacts: Contact[];
  users: User[];
  sortKey: ContactSortKey;
  onSort: (key: ContactSortKey) => void;
  selectMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onRowClick: (id: string) => void;
  onEdit: (contact: Contact) => void;
  onDelete: (id: string) => void;
  canEdit: (contact: Contact) => boolean;
}

function SortHeader({
  label,
  active,
  onClick,
  reverse,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  reverse?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 transition-colors hover:text-foreground',
        reverse && 'flex-row-reverse',
        active ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      {label}
      <ArrowUpDown className={cn('h-3 w-3', active ? 'opacity-100' : 'opacity-40')} />
    </button>
  );
}

function ContactsTableInner({
  contacts,
  users,
  sortKey,
  onSort,
  selectMode,
  selectedIds,
  onToggleSelect,
  onRowClick,
  onEdit,
  onDelete,
  canEdit,
}: ContactsTableProps) {
  const { t, tStage } = useTranslation();

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {selectMode && <TableHead className="w-8" />}
            <TableHead>
              <SortHeader label="Contact" active={sortKey === 'name'} onClick={() => onSort('name')} />
            </TableHead>
            <TableHead>Teacher</TableHead>
            <TableHead>
              <SortHeader label="Stage" active={sortKey === 'stage'} onClick={() => onSort('stage')} />
            </TableHead>
            <TableHead className="max-xl:hidden">Progress</TableHead>
            <TableHead className="text-right">
              <SortHeader label="Sessions" active={sortKey === 'sessions'} onClick={() => onSort('sessions')} reverse />
            </TableHead>
            <TableHead>Last session</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {contacts.map((c) => {
            const stage = PIPELINE_STAGE_CONFIG[c.pipelineStage];
            const teacher = getAssignedTeacher(users, c);
            const step = stepLabel(c, t('contact.sermon'));
            const editable = canEdit(c);
            const handleRow = () => (selectMode ? onToggleSelect(c.id) : onRowClick(c.id));
            return (
              <TableRow
                key={c.id}
                onClick={handleRow}
                data-state={selectedIds.has(c.id) ? 'selected' : undefined}
                className="cursor-pointer"
              >
                {selectMode && (
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(c.id)}
                      onChange={() => onToggleSelect(c.id)}
                      className="h-4 w-4 rounded accent-primary"
                      aria-label={`Select ${c.firstName} ${c.lastName}`}
                    />
                  </TableCell>
                )}
                {/* Contact */}
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[11px] font-bold">
                      {initialsOf(c.firstName, c.lastName)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium truncate">
                          {c.firstName} {c.lastName}
                        </span>
                        {c.currentlyStudying && (
                          <span
                            className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse shrink-0"
                            title={t('misc.active')}
                          />
                        )}
                      </div>
                      {c.groupName && (
                        <span className="text-[10px] text-muted-foreground truncate block">
                          {c.groupName}
                        </span>
                      )}
                    </div>
                  </div>
                </TableCell>
                {/* Teacher */}
                <TableCell className="text-muted-foreground">
                  {teacher ? (
                    <span className="truncate">
                      {teacher.firstName} {teacher.lastName}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/40">—</span>
                  )}
                </TableCell>
                {/* Stage */}
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <span className={cn('h-2 w-2 rounded-full', stage.color)} />
                      <span className="text-xs">{tStage(c.pipelineStage)}</span>
                    </span>
                    {c.retentionExpired && (
                      <span className="inline-flex items-center rounded-full border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[9px] font-medium text-red-500 whitespace-nowrap">
                        Retention expired
                      </span>
                    )}
                  </div>
                </TableCell>
                {/* Progress */}
                <TableCell className="max-xl:hidden text-xs text-muted-foreground">
                  {step ?? <span className="text-muted-foreground/40">—</span>}
                </TableCell>
                {/* Sessions */}
                <TableCell className="text-right tabular-nums font-medium">{c.totalSessions}</TableCell>
                {/* Last session */}
                <TableCell className="text-xs text-muted-foreground">
                  {c.lastSessionDate ? (
                    format(parseISO(c.lastSessionDate), 'MMM d')
                  ) : (
                    <span className="text-muted-foreground/40">—</span>
                  )}
                </TableCell>
                {/* Actions */}
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="ghost" size="icon-sm" aria-label="Row actions" />}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onRowClick(c.id)}>
                        <Eye className="h-4 w-4" /> View
                      </DropdownMenuItem>
                      {editable && (
                        <DropdownMenuItem onClick={() => onEdit(c)}>
                          <Pencil className="h-4 w-4" /> Edit
                        </DropdownMenuItem>
                      )}
                      {editable && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => onDelete(c.id)} className="text-destructive">
                            <Trash2 className="h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export const ContactsTable = memo(ContactsTableInner);
