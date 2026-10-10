/**
 * Mutations infect their neighbours (body-graph.md §11 "Расползание"). Five
 * rules, all weights and timers, never bans:
 *
 * - a target weighs more next to organs of the mutation's family
 *   (`neighborhoodWeights`);
 * - the draw leans toward the body's theme: the families it already grew and
 *   the very kinds already there (`themeWeights`);
 * - a limb stretched or reborn next to a tentacle may become one
 *   (`infectKind`);
 * - a cover creeps one segment every 30 turns and stops at chrome and at a
 *   broken segment; another cover it takes too, for more periods the harder
 *   that cover is (`coverTick`);
 * - a tumour presses on the organs around it, +5 instability every 50 turns
 *   (`contagionTick`).
 *
 * The human is neutral: only what grew beyond its baseline pulls. A regulator
 * (an organ tagged `damps`) or meditation leaves a third of every pull. One
 * flag, `SpreadContext.spread: false`, turns the pulls off; the timers are
 * called by the game and run when called.
 */
import type { Body, CoverId, Eatable, MembraneKind, Organ, OrganKind, Segment, SegmentKind } from "./graph.js";
import { anchorOf, limbCounts } from "./flank.js";
import { nodeIds, segmentIds, sortedIds, touch } from "./graph.js";
import { parentSegment } from "./capability.js";
import type { Target, Weighted } from "./grow.js";
import { membraneNodes } from "./membrane.js";
import type { Mutation } from "./mutation.js";
import { COVERS, MEMBRANES, ORGANS, SEGMENT_KINDS, SPREAD, familyCounts, hasTag, mass, organs, segmentMass, segmentMassOf, skeletonCeiling, type Family } from "./parts.js";
import type { Rng } from "./rng.js";

export { SPREAD } from "./parts.js";

export interface SpreadContext {
  /** False turns every pull off (steps A-C, the developer's mode); absent means on. */
  spread?: boolean;
  /** The player sits and looks inward (mutations.md): every pull is a third of itself. */
  meditating?: boolean;
}

export function spreadOn(ctx?: SpreadContext): boolean {
  return ctx?.spread !== false;
}

/** 1, or a third with a regulator in the body or in meditation. */
export function damping(body: Body, ctx?: SpreadContext): number {
  if (ctx?.meditating === true) return SPREAD.damping;
  for (const o of organs(body)) if (hasTag(o.kind, "damps")) return SPREAD.damping;
  return 1;
}

const EPS = 1e-9;

// ---------------------------------------------------------------- distances

interface Graph {
  version: number;
  nodes: number;
  segments: number;
  /** Sum of all lengths: no path is longer. */
  span: number;
  index: Map<number, number>;
  adj: { to: number; len: number }[][];
  rows: Map<number, Float64Array>;
}

const graphs = new WeakMap<Body, Graph>();

/** The graph as index arrays, kept per body and version; rows of distances fill in as they are asked for. */
function graphOf(body: Body): Graph {
  const ids = nodeIds(body);
  const sids = segmentIds(body);
  const g = graphs.get(body);
  if (g !== undefined && g.version === body.version && g.nodes === ids.length && g.segments === sids.length) return g;
  const index = new Map<number, number>();
  ids.forEach((id, i) => index.set(id, i));
  const adj: { to: number; len: number }[][] = ids.map(() => []);
  let span = 0;
  for (const sid of sids) {
    const s = body.segments[sid]!;
    const a = index.get(s.a);
    const b = index.get(s.b);
    if (a === undefined || b === undefined) continue;
    adj[a]!.push({ to: b, len: s.length });
    adj[b]!.push({ to: a, len: s.length });
    span += s.length;
  }
  const fresh: Graph = { version: body.version, nodes: ids.length, segments: sids.length, span, index, adj, rows: new Map() };
  graphs.set(body, fresh);
  return fresh;
}

/**
 * Shortest paths by segment length from a node to every node, by index;
 * Infinity where there is no path. Lengths are whole numbers, so a bucket
 * per distance does what a heap would, in one pass over the buckets.
 */
