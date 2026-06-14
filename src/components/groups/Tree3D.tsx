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
import { clampCamToDollyRange } from '@/lib/utils/camera';
import { topLevelsBounds } from '@/lib/utils/tree-focus';
import { pickAvatarForUser } from '@/lib/avatars';
import { WebGLGuard } from '@/components/shared/WebGLGuard';
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
function AvatarFigure({ url, scale = 2.3 }: { url: string; scale?: number }) {
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
        <planeGeometry args={[scale, scale]} />
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
  /** <1280px (tablet/phone): narrower card so framed siblings don't overlap. */
  compact: boolean;
  /** Per-viewport world-scaling factor (undefined on desktop = fixed-size card). */
  cardDistanceFactor?: number;
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
  compact,
  cardDistanceFactor,
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
      {/* 3D avatar figure centered on the platform (billboarded to camera).
          Smaller on compact (<1280) so it doesn't dwarf the card on a phone. */}
      <Suspense fallback={null}>
        <AvatarFigure
          url={node.avatarUrl || pickAvatarForUser(node.role, node.id)}
          scale={compact ? 1.6 : 2.3}
        />
      </Suspense>
      {/* HTML overlay BELOW the platform — screen-space so text stays crisp
          at any zoom level. Drei's non-transform Html anchors at the 3D
          point but renders as a regular DOM element. */}
      <Html
        position={[0, -1.3, 0]}
        center
        zIndexRange={[40, 0]}
        distanceFactor={cardDistanceFactor}
        style={{ width: compact ? 156 : 220, pointerEvents: 'auto' }}
      >
        <div
          data-tree-card
          className="rounded-md border border-white/20 bg-card/95 backdrop-blur px-3 py-2 text-left shadow-xl"
          style={{ borderTopColor: hex, borderTopWidth: 3 }}
        >
          <button
            type="button"
            onClick={() => {
              // onToggle (nodes with children) flips expansion AND — in
              // SceneContent — requests a focus against the FRESH post-toggle
              // layout (focusReq + effect), so the camera snaps to fit the
              // just-expanded group like the /tree-demo. Leaves tight-focus.
              // (No setTimeout: it captured stale layout and broke snap-to-fit.)
              if (hasChildrenOrContacts) onToggle();
              else onFocusTight();
            }}
            className="flex items-center gap-1.5 w-full text-left cursor-pointer touch-manipulation"
            style={{ minHeight: compact ? 44 : undefined }}
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
  compact: boolean;
  cardDistanceFactor?: number;
}

