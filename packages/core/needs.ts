/**
 * What the body lacks (step J): a pure table over `derive`, the brains, the
 * territories and the bridges, one row per need with a strength 0..1, a
 * surplus 0..1 (more than enough, the mind only), and the places where the
 * need is - element id to share 0..1. The draw of a mutation and the weight
 * of its place read it (mutation.ts): a row that serves a need weighs
 * x (1 + k x strength) and a place that lacks it x (1 + 3 x strength x share).
 *
 * The needs are of the body that separates: every foreign territory and every
 * heavy part beyond a bridge wants a heart, breath, a mouth and a stomach of
 * its own, so that it lives when it leaves. `survivalReport` says whether it
 * would, by the same computation as the separation itself.
 *
 * Cached per body by `version` and `nextId`, like `derive`. Nothing here
 * writes into a body.
 */
import type { Body, Organ, SegmentKind } from "./graph.js";
import { isBrainKind, nodeIds, segmentIds, sortedIds } from "./graph.js";
import { brains, type Brain } from "./brains.js";
import { fateOf, type Fate } from "./cut.js";
import { derive } from "./derive.js";
import { EAR_KINDS, SENSE_REACH } from "./derive/senses.js";
import { BASE_SUPPORT } from "./derive/speed.js";
import { hangingPart, partMass, type Target } from "./grow.js";
import { bridges, distances, hasKind, hearts, heartsIn, type Part } from "./metrics.js";
import { mentalLoad, mindPower } from "./mind.js";
import type { Mutation } from "./mutation.js";
import { COVERS, HUMAN_MASS, MEMBRANES, ORGANS, capacity, cavityLoad, hasTag, mass } from "./parts.js";
import { separatePreview } from "./separate.js";
import { ownership, territoriesOf, type Territory } from "./territory.js";

export const NEED_KINDS = ["mind", "heart", "mouth", "stomach", "breath", "sight", "hearing", "support", "cavity"] as const;
export type NeedKind = (typeof NEED_KINDS)[number];

/** A row that serves a need weighs x (1 + K_NEED x strength) in the draw... */
export const K_NEED = 4;
/** ...x 1.5 of that for the spring and the graft: they heal. */
export const NEED_HEAL = 1.5;
/** A place that lacks the need weighs x (1 + K_PLACE x strength x share), one that has it x 1 / (1 + K_PLACE x strength). The task said 3; see decision 106. */
export const K_PLACE = 4;
/** One brain's worth of channels above or below the load is the full want, or the full surplus. */
const MIND_UNIT = 10;
/** A part beyond a bridge of this mass wants to live on its own. */
const HEAVY_PART = 20;
/** How far a brain reaches for an eye, an ear or a mouth: one number with the senses (derive/senses.ts). */
export { SENSE_REACH };
/** What every piece that would leave without a heart, breath, a mouth or a stomach adds to that want, two pieces at most. */
const PIECE_WANT = 0.5;

export interface Need {
  kind: NeedKind;
  strength: number;
  /** More than enough of it, 0..1: `excess` cut at one, for a bar. Only the mind has one. */
  surplus: number;
  /** How many units more than enough, unbounded: rows that add it weigh x 1 / (1 + K_NEED x excess). */
  excess: number;
  /** Element id (a node or a segment) to share 0..1 of the want there; absent means the place has what it needs. */
  places: Map<number, number>;
  /** Elements that already hold what is wanted (a torso with a heart, a node with a mouth): a place there weighs x 1 / (1 + K_PLACE x strength). */
  served: Set<number>;
  /** The numbers behind the strength, for the lab. */
  parts: Record<string, number>;
}

const LIMB_KINDS: readonly SegmentKind[] = ["arm", "leg", "tentacle", "tail"];
const EPS = 1e-9;

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function eats(o: Organ): boolean {
  return ORGANS[o.kind].flags?.includes("eat") ?? false;
}

function breathes(o: Organ): boolean {
  return ORGANS[o.kind].breath !== undefined;
}

function digests(o: Organ): boolean {
  return hasTag(o.kind, "digests");
}

