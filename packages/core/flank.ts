/**
 * Side nodes (body-graph.md §1, decision 117): a torso and a limb hold nodes
 * along their sides, not only at their two ends - shoulders and hips are
 * nodes of their own, apart from the neck. A side node hangs on a flank: a
 * segment of length 0 and no mass from an end of its host to the side node,
 * so distances, cuts and blood run through the graph as they always did and
 * the side node sits exactly as far from your brain as the host's end.
 *
 * The flank stores its place (decision 1258): the host, a segment touching
 * the flank's first end `a`, the fraction along it and the side. A flank
 * without one - a text written before places were data - hangs on the
 * segment of the highest tier at `a` that still has room (a torso wins a
 * tie, then the smaller id), and a body read from text keeps that place from
 * then on. No segment holds more side nodes than its places. The side node
 * is the flank's `b`.
 *
 * Tiers: a limb (1), then the torsos - the human's (3), a bull's (4), an
 * elephant's (5), a whale's (6). Every torso is at least the human's,
 * whatever it was thickened from, and girth and length both push it up
 * (decision 220). A tier sets how many side nodes the segment holds; a limb
 * also holds one organ inside and two or three growths by its length, a
 * torso more of both as it grows.
 */
import type { Body, FlankPlace, Segment, SegmentKind } from "./graph.js";
import { segmentsAt } from "./graph.js";

/**
 * What every side-node question reads off a body, worked out once per shape:
 * the host of each flank, the flanks of each host, the anchor of
 * each node and the limbs as chains. The key is a signature of the shape
 * itself - every segment's ends, kind, length and girth, every node's
 * endings - so a body
 * changed without a new `version` is never answered from a stale table.
 */
interface Tables {
  sig: number;
  host: Map<number, number>;
  flanks: Map<number, number[]>;
  /** Hosts and flanks as the nodes would give them, the stored places aside: what a text without places means. */
  worked: { host: Map<number, number>; flanks: Map<number, number[]> };
  anchor: Map<number, number>;
  chains: LimbChain[];
}

const CACHE = new WeakMap<Body, Tables>();

/** A cheap number that changes with the shape: FNV-1a over the nodes and the segments, one pass. */
function shapeSig(body: Body): number {
  let sig = 0x811c9dc5;
  const mix = (v: number): void => {
    sig = Math.imul(sig ^ (v & 0xff), 0x01000193);
    sig = Math.imul(sig ^ ((v >>> 8) & 0xff), 0x01000193);
    sig = Math.imul(sig ^ ((v >>> 16) & 0xff), 0x01000193);
  };
  const nodes = Object.keys(body.nodes);
  const segments = Object.keys(body.segments);
  mix(nodes.length);
  mix(segments.length);
  for (const key of nodes) {
    const n = body.nodes[Number(key)]!;
    mix(n.id);
    mix(n.ends.length);
  }
  for (const key of segments) {
    const g = body.segments[Number(key)]!;
    mix(g.id);
    mix(g.a);
    mix(g.b);
    mix(g.kind.charCodeAt(0) * 31 + g.kind.length);
    mix(g.length * 7 + g.girth);
    if (g.place !== undefined) {
      mix(g.place.host);
      mix(Math.round(g.place.t * 1e6));
      mix(g.place.side + 2);
    }
  }
  return sig;
}

function tables(body: Body): Tables {
  const sig = shapeSig(body);
  const seen = CACHE.get(body);
  if (seen !== undefined && seen.sig === sig) return seen;
  const built = build(body);
  built.sig = sig;
  CACHE.set(body, built);
  return built;
}

type Tier = 1 | 3 | 4 | 5 | 6;

/** Side nodes a segment of the tier holds: from the bull on, two more per step. */
const SIDE_SLOTS: Record<Tier, number> = { 1: 1, 3: 4, 4: 6, 5: 8, 6: 10 };

/** Growths a torso of the tier holds; a limb holds two, three from length 3. */
const GROWTH_SLOTS: Record<Tier, number> = { 1: 2, 3: 6, 4: 8, 5: 10, 6: 12 };

/** No torso is read below the human's tier: a body carries what a body carries (decision 220). */
const TORSO_MIN_TIER = 3;

/** The human's torso, against which a torso's own length is measured: every two units beyond it are a tier more. */
const HUMAN_TORSO_LENGTH = 2;

