/**
 * A deterministic drawing of the body graph (body-graph.md §15): positions of
 * nodes and polylines of segments in body units, where a segment of length 1
 * is one unit long and girth sets its thickness.
 *
 * The picture hangs from your brain. Nodes are placed one block at a time in
 * a depth-first walk by ascending id: a bridge puts its far node at its
 * preferred direction (torsos down the axis, legs down, arms and tentacles
 * sideways, heads up, tails down and back), a cycle block becomes a polygon
 * inscribed in a circle with the true side lengths, ears of a complex block
 * bend outward as arcs. Every placement turns away from what is already
 * drawn until it is clear, so a tree never crosses itself and a change moves
 * only what was placed after it. No randomness, no DOM.
 *
 * Side nodes (flank.ts) do not take part in the placement: the body is laid
 * out with every side node folded into the end of its host, as if its limbs
 * grew from that end, and only then is each side node set on its host's
 * outline, on the side its limbs went, and the roots of those limbs follow it.
 */
import { adjacency, anchorOf, cloneBody, flankHost, flankPlace, flanksOf, sideSlots, limbChains, membraneNodes, nodeIds, ORGANS, otherEnd, segmentIds, segmentsAt, selfElement, sideNodesOf, wingSpan, type Body, type BodyNode, type Membrane, type Segment, type SegmentKind } from "@mutant-engine/core";

export interface Point {
  x: number;
  y: number;
}

interface LayoutNode {
  id: number;
  x: number;
  y: number;
  /** Collision radius: by size, a little more for a head. */
  r: number;
  /** Direction the node was reached from, radians in the screen frame (y down). */
  dir: number;
}

export interface LayoutSegment {
  id: number;
  points: Point[];
  /** Full stroke width in body units. */
  width: number;
}

/**
 * How a segment's length becomes drawn units: `linear` is true to the model
 * (the full body view, W01), `sqrt` squeezes long limbs so the core stays
 * legible in a sidebar or a tile: 1 → 1, 2 → 1.41, 4 → 2, 6 → 2.45.
 */
export type LengthScale = "linear" | "sqrt";

interface LayoutOptions {
  /** Default `linear`. */
  scale?: LengthScale;
}

export function drawnLength(length: number, scale: LengthScale): number {
  return scale === "sqrt" ? Math.sqrt(length) : length;
}

interface LayoutMembrane {
  id: number;
  polygon: Point[];
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Layout {
  /** By ascending id. */
  nodes: LayoutNode[];
  /** By ascending id. */
  segments: LayoutSegment[];
  membranes: LayoutMembrane[];
  bbox: Box;
  /** Node ids in placement order: a change moves only what came after it. */
  order: number[];
  /** Intersections between polylines away from a shared node. */
  crossings: number;
  /** Placements that found no clear direction and overlap something. */
  collisions: number;
  /** The length scale the polylines were drawn on; `drawnLength(length, scale)` is what each aims for. */
  scale: LengthScale;
}

const MARGIN = 0.12;
const STEP = Math.PI / 36;
const ARC_STEPS = 8;
const DEG = Math.PI / 180;

/**
 * Sizes follow the sprites (render/sprites): a limb of girth 1 is 12 px wide
 * there and 0.2 units here, so a pixel is 1/60 of a unit. A joint is its
 * knob, 8, 10 or 12 px across by size; a head keeps a face's room.
 */
/**
 * Sizes are the sprites' own (render/compose, PPU 24): a sprite pixel is
 * 1/24 of a unit, so the graph draws the shape the sprite draws - a torso
 * 28 px wide, 44 px from girth 4 on, a limb 12 px, a joint 8, 10 or 12 px by
 * size. Placement measures a thinner line (`placeWidth`, `placeRadius`): with
 * the drawn body every limb would be jammed off its own place.
 */
const PX = 1 / 24;

function nodeRadius(node: BodyNode): number {
  if (node.ends.some((e) => e.kind === "head")) return 0.3 + 0.04 * node.size;
  return (3 + node.size) * PX;
}

/** The radius a node claims while the picture is placed. */
function placeRadius(node: BodyNode): number {
  return 0.06 + 0.06 * node.size + (node.ends.some((e) => e.kind === "head") ? 0.1 : 0);
}

/**
 * A torso is drawn as a body, not a line: wide enough for its side nodes to
 * sit on its outline. A flank has no width.
 *
 * The one place the width of a segment is decided (decision 673). The scheme
 * strokes it, the placement hangs side nodes on it, and the pixel picture
 * puts growths and the organs showing through the wall on it: a second copy
 * of these numbers went its own way past girth 4 and drew growths inside the
 * belly they should be sitting on.
 */
export function segmentHalfWidth(seg: Segment): number {
  if (seg.kind === "flank") return 0;
  if (seg.kind === "torso") return (seg.girth >= 4 ? 22 : 14) * PX + 0.1 * Math.max(0, seg.girth - 4);
  if (seg.kind === "stalk") return 3 * PX;
  return (seg.girth >= 2 ? 8 : 6) * PX;
}

/** The width a segment claims while the picture is placed: a thin line, so bodies still find room. */
function placeWidth(seg: Segment): number {
  return seg.kind === "flank" ? 0 : 0.05 + 0.05 * seg.girth;
}

/** Of its own span a torso keeps as spine, so that pulling the ends in never leaves a point. */
const SPINE_KEEP = 0.1;

/**
 * The body a segment is drawn as, from the polyline the placement gave it:
 * the spine a round-capped stroke runs along, and the stroke's width. Only a
 * torso is wide enough for the two to differ. Its stroke caps stick out half
 * a width past the spine, so the spine is pulled in by that much at each end
 * and the body then spans exactly from node to node instead of half a width
 * beyond each. Its end nodes come to lie on its outline, where its side
 * nodes already sit, and what hangs from them stops starting inside the
 * body. A torso too short to spare the width is drawn narrower rather than
 * as a ball wider than it is long (decision 221).
 *
 * On both scales since decision 1259: the graph, the sprite and the pose
 * read one body, so a side node sits at one place on all of them. On `sqrt`
 * a short torso comes out a ball, as the sprite draws it, node to node.
 */
function drawnBody(seg: Segment, points: Point[], _scale: LengthScale): { points: Point[]; width: number } {
  if (seg.kind !== "torso") return { points, width: 2 * segmentHalfWidth(seg) };
  const hw = Math.min(segmentHalfWidth(seg), ((1 - SPINE_KEEP) / 2) * polylineLength(points));
  return { points: insetEnds(points, hw), width: 2 * hw };
}

/** The polyline without its first `by` of length; the last point twice when nothing is left. */
function trimStart(points: Point[], by: number): Point[] {
  let want = by;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const d = dist(a, b);
    if (d <= want) {
      want -= d;
      continue;
    }
    const t = want / d;
    return [{ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, ...points.slice(i).map((p) => ({ ...p }))];
  }
  const last = points[points.length - 1]!;
  return [{ ...last }, { ...last }];
}

/** The polyline pulled in by `by` at both ends. */
function insetEnds(points: Point[], by: number): Point[] {
  if (by <= 1e-9 || points.length < 2) return points.map((p) => ({ ...p }));
  return trimStart([...trimStart(points, by)].reverse(), by).reverse();
}

/** Preferred directions per kind, degrees, screen frame: 0 right, 90 down, 180 left, 270 up. */
const SLOTS: Record<SegmentKind, readonly number[]> = {
  torso: [90, 120, 60, 150, 30, 180, 0],
  neck: [90, 60, 120, 30, 150],
  leg: [105, 75, 125, 55, 145, 35],
  arm: [150, 30, 165, 15, 135, 45],
  tentacle: [160, 20, 175, 5, 140, 40, 190, 350],
  tail: [130, 50, 150, 30, 110, 70],
  stalk: [300, 240, 330, 210, 280, 260],
  growth: [180, 0, 135, 45, 160, 20],
  gullet: [90, 120, 60, 150, 30],
  flank: [180, 0],
  penis: [90, 105, 75, 120, 60],
};
/** A neck that carries a head grows up. */
const HEAD_NECK: readonly number[] = [270, 240, 300, 210, 330, 180, 0];
/** Kinds whose slots come in left/right pairs and mirror on the right side of the axis. */
const SIDED = new Set<SegmentKind>(["leg", "arm", "tentacle", "tail", "stalk", "growth"]);

// ---------------------------------------------------------------- geometry

export function polylineLength(points: Point[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  return len;
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-18) return dist(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

function pointToPolyline(p: Point, pts: Point[]): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) best = Math.min(best, pointToSegment(p, pts[i - 1]!, pts[i]!));
  return best;
}

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

function sign(v: number): number {
  return v > 1e-9 ? 1 : v < -1e-9 ? -1 : 0;
}

/** Proper or touching intersection of two straight pieces; collinear pieces do not count. */
function segmentsIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const d1 = sign(cross(p4.x - p3.x, p4.y - p3.y, p1.x - p3.x, p1.y - p3.y));
  const d2 = sign(cross(p4.x - p3.x, p4.y - p3.y, p2.x - p3.x, p2.y - p3.y));
  const d3 = sign(cross(p2.x - p1.x, p2.y - p1.y, p3.x - p1.x, p3.y - p1.y));
  const d4 = sign(cross(p2.x - p1.x, p2.y - p1.y, p4.x - p1.x, p4.y - p1.y));
  if (d1 * d2 > 0 || d3 * d4 > 0) return false;
  if (d1 === 0 && d2 === 0) return false;
  return true;
}

function segmentToSegment(p1: Point, p2: Point, p3: Point, p4: Point): number {
  if (segmentsIntersect(p1, p2, p3, p4)) return 0;
  return Math.min(pointToSegment(p1, p3, p4), pointToSegment(p2, p3, p4), pointToSegment(p3, p1, p2), pointToSegment(p4, p1, p2));
}

function polylineToPolyline(a: Point[], b: Point[]): number {
  let best = Infinity;
  for (let i = 1; i < a.length; i++) {
    for (let j = 1; j < b.length; j++) best = Math.min(best, segmentToSegment(a[i - 1]!, a[i]!, b[j - 1]!, b[j]!));
  }
  return best;
}

function same(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;
}

/** Intersections between polylines of different segments, not counting the points where they meet at a node. */
/**
 * Intersections between polylines away from a shared node. With `covers`
 * (the drawn torsos), a crossing under a torso's body does not count: the
 * torso hides it, as it hides the roots of the limbs on its side nodes.
 */
export function countCrossings(segments: LayoutSegment[], covers: LayoutSegment[] = []): number {
  const hidden = (p: Point): boolean => covers.some((c) => pointToPolyline(p, c.points) < c.width / 2);
  let n = 0;
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const a = segments[i]!.points;
      const b = segments[j]!.points;
      for (let p = 1; p < a.length; p++) {
        for (let q = 1; q < b.length; q++) {
          const a0 = a[p - 1]!;
          const a1 = a[p]!;
          const b0 = b[q - 1]!;
          const b1 = b[q]!;
          if (same(a0, b0) || same(a0, b1) || same(a1, b0) || same(a1, b1)) continue;
          if (segmentsIntersect(a0, a1, b0, b1) && (covers.length === 0 || !hidden(crossingPoint(a0, a1, b0, b1)))) n += 1;
        }
      }
    }
  }
  return n;
}

function crossingPoint(a0: Point, a1: Point, b0: Point, b1: Point): Point {
  const d = (a1.x - a0.x) * (b1.y - b0.y) - (a1.y - a0.y) * (b1.x - b0.x);
  if (Math.abs(d) < 1e-12) return a0;
  const t = ((b0.x - a0.x) * (b1.y - b0.y) - (b0.y - a0.y) * (b1.x - b0.x)) / d;
  return { x: a0.x + t * (a1.x - a0.x), y: a0.y + t * (a1.y - a0.y) };
}

