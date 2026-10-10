/**
 * Read-only arithmetic over the graph: distance is the nerve, connectivity is
 * the blood, bridges are where a cut divides, closure counts cycles. Nothing
 * here changes a body. All walks go by ascending id.
 */
import type { Body, Organ, Place } from "./graph.js";
import { brainAt, isBrainKind, nodeIds, otherEnd, segmentIds, selfElement, selfRef, sortedIds } from "./graph.js";
import { membraneArea, membraneNodes } from "./membrane.js";
import { HEAD_SLOTS, MEMBRANES, ORGANS, SEGMENT_KINDS, COVERS, SPREAD, capacity, cavityLoad, mass, organMass, segmentMass } from "./parts.js";
import { FLANK_T_MAX, cavitySlots, flankHost, isFlank, sideSlots } from "./flank.js";

export interface Part {
  nodes: number[];
  segments: number[];
}

/** node id -> segment ids touching it, ascending. Nodes without segments map to []. */
export function adjacency(body: Body): Map<number, number[]> {
  const adj = new Map<number, number[]>();
  for (const id of nodeIds(body)) adj.set(id, []);
  for (const id of segmentIds(body)) {
    const s = body.segments[id]!;
    adj.get(s.a)?.push(id);
    adj.get(s.b)?.push(id);
  }
  return adj;
}

/**
 * Shortest path by segment lengths from a place to every reachable node.
 * From a node the node itself is at 0; from a segment (a brain in a cavity)
 * both ends are at half its length.
 */
export function distances(body: Body, from: Place): Record<number, number> {
  const seeds: Record<number, number> = {};
  if ("node" in from) {
    if (body.nodes[from.node] !== undefined) seeds[from.node] = 0;
  } else {
    const s = body.segments[from.segment];
    if (s !== undefined) {
      seeds[s.a] = s.length / 2;
      seeds[s.b] = s.length / 2;
    }
  }
  return distancesFrom(body, seeds);
}

