import { describe, expect, it } from "vitest";
import { LabRng as Rng } from "../rng.js";
import {
  CEILING_PER_FLESH,
  UPKEEP_PER_FLESH,
  carriedFlesh,
  DECAY_PER,
  ENDING_AFFINITY,
  FORK_AT_JOINT,
  HUMAN_IDS,
  LIMITS,
  ORGANS,
  PLAN_OPS,
  SKELETON_CEILING,
  addMembrane,
  apply,
  applyMutation,
  applyMutationAt,
  bodyFromText,
  bodyHash,
  bodyToText,
  capacity,
  cavityLoad,
  closure,
  components,
  drawMutation,
  drawWeights,
  fleshBeyondHuman,
  forks,
  grow,
  hasTag,
  hearts,
  human,
  humanoid,
  humanoidParts,
  longestChain,
  mass,
  mutationLoad,
  mutationTargets,
  nodeIds,
  organ,
  organs,
  planTargets,
  refreshNodeHp,
  segmentIds,
  segmentsAt,
  selfBrain,
  selfRef,
  setSelf,
  skeletonCeiling,
  sortedIds,
  swampMutant,
  targets,
  upkeep,
  validate,
  type Body,
  type Mutation,
  type MutationContext,
  type Op,
  type Target,
} from "../index.js";
import { layout, silhouetteSvg } from "@mutant-engine/view";
import { MUTATIONS } from "../index.js";
import { SOURCES } from "../index.js";

const { head, chest, pelvis, handL, handR, neck, torso, armL, armR, legL, shoulderL, shoulderR, hipL, hipR, elbowL, forearmL } = HUMAN_IDS;
const ARM = { kind: "arm", length: 2, girth: 1, cover: "skin", ending: organ("hand") } as const;

function byId(id: string): Mutation {
  const m = MUTATIONS.find((x) => x.id === id);
  if (m === undefined) throw new Error(`no mutation ${id} in the catalog`);
  return m;
}

/**
 * The human's chest and pelvis are small nodes, full with the neck, the torso
 * and the penis (decision 118): nothing grows there. Tests of what happens at
 * the torso's own ends widen them back to the old size 3.
 */
function widen(b: Body, ...nodes: number[]): Body {
  for (const id of nodes) {
    b.nodes[id]!.size = 3;
    refreshNodeHp(b.nodes[id]!);
  }
  return b;
}

/** The segment grown last. */
function last(b: Body): number {
  return segmentIds(b)[segmentIds(b).length - 1]!;
}

function breathing(b: Body): number {
  let n = 0;
  for (const o of organs(b)) if (ORGANS[o.kind].breath !== undefined) n += 1;
  return n;
}

function segTarget(id: number): Target {
  return { segment: id };
}

function lists(b: Body, op: Op, target: Target): boolean {
  return targets(b, op, {} as never).some((w) => JSON.stringify(w.target) === JSON.stringify(target));
}

/** Mass and meat agree after every operation: the model's bookkeeping of flesh. */
function sound(b: Body, where = ""): void {
  expect(validate(b), where).toEqual([]);
  expect(components(b), where).toHaveLength(1);
}

/** The abyss of the first layer as the lab reads it: a defect in 15 % of the strikes, the plan decays with the load. */
function strike(b: Body, rng: Rng, ctx: MutationContext = {}): ReturnType<typeof applyMutation> {
  const defect = rng.next() < 0.15;
  const m = drawMutation(MUTATIONS, rng, { body: b, defect, decay: true })!;
  return applyMutation(b, m, rng, { ...ctx, source: "abyss" });
}

/** The spring: no defects, no parasites, no decay of the plan. */
function spring(b: Body, rng: Rng): ReturnType<typeof applyMutation> {
  const rows = MUTATIONS.filter((m) => m.family !== "defects" && m.family !== "parasites");
  const m = drawMutation(rows, rng, { body: b, defect: false })!;
  return applyMutation(b, m, rng, {});
}

function median(values: number[]): number {
  const s = [...values].sort((x, y) => x - y);
  return s.length % 2 === 1 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
}

function torsos(b: Body): number[] {
  return segmentIds(b).filter((id) => b.segments[id]!.kind === "torso");
}

function maxGirth(b: Body): number {
  let g = 0;
  for (const id of torsos(b)) g = Math.max(g, b.segments[id]!.girth);
  return g;
}

/** A head sitting directly on an end of a torso: no neck under it. */
function sunkHeads(b: Body): number {
  const torsoEnds = new Set<number>();
  for (const id of torsos(b)) torsoEnds.add(b.segments[id]!.a).add(b.segments[id]!.b);
  let n = 0;
  for (const id of nodeIds(b)) if (torsoEnds.has(id)) for (const e of b.nodes[id]!.ends) if (e.kind === "head") n += 1;
  return n;
}

const NEW_OPS: readonly Op[] = ["bloat", "engulf", "sink", "split", "merge", "flesh", "shift"];

/** A human grown by the operations of step I mixed with a few of A, for property tests. */
function grownByPlan(seed: number, steps: number): Body {
  const rng = new Rng(`i-plan-${seed}`);
  const b = human(100_000);
  for (let i = 0; i < steps; i++) {
    const roll = rng.next();
    if (roll < 0.3) {
      grow(b, "sprout", { ...ARM, kind: rng.pick(["arm", "leg", "tentacle", "tail"] as const), length: rng.int(1, 3) }, rng);
    } else if (roll < 0.4) grow(b, "growth", {}, rng);
    else if (roll < 0.45) grow(b, "sprout", { kind: "neck", length: 1, girth: 1, cover: "skin", ending: organ("head", [organ("smallBrain"), organ("eye")]) }, rng);
    else if (roll < 0.5) grow(b, "thicken", {}, rng);
    else if (roll < 0.55) grow(b, "membrane", { kind: "wing" }, rng);
    else if (roll < 0.6) grow(b, "fusion", {}, rng);
    else grow(b, rng.pick(NEW_OPS), {} as never, rng);
  }
  return b;
}

// ---------------------------------------------------------------- the operations

