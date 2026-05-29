'use client';

import { useState, KeyboardEvent } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Loader2, Tag as TagIcon, Plus, X } from 'lucide-react';
import {
  TAG_LABELS,
  TAG_ID_HINT,
  TAG_ID_REGEX,
  type User,
} from '@/lib/types';
import { usersApi } from '@/lib/api/users';
import toast from 'react-hot-toast';

interface Props {
  open: boolean;
  user: User;
  actorId: string;
  /** Tag ids the system already knows about (KNOWN_TAGS + any custom). */
  allTagOptions: string[];
  onClose: () => void;
}

/**
 * ManageTagsDialog — toggle tags on a single user, plus add brand-new
 * custom tag ids. New tags propagate to the rest of the admin via the
 * normal user-list refetch (the "all known tags" set is recomputed from
 * the user list each time it loads).
 */
export function ManageTagsDialog({ open, user, actorId, allTagOptions, onClose }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(user.tags ?? []));
  const [newTag, setNewTag] = useState('');
  const [busy, setBusy] = useState(false);

  const toggle = (tag: string) => {
    const next = new Set(selected);
    if (next.has(tag)) next.delete(tag);
    else next.add(tag);
    setSelected(next);
  };

  const addCustom = () => {
    const cleaned = newTag.trim().toLowerCase().replace(/\s+/g, '_');
    if (!cleaned) return;
    // M-04: same regex as TagsTab's "Define Tag" so a tag id accepted in
    // one surface is accepted in the other.
    if (!TAG_ID_REGEX.test(cleaned)) {
      toast.error(TAG_ID_HINT);
      return;
    }
    setSelected((s) => new Set(s).add(cleaned));
    setNewTag('');
  };

  const handleNewTagKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCustom();
    }
  };

  const handleSave = async () => {
    setBusy(true);
    try {
      await usersApi.manageTags(user.id, Array.from(selected), actorId);
      toast.success('Tags updated');
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  // Show known tags first (sorted alphabetically), then any tags currently
  // on the user that aren't in the known set, then a "+ add custom" footer.
  const allKnown = new Set(allTagOptions);
  selected.forEach((t) => allKnown.add(t));
  const tagOptions = Array.from(allKnown).sort();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TagIcon className="h-5 w-5 text-primary" /> Manage tags
          </DialogTitle>
          <DialogDescription>
            Toggle tags on{' '}
            <span className="font-medium">
              {user.firstName} {user.lastName}
            </span>{' '}
            (@{user.username}). Tags carry capability — for example, the <code>teacher</code> tag
            makes a user eligible to lead a Bible Study booking.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {tagOptions.map((tag) => {
              const on = selected.has(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggle(tag)}
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    on
                      ? 'border-primary/50 bg-primary/15 text-primary'
                      : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground'
                  }`}
                  aria-pressed={on}
                >
                  {on ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                  {TAG_LABELS[tag] ?? tag}
                </button>
              );
            })}
            {tagOptions.length === 0 && (
              <span className="text-xs text-muted-foreground">No tags yet — add one below.</span>
            )}
          </div>

          {/* Add a custom tag id */}
          <div className="rounded-lg border border-dashed border-border p-3">
            <p className="mb-2 text-xs text-muted-foreground">
              Add a new tag id (lowercase, underscore-separated):
            </p>
            <div className="flex gap-2">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={handleNewTagKey}
                placeholder="e.g. worship_team"
                className="flex-1"
              />
              <Button onClick={addCustom} variant="outline" size="sm">
                Add
              </Button>
            </div>
          </div>

          {/* Currently selected summary */}
          <div className="rounded-lg bg-muted/30 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Selected</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {Array.from(selected).map((t) => (
                <Badge key={t} variant="secondary" className="text-[10px]">
                  {TAG_LABELS[t] ?? t}
                </Badge>
              ))}
              {selected.size === 0 && <span className="text-xs text-muted-foreground">No tags</span>}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={busy}>
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Save tags
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
