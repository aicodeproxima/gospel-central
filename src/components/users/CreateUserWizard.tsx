'use client';

import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Loader2,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  ROLE_LABELS,
  UserRole,
  type User,
} from '@/lib/types/user';
import { assignableRoles } from '@/lib/utils/permissions';
import { usersApi } from '@/lib/api/users';

interface Props {
  open: boolean;
  onClose: () => void;
  creator: User;
  /** Existing users — used for parent picker + uniqueness hints. */
  users: User[];
  /** Called after a successful create; lets the parent refresh data. */
  onCreated?: (newUser: User) => void;
  /** Pre-fill the role on the placement step (e.g. GroupsTab opens the
   *  wizard with role already locked to "Team Leader" when adding a team). */
  initialRole?: UserRole;
  /** Pre-fill the reports-to picker — used when invoking from a node in
   *  the GroupsTab so we drop straight into "creating a child of THIS node". */
  initialParentId?: string;
}

type Step = 'identity' | 'placement' | 'review' | 'success';

const STEP_ORDER: Step[] = ['identity', 'placement', 'review'];

function suggestUsername(first: string, last: string, existing: User[]): string {
  const base = `${first.trim().toLowerCase()}${last ? '_' + last.trim().toLowerCase().slice(0, 8) : ''}`
    .replace(/[^a-z0-9_]/g, '');
  if (!base) return '';
  const taken = new Set(existing.map((u) => u.username.toLowerCase()));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i++) {
    if (!taken.has(`${base}${i}`)) return `${base}${i}`;
  }
  return base + Date.now();
}

function generatePassword(): string {
  const adj = ['Bright', 'Quiet', 'Eager', 'Kind', 'Steady', 'Bold', 'Humble'];
  const noun = ['River', 'Mountain', 'Lantern', 'Harbor', 'Garden', 'Compass', 'Anchor'];
  const n = Math.floor(Math.random() * 90) + 10;
  return `${adj[Math.floor(Math.random() * adj.length)]}${noun[Math.floor(Math.random() * noun.length)]}${n}`;
}