/** Distances from a segment's nearer end to every node: the row from its middle less half its length. */
function fromSegment(body: Body, sid: number): Record<number, number> {
  const half = body.segments[sid]!.length / 2;
  const d = distances(body, { segment: sid });
  for (const k of Object.keys(d)) d[Number(k)] = Math.max(0, d[Number(k)]! - half);
  return d;
}

function minRows(rows: Record<number, number>[], node: number): number {
  let best = Infinity;
  for (const r of rows) {
    const v = r[node];
    if (v !== undefined && v < best) best = v;
  }
  return best;
}

// ---------------------------------------------------------------- what a part holds

interface Holds {
  brain: boolean;
  heart: boolean;
  breath: boolean;
  mouth: boolean;
  stomach: boolean;
}

function holdsOf(body: Body, part: Part): Holds {
  const segs = new Set(part.segments);
  let brain = false;
  let mouth = false;
  let stomach = false;
  let breath = false;
  for (const n of part.nodes) {
    for (const e of body.nodes[n]!.ends) {
      for (const o of [e, ...(e.contents ?? [])]) {
        if (isBrainKind(o.kind)) brain = true;
        if (eats(o)) mouth = true;
        if (breathes(o)) breath = true;
      }
    }
  }
  for (const s of part.segments) {
    const seg = body.segments[s]!;
    for (const o of [...seg.cavity, ...seg.growths]) {
      if (isBrainKind(o.kind)) brain = true;
      if (digests(o)) stomach = true;
      if (breathes(o)) breath = true;
    }
  }
  for (const id of sortedIds(body.membranes)) {
    const m = body.membranes[id]!;
    if (MEMBRANES[m.kind].breath !== undefined && m.cycle.every((s) => segs.has(s))) breath = true;
  }
  return { brain, heart: heartsIn(body, part), breath, mouth, stomach };
}

/** A foreign living brain's territory as a part, with what it holds. */
interface Piece {
  part: Part;
  holds: Holds;
}

function territoryPieces(body: Body, terrs: Territory[]): Piece[] {
  const out: Piece[] = [];
  for (const t of terrs) {
    if (t.brain.self || !t.brain.alive || t.nodes.length === 0) continue;
    const part: Part = { nodes: t.nodes, segments: t.segments };
    out.push({ part, holds: holdsOf(body, part) });
  }
  return out;
}

/** Parts of HEAVY_PART or more hanging beyond a bridge on the side without you, with the bridge, ascending by bridge id. */
function heavyPieces(body: Body): { segment: number; mass: number; part: Part; holds: Holds }[] {
  const out: { segment: number; mass: number; part: Part; holds: Holds }[] = [];
  for (const sid of bridges(body)) {
    const h = hangingPart(body, sid);
    if (h === null) continue;
    const m = partMass(h.part);
    if (m + EPS < HEAVY_PART) continue;
    const part: Part = { nodes: h.part.nodes.map((n) => n.id).sort((x, y) => x - y), segments: h.part.segments.map((s) => s.id).sort((x, y) => x - y) };
    out.push({ segment: sid, mass: m, part, holds: holdsOf(body, part) });
  }
  return out;
}

// ---------------------------------------------------------------- the needs

interface Scene {
  body: Body;
  d: ReturnType<typeof derive>;
  brainList: Brain[];
  terrs: Territory[];
  pieces: Piece[];
  heavy: ReturnType<typeof heavyPieces>;
  torsos: number[];
  fromSelf: Record<number, number>;
  /** Every living brain with the distances from it: the senses read them (step K). */
  brainRows: { brain: Brain; dist: Record<number, number> }[];
}

function raise(places: Map<number, number>, id: number, share: number): void {
  if (share <= EPS) return;
  const s = Math.min(1, share);
  if ((places.get(id) ?? 0) < s) places.set(id, s);
}

function limbsIn(body: Body, part: Part): number[] {
  return part.segments.filter((id) => LIMB_KINDS.includes(body.segments[id]!.kind));
}

