/**
 * Growth is an operation, a payload and a target rule (body-graph.md §8).
 * `targets` lists every place an operation may land, weighted; `pickTarget`
 * draws one with the game's rng; `apply` performs it; `grow` does all three
 * and, when there is nowhere to land, grows a tumour instead.
 *
 * Step C adds MEMBRANE, DOUBLING and MIGRATION as graph operations, and two
 * placements that use the same machinery without touching the graph: ORGAN
 * (into a cavity, a head or a surface) and COVER (a cover starts on one
 * segment, §11). Parts that grow back - doubling, hydra, flesh memory - go
 * through `copyPart`; the two timers, `wanderTick` and `regrowTick`, are the
 * only things here that advance in time.
 *
 * Step I adds seven operations over the torso itself - BLOAT, ENGULF, SINK,
 * SPLIT, MERGE, FLESH and SHIFT - so that the human plan can come apart: a
 * torso swells, swallows a limb, takes the head into itself, divides, joins
 * another, grows out of a tumour, or lets a fork travel along it.
 *
 * Every candidate list is in ascending id order, so the same body and the
 * same rng state always pick the same place.
 */
import type { Body, BodyNode, CoverId, MembraneKind, Mount, Organ, PartSnapshot, Regrowth, Segment, SegmentKind } from "./graph.js";
import {
  addNode,
  addSegment,
  isBrainKind,
  makeNode,
  makeSegment,
  nodeIds,
  otherEnd,
  refreshNodeHp,
  refreshSegmentHp,
  segmentIds,
  selfElement,
  selfRef,
  setSelf,
  sortedIds,
  touch,
} from "./graph.js";
import { removeElements } from "./cut.js";
import {
  MEMBRANE_MAX,
  addMembrane,
  canonicalCycle,
  hasMembraneOn,
  membraneArea,
  remapMembranes,
  simpleCycles,
  spanNodes,
  splitInMembranes,
  stretchInMembranes,
  tearMembranes,
  trimMembranesOn,
} from "./membrane.js";
import { adjacency, closure, distances, elementDistance, fed } from "./metrics.js";
import { COVERS, HEAD_SLOTS, MEMBRANES, ORGANS, SEGMENT_KINDS, capacity, cavityLoad, hasTag, isChrome, mass, organMass, segmentMass, segmentMassOf, skeletonCeiling, ceilingLoss } from "./parts.js";
import { isSizedKind, type OrganSize, type SizedOrganKind } from "./sizes.js";
import type { Rng } from "./rng.js";
import { cavitySlots, flankHost, freeSideSlots, growthSlots, isFlank, limbChains, nextFlankPlace, reconcilePlaces } from "./flank.js";

/** Membranes: five pairs of wings, since a wing comes with its mirror and flight is the sum of them (decisions 611-612). */
export const LIMITS = { nodes: 40, segments: 60, cycles: 8, membranes: 10, heads: 6 } as const;

/** A bloated torso swells to this girth; limbs stay within 1..4. */
export const TORSO_GIRTH_MAX = 6;
const LENGTH_MAX = 6;

/** An ending that wanders crawls to a neighbouring node every 40 turns. */
export const WANDER_TURNS = 40;

export type Op =
  | "sprout"
  | "joint"
  | "branch"
  | "rebirth"
  | "thicken"
  | "thin"
  | "stretch"
  | "enlarge"
  | "fusion"
  | "growth"
  | "necrosis"
  | "membrane"
  | "double"
  | "migrate"
  | "organ"
  | "resize"
  | "cover"
  | "bloat"
  | "engulf"
  | "sink"
  | "split"
  | "merge"
  | "flesh"
  | "shift";

export interface LimbSpec {
  kind: SegmentKind;
  length: number;
  girth: number;
  cover: CoverId;
}

export interface Payloads {
  /** A segment with a new end node grows from a node with a free slot. Growths, a break plane and a bait flag are the catalog's extras. */
  sprout: LimbSpec & { ending: Organ | null; growths?: Organ[]; breakPlane?: boolean; bait?: boolean };
  /** A segment of length >= 2 splits in the middle around a new node. */
  joint: { ending: Organ | null };
  /** An ending becomes a fork: two new segments, each with a copy of it. */
  branch: LimbSpec;
  /** An ending changes kind. */
  rebirth: { ending: Organ };
  /** A limb becomes a torso: girth +1, a cavity opens. */
  thicken: Record<string, never>;
  /** A torso loses girth; what no longer fits is pushed out. */
  thin: Record<string, never>;
  /** Length +-1. */
  stretch: { delta: 1 | -1 };
  /** Node size +1. */
  enlarge: Record<string, never>;
  /** Two nearby nodes become one; their endings die; a cycle appears. */
  fusion: Record<string, never>;
  /** A tumour: a growth segment of length 1 with an empty node. */
  growth: Record<string, never>;
  /** A starved part falls off now. */
  necrosis: Record<string, never>;
  /** Skin over a simple cycle of 3-6 segments that carries none yet. */
  membrane: { kind: MembraneKind };
  /** The hanging part beyond a bridge is copied onto the same node. */
  double: Record<string, never>;
  /** An ending starts to wander: one node per 40 turns, never into a node with a head. */
  migrate: Record<string, never>;
  /** An organ takes a mount: a torso cavity, a head, a segment surface. */
  organ: { organ: Organ; mount: Exclude<Mount, "end"> };
  /** An organ already in place steps to another size: the jaw in the head, the hand on the arm (decision 164). */
  resize: { kind: SizedOrganKind; size: OrganSize };
  /** A cover starts on one segment. */
  cover: { cover: CoverId };
  /** A torso swells: girth +1 up to 6, then length +1 up to 6; the cavity grows, the skin cracks into a wound. */
  bloat: Record<string, never>;
  /** A hanging limb at a torso's node sinks into that torso: the limb goes, the girth grows, its ending sits on the node. */
  engulf: Record<string, never>;
  /** The segment under a head shortens; at length 1 the head's node merges into the other end: the head sits in the body. */
  sink: Record<string, never>;
  /** A torso divides into two parallel torsos between the same nodes; the cavity is shared, a cycle appears. */
  split: Record<string, never>;
  /** Two torsos meeting at a node become one of the summed length and the larger girth; the node goes, its limbs and endings move to the far end. */
  merge: Record<string, never>;
  /** A tumour at a torso's node grows into a torso; its node forks and pulls the hanging limbs of the old node onto itself. */
  flesh: Record<string, never>;
  /** A fork travels: a limb re-roots at the other end of the torso it hangs from. */
  shift: Record<string, never>;
}

export type Payload<K extends Op> = Payloads[K];

/** What stepping this organ to the wanted size would add to the body's mass; null when it is not that kind, or already there. */
function stepDelta(o: Organ, p: Payloads["resize"]): number | null {
  if (o.kind !== p.kind || isChrome(o)) return null;
  const now = o.size ?? "normal";
  if (now === p.size) return null;
  return organMass({ ...o, size: p.size }) - organMass(o);
}

/** The same for an ending: the ending itself, or what it holds (a jaw in a head). Null when nothing there steps. */
function resizableAt(body: Body, end: Organ, p: Payloads["resize"]): number | null {
  const own = stepDelta(end, p);
  if (own !== null) return own;
  for (const c of end.contents ?? []) {
    const d = stepDelta(c, p);
    if (d !== null) return d;
  }
  return null;
}

/** Sets the step on the organ itself: the normal step is written as no step at all, as `sizedOrgan` does. */
function stepOrgan(o: Organ, size: OrganSize): void {
  if (size === "normal") delete o.size;
  else o.size = size;
}

/** Steps the first organ of the kind in the list; true when one was there. */
function stepInList(list: readonly Organ[], p: Payloads["resize"]): boolean {
  for (const o of list) {
    if (stepDelta(o, p) === null) continue;
    stepOrgan(o, p.size);
    return true;
  }
  return false;
}

export type Target =
  | { node: number }
  | { segment: number }
  | { ending: { node: number; index: number } }
  | { pair: [number, number] }
  | { cycle: number[] };

export interface Weighted {
  target: Target;
  weight: number;
}

export interface GrowContext {
  /** The abyss rewrites the edges: far places weigh more. */
  source?: "abyss";
}

export interface ApplyResult {
  created: number[];
  removed: number[];
  evicted: Organ[];
}

export interface GrowResult {
  op: Op;
  payload: Payloads[Op];
  target: Target;
  /** True when the requested operation had no target and a tumour grew instead. */
  fallback: boolean;
}

const LIMB_KINDS: readonly SegmentKind[] = ["arm", "leg", "tentacle", "tail"];
/** What a torso swallows and what a fork moves along it: everything that hangs, torsos and necks aside. */
const HANGING_KINDS: readonly SegmentKind[] = ["arm", "leg", "tentacle", "tail", "stalk", "growth"];
const EPS = 1e-9;

function organInstability(o: Organ): number {
  let n = o.instability;
  if (o.contents) for (const c of o.contents) n += organInstability(c);
  return n;
}

function countHeads(body: Body): number {
  let n = 0;
  for (const id of nodeIds(body)) for (const e of body.nodes[id]!.ends) if (e.kind === "head") n += 1;
  return n;
}

/** Index of the ending that holds your brain, or -1. */
function selfEndingIndex(body: Body, nodeId: number): number {
  const ref = selfRef(body);
  return ref !== undefined && "node" in ref && ref.node === nodeId ? ref.end : -1;
}

