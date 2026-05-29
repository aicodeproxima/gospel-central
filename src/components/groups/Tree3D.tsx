'use client';

import { useMemo, useState, Suspense, useEffect, useCallback, memo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, Line, Billboard, useTexture, Stars } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  GraduationCap,
  BookOpen,
  Sparkles,
  ChevronRight,
  UserCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserRole, ROLE_LABELS, PIPELINE_STAGE_CONFIG } from '@/lib/types';
import type { Contact, OrgNode as OrgNodeType } from '@/lib/types';
import type { TeacherMetrics } from '@/lib/types/user';
import {
  computeNodeMetrics,
  filterRecentlyStudying,
  getContactsForSubtree,
} from '@/lib/utils/org-metrics';
import { layoutTree } from '@/lib/utils/tree-layout';
import { pickAvatarForUser } from '@/lib/avatars';
import { useTranslation } from '@/lib/i18n';

type ContactFilter = null | 'studying' | 'total' | 'fruit';

const ROLE_RGB: Record<UserRole, [number, number, number]> = {
  member: [0.4, 0.4, 0.45],
  team_leader: [0.2, 0.75, 0.45], // green
  group_leader: [0.65, 0.35, 0.95], // purple
  branch_leader: [0.95, 0.55, 0.2], // orange
  overseer: [0.95, 0.3, 0.3], // red
  dev: [0.95, 0.7, 0.15], // amber
};

const ROLE_HEX: Record<UserRole, string> = {
  member: '#6b7280',
  team_leader: '#22c55e',
  group_leader: '#a855f7',
  branch_leader: '#f97316',
  overseer: '#ef4444',
  dev: '#f59e0b',
};

const METRIC_ROLES = new Set<UserRole>([
  UserRole.MEMBER,
  UserRole.TEAM_LEADER,
  UserRole.GROUP_LEADER,
  UserRole.BRANCH_LEADER,
]);

// ----------------------------------------------------------------------------
// Glowing platform under each node
// ----------------------------------------------------------------------------
function Platform({ color, size = 2.6 }: { color: [number, number, number]; size?: number }) {
  // Shadows removed from Canvas (audit H-5) so the mesh no longer
  // needs cast/receive flags. The pulsing emissive is also gone — it
  // forced per-frame rendering even when nothing else moved, which
  // blocked frameloop="demand" from actually idling (audit H-8).
  return (
    <group>
      {/* Base */}
      <mesh position={[0, -0.15, 0]}>
        <boxGeometry args={[size, 0.3, size * 0.6]} />
        <meshStandardMaterial
          color={new THREE.Color(...color)}
          emissive={new THREE.Color(...color)}
          emissiveIntensity={0.45}
          metalness={0.6}
          roughness={0.35}
        />
      </mesh>
      {/* Glow rim */}
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[size + 0.2, 0.05, size * 0.6 + 0.2]} />
        <meshBasicMaterial color={new THREE.Color(...color)} transparent opacity={0.6} />
      </mesh>
    </group>
  );
}

// ----------------------------------------------------------------------------
// Avatar figure — textured plane that always faces the camera (billboard)
// ----------------------------------------------------------------------------
function AvatarFigure({ url }: { url: string }) {
  const texture = useTexture(url) as THREE.Texture;
  // L-1: Drei's useTexture caches per-URL, so multiple avatars with the
  // same URL share a single THREE.Texture. Apply our sampler settings
  // only once, inside a useEffect keyed on the texture identity, so
  // subsequent renders aren't mutating the same object repeatedly. The
  // ref indirection is there to satisfy the React 19 rule that flags
  // direct mutation of a hook return value — we're mutating a native
  // THREE object, not React state.
  const texRef = useRef<THREE.Texture | null>(null);
  if (texRef.current !== texture) {
    texRef.current = texture;
    const t = texture;
    t.anisotropy = 8;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.needsUpdate = true;
  }
  return (
    <Billboard position={[0, 1.3, 0]} follow lockX={false} lockY={false} lockZ={false}>
      <mesh>
        <planeGeometry args={[2.3, 2.3]} />
        <meshBasicMaterial map={texture} transparent toneMapped={false} />
      </mesh>
    </Billboard>
  );
}

