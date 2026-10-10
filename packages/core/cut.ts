/**
 * One rule for everything that comes apart: after a cut the body is its
 * connected components, yours is the one with your brain, the rest leave in
 * the same turn. The preview and the real cut are the same computation.
 *
 * A segment is cut at a chosen end and stays with the far side. When that
 * side is yours (a cycle, or the near part was the one cut off) the severed
 * end gets a stump: a fresh empty node of size 1 carrying the wound.
 */
import type { Body, BodyNode, End, OrganKind, Segment } from "./graph.js";
import { brainRefsIn, isBrainKind, makeNode, nodeIds, otherEnd, segmentIds, selfElement, touch } from "./graph.js";
import { BRAIN_DEATH_TURNS, brainAlive } from "./brains.js";
import { membranesTornBy, tearMembranes } from "./membrane.js";
import { adjacency, bridges, fed, type Part } from "./metrics.js";
import { organMass, segmentMass } from "./parts.js";

export type Fate = "creature" | "brainOnly" | "heartOnly" | "meat";

export interface CutPreview {
  yours: Part;
  others: { part: Part; fate: Fate }[];
  /** Ids of the wound faces that bleed: the cut node on a fed side, the segment on a fed side. */
  bleeding: number[];
  /** Id the stump will get, when the segment stays with you. */
  stump: number | null;
  /** Membranes torn: every one whose cycle runs through the cut segment or a segment that leaves. */
  torn: number[];
}

export interface CutResult extends CutPreview {
  removed: { nodes: BodyNode[]; segments: Segment[] };
}

const byId = (x: number, y: number): number => x - y;

/** Connected components of the body with one segment ignored. */
function partsWithout(body: Body, segId: number): Part[] {
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
        if (sid === segId) continue;
        segs.add(sid);
        const other = otherEnd(body.segments[sid]!, n);
        if (!seen.has(other)) {
          seen.add(other);
          stack.push(other);
        }
      }
    }
    parts.push({ nodes: nodes.sort(byId), segments: [...segs].sort(byId) });
  }
  return parts;
}

function hasKind(body: Body, part: Part, kind: "brain" | "heart", workingOnly: boolean): boolean {
  const is = (o: { kind: OrganKind }): boolean => (kind === "brain" ? isBrainKind(o.kind) : o.kind === kind);
  const inList = (list: { kind: OrganKind; contents?: { kind: OrganKind }[] }[]): boolean =>
    list.some((o) => is(o) || o.contents?.some(is));
  for (const n of part.nodes) if (inList(body.nodes[n]!.ends)) return true;
  for (const s of part.segments) {
    const seg = body.segments[s]!;
    if (workingOnly && seg.hp <= 0) continue;
    if (inList(seg.cavity)) return true;
  }
  return false;
}

/** What a part is once it is on its own: by the brain and the heart it holds (body-graph.md §6). */
export function fateOf(body: Body, part: Part): Fate {
  const brain = hasKind(body, part, "brain", false);
  const heart = hasKind(body, part, "heart", false);
  if (brain && heart) return "creature";
  if (brain) return "brainOnly";
  if (heart) return "heartOnly";
  return "meat";
}

interface Plan extends CutPreview {
  near: number;
  keeps: boolean;
}

function plan(body: Body, segId: number, end: End): Plan {
  const seg = body.segments[segId];
  if (seg === undefined) throw new Error(`cut: segment ${segId} does not exist`);
  const near = end === "a" ? seg.a : seg.b;
  const far = otherEnd(seg, near);
  const parts = partsWithout(body, segId);
  const selfId = selfElement(body);
  const selfNode =
    body.nodes[selfId] !== undefined ? selfId : selfId === segId ? far : body.segments[selfId]!.a;
  const indexOf = (node: number): number => parts.findIndex((p) => p.nodes.includes(node));
  const yoursIdx = indexOf(selfNode);
  const farIdx = indexOf(far);
  const nearIdx = indexOf(near);
  const farPart = parts[farIdx]!;
  farPart.segments = [...farPart.segments, segId].sort(byId);
  const keeps = farIdx === yoursIdx;
  const others = parts
    .map((part, i) => ({ part, i }))
    .filter(({ i }) => i !== yoursIdx)
    .map(({ part }) => ({ part, fate: fateOf(body, part) }));
  const bleeding: number[] = [];
  if (hasKind(body, parts[nearIdx]!, "heart", true)) bleeding.push(near);
  if (hasKind(body, farPart, "heart", true)) bleeding.push(segId);
  const stump = keeps ? body.nextId : null;
  const mine = parts[yoursIdx]!;
  const yours: Part = stump === null ? mine : { nodes: [...mine.nodes, stump].sort(byId), segments: mine.segments };
  const torn = membranesTornBy(body, [segId, ...others.flatMap((o) => o.part.segments)]);
  return { yours, others, bleeding: bleeding.sort(byId), stump, torn, near, keeps };
}

/** What a cut would do, without doing it. */
export function cutPreview(body: Body, segId: number, end: End): CutPreview {
  const { yours, others, bleeding, stump, torn } = plan(body, segId, end);
  return { yours, others, bleeding, stump, torn };
}