function dir(angle: number): Point {
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

function angleOf(from: Point, to: Point): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

/** Half the central angle of an arc of length `arc` over a chord `chord`: phi / sin(phi) = arc / chord. */
function halfAngle(chord: number, arc: number): number {
  const ratio = arc / chord;
  if (ratio <= 1) return 0;
  let lo = 1e-6;
  let hi = Math.PI - 1e-6;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (mid / Math.sin(mid) < ratio) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * A circular arc from `a` to `b` of length `arc`, bulging towards `side`
 * (a unit normal). Returns the point at fraction `t` of the arc length and
 * the direction from the circle centre at that point. A zero chord gives a
 * full circle tangent at `a`.
 */
function arcSampler(a: Point, b: Point, arc: number, side: Point): (t: number) => { p: Point; normal: number } {
  const chord = dist(a, b);
  if (chord < 1e-9) {
    const r = arc / (2 * Math.PI);
    const c = { x: a.x + r * side.x, y: a.y + r * side.y };
    const base = angleOf(c, a);
    return (t) => {
      const ang = base + 2 * Math.PI * t;
      return { p: { x: c.x + r * Math.cos(ang), y: c.y + r * Math.sin(ang) }, normal: ang };
    };
  }
  const phi = halfAngle(chord, arc);
  if (phi < 1e-6) {
    return (t) => ({ p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, normal: angleOf(a, b) - Math.PI / 2 });
  }
  // The bulge goes along the chord normal that agrees with `side`.
  const nx = -(b.y - a.y) / chord;
  const ny = (b.x - a.x) / chord;
  const flip = nx * side.x + ny * side.y < 0 ? -1 : 1;
  const bulge = { x: flip * nx, y: flip * ny };
  const r = chord / (2 * Math.sin(phi));
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const c = { x: mid.x - r * Math.cos(phi) * bulge.x, y: mid.y - r * Math.cos(phi) * bulge.y };
  const a0 = angleOf(c, a);
  const a1 = angleOf(c, b);
  let sweep = a1 - a0;
  while (sweep <= -Math.PI) sweep += 2 * Math.PI;
  while (sweep > Math.PI) sweep -= 2 * Math.PI;
  // The short way round is |sweep|; the arc is longer than a semicircle when phi > pi/2.
  if (phi > Math.PI / 2) sweep = sweep > 0 ? sweep - 2 * Math.PI : sweep + 2 * Math.PI;
  return (t) => {
    const ang = a0 + sweep * t;
    return { p: { x: c.x + r * Math.cos(ang), y: c.y + r * Math.sin(ang) }, normal: ang };
  };
}

function arcPoints(a: Point, b: Point, arc: number, side: Point, steps = ARC_STEPS): Point[] {
  if (dist(a, b) >= arc * (1 - 1e-9)) return [a, b];
  const f = arcSampler(a, b, arc, side);
  const out: Point[] = [a];
  for (let i = 1; i < steps; i++) out.push(f(i / steps).p);
  out.push(b);
  return out;
}

/** Circumradius of the polygon inscribed in a circle with the given sides (the longest shorter than the rest). */
function circumradius(sides: number[]): number {
  const longest = Math.max(...sides);
  const rest = sides.filter((_, i) => i !== sides.indexOf(longest));
  const g = (R: number): number => {
    let sum = 0;
    for (const s of rest) sum += Math.asin(Math.min(1, s / (2 * R)));
    return 2 * R * Math.sin(Math.min(Math.PI, sum)) - longest;
  };
  let lo = longest / 2;
  let hi = longest / 2;
  while (g(hi) < 0 && hi < 1e6) hi *= 2;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (g(mid) < 0) lo = mid;
    else hi = mid;
  }
  return hi;
}

// ---------------------------------------------------------------- blocks

/**
 * Biconnected blocks of the multigraph as lists of segment ids: a bridge is a
 * block of one, a cycle a block of many. Sorted by their smallest segment.
 */
export function blocks(body: Body): number[][] {
  const adj = adjacency(body);
  const disc = new Map<number, number>();
  const low = new Map<number, number>();
  const stack: number[] = [];
  const out: number[][] = [];
  let time = 0;
  const visit = (n: number, parentSeg: number): void => {
    disc.set(n, time);
    low.set(n, time);
    time += 1;
    for (const sid of adj.get(n) ?? []) {
      if (sid === parentSeg) continue;
      const m = otherEnd(body.segments[sid]!, n);
      const dm = disc.get(m);
      if (dm === undefined) {
        stack.push(sid);
        visit(m, sid);
        low.set(n, Math.min(low.get(n)!, low.get(m)!));
        if (low.get(m)! >= disc.get(n)!) {
          const block: number[] = [];
          for (;;) {
            const top = stack.pop()!;
            block.push(top);
            if (top === sid) break;
          }
          out.push(block.sort((x, y) => x - y));
        }
      } else if (dm < disc.get(n)!) {
        stack.push(sid);
        low.set(n, Math.min(low.get(n)!, dm));
      }
    }
  };
  for (const n of nodeIds(body)) if (!disc.has(n)) visit(n, -1);
  return out.sort((x, y) => x[0]! - y[0]!);
}

// ---------------------------------------------------------------- placement

/** Room kept beyond a placed node for whatever grows there later; a wish, not a rule. */
interface Ghost {
  p: Point;
  r: number;
  /** The node the room belongs to: its own children and grandchildren may use it. */
  owner: number;
}

interface Placed {
  nodes: Map<number, LayoutNode>;
  segs: Map<number, { points: Point[]; hw: number; a: number; b: number }>;
  order: number[];
  collisions: number;
  /** First node of each component. */
  roots: Set<number>;
  /** Reservations of every placed bridge, respected softly by everything placed later. */
  ghosts: Ghost[];
  /** The node each node was placed from. */
  parent: Map<number, number>;
  /** Polygons of placed rings: nothing is put inside a loop. */
  rings: Point[][];
  /** Where the side nodes of the real body go, when the body has any (see `layout`). */
  sides?: Sides;
}

/**
 * The side nodes of a body laid out folded: which folded segment ends are
 * really side nodes, where each side node was set, and how far from its
 * anchor a limb may start and still count as growing from that anchor.
 */
interface Sides {
  body: Body;
  /** Folded segment id → the side node at each of its ends, if any. */
  root: Map<number, { a?: number; b?: number }>;
  flankOf: Map<number, number>;
  pos: Map<number, Point>;
  /** Side nodes already set on an outline. */
  taken: Claim[];
  /** Anchor → the half-width of its widest host plus a side node's radius. */
  reach: Map<number, number>;
  /** The scale the hosts are drawn on, so a side node lands on the outline the view really shows. */
  scale: LengthScale;
}

/** A side node already set on an outline: where it sits and how much room it takes. */
interface Claim {
  p: Point;
  r: number;
}

/** How far along the outline from its end's pole the first side node keeps from the end node, over their two radii. */
const ATTACH_AIR = 1.1;

/**
 * The one place a side node is drawn at, for the graph, the sprite and the
 * pose alike (decision 1259): its place on the host (the model's `place`,
 * flank.ts) walked onto the host's drawn outline. `line` is the host from
 * node to node as the view laid it; the host is drawn over it (`drawnBody`)
 * and the side node sits on that body's outline, on its side. A limb's one
 * place is the middle of its side. A torso's side nodes of one side stand in
 * the order of their places - those of the flank's end by `t` from its pole,
 * then those of the other end by `t` from theirs - evenly along the whole
 * half outline, the round caps with the straight, the first and the last clear
 * of the end nodes: so a fat torso, all cap, carries its pairs round its ends
 * instead of piling them on a straight stretch shorter than one of them
 * (decision 1251), and a pair mirrors its mate on the other side. It is read
 * off the model and the host's line alone, so it is the same point after
 * relaxing and in any pose: a view has no say in it.
 */
export function attachPoint(body: Body, flankId: number, line: Point[], scale: LengthScale): Point | undefined {
  const place = flankPlace(body, flankId);
  if (place === undefined) return undefined;
  const f = body.segments[flankId]!;
  const host = body.segments[place.host]!;
  const shown = drawnBody(host, line, scale);
  // The half outline is walked from the pole at the host's first end; a side is read from the flank's end.
  const pts = shown.points;
  const hw = shown.width / 2;
  const first = pointAlong(pts, 0);
  const last = pointAlong(pts, 1);
  const straight = polylineLength(pts);
  const cap = (Math.PI / 2) * hw;
  const total = 2 * cap + straight;
  const fromA = f.a === host.a;
  // The side is the host's own, read from its first end: a body's left is its left at both of its ends.
  const s = -place.side;
  const normal = (u: Point): Point => ({ x: -u.y * s, y: u.x * s });
  let u = total / 2;
  if (host.kind === "torso") {
    const mine = flanksOf(body, place.host)
      .map((id) => ({ id, a: body.segments[id]!.a, p: flankPlace(body, id)! }))
      .filter((x) => -x.p.side === s);
    const byT = (x: { id: number; p: { t: number } }, y: { id: number; p: { t: number } }): number => x.p.t - y.p.t || x.id - y.id;
    const atA = mine.filter((x) => x.a === host.a).sort(byT);
    const atB = mine.filter((x) => x.a !== host.a).sort(byT);
    const n = atA.length + atB.length;
    const chord = ATTACH_AIR * (nodeRadius(body.nodes[f.a]!) + nodeRadius(body.nodes[f.b]!));
    const arc = chord < 2 * hw ? 2 * hw * Math.asin(Math.min(1, chord / (2 * hw))) : cap + (chord - hw * Math.SQRT2);
    const clear = Math.min(arc, total / (n + 1));
    const gap = n > 1 ? (total - 2 * clear) / (n - 1) : 0;
    const iA = atA.findIndex((x) => x.id === flankId);
    const iB = atB.findIndex((x) => x.id === flankId);
    u = n === 1 ? (fromA ? clear : total - clear) : iA >= 0 ? clear + iA * gap : total - clear - iB * gap;
  }
  if (u < cap) {
    const a2 = u / Math.max(1e-12, hw);
    const nn = normal(first.u);
    return { x: first.p.x + (-first.u.x * Math.cos(a2) + nn.x * Math.sin(a2)) * hw, y: first.p.y + (-first.u.y * Math.cos(a2) + nn.y * Math.sin(a2)) * hw };
  }
  if (u <= cap + straight) {
    const q = pointAlong(pts, straight > 1e-12 ? (u - cap) / straight : 0);
    const nn = normal(q.u);
    return { x: q.p.x + nn.x * hw, y: q.p.y + nn.y * hw };
  }
  const a3 = Math.min(Math.PI / 2, (total - u) / Math.max(1e-12, hw));
  const nn = normal(last.u);
  return { x: last.p.x + (last.u.x * Math.cos(a3) + nn.x * Math.sin(a3)) * hw, y: last.p.y + (last.u.y * Math.cos(a3) + nn.y * Math.sin(a3)) * hw };
}

/** Where a side node goes on its host as the placement has drawn it so far (`attachPoint`); null while the host is not drawn yet. */
function sidePoint(sides: Sides, segs: Map<number, { points: Point[] }>, x: number, _lean: Point | null): { p: Point; claim: Claim } | null {
  const fid = sides.flankOf.get(x);
  if (fid === undefined) return null;
  const f = sides.body.segments[fid]!;
  const where = flankPlace(sides.body, fid);
  const drawn = where === undefined ? undefined : segs.get(where.host);
  if (where === undefined || drawn === undefined) return null;
  void f;
  const p = attachPoint(sides.body, fid, drawn.points, sides.scale)!;
  return { p, claim: { p, r: nodeRadius(sides.body.nodes[x]!) } };
}

interface Candidate {
  nodes: { id: number; p: Point; r: number }[];
  segs: { id: number; points: Point[]; hw: number; a: number; b: number }[];
  /** The placed node the candidate grows from. */
  origin?: number;
  /** Room kept beyond the far node for whatever grows there later. */
  ghost?: { p: Point; r: number };
  /** The loop a ring or a pair closes, kept so that nothing is placed inside it later. */
  polygon?: Point[];
}

function insidePolygon(p: Point, poly: Point[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

function pointToPolygonEdge(p: Point, poly: Point[]): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) best = Math.min(best, pointToSegment(p, poly[j]!, poly[i]!));
  return best;
}

/** The node and everything it was placed from, up to the root. */
function lineage(placed: Placed, node: number): Set<number> {
  const out = new Set<number>([node]);
  let n = node;
  while (placed.parent.has(n)) {
    n = placed.parent.get(n)!;
    out.add(n);
  }
  return out;
}

/**
 * Clearance of two polylines that meet at a node: pieces touching the shared
 * point are not measured against each other, but any piece crossing the
 * other polyline elsewhere counts as a full collision.
 */
/**
 * Two pieces leaving one node may touch at the root, but past it they must
 * part like any two strokes: points of each beyond the root keep `need`
 * from the other. Without it a limb lies along a torso it shares a node with.
 */
function rootClearance(a0: Point, a1: Point, b0: Point, b1: Point, shared: Point, need: number, reach: number): number {
  const root = Math.max(reach, need) * 1.2;
  let total = 0;
  for (const [p0, p1, q0, q1] of [
    [a0, a1, b0, b1],
    [b0, b1, a0, a1],
  ] as const) {
    for (const t of [0.5, 0.75, 1]) {
      const p = { x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t };
      if (dist(p, shared) < root) continue;
      total += Math.max(0, need - pointToSegment(p, q0, q1));
    }
  }
  return total;
}

function sharedNodePenetration(a: Point[], b: Point[], shared: Point, need: number, reach = 0): number {
  // Limbs rooted on the side nodes around the node count as rooted at it: within `reach` of it is the root.
  const near = (p: Point): boolean => same(p, shared) || dist(p, shared) <= reach + 1e-9;
  let total = 0;
  for (let i = 1; i < a.length; i++) {
    const touchesA = near(a[i - 1]!) || near(a[i]!);
    for (let j = 1; j < b.length; j++) {
      const touchesB = near(b[j - 1]!) || near(b[j]!);
      if (touchesA && touchesB) {
        total += rootClearance(a[i - 1]!, a[i]!, b[j - 1]!, b[j]!, shared, need, reach);
        continue;
      }
      if (segmentsIntersect(a[i - 1]!, a[i]!, b[j - 1]!, b[j]!)) total += 1;
      else if (!touchesA && !touchesB) total += Math.max(0, need - segmentToSegment(a[i - 1]!, a[i]!, b[j - 1]!, b[j]!));
    }
  }
  return total;
}

/**
 * How deep the candidate cuts into what is placed: 0 means clear. Stops
 * early at `limit`. A soft pass also counts reservations: the candidate's
 * own ghost (room kept for what will grow beyond it) against what is drawn,
 * and with `all` the candidate against the ghosts of older bridges too.
 */
function penetration(placed: Placed, c: Candidate, limit = Infinity, soft: Soft = "none"): number {
  let total = 0;
  for (const n of c.nodes) {
    for (const p of placed.nodes.values()) {
      const adjacent = c.segs.some((s) => (s.a === n.id && s.b === p.id) || (s.b === n.id && s.a === p.id));
      const need = adjacent ? n.r + p.r : n.r + p.r + MARGIN;
      // A node inside another node is the worst a boxed-in placement can do: weigh it fivefold.
      total += 5 * Math.max(0, need - 1e-9 - dist(n.p, p));
      if (total >= limit) return total;
    }
    for (const s of placed.segs.values()) {
      if (s.a === n.id || s.b === n.id) continue;
      total += Math.max(0, n.r + s.hw + MARGIN - pointToPolyline(n.p, s.points));
      if (total >= limit) return total;
    }
    // Inside a loop is as bad as inside a node: the way out, weighed fivefold.
    for (const ring of placed.rings) {
      if (insidePolygon(n.p, ring)) total += 5 * (n.r + MARGIN + pointToPolygonEdge(n.p, ring));
      if (total >= limit) return total;
    }
  }
  for (const s of c.segs) {
    for (const p of placed.nodes.values()) {
      if (s.a === p.id || s.b === p.id) continue;
      total += Math.max(0, p.r + s.hw + MARGIN - pointToPolyline(p, s.points));
      if (total >= limit) return total;
    }
    for (const t of placed.segs.values()) {
      const sharedId = s.a === t.a || s.a === t.b ? s.a : s.b === t.a || s.b === t.b ? s.b : -1;
      if (sharedId >= 0) {
        const shared = placed.nodes.get(sharedId);
        if (shared !== undefined) total += sharedNodePenetration(s.points, t.points, shared, s.hw + t.hw + MARGIN, placed.sides?.reach.get(sharedId) ?? 0);
      } else total += Math.max(0, s.hw + t.hw + MARGIN - polylineToPolyline(s.points, t.points));
      if (total >= limit) return total;
    }
  }
  if (soft !== "none" && c.ghost !== undefined) {
    const g = c.ghost;
    for (const p of placed.nodes.values()) {
      if (p.id === c.origin) continue;
      total += Math.max(0, g.r + p.r - dist(g.p, p));
      if (total >= limit) return total;
    }
    for (const s of placed.segs.values()) {
      total += Math.max(0, g.r + s.hw - pointToPolyline(g.p, s.points));
      if (total >= limit) return total;
    }
  }
  // The room older bridges keep for their own growth: their descendants may use it, nobody else should.
  if (soft === "all" && placed.ghosts.length > 0) {
    const own = c.origin === undefined ? new Set<number>() : lineage(placed, c.origin);
    for (const g of placed.ghosts) {
      if (own.has(g.owner)) continue;
      for (const n of c.nodes) total += Math.max(0, g.r + n.r - dist(g.p, n.p));
      for (const s of c.segs) total += Math.max(0, g.r + s.hw - pointToPolyline(g.p, s.points));
      if (total >= limit) return total;
    }
  }
  return total;
}

function commit(placed: Placed, c: Candidate, dirs: Map<number, number>): void {
  for (const n of c.nodes) {
    placed.nodes.set(n.id, { id: n.id, x: n.p.x, y: n.p.y, r: n.r, dir: dirs.get(n.id) ?? 0 });
    placed.order.push(n.id);
    if (c.origin !== undefined) placed.parent.set(n.id, c.origin);
  }
  for (const s of c.segs) placed.segs.set(s.id, { points: s.points, hw: s.hw, a: s.a, b: s.b });
  if (c.ghost !== undefined && c.nodes.length === 1) placed.ghosts.push({ p: c.ghost.p, r: c.ghost.r, owner: c.nodes[0]!.id });
}

/**
 * Tries the preferred direction, then turns away step by step; the first
 * clear one wins. With no clear direction at the true length, the drawn
 * length may stretch or shrink by a tenth; failing that too, the least
 * intrusive direction is taken and counted as a collision.
 */
/** How a placement may deviate from a straight segment of the true length. */
export interface Variant {
  /** Drawn length over the true length: 1, 1.1 or 0.9. */
  scale: number;
  /** Chord over drawn length: 1 is straight, less bends the segment into an arc. */
  chord: number;
  /** Which way a bent segment bulges. */
  side: 1 | -1;
  /** The mirror image of a ring, or the loop of a pair on the other side; meaningless for a single segment. */
  mirror?: boolean;
}

const STRAIGHT: Variant = { scale: 1, chord: 1, side: 1 };

/** What a pass respects besides what is drawn: every reservation, only the candidate's own, or none. */
type Soft = "all" | "own" | "none";

const PASSES: { v: Variant; soft: Soft }[] = [
  { v: STRAIGHT, soft: "all" },
  { v: STRAIGHT, soft: "own" },
  { v: STRAIGHT, soft: "none" },
  { v: { scale: 1, chord: 1, side: 1, mirror: true }, soft: "none" },
  { v: { scale: 1.05, chord: 1, side: 1 }, soft: "none" },
  { v: { scale: 0.95, chord: 1, side: 1 }, soft: "none" },
  { v: { scale: 1.1, chord: 1, side: 1 }, soft: "none" },
  { v: { scale: 0.9, chord: 1, side: 1 }, soft: "none" },
  { v: { scale: 1, chord: 0.85, side: 1 }, soft: "none" },
  { v: { scale: 1, chord: 0.85, side: -1 }, soft: "none" },
  { v: { scale: 1, chord: 0.7, side: 1 }, soft: "none" },
  { v: { scale: 1, chord: 0.7, side: -1 }, soft: "none" },
  { v: { scale: 1, chord: 0.55, side: 1 }, soft: "none" },
  { v: { scale: 1, chord: 0.55, side: -1 }, soft: "none" },
];

/**
 * A `veto` names candidates that are clear but unwanted (a ring above its
 * entry): they are skipped as long as anything else is clear, and only
 * when nothing is do they compete on penetration like the rest.
 */
function search(
  placed: Placed,
  preferred: number,
  build: (angle: number, v: Variant) => Candidate,
  veto?: (c: Candidate) => boolean,
  mirrors = false,
): { angle: number; candidate: Candidate } {
  let best: { angle: number; candidate: Candidate; depth: number } | undefined;
  for (const useVeto of veto === undefined ? [false] : [true, false]) {
    for (const { v, soft } of PASSES) {
      if (v.mirror === true && !mirrors) continue;
      for (let k = 0; k <= 72; k++) {
        const offset = k === 0 ? 0 : (k % 2 === 1 ? 1 : -1) * Math.ceil(k / 2) * STEP;
        const angle = preferred + offset;
        const candidate = build(angle, v);
        if (soft !== "none" && candidate.ghost === undefined) break;
        if (soft === "all" && placed.ghosts.length === 0) break;
        if (v.chord < 1 && candidate.segs.every((s) => s.points.length === 2)) break;
        if (useVeto && veto!(candidate)) continue;
        const depth = penetration(placed, candidate, soft !== "none" ? Infinity : (best?.depth ?? Infinity), soft);
        if (depth <= 0) return { angle, candidate };
        if (soft === "none" && !useVeto && (best === undefined || depth < best.depth)) best = { angle, candidate, depth };
      }
    }
  }
  placed.collisions += 1;
  return { angle: best!.angle, candidate: best!.candidate };
}

/** How far a ring vertex may sit above your head and still count as level with it: about a node radius. */
export const RING_LEVEL = 0.2;

/** A ring may hang below the node it grows from or sit level with it, but not rise above: its centroid no higher than the entry. */
function hangsBelow(start: Point, c: Candidate): boolean {
  let y = start.y;
  for (const n of c.nodes) y += n.p.y;
  return y / (c.nodes.length + 1) >= start.y - 1e-9;
}

interface Chain {
  /** Segment ids from the first placed end to the second. */
  segments: number[];
  /** Node ids along the chain, both ends included; the ends are placed, the rest not. */
  nodes: number[];
}

/** Drawn length of a segment under the layout's scale. */
type Len = (seg: Segment) => number;

/**
 * Shortest path inside a block from `from` to `to` over segments not in
 * `banned`, by drawn length; ties go to the smaller segment id. Returns the
 * segments walked, or null when `to` is out of reach.
 */
function shortestPath(body: Body, adj: Map<number, number[]>, from: number, to: number, banned: Set<number>, len: Len, through?: (n: number) => boolean): number[] | null {
  const best = new Map<number, number>([[from, 0]]);
  const via = new Map<number, number>();
  const done = new Set<number>();
  for (;;) {
    let n = -1;
    let d = Infinity;
    for (const [id, v] of best) if (!done.has(id) && v < d) [n, d] = [id, v];
    if (n < 0) return null;
    if (n === to) break;
    done.add(n);
    if (n !== from && through !== undefined && !through(n)) continue;
    for (const sid of adj.get(n) ?? []) {
      if (banned.has(sid)) continue;
      const m = otherEnd(body.segments[sid]!, n);
      const cand = d + len(body.segments[sid]!);
      const old = best.get(m);
      if (old === undefined || cand < old - 1e-9 || (Math.abs(cand - old) <= 1e-9 && sid < via.get(m)!)) {
        best.set(m, cand);
        via.set(m, sid);
      }
    }
  }
  const out: number[] = [];
  let n = to;
  while (n !== from) {
    const sid = via.get(n)!;
    out.push(sid);
    n = otherEnd(body.segments[sid]!, n);
  }
  return out.reverse();
}

/**
 * Ear decomposition of a block from its entry. The first chain is the
 * shortest cycle through the entry: the longer ways round then bulge outward
 * as ears at their true length, where a chord of a big polygon would have to
 * stretch. Each further ear starts at the lowest unplaced segment touching
 * a placed node and takes the shortest way through unplaced nodes back to
 * a placed one.
 */
function chains(body: Body, block: number[], entry: number, len: Len): Chain[] {
  const adj = new Map<number, number[]>();
  for (const sid of block) {
    const s = body.segments[sid]!;
    if (!adj.has(s.a)) adj.set(s.a, []);
    if (!adj.has(s.b)) adj.set(s.b, []);
    adj.get(s.a)!.push(sid);
    adj.get(s.b)!.push(sid);
  }
  for (const list of adj.values()) list.sort((x, y) => x - y);
  const out: Chain[] = [];
  const placedNodes = new Set<number>([entry]);
  const placedSegs = new Set<number>();
  const walk = (v: number, segs: number[]): Chain => {
    const nodes = [v];
    let u = v;
    for (const sid of segs) {
      u = otherEnd(body.segments[sid]!, u);
      nodes.push(u);
      placedNodes.add(u);
      placedSegs.add(sid);
    }
    return { segments: segs, nodes };
  };
  let first: number[] | null = null;
  let firstLength = Infinity;
  for (const sid of adj.get(entry) ?? []) {
    const far = otherEnd(body.segments[sid]!, entry);
    const rest = far === entry ? [] : shortestPath(body, adj, far, entry, new Set([sid]), len);
    if (rest === null) continue;
    const total = len(body.segments[sid]!) + rest.reduce((t, id) => t + len(body.segments[id]!), 0);
    if (total < firstLength - 1e-9) {
      first = [sid, ...rest];
      firstLength = total;
    }
  }
  if (first !== null) out.push(walk(entry, first));
  for (;;) {
    let startSeg = -1;
    let startNode = -1;
    for (const v of [...placedNodes].sort((x, y) => x - y)) {
      for (const sid of adj.get(v) ?? []) {
        if (placedSegs.has(sid)) continue;
        if (startSeg < 0 || sid < startSeg) {
          startSeg = sid;
          startNode = v;
        }
      }
    }
    if (startSeg < 0) break;
    const u = otherEnd(body.segments[startSeg]!, startNode);
    if (placedNodes.has(u)) {
      out.push(walk(startNode, [startSeg]));
      continue;
    }
    // From u, the shortest way through unplaced nodes to any placed node, the start segment excluded.
    let best: number[] | null = null;
    let bestLength = Infinity;
    for (const w of [...placedNodes].sort((x, y) => x - y)) {
      const path = shortestPath(body, adj, u, w, new Set([startSeg, ...placedSegs]), len, (n) => !placedNodes.has(n));
      if (path === null) continue;
      const total = path.reduce((t, id) => t + len(body.segments[id]!), 0);
      if (total < bestLength - 1e-9) {
        best = path;
        bestLength = total;
      }
    }
    out.push(walk(startNode, [startSeg, ...(best ?? [])]));
  }
  return out;
}

function placeCycle(body: Body, placed: Placed, chain: Chain, entry: number, preferred: number, len: Len): number[] {
  const k = chain.segments.length;
  const start = placed.nodes.get(entry)!;
  const cycleNodes = chain.nodes.slice(0, k);
  const sides = chain.segments.map((sid) => len(body.segments[sid]!));
  const news = cycleNodes.slice(1);
  const dirs = new Map<number, number>();

  // At your head no vertex may rise past it either (a node radius of slack): a loop over the head is
  // what step E saw first.
  const atRoot = placed.roots.has(entry);
  const above = (c: Candidate): boolean => !hangsBelow(start, c) || (atRoot && c.nodes.some((n) => n.p.y < start.y - RING_LEVEL));
  if (k === 2) {
    const far = news[0]!;
    const rFar = placeRadius(body.nodes[far]!);
    const d0 = Math.max(0.9 * Math.min(...sides), start.r + rFar + 0.02);
    const build = (angle: number, v: Variant): Candidate => {
      const d = Math.max(d0 * v.scale * v.chord, start.r + rFar + 0.02);
      const p = { x: start.x + d * Math.cos(angle), y: start.y + d * Math.sin(angle) };
      // The two arcs bulge to opposite sides; the mirror variant swaps them.
      const lens: Point[] = [];
      const segs = chain.segments.map((sid, i) => {
        const seg = body.segments[sid]!;
        const side = dir(angle + (v.mirror === true ? -1 : 1) * (i === 0 ? -Math.PI / 2 : Math.PI / 2));
        const pts = arcPoints(start, p, sides[i]!, side);
        lens.push(...(i === 0 ? pts : [...pts].reverse()));
        return { id: sid, points: seg.a === entry ? pts : [...pts].reverse(), hw: placeWidth(seg), a: seg.a, b: seg.b };
      });
      return { nodes: [{ id: far, p, r: rFar }], segs, origin: entry, polygon: lens };
    };
    const { angle, candidate } = search(placed, preferred, build, above, true);
    dirs.set(far, angle);
    commit(placed, candidate, dirs);
    // The lens between the two arcs is a loop too: nothing goes inside it.
    placed.rings.push(candidate.polygon!);
    return news;
  }

  // A side longer than the rest cannot close a polygon: it is drawn over a shorter chord and bulges to
  // its true length. The flat polygon (chord 0.9 of the rest) comes first; when it neither hangs nor
  // fits, the search tries compact ones, whose chord shrinks down to the second longest side and
  // whose surplus becomes a loop, instead of a wide polygon with vertices rising past the entry.
  const total = sides.reduce((s, x) => s + x, 0);
  const longest = Math.max(...sides);
  const li = sides.indexOf(longest);
  const second = Math.max(...sides.filter((_, i) => i !== li));
  const flatCap = longest >= total - longest ? 0.9 * (total - longest) : longest;
  const centreLocal = { x: 0, y: 0 };
  const want = atRoot ? Math.PI / 2 : preferred;
  const firstSeg = chain.segments[0]!;
  const lastSeg = chain.segments[k - 1]!;
  const spineIndex = firstSeg < lastSeg ? 1 : k - 1;

  interface Polygon {
    drawn: number[];
    local: Point[];
    toWorld: (angle: number, scale: number, flip: boolean) => (p: Point) => Point;
  }
  const polygons = new Map<number, Polygon>();
  const polygon = (chordFactor: number): Polygon => {
    const cached = polygons.get(chordFactor);
    if (cached !== undefined) return cached;
    const drawn = sides.slice();
    // Chord 1 is the flat polygon; the search's smallest chord, 0.55, is fully compact.
    const compactness = Math.max(0, (chordFactor - 0.55) / 0.45);
    const cap = second + compactness * (flatCap - second);
    if (cap < longest - 1e-9) drawn[li] = cap;
    const R = circumradius(drawn);
    const angles: number[] = [0];
    const closingIndex = drawn.indexOf(Math.max(...drawn));
    let acc = 0;
    for (let i = 0; i < k; i++) {
      if (i !== closingIndex) acc += 2 * Math.asin(Math.min(1, drawn[i]! / (2 * R)));
    }
    const closingStep = 2 * Math.PI - acc;
    let phi = 0;
    for (let i = 0; i < k - 1; i++) {
      phi += i === closingIndex ? closingStep : 2 * Math.asin(Math.min(1, drawn[i]! / (2 * R)));
      angles.push(phi);
    }
    const local = angles.map((a) => ({ x: R * Math.cos(a), y: R * Math.sin(a) }));
    // Away from the root the lower-id segment at the entry points at the preferred direction; at the
    // root the circle's centre does, straight down by preference, so your head sits on top of the ring.
    const spineAngle = angleOf(local[0]!, local[spineIndex]!);
    const refAngle = atRoot ? angleOf(local[0]!, centreLocal) : spineAngle;
    const mapper = (mirror: boolean, angle: number, scale: number): ((p: Point) => Point) => {
      const rot = angle - (mirror ? -refAngle : refAngle);
      const cosr = Math.cos(rot);
      const sinr = Math.sin(rot);
      return (p) => {
        const x = scale * (p.x - local[0]!.x);
        const y = scale * (mirror ? -1 : 1) * (p.y - local[0]!.y);
        return { x: start.x + x * cosr - y * sinr, y: start.y + x * sinr + y * cosr };
      };
    };
    // The rest of the polygon lies to the right of the spine, unless its mirror image hangs lower.
    const sx = local[spineIndex]!.x - local[0]!.x;
    const sy = local[spineIndex]!.y - local[0]!.y;
    const rightward = cross(sx, sy, centreLocal.x - local[0]!.x, centreLocal.y - local[0]!.y) > 0;
    const lowness = (mirror: boolean): number => {
      const f = mapper(mirror, want, 1);
      return local.reduce((s, p) => s + f(p).y, 0);
    };
    const mirror = lowness(!rightward) > lowness(rightward) + 1e-9 ? !rightward : rightward;
    const out: Polygon = { drawn, local, toWorld: (angle, scale, flip) => mapper(flip ? !mirror : mirror, angle, scale) };
    polygons.set(chordFactor, out);
    return out;
  };

  const build = (angle: number, v: Variant): Candidate => {
    const { drawn, local, toWorld: mapAt } = polygon(v.chord);
    const toWorld = mapAt(angle, v.scale, v.mirror === true);
    const world = local.map(toWorld);
    const centre = toWorld(centreLocal);
    const centroid = { x: world.reduce((s, p) => s + p.x, 0) / k, y: world.reduce((s, p) => s + p.y, 0) / k };
    const nodes = news.map((id, i) => ({ id, p: world[i + 1]!, r: placeRadius(body.nodes[id]!) }));
    for (const n of nodes) dirs.set(n.id, angleOf(centre, n.p));
    const segs = chain.segments.map((sid, i) => {
      const seg = body.segments[sid]!;
      const from = world[i]!;
      const to = world[(i + 1) % k]!;
      let pts: Point[] = [from, to];
      if (i === li && drawn[i] !== sides[i]) {
        const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
        const away = dist(mid, centroid) < 1e-9 ? dir(angleOf(from, to) - Math.PI / 2) : dir(angleOf(centroid, mid));
        pts = arcPoints(from, to, sides[i]!, away);
      }
      const fromId = cycleNodes[i]!;
      return { id: sid, points: seg.a === fromId ? pts : [...pts].reverse(), hw: placeWidth(seg), a: seg.a, b: seg.b };
    });
    return { nodes, segs, origin: entry, polygon: world };
  };
  const { candidate } = search(placed, want, build, above, true);
  commit(placed, candidate, dirs);
  placed.rings.push(candidate.polygon!);
  return news;
}

/**
 * An ear between two placed nodes: its inner nodes walk from one end towards
 * the other, each placed by the usual search with the ideal arc (of the
 * ear's total length) as the preference, and the last segment closes on the
 * far end as an arc of its true length. Both bulge sides are tried; the
 * cleaner one stays.
 */
function placeEar(body: Body, placed: Placed, chain: Chain, centroid: Point, entryY: number, len: Len): number[] {
  const nodes = [...chain.nodes].reverse();
  const segs = [...chain.segments].reverse();
  const from = placed.nodes.get(nodes[0]!)!;
  const to = placed.nodes.get(nodes[nodes.length - 1]!)!;
  const total = segs.reduce((s, sid) => s + len(body.segments[sid]!), 0);
  const inner = nodes.slice(1, -1);
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  // A loop back to its own node has no chord: its sides are away from the block and towards it.
  const chordAngle = dist(from, to) < 1e-9 ? angleOf(centroid, mid) + Math.PI / 2 : angleOf(from, to);
  const normals = [dir(chordAngle - Math.PI / 2), dir(chordAngle + Math.PI / 2)];
  const awayScore = (n: Point): number => (mid.x - centroid.x) * n.x + (mid.y - centroid.y) * n.y;
  normals.sort((p, q) => awayScore(q) - awayScore(p));

  const snapshot = (): Placed => ({
    nodes: new Map(placed.nodes),
    segs: new Map(placed.segs),
    order: [...placed.order],
    collisions: placed.collisions,
    roots: placed.roots,
    ghosts: [...placed.ghosts],
    parent: new Map(placed.parent),
    rings: placed.rings,
    ...(placed.sides === undefined ? {} : { sides: placed.sides }),
  });
  const closingSid = segs[segs.length - 1]!;
  const closingSeg = body.segments[closingSid]!;
  const closingLength = len(closingSeg);
  /** The closing segment from `p` to the far end: an arc of its true length, a straight line once the chord is longer. */
  const closingFrom = (p: Point, side: Point) => {
    const pts = arcPoints({ x: p.x, y: p.y }, { x: to.x, y: to.y }, closingLength, side);
    const fromId = inner.length > 0 ? inner[inner.length - 1]! : nodes[0]!;
    return { id: closingSid, points: closingSeg.a === fromId ? pts : [...pts].reverse(), hw: placeWidth(closingSeg), a: closingSeg.a, b: closingSeg.b };
  };
  /**
   * Where the last inner node should go: on the circle of its segment around
   * `here` and on the circle of the closing segment around `to`, so that the
   * closing segment comes out at its true length; on the bulge side of the
   * chord if the circles meet, else towards the far end.
   */
  const lastGoal = (here: Point, want: number, side: Point): Point => {
    const d = dist(here, to);
    if (d < 1e-9) return { x: here.x + want * side.x, y: here.y + want * side.y };
    const ux = (to.x - here.x) / d;
    const uy = (to.y - here.y) / d;
    if (d > want + closingLength || d < Math.abs(want - closingLength)) return { x: here.x + want * ux, y: here.y + want * uy };
    const a = (want * want - closingLength * closingLength + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, want * want - a * a));
    const flip = -uy * side.x + ux * side.y < 0 ? -1 : 1;
    return { x: here.x + a * ux - flip * h * uy, y: here.y + a * uy + flip * h * ux };
  };
  const attempt = (side: Point, straight = false): { state: Placed; depth: number } => {
    const state = snapshot();
    const ideal = arcSampler(from, to, Math.max(total, dist(from, to)), side);
    let depth = 0;
    let prev = nodes[0]!;
    let acc = 0;
    for (let i = 0; i < inner.length; i++) {
      const id = inner[i]!;
      const sid = segs[i]!;
      const seg = body.segments[sid]!;
      const want = len(seg);
      acc += want;
      const here = state.nodes.get(prev)!;
      const goal = i === inner.length - 1 ? lastGoal(here, want, side) : ideal(acc / total).p;
      const preferred = angleOf(here, goal);
      const rFar = placeRadius(body.nodes[id]!);
      // The last inner node carries the closing segment with it, so the search sees what the closing cuts through.
      const last = i === inner.length - 1;
      const build = (angle: number, v: Variant): Candidate => {
        const drawn = want * v.scale;
        const chord = Math.max(drawn * v.chord, here.r + rFar + 0.02);
        const p = { x: here.x + chord * Math.cos(angle), y: here.y + chord * Math.sin(angle) };
        const start = { x: here.x, y: here.y };
        const bent = chord < drawn ? arcPoints(start, p, drawn, dir(angle + (v.side * Math.PI) / 2)) : [start, p];
        const own = { id: sid, points: seg.a === prev ? bent : [...bent].reverse(), hw: placeWidth(seg), a: seg.a, b: seg.b };
        const closingSide = v.mirror === true ? { x: -side.x, y: -side.y } : side;
        return { nodes: [{ id, p, r: rFar }], segs: last ? [own, closingFrom(p, closingSide)] : [own], origin: prev };
      };
      const before = state.collisions;
      // A closing chord longer than the segment stretches it past the tenth; one shorter than half loops it.
      const stretches = (c: Candidate): boolean => {
        const chord = dist(c.nodes[0]!.p, to);
        return chord > 1.1 * closingLength || chord < 0.5 * closingLength;
      };
      // An ear hangs from its block like the ring does: no node above the block's entry while anything below is clear.
      const unwanted = (c: Candidate): boolean => c.nodes[0]!.p.y < entryY - 1e-9 || (last && stretches(c));
      const { angle, candidate } = search(state, preferred, build, unwanted, last);
      if (state.collisions > before) depth += 1;
      commit(state, candidate, new Map([[id, angle]]));
      if (last && dist(candidate.nodes[0]!.p, to) > closingLength * 1.1) depth += 1;
      prev = id;
    }
    if (inner.length === 0) {
      // A chord between two placed nodes: an arc of its true length on either side, or, when both arcs
      // cut through something, a straight line off its length.
      const arc = closingFrom(from, side);
      const closing: Candidate = { nodes: [], segs: [straight ? { ...arc, points: arc.points.length > 2 ? [arc.points[0]!, arc.points[arc.points.length - 1]!] : arc.points } : arc] };
      if (penetration(state, closing) > 0) {
        depth += 1;
        state.collisions += 1;
      }
      if (straight || dist(from, to) > closingLength * 1.1) depth += 1;
      commit(state, closing, new Map());
    }
    return { state, depth };
  };
  let best = attempt(normals[0]!);
  if (best.depth > 0) {
    const other = attempt(normals[1]!);
    if (other.depth < best.depth) best = other;
  }
  if (best.depth > 0 && inner.length === 0) {
    const line = attempt(normals[0]!, true);
    if (line.depth < best.depth) best = line;
  }
  placed.nodes = best.state.nodes;
  placed.segs = best.state.segs;
  placed.order = best.state.order;
  placed.collisions = best.state.collisions;
  placed.ghosts = best.state.ghosts;
  placed.parent = best.state.parent;
  placed.rings = best.state.rings;
  return inner;
}

