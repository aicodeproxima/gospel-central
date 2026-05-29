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
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Combobox, type ComboOption } from '@/components/shared/Combobox';
import { useBookingStore } from '@/lib/stores/booking-store';
import { useCustomEntitiesStore } from '@/lib/stores/custom-entities-store';
import { useAuthStore } from '@/lib/stores/auth-store';
import { Activity, BookingType } from '@/lib/types';
import type { Area, BlockedSlot, Booking, BookingFormData, Contact, User } from '@/lib/types';
import { getDaySlots } from '@/lib/utils/availability';
import {
  buildVisibilityScope,
  canEditBooking,
  canViewContact,
} from '@/lib/utils/permissions';
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  BookOpen,
  Check,
  ChevronRight,
  ClipboardCheck,
  Loader2,
  Monitor,
  RotateCcw,
  Trash2,
  UserCheck,
  Users,
  UsersRound,
  Briefcase,
  Calendar as CalendarIcon,
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

type Step =
  | 'activity'
  | 'date'
  | 'room'
  | 'leader'
  | 'mode'
  | 'contact'
  | 'time'
  | 'confirm';

export function BookingWizard({ areas, bookings, users, contacts, blockedSlots = [], onSubmit, onDelete, onCancel, onRestore }: WizardProps) {
  const { t } = useTranslation();
  const { isBookingModalOpen, closeBookingModal, selectedBooking, bookingSlot } = useBookingStore();
  const isEdit = !!selectedBooking;
  const { entities, add: addCustom } = useCustomEntitiesStore();
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

  const [step, setStep] = useState<Step>('activity');
  const [activityGroup, setActivityGroup] = useState<ActivityGroup | null>(null);
  const [date, setDate] = useState<Date>(new Date());
  const [roomId, setRoomId] = useState<string>('');
  const [leaderId, setLeaderId] = useState<string>('');
  const [mode, setMode] = useState<'in_person' | 'zoom' | null>(null);
  const [contactId, setContactId] = useState<string>('');
  const [contactBaptismType, setContactBaptismType] = useState<'unbaptized' | 'baptized_persecuted' | null>(null);
  const [startSlotIdx, setStartSlotIdx] = useState<number | null>(null);
  const [durationSlots, setDurationSlots] = useState(2); // 60 min default
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
        setContactBaptismType(
          selectedBooking.type === BookingType.BAPTIZED_PERSECUTED ? 'baptized_persecuted' : 'unbaptized',
        );
        setStep('confirm');
      } else {
        // New mode
        if (bookingSlot) {
          setDate(new Date(bookingSlot.start));
          setRoomId(bookingSlot.roomId);
        } else {
          setDate(new Date());
          setRoomId('');
        }
        setActivityGroup(null);
        setLeaderId('');
        setMode(null);
        setContactId('');
        setContactBaptismType(null);
        setStartSlotIdx(null);
        setDurationSlots(2);
        setStep('activity');
      }
      setEditReason('');
    }
  }, [isBookingModalOpen, selectedBooking, bookingSlot]);

  // Build room options with availability
  const roomOptions: ComboOption[] = useMemo(() => {
    const base: ComboOption[] = allRooms.map((r) => {
      const slots = getDaySlots(date, r.id, bookings, {
        blockedSlots,
        areaId: r.areaId,
      });
      const free = slots.filter((s) => !s.occupied).length;
      return {
        id: r.id,
        label: r.name,
        sublabel: free > 0 ? `${free} free 30-min slots` : 'Fully booked',
        disabled: free === 0,
        disabledReason: free === 0 ? 'No availability this day' : undefined,
      };
    });
    const custom: ComboOption[] = customRooms.map((c) => ({
      id: c.id,
      label: c.name,
      sublabel: 'Custom room',
    }));
    return [...base, ...custom];
  }, [allRooms, customRooms, date, bookings]);

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
      sublabel: t.role.replace('_', ' '),
    }));
    const custom: ComboOption[] = customTeachers.map((c) => ({
      id: c.id,
      label: c.name,
      sublabel: 'Custom teacher',
    }));
    return [...custom, ...base];
  }, [users, customTeachers]);

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
      sublabel: c.currentlyStudying ? `Step ${c.currentStep}` : c.pipelineStage,
    }));
    const custom: ComboOption[] = customContacts.map((c) => ({
      id: c.id,
      label: c.name,
      sublabel: 'Custom contact',
    }));
    return [...custom, ...base];
  }, [contacts, customContacts, viewer, scope.userIds]);

  // Time slots for selected room + date — now blocked-slot- and
  // teacher-conflict aware. (BLOCK-1, CAL-2.)
  const daySlots = useMemo(() => {
    if (!roomId) return [];
    const room = allRooms.find((r) => r.id === roomId);
    return getDaySlots(date, roomId, bookings, {
      blockedSlots,
      areaId: room?.areaId,
      teacherId: leaderId || undefined,
      teacherBookings: bookings,
    });
  }, [roomId, date, bookings, blockedSlots, allRooms, leaderId]);

  // Total steps for progress bar
  const stepsNeeded: Step[] = useMemo(() => {
    const base: Step[] = ['activity', 'date', 'room', 'leader'];
    if (activityGroup === 'bible_study') {
      base.push('mode', 'contact');
    }
    base.push('time', 'confirm');
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

  // Resolve final type from selections
  function resolveBookingType(): BookingType {
    if (activityGroup === 'bible_study') {
      if (contactBaptismType === 'baptized_persecuted') {
        return mode === 'zoom' ? BookingType.BAPTIZED_ZOOM : BookingType.BAPTIZED_PERSECUTED;
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
      return `Bible Study: ${leader.label} with ${contact.label}`;
    }
    if (leader) return `${group?.label}: ${leader.label}`;
    return group?.label || 'New Booking';
  }

  const handleSubmit = async () => {
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
    const area = areas.find((a) => a.rooms.some((r) => r.id === roomId));
    setLoading(true);
    try {
      await onSubmit({
        type: resolveBookingType(),
        activity: resolveActivity(),
        areaId: area?.id || areas[0]?.id || '',
        roomId,
        title: buildTitle(),
        description: '',
        startTime: startSlot.start.toISOString(),
        endTime: new Date(startSlot.start.getTime() + durationSlots * 30 * 60000).toISOString(),
        teacherId: leaderId || undefined,
        contactId: contactId || undefined,
        participants: leaderId ? [leaderId] : [],
        // M-6: trim so whitespace-only reasons don't pass the UI guard
        // and silently write a blank audit entry.
        ...(isEdit ? { editReason: editReason.trim() } : {}),
      });
      toast.success(isEdit ? 'Booking updated' : 'Booking created');
      closeBookingModal();
    } catch {
      toast.error('Failed to save booking');
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

  // Step validity
  const canAdvance = (() => {
    switch (step) {
      case 'activity': return !!activityGroup;
      case 'date': return !!date;
      case 'room': return !!roomId;
      case 'leader': return !!leaderId;
      case 'mode': return !!mode;
      case 'contact': return !!contactId && !!contactBaptismType;
      case 'time': return startSlotIdx !== null;
      case 'confirm': return true;
      default: return false;
    }
  })();

  return (
    <Dialog open={isBookingModalOpen} onOpenChange={(open) => !open && closeBookingModal()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{isEdit ? t('wizard.editBooking') : t('wizard.newBooking')}</span>
            <Badge variant="outline" className="text-xs">
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
            {step === 'activity' && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">What kind of activity are you booking?</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {ACTIVITY_GROUPS.map((g) => {
                    const Icon = g.icon as React.ComponentType<{ className?: string }>;
                    const selected = activityGroup === g.key;
                    return (
                      <motion.button
                        key={g.key}
                        type="button"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => { setActivityGroup(g.key); setTimeout(goNext, 150); }}
                        className={cn(
                          'flex flex-col items-start gap-3 rounded-xl border-2 p-5 text-left transition-all bg-gradient-to-br',
                          g.color,
                          selected ? 'ring-2 ring-primary' : 'hover:brightness-110',
                        )}
                      >
                        <div className="rounded-lg bg-card p-2.5 shadow-sm">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="font-semibold">{g.label}</div>
                          <div className="text-xs text-muted-foreground mt-1">{g.description}</div>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 'date' && (
              <div className="space-y-4">
                <div>
                  <Label className="text-base font-semibold">When?</Label>
                  <p className="text-sm text-muted-foreground mt-1">Pick a day for this booking</p>
                </div>
                <Input
                  type="date"
                  value={format(date, 'yyyy-MM-dd')}
                  onChange={(e) => setDate(new Date(e.target.value + 'T00:00'))}
                  className="h-12 text-base"
                />
                <div className="rounded-lg bg-accent/40 p-3 text-sm">
                  <CalendarIcon className="inline h-4 w-4 mr-2" />
                  {format(date, 'EEEE, MMMM d, yyyy')}
                </div>
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
                  allowAddNew
                  onAddNew={(name) => {
                    const entity = addCustom('teacher', name);
                    setLeaderId(entity.id);
                  }}
                />
              </div>
            )}

            {step === 'mode' && (
              <div className="space-y-4">
                <div>
                  <Label className="text-base font-semibold">In-person or Zoom?</Label>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {([
                    { key: 'in_person', label: 'In Person', icon: UserCheck },
                    { key: 'zoom', label: 'On Zoom', icon: Monitor },
                  ] as const).map((m) => {
                    const Icon = m.icon;
                    const selected = mode === m.key;
                    return (
                      <motion.button
                        key={m.key}
                        type="button"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => { setMode(m.key); setTimeout(goNext, 150); }}
                        className={cn(
                          'flex flex-col items-center gap-3 rounded-xl border-2 p-6 transition-all',
                          selected
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-primary/40 hover:bg-accent/50',
                        )}
                      >
                        <Icon className="h-8 w-8" />
                        <span className="font-semibold">{m.label}</span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 'contact' && (
              <div className="space-y-4">
                <div>
                  <Label className="text-base font-semibold">Contact</Label>
                  <p className="text-sm text-muted-foreground mt-1">First pick their status, then select the contact</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { key: 'unbaptized', label: 'Unbaptized', color: 'bg-blue-500/10 border-blue-500/40' },
                    { key: 'baptized_persecuted', label: 'Baptized Persecuted', color: 'bg-red-500/10 border-red-500/40' },
                  ] as const).map((t) => {
                    const selected = contactBaptismType === t.key;
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setContactBaptismType(t.key)}
                        className={cn(
                          'rounded-lg border-2 p-3 text-sm font-medium transition-all',
                          selected ? 'ring-2 ring-primary' : 'hover:brightness-110',
                          t.color,
                        )}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
                {contactBaptismType && (
                  <Combobox
                    options={contactOptions}
                    value={contactId}
                    onChange={setContactId}
                    placeholder="Search contacts..."
                    allowAddNew
                    onAddNew={(name) => {
                      const entity = addCustom('contact', name);
                      setContactId(entity.id);
                    }}
                  />
                )}
              </div>
            )}

            {step === 'time' && (
              <div className="space-y-4">
                <div>
                  <Label className="text-base font-semibold">Pick a time slot</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Occupied slots on {format(date, 'EEE MMM d')} are greyed out
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Duration</Label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4].map((d) => (
                      <Button
                        key={d}
                        type="button"
                        variant={durationSlots === d ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setDurationSlots(d)}
                      >
                        {d * 30} min
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-1.5 max-h-64 overflow-y-auto p-1 sm:grid-cols-4">
                  {daySlots.map((slot, i) => {
                    const canFit = !slot.occupied && (() => {
                      for (let j = 0; j < durationSlots; j++) {
                        const s = daySlots[i + j];
                        if (!s || s.occupied) return false;
                      }
                      return true;
                    })();
                    const selected = startSlotIdx === i;
                    const withinSelection = startSlotIdx !== null && i > startSlotIdx && i < startSlotIdx + durationSlots;
                    return (
                      <button
                        key={slot.label}
                        type="button"
                        disabled={!canFit}
                        onClick={() => setStartSlotIdx(i)}
                        title={slot.occupied ? `Occupied by: ${slot.occupiedBy}` : undefined}
                        className={cn(
                          'rounded-md border px-2 py-2 text-xs font-medium transition-all',
                          !canFit && 'opacity-30 cursor-not-allowed bg-muted',
                          canFit && !selected && !withinSelection && 'border-border hover:bg-accent',
                          selected && 'bg-primary text-primary-foreground border-primary',
                          withinSelection && 'bg-primary/40 border-primary/40',
                        )}
                      >
                        {slot.label}
                      </button>
                    );
                  })}
                </div>
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
                  <Row label={t('wizard.activity')} value={ACTIVITY_GROUPS.find((g) => g.key === activityGroup)?.label || '—'} onClick={() => setStep('activity')} />
                  <Row label={t('wizard.date')} value={format(date, 'EEEE, MMM d, yyyy')} onClick={() => setStep('date')} />
                  <Row label={t('wizard.room')} value={roomOptions.find((r) => r.id === roomId)?.label || '—'} onClick={() => setStep('room')} />
                  <Row label={t('wizard.leader')} value={teacherOptions.find((te) => te.id === leaderId)?.label || '—'} onClick={() => setStep('leader')} />
                  {activityGroup === 'bible_study' && (
                    <>
                      <Row label={t('wizard.mode')} value={mode === 'zoom' ? 'Zoom' : t('wizard.inPerson')} onClick={() => setStep('mode')} />
                      <Row label={t('wizard.contact')} value={contactOptions.find((c) => c.id === contactId)?.label || '—'} onClick={() => setStep('contact')} />
                    </>
                  )}
                  {startSlotIdx !== null && daySlots[startSlotIdx] && (
                    <Row
                      label={t('wizard.time')}
                      value={`${daySlots[startSlotIdx].label} — ${durationSlots * 30} min`}
                      onClick={() => setStep('time')}
                    />
                  )}
                </div>

                <p className="text-xs text-muted-foreground">
                  {t('wizard.clickToJump')}
                </p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Footer nav */}
        <div className="flex items-center gap-2 pt-4 border-t border-border">
          {currentStepIndex > 0 && step !== 'confirm' && (
            <Button type="button" variant="outline" onClick={goBack} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              {t('btn.back')}
            </Button>
          )}
          {step !== 'confirm' && step !== 'activity' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setStep('confirm')}
              className="gap-1.5 text-xs"
            >
              <ClipboardCheck className="h-3.5 w-3.5" />
              {t('btn.review')}
            </Button>
          )}
          {step !== 'confirm' && step !== 'activity' && step !== 'mode' && (
            <Button type="button" onClick={goNext} disabled={!canAdvance} className="ml-auto gap-2">
              {t('btn.next')}
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
          {step === 'confirm' && (
            <>
              <Button type="button" variant="outline" onClick={goBack} className="gap-2">
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
                  className="gap-1.5"
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
                  className="gap-1.5"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t('btn.restore')}
                </Button>
              )}
              {/* CAL-6: hide save when viewer can't edit this booking. */}
              {canEditCurrent && selectedBooking?.status !== 'cancelled' && (
                <Button type="button" onClick={handleSubmit} disabled={loading} className="ml-auto gap-2">
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
                    className="flex-1"
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
                    className="flex-1 gap-1.5"
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