/** Slot of your brain in the segment's cavity, or -1. */
function selfSlot(body: Body, segId: number): number {
  const ref = selfRef(body);
  return ref !== undefined && "segment" in ref && ref.segment === segId ? ref.slot : -1;
}

function validLimb(p: LimbSpec): boolean {
  return (
    SEGMENT_KINDS[p.kind] !== undefined &&
    COVERS[p.cover] !== undefined &&
    Number.isInteger(p.length) &&
    p.length >= 1 &&
    p.length <= 6 &&
    Number.isInteger(p.girth) &&
    p.girth >= 1 &&
    p.girth <= 4
  );
}

function validOrgan(o: Organ, mount: Mount): boolean {
  const spec = ORGANS[o.kind] as (typeof ORGANS)[keyof typeof ORGANS] | undefined;
  return spec !== undefined && spec.mounts.includes(mount) && (o.contents === undefined || o.kind === "head");
}

export function sameTarget(x: Target, y: Target): boolean {
  if ("node" in x) return "node" in y && x.node === y.node;
  if ("segment" in x) return "segment" in y && x.segment === y.segment;
  if ("ending" in x) return "ending" in y && x.ending.node === y.ending.node && x.ending.index === y.ending.index;
  if ("pair" in x) return "pair" in y && x.pair[0] === y.pair[0] && x.pair[1] === y.pair[1];
  return "cycle" in y && x.cycle.length === y.cycle.length && canonicalCycle(x.cycle).every((id, i) => id === canonicalCycle(y.cycle)[i]);
}

interface Scan {
  /** Every segment at a node, flanks too: the graph as blood and nerve see it. */
  adj: Map<number, number[]>;
  mass: number;
  nodes: number[];
  /** Segments an operation may work on: every one but the flanks, which are side nodes' links and never a part of their own. */
  segments: number[];
}

function scan(body: Body): Scan {
  return { adj: adjacency(body), mass: mass(body), nodes: nodeIds(body), segments: segmentIds(body).filter((id) => !isFlank(body.segments[id]!)) };
}

/** Segments that take a slot of the node: a flank takes none at its host's end (flank.ts). */
function degree(sc: Scan, id: number, body?: Body): number {
  const list = sc.adj.get(id) ?? [];
  if (body === undefined) return list.length;
  let n = 0;
  for (const sid of list) {
    const s = body.segments[sid]!;
    if (!(isFlank(s) && s.a === id)) n += 1;
  }
  return n;
}

/** The end of the segment that is a bare joint of its limb - two segments of one kind, nothing on it, room for an ending - or null. */
function bareJointEnd(body: Body, sc: Scan, s: Segment): number | null {
  for (const n of [s.b, s.a]) {
    const node = body.nodes[n]!;
    if (node.ends.length > 0 || node.ends.length >= node.size) continue;
    const at = (sc.adj.get(n) ?? []).filter((sid) => !isFlank(body.segments[sid]!));
    if (at.length === 2 && at.every((sid) => body.segments[sid]!.kind === s.kind)) return n;
  }
  return null;
}

/**
 * A joint pushes nothing out: every organ of the cavity finds room in one of
 * the two halves it cuts the segment into, heaviest first.
 */
function jointKeepsCavity(s: Segment): boolean {
  if (s.cavity.length === 0) return true;
  const slots = cavitySlots(s);
  const halves = [Math.ceil(s.length / 2), Math.floor(s.length / 2)].map((len) => ({ cap: 5 * len * s.girth, load: 0, n: 0 }));
  for (const o of [...s.cavity].sort((x, y) => organMass(y) - organMass(x))) {
    const m = organMass(o);
    const h = halves.find((x) => x.n < slots && x.load + m <= x.cap + EPS);
    if (h === undefined) return false;
    h.load += m;
    h.n += 1;
  }
  return true;
}

/** A new side node of a torso is a medium joint, of a limb a small one. */
function sideNodeSize(host: Segment): 1 | 2 {
  return host.kind === "torso" ? 2 : 1;
}

function freeSlots(body: Body, sc: Scan, id: number): number {
  return 2 * body.nodes[id]!.size - degree(sc, id, body);
}

function room(body: Body, sc: Scan, delta: number): boolean {
  return sc.mass + delta <= body.meat + EPS;
}

/** Nodes within so many segments of the start; a flank is no step, its side node is where its host's end is. */
function nodesWithin(body: Body, sc: Scan, start: number, hops: number): Set<number> {
  const out = new Set<number>([start]);
  const spread = (list: number[]): number[] => {
    for (let i = 0; i < list.length; i++) {
      for (const sid of sc.adj.get(list[i]!) ?? []) {
        const s = body.segments[sid]!;
        const o = otherEnd(s, list[i]!);
        if (isFlank(s) && !out.has(o)) {
          out.add(o);
          list.push(o);
        }
      }
    }
    return list;
  };
  let frontier = spread([start]);
  for (let h = 0; h < hops; h++) {
    const next: number[] = [];
    for (const n of frontier) {
      for (const sid of sc.adj.get(n) ?? []) {
        const o = otherEnd(body.segments[sid]!, n);
        if (!out.has(o)) {
          out.add(o);
          next.push(o);
        }
      }
    }
    frontier = spread(next);
  }
  out.delete(start);
  return out;
}

/** The node hangs on a flank: a shoulder, a hip, a joint on the side of a limb. */
function sideNode(body: Body, sc: Scan, id: number): boolean {
  return (sc.adj.get(id) ?? []).some((sid) => isFlank(body.segments[sid]!) && body.segments[sid]!.b === id);
}

function chromeAt(body: Body, sc: Scan, id: number): boolean {
  return (sc.adj.get(id) ?? []).some((sid) => body.segments[sid]!.cover === "chrome");
}

/** Torso segments at a node, ascending. */
function torsosAt(body: Body, sc: Scan, id: number): number[] {
  return (sc.adj.get(id) ?? []).filter((sid) => body.segments[sid]!.kind === "torso");
}

/** The torsos a node belongs to: those it is an end of, and the host of every flank that makes it a side node; ascending. */
function bodyTorsosAt(body: Body, sc: Scan, id: number): number[] {
  const out = torsosAt(body, sc, id);
  for (const sid of sc.adj.get(id) ?? []) {
    const f = body.segments[sid]!;
    if (!isFlank(f) || f.b !== id) continue;
    const host = flankHost(body, sid);
    if (host !== undefined && body.segments[host]!.kind === "torso" && !out.includes(host)) out.push(host);
  }
  return out.sort((x, y) => x - y);
}

function holdsHead(body: Body, id: number): boolean {
  return body.nodes[id]!.ends.some((e) => e.kind === "head");
}

/** Growths move from one segment to another; a mark never sits twice on one segment (a dropped mark weighs nothing). */
function moveGrowths(from: Organ[], to: Organ[]): void {
  for (const g of from) {
    if (hasTag(g.kind, "mark") && to.some((o) => o.kind === g.kind)) continue;
    to.push(g);
  }
}

/** Endings of one node join another; your brain's index follows. */
function moveEndings(body: Body, from: number, to: number): void {
  const F = body.nodes[from]!;
  const T = body.nodes[to]!;
  const mine = selfEndingIndex(body, from);
  const base = T.ends.length;
  T.ends.push(...F.ends);
  F.ends = [];
  if (mine >= 0) setSelf(body, { node: to, end: base + mine });
}

/** Every segment of `from` but the ones named now touches `to`. */
function rerootSegments(body: Body, sc: Scan, from: number, to: number, except: readonly number[]): void {
  for (const sid of sc.adj.get(from) ?? []) {
    if (except.includes(sid)) continue;
    const s = body.segments[sid]!;
    if (s.a === from) s.a = to;
    if (s.b === from) s.b = to;
  }
}

// ---------------------------------------------------------------- the plan of the torso (step I)

/** How a torso swells: girth first, up to 6, then length, up to 6; null when it can swell no more. */
function bloated(s: Segment): { length: number; girth: number } | null {
  if (s.girth < TORSO_GIRTH_MAX) return { length: s.length, girth: s.girth + 1 };
  if (s.length < LENGTH_MAX) return { length: s.length + 1, girth: s.girth };
  return null;
}

function swells(s: Segment): boolean {
  return s.kind === "torso" && COVERS[s.cover].mutates && COVERS[s.cover].stretches;
}

/** The torso at the node that takes one more unit of girth: the smallest id that swells. */
function swellingTorso(body: Body, sc: Scan, node: number): Segment | null {
  for (const sid of bodyTorsosAt(body, sc, node)) {
    const t = body.segments[sid]!;
    if (swells(t) && t.girth < TORSO_GIRTH_MAX) return t;
  }
  return null;
}

interface EngulfPlan {
  near: number;
  far: number;
  torso: Segment;
  delta: number;
}

