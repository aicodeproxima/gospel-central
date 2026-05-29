'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight,
  GraduationCap,
  BookOpen,
  Sparkles,
  UserCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ROLE_LABELS, UserRole, PIPELINE_STAGE_CONFIG } from '@/lib/types';
import type { Contact, OrgNode as OrgNodeType } from '@/lib/types';
import type { TeacherMetrics } from '@/lib/types/user';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  computeNodeMetrics,
  getContactsForSubtree,
  filterRecentlyStudying,
} from '@/lib/utils/org-metrics';

const ROLE_COLORS: Record<UserRole, string> = {
  member: 'bg-gray-500',
  team_leader: 'bg-green-500',
  group_leader: 'bg-purple-500',
  branch_leader: 'bg-orange-500',
  overseer: 'bg-red-500',
  dev: 'bg-amber-500',
};

// Members AND all leader roles get icons. Overseer & admins do not.
// (Teacher used to be its own role but is a tag in v1; tag-bearing
// users still get metric icons via their underlying role membership.)
const METRIC_ROLES = new Set<UserRole>([
  UserRole.MEMBER,
  UserRole.TEAM_LEADER,
  UserRole.GROUP_LEADER,
  UserRole.BRANCH_LEADER,
]);

export type ContactFilter = null | 'studying' | 'total' | 'fruit';

interface OrgNodeProps {
  node: OrgNodeType;
  depth?: number;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  contacts: Contact[];
  teacherMetrics: TeacherMetrics[];
  /** Map of nodeId -> active filter for that node */
  filters: Map<string, ContactFilter>;
  onFilter: (nodeId: string, filter: ContactFilter) => void;
}