interface Walk {
  body: Body;
  placed: Placed;
  blockList: number[][];
  blocksAt: Map<number, number[]>;
  placedBlocks: Set<number>;
  /** Segment a node was reached through, to continue joints straight. */
  incoming: Map<number, number>;
  /** Axis nodes whose sided slots are mirrored, decided once per node by which side is emptier. */
  mirrored: Set<number>;
  len: Len;
}

/** Turns away from the incoming direction for limbs growing on limbs: straight on first, then to the sides. */
const OUTWARD: readonly number[] = [0, 35, -35, 70, -70, 105, -105, 140, -140, 180];

function isAxisNode(w: Walk, n: number): boolean {
  const inSeg = w.incoming.get(n);
  if (inSeg === undefined) return true;
  const kind = w.body.segments[inSeg]?.kind;
  return kind === "torso" || kind === "neck";
}

/**
 * Which slot list a block draws from at node n. Torsos, necks and heads keep
 * their absolute slots everywhere; limbs on the axis take their kind's slots,
 * limbs on limbs share one outward fan.
 */
function slotKey(w: Walk, n: number, kind: SegmentKind, headOnFar: boolean): string {
  if (kind === "neck" && headOnFar) return "head";
  if (kind === "torso" || kind === "neck") return kind;
  return isAxisNode(w, n) ? kind : "out";
}