// ----------------------------------------------------------------------------
// Node card — platform + HTML overlay with real interactivity
// ----------------------------------------------------------------------------
interface NodeCardProps {
  node: OrgNodeType;
  x: number;
  y: number;
  isExpanded: boolean;
  hasChildrenOrContacts: boolean;
  contacts: Contact[];
  teacherMetrics: TeacherMetrics[];
  activeFilter: ContactFilter;
  onToggle: () => void;
  onFilter: (f: ContactFilter) => void;
  /** Frames the node + its descendants — used on expand. */
  onFocus: () => void;
  /** Tight zoom on just the node — used on collapse. */
  onFocusTight: () => void;
}

function NodeCardInner({
  node,
  x,
  y,
  isExpanded,
  hasChildrenOrContacts,
  contacts,
  teacherMetrics,
  activeFilter,
  onToggle,
  onFilter,
  onFocus,
  onFocusTight,
}: NodeCardProps) {
  const { tRole, tStage } = useTranslation();
  const showMetrics = METRIC_ROLES.has(node.role);
  const metrics = useMemo(
    () => (showMetrics ? computeNodeMetrics(node, contacts, teacherMetrics) : null),
    [node, contacts, teacherMetrics, showMetrics],
  );

  const color = ROLE_RGB[node.role];
  const hex = ROLE_HEX[node.role];

  return (
    <group
      position={[x, y, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onFocus();
      }}
    >
      <Platform color={color} />
      {/* 3D avatar figure centered on the platform (billboarded to camera) */}
      <Suspense fallback={null}>
        <AvatarFigure url={node.avatarUrl || pickAvatarForUser(node.role, node.id)} />
      </Suspense>
      {/* HTML overlay BELOW the platform — screen-space so text stays crisp
          at any zoom level. Drei's non-transform Html anchors at the 3D
          point but renders as a regular DOM element. */}
      <Html
        position={[0, -1.3, 0]}
        center
        zIndexRange={[40, 0]}
        style={{ width: 220, pointerEvents: 'auto' }}
      >
        <div
          className="rounded-md border border-white/20 bg-card/95 backdrop-blur px-3 py-2 text-left shadow-xl"
          style={{ borderTopColor: hex, borderTopWidth: 3 }}
        >
          <button
            type="button"
            onClick={() => {
              if (hasChildrenOrContacts) {
                // Capture the *target* state before toggling: if we're
                // currently expanded, this click collapses → use a tight
                // node-only focus. Otherwise we're expanding → frame the
                // new subtree bounds.
                const willBeCollapsed = isExpanded;
                onToggle();
                // setTimeout instead of rAF — rAF can be throttled when
                // the tab isn't actively painting, which would cause the
                // focus call to never fire.
                setTimeout(() => {
                  if (willBeCollapsed) onFocusTight();
                  else onFocus();
                }, 50);
              } else {
                onFocusTight();
              }
            }}
            className="flex items-center gap-1.5 w-full text-left cursor-pointer"
          >
            {hasChildrenOrContacts && (
              <ChevronRight
                className="h-3 w-3 text-muted-foreground transition-transform"
                style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0)' }}
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold truncate text-foreground">{node.name}</div>
              <div className="text-[10px] text-muted-foreground">{tRole(node.role)}</div>
              {node.groupName && (
                <div className="text-[10px] text-muted-foreground">{node.groupName}</div>
              )}
            </div>
          </button>
          {showMetrics && metrics && (
            <div className="mt-2 flex items-center gap-1 justify-end">
              <MetricIcon
                Icon={GraduationCap}
                value={metrics.currentlyStudying}
                color="#06b6d4"
                active={activeFilter === 'studying'}
                onClick={() => onFilter(activeFilter === 'studying' ? null : 'studying')}
              />
              <MetricIcon
                Icon={BookOpen}
                value={metrics.totalStudies}
                color="#3b82f6"
                active={activeFilter === 'total'}
                onClick={() => onFilter(activeFilter === 'total' ? null : 'total')}
              />
              <MetricIcon
                Icon={Sparkles}
                value={metrics.bearingFruit}
                color="#f59e0b"
                active={activeFilter === 'fruit'}
                onClick={() => onFilter(activeFilter === 'fruit' ? null : 'fruit')}
              />
            </div>
          )}
        </div>
      </Html>
    </group>
  );
}

/** H-3: memoized so parent re-renders don't cascade through 180+ nodes. */
const NodeCard = memo(NodeCardInner);

function MetricIcon({
  Icon,
  value,
  color,
  active,
  onClick,
}: {
  Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  value: number;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        'flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] transition-all cursor-pointer',
        active ? 'bg-primary/20 ring-1 ring-primary' : 'hover:bg-accent',
      )}
    >
      <Icon className="h-2.5 w-2.5" style={{ color }} />
      <span className="font-bold text-foreground">{value}</span>
    </button>
  );
}

