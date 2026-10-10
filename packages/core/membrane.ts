/**
 * Membranes, body-graph.md §1 and §9: skin stretched over a simple cycle of
 * 3-6 segments, or - a wing - over one bent limb, a span of 2-6 segments
 * through its joints, with no cycle and no node of its own. Area is span x
 * chord (`membraneArea`, decision 610); damage tears it a
 * unit per 3 points; a cut through any segment of the cycle tears it whole.
 * Nothing here draws the rng: cycles are enumerated and listed by id.
 */
import type { Body, Membrane, MembraneKind } from "./graph.js";
import { otherEnd, segmentIds, sortedIds, touch } from "./graph.js";
import { MEMBRANES } from "./parts.js";

export const MEMBRANE_MIN = 3;
export const MEMBRANE_MAX = 6;
/** Every 3 points of damage tear 1 of area (§10). */
const MEMBRANE_WEAR = 3;

/**
 * The nodes a cycle of segment ids walks through, in order, when it is a
 * simple cycle of 3..6 live segments: consecutive segments share a node, the
 * last closes on the first, and no node repeats. Null otherwise.
 */
export function cycleNodes(body: Body, cycle: readonly number[]): number[] | null {
  if (cycle.length < MEMBRANE_MIN || cycle.length > MEMBRANE_MAX) return null;
  if (new Set(cycle).size !== cycle.length) return null;
  const segs = cycle.map((id) => body.segments[id]);
  if (segs.some((s) => s === undefined)) return null;
  const first = segs[0]!;
  const second = segs[1]!;
  // The node shared by the first two segments starts the walk from the other end of the first.
  let start: number;
  if (first.a === second.a || first.a === second.b) start = first.b;
  else if (first.b === second.a || first.b === second.b) start = first.a;
  else return null;
  const nodes: number[] = [];
  let at = start;
  for (const s of segs) {
    if (s!.a !== at && s!.b !== at) return null;
    nodes.push(at);
    at = otherEnd(s!, at);
  }
  if (at !== start) return null;
  if (new Set(nodes).size !== nodes.length) return null;
  return nodes;
}

export function isSimpleCycle(body: Body, cycle: readonly number[]): boolean {
  return cycleNodes(body, cycle) !== null;
}

/**
 * The nodes a span of 2..6 segments walks through, root first, when they are
 * one open chain: consecutive segments share a node, no node repeats, and the
 * ends do not meet. Null otherwise. A wing is stretched over such a span.
 */
export function spanNodes(body: Body, span: readonly number[]): number[] | null {
  if (span.length < 2 || span.length > MEMBRANE_MAX) return null;
  if (new Set(span).size !== span.length) return null;
  const segs = span.map((id) => body.segments[id]);
  if (segs.some((s) => s === undefined)) return null;
  const first = segs[0]!;
  const second = segs[1]!;
  let at: number;
  if (first.a === second.a || first.a === second.b) at = first.b;
  else if (first.b === second.a || first.b === second.b) at = first.a;
  else return null;
  const nodes: number[] = [at];
  for (const s of segs) {
    if (s!.a !== at && s!.b !== at) return null;
    at = otherEnd(s!, at);
    nodes.push(at);
  }
  return new Set(nodes).size === nodes.length ? nodes : null;
}

/**
 * The span a membrane hangs on, when it hangs on one: null for a membrane
 * stretched over a cycle. Every kind may hang on a bent limb, not the wing
 * alone (decision 320): the wing got the span with decision 121 and the other
 * five kinds were left on cycles, where a grown body almost never has one.
 */
function membraneSpan(body: Body, m: Pick<Membrane, "kind" | "cycle">): number[] | null {
  return spanNodes(body, m.cycle);
}

/** The old name of `membraneSpan`: the layout and the rig still call it. */
export const wingSpan = membraneSpan;

/** A membrane lies on a span of one bent limb, or on a cycle of 3..6 segments. */
export function membraneNodes(body: Body, m: Pick<Membrane, "kind" | "cycle">): number[] | null {
  return membraneSpan(body, m) ?? cycleNodes(body, m.cycle);
}

/** The span or the cycle, in one spelling: a span runs from its root, a cycle from its smallest id. */
function canonicalSpan(body: Body, span: readonly number[]): number[] {
  const nodes = spanNodes(body, span);
  if (nodes === null) return [...span];
  const first = body.segments[span[0]!]!;
  return nodes[0] === first.a || nodes[0] === first.b ? [...span] : [...span].reverse();
}

/** One spelling per cycle: it starts at its smallest segment id and runs toward the smaller of that segment's two neighbours. */
export function canonicalCycle(cycle: readonly number[]): number[] {
  const n = cycle.length;
  let min = 0;
  for (let i = 1; i < n; i++) if (cycle[i]! < cycle[min]!) min = i;
  const forward: number[] = [];
  const backward: number[] = [];
  for (let k = 0; k < n; k++) {
    forward.push(cycle[(min + k) % n]!);
    backward.push(cycle[(min - k + n) % n]!);
  }
  return forward[1]! <= backward[1]! ? forward : backward;
}