describe("BLOAT: the torso swells", () => {
  it("girth +1 up to 6, then length +1 up to 6; the cavity grows; the skin cracks into a wound", () => {
    const b = human(1000);
    const t = b.segments[torso]!;
    expect(lists(b, "bloat", segTarget(torso))).toBe(true);
    expect(lists(b, "bloat", segTarget(armL))).toBe(false);
    const m0 = mass(b);
    apply(b, "bloat", {}, segTarget(torso));
    expect(t.girth).toBe(4);
    expect(t.length).toBe(2);
    expect(t.wound).toBe(20);
    expect(capacity(t)).toBe(40);
    // Hp goes by section like the flesh (decision 1283): 4 x 2 x 4² / 3, rounded, plus 4.
    expect(t.hpMax).toBe(Math.round((4 * 2 * 16) / 3) + 4);
    // Flesh goes by section (decision 1260): girth 3 to 4 at length 2 is 6.5 x 2 x (16 - 9) / 3.
    expect(mass(b) - m0).toBeCloseTo((6.5 * 2 * 7) / 3, 9);
    sound(b);
    for (let i = 0; i < 2; i++) apply(b, "bloat", {}, segTarget(torso));
    expect(t.girth).toBe(6);
    expect(t.length).toBe(2);
    // At girth 6 the length grows instead.
    apply(b, "bloat", {}, segTarget(torso));
    expect(t.girth).toBe(6);
    expect(t.length).toBe(3);
    for (let i = 0; i < 3; i++) apply(b, "bloat", {}, segTarget(torso));
    expect(t.length).toBe(6);
    expect(lists(b, "bloat", segTarget(torso))).toBe(false);
    sound(b);
    expect(bodyFromText(bodyToText(b)).segments[torso]!.girth).toBe(6);
  });

  it("bloated flesh eats at the human's rate on the flesh past his section, and holds more skeleton (decision 1260)", () => {
    const b = human(1000);
    expect(upkeep(b)).toBe(20);
    expect(skeletonCeiling(b)).toBe(SKELETON_CEILING);
    expect(fleshBeyondHuman(b)).toBe(0);
    apply(b, "bloat", {}, segTarget(torso));
    // Girth 4 at length 2: 6.5 x 2 x (16 - 9) / 3 of flesh past the human's section.
    const past4 = (6.5 * 2 * 7) / 3;
    expect(upkeep(b)).toBeCloseTo(20 + UPKEEP_PER_FLESH * past4, 9);
    expect(fleshBeyondHuman(b)).toBe(1);
    expect(carriedFlesh(b)).toBeCloseTo(past4, 9);
    expect(skeletonCeiling(b)).toBeCloseTo(SKELETON_CEILING + CEILING_PER_FLESH * past4, 9);
    apply(b, "bloat", {}, segTarget(torso));
    const past5 = (6.5 * 2 * 16) / 3;
    expect(upkeep(b)).toBeCloseTo(20 + UPKEEP_PER_FLESH * past5, 9);
    expect(skeletonCeiling(b)).toBeCloseTo(SKELETON_CEILING + CEILING_PER_FLESH * past5, 9);
    // The swamp mutant carries two torsos of girth 3 and 2: their flesh past the human's one torso holds skeleton.
    const swamp = swampMutant();
    expect(carriedFlesh(swamp)).toBeGreaterThan(0);
    expect(skeletonCeiling(swamp)).toBeCloseTo(SKELETON_CEILING + CEILING_PER_FLESH * carriedFlesh(swamp), 9);
    // A chrome torso does not swell.
    const c = human(1000);
    c.segments[torso]!.cover = "chrome";
    expect(lists(c, "bloat", segTarget(torso))).toBe(false);
  });

  it("the ceiling grows with the flesh: a mutation lands on a bloated body where the human's ceiling would refuse it", () => {
    // A skeleton exactly at the mass: the human has no room for a gland of 4, nor for a tumour, and the mutation is lost...
    const h = human();
    expect(applyMutation(h, byId("venomGland"), new Rng(1), { ceiling: mass(h) })).toBeNull();
    // ...the bloated body holds more, and the gland lands.
    const b = human(1000);
    apply(b, "bloat", {}, segTarget(torso));
    b.meat = mass(b);
    const before = mass(b);
    const r = applyMutation(b, byId("venomGland"), new Rng(1), { ceiling: before })!;
    expect(r.fallback).toBe(false);
    expect(mass(b)).toBe(before + 4);
    expect(mass(b)).toBeLessThanOrEqual(skeletonCeiling(b, before));
    expect(b.meat).toBe(mass(b));
  });
});

describe("ENGULF: a hanging limb sinks into the torso", () => {
  // The human's arms and legs bend: an upper arm ends at an elbow that carries the forearm, so no limb of the
  // human hangs. A straight arm grown on the left shoulder, a side node of the torso, is the limb that sinks.
  it("the limb and its node go, the torso's girth grows, the ending sits on the torso's node", () => {
    const b = human(1000);
    apply(b, "sprout", ARM, { node: shoulderL });
    const arm = last(b);
    const hand = b.segments[arm]!.b;
    const m0 = mass(b);
    const meat0 = b.meat;
    expect(lists(b, "engulf", segTarget(arm))).toBe(true);
    expect(lists(b, "engulf", segTarget(armL))).toBe(false);
    expect(lists(b, "engulf", segTarget(forearmL))).toBe(false);
    expect(lists(b, "engulf", segTarget(legL))).toBe(false);
    expect(lists(b, "engulf", segTarget(neck))).toBe(false);
    expect(lists(b, "engulf", segTarget(torso))).toBe(false);
    const r = apply(b, "engulf", {}, segTarget(arm));
    expect(b.segments[arm]).toBeUndefined();
    expect(b.nodes[hand]).toBeUndefined();
    expect(r.removed).toEqual([hand, arm]);
    expect(b.segments[torso]!.girth).toBe(4);
    // The arm hung from the shoulder, a side node of the torso: the hand sits there now.
    expect(b.nodes[shoulderL]!.ends.map((o) => o.kind)).toEqual(["hand"]);
    // An arm of 6 left, a girth came - by section (decision 1260) 6.5 x 2 x (16 - 9) / 3: the flesh grew by that less 6.
    expect(mass(b) - m0).toBeCloseTo((6.5 * 2 * 7) / 3 - 6, 9);
    expect(b.meat).toBe(meat0 - 6);
    sound(b);
    // A limb whose far node carries more than the limb is not hanging.
    const c = human(1000);
    apply(c, "sprout", ARM, { node: shoulderL });
    const armC = last(c);
    expect(lists(c, "engulf", segTarget(armC))).toBe(true);
    apply(c, "sprout", ARM, { node: c.segments[armC]!.b });
    expect(lists(c, "engulf", segTarget(armC))).toBe(false);
  });

  it("growths of the limb move to the torso, a mark never twice; the node must have room for the ending", () => {
    const b = human(1000);
    apply(b, "sprout", ARM, { node: shoulderL });
    const arm = last(b);
    b.segments[arm]!.growths.push(organ("hydra"), organ("pores"));
    b.segments[torso]!.growths.push(organ("hydra"));
    apply(b, "engulf", {}, segTarget(arm));
    expect(b.segments[torso]!.growths.map((o) => o.kind)).toEqual(["hydra", "pores"]);
    expect(breathing(b)).toBe(2);
    sound(b);
    // The hip of size 2 full of endings has no room for a foot: the leg stays.
    const c = human(1000);
    apply(c, "sprout", { ...ARM, kind: "leg", ending: organ("foot") }, { node: hipL });
    const leg = last(c);
    expect(lists(c, "engulf", segTarget(leg))).toBe(true);
    c.nodes[hipL]!.ends.push(organ("eye"), organ("eye"));
    expect(lists(c, "engulf", segTarget(leg))).toBe(false);
    // A limb without an ending needs no room.
    apply(c, "sprout", { kind: "tail", length: 2, girth: 1, cover: "skin", ending: null }, { node: hipR });
    const tail = last(c);
    expect(lists(c, "engulf", segTarget(tail))).toBe(true);
    apply(c, "engulf", {}, segTarget(tail));
    sound(c);
    // At girth 6 the torso swallows nothing more.
    const d = human(1000);
    apply(d, "sprout", ARM, { node: shoulderL });
    const armD = last(d);
    expect(lists(d, "engulf", segTarget(armD))).toBe(true);
    d.segments[torso]!.girth = 6;
    expect(lists(d, "engulf", segTarget(armD))).toBe(false);
  });

  it("a tumour at a torso node is swallowed too; a limb at a node without a torso is not", () => {
    // The chest is full: the tumour grows on the shoulder, a node of the torso all the same.
    const b = human(1000);
    apply(b, "growth", {}, { node: shoulderL });
    const g = last(b);
    expect(lists(b, "engulf", segTarget(g))).toBe(true);
    apply(b, "engulf", {}, segTarget(g));
    expect(b.segments[g]).toBeUndefined();
    sound(b);
    apply(b, "sprout", ARM, { node: handR });
    const far = last(b);
    expect(lists(b, "engulf", segTarget(far))).toBe(false);
  });
});