/** A limb's cavity holds one organ; a torso's is limited by mass alone. */
const LIMB_CAVITY_SLOTS = 1;

/** How far along a torso its first pair of side nodes sits, from the end the pair hangs from (decision 141). */
const TORSO_FLANK_T = 0.09;

/** Of a torso's length, how far inward a row of side nodes steps from its first pair to its last. */
const TORSO_ROW = 0.34;

/** How far from its own end a side node sits at most: past the middle it would be nearer the other end than the graph says. */
export const FLANK_T_MAX = 0.5;

/** Kinds that count as a limb: tier 1, one side node, one organ inside. */
const LIMB_TIER: readonly SegmentKind[] = ["arm", "leg", "tentacle", "tail", "neck"];

export function isFlank(seg: Segment): boolean {
  return seg.kind === "flank";
}

/**
 * The tier of a segment; 0 for kinds that hold no side nodes (stalk, growth,
 * gullet, flank). A torso is read from the body it is, not from its girth
 * alone: never below the human's third tier, however thin, and a tier more
 * for every two units of length beyond the human's two (decision 220). So a
 * thickened limb carries what a human's chest carries, and a long torso is
 * not a small one for holding its bulk in length instead of girth.
 */
export function tier(seg: Segment): Tier | 0 {
  if (seg.kind !== "torso") return LIMB_TIER.includes(seg.kind) ? 1 : 0;
  const long = Math.max(0, Math.floor((seg.length - HUMAN_TORSO_LENGTH) / 2));
  return Math.min(6, Math.max(TORSO_MIN_TIER, seg.girth + long)) as Tier;
}

export function sideSlots(seg: Segment): number {
  const t = tier(seg);
  return t === 0 ? 0 : SIDE_SLOTS[t];
}

/** Growths the segment takes: by tier, a limb by length; stalks, tumours and gullets as many as come, a flank none. */
export function growthSlots(seg: Segment): number {
  if (isFlank(seg)) return 0;
  if (seg.kind === "penis") return 2;
  const t = tier(seg);
  if (t === 0) return Infinity;
  if (t === 1) return seg.length <= 2 ? 2 : 3;
  return GROWTH_SLOTS[t];
}

/** Organs the cavity takes by count: a torso any (its mass decides), a limb one, the rest none. */
export function cavitySlots(seg: Segment): number {
  if (seg.kind === "torso") return Infinity;
  return tier(seg) === 1 ? LIMB_CAVITY_SLOTS : 0;
}

/**
 * Which segment at a node carries a side node: the biggest body there. A
 * torso is weighed by its own girth, not by the tier its slots are read at -
 * the floor under a torso's places says nothing about which of two torsos is
 * the bigger one.
 */
function hostRank(seg: Segment): number {
  if (seg.kind !== "torso") return tier(seg) * 2;
  return Math.min(6, Math.max(1, seg.girth)) * 2 + 1;
}

/** The segment a flank's side node sits on, or undefined when nothing at its end can host it. */
function hostOf(body: Body, flankId: number, room: (segId: number) => boolean): number | undefined {
  const f = body.segments[flankId];
  if (f === undefined || !isFlank(f)) return undefined;
  let best: number | undefined;
  let bestRank = 0;
  for (const sid of segmentsAt(body, f.a)) {
    const s = body.segments[sid]!;
    if (isFlank(s) || !room(sid)) continue;
    const rank = hostRank(s);
    if (rank > bestRank) {
      best = sid;
      bestRank = rank;
    }
  }
  return best;
}

/** Flanks hosted by the segment, by ascending id. */
function flanksBy(body: Body, segId: number, host: Map<number, number>): number[] {
  const seg = body.segments[segId];
  if (seg === undefined || isFlank(seg)) return [];
  const out: number[] = [];
  for (const end of [seg.a, seg.b]) {
    for (const sid of segmentsAt(body, end)) {
      if (!out.includes(sid) && isFlank(body.segments[sid]!) && body.segments[sid]!.a === end && host.get(sid) === segId) out.push(sid);
    }
  }
  return out.sort((x, y) => x - y);
}

/**
 * Where a node stands on the body plan: a side node stands at its host's end
 * (the flank's `a`, followed through side nodes on side nodes), any other
 * node at itself. Flanks have no length, so for the plan they are no step.
 */
