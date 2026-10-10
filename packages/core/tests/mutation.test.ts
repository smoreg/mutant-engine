import { describe, expect, it } from "vitest";
import { LabRng as Rng } from "../rng.js";
import {
  HUMAN_IDS,
  SKELETON_CEILING,
  skeletonCeiling,
  WANDER_TURNS,
  apply,
  applyMutation,
  applyMutationAt,
  bodyFromText,
  bodyHash,
  bodyToText,
  brains,
  canAutotomize,
  cloneBody,
  closure,
  controlCap,
  controlLoad,
  cut,
  derive,
  familyCounts,
  handover,
  hearts,
  human,
  mass,
  mutationTargets,
  nodeIds,
  organ,
  organs,
  regrowAfterCut,
  regrowTick,
  segmentIds,
  segmentMass,
  segmentsAt,
  selfRef,
  setSelf,
  sortedIds,
  targets,
  validate,
  wanderTick,
  type Body,
  type Mutation,
  MUTATIONS,
} from "../index.js";
import { populationC } from "./genC.js";

function byId(id: string): Mutation {
  const m = MUTATIONS.find((x) => x.id === id);
  if (m === undefined) throw new Error(`no mutation ${id} in the catalog`);
  return m;
}

describe("a mutation grows its own flesh", () => {
  it("meat grows by the organ's mass and the reserve pays 20 per unit", () => {
    const b = human();
    // The chest is the full neck node now: the arm grows on a shoulder.
    const r = applyMutationAt(b, byId("extraArm"), { node: HUMAN_IDS.shoulderL });
    expect(r.fallback).toBe(false);
    expect(r.grown).toBe(8);
    expect(r.reserve).toBe(160);
    expect(mass(b)).toBe(109);
    expect(b.meat).toBe(109);
    expect(validate(b)).toEqual([]);
  });

  it("a rebirth brings only the difference; a shrinking one brings nothing", () => {
    const b = human();
    const up = applyMutationAt(b, byId("pincerHand"), { ending: { node: HUMAN_IDS.handL, index: 0 } });
    expect(up.grown).toBe(1);
    expect(b.meat).toBe(102);
    expect(mass(b)).toBe(102);
    const down = applyMutationAt(b, byId("handAgain"), { ending: { node: HUMAN_IDS.handL, index: 0 } });
    expect(down.grown).toBe(0);
    expect(b.meat).toBe(102);
    expect(mass(b)).toBe(101);
  });

  it("what a mutation sheds leaves the meat, as in step A", () => {
    const b = human();
    const r = applyMutationAt(b, byId("fusedArms"), { pair: [HUMAN_IDS.handL, HUMAN_IDS.handR] });
    expect(r.grown).toBe(0);
    expect(mass(b)).toBe(97);
    expect(b.meat).toBe(97);
  });

  /** A human of mass 154: six arms, a bare stalk and a tumour; the chest and the pelvis are full, so shoulders and hips carry them. */
  function heavy(): Body {
    const b = human(100_000);
    const arm = { kind: "arm", length: 2, girth: 1, cover: "skin", ending: organ("hand") } as const;
    for (const node of [HUMAN_IDS.shoulderL, HUMAN_IDS.shoulderR, HUMAN_IDS.hipL, HUMAN_IDS.hipR, HUMAN_IDS.head, HUMAN_IDS.handL]) {
      apply(b, "sprout", arm, { node });
    }
    apply(b, "sprout", { kind: "stalk", length: 1, girth: 1, cover: "skin", ending: null }, { node: HUMAN_IDS.hipL });
    apply(b, "growth", {}, { node: HUMAN_IDS.handR });
    expect(mass(b)).toBe(154);
    b.meat = 154;
    return b;
  }

  it("the skeleton is the only ceiling: over it the operation becomes a tumour, then is lost", () => {
    const b = heavy();
    const rng = new Rng(1);
    const tumour = applyMutation(cloneBody(b), byId("extraArm"), rng)!;
    expect(tumour.fallback).toBe(true);
    expect(tumour.grown).toBe(4);
    const full = cloneBody(b);
    full.meat = 1000;
    apply(full, "growth", {}, { node: HUMAN_IDS.head });
    full.meat = mass(full);
    expect(mass(full)).toBe(158);
    expect(applyMutation(full, byId("extraArm"), rng)).toBeNull();
    expect(mass(full)).toBe(158);
    expect(full.meat).toBe(158);
    expect(validate(full)).toEqual([]);
    const raised = applyMutation(cloneBody(full), byId("extraArm"), rng, { ceiling: 200 })!;
    expect(raised.fallback).toBe(false);
    expect(SKELETON_CEILING).toBe(160);
  });

  it("at the ceiling the abyss pushes out the weakest organs (step H: a set that fits, see ceiling.test.ts)", () => {
    const b = heavy();
    const r = applyMutation(b, byId("extraArm"), new Rng(1), { source: "abyss" })!;
    expect(r.fallback).toBe(false);
    // The penis made the heavy body 154: an arm of 8 needs 2 of room, and the second eye (1) alone no longer
    // makes it; the next weakest, a hand (2), goes too: 154 - 3 + 8 = 159 (was the eye alone, 160).
    expect(r.displaced.map((o) => o.kind)).toEqual(["eye", "hand"]);
    expect(b.nodes[HUMAN_IDS.head]!.ends[0]!.contents!.filter((o) => o.kind === "eye")).toHaveLength(1);
    expect(mass(b)).toBe(159);
    expect(b.meat).toBe(159);
    expect(validate(b)).toEqual([]);
    const other = human();
    const calm = applyMutation(other, byId("extraArm"), new Rng(1), { source: "abyss" })!;
    expect(calm.displaced).toEqual([]);
  });
});