function mindNeed(sc: Scene): Need {
  const { body } = sc;
  const power = mindPower(body);
  const load = mentalLoad(body).total;
  const over = load - power;
  const places = new Map<number, number>();
  const alive = sc.brainList.filter((b) => b.alive);
  const rows = alive.map((b) => distances(body, b.place));
  let dmax = 0;
  const dNode = new Map<number, number>();
  for (const n of nodeIds(body)) {
    const v = rows.length === 0 ? 1 : minRows(rows, n);
    if (!Number.isFinite(v)) continue;
    dNode.set(n, v);
    dmax = Math.max(dmax, v);
  }
  if (dmax > 0) {
    for (const [n, v] of dNode) raise(places, n, v / dmax);
    for (const id of segmentIds(body)) {
      const s = body.segments[id]!;
      if (s.kind === "torso" && s.cavity.some((o) => isBrainKind(o.kind))) continue;
      raise(places, id, ((dNode.get(s.a) ?? 0) + (dNode.get(s.b) ?? 0)) / (2 * dmax));
    }
  }
  // A heavy part beyond a bridge with no brain of its own is meat when it falls: it wants a mind.
  const heavyWithout = sc.heavy.filter((p) => !p.holds.brain);
  for (const p of heavyWithout) {
    for (const n of p.part.nodes) raise(places, n, 0.5);
    for (const id of p.part.segments) {
      const s = body.segments[id]!;
      if (s.kind === "torso" && s.cavity.some((o) => isBrainKind(o.kind))) continue;
      raise(places, id, 0.5);
    }
  }
  const served = new Set<number>();
  for (const id of sc.torsos) if (body.segments[id]!.cavity.some((o) => isBrainKind(o.kind))) served.add(id);
  const excess = Math.max(0, -over / MIND_UNIT);
  return { kind: "mind", strength: clamp01(over / MIND_UNIT), surplus: clamp01(excess), excess, places, served, parts: { power, load, over, heavyWithout: heavyWithout.length } };
}

function heartNeed(sc: Scene): Need {
  const { body } = sc;
  const heartSegs = hearts(body);
  const rows = heartSegs.map((h) => fromSegment(body, h));
  const heartless: { id: number; d: number }[] = [];
  for (const id of sc.torsos) {
    const s = body.segments[id]!;
    if (hasKind(s.cavity, "heart") && s.hp > 0) continue;
    const d = rows.length === 0 ? 0 : (minRows(rows, s.a) + minRows(rows, s.b)) / 2;
    heartless.push({ id, d: Number.isFinite(d) ? d : Infinity });
  }
  // The farthest heartless torso is the place; the ones between fall off with the square, the nearest is no place at all.
  const places = new Map<number, number>();
  const finite = heartless.map((t) => t.d).filter((d) => Number.isFinite(d));
  const dmin = finite.length === 0 ? 0 : Math.min(...finite);
  const dmax = finite.length === 0 ? 0 : Math.max(...finite);
  for (const t of heartless) {
    if (heartSegs.length === 0 || !Number.isFinite(t.d) || dmax - dmin <= EPS) raise(places, t.id, 1);
    else raise(places, t.id, Math.pow((t.d - dmin) / (dmax - dmin), 2));
  }
  const served = new Set<number>(heartSegs);
  const territoriesWithout = sc.pieces.filter((p) => !p.holds.heart);
  const heavyWithout = sc.heavy.filter((p) => p.holds.brain && !p.holds.heart);
  for (const p of [...territoriesWithout, ...heavyWithout]) {
    for (const id of limbsIn(body, p.part)) raise(places, id, 0.5);
    for (const id of p.part.segments) if (body.segments[id]!.kind === "torso") raise(places, id, 1);
  }
  const parts = { hearts: heartSegs.length, heartlessTorsos: heartless.length, heartlessTerritories: territoriesWithout.length, heavyBridges: heavyWithout.length };
  let strength: number;
  if (heartSegs.length === 0) strength = 1;
  else strength = Math.min(1, (heartSegs.length <= 1 ? 0.25 : 0) + 0.25 * Math.min(2, heartless.length) + PIECE_WANT * Math.min(2, territoriesWithout.length) + PIECE_WANT * Math.min(2, heavyWithout.length));
  return { kind: "heart", strength, surplus: 0, excess: 0, places, served, parts };
}