function distanceRow(g: Graph, from: number): Float64Array {
  const cached = g.rows.get(from);
  if (cached !== undefined) return cached;
  const dist = new Float64Array(g.adj.length).fill(Infinity);
  const start = g.index.get(from);
  if (start !== undefined) {
    const buckets: (number[] | undefined)[] = [];
    dist[start] = 0;
    buckets[0] = [start];
    for (let d = 0; d <= g.span; d++) {
      const q = buckets[d];
      if (q === undefined) continue;
      for (const u of q) {
        if (dist[u] !== d) continue;
        for (const e of g.adj[u]!) {
          const nd = d + e.len;
          if (nd < dist[e.to]!) {
            dist[e.to] = nd;
            (buckets[nd] ??= []).push(e.to);
          }
        }
      }
    }
  }
  g.rows.set(from, dist);
  return dist;
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

// ---------------------------------------------------------------- neighbourhood

/** Something of a family that pulls: an organ, a covered segment or a membrane, at the nodes it touches. */
interface FamilySource {
  nodes: number[];
  /** An organ of a kind the human has weighs (n - baseline) / n; a cover 1 / segments of that cover; a membrane 1. */
  weight: number;
}

function kindCounts(body: Body): Map<OrganKind, number> {
  const counts = new Map<OrganKind, number>();
  for (const o of organs(body)) counts.set(o.kind, (counts.get(o.kind) ?? 0) + 1);
  return counts;
}

/** Everything of the family in the body that pulls a target toward itself, in id order. */
function familySources(body: Body, family: Family): FamilySource[] {
  const out: FamilySource[] = [];
  const counts = kindCounts(body);
  const weightOf = (kind: OrganKind): number => {
    const spec = ORGANS[kind];
    if (spec.family !== family) return 0;
    const n = counts.get(kind) ?? 0;
    const base = spec.baseline ?? 0;
    return n > base ? (n - base) / n : 0;
  };
  const push = (o: Organ, nodes: number[]): void => {
    const w = weightOf(o.kind);
    if (w > 0) out.push({ nodes, weight: w });
    for (const c of o.contents ?? []) push(c, nodes);
  };
  for (const id of nodeIds(body)) for (const e of body.nodes[id]!.ends) push(e, [id]);
  const perCover = new Map<CoverId, number>();
  for (const id of segmentIds(body)) {
    const s = body.segments[id]!;
    for (const o of [...s.cavity, ...s.growths]) push(o, [s.a, s.b]);
    if (s.cover !== "skin" && s.cover !== "chrome") perCover.set(s.cover, (perCover.get(s.cover) ?? 0) + 1);
  }
  if (family === "covers") {
    for (const id of segmentIds(body)) {
      const s = body.segments[id]!;
      if (s.cover !== "skin" && s.cover !== "chrome") out.push({ nodes: [s.a, s.b], weight: 1 / perCover.get(s.cover)! });
    }
  }
  for (const id of sortedIds(body.membranes)) {
    const m = body.membranes[id]!;
    if (MEMBRANES[m.kind].family !== family) continue;
    const nodes = membraneNodes(body, m);
    if (nodes !== null) out.push({ nodes, weight: 1 });
  }
  return out;
}

/** The multiplier of a target: 1 + kFamily x sum over the sources of weight / (1 + d), d the closest pair of nodes. */
function pullOf(body: Body, sources: FamilySource[], ctx?: SpreadContext): (t: Target) => number {
  if (sources.length === 0) return () => 1;
  const k = SPREAD.kFamily * damping(body, ctx);
  const g = graphOf(body);
  return (t) => {
    const nodes = targetNodes(body, t).map((id) => g.index.get(id)).filter((i): i is number => i !== undefined);
    let sum = 0;
    for (const s of sources) {
      let d = Infinity;
      for (const from of s.nodes) {
        const row = distanceRow(g, from);
        for (const i of nodes) if (row[i]! < d) d = row[i]!;
      }
      if (Number.isFinite(d)) sum += s.weight / (1 + d);
    }
    return 1 + k * sum;
  };
}

/** How much more a mutation of the family wants this target because of what is already nearby. */
export function neighborhoodWeight(body: Body, target: Target, family: Family, ctx?: SpreadContext): number {
  return pullOf(body, familySources(body, family), ctx)(target);
}

/** The list of §8 with the neighbourhood of the family multiplied in. */
export function neighborhoodWeights(body: Body, list: Weighted[], family: Family, ctx?: SpreadContext): Weighted[] {
  if (list.length === 0) return list;
  const pull = pullOf(body, familySources(body, family), ctx);
  return list.map((w) => ({ target: w.target, weight: w.weight * pull(w.target) }));
}

// ---------------------------------------------------------------- theme

/** What the body already is, beyond the human: features by family and by kind. */
interface Theme {
  family: Record<Family, number>;
  total: number;
  segments: Map<SegmentKind, number>;
  organs: Map<OrganKind, number>;
  covers: Map<CoverId, number>;
  membranes: Map<MembraneKind, number>;
}

export function theme(body: Body): Theme {
  const family = familyCounts(body);
  let total = 0;
  for (const n of Object.values(family)) total += n;
  // Limbs, not segments: a bent arm is one arm (flank.ts).
  const segments = limbCounts(body);
  const covers = new Map<CoverId, number>();
  for (const id of segmentIds(body)) {
    const s = body.segments[id]!;
    if (s.kind !== "flank" && s.cover !== "skin" && s.cover !== "chrome") covers.set(s.cover, (covers.get(s.cover) ?? 0) + 1);
  }
  for (const [kind, n] of segments) segments.set(kind, Math.max(0, n - (SEGMENT_KINDS[kind].baseline ?? 0)));
  const organsBeyond = new Map<OrganKind, number>();
  for (const [kind, n] of kindCounts(body)) {
    const spec = ORGANS[kind];
    if (spec.family === undefined) continue;
    const beyond = n - (spec.baseline ?? 0);
    if (beyond > 0) organsBeyond.set(kind, beyond);
  }
  const membranes = new Map<MembraneKind, number>();
  for (const id of sortedIds(body.membranes)) {
    const m = body.membranes[id]!;
    membranes.set(m.kind, (membranes.get(m.kind) ?? 0) + 1);
  }
  return { family, total, segments, organs: organsBeyond, covers, membranes };
}

/**
 * What the row grows, kind by kind: its segment, its ending or organ with what
 * a head holds, its growths, its cover, its membrane. The theme and the diet
 * (diet.ts) both read a row through this one list.
 */
export function rowKinds(m: Mutation): Eatable[] {
  const out: Eatable[] = [];
  const org = (o: Organ | null | undefined): void => {
    if (o === null || o === undefined) return;
    out.push(o.kind);
    for (const c of o.contents ?? []) org(c);
  };
  switch (m.op) {
    case "sprout":
      out.push(m.payload.kind);
      org(m.payload.ending);
      for (const g of m.payload.growths ?? []) org(g);
      out.push(m.payload.cover);
      break;
    case "branch":
      out.push(m.payload.kind, m.payload.cover);
      break;
    case "joint":
    case "rebirth":
      org(m.payload.ending);
      break;
    case "organ":
      org(m.payload.organ);
      break;
    case "cover":
      out.push(m.payload.cover);
      break;
    case "membrane":
    case "wings":
      out.push(m.payload.kind);
      break;
    case "twin":
    case "budding":
      out.push(m.payload.brain);
      break;
    case "amorphous":
      out.push("tentacle");
      break;
    default:
      break;
  }
  return out;
}

/** Features of the body that the row would grow more of: its segment kind, its ending or organ, its cover, its membrane. */
function kindPull(t: Theme, m: Mutation): number {
  let n = 0;
  for (const k of rowKinds(m)) n += t.segments.get(k as SegmentKind) ?? t.organs.get(k as OrganKind) ?? t.covers.get(k as CoverId) ?? t.membranes.get(k as MembraneKind) ?? 0;
  return n;
}

interface ThemedMutation {
  mutation: Mutation;
  weight: number;
}

/**
 * chance x (1 + kTheme x share of the family among what grew) x (1 + kTheme x
 * features of the kind already there), the product capped at `themeCap`: a
 * body of five tentacles pulls a tentacle no harder than the cap says (step H).
 */
export function themeWeights(body: Body, table: readonly Mutation[], ctx?: SpreadContext): ThemedMutation[] {
  const t = theme(body);
  const k = SPREAD.kTheme * damping(body, ctx);
  return table.map((mutation) => {
    const share = t.total > 0 ? t.family[mutation.family] / t.total : 0;
    return { mutation, weight: mutation.chance * Math.min(SPREAD.themeCap, (1 + k * share) * (1 + k * kindPull(t, mutation))) };
  });
}

// ---------------------------------------------------------------- contagion of kind

const INFECTABLE: readonly SegmentKind[] = ["arm", "leg", "tail"];

/** Two segments are neighbours when they meet at a node or at one torso end and its side node: a flank is no distance (flank.ts). */
function touches(body: Body, s: Segment, t: Segment): boolean {
  const here = [anchorOf(body, s.a), anchorOf(body, s.b)];
  return here.includes(anchorOf(body, t.a)) || here.includes(anchorOf(body, t.b));
}

function adjacentTentacles(body: Body, segId: number): number {
  const s = body.segments[segId]!;
  let n = 0;
  for (const sid of segmentIds(body)) {
    if (sid === segId) continue;
    const t = body.segments[sid]!;
    if (t.kind === "tentacle" && touches(body, s, t)) n += 1;
  }
  return n;
}

/**
 * A limb just stretched or reborn next to tentacles becomes one with 0.15
 * per adjacent tentacle (a third of that with a regulator). One rng call,
 * and only when there is a tentacle next door. Returns whether it turned.
 */
export function infectKind(body: Body, segId: number, rng: Rng, ctx?: SpreadContext): boolean {
  const s = body.segments[segId];
  if (s === undefined || !INFECTABLE.includes(s.kind) || !COVERS[s.cover].mutates) return false;
  const n = adjacentTentacles(body, segId);
  if (n === 0) return false;
  if (rng.next() >= SPREAD.contagion * n * damping(body, ctx)) return false;
  s.kind = "tentacle";
  touch(body);
  return true;
}

/** The segment an ending sits on (capability.ts): what a rebirth infects. */
export function segmentUnder(body: Body, nodeId: number): number | null {
  return parentSegment(body, nodeId);
}

// ---------------------------------------------------------------- cover creeps

/** Starts a cover creeping from the segments that carry it. False when the cover is not there, does not creep, or already moves. */
export function startCoverFront(body: Body, cover: CoverId): boolean {
  if (COVERS[cover] === undefined || cover === "skin" || cover === "chrome") return false;
  if (!segmentIds(body).some((id) => body.segments[id]!.cover === cover)) return false;
  body.fronts ??= [];
  if (body.fronts.some((f) => f.cover === cover)) return false;
  body.fronts.push({ cover, turns: SPREAD.coverTurns });
  touch(body);
  return true;
}

/**
 * What a cover already on the segment costs the front that wants it, in
 * periods (decision 321): bare skin is free ground, another cover resists by
 * its armour. Fur and slime give way in two periods, scales and bark in three,
 * chitin four, bone plates five, stone six - a heavy cover is hard to take off
 * and easy to spread, and no cover is forever.
 */
function creepPeriods(cover: CoverId): number {
  return cover === "skin" ? 1 : SPREAD.coverResist + COVERS[cover].defense;
}

/**
 * The segment a cover takes next: the smallest id among the whole ones that
 * share a node with a whole segment of the cover. Bare skin first; when there
 * is none left the front takes a segment of another cover, which is what keeps
 * a body from staying in the first cover that reached it. Chrome neither takes
 * a cover nor passes one on.
 */
function creepTarget(body: Body, cover: CoverId, taken: ReadonlySet<number> = new Set()): number | null {
  const reached = new Set<number>();
  for (const id of segmentIds(body)) {
    const s = body.segments[id]!;
    if (s.cover === cover && s.hp > 0 && s.kind !== "flank") reached.add(anchorOf(body, s.a)).add(anchorOf(body, s.b));
  }
  let covered: number | null = null;
  for (const id of segmentIds(body)) {
    const s = body.segments[id]!;
    if (s.cover === cover || s.kind === "flank" || s.hp <= 0 || taken.has(id) || !COVERS[s.cover].mutates) continue;
    if (!reached.has(anchorOf(body, s.a)) && !reached.has(anchorOf(body, s.b))) continue;
    if (s.cover === "skin") return id;
    covered ??= id;
  }
  return covered;
}


export interface Crept {
  cover: CoverId;
  segment: number;
}

/**
 * One turn of the covers: every front counts down; at 0 it takes the next
 * segment, earliest front first, and counts again. Chrome never takes a cover
 * and never passes one on, and a broken segment does neither. Another cover is
 * taken, not skipped (decision 321): whoever got there first does not keep the
 * segment for good, but chewing through armour costs the front `creepPeriods`
 * of rest before its next step, so a hard cover is slow to take off and quick
 * to spread. Within one turn a segment changes hands once: the earlier front
 * takes it, the later ones leave it alone until their next step. A cover
 * brings its flesh (plates weigh more) up to the ceiling; over it the front
 * waits. A front whose cover has left the body is dropped.
 */
export function coverTick(body: Body, ceiling = skeletonCeiling(body)): Crept[] {
  const out: Crept[] = [];
  if (body.fronts === undefined || body.fronts.length === 0) return out;
  const present = new Set<CoverId>();
  for (const id of segmentIds(body)) present.add(body.segments[id]!.cover);
  body.fronts = body.fronts.filter((f) => present.has(f.cover));
  const taken = new Set<number>();
  for (const f of body.fronts) {
    f.turns -= 1;
    if (f.turns > 0) continue;
    f.turns = SPREAD.coverTurns;
    const target = creepTarget(body, f.cover, taken);
    if (target === null) continue;
    const s = body.segments[target]!;
    const delta = segmentMassOf(s.kind, s.length, s.girth, f.cover) - segmentMass(s);
    if (mass(body) + delta > ceiling + EPS) continue;
    const held = s.cover;
    s.cover = f.cover;
    body.meat += delta;
    taken.add(target);
    out.push({ cover: f.cover, segment: target });
    f.turns = SPREAD.coverTurns * creepPeriods(held);
  }
  touch(body);
  return out;
}

// ---------------------------------------------------------------- tumours press

/**
 * One turn of the tumours: every 50 turns each growth segment adds 5
 * instability to the organs on the segments next to it and to the endings
 * at its nodes; marks and chrome feel nothing, 100 is the top. The clock
 * starts with the first tumour and stops with the last. Returns the ids of
 * the elements whose organs rose, ascending.
 */
export function contagionTick(body: Body): number[] {
  const growths = segmentIds(body).filter((id) => body.segments[id]!.kind === "growth");
  if (growths.length === 0) {
    if (body.pressure !== undefined) {
      delete body.pressure;
      touch(body);
    }
    return [];
  }
  body.pressure = (body.pressure ?? SPREAD.pressureTurns) - 1;
  touch(body);
  if (body.pressure > 0) return [];
  body.pressure = SPREAD.pressureTurns;
  const pressed = new Set<number>();
  const press = (o: Organ, where: number): void => {
    if (hasTag(o.kind, "mark") || hasTag(o.kind, "chrome") || o.instability >= 100) return;
    o.instability = Math.min(100, o.instability + SPREAD.pressure);
    pressed.add(where);
  };
  for (const g of growths) {
    const gs = body.segments[g]!;
    for (const sid of segmentIds(body)) {
      if (sid === g) continue;
      const s = body.segments[sid]!;
      if (!touches(body, s, gs)) continue;
      for (const o of [...s.cavity, ...s.growths]) press(o, sid);
    }
    for (const n of [gs.a, gs.b]) for (const e of body.nodes[n]?.ends ?? []) press(e, n);
  }
  return [...pressed].sort((x, y) => x - y);
}