describe("old mutations on the new language", () => {
  it("second head: a neck with a lesser brain of 6 channels on a node of size >= 2", () => {
    const b = human();
    const t = mutationTargets(b, byId("secondHead")).map((w) => w.target);
    // The neck node and the pelvis are size 1 now; the shoulders (3) and hips (2) qualify.
    expect(t).toEqual([
      { node: HUMAN_IDS.head },
      { node: HUMAN_IDS.shoulderL },
      { node: HUMAN_IDS.shoulderR },
      { node: HUMAN_IDS.hipL },
      { node: HUMAN_IDS.hipR },
    ]);
    const r = applyMutationAt(b, byId("secondHead"), { node: HUMAN_IDS.shoulderL });
    const [node, seg] = r.created;
    expect(b.segments[seg!]).toMatchObject({ kind: "neck", length: 1, girth: 1, a: HUMAN_IDS.shoulderL, b: node });
    const head = b.nodes[node!]!.ends[0]!;
    expect(head.kind).toBe("head");
    expect(head.contents!.map((o) => o.kind)).toContain("smallBrain");
    expect(brains(b)).toHaveLength(2);
    expect(controlCap(b)).toBe(16);
    expect(r.grown).toBe(14);
    expect(validate(b)).toEqual([]);
  });

  it("spinal ganglion 3 and gut brain 4 live in a cavity and give channels by kind", () => {
    const b = human(1000);
    applyMutationAt(b, byId("ganglion"), { segment: HUMAN_IDS.torso });
    expect(controlCap(b)).toBe(13);
    // One brain per cavity (step J): the gut brain takes a cavity of its own, a limb's, which holds one organ.
    // The human's limb segments are 1 long now, a cavity of 5 under the gut brain's 8: the upper arm stretches to 2 first.
    expect(mutationTargets(b, byId("gutBrain"), { spread: false })).toEqual([]);
    apply(b, "stretch", { delta: 1 }, { segment: HUMAN_IDS.armL });
    expect(mutationTargets(b, byId("gutBrain"), { spread: false }).map((w) => w.target)).toEqual([{ segment: HUMAN_IDS.armL }]);
    applyMutationAt(b, byId("gutBrain"), { segment: HUMAN_IDS.armL });
    expect(controlCap(b)).toBe(17);
    expect(brains(b).map((x) => x.organ.kind)).toEqual(["brain", "ganglion", "gutBrain"]);
    expect(validate(b)).toEqual([]);
  });

  it("gut brain: you can lose the head and go on", () => {
    const b = human();
    applyMutationAt(b, byId("gutBrain"), { segment: HUMAN_IDS.torso });
    expect(handover(b)).toEqual({ segment: HUMAN_IDS.torso, slot: 3 });
    setSelf(b, handover(b)!);
    const r = cut(b, HUMAN_IDS.neck, "b");
    expect(r.others.map((o) => o.fate)).toEqual(["brainOnly"]);
    expect(b.nodes[HUMAN_IDS.head]).toBeUndefined();
    expect(controlCap(b)).toBe(4);
    expect(validate(b)).toEqual([]);
  });

  it("hydra: cutting the bridge yields two", () => {
    const b = human();
    // The chest is the full neck node now: the hydra arm grows on a shoulder.
    const r = applyMutationAt(b, byId("hydraArm"), { node: HUMAN_IDS.shoulderL });
    const [, seg] = r.created;
    expect(b.segments[seg!]!.growths.map((o) => o.kind)).toEqual(["hydra"]);
    expect(b.meat).toBe(109);
    const c = cut(b, seg!, "a");
    expect(mass(b)).toBe(101);
    const re = regrowAfterCut(b, c);
    expect(re.doubled).toHaveLength(2);
    // The flank, the upper arm and the two hydra arms.
    expect(segmentsAt(b, HUMAN_IDS.shoulderL)).toHaveLength(4);
    const arms = segmentsAt(b, HUMAN_IDS.shoulderL).filter((s) => b.segments[s]!.growths.some((o) => o.kind === "hydra"));
    expect(arms).toHaveLength(2);
    for (const s of arms) {
      const tip = b.segments[s]!.b;
      expect(b.nodes[tip]!.ends.map((o) => o.kind)).toEqual(["hand"]);
      expect(b.segments[s]!.breakPlane).toBe(false);
    }
    expect(mass(b)).toBe(117);
    expect(b.meat).toBe(117);
    expect(validate(b)).toEqual([]);
    // The shoulder holds six: the flank, the upper arm and the two hydra arms leave room for both copies.
    const again = cut(b, arms[0]!, "a");
    expect(regrowAfterCut(b, again).doubled).toHaveLength(2);
    expect(validate(b)).toEqual([]);
  });

  it("flesh memory: regrowth by snapshot in 200 turns", () => {
    const b = human();
    applyMutationAt(b, byId("fleshMemory"), { segment: HUMAN_IDS.torso });
    expect(b.meat).toBe(106);
    // The upper arm takes the elbow, the forearm and the hand with it.
    const c = cut(b, HUMAN_IDS.armL, "a");
    expect(mass(b)).toBe(98);
    const re = regrowAfterCut(b, c);
    expect(re.remembered).toBe(1);
    expect(re.doubled).toEqual([]);
    expect(b.regrowth).toHaveLength(1);
    // The arm hung from the shoulder, which stays on its flank: the arm grows back there.
    expect(b.regrowth![0]).toMatchObject({ at: HUMAN_IDS.shoulderL, turns: 200 });
    const before = bodyHash(b);
    for (let i = 0; i < 199; i++) expect(regrowTick(b)).toEqual([]);
    expect(segmentsAt(b, HUMAN_IDS.shoulderL)).toEqual([HUMAN_IDS.flankShoulderL]);
    expect(bodyHash(b)).not.toBe(before);
    const grown = regrowTick(b);
    // The whole bent arm comes back: hand 32, upper arm 33 to a new elbow 34, forearm 35.
    expect(grown).toEqual([[32, 33, 34, 35]]);
    expect(b.nodes[32]!.ends.map((o) => o.kind)).toEqual(["hand"]);
    expect(b.segments[33]).toMatchObject({ a: HUMAN_IDS.shoulderL, b: 34, kind: "arm", length: 1, breakPlane: false });
    expect(b.segments[35]).toMatchObject({ a: 34, b: 32, kind: "arm", length: 1, breakPlane: false });
    expect(b.regrowth).toEqual([]);
    expect(mass(b)).toBe(106);
    expect(b.meat).toBe(106);
    expect(validate(b)).toEqual([]);
    expect(regrowTick(b)).toEqual([]);
  });

  it("without the memory nothing is remembered", () => {
    const b = human();
    const c = cut(b, HUMAN_IDS.armL, "a");
    expect(regrowAfterCut(b, c)).toEqual({ doubled: [], remembered: 0 });
    expect(b.regrowth ?? []).toEqual([]);
  });

  it("budding: a limb thickens into a torso with a heart and a gut brain", () => {
    // A limb segment of the human is 1 long: thickened, its cavity of 10 is under the heart and the gut brain (12).
    // The upper arm stretches to 2 first, so the human weighs 104 before the bud.
    const b = human(104);
    expect(mutationTargets(b, byId("budding"))).toEqual([]);
    apply(b, "stretch", { delta: 1 }, { segment: HUMAN_IDS.armL });
    const t = mutationTargets(b, byId("budding")).map((w) => w.target);
    expect(t).toEqual([{ segment: HUMAN_IDS.armL }]);
    const r = applyMutationAt(b, byId("budding"), { segment: HUMAN_IDS.armL });
    const s = b.segments[HUMAN_IDS.armL]!;
    expect(s).toMatchObject({ kind: "torso", girth: 2, length: 2 });
    expect(s.cavity.map((o) => o.kind)).toEqual(["heart", "gutBrain"]);
    expect(s.growths.map((o) => o.kind)).toEqual(["bud"]);
    expect(hearts(b)).toEqual([HUMAN_IDS.torso, HUMAN_IDS.armL]);
    expect(brains(b)).toHaveLength(2);
    expect(controlCap(b)).toBe(14);
    // The torso 2/2 weighs by section (decision 1260): 6.5 x 2 x 4 / 3 instead of 26.
    expect(r.grown).toBeCloseTo(32 - 26 + (6.5 * 2 * 4) / 3, 9);
    expect(b.meat).toBeCloseTo(136 - 26 + (6.5 * 2 * 4) / 3, 9);
    expect(validate(b)).toEqual([]);
  });

  it("parasitic twin: a torso with a head and two arms, in four steps", () => {
    const b = human();
    // The pelvis is size 1 and full now: the twin grows from a hip.
    const r = applyMutationAt(b, byId("parasiticTwin"), { node: HUMAN_IDS.hipL });
    expect(r.steps).toBe(4);
    const [node, seg] = r.created;
    expect(b.segments[seg!]).toMatchObject({ kind: "torso", a: HUMAN_IDS.hipL, b: node });
    expect(b.nodes[node!]!.size).toBe(2);
    expect(b.nodes[node!]!.ends[0]!.contents!.map((o) => o.kind)).toContain("smallBrain");
    const arms = segmentsAt(b, node!).filter((s) => b.segments[s]!.kind === "arm");
    expect(arms).toHaveLength(2);
    for (const a of arms) expect(b.nodes[b.segments[a]!.b]!.ends.map((o) => o.kind)).toEqual(["hand"]);
    expect(brains(b)).toHaveLength(2);
    expect(controlCap(b)).toBe(16);
    // The twin's torso 2/2 weighs by section (decision 1260): 6.5 x 2 x 4 / 3 instead of 26.
    expect(mass(b)).toBeCloseTo(148 - 26 + (6.5 * 2 * 4) / 3, 9);
    expect(b.meat).toBeCloseTo(148 - 26 + (6.5 * 2 * 4) / 3, 9);
    expect(validate(b)).toEqual([]);
  });

  it("wings: a membrane over one bent limb and its mirror, no fusion (decision 121)", () => {
    const b = human();
    // Every limb that bends: the arms at the elbows, the legs at the knees; a wing is named by the limb's first segment.
    const t = mutationTargets(b, byId("wings")).map((w) => w.target);
    expect(t).toEqual([{ segment: HUMAN_IDS.armL }, { segment: HUMAN_IDS.armR }, { segment: HUMAN_IDS.legL }, { segment: HUMAN_IDS.legR }]);
    const r = applyMutationAt(b, byId("wings"), { segment: HUMAN_IDS.armL });
    // The wing and its pair: two membranes, nothing grown, nothing fused.
    expect(r.steps).toBe(2);
    expect(closure(b)).toBe(0);
    const ids = sortedIds(b.membranes);
    expect(ids).toHaveLength(2);
    expect(ids.map((id) => b.membranes[id]!.kind)).toEqual(["wing", "wing"]);
    expect(b.membranes[ids[0]!]!.cycle).toEqual([HUMAN_IDS.armL, HUMAN_IDS.forearmL]);
    expect(b.membranes[ids[1]!]!.cycle).toEqual([HUMAN_IDS.armR, HUMAN_IDS.forearmR]);
    expect(b.nodes[HUMAN_IDS.handR]!.ends.map((o) => o.kind)).toEqual(["hand"]);
    expect(r.removed).toEqual([]);
    expect(mass(b)).toBe(101);
    expect(validate(b)).toEqual([]);
    // The arms are taken; the legs are still free.
    expect(mutationTargets(b, byId("wings")).map((w) => w.target)).toEqual([{ segment: HUMAN_IDS.legL }, { segment: HUMAN_IDS.legR }]);
  });

  it("amorphous: every limb a tentacle, every ending a pseudopod, heads and torsos stay", () => {
    const b = human();
    const r = applyMutationAt(b, byId("amorphous"), { node: HUMAN_IDS.head });
    const flanks: number[] = [HUMAN_IDS.flankShoulderL, HUMAN_IDS.flankShoulderR, HUMAN_IDS.flankHipL, HUMAN_IDS.flankHipR];
    expect(r.grown).toBe(0);
    for (const id of segmentIds(b)) {
      const s = b.segments[id]!;
      // Flanks are no limbs: they stay flanks. The penis is a limb and turns too.
      expect(s.kind).toBe(id === HUMAN_IDS.torso ? "torso" : flanks.includes(id) ? "flank" : "tentacle");
    }
    expect(b.nodes[HUMAN_IDS.head]!.ends[0]!.kind).toBe("head");
    for (const id of [HUMAN_IDS.handL, HUMAN_IDS.handR, HUMAN_IDS.footL, HUMAN_IDS.footR]) {
      expect(b.nodes[id]!.ends.map((o) => o.kind)).toEqual(["pseudopod"]);
    }
    expect(mass(b)).toBe(87);
    expect(b.meat).toBe(101);
    expect(validate(b)).toEqual([]);
  });

  it("weak neck: a mark on the neck that leads to a head", () => {
    const b = human();
    expect(mutationTargets(b, byId("weakNeck")).map((w) => w.target)).toEqual([{ segment: HUMAN_IDS.neck }]);
    applyMutationAt(b, byId("weakNeck"), { segment: HUMAN_IDS.neck });
    expect(b.segments[HUMAN_IDS.neck]!.growths.map((o) => o.kind)).toEqual(["weakNeck"]);
    expect(mutationTargets(b, byId("weakNeck"))).toEqual([]);
    expect(validate(b)).toEqual([]);
  });

  it("a castoff tail has a break plane, a bait node draws the abyss", () => {
    const b = human();
    // The pelvis and the chest are full on the human: the tail and the bait grow on the hips.
    const tail = applyMutationAt(b, byId("castoffTail"), { node: HUMAN_IDS.hipL });
    const seg = tail.created[1]!;
    expect(b.segments[seg]).toMatchObject({ kind: "tail", breakPlane: true });
    expect(canAutotomize(b, seg)).toBe(true);
    const bait = applyMutationAt(b, byId("baitNode"), { node: HUMAN_IDS.hipR });
    expect(b.nodes[bait.created[0]!]!.bait).toBe(true);
    expect(b.segments[bait.created[1]!]!.kind).toBe("growth");
    expect(validate(b)).toEqual([]);
  });

  it("target rules read the ending, the segment kind and the head beyond", () => {
    const b = human();
    expect(mutationTargets(b, byId("hoof")).map((w) => w.target)).toEqual([
      { ending: { node: HUMAN_IDS.footL, index: 0 } },
      { ending: { node: HUMAN_IDS.footR, index: 0 } },
    ]);
    // A joint cuts a segment of 2 or more; on the human's bent limbs, segments of 1, a mouth takes the elbow or the
    // knee they already have: every limb segment is a place, through its bare joint.
    const H = HUMAN_IDS;
    const limbSegments = [H.armL, H.armR, H.legL, H.legR, H.forearmL, H.forearmR, H.shinL, H.shinR].map((segment) => ({ segment }));
    expect(mutationTargets(b, byId("mouthOnLimb")).map((w) => w.target)).toEqual(limbSegments);
    const long = human(1000);
    apply(long, "stretch", { delta: 1 }, { segment: H.armL });
    const mouthed = cloneBody(long);
    applyMutationAt(mouthed, byId("mouthOnLimb"), { segment: H.forearmR });
    expect(mouthed.nodes[H.elbowR]!.ends.map((e) => e.kind)).toEqual(["mouth"]);
    applyMutationAt(long, byId("mouthOnLimb"), { segment: H.armL });
    expect(long.segments[H.armL]!.length).toBe(1);
    expect(mutationTargets(b, byId("extraEye")).map((w) => w.target)).toEqual([{ ending: { node: HUMAN_IDS.head, index: 0 } }]);
    applyMutationAt(b, byId("extraEye"), { ending: { node: HUMAN_IDS.head, index: 0 } });
    applyMutationAt(b, byId("extraEye"), { ending: { node: HUMAN_IDS.head, index: 0 } });
    expect(mutationTargets(b, byId("extraEye"))).toEqual([]);
    expect(applyMutation(b, byId("extraEye"), new Rng(1))!.fallback).toBe(true);
  });
});

