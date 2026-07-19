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
import { Combobox, type ComboOption } from '@/components/shared/Combobox';
import { useCustomEntitiesStore } from '@/lib/stores/custom-entities-store';
import { useAuthStore } from '@/lib/stores/auth-store';
import { BookingType, ContactStatus, PipelineStage, PIPELINE_STAGE_CONFIG } from '@/lib/types';
import type { Contact, User } from '@/lib/types';
import { Loader2, Plus } from 'lucide-react';

interface ContactFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<Contact>) => Promise<void>;
  /** All users (for preaching partner autocomplete) */
  users: User[];
  /** All contacts (to derive known groups and suggestion lists) */
  allContacts: Contact[];
  /**
   * Decision 10: user ids (buildManageableScope ∪ self) the viewer may assign
   * a contact to. When provided, the assigned-teacher predictive field is
   * constrained to these. Absent → unconstrained (back-compat).
   */
  assignableTeacherIds?: string[];
}

/**
 * CREATE-only contact form (REV3 #4). Editing lives in ContactDetailDialog,
 * the single canonical detail/edit surface shared by Groups, Contacts, and
 * Admin — the old edit/duplicate path here (prefill, Save Changes, Delete,
 * the ?edit= read-only guard) is retired.
 */
export function ContactForm({
  open,
  onClose,
  onSubmit,
  users,
  allContacts,
  assignableTeacherIds,
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
  const [assignedTeacherId, setAssignedTeacherId] = useState<string | null>(null);
  const [subjectsStudied, setSubjectsStudied] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [newGroupMode, setNewGroupMode] = useState(false);
  const [newGroupValue, setNewGroupValue] = useState('');

  // ---------- Reset on open ----------
  useEffect(() => {
    if (open) {
      setName(''); setPhone(''); setGroupName(''); setStatus(PipelineStage.FIRST_STUDY);
      setPartners(['', '', '']); setSubjectsStudied([]); setNotes('');
      setAssignedTeacherId(null);
      setNewGroupMode(false);
      setNewGroupValue('');
    }
  }, [open]);

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
    // REV3 #6 nuance (user decision): partners are selectable from ANY active
    // user — plain members preach too. This aligns the create form's
    // suggestions with ContactDetailDialog's all-users list (the old
    // leaders-plus-'teacher'-tag filter hid e.g. "Clement" from suggestions
    // even though free text accepted him). Plus user-added "+ New" entries.
    const base = users
      .filter((u) => u.isActive !== false)
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

  // Assigned-teacher predictive field (packet): active users whose tags
  // include 'teacher' — same filter BookingWizard.tsx uses for its
  // teacherOptions Combobox — plus user-added custom teacher entities.
  const assignedTeacherOptions: ComboOption[] = useMemo(() => {
    // Decision 10: an assignment is bounded by the viewer's manageable
    // scope — a member can't assign a contact to an arbitrary teacher, and
    // a leader can't assign org-wide. `assignableTeacherIds` (from the
    // parent's buildManageableScope, plus self) constrains the real-user
    // options. Custom (localStorage) teacher entities the viewer typed
    // themselves stay available.
    const inScope = (id: string) =>
      !assignableTeacherIds || assignableTeacherIds.includes(id);
    const base = users
      .filter((u) => u.isActive !== false && Array.isArray(u.tags) && u.tags.includes('teacher') && inScope(u.id))
      .map((u) => ({ id: u.id, label: `${u.firstName} ${u.lastName}`.trim(), sublabel: u.role.replace('_', ' ') }));
    const custom = entities
      .filter((e) => e.kind === 'teacher')
      .map((e) => ({ id: e.id, label: e.name, sublabel: 'Custom teacher' }));
    return [...base, ...custom];
  }, [users, entities, assignableTeacherIds]);

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
        // Create-only (REV3 #4): every contact made here starts as an active
        // unbaptized contact; edits live in ContactDetailDialog.
        type: BookingType.UNBAPTIZED_CONTACT,
        status: ContactStatus.ACTIVE,
        // CONT-3 + assigned-teacher field (packet): an explicit pick in the
        // predictive field wins; left blank, the contact defaults to the
        // viewer (self-owned).
        assignedTeacherId: assignedTeacherId ?? viewer?.id,
        createdBy: viewer?.id ?? 'unknown',
      });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto overflow-x-hidden sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New Contact</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 min-w-0">
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
                <Button type="button" variant="outline" size="sm" onClick={() => setNewGroupMode(false)} className="touch-manipulation max-md:h-11 max-md:px-4">
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
                  className="gap-1 touch-manipulation max-md:h-11 max-md:px-4"
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

          {/* Branches (formerly "Preaching Partners" — label-only rename) */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Branches
            </Label>
            <p className="text-[11px] text-muted-foreground">
              Up to 3 branches linked to this contact
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

          {/* Assigned teacher — predictive field (packet). Only offered when
              a users list is available; sources the same active/'teacher'-tag
              filter as BookingWizard's teacherOptions Combobox. */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Assigned teacher
            </Label>
            <Combobox
              options={assignedTeacherOptions}
              value={assignedTeacherId}
              onChange={setAssignedTeacherId}
              placeholder="Search teachers..."
              emptyMessage="No teachers found"
            />
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

          {/* Actions — sticky bottom bar on phones so the primary Save stays
              reachable while the form scrolls in the bottom sheet; pb-safe
              clears the home indicator. Desktop keeps the inline row. */}
          <div className="flex gap-3 pt-2 max-md:sticky max-md:bottom-0 max-md:-mx-4 max-md:-mb-4 max-md:border-t max-md:border-border max-md:bg-popover max-md:px-4 max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-md:pt-3">
            <Button type="submit" disabled={loading} className="flex-1 h-11 text-base bg-amber-500 hover:bg-amber-600 text-black touch-manipulation">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create Contact
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
