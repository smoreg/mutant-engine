/**
 * A mutation is a row of data: an operation, its payload, a target rule, a
 * family, a chance and tags (body-graph.md §8, docs/tasks/body-graph/C-catalog.md).
 * `applyMutation` picks a target by the weights of §8, applies the operation
 * and settles the flesh: a mutation grows its own - meat rises by the mass it
 * brought and the reserve pays 20 per unit - up to the skeleton's ceiling, where
 * the abyss pushes out the smallest set of the weakest organs that lets the
 * mutation land (never a vital one, never for nothing) and every other source
 * becomes a tumour. A new kind of effect is one case here; a new mutation of
 * the same kind is a row in the catalog.
 *
 * Step I: the plan decays - rows of the operations over the torso weigh
 * more the more the body has mutated (`drawWeights`); a joint of degree 2
 * inside a limb wants to fork - a sprout or a branch there widens the joint
 * on its way and weighs x3; a long unbranched chain resists joints and
 * stretching (`chainWeights`); the ceiling is the body's own, raised by
 * bloated flesh (`ceilingOf`).
 *
 * Step J: the needs of the body (needs.ts) pull - a row that serves a need
 * weighs x (1 + 4 x strength) in the draw and a place that lacks it
 * x (1 + 3 x strength x share); an ORGAN for a cavity with no room in any
 * makes the abyss push the weakest set out of a cavity by place
 * (`evictForCavity`); a row aimed at an ending the body no longer has grows
 * the ending it wanted instead, a SPROUT to a limb node (`orphanSprout`).
 *
 * The catalog itself lives in src/content; this file knows only the shape.
 */
import type { Body, BrainRef, MembraneKind, Organ, OrganKind, SegmentKind, CoverId } from "./graph.js";
import { cloneBody, nodeIds, otherEnd, segmentIds, selfElement, selfRef, setSelf, sortedIds, touch } from "./graph.js";
import { brains } from "./brains.js";
import type { CutResult } from "./cut.js";
import { MEMBRANE_MAX, addMembrane, hasMembraneOn, spanNodes, tearMembranes } from "./membrane.js";
import { adjacency, closure, distances, hasKind, hearts } from "./metrics.js";
import { SENSE_REACH, needDrawFactors, needPlaceFactor, needPulls } from "./needs.js";
import { ORGAN_SIZES, isSizedKind } from "./sizes.js";
import { COVERS, FAMILIES, MEMBRANES, ORGANS, SEGMENT_KINDS, SKELETON_CEILING, capacity, cavityLoad, hasTag, isChrome, mass, mutationLoad, organMass, organs, segmentMass, segmentMassOf, skeletonCeiling, type Family } from "./parts.js";
import { anchorOf, limbChains, sideNodesOf, type LimbChain } from "./flank.js";
import { dietFactor } from "./diet.js";
import { chains } from "./plan.js";
import type { Rng } from "./rng.js";
import { infectKind, neighborhoodWeights, segmentUnder, spreadOn, startCoverFront, themeWeights, type SpreadContext } from "./spread.js";
import {
  LIMITS,
  apply,
  branchFits,
  drawWeighted,
  regrowLater,
  regrowNow,
  sameTarget,
  sproutFits,
  targets,
  weigh,
  type ApplyResult,
  type GrowContext,
  type Op,
  type Payload,
  type Target,
  type Weighted,
} from "./grow.js";

export { SKELETON_CEILING } from "./parts.js";
export type { Family } from "./parts.js";

/** Flesh memory grows a lost part back in this many turns. */
export const FLESH_MEMORY_TURNS = 200;
/** What the reserve pays per unit of mass a mutation brings (hunger.md). */
export const RESERVE_PER_MASS = 20;
/** A sprout or a branch at a joint of degree 2 inside a limb weighs this much more (step I): the chain forks. */
export const FORK_AT_JOINT = 5;
/** The plan decays: rows of these operations weigh x (1 + load / 10) for the abyss, the tumour and the meat (step I). */
export const PLAN_OPS: ReadonlySet<MutationOp> = new Set<MutationOp>(["bloat", "engulf", "sink", "split", "merge", "flesh", "shift", "thicken", "thin", "budding"]);
/** Mutations per unit of the decay: the multiplier is 1 + load / DECAY_PER. */
export const DECAY_PER = 4;

/** Operations of several steps: one case each in `applyComposite`. */
export type CompositeOp = "wings" | "twin" | "budding" | "amorphous" | "lose";
export type MutationOp = Op | CompositeOp;

export interface CompositePayloads {
  /** Two limbs of one node are jointed, their tips fused, a membrane stretched over the cycle. */
  wings: { kind: MembraneKind };
  /** A torso with a head grows from a node; the head's node enlarges and sprouts arms with hands. */
  twin: { brain: OrganKind; arms: number };
  /** A limb thickens into a torso that receives a heart and a brain of the given kind, and a bud. */
  budding: { brain: OrganKind };
  /** Every segment but a torso becomes a tentacle, every ending but a head a pseudopod. */
  amorphous: Record<string, never>;
  /**
   * An absence (decision 1250): every organ of these kinds leaves one head - the
   * eyes for blindness, the ears for deafness. The sense goes because its organ
   * went, and a new one grown by the catalog brings it back.
   */
  lose: { kinds: OrganKind[] };
}

export type MutationTag = "defect" | "psychic" | "sleeping" | "key" | "psionic" | "tidal";

/**
 * Which of an operation's own candidates the mutation accepts. Every field
 * narrows; an empty rule accepts all. The rule is the only thing that says
 * where a row lands (decision 160), so a field no row asks for is a place
 * hiding in the type - `covers` and `minLength` went the way of `atHead` for
 * that reason (decision 323), and `packages/core/tests/content/reach.test.ts` keeps the
 * list honest.
 */
export interface TargetRule {
  /** Segment targets: the kind must be one of these. */
  kinds?: SegmentKind[];
  /** Node targets: at least this size; segment targets (a sprout's new side node): a torso only, when above 1. */
  minSize?: 1 | 2 | 3;
  /** Ending targets: the current ending is one of these; pair targets: both nodes hold one. */
  endings?: OrganKind[];
  /** Segment targets: one end holds a head. */
  toHead?: boolean;
  /** Node targets: an end of a torso whose cavity digests (step J: the gullet grows from the stomach's trunk). */
  digests?: boolean;
  /** Segment targets of a JOINT on a torso: the half that keeps the cavity still holds every organ in it (step J: a second mouth squeezes nothing out). */
  keepsCavity?: boolean;
}

/** Fields a row may ask for, for the check that no field of the rule goes unused (decision 323). */
export const TARGET_RULE_FIELDS: readonly (keyof TargetRule)[] = ["kinds", "minSize", "endings", "toHead", "digests", "keepsCavity"];

export type MutationSpec =
  | { [K in Op]: { op: K; payload: Payload<K> } }[Op]
  | { [K in CompositeOp]: { op: K; payload: CompositePayloads[K] } }[CompositeOp];

export type Mutation = MutationSpec & {
  id: string;
  family: Family;
  target: TargetRule;
  /** Weight of the draw within the family. */
  chance: number;
  tags: MutationTag[];
  /** Key into the translations table (RU / EN). */
  i18n: string;
};

export interface MutationContext extends GrowContext, SpreadContext {
  /** The skeleton's ceiling on mass; body.md §3, a human's 160. Bloated flesh raises it (`ceilingOf`). */
  ceiling?: number;
  /** False turns the needs of the body off (step J): no pull on the rows, none on the places. Absent means on. */
  needs?: boolean;
}

/** The ceiling this body meets: the skeleton's of the context (or the human's), plus what its bloated flesh holds. */
export function ceilingOf(body: Body, ctx?: MutationContext): number {
  return skeletonCeiling(body, ctx?.ceiling ?? SKELETON_CEILING);
}