/** Nodes with a mouth (an ending that eats, or a head with a jaw inside). */
function mouthNodes(body: Body): number[] {
  const out: number[] = [];
  for (const id of nodeIds(body)) if (body.nodes[id]!.ends.some((e) => eats(e) || (e.contents ?? []).some(eats))) out.push(id);
  return out;
}

function digestingTorsos(body: Body): number[] {
  return segmentIds(body).filter((id) => body.segments[id]!.kind === "torso" && body.segments[id]!.cavity.some(digests));
}

// ---------------------------------------------------------------- what a brain lacks nearby

/** The distance from a brain to the nearest of `where`; Infinity when the body holds none it can reach. */
function nearest(dist: Record<number, number>, where: ReadonlySet<number>): number {
  let best = Infinity;
  for (const id of where) {
    const d = dist[id];
    if (d !== undefined && d < best) best = d;
  }
  return best;
}

/**
 * What the brains without an eye, an ear or a mouth within reach want (step K,
 * decision 162). A brain is served while one sits within `SENSE_REACH` of it -
 * the head's own eyes, and the head's eyes for the brain in the belly - and
 * the strength is the share of the living brains that have none. Every
 * element of the body is a place for the missing organ, the nearer to the
 * brain that lacks it the more, so a blind head grows an eye on itself first
 * and somewhere on the flesh second; the places that already hold one are
 * `served` and weigh less.
 */
function senseGap(sc: Scene, where: ReadonlySet<number>): { strength: number; places: Map<number, number>; blind: number } {
  const { body } = sc;
  const places = new Map<number, number>();
  if (sc.brainRows.length === 0) return { strength: 0, places, blind: 0 };
  let blind = 0;
  for (const { dist } of sc.brainRows) {
    if (nearest(dist, where) <= SENSE_REACH + EPS) continue;
    blind += 1;
    for (const n of nodeIds(body)) {
      const d = dist[n];
      if (d !== undefined) raise(places, n, 1 / (1 + d / SENSE_REACH));
    }
    for (const id of segmentIds(body)) {
      const s = body.segments[id]!;
      const d = Math.min(dist[s.a] ?? Infinity, dist[s.b] ?? Infinity);
      if (Number.isFinite(d)) raise(places, id, 1 / (1 + d / SENSE_REACH));
    }
  }
  return { strength: clamp01(blind / sc.brainRows.length), places, blind };
}

/** Nodes that see: a working eye of any kind, blindness aside (derive/senses). */
function eyeNodes(sc: Scene): Set<number> {
  return new Set(sc.d.senses.viewpoints.filter((v) => v.eyes > 0 || v.heat).map((v) => v.node));
}

/** Organs that see: the kinds whose rows pull the sight need; the ears are derive/senses's. */
const SIGHT_KINDS: ReadonlySet<Organ["kind"]> = new Set<Organ["kind"]>(["eye", "facetEye", "heatEye"]);

function sightNeed(sc: Scene): Need {
  const eyes = eyeNodes(sc);
  const gap = senseGap(sc, eyes);
  return { kind: "sight", strength: gap.strength, surplus: 0, excess: 0, places: gap.places, served: eyes, parts: { eyes: eyes.size, blindBrains: gap.blind, brains: sc.brainRows.length } };
}

function hearingNeed(sc: Scene): Need {
  const ears = new Set(sc.d.senses.hearingAt);
  const gap = senseGap(sc, ears);
  return { kind: "hearing", strength: gap.strength, surplus: 0, excess: 0, places: gap.places, served: ears, parts: { ears: ears.size, deafBrains: gap.blind, brains: sc.brainRows.length } };
}

