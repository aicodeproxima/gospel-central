'use client';

import { useState, useEffect, useMemo } from 'react';
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
import { PredictiveInput } from '@/components/shared/PredictiveInput';
import { StepSubjectPicker } from '@/components/shared/StepSubjectPicker';
import { useCustomEntitiesStore } from '@/lib/stores/custom-entities-store';
import { useAuthStore } from '@/lib/stores/auth-store';
import { BookingType, ContactStatus, PipelineStage, PIPELINE_STAGE_CONFIG } from '@/lib/types';
import type { Contact, User } from '@/lib/types';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface ContactFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<Contact>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  contact?: Contact | null;
  /** All users (for preaching partner autocomplete) */
  users: User[];
  /** All contacts (to derive known groups and suggestion lists) */
  allContacts: Contact[];
}

export function ContactForm({
  open,
  onClose,
  onSubmit,
  onDelete,
  contact,
  users,
  allContacts,
}: ContactFormProps) {
  const { entities, add: addCustom } = useCustomEntitiesStore();
  // CONT-3: pull viewer so a newly-created contact gets owner=viewer.id
  // by default. Reassign-to-other-owner is gated by canCreateContact and
  // ships in a follow-up batch (Convert + reassign UI).
  const viewer = useAuthStore((s) => s.user);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [groupName, setGroupName] = useState('');
  const [status, setStatus] = useState<PipelineStage>(PipelineStage.FIRST_STUDY);
  const [partners, setPartners] = useState<string[]>(['', '', '']);
  const [subjectsStudied, setSubjectsStudied] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [newGroupMode, setNewGroupMode] = useState(false);
  const [newGroupValue, setNewGroupValue] = useState('');

  // ---------- Prefill ----------
  // We need partnerOptions first for ID→name resolution during prefill
  const resolvePartnerName = (idOrName: string | null | undefined): string => {
    if (!idOrName) return '';
    const user = users.find((u) => u.id === idOrName);
    if (user) return `${user.firstName} ${user.lastName}`.trim();
    const custom = entities.find((e) => e.id === idOrName && e.kind === 'teacher');
    if (custom) return custom.name;
    return idOrName; // fall back to free text
  };

  useEffect(() => {
    if (open) {
      if (contact) {
        setName(`${contact.firstName} ${contact.lastName}`.trim());
        setPhone(contact.phone || '');
        setGroupName(contact.groupName || '');
        setStatus(contact.pipelineStage);
        setPartners([
          resolvePartnerName(contact.preachingPartnerIds?.[0]),
          resolvePartnerName(contact.preachingPartnerIds?.[1]),
          resolvePartnerName(contact.preachingPartnerIds?.[2]),
        ]);
        setSubjectsStudied(contact.subjectsStudied || []);
        setNotes(contact.notes || '');
      } else {
        setName(''); setPhone(''); setGroupName(''); setStatus(PipelineStage.FIRST_STUDY);
        setPartners(['', '', '']); setSubjectsStudied([]); setNotes('');
      }
      setNewGroupMode(false);
      setNewGroupValue('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contact, users, entities]);

  // ---------- Suggestion sources ----------
  const nameSuggestions = useMemo(
    () => Array.from(new Set(allContacts.map((c) => `${c.firstName} ${c.lastName}`.trim()))),
    [allContacts],
  );

  const groupSuggestions = useMemo(() => {
    const fromContacts = allContacts.map((c) => c.groupName).filter(Boolean) as string[];
    const fromUsers = users.map((u) => (u as User & { groupName?: string }).groupName).filter(Boolean) as string[];
    const fromCustom = entities.filter((e) => e.kind === 'group').map((e) => e.name);
    return Array.from(new Set([...fromContacts, ...fromUsers, ...fromCustom])).sort();
  }, [allContacts, users, entities]);

  const partnerOptions = useMemo(() => {
    // Anyone with the 'teacher' tag plus all leader roles. (Teacher used to
    // be a role; in v1 it became a tag — leaders are seeded with the tag,
    // so the legacy filter is preserved.) Plus user-added "+ New" entries.
    const leaderRoles = new Set(['team_leader', 'group_leader', 'branch_leader', 'overseer', 'dev']);
    const base = users
      .filter((u) => leaderRoles.has(u.role) || (Array.isArray(u.tags) && u.tags.includes('teacher')))
      .map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`.trim() }));
    const custom = entities
      .filter((e) => e.kind === 'teacher')
      .map((e) => ({ id: e.id, name: e.name }));
    return [...base, ...custom];
  }, [users, entities]);

  // For free-text partner picker, show available names
  const partnerSuggestions = useMemo(
    () => partnerOptions.map((p) => p.name),
    [partnerOptions],
  );

  const customSubjects = entities.filter((e) => e.kind === 'other').map((e) => e.name);

  // ---------- Submit ----------
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parts = name.trim().split(/\s+/);
    const firstName = parts[0] || '';
    const lastName = parts.slice(1).join(' ');

    // Resolve each partner string to an ID (audit M-8). Priority: exact
    // match → case-insensitive match → new custom entity. Exact first so
    // two real users with the same name don't silently collapse into one.
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
      await onSubmit({
        firstName,
        lastName,
        phone: phone || undefined,
        groupName: resolvedGroup || undefined,
        pipelineStage: status,
        preachingPartnerIds: partnerIds,
        subjectsStudied,
        notes: notes || undefined,
        // Preserve booking type + status if editing
        type: contact?.type || BookingType.UNBAPTIZED_CONTACT,
        status: contact?.status || ContactStatus.ACTIVE,
        // CONT-3: owner attribution. Edit preserves the existing owner;
        // create defaults to the viewer (self-owned). Reassign-to-other
        // is a future batch.
        assignedTeacherId: contact?.assignedTeacherId ?? viewer?.id,
        createdBy: contact?.createdBy ?? viewer?.id ?? 'unknown',
      });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!contact || !onDelete) return;
    if (!confirm(`Delete contact "${contact.firstName} ${contact.lastName}"? This cannot be undone.`)) return;
    setLoading(true);
    try {
      await onDelete(contact.id);
      toast.success('Contact deleted');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{contact ? 'Edit Contact' : 'New Contact'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Name */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Name</Label>
            <PredictiveInput
              suggestions={nameSuggestions}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter name"
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
              placeholder="Phone number"
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
                    placeholder="Select or type a group"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setNewGroupMode(true)}
                  className="gap-1"
                >
                  <Plus className="h-3 w-3" />
                  New
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

          {/* Preaching Partners — 3 fields */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Preaching Partners
            </Label>
            <p className="text-[11px] text-muted-foreground">
              Up to 3 brothers/sisters (from any branch) who preached with this contact
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
              placeholder="Type or pick below"
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Any additional information..."
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={loading} className="flex-1 h-11 text-base bg-amber-500 hover:bg-amber-600 text-black">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {contact ? 'Save Changes' : 'Create Contact'}
            </Button>
            {contact && onDelete && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={loading}
                className="h-11 gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