function ContactLeaf3DInner({
  contact,
  x,
  y,
  onOpen,
  onFocus,
  compact,
  cardDistanceFactor,
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
        distanceFactor={cardDistanceFactor}
        style={{ width: compact ? 156 : 220, pointerEvents: 'auto' }}
      >
        <button
          type="button"
          data-tree-card
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

  // True while the user has a drag/pinch/wheel gesture in flight — a focus
  // that lands mid-gesture is dropped instead of fighting the user's input.
  const gestureActiveRef = useRef(false);

  // User input always wins: the moment a drag/pinch/wheel interaction starts,
  // cancel the fly-to so the rig can never fight (or permanently lock out)
  // pan/zoom. `focus` in deps re-attaches after every animation request,
  // covering a controls instance that wasn't mounted yet on first render.
  useEffect(() => {
    const ctl = controlsRef.current;
    if (!ctl) return;
    const onStart = () => {
      gestureActiveRef.current = true;
      animatingRef.current = false;
    };
    const onEnd = () => {
      gestureActiveRef.current = false;
    };
    ctl.addEventListener('start', onStart);
    ctl.addEventListener('end', onEnd);
    return () => {
      ctl.removeEventListener('start', onStart);
      ctl.removeEventListener('end', onEnd);
    };
  }, [controlsRef, focus]);

  useEffect(() => {
    if (!focus) {
      animatingRef.current = false;
      return;
    }
    // A queued snap arriving while the user is mid-gesture would yank the
    // camera out from under their fingers — their input wins; drop it.
    if (gestureActiveRef.current) return;
    const [x, y, z] = focus.center;
    targetLook.set(x, y, z);
    targetCam.set(x, y + focus.distance * RIG_Y_OFFSET, z + focus.distance);
    // The vertical offset puts the true camera↔look radius at ~1.02×distance.
    // A fly-to point outside the controls' dolly range can never be reached —
    // update() re-clamps the camera each frame, the arrival check below never
    // passes, and the rig animates forever, overriding all user input (this
    // was the Expand-All lock on phones). Margins keep float wobble at the
    // exact boundary from stalling the arrival.
    if (controlsRef.current) {
      clampCamToDollyRange(
        targetCam,
        targetLook,
        controlsRef.current.minDistance * 1.02,
        controlsRef.current.maxDistance * 0.98,
      );
    }
    animatingRef.current = true;
    // Kick the render loop once so useFrame starts animating on
    // frameloop="demand".
    invalidate();
  }, [focus, targetLook, targetCam, invalidate, controlsRef]);

  useFrame((_, dt) => {
    if (!animatingRef.current) return;
    if (controlsRef.current) {
      // The dolly range can change mid-flight (compact↔desktop breakpoint
      // flip swaps maxDistance 280↔70) — re-clamp so the fly-to point always
      // stays reachable and the arrival check below can pass. No-op when
      // nothing changed.
      clampCamToDollyRange(
        targetCam,
        targetLook,
        controlsRef.current.minDistance * 1.02,
        controlsRef.current.maxDistance * 0.98,
      );
    }
    const lerp = Math.min(1, dt * 5);
    camera.position.lerp(targetCam, lerp);
    if (controlsRef.current) {
      controlsRef.current.target.lerp(targetLook, lerp);
      controlsRef.current.update();
    }
    // Arrival check — epsilon scales with the fly-to radius (NOT distance
    // from the world origin, which inflated the threshold for edge-of-tree
    // nodes and let the rig stop visibly short). Once within 1% (or 0.5
    // units, whichever is larger) we stop and hand control back to the user.
    const camDist = camera.position.distanceTo(targetCam);
    const lookDist = controlsRef.current
      ? controlsRef.current.target.distanceTo(targetLook)
      : 0;
    const threshold = Math.max(0.5, targetCam.distanceTo(targetLook) * 0.01);
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
  /**
   * Incrementing this counter frames the TOP tiers (root → branch leaders) —
   * used by Expand-all so the user sees the org's shape instead of being
   * stranded in the middle member band by a full-tree fit. Distinct from
   * resetSignal so the Reset button keeps its whole-tree fit.
   */
  fitTopSignal?: number;
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
  fitTopSignal,
  onContactClick,
}: Tree3DProps) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const [focus, setFocus] = useState<FocusTarget | null>(null);
  // <1280px: compact cards + readability-capped framing so framed siblings
  // don't overlap on a phone/tablet. ≥1280 keeps full-size cards + the
  // original framing. Client-only (the Canvas is dynamically ssr:false).
  // Lazy-init from matchMedia: with useState(false) the initial external
  // focus (u-michael, arrives before the first effect's re-render lands)
  // applied with the DESKTOP closure on phones, and appliedExternalRef then
  // pinned that stale framing — defeating the compact tight-focus fit.
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1279px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1279px)');
    const apply = () => setCompact(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  // Drawable canvas size — use THIS (not window) for aspect-aware framing: on
  // mobile the canvas is offset below the toolbar, so it's shorter/narrower
  // than the window and the camera must fit that actual area.
  const { size: canvasSize } = useThree();
  // Per-viewport distanceFactor (compact only) so card world-width stays
  // ~CARD_WORLD_WIDTH regardless of canvas px height (see constant comment).
  const cardDistanceFactor =
    compact && canvasSize.height > 0
      ? (CARD_WORLD_WIDTH * canvasSize.height) / CARD_BASE_PX
      : undefined;

  // Snap-to-fit pipeline. The card's expand button bumps `focusReq`; the effect
  // below computes the camera target against the FRESH layout (after expandedIds
  // propagates in the same render batch) so expand snaps to fit the group — like
  // the /tree-demo prototype, with no stale-layout setTimeout.
  const focusSeq = useRef(0);
  const [focusReq, setFocusReq] = useState<{
    kind: 'subtree' | 'tight';
    id: string;
    seq: number;
  } | null>(null);
  const requestFocus = useCallback((kind: 'subtree' | 'tight', id: string) => {
    focusSeq.current += 1;
    setFocusReq({ kind, id, seq: focusSeq.current });
  }, []);

  // Tracks the external (search / jump / initial) focus we've already applied,
  // so a later layout recompute (e.g. expanding a node) does NOT re-apply the
  // stale initial focus and clobber the expand's snap-to-fit.
  const appliedExternalRef = useRef<string | null>(null);

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

      // Compact (<1280): aspect-aware fit with a readability CAP so the
      // ~156px cards never zoom out into an unreadable, overlapping pile on
      // a narrow phone/tablet. If the whole subtree can't fit at a readable
      // zoom, frame the node + its DIRECT children instead and let the user
      // pan/pinch to explore the rest (the "Smart-Fit" model).
      if (compact) {
        // World-scaled cards (distanceFactor) are a fixed ~CARD_WORLD_WIDTH wide at
        // ANY zoom, and siblings sit >= HORIZONTAL_GAP(7) apart, max 3 per row — so
        // they can NEVER overlap. We therefore just fit the WHOLE expanded subtree's
        // bounding box, padded by the node's world extents so no edge card is cut.
        const vw = canvasSize.width || 1;
        const vh = canvasSize.height || 1;
        const aspect = vw / vh;
        const tan = Math.tan((CAMERA_CONFIG.fov * Math.PI) / 180 / 2);
        const padTop = AVATAR_WORLD_TOP + 1.5; // avatar above center; canvas already starts below the toolbar
        const padBottom = CARD_WORLD_DROP;     // card hangs below center
        const boxW = maxX - minX + CARD_WORLD_WIDTH;
        const boxH = maxY - minY + padTop + padBottom;
        // Smallest distance that fits BOTH axes (vertical fov + horizontal = fov*aspect).
        // 1.12x safety margin so edge cards never touch the frame on the
        // narrowest phones (the box otherwise fits EXACTLY → 360/320 clipped).
        const fit = Math.max(boxH / 2 / tan, boxW / 2 / (tan * aspect));
        const distance = Math.min(MAX_FOCUS_DIST_COMPACT, Math.max(fit * 1.12, 7));
        // Bias look-at to the box's true vertical midpoint (card hangs lower than avatar).
        const cy = centerY + (padTop - padBottom) / 2;
        return { center: [centerX, cy, 0], distance };
      }

      // Desktop (≥1280) — original framing, plus the dolly-range cap: a huge
      // subtree (e.g. root clicked while fully expanded) used to compute a
      // distance past maxDistance(70) and trigger the same animation lock.
      const paddedWidth = width + 6; // cards are ~5 units wide
      const paddedHeight = height + 6; // cards extend ~3 units below platforms
      const size = Math.max(paddedWidth, paddedHeight, 10);
      const distance = Math.min(MAX_FOCUS_DIST_DESKTOP, Math.max(14, size * 1.6));

      return {
        // Shift the look-at point down so the cards (which sit below
        // platforms) stay in the frame
        center: [centerX, centerY - 2, 0],
        distance,
      };
    },
    [layout, contacts, compact, canvasSize],
  );

  /** Tight single-card framing at an arbitrary layout position — shared by
   *  node tight-focus AND contact-leaf focus so the two paths can't drift. */
  const computeTightFocusAt = useCallback(
    (x: number, y: number): FocusTarget => {
      if (compact) {
        // World-scaled cards: at the desktop-tuned distance 8 the ~4.8wu card
        // is WIDER than a phone canvas (412px ≈ 3.8wu visible) and renders cut
        // off at both edges. Fit the single card's padded box with the same
        // aspect-aware math as the subtree framing, with extra breathing room
        // (1.35 vs 1.12) so the card sits comfortably inside the frame.
        const vw = canvasSize.width || 1;
        const vh = canvasSize.height || 1;
        const aspect = vw / vh;
        const tan = Math.tan((CAMERA_CONFIG.fov * Math.PI) / 180 / 2);
        const padTop = AVATAR_WORLD_TOP + 1.5;
        const padBottom = CARD_WORLD_DROP;
        const fit = Math.max(
          (padTop + padBottom) / 2 / tan,
          CARD_WORLD_WIDTH / 2 / (tan * aspect),
        );
        const distance = Math.max(fit * 1.35, 9);
        return { center: [x, y + (padTop - padBottom) / 2, 0], distance };
      }
      return {
        // Shift look-at slightly down so the card below the platform is framed
        center: [x, y - 1.5, 0],
        distance: 8,
      };
    },
    [compact, canvasSize],
  );

  /** Zoom in tight on a single node — used by the Jump-to picker. */
  const computeNodeFocus = useCallback(
    (nodeId: string): FocusTarget | null => {
      const node = layout.nodes.find((n) => n.id === nodeId);
      return node ? computeTightFocusAt(node.x, node.y) : null;
    },
    [layout, computeTightFocusAt],
  );

  // Apply focus requests against the CURRENT layout. The compute callbacks
  // depend on `layout`, so when an expand bumps focusReq AND changes the layout
  // in the same render batch, this runs once with the FRESH layout → the camera
  // snaps to fit the just-expanded group.
  useEffect(() => {
    if (!focusReq) return;
    const target =
      focusReq.kind === 'tight'
        ? computeNodeFocus(focusReq.id)
        : computeSubtreeFocus(focusReq.id);
    if (target) setFocus(target);
  }, [focusReq, computeNodeFocus, computeSubtreeFocus]);

  // External focus (search / jump) — snap to any requested node once its
  // position is laid out. `externalFocusMode` decides whether we frame the
  // whole subtree or zoom tight on just the node.
  // External focus (search / jump) — snap to any requested node once its
  // position is laid out. `externalFocusMode` decides whether we frame the
  // whole subtree or zoom tight on just the node. Depending on `layout`
  // ensures this re-runs if the layout was still stabilizing when the
  // focus id arrived.
  useEffect(() => {
    if (!externalFocusId) {
      appliedExternalRef.current = null;
      return;
    }
    // Apply only when the external target actually changes — keep `layout` in
    // deps so we still retry once the node is laid out, but the ref guard stops
    // re-applying on unrelated layout changes (an expand) which would override
    // the internal subtree snap. `compact` is part of the key so a breakpoint
    // flip re-applies the focus with the correct framing instead of being
    // swallowed by the guard.
    const key = `${compact ? 'c' : 'd'}:${externalFocusMode}:${externalFocusId}`;
    if (appliedExternalRef.current === key) return;
    const target =
      externalFocusMode === 'node'
        ? computeNodeFocus(externalFocusId)
        : computeSubtreeFocus(externalFocusId);
    if (target) {
      setFocus(target);
      appliedExternalRef.current = key;
    }
  }, [externalFocusId, externalFocusMode, compact, computeNodeFocus, computeSubtreeFocus, layout]);

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
    if (compact) {
      // Compact fit-all: same world-scaled padded-box fit as computeSubtreeFocus,
      // over ALL nodes. Real canvasSize (not window) + no *0.55/min(32) clamp
      // (those pushed the whole tree off-screen on mobile). Clamp to the raised
      // compact maxDistance so a big tree can actually dolly out to fit.
      const vw = canvasSize.width || 1;
      const vh = canvasSize.height || 1;
      const aspect = vw / vh;
      const tan = Math.tan((CAMERA_CONFIG.fov * Math.PI) / 180 / 2);
      const padTop = AVATAR_WORLD_TOP + 1.5;
      const padBottom = CARD_WORLD_DROP;
      const boxW = maxX - minX + CARD_WORLD_WIDTH;
      const boxH = maxY - minY + padTop + padBottom;
      const fit = Math.max(boxH / 2 / tan, boxW / 2 / (tan * aspect));
      const distance = Math.min(MAX_FOCUS_DIST_COMPACT, Math.max(fit * 1.12, 7));
      return {
        center: [(minX + maxX) / 2, (minY + maxY) / 2 + (padTop - padBottom) / 2, 0],
        distance,
      };
    }
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
  }, [layout, compact, canvasSize]);

  // Expand-all framing: frame the root(s) + top TOP_LEVELS_DEPTH tiers so the
  // user sees the org's leadership shape and pans DOWN to drill in — instead of
  // computeFullTreeFocus centering the tall tree's bbox on the member band with
  // the root off-screen above. Reuses computeSubtreeFocus's readable framing
  // (compact + desktop) so it inherits the same dolly-range caps.
  const computeTopLevelsFocus = useCallback(
    (maxDepth: number): FocusTarget | null => {
      const b = topLevelsBounds(
        layout.nodes,
        layout.contacts,
        maxDepth,
        layout.bounds.maxDepth,
      );
      if (!b) return null;
      const { minX, maxX, minY, maxY } = b;
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const width = maxX - minX;
      const height = maxY - minY;

      if (compact) {
        const vw = canvasSize.width || 1;
        const vh = canvasSize.height || 1;
        const aspect = vw / vh;
        const tan = Math.tan((CAMERA_CONFIG.fov * Math.PI) / 180 / 2);
        const padTop = AVATAR_WORLD_TOP + 1.5;
        const padBottom = CARD_WORLD_DROP;
        const boxW = maxX - minX + CARD_WORLD_WIDTH;
        const boxH = maxY - minY + padTop + padBottom;
        const fit = Math.max(boxH / 2 / tan, boxW / 2 / (tan * aspect));
        const distance = Math.min(MAX_FOCUS_DIST_COMPACT, Math.max(fit * 1.12, 7));
        return { center: [centerX, centerY + (padTop - padBottom) / 2, 0], distance };
      }

      // Desktop — identical framing math to computeSubtreeFocus (dolly-capped).
      const paddedWidth = width + 6;
      const paddedHeight = height + 6;
      const size = Math.max(paddedWidth, paddedHeight, 10);
      const distance = Math.min(MAX_FOCUS_DIST_DESKTOP, Math.max(14, size * 1.6));
      return { center: [centerX, centerY - 2, 0], distance };
    },
    [layout, compact, canvasSize],
  );

  // Fit-all ONLY when resetSignal actually increments (Reset button),
  // NOT every time computeFullTreeFocus changes identity on a layout change — else
  // expand/collapse after a reset re-fits the whole tree and clobbers the node/
  // subtree snap (this was why Collapse-All's snap-to-Michael got overridden). (H)
  const lastResetRef = useRef(0);
  useEffect(() => {
    if (resetSignal === undefined || resetSignal === 0) return;
    if (resetSignal === lastResetRef.current) return;
    lastResetRef.current = resetSignal;
    const target = computeFullTreeFocus();
    if (target) setFocus(target);
  }, [resetSignal, computeFullTreeFocus]);

  // Frame the top tiers ONLY when fitTopSignal actually increments (Expand-all),
  // mirroring the resetSignal guard so a layout-driven identity change of
  // computeTopLevelsFocus doesn't re-fire and clobber a later snap.
  const lastFitTopRef = useRef(0);
  useEffect(() => {
    if (!fitTopSignal) return;
    if (fitTopSignal === lastFitTopRef.current) return;
    lastFitTopRef.current = fitTopSignal;
    const target = computeTopLevelsFocus(TOP_LEVELS_DEPTH);
    if (target) setFocus(target);
  }, [fitTopSignal, computeTopLevelsFocus]);

  // H-3: build per-id stable callback maps so NodeCard / ContactLeaf3D
  // (both React.memo) don't re-render every time a sibling toggles.
  // Depends only on values that actually change when the layout does,
  // so identity is preserved across unrelated state updates.
  const handleToggleById = useMemo(() => {
    const m: Record<string, () => void> = {};
    layout.nodes.forEach((ln) => {
      m[ln.id] = () => {
        const willExpand = !expandedIds.has(ln.id);
        onToggle(ln.id);
        // Request the matching focus in the SAME batch as the toggle, so the
        // effect runs against the post-toggle layout → snap to fit.
        requestFocus(willExpand ? 'subtree' : 'tight', ln.id);
      };
    });
    return m;
  }, [layout.nodes, onToggle, expandedIds, requestFocus]);

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
      m[ln.id] = () => requestFocus('subtree', ln.id);
    });
    return m;
  }, [layout.nodes, requestFocus]);

  const handleFocusTightById = useMemo(() => {
    const m: Record<string, () => void> = {};
    layout.nodes.forEach((ln) => {
      m[ln.id] = () => requestFocus('tight', ln.id);
    });
    return m;
  }, [layout.nodes, requestFocus]);

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
      // Same tight framing as nodes — contact cards are world-scaled on
      // compact too, so a hardcoded distance 8 clips them just like bug 2.
      m[lc.id] = () => setFocus(computeTightFocusAt(lc.x, lc.y));
    });
    return m;
  }, [layout.contacts, computeTightFocusAt]);

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
            compact={compact}
            cardDistanceFactor={cardDistanceFactor}
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
          compact={compact}
          cardDistanceFactor={cardDistanceFactor}
        />
      ))}

      {/* Compact pushes the fog far plane out so the zoomed-out expand-all / fit
          view isn't swallowed by fog; desktop keeps the original close 75. */}
      <fog attach="fog" args={['#05091f', 22, compact ? 280 : 75]} />

      {/* Orbit controls */}
      <OrbitControls
        ref={controlsRef}
        enablePan
        enableZoom
        enableRotate={false}
        screenSpacePanning
        makeDefault
        maxDistance={compact ? MAX_DIST_COMPACT : MAX_DIST_DESKTOP}
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