/** Limbs grow down and sideways; only heads and stalks reach above the shoulders. */
function belowHorizon(angle: number): number {
  let a = angle % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  const lo = -15 * DEG;
  const hi = 195 * DEG;
  if (a > Math.PI && a < 2 * Math.PI + lo) return a < 1.5 * Math.PI ? hi : 2 * Math.PI + lo;
  return a;
}

/** More nodes already hang to the left of x than to the right. */
function leftHeavier(placed: Placed, x: number): boolean {
  let left = 0;
  let right = 0;
  for (const n of placed.nodes.values()) {
    if (n.x < x - 1e-9) left += 1;
    else if (n.x > x + 1e-9) right += 1;
  }
  return left > right;
}

function preferredAngle(w: Walk, n: number, kind: SegmentKind, key: string, index: number): number {
  const here = w.placed.nodes.get(n)!;
  const inSeg = w.incoming.get(n);
  const inKind = inSeg === undefined ? undefined : w.body.segments[inSeg]?.kind;
  // On the axis the first limb of a kind goes to the emptier side, so a chain of single limbs
  // does not lean one way; off the axis, the side is where the node is.
  const left = here.x < -1e-9 || (here.x <= 1e-9 && !w.mirrored.has(n));
  if (key === "out") {
    if (inKind === kind && index === 0) return here.dir;
    const off = OUTWARD[index % OUTWARD.length]!;
    return belowHorizon(here.dir + (left ? off : -off) * DEG);
  }
  if (inKind === kind && index === 0) return here.dir;
  let slots: readonly number[] = key === "head" ? HEAD_NECK : SLOTS[kind];
  if (SIDED.has(kind) && !left) {
    const mirrored: number[] = [];
    for (let i = 0; i < slots.length; i += 2) {
      if (i + 1 < slots.length) mirrored.push(slots[i + 1]!, slots[i]!);
      else mirrored.push(slots[i]!);
    }
    slots = mirrored;
  }
  return slots[index % slots.length]! * DEG;
}