function sameCycle(x: readonly number[], y: readonly number[]): boolean {
  if (x.length !== y.length) return false;
  const a = canonicalCycle(x);
  const b = canonicalCycle(y);
  return a.every((id, i) => id === b[i]);
}

/** Every simple cycle of 3..6 segments, canonical, sorted by id. A multigraph's parallel pair is a cycle of 2 and is not listed. */
export function simpleCycles(body: Body, maxLen = MEMBRANE_MAX): number[][] {
  const adj = new Map<number, number[]>();
  for (const id of segmentIds(body)) {
    const s = body.segments[id]!;
    for (const n of [s.a, s.b]) {
      const list = adj.get(n);
      if (list === undefined) adj.set(n, [id]);
      else list.push(id);
    }
  }
  const found: number[][] = [];
  const seen = new Set<string>();
  const ids = segmentIds(body);
  // Walk from every segment as the smallest id of its cycle, only through larger ids.
  for (const startSeg of ids) {
    const s0 = body.segments[startSeg]!;
    const startNode = s0.a;
    const path: number[] = [startSeg];
    const visited = new Set<number>([startNode, s0.b]);
    const walk = (at: number): void => {
      for (const sid of adj.get(at) ?? []) {
        if (sid <= startSeg || path.includes(sid)) continue;
        const next = otherEnd(body.segments[sid]!, at);
        if (next === startNode) {
          if (path.length + 1 >= MEMBRANE_MIN) {
            const cycle = canonicalCycle([...path, sid]);
            const key = cycle.join(",");
            if (!seen.has(key)) {
              seen.add(key);
              found.push(cycle);
            }
          }
          continue;
        }
        if (visited.has(next) || path.length + 1 >= maxLen) continue;
        visited.add(next);
        path.push(sid);
        walk(next);
        path.pop();
        visited.delete(next);
      }
    };
    walk(s0.b);
  }
  return found.sort((x, y) => {
    for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i]! - y[i]!;
    return x.length - y.length;
  });
}

/**
 * The mean chord of a span membrane as a share of its span. The trailing edge
 * is drawn bulging `0.55 x span` at the middle and closing at both ends over a
 * sine (`membraneShape` in layout.ts), so its mean depth is `0.55 x 2 / pi`.
 */
const MEMBRANE_CHORD = 0.35;

/**
 * Full area - span x chord, decision 610.
 *
 * A membrane on a **cycle** is the polygon of its nodes: the graph pins every
 * corner, there is no free edge, and its area is the walk it closes - the sum
 * of the lengths, as it always was.
 *
 * A membrane on a **span** is a wing: it runs along one bent limb and falls
 * back in a free trailing edge. Its span is the reach along the limb, and its
 * chord is what the picture already draws - `MEMBRANE_CHORD x span` of free
 * skin, plus the limb's own girth, which the skin wraps. So a wing grows with
 * the square of the limb it hangs on and with how thick that limb is, instead
 * of counting the lengths twice over. Rounded: an area is a whole number, it
 * goes into the hash and it wears off a unit at a time.
 */
export function membraneArea(body: Body, m: Membrane): number {
  let span = 0;
  let flesh = 0;
  for (const id of m.cycle) {
    const s = body.segments[id];
    if (s === undefined) continue;
    span += s.length;
    flesh += s.length * s.girth;
  }
  return membraneSpan(body, m) === null ? span : Math.round(MEMBRANE_CHORD * span * span + flesh);
}

/** Membranes whose cycle runs through the segment, ascending. */
export function membranesOn(body: Body, segId: number): number[] {
  return sortedIds(body.membranes).filter((id) => body.membranes[id]!.cycle.includes(segId));
}

export function hasMembraneOn(body: Body, cycle: readonly number[]): boolean {
  return Object.values(body.membranes).some((m) => sameCycle(m.cycle, cycle) || (m.cycle.length === cycle.length && m.cycle.every((id) => cycle.includes(id))));
}

/** Stretches a membrane over a cycle or over the span of one bent limb; throws when the walk is neither, or already carries one. */
export function addMembrane(body: Body, cycle: readonly number[], kind: MembraneKind): number {
  if (MEMBRANES[kind] === undefined) throw new Error(`addMembrane: unknown kind ${String(kind)}`);
  const span = spanNodes(body, cycle) !== null;
  if (!span && !isSimpleCycle(body, cycle)) throw new Error(`addMembrane: [${cycle.join(", ")}] is neither a simple cycle of ${MEMBRANE_MIN}..${MEMBRANE_MAX} segments nor a limb's span`);
  if (hasMembraneOn(body, cycle)) throw new Error(`addMembrane: [${cycle.join(", ")}] already carries a membrane`);
  const id = body.nextId++;
  const m: Membrane = { id, kind, cycle: span ? canonicalSpan(body, cycle) : canonicalCycle(cycle), area: 0 };
  m.area = membraneArea(body, m);
  body.membranes[id] = m;
  touch(body);
  return id;
}

