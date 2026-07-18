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
import { Badge } from '@/components/ui/badge';
import { Combobox, type ComboOption } from '@/components/shared/Combobox';
import { StepSubjectPicker } from '@/components/shared/StepSubjectPicker';
import { useBookingStore } from '@/lib/stores/booking-store';
import { useCustomEntitiesStore, isBackendManagedId } from '@/lib/stores/custom-entities-store';
import { useAuthStore } from '@/lib/stores/auth-store';
import { Activity, BookingType, ContactStatus, PipelineStage } from '@/lib/types';
import type { Area, BlockedSlot, Booking, BookingFormData, Contact, User } from '@/lib/types';
import { getDaySlots, DEFAULT_SLOT_START_HOUR, formatDuration } from '@/lib/utils/availability';
import { useTimeFormat } from '@/lib/hooks/useTimeFormat';
import { isApiError } from '@/lib/api/client';
import { contactsApi } from '@/lib/api/contacts';
import {
  buildVisibilityScope,
  canEditBooking,
  canSetBookingStatus,
  canViewContact,
} from '@/lib/utils/permissions';
import { BOOKING_STATUS_CONFIG, BookingStatus } from '@/lib/types/booking';
import { bookingStatusI18nKey, isBaptizedType } from '@/lib/utils/booking-display';
import { WhenStep } from './WhenStep';
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  BookOpen,
  Check,
  ChevronRight,
  ClipboardCheck,
  Loader2,
  RotateCcw,
  Trash2,
  Users,
  UsersRound,
  Briefcase,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

type ActivityGroup = 'bible_study' | 'group_activity' | 'event_committee' | 'leader_meeting';

interface WizardProps {
  areas: Area[];
  bookings: Booking[];
  users: User[];
  contacts: Contact[];
  /** Service times + admin blackouts. The wizard greys out any slot that
   *  overlaps one of these so the user can't pick a window the backend
   *  will 409-reject. (BLOCK-1.) */
  blockedSlots?: BlockedSlot[];
  onSubmit: (data: BookingFormData) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onCancel?: (id: string, reason: string) => Promise<void>;
  onRestore?: (id: string) => Promise<void>;
  /** Phase 3: outcome-status transitions (Completed / No Show / Rescheduled /
   *  back to scheduled). Server re-gates via canSetBookingStatus; metrics move
   *  on the →completed edge. */
  onSetStatus?: (
    id: string,
    status: 'bible_study' | 'completed' | 'no_show' | 'rescheduled',
  ) => Promise<void>;
}

const ACTIVITY_GROUPS: {
  key: ActivityGroup;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  defaultActivity: Activity;
  defaultType: BookingType;
}[] = [
  {
    key: 'bible_study',
    label: 'Bible Study',
    description: 'Study sessions with contacts (in-person or Zoom). Or Timeline.',
    icon: BookOpen,
    color: 'from-blue-500/20 to-blue-600/10 border-blue-500/40',
    defaultActivity: Activity.BIBLE_STUDY,
    defaultType: BookingType.UNBAPTIZED_CONTACT,
  },
  {
    key: 'group_activity',
    label: 'Group Activity',
    description: 'Fellowship, special videos, group events',
    icon: UsersRound,
    color: 'from-purple-500/20 to-purple-600/10 border-purple-500/40',
    defaultActivity: Activity.GROUP_ACTIVITY,
    defaultType: BookingType.GROUP_ACTIVITIES,
  },
  {
    key: 'event_committee',
    label: 'Event / Committee',
    description: 'Committee meetings, missions, events',
    icon: Briefcase,
    color: 'from-amber-500/20 to-amber-600/10 border-amber-500/40',
    defaultActivity: Activity.COMMITTEE_MEETING,
    defaultType: BookingType.TEAM_ACTIVITIES,
  },
  {
    key: 'leader_meeting',
    label: 'Leader / Group / Team Meeting',
    description: 'Leadership, group, or team meetings',
    icon: Users,
    color: 'from-green-500/20 to-green-600/10 border-green-500/40',
    defaultActivity: Activity.TEAM_MEETING,
    defaultType: BookingType.TEAM_ACTIVITIES,
  },
];

/**
 * Phase 4 flow (Decision 5): the "When" page is ALWAYS first and consolidates
 * activity group + date + In-Person/Zoom + Unbaptized/Baptized + start→end
 * time picking. Study: when→room→leader→contact→subject→confirm (6 steps);
 * non-study: when→room→leader→confirm (4). The old activity/date/mode/time
 * steps are folded in; the duration selector is gone (duration derives from
 * the picked start→end range).
 */
type Step =
  | 'when'
  | 'room'
  | 'leader'
  | 'contact'
  | 'subject'
  | 'confirm';