describe("placements: organ, cover", () => {
  it("an organ into a cavity needs room, a head organ a free place, a growth any live segment", () => {
    const b = human(1000);
    const gland = { organ: organ("venomGland"), mount: "cavity" } as const;
    // Every limb segment holds one organ inside too (a cavity of 5 takes a gland of 4); the penis holds none.
    const limbs = [
      HUMAN_IDS.neck, HUMAN_IDS.armL, HUMAN_IDS.armR, HUMAN_IDS.legL, HUMAN_IDS.legR,
      HUMAN_IDS.forearmL, HUMAN_IDS.forearmR, HUMAN_IDS.shinL, HUMAN_IDS.shinR,
    ].map((segment) => ({ segment }));
    expect(targets(b, "organ", gland).map((w) => w.target)).toEqual([limbs[0], { segment: HUMAN_IDS.torso }, ...limbs.slice(1)]);
    for (let i = 0; i < 4; i++) apply(b, "organ", gland, { segment: HUMAN_IDS.torso });
    expect(targets(b, "organ", gland).map((w) => w.target)).toEqual(limbs);
    expect(targets(b, "organ", { organ: organ("gut"), mount: "cavity" }).map((w) => w.target)).toContainEqual({ segment: HUMAN_IDS.torso });
    expect(targets(b, "organ", { organ: organ("ear"), mount: "head" })).toEqual([]);
    expect(targets(b, "organ", { organ: organ("eye"), mount: "head" }).map((w) => w.target)).toEqual([{ ending: { node: 1, index: 0 } }]);
    // Neck, torso, four upper limbs, four lower limbs and the penis.
    expect(targets(b, "organ", { organ: organ("spines"), mount: "growth" })).toHaveLength(11);
    apply(b, "organ", { organ: organ("spines"), mount: "growth" }, { segment: HUMAN_IDS.legL });
    expect(b.segments[HUMAN_IDS.legL]!.growths.map((o) => o.kind)).toEqual(["spines"]);
    expect(validate(b)).toEqual([]);
    expect(() => apply(b, "organ", { organ: organ("hand"), mount: "cavity" }, { segment: HUMAN_IDS.torso })).toThrow();
  });

  it("a second brain never enters a head that has one", () => {
    const b = human(1000);
    expect(targets(b, "organ", { organ: organ("smallBrain"), mount: "head" })).toEqual([]);
    // The chest is the full neck node now: the second neck grows on a shoulder.
    apply(b, "sprout", { kind: "neck", length: 1, girth: 1, cover: "skin", ending: organ("head", [organ("eye")]) }, { node: HUMAN_IDS.shoulderL });
    expect(targets(b, "organ", { organ: organ("smallBrain"), mount: "head" }).map((w) => w.target)).toEqual([{ ending: { node: 32, index: 0 } }]);
  });

  it("a cover starts on one segment and never on chrome", () => {
    const b = human(1000);
    // Every live segment but the flanks: neck, torso, eight limb segments and the penis.
    expect(targets(b, "cover", { cover: "chitin" })).toHaveLength(11);
    apply(b, "cover", { cover: "chitin" }, { segment: HUMAN_IDS.armL });
    expect(b.segments[HUMAN_IDS.armL]!.cover).toBe("chitin");
    b.segments[HUMAN_IDS.armR]!.cover = "chrome";
    const t = targets(b, "cover", { cover: "chitin" }).map((w) => w.target);
    expect(t).toHaveLength(9);
    expect(t).not.toContainEqual({ segment: HUMAN_IDS.armL });
    expect(t).not.toContainEqual({ segment: HUMAN_IDS.armR });
    expect(targets(b, "organ", { organ: organ("spines"), mount: "growth" }).map((w) => w.target)).not.toContainEqual({ segment: HUMAN_IDS.armR });
    expect(validate(b)).toEqual([]);
  });

  it("chrome endings neither rebirth, branch nor wander", () => {
    const b = human(1000);
    b.nodes[HUMAN_IDS.handR]!.ends[0] = organ("implant");
    apply(b, "enlarge", {}, { node: HUMAN_IDS.handR });
    const chrome = { ending: { node: HUMAN_IDS.handR, index: 0 } };
    expect(targets(b, "rebirth", { ending: organ("claw") }).map((w) => w.target)).not.toContainEqual(chrome);
    expect(targets(b, "branch", { kind: "arm", length: 1, girth: 1, cover: "skin" }).map((w) => w.target)).not.toContainEqual(chrome);
    expect(targets(b, "migrate", {}).map((w) => w.target)).not.toContainEqual(chrome);
    expect(targets(b, "migrate", {}).map((w) => w.target)).toContainEqual({ ending: { node: HUMAN_IDS.handL, index: 0 } });
    expect(validate(b)).toEqual([]);
  });
});