/**
 * The trunk a torso belongs to: every torso reachable from it through the
 * nodes where torsos meet. A body cut into two torsos at the waist is one
 * trunk, and its legs stand under all of it, not under the half they hang
 * from (decision 222).
 */
function torsoTrunk(body: Body, segId: number): number[] {
  const out = new Set<number>([segId]);
  const stack = [segId];
  while (stack.length > 0) {
    const s = body.segments[stack.pop()!]!;
    for (const end of [s.a, s.b]) {
      for (const sid of segmentsAt(body, end)) {
        if (out.has(sid) || body.segments[sid]!.kind !== "torso") continue;
        out.add(sid);
        stack.push(sid);
      }
    }
  }
  return [...out].sort((x, y) => x - y);
}

/** Limbs standing on the trunk: chains rooted at the ends or side nodes of its torsos whose tip holds a foot, a hoof or another ending that stands. */
function standingLimbs(body: Body, segIds: readonly number[]): number {
  const at = new Set<number>();
  for (const id of segIds) {
    const t = body.segments[id];
    if (t === undefined || t.kind !== "torso") continue;
    for (const node of [t.a, t.b, ...sideNodesOf(body, id)]) at.add(node);
  }
  let n = 0;
  for (const c of limbChains(body)) {
    if (c.kind === "torso" || c.kind === "flank") continue;
    for (const [root, tip] of [
      [c.root, c.tip],
      [c.tip, c.root],
    ] as const) {
      if (!at.has(root)) continue;
      if (body.nodes[tip]!.ends.some((e) => (ORGANS[e.kind].stand ?? 0) > 0)) n += 1;
      break;
    }
  }
  return n;
}

