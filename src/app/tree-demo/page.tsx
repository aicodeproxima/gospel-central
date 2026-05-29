'use client';

/**
 * ISOLATED MOBILE-UX DEMO — not part of the app.
 *
 * Demonstrates two candidate mobile interaction models for the org Tree3D so
 * the decision can be made on a real phone:
 *
 *   A · Smart-Fit  — keep today's free-explore horizontal tree. Expanding a
 *                    node flies the camera to frame that group, but the
 *                    zoom-out is CAPPED so cards never crowd past readable; if
 *                    a group is wider than fits legibly, it frames the parent +
 *                    its children and you pan/pinch to explore the rest.
 *
 *   B · Drill-Down — tap a leader to focus just them + their direct reports,
 *                    stacked vertically (uses the tall 19.5:9 screen). A
 *                    breadcrumb steps back up. Only a few cards on screen, so
 *                    nothing ever overlaps.
 *
 * Self-contained: fake data, its own light 3D scene, no imports from the app's
 * Tree3D. Lives behind /tree-demo on the feat/mobile-tree-demo branch only.
 */

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Html, Line, Stars } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

// ---------------------------------------------------------------- fake data
type Role = 'branch_leader' | 'group_leader' | 'member';
interface DemoNode {
  id: string;
  name: string;
  role: Role;
  children: DemoNode[];
}

const ROLE_HEX: Record<Role, string> = {
  branch_leader: '#f97316',
  group_leader: '#a855f7',
  member: '#22c55e',
};
const ROLE_LABEL: Record<Role, string> = {
  branch_leader: 'Branch Leader',
  group_leader: 'Group Leader',
  member: 'Member',
};

const mkGroup = (id: string, name: string, members: string[]): DemoNode => ({
  id,
  name,
  role: 'group_leader',
  children: members.map((m) => ({
    id: `${id}-${m.toLowerCase()}`,
    name: m,
    role: 'member' as Role,
    children: [],
  })),
});

const TREE: DemoNode = {
  id: 'joseph',
  name: 'Joseph',
  role: 'branch_leader',
  children: [
    mkGroup('elizabeth', 'Elizabeth', ['Mary', 'Anna', 'Ruth', 'Esther']),
    mkGroup('zechariah', 'Zechariah', ['Peter', 'John', 'James', 'Andrew']),
    mkGroup('philip', 'Philip', ['Mark', 'Luke', 'Paul', 'Silas']),
  ],
};

const NODE_BY_ID = new Map<string, DemoNode>();
const PARENT_OF = new Map<string, string | null>();
(function index(n: DemoNode, parent: string | null) {
  NODE_BY_ID.set(n.id, n);
  PARENT_OF.set(n.id, parent);
  n.children.forEach((c) => index(c, n.id));
})(TREE, null);

// ---------------------------------------------------------------- layout
const SLOT = 3.6; // horizontal world units per leaf
const ROW = 5; // vertical gap per depth (mode A)
const ROW_B = 3.4; // vertical gap between stacked children (mode B)
const FOV = 50;

interface Pos {
  x: number;
  y: number;
  node: DemoNode;
}
interface Edge {
  from: string;
  to: string;
}
interface Layout {
  positions: Map<string, Pos>;
  edges: Edge[];
}

function layoutA(root: DemoNode, expanded: Set<string>): Layout {
  const positions = new Map<string, Pos>();
  const edges: Edge[] = [];
  let leaf = 0;
  const visit = (n: DemoNode, depth: number): number => {
    const kids = expanded.has(n.id) ? n.children : [];
    let x: number;
    if (kids.length === 0) {
      x = leaf * SLOT;
      leaf += 1;
    } else {
      const xs = kids.map((k) => {
        const cx = visit(k, depth + 1);
        edges.push({ from: n.id, to: k.id });
        return cx;
      });
      x = (xs[0] + xs[xs.length - 1]) / 2;
    }
    positions.set(n.id, { x, y: -depth * ROW, node: n });
    return x;
  };
  visit(root, 0);
  // center horizontally on 0
  const xs = [...positions.values()].map((p) => p.x);
  const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
  positions.forEach((p) => {
    p.x -= mid;
  });
  return { positions, edges };
}

