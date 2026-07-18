'use client';

import { PIPELINE_STAGE_CONFIG } from '@/lib/types';
import type { Contact, User } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';

/**
 * Shared "N contacts" drill-down popup — opened from a clicked pipeline bar
 * (StudentPipeline) or a clicked metric cell (TeacherMetrics). Selecting a
 * row hands the contact id back to the parent (groups/page.tsx), which opens
 * the existing ContactDetailDialog — this popup never renders contact detail
 * itself, only the list.
 */
interface ContactListPopupProps {
  open: boolean;
  onClose: () => void;
  /** e.g. "Foundation complete", "Studies 1–4" */
  title: string;
  /** The pre-filtered list to show. */
  contacts: Contact[];
  /** To resolve assigned teacher names. */
  users: User[];
  /** Parent opens ContactDetailDialog for this id. */
  onContactSelect: (contactId: string) => void;
}

export function ContactListPopup({
  open,
  onClose,
  title,
  contacts,
  users,
  onContactSelect,
}: ContactListPopupProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {contacts.length} {contacts.length === 1 ? 'contact' : 'contacts'}
          </p>
        </DialogHeader>

        {contacts.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            No contacts in this group.
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto -mr-1 pr-1 space-y-1">
            {contacts.map((c) => {
              const stageConfig = PIPELINE_STAGE_CONFIG[c.pipelineStage];
              const teacher = c.assignedTeacherId
                ? users.find((u) => u.id === c.assignedTeacherId)
                : undefined;
              const studiesInfo = c.currentlyStudying
                ? `${t('contact.sermon')} ${c.currentStep ?? 1}`
                : `${c.totalSessions} ${c.totalSessions === 1 ? 'study' : 'studies'}`;

              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onContactSelect(c.id);
                    onClose();
                  }}
                  className={cn(
                    'w-full min-h-11 rounded-md px-3 py-2 text-left transition-colors touch-manipulation',
                    'hover:bg-accent/60',
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={cn('h-2 w-2 shrink-0 rounded-full', stageConfig.color)} />
                        <span className="truncate text-sm font-medium">
                          {c.firstName} {c.lastName}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span>{stageConfig.label}</span>
                        <span>•</span>
                        <span>{studiesInfo}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-[11px] text-muted-foreground">
                      {teacher ? `${teacher.firstName} ${teacher.lastName}`.trim() : '—'}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