/** A torso carried by three legs or more is a body on the ground: it lies along it instead of hanging down the axis. */
const LEGS_LYING = 3;

/**
 * Whether the torso lies along the ground. The trunk it belongs to must
 * carry three supports or more, and the segment itself must be a part of
 * that body rather than something the body carries: it stands on a limb of
 * its own, or it is as thick as the thickest of the trunk. A thinner end
 * that stands on nothing rises out of the trunk instead - a centaur's human
 * half over the horse, a mantis holding its thorax up (decision 223).
 */
function liesOnGround(body: Body, segId: number): boolean {
  const seg = body.segments[segId];
  if (seg === undefined || seg.kind !== "torso") return false;
  const trunk = torsoTrunk(body, segId);
  if (standingLimbs(body, trunk) < LEGS_LYING) return false;
  if (standingLimbs(body, [segId]) > 0) return true;
  let thickest = 0;
  for (const id of trunk) thickest = Math.max(thickest, body.segments[id]!.girth);
  return seg.girth >= thickest;
}

function blockKind(w: Walk, block: number[], entry: number): { kind: SegmentKind; far: number } {
  for (const sid of block) {
    const s = w.body.segments[sid]!;
    if (s.a === entry || s.b === entry) return { kind: s.kind, far: otherEnd(s, entry) };
  }
  const s = w.body.segments[block[0]!]!;
  return { kind: s.kind, far: s.b };
}

/** Structure first: the axis, then what stands, then what reaches, then what merely grows. */
const KIND_RANK: Record<SegmentKind, number> = { torso: 0, flank: 0, penis: 2.5, neck: 1, gullet: 2, leg: 3, arm: 4, tentacle: 5, tail: 6, stalk: 7, growth: 8 };

/**
 * A block's rank at node n. A limb that really grows from a side node waits
 * for the host of that side node, so it starts on the host's drawn outline.
 */
function blockRank(w: Walk, block: number[], n: number): number {
  const own = KIND_RANK[blockKind(w, block, n).kind];
  const sides = w.placed.sides;
  if (sides === undefined || block.length !== 1) return own;
  const seg = w.body.segments[block[0]!]!;
  const x = sides.root.get(block[0]!)?.[seg.a === n ? "a" : "b"];
  const fid = x === undefined ? undefined : sides.flankOf.get(x);
  const host = fid === undefined ? undefined : flankHost(sides.body, fid);
  if (host === undefined) return own;
  return Math.max(own, KIND_RANK[sides.body.segments[host]!.kind] + 0.5);
}

/**
 * Places every block that starts at node n, then walks on into what they
 * created: children before grandchildren, kinds by rank, same kinds by id.
 * The order is stable under growth: a new block lands after every older
 * block of its kind, so nothing placed before it can change.
 */
