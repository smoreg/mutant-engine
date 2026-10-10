/**
 * A raster plan of the body for the map tile: the layout scaled into a
 * 32, 64 or 96 px square, drawn chunky (a limb is never thinner than a
 * sixteenth of the frame), one byte per pixel with a palette index, a
 * one-pixel dark outline around the whole silhouette. `cells !== 0` is the
 * 1-bit mask; the index says which cover or organ the pixel belongs to.
 *
 * A grown body would be a blot at 32 px, so the tile drops detail: it keeps
 * the axis of torsos, every head with the way to it, and the K heaviest
 * limbs (4 at 32 px, 8 at 64, all at 96); the rest collapses into the node
 * it hangs from, which swells by the area those limbs would have taken.
 * Pure arithmetic over pixel centres, nothing drawn on anything.
 */
import { limbChains, nodeIds, otherEnd, segmentIds, segmentMass, type Body, type CoverId } from "@mutant-engine/core";
import { layout, placementParents, polylineLength, type Layout, type LengthScale, type Point } from "./layout.js";
import { COVER_COLORS, HEAD_COLOR, INK, TONE } from "./svg.js";

export interface PaletteEntry {
  index: number;
  name: string;
  color: string;
}

export interface SpritePlan {
  px: 32 | 64 | 96;
  /** px * px bytes, row-major, 0 is transparent; other values index `palette`. */
  cells: Uint8Array;
  palette: PaletteEntry[];
  /** Segments drawn as their own shape, ascending; the rest went into the thickness of the silhouette. */
  kept: number[];
}

interface SpriteOptions {
  layout?: Layout;
  /** Length scale when no layout is given: `linear` by default, `sqrt` for a tile of a grown body. */
  scale?: LengthScale;
}

const COVER_ORDER: CoverId[] = ["skin", "chitin", "scales", "slime", "suckers", "fur", "bark", "plates", "chrome"];
// --- lab/beasts: covers. Appended after the fixed indices, so every colour of a tile keeps the number it had.
const COVER_TAIL: CoverId[] = ["feathers", "stone"];

/** Fixed for every body, so the same index means the same thing on every tile. */
const SPRITE_PALETTE: PaletteEntry[] = [
  { index: 0, name: "empty", color: "transparent" },
  { index: 1, name: "outline", color: INK.ground },
  ...COVER_ORDER.map((c, i) => ({ index: 2 + i, name: c, color: COVER_COLORS[c] })),
  { index: 11, name: "head", color: HEAD_COLOR },
  { index: 12, name: "self", color: TONE.amber },
  { index: 13, name: "brain", color: TONE.head },
  { index: 14, name: "membrane", color: TONE.bio },
  { index: 15, name: "eye", color: INK.paper },
  { index: 16, name: "flesh", color: TONE.flesh },
  ...COVER_TAIL.map((c, i) => ({ index: 17 + i, name: c, color: COVER_COLORS[c] })),
];

const IDX = {
  outline: 1,
  head: 11,
  self: 12,
  brain: 13,
  membrane: 14,
  eye: 15,
  flesh: 16,
} as const;

/** Limbs a tile keeps besides the axis and the heads. */
const LIMBS_KEPT: Record<32 | 64 | 96, number> = { 32: 4, 64: 8, 96: Infinity };

function coverIndex(c: CoverId): number {
  const i = COVER_ORDER.indexOf(c);
  return i >= 0 ? 2 + i : 17 + COVER_TAIL.indexOf(c);
}

type Shape =
  | { kind: "disc"; x: number; y: number; r: number; index: number }
  | { kind: "capsule"; a: Point; b: Point; r: number; index: number }
  | { kind: "polygon"; points: Point[]; index: number };