describe("SINK: the head grows into the torso", () => {
  it("the neck shortens; at length 1 the head's node merges into the torso's and self follows the brain", () => {
    const b = human(1000);
    b.segments[neck]!.length = 2;
    expect(lists(b, "sink", segTarget(neck))).toBe(true);
    expect(lists(b, "sink", segTarget(torso))).toBe(false);
    expect(lists(b, "sink", segTarget(armL))).toBe(false);
    apply(b, "sink", {}, segTarget(neck));
    expect(b.segments[neck]!.length).toBe(1);
    expect(b.nodes[head]).toBeDefined();
    sound(b);
    const m0 = mass(b);
    const r = apply(b, "sink", {}, segTarget(neck));
    expect(b.segments[neck]).toBeUndefined();
    expect(b.nodes[head]).toBeUndefined();
    expect(r.removed).toEqual([head, neck]);
    expect(b.nodes[chest]!.ends.map((o) => o.kind)).toEqual(["head"]);
    expect(b.self).toEqual({ node: chest });
    expect(selfRef(b)).toEqual({ node: chest, end: 0 });
    expect(selfBrain(b)?.kind).toBe("brain");
    // The neck's flesh left: 3 of mass.
    expect(m0 - mass(b)).toBe(3);
    expect(b.meat).toBe(1000 - 3);
    expect(lists(b, "sink", segTarget(torso))).toBe(false);
    sound(b);
    expect(humanoid(b)).toBeLessThan(1);
  });

  it("what the sunken segment held inside goes with it, and the one you live in never sinks (decision 165)", () => {
    // A limb holds one organ since side nodes: lungs in a forearm, a head at its tip.
    const b = human(1000);
    apply(b, "organ", { organ: organ("lungs"), mount: "cavity" }, { segment: forearmL });
    apply(b, "rebirth", { ending: organ("head", [organ("smallBrain")]) }, { ending: { node: handL, index: 0 } });
    expect(b.segments[forearmL]!.cavity.map((o) => o.kind)).toEqual(["lungs"]);
    const before = mass(b);
    expect(lists(b, "sink", segTarget(forearmL))).toBe(true);
    const r = apply(b, "sink", {}, segTarget(forearmL));
    expect(b.segments[forearmL]).toBeUndefined();
    // The lungs are still in the body - in the segment that carried the forearm - and only the forearm's flesh left the meat.
    // Two pairs now: the human's own in the torso and the forearm's, which moved instead of vanishing.
    expect([...organs(b)].filter((o) => o.kind === "lungs")).toHaveLength(2);
    expect(b.segments[armL]!.cavity.map((o) => o.kind)).toEqual(["lungs"]);
    expect(r.evicted).toEqual([]);
    expect(before - mass(b)).toBe(3);
    expect(b.meat).toBe(1000 - 3);
    sound(b);
    // Your own brain is not swallowed by a sink: the segment goes for good, so a segment you live in is no target.
    const mine = human(1000);
    apply(mine, "sprout", { kind: "arm", length: 1, girth: 2, cover: "skin", ending: organ("hand") }, { node: shoulderR });
    const arm = last(mine);
    const tip = mine.segments[arm]!.b;
    apply(mine, "organ", { organ: organ("ganglion"), mount: "cavity" }, { segment: arm });
    setSelf(mine, { segment: arm, slot: 0 });
    apply(mine, "rebirth", { ending: organ("head", [organ("smallBrain")]) }, { ending: { node: tip, index: 0 } });
    expect(selfBrain(mine)?.kind).toBe("ganglion");
    expect(lists(mine, "sink", segTarget(arm))).toBe(false);
    sound(mine);
  });

  it("self keeps its index when other endings sit before the head; segments and growths of the neck move over", () => {
    const b = bodyFromText(`
      1[3] {глаз, голова(мозг*), кисть}
      2[3]
      3[3]
      4[1] {глаз}
      1 -шея:1/1 кожа [жаберная гроздь]- 2
      2 -корпус:2/3 кожа {сердце, лёгкие}- 3
      1 -стебель:1/1 кожа- 4
    `);
    b.meat = mass(b);
    expect(selfRef(b)).toEqual({ node: 1, end: 1 });
    expect(breathing(b)).toBe(2);
    apply(b, "sink", {}, segTarget(5));
    expect(b.nodes[1]).toBeUndefined();
    expect(b.nodes[2]!.ends.map((o) => o.kind)).toEqual(["eye", "head", "hand"]);
    expect(selfRef(b)).toEqual({ node: 2, end: 1 });
    expect(b.segments[7]!.a).toBe(2);
    expect(b.segments[6]!.growths.map((o) => o.kind)).toEqual(["gillCluster"]);
    expect(breathing(b)).toBe(2);
    sound(b);
    // No room for three endings in a node of size 2: not a candidate.
    const c = bodyFromText(`
      1[3] {глаз, голова(мозг*), кисть}
      2[2]
      3[3]
      1 -шея:1/1 кожа- 2
      2 -корпус:2/3 кожа {сердце, лёгкие}- 3
    `);
    c.meat = mass(c);
    expect(lists(c, "sink", segTarget(4))).toBe(false);
  });

  it("a membrane whose cycle runs through the neck keeps to the shorter cycle or tears", () => {
    // Head node 1 - neck - chest 2; two stalks 1-4 and 2-4 close a triangle with the neck.
    const b = bodyFromText(`
      1[3] {голова(мозг*)}
      2[3]
      3[3]
      4[2]
      5[1]
      1 -шея:1/1 кожа- 2
      2 -корпус:2/3 кожа {сердце, лёгкие}- 3
      1 -стебель:1/1 кожа- 4
      2 -стебель:1/1 кожа- 4
      4 -стебель:1/1 кожа- 5
      1 -стебель:2/1 кожа- 5
    `);
    b.meat = mass(b);
    // Triangle neck-8-9 (3 segments) tears when the neck goes; the square neck-11-10-9 becomes the triangle 11-10-9.
    addMembrane(b, [6, 8, 9], "hood");
    const sq = addMembrane(b, [6, 11, 10, 9], "wing");
    apply(b, "sink", {}, segTarget(6));
    expect(sortedIds(b.membranes)).toEqual([sq]);
    expect(b.membranes[sq]!.cycle.length).toBe(3);
    sound(b);
  });
});