// ----------------------------------------------------------------------------
// Contact leaf — small glowing disc with HTML overlay
// ----------------------------------------------------------------------------
interface ContactLeaf3DProps {
  contact: Contact;
  x: number;
  y: number;
  onOpen: () => void;
  onFocus: () => void;
}

function ContactLeaf3DInner({
  contact,
  x,
  y,
  onOpen,
  onFocus,
}: ContactLeaf3DProps) {
  const { tStage } = useTranslation();
  const stage = PIPELINE_STAGE_CONFIG[contact.pipelineStage];
  return (
    <group
      position={[x, y, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onFocus();
        onOpen();
      }}
    >
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.7, 0.7, 0.15, 16]} />
        <meshStandardMaterial
          color="#1f2937"
          emissive="#4b5563"
          emissiveIntensity={0.3}
          metalness={0.4}
          roughness={0.5}
        />
      </mesh>
      <Html
        position={[0, -0.9, 0]}
        center
        zIndexRange={[30, 0]}
        style={{ width: 220, pointerEvents: 'auto' }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="flex w-full items-center gap-2 rounded-md border border-dashed border-white/30 bg-card/95 backdrop-blur px-3 py-2 text-left hover:border-primary/60 cursor-pointer shadow-xl"
          title="Click to view details"
        >
          <UserCircle2 className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold truncate text-foreground">
              {contact.firstName} {contact.lastName}
            </div>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className={cn('h-1.5 w-1.5 rounded-full inline-block', stage.color)} />
              {tStage(contact.pipelineStage)}
              {contact.currentSubject && (
                <>
                  <span>•</span>
                  <span className="truncate">Step {contact.currentStep}</span>
                </>
              )}
            </div>
          </div>
        </button>
      </Html>
    </group>
  );
}

/** H-3: memoized so contact leaves don't re-render on unrelated parent state changes. */
const ContactLeaf3D = memo(ContactLeaf3DInner);

// ----------------------------------------------------------------------------
// CameraRig — smoothly flies the camera + OrbitControls target to a focus point
// ----------------------------------------------------------------------------
export interface FocusTarget {
  /** Center point to look at */
  center: [number, number, number];
  /** Distance from the camera to the center. Higher = wider view. */
  distance: number;
}

interface CameraRigProps {
  focus: FocusTarget | null;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}

