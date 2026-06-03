'use client';

import { memo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  BOOKING_TYPE_CONFIG,
  PIPELINE_STAGE_CONFIG,
} from '@/lib/types';
import type { Contact, User } from '@/lib/types';
import { useTranslation } from '@/lib/i18n';
import { Phone, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';

function initialsOf(firstName?: string, lastName?: string): string {
  const a = (firstName || '').trim();
  const b = (lastName || '').trim();
  const first = a ? a[0]! : '';
  const second = b ? b[0]! : '';
  return `${first}${second}`.toUpperCase() || '•';
}

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
}

function ContactCardInner({
  contact,
  users,
  onClick,
  selectMode,
  selected,
  onToggleSelect,
  compact,
}: ContactCardProps) {
  const { t, tStage, tBookingType } = useTranslation();
  const typeConfig = BOOKING_TYPE_CONFIG[contact.type];
  const stageConfig = PIPELINE_STAGE_CONFIG[contact.pipelineStage];

  const resolvePartnerName = (id: string | null | undefined) => {
    if (!id) return null;
    const user = users.find((u) => u.id === id);
    if (user) return `${user.firstName} ${user.lastName}`.trim();
    return null;
  };

  const partnerNames = (contact.preachingPartnerIds || [])
    .map(resolvePartnerName)
    .filter((n): n is string => !!n);

  const handleClick = () => {
    if (selectMode && onToggleSelect) {
      onToggleSelect();
    } else {
      onClick();
    }
  };

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
          <span className="text-sm font-medium truncate">
            {contact.firstName} {contact.lastName}
          </span>
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
      <CardContent className="p-4 max-xl:p-3">
        {/* MOBILE (<xl): compact vertical card. The NAME is the hero (it was
            squeezed to nothing in the 2-col horizontal layout) and the type
            chip wraps instead of clipping at the card's right edge. */}
        <div className="xl:hidden flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            {selectMode && (
              <input
                type="checkbox"
                checked={selected}
                onChange={onToggleSelect}
                onClick={(e) => e.stopPropagation()}
                className="h-4 w-4 rounded accent-primary shrink-0"
              />
            )}
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
              {initialsOf(contact.firstName, contact.lastName)}
            </div>
            <span className="ml-auto text-[10px] font-medium text-muted-foreground shrink-0">
              {contact.totalSessions}s
            </span>
          </div>
          <h3 className="text-xs font-semibold leading-tight line-clamp-2 break-words">
            {contact.firstName} {contact.lastName}
          </h3>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={cn('h-2 w-2 rounded-full shrink-0', stageConfig.color)} />
            <span className="text-[10px] text-muted-foreground truncate">{tStage(contact.pipelineStage)}</span>
            {contact.currentlyStudying && (
              <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse shrink-0" title={t('misc.active')} />
            )}
          </div>
          <Badge
            variant="outline"
            className={cn(
              typeConfig.bgColor,
              typeConfig.color,
              'h-auto max-w-full self-start whitespace-normal break-words py-0.5 text-[8px] leading-tight',
            )}
          >
            {tBookingType(contact.type)}
          </Badge>
          {contact.phone && (
            <a
              href={`tel:${contact.phone}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground truncate touch-manipulation"
            >
              <Phone className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{contact.phone}</span>
            </a>
          )}
        </div>

        {/* DESKTOP (>=xl): original horizontal card — unchanged. */}
        <div className="hidden xl:block">
        <div className="flex items-start gap-3">
          {selectMode && (
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              onClick={(e) => e.stopPropagation()}
              className="mt-1 h-4 w-4 rounded accent-primary shrink-0"
            />
          )}

          {/* Initials avatar */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold">
            {initialsOf(contact.firstName, contact.lastName)}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold truncate">
                  {contact.firstName} {contact.lastName}
                </h3>
                {/* Clickable phone/email — min-w-0 + truncate so a long email
                    can't push the card past 320px on phone */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 min-w-0">
                  {contact.phone && (
                    <a
                      href={`tel:${contact.phone}`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors touch-manipulation"
                    >
                      <Phone className="h-3 w-3 shrink-0" />
                      {contact.phone}
                    </a>
                  )}
                  {contact.email && (
                    <a
                      href={`mailto:${contact.email}`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors truncate max-w-full min-w-0 touch-manipulation"
                    >
                      <Mail className="h-3 w-3 shrink-0" />
                      <span className="truncate">{contact.email}</span>
                    </a>
                  )}
                </div>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  typeConfig.bgColor,
                  typeConfig.color,
                  'text-[9px] shrink-0',
                )}
              >
                {tBookingType(contact.type)}
              </Badge>
            </div>

            {/* Stage + active indicator */}
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <div className={cn('h-2 w-2 rounded-full', stageConfig.color)} />
                <span className="text-xs text-muted-foreground">{tStage(contact.pipelineStage)}</span>
              </div>
              {contact.currentlyStudying && (
                <Badge variant="outline" className="text-[9px] border-green-500/40 text-green-500 gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                  {t('misc.active')}
                </Badge>
              )}
            </div>

            {/* Partners + last session + sessions */}
            <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <div className="flex items-center gap-1 truncate">
                {partnerNames.length > 0 && (
                  <span className="truncate">
                    {partnerNames.slice(0, 2).join(', ')}
                    {partnerNames.length > 2 && ` +${partnerNames.length - 2}`}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {contact.lastSessionDate && (
                  <span>{format(parseISO(contact.lastSessionDate), 'MMM d')}</span>
                )}
                <span className="font-medium">{contact.totalSessions} sessions</span>
              </div>
            </div>
          </div>
        </div>
        </div>
      </CardContent>
    </Card>
  );
}

export const ContactCard = memo(ContactCardInner);