/** Cuts the segment at the given end; everything without your brain leaves the body. */
export function cut(body: Body, segId: number, end: End): CutResult {
  const p = plan(body, segId, end);
  const removed: CutResult["removed"] = { nodes: [], segments: [] };
  let lost = 0;
  for (const { part } of p.others) {
    for (const s of part.segments) {
      const seg = body.segments[s]!;
      removed.segments.push(seg);
      lost += segmentMass(seg);
      for (const o of [...seg.cavity, ...seg.growths]) lost += organMass(o);
      delete body.segments[s];
    }
    for (const n of part.nodes) {
      const node = body.nodes[n]!;
      removed.nodes.push(node);
      for (const o of node.ends) lost += organMass(o);
      delete body.nodes[n];
    }
  }
  if (p.keeps) {
    const stump = makeNode(body.nextId++, 1, { wound: 20 });
    body.nodes[stump.id] = stump;
    const seg = body.segments[segId]!;
    if (end === "a") seg.a = stump.id;
    else seg.b = stump.id;
  }
  const nearNode = body.nodes[p.near];
  if (nearNode !== undefined) nearNode.wound = 20;
  for (const id of p.torn) delete body.membranes[id];
  tearMembranes(body);
  body.meat -= lost;
  touch(body);
  return { yours: p.yours, others: p.others, bleeding: p.bleeding, stump: p.stump, torn: p.torn, removed };
}

/** A bridge with its break plane, and not the segment you live in. */
export function canAutotomize(body: Body, segId: number): boolean {
  const seg = body.segments[segId];
  if (seg === undefined || !seg.breakPlane) return false;
  if (selfElement(body) === segId) return false;
  return bridges(body).includes(segId);
}

/** Casts off everything beyond the bridge: a cut at the end near you. */
export function autotomy(body: Body, segId: number): CutResult | null {
  if (!canAutotomize(body, segId)) return null;
  const seg = body.segments[segId]!;
  const selfId = selfElement(body);
  const selfNode = body.nodes[selfId] !== undefined ? selfId : body.segments[selfId]!.a;
  const parts = partsWithout(body, segId);
  const yours = parts.find((p) => p.nodes.includes(selfNode))!;
  return cut(body, segId, yours.nodes.includes(seg.a) ? "a" : "b");
}

/**
 * When a part with no blood comes off (body-graph.md §6, decision 596).
 *
 * Plain flesh rots off long after it stopped being anything: its organs die at
 * 40 and the limb drops at 80. A part that still **thinks** does not wait for
 * that. It comes off on the last turn its brain is alive, still whole, and
 * walks away as a creature of its own.
 *
 * The two used to sit the other way round, and that killed half a mechanic
 * without anyone noticing: a part torn loose by starvation was necrotic forty
 * turns before it fell, so what fell was always empty. `fateOfFallen` in the
 * damage track reads the fate honestly and could therefore only ever answer
 * `meat` - starvation never once produced a servant, on any body, in any
 * fight.
 */
export const FALL = {
  /** A part that still thinks: the last turn before `BRAIN_DEATH_TURNS`. */
  brained: BRAIN_DEATH_TURNS - 1,
  /** Plain flesh: it rots. */
  rot: 80,
} as const;

export interface IschemiaEvents {
  /** Your brain has gone 5 turns without blood. */
  brainDead: boolean;
  /** Elements whose organs died this turn (40 turns). */
  necrotic: number[];
  /** Elements that came off this turn: `FALL.brained` with a living brain, `FALL.rot` without. */
  fallen: number[];
}

/**
 * The starved elements grouped into the parts they would come off as - a
 * segment ties the nodes at its ends together, as `fallenParts` of the damage
 * track splits what fell - and of those, the ids of every group that still
 * carries a living brain.
 *
 * The grouping is what makes this a rule about parts and not about elements: a
 * head starves together with the neck and the shoulder it hangs on, and it is
 * the three of them that leave, not the head alone through a hole in the air.
 */
function starvedAndThinking(body: Body, starved: readonly number[]): Set<number> {
  const root = new Map<number, number>(starved.map((id) => [id, id]));
  const find = (x: number): number => {
    let at = x;
    while (root.get(at) !== at) at = root.get(at)!;
    return at;
  };
  const join = (x: number, y: number): void => {
    if (!root.has(x) || !root.has(y)) return;
    const a = find(x);
    const b = find(y);
    if (a !== b) root.set(b, a);
  };
  for (const sid of segmentIds(body)) {
    const seg = body.segments[sid]!;
    join(sid, seg.a);
    join(sid, seg.b);
  }
  const groups = new Map<number, number[]>();
  for (const id of starved) {
    const key = find(id);
    const got = groups.get(key);
    if (got === undefined) groups.set(key, [id]);
    else got.push(id);
  }
  const out = new Set<number>();
  for (const group of groups.values()) {
    if (!group.some((id) => brainRefsIn(body, id).some((ref) => brainAlive(body, ref)))) continue;
    for (const id of group) out.add(id);
  }
  return out;
}