/** A hanging limb (its far node holds nothing but it) at a node with a torso that can swell, whose endings the node has room for. */
function engulfPlan(body: Body, sc: Scan, s: Segment): EngulfPlan | null {
  if (!HANGING_KINDS.includes(s.kind) || !COVERS[s.cover].mutates) return null;
  const selfId = selfElement(body);
  for (const [far, near] of [
    [s.b, s.a],
    [s.a, s.b],
  ] as const) {
    if (degree(sc, far) !== 1 || far === selfId) continue;
    const torso = swellingTorso(body, sc, near);
    if (torso === null) continue;
    if (body.nodes[near]!.ends.length + body.nodes[far]!.ends.length > body.nodes[near]!.size) continue;
    // The limb's organ inside goes into the torso: it must fit there, and a cavity holds one brain.
    if (cavityLoad(torso) + cavityLoad(s) > 5 * torso.length * (torso.girth + 1) + EPS) continue;
    if (s.cavity.some((o) => isBrainKind(o.kind)) && torso.cavity.some((o) => isBrainKind(o.kind))) continue;
    const delta = segmentMassOf("torso", torso.length, torso.girth + 1, torso.cover) - segmentMass(torso) - segmentMass(s);
    return { near, far, torso, delta };
  }
  return null;
}

interface SinkPlan {
  headNode: number;
  other: number;
  /** Length 1: the head's node merges into the other end. */
  merge: boolean;
}

/** The segment under a head: exactly one end holds a head, and that head does not sit in a torso already. */
function sinkPlan(body: Body, sc: Scan, s: Segment): SinkPlan | null {
  if (s.kind === "torso" || !COVERS[s.cover].mutates) return null;
  const aHead = holdsHead(body, s.a);
  if (aHead === holdsHead(body, s.b)) return null;
  const headNode = aHead ? s.a : s.b;
  const other = aHead ? s.b : s.a;
  if (bodyTorsosAt(body, sc, headNode).length > 0) return null;
  if (s.length > 1) return { headNode, other, merge: false };
  // The segment goes for good below: you do not sink the one you live in (decision 165).
  if (selfSlot(body, s.id) >= 0) return null;
  const H = body.nodes[headNode]!;
  const O = body.nodes[other]!;
  if (O.ends.length + H.ends.length > O.size) return null;
  if (degree(sc, other, body) - 1 + degree(sc, headNode, body) - 1 > 2 * O.size) return null;
  for (const sid of sc.adj.get(headNode) ?? []) if (sid !== s.id && otherEnd(body.segments[sid]!, headNode) === other) return null;
  return { headNode, other, merge: true };
}

interface SplitPlan {
  keep: Organ[];
  twin: Organ[];
  evicted: Organ[];
  g1: number;
  g2: number;
}

function heartsInWhole(body: Body): number {
  let n = 0;
  for (const s of Object.values(body.segments)) if (s.hp > 0) for (const o of s.cavity) if (o.kind === "heart") n += 1;
  return n;
}

function breathingOrgans(body: Body): number {
  let n = 0;
  for (const n0 of Object.values(body.nodes)) for (const e of n0.ends) for (const c of [e, ...(e.contents ?? [])]) if (ORGANS[c.kind].breath !== undefined) n += 1;
  for (const s of Object.values(body.segments)) for (const o of [...s.cavity, ...s.growths]) if (ORGANS[o.kind].breath !== undefined) n += 1;
  return n;
}

/**
 * How a torso's cavity divides between the half it keeps (girth rounded up)
 * and the twin: your brain first, then brains, hearts, breathing organs, then
 * the rest in list order; each into the original while it fits, else the
 * twin, else out. Null when the torso is no torso to divide, or the division
 * would lose a brain, the last heart or the last breathing organ.
 */
function splitPlan(body: Body, s: Segment): SplitPlan | null {
  if (s.kind !== "torso" || s.girth < 2 || !COVERS[s.cover].mutates) return null;
  const g1 = Math.ceil(s.girth / 2);
  const g2 = s.girth - g1;
  const capKeep = 5 * s.length * g1;
  const capTwin = 5 * s.length * g2;
  const mine = selfSlot(body, s.id);
  const rank = (o: Organ, i: number): number => (i === mine ? 0 : isBrainKind(o.kind) ? 1 : o.kind === "heart" ? 2 : ORGANS[o.kind].breath !== undefined ? 3 : 4);
  const order = s.cavity.map((o, i) => ({ o, i })).sort((x, y) => rank(x.o, x.i) - rank(y.o, y.i) || x.i - y.i);
  const plan: SplitPlan = { keep: [], twin: [], evicted: [], g1, g2 };
  let lk = 0;
  let lt = 0;
  for (const { o, i } of order) {
    const m = organMass(o);
    if (i === mine || lk + m <= capKeep + EPS) {
      plan.keep.push(o);
      lk += m;
    } else if (lt + m <= capTwin + EPS) {
      plan.twin.push(o);
      lt += m;
    } else plan.evicted.push(o);
  }
  if (lk > capKeep + EPS) return null;
  let hearts = 0;
  let breath = 0;
  for (const o of plan.evicted) {
    if (isBrainKind(o.kind)) return null;
    if (o.kind === "heart") hearts += 1;
    if (ORGANS[o.kind].breath !== undefined) breath += 1;
  }
  if (hearts > 0 && heartsInWhole(body) - hearts < 1) return null;
  if (breath > 0 && breathingOrgans(body) - breath < 1) return null;
  return plan;
}

interface MergePlan {
  t1: Segment;
  t2: Segment;
  far: number;
  host: number;
  others: number[];
  /** Mass the merge adds, and the skeleton it costs (parts.ts `ceilingLoss`, decision 1260). */
  delta: number;
  loss: number;
}

/**
 * The two torsos of smallest id at the node, meeting at it from different
 * far ends, of summed length within 6; the node's other segments and endings
 * go to the first far end that has room for them (never onto a segment that
 * already reaches it).
 */
function mergePlan(body: Body, sc: Scan, n: number): MergePlan | null {
  const ts = torsosAt(body, sc, n);
  if (ts.length < 2) return null;
  const t1 = body.segments[ts[0]!]!;
  const t2 = body.segments[ts[1]!]!;
  if (!COVERS[t1.cover].mutates || !COVERS[t2.cover].mutates) return null;
  const A = otherEnd(t1, n);
  const B = otherEnd(t2, n);
  if (A === B || t1.length + t2.length > LENGTH_MAX) return null;
  // One brain per cavity (step J): two torsos that each hold a brain do not become one.
  if (t1.cavity.some((o) => isBrainKind(o.kind)) && t2.cavity.some((o) => isBrainKind(o.kind))) return null;
  const others = (sc.adj.get(n) ?? []).filter((sid) => sid !== t1.id && sid !== t2.id);
  const N = body.nodes[n]!;
  for (const host of [A, B]) {
    const H = body.nodes[host]!;
    if (H.ends.length + N.ends.length > H.size) continue;
    if (degree(sc, host, body) + others.length > 2 * H.size) continue;
    if (others.some((sid) => otherEnd(body.segments[sid]!, n) === host)) continue;
    const merged: Segment = { ...t1, length: t1.length + t2.length, girth: Math.max(t1.girth, t2.girth) };
    const delta = segmentMass(merged) - segmentMass(t1) - segmentMass(t2);
    return { t1, t2, far: B, host, others, delta, loss: ceilingLoss(body, [t1, t2], [merged]) };
  }
  return null;
}

interface FleshPlan {
  near: number;
  far: number;
  delta: number;
}

/** A tumour hanging from a node with a torso. */
function fleshPlan(body: Body, sc: Scan, s: Segment): FleshPlan | null {
  if (s.kind !== "growth" || !COVERS[s.cover].mutates || s.girth >= TORSO_GIRTH_MAX) return null;
  for (const [near, far] of [
    [s.a, s.b],
    [s.b, s.a],
  ] as const) {
    if (degree(sc, far) !== 1 || bodyTorsosAt(body, sc, near).length === 0) continue;
    return { near, far, delta: segmentMassOf("torso", s.length, s.girth + 1, s.cover) - segmentMass(s) };
  }
  return null;
}

interface ShiftPlan {
  from: number;
  to: number;
  /** A limb on a side node travels with its side node: the flank moves, the limb stays on it. */
  flank?: number;
}

/**
 * The first torso at either end of the segment whose far end has a free place
 * and is not the segment's other end already. A limb on a side node of a
 * torso moves its side node to the torso's other end instead.
 */
function shiftPlan(body: Body, sc: Scan, s: Segment): ShiftPlan | null {
  if (s.kind === "torso" || !COVERS[s.cover].mutates) return null;
  for (const from of [s.a, s.b]) {
    const away = otherEnd(s, from);
    for (const tid of torsosAt(body, sc, from)) {
      const to = otherEnd(body.segments[tid]!, from);
      if (to === away || freeSlots(body, sc, to) < 1) continue;
      return { from, to };
    }
    for (const fid of sc.adj.get(from) ?? []) {
      const f = body.segments[fid]!;
      if (!isFlank(f) || f.b !== from) continue;
      const host = flankHost(body, fid);
      if (host === undefined || body.segments[host]!.kind !== "torso") continue;
      const to = otherEnd(body.segments[host]!, f.a);
      if (to === away || to === f.b || (sc.adj.get(to) ?? []).some((sid) => otherEnd(body.segments[sid]!, to) === f.b)) continue;
      return { from: f.a, to, flank: fid };
    }
  }
  return null;
}

