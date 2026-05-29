'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Copy, KeyRound, Check } from 'lucide-react';
import { usersApi, type ResetPasswordResponse } from '@/lib/api/users';
import type { User } from '@/lib/types';
import toast from 'react-hot-toast';

interface Props {
  open: boolean;
  user: User;
  actorId: string;
  onClose: () => void;
}

/**
 * ResetPasswordDialog — two-stage flow:
 *   Stage 1 (confirm): explains the side-effect, asks for confirmation.
 *   Stage 2 (reveal):  shows the temp password ONCE with a copy button.
 *                      The user must read+copy it before closing — there's
 *                      no way to retrieve it after this dialog closes.
 */
export function ResetPasswordDialog({ open, user, actorId, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ResetPasswordResponse | null>(null);
  const [copied, setCopied] = useState(false);

  // SEC-3: clear all state when the dialog is closed so the temp password
  // doesn't sit in component state across opens, and try to overwrite the
  // clipboard contents on close (best-effort — some browsers no-op when
  // the document loses focus, but we still null the React state).
  useEffect(() => {
    if (!open) {
      setResult(null);
      setCopied(false);
      setBusy(false);
      try {
        // Overwrite the clipboard so a forgotten copy doesn't linger.
        navigator.clipboard?.writeText?.(' ').catch(() => {});
      } catch {
        /* clipboard write may be blocked; ignore */
      }
    }
  }, [open]);

  const handleReset = async () => {
    setBusy(true);
    try {
      const r = await usersApi.resetPassword(user.id, actorId);
      setResult(r);
      toast.success('Temporary password generated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Reset failed');
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.tempPassword).then(() => {
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" /> Reset password
          </DialogTitle>
          {!result && (
            <DialogDescription>
              Generate a one-time temporary password for{' '}
              <span className="font-medium">
                {user.firstName} {user.lastName}
              </span>{' '}
              (@{user.username}). They will be required to set a new password the next time they log in.
            </DialogDescription>
          )}
        </DialogHeader>

        {!result ? (
          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={handleReset} disabled={busy}>
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Generate temp password
            </Button>
          </DialogFooter>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
              <strong>Save this now.</strong> The temporary password cannot be retrieved after you close this dialog. Hand it to{' '}
              {user.firstName} via a secure channel.
            </div>
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Username</div>
              <div className="font-mono text-sm">{user.username}</div>
              <div className="mt-3 text-[10px] uppercase tracking-wider text-muted-foreground">Temp password</div>
              <div className="font-mono text-sm">{result.tempPassword}</div>
            </div>
            <Button onClick={handleCopy} variant="outline" className="w-full">
              {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              {copied ? 'Copied' : 'Copy password'}
            </Button>
            <Button onClick={onClose} className="w-full">
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