describe("doubling", () => {
  it("copies the hanging part beyond a bridge onto the same node", () => {
    const b = human(1000);
    // Every bridge whose far side lacks you and whose near node has room for the copy: the neck, beyond which
    // hangs the whole body, and the upper arms and thighs onto their shoulders and hips. The torso's copy would
    // go onto the full neck node, a forearm's onto a full elbow.
    expect(targets(b, "double", {}).map((w) => w.target)).toEqual([
      { segment: HUMAN_IDS.neck },
      { segment: HUMAN_IDS.armL },
      { segment: HUMAN_IDS.armR },
      { segment: HUMAN_IDS.legL },
      { segment: HUMAN_IDS.legR },
    ]);
    // Arms straight from the chest: head 1, chest 2, pelvis 3, hands 4 and 5; neck 6, torso 7, arms 8 and 9.
    const c = bodyFromText(`
      мясо 1000
      голова[2] {голова(мозг*, глаз, глаз)}
      грудь[3]
      таз[3]
      левая[1] {кисть}
      правая[1] {кисть}
      голова -шея:1/1 кожа- грудь
      грудь -корпус:2/3 кожа {сердце, лёгкие, желудок}- таз
      грудь -рука:2/1 кожа- левая
      грудь -рука:2/1 кожа- правая
    `);
    expect(targets(c, "double", {}).map((w) => w.target)).toEqual([{ segment: 6 }, { segment: 7 }, { segment: 8 }, { segment: 9 }]);
    const m = mass(c);
    const r = apply(c, "double", {}, { segment: 8 });
    expect(r.created).toEqual([10, 11]);
    expect(c.nodes[10]!.ends.map((o) => o.kind)).toEqual(["hand"]);
    expect(c.segments[11]).toMatchObject({ a: 2, b: 10, kind: "arm", length: 2, girth: 1, breakPlane: false });
    expect(mass(c)).toBe(m + 8);
    expect(validate(c)).toEqual([]);
    apply(c, "double", {}, { segment: 9 });
    expect(targets(c, "double", {}).map((w) => w.target)).not.toContainEqual({ segment: 8 });
  });

  it("copies a whole part: nodes, segments, cavities, membranes", () => {
    const b = bodyFromText(`
      мясо 1000
      голова[2] {голова(мозг*)}
      грудь[3]
      таз[3]
      узел[3]
      а[2]
      б[2] {глаз}
      голова -шея:1/1 кожа- грудь
      грудь -корпус:2/3 кожа {сердце}- таз
      таз -нога:2/1 кожа- узел
      узел -корпус:1/2 кожа {желудок}- а
      а -щупальце:1/1 присоски- б
      б -щупальце:1/1 кожа- узел
    `);
    apply(b, "membrane", { kind: "fin" }, { cycle: [10, 11, 12] });
    const r = apply(b, "double", {}, { segment: 9 });
    expect(r.created).toEqual([14, 15, 16, 17, 18, 19, 20, 21]);
    expect(b.segments[17]).toMatchObject({ a: HUMAN_IDS.pelvis, b: 14, kind: "leg" });
    expect(b.segments[18]!.cavity.map((o) => o.kind)).toEqual(["stomach"]);
    expect(b.nodes[16]!.ends.map((o) => o.kind)).toEqual(["eye"]);
    expect(b.membranes[21]).toMatchObject({ kind: "fin", cycle: [18, 19, 20], area: 3 });
    expect(closure(b)).toBe(2);
    expect(validate(b)).toEqual([]);
  });

  it("doubling never copies the part with self", () => {
    let seen = 0;
    for (const b of populationC(300)) {
      const me = selfRef(b)!;
      for (const w of targets(b, "double", {})) {
        seen += 1;
        const c = cloneBody(b);
        const before = brains(c).length;
        const r = apply(c, "double", {}, w.target);
        expect(validate(c)).toEqual([]);
        expect(selfRef(c)).toEqual(me);
        expect(brains(c).filter((x) => x.self)).toHaveLength(1);
        const copiedBrains = r.created.filter((id) => c.nodes[id] !== undefined || c.segments[id] !== undefined).reduce((n, id) => n + brains(c).filter((x) => ("node" in x.ref ? x.ref.node : x.ref.segment) === id).length, 0);
        expect(brains(c).length).toBe(before + copiedBrains);
        expect(nodeIds(c).length).toBeLessThanOrEqual(40);
        expect(segmentIds(c).length).toBeLessThanOrEqual(60);
        expect(closure(c)).toBeLessThanOrEqual(8);
        expect(sortedIds(c.membranes).length).toBeLessThanOrEqual(10);
        expect(mass(c)).toBeLessThanOrEqual(c.meat);
      }
    }
    expect(seen).toBeGreaterThan(500);
  });
});