export function OrgNodeComponent({
  node,
  depth = 0,
  expandedIds,
  onToggle,
  contacts,
  teacherMetrics,
  filters,
  onFilter,
}: OrgNodeProps) {
  const expanded = expandedIds.has(node.id);
  const hasChildren = node.children.length > 0;
  const showMetrics = METRIC_ROLES.has(node.role);
  const activeFilter = filters.get(node.id) || null;
  const router = useRouter();

  const metrics = useMemo(
    () => (showMetrics ? computeNodeMetrics(node, contacts, teacherMetrics) : null),
    [node, contacts, teacherMetrics, showMetrics],
  );

  // Contacts OWNED directly by this node (not its descendants)
  const ownContacts = useMemo(
    () => contacts.filter((c) => c.assignedTeacherId === node.id),
    [contacts, node.id],
  );

  // Subtree contacts — used when filter is active to show broader view
  const subtreeContacts = useMemo(
    () => (showMetrics ? getContactsForSubtree(node, contacts) : []),
    [node, contacts, showMetrics],
  );

  // Apply the filter to subtree contacts
  const visibleContacts = useMemo(() => {
    if (activeFilter === 'studying') return filterRecentlyStudying(subtreeContacts);
    if (activeFilter === 'fruit') return subtreeContacts.filter((c) => c.pipelineStage === 'baptized');
    if (activeFilter === 'total') return subtreeContacts;
    // No filter → show only the contacts directly owned by this node
    return ownContacts;
  }, [activeFilter, subtreeContacts, ownContacts]);

  const hasSomethingToExpand = hasChildren || ownContacts.length > 0 || activeFilter !== null;

  const handleIconClick = (filter: ContactFilter) => {
    // Toggle: if already active, turn it off; else set it
    const newFilter = activeFilter === filter ? null : filter;
    onFilter(node.id, newFilter);
    // Make sure node is expanded when a filter is applied
    if (newFilter && !expanded) onToggle(node.id);
  };

  return (
    <div className="relative">
      {depth > 0 && (
        <div className="absolute -left-6 top-0 h-6 w-6 border-b-2 border-l-2 border-border rounded-bl-lg" />
      )}

      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: Math.min(depth * 0.03, 0.2) }}
      >
        <Card
          className={cn(
            'transition-all hover:shadow-md',
            hasSomethingToExpand && 'hover:-translate-y-0.5',
          )}
        >
          <CardContent className="flex items-center gap-3 p-3">
            <button
              type="button"
              onClick={() => hasSomethingToExpand && onToggle(node.id)}
              className={cn(
                'flex items-center gap-3 flex-1 text-left min-w-0',
                hasSomethingToExpand && 'cursor-pointer',
              )}
            >
              {hasSomethingToExpand ? (
                <motion.div animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.2 }}>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </motion.div>
              ) : (
                <div className="w-4" />
              )}

              <div
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-full text-white text-sm font-bold',
                  ROLE_COLORS[node.role],
                )}
              >
                {node.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{node.name}</span>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {ROLE_LABELS[node.role]}
                  </Badge>
                </div>
                {node.groupName && (
                  <p className="text-xs text-muted-foreground">{node.groupName}</p>
                )}
              </div>
            </button>

            {/* Metric icons — members through branch leaders */}
            {showMetrics && metrics && (
              <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                <IconButton
                  icon={GraduationCap}
                  value={metrics.currentlyStudying}
                  label="Currently studying (last 30 days) — click to expand"
                  color="text-cyan-500"
                  active={activeFilter === 'studying'}
                  onClick={() => handleIconClick('studying')}
                />
                <IconButton
                  icon={BookOpen}
                  value={metrics.totalStudies}
                  label="Total study sessions ever — click to expand"
                  color="text-blue-500"
                  active={activeFilter === 'total'}
                  onClick={() => handleIconClick('total')}
                />
                <IconButton
                  icon={Sparkles}
                  value={metrics.bearingFruit}
                  label="Bearing fruit — baptized contacts — click to expand"
                  color="text-amber-500"
                  active={activeFilter === 'fruit'}
                  onClick={() => handleIconClick('fruit')}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Expanded content: tree children + contact leaves */}
      <AnimatePresence initial={false}>
        {expanded && hasSomethingToExpand && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="ml-10 mt-2 space-y-2 border-l-2 border-border pl-4 overflow-hidden"
          >
            {/* Org tree children */}
            {node.children.map((child) => (
              <OrgNodeComponent
                key={child.id}
                node={child}
                depth={depth + 1}
                expandedIds={expandedIds}
                onToggle={onToggle}
                contacts={contacts}
                teacherMetrics={teacherMetrics}
                filters={filters}
                onFilter={onFilter}
              />
            ))}

            {/* Contact leaves — owned or filtered */}
            {visibleContacts.length > 0 && (
              <div className="space-y-1.5">
                {activeFilter && (
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground pl-2 pt-2">
                    {activeFilter === 'studying' && 'Currently studying (last 30 days)'}
                    {activeFilter === 'total' && 'All subtree contacts'}
                    {activeFilter === 'fruit' && 'Bearing fruit — baptized contacts'}
                  </div>
                )}
                {visibleContacts.map((contact) => (
                  <ContactLeaf
                    key={contact.id}
                    contact={contact}
                    onEdit={() => router.push(`/contacts?edit=${contact.id}`)}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function IconButton({
  icon: IconProp,
  value,
  label,
  color,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: number;
  label: string;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = IconProp;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={label}
      className={cn(
        'flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-all cursor-pointer',
        active
          ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
          : 'border-transparent hover:border-border hover:bg-accent',
      )}
    >
      <Icon className={cn('h-3.5 w-3.5', color)} />
      <span className="font-semibold">{value}</span>
    </button>
  );
}

/**
 * Contact rendered as a leaf in the org tree.
 * Single click: highlights (no-op).
 * Double click: navigates to /contacts?edit={id}.
 */
function ContactLeaf({ contact, onEdit }: { contact: Contact; onEdit: () => void }) {
  const stage = PIPELINE_STAGE_CONFIG[contact.pipelineStage];
  return (
    <div className="relative">
      <div className="absolute -left-6 top-0 h-6 w-6 border-b-2 border-l-2 border-border/50 rounded-bl-lg" />
      <motion.button
        type="button"
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        onClick={(e) => e.stopPropagation()}
        title="Double-click to edit"
        className={cn(
          'w-full flex items-center gap-2.5 rounded-md border border-dashed border-border/60 bg-card/40 p-2 text-left',
          'hover:bg-accent/40 hover:border-primary/40 transition-colors cursor-pointer',
        )}
      >
        <UserCircle2 className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">
            {contact.firstName} {contact.lastName}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className={cn('h-1.5 w-1.5 rounded-full', stage.color)} />
              {stage.label}
            </span>
            <span>•</span>
            <span>{contact.totalSessions} sessions</span>
            {contact.currentSubject && (
              <>
                <span>•</span>
                <span className="truncate">Step {contact.currentStep}</span>
              </>
            )}
          </div>
        </div>
      </motion.button>
    </div>
  );
}

/**
 * Collect every expandable node ID — includes any node that either has
 * children OR has contacts directly assigned to it (members).
 */
export function collectAllIds(nodes: OrgNodeType[], contacts: Contact[] = []): string[] {
  const ownerIds = new Set(contacts.map((c) => c.assignedTeacherId).filter(Boolean));
  const ids: string[] = [];
  const walk = (n: OrgNodeType) => {
    if (n.children.length > 0 || ownerIds.has(n.id)) ids.push(n.id);
    n.children.forEach(walk);
  };
  nodes.forEach(walk);
  return ids;
}
