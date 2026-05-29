'use client';

import { useEffect, useState } from 'react';
import {
  Plus,
  Pencil,
  Power,
  RefreshCw,
  DoorOpen,
  Building2,
  Eye,
  EyeOff,
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
import { useAuthStore } from '@/lib/stores/auth-store';
import { bookingsApi } from '@/lib/api/bookings';
import type { Area, Room } from '@/lib/types';
import {
  canCreateArea,
  canCreateRoom,
  canManageArea,
  canManageRoom,
} from '@/lib/utils/permissions';
import toast from 'react-hot-toast';
import { ConfirmDialog } from '@/components/admin/dialogs/ConfirmDialog';
import { Loader2 } from 'lucide-react';

/**
 * RoomsTab — per-area room management.
 *
 * Layout: a card per area, listing its rooms. Branch Leader+ can:
 *   - create new rooms inside any area (cross-branch caretaking)
 *   - edit room name, capacity, features
 *   - deactivate/restore rooms (soft delete)
 *   - rename / deactivate / restore the area itself
 * Overseer+ can additionally create new areas (= new branch locations).
 *
 * Toggle "Show inactive" pulls includeInactive=1 from the API so
 * deactivated areas/rooms become visible for restoration.
 */
export function RoomsTab() {
  const viewer = useAuthStore((s) => s.user);
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);

  // Dialog state
  const [createAreaOpen, setCreateAreaOpen] = useState(false);
  const [editAreaTarget, setEditAreaTarget] = useState<Area | null>(null);
  const [confirmAreaTarget, setConfirmAreaTarget] = useState<
    | { kind: 'deactivate' | 'restore'; area: Area }
    | null
  >(null);
  const [createRoomTarget, setCreateRoomTarget] = useState<Area | null>(null);
  const [editRoomTarget, setEditRoomTarget] = useState<{ area: Area; room: Room } | null>(null);
  const [confirmRoomTarget, setConfirmRoomTarget] = useState<
    | { kind: 'deactivate' | 'restore'; room: Room }
    | null
  >(null);

  const reload = () => {
    setLoading(true);
    bookingsApi
      .getAreasFull({ includeInactive: showInactive })
      .then((data) => setAreas(Array.isArray(data) ? data : []))
      .catch(() => setAreas([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
    // Re-fetch when the show-inactive toggle changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive]);

  if (!viewer) return null;

  const handleAreaToggleActive = async (area: Area, kind: 'deactivate' | 'restore') => {
    try {
      if (kind === 'deactivate') await bookingsApi.deactivateArea(area.id);
      else await bookingsApi.restoreArea(area.id);
      toast.success(`${kind === 'deactivate' ? 'Deactivated' : 'Restored'} ${area.name}`);
      setConfirmAreaTarget(null);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    }
  };

  const handleRoomToggleActive = async (room: Room, kind: 'deactivate' | 'restore') => {
    try {
      if (kind === 'deactivate') await bookingsApi.deactivateRoom(room.id);
      else await bookingsApi.restoreRoom(room.id);
      toast.success(`${kind === 'deactivate' ? 'Deactivated' : 'Restored'} ${room.name}`);
      setConfirmRoomTarget(null);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Rooms & Areas</h2>
          <p className="text-xs text-muted-foreground">
            Each area is a physical church location. Branch Leaders+ may add rooms in any area.
            Deactivating a room hides it from the booking picker; historical bookings are preserved.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowInactive((s) => !s)}
            className="gap-1.5"
          >
            {showInactive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {showInactive ? 'Hide inactive' : 'Show inactive'}
          </Button>
          <Button variant="outline" size="icon" onClick={reload} title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          {canCreateArea(viewer) && (
            <Button size="sm" className="gap-1.5" onClick={() => setCreateAreaOpen(true)}>
              <Plus className="h-4 w-4" />
              Add Area
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading areas…
          </CardContent>
        </Card>
      ) : areas.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Building2 className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">No areas yet</p>
            <p className="max-w-md text-xs text-muted-foreground">
              {canCreateArea(viewer)
                ? 'Use Add Area above to create the first physical church location.'
                : 'No areas are visible. Ask an Overseer or Dev to create one.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {areas.map((area) => (
            <AreaCard
              key={area.id}
              area={area}
              canManageThis={canManageArea(viewer)}
              canCreateRoomsHere={canCreateRoom(viewer)}
              canManageRooms={canManageRoom(viewer)}
              onEditArea={() => setEditAreaTarget(area)}
              onToggleArea={(kind) => setConfirmAreaTarget({ kind, area })}
              onAddRoom={() => setCreateRoomTarget(area)}
              onEditRoom={(room) => setEditRoomTarget({ area, room })}
              onToggleRoom={(room, kind) => setConfirmRoomTarget({ kind, room })}
            />
          ))}
        </div>
      )}

      {/* Create / edit area */}
      {createAreaOpen && (
        <AreaFormDialog
          open
          onClose={() => setCreateAreaOpen(false)}
          onSaved={() => {
            setCreateAreaOpen(false);
            reload();
          }}
        />
      )}
      {editAreaTarget && (
        <AreaFormDialog
          open
          area={editAreaTarget}
          onClose={() => setEditAreaTarget(null)}
          onSaved={() => {
            setEditAreaTarget(null);
            reload();
          }}
        />
      )}
      {confirmAreaTarget && (
        <ConfirmDialog
          open
          title={confirmAreaTarget.kind === 'deactivate' ? 'Deactivate area?' : 'Restore area?'}
          description={
            confirmAreaTarget.kind === 'deactivate'
              ? `${confirmAreaTarget.area.name} and all its rooms will be hidden from the booking picker. Existing bookings are preserved.`
              : `${confirmAreaTarget.area.name} will be visible again to all users.`
          }
          confirmLabel={confirmAreaTarget.kind === 'deactivate' ? 'Deactivate' : 'Restore'}
          confirmVariant={confirmAreaTarget.kind === 'deactivate' ? 'destructive' : 'default'}
          onClose={() => setConfirmAreaTarget(null)}
          onConfirm={() => handleAreaToggleActive(confirmAreaTarget.area, confirmAreaTarget.kind)}
        />
      )}

      {/* Create / edit room */}
      {createRoomTarget && (
        <RoomFormDialog
          open
          area={createRoomTarget}
          onClose={() => setCreateRoomTarget(null)}
          onSaved={() => {
            setCreateRoomTarget(null);
            reload();
          }}
        />
      )}
      {editRoomTarget && (
        <RoomFormDialog
          open
          area={editRoomTarget.area}
          room={editRoomTarget.room}
          onClose={() => setEditRoomTarget(null)}
          onSaved={() => {
            setEditRoomTarget(null);
            reload();
          }}
        />
      )}
      {confirmRoomTarget && (
        <ConfirmDialog
          open
          title={confirmRoomTarget.kind === 'deactivate' ? 'Deactivate room?' : 'Restore room?'}
          description={
            confirmRoomTarget.kind === 'deactivate'
              ? `${confirmRoomTarget.room.name} will be hidden from the booking picker. Existing bookings are preserved.`
              : `${confirmRoomTarget.room.name} will be available for booking again.`
          }
          confirmLabel={confirmRoomTarget.kind === 'deactivate' ? 'Deactivate' : 'Restore'}
          confirmVariant={confirmRoomTarget.kind === 'deactivate' ? 'destructive' : 'default'}
          onClose={() => setConfirmRoomTarget(null)}
          onConfirm={() => handleRoomToggleActive(confirmRoomTarget.room, confirmRoomTarget.kind)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Area card with its rooms
// ---------------------------------------------------------------------------
function AreaCard({
  area,
  canManageThis,
  canCreateRoomsHere,
  canManageRooms,
  onEditArea,
  onToggleArea,
  onAddRoom,
  onEditRoom,
  onToggleRoom,
}: {
  area: Area;
  canManageThis: boolean;
  canCreateRoomsHere: boolean;
  canManageRooms: boolean;
  onEditArea: () => void;
  onToggleArea: (kind: 'deactivate' | 'restore') => void;
  onAddRoom: () => void;
  onEditRoom: (room: Room) => void;
  onToggleRoom: (room: Room, kind: 'deactivate' | 'restore') => void;
}) {
  const inactive = area.isActive === false;
  return (
    <Card className={inactive ? 'opacity-60' : undefined}>
      <CardContent className="space-y-3 p-4">
        {/* Area header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <h3 className="text-base font-semibold">{area.name}</h3>
              {inactive && (
                <Badge variant="outline" className="text-[10px] border-orange-600/40 text-orange-600">
                  Inactive
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px]">
                {area.rooms.length} room{area.rooms.length === 1 ? '' : 's'}
              </Badge>
            </div>
            {area.description && (
              <p className="mt-1 text-xs text-muted-foreground">{area.description}</p>
            )}
          </div>
          <div className="flex items-center gap-1">
            {canManageThis && (
              <Button variant="ghost" size="icon" onClick={onEditArea} aria-label="Edit area">
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {canManageThis && !inactive && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onToggleArea('deactivate')}
                aria-label="Deactivate area"
                className="text-destructive"
              >
                <Power className="h-4 w-4" />
              </Button>
            )}
            {canManageThis && inactive && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onToggleArea('restore')}
                aria-label="Restore area"
              >
                <Power className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Rooms list */}
        <div className="space-y-1">
          {area.rooms.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
              No rooms yet.{' '}
              {canCreateRoomsHere && (
                <>Use <span className="font-medium">Add Room</span> below.</>
              )}
            </p>
          ) : (
            area.rooms.map((room) => (
              <RoomRow
                key={room.id}
                room={room}
                canEdit={canManageRooms}
                onEdit={() => onEditRoom(room)}
                onToggle={(kind) => onToggleRoom(room, kind)}
              />
            ))
          )}
        </div>

        {/* Footer — Add Room */}
        {canCreateRoomsHere && !inactive && (
          <div className="pt-1">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={onAddRoom}>
              <Plus className="h-4 w-4" />
              Add Room
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RoomRow({
  room,
  canEdit,
  onEdit,
  onToggle,
}: {
  room: Room;
  canEdit: boolean;
  onEdit: () => void;
  onToggle: (kind: 'deactivate' | 'restore') => void;
}) {
  const inactive = room.isActive === false;
  return (
    <div
      className={`flex items-center gap-2 rounded-md border border-border bg-muted/20 p-2.5 ${
        inactive ? 'opacity-60' : ''
      }`}
    >
      <DoorOpen className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{room.name}</span>
          {room.capacity > 0 && (
            <span className="text-xs text-muted-foreground">cap {room.capacity}</span>
          )}
          {inactive && (
            <Badge variant="outline" className="text-[10px] border-orange-600/40 text-orange-600">
              Inactive
            </Badge>
          )}
          {(room.features ?? []).map((f) => (
            <Badge key={f} variant="secondary" className="text-[10px]">
              {f}
            </Badge>
          ))}
        </div>
      </div>
      {canEdit && (
        <>
          <Button variant="ghost" size="icon" onClick={onEdit} aria-label="Edit room" className="h-7 w-7">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          {!inactive && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onToggle('deactivate')}
              aria-label="Deactivate room"
              className="h-7 w-7 text-destructive"
            >
              <Power className="h-3.5 w-3.5" />
            </Button>
          )}
          {inactive && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onToggle('restore')}
              aria-label="Restore room"
              className="h-7 w-7"
            >
              <Power className="h-3.5 w-3.5" />
            </Button>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Area form dialog (create + edit)
// ---------------------------------------------------------------------------
function AreaFormDialog({
  open,
  area,
  onClose,
  onSaved,
}: {
  open: boolean;
  area?: Area;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(area?.name ?? '');
  const [description, setDescription] = useState(area?.description ?? '');
  const [busy, setBusy] = useState(false);
  const isEdit = !!area;

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Area name is required');
      return;
    }
    setBusy(true);
    try {
      if (isEdit && area) {
        await bookingsApi.updateArea(area.id, { name: name.trim(), description });
      } else {
        await bookingsApi.createArea({ name: name.trim(), description });
      }
      toast.success(isEdit ? 'Area updated' : 'Area created');
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
          <DialogTitle>{isEdit ? 'Edit area' : 'New area'}</DialogTitle>
          <DialogDescription>
            An area = a physical church location (e.g. &ldquo;Newport News Zion&rdquo;). Rooms attach to areas.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="area-name">Name</Label>
            <Input
              id="area-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder="e.g. Hampton Roads Zion"
            />
          </div>
          <div>
            <Label htmlFor="area-desc">Description (optional)</Label>
            <Input
              id="area-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Branch's primary meeting facility"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={busy}>
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {isEdit ? 'Save changes' : 'Create area'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Room form dialog (create + edit)
// ---------------------------------------------------------------------------
function RoomFormDialog({
  open,
  area,
  room,
  onClose,
  onSaved,
}: {
  open: boolean;
  area: Area;
  room?: Room;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(room?.name ?? '');
  const [capacity, setCapacity] = useState<number>(room?.capacity ?? 6);
  const [featuresStr, setFeaturesStr] = useState((room?.features ?? []).join(', '));
  const [busy, setBusy] = useState(false);
  const isEdit = !!room;

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Room name is required');
      return;
    }
    setBusy(true);
    try {
      const features = featuresStr
        .split(',')
        .map((f) => f.trim())
        .filter(Boolean);
      if (isEdit && room) {
        await bookingsApi.updateRoom(room.id, { name: name.trim(), capacity, features });
      } else {
        await bookingsApi.createRoom(area.id, { name: name.trim(), capacity, features });
      }
      toast.success(isEdit ? 'Room updated' : 'Room created');
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
          <DialogTitle>{isEdit ? 'Edit room' : `New room in ${area.name}`}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="room-name">Name</Label>
            <Input
              id="room-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder="e.g. Bible Study Room 1"
            />
          </div>
          <div>
            <Label htmlFor="room-capacity">Capacity</Label>
            <Input
              id="room-capacity"
              type="number"
              min={0}
              value={capacity}
              onChange={(e) => setCapacity(Number(e.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="room-features">Features (comma-separated)</Label>
            <Input
              id="room-features"
              value={featuresStr}
              onChange={(e) => setFeaturesStr(e.target.value)}
              placeholder="e.g. Whiteboard, Zoom Setup, Projector"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={busy}>
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {isEdit ? 'Save changes' : 'Create room'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