describe("migration", () => {
  function eyed(): Body {
    return bodyFromText(`
      голова[2] {голова(мозг*)}
      грудь[3]
      таз[3] {глаз}
      стопа.л[1] {стопа}
      стопа.п[1] {стопа}
      голова -шея:1/1 кожа- грудь
      грудь -корпус:2/3 кожа {сердце}- таз
      таз -нога:2/1 кожа- стопа.л
      таз -нога:2/1 кожа- стопа.п
    `);
  }

  it("moves an ending one node per 40 turns, never through a head", () => {
    const b = eyed();
    expect(WANDER_TURNS).toBe(40);
    const t = targets(b, "migrate", {}).map((w) => w.target);
    expect(t).toEqual([{ ending: { node: 3, index: 0 } }, { ending: { node: 4, index: 0 } }, { ending: { node: 5, index: 0 } }]);
    apply(b, "migrate", {}, { ending: { node: 3, index: 0 } });
    expect(b.nodes[3]!.ends[0]!.wander).toBe(40);
    expect(targets(b, "migrate", {}).map((w) => w.target)).not.toContainEqual({ ending: { node: 3, index: 0 } });
    const rng = new Rng(3);
    for (let i = 0; i < 39; i++) expect(wanderTick(b, rng)).toEqual([]);
    expect(b.nodes[3]!.ends.map((o) => o.kind)).toEqual(["eye"]);
    expect(wanderTick(b, rng)).toEqual([{ node: 3, index: 0, to: 2 }]);
    expect(b.nodes[3]!.ends).toEqual([]);
    expect(b.nodes[2]!.ends.map((o) => o.kind)).toEqual(["eye"]);
    expect(b.nodes[2]!.ends[0]!.wander).toBe(40);
    for (let i = 0; i < 40; i++) wanderTick(b, rng);
    expect(b.nodes[3]!.ends.map((o) => o.kind)).toEqual(["eye"]);
    expect(b.nodes[1]!.ends).toHaveLength(1);
    expect(validate(b)).toEqual([]);
  });

  it("an ending with nowhere to go waits another 40 turns", () => {
    const b = bodyFromText(`
      голова[2] {голова(мозг*)}
      грудь[1] {кисть}
      голова -шея:1/1 кожа- грудь
    `);
    apply(b, "migrate", {}, { ending: { node: 2, index: 0 } });
    const rng = new Rng(1);
    for (let i = 0; i < 80; i++) expect(wanderTick(b, rng)).toEqual([]);
    expect(b.nodes[2]!.ends[0]!.wander).toBe(40);
  });

  it("wander goes through the text fixture and the hash", () => {
    const b = eyed();
    apply(b, "migrate", {}, { ending: { node: 3, index: 0 } });
    wanderTick(b, new Rng(1));
    const text = bodyToText(b);
    expect(text).toContain("глаз~39");
    const back = bodyFromText(text);
    expect(bodyHash(back)).toBe(bodyHash(b));
    expect(bodyToText(back)).toBe(text);
    b.nodes[3]!.ends[0]!.wander = 0;
    expect(bodyHash(back)).not.toBe(bodyHash(b));
  });
});

