'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Ban,
  Globe,
  MapPin,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuthStore } from '@/lib/stores/auth-store';
import { bookingsApi } from '@/lib/api/bookings';
import type { Area, BlockedSlot } from '@/lib/types';
import { canManageBlockedSlot } from '@/lib/utils/permissions';
import toast from 'react-hot-toast';
import { ConfirmDialog } from '@/components/admin/dialogs/ConfirmDialog';

/**
 * BlockedSlotsTab — service times + admin-defined blackout windows.
 *
 * Branch Leader+ can create / edit / delete blocked slots that NO role
 * can override (matrix universal rule: "no one overrides a blocked slot").
 * The four default global slots (Tuesday + Saturday service times) are
 * seeded; this tab lets admins add one-off blackouts (Christmas Day,
 * room maintenance) or area-specific recurring windows.
 *
 * Phase 4 — Phase 7 gives this tab its filter/search bells.
 */

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function BlockedSlotsTab() {
  const viewer = useAuthStore((s) => s.user);
  const [slots, setSlots] = useState<BlockedSlot[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<BlockedSlot | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BlockedSlot | null>(null);

  const reload = () => {
    setLoading(true);
    setLoadError(null);
    Promise.all([
      bookingsApi.getBlockedSlots(),
      bookingsApi.getAreasFull(),
    ])
      .then(([s, a]) => {
        setSlots(Array.isArray(s) ? s : []);
        setAreas(Array.isArray(a) ? a : []);
      })
      .catch((e) => {
        setSlots([]);
        setLoadError(e instanceof Error ? e.message : 'Failed to load blocked slots');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, []);

  if (!viewer) return null;
  const canManage = canManageBlockedSlot(viewer);

  const sortedSlots = useMemo(() => {
    const score = (s: BlockedSlot) =>
      (s.scope === 'global' ? 0 : 1) * 100 +
      (s.recurrence === 'weekly' ? 0 : 1) * 50 +
      (s.dayOfWeek ?? 0);
    return [...slots].sort((a, b) => score(a) - score(b));
  }, [slots]);

  const handleDelete = async (slot: BlockedSlot) => {
    try {
      await bookingsApi.deleteBlockedSlot(slot.id, viewer.id);
      toast.success(`Removed: ${slot.reason}`);
      setDeleteTarget(null);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  return (
    <div className="space-y-4">
      {/* H-03: min-w-0 flex-1 on the title column lets the long description
          shrink + wrap, and shrink-0 on the actions column keeps the
          Add/Refresh buttons visible on 430px-wide phones (where they were
          previously pushed off the right edge entirely). */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">Blocked time slots</h2>
          <p className="text-xs text-muted-foreground">
            Service times + admin-defined blackout windows. Bookings overlapping these
            windows are rejected with 409 — no role can override. Branch Leader+ may add,
            edit, or remove slots.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={reload}
            title="Refresh"
            aria-label="Refresh blocked slots"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          {canManage && (
            <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Add Blocked Slot</span>
              <span className="sm:hidden">Add</span>
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading blocked slots…
          </CardContent>
        </Card>
      ) : loadError ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="text-sm font-medium text-destructive">Failed to load blocked slots</p>
            <p className="text-xs text-muted-foreground">{loadError}</p>
            <Button variant="outline" size="sm" onClick={reload} className="mt-2 gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : sortedSlots.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Ban className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">No blocked slots</p>
            <p className="max-w-md text-xs text-muted-foreground">
              {canManage
                ? 'Use Add Blocked Slot above to reserve time windows that no role can book over.'
                : 'There are no current blackout windows. Branch Leader+ may add one.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sortedSlots.map((slot) => (
            <SlotRow
              key={slot.id}
              slot={slot}
              areas={areas}
              canEdit={canManage}
              onEdit={() => setEditTarget(slot)}
              onDelete={() => setDeleteTarget(slot)}
            />
          ))}
        </div>
      )}

      {createOpen && (
        <SlotFormDialog
          open
          areas={areas}
          actorId={viewer.id}
          onClose={() => setCreateOpen(false)}
          onSaved={() => { setCreateOpen(false); reload(); }}
        />
      )}
      {editTarget && (
        <SlotFormDialog
          open
          slot={editTarget}
          areas={areas}
          actorId={viewer.id}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); reload(); }}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          open
          title="Remove blocked slot?"
          description={`"${deleteTarget.reason}" will no longer block bookings. Historical bookings unaffected.`}
          confirmLabel="Remove"
          confirmVariant="destructive"
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => handleDelete(deleteTarget)}
        />
      )}
    </div>
  );
}