export interface MutationResult {
  mutation: Mutation;
  /** What actually happened: the mutation's operation, or `growth` for a tumour. */
  op: MutationOp;
  target: Target;
  fallback: boolean;
  /** Mass the mutation brought with it: meat grew by this much. */
  grown: number;
  /** What the reserve pays: 20 per unit of mass grown. */
  reserve: number;
  /** Operations performed: 1, or the steps of a composite. */
  steps: number;
  created: number[];
  removed: number[];
  evicted: Organ[];
  /** The organs the abyss pushed out at the ceiling to make room, all for this one landing (a shed limb's endings and growths among them); empty otherwise. */
  displaced: Organ[];
  /** The hanging limbs the abyss shed at the ceiling for this landing (step I): segment ids; empty otherwise. */
  shed: number[];
  /** The limb that became a tentacle by contagion (spread.ts) while being stretched or reborn next to one. */
  infected: number | null;
  /** The row found no ending to work on and grew the one it wanted instead: a sprout to a limb node (step J). */
  orphan: boolean;
}

const EPS = 1e-9;
const LIMB_KINDS: readonly SegmentKind[] = ["arm", "leg", "tentacle", "tail"];
const ARM: Payload<"sprout"> = { kind: "arm", length: 1, girth: 1, cover: "skin", ending: { kind: "hand", instability: 0 } };

function roomFor(body: Body, delta: number): boolean {
  return mass(body) + delta <= body.meat + EPS;
}

// ---------------------------------------------------------------- target rules

function nodeHoldsHead(body: Body, id: number): boolean {
  return body.nodes[id]?.ends.some((e) => e.kind === "head") ?? false;
}

/** The node is an end or a side node of a torso whose cavity holds something that digests. */
function digestsAt(body: Body, id: number): boolean {
  for (const sid of segmentIds(body)) {
    const s = body.segments[sid]!;
    if (s.kind !== "torso" || !s.cavity.some((o) => hasTag(o.kind, "digests"))) continue;
    if (s.a === id || s.b === id || sideNodesOf(body, sid).includes(id)) return true;
  }
  return false;
}

function passes(body: Body, rule: TargetRule, t: Target): boolean {
  if ("segment" in t) {
    const s = body.segments[t.segment]!;
    if (rule.kinds !== undefined && !rule.kinds.includes(s.kind)) return false;
    // A sprout on a segment grows from a new side node of size 1: a rule that wants a big node takes a torso's side, never a limb's.
    if (rule.minSize !== undefined && rule.minSize > 1 && s.kind !== "torso") return false;
    if (rule.digests === true && !(s.kind === "torso" && s.cavity.some((o) => hasTag(o.kind, "digests")))) return false;
    if (rule.toHead === true && !nodeHoldsHead(body, s.a) && !nodeHoldsHead(body, s.b)) return false;
    if (rule.keepsCavity === true && s.kind === "torso" && cavityLoad(s) > 5 * Math.ceil(s.length / 2) * s.girth + EPS) return false;
    return true;
  }
  if ("node" in t) {
    if (rule.minSize !== undefined && body.nodes[t.node]!.size < rule.minSize) return false;
    return rule.digests !== true || digestsAt(body, t.node);
  }
  if ("ending" in t) return rule.endings === undefined || rule.endings.includes(body.nodes[t.ending.node]!.ends[t.ending.index]!.kind);
  if ("pair" in t) return rule.endings === undefined || t.pair.every((n) => body.nodes[n]!.ends.some((e) => rule.endings!.includes(e.kind)));
  return true;
}

/**
 * Limbs a wing can spread on: one limb of 2..6 segments - an arm bent at the
 * elbow, a leg at the knee - whose cover still mutates and which carries no
 * membrane yet. No fusion, no cycle: the wing hangs on the limb itself
 * (decision 121).
 */
function wingChains(body: Body): LimbChain[] {
  if (sortedIds(body.membranes).length >= LIMITS.membranes) return [];
  return limbChains(body).filter(
    (c) =>
      LIMB_KINDS.includes(c.kind) &&
      c.segments.length >= 2 &&
      c.segments.length <= MEMBRANE_MAX &&
      c.segments.every((sid) => COVERS[body.segments[sid]!.cover].mutates) &&
      // An open path, not a ring: fused arms run in parallel between the same two nodes, and a
      // limb that closes on itself is a cycle of two - neither is a span a wing can spread on.
      spanNodes(body, c.segments) !== null &&
      !hasMembraneOn(body, c.segments),
  );
}

function wingCandidates(body: Body): Target[] {
  return wingChains(body).map((c) => ({ segment: c.segments[0]! }));
}

/** A sprout whose ending already grows next door weighs this much more there (§8, anatomical affinity). */
export const ENDING_AFFINITY = 2;

/**
 * Anatomical affinity: a SPROUT with an ending weighs x2 at the nodes where
 * the same kind of ending sits at the far end of an adjacent segment - a leg
 * grows from the pelvis, an arm from the shoulders. Heads and mouths are
 * exempt: they may stand anywhere.
 */
function affinityWeights(body: Body, m: Mutation, list: Weighted[]): Weighted[] {
  if (m.op !== "sprout" || m.payload.ending === null || list.length === 0) return list;
  const kind = m.payload.ending.kind;
  if (kind === "head" || kind === "mouth") return list;
  // Next door is where the limb that carries the ending grows from: a hand's shoulder, a foot's hip, and
  // that root's anchor (a side node is no step from its torso's end).
  const near = new Set<number>();
  for (const c of limbChains(body)) {
    for (const [end, root] of [
      [c.tip, c.root],
      [c.root, c.tip],
    ] as const) {
      if (!body.nodes[end]!.ends.some((e) => e.kind === kind)) continue;
      near.add(root).add(anchorOf(body, root));
    }
  }
  if (near.size === 0) return list;
  // A sprout on a segment grows from a new side node: it is next door when any side node of that segment is.
  const nearTarget = (t: Target): boolean => ("node" in t ? near.has(t.node) : "segment" in t && sideNodesOf(body, t.segment).some((n) => near.has(n)));
  return list.map((w) => (nearTarget(w.target) ? { target: w.target, weight: w.weight * ENDING_AFFINITY } : w));
}

/**
 * Joints of degree 2 inside a limb (neither segment a torso, the node no end
 * of one) whose size may still grow: where a chain could fork. `full` lists
 * only those with no free place for a sprout (or fewer than two for a branch).
 */
function forkJoints(body: Body, adj: Map<number, number[]>, need: 1 | 2): { node: number; full: boolean }[] {
  const out: { node: number; full: boolean }[] = [];
  // An elbow or a knee of a limb bent once is the body's own joint, not a place that wants to fork.
  const natural = new Set<number>();
  for (const c of limbChains(body)) {
    if (c.segments.length !== 2) continue;
    const s = body.segments[c.segments[0]!]!;
    natural.add(s.a === c.root ? s.b : s.a);
  }
  for (const id of nodeIds(body)) {
    if (natural.has(id)) continue;
    const segs = adj.get(id) ?? [];
    if (segs.length !== 2 || segs.some((sid) => body.segments[sid]!.kind === "torso" || body.segments[sid]!.kind === "flank")) continue;
    const n = body.nodes[id]!;
    if (n.size >= 3) {
      out.push({ node: id, full: false });
      continue;
    }
    out.push({ node: id, full: 2 * n.size - 2 < need });
  }
  return out;
}

/**
 * A joint wants to fork (step I): a SPROUT or a BRANCH at a joint of degree 2
 * inside a limb weighs x3, and a full joint of size 1 or 2 is a place too -
 * the operation widens it on its way (`perform`). The rule of the row still
 * narrows: a sprout that asks for size 2 does not land on a joint of size 1.
 */