function walk(w: Walk, n: number): void {
  const counts = new Map<string, number>();
  const created: number[] = [];
  const here = w.placed.nodes.get(n)!;
  if (Math.abs(here.x) <= 1e-9 && leftHeavier(w.placed, here.x)) w.mirrored.add(n);
  const pending = (w.blocksAt.get(n) ?? [])
    .filter((bi) => !w.placedBlocks.has(bi))
    .map((bi) => ({ bi, rank: blockRank(w, w.blockList[bi]!, n) }))
    .sort((p, q) => p.rank - q.rank || p.bi - q.bi)
    .map((p) => p.bi);
  for (const bi of pending) {
    if (w.placedBlocks.has(bi)) continue;
    w.placedBlocks.add(bi);
    const block = w.blockList[bi]!;
    const { kind, far } = blockKind(w, block, n);
    const headOnFar = w.body.nodes[far]?.ends.some((e) => e.kind === "head") ?? false;
    const key = slotKey(w, n, kind, headOnFar);
    const index = counts.get(key) ?? 0;
    counts.set(key, index + 1);
    let preferred = preferredAngle(w, n, kind, key, index);
    // Asked of the body itself, not of the folded one: folding puts a side node on its host's end, and then
    // the legs of a waist belong to both torsos that meet there. Which of the two carries them is `flankHost`.
    if (block.length === 1 && kind === "torso" && liesOnGround(w.placed.sides?.body ?? w.body, block[0]!)) {
      preferred = leftHeavier(w.placed, w.placed.nodes.get(n)!.x) ? 0 : Math.PI;
    }
    if (block.length === 1) {
      const sid = block[0]!;
      const seg = w.body.segments[sid]!;
      const here = w.placed.nodes.get(n)!;
      const rFar = placeRadius(w.body.nodes[far]!);
      const want = w.len(seg);
      const ghostR = 0.3 + 0.25 * want;
      // A limb that really grows from a side node starts on its host's outline, on the side it points to.
      const sides = w.placed.sides;
      const rootSide = sides?.root.get(sid)?.[seg.a === n ? "a" : "b"];
      const origin = (angle: number): { p: Point; claim: Claim | null } => {
        if (sides === undefined || rootSide === undefined) return { p: { x: here.x, y: here.y }, claim: null };
        const set = sides.pos.get(rootSide);
        if (set !== undefined) return { p: set, claim: null };
        const q = sidePoint(sides, w.placed.segs, rootSide, dir(angle));
        return q === null ? { p: { x: here.x, y: here.y }, claim: null } : q;
      };
      // The side node's side is the model's (decision 1259): a limb from it is wished outward, away from its host,
      // not across the body its root sits on.
      if (sides !== undefined && rootSide !== undefined) {
        const fid = sides.flankOf.get(rootSide);
        const host = fid === undefined ? undefined : flankHost(sides.body, fid);
        const line = host === undefined ? undefined : w.placed.segs.get(host)?.points;
        const p0 = origin(preferred).p;
        if (line !== undefined && line.length >= 2) {
          const ax = line[line.length - 1]!.x - line[0]!.x;
          const ay = line[line.length - 1]!.y - line[0]!.y;
          const al = Math.hypot(ax, ay);
          const ox = p0.x - here.x;
          const oy = p0.y - here.y;
          if (al > 1e-9) {
            const along = (ox * ax + oy * ay) / al;
            const nx = ox - (ax / al) * along;
            const ny = oy - (ay / al) * along;
            const nl = Math.hypot(nx, ny);
            const d = dir(preferred);
            const dot = (d.x * nx + d.y * ny) / Math.max(1e-12, nl);
            if (nl > 1e-9 && dot < 0) preferred = Math.atan2(d.y - (2 * dot * ny) / nl, d.x - (2 * dot * nx) / nl);
          }
        }
      }
      const build = (angle: number, v: Variant): Candidate => {
        const drawn = want * v.scale;
        const from = origin(angle).p;
        const chord = Math.max(drawn * v.chord, (rootSide === undefined || sides === undefined ? here.r : placeRadius(sides.body.nodes[rootSide]!)) + rFar + 0.02);
        const p = { x: from.x + chord * Math.cos(angle), y: from.y + chord * Math.sin(angle) };
        const bent = chord < drawn ? arcPoints(from, p, drawn, dir(angle + (v.side * Math.PI) / 2)) : [from, p];
        const pts = seg.a === n ? bent : [...bent].reverse();
        const ghost = { p: { x: p.x + 0.5 * want * Math.cos(angle), y: p.y + 0.5 * want * Math.sin(angle) }, r: ghostR };
        return { nodes: [{ id: far, p, r: rFar }], segs: [{ id: sid, points: pts, hw: placeWidth(seg), a: seg.a, b: seg.b }], ghost, origin: n };
      };
      const { angle, candidate } = search(w.placed, preferred, build);
      commit(w.placed, candidate, new Map([[far, angle]]));
      if (sides !== undefined && rootSide !== undefined && !sides.pos.has(rootSide)) {
        const o = origin(angle);
        if (o.claim !== null) {
          sides.pos.set(rootSide, o.p);
          sides.taken.push(o.claim);
        }
      }
      w.incoming.set(far, sid);
      created.push(far);
    } else {
      const list = chains(w.body, block, n, w.len);
      const ring = placeCycle(w.body, w.placed, list[0]!, n, preferred, w.len);
      for (const id of ring) w.incoming.set(id, list[0]!.segments[0]!);
      created.push(...ring);
      for (let i = 1; i < list.length; i++) {
        const chain = list[i]!;
        const pts = [...chain.nodes.filter((id) => w.placed.nodes.has(id)), ...ring].map((id) => w.placed.nodes.get(id)!);
        const centroid = { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
        const inner = placeEar(w.body, w.placed, chain, centroid, w.placed.nodes.get(n)!.y, w.len);
        for (const id of inner) w.incoming.set(id, chain.segments[0]!);
        created.push(...inner);
      }
    }
  }
  for (const m of created) walk(w, m);
}

/**
 * The outline a membrane is drawn as: a cycle is the polygon of its nodes; a
 * wing lies on one bent limb, so it is the limb itself out to the tip and a
 * trailing edge back, bulging away from `away` and widest at the middle.
 */
export function membraneShape(points: readonly Point[], span: boolean, away: Point): Point[] {
  if (!span || points.length < 3) return points.map((p) => ({ ...p }));
  let reach = 0;
  for (let i = 1; i < points.length; i++) reach += dist(points[i - 1]!, points[i]!);
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const ux = last.x - first.x;
  const uy = last.y - first.y;
  const len = Math.hypot(ux, uy) || 1;
  let nx = -uy / len;
  let ny = ux / len;
  const mid = { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 };
  if ((mid.x - away.x) * nx + (mid.y - away.y) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  const width = 0.55 * reach;
  const back: Point[] = [];
  for (let i = points.length - 1; i >= 0; i--) {
    const t = i / (points.length - 1);
    const off = width * Math.sin(Math.PI * t);
    back.push({ x: points[i]!.x + nx * off, y: points[i]!.y + ny * off });
  }
  return [...points.map((p) => ({ ...p })), ...back];
}

function membranePolygon(body: Body, m: Pick<Membrane, "kind" | "cycle">, placed: Placed): Point[] {
  const walk = membraneNodes(body, m);
  if (walk === null) return [];
  const points: Point[] = [];
  for (const id of walk) {
    const p = placed.nodes.get(id);
    if (p === undefined) return [];
    points.push({ x: p.x, y: p.y });
  }
  let cx = 0;
  let cy = 0;
  for (const n of placed.nodes.values()) {
    cx += n.x / placed.nodes.size;
    cy += n.y / placed.nodes.size;
  }
  return membraneShape(points, wingSpan(body, m) !== null, { x: cx, y: cy });
}

/**
 * The spanning tree the placement implies: for each node, the segment
 * towards the neighbour placed earliest. Roots have none; ring nodes get one
 * too, since every ring node has a neighbour placed before it.
 */
export function placementParents(body: Body, l: Layout): Map<number, number> {
  const index = new Map(l.order.map((id, i) => [id, i]));
  const out = new Map<number, number>();
  for (const sid of segmentIds(body)) {
    const s = body.segments[sid]!;
    const ends: [number, number][] = [
      [s.a, s.b],
      [s.b, s.a],
    ];
    for (const [node, other] of ends) {
      const mine = index.get(node) ?? Infinity;
      const theirs = index.get(other) ?? Infinity;
      if (theirs >= mine) continue;
      const current = out.get(node);
      if (current === undefined || theirs < (index.get(otherEnd(body.segments[current]!, node)) ?? Infinity)) out.set(node, sid);
    }
  }
  return out;
}

export function layout(body: Body, opts: LayoutOptions = {}): Layout {
  const flanks = segmentIds(body).filter((id) => body.segments[id]!.kind === "flank");
  if (flanks.length === 0) return layoutPlain(body, opts);
  // Fold every side node into its anchor and lay out what is left: the plan without flanks.
  const anchor = new Map<number, number>();
  for (const id of nodeIds(body)) anchor.set(id, anchorOf(body, id));
  const folded = cloneBody(body);
  const sides: Sides = { body, root: new Map(), flankOf: new Map(), pos: new Map(), taken: [], reach: new Map(), scale: opts.scale ?? "linear" };
  for (const fid of flanks) {
    const f = body.segments[fid]!;
    sides.flankOf.set(f.b, fid);
    const where = flankPlace(body, fid);
    const hw = where === undefined ? 0 : segmentHalfWidth(body.segments[where.host]!);
    const a = anchor.get(f.b)!;
    sides.reach.set(a, Math.max(sides.reach.get(a) ?? 0, hw + nodeRadius(body.nodes[f.b]!)));
  }
  for (const id of segmentIds(folded)) {
    const s = folded.segments[id]!;
    if (s.kind === "flank") {
      delete folded.segments[id];
      continue;
    }
    const r: { a?: number; b?: number } = {};
    if (anchor.get(s.a) !== s.a) r.a = s.a;
    if (anchor.get(s.b) !== s.b) r.b = s.b;
    if (r.a !== undefined || r.b !== undefined) sides.root.set(id, r);
    s.a = anchor.get(s.a)!;
    s.b = anchor.get(s.b)!;
    // A limb from a side node back to its own anchor has no length in the plan; it is drawn straight once the side node is set.
    if (s.a === s.b) delete folded.segments[id];
  }
  for (const id of nodeIds(folded)) if (anchor.get(id) !== id) delete folded.nodes[id];
  for (const m of Object.values(folded.membranes)) m.cycle = m.cycle.filter((sid) => folded.segments[sid] !== undefined);
  if ("node" in folded.self) folded.self = { node: anchor.get(folded.self.node)! };
  const base = layoutPlain(folded, opts, sides);

  const nodes = new Map(base.nodes.map((n) => [n.id, { ...n }]));
  const polys = new Map(base.segments.map((s) => [s.id, s.points.map((p) => ({ ...p }))]));
  const at = (id: number): Point => {
    const n = nodes.get(id)!;
    return { x: n.x, y: n.y };
  };
  for (const id of nodeIds(body)) if (!nodes.has(id)) {
    const a = nodes.get(anchor.get(id)!)!;
    nodes.set(id, { id, x: a.x, y: a.y, r: nodeRadius(body.nodes[id]!), dir: a.dir });
  }
  // Anchors first: a side node on a limb that hangs from a side node finds that limb already moved.
  const depth = (n: number): number => {
    let d = 0;
    for (let x = n; anchor.get(x) !== x && d < 64; d++) x = body.segments[flanks.find((f) => body.segments[f]!.b === x)!]!.a;
    return d;
  };
  const ordered = [...flanks].sort((x, y) => depth(body.segments[x]!.b) - depth(body.segments[y]!.b) || x - y);
  const drawnSegs = new Map([...polys].map(([id, points]) => [id, { points }]));
  for (const fid of ordered) {
    const f = body.segments[fid]!;
    const side = f.b;
    const node = nodes.get(side)!;
    let pos = sides.pos.get(side);
    if (pos === undefined) {
      // Nothing was placed from it (an empty side node, or limbs laid out in a ring): set it now, leaning where its limbs went.
      const from = at(f.a);
      const lean = { x: 0, y: 0 };
      for (const sid of segmentIds(body)) {
        const sg = body.segments[sid]!;
        const poly = polys.get(sid);
        if (sg.kind === "flank" || poly === undefined || (sg.a !== side && sg.b !== side)) continue;
        const far = sg.a === side ? poly[poly.length - 1]! : poly[0]!;
        lean.x += far.x - from.x;
        lean.y += far.y - from.y;
      }
      const q = sidePoint(sides, drawnSegs, side, lean.x === 0 && lean.y === 0 ? null : lean);
      pos = q === null ? from : q.p;
      if (q !== null) sides.taken.push(q.claim);
      sides.pos.set(side, pos);
    }
    const anchorPos = at(f.a);
    // Never on top of another node (a host left out of the folded plan has no outline to sit on): step aside.
    for (let k = 0; k < 8 && [...nodes.values()].some((o) => o.id !== side && Math.hypot(o.x - pos!.x, o.y - pos!.y) < 1e-6); k++) {
      const a = node.dir + (k * Math.PI) / 4;
      pos = { x: pos.x + 2.2 * node.r * Math.cos(a), y: pos.y + 2.2 * node.r * Math.sin(a) };
      sides.pos.set(side, pos);
    }
    // Whatever was placed from the anchor instead (in a ring, or before the host was drawn) takes its root to the side node.
    for (const sid of segmentIds(body)) {
      const sg = body.segments[sid]!;
      const poly = polys.get(sid);
      if (sg.kind === "flank" || poly === undefined || (sg.a !== side && sg.b !== side)) continue;
      const root = sg.a === side ? poly[0]! : poly[poly.length - 1]!;
      const shift = { x: pos.x - root.x, y: pos.y - root.y };
      if (Math.hypot(shift.x, shift.y) < 1e-9) continue;
      // What hangs beyond it alone moves whole, so its length holds; tied back into the body, only the root moves.
      const part = hangingBeyond(body, sid, side);
      if (part === null) {
        if (sg.a === side) poly[0] = { ...pos };
        else poly[poly.length - 1] = { ...pos };
        continue;
      }
      for (const n of part.nodes) {
        const m = nodes.get(n)!;
        m.x += shift.x;
        m.y += shift.y;
        const set = sides.pos.get(n);
        if (set !== undefined) sides.pos.set(n, { x: set.x + shift.x, y: set.y + shift.y });
      }
      for (const id of part.segments) for (const p of polys.get(id) ?? []) {
        p.x += shift.x;
        p.y += shift.y;
      }
    }
    node.x = pos.x;
    node.y = pos.y;
    if (Math.hypot(pos.x - anchorPos.x, pos.y - anchorPos.y) > 1e-9) node.dir = Math.atan2(pos.y - anchorPos.y, pos.x - anchorPos.x);
  }
  // Last, every side node onto its place on its host as the host finally lies: a host that moved after its
  // side node was set (a limb tied back past its own side node) carries it along (decision 1259).
  for (const fid of ordered) {
    const f = body.segments[fid]!;
    const where = flankPlace(body, fid);
    if (where === undefined) continue;
    const host = body.segments[where.host]!;
    const line = polys.get(where.host) ?? [at(host.a), at(host.b)];
    const node = nodes.get(f.b)!;
    const want = attachPoint(body, fid, line, base.scale)!;
    const shift = { x: want.x - node.x, y: want.y - node.y };
    if (Math.hypot(shift.x, shift.y) < 1e-9) continue;
    for (const sid of segmentIds(body)) {
      const sg = body.segments[sid]!;
      const poly = polys.get(sid);
      if (sg.kind === "flank" || sid === where.host || poly === undefined || (sg.a !== f.b && sg.b !== f.b)) continue;
      const part = hangingBeyond(body, sid, f.b);
      if (part === null) {
        if (sg.a === f.b) poly[0] = { ...want };
        else poly[poly.length - 1] = { ...want };
        continue;
      }
      for (const n of part.nodes) {
        const m = nodes.get(n)!;
        m.x += shift.x;
        m.y += shift.y;
      }
      for (const id of part.segments) for (const p of polys.get(id) ?? []) {
        p.x += shift.x;
        p.y += shift.y;
      }
    }
    node.x = want.x;
    node.y = want.y;
  }
  const segments: LayoutSegment[] = segmentIds(body).map((id) => {
    const s = body.segments[id]!;
    const poly = polys.get(id) ?? [at(s.a), at(s.b)];
    return { id, ...drawnBody(s, poly, base.scale) };
  });
  const allNodes = nodeIds(body).map((id) => nodes.get(id)!);
  const bbox: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const n of allNodes) {
    bbox.x0 = Math.min(bbox.x0, n.x - n.r);
    bbox.y0 = Math.min(bbox.y0, n.y - n.r);
    bbox.x1 = Math.max(bbox.x1, n.x + n.r);
    bbox.y1 = Math.max(bbox.y1, n.y + n.r);
  }
  for (const sg of segments) {
    for (const p of sg.points) {
      bbox.x0 = Math.min(bbox.x0, p.x - sg.width / 2);
      bbox.y0 = Math.min(bbox.y0, p.y - sg.width / 2);
      bbox.x1 = Math.max(bbox.x1, p.x + sg.width / 2);
      bbox.y1 = Math.max(bbox.y1, p.y + sg.width / 2);
    }
  }
  const order: number[] = [];
  for (const id of base.order) {
    order.push(id);
    for (const fid of ordered) if (anchor.get(body.segments[fid]!.b) === id) order.push(body.segments[fid]!.b);
  }
  const membranes = base.membranes.map((m) => ({ id: m.id, polygon: membranePolygon(body, body.membranes[m.id]!, { nodes } as unknown as Placed) }));
  const drawn = segments.filter((sg) => body.segments[sg.id]!.kind !== "flank");
  const torsos = segments.filter((sg) => body.segments[sg.id]!.kind === "torso");
  return { nodes: allNodes, segments, membranes, bbox, order, crossings: countCrossings(drawn, torsos), collisions: base.collisions, scale: base.scale };
}

/**
 * The segment and everything beyond it, away from `from`, when none of it
 * reaches `from` or anything on its side but through that segment; null otherwise.
 */
function hangingBeyond(body: Body, segId: number, from: number): { nodes: number[]; segments: number[] } | null {
  const adj = adjacency(body);
  const start = otherEnd(body.segments[segId]!, from);
  const nodes = new Set<number>([start]);
  const segments = new Set<number>([segId]);
  const stack = [start];
  while (stack.length > 0) {
    const n = stack.pop()!;
    for (const sid of adj.get(n) ?? []) {
      if (segments.has(sid)) continue;
      segments.add(sid);
      const o = otherEnd(body.segments[sid]!, n);
      if (o === from) return null;
      if (!nodes.has(o)) {
        nodes.add(o);
        stack.push(o);
      }
    }
  }
  return { nodes: [...nodes], segments: [...segments] };
}

/** Point and unit direction at a fraction of a polyline's length. */
function pointAlong(pts: Point[], t: number): { p: Point; u: Point } {
  let want = polylineLength(pts) * t;
  let u = { x: 0, y: 1 };
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const len = dist(a, b);
    if (len < 1e-12) continue;
    u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    if (want <= len || i === pts.length - 1) {
      const k = Math.min(1, want / len);
      return { p: { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }, u };
    }
    want -= len;
  }
  return { p: { ...pts[0]! }, u };
}

