import type { Contact, OrgNode } from '../types';
import type { TeacherMetrics } from '../types/user';

/**
 * Metrics computed LIVE from the current contacts + teacher metrics on the
 * client. Unlike the mock scenario's pre-computed rollup, these update
 * automatically whenever a contact is edited — so the org tree always
 * reflects the latest state.
 */
export interface LiveNodeMetrics {
  currentlyStudying: number; // contacts with a session in last 30 days
  totalStudies: number; // sum of totalSessions of all contacts under this node
  bearingFruit: number; // number of baptized contacts in the subtree (live)
  totalMembers: number; // users in the subtree, excluding the node itself
  totalContacts: number; // contacts assigned to anyone in the subtree (node included)
}

/** Collect all user IDs in this node's subtree, including the node itself. */
export function collectSubtreeUserIds(node: OrgNode): string[] {
  const ids: string[] = [node.id];
  const walk = (n: OrgNode) => {
    n.children.forEach((c) => {
      ids.push(c.id);
      walk(c);
    });
  };
  walk(node);
  return ids;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Get contacts assigned to a user or anyone in their subtree.
 */
export function getContactsForSubtree(node: OrgNode, contacts: Contact[]): Contact[] {
  const ids = new Set(collectSubtreeUserIds(node));
  return contacts.filter((c) => c.assignedTeacherId && ids.has(c.assignedTeacherId));
}

/**
 * Filter a contact list to those who had a session in the last 30 days.
 * Falls back to the `currentlyStudying` flag when `lastSessionDate` is missing.
 */
export function filterRecentlyStudying(contacts: Contact[]): Contact[] {
  const cutoff = Date.now() - THIRTY_DAYS_MS;
  return contacts.filter((c) => {
    if (c.lastSessionDate) {
      return new Date(c.lastSessionDate).getTime() >= cutoff;
    }
    return !!c.currentlyStudying;
  });
}

/**
 * Compute all live metrics for a given org tree node.
 */
export function computeNodeMetrics(
  node: OrgNode,
  contacts: Contact[],
  // Retained for signature stability (callers still pass the teacher-metrics
  // rollup); no longer used now that Bearing Fruit is computed live from contacts.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _teacherMetrics: TeacherMetrics[] = [],
): LiveNodeMetrics {
  const subtreeContacts = getContactsForSubtree(node, contacts);
  const recent = filterRecentlyStudying(subtreeContacts);
  const totalStudies = subtreeContacts.reduce((sum, c) => sum + (c.totalSessions || 0), 0);

  const subtreeIds = new Set(collectSubtreeUserIds(node));
  // Bearing Fruit is a LIVE count of baptized contacts in the subtree — matching
  // its badge label ("baptized contacts"), its drill-down list (pipelineStage
  // === 'baptized'), and the page's "all metrics are live" promise. It was
  // previously summed from the static teacherMetrics rollup, so the number never
  // moved when a contact was baptized while the drill-down list did.
  const bearingFruit = subtreeContacts.filter((c) => c.pipelineStage === 'baptized').length;

  const totalMembers = subtreeIds.size - 1; // exclude the node itself
  const totalContacts = subtreeContacts.length;

  return {
    currentlyStudying: recent.length,
    totalStudies,
    bearingFruit,
    totalMembers,
    totalContacts,
  };
}