function mouthNeed(sc: Scene): Need {
  const { body } = sc;
  const stomachs = digestingTorsos(body);
  const fedMouths = sc.d.eat.mouths.filter((m) => m.fed).length;
  const places = new Map<number, number>();
  const territoriesWithout = sc.pieces.filter((p) => !p.holds.mouth);
  const heavyWithout = sc.heavy.filter((p) => p.holds.brain && !p.holds.mouth);
  let strength = 0;
  if (stomachs.length > 0) {
    if (!sc.d.eat.can) {
      // The body itself starves: a mouth next to the trunk that digests, the farther the less.
      const rows = stomachs.map((s) => fromSegment(body, s));
      const dNode = new Map<number, number>();
      for (const n of nodeIds(body)) {
        const v = minRows(rows, n);
        if (Number.isFinite(v)) dNode.set(n, v);
      }
      for (const [n, v] of dNode) raise(places, n, 1 / (1 + v));
      for (const id of segmentIds(body)) {
        const s = body.segments[id]!;
        raise(places, id, Math.max(dNode.has(s.a) ? 1 / (1 + dNode.get(s.a)!) : 0, dNode.has(s.b) ? 1 / (1 + dNode.get(s.b)!) : 0));
      }
    }
    // A piece that would leave without a mouth wants one anywhere inside it.
    for (const p of [...territoriesWithout, ...heavyWithout]) {
      for (const n of p.part.nodes) raise(places, n, 1);
      for (const id of p.part.segments) raise(places, id, 1);
    }
    strength = !sc.d.eat.can ? 1 : Math.min(1, PIECE_WANT * Math.min(2, territoriesWithout.length) + PIECE_WANT * Math.min(2, heavyWithout.length));
  }
  const served = new Set<number>(mouthNodes(body));
  // A brain with no mouth beside it wants one too, wherever it is: a head that cannot bite is as bad as a head that cannot see (step K).
  const gap = senseGap(sc, served);
  for (const [id, share] of gap.places) raise(places, id, share);
  strength = Math.max(strength, gap.strength);
  return {
    kind: "mouth",
    strength,
    surplus: 0,
    excess: 0,
    places,
    served,
    parts: { mouths: fedMouths, stomachs: stomachs.length, mouthlessBrains: gap.blind, territoriesWithout: territoriesWithout.length, heavyWithout: heavyWithout.length },
  };
}

function stomachNeed(sc: Scene): Need {
  const { body } = sc;
  const stomachs = digestingTorsos(body);
  const mouths = mouthNodes(body);
  const rows = mouths.map((n) => distances(body, { node: n }));
  const places = new Map<number, number>();
  const empty: { id: number; d: number }[] = [];
  for (const id of sc.torsos) {
    const s = body.segments[id]!;
    if (s.cavity.some(digests)) continue;
    const d = rows.length === 0 ? 0 : (minRows(rows, s.a) + minRows(rows, s.b)) / 2;
    empty.push({ id, d: Number.isFinite(d) ? d : Infinity });
  }
  // The body without a stomach wants one in the torso nearest a mouth; farther ones fall off with the distance beyond it.
  if (stomachs.length === 0) {
    const finite = empty.map((t) => t.d).filter((d) => Number.isFinite(d));
    const dmin = finite.length === 0 ? 0 : Math.min(...finite);
    for (const t of empty) raise(places, t.id, Number.isFinite(t.d) ? (1 + dmin) / (1 + t.d) : 0.25);
  }
  // A piece that would leave without a stomach wants one in a torso of its own.
  const territoriesWithout = sc.pieces.filter((p) => !p.holds.stomach);
  const heavyWithout = sc.heavy.filter((p) => p.holds.brain && !p.holds.stomach);
  for (const p of [...territoriesWithout, ...heavyWithout]) for (const id of p.part.segments) if (body.segments[id]!.kind === "torso" && !body.segments[id]!.cavity.some(digests)) raise(places, id, 1);
  const strength = stomachs.length === 0 ? 1 : Math.min(1, PIECE_WANT * Math.min(2, territoriesWithout.length) + PIECE_WANT * Math.min(2, heavyWithout.length));
  return { kind: "stomach", strength, surplus: 0, excess: 0, places, served: new Set(stomachs), parts: { stomachs: stomachs.length, mouths: mouths.length, territoriesWithout: territoriesWithout.length, heavyWithout: heavyWithout.length } };
}