export function CreateUserWizard({
  open,
  onClose,
  creator,
  users,
  onCreated,
  initialRole,
  initialParentId,
}: Props) {
  const [step, setStep] = useState<Step>('identity');
  const [submitting, setSubmitting] = useState(false);

  // Identity
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [usernameTouched, setUsernameTouched] = useState(false);

  // Placement
  const allowedRoles = useMemo(() => assignableRoles(creator.role), [creator.role]);
  // Honor an `initialRole` hint when the caller wants to pre-fill (e.g. the
  // GroupsTab "Add Group" button locks role to GROUP_LEADER). Fall back to
  // the highest-rank role this creator can grant.
  const defaultRole =
    initialRole && allowedRoles.includes(initialRole)
      ? initialRole
      : allowedRoles[allowedRoles.length - 1];
  const [role, setRole] = useState<UserRole>(defaultRole);
  const [parentId, setParentId] = useState<string>(initialParentId ?? creator.id);

  // Result
  const [createdUser, setCreatedUser] = useState<User | null>(null);
  const [createdPassword, setCreatedPassword] = useState('');

  // Auto-suggest username when name changes (until user manually edits)
  useEffect(() => {
    if (usernameTouched) return;
    setUsername(suggestUsername(firstName, lastName, users));
  }, [firstName, lastName, users, usernameTouched]);

  // Reset everything when dialog opens
  useEffect(() => {
    if (!open) return;
    setStep('identity');
    setFirstName('');
    setLastName('');
    setEmail('');
    setPhone('');
    setUsername('');
    setUsernameTouched(false);
    setRole(defaultRole);
    setParentId(initialParentId ?? creator.id);
    setCreatedUser(null);
    setCreatedPassword('');
  }, [open, creator.id, allowedRoles, defaultRole, initialParentId]);

  // Eligible parents: anyone within creator's "reach" (creator + same-role peers
  // are NOT valid parents — only people at or above the new role's level who
  // sit inside creator's subtree). For the prototype we keep it simple: allow
  // any existing user whose role is >= the new role and != Member.
  // (Teacher is no longer a role in v1 — it's a tag.)
  const eligibleParents = useMemo(() => {
    return users.filter((u) => {
      const ix = (r: UserRole) => Object.values(UserRole).indexOf(r);
      // ADMIN-3: skip soft-deleted users so a deactivated leader doesn't
      // appear in the parent picker.
      if (u.isActive === false) return false;
      return ix(u.role) >= ix(role) && u.role !== UserRole.MEMBER;
    });
  }, [users, role]);

  const usernameTaken = useMemo(
    () => username.length > 0 && users.some((u) => u.username.toLowerCase() === username.trim().toLowerCase()),
    [username, users]
  );

  function canAdvance(): boolean {
    if (step === 'identity') {
      return !!firstName.trim() && !!lastName.trim() && !!email.trim() && username.trim().length >= 2 && !usernameTaken;
    }
    if (step === 'placement') {
      return !!role && !!parentId;
    }
    return true;
  }

  function next() {
    if (step === 'identity') return setStep('placement');
    if (step === 'placement') return setStep('review');
  }
  function back() {
    if (step === 'placement') return setStep('identity');
    if (step === 'review') return setStep('placement');
  }

  async function submit() {
    setSubmitting(true);
    try {
      const password = generatePassword();
      const newUser = await usersApi.create({
        username: username.trim().toLowerCase(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || undefined,
        role,
        parentId,
        createdById: creator.id,
      });
      setCreatedUser(newUser);
      setCreatedPassword(password);
      setStep('success');
      onCreated?.(newUser);
      toast.success(`Created ${newUser.firstName} ${newUser.lastName}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create account';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  function copyCredentials() {
    if (!createdUser) return;
    const text = `Username: ${createdUser.username}\nPassword: ${createdPassword}`;
    navigator.clipboard.writeText(text).then(() => toast.success('Credentials copied'));
  }

  const stepIdx = STEP_ORDER.indexOf(step as (typeof STEP_ORDER)[number]);
  const totalSteps = STEP_ORDER.length;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              Add User
            </DialogTitle>
            {step !== 'success' && (
              <Badge variant="outline" className="text-xs">
                Step {stepIdx + 1} of {totalSteps}
              </Badge>
            )}
          </div>
          {step !== 'success' && (
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
              <motion.div
                className="h-full bg-primary"
                initial={false}
                animate={{ width: `${((stepIdx + 1) / totalSteps) * 100}%` }}
                transition={{ type: 'spring', stiffness: 200, damping: 25 }}
              />
            </div>
          )}
        </DialogHeader>

        <AnimatePresence mode="wait">
          {step === 'identity' && (
            <motion.div
              key="identity"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="firstName">First name</Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="John"
                    autoFocus
                  />
                </div>
                <div>
                  <Label htmlFor="lastName">Last name</Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Smith"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jsmith@example.com"
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone (optional)</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 555-0123"
                />
              </div>
              <div>
                <Label htmlFor="username">
                  Username <span className="text-xs font-normal text-muted-foreground">(auto-suggested)</span>
                </Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setUsernameTouched(true);
                  }}
                  placeholder="jsmith"
                />
                {usernameTaken && (
                  <p className="mt-1 text-xs text-destructive">Username already taken</p>
                )}
              </div>
            </motion.div>
          )}

          {step === 'placement' && (
            <motion.div
              key="placement"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              className="space-y-4"
            >
              <div>
                <Label>Role</Label>
                <p className="mb-2 text-xs text-muted-foreground">
                  You can only assign roles below your own ({ROLE_LABELS[creator.role]}).
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {[...allowedRoles].reverse().map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      className={`rounded-lg border p-3 text-left text-sm transition-all ${
                        role === r
                          ? 'border-primary bg-primary/10 ring-2 ring-primary/40'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <div className="font-medium">{ROLE_LABELS[r]}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label htmlFor="parent">Reports to</Label>
                <p className="mb-2 text-xs text-muted-foreground">
                  Defaults to you. Pick anyone at or above {ROLE_LABELS[role]}.
                </p>
                <select
                  id="parent"
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {eligibleParents.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.firstName} {u.lastName} — {ROLE_LABELS[u.role]}
                      {u.id === creator.id ? ' (you)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </motion.div>
          )}

          {step === 'review' && (
            <motion.div
              key="review"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              className="space-y-4"
            >
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <h4 className="mb-3 text-sm font-semibold">Review</h4>
                <dl className="space-y-2 text-sm">
                  <Row label="Name" value={`${firstName} ${lastName}`} />
                  <Row label="Username" value={username} />
                  <Row label="Email" value={email} />
                  {phone && <Row label="Phone" value={phone} />}
                  <Row label="Role" value={ROLE_LABELS[role]} />
                  <Row
                    label="Reports to"
                    value={
                      eligibleParents.find((u) => u.id === parentId)
                        ? `${eligibleParents.find((u) => u.id === parentId)!.firstName} ${eligibleParents.find((u) => u.id === parentId)!.lastName}`
                        : parentId
                    }
                  />
                </dl>
              </div>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
                <ShieldCheck className="mb-1 inline h-4 w-4" /> A temporary password will be generated.
                You&apos;ll see it once after creating — copy it before closing this dialog.
              </div>
            </motion.div>
          )}

          {step === 'success' && createdUser && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-4 text-center"
            >
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-500/15">
                <Check className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Account created</h3>
                <p className="text-sm text-muted-foreground">
                  Share these credentials with {createdUser.firstName}.
                </p>
              </div>
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-left">
                <CredRow label="Username" value={createdUser.username} />
                <CredRow label="Password" value={createdPassword} />
              </div>
              <Button onClick={copyCredentials} variant="outline" className="w-full">
                <Copy className="mr-2 h-4 w-4" /> Copy both
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-4 flex items-center justify-between gap-2">
          {step !== 'success' && step !== 'identity' && (
            <Button variant="ghost" size="sm" onClick={back} disabled={submitting}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Button>
          )}
          {step === 'success' && <span />}
          {step === 'identity' && <span />}
          <div className="ml-auto flex gap-2">
            {step === 'success' ? (
              <Button onClick={onClose}>Done</Button>
            ) : step === 'review' ? (
              <Button onClick={submit} disabled={submitting}>
                {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
                Create account
              </Button>
            ) : (
              <Button onClick={next} disabled={!canAdvance()}>
                Next <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function CredRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-2 last:mb-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono text-sm">{value}</div>
    </div>
  );
}