function anchorBy(body: Body, node: number): number {
  let at = node;
  for (let guard = 0; guard < 64; guard++) {
    const f = segmentsAt(body, at).find((sid) => body.segments[sid]!.kind === "flank" && body.segments[sid]!.b === at);
    if (f === undefined) return at;
    at = body.segments[f]!.a;
  }
  return at;
}

/** Ends of every torso and the side nodes on them: where the body proper stops and limbs begin, ascending. */
export function torsoNodes(body: Body): number[] {
  const out = new Set<number>();
  for (const s of Object.values(body.segments)) {
    if (s.kind !== "torso") continue;
    out.add(s.a);
    out.add(s.b);
    for (const n of sideNodesOf(body, s.id)) out.add(n);
  }
  return [...out].sort((x, y) => x - y);
}

/** Side nodes of the segment, in the order of their flanks. */
export function sideNodesOf(body: Body, segId: number): number[] {
  return flanksOf(body, segId).map((f) => body.segments[f]!.b);
}

/** Side places the segment still has: its tier's, less the side nodes it holds (never more than its tier, decision 1258). */
export function freeSideSlots(body: Body, segId: number): number {
  const seg = body.segments[segId];
  return seg === undefined ? 0 : Math.max(0, sideSlots(seg) - flanksOf(body, segId).length);
}

/**
 * The end a new side node of the segment hangs from: a limb's first end, the
 * shoulder side. A torso's side nodes come in pairs: an end with an odd
 * count takes the next one to close its pair, otherwise the end with fewer,
 * the first on a tie.
 */
export function flankEnd(body: Body, segId: number): number {
  const seg = body.segments[segId]!;
  if (seg.kind !== "torso") return seg.a;
  let atA = 0;
  let atB = 0;
  for (const f of flanksOf(body, segId)) {
    if (body.segments[f]!.a === seg.a) atA += 1;
    else atB += 1;
  }
  if (atA % 2 === 1) return seg.a;
  if (atB % 2 === 1) return seg.b;
  return atB < atA ? seg.b : seg.a;
}

/**
 * Where a flank's side node sits on its host: the segment, the fraction of
 * its length from the flank's end (0 at that end) and the side, -1 or 1. The
 * place is the flank's own data (decision 1258): a sprout writes it, and it
 * stays when the neighbours grow or go. A flank without a place of its own, or
 * whose host is gone or no longer touches its end, is placed as its node
 * gives it (`workedPlace`).
 */
export function flankPlace(body: Body, flankId: number): FlankPlace | undefined {
  const f = body.segments[flankId];
  if (f === undefined || !isFlank(f)) return undefined;
  if (f.place === undefined) {
    // No place of its own: the one its node gives it, as a text without places means, while that host is still its host.
    const worked = workedPlace(body, flankId);
    return worked !== undefined && worked.host === flankHost(body, flankId) ? worked : rowPlace(body, flankId, tables(body));
  }
  // A host that split or lost its end passes the side node to the segment now at that end, at the same place.
  const host = flankHost(body, flankId);
  return host === undefined ? undefined : { host, t: f.place.t, side: f.place.side };
}

/** The flank's stored host, when it still stands: a segment that is no flank and touches the flank's end. */
function storedHost(body: Body, f: Segment): number | undefined {
  const p = f.place;
  if (p === undefined) return undefined;
  const h = body.segments[p.host];
  if (h === undefined || isFlank(h) || sideSlots(h) === 0 || (h.a !== f.a && h.b !== f.a)) return undefined;
  return p.host;
}

/**
 * The place a flank's node gives it, the stored places of every flank aside:
 * the host is the biggest body at the flank's end, and at one end side nodes
 * alternate sides by flank id, left first, each pair a step inward; a limb's
 * side node sits in its middle. This is what a text without places means, so
 * it reads a fixture as it was drawn, and a place is written only when it is
 * not this one.
 */
export function workedPlace(body: Body, flankId: number): FlankPlace | undefined {
  return rowPlace(body, flankId, tables(body).worked);
}