// CameraRig places the camera at [x, y + d·RIG_Y_OFFSET, z + d], so its true
// radius from the look-at is d·√(1 + RIG_Y_OFFSET²) ≈ 1.02·d. Auto-focus
// distances must stay BELOW maxDistance/1.02 or OrbitControls.update() clamps
// the camera away from the rig's fly-to point on every frame and the rig
// never "arrives" — permanently locking out user pan/zoom (Expand-All bug).
const RIG_Y_OFFSET = 0.2;
const MAX_DIST_COMPACT = 280;
const MAX_DIST_DESKTOP = 70;
const RIG_RADIUS_FACTOR = Math.hypot(1, RIG_Y_OFFSET);
const MAX_FOCUS_DIST_COMPACT = Math.floor((MAX_DIST_COMPACT / RIG_RADIUS_FACTOR) * 0.98); // 269
const MAX_FOCUS_DIST_DESKTOP = Math.floor((MAX_DIST_DESKTOP / RIG_RADIUS_FACTOR) * 0.98); // 67

// Expand-all frames the root(s) + this many levels down (depth 0..N): Dev(0) →
// Overseer(1) → Branch leader(2) — the org's structural "shape" rows. Readable,
// root on-screen, user pans down to reach groups/teams/members.
const TOP_LEVELS_DEPTH = 2;