/** Elements without blood, grouped into connected regions; regions holding your brain are dropped. */
function starvedRegions(body: Body, sc: Scan): number[][] {
  const f = fed(body);
  const selfId = selfElement(body);
  const seen = new Set<number>();
  const regions: number[][] = [];
  const all = [...sc.nodes, ...sc.segments].sort((x, y) => x - y);
  for (const start of all) {
    if (f.has(start) || seen.has(start)) continue;
    const region: number[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length > 0) {
      const id = stack.pop()!;
      region.push(id);
      const neighbours: number[] =
        body.nodes[id] !== undefined ? (sc.adj.get(id) ?? []) : [body.segments[id]!.a, body.segments[id]!.b];
      for (const n of neighbours) {
        if (f.has(n) || seen.has(n)) continue;
        seen.add(n);
        stack.push(n);
      }
    }
    if (!region.includes(selfId)) regions.push(region.sort((x, y) => x - y));
  }
  return regions;
}

// ---------------------------------------------------------------- parts that grow back

/** Mass of a snapshot: its segments and every organ in it. */
export function partMass(part: PartSnapshot): number {
  let m = 0;
  for (const s of part.segments) {
    m += segmentMass(s);
    for (const o of [...s.cavity, ...s.growths]) m += organMass(o);
  }
  for (const n of part.nodes) for (const o of n.ends) m += organMass(o);
  return m;
}

function partHeads(part: PartSnapshot): number {
  let n = 0;
  for (const node of part.nodes) for (const e of node.ends) if (e.kind === "head") n += 1;
  return n;
}

/** Cycles a part adds when it hangs from one outside node: segments - nodes. */
function partCycles(part: PartSnapshot): number {
  return part.segments.length - part.nodes.length;
}

/**
 * The part that hangs beyond a bridge, on the side without your brain, with
 * the bridge itself; `attach` is the bridge's end on your side. Null when
 * the segment is not a bridge or both sides hold you (you live in it).
 */
export function hangingPart(body: Body, segId: number): { attach: number; part: PartSnapshot } | null {
  const seg = body.segments[segId];
  if (seg === undefined || selfElement(body) === segId) return null;
  const adj = adjacency(body);
  const reach = (start: number): Set<number> => {
    const seen = new Set<number>([start]);
    const stack = [start];
    while (stack.length > 0) {
      const n = stack.pop()!;
      for (const sid of adj.get(n) ?? []) {
        if (sid === segId) continue;
        const o = otherEnd(body.segments[sid]!, n);
        if (!seen.has(o)) {
          seen.add(o);
          stack.push(o);
        }
      }
    }
    return seen;
  };
  const sideA = reach(seg.a);
  if (sideA.has(seg.b)) return null;
  const selfId = selfElement(body);
  const selfNode = body.nodes[selfId] !== undefined ? selfId : body.segments[selfId]!.a;
  const far = sideA.has(selfNode) ? seg.b : seg.a;
  const attach = otherEnd(seg, far);
  const nodes = reach(far);
  const part: PartSnapshot = { nodes: [], segments: [], membranes: [] };
  for (const id of nodeIds(body)) if (nodes.has(id)) part.nodes.push(body.nodes[id]!);
  for (const id of segmentIds(body)) {
    const s = body.segments[id]!;
    if (id === segId || (nodes.has(s.a) && nodes.has(s.b))) part.segments.push(s);
  }
  const segs = new Set(part.segments.map((s) => s.id));
  for (const id of sortedIds(body.membranes)) {
    const m = body.membranes[id]!;
    if (m.cycle.every((s) => segs.has(s))) part.membranes.push(m);
  }
  return { attach, part };
}

/** Whether a copy of the part fits at the node within the limits of §8 and the meat. */
export function canCopyPart(body: Body, at: number, part: PartSnapshot): boolean {
  const sc = scan(body);
  if (body.nodes[at] === undefined || freeSlots(body, sc, at) < 1) return false;
  if (sc.nodes.length + part.nodes.length > LIMITS.nodes) return false;
  if (sc.segments.length + part.segments.length > LIMITS.segments) return false;
  if (countHeads(body) + partHeads(part) > LIMITS.heads) return false;
  if (closure(body) + partCycles(part) > LIMITS.cycles) return false;
  if (sortedIds(body.membranes).length + part.membranes.length > LIMITS.membranes) return false;
  return room(body, sc, partMass(part));
}

/**
 * Grows a copy of the part from the node: every endpoint the part does not
 * hold becomes `at`. Old ids map to fresh ones in ascending order; copies come
 * whole, unwounded and without a break plane. Returns the ids created.
 */
export function copyPart(body: Body, at: number, part: PartSnapshot): number[] {
  const old = [...part.nodes.map((n) => n.id), ...part.segments.map((s) => s.id), ...part.membranes.map((m) => m.id)].sort((x, y) => x - y);
  const map = new Map<number, number>();
  for (const id of old) map.set(id, body.nextId++);
  const nodes = [...part.nodes].sort((x, y) => x.id - y.id);
  const segments = [...part.segments].sort((x, y) => x.id - y.id);
  const membranes = [...part.membranes].sort((x, y) => x.id - y.id);
  for (const n of nodes) {
    const id = map.get(n.id)!;
    body.nodes[id] = makeNode(id, n.size, { ends: n.ends.map(cloneOrgan) });
  }
  for (const s of segments) {
    const id = map.get(s.id)!;
    body.segments[id] = makeSegment(id, map.get(s.a) ?? at, map.get(s.b) ?? at, {
      kind: s.kind,
      length: s.length,
      girth: s.girth,
      cover: s.cover,
      cavity: s.cavity.map(cloneOrgan),
      growths: s.growths.map(cloneOrgan),
      breakPlane: false,
    });
  }
  for (const m of membranes) {
    const id = map.get(m.id)!;
    // A span keeps the order it was written in - the copy is the same walk - and only a cycle is respelled.
    const walk = m.cycle.map((s) => map.get(s)!);
    const copy = { id, kind: m.kind, cycle: spanNodes(body, walk) !== null ? walk : canonicalCycle(walk), area: 0 };
    copy.area = membraneArea(body, copy);
    body.membranes[id] = copy;
  }
  touch(body);
  return old.map((id) => map.get(id)!);
}

/** Schedules a part to grow back from the node in `turns` turns (flesh memory). */
export function regrowLater(body: Body, at: number, part: PartSnapshot, turns: number, copies = 1): void {
  body.regrowth ??= [];
  body.regrowth.push({ at, turns, copies, part: structuredClone(part) });
  touch(body);
}

/**
 * Grows a part back now, as many copies as fit: the flesh comes with the
 * part (meat grows by its mass) up to the skeleton's ceiling. Returns the
 * ids each copy created.
 */
export function regrowNow(body: Body, at: number, part: PartSnapshot, copies: number, ceiling = skeletonCeiling(body)): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < copies; i++) {
    const m = partMass(part);
    if (mass(body) + m > ceiling + EPS) break;
    const meat = body.meat;
    body.meat = Math.max(meat, mass(body)) + m;
    if (!canCopyPart(body, at, part)) {
      body.meat = meat;
      break;
    }
    out.push(copyPart(body, at, part));
  }
  return out;
}

/** One turn of flesh memory: parts whose time has come grow back; those whose node is gone are lost. */
export function regrowTick(body: Body, ceiling = skeletonCeiling(body)): number[][] {
  const out: number[][] = [];
  if (body.regrowth === undefined || body.regrowth.length === 0) return out;
  const keep: Regrowth[] = [];
  for (const r of body.regrowth) {
    r.turns -= 1;
    if (r.turns > 0) {
      keep.push(r);
      continue;
    }
    if (body.nodes[r.at] !== undefined) out.push(...regrowNow(body, r.at, r.part, r.copies, ceiling));
  }
  body.regrowth = keep;
  touch(body);
  return out;
}

export interface Wandered {
  node: number;
  index: number;
  to: number;
}

/**
 * One turn of migration: every wandering ending counts down; at 0 it crawls
 * into a neighbouring node with a free place and no head, chosen by the rng
 * among the candidates in id order, and starts counting again. With nowhere
 * to go it waits another 40 turns.
 */
export function wanderTick(body: Body, rng: Rng): Wandered[] {
  const moves: Wandered[] = [];
  const wanderers: { node: number; organ: Organ }[] = [];
  for (const id of nodeIds(body)) for (const o of body.nodes[id]!.ends) if (o.wander !== undefined && o.wander > 0) wanderers.push({ node: id, organ: o });
  if (wanderers.length === 0) return moves;
  const adj = adjacency(body);
  for (const { node, organ: o } of wanderers) {
    o.wander! -= 1;
    if (o.wander! > 0) continue;
    const n = body.nodes[node]!;
    const index = n.ends.indexOf(o);
    const mine = selfEndingIndex(body, node);
    if (index < 0 || index === mine) {
      o.wander = WANDER_TURNS;
      continue;
    }
    const dests: number[] = [];
    for (const sid of adj.get(node) ?? []) {
      const other = otherEnd(body.segments[sid]!, node);
      const d = body.nodes[other]!;
      if (d.ends.length < d.size && !d.ends.some((e) => e.kind === "head") && !dests.includes(other)) dests.push(other);
    }
    dests.sort((x, y) => x - y);
    if (dests.length === 0) {
      o.wander = WANDER_TURNS;
      continue;
    }
    const to = dests[Math.floor(rng.next() * dests.length)]!;
    n.ends.splice(index, 1);
    if (mine > index) setSelf(body, { node, end: mine - 1 });
    body.nodes[to]!.ends.push(o);
    o.wander = WANDER_TURNS;
    moves.push({ node, index, to });
  }
  touch(body);
  return moves;
}

// ---------------------------------------------------------------- candidates