describe("SPLIT: the torso divides into two parallel ones", () => {
  it("two torsos between the same nodes, girth shared, the cavity divided, the flesh by section, a cycle appears", () => {
    // The twin needs a free place at both ends: the human's full chest and pelvis give none, the widened ones do.
    expect(lists(human(1000), "split", segTarget(torso))).toBe(false);
    const b = widen(human(1000), chest, pelvis);
    expect(lists(b, "split", segTarget(torso))).toBe(true);
    expect(lists(b, "split", segTarget(armL))).toBe(false);
    const m0 = mass(b);
    const r = apply(b, "split", {}, segTarget(torso));
    const twin = r.created[0]!;
    const t = b.segments[torso]!;
    const u = b.segments[twin]!;
    expect(t.girth).toBe(2);
    expect(u.girth).toBe(1);
    expect(u.kind).toBe("torso");
    expect(u.length).toBe(2);
    expect([u.a, u.b].sort()).toEqual([chest, pelvis]);
    expect(u.breakPlane).toBe(false);
    expect(t.cavity.map((o) => o.kind)).toEqual(["heart", "lungs", "stomach"]);
    expect(u.cavity).toEqual([]);
    // Flesh goes by section (decision 1260): girths 2 and 1 of a 3 keep 4 + 1 of its 9 ninths.
    expect(mass(b)).toBeCloseTo(m0 - (6.5 * 2 * 4) / 3, 9);
    expect(closure(b)).toBe(1);
    expect(r.evicted).toEqual([]);
    sound(b);
    // A torso of girth 1 does not divide; at the limit of cycles nothing divides.
    expect(lists(b, "split", segTarget(twin))).toBe(false);
    expect(lists(b, "split", segTarget(torso))).toBe(true);
  });

  it("organs that no longer fit move to the twin, vital ones first; your brain in the cavity stays and self follows", () => {
    const b = bodyFromText(`
      1[3]
      2[3]
      1 -корпус:2/4 кожа {желудок, обжора, мозг в брюхе*, сердце, лёгкие}- 2
    `);
    // Two halves 2/2 carry less skeleton than the 2/4 (decision 1260): the division needs the room the ceiling gives.
    b.meat = skeletonCeiling(b);
    expect(cavityLoad(b.segments[3]!)).toBe(4 + 12 + 8 + 4 + 4);
    expect(selfRef(b)).toEqual({ segment: 3, slot: 2 });
    const r = apply(b, "split", {}, segTarget(3));
    const twin = r.created[0]!;
    const t = b.segments[3]!;
    const u = b.segments[twin]!;
    expect(t.girth).toBe(2);
    expect(u.girth).toBe(2);
    // The original keeps capacity 20: the gut brain 8, the heart 4 and the lungs 4 first, then the stomach 4; the glutton goes to the twin.
    expect(t.cavity.map((o) => o.kind)).toEqual(["gutBrain", "heart", "lungs", "stomach"]);
    expect(u.cavity.map((o) => o.kind)).toEqual(["glutton"]);
    expect(cavityLoad(u)).toBeLessThanOrEqual(capacity(u));
    expect(selfRef(b)).toEqual({ segment: 3, slot: 0 });
    expect(selfBrain(b)?.kind).toBe("gutBrain");
    expect(r.evicted).toEqual([]);
    expect(hearts(b)).toHaveLength(1);
    sound(b);
  });

  it("what fits nowhere is pushed out, never a vital organ: a torso whose division would lose one does not divide", () => {
    const b = bodyFromText(`
      1[3] {голова(мозг*)}
      2[3]
      1 -корпус:2/2 кожа {сердце, лёгкие, обжора}- 2
    `);
    b.meat = mass(b);
    // Capacity 20 splits into 10 + 10: the heart and the lungs keep, the glutton of 12 fits nowhere.
    const r = apply(b, "split", {}, segTarget(3));
    expect(r.evicted.map((o) => o.kind)).toEqual(["glutton"]);
    expect(hearts(b)).toHaveLength(1);
    expect(breathing(b)).toBe(1);
    expect(b.meat).toBeCloseTo(mass(b), 9);
    sound(b);
    // A gut brain of 8 in a torso of capacity 10: neither half of 5 holds it, so the torso is no place to divide.
    const c = bodyFromText(`
      1[3]
      2[3]
      1 -корпус:1/2 кожа {мозг в брюхе*}- 2
    `);
    c.meat = mass(c);
    expect(lists(c, "split", segTarget(3))).toBe(false);
    // With a torso of capacity 20 the halves of 10 hold the brain: it divides.
    c.segments[3]!.girth = 4;
    c.meat = mass(c);
    expect(lists(c, "split", segTarget(3))).toBe(true);
  });
});