function layoutB(rootId: string): Layout {
  const root = NODE_BY_ID.get(rootId)!;
  const positions = new Map<string, Pos>();
  const edges: Edge[] = [];
  positions.set(root.id, { x: 0, y: 0, node: root });
  root.children.forEach((c, i) => {
    positions.set(c.id, { x: 0, y: -(i + 1) * ROW_B, node: c });
    edges.push({ from: root.id, to: c.id });
  });
  return { positions, edges };
}

// ---------------------------------------------------------------- camera rig
interface FocusTarget {
  center: [number, number, number];
  distance: number;
}

function CameraRig({
  focus,
  controlsRef,
}: {
  focus: FocusTarget | null;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  const { camera, invalidate } = useThree();
  const targetLook = useMemo(() => new THREE.Vector3(), []);
  const targetCam = useMemo(() => new THREE.Vector3(), []);
  const animating = useRef(false);

  useEffect(() => {
    if (!focus) return;
    const [x, y, z] = focus.center;
    targetLook.set(x, y, z);
    targetCam.set(x, y + focus.distance * 0.18, z + focus.distance);
    animating.current = true;
    invalidate();
  }, [focus, targetLook, targetCam, invalidate]);

  useFrame((_, dt) => {
    if (!animating.current) return;
    const k = Math.min(1, dt * 4.5);
    camera.position.lerp(targetCam, k);
    if (controlsRef.current) {
      controlsRef.current.target.lerp(targetLook, k);
      controlsRef.current.update();
    }
    const camDist = camera.position.distanceTo(targetCam);
    const lookDist = controlsRef.current
      ? controlsRef.current.target.distanceTo(targetLook)
      : 0;
    const threshold = Math.max(0.4, targetCam.length() * 0.01);
    if (camDist < threshold && lookDist < threshold) {
      animating.current = false;
    } else {
      invalidate();
    }
  });

  return null;
}

// ---------------------------------------------------------------- node card
function NodeCard({
  pos,
  mode,
  expanded,
  onChevron,
  onRecenter,
  onDrill,
}: {
  pos: Pos;
  mode: 'A' | 'B';
  expanded: boolean;
  onChevron: () => void;
  onRecenter: () => void;
  onDrill: () => void;
}) {
  const { node } = pos;
  const hex = ROLE_HEX[node.role];
  const hasChildren = node.children.length > 0;
  const width = mode === 'B' ? 196 : 150;

  return (
    <group position={[pos.x, pos.y, 0]}>
      {/* platform */}
      <mesh position={[0, -0.12, 0]}>
        <boxGeometry args={[2.2, 0.28, 1.3]} />
        <meshStandardMaterial
          color={hex}
          emissive={hex}
          emissiveIntensity={0.45}
          metalness={0.6}
          roughness={0.35}
        />
      </mesh>
      <mesh position={[0, 0.04, 0]}>
        <boxGeometry args={[2.45, 0.05, 1.55]} />
        <meshBasicMaterial color={hex} transparent opacity={0.55} />
      </mesh>

      <Html position={[0, -1.05, 0]} center zIndexRange={[40, 0]} style={{ width, pointerEvents: 'auto' }}>
        <div
          className="rounded-lg border border-white/15 bg-[#0b1230]/95 backdrop-blur px-2.5 py-2 text-left shadow-xl"
          style={{ borderTopColor: hex, borderTopWidth: 3 }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (mode === 'B') {
                if (hasChildren) onDrill();
                return;
              }
              // mode A: chevron region toggles expand; otherwise recenter
              if (hasChildren) onChevron();
              else onRecenter();
            }}
            className="flex w-full items-center gap-1.5 text-left"
            style={{ minHeight: 40, cursor: 'pointer' }}
          >
            {hasChildren && mode === 'A' && (
              <span
                className="text-white/60 text-sm leading-none transition-transform"
                style={{ transform: expanded ? 'rotate(90deg)' : 'none' }}
              >
                ▶
              </span>
            )}
            <span className="flex-1 min-w-0">
              <span className="block truncate text-[13px] font-bold text-white">{node.name}</span>
              <span className="block text-[10px]" style={{ color: hex }}>
                {ROLE_LABEL[node.role]}
              </span>
            </span>
            {mode === 'B' && hasChildren && (
              <span className="text-white/50 text-base leading-none">›</span>
            )}
          </button>
        </div>
      </Html>
    </group>
  );
}