function forkWeights(body: Body, m: Mutation, list: Weighted[], ctx?: MutationContext): Weighted[] {
  if (m.op !== "sprout" && m.op !== "branch") return list;
  const adj = adjacency(body);
  const joints = forkJoints(body, adj, m.op === "sprout" ? 1 : 2);
  if (joints.length === 0) return list;
  const at = new Set(joints.map((j) => j.node));
  const out = list.map((w) => {
    const node = "node" in w.target ? w.target.node : "ending" in w.target ? w.target.ending.node : -1;
    return at.has(node) ? { target: w.target, weight: w.weight * FORK_AT_JOINT } : w;
  });
  const extra: Target[] = [];
  if (m.op === "sprout") {
    if (sproutFits(body, m.payload)) for (const j of joints) if (j.full) extra.push({ node: j.node });
  } else {
    const selfId = selfElement(body);
    for (const j of joints) {
      if (!j.full || j.node === selfId) continue;
      body.nodes[j.node]!.ends.forEach((e, index) => {
        if (branchFits(body, m.payload, e)) extra.push({ ending: { node: j.node, index } });
      });
    }
  }
  const fresh = weigh(body, extra.filter((t) => passes(body, m.target, t)), ctx).map((w) => ({ target: w.target, weight: w.weight * FORK_AT_JOINT }));
  return [...out, ...fresh];
}

/**
 * A chain resists (step I): a JOINT on a segment of an unbranched chain of
 * more than two segments weighs x 1 / (1 + (chain - 2)); a STRETCH the same,
 * and x 1 / (1 + (length - 3)) besides from length 4 - a long arm grows
 * longer ever more rarely, and forks instead.
 */
function chainWeights(body: Body, m: Mutation, list: Weighted[]): Weighted[] {
  if (m.op !== "joint" && !(m.op === "stretch" && m.payload.delta > 0)) return list;
  if (list.length === 0) return list;
  const chain = chains(body);
  return list.map((w) => {
    if (!("segment" in w.target)) return w;
    const n = chain.get(w.target.segment) ?? 1;
    let weight = w.weight;
    if (n > 2) weight /= 1 + (n - 2);
    if (m.op === "stretch") {
      const length = body.segments[w.target.segment]!.length;
      if (length >= 4) weight /= 1 + (length - 3);
    }
    return { target: w.target, weight };
  });
}

/**
 * The far node of every penis: the end that holds nothing else. Nothing grows
 * there (decision 161) - the catalog never lands a hand, a head or an eye on
 * the tip, and a penis takes no joint. The size of the penis is its own row.
 */
function penisTips(body: Body): Set<number> {
  const out = new Set<number>();
  const adj = adjacency(body);
  for (const id of segmentIds(body)) {
    const s = body.segments[id]!;
    if (s.kind !== "penis") continue;
    for (const end of [s.a, s.b]) if ((adj.get(end) ?? []).length === 1) out.add(end);
  }
  return out;
}

/** The places of a row without the tip of a penis, and without a joint in the penis itself. */
function offPenisTip(body: Body, m: Mutation, list: Weighted[]): Weighted[] {
  if (list.length === 0) return list;
  const tips = penisTips(body);
  if (tips.size === 0) return list;
  return list.filter(({ target: t }) => {
    if ("node" in t) return !tips.has(t.node);
    if ("ending" in t) return !tips.has(t.ending.node);
    if ("pair" in t) return !t.pair.some((n) => tips.has(n));
    if ("segment" in t) return !(m.op === "joint" && body.segments[t.segment]?.kind === "penis");
    return true;
  });
}

/** The needs of the body raise the places that lack what the row serves (step J): x (1 + 3 x strength x share), unless turned off. */
function needWeights(body: Body, m: Mutation, list: Weighted[], ctx?: MutationContext): Weighted[] {
  if (ctx?.needs === false || list.length === 0 || needPulls(m).length === 0) return list;
  return list.map((w) => {
    const f = needPlaceFactor(body, m, w.target);
    return f === 1 ? w : { target: w.target, weight: w.weight * f };
  });
}

/** Rows aimed at an ending by their rule: without one they grow it instead. Migration moves what is there and grows nothing. */
const AIMED_OPS: ReadonlySet<MutationOp> = new Set<MutationOp>(["rebirth", "branch", "fusion"]);

/**
 * What an orphan row grows when the body has no ending for it (step J): a
 * limb of one with the ending the row wanted - the new kind of a rebirth,
 * else the first kind of its rule - a leg when the rule names a foot first,
 * an arm otherwise. Null for rows that are not aimed at an ending.
 */
export function orphanSprout(m: Mutation): Payload<"sprout"> | null {
  if (!AIMED_OPS.has(m.op) || m.target.endings === undefined || m.target.endings.length === 0) return null;
  const wanted: Organ = m.op === "rebirth" ? structuredClone(m.payload.ending) : { kind: m.target.endings[0]!, instability: 0 };
  return { kind: m.target.endings[0] === "foot" ? "leg" : "arm", length: 1, girth: 1, cover: "skin", ending: wanted };
}

/** Nodes at the ends of limbs, where an orphan row grows its ending; every node when the body has no limb. */
function limbNodes(body: Body): Set<number> {
  const out = new Set<number>();
  for (const id of segmentIds(body)) {
    const s = body.segments[id]!;
    if (LIMB_KINDS.includes(s.kind)) out.add(s.a).add(s.b);
  }
  return out.size === 0 ? new Set(nodeIds(body)) : out;
}

/** The row's own places narrowed by its rule; empty when the body has nothing for it. */
function ownTargets(body: Body, m: Mutation, ctx?: MutationContext): Weighted[] {
  return targets(body, m.op as Op, m.payload as never, ctx).filter((w) => passes(body, m.target, w.target));
}

/** Where an orphan row's sprout may land: the limb nodes with room. */
function orphanTargets(body: Body, m: Mutation, ctx?: MutationContext): Weighted[] {
  const p = orphanSprout(m);
  if (p === null) return [];
  const nodes = limbNodes(body);
  return targets(body, "sprout", p, ctx).filter((w) => "node" in w.target && nodes.has(w.target.node));
}

/**
 * Every place the mutation may land, weighted by §8 (with the anatomical
 * affinity of a sprout, the fork of a joint and the resistance of a chain),
 * by the needs of the body (step J) and, unless the spread is off, by the
 * neighbourhood of the mutation's family (§11); the rule narrows the
 * operation's own candidates. The flesh rule applies: places are listed as
 * if the meat stood at the body's ceiling, since the mutation brings its own.
 * A row aimed at an ending the body lacks lists the limb nodes where it would
 * grow that ending instead (`orphanSprout`).
 */
export function mutationTargets(body: Body, m: Mutation, ctx?: MutationContext): Weighted[] {
  const meat = body.meat;
  body.meat = ceilingOf(body, ctx);
  try {
    const list = offPenisTip(body, m, needWeights(body, m, chainWeights(body, m, affinityWeights(body, m, forkWeights(body, m, targetsAtCeiling(body, m, ctx), ctx))), ctx));
    return spreadOn(ctx) ? neighborhoodWeights(body, list, m.family, ctx) : list;
  } finally {
    body.meat = meat;
  }
}

function targetsAtCeiling(body: Body, m: Mutation, ctx?: MutationContext): Weighted[] {
  switch (m.op) {
    case "wings":
      return weigh(body, wingCandidates(body), ctx);
    case "twin": {
      const torso = twinTorso(m.payload.brain);
      const extra = 1 + m.payload.arms;
      if (nodeIds(body).length + extra > LIMITS.nodes || segmentIds(body).length + extra > LIMITS.segments) return [];
      const total = segmentMassOf(torso.kind, torso.length, torso.girth, torso.cover) + organMass(torso.ending!) + m.payload.arms * (segmentMassOf("arm", 1, 1, "skin") + organMass(ARM.ending!));
      if (!roomFor(body, total)) return [];
      return targets(body, "sprout", torso, ctx).filter((w) => passes(body, m.target, w.target));
    }
    case "budding": {
      const inside = organMass({ kind: "heart", instability: 0 }) + organMass({ kind: m.payload.brain, instability: 0 });
      return targets(body, "thicken", {}, ctx).filter((w) => {
        if (!passes(body, m.target, w.target)) return false;
        const s = body.segments[(w.target as { segment: number }).segment]!;
        // A limb may already hold an organ (flank.ts): the bud's heart and brain must fit beside it, one brain per cavity.
        if (cavityLoad(s) + inside > 5 * s.length * (s.girth + 1) + EPS) return false;
        if (s.cavity.some((o) => hasTag(o.kind, "brain"))) return false;
        const thickened = segmentMassOf("torso", s.length, s.girth + 1, s.cover) - segmentMassOf(s.kind, s.length, s.girth, s.cover);
        return roomFor(body, thickened + inside);
      });
    }
    case "lose":
      return weigh(body, headsHolding(body, m.payload.kinds), ctx);
    case "amorphous": {
      const self = selfElement(body);
      const node = body.nodes[self] !== undefined ? self : body.segments[self]!.a;
      return weigh(body, [{ node }], ctx);
    }
    default: {
      const own = ownTargets(body, m, ctx);
      return own.length > 0 ? own : orphanTargets(body, m, ctx);
    }
  }
}

