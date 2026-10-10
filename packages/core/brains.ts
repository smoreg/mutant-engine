/**
 * Every brain of the body as data: where it sits, the head that holds it, its
 * sway, whether it still lives, whether it is you. Sway is read here and
 * moved by the game (mind.md). A brain that has gone 5 turns without blood is
 * dead for every rule of this step (body-graph.md §5); the organ itself stays
 * until its element rots, as in step A.
 */
import type { Body, BrainRef, Organ, Place } from "./graph.js";
import { brainAt, brainRefsIn, headAt, nodeIds, sameRef, segmentIds, selfRef, touch } from "./graph.js";
import { distances } from "./metrics.js";
import { ORGANS } from "./parts.js";

export const BRAIN_DEATH_TURNS = 5;

export interface Brain {
  ref: BrainRef;
  /** `n<node>.<end>` or `s<segment>.<slot>`: a map key valid for this body state. */
  key: string;
  /** Where it is for distances: the node, or the segment (measured from its middle). */
  place: Place;
  organ: Organ;
  /** The head that holds it; null for a brain in a cavity. */
  head: Organ | null;
  sway: number;
  alive: boolean;
  self: boolean;
}

export function brainKey(ref: BrainRef): string {
  return "node" in ref ? `n${ref.node}.${ref.end}` : `s${ref.segment}.${ref.slot}`;
}

/** Alive while its element has had blood within the last 5 turns. */
export function brainAlive(body: Body, ref: BrainRef): boolean {
  const el = "node" in ref ? body.nodes[ref.node] : body.segments[ref.segment];
  return el !== undefined && brainAt(body, ref) !== undefined && el.ischemia < BRAIN_DEATH_TURNS;
}

/** Channels a brain gives; all brains give what the table says. */
export function channelsOf(brain: Brain): number {
  return ORGANS[brain.organ.kind].channels ?? 0;
}

function describe(body: Body, ref: BrainRef, me: BrainRef | undefined): Brain {
  const organ = brainAt(body, ref)!;
  return {
    ref,
    key: brainKey(ref),
    place: "node" in ref ? { node: ref.node } : { segment: ref.segment },
    organ,
    head: headAt(body, ref) ?? null,
    sway: organ.sway ?? 0,
    alive: brainAlive(body, ref),
    self: me !== undefined && sameRef(me, ref),
  };
}

/** All brains by element id, then by position inside the element. */
export function brains(body: Body): Brain[] {
  const me = selfRef(body);
  const out: Brain[] = [];
  const ids = [...nodeIds(body), ...segmentIds(body)].sort((x, y) => x - y);
  for (const id of ids) for (const ref of brainRefsIn(body, id)) out.push(describe(body, ref, me));
  return out;
}

/** You, as a brain. */
export function selfOf(body: Body): Brain | undefined {
  const me = selfRef(body);
  return me === undefined ? undefined : describe(body, me, me);
}

/**
 * Distance from one place to another along segment lengths: to a node, or to
 * the middle of a segment (body-graph.md §4). Undefined when unreachable.
 */
export function placeDistance(body: Body, from: Place, to: Place): number | undefined {
  return placeDistanceWith(body, distances(body, from), from, to);
}

/** The same, over distances already computed from `from`. */
export function placeDistanceWith(body: Body, dist: Record<number, number>, from: Place, to: Place): number | undefined {
  if ("node" in to) return dist[to.node];
  if (!("node" in from) && from.segment === to.segment) return 0;
  const s = body.segments[to.segment];
  if (s === undefined) return undefined;
  const da = dist[s.a];
  const db = dist[s.b];
  if (da === undefined && db === undefined) return undefined;
  return Math.min(da ?? Infinity, db ?? Infinity) + s.length / 2;
}

/** How far sway goes: 0 is a brain at peace with you, 10 one that has all but left. */
const SWAY_MAX = 10;

/**
 * Moves a brain's sway to `sway`, rounded and held inside 0..`SWAY_MAX`; 0 is
 * written as no sway at all, the way the text of a body spells it. Null when
 * there is no brain at `ref` (decision 1232).
 */
export function setSway(body: Body, ref: BrainRef, sway: number): { from: number; to: number } | null {
  const organ = brainAt(body, ref);
  if (organ === undefined) return null;
  const from = organ.sway ?? 0;
  const to = Math.max(0, Math.min(SWAY_MAX, Math.round(sway)));
  if (to === 0) delete organ.sway;
  else organ.sway = to;
  touch(body);
  return { from, to };
}