function breathNeed(sc: Scene): Need {
  const { body } = sc;
  const organsN = sc.d.breath.organs.length;
  const places = new Map<number, number>();
  const served = new Set<number>();
  let breathless = 0;
  for (const id of sc.torsos) {
    const s = body.segments[id]!;
    if ([...s.cavity, ...s.growths].some(breathes)) {
      served.add(id);
      continue;
    }
    breathless += 1;
    raise(places, id, 1);
  }
  const territoriesWithout = sc.pieces.filter((p) => !p.holds.breath);
  const heavyWithout = sc.heavy.filter((p) => p.holds.brain && !p.holds.breath);
  for (const p of [...territoriesWithout, ...heavyWithout]) {
    for (const id of limbsIn(body, p.part)) raise(places, id, 0.5);
    for (const id of p.part.segments) if (body.segments[id]!.kind === "torso") raise(places, id, 1);
  }
  const strength = organsN === 0 ? 1 : Math.min(1, (organsN <= 1 ? 0.25 : 0) + 0.25 * Math.min(2, breathless) + PIECE_WANT * Math.min(2, territoriesWithout.length) + PIECE_WANT * Math.min(2, heavyWithout.length));
  return { kind: "breath", strength, surplus: 0, excess: 0, places, served, parts: { organs: organsN, breathlessTorsos: breathless, territoriesWithout: territoriesWithout.length, heavyWithout: heavyWithout.length } };
}

function supportNeed(sc: Scene): Need {
  const { body } = sc;
  const m = mass(body);
  const target = (BASE_SUPPORT * m) / HUMAN_MASS;
  const support = sc.d.speed.support;
  const places = new Map<number, number>();
  const ends = new Set<number>();
  for (const id of sc.torsos) ends.add(body.segments[id]!.a).add(body.segments[id]!.b);
  let dmax = 0;
  for (const n of ends) dmax = Math.max(dmax, sc.fromSelf[n] ?? 0);
  for (const n of [...ends].sort((x, y) => x - y)) raise(places, n, dmax === 0 ? 1 : 0.5 + 0.5 * ((sc.fromSelf[n] ?? 0) / dmax));
  return { kind: "support", strength: target <= 0 ? 0 : clamp01(1 - support / target), surplus: 0, excess: 0, places, served: new Set(), parts: { support, target, mass: m } };
}

function cavityNeed(sc: Scene): Need {
  const { body } = sc;
  const places = new Map<number, number>();
  let free = 0;
  for (const id of sc.torsos) {
    const s = body.segments[id]!;
    if (!COVERS[s.cover].mutates) continue;
    const cap = capacity(s);
    free = Math.max(free, cap - cavityLoad(s));
    if (COVERS[s.cover].stretches && cap > 0) raise(places, id, cavityLoad(s) / cap);
  }
  let kinds = 0;
  let misses = 0;
  for (const spec of Object.values(ORGANS)) {
    if (!spec.mounts.includes("cavity") || spec.mass <= 0) continue;
    kinds += 1;
    if (spec.mass > free + EPS) misses += 1;
  }
  return { kind: "cavity", strength: kinds === 0 ? 0 : misses / kinds, surplus: 0, excess: 0, places, served: new Set(), parts: { kinds, misses, free } };
}

function compute(body: Body): Need[] {
  const own = ownership(body);
  const sc: Scene = {
    body,
    d: derive(body),
    brainList: own.brains,
    terrs: territoriesOf(body, own),
    pieces: [],
    heavy: heavyPieces(body),
    torsos: segmentIds(body).filter((id) => body.segments[id]!.kind === "torso"),
    fromSelf: distances(body, body.self),
    brainRows: own.brains.filter((b) => b.alive).map((b) => ({ brain: b, dist: distances(body, b.place) })),
  };
  sc.pieces = territoryPieces(body, sc.terrs);
  return [mindNeed(sc), heartNeed(sc), mouthNeed(sc), stomachNeed(sc), breathNeed(sc), sightNeed(sc), hearingNeed(sc), supportNeed(sc), cavityNeed(sc)];
}

