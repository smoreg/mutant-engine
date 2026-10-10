/**
 * The body in motion: `pose(body, layout, t, seed)` is where every node and
 * segment is at second `t`. Forward kinematics over the tree the placement
 * implies, from your brain outward: a bridge turns about the node it hangs
 * from by an angle that swings with time, its children follow; a cycle block
 * moves as one rigid piece about its entry, so nothing in a ring or a wing
 * ever stretches. Tentacles carry a travelling wave along their length,
 * renormalised to their rest length. Legs step by the stands `derive` finds,
 * arms swing against them, a body without stands crawls with a wave down its
 * axis, a wing block flaps when the body flies, torsos breathe, eyes blink
 * and glance. Amplitudes and phases come from the seed alone: the same body,
 * seed and moment always give the same pose. Nothing walks out of the frame.
 */
import { derive, flankHost, membraneNodes, nodeIds, otherEnd, segmentIds, sortedIds, torsoNodes, wingSpan, type Body, type SegmentKind } from "@mutant-engine/core";
import { blocks, membraneShape, placementParents, polylineLength, type Box, type Layout, type Point } from "./layout.js";

interface PoseNode {
  x: number;
  y: number;
  /** Accumulated rotation of the chain at the node, radians. */
  angle: number;
}

interface Eye {
  /** 0 open, 1 shut. */
  blink: number;
  /** Where the pupils look, each axis in -1..1. */
  gaze: Point;
}

export interface Pose {
  t: number;
  nodes: Record<number, PoseNode>;
  /** Spine of every segment, from its `a` node to its `b` node, in layout units. */
  segments: Record<number, Point[]>;
  membranes: { id: number; polygon: Point[] }[];
  /** Blink and gaze per node that looks. */
  eyes: Record<number, Eye>;
  /** The chest's pulse, -1..1. */
  breathe: number;
  /** Tremor: a small offset per node that shakes, in layout units. */
  jitter: Record<number, Point>;
}

interface Motion {
  /** Swing about the parent node, radians. */
  amp: number;
  freq: number;
  phase: number;
  /** Lateral wave along the segment, in units at the tip; 0 for none. */
  wave: number;
  waveFreq: number;
  wavePhase: number;
  /** Shake of the far node, units; 0 for none. */
  jitter: number;
}

interface RigNode {
  id: number;
  rest: Point;
  parentSeg: number | null;
  parentNode: number | null;
  /** Index into `blocks` when the node is placed by a rigid block; -1 when its parent segment is a bridge or it is a root. */
  block: number;
  eyes: boolean;
  blinkPeriod: number;
  blinkOffset: number;
  gazeJitter: boolean;
}

interface RigSegment {
  id: number;
  kind: SegmentKind;
  a: number;
  b: number;
  /** Rest polyline from the root-side node to the far node. */
  rest: Point[];
  /** `rest[0]` sits at node `a`. */
  aFirst: boolean;
  tree: boolean;
  block: number;
  motion: Motion;
}

interface RigBlock {
  entry: number;
  nodes: number[];
  segments: number[];
  amp: number;
  freq: number;
  phase: number;
}

export interface Rig {
  body: Body;
  layout: Layout;
  seed: number;
  order: number[];
  nodes: Record<number, RigNode>;
  segments: Record<number, RigSegment>;
  blocks: RigBlock[];
  membranes: { id: number; nodes: number[]; span: boolean }[];
  breatheFreq: number;
  breathePhase: number;
}

const TAU = Math.PI * 2;

/** A number in [0, 1) from the seed and two salts: the same inputs always give the same value. */
export function noise(seed: number, a: number, b: number): number {
  let x = (Math.imul(seed | 0, 374761393) + Math.imul(a | 0, 668265263) + Math.imul(b | 0, 2246822519)) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  x = x ^ (x >>> 16);
  return (x >>> 0) / 4294967296;
}