// --- Compact (<1280) world-scaled card tuning ------------------------------
// On phones/tablets the node + contact cards use drei <Html distanceFactor>, so
// they scale WITH zoom exactly like the world-space avatar/platform — a node
// reads as one unit at every zoom (drei web/Html.js: scale = objectScale * distanceFactor).
// CARD_DISTANCE_FACTOR is CALIBRATED live so a card is ~CARD_WORLD_WIDTH world
// units wide; keeping that < the layout HORIZONTAL_GAP (7) means sibling cards
// can NEVER overlap at any zoom. AVATAR_WORLD_TOP / CARD_WORLD_DROP are the
// node's world extents above/below its center (avatar top / card bottom), used
// to pad the camera framing so edge cards are never cut off. Keep the factor and
// the measured widths calibrated together (see groups verification).
// drei non-transform: cardWorldWidth = CARD_BASE_PX * distanceFactor / canvasHeight.
// A STATIC factor (calibrated at 412) makes cards too WIDE on a narrower canvas
// (320 → ~6.9wu → overlap), so distanceFactor is computed DYNAMICALLY from
// canvasSize.height in SceneContent to hold cardWorldWidth ≈ CARD_WORLD_WIDTH at
// every viewport/DPR. 4.8 < HORIZONTAL_GAP(7) ⇒ siblings never overlap anywhere.
const CARD_BASE_PX = 156;
const CARD_WORLD_WIDTH = 4.8;
const AVATAR_WORLD_TOP = 2.1;
const CARD_WORLD_DROP = 4.0;