const cache = new WeakMap<Body, { version: number; nextId: number; needs: Need[] }>();

/** The needs of the body, one per kind in `NEED_KINDS` order; the same array until the body changes. Do not write into it. */
export function needs(body: Body): Need[] {
  const hit = cache.get(body);
  if (hit !== undefined && hit.version === body.version && hit.nextId === body.nextId) return hit.needs;
  const list = compute(body);
  cache.set(body, { version: body.version, nextId: body.nextId, needs: list });
  return list;
}

export function needOf(body: Body, kind: NeedKind): Need {
  return needs(body).find((n) => n.kind === kind)!;
}

// ---------------------------------------------------------------- what a row serves

/** The organs a row would add to the body: what it grows, places or turns an ending into. */
function addedOrgans(m: Mutation): Organ[] {
  const out: Organ[] = [];
  const push = (o: Organ | null | undefined): void => {
    if (o === null || o === undefined) return;
    out.push(o);
    for (const c of o.contents ?? []) push(c);
  };
  switch (m.op) {
    case "sprout":
      push(m.payload.ending);
      for (const g of m.payload.growths ?? []) push(g);
      break;
    case "joint":
    case "rebirth":
      push(m.payload.ending);
      break;
    case "organ":
      push(m.payload.organ);
      break;
    case "twin":
      push({ kind: m.payload.brain, instability: 0 });
      push({ kind: "jaw", instability: 0 });
      break;
    case "budding":
      push({ kind: "heart", instability: 0 });
      push({ kind: m.payload.brain, instability: 0 });
      break;
    default:
      break;
  }
  return out;
}

/** Which needs a row of the catalog serves, in `NEED_KINDS` order; empty for most rows. */
export function needPulls(m: Mutation): NeedKind[] {
  const organs = addedOrgans(m);
  const kinds = new Set<NeedKind>();
  for (const o of organs) {
    const spec = ORGANS[o.kind];
    if ((spec.channels ?? 0) > 0) kinds.add("mind");
    if (o.kind === "heart") kinds.add("heart");
    if (eats(o)) kinds.add("mouth");
    if (digests(o)) kinds.add("stomach");
    if (breathes(o)) kinds.add("breath");
    if (SIGHT_KINDS.has(o.kind)) kinds.add("sight");
    if (EAR_KINDS.has(o.kind)) kinds.add("hearing");
  }
  if ((m.op === "membrane" || m.op === "wings") && MEMBRANES[m.payload.kind].breath !== undefined) kinds.add("breath");
  if (m.op === "sprout" && m.payload.ending !== null && (ORGANS[m.payload.ending.kind].stand ?? 0) > 0) kinds.add("support");
  if (m.op === "rebirth" && (ORGANS[m.payload.ending.kind].stand ?? 0) >= 2) kinds.add("support");
  if (m.op === "stretch" && m.payload.delta > 0 && (m.target.kinds ?? []).includes("leg")) kinds.add("support");
  if (m.op === "bloat") kinds.add("cavity");
  return NEED_KINDS.filter((k) => kinds.has(k));
}

interface NeedFactor {
  kind: NeedKind;
  strength: number;
  excess: number;
  /** The row's weight is multiplied by this in the draw. */
  draw: number;
}

/** How each need the row serves moves its weight in the draw: (1 + k x strength) / (1 + k x excess), k = K_NEED, x 1.5 when healing. */
export function needDrawFactors(body: Body, m: Mutation, heal = false): NeedFactor[] {
  const k = K_NEED * (heal ? NEED_HEAL : 1);
  return needPulls(m).map((kind) => {
    const n = needOf(body, kind);
    return { kind, strength: n.strength, excess: n.excess, draw: (1 + k * n.strength) / (1 + k * n.excess) };
  });
}