function rotate(p: Point, angle: number): Point {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

/** The polyline resampled into `n` points evenly spaced by arc length; the ends stay. */
function resample(points: Point[], n: number): Point[] {
  const total = polylineLength(points);
  if (points.length < 2 || total < 1e-12 || n < 3) return points.slice();
  const out: Point[] = [points[0]!];
  let i = 1;
  let acc = 0;
  for (let k = 1; k < n - 1; k++) {
    const want = (total * k) / (n - 1);
    while (i < points.length - 1 && acc + Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y) < want) {
      acc += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
      i += 1;
    }
    const a = points[i - 1]!;
    const b = points[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const f = len < 1e-12 ? 0 : (want - acc) / len;
    out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
  }
  out.push(points[points.length - 1]!);
  return out;
}

const SHAKERS = new Set(["tremor", "seizures", "tremble"]);
const EYE_SHAKERS = new Set(["paranoia", "abyssCall", "nerveStorm"]);

function hasEyes(body: Body, id: number): boolean {
  for (const e of body.nodes[id]!.ends) {
    if (e.kind === "eye") return true;
    if (e.contents?.some((c) => c.kind === "eye" || c.kind === "facetEye" || c.kind === "heatEye")) return true;
  }
  return false;
}

/** Tempo of the gait in steps per second: a human at 100 walks at about 1.3. */
function tempo(speed: number): number {
  return Math.min(2.2, Math.max(0.45, 0.5 + speed / 125));
}

export function rig(body: Body, layout: Layout, seed: number): Rig {
  const index = new Map(layout.order.map((id, i) => [id, i]));
  const parents = placementParents(body, layout);
  const at = new Map(layout.nodes.map((n) => [n.id, n]));
  const blockList = blocks(body).filter((b) => b.length > 1);
  const blockOfSeg = new Map<number, number>();
  const rigBlocks: RigBlock[] = blockList.map((segs, bi) => {
    const ns = new Set<number>();
    for (const sid of segs) {
      blockOfSeg.set(sid, bi);
      ns.add(body.segments[sid]!.a);
      ns.add(body.segments[sid]!.b);
    }
    const nodes = [...ns].sort((x, y) => (index.get(x) ?? Infinity) - (index.get(y) ?? Infinity));
    return { entry: nodes[0]!, nodes, segments: segs, amp: 0.05, freq: 0.5, phase: TAU * noise(seed, 900 + bi, 1) };
  });
  const d = derive(body);
  const beat = tempo(d.speed.value);

  // Wing blocks flap while the body flies; every other ring sways a little.
  const wingSegs = new Set<number>();
  for (const w of d.locomotion.wings) for (const sid of body.membranes[w.membrane]?.cycle ?? []) wingSegs.add(sid);
  rigBlocks.forEach((b, bi) => {
    if (d.locomotion.fly && b.segments.some((sid) => wingSegs.has(sid))) {
      b.amp = 0.3;
      b.freq = 2;
      b.phase = TAU * noise(seed, 950, bi);
    }
  });

  // Where each node hangs from, and whether a rigid block places it.
  const nodes: Record<number, RigNode> = {};
  const shakeNodes = new Set<number>();
  let gazeShake = false;
  for (const id of segmentIds(body)) {
    const s = body.segments[id]!;
    if (s.growths.some((o) => SHAKERS.has(o.kind))) shakeNodes.add(s.b);
    if (s.growths.some((o) => SHAKERS.has(o.kind))) shakeNodes.add(s.a);
    for (const o of [...s.cavity, ...s.growths]) if (EYE_SHAKERS.has(o.kind)) gazeShake = true;
  }
  for (const id of nodeIds(body)) for (const e of body.nodes[id]!.ends) for (const c of e.contents ?? []) if (EYE_SHAKERS.has(c.kind)) gazeShake = true;
  for (const id of nodeIds(body)) {
    const n = at.get(id)!;
    const parentSeg = parents.get(id) ?? null;
    const parentNode = parentSeg === null ? null : otherEnd(body.segments[parentSeg]!, id);
    const bi = parentSeg === null ? undefined : blockOfSeg.get(parentSeg);
    nodes[id] = {
      id,
      rest: { x: n.x, y: n.y },
      parentSeg,
      parentNode,
      block: bi === undefined ? -1 : bi,
      eyes: hasEyes(body, id),
      blinkPeriod: 2.4 + 2.8 * noise(seed, id, 11),
      blinkOffset: 5 * noise(seed, id, 12),
      gazeJitter: gazeShake,
    };
  }

  // Legs: the chain of tree segments from every stand up to the first torso node.
  const isTorsoNode = new Set<number>(torsoNodes(body));
  const standNodes = [...new Set(d.speed.stands.map((s) => s.node))].sort((x, y) => at.get(x)!.x - at.get(y)!.x || x - y);
  const legOf = new Map<number, { phase: number; step: number }>();
  standNodes.forEach((node, i) => {
    const phase = (TAU * i) / standNodes.length;
    let n = node;
    let step = 0;
    for (;;) {
      const rn = nodes[n]!;
      if (rn.parentSeg === null || rn.block >= 0 || isTorsoNode.has(n)) break;
      if (!legOf.has(rn.parentSeg)) legOf.set(rn.parentSeg, { phase, step });
      step += 1;
      n = rn.parentNode!;
    }
  });
  const crawl = standNodes.length === 0;

  // Torso index along the axis, for the crawling wave.
  const torsoIndex = new Map<number, number>();
  {
    let k = 0;
    for (const id of layout.order) {
      const p = parents.get(id);
      if (p !== undefined && body.segments[p]!.kind === "torso") torsoIndex.set(p, k++);
    }
  }

  const segments: Record<number, RigSegment> = {};
  for (const id of segmentIds(body)) {
    const s = body.segments[id]!;
    const drawn = layout.segments.find((x) => x.id === id)!;
    const aFirst = (index.get(s.a) ?? Infinity) <= (index.get(s.b) ?? Infinity);
    const rest = aFirst ? drawn.points.slice() : [...drawn.points].reverse();
    // A torso is drawn a half-width short of its nodes, but it swings from node to node: its bone ends on them,
    // or the pose would pull everything past it in by the torso's width (decision 1259).
    if (s.kind === "torso" && rest.length >= 2) {
      rest[0] = { ...at.get(aFirst ? s.a : s.b)! };
      rest[rest.length - 1] = { ...at.get(aFirst ? s.b : s.a)! };
    }
    const bi = blockOfSeg.get(id);
    const far = aFirst ? s.b : s.a;
    const near = aFirst ? s.a : s.b;
    const leg = legOf.get(id);
    const r1 = noise(seed, id, 1);
    const r2 = noise(seed, id, 2);
    const r3 = noise(seed, id, 3);
    const left = at.get(far)!.x < at.get(near)!.x - 1e-9;
    const motion: Motion = { amp: 0, freq: 0.5, phase: TAU * r1, wave: 0, waveFreq: 0.8, wavePhase: TAU * r2, jitter: 0 };
    if (bi === undefined) {
      if (leg !== undefined) {
        motion.amp = leg.step === 0 ? 0.2 : 0.12;
        motion.freq = beat;
        motion.phase = leg.phase + (leg.step === 0 ? 0 : Math.PI / 2);
      } else {
        switch (s.kind) {
          case "arm":
            motion.amp = 0.14 * (0.8 + 0.4 * r3);
            motion.freq = beat;
            motion.phase = left ? Math.PI : 0;
            break;
          case "tentacle":
            motion.amp = 0.1 * (0.7 + 0.6 * r3);
            motion.freq = 0.5 * (0.8 + 0.4 * r1);
            motion.wave = 0.09 * polylineLength(rest);
            motion.waveFreq = 0.7 * (0.8 + 0.4 * r2);
            break;
          case "tail":
            motion.amp = 0.18 * (0.8 + 0.4 * r3);
            motion.freq = 1.0 * (0.8 + 0.4 * r1);
            motion.wave = 0.05 * polylineLength(rest);
            motion.waveFreq = 1.0;
            break;
          case "neck":
            motion.amp = 0.06;
            motion.freq = 0.45 * (0.8 + 0.4 * r1);
            break;
          case "torso":
            if (crawl) {
              motion.amp = 0.13;
              motion.freq = 0.7;
              motion.phase = -1.1 * (torsoIndex.get(id) ?? 0);
            } else {
              motion.amp = 0.025;
              motion.freq = beat;
              motion.phase = Math.PI / 2;
            }
            break;
          case "stalk":
            motion.amp = 0.14 * (0.8 + 0.4 * r3);
            motion.freq = 0.5 * (0.8 + 0.4 * r1);
            break;
          case "growth":
            motion.amp = 0.04;
            motion.freq = 0.3;
            break;
          case "leg":
            motion.amp = 0.08;
            motion.freq = beat;
            motion.phase = left ? 0 : Math.PI;
            break;
        }
      }
      if (shakeNodes.has(far)) motion.jitter = 0.05;
    }
    const wavy = bi === undefined && motion.wave > 0;
    segments[id] = {
      id,
      kind: s.kind,
      a: s.a,
      b: s.b,
      rest: wavy ? resample(rest, Math.max(5, Math.round(polylineLength(rest) * 5) + 1)) : rest,
      aFirst,
      tree: bi === undefined,
      block: bi === undefined ? -1 : bi,
      motion,
    };
  }

  const membranes: { id: number; nodes: number[]; span: boolean }[] = [];
  for (const id of sortedIds(body.membranes)) {
    const ns = membraneNodes(body, body.membranes[id]!);
    if (ns !== null) membranes.push({ id, nodes: ns, span: wingSpan(body, body.membranes[id]!) !== null });
  }

  const out: Rig = {
    body,
    layout,
    seed,
    order: layout.order,
    nodes,
    segments,
    blocks: rigBlocks,
    membranes,
    breatheFreq: 0.28,
    breathePhase: TAU * noise(seed, 1, 99),
  };
  fitFrame(out);
  return out;
}

/**
 * How far a node can ever leave its rest position: every swing up the chain
 * moves it by at most the angle times the distance to that pivot, a wave by
 * its amplitude (and a little more for the renormalisation), a tremor by its
 * shake. A true bound, so no sampling can miss a peak.
 */
function excursionBound(r: Rig, id: number): number {
  const rest = r.nodes[id]!.rest;
  let acc = 0;
  let n = id;
  for (let guard = 0; guard < 10_000; guard++) {
    const rn = r.nodes[n]!;
    if (rn.parentSeg === null || rn.parentNode === null) break;
    if (rn.block >= 0) {
      const b = r.blocks[rn.block]!;
      const e = r.nodes[b.entry]!.rest;
      acc += b.amp * Math.hypot(rest.x - e.x, rest.y - e.y);
      n = b.entry;
      continue;
    }
    const m = r.segments[rn.parentSeg]!.motion;
    const p = r.nodes[rn.parentNode]!.rest;
    acc += m.amp * Math.hypot(rest.x - p.x, rest.y - p.y) + 1.5 * m.wave + m.jitter;
    n = rn.parentNode;
  }
  return acc;
}

/** Scales every swing down so that no node can leave the frame of the layout by more than a tenth of its larger side. */
function fitFrame(r: Rig): void {
  const box = r.layout.bbox;
  const slack = 0.1 * Math.max(box.x1 - box.x0, box.y1 - box.y0) * 0.95;
  let f = 1;
  for (const n of Object.values(r.nodes)) {
    const bound = excursionBound(r, n.id);
    if (bound <= 1e-12) continue;
    const room = slack + Math.max(0, Math.min(n.rest.x - box.x0, box.x1 - n.rest.x, n.rest.y - box.y0, box.y1 - n.rest.y));
    f = Math.min(f, room / bound);
  }
  if (f >= 1) return;
  for (const s of Object.values(r.segments)) {
    s.motion.amp *= f;
    s.motion.wave *= f;
    s.motion.jitter *= f;
  }
  for (const b of r.blocks) b.amp *= f;
}

/**
 * The angle the host of a side node has turned by at second `t`, when the
 * side node hangs from the host's first end in the pose; undefined when it
 * hangs from the far end, whose own angle already is the host's.
 */
function hostAngle(r: Rig, flank: number, from: number, nodes: Record<number, PoseNode>, t: number): number | undefined {
  const host = flankHost(r.body, flank);
  const h = host === undefined ? undefined : r.segments[host];
  if (h === undefined || !h.tree) return undefined;
  const near = h.aFirst ? h.a : h.b;
  if (from !== near || nodes[near] === undefined) return undefined;
  const m = h.motion;
  return nodes[near]!.angle + m.amp * Math.sin(TAU * m.freq * t + m.phase);
}

/** The pose at second `t`. */
export function poseOf(r: Rig, t: number): Pose {
  const nodes: Record<number, PoseNode> = {};
  const segments: Record<number, Point[]> = {};
  const jitter: Record<number, Point> = {};
  const blockAngle = new Map<number, number>();
  for (const id of r.order) {
    const n = r.nodes[id]!;
    if (n.parentSeg === null || n.parentNode === null) {
      nodes[id] = { x: n.rest.x, y: n.rest.y, angle: 0 };
      continue;
    }
    const parent = nodes[n.parentNode]!;
    if (n.block >= 0) {
      const b = r.blocks[n.block]!;
      let angle = blockAngle.get(n.block);
      if (angle === undefined) {
        const entry = nodes[b.entry]!;
        angle = entry.angle + b.amp * Math.sin(TAU * b.freq * t + b.phase);
        blockAngle.set(n.block, angle);
      }
      const entry = nodes[b.entry]!;
      const restEntry = r.nodes[b.entry]!.rest;
      const v = rotate({ x: n.rest.x - restEntry.x, y: n.rest.y - restEntry.y }, angle);
      nodes[id] = { x: entry.x + v.x, y: entry.y + v.y, angle };
      continue;
    }
    const s = r.segments[n.parentSeg]!;
    const m = s.motion;
    // A side node turns with the body it sits on, not with the node its flank hangs from: the torso sways
    // about its first end, and a shoulder at that end goes with the torso's wall (decision 1259).
    const angle = (s.kind === "flank" ? hostAngle(r, n.parentSeg, n.parentNode, nodes, t) : undefined) ?? parent.angle + m.amp * Math.sin(TAU * m.freq * t + m.phase);
    const restParent = r.nodes[n.parentNode]!.rest;
    const pts = s.rest.map((p) => {
      const v = rotate({ x: p.x - restParent.x, y: p.y - restParent.y }, angle);
      return { x: parent.x + v.x, y: parent.y + v.y };
    });
    if (m.wave > 0 && pts.length >= 3) {
      const total = polylineLength(pts);
      let acc = 0;
      const waved: Point[] = [pts[0]!];
      for (let i = 1; i < pts.length; i++) {
        acc += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
        const f = total < 1e-12 ? 0 : acc / total;
        const dx = pts[i]!.x - pts[i - 1]!.x;
        const dy = pts[i]!.y - pts[i - 1]!.y;
        const len = Math.hypot(dx, dy) || 1;
        const off = m.wave * f * Math.sin(TAU * m.waveFreq * t - TAU * f + m.wavePhase);
        waved.push({ x: pts[i]!.x - (dy / len) * off, y: pts[i]!.y + (dx / len) * off });
      }
      const got = polylineLength(waved);
      const k = got < 1e-12 ? 1 : total / got;
      const o = waved[0]!;
      for (let i = 0; i < waved.length; i++) {
        waved[i] = { x: o.x + (waved[i]!.x - o.x) * k, y: o.y + (waved[i]!.y - o.y) * k };
        pts[i] = waved[i]!;
      }
    }
    if (m.jitter > 0) {
      // Nine shakes a second, each a fresh offset from the seed: a tremor, not a swing.
      const q = Math.floor(t * 9);
      const j = { x: m.jitter * (2 * noise(r.seed, id, 500 + q) - 1), y: m.jitter * (2 * noise(r.seed, id, 700 + q) - 1) };
      jitter[id] = j;
      for (let i = 1; i < pts.length; i++) {
        const f = i / (pts.length - 1);
        pts[i] = { x: pts[i]!.x + j.x * f, y: pts[i]!.y + j.y * f };
      }
    }
    segments[n.parentSeg] = s.aFirst ? pts : [...pts].reverse();
    nodes[id] = { x: pts[pts.length - 1]!.x, y: pts[pts.length - 1]!.y, angle };
  }
  // Segments of rigid blocks: their rest polylines under the block's transform.
  for (const b of r.blocks) {
    const entry = nodes[b.entry]!;
    const restEntry = r.nodes[b.entry]!.rest;
    const angle = blockAngle.get(r.blocks.indexOf(b)) ?? entry.angle;
    for (const sid of b.segments) {
      const s = r.segments[sid]!;
      const pts = s.rest.map((p) => {
        const v = rotate({ x: p.x - restEntry.x, y: p.y - restEntry.y }, angle);
        return { x: entry.x + v.x, y: entry.y + v.y };
      });
      segments[sid] = s.aFirst ? pts : [...pts].reverse();
    }
  }
  // A bridge between two roots of one component never happens; a bridge whose far node was a root is a segment of no parent.
  for (const sid of Object.keys(r.segments).map(Number)) {
    if (segments[sid] !== undefined) continue;
    const s = r.segments[sid]!;
    segments[sid] = s.aFirst ? s.rest.slice() : [...s.rest].reverse();
  }
  const centre = { x: 0, y: 0 };
  for (const id of Object.keys(nodes)) {
    centre.x += nodes[Number(id)]!.x / Object.keys(nodes).length;
    centre.y += nodes[Number(id)]!.y / Object.keys(nodes).length;
  }
  const membranes = r.membranes.map((m) => ({ id: m.id, polygon: membraneShape(m.nodes.map((id) => ({ x: nodes[id]!.x, y: nodes[id]!.y })), m.span, centre) }));
  const eyes: Record<number, Eye> = {};
  for (const n of Object.values(r.nodes)) {
    if (!n.eyes) continue;
    const phase = ((t + n.blinkOffset) % n.blinkPeriod) / n.blinkPeriod;
    const blink = phase < 0.05 ? 1 : 0;
    const slot = Math.floor((t + n.blinkOffset) / (n.gazeJitter ? 0.25 : 1.6));
    const gaze = { x: 2 * noise(r.seed, n.id, 300 + slot) - 1, y: 2 * noise(r.seed, n.id, 400 + slot) - 1 };
    eyes[n.id] = { blink, gaze };
  }
  return { t, nodes, segments, membranes, eyes, breathe: Math.sin(TAU * r.breatheFreq * t + r.breathePhase), jitter };
}

export function pose(body: Body, layout: Layout, t: number, seed: number): Pose {
  return poseOf(rig(body, layout, seed), t);
}

/** The box around every node and spine point of the pose, without widths. */
export function poseBox(p: Pose): Box {
  const box: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const hold = (q: Point): void => {
    box.x0 = Math.min(box.x0, q.x);
    box.y0 = Math.min(box.y0, q.y);
    box.x1 = Math.max(box.x1, q.x);
    box.y1 = Math.max(box.y1, q.y);
  };
  for (const n of Object.values(p.nodes)) hold(n);
  for (const s of Object.values(p.segments)) for (const q of s) hold(q);
  if (!Number.isFinite(box.x0)) return { x0: 0, y0: 0, x1: 0, y1: 0 };
  return box;
}
