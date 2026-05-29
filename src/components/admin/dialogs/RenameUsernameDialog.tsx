'use client';

import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, AtSign, AlertTriangle } from 'lucide-react';
import { usersApi } from '@/lib/api/users';
import type { User } from '@/lib/types';
import toast from 'react-hot-toast';

interface Props {
  open: boolean;
  user: User;
  actorId: string;
  allUsers: User[];
  onClose: () => void;
}

const USERNAME_RE = /^[a-z0-9_.-]{3,32}$/;

/**
 * RenameUsernameDialog — change a username with the industry-standard
 * "type the new value twice + see live conflict check" pattern. The
 * audit log records the rename so the previous identifier can be traced.
 */
export function RenameUsernameDialog({ open, user, actorId, allUsers, onClose }: Props) {
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [busy, setBusy] = useState(false);

  const cleaned = first.trim().toLowerCase();
  const cleanedSecond = second.trim().toLowerCase();

  const validation = useMemo(() => {
    if (!cleaned) return { ok: false, level: 'neutral' as const, hint: '' };
    if (!USERNAME_RE.test(cleaned)) {
      return { ok: false, level: 'warn' as const, hint: 'Use 3-32 chars: a-z, 0-9, dot, dash, underscore.' };
    }
    if (cleaned === user.username) {
      return { ok: false, level: 'warn' as const, hint: 'New username matches the current one.' };
    }
    const conflict = allUsers.some(
      (u) => u.id !== user.id && u.username.toLowerCase() === cleaned,
    );
    if (conflict) {
      return { ok: false, level: 'warn' as const, hint: 'That username is already taken by another user.' };
    }
    if (cleanedSecond && cleanedSecond !== cleaned) {
      return { ok: false, level: 'warn' as const, hint: 'The two entries must match exactly.' };
    }
    // UI-6: pre-completion is a NEUTRAL state — visually distinct from a
    // mismatch warning so the user understands "you just need to keep
    // typing" vs "fix this conflict."
    if (!cleanedSecond) {
      return { ok: false, level: 'neutral' as const, hint: 'Type the new username again to confirm.' };
    }
    return { ok: true, level: 'good' as const, hint: 'Looks good.' };
  }, [cleaned, cleanedSecond, user, allUsers]);

  const handleSave = async () => {
    if (!validation.ok) return;
    setBusy(true);
    try {
      await usersApi.renameUsername(user.id, cleaned, actorId);
      toast.success(`Renamed @${user.username} → @${cleaned}`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Rename failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AtSign className="h-5 w-5 text-primary" /> Rename username
          </DialogTitle>
          <DialogDescription>
            Renaming{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">@{user.username}</code> for{' '}
            <span className="font-medium">
              {user.firstName} {user.lastName}
            </span>
            . Their saved login will need the new username; their session token stays valid until expiry.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="new-username">New username</Label>
            <Input
              id="new-username"
              value={first}
              onChange={(e) => setFirst(e.target.value)}
              autoFocus
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div>
            <Label htmlFor="confirm-username">Type it again to confirm</Label>
            <Input
              id="confirm-username"
              value={second}
              onChange={(e) => setSecond(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          {first && (
            <p
              className={`flex items-start gap-1.5 text-xs ${
                validation.level === 'good'
                  ? 'text-green-600 dark:text-green-400'
                  : validation.level === 'warn'
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-muted-foreground'
              }`}
            >
              {validation.level === 'warn' && <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
              {validation.hint}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={busy || !validation.ok}>
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Rename
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