function organsOf(body: Body, id: number): { list: { kind: string }[]; clear: () => void; mass: number } {
  const node = body.nodes[id];
  if (node !== undefined) {
    let m = 0;
    for (const o of node.ends) m += organMass(o);
    return { list: node.ends, clear: () => (node.ends = []), mass: m };
  }
  const seg = body.segments[id]!;
  let m = 0;
  for (const o of [...seg.cavity, ...seg.growths]) m += organMass(o);
  return {
    list: [...seg.cavity, ...seg.growths],
    clear: () => {
      seg.cavity = [];
      seg.growths = [];
    },
    mass: m,
  };
}

/**
 * Removes elements from the body and gives every surviving segment that lost
 * an endpoint a stump. Returns the mass that left and the stump ids created.
 */
export function removeElements(body: Body, ids: Iterable<number>): { lost: number; stumps: number[] } {
  let lost = 0;
  for (const id of ids) {
    const node = body.nodes[id];
    if (node !== undefined) {
      for (const o of node.ends) lost += organMass(o);
      delete body.nodes[id];
      continue;
    }
    const seg = body.segments[id];
    if (seg === undefined) continue;
    lost += segmentMass(seg);
    for (const o of [...seg.cavity, ...seg.growths]) lost += organMass(o);
    delete body.segments[id];
  }
  const stumps: number[] = [];
  for (const sid of segmentIds(body)) {
    const seg = body.segments[sid]!;
    for (const end of ["a", "b"] as const) {
      if (body.nodes[seg[end]] !== undefined) continue;
      const stump = makeNode(body.nextId++, 1, { wound: 20 });
      body.nodes[stump.id] = stump;
      seg[end] = stump.id;
      stumps.push(stump.id);
    }
  }
  tearMembranes(body);
  body.meat -= lost;
  touch(body);
  return { lost, stumps };
}

/**
 * One turn of blood: every element with a path to a working heart resets its
 * counter, every other one counts up. 4 turns: a part that still holds a living
 * brain comes off whole and goes on being itself (`FALL.brained`); 10: an
 * element stops working (see `works`); 40: its organs die; 80: what is left of
 * it rots off. Your own brain dies at 5 and is never removed here - that is the
 * game's death, not the body's.
 */
export function ischemiaTick(body: Body): IschemiaEvents {
  const f = fed(body);
  const selfId = selfElement(body);
  const events: IschemiaEvents = { brainDead: false, necrotic: [], fallen: [] };
  const ids = [...nodeIds(body), ...segmentIds(body)].sort(byId);
  for (const id of ids) {
    const el = (body.nodes[id] ?? body.segments[id])!;
    el.ischemia = f.has(id) ? 0 : el.ischemia + 1;
  }
  const selfEl = body.nodes[selfId] ?? body.segments[selfId];
  if (selfEl !== undefined && selfEl.ischemia >= 5) events.brainDead = true;

  let lost = 0;
  for (const id of ids) {
    if (id === selfId) continue;
    const el = (body.nodes[id] ?? body.segments[id])!;
    if (el.ischemia < 40) continue;
    const organs = organsOf(body, id);
    if (organs.list.length === 0) continue;
    lost += organs.mass;
    organs.clear();
    events.necrotic.push(id);
  }
  body.meat -= lost;

  // What still thinks leaves before it stops thinking; what does not, rots.
  const thinking = starvedAndThinking(
    body,
    ids.filter((id) => id !== selfId && (body.nodes[id] ?? body.segments[id])!.ischemia >= FALL.brained),
  );
  const falling = ids.filter((id) => id !== selfId && ((body.nodes[id] ?? body.segments[id])!.ischemia >= FALL.rot || thinking.has(id)));
  if (falling.length > 0) {
    removeElements(body, falling);
    // What hung only on the fallen falls with it: nothing stays in the air apart from the body.
    const adrift = detached(body, selfElement(body));
    if (adrift.length > 0) removeElements(body, adrift);
    events.fallen = [...falling, ...adrift].sort(byId);
  }
  touch(body);
  return events;
}

/** Nodes and segments with no path to the element of your brain, by ascending id. */
function detached(body: Body, selfId: number): number[] {
  const start = body.nodes[selfId] !== undefined ? selfId : body.segments[selfId]?.a;
  const reached = new Set<number>();
  if (start !== undefined && body.nodes[start] !== undefined) {
    const stack = [start];
    reached.add(start);
    while (stack.length > 0) {
      const n = stack.pop()!;
      for (const sid of segmentIds(body)) {
        const s = body.segments[sid]!;
        if (s.a !== n && s.b !== n) continue;
        reached.add(sid);
        const o = s.a === n ? s.b : s.a;
        if (!reached.has(o)) {
          reached.add(o);
          stack.push(o);
        }
      }
    }
  }
  return [...nodeIds(body), ...segmentIds(body)].filter((id) => !reached.has(id)).sort(byId);
}

/** A turn of the body: wounds age, blood flows or does not. */
export function tick(body: Body): IschemiaEvents {
  for (const n of Object.values(body.nodes)) if (n.wound > 0) n.wound -= 1;
  for (const s of Object.values(body.segments)) if (s.wound > 0) s.wound -= 1;
  return ischemiaTick(body);
}