export function Tree3D(props: Tree3DProps) {
  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* WebGLGuard — iOS Lockdown Mode (and some webviews) disables WebGL,
          which would make <Canvas> blank the view right after login. The
          guard feature-detects up front and catches runtime GL crashes,
          swapping in a friendly non-3D message instead. */}
      <WebGLGuard
        fallback={
          <div className="flex h-full w-full items-center justify-center p-6">
            <div className="max-w-md rounded-lg border border-border bg-card/75 p-6 text-center shadow-lg backdrop-blur-md">
              <p className="mb-2 text-sm font-semibold text-foreground">
                3D view isn&apos;t available on this device
              </p>
              <p className="text-sm text-muted-foreground">
                WebGL is disabled — for example by iOS Lockdown Mode. Your
                groups are still here: switch to the List view using the
                toggle in the toolbar above.
              </p>
            </div>
          </div>
        }
      >
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
              behind it (mounted by the Groups page) shows through. Fog is now
              declared inside SceneContent so its far plane can be compact-aware. */}
          <Suspense fallback={null}>
            <SceneContent {...props} />
          </Suspense>
        </Canvas>
        {/* Hint overlay */}
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-black/60 px-3 py-1.5 text-[10px] text-white/80 backdrop-blur">
          Drag to pan • Scroll or pinch to zoom
        </div>
      </WebGLGuard>
    </div>
  );
}