/** Kinds a membrane may span: what bends. A torso is the body itself, a flank is a link, a penis takes nothing (decision 161). */
const SPANNING_KINDS: readonly SegmentKind[] = ["arm", "leg", "tentacle", "tail", "neck", "stalk"];

/**
 * Spans a membrane may hang on (decision 320): one bent limb of 2..6 segments
 * of one kind whose covers still mutate. This is the wing's rule of decision
 * 121 read for every kind of membrane - a grown body almost never carries a
 * simple cycle, so the sail, the fin, the gill, the hood and the net had
 * nowhere to grow at all.
 */
function membraneSpans(body: Body): number[][] {
  return limbChains(body)
    .filter(
      (c) =>
        SPANNING_KINDS.includes(c.kind) &&
        c.segments.length >= 2 &&
        c.segments.length <= MEMBRANE_MAX &&
        c.segments.every((sid) => COVERS[body.segments[sid]!.cover].mutates) &&
        spanNodes(body, c.segments) !== null,
    )
    .map((c) => [...c.segments]);
}

function candidates(body: Body, op: Op, payload: Payloads[Op]): Target[] {
  const sc = scan(body);
  const out: Target[] = [];
  const nodeRoom = sc.nodes.length < LIMITS.nodes;
  const segRoom = sc.segments.length < LIMITS.segments;
  switch (op) {
    case "sprout": {
      const p = payload as Payloads["sprout"];
      if (!sproutFits(body, p, sc)) return out;
      // A big joint takes bigger things: the limb is no thicker than the node it grows from.
      for (const id of sc.nodes) if (freeSlots(body, sc, id) >= 1 && p.girth <= body.nodes[id]!.size) out.push({ node: id });
      // A segment with a free side slot grows the limb from a new side node on it: a shoulder, a hip, a joint on the side of an arm.
      if (sc.nodes.length + 1 < LIMITS.nodes) for (const id of sc.segments) if (freeSideSlots(body, id) >= 1 && p.girth <= sideNodeSize(body.segments[id]!)) out.push({ segment: id });
      return out;
    }
    case "growth": {
      if (!nodeRoom || !segRoom || !room(body, sc, segmentMassOf("growth", 1, 1, "skin"))) return out;
      for (const id of sc.nodes) if (freeSlots(body, sc, id) >= 1) out.push({ node: id });
      return out;
    }
    case "joint": {
      const p = payload as Payloads["joint"];
      if (!nodeRoom || !segRoom) return out;
      if (p.ending !== null && !validOrgan(p.ending, "end")) return out;
      if (!room(body, sc, p.ending ? organMass(p.ending) : 0)) return out;
      if (p.ending?.kind === "head" && countHeads(body) >= LIMITS.heads) return out;
      for (const id of sc.segments) {
        const s = body.segments[id]!;
        if (!COVERS[s.cover].mutates) continue;
        // A joint with an ending takes a bare joint the limb already has (an elbow, a knee) when the segment is too short to cut.
        if (s.length >= 2 ? jointKeepsCavity(s) : p.ending !== null && bareJointEnd(body, sc, s) !== null) out.push({ segment: id });
      }
      return out;
    }
    case "branch": {
      const p = payload as Payloads["branch"];
      if (!validLimb(p) || sc.nodes.length + 2 > LIMITS.nodes || sc.segments.length + 2 > LIMITS.segments) return out;
      const segM = segmentMassOf(p.kind, p.length, p.girth, p.cover);
      const heads = countHeads(body);
      for (const id of sc.nodes) {
        if (freeSlots(body, sc, id) < 2) continue;
        const selfIdx = selfEndingIndex(body, id);
        body.nodes[id]!.ends.forEach((e, index) => {
          if (index === selfIdx || isChrome(e)) return;
          if (e.kind === "head" && heads + 1 > LIMITS.heads) return;
          if (room(body, sc, 2 * segM + organMass(e))) out.push({ ending: { node: id, index } });
        });
      }
      return out;
    }
    case "rebirth": {
      const p = payload as Payloads["rebirth"];
      if (!validOrgan(p.ending, "end")) return out;
      const newM = organMass(p.ending);
      const heads = countHeads(body);
      for (const id of sc.nodes) {
        const selfIdx = selfEndingIndex(body, id);
        body.nodes[id]!.ends.forEach((e, index) => {
          if (index === selfIdx || isChrome(e)) return;
          if (p.ending.kind === "head" && e.kind !== "head" && heads >= LIMITS.heads) return;
          if (room(body, sc, newM - organMass(e))) out.push({ ending: { node: id, index } });
        });
      }
      return out;
    }
    case "thicken": {
      for (const id of sc.segments) {
        const s = body.segments[id]!;
        if (!LIMB_KINDS.includes(s.kind) || s.girth >= 4) continue;
        const cover = COVERS[s.cover];
        if (!cover.stretches || !cover.mutates) continue;
        if (room(body, sc, segmentMassOf("torso", s.length, s.girth + 1, s.cover) - segmentMass(s))) out.push({ segment: id });
      }
      return out;
    }
    case "thin": {
      for (const id of sc.segments) {
        const s = body.segments[id]!;
        if (s.kind === "torso" && s.girth >= 2 && COVERS[s.cover].mutates) out.push({ segment: id });
      }
      return out;
    }
    case "stretch": {
      const p = payload as Payloads["stretch"];
      for (const id of sc.segments) {
        const s = body.segments[id]!;
        if (!COVERS[s.cover].mutates) continue;
        if (p.delta > 0) {
          if (s.length < (SEGMENT_KINDS[s.kind].maxLength ?? 6) && room(body, sc, segmentMassOf(s.kind, 1, s.girth, s.cover))) out.push({ segment: id });
        } else if (s.length > 1) out.push({ segment: id });
      }
      return out;
    }
    case "enlarge": {
      for (const id of sc.nodes) {
        const n = body.nodes[id]!;
        if (n.size < 3 && (freeSlots(body, sc, id) === 0 || n.ends.length >= n.size)) out.push({ node: id });
      }
      return out;
    }
    case "fusion": {
      if (closure(body) >= LIMITS.cycles) return out;
      const selfNode = "node" in body.self ? body.self.node : -1;
      const near = new Map<number, Set<number>>();
      for (const id of sc.nodes) near.set(id, nodesWithin(body, sc, id, 2));
      for (let i = 0; i < sc.nodes.length; i++) {
        const u = sc.nodes[i]!;
        // A side node never fuses: its flank would end up joining two ends of the body proper.
        if (u === selfNode || chromeAt(body, sc, u) || sideNode(body, sc, u)) continue;
        const nu = near.get(u)!;
        for (let j = i + 1; j < sc.nodes.length; j++) {
          const v = sc.nodes[j]!;
          if (v === selfNode || chromeAt(body, sc, v) || sideNode(body, sc, v)) continue;
          if ((sc.adj.get(u) ?? []).some((sid) => otherEnd(body.segments[sid]!, u) === v)) continue;
          const size = Math.max(body.nodes[u]!.size, body.nodes[v]!.size);
          if (degree(sc, u, body) + degree(sc, v, body) > 2 * size) continue;
          const nv = near.get(v)!;
          let common = false;
          for (const n of nu) {
            if (n !== v && nv.has(n)) {
              common = true;
              break;
            }
          }
          if (common) out.push({ pair: [u, v] });
        }
      }
      return out;
    }
    case "necrosis": {
      for (const region of starvedRegions(body, sc)) {
        for (const id of region) out.push(body.nodes[id] !== undefined ? { node: id } : { segment: id });
      }
      return out.sort((x, y) => targetId(x) - targetId(y));
    }
    case "membrane": {
      const p = payload as Payloads["membrane"];
      if (MEMBRANES[p.kind] === undefined || sortedIds(body.membranes).length >= LIMITS.membranes) return out;
      for (const cycle of simpleCycles(body)) if (!hasMembraneOn(body, cycle)) out.push({ cycle });
      for (const span of membraneSpans(body)) if (!hasMembraneOn(body, span)) out.push({ cycle: span });
      return out;
    }
    case "double": {
      for (const id of sc.segments) {
        const h = hangingPart(body, id);
        if (h !== null && canCopyPart(body, h.attach, h.part)) out.push({ segment: id });
      }
      return out;
    }
    case "migrate": {
      for (const id of sc.nodes) {
        const selfIdx = selfEndingIndex(body, id);
        body.nodes[id]!.ends.forEach((e, index) => {
          if (index === selfIdx || isChrome(e) || (e.wander !== undefined && e.wander > 0)) return;
          out.push({ ending: { node: id, index } });
        });
      }
      return out;
    }
    case "organ": {
      const p = payload as Payloads["organ"];
      if (!validOrgan(p.organ, p.mount)) return out;
      const m = organMass(p.organ);
      if (!room(body, sc, m)) return out;
      if (p.mount === "cavity") {
        // One brain per cavity (step J), as one per head: a second would only pile channels into the belly.
        const brain = isBrainKind(p.organ.kind);
        for (const id of sc.segments) {
          const s = body.segments[id]!;
          if (s.cavity.length >= cavitySlots(s) || !COVERS[s.cover].mutates || cavityLoad(s) + m > capacity(s) + EPS) continue;
          if (brain && s.cavity.some((o) => isBrainKind(o.kind))) continue;
          out.push({ segment: id });
        }
        return out;
      }
      if (p.mount === "growth") {
        // A mark tells the rules one thing about a segment; twice is nothing new.
        const mark = hasTag(p.organ.kind, "mark");
        for (const id of sc.segments) {
          const s = body.segments[id]!;
          if (!COVERS[s.cover].mutates || s.growths.length >= growthSlots(s)) continue;
          if (mark && s.growths.some((g) => g.kind === p.organ.kind)) continue;
          out.push({ segment: id });
        }
        return out;
      }
      const cap = HEAD_SLOTS[p.organ.kind];
      for (const id of sc.nodes) {
        body.nodes[id]!.ends.forEach((e, index) => {
          if (e.kind !== "head" || isChrome(e)) return;
          const inside = e.contents ?? [];
          if (isBrainKind(p.organ.kind) && inside.some((c) => isBrainKind(c.kind))) return;
          // Psionics works the mind of the head it sits in: a head without a brain has none to push with (decision 1237).
          if (hasTag(p.organ.kind, "psionic") && !inside.some((c) => isBrainKind(c.kind))) return;
          if (cap !== undefined && inside.filter((c) => c.kind === p.organ.kind).length >= cap) return;
          out.push({ ending: { node: id, index } });
        });
      }
      return out;
    }
    case "resize": {
      const p = payload as Payloads["resize"];
      if (!isSizedKind(p.kind)) return out;
      for (const id of sc.nodes) {
        body.nodes[id]!.ends.forEach((e, index) => {
          if (isChrome(e)) return;
          const at = resizableAt(body, e, p);
          if (at !== null && room(body, sc, at)) out.push({ ending: { node: id, index } });
        });
      }
      for (const id of sc.segments) {
        const s = body.segments[id]!;
        if (!COVERS[s.cover].mutates) continue;
        let delta: number | null = null;
        for (const o of [...s.cavity, ...s.growths]) {
          const d = stepDelta(o, p);
          if (d !== null) {
            delta = d;
            break;
          }
        }
        if (delta !== null && room(body, sc, delta)) out.push({ segment: id });
      }
      return out;
    }
    case "cover": {
      const p = payload as Payloads["cover"];
      const spec = COVERS[p.cover] as (typeof COVERS)[keyof typeof COVERS] | undefined;
      if (spec === undefined) return out;
      for (const id of sc.segments) {
        const s = body.segments[id]!;
        if (s.cover === p.cover || !COVERS[s.cover].mutates) continue;
        if (room(body, sc, segmentMassOf(s.kind, s.length, s.girth, p.cover) - segmentMass(s))) out.push({ segment: id });
      }
      return out;
    }
    case "bloat": {
      for (const id of sc.segments) {
        const s = body.segments[id]!;
        if (!swells(s)) continue;
        const grown = bloated(s);
        if (grown !== null && room(body, sc, segmentMassOf("torso", grown.length, grown.girth, s.cover) - segmentMass(s))) out.push({ segment: id });
      }
      return out;
    }
    case "engulf": {
      for (const id of sc.segments) {
        const plan = engulfPlan(body, sc, body.segments[id]!);
        if (plan !== null && room(body, sc, plan.delta)) out.push({ segment: id });
      }
      return out;
    }
    case "sink": {
      for (const id of sc.segments) if (sinkPlan(body, sc, body.segments[id]!) !== null) out.push({ segment: id });
      return out;
    }
    case "split": {
      if (!segRoom || closure(body) >= LIMITS.cycles) return out;
      for (const id of sc.segments) {
        const s = body.segments[id]!;
        if (freeSlots(body, sc, s.a) < 1 || freeSlots(body, sc, s.b) < 1) continue;
        const plan = splitPlan(body, s);
        if (plan === null) continue;
        // Flesh goes by section: two halves weigh less than the whole, and the skeleton that carried the difference goes with it (decision 1260).
        const halves: Segment[] = [
          { ...s, girth: plan.g1 },
          { ...s, girth: plan.g2 },
        ];
        const delta = segmentMass(halves[0]!) + segmentMass(halves[1]!) - segmentMass(s) - plan.evicted.reduce((m, o) => m + organMass(o), 0);
        if (room(body, sc, delta + ceilingLoss(body, [s], halves))) out.push({ segment: id });
      }
      return out;
    }
    case "merge": {
      // The meat stands at the ceiling for a mutation's draw, and a merge may lower the ceiling: that room must be there too.
      for (const id of sc.nodes) {
        const plan = mergePlan(body, sc, id);
        if (plan !== null && room(body, sc, plan.delta + plan.loss)) out.push({ node: id });
      }
      return out;
    }
    case "flesh": {
      for (const id of sc.segments) {
        const plan = fleshPlan(body, sc, body.segments[id]!);
        if (plan !== null && room(body, sc, plan.delta)) out.push({ segment: id });
      }
      return out;
    }
    case "shift": {
      for (const id of sc.segments) if (shiftPlan(body, sc, body.segments[id]!) !== null) out.push({ segment: id });
      return out;
    }
  }
}