// ---------------------------------------------------------------- scene
interface SceneProps {
  mode: 'A' | 'B';
  expanded: Set<string>;
  focusRootId: string;
  focusReq: { kind: 'subtree' | 'tight' | 'fit' | 'drill'; id: string | null; seq: number };
  onToggleA: (id: string) => void;
  onDrillB: (id: string) => void;
  setHint: (s: string | null) => void;
}

function Scene({ mode, expanded, focusRootId, focusReq, onToggleA, onDrillB, setHint }: SceneProps) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const { size } = useThree();
  const [focus, setFocus] = useState<FocusTarget | null>(null);

  const layout = useMemo<Layout>(
    () => (mode === 'A' ? layoutA(TREE, expanded) : layoutB(focusRootId)),
    [mode, expanded, focusRootId],
  );

  const aspect = size.height > 0 ? size.width / size.height : 0.5;
  const tanHalf = Math.tan((FOV * Math.PI) / 180 / 2);

  // distance that keeps adjacent leaf cards from overlapping (px-aware)
  const cap = useMemo(() => {
    const cardPx = 160;
    return (SLOT * size.height) / (cardPx * 2 * tanHalf) * 0.95;
  }, [size.height, tanHalf]);

  const bboxOf = useCallback(
    (ids: string[]) => {
      const ps = ids.map((id) => layout.positions.get(id)).filter(Boolean) as Pos[];
      if (ps.length === 0) return null;
      const xs = ps.map((p) => p.x);
      const ys = ps.map((p) => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY };
    },
    [layout],
  );

  const fitDist = useCallback(
    (w: number, h: number, pad = 2.5) => {
      const fitH = (h / 2 + pad) / tanHalf;
      const fitW = (w / 2 + pad) / (tanHalf * aspect);
      return Math.max(fitH, fitW, 6);
    },
    [tanHalf, aspect],
  );

  const visibleDescendants = useCallback(
    (id: string): string[] => {
      const out: string[] = [];
      const walk = (n: DemoNode) => {
        if (!layout.positions.has(n.id)) return;
        out.push(n.id);
        if (expanded.has(n.id)) n.children.forEach(walk);
      };
      const root = NODE_BY_ID.get(id);
      if (root) walk(root);
      return out;
    },
    [layout, expanded],
  );

  // react to focus requests (computed against the CURRENT layout)
  useEffect(() => {
    if (focusReq.seq === 0) return;
    if (mode === 'A') {
      if (focusReq.kind === 'tight' && focusReq.id) {
        const p = layout.positions.get(focusReq.id);
        if (p) setFocus({ center: [p.x, p.y - 1, 0], distance: 8 });
        setHint(null);
        return;
      }
      if (focusReq.kind === 'subtree' && focusReq.id) {
        const ids = visibleDescendants(focusReq.id);
        const bb = bboxOf(ids);
        if (!bb) return;
        let dist = fitDist(bb.w, bb.h);
        if (dist > cap) {
          // too wide/tall to show legibly — frame node + its direct children
          const node = NODE_BY_ID.get(focusReq.id)!;
          const near = [focusReq.id, ...node.children.map((c) => c.id)].filter((i) =>
            layout.positions.has(i),
          );
          const bb2 = bboxOf(near) ?? bb;
          dist = Math.min(cap, fitDist(bb2.w, bb2.h));
          setFocus({ center: [bb2.cx, bb2.cy - 1.2, 0], distance: dist });
          setHint('Group too wide to fit — pan & pinch to explore →');
        } else {
          setFocus({ center: [bb.cx, bb.cy - 1.2, 0], distance: dist });
          setHint(null);
        }
        return;
      }
      if (focusReq.kind === 'fit') {
        const bb = bboxOf([...layout.positions.keys()]);
        if (bb) setFocus({ center: [bb.cx, bb.cy - 1, 0], distance: Math.min(42, fitDist(bb.w, bb.h)) });
        setHint(null);
        return;
      }
    } else {
      // mode B — fixed comfortable distance centered just below the focus root
      const root = layout.positions.get(focusRootId);
      if (root) {
        setFocus({ center: [0, root.y - ROW_B * 1.15, 0], distance: 13 });
      }
      setHint(null);
    }
  }, [focusReq, mode, focusRootId, layout, bboxOf, fitDist, cap, visibleDescendants, setHint]);

  return (
    <>
      <ambientLight intensity={0.3} color="#8ab4ff" />
      <directionalLight position={[8, 14, 10]} intensity={0.8} color="#b8ccff" />
      <pointLight position={[0, 18, 8]} intensity={0.9} color="#3b5bff" distance={90} decay={1.6} />
      <Stars radius={120} depth={60} count={900} factor={3} saturation={0} fade speed={0.25} />
      <fog attach="fog" args={['#05091f', 26, 90]} />

      {layout.edges.map((e, i) => {
        const a = layout.positions.get(e.from);
        const b = layout.positions.get(e.to);
        if (!a || !b) return null;
        const color = ROLE_HEX[a.node.role];
        return (
          <Line
            key={`${e.from}-${e.to}-${i}`}
            points={[
              [a.x, a.y - 1.6, 0],
              [(a.x + b.x) / 2, (a.y - 1.6 + b.y + 0.2) / 2, 0],
              [b.x, b.y + 0.2, 0],
            ]}
            color={color}
            lineWidth={1.5}
            transparent
            opacity={0.5}
          />
        );
      })}

      {[...layout.positions.values()].map((p) => (
        <NodeCard
          key={p.node.id}
          pos={p}
          mode={mode}
          expanded={expanded.has(p.node.id)}
          onChevron={() => onToggleA(p.node.id)}
          onRecenter={() => onToggleA(p.node.id)}
          onDrill={() => onDrillB(p.node.id)}
        />
      ))}

      <OrbitControls
        ref={controlsRef}
        enablePan
        enableZoom
        enableRotate={false}
        screenSpacePanning
        makeDefault
        minDistance={4}
        maxDistance={60}
        touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN }}
        mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
      />
      <CameraRig focus={focus} controlsRef={controlsRef} />
    </>
  );
}