export function BookingWizard({ areas, bookings, users, contacts, blockedSlots = [], onSubmit, onDelete, onCancel, onRestore, onSetStatus }: WizardProps) {
  const { t } = useTranslation();
  const { isBookingModalOpen, closeBookingModal, selectedBooking, bookingSlot } = useBookingStore();
  const { clock } = useTimeFormat();
  const isEdit = !!selectedBooking;
  const { entities, add: addCustom, remove: removeCustom } = useCustomEntitiesStore();
  // CAL-4 / CAL-6: pull viewer + build visibility scope so the contact
  // picker can filter to viewer's subtree and the cancel/restore buttons
  // can hide when canEditBooking is false.
  const viewer = useAuthStore((s) => s.user);
  const scope = useMemo(
    () => buildVisibilityScope(viewer, users),
    [viewer, users],
  );
  const canEditCurrent = !selectedBooking
    ? true
    : !!viewer && canEditBooking(viewer, selectedBooking, scope.userIds);

  const [step, setStep] = useState<Step>('when');
  const [activityGroup, setActivityGroup] = useState<ActivityGroup | null>(null);
  const [date, setDate] = useState<Date>(new Date());
  const [roomId, setRoomId] = useState<string>('');
  const [leaderId, setLeaderId] = useState<string>('');
  const [mode, setMode] = useState<'in_person' | 'zoom' | null>(null);
  const [contactId, setContactId] = useState<string>('');
  // Phase 4: segment renamed "Baptized Persecuted" → "Baptized"; new baptized
  // in-person bookings store BAPTIZED_IN_PERSON (the _PERSECUTED type remains
  // readable in old data only).
  const [contactBaptismType, setContactBaptismType] = useState<'unbaptized' | 'baptized' | null>(null);
  const [startSlotIdx, setStartSlotIdx] = useState<number | null>(null);
  const [durationSlots, setDurationSlots] = useState(1); // derived from the picked start→end range
  // STUDY-1: subjects covered this session + the "not sure yet" escape hatch.
  const [subjectsStudied, setSubjectsStudied] = useState<string[]>([]);
  const [addSubjectLater, setAddSubjectLater] = useState(false);
  const [editReason, setEditReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelReasonInput, setCancelReasonInput] = useState('');

  // ROOM-1: only show rooms that accept bookings — Sanctuary + Fellowship
  // (service-only spaces) are flagged isBookable=false so they don't
  // appear in the picker.
  const allRooms = useMemo(
    () => areas.flatMap((a) => a.rooms).filter((r) => r.isBookable !== false),
    [areas],
  );
  const customRooms = entities.filter((e) => e.kind === 'room');
  const customTeachers = entities.filter((e) => e.kind === 'teacher');
  const customContacts = entities.filter((e) => e.kind === 'contact');

  // REV3 #7: the church a wizard-created contact lands in. The slot-click path
  // used to drop it entirely (created contacts had NO groupName). Defaults to
  // the selected ROOM's church — the room is authoritative even when the
  // calendar is showing a different church — and the Confirm step surfaces it
  // as an editable prefill so the user can override.
  const [newContactChurch, setNewContactChurch] = useState<string | null>(null);
  const roomChurchName = useMemo(
    () => areas.find((a) => a.rooms.some((r) => r.id === roomId))?.name ?? null,
    [areas, roomId],
  );

  // Reset when modal opens
  useEffect(() => {
    if (isBookingModalOpen) {
      if (selectedBooking) {
        // Edit mode: prefill
        const group = activityToGroup(selectedBooking.activity as Activity | undefined);
        setActivityGroup(group);
        setDate(new Date(selectedBooking.startTime));
        setRoomId(selectedBooking.roomId);
        setLeaderId(selectedBooking.teacherId || '');
        setMode(
          selectedBooking.type === BookingType.UNBAPTIZED_ZOOM || selectedBooking.type === BookingType.BAPTIZED_ZOOM
            ? 'zoom'
            : 'in_person',
        );
        setContactId(selectedBooking.contactId || '');
        // Any stored baptized type (in-person / zoom / legacy persecuted)
        // maps to the "Baptized" segment.
        setContactBaptismType(isBaptizedType(selectedBooking.type) ? 'baptized' : 'unbaptized');
        // STUDY-1: prefill subjects from the booking's stored subject (edits
        // don't re-push to the contact card — the create path owns that).
        setSubjectsStudied(selectedBooking.subject ? [selectedBooking.subject] : []);
        setAddSubjectLater(false);
        // C3/FINDING-2: prefill the time selection from the booking being edited.
        // The edit branch set everything EXCEPT startSlotIdx/durationSlots, so
        // handleSubmit dead-ended on startSlotIdx===null ('Select a time slot'),
        // and a stale value could carry over create→edit on the persistently-
        // mounted wizard. Derive directly (don't read the daySlots useMemo —
        // same-render ordering hazard); grid is 30-min from DEFAULT_SLOT_START_HOUR.
        const editStart = new Date(selectedBooking.startTime);
        const editEnd = new Date(selectedBooking.endTime);
        const editIdx =
          (editStart.getHours() * 60 + editStart.getMinutes() - DEFAULT_SLOT_START_HOUR * 60) / 30;
        const editDur = Math.max(
          1,
          Math.round((editEnd.getTime() - editStart.getTime()) / (30 * 60000)),
        );
        // Off-grid (non-:00/:30, or before the start hour) → null = safe re-pick.
        setStartSlotIdx(Number.isInteger(editIdx) && editIdx >= 0 ? editIdx : null);
        setDurationSlots(editDur);
        setStep('confirm');
      } else {
        // New mode
        if (bookingSlot) {
          const slotStart = new Date(bookingSlot.start);
          setDate(slotStart);
          setRoomId(bookingSlot.roomId);
          // Decision 5: a calendar slot-click prefills day + START time only —
          // the user picks the end time on the When page (so the range starts
          // as one 30-min slot, extendable by clicking a later slot).
          // GUARD: only pre-select if the clicked slot is actually bookable —
          // the calendar grid can surface a blocked service time as clickable,
          // and pre-selecting it would dead-end at submit (409). Off-grid /
          // occupied → null = nothing chosen; blocked slots render disabled.
          const slotIdx =
            (slotStart.getHours() * 60 + slotStart.getMinutes() - DEFAULT_SLOT_START_HOUR * 60) / 30;
          const room = allRooms.find((r) => r.id === bookingSlot.roomId);
          // (No excludeBookingId here — this branch only runs for NEW
          // bookings created from a slot click; there is no selectedBooking.)
          const probe = getDaySlots(slotStart, bookingSlot.roomId, bookings, {
            blockedSlots,
            areaId: room?.areaId,
          });
          const fits =
            Number.isInteger(slotIdx) &&
            slotIdx >= 0 &&
            !!probe[slotIdx] &&
            !probe[slotIdx].occupied;
          setStartSlotIdx(fits ? slotIdx : null);
          setDurationSlots(1);
        } else {
          setDate(new Date());
          setRoomId('');
          setStartSlotIdx(null);
          setDurationSlots(1);
        }
        setActivityGroup(null);
        setLeaderId('');
        setMode(null);
        setContactId('');
        setContactBaptismType(null);
        setSubjectsStudied([]);
        setAddSubjectLater(false);
        setStep('when');
      }
      setEditReason('');
      // (F4) The cancel-confirm overlay is component state that survived a
      // Dialog close (onOpenChange only clears the STORE). Without this, the
      // overlay — with the previous booking's typed reason — re-appeared over
      // the NEXT booking opened, one click away from cancelling the wrong one.
      setShowCancelConfirm(false);
      setCancelReasonInput('');
    }
  }, [isBookingModalOpen, selectedBooking, bookingSlot]);

  // Build room options with availability. Phase 4: time is picked BEFORE the
  // room, so when a range is selected each room is additionally gated on the
  // WHOLE range being free there (the design note: "Room step filters rooms
  // by availability FOR the selected range").
  const roomOptions: ComboOption[] = useMemo(() => {
    const base: ComboOption[] = allRooms.map((r) => {
      const slots = getDaySlots(date, r.id, bookings, {
        blockedSlots,
        areaId: r.areaId,
        // Editing: the booking's own window doesn't count against its room.
        excludeBookingId: selectedBooking?.id,
      });
      const free = slots.filter((s) => !s.occupied).length;
      const fitsRange =
        startSlotIdx === null ||
        (() => {
          for (let j = 0; j < durationSlots; j++) {
            const s = slots[startSlotIdx + j];
            if (!s || s.occupied) return false;
          }
          return true;
        })();
      return {
        id: r.id,
        label: r.name,
        sublabel: !fitsRange
          ? 'Booked at the selected time'
          : free > 0
            ? `${free} free 30-min slots`
            : 'Fully booked',
        disabled: free === 0 || !fitsRange,
        disabledReason:
          free === 0
            ? 'No availability this day'
            : !fitsRange
              ? 'Not free at the selected time'
              : undefined,
      };
    });
    const custom: ComboOption[] = customRooms.map((c) => ({
      id: c.id,
      label: c.name,
      sublabel: 'Custom room',
    }));
    return [...base, ...custom];
  }, [allRooms, customRooms, date, bookings, blockedSlots, selectedBooking?.id, startSlotIdx, durationSlots]);

  // Phase 4: time is picked before the leader, so the teacher-busy check
  // moved from the old time grid onto the Leader step (+ the submit
  // pre-flight). Teachers with another non-cancelled booking overlapping the
  // selected range are disabled here.
  const busyTeacherIds = useMemo(() => {
    const set = new Set<string>();
    if (startSlotIdx === null) return set;
    const rangeStart = new Date(date);
    rangeStart.setHours(
      DEFAULT_SLOT_START_HOUR + Math.floor(startSlotIdx / 2),
      (startSlotIdx % 2) * 30,
      0,
      0,
    );
    const startMs = rangeStart.getTime();
    const endMs = startMs + durationSlots * 30 * 60000;
    for (const b of bookings) {
      if (!b.teacherId) continue;
      if (b.id === selectedBooking?.id) continue; // self-conflict exclusion
      if (b.status === 'cancelled') continue; // cancelled frees the slot
      const bs = new Date(b.startTime).getTime();
      const be = new Date(b.endTime).getTime();
      if (bs < endMs && be > startMs) set.add(b.teacherId);
    }
    return set;
  }, [bookings, startSlotIdx, durationSlots, date, selectedBooking?.id]);

  // Anyone with the 'teacher' tag is eligible to lead a Bible Study,
  // regardless of role. (Teacher used to be a role; in v1 it became a tag.)
  // CAL-3: filter out soft-deleted users so deactivated teachers don't
  // appear in the picker.
  const teacherOptions: ComboOption[] = useMemo(() => {
    const teachers = users.filter(
      (u) =>
        u.isActive !== false &&
        Array.isArray(u.tags) &&
        u.tags.includes('teacher'),
    );
    const base = teachers.map((t) => ({
      id: t.id,
      label: `${t.firstName} ${t.lastName}`.trim(),
      sublabel: busyTeacherIds.has(t.id)
        ? 'Busy at the selected time'
        : t.role.replace('_', ' '),
      disabled: busyTeacherIds.has(t.id),
      disabledReason: busyTeacherIds.has(t.id)
        ? 'Already booked at the selected time'
        : undefined,
    }));
    const custom: ComboOption[] = customTeachers.map((c) => ({
      id: c.id,
      label: c.name,
      sublabel: 'Custom teacher',
    }));
    return [...custom, ...base];
  }, [users, customTeachers, busyTeacherIds]);

  // CAL-4: contact picker scoped to what the viewer is allowed to see.
  // Members and Team / Group leaders only see contacts in their subtree;
  // Branch Leader+ see all contacts.
  const contactOptions: ComboOption[] = useMemo(() => {
    const visible = viewer
      ? contacts.filter((c) => canViewContact(viewer, c, scope.userIds))
      : [];
    const base = visible.map((c) => ({
      id: c.id,
      label: `${c.firstName} ${c.lastName}`,
      sublabel: c.currentlyStudying ? `${t('contact.sermon')} ${c.currentStep}` : c.pipelineStage,
    }));
    const custom: ComboOption[] = customContacts.map((c) => ({
      id: c.id,
      label: c.name,
      sublabel: 'Custom contact',
    }));
    return [...custom, ...base];
  }, [contacts, customContacts, viewer, scope.userIds, t]);

  // Time slots for selected room + date — now blocked-slot- and
  // teacher-conflict aware. (BLOCK-1, CAL-2.) Phase 4: when editing, the
  // booking's OWN window is excluded from both room + teacher occupancy so a
  // teacher-only edit no longer self-conflicts ("time isn't available").
  const daySlots = useMemo(() => {
    if (!roomId) return [];
    const room = allRooms.find((r) => r.id === roomId);
    return getDaySlots(date, roomId, bookings, {
      blockedSlots,
      areaId: room?.areaId,
      teacherId: leaderId || undefined,
      teacherBookings: bookings,
      clock,
      excludeBookingId: selectedBooking?.id,
    });
  }, [roomId, date, bookings, blockedSlots, allRooms, leaderId, clock, selectedBooking?.id]);

  // Slots for the When page's time grid. Room is usually not chosen yet
  // (time comes first now), so before a room exists only GLOBAL blocked
  // slots grey out (area-scoped blocks resolve once the room implies an
  // area). With a room prefilled (calendar slot-click / edit), the full
  // room+teacher occupancy applies — same grid bounds as daySlots, so slot
  // INDEXES are interchangeable between the two.
  const whenSlots = useMemo(() => {
    if (roomId) return daySlots;
    return getDaySlots(date, '__no_room__', [], { blockedSlots, clock });
  }, [roomId, daySlots, date, blockedSlots, clock]);

  // Total steps for progress bar. Study = when→room→leader→contact→subject→
  // confirm (6); non-study (and before an activity is picked) = 4.
  const stepsNeeded: Step[] = useMemo(() => {
    const base: Step[] = ['when', 'room', 'leader'];
    if (activityGroup === 'bible_study') {
      base.push('contact', 'subject');
    }
    base.push('confirm');
    return base;
  }, [activityGroup]);

  const currentStepIndex = stepsNeeded.indexOf(step);
  const progress = ((currentStepIndex + 1) / stepsNeeded.length) * 100;

  function goNext() {
    const idx = stepsNeeded.indexOf(step);
    if (idx < stepsNeeded.length - 1) setStep(stepsNeeded[idx + 1]);
  }
  function goBack() {
    const idx = stepsNeeded.indexOf(step);
    if (idx > 0) setStep(stepsNeeded[idx - 1]);
  }

  // Resolve final type from selections. Phase 4: baptized + in-person now
  // stores BAPTIZED_IN_PERSON (BAPTIZED_PERSECUTED is legacy-read-only —
  // the segment was renamed to plain "Baptized").
  function resolveBookingType(): BookingType {
    if (activityGroup === 'bible_study') {
      if (contactBaptismType === 'baptized') {
        return mode === 'zoom' ? BookingType.BAPTIZED_ZOOM : BookingType.BAPTIZED_IN_PERSON;
      }
      return mode === 'zoom' ? BookingType.UNBAPTIZED_ZOOM : BookingType.UNBAPTIZED_CONTACT;
    }
    if (activityGroup === 'group_activity') return BookingType.GROUP_ACTIVITIES;
    return BookingType.TEAM_ACTIVITIES;
  }

  function resolveActivity(): Activity {
    const group = ACTIVITY_GROUPS.find((g) => g.key === activityGroup);
    return group?.defaultActivity || Activity.BIBLE_STUDY;
  }

  function buildTitle(): string {
    const group = ACTIVITY_GROUPS.find((g) => g.key === activityGroup);
    const leader = teacherOptions.find((t) => t.id === leaderId);
    const contact = contactOptions.find((c) => c.id === contactId);
    if (activityGroup === 'bible_study' && leader && contact) {
      // Titles carry the primary subject so runtime bookings match the seeded
      // "— {subject}" shape on every title-rendering surface, and edits rebuild
      // the same shape instead of silently stripping it (finding 219).
      const subject = addSubjectLater ? undefined : subjectsStudied[0];
      return `Bible Study: ${leader.label} with ${contact.label}${subject ? ` — ${subject}` : ''}`;
    }
    if (leader) return `${group?.label}: ${leader.label}`;
    return group?.label || 'New Booking';
  }

  const handleSubmit = async () => {
    // (F1) Defensive twin of the disabled Create/Save button.
    if (!formComplete) {
      toast.error('Complete the required fields first');
      return;
    }
    if (startSlotIdx === null) {
      toast.error('Select a time slot');
      return;
    }
    const startSlot = daySlots[startSlotIdx];
    const endSlot = daySlots[startSlotIdx + durationSlots - 1];
    if (!startSlot || !endSlot) {
      toast.error('Invalid time range');
      return;
    }
    // GATE 2 guard: re-verify the WHOLE range is still free before any write. A
    // blocked service time / occupied slot would 409 server-side at submit and,
    // worse, orphan a just-created contact (the create runs before the booking).
    // Bounce back to the time step so the user picks a bookable slot.
    for (let j = 0; j < durationSlots; j++) {
      const s = daySlots[startSlotIdx + j];
      if (!s || s.occupied) {
        toast.error('That time isn’t available — pick another slot');
        setStep('when');
        return;
      }
    }
    const area = areas.find((a) => a.rooms.some((r) => r.id === roomId));
    setLoading(true);
    let createdContactId: string | null = null;
    try {
      const finalSubjects = addSubjectLater ? [] : subjectsStudied;
      // STUDY-1 / Request 2: a contact "Add new"-ed in the wizard is only a
      // localStorage label (custom id) — persist it as a real contact so the
      // study lands on a real card + timeline. Existing (backend) contacts pass
      // through unchanged. The placeholder removal is DEFERRED to after the
      // booking succeeds, and a failed booking rolls the contact back (catch),
      // so a 409 can never orphan it. (Mike's backend will do this atomically.)
      // (F2) Contact/subject state can be stale after a study→non-study
      // activity switch — non-study payloads must never carry them.
      let resolvedContactId =
        activityGroup === 'bible_study' ? contactId || undefined : undefined;
      if (activityGroup === 'bible_study' && contactId && !isBackendManagedId(contactId)) {
        const customName = customContacts.find((c) => c.id === contactId)?.name.trim() || '';
        const parts = customName.split(/\s+/).filter(Boolean);
        const viewerName = viewer ? `${viewer.firstName} ${viewer.lastName}`.trim() : 'System';
        const created = await contactsApi.createContact({
          firstName: parts[0] || customName || 'New',
          lastName: parts.slice(1).join(' '),
          type:
            contactBaptismType === 'baptized'
              ? BookingType.BAPTIZED_IN_PERSON
              : BookingType.UNBAPTIZED_CONTACT,
          status: ContactStatus.ACTIVE,
          pipelineStage: PipelineStage.FIRST_STUDY,
          assignedTeacherId: leaderId && isBackendManagedId(leaderId) ? leaderId : undefined,
          // REV3 #7: land the new contact in a church — the Confirm-step
          // override if set, else the booked room's church.
          groupName: newContactChurch ?? roomChurchName ?? undefined,
          createdBy: viewer?.id || '',
          totalSessions: 0,
          timeline: [
            {
              date: new Date().toISOString(),
              action: 'created' as const,
              details: 'Contact created via booking',
              userId: viewer?.id || '',
              userName: viewerName,
            },
          ],
        });
        resolvedContactId = created.id;
        createdContactId = created.id;
      }
      await onSubmit({
        type: resolveBookingType(),
        activity: resolveActivity(),
        areaId: area?.id || areas[0]?.id || '',
        roomId,
        title: buildTitle(),
        description: '',
        // (F2) subject gated on study too — finalSubjects can be stale after
        // an activity switch.
        subject: activityGroup === 'bible_study' ? finalSubjects[0] || undefined : undefined,
        startTime: startSlot.start.toISOString(),
        endTime: new Date(startSlot.start.getTime() + durationSlots * 30 * 60000).toISOString(),
        teacherId: leaderId || undefined,
        contactId: resolvedContactId,
        participants: leaderId ? [leaderId] : [],
        // STUDY-1: only study bookings carry the subjects array (consumed by
        // the POST handler to update the contact card + timeline).
        ...(activityGroup === 'bible_study' ? { subjectsStudied: finalSubjects } : {}),
        // M-6: trim so whitespace-only reasons don't pass the UI guard
        // and silently write a blank audit entry.
        ...(isEdit ? { editReason: editReason.trim() } : {}),
      });
      // Booking succeeded — now it's safe to drop the localStorage placeholder.
      if (createdContactId) removeCustom(contactId);
      toast.success(isEdit ? 'Booking updated' : 'Booking created');
      closeBookingModal();
    } catch (e) {
      // Roll back a contact we created this run so a failed booking never
      // orphans it (best-effort; the placeholder is kept so the user can retry
      // the same name). Mike's real backend will do this in one transaction.
      if (createdContactId) {
        try {
          await contactsApi.deleteContact(createdContactId);
        } catch {
          /* best-effort rollback */
        }
      }
      // Surface the specific reason (e.g. "Room is already booked: …" or
      // "Overlaps blocked window: …") instead of a generic failure, so the
      // user can actually act on it. Falls back to generic for network errors.
      toast.error(isApiError(e) ? e.message : 'Failed to save booking');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedBooking || !onDelete) return;
    setLoading(true);
    try {
      await onDelete(selectedBooking.id);
      toast.success('Booking deleted');
      closeBookingModal();
    } catch {
      toast.error('Failed to delete');
    } finally {
      setLoading(false);
    }
  };

  // Step validity. The When page gates on everything it consolidated:
  // activity + a time range, plus mode + baptism for studies.
  const canAdvance = (() => {
    switch (step) {
      case 'when':
        return (
          !!activityGroup &&
          startSlotIdx !== null &&
          (activityGroup !== 'bible_study' || (!!mode && !!contactBaptismType))
        );
      case 'room': return !!roomId;
      case 'leader': return !!leaderId;
      case 'contact': return !!contactId;
      case 'subject': return true;
      case 'confirm': return true;
      default: return false;
    }
  })();

  // Ultracode-gate fix (F1): the Review button can jump to the confirm step
  // from ANY step, so per-step canAdvance gating is bypassable. Create/Save
  // must independently verify the whole form — otherwise an incomplete study
  // (no leader, no mode/baptism, no contact) gets written with a defaulted
  // type the user never chose.
  const formComplete =
    !!activityGroup &&
    !!roomId &&
    !!leaderId &&
    startSlotIdx !== null &&
    (activityGroup !== 'bible_study' || (!!mode && !!contactBaptismType && !!contactId));

  return (
    <Dialog open={isBookingModalOpen} onOpenChange={(open) => !open && closeBookingModal()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          {/* Packet bug (step counter behind the close-X at 275px): the row
              reserves the X's space structurally — pr-9 clears the absolute
              close-X (top-2 right-2, size-9) at ALL widths, the title is the
              only shrinkable piece (min-w-0 truncate), and the badge can
              neither shrink nor wrap under the X (shrink-0 whitespace-nowrap). */}
          <DialogTitle className="flex items-center justify-between gap-2 pr-9">
            <span className="min-w-0 truncate">{isEdit ? t('wizard.editBooking') : t('wizard.newBooking')}</span>
            <Badge variant="outline" className="shrink-0 whitespace-nowrap text-xs">
              {t('wizard.step')} {currentStepIndex + 1} {t('misc.of')} {stepsNeeded.length}
            </Badge>
          </DialogTitle>
          {/* Progress bar */}
          <div className="h-1 w-full rounded-full bg-accent overflow-hidden">
            <motion.div
              className="h-full bg-primary"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </DialogHeader>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="min-h-[320px]"
          >
            {step === 'when' && (
              <div className="space-y-4">
                {/* Compact activity selector — folded onto the When page so
                    "When" is literally the first step (Decision 5 / Phase 4).
                    No auto-advance: picking a group just reveals/hides the
                    study segments below. */}
                <div className="grid grid-cols-2 gap-2">
                  {ACTIVITY_GROUPS.map((g) => {
                    const Icon = g.icon as React.ComponentType<{ className?: string }>;
                    const selected = activityGroup === g.key;
                    return (
                      <button
                        key={g.key}
                        type="button"
                        onClick={() => setActivityGroup(g.key)}
                        className={cn(
                          'flex min-h-11 items-center gap-2 rounded-lg border-2 px-2.5 py-2 text-left text-xs font-semibold transition-all bg-gradient-to-br touch-manipulation',
                          g.color,
                          selected ? 'ring-2 ring-primary' : 'hover:brightness-110',
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 truncate">{g.label}</span>
                      </button>
                    );
                  })}
                </div>

                <WhenStep
                  date={date}
                  onDateChange={(d) => {
                    setDate(d);
                    // A different day has different occupancy — clear the range.
                    setStartSlotIdx(null);
                    setDurationSlots(1);
                  }}
                  showStudyControls={activityGroup === 'bible_study'}
                  mode={mode}
                  onModeChange={setMode}
                  baptism={contactBaptismType}
                  onBaptismChange={setContactBaptismType}
                  slots={whenSlots}
                  startIdx={startSlotIdx}
                  endIdxExclusive={startSlotIdx !== null ? startSlotIdx + durationSlots : null}
                  onRangeChange={(s, e) => {
                    setStartSlotIdx(s);
                    setDurationSlots(s !== null && e !== null ? e - s : 1);
                  }}
                />
              </div>
            )}

            {step === 'room' && (
              <div className="space-y-4">
                <div>
                  <Label className="text-base font-semibold">Choose a room</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Unavailable rooms on {format(date, 'MMM d')} are greyed out
                  </p>
                </div>
                <Combobox
                  options={roomOptions}
                  value={roomId}
                  onChange={setRoomId}
                  placeholder="Search rooms..."
                  alwaysOpen
                  allowAddNew
                  onAddNew={(name) => {
                    const entity = addCustom('room', name);
                    setRoomId(entity.id);
                  }}
                />
              </div>
            )}

            {step === 'leader' && (
              <div className="space-y-4">
                <div>
                  <Label className="text-base font-semibold">Leader / Teacher</Label>
                  <p className="text-sm text-muted-foreground mt-1">Who is leading this?</p>
                </div>
                <Combobox
                  options={teacherOptions}
                  value={leaderId}
                  onChange={setLeaderId}
                  placeholder="Search leaders & teachers..."
                  alwaysOpen
                  allowAddNew
                  onAddNew={(name) => {
                    const entity = addCustom('teacher', name);
                    setLeaderId(entity.id);
                  }}
                />
              </div>
            )}

            {step === 'contact' && (
              <div className="space-y-4">
                <div>
                  <Label className="text-base font-semibold">Contact</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Who is this study with? (Baptized/Unbaptized was set on the When page.)
                  </p>
                </div>
                <Combobox
                  options={contactOptions}
                  value={contactId}
                  onChange={setContactId}
                  placeholder="Search contacts..."
                  alwaysOpen
                  allowAddNew
                  onAddNew={(name) => {
                    const entity = addCustom('contact', name);
                    setContactId(entity.id);
                  }}
                />
              </div>
            )}

            {step === 'subject' && (
              <div className="space-y-4">
                <div>
                  {/* Renamed from "Subject studied" (packet). */}
                  <Label className="text-base font-semibold">Subject</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Pick the subject(s) for this study — they&apos;re added to{' '}
                    {contactOptions.find((c) => c.id === contactId)?.label || 'the contact'}&apos;s
                    card &amp; timeline. Not sure yet? Choose &ldquo;Add subject later&rdquo;.
                  </p>
                </div>
                <label className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm cursor-pointer touch-manipulation max-md:min-h-11">
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0"
                    checked={addSubjectLater}
                    onChange={(e) => {
                      setAddSubjectLater(e.target.checked);
                      if (e.target.checked) setSubjectsStudied([]);
                    }}
                  />
                  <span>Add subject later (not sure what they&apos;ll study yet)</span>
                </label>
                {addSubjectLater ? (
                  <div className="rounded-lg bg-accent/40 p-3 text-sm text-muted-foreground">
                    No subject recorded now — you can add it later from the contact&apos;s card.
                  </div>
                ) : (
                  <StepSubjectPicker value={subjectsStudied} onChange={setSubjectsStudied} />
                )}
              </div>
            )}

            {step === 'confirm' && (
              <div className="space-y-4">
                {selectedBooking?.status === 'cancelled' && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 space-y-1">
                    <div className="flex items-center gap-2 text-sm font-semibold text-red-500">
                      <Ban className="h-4 w-4" />
                      {t('wizard.bookingCancelled')}
                    </div>
                    {selectedBooking.cancelReason && (
                      <p className="text-xs text-muted-foreground">
                        Reason: {selectedBooking.cancelReason}
                      </p>
                    )}
                    {selectedBooking.cancelledAt && (
                      <p className="text-[10px] text-muted-foreground/70">
                        {format(new Date(selectedBooking.cancelledAt), 'EEEE, MMM d, yyyy · h:mm aaa')}
                      </p>
                    )}
                  </div>
                )}
                <div>
                  <Label className="text-base font-semibold">
                    {selectedBooking?.status === 'cancelled' ? t('wizard.cancelledBooking') : t('wizard.confirmBooking')}
                  </Label>
                </div>
                <div className="space-y-1 rounded-lg border border-border bg-accent/30 p-4 text-sm">
                  <Row label={t('wizard.activity')} value={ACTIVITY_GROUPS.find((g) => g.key === activityGroup)?.label || '—'} onClick={() => setStep('when')} />
                  <Row label={t('wizard.date')} value={format(date, 'EEEE, MMM d, yyyy')} onClick={() => setStep('when')} />
                  <Row label={t('wizard.room')} value={roomOptions.find((r) => r.id === roomId)?.label || '—'} onClick={() => setStep('room')} />
                  <Row label={t('wizard.leader')} value={teacherOptions.find((te) => te.id === leaderId)?.label || '—'} onClick={() => setStep('leader')} />
                  {activityGroup === 'bible_study' && (
                    <>
                      <Row label={t('wizard.mode')} value={mode === 'zoom' ? 'Zoom' : t('wizard.inPerson')} onClick={() => setStep('when')} />
                      <Row label={t('wizard.contact')} value={contactOptions.find((c) => c.id === contactId)?.label || '—'} onClick={() => setStep('contact')} />
                      {/* REV3 #7: a brand-new (Add new) contact needs a church.
                          Editable prefill — defaults to the booked room's church. */}
                      {contactId && !isBackendManagedId(contactId) && (
                        <div className="flex items-center justify-between gap-2 py-0.5">
                          <span className="text-muted-foreground">Church (new contact)</span>
                          <select
                            value={newContactChurch ?? roomChurchName ?? ''}
                            onChange={(e) => setNewContactChurch(e.target.value)}
                            aria-label="Church for the new contact"
                            className="h-8 min-h-[44px] touch-manipulation rounded-md border border-border bg-background px-2 text-sm sm:min-h-8"
                          >
                            {roomChurchName === null && <option value="">—</option>}
                            {areas.map((a) => (
                              <option key={a.id} value={a.name}>
                                {a.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      <Row
                        label="Subjects"
                        value={
                          addSubjectLater || subjectsStudied.length === 0
                            ? 'Add later'
                            : subjectsStudied.join(', ')
                        }
                        onClick={() => setStep('subject')}
                      />
                    </>
                  )}
                  {startSlotIdx !== null && whenSlots[startSlotIdx] && (
                    <Row
                      label={t('wizard.time')}
                      value={`${whenSlots[startSlotIdx].label} – ${whenSlots[startSlotIdx + durationSlots]?.label ?? 'end of day'} · ${formatDuration(durationSlots * 30)}`}
                      onClick={() => setStep('when')}
                    />
                  )}
                </div>

                <p className="text-xs text-muted-foreground">
                  {t('wizard.clickToJump')}
                </p>

                {/* Phase 3 (Decision 11): outcome-status controls — visible to
                    teacher | creator | leader-in-scope via canSetBookingStatus
                    (the server re-gates the same helper on PATCH). Hidden for
                    cancelled bookings (cancel/restore is the lifecycle pair)
                    and during creation. Metrics move ONLY on the →completed
                    edge server-side. */}
                {isEdit &&
                  selectedBooking &&
                  selectedBooking.status !== 'cancelled' &&
                  onSetStatus &&
                  viewer &&
                  canSetBookingStatus(viewer, selectedBooking, scope.userIds) && (
                    <div className="space-y-2 rounded-lg border border-border bg-accent/20 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-xs">{t('wizard.bookingStatus')}</Label>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[11px]',
                            BOOKING_STATUS_CONFIG[
                              selectedBooking.status ?? BookingStatus.BIBLE_STUDY
                            ].color,
                          )}
                        >
                          {t(bookingStatusI18nKey(selectedBooking))}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(
                          [
                            BookingStatus.BIBLE_STUDY,
                            BookingStatus.COMPLETED,
                            BookingStatus.NO_SHOW,
                            BookingStatus.RESCHEDULED,
                          ] as const
                        )
                          .filter(
                            (s) =>
                              s !==
                              (selectedBooking.status ?? BookingStatus.BIBLE_STUDY),
                          )
                          .map((target) => (
                            <Button
                              key={target}
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={loading}
                              onClick={async () => {
                                setLoading(true);
                                try {
                                  await onSetStatus(selectedBooking.id, target);
                                  toast.success(t('wizard.statusUpdated'));
                                  closeBookingModal();
                                } catch (e) {
                                  toast.error(
                                    e instanceof Error
                                      ? e.message
                                      : 'Failed to update status',
                                  );
                                } finally {
                                  setLoading(false);
                                }
                              }}
                              className={cn(
                                'gap-1.5 touch-manipulation max-md:h-11',
                                BOOKING_STATUS_CONFIG[target].color,
                              )}
                            >
                              {t(
                                bookingStatusI18nKey({
                                  type: selectedBooking.type,
                                  status: target,
                                }),
                              )}
                            </Button>
                          ))}
                      </div>
                    </div>
                  )}

                {/* F3: capture an optional edit reason when changing an active
                    booking (mirrors the cancel-reason field; written to the
                    booking's editReason + the audit log on Save). */}
                {isEdit && canEditCurrent && selectedBooking?.status !== 'cancelled' && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('wizard.editReason')}</Label>
                    <textarea
                      value={editReason}
                      onChange={(e) => setEditReason(e.target.value)}
                      placeholder={t('wizard.editReasonPlaceholder')}
                      maxLength={500}
                      rows={2}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Footer nav — on phones this becomes a sticky bottom action bar so
            the primary Next/Save stays reachable while the body scrolls. The
            -mx-4/px-4 bleed the bar to the sheet edges; the max(0.75rem,env())
            bottom padding clears the home indicator. Buttons may wrap so all
            three fit at 360px. Desktop (>=md) keeps the original inline row. */}
        <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-border max-md:sticky max-md:bottom-0 max-md:-mx-4 max-md:-mb-4 max-md:bg-popover max-md:px-4 max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-md:pt-3">
          {currentStepIndex > 0 && step !== 'confirm' && (
            <Button type="button" variant="outline" onClick={goBack} className="gap-2 touch-manipulation max-md:h-11">
              <ArrowLeft className="h-4 w-4" />
              {t('btn.back')}
            </Button>
          )}
          {step !== 'confirm' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setStep('confirm')}
              className="gap-1.5 text-xs touch-manipulation max-md:h-11"
            >
              <ClipboardCheck className="h-3.5 w-3.5" />
              {t('btn.review')}
            </Button>
          )}
          {step !== 'confirm' && (
            <Button type="button" onClick={goNext} disabled={!canAdvance} className="ml-auto gap-2 touch-manipulation max-md:h-11">
              {t('btn.next')}
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
          {step === 'confirm' && (
            <>
              <Button type="button" variant="outline" onClick={goBack} className="gap-2 touch-manipulation max-md:h-11">
                <ArrowLeft className="h-4 w-4" />
                {t('btn.back')}
              </Button>
              {/* CAL-6: hide cancel button when viewer can't edit this booking. */}
              {isEdit && canEditCurrent && selectedBooking?.status !== 'cancelled' && onCancel && (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowCancelConfirm(true)}
                  className="gap-1.5 touch-manipulation max-md:h-11"
                >
                  <Ban className="h-3.5 w-3.5" />
                  {t('btn.cancelBooking')}
                </Button>
              )}
              {isEdit && canEditCurrent && selectedBooking?.status === 'cancelled' && onRestore && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    if (!selectedBooking) return;
                    setLoading(true);
                    try {
                      await onRestore(selectedBooking.id);
                      toast.success('Booking restored');
                      closeBookingModal();
                    } catch { toast.error('Failed to restore'); }
                    finally { setLoading(false); }
                  }}
                  className="gap-1.5 touch-manipulation max-md:h-11"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t('btn.restore')}
                </Button>
              )}
              {/* CAL-6: hide save when viewer can't edit this booking. */}
              {canEditCurrent && selectedBooking?.status !== 'cancelled' && (
                <Button
                  type="button"
                  onClick={handleSubmit}
                  // (F1) formComplete: Review can reach confirm early — the
                  // primary action stays disabled until every required field
                  // is set (the rows above show '—' for what's missing).
                  disabled={loading || !formComplete}
                  className="ml-auto gap-2 touch-manipulation max-md:h-11"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {isEdit ? t('btn.saveChanges') : t('btn.createBooking')}
                </Button>
              )}
              {!canEditCurrent && (
                <Badge variant="outline" className="ml-auto text-xs">
                  Read-only — outside your scope
                </Badge>
              )}
            </>
          )}

          {/* Cancel confirmation overlay */}
          {showCancelConfirm && selectedBooking && (
            <div
              className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
              role="dialog"
              aria-modal="true"
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setShowCancelConfirm(false);
                  setCancelReasonInput('');
                }
              }}
            >
              <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl space-y-4">
                <h3 className="text-lg font-semibold text-destructive flex items-center gap-2">
                  <Ban className="h-5 w-5" />
                  {t('wizard.cancelTitle')}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t('wizard.cancelDesc')}
                </p>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t('wizard.cancelReason')}</Label>
                  <textarea
                    value={cancelReasonInput}
                    onChange={(e) => setCancelReasonInput(e.target.value)}
                    placeholder={t('wizard.cancelPlaceholder')}
                    maxLength={500}
                    autoFocus
                    rows={3}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => { setShowCancelConfirm(false); setCancelReasonInput(''); }}
                    className="flex-1 touch-manipulation max-md:h-11"
                  >
                    {t('btn.keepBooking')}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={!cancelReasonInput.trim() || loading}
                    onClick={async () => {
                      setLoading(true);
                      try {
                        await onCancel!(selectedBooking.id, cancelReasonInput.trim());
                        toast.success('Booking cancelled');
                        setShowCancelConfirm(false);
                        setCancelReasonInput('');
                        closeBookingModal();
                      } catch { toast.error('Failed to cancel'); }
                      finally { setLoading(false); }
                    }}
                    className="flex-1 gap-1.5 touch-manipulation max-md:h-11"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                    {t('btn.cancelBooking')}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex w-full justify-between gap-2 rounded-md px-2 py-1.5 -mx-2 transition-colors hover:bg-accent/60 cursor-pointer group"
      >
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium text-right group-hover:text-primary transition-colors">
          {value}
          <ChevronRight className="inline h-3.5 w-3.5 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
        </span>
      </button>
    );
  }
  return (
    <div className="flex justify-between gap-2 px-2 py-1.5 -mx-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

function activityToGroup(activity?: Activity): ActivityGroup {
  switch (activity) {
    case Activity.BIBLE_STUDY:
      return 'bible_study';
    case Activity.GROUP_ACTIVITY:
    case Activity.SPECIAL_VIDEO:
      return 'group_activity';
    case Activity.COMMITTEE_MEETING:
    case Activity.COMMITTEE_MISSION:
      return 'event_committee';
    case Activity.TEAM_MEETING:
    case Activity.GROUP_MEETING:
    case Activity.FUNCTION_MEETING:
      return 'leader_meeting';
    default:
      return 'bible_study';
  }
}