// ---------------------------------------------------------------- composites

/** Heads that hold at least one organ of the kinds, as ending targets; iron does not lose anything. */
function headsHolding(body: Body, kinds: readonly OrganKind[]): Target[] {
  const out: Target[] = [];
  for (const id of nodeIds(body)) {
    body.nodes[id]!.ends.forEach((e, index) => {
      if (e.kind !== "head" || isChrome(e)) return;
      if ((e.contents ?? []).some((c) => kinds.includes(c.kind))) out.push({ ending: { node: id, index } });
    });
  }
  return out;
}

function twinTorso(brain: OrganKind): Payload<"sprout"> {
  return {
    kind: "torso",
    length: 2,
    girth: 2,
    cover: "skin",
    ending: { kind: "head", instability: 0, contents: [{ kind: brain, instability: 0 }, { kind: "eye", instability: 0 }, { kind: "jaw", instability: 0 }] },
  };
}

function step(body: Body, op: Op, payload: Payload<Op>, target: Target, acc: ApplyResult): void {
  const r = apply(body, op, payload as never, target);
  acc.created.push(...r.created);
  acc.removed.push(...r.removed);
  acc.evicted.push(...r.evicted);
}

function listed(body: Body, op: Op, payload: Payload<Op>, target: Target): boolean {
  return targets(body, op, payload as never).some((w) => sameTarget(w.target, target));
}

/** Runs a composite on a clone; commits only when every step found its target. Returns the steps taken, or null. */
function applyComposite(body: Body, m: Mutation & { op: CompositeOp }, target: Target, acc: ApplyResult): number | null {
  const work = cloneBody(body);
  let steps = 0;
  const run = (op: Op, payload: Payload<Op>, t: Target): boolean => {
    if (!listed(work, op, payload, t)) return false;
    step(work, op, payload, t, acc);
    steps += 1;
    return true;
  };
  switch (m.op) {
    case "wings": {
      const seg = (target as { segment: number }).segment;
      const chain = wingChains(work).find((c) => c.segments.includes(seg));
      if (chain === undefined) return null;
      acc.created.push(addMembrane(work, chain.segments, m.payload.kind));
      steps += 1;
      // Wings come in pairs: the mirrored limb - same kind, same length, same place on the body - gets its own at once.
      const root = anchorOf(work, chain.root);
      const twin = wingChains(work).find((c) => c.segments[0] !== chain.segments[0] && c.kind === chain.kind && c.segments.length === chain.segments.length && anchorOf(work, c.root) === root);
      if (twin !== undefined) {
        acc.created.push(addMembrane(work, twin.segments, m.payload.kind));
        steps += 1;
      }
      break;
    }
    case "twin": {
      const before = new Set(nodeIds(work));
      // The target is a node, or a segment whose new side node the twin grows from (flank.ts).
      if (!run("sprout", twinTorso(m.payload.brain), target)) return null;
      const tip = nodeIds(work).find((id) => !before.has(id) && work.nodes[id]!.ends.some((e) => e.kind === "head"))!;
      if (m.payload.arms > 0 && !run("enlarge", {}, { node: tip })) return null;
      for (let i = 0; i < m.payload.arms; i++) if (!run("sprout", ARM, { node: tip })) return null;
      break;
    }
    case "budding": {
      const seg = (target as { segment: number }).segment;
      if (!run("thicken", {}, { segment: seg })) return null;
      for (const kind of ["heart", m.payload.brain] as OrganKind[]) {
        if (!run("organ", { organ: { kind, instability: 0 }, mount: "cavity" }, { segment: seg })) return null;
      }
      if (!run("organ", { organ: { kind: "bud", instability: 0 }, mount: "growth" }, { segment: seg })) return null;
      break;
    }
    case "lose": {
      if (!("ending" in target)) return null;
      const head = work.nodes[target.ending.node]?.ends[target.ending.index];
      if (head === undefined || head.kind !== "head") return null;
      const kept = (head.contents ?? []).filter((c) => !m.payload.kinds.includes(c.kind));
      steps = (head.contents ?? []).length - kept.length;
      if (steps === 0) return null;
      head.contents = kept;
      touch(work);
      break;
    }
    case "amorphous": {
      // A torso keeps its cavity, a tumour stays a tumour, a stalk stays a stalk (a tentacle would weigh more than the
      // flesh has); everything else that mutates is a tentacle now.
      for (const id of segmentIds(work)) {
        const s = work.segments[id]!;
        if (!["torso", "growth", "stalk", "tentacle", "gullet", "flank"].includes(s.kind) && COVERS[s.cover].mutates) {
          s.kind = "tentacle";
          steps += 1;
        }
      }
      const me = selfRef(work);
      for (const id of nodeIds(work)) {
        work.nodes[id]!.ends.forEach((e, index) => {
          if (e.kind === "head" || e.kind === "pseudopod" || hasTag(e.kind, "chrome")) return;
          if (me !== undefined && "node" in me && me.node === id && me.end === index) return;
          work.nodes[id]!.ends[index] = { kind: "pseudopod", instability: e.instability };
          steps += 1;
        });
      }
      touch(work);
      break;
    }
  }
  Object.assign(body, work);
  return steps;
}

// ---------------------------------------------------------------- the ceiling

/** An organ the abyss may push out, with the list it sits in, the element that holds it and its place in the enumeration of `organs`. */
interface EvictableOrgan {
  kind: "organ";
  organ: Organ;
  list: Organ[];
  /** The node or segment the list belongs to: gone with a limb, the entry is void. */
  holder: number;
  order: number;
}

/** A hanging limb the abyss may push out (step I): a segment whose far node holds nothing but it, with that node, its endings and its growths. */
interface EvictableLimb {
  kind: "limb";
  segment: number;
  node: number;
  mass: number;
  /** Segments in the unbranched chain the limb ends: the tip of the longest chain is the farthest edge. */
  chain: number;
  order: number;
}

type Evictable = EvictableOrgan | EvictableLimb;

/** What the abyss pushed out at the ceiling: the organs (a limb's endings and growths among them), the segments, and the mass of all of it. */
export interface Evicted {
  organs: Organ[];
  segments: number[];
  mass: number;
}

/** Hearts that pump: every heart organ in a whole segment (two in one cavity are two). */
function heartsAlive(body: Body): number {
  let n = 0;
  for (const id of hearts(body)) for (const o of body.segments[id]!.cavity) if (o.kind === "heart") n += 1;
  return n;
}

function breathingOrgans(body: Body): number {
  let n = 0;
  for (const o of organs(body)) if (ORGANS[o.kind].breath !== undefined) n += 1;
  return n;
}

function digestingOrgans(body: Body): number {
  let n = 0;
  for (const o of organs(body)) if (hasTag(o.kind, "digests")) n += 1;
  return n;
}

function eatingOrgans(body: Body): number {
  let n = 0;
  for (const o of organs(body)) if (ORGANS[o.kind].flags?.includes("eat")) n += 1;
  return n;
}

/**
 * What the abyss never pushes out (body-graph.md §8): any brain, a head with
 * a brain in it, the last heart that pumps (the body is one component, §19),
 * the last organ that breathes, and since step J the last organ that eats and
 * the last one that digests - a body that cannot eat is as dead as one that
 * cannot breathe - and since decision 115 the last eye and the last ending it
 * stands on: the lightest organs went first, and bodies at the ceiling went
 * blind and lame within forty strikes. No organ holds the body together - nodes and segments do -
 * so losing one never tears it.
 */