function shapeBox(s: Shape): { x0: number; y0: number; x1: number; y1: number } {
  if (s.kind === "disc") return { x0: s.x - s.r, y0: s.y - s.r, x1: s.x + s.r, y1: s.y + s.r };
  if (s.kind === "capsule") {
    return { x0: Math.min(s.a.x, s.b.x) - s.r, y0: Math.min(s.a.y, s.b.y) - s.r, x1: Math.max(s.a.x, s.b.x) + s.r, y1: Math.max(s.a.y, s.b.y) + s.r };
  }
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const p of s.points) {
    box.x0 = Math.min(box.x0, p.x);
    box.y0 = Math.min(box.y0, p.y);
    box.x1 = Math.max(box.x1, p.x);
    box.y1 = Math.max(box.y1, p.y);
  }
  return box;
}

function inside(s: Shape, x: number, y: number): boolean {
  if (s.kind === "disc") return (x - s.x) ** 2 + (y - s.y) ** 2 <= s.r * s.r;
  if (s.kind === "capsule") {
    const dx = s.b.x - s.a.x;
    const dy = s.b.y - s.a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((x - s.a.x) * dx + (y - s.a.y) * dy) / l2));
    const px = s.a.x + t * dx;
    const py = s.a.y + t * dy;
    return (x - px) ** 2 + (y - py) ** 2 <= s.r * s.r;
  }
  let hit = false;
  const pts = s.points;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!;
    const b = pts[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/** Segments that get their own shape at this size, with the way back to the root for each. */
function keptSegments(body: Body, l: Layout, px: 32 | 64 | 96): Set<number> {
  const all = segmentIds(body);
  const limit = LIMBS_KEPT[px];
  if (!Number.isFinite(limit)) return new Set(all);
  const parent = placementParents(body, l);
  const kept = new Set<number>();
  const withAncestors = (sid: number): void => {
    let s = sid;
    for (;;) {
      if (kept.has(s)) return;
      kept.add(s);
      const seg = body.segments[s]!;
      // The ancestor path continues from whichever end hangs from this segment's parent.
      const up = parent.get(seg.a) === s ? parent.get(seg.b) : parent.get(seg.a);
      if (up === undefined) return;
      s = up;
    }
  };
  for (const sid of all) if (body.segments[sid]!.kind === "torso") withAncestors(sid);
  for (const id of nodeIds(body)) {
    if (!body.nodes[id]!.ends.some((e) => e.kind === "head")) continue;
    const up = parent.get(id);
    if (up !== undefined) withAncestors(up);
  }
  // Whole limbs compete, not their pieces: a bent arm is one arm (flank.ts).
  const limbs = limbChains(body)
    .filter((c) => c.segments.some((sid) => !kept.has(sid)))
    .map((c) => ({ c, mass: c.segments.reduce((m, sid) => m + segmentMass(body.segments[sid]!), 0) }))
    .sort((p, q) => q.mass - p.mass || p.c.segments[0]! - q.c.segments[0]!);
  for (const { c } of limbs.slice(0, limit)) for (const sid of c.segments) withAncestors(sid);
  return kept;
}

/** The node a dropped segment collapses into: the first node up the tree that a kept segment reaches. */
function lumpNode(body: Body, parent: Map<number, number>, kept: Set<number>, sid: number): number {
  const seg = body.segments[sid]!;
  let node = parent.get(seg.a) === sid ? seg.b : seg.a;
  for (;;) {
    const up = parent.get(node);
    if (up === undefined || kept.has(up)) return node;
    node = otherEnd(body.segments[up]!, node);
  }
}

/** Shapes in pixel space for a scale, before centring: chunk minimums grow with the frame. */
function shapesFor(body: Body, l: Layout, px: 32 | 64 | 96, scale: number, kept: Set<number>): Shape[] {
  const k = px / 32;
  const minLimb = 4 * k;
  const minNode = 3 * k;
  const minHead = 5 * k;
  const shapes: Shape[] = [];
  const at = (p: Point): Point => ({ x: p.x * scale, y: p.y * scale });
  const limbRadius = (width: number): number => Math.max(minLimb, width * scale * 3) / 2;
  const parent = placementParents(body, l);
  // What the dropped limbs would have covered, in pixel area, gathered at the node they hang from.
  const lump = new Map<number, number>();
  for (const s of l.segments) {
    if (kept.has(s.id)) {
      const seg = body.segments[s.id]!;
      const index = seg.hp <= 0 ? IDX.flesh : coverIndex(seg.cover);
      const r = limbRadius(s.width);
      for (let i = 1; i < s.points.length; i++) shapes.push({ kind: "capsule", a: at(s.points[i - 1]!), b: at(s.points[i]!), r, index });
      continue;
    }
    const r = limbRadius(s.width);
    const area = 2 * r * polylineLength(s.points) * scale + Math.PI * r * r;
    const node = lumpNode(body, parent, kept, s.id);
    lump.set(node, (lump.get(node) ?? 0) + area);
  }
  for (const m of l.membranes) if (m.polygon.length >= 3) shapes.push({ kind: "polygon", points: m.polygon.map(at), index: IDX.membrane });
  const selfNode = "node" in body.self ? body.self.node : -1;
  const selfSegment = "segment" in body.self ? body.self.segment : -1;
  const heads: Shape[] = [];
  const yours: Shape[] = [];
  for (const id of nodeIds(body)) {
    const node = body.nodes[id]!;
    const n = l.nodes.find((x) => x.id === id)!;
    const p = at(n);
    const head = node.ends.find((e) => e.kind === "head");
    // Dropped limbs swell the joint by a quarter of their area (collapsed, they overlap), never past 1.5 x; a head stays a head.
    const swell = (r: number): number => Math.min(1.5 * r, Math.sqrt(r * r + (lump.get(id) ?? 0) / (4 * Math.PI)));
    if (head !== undefined) {
      const r = Math.max(minHead, n.r * scale * 1.8);
      const into = id === selfNode ? yours : heads;
      into.push({ kind: "disc", x: p.x, y: p.y, r, index: IDX.head });
      const brain = head.contents?.some((c) => c.kind === "brain") ?? false;
      if (brain) into.push({ kind: "disc", x: p.x, y: p.y - r * 0.15, r: Math.max(1, r * 0.4), index: id === selfNode ? IDX.self : IDX.brain });
      const eyes = Math.min(2, head.contents?.filter((c) => c.kind === "eye").length ?? 0);
      for (let i = 0; i < eyes; i++) into.push({ kind: "disc", x: p.x + (i === 0 ? -1 : 1) * r * 0.45, y: p.y + r * 0.35, r: Math.max(0.6, r * 0.18), index: IDX.eye });
    } else {
      const incoming = l.segments.find((s) => {
        const seg = body.segments[s.id]!;
        return seg.a === id || seg.b === id;
      });
      const cover = incoming === undefined ? "skin" : body.segments[incoming.id]!.cover;
      const r = swell(Math.max(minNode, n.r * scale * 1.8));
      shapes.push({ kind: "disc", x: p.x, y: p.y, r, index: node.hp <= 0 ? IDX.flesh : coverIndex(cover) });
      if (node.ends.some((e) => e.kind === "mouth" || e.kind === "snout")) shapes.push({ kind: "disc", x: p.x, y: p.y, r: Math.max(0.8, r * 0.4), index: IDX.flesh });
      if (node.ends.some((e) => e.kind === "eye")) shapes.push({ kind: "disc", x: p.x, y: p.y, r: Math.max(0.8, r * 0.45), index: IDX.eye });
    }
  }
  // Heads go on top of everything and your own on top of the heads: a covered brain is a tile that tells nothing.
  shapes.push(...heads, ...yours);
  for (const s of l.segments) {
    const seg = body.segments[s.id]!;
    if (seg.id !== selfSegment) continue;
    const mid = s.points[Math.floor(s.points.length / 2)]!;
    shapes.push({ kind: "disc", x: mid.x * scale, y: mid.y * scale, r: Math.max(1, 1.5 * k), index: IDX.self });
  }
  return shapes;
}

export function spritePlan(body: Body, px: 32 | 64 | 96, opts: SpriteOptions = {}): SpritePlan {
  const l = opts.layout ?? layout(body, { scale: opts.scale ?? "linear" });
  const cells = new Uint8Array(px * px);
  if (l.nodes.length === 0) return { px, cells, palette: SPRITE_PALETTE, kept: [] };
  const keptSet = keptSegments(body, l, px);
  const kept = [...keptSet].sort((x, y) => x - y);
  const margin = 2;
  const room = px - 2 * margin;
  // The frame fits what is drawn; dropped limbs leave no empty room around the core.
  const box0 = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const hold = (x: number, y: number, r: number): void => {
    box0.x0 = Math.min(box0.x0, x - r);
    box0.y0 = Math.min(box0.y0, y - r);
    box0.x1 = Math.max(box0.x1, x + r);
    box0.y1 = Math.max(box0.y1, y + r);
  };
  const drawnNodes = new Set<number>();
  for (const s of l.segments) {
    if (!keptSet.has(s.id)) continue;
    for (const p of s.points) hold(p.x, p.y, s.width / 2);
    drawnNodes.add(body.segments[s.id]!.a);
    drawnNodes.add(body.segments[s.id]!.b);
  }
  for (const n of l.nodes) if (drawnNodes.has(n.id) || drawnNodes.size === 0) hold(n.x, n.y, n.r);
  const w = Math.max(1e-6, box0.x1 - box0.x0);
  const h = Math.max(1e-6, box0.y1 - box0.y0);
  let scale = room / Math.max(w, h);
  let shapes = shapesFor(body, l, px, scale, keptSet);
  let box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  // Chunk minimums can push the drawing past the frame; shrink until it fits.
  for (let pass = 0; pass < 4; pass++) {
    box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const s of shapes) {
      const b = shapeBox(s);
      box.x0 = Math.min(box.x0, b.x0);
      box.y0 = Math.min(box.y0, b.y0);
      box.x1 = Math.max(box.x1, b.x1);
      box.y1 = Math.max(box.y1, b.y1);
    }
    const over = Math.max(box.x1 - box.x0, box.y1 - box.y0) / room;
    if (over <= 1) break;
    scale /= over;
    shapes = shapesFor(body, l, px, scale, keptSet);
  }
  const dx = margin + (room - (box.x1 - box.x0)) / 2 - box.x0;
  const dy = margin + (room - (box.y1 - box.y0)) / 2 - box.y0;
  for (const s of shapes) {
    const b = shapeBox(s);
    const x0 = Math.max(0, Math.floor(b.x0 + dx));
    const x1 = Math.min(px - 1, Math.ceil(b.x1 + dx));
    const y0 = Math.max(0, Math.floor(b.y0 + dy));
    const y1 = Math.min(px - 1, Math.ceil(b.y1 + dy));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (inside(s, x + 0.5 - dx, y + 0.5 - dy)) cells[y * px + x] = s.index;
      }
    }
  }
  // Outline: every empty pixel next to a filled one.
  const filled = cells.slice();
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      if (filled[y * px + x] !== 0) continue;
      const near =
        (x > 0 && filled[y * px + x - 1] !== 0) ||
        (x < px - 1 && filled[y * px + x + 1] !== 0) ||
        (y > 0 && filled[(y - 1) * px + x] !== 0) ||
        (y < px - 1 && filled[(y + 1) * px + x] !== 0);
      if (near) cells[y * px + x] = IDX.outline;
    }
  }
  return { px, cells, palette: SPRITE_PALETTE, kept };
}

const GLYPHS = " #skcmufbpChSBMef";

/** One character per pixel: space empty, # outline, letters by palette index. */
export function spriteText(plan: SpritePlan): string {
  const lines: string[] = [];
  for (let y = 0; y < plan.px; y++) {
    let line = "";
    for (let x = 0; x < plan.px; x++) {
      const v = plan.cells[y * plan.px + x]!;
      line += v === 0 ? "." : (GLYPHS[v] ?? "?");
    }
    lines.push(line);
  }
  return lines.join("\n");
}