function layoutPlain(body: Body, opts: LayoutOptions = {}, sides?: Sides): Layout {
  const scale = opts.scale ?? "linear";
  const len: Len = (seg) => drawnLength(seg.length, scale);
  const placed: Placed = { nodes: new Map(), segs: new Map(), order: [], collisions: 0, roots: new Set(), ghosts: [], parent: new Map(), rings: [] };
  if (sides !== undefined) placed.sides = sides;
  const blockList = blocks(body);
  const blocksAt = new Map<number, number[]>();
  blockList.forEach((block, i) => {
    const seen = new Set<number>();
    for (const sid of block) {
      const s = body.segments[sid]!;
      for (const n of [s.a, s.b]) {
        if (seen.has(n)) continue;
        seen.add(n);
        if (!blocksAt.has(n)) blocksAt.set(n, []);
        blocksAt.get(n)!.push(i);
      }
    }
  });
  const w: Walk = { body, placed, blockList, blocksAt, placedBlocks: new Set(), incoming: new Map(), mirrored: new Set(), len };

  const selfId = selfElement(body);
  const selfNode = body.nodes[selfId] !== undefined ? selfId : body.segments[selfId]?.a;
  const roots: number[] = [];
  if (selfNode !== undefined && body.nodes[selfNode] !== undefined) roots.push(selfNode);
  for (const id of nodeIds(body)) if (!roots.includes(id)) roots.push(id);

  let offsetX = 0;
  for (const root of roots) {
    if (placed.nodes.has(root)) continue;
    const r = placeRadius(body.nodes[root]!);
    placed.nodes.set(root, { id: root, x: offsetX, y: 0, r, dir: Math.PI / 2 });
    placed.order.push(root);
    placed.roots.add(root);
    walk(w, root);
    let maxX = -Infinity;
    for (const n of placed.nodes.values()) maxX = Math.max(maxX, n.x + n.r);
    offsetX = maxX + 2;
  }

  const nodes = nodeIds(body).map((id) => placed.nodes.get(id)!);
  // With `sides` this is the folded pass `layout` still has to unfold: it hands the polylines on as placed, and draws the bodies itself at the end.
  const segments = segmentIds(body).map((id) =>
    sides === undefined ? { id, ...drawnBody(body.segments[id]!, placed.segs.get(id)!.points, scale) } : { id, points: placed.segs.get(id)!.points, width: 2 * segmentHalfWidth(body.segments[id]!) },
  );
  const membranes = Object.keys(body.membranes)
    .map(Number)
    .sort((x, y) => x - y)
    .map((id) => ({ id, polygon: membranePolygon(body, body.membranes[id]!, placed) }));

  const bbox: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const n of nodes) {
    bbox.x0 = Math.min(bbox.x0, n.x - n.r);
    bbox.y0 = Math.min(bbox.y0, n.y - n.r);
    bbox.x1 = Math.max(bbox.x1, n.x + n.r);
    bbox.y1 = Math.max(bbox.y1, n.y + n.r);
  }
  for (const s of segments) {
    for (const p of s.points) {
      bbox.x0 = Math.min(bbox.x0, p.x - s.width / 2);
      bbox.y0 = Math.min(bbox.y0, p.y - s.width / 2);
      bbox.x1 = Math.max(bbox.x1, p.x + s.width / 2);
      bbox.y1 = Math.max(bbox.y1, p.y + s.width / 2);
    }
  }
  if (nodes.length === 0) Object.assign(bbox, { x0: 0, y0: 0, x1: 0, y1: 0 });

  return { nodes, segments, membranes, bbox, order: placed.order, crossings: countCrossings(segments), collisions: placed.collisions, scale };
}

// ---------------------------------------------------------------- ragdoll

interface RelaxOptions {
  /** Rounds of the solver. Default 80. */
  rounds?: number;
  /** How far apart two joints that no bone ties stay, beyond their radii. Default 0.8. */
  room?: number;
}

/**
 * The layout shaken out like a ragdoll: every bone keeps its drawn length, a
 * side node rides on its host as if welded to both its ends, joints that no
 * bone ties push apart, and your brain stays where it is. Deterministic, a
 * fixed number of rounds in id order; bones come out straight.
 */
export function relaxLayout(body: Body, l: Layout, opts: RelaxOptions = {}): Layout {
  const rounds = opts.rounds ?? 80;
  const room = opts.room ?? 0.8;
  const pos = new Map(l.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
  const rOf = new Map(l.nodes.map((n) => [n.id, n.r]));
  const selfId = selfElement(body);
  const fixed = new Set<number>(body.nodes[selfId] !== undefined ? [selfId] : [body.segments[selfId]?.a ?? -1]);
  const bones: { a: number; b: number; len: number }[] = [];
  const tied = new Set<string>();
  const tie = (a: number, b: number): void => {
    tied.add(`${Math.min(a, b)},${Math.max(a, b)}`);
  };
  for (const id of segmentIds(body)) {
    const s = body.segments[id]!;
    const pa = pos.get(s.a)!;
    const pb = pos.get(s.b)!;
    tie(s.a, s.b);
    if (s.kind !== "flank") {
      const drawn = l.segments.find((x) => x.id === id)!;
      bones.push({ a: s.a, b: s.b, len: Math.max(polylineLength(drawn.points) * 0.98, dist(pa, pb)) });
      continue;
    }
    // Welded: the side node keeps its distance to both ends of its host, and to the anchor.
    bones.push({ a: s.a, b: s.b, len: dist(pa, pb) });
    const host = flankHost(body, id);
    if (host !== undefined) {
      const h = body.segments[host]!;
      const other = h.a === s.a ? h.b : h.a;
      bones.push({ a: other, b: s.b, len: dist(pos.get(other)!, pb) });
      tie(other, s.b);
    }
  }
  const ids = nodeIds(body);
  const sideNodes = new Set(segmentIds(body).filter((id) => body.segments[id]!.kind === "flank").map((id) => body.segments[id]!.b));
  const move = (id: number, dx: number, dy: number): void => {
    if (fixed.has(id) || sideNodes.has(id)) return;
    const p = pos.get(id)!;
    p.x += dx;
    p.y += dy;
  };
  for (let round = 0; round < rounds; round++) {
    // Push apart what no bone holds together.
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i]!;
        const b = ids[j]!;
        if (tied.has(`${a},${b}`)) continue;
        const pa = pos.get(a)!;
        const pb = pos.get(b)!;
        const want = rOf.get(a)! + rOf.get(b)! + room;
        let dx = pb.x - pa.x;
        let dy = pb.y - pa.y;
        let d = Math.hypot(dx, dy);
        if (d >= want) continue;
        if (d < 1e-9) {
          dx = 1;
          dy = 0;
          d = 1;
        }
        const push = (0.5 * (want - d)) / d;
        const wa = fixed.has(a) ? 0 : fixed.has(b) ? 2 : 1;
        const wb = fixed.has(b) ? 0 : fixed.has(a) ? 2 : 1;
        move(a, -dx * push * wa * 0.5, -dy * push * wa * 0.5);
        move(b, dx * push * wb * 0.5, dy * push * wb * 0.5);
      }
    }
    // A joint off a bone it is not on steps off it; the bone gives way too.
    for (const bone of bones) {
      const pa = pos.get(bone.a)!;
      const pb = pos.get(bone.b)!;
      for (const id of ids) {
        if (id === bone.a || id === bone.b || tied.has(`${Math.min(id, bone.a)},${Math.max(id, bone.a)}`) || tied.has(`${Math.min(id, bone.b)},${Math.max(id, bone.b)}`)) continue;
        const p = pos.get(id)!;
        const want = rOf.get(id)! + room * 0.5;
        const d = pointToSegment(p, pa, pb);
        if (d >= want) continue;
        const ex = pb.x - pa.x;
        const ey = pb.y - pa.y;
        const l2 = ex * ex + ey * ey;
        const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p.x - pa.x) * ex + (p.y - pa.y) * ey) / l2));
        let nx = p.x - (pa.x + ex * t);
        let ny = p.y - (pa.y + ey * t);
        const n = Math.hypot(nx, ny);
        if (n < 1e-9) {
          nx = -ey;
          ny = ex;
        }
        const k = (want - d) / Math.max(1e-9, Math.hypot(nx, ny));
        move(id, nx * k * 0.5, ny * k * 0.5);
        move(bone.a, -nx * k * 0.25 * (1 - t), -ny * k * 0.25 * (1 - t));
        move(bone.b, -nx * k * 0.25 * t, -ny * k * 0.25 * t);
      }
    }
    // Bones hold their length.
    for (const bone of bones) {
      const pa = pos.get(bone.a)!;
      const pb = pos.get(bone.b)!;
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const d = Math.hypot(dx, dy);
      if (d < 1e-9) continue;
      const k = (d - bone.len) / d;
      const wa = fixed.has(bone.a) ? 0 : fixed.has(bone.b) ? 1 : 0.5;
      const wb = fixed.has(bone.b) ? 0 : fixed.has(bone.a) ? 1 : 0.5;
      move(bone.a, dx * k * wa, dy * k * wa);
      move(bone.b, -dx * k * wb, -dy * k * wb);
    }
  }
  // Back onto the outline: the rounds pull a side node off its host, and its limb then hangs in the air.
  for (const fid of segmentIds(body)) {
    const f = body.segments[fid]!;
    if (f.kind !== "flank") continue;
    const where = flankPlace(body, fid);
    if (where === undefined) continue;
    const host = body.segments[where.host]!;
    const pa = pos.get(host.a);
    const pb = pos.get(host.b);
    const side = pos.get(f.b);
    if (pa === undefined || pb === undefined || side === undefined || dist(pa, pb) < 1e-9) continue;
    // The one point of the place on the host's body as it now lies (decision 1259).
    const want = attachPoint(body, fid, [{ ...pa }, { ...pb }], l.scale)!;
    const dx = want.x - side.x;
    const dy = want.y - side.y;
    if (Math.hypot(dx, dy) < 1e-9) continue;
    const part = hangingBeyond(body, fid, f.a);
    for (const id of part === null ? [f.b] : part.nodes) {
      const p2 = pos.get(id);
      if (p2 === undefined) continue;
      p2.x += dx;
      p2.y += dy;
    }
  }
  const nodes = l.nodes.map((n) => ({ ...n, ...pos.get(n.id)! }));
  const segments = l.segments.map((s) => {
    const seg = body.segments[s.id]!;
    return { id: s.id, ...drawnBody(seg, [{ ...pos.get(seg.a)! }, { ...pos.get(seg.b)! }], l.scale) };
  });
  const membranes = l.membranes.map((m) => ({ id: m.id, polygon: membranePolygon(body, body.membranes[m.id]!, { nodes: pos } as unknown as Placed) }));
  const bbox: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const n of nodes) {
    bbox.x0 = Math.min(bbox.x0, n.x - n.r);
    bbox.y0 = Math.min(bbox.y0, n.y - n.r);
    bbox.x1 = Math.max(bbox.x1, n.x + n.r);
    bbox.y1 = Math.max(bbox.y1, n.y + n.r);
  }
  for (const s of segments) {
    for (const p of s.points) {
      bbox.x0 = Math.min(bbox.x0, p.x - s.width / 2);
      bbox.y0 = Math.min(bbox.y0, p.y - s.width / 2);
      bbox.x1 = Math.max(bbox.x1, p.x + s.width / 2);
      bbox.y1 = Math.max(bbox.y1, p.y + s.width / 2);
    }
  }
  const drawn = segments.filter((s) => body.segments[s.id]!.kind !== "flank");
  const torsos = segments.filter((s) => body.segments[s.id]!.kind === "torso");
  return { ...l, nodes, segments, membranes, bbox, crossings: countCrossings(drawn, torsos) };
}