export function isVital(body: Body, o: Organ): boolean {
  if (hasTag(o.kind, "brain")) return true;
  if (o.kind === "head") return hasKind(o.contents ?? [], "brain") || (o.contents ?? []).some((c) => isVital(body, c));
  if (o.kind === "heart") {
    const alive = heartsAlive(body);
    if (alive > 1) return false;
    // The last pumping heart is the one in a whole segment; a heart in a broken segment is not it.
    if (alive === 0) return false;
    for (const id of hearts(body)) if (body.segments[id]!.cavity.includes(o)) return true;
    return false;
  }
  if (ORGANS[o.kind].breath !== undefined) return breathingOrgans(body) <= 1;
  if (hasTag(o.kind, "digests")) return digestingOrgans(body) <= 1;
  if (ORGANS[o.kind].flags?.includes("eat")) return eatingOrgans(body) <= 1;
  if (SEEING.has(o.kind)) return seeingOrgans(body) <= 1 || lastEyeOfABrain(body).has(o);
  if ((ORGANS[o.kind].stand ?? 0) > 0 && isEnding(body, o)) return standingEndings(body) <= 1;
  return false;
}

/** The organs that see (decision 115): the last of them is vital. */
const SEEING = new Set<OrganKind>(["eye", "facetEye"]);

function seeingOrgans(body: Body): number {
  let n = 0;
  for (const o of organs(body)) if (SEEING.has(o.kind)) n += 1;
  return n;
}

const lastEyes = new WeakMap<Body, { version: number; nextId: number; count: number; eyes: Set<Organ> }>();

/**
 * The eyes the abyss leaves alone (step K, decision 162): the only one a
 * living brain has within `SENSE_REACH`. An eye weighs one and used to go
 * first at the ceiling, so bodies ended up with eyes on a far stalk and a
 * blind head. The last eye of the body was already vital; now so is the last
 * eye of every brain. Cached by the body's version like the needs are.
 */
function lastEyeOfABrain(body: Body): Set<Organ> {
  const spots: { node: number; organ: Organ }[] = [];
  for (const id of nodeIds(body)) {
    for (const e of body.nodes[id]!.ends) {
      if (SEEING.has(e.kind)) spots.push({ node: id, organ: e });
      for (const c of e.contents ?? []) if (SEEING.has(c.kind)) spots.push({ node: id, organ: c });
    }
  }
  // The eviction at the ceiling takes organs out one by one without touching the version, so the count of eyes is part of the key.
  const hit = lastEyes.get(body);
  if (hit !== undefined && hit.version === body.version && hit.nextId === body.nextId && hit.count === spots.length) return hit.eyes;
  const eyes = new Set<Organ>();
  if (spots.length > 0) {
    for (const b of brains(body)) {
      if (!b.alive) continue;
      const dist = distances(body, b.place);
      const near = spots.filter((s) => (dist[s.node] ?? Infinity) <= SENSE_REACH + EPS);
      if (near.length === 1) eyes.add(near[0]!.organ);
    }
  }
  lastEyes.set(body, { version: body.version, nextId: body.nextId, count: spots.length, eyes });
  return eyes;
}

function isEnding(body: Body, o: Organ): boolean {
  for (const id of nodeIds(body)) if (body.nodes[id]!.ends.includes(o)) return true;
  return false;
}

/** Endings a body stands on (a foot, a hoof): the last of them is vital (decision 115). */
function standingEndings(body: Body): number {
  let n = 0;
  for (const id of nodeIds(body)) for (const e of body.nodes[id]!.ends) if ((ORGANS[e.kind].stand ?? 0) > 0) n += 1;
  return n;
}

/** Every organ of mass above zero that is not vital now, weakest first: by mass, then instability (higher first), then the order of `organs`. */
function evictableOrgans(body: Body): EvictableOrgan[] {
  const all: EvictableOrgan[] = [];
  let order = 0;
  for (const id of nodeIds(body)) {
    for (const e of body.nodes[id]!.ends) {
      all.push({ kind: "organ", organ: e, list: body.nodes[id]!.ends, holder: id, order: order++ });
      for (const c of e.contents ?? []) all.push({ kind: "organ", organ: c, list: e.contents!, holder: id, order: order++ });
    }
  }
  for (const id of segmentIds(body)) {
    const s = body.segments[id]!;
    for (const o of s.cavity) all.push({ kind: "organ", organ: o, list: s.cavity, holder: id, order: order++ });
    for (const o of s.growths) all.push({ kind: "organ", organ: o, list: s.growths, holder: id, order: order++ });
  }
  return all
    .filter((e) => organMass(e.organ) > 0 && !isVital(body, e.organ))
    .sort((x, y) => organMass(x.organ) - organMass(y.organ) || y.organ.instability - x.organ.instability || x.order - y.order);
}

/** A hanging limb is vital when anything in it is: an ending (a head with a brain), what a head holds, a growth that breathes last. */
function limbVital(body: Body, segment: number, node: number): boolean {
  const s = body.segments[segment];
  const n = body.nodes[node];
  if (s === undefined || n === undefined) return true;
  for (const e of n.ends) if (isVital(body, e) || (e.contents ?? []).some((c) => isVital(body, c))) return true;
  // A limb holds one organ inside now (flank.ts): the last heart in a leg keeps the leg.
  return s.growths.some((g) => isVital(body, g)) || s.cavity.some((o) => isVital(body, o));
}

/**
 * Every hanging limb that is not vital, lightest first (then by id): a segment
 * that is no torso, whose far node holds nothing but it and is not where you
 * are. Its mass is the segment's with everything on it. The abyss takes limbs
 * only after the organs (step I): a limb is a bigger loss than an eye.
 */
function evictableLimbs(body: Body): EvictableLimb[] {
  const adj = adjacency(body);
  const selfId = selfElement(body);
  const chain = chains(body);
  const out: EvictableLimb[] = [];
  for (const id of segmentIds(body)) {
    const s = body.segments[id]!;
    if (s.kind === "torso" || s.kind === "flank") continue;
    for (const far of [s.b, s.a]) {
      if ((adj.get(far)?.length ?? 0) !== 1 || far === selfId || limbVital(body, id, far)) continue;
      let m = segmentMass(s);
      for (const e of body.nodes[far]!.ends) m += organMass(e);
      for (const g of [...s.growths, ...s.cavity]) m += organMass(g);
      out.push({ kind: "limb", segment: id, node: far, mass: m, chain: chain.get(id) ?? 1, order: out.length });
      break;
    }
  }
  // The abyss rewrites the edges: the tip of the longest chain goes first, then the lightest limb.
  return out.sort((x, y) => y.chain - x.chain || x.mass - y.mass || x.order - y.order);
}

function evictable(body: Body): Evictable[] {
  return [...evictableOrgans(body), ...evictableLimbs(body)];
}

/** Whether the entry still stands: an organ whose holder left with a limb is void, a limb already gone too. */
function stands(body: Body, e: Evictable): boolean {
  if (e.kind === "limb") return body.segments[e.segment] !== undefined && body.nodes[e.node] !== undefined;
  return (body.nodes[e.holder] !== undefined || body.segments[e.holder] !== undefined) && e.list.includes(e.organ);
}

function vitalNow(body: Body, e: Evictable): boolean {
  return e.kind === "limb" ? limbVital(body, e.segment, e.node) : isVital(body, e.organ);
}

/** Takes the entry out of the body and returns what left: the organs and the mass. */
function evict(body: Body, e: Evictable, into: Evicted): void {
  if (e.kind === "organ") {
    e.list.splice(e.list.indexOf(e.organ), 1);
    into.organs.push(e.organ);
    into.mass += organMass(e.organ);
    return;
  }
  const s = body.segments[e.segment]!;
  const n = body.nodes[e.node]!;
  for (const o of n.ends) {
    into.organs.push(o);
    into.mass += organMass(o);
  }
  for (const g of [...s.growths, ...s.cavity]) {
    into.organs.push(g);
    into.mass += organMass(g);
  }
  into.mass += segmentMass(s);
  into.segments.push(e.segment);
  delete body.segments[e.segment];
  delete body.nodes[e.node];
  // A limb pushed out takes its wing with it.
  tearMembranes(body);
}