/** The conditions of a SPROUT that do not depend on the node: the limits, the kinds, the flesh. A joint forks with these (mutation.ts). */
export function sproutFits(body: Body, p: Payloads["sprout"], sc: Scan = scan(body)): boolean {
  if (!validLimb(p) || sc.nodes.length >= LIMITS.nodes || sc.segments.length >= LIMITS.segments) return false;
  if (p.ending !== null && !validOrgan(p.ending, "end")) return false;
  let delta = segmentMassOf(p.kind, p.length, p.girth, p.cover) + (p.ending ? organMass(p.ending) : 0);
  for (const g of p.growths ?? []) delta += organMass(g);
  if (!room(body, sc, delta)) return false;
  return !(p.ending?.kind === "head" && countHeads(body) >= LIMITS.heads);
}

/** The conditions of a BRANCH of this ending that do not depend on the node's room. */
export function branchFits(body: Body, p: Payloads["branch"], ending: Organ): boolean {
  const sc = scan(body);
  if (!validLimb(p) || sc.nodes.length + 2 > LIMITS.nodes || sc.segments.length + 2 > LIMITS.segments) return false;
  if (isChrome(ending)) return false;
  if (ending.kind === "head" && countHeads(body) + 1 > LIMITS.heads) return false;
  return room(body, sc, 2 * segmentMassOf(p.kind, p.length, p.girth, p.cover) + organMass(ending));
}

function targetId(t: Target): number {
  if ("node" in t) return t.node;
  if ("segment" in t) return t.segment;
  if ("ending" in t) return t.ending.node;
  if ("pair" in t) return t.pair[0];
  return Math.min(...t.cycle);
}

function targetNodes(body: Body, t: Target): number[] {
  if ("node" in t) return [t.node];
  if ("segment" in t) return [body.segments[t.segment]!.a, body.segments[t.segment]!.b];
  if ("ending" in t) return [t.ending.node];
  if ("pair" in t) return [t.pair[0], t.pair[1]];
  const out = new Set<number>();
  for (const sid of t.cycle) {
    const s = body.segments[sid];
    if (s !== undefined) out.add(s.a).add(s.b);
  }
  return [...out].sort((x, y) => x - y);
}

function instabilityAt(body: Body, t: Target): number {
  if ("segment" in t) {
    const s = body.segments[t.segment]!;
    let n = 0;
    for (const o of [...s.cavity, ...s.growths]) n += organInstability(o);
    return n;
  }
  if ("ending" in t) return organInstability(body.nodes[t.ending.node]!.ends[t.ending.index]!);
  let n = 0;
  for (const id of targetNodes(body, t)) for (const o of body.nodes[id]!.ends) n += organInstability(o);
  return n;
}

function woundedAt(body: Body, t: Target): boolean {
  if ("segment" in t) return body.segments[t.segment]!.wound > 0;
  return targetNodes(body, t).some((id) => body.nodes[id]!.wound > 0);
}

function baitAt(body: Body, t: Target): boolean {
  if ("segment" in t) return false;
  return targetNodes(body, t).some((id) => body.nodes[id]!.bait);
}

function distanceAt(body: Body, t: Target, dist: Record<number, number>): number {
  if ("segment" in t) return elementDistance(dist, body, t.segment) ?? 0;
  let d = Infinity;
  for (const id of targetNodes(body, t)) d = Math.min(d, dist[id] ?? Infinity);
  return Number.isFinite(d) ? d : 0;
}

/**
 * weight = 1
 *        x (1 + instability of organs in the place / 25)
 *        x 2 if the place was wounded in the last 20 turns
 *        x (1 + d / 5) if the abyss strikes
 *        x 5 if it is a ripper's stub
 */
export function weigh(body: Body, list: Target[], ctx?: GrowContext): Weighted[] {
  const dist = ctx?.source === "abyss" ? distances(body, body.self) : undefined;
  return list.map((target) => {
    let weight = 1 + instabilityAt(body, target) / 25;
    if (woundedAt(body, target)) weight *= 2;
    if (dist !== undefined) weight *= 1 + distanceAt(body, target, dist) / 5;
    if (baitAt(body, target)) weight *= 5;
    return { target, weight };
  });
}

export function targets<K extends Op>(body: Body, op: K, payload: Payload<K>, ctx?: GrowContext): Weighted[] {
  return weigh(body, candidates(body, op, payload), ctx);
}

