/**
 * Measures of the body plan (step I): how much of a human is left in it,
 * how long its unbranched chains run, how many forks it has, and whether a
 * target lands on the torso. Read-only; the lab, the mutator and the gallery
 * show them, the tests of `grotesque emerges` hold them.
 */
import type { Body, SegmentKind } from "./graph.js";
import { nodeIds, otherEnd, segmentIds } from "./graph.js";
import type { Target } from "./grow.js";
import { distances } from "./metrics.js";
import { HUMAN_TORSO_GIRTH, SEGMENT_KINDS } from "./parts.js";
import { anchorOf, limbChains, limbCounts, torsoNodes } from "./flank.js";

/**
 * The plan as a player reads it: every limb one edge (an arm through its
 * elbow is one arm, flank.ts `limbChains`), between the anchors of its ends -
 * a side node is where its host's end is. Edges are keyed by the limb's first
 * segment; `members` lists the segments of each.
 */
function planAdjacency(body: Body): { adj: Map<number, number[]>; ends: Map<number, [number, number]>; members: Map<number, number[]> } {
  const adj = new Map<number, number[]>();
  const ends = new Map<number, [number, number]>();
  const members = new Map<number, number[]>();
  for (const id of nodeIds(body)) if (anchorOf(body, id) === id) adj.set(id, []);
  for (const c of limbChains(body)) {
    const id = c.segments[0]!;
    const a = anchorOf(body, c.root);
    const b = anchorOf(body, c.tip);
    ends.set(id, [a, b]);
    members.set(id, c.segments);
    adj.get(a)?.push(id);
    adj.get(b)?.push(id);
  }
  return { adj, ends, members };
}

/** The seven parts of `humanoid`, each 0..1. */
interface HumanoidParts {
  /** One head, on a neck, over the chest: 1; the only head sunk into the torso: 0.25; elsewhere: 0.5; divided by the number of heads. */
  head: number;
  /** One torso: 1; n torsos: 1 / n. */
  trunk: number;
  /** Two arms from the chest and none elsewhere. */
  arms: number;
  /** Two legs from the pelvis and none elsewhere. */
  legs: number;
  /** The thickest torso at girth 3 or less; a third off per unit beyond. */
  girth: number;
  /** Lengths of the torso, the neck, the arms and the legs against the human's. */
  proportions: number;
  /** Segments beyond the human's count of each kind: 1 / (1 + extra / 4). */
  extras: number;
}

/** What each part weighs in the whole; they sum to 10. */
const HUMANOID_WEIGHTS: Readonly<Record<keyof HumanoidParts, number>> = { head: 2, trunk: 1.5, arms: 2, legs: 2, girth: 1, proportions: 0.75, extras: 0.75 };

const HUMAN_LENGTH: Partial<Record<SegmentKind, number>> = { torso: 2, neck: 1, arm: 2, leg: 2 };

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

interface Frame {
  /** The torso that stands for the trunk: nearest the first head, else the heaviest. */
  main: number | null;
  chest: number | null;
  pelvis: number | null;
  heads: { node: number }[];
  torsos: number[];
}

function frame(body: Body): Frame {
  const heads: { node: number }[] = [];
  for (const id of nodeIds(body)) for (const e of body.nodes[id]!.ends) if (e.kind === "head") heads.push({ node: id });
  const torsos = segmentIds(body).filter((id) => body.segments[id]!.kind === "torso");
  if (torsos.length === 0) return { main: null, chest: null, pelvis: null, heads, torsos };
  let main = torsos[0]!;
  let chest = body.segments[main]!.a;
  if (heads.length > 0) {
    const dist = distances(body, { node: heads[0]!.node });
    let best = Infinity;
    for (const id of torsos) {
      const s = body.segments[id]!;
      const d = Math.min(dist[s.a] ?? Infinity, dist[s.b] ?? Infinity);
      if (d < best) {
        best = d;
        main = id;
        chest = (dist[s.a] ?? Infinity) <= (dist[s.b] ?? Infinity) ? s.a : s.b;
      }
    }
  } else {
    let best = -1;
    for (const id of torsos) {
      const s = body.segments[id]!;
      if (s.length * s.girth > best) {
        best = s.length * s.girth;
        main = id;
        chest = s.a;
      }
    }
  }
  return { main, chest, pelvis: otherEnd(body.segments[main]!, chest), heads, torsos };
}

/** Two of a kind at the node and none elsewhere: 1; every limb short, over or astray takes a half. A bent limb is one limb. */
function pairAt(body: Body, kind: SegmentKind, node: number | null): { score: number; lengths: number[] } {
  let at = 0;
  let total = 0;
  const lengths: number[] = [];
  for (const c of limbChains(body)) {
    if (c.kind !== kind) continue;
    total += 1;
    if (node !== null && (anchorOf(body, c.root) === node || anchorOf(body, c.tip) === node)) {
      at += 1;
      lengths.push(c.length);
    }
  }
  return { score: clamp01(1 - (Math.abs(at - 2) + (total - at)) / 2), lengths };
}

