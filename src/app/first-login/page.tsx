'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/lib/stores/auth-store';
import { usersApi } from '@/lib/api/users';
import toast from 'react-hot-toast';

/**
 * Phase 6 — forced first-login password change.
 *
 * The dashboard layout redirects here whenever the authenticated user
 * carries `mustChangePassword: true` (set on account creation and after
 * an admin reset). The page blocks every other route until they pick a
 * password they own.
 *
 * Lives at /first-login OUTSIDE the (dashboard) route group so the
 * dashboard's mustChangePassword redirect doesn't loop on itself.
 */
export default function FirstLoginPage() {
  const router = useRouter();
  const { user, hydrated, hydrate, setUser } = useAuthStore();
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { hydrate(); }, [hydrate]);

  // Redirect away if already past the gate.
  useEffect(() => {
    if (!hydrated) return;
    if (!user) router.replace('/login');
    else if (user.mustChangePassword !== true) router.replace('/dashboard');
  }, [hydrated, user, router]);

  if (!hydrated || !user) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pw1.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (pw1 !== pw2) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const updated = await usersApi.changeOwnPassword(user.id, pw1);
      setUser(updated);
      toast.success('Password updated. Welcome to Diamond.');
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Change failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <CardTitle className="mt-3 text-xl">Set your password</CardTitle>
            <p className="text-sm text-muted-foreground">
              Welcome, <span className="font-medium text-foreground">{user.firstName}</span>.
              Pick a password you&apos;ll use going forward — your account was
              issued with a temporary one.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="pw1">New password</Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="pw1"
                    type="password"
                    value={pw1}
                    onChange={(e) => setPw1(e.target.value)}
                    autoFocus
                    className="pl-9"
                    placeholder="At least 8 characters"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pw2">Confirm password</Label>
                <Input
                  id="pw2"
                  type="password"
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                  placeholder="Type it again"
                />
              </div>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
              <Button type="submit" disabled={busy} className="w-full gap-2">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                Save password
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Until you finish here, the rest of the app is locked.
              </p>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