/** Your brain's holder before evictions: the ending of the node, or the brain itself in the cavity. */
export function selfHolder(body: Body): { ref: BrainRef; holder: Organ } | null {
  const ref = selfRef(body);
  if (ref === undefined) return null;
  const holder = "node" in ref ? body.nodes[ref.node]!.ends[ref.end] : body.segments[ref.segment]!.cavity[ref.slot];
  return holder === undefined ? null : { ref, holder };
}

/** After organs left the lists, an explicit index in `self` may point one place too far: put it back on the brain. */
export function keepSelf(body: Body, me: { ref: BrainRef; holder: Organ } | null): void {
  if (me === null) return;
  if ("node" in me.ref) {
    if (!("node" in body.self) || body.self.end === undefined) return;
    const end = body.nodes[me.ref.node]!.ends.indexOf(me.holder);
    if (end >= 0 && end !== body.self.end) setSelf(body, { node: me.ref.node, end });
  } else {
    if (!("segment" in body.self) || body.self.slot === undefined) return;
    const slot = body.segments[me.ref.segment]!.cavity.indexOf(me.holder);
    if (slot >= 0 && slot !== body.self.slot) setSelf(body, { segment: me.ref.segment, slot });
  }
}

function nothing(): Evicted {
  return { organs: [], segments: [], mass: 0 };
}

/**
 * The abyss at the skeleton's ceiling (body-graph.md §8): when the ceiling
 * alone stops the mutation, the smallest set of the weakest evictable organs
 * - and, once the organs are spent, of the lightest hanging limbs (step I) -
 * whose mass lets it land is pushed out, all at once; when no such set exists
 * nothing leaves. Vital organs (`isVital`) and limbs holding one are never in
 * the set. Returns what left, in the order it was chosen; empty when nothing
 * had to go or nothing could.
 */
export function evictAtCeiling(body: Body, m: Mutation, ctx: MutationContext = {}): Evicted {
  const probe: MutationContext = { ...ctx, spread: false, needs: false };
  if (mutationTargets(body, m, probe).length > 0) return nothing();
  if (mutationTargets(body, m, { ...probe, ceiling: Infinity }).length === 0) return nothing();
  // The search runs on a clone, so that a set that never suffices costs the body nothing.
  const work = cloneBody(body);
  const mine = evictable(body);
  const theirs = evictable(work);
  const taken: number[] = [];
  for (let i = 0; i < theirs.length; i++) {
    const e = theirs[i]!;
    if (!stands(work, e) || vitalNow(work, e)) continue;
    evict(work, e, nothing());
    taken.push(i);
    if (mutationTargets(work, m, probe).length === 0) continue;
    const me = selfHolder(body);
    const out = nothing();
    for (const j of taken) evict(body, mine[j]!, out);
    keepSelf(body, me);
    touch(body);
    return out;
  }
  return nothing();
}

/** What a cavity would push out for the organ: the weakest of its flesh, weakest first, until the room suffices. */
interface CavityRoom {
  segment: number;
  /** Slots of the organs that leave, weakest first. */
  slots: number[];
  mass: number;
}

/**
 * The cavity that makes room for the organ at the least cost (step J): for
 * every torso that could hold it, the weakest non-vital organs of its cavity
 * - by mass, then instability (higher first), then slot - leave one by one,
 * vitality read afresh at every step, until the organ fits; the torso whose
 * set weighs least wins, the smaller set on a tie, the smaller id after that.
 * Null when no cavity can be made to hold it.
 */
function cavityRoom(body: Body, m: Mutation): CavityRoom | null {
  if (m.op !== "organ" || m.payload.mount !== "cavity") return null;
  const need = organMass(m.payload.organ);
  const brain = hasTag(m.payload.organ.kind, "brain");
  let best: CavityRoom | null = null;
  for (const id of segmentIds(body)) {
    const s = body.segments[id]!;
    if (s.kind !== "torso" || !COVERS[s.cover].mutates || capacity(s) < need - EPS) continue;
    if (brain && s.cavity.some((o) => hasTag(o.kind, "brain"))) continue;
    const missing = need - (capacity(s) - cavityLoad(s));
    if (missing <= EPS) continue;
    const work = cloneBody(body);
    const cavity = work.segments[id]!.cavity;
    const order = cavity
      .map((o, slot) => ({ o, slot }))
      .filter(({ o }) => organMass(o) > 0)
      .sort((x, y) => organMass(x.o) - organMass(y.o) || y.o.instability - x.o.instability || x.slot - y.slot);
    const slots: number[] = [];
    let freed = 0;
    for (const { o, slot } of order) {
      if (freed + EPS >= missing) break;
      if (isVital(work, o)) continue;
      cavity.splice(cavity.indexOf(o), 1);
      slots.push(slot);
      freed += organMass(o);
    }
    if (freed + EPS < missing) continue;
    if (best === null || freed < best.mass - EPS || (Math.abs(freed - best.mass) <= EPS && slots.length < best.slots.length)) best = { segment: id, slots, mass: freed };
  }
  return best;
}

/**
 * The abyss makes room in a cavity (step J): when an ORGAN for a cavity fits
 * in none of them even with no ceiling, the weakest set of a cavity's organs
 * leaves by place (`cavityRoom`); nothing leaves when no cavity can be made
 * to hold it. Returns what left, empty otherwise.
 */
export function evictForCavity(body: Body, m: Mutation, ctx: MutationContext = {}): Evicted {
  const probe: MutationContext = { ...ctx, spread: false, needs: false, ceiling: Infinity };
  if (mutationTargets(body, m, probe).length > 0) return nothing();
  const room = cavityRoom(body, m);
  if (room === null) return nothing();
  const me = selfHolder(body);
  const out = nothing();
  const cavity = body.segments[room.segment]!.cavity;
  for (const o of room.slots.map((slot) => cavity[slot]!)) {
    cavity.splice(cavity.indexOf(o), 1);
    out.organs.push(o);
    out.mass += organMass(o);
  }
  keepSelf(body, me);
  touch(body);
  return out;
}

function merge(into: Evicted, more: Evicted): void {
  into.organs.push(...more.organs);
  into.segments.push(...more.segments);
  into.mass += more.mass;
}

function anything(e: Evicted): boolean {
  return e.mass > 0 || e.segments.length > 0 || e.organs.length > 0;
}

/**
 * Everything the abyss pushes out so that the row lands: the set at the
 * ceiling (step H), then room in a cavity (step J), then the ceiling once
 * more for the flesh the cavity's room let in. Empty when the row has a
 * place already, when the source is not the abyss, or when nothing helps.
 */
export function makeRoom(body: Body, m: Mutation, ctx: MutationContext = {}): Evicted {
  const out = nothing();
  const probe = { ...ctx, spread: false, needs: false };
  if (ctx.source !== "abyss" || mutationTargets(body, m, probe).length > 0) return out;
  // Atomic: the room is made on a clone and taken only when the mutation then has a place.
  const work = cloneBody(body);
  merge(out, evictAtCeiling(work, m, ctx));
  if (!(anything(out) && mutationTargets(work, m, probe).length > 0)) {
    const room = evictForCavity(work, m, ctx);
    if (anything(room)) {
      merge(out, room);
      if (mutationTargets(work, m, probe).length === 0) merge(out, evictAtCeiling(work, m, ctx));
    }
  }
  if (!anything(out) || mutationTargets(work, m, probe).length === 0) return nothing();
  Object.assign(body, work);
  return out;
}

/** Whether the row can land on the body: a place with no ceiling, or one the abyss would make in a cavity (a probe on a clone). */
export function hasPlace(body: Body, m: Mutation, ctx: MutationContext = {}): boolean {
  if (mutationTargets(body, m, { ...ctx, spread: false, needs: false, ceiling: Infinity }).length > 0) return true;
  if (ctx.source !== "abyss") return false;
  const work = cloneBody(body);
  work.meat = Infinity;
  return anything(evictForCavity(work, m, { ...ctx, ceiling: Infinity })) && mutationTargets(work, m, { ...ctx, spread: false, needs: false, ceiling: Infinity }).length > 0;
}