describe("families", () => {
  it("the human counts nothing", () => {
    const counts = familyCounts(human());
    for (const n of Object.values(counts)) expect(n).toBe(0);
  });

  it("counts organs beyond the human baseline, covers by kind, membranes by kind", () => {
    const b = human(1000);
    apply(b, "sprout", { kind: "arm", length: 2, girth: 1, cover: "skin", ending: organ("hand") }, { node: HUMAN_IDS.shoulderL });
    apply(b, "organ", { organ: organ("eye"), mount: "head" }, { ending: { node: 1, index: 0 } });
    apply(b, "organ", { organ: organ("venomGland"), mount: "cavity" }, { segment: HUMAN_IDS.torso });
    apply(b, "cover", { cover: "chitin" }, { segment: HUMAN_IDS.legL });
    apply(b, "cover", { cover: "chitin" }, { segment: HUMAN_IDS.legR });
    apply(b, "organ", { organ: organ("spines"), mount: "growth" }, { segment: HUMAN_IDS.legL });
    const counts = familyCounts(b);
    expect(counts.limbs).toBe(1);
    expect(counts.senses).toBe(1);
    expect(counts.glands).toBe(1);
    expect(counts.covers).toBe(2);
    expect(counts.heads).toBe(0);
  });

  it("determinism: the same seed applies the catalog the same way", () => {
    const run = (seed: number): string => {
      const rng = new Rng(seed);
      const b = human();
      for (let i = 0; i < 30; i++) {
        const m = MUTATIONS[Math.floor(rng.next() * MUTATIONS.length)]!;
        applyMutation(b, m, rng, { source: i % 3 === 0 ? "abyss" : undefined });
        expect(validate(b), `seed ${seed} step ${i} ${m.id}\n${bodyToText(b)}`).toEqual([]);
        expect(mass(b)).toBeLessThanOrEqual(b.meat + 1e-9);
        expect(mass(b)).toBeLessThanOrEqual(skeletonCeiling(b) + 1e-9);
      }
      return bodyHash(b);
    };
    for (let seed = 1; seed <= 100; seed++) expect(run(seed)).toBe(run(seed));
    expect(run(1)).not.toBe(run(2));
  });

  it("control load and cap stay finite over a catalog run", () => {
    const rng = new Rng(77);
    const b = human();
    for (let i = 0; i < 40; i++) applyMutation(b, MUTATIONS[Math.floor(rng.next() * MUTATIONS.length)]!, rng);
    expect(Number.isFinite(controlLoad(b))).toBe(true);
    expect(controlCap(b)).toBeGreaterThanOrEqual(10);
  });
});

