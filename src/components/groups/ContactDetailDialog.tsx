'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { PredictiveInput } from '@/components/shared/PredictiveInput';
import { StepSubjectPicker } from '@/components/shared/StepSubjectPicker';
import { useCustomEntitiesStore } from '@/lib/stores/custom-entities-store';
import {
  PipelineStage,
  PIPELINE_STAGE_CONFIG,
  ContactStatus,
  UserRole,
  ROLE_LABELS,
} from '@/lib/types';
import type { Contact, User } from '@/lib/types';
import { canConvertContact, assignableRoles } from '@/lib/utils/permissions';
import type { ConvertContactPayload } from '@/lib/api/contacts';
import {
  Pencil,
  Check,
  X,
  Trash2,
  Loader2,
  Phone,
  Users as UsersIcon,
  BookOpen as BookOpenIcon,
  Tag,
  FileText,
  GraduationCap,
  Calendar,
  User as UserIcon,
  Plus,
  UserPlus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';
import { useTranslation } from '@/lib/i18n';

/**
 * Build a two-letter uppercase initial block from any contact-shaped
 * object. Safe when firstName or lastName is missing or empty (returns
 * just the available letter or a single placeholder) — fixes audit H-4.
 */
function initialsOf(firstName?: string, lastName?: string): string {
  const a = (firstName || '').trim();
  const b = (lastName || '').trim();
  const first = a ? a[0]! : '';
  const second = b ? b[0]! : '';
  const combined = `${first}${second}`.toUpperCase();
  return combined || '•';
}

/**
 * Contact detail popup that starts in VIEW mode (read-only card) with an
 * Edit button. Clicking Edit flips the same dialog to EDIT mode with the
 * full form inputs. Saving commits via the passed onSave callback, which
 * should hit the API and trigger a refetch so every consumer (tree icons,
 * other pages) sees the update.
 */
interface ContactDetailDialogProps {
  open: boolean;
  onClose: () => void;
  contact: Contact | null;
  users: User[];
  allContacts: Contact[];
  onSave: (id: string, data: Partial<Contact>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  /** CONT-5: viewer + scope so the dialog can gate the Convert button on
   *  canConvertContact. If absent, the button is hidden. */
  viewer?: User;
  subtreeUserIds?: string[];
  /** CONT-5: convert callback. Caller wires to contactsApi.convertToUser
   *  + refetch contacts/users. If absent, the button is hidden. */
  onConvert?: (contactId: string, payload: ConvertContactPayload) => Promise<void>;
}

export function ContactDetailDialog({
  open,
  onClose,
  contact,
  users,
  allContacts,
  onSave,
  onDelete,
  viewer,
  subtreeUserIds = [],
  onConvert,
}: ContactDetailDialogProps) {
  const [mode, setMode] = useState<'view' | 'edit' | 'convert'>('view');

  // Reset to view mode whenever a different contact is opened
  useEffect(() => {
    if (open) setMode('view');
  }, [open, contact?.id]);

  if (!contact) return null;

  const canShowConvert =
    !!viewer &&
    !!onConvert &&
    !contact.convertedToUserId &&
    canConvertContact(viewer, contact, subtreeUserIds);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            {mode === 'view'
              ? 'Contact Details'
              : mode === 'edit'
              ? 'Edit Contact'
              : 'Convert to user account'}
          </DialogTitle>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {mode === 'view' && (
            <motion.div
              key="view"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.15 }}
            >
              <ViewMode
                contact={contact}
                users={users}
                onEdit={() => setMode('edit')}
                onConvert={canShowConvert ? () => setMode('convert') : undefined}
                onClose={onClose}
              />
            </motion.div>
          )}
          {mode === 'edit' && (
            <motion.div
              key="edit"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.15 }}
            >
              <EditMode
                contact={contact}
                users={users}
                allContacts={allContacts}
                onCancel={() => setMode('view')}
                onSave={async (data) => {
                  await onSave(contact.id, data);
                  setMode('view');
                }}
                onDelete={onDelete}
              />
            </motion.div>
          )}
          {mode === 'convert' && viewer && onConvert && (
            <motion.div
              key="convert"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.15 }}
            >
              <ConvertMode
                contact={contact}
                viewer={viewer}
                users={users}
                onCancel={() => setMode('view')}
                onConfirm={async (payload) => {
                  await onConvert(contact.id, payload);
                  // After successful conversion the contact is now linked
                  // to a user; close the dialog so the parent can refetch.
                  onClose();
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// VIEW MODE
// ---------------------------------------------------------------------------
function ViewMode({
  contact,
  users,
  onEdit,
  onConvert,
  onClose,
}: {
  contact: Contact;
  users: User[];
  onEdit: () => void;
  onConvert?: () => void;
  onClose: () => void;
}) {
  const { t, tStage } = useTranslation();
  const stage = PIPELINE_STAGE_CONFIG[contact.pipelineStage];

  const resolvePartnerName = (id: string | null | undefined) => {
    if (!id) return null;
    const user = users.find((u) => u.id === id);
    if (user) return `${user.firstName} ${user.lastName}`.trim();
    return t('detail.unknownPartner');
  };

  const partners = (contact.preachingPartnerIds || [])
    .map(resolvePartnerName)
    .filter((n): n is string => !!n);

  return (
    <div className="space-y-5">
      {/* Header: avatar + name + stage badge */}
      <div className="flex items-start gap-4 pb-4 border-b border-border">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-2xl font-bold">
          {initialsOf(contact.firstName, contact.lastName)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-2xl font-bold">
            {contact.firstName} {contact.lastName}
          </div>
          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-base text-muted-foreground">
              <span className={cn('h-2.5 w-2.5 rounded-full', stage.color)} />
              {tStage(contact.pipelineStage)}
            </div>
            {contact.groupName && (
              <>
                <span className="text-muted-foreground">•</span>
                <span className="text-base text-muted-foreground">{contact.groupName}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Detail rows */}
      <div className="space-y-3">
        <Row
          icon={Phone}
          label="Phone"
          value={contact.phone || <span className="text-muted-foreground italic">Not provided</span>}
        />
        <Row icon={Tag} label="Group" value={contact.groupName || '—'} />
        <Row
          icon={GraduationCap}
          label="Currently Studying"
          value={
            contact.currentlyStudying && contact.currentSubject ? (
              <div>
                <div className="font-semibold text-base">Step {contact.currentStep}</div>
                <div className="text-base text-muted-foreground">{contact.currentSubject}</div>
              </div>
            ) : (
              <span className="text-muted-foreground italic">Not currently studying</span>
            )
          }
        />
        <Row
          icon={BookOpenIcon}
          label="Subjects Studied"
          value={
            contact.subjectsStudied && contact.subjectsStudied.length > 0 ? (
              <div>
                <div className="mb-1.5 text-sm text-muted-foreground">
                  {contact.subjectsStudied.length} subjects
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {contact.subjectsStudied.map((s) => (
                    <Badge key={s} variant="outline" className="text-xs font-normal">
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : (
              <span className="text-muted-foreground italic">None yet</span>
            )
          }
        />
        <Row
          icon={UsersIcon}
          label="Preaching Partners"
          value={
            partners.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {partners.map((p, i) => (
                  <Badge key={i} variant="outline" className="text-sm">
                    {p}
                  </Badge>
                ))}
              </div>
            ) : (
              <span className="text-muted-foreground italic">None</span>
            )
          }
        />
        <Row
          icon={Calendar}
          label="Session History"
          value={
            <div>
              <div className="font-medium">{contact.totalSessions} total sessions</div>
              {contact.lastSessionDate && (
                <div className="text-sm text-muted-foreground">
                  Last session: {format(parseISO(contact.lastSessionDate), 'MMM d, yyyy')}
                </div>
              )}
            </div>
          }
        />
        {contact.notes && (
          <Row
            icon={FileText}
            label="Notes"
            value={<div className="whitespace-pre-wrap text-base">{contact.notes}</div>}
          />
        )}
      </div>

      {/* Timeline */}
      {contact.timeline && contact.timeline.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            Timeline
          </div>
          <div className="max-h-[200px] overflow-y-auto space-y-0 border-l-2 border-border ml-2 pl-4">
            {[...contact.timeline].reverse().slice(0, 15).map((entry, i) => {
              const actionColors: Record<string, string> = {
                created: 'bg-green-400',
                stage_change: 'bg-purple-400',
                session: 'bg-blue-400',
                partner_change: 'bg-amber-400',
                note: 'bg-gray-400',
                updated: 'bg-cyan-400',
              };
              return (
                <div key={i} className="relative pb-3 last:pb-0">
                  <div className={cn(
                    'absolute -left-[21px] top-1.5 h-2 w-2 rounded-full',
                    actionColors[entry.action] || 'bg-gray-400',
                  )} />
                  <div className="text-[10px] text-muted-foreground">
                    {format(parseISO(entry.date), 'MMM d, yyyy')}
                  </div>
                  <div className="text-xs">{entry.details}</div>
                  <div className="text-[10px] text-muted-foreground/70">by {entry.userName}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        <Button type="button" variant="outline" onClick={onClose} className="flex-1 min-w-[100px] h-11 text-base">
          Close
        </Button>
        {/* CONT-5: convert is gated by canConvertContact — shown only when
             onConvert is supplied (i.e. the parent passed a viewer + scope
             and the contact is not already converted). */}
        {onConvert && (
          <Button
            type="button"
            variant="outline"
            onClick={onConvert}
            className="gap-2 h-11 text-base"
          >
            <UserPlus className="h-5 w-5" />
            Convert to user
          </Button>
        )}
        {contact.convertedToUserId && (
          <Badge variant="outline" className="self-center text-xs">
            Already converted
          </Badge>
        )}
        <Button
          type="button"
          onClick={onEdit}
          className="flex-1 min-w-[100px] gap-2 h-11 text-base bg-amber-500 hover:bg-amber-600 text-black"
        >
          <Pencil className="h-5 w-5" />
          Edit
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CONVERT MODE — promote the contact into a full User account
// ---------------------------------------------------------------------------
function ConvertMode({
  contact,
  viewer,
  users,
  onCancel,
  onConfirm,
}: {
  contact: Contact;
  viewer: User;
  users: User[];
  onCancel: () => void;
  onConfirm: (payload: ConvertContactPayload) => Promise<void>;
}) {
  const allowedRoles = useMemo(() => assignableRoles(viewer.role), [viewer.role]);
  // Default to the lowest assignable role (Member if available; otherwise
  // the highest the viewer can grant).
  const defaultRole = allowedRoles.includes(UserRole.MEMBER)
    ? UserRole.MEMBER
    : allowedRoles[0] ?? UserRole.MEMBER;
  const [role, setRole] = useState<UserRole>(defaultRole);

  // Eligible parents: matches the CreateUserWizard rule — at-or-above the
  // new user's role, not a Member, active. Plus the viewer themselves
  // (creator-as-parent is allowed by canCreateUser).
  const eligibleParents = useMemo(() => {
    const ix = (r: UserRole) => Object.values(UserRole).indexOf(r);
    return users.filter(
      (u) =>
        u.isActive !== false &&
        u.role !== UserRole.MEMBER &&
        ix(u.role) >= ix(role),
    );
  }, [users, role]);
  const [parentId, setParentId] = useState<string>(viewer.id);
  const [busy, setBusy] = useState(false);

  const handleConvert = async () => {
    setBusy(true);
    try {
      await onConfirm({ role, parentId, actorId: viewer.id });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
        <p className="font-medium">
          Promote {contact.firstName} {contact.lastName} into a Diamond user account.
        </p>
        <p className="mt-1 text-muted-foreground text-xs">
          The contact record stays in the system (status = <span className="font-mono">converted</span>) and
          the new user can log in. They&apos;ll be required to set a password on their first login.
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          New user&apos;s role
        </Label>
        <Select value={role} onValueChange={(v) => v && setRole(v as UserRole)}>
          <SelectTrigger>
            <span>{ROLE_LABELS[role] ?? role}</span>
          </SelectTrigger>
          <SelectContent>
            {allowedRoles.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABELS[r] ?? r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Reports to
        </Label>
        <Select value={parentId} onValueChange={(v) => v && setParentId(v)}>
          <SelectTrigger>
            <span>
              {(() => {
                const p = users.find((u) => u.id === parentId);
                return p
                  ? `${p.firstName} ${p.lastName}`.trim() || p.username
                  : 'Pick a parent';
              })()}
            </span>
          </SelectTrigger>
          <SelectContent>
            {eligibleParents.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {`${u.firstName} ${u.lastName}`.trim() || u.username}
                {' · '}
                {ROLE_LABELS[u.role] ?? u.role}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">
          The new user&apos;s parent in the org tree. Defaults to you.
        </p>
      </div>

      <div className="flex gap-3 pt-3 border-t border-border">
        <Button type="button" variant="outline" onClick={onCancel} className="gap-2" disabled={busy}>
          <X className="h-4 w-4" /> Cancel
        </Button>
        <Button
          type="button"
          onClick={handleConvert}
          disabled={busy || !parentId}
          className="flex-1 gap-2"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Convert
        </Button>
      </div>
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent/50">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-base mt-0.5">{value}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EDIT MODE (same layout as ContactForm body, but inline — no nested Dialog)
// ---------------------------------------------------------------------------
function EditMode({
  contact,
  users,
  allContacts,
  onCancel,
  onSave,
  onDelete,
}: {
  contact: Contact;
  users: User[];
  allContacts: Contact[];
  onCancel: () => void;
  onSave: (data: Partial<Contact>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}) {
  const { entities, add: addCustom } = useCustomEntitiesStore();

  const [name, setName] = useState(`${contact.firstName} ${contact.lastName}`.trim());
  const [phone, setPhone] = useState(contact.phone || '');
  const [groupName, setGroupName] = useState(contact.groupName || '');
  const [status, setStatus] = useState<PipelineStage>(contact.pipelineStage);

  // Partner name resolution accepts the caller's current `users` +
  // `entities` snapshot so the effect below can re-run whenever either
  // reference changes (audit H-2).
  const resolvePartnerName = (
    id: string | null | undefined,
    u: User[],
    ents: typeof entities,
  ): string => {
    if (!id) return '';
    const user = u.find((x) => x.id === id);
    if (user) return `${user.firstName} ${user.lastName}`.trim();
    const custom = ents.find((e) => e.id === id && e.kind === 'teacher');
    if (custom) return custom.name;
    return '';
  };

  const [partners, setPartners] = useState<string[]>(() => [
    resolvePartnerName(contact.preachingPartnerIds?.[0], users, entities),
    resolvePartnerName(contact.preachingPartnerIds?.[1], users, entities),
    resolvePartnerName(contact.preachingPartnerIds?.[2], users, entities),
  ]);

  // Re-resolve partners if the stores hydrate late or the contact
  // changes under us (e.g. user opens the edit form, then the custom
  // entities store finishes loading a teacher the form references).
  useEffect(() => {
    setPartners([
      resolvePartnerName(contact.preachingPartnerIds?.[0], users, entities),
      resolvePartnerName(contact.preachingPartnerIds?.[1], users, entities),
      resolvePartnerName(contact.preachingPartnerIds?.[2], users, entities),
    ]);
    // `resolvePartnerName` is a stable function literal — no need to
    // include it in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact.id, contact.preachingPartnerIds, users, entities]);
  const [subjectsStudied, setSubjectsStudied] = useState<string[]>(
    contact.subjectsStudied || [],
  );
  const [notes, setNotes] = useState(contact.notes || '');
  const [loading, setLoading] = useState(false);
  const [newGroupMode, setNewGroupMode] = useState(false);
  const [newGroupValue, setNewGroupValue] = useState('');

  const nameSuggestions = useMemo(
    () => Array.from(new Set(allContacts.map((c) => `${c.firstName} ${c.lastName}`.trim()))),
    [allContacts],
  );
  const groupSuggestions = useMemo(() => {
    const fromContacts = allContacts.map((c) => c.groupName).filter(Boolean) as string[];
    const fromCustom = entities.filter((e) => e.kind === 'group').map((e) => e.name);
    return Array.from(new Set([...fromContacts, ...fromCustom])).sort();
  }, [allContacts, entities]);

  // Preaching partner options = every active user (any role can be a
  // partner — partnership isn't gated by tags). Plus user-added custom
  // names persisted to the custom-entities store.
  const partnerOptions = useMemo(() => {
    const base = users.map((u) => ({
      id: u.id,
      name: `${u.firstName} ${u.lastName}`.trim(),
    }));
    const custom = entities.filter((e) => e.kind === 'teacher').map((e) => ({ id: e.id, name: e.name }));
    return [...custom, ...base];
  }, [users, entities]);

  const partnerSuggestions = useMemo(() => partnerOptions.map((p) => p.name), [partnerOptions]);
  const customSubjects = entities.filter((e) => e.kind === 'other').map((e) => e.name);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parts = name.trim().split(/\s+/);
    const firstName = parts[0] || '';
    const lastName = parts.slice(1).join(' ');

    // M-8: resolve partner names to IDs in priority order — exact match
    // first, then case-insensitive, and only then fall back to creating
    // a new custom entity. Prefers real users over same-named custom
    // entities so duplicate custom rows don't silently accumulate.
    const partnerIds = partners.map((p) => {
      const value = p.trim();
      if (!value) return null;
      const exact = partnerOptions.find((o) => o.name === value);
      if (exact) return exact.id;
      const lower = value.toLowerCase();
      const ci = partnerOptions.find((o) => o.name.toLowerCase() === lower);
      if (ci) return ci.id;
      const entity = addCustom('teacher', value);
      return entity.id;
    });

    const resolvedGroup = newGroupMode && newGroupValue.trim() ? newGroupValue.trim() : groupName;
    if (newGroupMode && newGroupValue.trim()) {
      addCustom('group', newGroupValue.trim());
    }

    setLoading(true);
    try {
      await onSave({
        firstName,
        lastName,
        phone: phone || undefined,
        groupName: resolvedGroup || undefined,
        pipelineStage: status,
        preachingPartnerIds: partnerIds,
        subjectsStudied,
        notes: notes || undefined,
        type: contact.type,
        status: contact.status || ContactStatus.ACTIVE,
      });
      toast.success('Contact updated');
    } catch {
      toast.error('Failed to save');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    if (!confirm(`Delete contact "${contact.firstName} ${contact.lastName}"? This cannot be undone.`)) return;
    setLoading(true);
    try {
      await onDelete(contact.id);
      toast.success('Contact deleted');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Name */}
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <UserIcon className="h-3 w-3" /> Name
        </Label>
        <PredictiveInput
          suggestions={nameSuggestions}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      {/* Phone */}
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Phone</Label>
        <PredictiveInput
          suggestions={allContacts.map((c) => c.phone).filter((p): p is string => !!p)}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          type="tel"
        />
      </div>

      {/* Group */}
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Group</Label>
        {newGroupMode ? (
          <div className="flex gap-2">
            <PredictiveInput
              suggestions={[]}
              value={newGroupValue}
              onChange={(e) => setNewGroupValue(e.target.value)}
              placeholder="New group name"
              autoFocus
            />
            <Button type="button" variant="outline" size="sm" onClick={() => setNewGroupMode(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <div className="flex-1">
              <PredictiveInput
                suggestions={groupSuggestions}
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setNewGroupMode(true)}
              className="gap-1"
            >
              <Plus className="h-3 w-3" /> New
            </Button>
          </div>
        )}
      </div>

      {/* Status */}
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Status</Label>
        <Select value={status} onValueChange={(v) => v && setStatus(v as PipelineStage)}>
          <SelectTrigger>
            <span>{PIPELINE_STAGE_CONFIG[status]?.label || 'Select status'}</span>
          </SelectTrigger>
          <SelectContent>
            {Object.entries(PIPELINE_STAGE_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Preaching Partners */}
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Preaching Partners
        </Label>
        <p className="text-[11px] text-muted-foreground">
          Up to 3 brothers/sisters who preached with this contact
        </p>
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <PredictiveInput
              key={i}
              suggestions={partnerSuggestions}
              value={partners[i]}
              onChange={(e) => {
                const next = [...partners];
                next[i] = e.target.value;
                setPartners(next);
              }}
              placeholder={`Partner ${i + 1}`}
            />
          ))}
        </div>
      </div>

      {/* Subjects Studied */}
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Subjects Studied
        </Label>
        <StepSubjectPicker
          value={subjectsStudied}
          onChange={setSubjectsStudied}
          extraSubjects={customSubjects}
        />
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Notes</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-3 border-t border-border">
        <Button type="button" variant="outline" onClick={onCancel} className="gap-2">
          <X className="h-4 w-4" /> Cancel
        </Button>
        <Button
          type="submit"
          disabled={loading}
          className="flex-1 gap-2 bg-amber-500 hover:bg-amber-600 text-black"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Save Changes
        </Button>
        {onDelete && (
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={loading}
            className="gap-2"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </form>
  );
}
