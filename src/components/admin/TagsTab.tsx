'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Tag as TagIcon,
  RefreshCw,
  Plus,
  Loader2,
  Lock,
  Users as UsersIcon,
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
import { usersApi } from '@/lib/api/users';
import {
  KNOWN_TAGS,
  TAG_LABELS,
  TAG_ID_HINT,
  TAG_ID_REGEX,
  type User,
} from '@/lib/types';
import { canManageTagDefinitions } from '@/lib/utils/permissions';
import toast from 'react-hot-toast';

/**
 * TagsTab — manage tag definitions used across users.
 *
 * Today the tag-definition catalog is implicit: tags exist if at least
 * one user carries the id, plus the seeded KNOWN_TAGS (teacher,
 * co_group_leader, co_team_leader). This tab shows the catalog with
 * usage counts and lets Overseer+ promote a new tag id by creating a
 * "seed user" assignment (Phase 7b — full CRUD for the tag-definition
 * store lands when Mike's backend has a `tag_definitions` table).
 *
 * Branch Leaders see this tab as VIEW-ONLY per the matrix; Overseer+
 * have the New Tag affordance.
 */

interface TagDefinition {
  id: string;
  label: string;
  isSeeded: boolean;     // ships in KNOWN_TAGS
  userCount: number;
}

export function TagsTab() {
  const viewer = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const reload = () => {
    setLoading(true);
    setLoadError(null);
    usersApi
      .getAll()
      .then((d) => setUsers(Array.isArray(d) ? d : []))
      .catch((e) => {
        setUsers([]);
        setLoadError(e instanceof Error ? e.message : 'Failed to load users');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, []);

  const definitions = useMemo<TagDefinition[]>(() => {
    const counts = new Map<string, number>();
    users.forEach((u) => (u.tags ?? []).forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
    const seededIds = Object.values(KNOWN_TAGS) as string[];
    const allIds = new Set<string>([...seededIds, ...counts.keys()]);
    return Array.from(allIds)
      .sort((a, b) => a.localeCompare(b))
      .map((id) => ({
        id,
        label: TAG_LABELS[id] ?? id,
        isSeeded: seededIds.includes(id),
        userCount: counts.get(id) ?? 0,
      }));
  }, [users]);

  if (!viewer) return null;
  const canEdit = canManageTagDefinitions(viewer);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <TagIcon className="h-5 w-5 text-primary" />
            Tags
          </h2>
          <p className="text-xs text-muted-foreground">
            Capability flags applied to users. Seeded tags (Teacher, Co-Group Leader,
            Co-Team Leader) are referenced from code; custom tags are created by adding
            them to a user via the Users tab&apos;s &ldquo;Manage tags&rdquo; action.
            {!canEdit && ' Branch Leaders see this catalog as view-only.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={reload}
            title="Refresh"
            aria-label="Refresh tag definitions"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          {canEdit && (
            <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Define Tag
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading tag catalog…
          </CardContent>
        </Card>
      ) : loadError ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="text-sm font-medium text-destructive">Failed to load tag catalog</p>
            <p className="text-xs text-muted-foreground">{loadError}</p>
            <Button variant="outline" size="sm" onClick={reload} className="mt-2 gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {definitions.map((def) => (
            <Card key={def.id}>
              <CardContent className="flex items-center gap-3 p-3">
                <TagIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{def.label}</span>
                    <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">
                      {def.id}
                    </code>
                    {def.isSeeded ? (
                      <Badge variant="outline" className="gap-1 text-[10px]">
                        <Lock className="h-3 w-3" />
                        Seeded
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">Custom</Badge>
                    )}
                  </div>
                  {def.id === KNOWN_TAGS.TEACHER && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Required to be assigned as the leader of a Bible Study booking.
                    </p>
                  )}
                </div>
                <Badge variant="secondary" className="gap-1 text-[10px]">
                  <UsersIcon className="h-3 w-3" />
                  {def.userCount} user{def.userCount === 1 ? '' : 's'}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {createOpen && canEdit && (
        <CreateTagDialog
          existingIds={new Set(definitions.map((d) => d.id))}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </div>
  );
}

function CreateTagDialog({
  existingIds,
  onClose,
}: {
  existingIds: Set<string>;
  onClose: () => void;
}) {
  const [tagId, setTagId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleCreate = () => {
    const id = tagId.trim().toLowerCase().replace(/\s+/g, '_');
    // M-04: shared regex with ManageTagsDialog so both surfaces accept the
    // same set of ids (was 3-40 here vs 2-32 there before unification).
    if (!TAG_ID_REGEX.test(id)) {
      setError(TAG_ID_HINT);
      return;
    }
    if (existingIds.has(id)) {
      setError('Tag already exists');
      return;
    }
    // Tag definitions don't have their own backend table yet — apply this
    // tag to a user via the Users tab to instantiate it.
    toast.success(
      `Tag '${id}' is ready. Assign it to a user via Users → Manage tags to start using it.`,
      { duration: 6000 },
    );
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Define a new tag</DialogTitle>
          <DialogDescription>
            Tags are simple string ids carried on the User record. Once defined,
            they show up everywhere a user carries them. The id must be lowercase
            with underscores (e.g. <code>youth_outreach</code>,{' '}
            <code>welcome_team</code>).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="tag-id">Tag id</Label>
          <Input
            id="tag-id"
            value={tagId}
            onChange={(e) => { setTagId(e.target.value); setError(null); }}
            placeholder="e.g. youth_outreach"
            autoFocus
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate}>Define Tag</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