/** A flank's place by its row: the host the table gives it, its side and step by its number among the host's flanks at that end. */
function rowPlace(body: Body, flankId: number, t: { host: Map<number, number>; flanks: Map<number, number[]> }): FlankPlace | undefined {
  const host = t.host.get(flankId);
  if (host === undefined) return undefined;
  const f = body.segments[flankId]!;
  const row = (t.flanks.get(host) ?? []).filter((id) => body.segments[id]!.a === f.a);
  const i = row.indexOf(flankId);
  const side: -1 | 1 = i % 2 === 0 ? -1 : 1;
  if (body.segments[host]!.kind !== "torso") return { host, t: 0.5, side };
  // The first pair all but sits on the end it hangs from: shoulders at the top of the trunk, hips at
  // its bottom, not up in the waist (decision 141). Later pairs step inward.
  return { host, t: TORSO_FLANK_T + (TORSO_ROW * Math.floor(i / 2)) / Math.max(1, Math.ceil(row.length / 2)), side };
}

/** Whether two places are one: the same host, side and fraction. */
export function samePlace(a: FlankPlace | undefined, b: FlankPlace | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return a.host === b.host && a.side === b.side && Math.abs(a.t - b.t) < 1e-9;
}

/**
 * The place a new side node of the segment takes: the end `flankEnd` picks,
 * then the first free place of the segment's grid - a limb has one, in its
 * middle; a torso has its places in pairs at each end, the first pair at
 * `TORSO_FLANK_T` and the others a step inward, as many pairs per end as a
 * quarter of its places - left before right. The places already taken stay
 * where they are.
 */
export function nextFlankPlace(body: Body, segId: number): { end: number; place: FlankPlace } {
  const seg = body.segments[segId]!;
  if (seg.kind !== "torso") return { end: seg.a, place: { host: segId, t: 0.5, side: -1 } };
  const pairs = Math.max(1, Math.ceil(sideSlots(seg) / 4));
  const first = flankEnd(body, segId);
  const taken = flanksOf(body, segId).map((f) => ({ end: body.segments[f]!.a, p: flankPlace(body, f)! }));
  for (const end of [first, first === seg.a ? seg.b : seg.a]) {
    for (let k = 0; k < 2 * pairs; k++) {
      const t = Math.min(FLANK_T_MAX, TORSO_FLANK_T + (TORSO_ROW * k) / pairs);
      for (const side of [-1, 1] as const) {
        if (!taken.some((x) => x.end === end && x.p.side === side && Math.abs(x.p.t - t) < 1e-6)) return { end, place: { host: segId, t, side } };
      }
    }
  }
  return { end: first, place: { host: segId, t: FLANK_T_MAX, side: -1 } };
}

/** A limb as the player sees it: segments of one kind joined at bare joints, an arm from shoulder through elbow to hand. */
export interface LimbChain {
  kind: SegmentKind;
  /** From the root end to the tip. */
  segments: number[];
  length: number;
  root: number;
  tip: number;
}

/**
 * Every part of the body as a chain: segments of one kind (torsos and flanks
 * aside) that meet at a joint holding nothing else - exactly two segments,
 * no ending - are one limb. A torso is a part of its own; flanks are none.
 * Chains are listed by their smallest segment id; the root is the end nearer
 * to the smallest id's first end.
 */
function chainsOf(body: Body): LimbChain[] {
  const at = new Map<number, number[]>();
  const ids = Object.keys(body.segments)
    .map(Number)
    .sort((x, y) => x - y);
  for (const id of ids) {
    const s = body.segments[id]!;
    if (isFlank(s)) continue;
    for (const n of [s.a, s.b]) at.set(n, [...(at.get(n) ?? []), id]);
  }
  const joint = (n: number, kind: SegmentKind): boolean => {
    const list = at.get(n) ?? [];
    return kind !== "torso" && list.length === 2 && body.nodes[n]!.ends.length === 0 && list.every((sid) => body.segments[sid]!.kind === kind);
  };
  const seen = new Set<number>();
  const out: LimbChain[] = [];
  for (const id of ids) {
    const first = body.segments[id]!;
    if (isFlank(first) || seen.has(id)) continue;
    // Walk back to the root through joints, then forward to the tip.
    let root = first.a;
    let via = id;
    for (let guard = 0; guard < 64 && joint(root, first.kind); guard++) {
      const next = at.get(root)!.find((sid) => sid !== via)!;
      if (next === id) break;
      via = next;
      root = body.segments[next]!.a === root ? body.segments[next]!.b : body.segments[next]!.a;
    }
    const segments: number[] = [];
    let n = root;
    let sid: number | undefined = via;
    let length = 0;
    for (let guard = 0; guard < 64 && sid !== undefined && !seen.has(sid); guard++) {
      seen.add(sid);
      segments.push(sid);
      const s = body.segments[sid]!;
      length += s.length;
      n = s.a === n ? s.b : s.a;
      sid = joint(n, first.kind) ? at.get(n)!.find((x) => x !== sid) : undefined;
    }
    out.push({ kind: first.kind, segments, length, root, tip: n });
  }
  return out;
}