function SlotRow({
  slot,
  areas,
  canEdit,
  onEdit,
  onDelete,
}: {
  slot: BlockedSlot;
  areas: Area[];
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const inactive = slot.isActive === false;
  const area = slot.areaId ? areas.find((a) => a.id === slot.areaId) : null;
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border border-border bg-card p-3 ${
        inactive ? 'opacity-60' : ''
      }`}
    >
      <Ban className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{slot.reason}</span>
          {slot.scope === 'global' ? (
            <Badge variant="outline" className="gap-1 text-[10px]">
              <Globe className="h-3 w-3" />
              Global
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 text-[10px]">
              <MapPin className="h-3 w-3" />
              {area?.name ?? slot.areaId}
            </Badge>
          )}
          {inactive && (
            <Badge variant="outline" className="text-[10px] border-orange-600/40 text-orange-600">
              Inactive
            </Badge>
          )}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {slot.recurrence === 'weekly' ? (
            <>
              Every {DAY_LABELS[slot.dayOfWeek ?? 0]} · {slot.startTime}–{slot.endTime}
            </>
          ) : (
            <>
              {slot.startDateTime?.slice(0, 16).replace('T', ' ')} –{' '}
              {slot.endDateTime?.slice(0, 16).replace('T', ' ')}
            </>
          )}
        </div>
      </div>
      {canEdit && (
        // H-03: wrap edit/delete in a shrink-0 group so they stay visible
        // alongside long slot reasons on narrow viewports.
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="icon" onClick={onEdit} aria-label="Edit slot" className="h-7 w-7">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            aria-label="Delete slot"
            className="h-7 w-7 text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

function SlotFormDialog({
  open,
  slot,
  areas,
  actorId,
  onClose,
  onSaved,
}: {
  open: boolean;
  slot?: BlockedSlot;
  areas: Area[];
  actorId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!slot;
  const [reason, setReason] = useState(slot?.reason ?? '');
  const [scope, setScope] = useState<'global' | 'area'>(slot?.scope ?? 'global');
  const [areaId, setAreaId] = useState<string>(slot?.areaId ?? areas[0]?.id ?? '');
  const [recurrence, setRecurrence] = useState<'weekly' | 'one-off'>(slot?.recurrence ?? 'weekly');
  const [dayOfWeek, setDayOfWeek] = useState<number>(slot?.dayOfWeek ?? 6);
  const [startTime, setStartTime] = useState(slot?.startTime ?? '09:00');
  const [endTime, setEndTime] = useState(slot?.endTime ?? '10:00');
  const [startDate, setStartDate] = useState(slot?.startDateTime?.slice(0, 16) ?? '');
  const [endDate, setEndDate] = useState(slot?.endDateTime?.slice(0, 16) ?? '');
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    if (!reason.trim()) {
      toast.error('Reason is required');
      return;
    }
    if (scope === 'area' && !areaId) {
      toast.error('Pick an area');
      return;
    }
    // M-06: enforce start < end client-side. The handler doesn't validate
    // either, so a reversed weekly window would silently never match a
    // booking (the `bsMin < seMin && beMin > ssMin` overlap predicate
    // returns false when bsMin > beMin) — i.e. a no-op block.
    if (recurrence === 'weekly' && startTime >= endTime) {
      toast.error('End time must be after start time');
      return;
    }
    if (recurrence === 'one-off') {
      if (!startDate || !endDate) {
        toast.error('Start and end date/time are required');
        return;
      }
      if (new Date(startDate).getTime() >= new Date(endDate).getTime()) {
        toast.error('End must be after start');
        return;
      }
    }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        reason: reason.trim(),
        scope,
        areaId: scope === 'area' ? areaId : undefined,
        recurrence,
        actorId,
      };
      if (recurrence === 'weekly') {
        payload.dayOfWeek = dayOfWeek;
        payload.startTime = startTime;
        payload.endTime = endTime;
      } else {
        payload.startDateTime = startDate;
        payload.endDateTime = endDate;
      }
      if (isEdit && slot) {
        await bookingsApi.updateBlockedSlot(slot.id, payload as never);
      } else {
        await bookingsApi.createBlockedSlot(payload as never);
      }
      toast.success(isEdit ? 'Blocked slot updated' : 'Blocked slot created');
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit blocked slot' : 'New blocked slot'}</DialogTitle>
          <DialogDescription>
            Reserved windows that prevent bookings. No role can override.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="bs-reason">Reason</Label>
            <Input
              id="bs-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
              placeholder="e.g. Christmas Day, Sabbath morning service"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Scope</Label>
              <Select value={scope} onValueChange={(v) => v && setScope(v as 'global' | 'area')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global (all areas)</SelectItem>
                  <SelectItem value="area">Single area</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Recurrence</Label>
              <Select value={recurrence} onValueChange={(v) => v && setRecurrence(v as 'weekly' | 'one-off')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="one-off">One-off</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {scope === 'area' && (
            <div>
              <Label>Area</Label>
              <Select value={areaId} onValueChange={(v) => v && setAreaId(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick an area" />
                </SelectTrigger>
                <SelectContent>
                  {areas.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {recurrence === 'weekly' ? (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Day</Label>
                <Select value={String(dayOfWeek)} onValueChange={(v) => setDayOfWeek(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAY_LABELS.map((d, i) => (
                      <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="bs-start">Start</Label>
                <Input
                  id="bs-start"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="bs-end">End</Label>
                <Input
                  id="bs-end"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="bs-start-dt">Start</Label>
                <Input
                  id="bs-start-dt"
                  type="datetime-local"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="bs-end-dt">End</Label>
                <Input
                  id="bs-end-dt"
                  type="datetime-local"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={busy}>
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {isEdit ? 'Save changes' : 'Create slot'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