/** A weighted draw over a list; one rng call, none for an empty list. */
export function drawWeighted(list: readonly Weighted[], rng: Rng): Target | null {
  if (list.length === 0) return null;
  let total = 0;
  for (const w of list) {
    if (!Number.isFinite(w.weight) || w.weight < 0) throw new RangeError("invalid target weight");
    total += w.weight;
  }
  if (!Number.isFinite(total)) throw new RangeError("target weight overflow");
  if (total === 0) return null;
  let r = rng.next() * total;
  for (const w of list) {
    r -= w.weight;
    if (r < 0) return w.target;
  }
  for (let i = list.length - 1; i >= 0; i--) if (list[i]!.weight > 0) return list[i]!.target;
  return null;
}

/** A weighted draw over `targets`; one rng call, none when there is nothing to choose. */
export function pickTarget<K extends Op>(body: Body, op: K, payload: Payload<K>, rng: Rng, ctx?: GrowContext): Target | null {
  return drawWeighted(targets(body, op, payload, ctx), rng);
}

function cloneOrgan(o: Organ): Organ {
  return structuredClone(o);
}

/**
 * Pushes organs out of a cavity that shrank (a torso's or a limb's), last in first out, never
 * your brain. Your slot follows the brain when something before it leaves. A cavity is too small
 * by mass or by count: a limb holds one organ whatever it weighs (`cavitySlots`), and СУНУТАЯ
 * ГОЛОВА used to pour a whole neck's cavity into a leg and leave it holding two (decision 613).
 */
export function fitCavity(body: Body, seg: Segment): Organ[] {
  const evicted: Organ[] = [];
  const mine = selfSlot(body, seg.id);
  const slots = cavitySlots(seg);
  let slot = mine;
  let i = seg.cavity.length - 1;
  while ((cavityLoad(seg) > capacity(seg) || seg.cavity.length > slots) && i >= 0) {
    if (i === mine) {
      i -= 1;
      continue;
    }
    const o = seg.cavity[i]!;
    seg.cavity.splice(i, 1);
    evicted.push(o);
    body.meat -= organMass(o);
    if (i < mine) slot -= 1;
    i -= 1;
  }
  if (slot !== mine) setSelf(body, { segment: seg.id, slot });
  return evicted;
}

function needNode(body: Body, id: number): BodyNode {
  const n = body.nodes[id];
  if (n === undefined) throw new Error(`apply: node ${id} does not exist`);
  return n;
}

function needSegment(body: Body, id: number): Segment {
  const s = body.segments[id];
  if (s === undefined) throw new Error(`apply: segment ${id} does not exist`);
  return s;
}

/** Performs an operation on a valid target. Throws when the target is not one `targets` would list. */
export function apply<K extends Op>(body: Body, op: K, payload: Payload<K>, target: Target): ApplyResult {
  if (!candidates(body, op, payload).some((t) => sameTarget(t, target))) {
    throw new Error(`apply ${op}: invalid target ${JSON.stringify(target)}`);
  }
  const result = applyOp(body, op, payload, target);
  // A torso split, thinned or taken away passes its side nodes on: the places say where they hang now (decision 1258).
  reconcilePlaces(body);
  return result;
}

