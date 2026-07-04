'use client';

import { memo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PIPELINE_STAGE_CONFIG } from '@/lib/types';
import type { Contact, User } from '@/lib/types';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { getAssignedTeacher, initialsOf, stepLabel } from '@/lib/utils/contact-helpers';
import { prefixMatch } from '@/lib/utils/text-match';
import { HighlightedText } from '@/components/shared/HighlightedText';

interface ContactCardProps {
  contact: Contact;
  users: User[];
  onClick: () => void;
  /** When true, show a checkbox instead of opening dialog on click. */
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  /** Compact mode for kanban columns */
  compact?: boolean;
  /** Search query to highlight within the contact's name (deep-link/search UX). */
  query?: string;
}

function ContactCardInner({
  contact,
  users,
  onClick,
  selectMode,
  selected,
  onToggleSelect,
  compact,
  query,
}: ContactCardProps) {
  const { t, tStage } = useTranslation();
  const stageConfig = PIPELINE_STAGE_CONFIG[contact.pipelineStage];

  const teacher = getAssignedTeacher(users, contact);
  const step = stepLabel(contact);
  const fullName = `${contact.firstName} ${contact.lastName}`.trim();

  // Branches: reuse whatever branch/group display the card has today
  // (contact.groupName). First branch gets the "main branch" purple highlight
  // per the packet; there is currently only ever one branch value available
  // to the card (no branches[] list on Contact), so the list is length <= 1.
  const branches = contact.groupName ? [contact.groupName] : [];

  const nameRanges = query ? prefixMatch(fullName, query) : null;

  const handleClick = () => {
    if (selectMode && onToggleSelect) {
      onToggleSelect();
    } else {
      onClick();
    }
  };

  const nameNode = nameRanges ? (
    <HighlightedText text={fullName} ranges={nameRanges} />
  ) : (
    fullName
  );

  if (compact) {
    return (
      <div
        onClick={handleClick}
        className={cn(
          'rounded-md border border-border bg-card px-3 py-2 cursor-pointer transition-all hover:bg-accent/60 touch-manipulation',
          selected && 'ring-2 ring-primary',
        )}
      >
        <div className="flex items-center gap-2">
          {selectMode && (
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              onClick={(e) => e.stopPropagation()}
              className="h-3.5 w-3.5 rounded accent-primary"
            />
          )}
          <div className={cn('h-2 w-2 rounded-full shrink-0', stageConfig.color)} />
          <span className="text-sm font-medium truncate">{nameNode}</span>
          {contact.currentlyStudying && (
            <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse shrink-0" />
          )}
          <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
            {contact.totalSessions}s
          </span>
        </div>
      </div>
    );
  }

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 touch-manipulation',
        selected && 'ring-2 ring-primary',
      )}
      onClick={handleClick}
    >
      <CardContent className="p-3 grid gap-2">
        {/* Top row: avatar / name / study count */}
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 min-w-0">
          {selectMode && (
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              onClick={(e) => e.stopPropagation()}
              className="h-4 w-4 rounded accent-primary shrink-0 self-start"
            />
          )}
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
            {initialsOf(contact.firstName, contact.lastName)}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground leading-none">
              Name
            </p>
            <h3 className="mt-0.5 text-sm font-bold leading-tight truncate">{nameNode}</h3>
          </div>
          <div className="flex flex-col items-end justify-self-end leading-none">
            <span className="text-sm font-bold">{contact.totalSessions}</span>
            <span className="text-[9px] font-bold uppercase text-muted-foreground">
              Studies
            </span>
          </div>
        </div>

        {/* Status */}
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground leading-none">
            Status
          </p>
          <div className="mt-1 flex items-center gap-1.5">
            <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', stageConfig.color)} />
            <span className="text-xs font-semibold truncate">{tStage(contact.pipelineStage)}</span>
            {contact.currentlyStudying && (
              <span
                className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse shrink-0"
                title={t('misc.active')}
              />
            )}
          </div>
        </div>

        {/* Teacher / Step quick-fields */}
        <div className="grid grid-cols-2 gap-1.5 min-w-0">
          <div className="min-w-0 rounded-md border border-border bg-muted/40 px-2 py-1.5">
            <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground leading-none">
              Teacher
            </p>
            <p className="mt-1 text-xs font-semibold truncate">
              {teacher ? `${teacher.firstName} ${teacher.lastName}` : contact.groupName || '—'}
            </p>
          </div>
          <div className="min-w-0 rounded-md border border-border bg-muted/40 px-2 py-1.5">
            <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground leading-none">
              Step
            </p>
            <p className="mt-1 text-xs font-semibold truncate">{step || '—'}</p>
          </div>
        </div>

        {/* Branches */}
        {branches.length > 0 && (
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground leading-none">
              Branches
            </p>
            <div className="mt-1 flex items-center gap-1.5 min-w-0 overflow-hidden">
              {branches.map((branch, i) => (
                <span
                  key={`${branch}-${i}`}
                  className={cn(
                    'truncate text-xs font-semibold',
                    i === 0 ? 'text-purple-600 dark:text-purple-400' : 'text-muted-foreground',
                  )}
                >
                  {branch}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Retention */}
        {contact.retentionExpired ? (
          <Badge
            variant="outline"
            className="w-fit border-red-500/40 bg-red-500/10 text-red-500 text-[9px]"
          >
            Retention expired
          </Badge>
        ) : contact.retainUntil ? (
          <p className="text-[10px] text-muted-foreground">
            Retained until {format(parseISO(contact.retainUntil), 'MMM d, yyyy')}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export const ContactCard = memo(ContactCardInner);
