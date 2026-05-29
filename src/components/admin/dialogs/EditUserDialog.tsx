'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import {
  ROLE_LABELS,
  UserRole,
  type User,
} from '@/lib/types';
import {
  assignableRoles,
  buildVisibilityScope,
  canChangeRole,
  isAdminTier,
} from '@/lib/utils/permissions';
import { usersApi } from '@/lib/api/users';
import toast from 'react-hot-toast';

interface Props {
  open: boolean;
  user: User;
  viewer: User;
  allUsers: User[];
  onClose: () => void;
  onSaved: () => void;
}

/**
 * EditUserDialog — edit core fields of an existing user account.
 *
 * Fields editable here:
 *   - First / last name, email, phone
 *   - Role (gated per matrix — only roles strictly below the viewer's level
 *     plus the user's current role appear, and the dropdown is disabled
 *     entirely when the viewer cannot canEditUser/canChangeRole the target)
 *   - Reports-to (parent) — picker filtered to "anyone at-or-above the
 *     target's new role"
 *
 * NOT editable here (separate flows):
 *   - Username (RenameUsernameDialog)
 *   - Tags (ManageTagsDialog)
 *   - Active status (Confirm via UsersTab)
 *   - Password (ResetPasswordDialog)
 */
export function EditUserDialog({
  open,
  user,
  viewer,
  allUsers,
  onClose,
  onSaved,
}: Props) {
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone ?? '');
  const [role, setRole] = useState<UserRole>(user.role);
  const [parentId, setParentId] = useState<string>(user.parentId ?? '');
  const [busy, setBusy] = useState(false);

  // Roles the viewer can grant. Always include the user's CURRENT role so
  // that "I'm just editing the name" doesn't accidentally lose role context.
  const allowedRoles = (() => {
    const base = assignableRoles(viewer.role);
    if (!base.includes(user.role)) return [...base, user.role];
    return base;
  })();

  // Eligible parents = anyone whose role >= the new target role, with
  // sub-Admin viewers further restricted to their own subtree (M-05).
  // Branch L+ get cross-branch via universal rule #1 — empty subtree from
  // buildVisibilityScope's 'all' kind correctly returns everyone for them.
  const ix = (r: UserRole) => Object.values(UserRole).indexOf(r);
  const subtreeUserIds = buildVisibilityScope(viewer, allUsers).userIds;
  const viewerIsAdmin = isAdminTier(viewer);
  const eligibleParents = allUsers.filter((u) => {
    if (u.id === user.id) return false;
    if (ix(u.role) < ix(role)) return false;
    if (u.role === UserRole.MEMBER) return false;
    if (viewerIsAdmin) return true;
    return subtreeUserIds.includes(u.id);
  });

  const roleChanged = role !== user.role;
  const canChangeRoleNow = !roleChanged || canChangeRole(viewer, user, role);

  const handleSave = async () => {
    if (!canChangeRoleNow) {
      toast.error(`You cannot promote this user to ${ROLE_LABELS[role]}`);
      return;
    }
    setBusy(true);
    try {
      await usersApi.update(user.id, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        role,
        parentId: parentId || undefined,
        actorId: viewer.id,
      });
      toast.success(`Updated ${firstName}`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="firstName">First name</Label>
              <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="lastName">Last name</Label>
              <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>

          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <div>
            <Label htmlFor="phone">Phone (optional)</Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>

          <div>
            <Label htmlFor="role">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
              <SelectTrigger id="role">
                <SelectValue>{ROLE_LABELS[role]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {allowedRoles.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {roleChanged && !canChangeRoleNow && (
              <p className="mt-1 text-xs text-destructive">
                Your role can&apos;t grant {ROLE_LABELS[role]}.
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="parent">Reports to</Label>
            <select
              id="parent"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">— no parent —</option>
              {eligibleParents.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.firstName} {u.lastName} — {ROLE_LABELS[u.role]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={busy || !canChangeRoleNow}>
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