describe("MERGE: two torsos at one node become one", () => {
  /**
   * An arm sprouted at the chest itself and thickened into a torso: the second torso at the chest. The chest
   * and the pelvis are widened to size 3: the small full ones take no sprout, and the merged node's neck and
   * shoulders need a place at the pelvis.
   */
  function chestTorso(b: Body): number {
    widen(b, chest, pelvis);
    apply(b, "sprout", ARM, { node: chest });
    const id = segmentIds(b)[segmentIds(b).length - 1]!;
    apply(b, "thicken", {}, segTarget(id));
    expect(b.segments[id]!.kind).toBe("torso");
    return id;
  }

  it("lengths add, the larger girth wins, cavities join, the node between goes and its limbs move to the far end", () => {
    // The human's arms hang from side nodes; a second torso has to meet the first at the chest itself.
    const b = human(1000);
    const armC = chestTorso(b);
    b.segments[armC]!.cavity.push(organ("gland"));
    expect(lists(b, "merge", { node: chest })).toBe(true);
    expect(lists(b, "merge", { node: pelvis })).toBe(false);
    const m0 = mass(b);
    const handC = b.segments[armC]!.b;
    const r = apply(b, "merge", {}, { node: chest });
    expect(b.nodes[chest]).toBeUndefined();
    expect(b.segments[armC]).toBeUndefined();
    expect(r.removed).toEqual([chest, armC]);
    const t = b.segments[torso]!;
    expect(t.length).toBe(4);
    expect(t.girth).toBe(3);
    expect([t.a, t.b].sort((x, y) => x - y)).toEqual([pelvis, handC]);
    expect(t.cavity.map((o) => o.kind)).toEqual(["heart", "lungs", "stomach", "gland"]);
    // The neck with the head and both shoulders (the arms on them) now hang from the pelvis.
    expect(b.segments[neck]!.b).toBe(pelvis);
    expect(b.segments[armR]!.a).toBe(HUMAN_IDS.shoulderR);
    expect(b.segments[HUMAN_IDS.flankShoulderL]!.a).toBe(pelvis);
    expect(b.segments[HUMAN_IDS.flankShoulderR]!.a).toBe(pelvis);
    expect(segmentsAt(b, pelvis)).toEqual([neck, torso, HUMAN_IDS.flankShoulderL, HUMAN_IDS.flankShoulderR, HUMAN_IDS.flankHipL, HUMAN_IDS.flankHipR, HUMAN_IDS.penis]);
    // 4 x 3 x 6.5 = 78 against 39 + a torso 2/2 of 6.5 x 2 x 4 / 3 by section (decision 1260).
    expect(mass(b) - m0).toBeCloseTo(78 - 39 - (6.5 * 2 * 4) / 3, 9);
    sound(b);
    // Both arms stay on their shoulders now, so the plan loses less than when the arm itself became the torso (< 0.7 then).
    expect(humanoid(b)).toBeLessThan(humanoid(human()));
  });

  it("limits: lengths over 6, a parallel pair, no room at either far node", () => {
    const b = human(1000);
    const armC = chestTorso(b);
    b.segments[armC]!.length = 5;
    expect(lists(b, "merge", { node: chest })).toBe(false);
    b.segments[armC]!.length = 2;
    expect(lists(b, "merge", { node: chest })).toBe(true);
    // A split torso: two torsos between the same nodes never merge into a loop.
    const c = widen(human(1000), chest, pelvis);
    apply(c, "split", {}, segTarget(torso));
    expect(lists(c, "merge", { node: chest })).toBe(false);
    expect(lists(c, "merge", { node: pelvis })).toBe(false);
    // Your brain in the cavity of the second torso follows into the merged one.
    const d = human(1000);
    const armD = chestTorso(d);
    d.segments[armD]!.cavity.push(organ("gutBrain"));
    d.self = { segment: armD };
    apply(d, "merge", {}, { node: chest });
    expect(selfRef(d)).toEqual({ segment: torso, slot: 3 });
    expect(selfBrain(d)?.kind).toBe("gutBrain");
    sound(d);
  });
});

describe("FLESH: a tumour on the torso grows into a torso and pulls the hanging parts to itself", () => {
  it("the growth becomes a torso of girth 2 with a cavity; its node forks; the limbs of the old node move over", () => {
    // The human's arms hang from the shoulders, not the chest: two more arms at the chest itself are the limbs that
    // move. The small full chest takes no sprout: it is widened to size 3.
    const b = widen(human(1000), chest);
    apply(b, "sprout", ARM, { node: chest });
    const arm1 = segmentIds(b)[segmentIds(b).length - 1]!;
    apply(b, "sprout", ARM, { node: chest });
    const arm2 = segmentIds(b)[segmentIds(b).length - 1]!;
    apply(b, "growth", {}, { node: chest });
    const g = segmentIds(b)[segmentIds(b).length - 1]!;
    const tip = b.segments[g]!.b;
    expect(lists(b, "flesh", segTarget(g))).toBe(true);
    expect(lists(b, "flesh", segTarget(armL))).toBe(false);
    const m0 = mass(b);
    apply(b, "flesh", {}, segTarget(g));
    const t = b.segments[g]!;
    expect(t.kind).toBe("torso");
    expect(t.girth).toBe(2);
    expect(capacity(t)).toBe(10);
    expect(b.nodes[tip]!.size).toBe(2);
    // Both arms hung from the chest: the new node holds three more segments, so both moved; the shoulders stay.
    expect(b.segments[arm1]!.a).toBe(tip);
    expect(b.segments[arm2]!.a).toBe(tip);
    expect(b.segments[armL]!.a).toBe(shoulderL);
    expect(segmentsAt(b, chest)).toEqual([neck, torso, HUMAN_IDS.flankShoulderL, HUMAN_IDS.flankShoulderR, g]);
    // A torso 1/2 by section (decision 1260) for a tumour of 4.
    expect(mass(b) - m0).toBeCloseTo((6.5 * 1 * 4) / 3 - 4, 9);
    sound(b);
    expect(torsos(b)).toHaveLength(2);
    expect(lists(b, "flesh", segTarget(g))).toBe(false);
    // A tumour hanging from a hand, not a torso node, does not grow into a torso.
    const c = human(1000);
    apply(c, "growth", {}, { node: handL });
    const far = segmentIds(c)[segmentIds(c).length - 1]!;
    expect(lists(c, "flesh", segTarget(far))).toBe(false);
  });
});

describe("SHIFT: a fork moves along the torso", () => {
  it("an arm of the chest re-roots at the pelvis; the far node needs a free place", () => {
    const b = human(1000);
    expect(lists(b, "shift", segTarget(armL))).toBe(true);
    expect(lists(b, "shift", segTarget(torso))).toBe(false);
    const m0 = mass(b);
    apply(b, "shift", {}, segTarget(armL));
    // The arm hangs from a side node: the shoulder travels with it, its flank now starts at the pelvis.
    expect(b.segments[HUMAN_IDS.flankShoulderL]!.a).toBe(pelvis);
    expect(b.segments[armL]!.a).toBe(shoulderL);
    expect(b.segments[armL]!.b).toBe(elbowL);
    expect(b.segments[forearmL]!.b).toBe(handL);
    expect(mass(b)).toBe(m0);
    sound(b);
    expect(humanoid(b)).toBeLessThan(1);
    // Legs from the chest, the neck from the pelvis: the head travels down the torso.
    apply(b, "shift", {}, segTarget(legL));
    expect(b.segments[HUMAN_IDS.flankHipL]!.a).toBe(chest);
    // The pelvis is small and full with the torso and the penis: the neck has no place there until it widens.
    expect(lists(b, "shift", segTarget(neck))).toBe(false);
    widen(b, pelvis);
    expect(lists(b, "shift", segTarget(neck))).toBe(true);
    apply(b, "shift", {}, segTarget(neck));
    expect(b.segments[neck]!.b).toBe(pelvis);
    expect(b.self).toEqual({ node: head });
    sound(b);
    // A full far node takes nothing: the pelvis widened to size 3 holds six segments (its flanks take no place there),
    // the torso, the penis and four arms. An arm at the widened chest itself cannot go; a shoulder can, its flank
    // needs no place; the leg goes to the chest.
    const c = widen(human(1000), chest, pelvis);
    apply(c, "sprout", ARM, { node: chest });
    const armC = segmentIds(c)[segmentIds(c).length - 1]!;
    for (let i = 0; i < 4; i++) apply(c, "sprout", ARM, { node: pelvis });
    expect(segmentsAt(c, pelvis).filter((id) => c.segments[id]!.kind !== "flank")).toHaveLength(6);
    expect(lists(c, "shift", segTarget(armC))).toBe(false);
    expect(lists(c, "shift", segTarget(armL))).toBe(true);
    expect(lists(c, "shift", segTarget(legL))).toBe(true);
  });

  it("a limb parallel to the torso never shifts onto itself; a membrane through the shifted limb tears or holds", () => {
    const b = widen(human(1000), chest, pelvis);
    apply(b, "sprout", { kind: "tentacle", length: 2, girth: 1, cover: "skin", ending: null }, { node: chest });
    const tent = segmentIds(b)[segmentIds(b).length - 1]!;
    const tipNode = b.segments[tent]!.b;
    apply(b, "fusion", {}, { pair: [pelvis, tipNode].sort((x, y) => x - y) as [number, number] });
    // The tentacle now runs chest-pelvis next to the torso: a parallel pair.
    const s = b.segments[tent]!;
    expect([s.a, s.b].sort()).toEqual([chest, pelvis]);
    expect(lists(b, "shift", segTarget(tent))).toBe(false);
    sound(b);
  });
});