describe("a head grows where there is room, not where an id says (decision 160)", () => {
  it("no row names a place in its id: the catalog holds no head on a palm and no penis on the forehead", () => {
    for (const id of ["headOnHand", "headOnJoint", "penisOnForehead"]) expect(MUTATIONS.some((m) => m.id === id), id).toBe(false);
    const heads = MUTATIONS.filter((m) => m.family === "heads");
    expect(heads.some((m) => m.id === "secondHead")).toBe(true);
    expect(heads.some((m) => m.id === "headAnywhere")).toBe(true);
  });

  it("a head anywhere comes whole - a brain, an eye, a jaw and an ear - and lands on nodes of every kind", () => {
    const b = human(400);
    const m = byId("headAnywhere");
    const contents = (m.payload as { ending: { contents: { kind: string }[] } }).ending.contents.map((c) => c.kind);
    expect(contents).toEqual(["smallBrain", "eye", "jaw", "ear"]);
    const nodes = mutationTargets(b, m)
      .map((w) => w.target)
      .filter((t) => "node" in t)
      .map((t) => (t as { node: number }).node);
    // Not one place but many: the shoulder, the hand, the knee - the rule names none of them.
    expect(nodes.length).toBeGreaterThan(5);
    expect(nodes).toContain(HUMAN_IDS.handL);
    expect(nodes).toContain(HUMAN_IDS.shoulderL);
    const r = applyMutation(b, m, new Rng("head-anywhere"))!;
    expect(r.fallback).toBe(false);
    expect(validate(b)).toEqual([]);
    expect(brains(b).length).toBe(2);
  });
});