function pickWithFlesh(body: Body, m: Mutation, rng: Rng, ctx: MutationContext): { target: Target | null; displaced: Evicted } {
  let list = mutationTargets(body, m, ctx);
  let displaced = nothing();
  if (list.length === 0 && ctx.source === "abyss") {
    displaced = makeRoom(body, m, ctx);
    if (anything(displaced)) list = mutationTargets(body, m, ctx);
  }
  return { target: drawWeighted(list, rng), displaced };
}

function settle(body: Body, meatBefore: number, massBefore: number, cap: number): number {
  // What the operation shed left the meat during apply (cut endings, evicted organs); what appeared is the mutation's own flesh.
  const shed = cap - body.meat;
  const grown = Math.max(0, mass(body) - massBefore + shed);
  body.meat = meatBefore - shed + grown;
  return grown;
}

/** A sprout or a branch aimed at a joint that has no room for it: the joint widens first (step I). */
function widensFirst(body: Body, m: Mutation, target: Target): number | null {
  if (m.op !== "sprout" && m.op !== "branch") return null;
  const node = "node" in target ? target.node : "ending" in target ? target.ending.node : null;
  if (node === null || body.nodes[node] === undefined) return null;
  const free = 2 * body.nodes[node]!.size - (adjacency(body).get(node)?.length ?? 0);
  return free < (m.op === "sprout" ? 1 : 2) && listed(body, "enlarge", {}, { node }) ? node : null;
}

function perform(body: Body, m: Mutation, target: Target): { acc: ApplyResult; steps: number; op: MutationOp; orphan: boolean } | null {
  const acc: ApplyResult = { created: [], removed: [], evicted: [] };
  if (m.op === "wings" || m.op === "twin" || m.op === "budding" || m.op === "amorphous" || m.op === "lose") {
    const steps = applyComposite(body, m, target, acc);
    return steps === null ? null : { acc, steps, op: m.op, orphan: false };
  }
  // An aimed row never lands on a bare node itself: a node target is the orphan's sprout, and only while the row has nothing of its own.
  const orphan = orphanSprout(m);
  if (orphan !== null && "node" in target && ownTargets(body, m).length === 0) {
    if (!listed(body, "sprout", orphan, target)) return null;
    step(body, "sprout", orphan, target, acc);
    return { acc, steps: 1, op: "sprout", orphan: true };
  }
  const joint = widensFirst(body, m, target);
  if (joint !== null) {
    const work = cloneBody(body);
    step(work, "enlarge", {}, { node: joint }, acc);
    if (!listed(work, m.op, m.payload as never, target)) return null;
    step(work, m.op, m.payload as never, target, acc);
    Object.assign(body, work);
    return { acc, steps: 2, op: m.op, orphan: false };
  }
  const r = apply(body, m.op, m.payload as never, target);
  return { acc: r, steps: 1, op: m.op, orphan: false };
}

/**
 * What the spread does once a mutation has landed (§11): a cover starts to
 * creep; a stretched segment, or the segment under a reborn ending, may turn
 * into a tentacle when one is next door. Without an rng (a chosen target)
 * only the cover moves. Returns the infected segment, or null.
 */
function afterLanding(body: Body, m: Mutation, target: Target, rng: Rng | null, ctx?: MutationContext): number | null {
  if (!spreadOn(ctx)) return null;
  if (m.op === "cover") {
    startCoverFront(body, m.payload.cover);
    return null;
  }
  if (rng === null) return null;
  let seg: number | null = null;
  if (m.op === "stretch" && "segment" in target) seg = target.segment;
  else if (m.op === "rebirth" && "ending" in target) seg = segmentUnder(body, target.ending.node);
  return seg !== null && infectKind(body, seg, rng, ctx) ? seg : null;
}

/**
 * Applies the mutation at a chosen target; the flesh rule applies. Throws when
 * the target is not one `mutationTargets` lists.
 */
export function applyMutationAt(body: Body, m: Mutation, target: Target, ctx: MutationContext = {}): MutationResult {
  const meatBefore = body.meat;
  const massBefore = mass(body);
  const cap = ceilingOf(body, ctx);
  body.meat = cap;
  const ok = mutationTargets(body, m, ctx).some((w) => JSON.stringify(w.target) === JSON.stringify(target));
  const done = ok ? perform(body, m, target) : null;
  if (done === null) {
    body.meat = meatBefore;
    throw new Error(`applyMutationAt ${m.id}: invalid target ${JSON.stringify(target)}`);
  }
  afterLanding(body, m, target, null, ctx);
  const grown = settle(body, meatBefore, massBefore, cap);
  return {
    mutation: m,
    op: done.op,
    target,
    fallback: false,
    grown,
    reserve: RESERVE_PER_MASS * grown,
    steps: done.steps,
    created: done.acc.created,
    removed: done.acc.removed,
    evicted: done.acc.evicted,
    displaced: [],
    shed: [],
    infected: null,
    orphan: done.orphan,
  };
}

/**
 * Picks a target by weight and applies the mutation. Meat is raised to the
 * skeleton's ceiling for the draw: a mutation brings its own flesh. At the
 * ceiling the abyss pushes out the weakest organ; with nowhere to land a
 * tumour grows; with no room even for that the mutation is lost (null).
 */
export function applyMutation(body: Body, m: Mutation, rng: Rng, ctx: MutationContext = {}): MutationResult | null {
  let meatBefore = body.meat;
  let massBefore = mass(body);
  const cap = ceilingOf(body, ctx);
  body.meat = cap;
  const { target, displaced } = pickWithFlesh(body, m, rng, ctx);
  // What was pushed out left with its mass: the body starts lighter, the mutation's own flesh is counted from there.
  meatBefore -= displaced.mass;
  massBefore -= displaced.mass;
  const capNow = body.meat;
  if (target !== null) {
    const done = perform(body, m, target);
    if (done !== null) {
      const infected = afterLanding(body, m, target, rng, ctx);
      const grown = settle(body, meatBefore, massBefore, capNow);
      return {
        mutation: m,
        op: done.op,
        target,
        fallback: false,
        grown,
        reserve: RESERVE_PER_MASS * grown,
        steps: done.steps,
        created: done.acc.created,
        removed: done.acc.removed,
        evicted: done.acc.evicted,
        displaced: displaced.organs,
        shed: displaced.segments,
        infected,
        orphan: done.orphan,
      };
    }
  }
  const tumour = drawWeighted(targets(body, "growth", {}, ctx), rng);
  if (tumour === null) {
    settle(body, meatBefore, massBefore, capNow);
    return null;
  }
  const r = apply(body, "growth", {}, tumour);
  const grown = settle(body, meatBefore, massBefore, capNow);
  return {
    mutation: m,
    op: "growth",
    target: tumour,
    fallback: true,
    grown,
    reserve: RESERVE_PER_MASS * grown,
    steps: 1,
    created: r.created,
    removed: r.removed,
    evicted: r.evicted,
    displaced: displaced.organs,
    shed: displaced.segments,
    infected: null,
    orphan: false,
  };
}

// ---------------------------------------------------------------- after a cut

export interface RegrowthAfterCut {
  /** Ids each hydra copy created, now. */
  doubled: number[][];
  /** Parts scheduled to grow back by flesh memory. */
  remembered: number;
}

function hasMemory(body: Body): boolean {
  for (const o of organs(body)) if (hasTag(o.kind, "memory")) return true;
  return false;
}

/**
 * The rules that read a cut: a segment marked `hydra` that left grows back
 * twice from the node it hung on; with a flesh memory in the body every part
 * that left grows back once in 200 turns. A part without the segment that
 * held it (only the far node was cut off) has nothing to grow from.
 */
