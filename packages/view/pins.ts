/**
 * Nodes dragged by hand: a pin is an offset from where the layout put the
 * node, in layout units, so it rides on top of a fresh layout after every
 * mutation. It is only a look: the graph does not change, the segments of a
 * pinned node stretch to follow it, and a pin of a node that is gone does
 * nothing. No DOM here: the page drags, the tests pin.
 */
import type { Body } from "@mutant-engine/core";
import type { Layout, LayoutSegment, Point } from "./layout.js";

export type Pins = Record<number, Point>;

export function layoutBox(l: Pick<Layout, "nodes" | "segments">): Layout["bbox"] {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const n of l.nodes) {
    b.x0 = Math.min(b.x0, n.x - n.r);
    b.y0 = Math.min(b.y0, n.y - n.r);
    b.x1 = Math.max(b.x1, n.x + n.r);
    b.y1 = Math.max(b.y1, n.y + n.r);
  }
  for (const s of l.segments) {
    for (const p of s.points) {
      b.x0 = Math.min(b.x0, p.x - s.width / 2);
      b.y0 = Math.min(b.y0, p.y - s.width / 2);
      b.x1 = Math.max(b.x1, p.x + s.width / 2);
      b.y1 = Math.max(b.y1, p.y + s.width / 2);
    }
  }
  return l.nodes.length === 0 ? { x0: 0, y0: 0, x1: 0, y1: 0 } : b;
}

function key(p: Point): string {
  return `${p.x},${p.y}`;
}

/** Each end of a polyline moves with its node; the points between move by the share of the length behind them. */
function stretch(s: LayoutSegment, from: Point, to: Point): LayoutSegment {
  const pts = s.points;
  const along = [0];
  for (let i = 1; i < pts.length; i++) along.push(along[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y));
  const total = along[along.length - 1]! || 1;
  return { ...s, points: pts.map((p, i) => ({ x: p.x + from.x + (to.x - from.x) * (along[i]! / total), y: p.y + from.y + (to.y - from.y) * (along[i]! / total) })) };
}

/**
 * The layout with the pins on it; the same object when no pin lands on a node of it.
 * The body says which nodes a segment hangs from: since decision 221 a torso's
 * polyline stops half a width short of each of them, so the layout alone no
 * longer tells, and a torso read off the picture would be left behind.
 */
export function pinLayout(l: Layout, pins: Pins, body: Body): Layout {
  const shift = new Map<number, Point>();
  for (const n of l.nodes) {
    const d = pins[n.id];
    if (d !== undefined && (d.x !== 0 || d.y !== 0)) shift.set(n.id, d);
  }
  if (shift.size === 0) return l;
  const zero: Point = { x: 0, y: 0 };
  const at = new Map<number, Point>();
  for (const n of l.nodes) at.set(n.id, { x: n.x, y: n.y });
  const nodes = l.nodes.map((n) => {
    const d = shift.get(n.id);
    return d === undefined ? n : { ...n, x: n.x + d.x, y: n.y + d.y };
  });
  const byPoint = new Map<string, number>();
  for (const [id, p] of at) byPoint.set(key(p), id);
  const segments = l.segments.map((s) => {
    // The polyline runs from the segment's `a` to its `b` (layout.ts), whether or not its ends sit on them.
    const seg = body.segments[s.id];
    const da = (seg === undefined ? undefined : shift.get(seg.a)) ?? zero;
    const db = (seg === undefined ? undefined : shift.get(seg.b)) ?? zero;
    return da === zero && db === zero ? s : stretch(s, da, db);
  });
  const membranes = l.membranes.map((m) => ({
    ...m,
    polygon: m.polygon.map((p) => {
      const id = byPoint.get(key(p));
      const d = id === undefined ? undefined : shift.get(id);
      return d === undefined ? p : { x: p.x + d.x, y: p.y + d.y };
    }),
  }));
  return { ...l, nodes, segments, membranes, bbox: layoutBox({ nodes, segments }) };
}

/** Pins with the node dropped at `to`, a point of the unpinned layout `base`; offsets are kept to 1/100 of a unit. */
export function pinAt(pins: Pins, base: Layout, node: number, to: Point): Pins {
  const n = base.nodes.find((x) => x.id === node);
  if (n === undefined) return pins;
  const round = (v: number): number => Math.round(v * 100) / 100 || 0;
  const d = { x: round(to.x - n.x), y: round(to.y - n.y) };
  const out: Pins = { ...pins };
  if (d.x === 0 && d.y === 0) delete out[node];
  else out[node] = d;
  return out;
}

/** The pins of nodes the body still has. */
export function prunePins(pins: Pins, body: Body): Pins {
  const out: Pins = {};
  for (const [id, d] of Object.entries(pins)) if (body.nodes[Number(id)] !== undefined) out[Number(id)] = d;
  return out;
}