/** How much of the human plan the body keeps, part by part (0..1 each). */
export function humanoidParts(body: Body): HumanoidParts {
  const f = frame(body);
  const samples: { length: number; human: number }[] = [];
  let head = 0;
  if (f.heads.length > 0) {
    const h = f.heads[0]!;
    let neck: number | null = null;
    if (f.chest !== null && h.node !== f.chest) {
      for (const id of segmentIds(body)) {
        const s = body.segments[id]!;
        if (s.kind === "neck" && ((s.a === h.node && s.b === f.chest) || (s.b === h.node && s.a === f.chest))) {
          neck = id;
          break;
        }
      }
    }
    if (neck !== null) {
      head = 1;
      samples.push({ length: body.segments[neck]!.length, human: HUMAN_LENGTH.neck! });
    } else head = f.chest !== null && h.node === f.chest ? 0.25 : 0.5;
    head /= f.heads.length;
  }
  const trunk = f.torsos.length === 0 ? 0 : 1 / f.torsos.length;
  if (f.main !== null) samples.push({ length: body.segments[f.main]!.length, human: HUMAN_LENGTH.torso! });
  const arms = pairAt(body, "arm", f.chest);
  const legs = pairAt(body, "leg", f.pelvis);
  for (const l of arms.lengths) samples.push({ length: l, human: HUMAN_LENGTH.arm! });
  for (const l of legs.lengths) samples.push({ length: l, human: HUMAN_LENGTH.leg! });
  let maxGirth = 0;
  for (const id of f.torsos) maxGirth = Math.max(maxGirth, body.segments[id]!.girth);
  const girth = f.torsos.length === 0 ? 0 : clamp01(1 - Math.max(0, maxGirth - HUMAN_TORSO_GIRTH) / 3);
  let proportions = 0;
  for (const x of samples) proportions += clamp01(1 - Math.abs(x.length - x.human) / 3);
  proportions = samples.length === 0 ? 0 : proportions / samples.length;
  const counts = limbCounts(body);
  let extra = 0;
  for (const [k, n] of counts) extra += Math.max(0, n - (SEGMENT_KINDS[k].baseline ?? 0));
  return { head, trunk, arms: arms.score, legs: legs.score, girth, proportions, extras: 1 / (1 + extra / 4) };
}

/** 0..1: how much the plan of the body is still a human's. The human is 1. */
export function humanoid(body: Body): number {
  const p = humanoidParts(body);
  let sum = 0;
  let total = 0;
  for (const key of Object.keys(HUMANOID_WEIGHTS) as (keyof HumanoidParts)[]) {
    sum += HUMANOID_WEIGHTS[key] * p[key];
    total += HUMANOID_WEIGHTS[key];
  }
  return Math.round((sum / total) * 1000) / 1000;
}

/**
 * The unbranched chain every segment lies in: the maximal path through nodes
 * of degree 2, counted in limbs (a bent arm is one). A ring of joints counts once around.
 */
export function chains(body: Body): Map<number, number> {
  const { adj, ends, members } = planAdjacency(body);
  const degree = (n: number): number => adj.get(n)?.length ?? 0;
  const other = (sid: number, at: number): number => {
    const [a, b] = ends.get(sid)!;
    return a === at ? b : a;
  };
  const out = new Map<number, number>();
  for (const sid of ends.keys()) {
    if (out.has(sid)) continue;
    const chain = new Set<number>([sid]);
    for (const start of ends.get(sid)!) {
      let at = start;
      let via = sid;
      while (degree(at) === 2) {
        const next = adj.get(at)!.find((s) => s !== via);
        if (next === undefined || chain.has(next)) break;
        chain.add(next);
        via = next;
        at = other(next, at);
      }
    }
    for (const s of chain) for (const m of members.get(s)!) out.set(m, chain.size);
  }
  return out;
}

/** The longest unbranched chain of the body, in limbs. */
export function longestChain(body: Body): number {
  let best = 0;
  for (const n of chains(body).values()) best = Math.max(best, n);
  return best;
}

/** Nodes of degree 3 or more: where the body branches. */
export function forks(body: Body): number {
  const { adj } = planAdjacency(body);
  let n = 0;
  for (const list of adj.values()) if (list.length >= 3) n += 1;
  return n;
}

/** A test of targets: does this one land on a torso or one of its nodes (a torso, an ending there, a pair or a cycle touching one)? */
export function planTargets(body: Body): (t: Target) => boolean {
  const nodes = new Set<number>(torsoNodes(body));
  const segs = new Set<number>();
  for (const id of segmentIds(body)) if (body.segments[id]!.kind === "torso") segs.add(id);
  return (t) => {
    if ("segment" in t) return segs.has(t.segment);
    if ("node" in t) return nodes.has(t.node);
    if ("ending" in t) return nodes.has(t.ending.node);
    if ("pair" in t) return t.pair.some((n) => nodes.has(n));
    return t.cycle.some((s) => segs.has(s));
  };
}