/** Limbs of each kind, a bent arm once: what a player counts. */
export function limbCounts(body: Body): Map<SegmentKind, number> {
  const out = new Map<SegmentKind, number>();
  for (const c of limbChains(body)) out.set(c.kind, (out.get(c.kind) ?? 0) + 1);
  return out;
}

/** Builds the tables of one version: hosts, flanks, anchors, chains. */
function build(body: Body): Tables {
  const ids = Object.keys(body.segments).map(Number);
  type Hosts = { host: Map<number, number>; flanks: Map<number, number[]> };
  const hostsBy = (stored: boolean, worked?: Hosts): Hosts => {
    const host = new Map<number, number>();
    const held = new Map<number, number>();
    const hold = (flank: number, h: number): void => {
      host.set(flank, h);
      held.set(h, (held.get(h) ?? 0) + 1);
    };
    const rest: number[] = [];
    for (const id of ids) {
      const f = body.segments[id]!;
      if (!isFlank(f)) continue;
      // A host keeps as many of its own side nodes as it has places: one that lost its tier sheds the latest.
      const h = stored ? storedHost(body, f) : undefined;
      if (h !== undefined && (held.get(h) ?? 0) < sideSlots(body.segments[h]!)) hold(id, h);
      else rest.push(id);
    }
    // The others go to the biggest body at their end that still has a place: a shoulder whose torso was cut
    // away does not pile onto the neck beyond its one place; with no place left it hangs on nothing.
    for (const id of rest) {
      const room = (sid: number): boolean => (held.get(sid) ?? 0) < sideSlots(body.segments[sid]!);
      // A flank with no place of its own hangs where its node gives it, as a text without places means, while there is room.
      const w = worked?.host.get(id);
      const h = w !== undefined && room(w) ? w : hostOf(body, id, room);
      if (h !== undefined) hold(id, h);
    }
    const flanks = new Map<number, number[]>();
    for (const id of ids) {
      if (isFlank(body.segments[id]!)) continue;
      const list = flanksBy(body, id, host);
      if (list.length > 0) flanks.set(id, list);
    }
    return { host, flanks };
  };
  const worked = hostsBy(false);
  const { host, flanks } = hostsBy(true, worked);
  const anchor = new Map<number, number>();
  for (const id of Object.keys(body.nodes).map(Number)) anchor.set(id, anchorBy(body, id));
  return { sig: 0, host, flanks, worked, anchor, chains: chainsOf(body) };
}

/**
 * Writes down where every side node hangs now: a flank whose host split,
 * thinned below its places or went takes the host it has passed to, at the
 * same place along it; one that hangs on nothing keeps no place. Run after an
 * operation, so that the stored places are the body's and never exceed a
 * segment's places (decision 1258).
 */
export function reconcilePlaces(body: Body): void {
  const plan: [Segment, FlankPlace | undefined][] = [];
  for (const id of Object.keys(body.segments).map(Number)) {
    const f = body.segments[id]!;
    if (!isFlank(f)) continue;
    const p = flankPlace(body, id);
    if (!samePlace(p, f.place)) plan.push([f, p]);
  }
  for (const [f, p] of plan) {
    if (p !== undefined) f.place = p;
    else delete f.place;
  }
}


/** The segment a flank's side node sits on, or undefined when nothing at its end can host it. */
export function flankHost(body: Body, flankId: number): number | undefined {
  return tables(body).host.get(flankId);
}

/** Flanks hosted by the segment, by ascending id. */
export function flanksOf(body: Body, segId: number): number[] {
  return tables(body).flanks.get(segId) ?? [];
}

/** Where a node stands on the body plan: a side node at its host's end, any other node at itself. */
export function anchorOf(body: Body, node: number): number {
  return tables(body).anchor.get(node) ?? node;
}

/** Every part of the body as a chain of segments of one kind through its bare joints. */
export function limbChains(body: Body): LimbChain[] {
  return tables(body).chains;
}