function CameraRig({ focus, controlsRef }: CameraRigProps) {
  const { camera, invalidate } = useThree();
  const targetLook = useMemo(() => new THREE.Vector3(), []);
  const targetCam = useMemo(() => new THREE.Vector3(), []);
  // Tracks whether the current focus animation is still running. Once the
  // camera is close enough to its target, we stop the lerp so the user can
  // freely zoom/pan/rotate without the rig fighting their input.
  const animatingRef = useRef(false);

  useEffect(() => {
    if (!focus) {
      animatingRef.current = false;
      return;
    }
    const [x, y, z] = focus.center;
    targetLook.set(x, y, z);
    targetCam.set(x, y + focus.distance * 0.2, z + focus.distance);
    animatingRef.current = true;
    // Kick the render loop once so useFrame starts animating on
    // frameloop="demand".
    invalidate();
  }, [focus, targetLook, targetCam, invalidate]);

  useFrame((_, dt) => {
    if (!animatingRef.current) return;
    const lerp = Math.min(1, dt * 5);
    camera.position.lerp(targetCam, lerp);
    if (controlsRef.current) {
      controlsRef.current.target.lerp(targetLook, lerp);
      controlsRef.current.update();
    }
    // Arrival check — epsilon scales with distance so huge subtrees don't
    // get stuck "always animating". Once within 1% of target (or 0.5 units,
    // whichever is larger) we stop and hand control back to the user.
    const camDist = camera.position.distanceTo(targetCam);
    const lookDist = controlsRef.current
      ? controlsRef.current.target.distanceTo(targetLook)
      : 0;
    const threshold = Math.max(0.5, targetCam.length() * 0.01);
    if (camDist < threshold && lookDist < threshold) {
      animatingRef.current = false;
    } else {
      // Keep the render loop alive until we've arrived.
      invalidate();
    }
  });

  return null;
}

// ----------------------------------------------------------------------------
// Scene
// ----------------------------------------------------------------------------
interface Tree3DProps {
  roots: OrgNodeType[];
  contacts: Contact[];
  teacherMetrics: TeacherMetrics[];
  expandedIds: Set<string>;
  filters: Map<string, ContactFilter>;
  onToggle: (id: string) => void;
  onFilter: (id: string, filter: ContactFilter) => void;
  /** When this changes, the camera flies to that node id (if visible in layout). */
  externalFocusId?: string | null;
  /**
   * Controls how `externalFocusId` frames the target. Default "subtree"
   * fits the node and every descendant; "node" zooms tight on just the
   * selected person.
   */
  externalFocusMode?: 'node' | 'subtree';
  /** Incrementing this counter triggers a "fit the whole tree" camera move. */
  resetSignal?: number;
  /** Called when a contact leaf is clicked — opens the contact detail popup. */
  onContactClick?: (contactId: string) => void;
}

