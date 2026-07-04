import { UserRole } from '@/lib/types';

/**
 * Single source of truth for role colors across the Groups org tree — the
 * 3D card rail (Tree3D.tsx) and the list-view row rail (OrgNode.tsx) both
 * import from here so the two views can never drift out of sync.
 *
 * member is sky-600 (#0284c7) — CHANGED from the original gray (#6b7280) so
 * it's visually distinct from the #06b6d4 "currently studying" metric-icon
 * cyan (judge-panel fix on the Branch Rail conversion).
 */
export const ROLE_HEX: Record<UserRole, string> = {
  member: '#0284c7',
  team_leader: '#22c55e',
  group_leader: '#a855f7',
  branch_leader: '#f97316',
  overseer: '#ef4444',
  dev: '#f59e0b',
};

/** Same palette as ROLE_HEX, expressed as 0–1 RGB tuples for three.js materials. */
export const ROLE_RGB: Record<UserRole, [number, number, number]> = {
  member: [0.008, 0.52, 0.78], // sky-600
  team_leader: [0.2, 0.75, 0.45], // green
  group_leader: [0.65, 0.35, 0.95], // purple
  branch_leader: [0.95, 0.55, 0.2], // orange
  overseer: [0.95, 0.3, 0.3], // red
  dev: [0.95, 0.7, 0.15], // amber
};

/** Tailwind background-color classes for the list view's initials circle. */
export const ROLE_BG: Record<UserRole, string> = {
  member: 'bg-sky-600',
  team_leader: 'bg-green-500',
  group_leader: 'bg-purple-500',
  branch_leader: 'bg-orange-500',
  overseer: 'bg-red-500',
  dev: 'bg-amber-500',
};