// ---------------------------------------------------------------- the plan as a whole

describe("vitals survive the plan", () => {
  it("300 bodies grown by the new operations keep a heart, a brain, breath and one component; layout and silhouette hold", () => {
    let applied = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const b = grownByPlan(seed, 25);
      const where = `seed ${seed}\n${bodyToText(b)}`;
      expect(hearts(b).length, where).toBeGreaterThanOrEqual(1);
      expect(selfBrain(b), where).toBeDefined();
      expect(breathing(b), where).toBeGreaterThanOrEqual(1);
      sound(b, where);
      expect(() => silhouetteSvg(b, { layout: layout(b) }), where).not.toThrow();
      expect(() => layout(b, { scale: "sqrt" }), where).not.toThrow();
      for (const op of NEW_OPS) applied += targets(b, op, {} as never).length > 0 ? 1 : 0;
    }
    expect(applied).toBeGreaterThan(300);
  });

  it("every new operation on 200 random bodies: what it lists it applies, and the body stays sound after each", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const base = grownByPlan(seed, 15);
      for (const op of NEW_OPS) {
        const list = targets(base, op, {} as never);
        for (const w of list.slice(0, 3)) {
          const b = structuredClone(base);
          const hearts0 = hearts(b).length;
          const breath0 = breathing(b);
          apply(b, op, {} as never, w.target);
          const where = `seed ${seed} ${op} ${JSON.stringify(w.target)}\n${bodyToText(base)}`;
          sound(b, where);
          expect(hearts(b).length, where).toBeGreaterThanOrEqual(Math.min(1, hearts0));
          expect(breathing(b), where).toBeGreaterThanOrEqual(Math.min(1, breath0));
          expect(selfBrain(b), where).toBeDefined();
          // An operation never makes meat: what leaves is taken off, what grows is the mutation's own flesh (settled in mutation.ts).
          expect(b.meat, where).toBeLessThanOrEqual(base.meat + 1e-9);
        }
      }
    }
  });
});