export function regrowAfterCut(body: Body, cut: CutResult, ceiling = skeletonCeiling(body)): RegrowthAfterCut {
  const out: RegrowthAfterCut = { doubled: [], remembered: 0 };
  const memory = hasMemory(body);
  const nodeIdsLeft = new Set(cut.removed.nodes.map((n) => n.id));
  for (const { part } of cut.others) {
    const nodes = cut.removed.nodes.filter((n) => part.nodes.includes(n.id));
    const segments = cut.removed.segments.filter((s) => part.segments.includes(s.id));
    const bridge = segments.find((s) => !nodeIdsLeft.has(s.a) || !nodeIdsLeft.has(s.b));
    if (bridge === undefined) continue;
    const at = nodeIdsLeft.has(bridge.a) ? bridge.b : bridge.a;
    if (body.nodes[at] === undefined) continue;
    const snapshot = { nodes, segments, membranes: [] };
    if (bridge.growths.some((o) => o.kind === "hydra")) {
      out.doubled.push(...regrowNow(body, at, snapshot, 2, ceiling));
    } else if (memory) {
      regrowLater(body, at, snapshot, FLESH_MEMORY_TURNS);
      out.remembered += 1;
    }
  }
  return out;
}

// ---------------------------------------------------------------- drawing

export interface DrawOptions extends SpreadContext {
  family?: Family;
  /** True: only defects; false: no defects; absent: any. */
  defect?: boolean;
  /** The body the draw is for: its theme pulls the rows (§11) unless the spread is off. Absent: `chance` alone. */
  body?: Body;
  /** The plan decays (step I): rows of `PLAN_OPS` weigh x (1 + load / 10) with the body's `mutationLoad`. The abyss, the tumour and the meat; never the spring or the graft. */
  decay?: boolean;
  /** False turns the needs of the body off (step J). Absent means on when a body is given. */
  needs?: boolean;
  /** The source heals (the spring, the graft): the needs pull x 1.5 harder (step J). */
  heal?: boolean;
}

/** How much the needs of the body move a row in the draw (step J): the product over the needs it serves; 1 with no body or the needs off. */
export function needDrawFactor(m: Mutation, opts: DrawOptions = {}): number {
  if (opts.body === undefined || opts.needs === false) return 1;
  let f = 1;
  for (const n of needDrawFactors(opts.body, m, opts.heal === true)) f *= n.draw;
  return f;
}

/** The weight of every row of the list in a draw: `chance`, times the theme of the body (§11) with the spread on, times the decay of the plan when asked, times the needs of the body (step J), times what it ate (diet.ts). */
export function drawWeights(list: readonly Mutation[], opts: DrawOptions = {}): number[] {
  let weights = opts.body !== undefined && spreadOn(opts) ? themeWeights(opts.body, list, opts).map((t) => t.weight) : list.map((m) => m.chance);
  if (opts.body !== undefined && opts.needs !== false) weights = weights.map((w, i) => w * needDrawFactor(list[i]!, opts));
  // What the body ate pulls the rows that grow it (decision 1253).
  if (opts.body?.eaten !== undefined) weights = weights.map((w, i) => w * dietFactor(opts.body!, list[i]!));
  if (opts.decay !== true || opts.body === undefined) return weights;
  const factor = 1 + mutationLoad(opts.body) / DECAY_PER;
  return weights.map((w, i) => (PLAN_OPS.has(list[i]!.op) ? w * factor : w));
}

/** A weighted draw by `drawWeights` among the rows that fit; one rng call, null for none. */
export function drawMutation(catalog: readonly Mutation[], rng: Rng, opts: DrawOptions = {}): Mutation | null {
  const list = catalog.filter((m) => {
    if (opts.family !== undefined && m.family !== opts.family) return false;
    if (opts.defect !== undefined && m.tags.includes("defect") !== opts.defect) return false;
    return true;
  });
  if (list.length === 0) return null;
  const weights = drawWeights(list, opts);
  let total = 0;
  for (const w of weights) {
    if (!Number.isFinite(w) || w < 0) throw new RangeError("invalid mutation weight");
    total += w;
  }
  if (!Number.isFinite(total)) throw new RangeError("mutation weight overflow");
  if (total === 0) return null;
  let r = rng.next() * total;
  for (let i = 0; i < list.length; i++) {
    r -= weights[i]!;
    if (r < 0) return list[i]!;
  }
  for (let i = weights.length - 1; i >= 0; i--) if (weights[i]! > 0) return list[i]!;
  return null;
}

/** Whether the mutation's payload names only kinds the tables know; the catalog check reads it. */
export function payloadProblems(m: Mutation): string[] {
  const problems: string[] = [];
  const organOk = (o: Organ | null | undefined, mount: "end" | "cavity" | "head" | "growth", what: string): void => {
    if (o === null || o === undefined) return;
    const spec = ORGANS[o.kind] as (typeof ORGANS)[OrganKind] | undefined;
    if (spec === undefined) problems.push(`${m.id}: ${what} names unknown organ ${String(o.kind)}`);
    else if (!spec.mounts.includes(mount)) problems.push(`${m.id}: ${what} ${o.kind} cannot mount as ${mount}`);
    for (const c of o.contents ?? []) organOk(c, "head", `${what} contents`);
  };
  const limbOk = (p: { kind: SegmentKind; cover: CoverId; length: number; girth: number }): void => {
    if (!(p.kind in SEGMENT_KINDS)) problems.push(`${m.id}: unknown segment kind ${String(p.kind)}`);
    if (!(p.cover in COVERS)) problems.push(`${m.id}: unknown cover ${String(p.cover)}`);
    if (!(p.length >= 1 && p.length <= 6 && p.girth >= 1 && p.girth <= 4)) problems.push(`${m.id}: limb ${p.length}/${p.girth} out of range`);
  };
  switch (m.op) {
    case "sprout":
      limbOk(m.payload);
      organOk(m.payload.ending, "end", "ending");
      for (const g of m.payload.growths ?? []) organOk(g, "growth", "growth");
      break;
    case "branch":
      limbOk(m.payload);
      break;
    case "joint":
      organOk(m.payload.ending, "end", "ending");
      break;
    case "rebirth":
      organOk(m.payload.ending, "end", "ending");
      break;
    case "organ":
      organOk(m.payload.organ, m.payload.mount, "organ");
      break;
    case "resize":
      // A step of a kind that has no steps would never find a place (decision 164).
      if (!isSizedKind(m.payload.kind)) problems.push(`${m.id}: ${m.payload.kind} has no size steps`);
      if (!ORGAN_SIZES.includes(m.payload.size)) problems.push(`${m.id}: unknown size ${String(m.payload.size)}`);
      break;
    case "cover":
      if (!(m.payload.cover in COVERS)) problems.push(`${m.id}: unknown cover ${String(m.payload.cover)}`);
      break;
    case "membrane":
    case "wings":
      if (!(m.payload.kind in MEMBRANES)) problems.push(`${m.id}: unknown membrane ${String(m.payload.kind)}`);
      break;
    case "lose":
      if (m.payload.kinds.length === 0) problems.push(`${m.id}: loses nothing`);
      for (const k of m.payload.kinds) if (!(k in ORGANS) || !ORGANS[k].mounts.includes("head")) problems.push(`${m.id}: ${String(k)} is no organ of a head`);
      break;
    case "twin":
    case "budding":
      organOk({ kind: m.payload.brain, instability: 0 }, m.op === "twin" ? "head" : "cavity", "brain");
      if (!hasTag(m.payload.brain, "brain")) problems.push(`${m.id}: ${m.payload.brain} does not think`);
      break;
    case "stretch":
      if (m.payload.delta !== 1 && m.payload.delta !== -1) problems.push(`${m.id}: stretch by ${m.payload.delta}`);
      break;
    default:
      break;
  }
  for (const k of m.target.kinds ?? []) if (!(k in SEGMENT_KINDS)) problems.push(`${m.id}: target rule names unknown segment kind ${String(k)}`);
  for (const e of m.target.endings ?? []) if (!(e in ORGANS)) problems.push(`${m.id}: target rule names unknown organ ${String(e)}`);
  return problems;
}