describe("an organ already in place steps to another size (decision 164)", () => {
  it("the jaw in the human's head grows huge and shrinks again; a second jaw never fits, so the row is a RESIZE", () => {
    const b = human(400);
    const huge = byId("hugeJaw");
    expect(huge.op).toBe("resize");
    const before = mass(b);
    const t = mutationTargets(b, huge).map((w) => w.target);
    expect(t).toEqual([{ ending: { node: HUMAN_IDS.head, index: 0 } }]);
    const r = applyMutation(b, huge, new Rng("resize"))!;
    expect(r.fallback).toBe(false);
    const jaws = [...organs(b)].filter((o) => o.kind === "jaw");
    expect(jaws).toHaveLength(1);
    expect(jaws[0]!.size).toBe("huge");
    expect(mass(b)).toBeGreaterThan(before);
    expect(r.grown).toBe(mass(b) - before);
    expect(validate(b)).toEqual([]);
    // A step that is already taken is no place at all; the other way round still is.
    expect(mutationTargets(b, huge)).toEqual([]);
    expect(mutationTargets(b, byId("smallJaw")).length).toBe(1);
    applyMutation(b, byId("smallJaw"), new Rng("resize-small"));
    expect([...organs(b)].find((o) => o.kind === "jaw")!.size).toBe("small");
    expect(mass(b)).toBeLessThan(before + 1e-9);
    expect(validate(b)).toEqual([]);
  });

  it("a kind with no steps and a body without that organ give no target", () => {
    const b = human(400);
    // Nothing of the kind in the body: the human has no pincer, so the step waits.
    const pincerStep: Mutation = { ...byId("hugeJaw"), id: "test", payload: { kind: "pincer", size: "huge" } } as Mutation;
    expect(mutationTargets(b, pincerStep)).toEqual([]);
    applyMutationAt(b, byId("pincerHand"), { ending: { node: HUMAN_IDS.handL, index: 0 } });
    expect(mutationTargets(b, pincerStep).map((w) => w.target)).toEqual([{ ending: { node: HUMAN_IDS.handL, index: 0 } }]);
  });
});

describe("nothing grows on the tip of a penis (decision 161)", () => {
  it("no row of the catalog takes the tip, and none joints the penis itself", () => {
    const b = human(400);
    const tip = b.segments[HUMAN_IDS.penis]!.b;
    for (const m of MUTATIONS) {
      for (const w of mutationTargets(b, m)) {
        const t = w.target;
        if ("node" in t) expect(t.node, m.id).not.toBe(tip);
        if ("ending" in t) expect(t.ending.node, m.id).not.toBe(tip);
        if ("pair" in t) expect(t.pair, m.id).not.toContain(tip);
        if ("segment" in t && m.op === "joint") expect(b.segments[t.segment]!.kind, m.id).not.toBe("penis");
      }
    }
  });

  it("three sizes and no fourth: the penis weighs one, two, three and strikes at the third", () => {
    const b = human(400);
    const grow = byId("penisGrowth");
    const sizes: number[] = [];
    for (let i = 0; i < 4; i++) {
      const before = b.segments[HUMAN_IDS.penis]!.length;
      applyMutation(b, grow, new Rng(`size-${i}`), { needs: false });
      const s = b.segments[HUMAN_IDS.penis]!;
      if (s.length !== before) sizes.push(s.length);
    }
    expect(sizes).toEqual([2, 3]);
    expect(segmentMass(b.segments[HUMAN_IDS.penis]!)).toBe(3);
    expect(derive(b).attacks.some((a) => a.segment === HUMAN_IDS.penis)).toBe(true);
    expect(validate(b)).toEqual([]);
  });
});