describe("grotesque emerges", () => {
  // Full 200-seed run moved to packages/core/bench/grotesque.test.ts (D.2); this is a x10-smaller sample
  // of the same invariant.
  it("80 seeds x abyss of the first layer: the plan falls apart by 30 strikes, further by 60; by 100 it branches instead of chaining", () => {
    const seeds = 80;
    const at30: number[] = [];
    const at60: number[] = [];
    const chains100: number[] = [];
    const forks30: number[] = [];
    const forks100: number[] = [];
    let thick = 0;
    let twoOrSunk = 0;
    let landed = 0;
    let defects = 0;
    let onTorso = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const rng = new Rng(`i-grotesque-${seed}`);
      const b = human();
      for (let i = 0; i < 100; i++) {
        const torsoTargets = planTargets(b);
        const r = strike(b, rng);
        if (r !== null && !r.fallback) {
          landed += 1;
          if (r.mutation.tags.includes("defect")) defects += 1;
          if (torsoTargets(r.target)) onTorso += 1;
        }
        if (i === 29) {
          at30.push(humanoid(b));
          forks30.push(forks(b));
          if (maxGirth(b) >= 4) thick += 1;
          if (torsos(b).length >= 2 || sunkHeads(b) > 0) twoOrSunk += 1;
        }
        if (i === 59) at60.push(humanoid(b));
        if (i % 25 === 24) sound(b, `seed ${seed} strike ${i}\n${bodyToText(b)}`);
      }
      chains100.push(longestChain(b));
      forks100.push(forks(b));
      expect(mass(b)).toBeLessThanOrEqual(skeletonCeiling(b) + 1e-9);
    }
    console.log(
      `humanoid median after 30: ${median(at30).toFixed(3)}, after 60: ${median(at60).toFixed(3)}; thick torso ${(thick / seeds).toFixed(2)}, two torsos or a sunk head ${(twoOrSunk / seeds).toFixed(2)}, defects among landed ${(defects / landed).toFixed(3)}; ` +
        `longest chain median at 100: ${median(chains100)} (main: 4); forks median at 30: ${median(forks30)}, at 100: ${median(forks100)} (main: 2 / 2); landed on the torso or its nodes ${(onTorso / landed).toFixed(3)} (main: 0.26)`,
    );
    // The human's joints (decision 118) slowed the decay: humanoid reads a bent limb as one, the full chest and pelvis
    // keep SPLIT, ENGULF and MERGE off the fresh human, and the elbows no longer draw forks. Measured with side nodes
    // only: 0.39 / 0.25 (thick 0.58, two torsos or a sunk head 0.89); with the joints: 0.54 / 0.33 (0.72, 0.72).
    // The abyss still stands well apart from the spring (0.78 at 30).
    expect(median(at30)).toBeLessThanOrEqual(0.6);
    expect(median(at60)).toBeLessThanOrEqual(0.36);
    expect(thick / seeds).toBeGreaterThanOrEqual(0.4);
    expect(twoOrSunk / seeds).toBeGreaterThanOrEqual(0.25);
    expect(defects / landed).toBeLessThanOrEqual(0.2);
    // The second half of the owner's finding: a star of long chains, no forks, the torso untouched.
    expect(median(chains100)).toBeLessThanOrEqual(4);
    // Since decision 115 the last leg stays longer, and forks come earlier: more by 100 than by 30.
    // Side nodes only: 2 at 30, 5 at 100; with the joints 3 and 4 (the extra limbs fork off the shoulders and hips early).
    // `audit/mutations` added three rows (a jaw on the flesh, a gut, a gland) and the median at 100 went 4 -> 3 on the
    // same seeds: every row is a smaller share of the draw, so the tumours and the sprouts that make forks come up less
    // often. Measured with the three rows taken out again: 4. The floor follows the measurement, the direction holds.
    expect(median(forks100)).toBeGreaterThanOrEqual(Math.max(3, median(forks30) + 1));
    expect(onTorso / landed).toBeGreaterThanOrEqual(0.2);
  });

  it("a joint wants to fork: a sprout or a branch at a full joint of degree 2 inside a limb widens the joint first and weighs x5", () => {
    // The human's own elbow is not one (a limb bent once, mutation.ts `forkJoints`): the joint is grown with a mouth on
    // the upper arm stretched to 2.
    const b = human(1000);
    expect(mutationTargets(b, byId("extraArm"), { spread: false }).some((w) => "node" in w.target && w.target.node === elbowL)).toBe(false);
    b.segments[armL]!.length = 2;
    apply(b, "joint", { ending: organ("mouth") }, segTarget(armL));
    const joint = b.segments[armL]!.b;
    expect(b.nodes[joint]!.size).toBe(1);
    expect(segmentsAt(b, joint)).toHaveLength(2);
    // The plain operation has no place at the joint; the mutation does: x5 for the joint, x2 for the hand at the tip of the arm that starts there.
    expect(targets(b, "sprout", ARM).some((w) => "node" in w.target && w.target.node === joint)).toBe(false);
    const arm = new Map(mutationTargets(b, byId("extraArm"), { spread: false }).map((w) => [JSON.stringify(w.target), w.weight]));
    expect(FORK_AT_JOINT).toBe(5);
    expect(arm.get(JSON.stringify({ node: joint }))).toBeCloseTo(FORK_AT_JOINT * ENDING_AFFINITY);
    // The pelvis is full now; the hip, a torso node with no hand next door, weighs plain.
    expect(arm.get(JSON.stringify({ node: pelvis }))).toBeUndefined();
    expect(arm.get(JSON.stringify({ node: hipL }))).toBeCloseTo(1);
    const m0 = mass(b);
    const r = applyMutationAt(b, byId("extraArm"), { node: joint }, { spread: false });
    expect(r.steps).toBe(2);
    expect(b.nodes[joint]!.size).toBe(2);
    expect(segmentsAt(b, joint)).toHaveLength(3);
    expect(forks(b)).toBe(3);
    expect(mass(b) - m0).toBe(8);
    sound(b);
    // A branch of a mouth at the joint: the joint widens and the mouth forks into two.
    const c = human(1000);
    c.segments[armL]!.length = 2;
    apply(c, "joint", { ending: organ("mouth") }, segTarget(armL));
    const j = c.segments[armL]!.b;
    const fork = byId("forking");
    const rows: Mutation = { ...fork, target: { endings: ["mouth"] } };
    const cand = mutationTargets(c, rows, { spread: false });
    expect(cand.some((w) => "ending" in w.target && w.target.ending.node === j)).toBe(true);
    applyMutationAt(c, rows, { ending: { node: j, index: 0 } }, { spread: false });
    expect(c.nodes[j]!.size).toBe(2);
    expect(segmentsAt(c, j)).toHaveLength(4);
    sound(c);
    // A joint of a torso is not inside a limb; a joint of size 3 that is full stays full.
    const d = human(1000);
    apply(d, "joint", { ending: null }, segTarget(torso));
    const tj = d.segments[torso]!.b;
    expect(mutationTargets(d, byId("extraArm"), { spread: false }).some((w) => "node" in w.target && w.target.node === tj)).toBe(false);
  });

  it("a chain resists joints and stretching: x 1 / (1 + (chain - 2)) beyond two segments, and a segment of length 4 stretches at a half", () => {
    // A chain counts limbs: the bent arm is one (the bare elbow joins it), a joint that holds an eye divides it.
    const b = human(1000);
    expect(longestChain(b)).toBe(1);
    b.segments[armL]!.length = 2;
    apply(b, "joint", { ending: organ("eye") }, segTarget(armL));
    const second = last(b);
    expect(longestChain(b)).toBe(2);
    const w2 = new Map(mutationTargets(b, byId("eyeOnJoint"), { spread: false }).map((w) => [JSON.stringify(w.target), w.weight]));
    expect(w2.get(JSON.stringify(segTarget(armL)))).toBeUndefined();
    b.segments[armL]!.length = 2;
    b.segments[second]!.length = 2;
    const w2b = new Map(mutationTargets(b, byId("eyeOnJoint"), { spread: false }).map((w) => [JSON.stringify(w.target), w.weight]));
    expect(w2b.get(JSON.stringify(segTarget(armL)))).toBeCloseTo(1);
    apply(b, "joint", { ending: organ("eye") }, segTarget(second));
    expect(longestChain(b)).toBe(3);
    b.segments[armR]!.length = 2;
    const w3 = new Map(mutationTargets(b, byId("eyeOnJoint"), { spread: false }).map((w) => [JSON.stringify(w.target), w.weight]));
    expect(w3.get(JSON.stringify(segTarget(armL)))).toBeCloseTo(1 / 2);
    expect(w3.get(JSON.stringify(segTarget(armR)))).toBeCloseTo(1);
    const s3 = new Map(mutationTargets(b, byId("longArm"), { spread: false }).map((w) => [JSON.stringify(w.target), w.weight]));
    expect(s3.get(JSON.stringify(segTarget(armL)))).toBeCloseTo(1 / 2);
    expect(s3.get(JSON.stringify(segTarget(armR)))).toBeCloseTo(1);
    // Length alone: an arm of 4 stretches at a half, of 5 at a third; the chain multiplies in.
    const c = human(1000);
    c.segments[armR]!.length = 4;
    const s4 = new Map(mutationTargets(c, byId("longArm"), { spread: false }).map((w) => [JSON.stringify(w.target), w.weight]));
    expect(s4.get(JSON.stringify(segTarget(armR)))).toBeCloseTo(1 / 2);
    c.segments[armR]!.length = 5;
    const s5 = new Map(mutationTargets(c, byId("longArm"), { spread: false }).map((w) => [JSON.stringify(w.target), w.weight]));
    expect(s5.get(JSON.stringify(segTarget(armR)))).toBeCloseTo(1 / 3);
    expect(s5.get(JSON.stringify(segTarget(armL)))).toBeCloseTo(1);
    // The measures of the plan read the human: two forks, a chain of one.
    expect(forks(human())).toBe(2);
    expect(planTargets(human())({ segment: torso })).toBe(true);
    expect(planTargets(human())({ node: chest })).toBe(true);
    expect(planTargets(human())({ segment: armL })).toBe(false);
    expect(planTargets(human())({ node: handL })).toBe(false);
  });

  it("the plan decays with the load: torso rows weigh x (1 + load / 4) for the abyss, the tumour and the meat; never for the spring", () => {
    const h = human();
    expect(mutationLoad(h)).toBe(0);
    const plain = drawWeights(MUTATIONS, { body: h, decay: true });
    const off = drawWeights(MUTATIONS, { body: h });
    expect(plain).toEqual(off);
    const b = human(1000);
    // The chest and the pelvis are full: the tentacles grow on the shoulders and the hips.
    for (const node of [shoulderL, shoulderR, hipL, hipR, hipL]) apply(b, "sprout", { ...ARM, kind: "tentacle" }, { node });
    const load = mutationLoad(b);
    expect(load).toBeGreaterThanOrEqual(5);
    const on = drawWeights(MUTATIONS, { body: b, decay: true, spread: false });
    const none = drawWeights(MUTATIONS, { body: b, spread: false });
    MUTATIONS.forEach((m, i) => {
      const factor = PLAN_OPS.has(m.op) ? 1 + load / DECAY_PER : 1;
      expect(on[i], m.id).toBeCloseTo(none[i]! * factor);
    });
    // The lab's sources: the abyss and its kin decay the plan, the spring and the graft do not; defects 15 % and 30 %.
    const src = Object.fromEntries(SOURCES.map((s) => [s.id, s]));
    expect(src.abyss!.decay).toBe(true);
    expect(src.meat!.decay).toBe(true);
    expect(src.tumour!.decay).toBe(true);
    expect(src.spring!.decay).toBe(false);
    expect(src.vaccine!.decay).toBe(false);
    expect(src.abyss!.defects).toBe(0.15);
    expect(src.tumour!.defects).toBe(0.3);
  });

  it("defects weigh: no defect organ of mass 0 but the marks", () => {
    for (const [kind, spec] of Object.entries(ORGANS)) {
      if (!spec.tags?.includes("defect") || spec.tags.includes("mark")) continue;
      expect(spec.mass, kind).toBeGreaterThan(0);
    }
    expect(hasTag("weakNeck", "mark")).toBe(true);
  });

  it("the catalog uses every new operation at least twice, with translations", () => {
    for (const op of NEW_OPS) {
      const rows = MUTATIONS.filter((m) => m.op === op);
      expect(rows.length, op).toBeGreaterThanOrEqual(2);
      expect(PLAN_OPS.has(op), op).toBe(true);
      for (const m of rows) {
        const b = human(1000);
        const t = mutationTargets(b, m, { spread: false });
        expect(Array.isArray(t), m.id).toBe(true);
      }
    }
    expect(PLAN_OPS.has("thicken")).toBe(true);
    expect(PLAN_OPS.has("sprout")).toBe(false);
  });
});