// ---------------------------------------------------------------- page
export default function TreeDemoPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [mode, setMode] = useState<'A' | 'B'>('A');
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['joseph']));
  const [focusRootId, setFocusRootId] = useState('joseph');
  const [crumbs, setCrumbs] = useState<string[]>(['joseph']);
  const [hint, setHint] = useState<string | null>(null);
  const [focusReq, setFocusReq] = useState<SceneProps['focusReq']>({ kind: 'fit', id: null, seq: 0 });
  const seq = useRef(0);
  const nextSeq = () => {
    seq.current += 1;
    return seq.current;
  };

  const toggleA = useCallback(
    (id: string) => {
      const node = NODE_BY_ID.get(id);
      if (!node || node.children.length === 0) {
        setFocusReq({ kind: 'tight', id, seq: nextSeq() });
        return;
      }
      const willExpand = !expanded.has(id);
      setExpanded((prev) => {
        const next = new Set(prev);
        if (willExpand) next.add(id);
        else next.delete(id);
        return next;
      });
      setFocusReq({ kind: willExpand ? 'subtree' : 'tight', id, seq: nextSeq() });
    },
    [expanded],
  );

  const drillB = useCallback((id: string) => {
    const node = NODE_BY_ID.get(id);
    if (!node || node.children.length === 0) return;
    setFocusRootId(id);
    setCrumbs((prev) => (prev.includes(id) ? prev.slice(0, prev.indexOf(id) + 1) : [...prev, id]));
    setFocusReq({ kind: 'drill', id, seq: nextSeq() });
  }, []);

  const goToCrumb = useCallback((id: string) => {
    setFocusRootId(id);
    setCrumbs((prev) => prev.slice(0, prev.indexOf(id) + 1));
    setFocusReq({ kind: 'drill', id, seq: nextSeq() });
  }, []);

  const switchMode = useCallback((m: 'A' | 'B') => {
    setMode(m);
    setHint(null);
    if (m === 'A') {
      setExpanded(new Set(['joseph']));
      setFocusReq({ kind: 'fit', id: null, seq: nextSeq() });
    } else {
      setFocusRootId('joseph');
      setCrumbs(['joseph']);
      setFocusReq({ kind: 'drill', id: 'joseph', seq: nextSeq() });
    }
  }, []);

  const reset = useCallback(() => {
    if (mode === 'A') setFocusReq({ kind: 'fit', id: null, seq: nextSeq() });
    else setFocusReq({ kind: 'drill', id: focusRootId, seq: nextSeq() });
  }, [mode, focusRootId]);

  // initial fit once the canvas has mounted + sized
  useEffect(() => {
    if (!mounted) return;
    const t = setTimeout(() => setFocusReq({ kind: 'fit', id: null, seq: nextSeq() }), 120);
    return () => clearTimeout(t);
  }, [mounted]);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#05091f] text-white select-none">
      {mounted && (
        <Canvas
          camera={{ position: [0, 1.5, 16], fov: FOV, near: 0.1, far: 2000 }}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          dpr={[1, 1.5]}
          frameloop="demand"
        >
          <Scene
            mode={mode}
            expanded={expanded}
            focusRootId={focusRootId}
            focusReq={focusReq}
            onToggleA={toggleA}
            onDrillB={drillB}
            setHint={setHint}
          />
        </Canvas>
      )}

      {/* ---- top overlay: title + mode toggle ---- */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-2 p-3"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <div className="pointer-events-auto mx-auto flex w-full max-w-md flex-col gap-2 rounded-xl border border-white/10 bg-black/55 p-2 backdrop-blur">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-semibold tracking-wide text-white/70">
              Tree3D · mobile UX demo
            </span>
            <button
              type="button"
              onClick={reset}
              className="rounded-md bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/90 active:bg-white/20"
              style={{ minHeight: 32 }}
            >
              Reset view
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-white/5 p-1">
            {(['A', 'B'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={`rounded-md px-2 py-2 text-[12px] font-semibold transition-colors ${
                  mode === m ? 'bg-indigo-500 text-white' : 'text-white/70 active:bg-white/10'
                }`}
                style={{ minHeight: 44 }}
              >
                {m === 'A' ? 'A · Smart-Fit' : 'B · Drill-Down'}
              </button>
            ))}
          </div>

          {/* breadcrumb for mode B */}
          {mode === 'B' && (
            <div className="flex flex-wrap items-center gap-1 px-1 text-[12px]">
              {crumbs.map((id, i) => (
                <span key={id} className="flex items-center gap-1">
                  {i > 0 && <span className="text-white/30">›</span>}
                  <button
                    type="button"
                    onClick={() => goToCrumb(id)}
                    className={`rounded px-1.5 py-0.5 ${
                      i === crumbs.length - 1
                        ? 'font-bold text-white'
                        : 'text-indigo-300 active:bg-white/10'
                    }`}
                    style={{ minHeight: 32 }}
                  >
                    {NODE_BY_ID.get(id)?.name}
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ---- bottom overlay: explainer + hint ---- */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-3"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        {hint && mode === 'A' && (
          <div className="rounded-full bg-amber-500/90 px-3 py-1.5 text-[12px] font-medium text-black shadow-lg">
            {hint}
          </div>
        )}
        <div className="mx-auto max-w-md rounded-xl border border-white/10 bg-black/55 px-3 py-2 text-center text-[12px] leading-snug text-white/80 backdrop-blur">
          {mode === 'A' ? (
            <>
              <b className="text-white">Smart-Fit.</b> Tap a leader to expand &amp; fly-to-fit its
              group. Zoom-out is capped so text stays readable — if a group is too wide, it frames the
              parent + children and you <b className="text-white">drag to pan, pinch to zoom</b>.
            </>
          ) : (
            <>
              <b className="text-white">Drill-Down.</b> Tap a leader (↳) to focus just them + their
              direct reports, stacked vertically. Use the <b className="text-white">breadcrumb</b> up
              top to step back. Drag to scroll.
            </>
          )}
        </div>
      </div>
    </div>
  );
}