/** Damage to a membrane: every 3 points tear 1 of area; at 0 it is gone. */
export function wearMembrane(body: Body, id: number, damage: number): { area: number; torn: boolean } {
  const m = body.membranes[id];
  if (m === undefined) throw new Error(`wearMembrane: membrane ${id} does not exist`);
  m.area = Math.max(0, m.area - Math.floor(damage / MEMBRANE_WEAR));
  const torn = m.area <= 0;
  if (torn) delete body.membranes[id];
  touch(body);
  return { area: m.area, torn };
}

/** Membranes that would tear if these segments were cut or lost. */
export function membranesTornBy(body: Body, segments: Iterable<number>): number[] {
  const lost = new Set(segments);
  return sortedIds(body.membranes).filter((id) => body.membranes[id]!.cycle.some((s) => lost.has(s)));
}

/**
 * Drops every membrane whose cycle no longer holds (a segment gone, a node
 * merged or replaced by a stump) and trims area to what the cycle allows.
 * Returns the ids torn, ascending.
 */
export function tearMembranes(body: Body): number[] {
  const torn: number[] = [];
  for (const id of sortedIds(body.membranes)) {
    const m = body.membranes[id]!;
    if (membraneNodes(body, m) === null) {
      delete body.membranes[id];
      torn.push(id);
      continue;
    }
    const full = membraneArea(body, m);
    if (m.area > full) m.area = full;
  }
  if (torn.length > 0) touch(body);
  return torn;
}

/** Writes a walk into a membrane in its own spelling - a span stays a span, a cycle a cycle; false when the walk is no place for it. */
function reseat(body: Body, m: Membrane, walk: readonly number[]): boolean {
  if (spanNodes(body, walk) !== null) {
    m.cycle = canonicalSpan(body, walk);
    return true;
  }
  if (cycleNodes(body, walk) === null) return false;
  m.cycle = canonicalCycle(walk);
  return true;
}

/** A segment split by a joint: the new half joins every membrane the old one was in, on the side it fits; over 6 the membrane tears. */
export function splitInMembranes(body: Body, segId: number, newSegId: number): number[] {
  const torn: number[] = [];
  for (const id of membranesOn(body, segId)) {
    const m = body.membranes[id]!;
    const i = m.cycle.indexOf(segId);
    let done = false;
    for (const at of [i + 1, i]) {
      const walk = [...m.cycle];
      walk.splice(at, 0, newSegId);
      if (walk.length <= MEMBRANE_MAX && reseat(body, m, walk)) {
        done = true;
        break;
      }
    }
    if (done) continue;
    delete body.membranes[id];
    torn.push(id);
  }
  if (torn.length > 0) touch(body);
  return torn;
}

/** A segment stretched or shortened: the skin follows, within the walk's full area. */
export function stretchInMembranes(body: Body, segId: number, delta: number): void {
  for (const id of membranesOn(body, segId)) {
    const m = body.membranes[id]!;
    m.area = Math.max(0, Math.min(m.area + delta, membraneArea(body, m)));
  }
}

/**
 * A segment thinned: the skin over it keeps the wear it has and no more area
 * than the walk now allows. Girth entered the area with decision 610, so a
 * limb that loses girth loses wing with it - before that only length did.
 */
export function trimMembranesOn(body: Body, segId: number): void {
  stretchInMembranes(body, segId, 0);
}

/**
 * Segments merged into others or gone (null): every membrane cycle follows
 * the map, a segment already in the cycle is not written twice, and a cycle
 * that no longer closes on 3..6 live segments tears (a torso merged, a neck
 * contracted). Returns the ids torn, ascending.
 */
export function remapMembranes(body: Body, map: ReadonlyMap<number, number | null>): number[] {
  const torn: number[] = [];
  for (const id of sortedIds(body.membranes)) {
    const m = body.membranes[id]!;
    if (!m.cycle.some((s) => map.has(s))) continue;
    const cycle: number[] = [];
    for (const s of m.cycle) {
      const to = map.has(s) ? map.get(s)! : s;
      if (to !== null && !cycle.includes(to)) cycle.push(to);
    }
    if (!reseat(body, m, cycle)) {
      delete body.membranes[id];
      torn.push(id);
      continue;
    }
    m.area = Math.min(m.area, membraneArea(body, m));
  }
  if (torn.length > 0) touch(body);
  return torn;
}