function SceneContent({
  roots,
  contacts,
  teacherMetrics,
  expandedIds,
  filters,
  onToggle,
  onFilter,
  externalFocusId,
  externalFocusMode = 'subtree',
  resetSignal,
  onContactClick,
}: Tree3DProps) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const [focus, setFocus] = useState<FocusTarget | null>(null);

  // Compute which contacts to show for each expanded node
  const visibleContactsByNode = useMemo(() => {
    const map = new Map<string, Contact[]>();
    const walkNodes = (n: OrgNodeType) => {
      if (expandedIds.has(n.id)) {
        const filter = filters.get(n.id) || null;
        let list: Contact[];
        if (filter === 'studying') {
          list = filterRecentlyStudying(getContactsForSubtree(n, contacts));
        } else if (filter === 'fruit') {
          list = getContactsForSubtree(n, contacts).filter(
            (c) => c.pipelineStage === 'baptized',
          );
        } else if (filter === 'total') {
          list = getContactsForSubtree(n, contacts);
        } else {
          list = contacts.filter((c) => c.assignedTeacherId === n.id);
        }
        if (list.length > 0) map.set(n.id, list);
      }
      n.children.forEach(walkNodes);
    };
    roots.forEach(walkNodes);
    return map;
  }, [roots, contacts, expandedIds, filters]);

  const layout = useMemo(
    () => layoutTree(roots, expandedIds, visibleContactsByNode),
    [roots, expandedIds, visibleContactsByNode],
  );

  const nodePositions = useMemo(() => {
    const m = new Map<string, [number, number, number]>();
    layout.nodes.forEach((n) => m.set(n.id, [n.x, n.y, 0]));
    layout.contacts.forEach((c) => m.set(c.id, [c.x, c.y, 0]));
    return m;
  }, [layout]);

  /**
   * Build a FocusTarget that frames a node and all of its descendants that
   * are currently visible in the layout. Used when a node is clicked to
   * expand — we want to zoom out to show the node + its children, not
   * zoom tight onto the node itself.
   */
  const computeSubtreeFocus = useCallback(
    (nodeId: string): FocusTarget | null => {
      const root = layout.nodes.find((n) => n.id === nodeId);
      if (!root) return null;

      // Collect the set of descendant IDs using the org tree
      const descendantIds = new Set<string>([nodeId]);
      const walk = (n: OrgNodeType) => {
        descendantIds.add(n.id);
        n.children.forEach(walk);
      };
      walk(root.node);

      // Also include owned contact leaves
      contacts.forEach((c) => {
        if (c.assignedTeacherId && descendantIds.has(c.assignedTeacherId)) {
          descendantIds.add(c.id);
        }
      });

      const points: Array<[number, number]> = [];
      layout.nodes.forEach((n) => {
        if (descendantIds.has(n.id)) points.push([n.x, n.y]);
      });
      layout.contacts.forEach((c) => {
        if (descendantIds.has(c.id)) points.push([c.x, c.y]);
      });

      if (points.length === 0) return null;

      const xs = points.map((p) => p[0]);
      const ys = points.map((p) => p[1]);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const width = maxX - minX;
      const height = maxY - minY;

      // Pick a camera distance that fits the whole bounding box PLUS room
      // for the cards (which extend ~3 units below each platform) and the
      // glowing border margins. We bias the framing so the camera pulls
      // back generously and never crops the subtree.
      const paddedWidth = width + 6; // cards are ~5 units wide
      const paddedHeight = height + 6; // cards extend ~3 units below platforms
      const size = Math.max(paddedWidth, paddedHeight, 10);
      const distance = Math.max(14, size * 1.6);

      return {
        // Shift the look-at point down so the cards (which sit below
        // platforms) stay in the frame
        center: [centerX, centerY - 2, 0],
        distance,
      };
    },
    [layout, contacts],
  );

  /** Zoom in tight on a single node — used by the Jump-to picker. */
  const computeNodeFocus = useCallback(
    (nodeId: string): FocusTarget | null => {
      const node = layout.nodes.find((n) => n.id === nodeId);
      if (!node) return null;
      return {
        // Shift look-at slightly down so the card below the platform is framed
        center: [node.x, node.y - 1.5, 0],
        distance: 8,
      };
    },
    [layout],
  );

  // External focus (search / jump) — snap to any requested node once its
  // position is laid out. `externalFocusMode` decides whether we frame the
  // whole subtree or zoom tight on just the node.
  // External focus (search / jump) — snap to any requested node once its
  // position is laid out. `externalFocusMode` decides whether we frame the
  // whole subtree or zoom tight on just the node. Depending on `layout`
  // ensures this re-runs if the layout was still stabilizing when the
  // focus id arrived.
  useEffect(() => {
    if (!externalFocusId) return;
    const target =
      externalFocusMode === 'node'
        ? computeNodeFocus(externalFocusId)
        : computeSubtreeFocus(externalFocusId);
    if (target) setFocus(target);
  }, [externalFocusId, externalFocusMode, computeNodeFocus, computeSubtreeFocus, layout]);

  // Reset view — frames the entire currently-laid-out tree
  const computeFullTreeFocus = useCallback((): FocusTarget | null => {
    const points: Array<[number, number]> = [];
    layout.nodes.forEach((n) => points.push([n.x, n.y]));
    layout.contacts.forEach((c) => points.push([c.x, c.y]));
    if (points.length === 0) return null;
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    // Account for the viewport aspect ratio so horizontal trees don't leave
    // huge empty vertical gutters. Canvas is dynamically imported with
    // ssr:false so `window` is always defined here — the old guard was
    // dead code (audit L-4).
    const aspect =
      window.innerHeight > 0 ? window.innerWidth / window.innerHeight : 1.6;
    // Extra top padding so the floating toolbar doesn't overlap Michael/roots
    const TOOLBAR_PAD_TOP = 6;
    const paddedWidth = maxX - minX + 4;
    const paddedHeight = maxY - minY + 4 + TOOLBAR_PAD_TOP;
    const distForHeight = paddedHeight / 1.042;
    const distForWidth = paddedWidth / (1.042 * aspect);
    // Tighter reset scale — zoom in closer so cards are readable even if the
    // full tree doesn't fit (tree can still be panned). ~2× closer than a
    // strict fit-all. Clamped to a sane max so very large trees don't land
    // the camera inside a node.
    const distance = Math.min(
      32,
      Math.max(8, Math.max(distForHeight, distForWidth) * 0.55),
    );
    return {
      // Shift camera lookAt UP so tree content drops lower in the frame,
      // leaving space at the top for the floating toolbar.
      center: [
        (minX + maxX) / 2,
        (minY + maxY) / 2 + TOOLBAR_PAD_TOP / 2,
        0,
      ],
      distance,
    };
  }, [layout]);

  useEffect(() => {
    if (resetSignal === undefined || resetSignal === 0) return;
    const target = computeFullTreeFocus();
    if (target) setFocus(target);
  }, [resetSignal, computeFullTreeFocus]);

  // H-3: build per-id stable callback maps so NodeCard / ContactLeaf3D
  // (both React.memo) don't re-render every time a sibling toggles.
  // Depends only on values that actually change when the layout does,
  // so identity is preserved across unrelated state updates.
  const handleToggleById = useMemo(() => {
    const m: Record<string, () => void> = {};
    layout.nodes.forEach((ln) => {
      m[ln.id] = () => onToggle(ln.id);
    });
    return m;
  }, [layout.nodes, onToggle]);

  const handleFilterById = useMemo(() => {
    const m: Record<string, (f: ContactFilter) => void> = {};
    layout.nodes.forEach((ln) => {
      m[ln.id] = (f) => onFilter(ln.id, f);
    });
    return m;
  }, [layout.nodes, onFilter]);

  const handleFocusById = useMemo(() => {
    const m: Record<string, () => void> = {};
    layout.nodes.forEach((ln) => {
      m[ln.id] = () => {
        const target = computeSubtreeFocus(ln.id);
        if (target) setFocus(target);
      };
    });
    return m;
  }, [layout.nodes, computeSubtreeFocus]);

  const handleFocusTightById = useMemo(() => {
    const m: Record<string, () => void> = {};
    layout.nodes.forEach((ln) => {
      m[ln.id] = () => {
        const target = computeNodeFocus(ln.id);
        if (target) setFocus(target);
      };
    });
    return m;
  }, [layout.nodes, computeNodeFocus]);

  const handleContactOpenById = useMemo(() => {
    const m: Record<string, () => void> = {};
    layout.contacts.forEach((lc) => {
      m[lc.id] = () => onContactClick?.(lc.contact.id);
    });
    return m;
  }, [layout.contacts, onContactClick]);

  const handleContactFocusById = useMemo(() => {
    const m: Record<string, () => void> = {};
    layout.contacts.forEach((lc) => {
      m[lc.id] = () => setFocus({ center: [lc.x, lc.y, 0], distance: 8 });
    });
    return m;
  }, [layout.contacts]);

  return (
    <>
      {/* Lighting — dim, deep-blue void atmosphere (no shadows for perf) */}
      <ambientLight intensity={0.28} color="#8ab4ff" />
      <directionalLight position={[10, 15, 10]} intensity={0.75} color="#b8ccff" />
      <directionalLight position={[-10, 10, -10]} intensity={0.35} color="#4a6fff" />
      <pointLight position={[0, 22, 8]} intensity={0.9} color="#3b5bff" distance={90} decay={1.6} />
      <pointLight position={[0, -10, 12]} intensity={0.35} color="#1e3a8a" distance={60} decay={2} />

      {/* Distant starfield — floating particles in the void */}
      <Stars radius={120} depth={60} count={1500} factor={3} saturation={0} fade speed={0.3} />

      {/* Edges (connector beams) — run from below the parent card to above the child platform */}
      {layout.edges.map((edge, i) => {
        const from = nodePositions.get(edge.from);
        const to = nodePositions.get(edge.to);
        if (!from || !to) return null;
        // Parent card bottom is at y - 2.6, child platform top is at y + 0.15
        const startY = from[1] - 2.6;
        const endY = to[1] + 0.25;
        const mid: [number, number, number] = [(from[0] + to[0]) / 2, (startY + endY) / 2, 0];
        const fromNode = layout.nodes.find((n) => n.id === edge.from);
        const color = fromNode ? ROLE_HEX[fromNode.node.role] : '#6366f1';
        return (
          <Line
            key={`${edge.from}-${edge.to}-${i}`}
            points={[
              [from[0], startY, 0],
              mid,
              [to[0], endY, 0],
            ]}
            color={color}
            lineWidth={1.5}
            transparent
            opacity={0.55}
          />
        );
      })}

      {/* Nodes */}
      {layout.nodes.map((ln) => {
        const hasChildrenOrContacts =
          ln.node.children.length > 0 ||
          contacts.some((c) => c.assignedTeacherId === ln.node.id);
        return (
          <NodeCard
            key={ln.id}
            node={ln.node}
            x={ln.x}
            y={ln.y}
            isExpanded={expandedIds.has(ln.id)}
            hasChildrenOrContacts={hasChildrenOrContacts}
            contacts={contacts}
            teacherMetrics={teacherMetrics}
            activeFilter={filters.get(ln.id) || null}
            onToggle={handleToggleById[ln.id]}
            onFilter={handleFilterById[ln.id]}
            onFocus={handleFocusById[ln.id]}
            onFocusTight={handleFocusTightById[ln.id]}
          />
        );
      })}

      {/* Contact leaves */}
      {layout.contacts.map((lc) => (
        <ContactLeaf3D
          key={lc.id}
          contact={lc.contact}
          x={lc.x}
          y={lc.y}
          onOpen={handleContactOpenById[lc.id]}
          onFocus={handleContactFocusById[lc.id]}
        />
      ))}

      {/* Orbit controls */}
      <OrbitControls
        ref={controlsRef}
        enablePan
        enableZoom
        enableRotate={false}
        screenSpacePanning
        makeDefault
        maxDistance={70}
        minDistance={3}
        target={[0, -4, 0]}
        mouseButtons={{
          LEFT: THREE.MOUSE.PAN,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN,
        }}
        touches={{
          ONE: THREE.TOUCH.PAN,
          TWO: THREE.TOUCH.DOLLY_PAN,
        }}
      />

      {/* Camera rig — animates toward any focused node */}
      <CameraRig focus={focus} controlsRef={controlsRef} />
    </>
  );
}

const CAMERA_CONFIG = { position: [0, 2, 22] as [number, number, number], fov: 55, near: 0.1, far: 2000 };
const GL_CONFIG = { antialias: true, alpha: true, powerPreference: 'high-performance' as const };
const DPR: [number, number] = [1, 1.5];

export function Tree3D(props: Tree3DProps) {
  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* frameloop="demand" — idle render loop. Renders only when
          invalidate() is called, or when drei's OrbitControls fires
          change/start events (which call invalidate() automatically).
          Saves CPU/battery while the scene is static (audit H-8). */}
      <Canvas
        camera={CAMERA_CONFIG}
        gl={GL_CONFIG}
        dpr={DPR}
        frameloop="demand"
      >
        {/* No scene background — canvas is transparent so the starfield
            behind it (mounted by the Groups page) shows through. */}
        <fog attach="fog" args={['#05091f', 22, 75]} />
        <Suspense fallback={null}>
          <SceneContent {...props} />
        </Suspense>
      </Canvas>
      {/* Hint overlay */}
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-black/60 px-3 py-1.5 text-[10px] text-white/80 backdrop-blur">
        Drag to pan • Scroll or pinch to zoom
      </div>
    </div>
  );
}