function applyOp<K extends Op>(body: Body, op: K, payload: Payload<K>, target: Target): ApplyResult {
  const result: ApplyResult = { created: [], removed: [], evicted: [] };
  switch (op) {
    case "sprout": {
      const p = payload as Payloads["sprout"];
      let from: number;
      if ("segment" in target) {
        // The side node hangs on the segment it grew on, at the first free place of it (decision 1258).
        const { end, place } = nextFlankPlace(body, target.segment);
        from = addNode(body, sideNodeSize(body.segments[target.segment]!));
        const flank = addSegment(body, end, from, { kind: "flank", length: 0, girth: 1, cover: body.segments[target.segment]!.cover, breakPlane: false });
        body.segments[flank]!.place = place;
        result.created.push(from, flank);
      } else from = (target as { node: number }).node;
      const node = addNode(body, 1, { ends: p.ending ? [cloneOrgan(p.ending)] : [], bait: p.bait ?? false });
      const seg = addSegment(body, from, node, {
        kind: p.kind,
        length: p.length,
        girth: p.girth,
        cover: p.cover,
        growths: (p.growths ?? []).map(cloneOrgan),
        breakPlane: p.breakPlane ?? false,
      });
      result.created.push(node, seg);
      return result;
    }
    case "growth": {
      const t = target as { node: number };
      const node = addNode(body, 1);
      const seg = addSegment(body, t.node, node, { kind: "growth", length: 1, girth: 1, cover: "skin", breakPlane: false });
      result.created.push(node, seg);
      return result;
    }
    case "joint": {
      const p = payload as Payloads["joint"];
      const s = needSegment(body, (target as { segment: number }).segment);
      if (s.length < 2) {
        const at = bareJointEnd(body, scan(body), s)!;
        body.nodes[at]!.ends.push(cloneOrgan(p.ending!));
        touch(body);
        return result;
      }
      const farEnd = s.b;
      const node = addNode(body, 1, { ends: p.ending ? [cloneOrgan(p.ending)] : [] });
      const total = s.length;
      s.b = node;
      s.length = Math.ceil(total / 2);
      refreshSegmentHp(s);
      const seg = addSegment(body, node, farEnd, {
        kind: s.kind,
        length: Math.floor(total / 2),
        girth: s.girth,
        cover: s.cover,
        breakPlane: false,
      });
      // What no longer fits the first half moves into the second, as far as it takes it; only the rest is pushed out.
      const half = body.segments[seg]!;
      const mine = selfSlot(body, s.id);
      for (let i = s.cavity.length - 1; i >= 0 && (cavityLoad(s) > capacity(s) + EPS || s.cavity.length > cavitySlots(s)); i--) {
        if (i === mine) continue;
        const o = s.cavity[i]!;
        if (half.cavity.length < cavitySlots(half) && cavityLoad(half) + organMass(o) <= capacity(half) + EPS) {
          s.cavity.splice(i, 1);
          half.cavity.push(o);
        }
      }
      result.evicted = fitCavity(body, s);
      splitInMembranes(body, s.id, seg);
      result.created.push(node, seg);
      return result;
    }
    case "branch": {
      const p = payload as Payloads["branch"];
      const t = target as { ending: { node: number; index: number } };
      const n = needNode(body, t.ending.node);
      const mine = selfEndingIndex(body, n.id);
      const [ending] = n.ends.splice(t.ending.index, 1);
      if (mine > t.ending.index) setSelf(body, { node: n.id, end: mine - 1 });
      for (let i = 0; i < 2; i++) {
        const tip = addNode(body, 1, { ends: [cloneOrgan(ending!)] });
        const seg = addSegment(body, n.id, tip, { kind: p.kind, length: p.length, girth: p.girth, cover: p.cover, breakPlane: false });
        result.created.push(tip, seg);
      }
      return result;
    }
    case "rebirth": {
      const p = payload as Payloads["rebirth"];
      const t = target as { ending: { node: number; index: number } };
      needNode(body, t.ending.node).ends[t.ending.index] = cloneOrgan(p.ending);
      touch(body);
      return result;
    }
    case "thicken": {
      const s = needSegment(body, (target as { segment: number }).segment);
      s.kind = "torso";
      s.girth += 1;
      // The limb's one organ stays: the cavity only grows (flank.ts).
      refreshSegmentHp(s);
      touch(body);
      return result;
    }
    case "thin": {
      const s = needSegment(body, (target as { segment: number }).segment);
      s.girth -= 1;
      refreshSegmentHp(s);
      result.evicted = fitCavity(body, s);
      trimMembranesOn(body, s.id);
      touch(body);
      return result;
    }
    case "stretch": {
      const p = payload as Payloads["stretch"];
      const s = needSegment(body, (target as { segment: number }).segment);
      s.length += p.delta;
      refreshSegmentHp(s);
      result.evicted = fitCavity(body, s);
      stretchInMembranes(body, s.id, p.delta);
      touch(body);
      return result;
    }
    case "enlarge": {
      const n = needNode(body, (target as { node: number }).node);
      n.size = (n.size + 1) as 1 | 2 | 3;
      refreshNodeHp(n);
      touch(body);
      return result;
    }
    case "fusion": {
      const [u, v] = (target as { pair: [number, number] }).pair;
      const U = needNode(body, u);
      const V = needNode(body, v);
      let lost = 0;
      for (const o of [...U.ends, ...V.ends]) lost += organMass(o);
      // What came from the swallowed node, so a knife can part it again (decision 1228).
      const came = segmentIds(body).filter((sid) => body.segments[sid]!.a === v || body.segments[sid]!.b === v);
      U.fused = [...(U.fused ?? []), came];
      for (const sid of segmentIds(body)) {
        const s = body.segments[sid]!;
        if (s.a === v) s.a = u;
        if (s.b === v) s.b = u;
      }
      U.size = Math.max(U.size, V.size) as 1 | 2 | 3;
      refreshNodeHp(U);
      U.ends = [];
      U.wound = Math.max(U.wound, V.wound);
      delete body.nodes[v];
      body.meat -= lost;
      result.removed.push(v, ...tearMembranes(body));
      touch(body);
      return result;
    }
    case "necrosis": {
      const id = "node" in target ? target.node : (target as { segment: number }).segment;
      const region = starvedRegions(body, scan(body)).find((r) => r.includes(id))!;
      const { stumps } = removeElements(body, region);
      result.removed = region;
      result.created = stumps;
      return result;
    }
    case "membrane": {
      const p = payload as Payloads["membrane"];
      result.created.push(addMembrane(body, (target as { cycle: number[] }).cycle, p.kind));
      return result;
    }
    case "double": {
      const h = hangingPart(body, (target as { segment: number }).segment)!;
      result.created = copyPart(body, h.attach, h.part);
      return result;
    }
    case "migrate": {
      const t = target as { ending: { node: number; index: number } };
      needNode(body, t.ending.node).ends[t.ending.index]!.wander = WANDER_TURNS;
      touch(body);
      return result;
    }
    case "organ": {
      const p = payload as Payloads["organ"];
      const o = cloneOrgan(p.organ);
      if (p.mount === "cavity") needSegment(body, (target as { segment: number }).segment).cavity.push(o);
      else if (p.mount === "growth") needSegment(body, (target as { segment: number }).segment).growths.push(o);
      else {
        const t = target as { ending: { node: number; index: number } };
        const head = needNode(body, t.ending.node).ends[t.ending.index]!;
        head.contents ??= [];
        head.contents.push(o);
      }
      touch(body);
      return result;
    }
    case "resize": {
      const p = payload as Payloads["resize"];
      if ("segment" in (target as object)) {
        const s = needSegment(body, (target as { segment: number }).segment);
        if (!stepInList(s.cavity, p)) stepInList(s.growths, p);
        touch(body);
        return result;
      }
      const t = target as { ending: { node: number; index: number } };
      const node = needNode(body, t.ending.node);
      const end = node.ends[t.ending.index]!;
      // The ending itself steps, or what it holds: a huge jaw in a head of the usual size.
      if (stepDelta(end, p) !== null) stepOrgan(end, p.size);
      else stepInList(end.contents ?? [], p);
      // A big ending stiffens the node it sits on, a small one softens it (sizes.ts).
      refreshNodeHp(node);
      touch(body);
      return result;
    }
    case "cover": {
      const p = payload as Payloads["cover"];
      needSegment(body, (target as { segment: number }).segment).cover = p.cover;
      touch(body);
      return result;
    }
    case "bloat": {
      const s = needSegment(body, (target as { segment: number }).segment);
      const grown = bloated(s)!;
      const longer = grown.length - s.length;
      s.girth = grown.girth;
      s.length = grown.length;
      refreshSegmentHp(s);
      s.wound = 20;
      if (longer > 0) stretchInMembranes(body, s.id, longer);
      touch(body);
      return result;
    }
    case "engulf": {
      const s = needSegment(body, (target as { segment: number }).segment);
      const { near, far, torso } = engulfPlan(body, scan(body), s)!;
      moveEndings(body, far, near);
      moveGrowths(s.growths, torso.growths);
      const mine = selfSlot(body, s.id);
      const base = torso.cavity.length;
      torso.cavity.push(...s.cavity);
      if (mine >= 0) setSelf(body, { segment: torso.id, slot: base + mine });
      torso.girth += 1;
      refreshSegmentHp(torso);
      body.meat -= segmentMass(s);
      delete body.segments[s.id];
      delete body.nodes[far];
      // A limb swallowed by the torso takes its skin along: what the torso cannot carry tears.
      result.removed.push(far, s.id, ...remapMembranes(body, new Map([[s.id, torso.id]])), ...tearMembranes(body));
      touch(body);
      return result;
    }
    case "sink": {
      const s = needSegment(body, (target as { segment: number }).segment);
      const sc = scan(body);
      const { headNode, other, merge } = sinkPlan(body, sc, s)!;
      if (!merge) {
        s.length -= 1;
        refreshSegmentHp(s);
        result.evicted = fitCavity(body, s);
        stretchInMembranes(body, s.id, -1);
        touch(body);
        return result;
      }
      const H = body.nodes[headNode]!;
      const O = body.nodes[other]!;
      moveEndings(body, headNode, other);
      rerootSegments(body, sc, headNode, other, [s.id]);
      // The growths of the segment stay on the body: on a torso at the node, else on its first other segment.
      const rest = (sc.adj.get(other) ?? []).filter((sid) => sid !== s.id && !isFlank(body.segments[sid]!));
      const carrier = torsosAt(body, sc, other)[0] ?? rest[0];
      const host = carrier === undefined ? undefined : body.segments[carrier]!;
      if (host !== undefined) moveGrowths(s.growths, host.growths);
      else for (const g of s.growths) body.meat -= organMass(g);
      // The cavity goes the same way (decision 165): a limb holds an organ too since side nodes, and the segment is
      // about to be deleted. Into the carrier's cavity when it has one - what does not fit there is pushed out and
      // counted - else out of the body. Without this a heart or a pair of lungs vanished with the neck, unreported.
      if (s.cavity.length > 0) {
        if (host !== undefined && cavitySlots(host) > 0) {
          host.cavity.push(...s.cavity);
          s.cavity = [];
          result.evicted = fitCavity(body, host);
        } else {
          result.evicted = [...s.cavity];
          for (const o of s.cavity) body.meat -= organMass(o);
          s.cavity = [];
        }
      }
      O.wound = Math.max(O.wound, H.wound);
      body.meat -= segmentMass(s);
      delete body.segments[s.id];
      delete body.nodes[headNode];
      result.removed.push(headNode, s.id, ...remapMembranes(body, new Map([[s.id, null]])), ...tearMembranes(body));
      touch(body);
      return result;
    }
    case "split": {
      const s = needSegment(body, (target as { segment: number }).segment);
      const plan = splitPlan(body, s)!;
      const twin = addSegment(body, s.a, s.b, { kind: "torso", length: s.length, girth: plan.g2, cover: s.cover, breakPlane: false });
      const mine = selfSlot(body, s.id);
      const brain = mine >= 0 ? s.cavity[mine] : undefined;
      // Two halves of a section weigh less than the whole: what goes leaves the meat (decision 1260).
      const whole = segmentMass(s);
      s.girth = plan.g1;
      body.meat -= whole - segmentMass(s) - segmentMass(body.segments[twin]!);
      refreshSegmentHp(s);
      s.cavity = plan.keep;
      body.segments[twin]!.cavity = plan.twin;
      for (const o of plan.evicted) body.meat -= organMass(o);
      if (brain !== undefined) setSelf(body, { segment: s.id, slot: s.cavity.indexOf(brain) });
      result.created.push(twin);
      result.evicted = plan.evicted;
      touch(body);
      return result;
    }
    case "merge": {
      const n = (target as { node: number }).node;
      needNode(body, n);
      const sc = scan(body);
      const { t1, t2, far, host, others } = mergePlan(body, sc, n)!;
      const mine = selfSlot(body, t2.id);
      const base = t1.cavity.length;
      if (t1.a === n) t1.a = far;
      else t1.b = far;
      t1.length += t2.length;
      t1.girth = Math.max(t1.girth, t2.girth);
      refreshSegmentHp(t1);
      t1.cavity.push(...t2.cavity);
      moveGrowths(t2.growths, t1.growths);
      t1.wound = Math.max(t1.wound, t2.wound);
      if (mine >= 0) setSelf(body, { segment: t1.id, slot: base + mine });
      moveEndings(body, n, host);
      for (const sid of others) {
        const o = body.segments[sid]!;
        if (o.a === n) o.a = host;
        if (o.b === n) o.b = host;
      }
      delete body.segments[t2.id];
      delete body.nodes[n];
      result.removed.push(n, t2.id, ...remapMembranes(body, new Map([[t2.id, t1.id]])), ...tearMembranes(body));
      touch(body);
      return result;
    }
    case "flesh": {
      const s = needSegment(body, (target as { segment: number }).segment);
      const sc = scan(body);
      const { near, far } = fleshPlan(body, sc, s)!;
      s.kind = "torso";
      s.girth += 1;
      s.cavity = [];
      refreshSegmentHp(s);
      const F = body.nodes[far]!;
      if (F.size < 2) {
        F.size = 2;
        refreshNodeHp(F);
      }
      let free = 2 * F.size - degree(sc, far, body);
      for (const sid of sc.adj.get(near) ?? []) {
        if (free <= 0) break;
        const o = body.segments[sid]!;
        if (sid === s.id || !HANGING_KINDS.includes(o.kind) || degree(sc, otherEnd(o, near)) !== 1) continue;
        if (o.a === near) o.a = far;
        else o.b = far;
        free -= 1;
      }
      touch(body);
      return result;
    }
    case "shift": {
      const s = needSegment(body, (target as { segment: number }).segment);
      const { from, to, flank } = shiftPlan(body, scan(body), s)!;
      const moved = flank === undefined ? s : body.segments[flank]!;
      if (moved.a === from) moved.a = to;
      else moved.b = to;
      result.removed.push(...tearMembranes(body));
      touch(body);
      return result;
    }
  }
  throw new Error(`apply: unknown operation ${String(op)}`);
}

/**
 * Picks a target and applies the operation. With nowhere to land, a tumour
 * grows at a random node instead; with no room even for that, the operation
 * is lost and null comes back.
 */
export function grow<K extends Op>(body: Body, op: K, payload: Payload<K>, rng: Rng, ctx?: GrowContext): GrowResult | null {
  const target = pickTarget(body, op, payload, rng, ctx);
  if (target !== null) {
    apply(body, op, payload, target);
    return { op, payload, target, fallback: false };
  }
  const fallback = pickTarget(body, "growth", {}, rng, ctx);
  if (fallback === null) return null;
  apply(body, "growth", {}, fallback);
  return { op: "growth", payload: {}, target: fallback, fallback: true };
}