describe("spring and graft stay tame", () => {
  it("200 seeds x 30 from the spring: the median body is still mostly a human", () => {
    const values: number[] = [];
    for (let seed = 1; seed <= 200; seed++) {
      const rng = new Rng(`i-spring-${seed}`);
      const b = human();
      for (let i = 0; i < 30; i++) spring(b, rng);
      sound(b, `seed ${seed}`);
      values.push(humanoid(b));
    }
    console.log(`spring humanoid median after 30: ${median(values).toFixed(3)}`);
    expect(median(values)).toBeGreaterThanOrEqual(0.6);
  });
});

describe("humanoid", () => {
  it("the human is 1; every part is 0..1; the parts read the plan", () => {
    const h = human();
    expect(humanoid(h)).toBe(1);
    const p = humanoidParts(h);
    for (const v of Object.values(p)) expect(v).toBeGreaterThanOrEqual(0);
    for (const v of Object.values(p)) expect(v).toBeLessThanOrEqual(1);
    // A sunk head, a second torso, a fat torso, arms from the pelvis, a second head: each takes its part.
    const sunk = human(1000);
    apply(sunk, "sink", {}, segTarget(neck));
    expect(humanoidParts(sunk).head).toBeLessThan(0.5);
    // The split needs a free place at the chest and the pelvis: widened, as in SPLIT.
    const two = widen(human(1000), chest, pelvis);
    apply(two, "split", {}, segTarget(torso));
    expect(humanoidParts(two).trunk).toBeLessThanOrEqual(0.5);
    const fat = human(1000);
    apply(fat, "bloat", {}, segTarget(torso));
    expect(humanoidParts(fat).girth).toBeLessThan(1);
    const shifted = human(1000);
    apply(shifted, "shift", {}, segTarget(armL));
    apply(shifted, "shift", {}, segTarget(armR));
    expect(humanoidParts(shifted).arms).toBe(0);
    const heads = human(1000);
    apply(heads, "sprout", { kind: "neck", length: 1, girth: 1, cover: "skin", ending: organ("head", [organ("smallBrain")]) }, { node: shoulderL });
    expect(humanoidParts(heads).head).toBeLessThanOrEqual(0.5);
    // Extra sticks alone leave the plan mostly human.
    const sticks = human(1000);
    for (const node of [shoulderL, shoulderR, hipL]) apply(sticks, "sprout", { ...ARM, kind: "tentacle" }, { node });
    expect(humanoid(sticks)).toBeGreaterThan(0.7);
    expect(humanoid(sticks)).toBeLessThan(1);
    // The swamp mutant and the bodies of the plan stay in 0..1.
    expect(humanoid(swampMutant())).toBeGreaterThan(0);
    expect(humanoid(swampMutant())).toBeLessThan(0.8);
    for (let seed = 1; seed <= 50; seed++) {
      const v = humanoid(grownByPlan(seed, 30));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    // A trunk without a head or a limb is nobody's likeness.
    const bare = bodyFromText(`
      1[3]
      2[3]
      1 -корпус:2/2 кожа {мозг в брюхе*, сердце}- 2
    `);
    expect(humanoid(bare)).toBeLessThan(0.5);
  });
});

describe("limits and determinism", () => {
  it("100 seeds x 60 operations of the plan hold the limits of §8 and the girth of 6", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const b = grownByPlan(seed, 60);
      const where = `seed ${seed}`;
      expect(nodeIds(b).length, where).toBeLessThanOrEqual(LIMITS.nodes);
      expect(segmentIds(b).length, where).toBeLessThanOrEqual(LIMITS.segments);
      expect(closure(b), where).toBeLessThanOrEqual(LIMITS.cycles);
      expect(sortedIds(b.membranes).length, where).toBeLessThanOrEqual(LIMITS.membranes);
      for (const id of segmentIds(b)) {
        expect(b.segments[id]!.girth, where).toBeLessThanOrEqual(6);
        expect(b.segments[id]!.length, where).toBeLessThanOrEqual(6);
      }
      sound(b, where);
    }
  });

  it("the same seed grows the same body: 100 seeds hashed twice, and the abyss of the first layer replays", () => {
    for (let seed = 1; seed <= 100; seed++) {
      expect(bodyHash(grownByPlan(seed, 20))).toBe(bodyHash(grownByPlan(seed, 20)));
      const a = human();
      const b = human();
      const ra = new Rng(`i-replay-${seed}`);
      const rb = new Rng(`i-replay-${seed}`);
      for (let i = 0; i < 20; i++) {
        strike(a, ra);
        strike(b, rb);
      }
      expect(bodyHash(a)).toBe(bodyHash(b));
    }
  });
});