function targetElements(body: Body, t: Target): number[] {
  if ("node" in t) return [t.node];
  if ("segment" in t) {
    const s = body.segments[t.segment];
    return s === undefined ? [t.segment] : [t.segment, s.a, s.b];
  }
  if ("ending" in t) return [t.ending.node];
  if ("pair" in t) return [t.pair[0], t.pair[1]];
  const out = new Set<number>();
  for (const sid of t.cycle) {
    const s = body.segments[sid];
    if (s !== undefined) out.add(sid).add(s.a).add(s.b);
  }
  return [...out];
}

/** The share of the need at a target: the largest over the elements the target touches. */
export function needShare(body: Body, need: Need, t: Target): number {
  let best = 0;
  for (const id of targetElements(body, t)) best = Math.max(best, need.places.get(id) ?? 0);
  return best;
}

/** Whether the target sits on an element that already holds what the need wants. */
export function needServed(body: Body, need: Need, t: Target): boolean {
  return targetElements(body, t).some((id) => need.served.has(id));
}

/**
 * How much the needs the row serves move a place: x (1 + K_PLACE x strength x
 * share) where the need is, x 1 / (1 + K_PLACE x strength) where what it
 * wants already sits - the new heart goes where there is none.
 */
export function needPlaceFactor(body: Body, m: Mutation, t: Target): number {
  let f = 1;
  for (const kind of needPulls(m)) {
    const n = needOf(body, kind);
    if (n.strength <= 0) continue;
    const share = needShare(body, n, t);
    if (share > 0) f *= 1 + K_PLACE * n.strength * share;
    else if (needServed(body, n, t)) f /= 1 + K_PLACE * n.strength;
  }
  return f;
}

// ---------------------------------------------------------------- what survives the collapse

interface HeadSurvival {
  brain: Brain;
  /** Nodes of its territory. */
  nodes: number;
  fate: Fate;
  heart: boolean;
  breath: boolean;
  eats: boolean;
  /** A heart, breath and a fed mouth: it lives on its own. */
  survives: boolean;
  /** Turns it lives on the blood it carries when it has no heart. */
  lifetime: number | null;
}

interface BridgeSurvival {
  segment: number;
  mass: number;
  nodes: number;
  fate: Fate;
  brain: boolean;
  heart: boolean;
  breath: boolean;
  eats: boolean;
  survives: boolean;
}

interface SurvivalReport {
  /** Every foreign living brain with a territory: what its separation would leave it. */
  heads: HeadSurvival[];
  /** Every bridge with HEAVY_PART or more beyond it: what falls off and whether it lives. */
  bridges: BridgeSurvival[];
}

/** What the collapse would do: each foreign head separated on a clone, each heavy part beyond a bridge read as it stands. */
export function survivalReport(body: Body): SurvivalReport {
  const heads: HeadSurvival[] = [];
  const terrs = territoriesOf(body, ownership(body));
  for (const b of brains(body)) {
    if (b.self || !b.alive) continue;
    const sep = separatePreview(body, b.ref);
    if (sep === null || sep.leaves.body === null) continue;
    const left = sep.leaves.body;
    const d = derive(left);
    const heart = hearts(left).length > 0;
    const breath = d.breath.organs.length > 0;
    const fed = d.eat.can;
    const nodes = terrs.find((t) => t.brain.key === b.key)?.nodes.length ?? 0;
    heads.push({ brain: b, nodes, fate: sep.leaves.fate, heart, breath, eats: fed, survives: heart && breath && fed, lifetime: sep.leaves.lifetime });
  }
  const out: BridgeSurvival[] = [];
  for (const p of heavyPieces(body)) {
    const h = p.holds;
    const fed = h.mouth && h.stomach;
    out.push({ segment: p.segment, mass: p.mass, nodes: p.part.nodes.length, fate: fateOf(body, p.part), brain: h.brain, heart: h.heart, breath: h.breath, eats: fed, survives: h.brain && h.heart && h.breath && fed });
  }
  return { heads, bridges: out };
}