/** The same walk from several nodes at once, each starting at its own distance: every node gets the nearest. */
export function distancesFrom(body: Body, seeds: Readonly<Record<number, number>>): Record<number, number> {
  const dist: Record<number, number> = {};
  for (const k of sortedIds(seeds)) if (body.nodes[k] !== undefined) dist[k] = seeds[k]!;
  const done = new Set<number>();
  const adj = adjacency(body);
  for (;;) {
    let best = -1;
    let bestD = Infinity;
    for (const id of sortedIds(dist)) {
      if (done.has(id)) continue;
      const d = dist[id]!;
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    if (best < 0) break;
    done.add(best);
    for (const sid of adj.get(best) ?? []) {
      const s = body.segments[sid]!;
      const other = otherEnd(s, best);
      const d = bestD + s.length;
      const cur = dist[other];
      if (cur === undefined || d < cur) dist[other] = d;
    }
  }
  return dist;
}

/** Distance of an element: the node itself, or the near end of a segment. */
export function elementDistance(dist: Record<number, number>, body: Body, id: number): number | undefined {
  if (body.nodes[id] !== undefined) return dist[id];
  const s = body.segments[id];
  if (s === undefined) return undefined;
  const da = dist[s.a];
  const db = dist[s.b];
  if (da === undefined) return db;
  if (db === undefined) return da;
  return Math.min(da, db);
}

/** Connected components, each with sorted nodes and segments, ordered by their smallest node. */
export function components(body: Body): Part[] {
  const adj = adjacency(body);
  const seen = new Set<number>();
  const parts: Part[] = [];
  for (const start of nodeIds(body)) {
    if (seen.has(start)) continue;
    const nodes: number[] = [];
    const segs = new Set<number>();
    const stack = [start];
    seen.add(start);
    while (stack.length > 0) {
      const n = stack.pop()!;
      nodes.push(n);
      for (const sid of adj.get(n) ?? []) {
        segs.add(sid);
        const other = otherEnd(body.segments[sid]!, n);
        if (!seen.has(other)) {
          seen.add(other);
          stack.push(other);
        }
      }
    }
    parts.push({ nodes: nodes.sort((x, y) => x - y), segments: [...segs].sort((x, y) => x - y) });
  }
  return parts;
}

/** Bridges by Tarjan, tracking the parent edge so parallel segments never count as bridges. */
export function bridges(body: Body): number[] {
  const adj = adjacency(body);
  const disc = new Map<number, number>();
  const low = new Map<number, number>();
  const out: number[] = [];
  let time = 0;

  const visit = (n: number, parentEdge: number): void => {
    disc.set(n, time);
    low.set(n, time);
    time += 1;
    for (const sid of adj.get(n) ?? []) {
      if (sid === parentEdge) continue;
      const other = otherEnd(body.segments[sid]!, n);
      const d = disc.get(other);
      if (d === undefined) {
        visit(other, sid);
        low.set(n, Math.min(low.get(n)!, low.get(other)!));
        if (low.get(other)! > disc.get(n)!) out.push(sid);
      } else {
        low.set(n, Math.min(low.get(n)!, d));
      }
    }
  };

  for (const n of nodeIds(body)) if (!disc.has(n)) visit(n, -1);
  return out.sort((x, y) => x - y);
}

/** Number of independent cycles: segments - nodes + components. */
export function closure(body: Body): number {
  return segmentIds(body).length - nodeIds(body).length + components(body).length;
}

/** Whether the list (heads included) holds a heart, or a kind that thinks. */
export function hasKind(list: Organ[], kind: "heart" | "brain"): boolean {
  for (const o of list) {
    if (kind === "brain" ? isBrainKind(o.kind) : o.kind === kind) return true;
    if (o.contents && hasKind(o.contents, kind)) return true;
  }
  return false;
}

/** Segments whose cavity holds a heart and whose integrity lets it pump. */
export function hearts(body: Body): number[] {
  const out: number[] = [];
  for (const id of segmentIds(body)) {
    const s = body.segments[id]!;
    if (s.hp > 0 && hasKind(s.cavity, "heart")) out.push(id);
  }
  return out;
}

export function heartsIn(body: Body, part: Part): boolean {
  for (const s of part.segments) {
    const seg = body.segments[s]!;
    if (seg.hp > 0 && hasKind(seg.cavity, "heart")) return true;
  }
  return false;
}

/**
 * Elements (nodes and segments) with a path to a working heart. Blood passes
 * only through intact elements: a broken node or segment is reached, but
 * feeds nothing beyond itself. A cycle is a bypass for free.
 */
export function fed(body: Body): Set<number> {
  const out = new Set<number>();
  const stack: number[] = [];
  for (const h of hearts(body)) {
    out.add(h);
    stack.push(h);
  }
  const adj = adjacency(body);
  while (stack.length > 0) {
    const id = stack.pop()!;
    const seg = body.segments[id];
    if (seg !== undefined) {
      if (seg.hp <= 0) continue;
      for (const n of [seg.a, seg.b]) {
        if (!out.has(n)) {
          out.add(n);
          stack.push(n);
        }
      }
    } else {
      const node = body.nodes[id]!;
      if (node.hp <= 0) continue;
      for (const s of adj.get(id) ?? []) {
        if (!out.has(s)) {
          out.add(s);
          stack.push(s);
        }
      }
    }
  }
  return out;
}

/**
 * Elements the blood still reaches, and so the body still runs on: `fed`,
 * or everything when no heart beats at all - such a body is dying, not
 * severed, and its parts are all equally its own. What falls out of this
 * set is dead weight (damage.md §3): it eats nothing, holds no blood, asks
 * for no channels, strikes with nothing and senses nothing.
 */
export function bloodReach(body: Body): Set<number> {
  if (hearts(body).length === 0) return new Set([...nodeIds(body), ...segmentIds(body)]);
  return fed(body);
}

/** Mass of what the blood reaches: the blood a body holds is made of living flesh alone. */
export function livingMass(body: Body, live: ReadonlySet<number> = bloodReach(body)): number {
  let m = 0;
  for (const id of segmentIds(body)) {
    if (!live.has(id)) continue;
    const s = body.segments[id]!;
    m += segmentMass(s);
    for (const o of s.cavity) m += organMass(o);
    for (const o of s.growths) m += organMass(o);
  }
  for (const id of nodeIds(body)) {
    if (!live.has(id)) continue;
    for (const o of body.nodes[id]!.ends) m += organMass(o);
  }
  return m;
}

/** An element works while it is intact and has not been starved for 10 turns. */
export function works(body: Body, id: number): boolean {
  const el = body.nodes[id] ?? body.segments[id];
  if (el === undefined) return false;
  return el.hp > 0 && el.ischemia < 10;
}

function checkOrgan(o: Organ, mount: string, where: string, errors: string[]): void {
  const spec = ORGANS[o.kind] as (typeof ORGANS)[keyof typeof ORGANS] | undefined;
  if (spec === undefined) {
    errors.push(`${where}: unknown organ ${String(o.kind)}`);
    return;
  }
  if (!(spec.mounts as string[]).includes(mount)) errors.push(`${where}: ${o.kind} cannot mount as ${mount}`);
  if (o.contents !== undefined) {
    if (o.kind !== "head") errors.push(`${where}: ${o.kind} has contents but is not a head`);
    const counts = new Map<string, number>();
    for (const c of o.contents) {
      checkOrgan(c, "head", `${where} head`, errors);
      counts.set(c.kind, (counts.get(c.kind) ?? 0) + 1);
    }
    for (const [kind, n] of counts) {
      const max = HEAD_SLOTS[kind as keyof typeof HEAD_SLOTS];
      if (max !== undefined && n > max) errors.push(`${where} head: ${n} x ${kind} over ${max} places`);
    }
  }
  if (!(o.instability >= 0 && o.instability <= 100)) errors.push(`${where}: instability ${o.instability} out of 0..100`);
  if (o.sway !== undefined) {
    if (!isBrainKind(o.kind)) errors.push(`${where}: sway on a ${o.kind}, only a brain has sway`);
    else if (!(Number.isInteger(o.sway) && o.sway >= 0 && o.sway <= 10)) errors.push(`${where}: sway ${o.sway} out of 0..10`);
  }
  if (o.wander !== undefined) {
    if (mount !== "end") errors.push(`${where}: ${o.kind} wanders but is not an ending`);
    else if (!(Number.isInteger(o.wander) && o.wander >= 1 && o.wander <= 40)) errors.push(`${where}: wander ${o.wander} out of 1..40`);
  }
}

/** The player's brain: the one `self` names, or the first brain of the self element. */
export function selfBrain(body: Body): Organ | undefined {
  const ref = selfRef(body);
  return ref === undefined ? undefined : brainAt(body, ref);
}

/**
 * The longest a cover front may count down (decision 321): its own period,
 * times what the hardest cover in front of it costs - `SPREAD.coverResist`
 * plus that cover's armour. The number lives in `parts.ts` so that this file
 * and `spread.ts` read the same one without importing each other.
 */
const COVER_FRONT_MAX = SPREAD.coverTurns * (SPREAD.coverResist + Math.max(...Object.values(COVERS).map((c) => c.defense)));

/**
 * What `validate` may leave out. The text reads a body as the server holds it
 * (decisions 980-981): a place whose brain was destroyed, and mass over the
 * meat that gear puts on, are states of a body in play, not a malformed graph.
 */
interface ValidateOptions {
  /** Check that `self` holds a brain. Default true. */
  self?: boolean;
  /** Check that mass stays within meat. Default true. */
  meat?: boolean;
}

/** Everything §19 promises about a body with one brain. Empty means the body is sound. */
export function validate(body: Body, opts: ValidateOptions = {}): string[] {
  const errors: string[] = [];
  const nIds = nodeIds(body);
  const sIds = segmentIds(body);
  const ids = new Set<number>();
  for (const id of [...nIds, ...sIds, ...sortedIds(body.membranes)]) {
    if (ids.has(id)) errors.push(`id ${id} is used twice`);
    ids.add(id);
    if (id >= body.nextId) errors.push(`nextId ${body.nextId} is not above id ${id}`);
  }
  for (const id of nIds) {
    const n = body.nodes[id]!;
    const where = `node ${id}`;
    if (n.id !== id) errors.push(`${where}: key does not match id ${n.id}`);
    if (![1, 2, 3].includes(n.size)) errors.push(`${where}: size ${n.size} out of 1..3`);
    if (n.ends.length > n.size) errors.push(`${where}: ${n.ends.length} ends over size ${n.size}`);
    for (const e of n.ends) checkOrgan(e, "end", where, errors);
  }
  const perNode = new Map<number, number>();
  for (const id of sIds) {
    const s = body.segments[id]!;
    const where = `segment ${id}`;
    if (s.id !== id) errors.push(`${where}: key does not match id ${s.id}`);
    for (const end of [s.a, s.b]) {
      if (body.nodes[end] === undefined) errors.push(`${where}: endpoint ${end} does not exist`);
      // A flank is a side node's link, not a slot of the host's end; the side node pays for it like any segment.
      else if (!isFlank(s) || end === s.b) perNode.set(end, (perNode.get(end) ?? 0) + 1);
    }
    if (s.a === s.b) errors.push(`${where}: joins node ${s.a} to itself`);
    if (SEGMENT_KINDS[s.kind] === undefined) errors.push(`${where}: unknown kind ${String(s.kind)}`);
    if (COVERS[s.cover] === undefined) errors.push(`${where}: unknown cover ${String(s.cover)}`);
    if (isFlank(s)) {
      if (s.length !== 0 || s.girth !== 1) errors.push(`${where}: a flank is 0/1, not ${s.length}/${s.girth}`);
      if (s.growths.length > 0) errors.push(`${where}: growths on a flank`);
      const p = s.place;
      if (p !== undefined && !(p.t >= 0 && p.t <= FLANK_T_MAX && (p.side === -1 || p.side === 1))) errors.push(`${where}: place ${p.t}/${p.side} out of 0..${FLANK_T_MAX}, -1 or 1`);
    } else if (!(Number.isInteger(s.length) && s.length >= 1 && s.length <= 6)) errors.push(`${where}: length ${s.length} out of 1..6`);
    if (!(Number.isInteger(s.girth) && s.girth >= 1 && s.girth <= 6)) errors.push(`${where}: girth ${s.girth} out of 1..6`);
    if (s.cavity.length > cavitySlots(s)) errors.push(`${where}: ${s.cavity.length} cavity organs on a ${s.kind}, which holds ${cavitySlots(s)}`);
    if (cavityLoad(s) > capacity(s)) errors.push(`${where}: cavity load ${cavityLoad(s)} over capacity ${capacity(s)}`);
    for (const o of s.cavity) checkOrgan(o, "cavity", where, errors);
    for (const o of s.growths) checkOrgan(o, "growth", where, errors);
    // A segment holds as many side nodes as its places, and no more (decision 1258): a place that names a
    // segment with no place left for it is a side node over the places.
    if (isFlank(s) && s.place !== undefined) {
      const h = body.segments[s.place.host];
      const named = h !== undefined && !isFlank(h) && (h.a === s.a || h.b === s.a);
      if (named && flankHost(body, id) !== s.place.host) errors.push(`${where}: its place names segment ${s.place.host}, whose ${sideSlots(h)} places are taken`);
    }
  }
  for (const id of nIds) {
    const n = body.nodes[id]!;
    const count = perNode.get(id) ?? 0;
    if (count > 2 * n.size) errors.push(`node ${id}: ${count} segments over 2 x size ${n.size}`);
  }
  for (const id of sortedIds(body.membranes)) {
    const m = body.membranes[id]!;
    const where = `membrane ${id}`;
    if (m.id !== id) errors.push(`${where}: key does not match id ${m.id}`);
    if (MEMBRANES[m.kind] === undefined) errors.push(`${where}: unknown kind ${String(m.kind)}`);
    // A wing lies on one bent limb (a span of 2..6 segments); every other membrane on a simple cycle of 3..6.
    if (membraneNodes(body, m) === null) errors.push(`${where}: [${m.cycle.join(", ")}] is neither a simple cycle of 3..6 live segments nor a wing's span`);
    else if (!(m.area >= 0 && m.area <= membraneArea(body, m))) errors.push(`${where}: area ${m.area} out of 0..${membraneArea(body, m)}`);
  }
  for (const r of body.regrowth ?? []) {
    if (body.nodes[r.at] === undefined) errors.push(`regrowth at node ${r.at}, which does not exist`);
    if (!(Number.isInteger(r.turns) && r.turns >= 1)) errors.push(`regrowth at node ${r.at}: turns ${r.turns}`);
  }
  for (const f of body.fronts ?? []) {
    const where = `cover front of ${String(f.cover)}`;
    if (COVERS[f.cover] === undefined || f.cover === "skin" || f.cover === "chrome") errors.push(`${where}: not a cover that creeps`);
    if (!(Number.isInteger(f.turns) && f.turns >= 1 && f.turns <= COVER_FRONT_MAX)) errors.push(`${where}: turns ${f.turns} out of 1..${COVER_FRONT_MAX}`);
  }
  if (body.pressure !== undefined && !(Number.isInteger(body.pressure) && body.pressure >= 1 && body.pressure <= SPREAD.pressureTurns)) {
    errors.push(`tumour pressure in ${body.pressure} turns, out of 1..${SPREAD.pressureTurns}`);
  }
  const selfId = selfElement(body);
  const selfIndex = "node" in body.self ? body.self.end : body.self.slot;
  if (opts.self === false) {
    // No brain is asked for; the place is kept as it is.
  } else if (body.nodes[selfId] === undefined && body.segments[selfId] === undefined) errors.push(`self element ${selfId} does not exist`);
  else if (selfBrain(body) === undefined) {
    errors.push(selfIndex === undefined ? `self element ${selfId} holds no brain` : `self index ${selfIndex} of element ${selfId} holds no brain`);
  }
  if (nIds.length > 0) {
    const parts = components(body);
    if (parts.length !== 1) errors.push(`body is not connected: ${parts.length} components`);
  }
  const m = mass(body);
  if (opts.meat !== false && m > body.meat + 1e-9) errors.push(`mass ${m} over meat ${body.meat}`);
  return errors;
}
