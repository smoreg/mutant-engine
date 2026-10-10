import { describe, expect, it } from "vitest";
import { LabRng as Rng } from "../rng.js";
import {
  FAMILIES,
  HUMAN_IDS,
  ORGANS,
  SKELETON_CEILING,
  SPREAD,
  apply,
  applyMutation,
  applyMutationAt,
  bodyFromText,
  bodyHash,
  bodyToText,
  components,
  drawMutation,
  familyCounts,
  hasKind,
  hasTag,
  hearts,
  human,
  isVital,
  mass,
  mutationTargets,
  organ,
  organs,
  segmentIds,
  selfBrain,
  selfRef,
  skeletonCeiling,
  themeWeights,
  validate,
  type Body,
  type Mutation,
  type MutationContext,
  type Organ,
  MUTATIONS,
} from "../index.js";

function byId(id: string): Mutation {
  const m = MUTATIONS.find((x) => x.id === id);
  if (m === undefined) throw new Error(`no mutation ${id} in the catalog`);
  return m;
}

/** Organs by kind, sorted: the multiset the abyss must leave alone when nothing lands. */
function organKinds(b: Body): string {
  return [...organs(b)]
    .map((o) => o.kind)
    .sort()
    .join(",");
}

function breathing(b: Body): number {
  let n = 0;
  for (const o of organs(b)) if (ORGANS[o.kind].breath !== undefined) n += 1;
  return n;
}

/** The lab's abyss (decision 84): a defect roll of 0.3, then a themed draw, then the strike; G's numbers were measured this way. */
function strike(b: Body, rng: Rng, ctx: MutationContext = {}): ReturnType<typeof applyMutation> {
  const defect = rng.next() < 0.3;
  const m = drawMutation(MUTATIONS, rng, { body: b, defect })!;
  return applyMutation(b, m, rng, { ...ctx, source: "abyss" });
}

function leadShare(b: Body): number {
  const counts = familyCounts(b);
  let total = 0;
  let max = 0;
  for (const f of FAMILIES) {
    total += counts[f];
    max = Math.max(max, counts[f]);
  }
  return total > 0 ? max / total : 0;
}

/**
 * A human of mass 154: six arms, a bare stalk and a tumour (the fixture of the C tests). The chest and the pelvis
 * are small and full now (decision 118): the arms grow on the shoulders and the hips, the stalk on a hip. The
 * penis weighs 1: 154, not 153.
 */
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

describe("eviction at the ceiling is atomic", () => {
  it("takes the smallest set of the weakest organs: by mass, then instability, then id", () => {
    const one = heavy();
    const arm = applyMutation(one, byId("extraArm"), new Rng(1), { source: "abyss" })!;
    expect(arm.fallback).toBe(false);
    // An arm of 8 is two over the ceiling: the lighter eye goes first, and the last eye stays (decision 115), so a hand follows.
    expect(arm.displaced.map((o) => o.kind)).toEqual(["eye", "hand"]);
    expect(mass(one)).toBe(159);
    expect(one.meat).toBe(159);
    expect(validate(one)).toEqual([]);
    // A second head weighs 14: eight over the ceiling. The last eye stays (decision 115): one eye and four of the mass-2 endings make nine.
    const b = heavy();
    b.nodes[HUMAN_IDS.handR]!.ends[0]!.instability = 40;
    b.nodes[HUMAN_IDS.footL]!.ends[0]!.instability = 60;
    const before = [...organs(b)].length;
    const r = applyMutation(b, byId("secondHead"), new Rng(1), { source: "abyss" })!;
    expect(r.fallback).toBe(false);
    expect(r.op).toBe("sprout");
    expect(r.displaced.map((o) => o.kind)).toEqual(["eye", "foot", "hand", "hand", "hand"]);
    expect(r.displaced.map((o) => o.instability)).toEqual([0, 60, 40, 0, 0]);
    expect(b.nodes[HUMAN_IDS.footL]!.ends).toEqual([]);
    expect(b.nodes[HUMAN_IDS.handR]!.ends).toEqual([]);
    expect(b.nodes[HUMAN_IDS.handL]!.ends.map((o) => o.kind)).toEqual([]);
    // The hand of the arm grown first, on the left shoulder (node 32), is the next by id.
    expect(b.nodes[32]!.ends).toEqual([]);
    expect(b.nodes[HUMAN_IDS.footR]!.ends.map((o) => o.kind)).toEqual(["foot"]);
    // The head came in whole - a small brain, an eye, a jaw and an ear (decision 160): five organs for the five the abyss took.
    // The ear and the jaw weigh nothing, so the mass is the same as when the head was four; only the count moved.
    expect([...organs(b)].length).toBe(before - 5 + 5);
    expect(mass(b)).toBeLessThanOrEqual(SKELETON_CEILING);
    expect(b.meat).toBe(mass(b));
    expect(validate(b)).toEqual([]);
  });

  it("with no set that fits nothing leaves: the mutation is a tumour, and at the ceiling it is lost", () => {
    // Since step I the abyss sheds hanging limbs too, so the human's arms and legs would pay for the overweight (30); a
    // trunk without limbs has only its eyes and its stomach to give, 6 in all.
    const trunk = (): Body => {
      const t = bodyFromText(`
        1[2] {голова(мозг*, глаз, глаз, челюсть, ухо, ухо, нос)}
        2[3]
        3[3]
        1 -шея:1/1 кожа- 2
        2 -корпус:2/3 кожа {сердце, лёгкие, желудок}- 3
      `);
      t.meat = mass(t);
      return t;
    };
    const b = trunk();
    const kinds = organKinds(b);
    const m0 = mass(b);
    const r = applyMutation(b, byId("overweight"), new Rng(1), { source: "abyss", ceiling: m0 });
    expect(r).toBeNull();
    expect(organKinds(b)).toBe(kinds);
    expect(mass(b)).toBe(m0);
    expect(b.meat).toBe(m0);
    // With room for a tumour the tumour grows and still no organ leaves.
    const c = trunk();
    const t = applyMutation(c, byId("overweight"), new Rng(1), { source: "abyss", ceiling: m0 + 4 })!;
    expect(t.fallback).toBe(true);
    expect(t.displaced).toEqual([]);
    expect(t.shed).toEqual([]);
    expect(organKinds(c)).toBe(kinds);
    // Other sources never evict.
    const d = heavy();
    const meat = applyMutation(d, byId("extraArm"), new Rng(1))!;
    expect(meat.fallback).toBe(true);
    expect(meat.displaced).toEqual([]);
  });

  it("an ending before your head may leave: self follows the brain", () => {
    const b = bodyFromText(`
      1[3] {глаз, глаз, голова(мозг*)}
      2[3]
      1 -шея:1/1 кожа- 2
    `);
    b.meat = mass(b);
    // Two eyes: the last one is vital (decision 115), so one of them may leave.
    expect(selfRef(b)).toEqual({ node: 1, end: 2 });
    const r = applyMutation(b, byId("pincerHand"), new Rng(1), { source: "abyss", ceiling: mass(b) });
    // No hand to reborn: nothing to do with an eye. Grow a hand first.
    expect(r).toBeNull();
    b.meat = 1000;
    apply(b, "sprout", { kind: "arm", length: 1, girth: 1, cover: "skin", ending: organ("hand") }, { node: 2 });
    b.meat = mass(b);
    const up = applyMutation(b, byId("pincerHand"), new Rng(1), { source: "abyss", ceiling: mass(b) })!;
    expect(up.fallback).toBe(false);
    expect(up.displaced.map((o) => o.kind)).toEqual(["eye"]);
    expect(b.nodes[1]!.ends.map((o) => o.kind)).toEqual(["eye", "head"]);
    expect(selfRef(b)).toEqual({ node: 1, end: 1 });
    expect(selfBrain(b)?.kind).toBe("brain");
    expect(validate(b)).toEqual([]);
  });

  it("2000 strikes at the ceiling: never an organ lost without a mutation that landed", () => {
    let atCeiling = 0;
    let evicted = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const rng = new Rng(`h-atomic-${seed}`);
      const b = human();
      for (let i = 0; i < 50; i++) {
        const before = organKinds(b);
        const full = mass(b) > SKELETON_CEILING - 4;
        const r = strike(b, rng);
        if (full) atCeiling += 1;
        if (r === null || r.fallback) {
          expect(r?.displaced ?? [], `seed ${seed} strike ${i}: organs left for nothing`).toEqual([]);
          expect(organKinds(b), `seed ${seed} strike ${i}`).toBe(before);
        } else if (r.displaced.length > 0) {
          evicted += r.displaced.length;
          expect(r.op).not.toBe("growth");
        }
        // Since step I the ceiling is the body's own: the skeleton's, raised by bloated flesh.
        expect(mass(b)).toBeLessThanOrEqual(skeletonCeiling(b) + 1e-9);
        expect(components(b)).toHaveLength(1);
        expect(validate(b), `seed ${seed} strike ${i}\n${bodyToText(b)}`).toEqual([]);
      }
    }
    expect(atCeiling).toBeGreaterThanOrEqual(2000);
    expect(evicted).toBeGreaterThan(200);
  });
});

describe("vitals are never evicted", () => {
  it("isVital: every brain, a head with a brain, the last heart, the last breathing organ", () => {
    const b = human();
    const head = b.nodes[HUMAN_IDS.head]!.ends[0]!;
    const [heart, lungs, stomach] = b.segments[HUMAN_IDS.torso]!.cavity as [Organ, Organ, Organ];
    expect(isVital(b, head)).toBe(true);
    expect(isVital(b, head.contents!.find((o) => o.kind === "brain")!)).toBe(true);
    expect(isVital(b, head.contents!.find((o) => o.kind === "eye")!)).toBe(false);
    expect(isVital(b, heart)).toBe(true);
    expect(isVital(b, lungs)).toBe(true);
    // Since step J the last organ that digests is vital too (a body that cannot eat is dead); a second one frees it.
    expect(isVital(b, stomach)).toBe(true);
    expect(isVital(b, b.nodes[HUMAN_IDS.handL]!.ends[0]!)).toBe(false);
    const fed = human(1000);
    apply(fed, "organ", { organ: organ("stomach"), mount: "cavity" }, { segment: HUMAN_IDS.torso });
    expect(isVital(fed, fed.segments[HUMAN_IDS.torso]!.cavity[2]!)).toBe(false);
    // A second heart and a second breathing organ free the first ones; a head without a brain is flesh.
    const two = human(1000);
    apply(two, "organ", { organ: organ("heart"), mount: "cavity" }, { segment: HUMAN_IDS.torso });
    // The chest is full: the second neck grows on a shoulder.
    apply(two, "organ", { organ: organ("pores"), mount: "growth" }, { segment: HUMAN_IDS.armL });
    apply(two, "sprout", { kind: "neck", length: 1, girth: 1, cover: "skin", ending: organ("head", [organ("eye")]) }, { node: HUMAN_IDS.shoulderL });
    const secondHead = two.segments[segmentIds(two)[segmentIds(two).length - 1]!]!.b;
    expect(isVital(two, two.segments[HUMAN_IDS.torso]!.cavity[0]!)).toBe(false);
    expect(isVital(two, two.segments[HUMAN_IDS.torso]!.cavity[3]!)).toBe(false);
    expect(isVital(two, two.segments[HUMAN_IDS.torso]!.cavity[1]!)).toBe(false);
    expect(isVital(two, two.nodes[secondHead]!.ends[0]!)).toBe(false);
    // A ganglion in a cavity thinks: vital.
    apply(two, "organ", { organ: organ("ganglion"), mount: "cavity" }, { segment: HUMAN_IDS.torso });
    expect(isVital(two, two.segments[HUMAN_IDS.torso]!.cavity[4]!)).toBe(true);
    // A heart in a broken segment does not pump: the other one is the last alive.
    // The upper arm of length 1 is too small for a heart and a gut brain (10 of capacity for 12): stretched to 2 it buds.
    const broken = human(1000);
    broken.segments[HUMAN_IDS.armL]!.length = 2;
    applyMutationAt(broken, byId("budding"), { segment: HUMAN_IDS.armL });
    const limb = broken.segments[HUMAN_IDS.armL]!;
    expect(isVital(broken, broken.segments[HUMAN_IDS.torso]!.cavity[0]!)).toBe(false);
    limb.hp = 0;
    expect(isVital(broken, broken.segments[HUMAN_IDS.torso]!.cavity[0]!)).toBe(true);
    expect(isVital(broken, limb.cavity[0]!)).toBe(false);
    expect(isVital(broken, limb.cavity[1]!)).toBe(true);
  });

  it("the last heart, the last breathing organ and every brain stay when the set would need them", () => {
    // A body whose only evictable flesh is two guts of 2 (the last stomach is vital since step J): an arm of 8 needs more than 4, so nothing leaves.
    const b = bodyFromText(`
      1[2] {голова(мозг*)}
      2[3]
      3[3]
      1 -шея:1/1 кожа- 2
      2 -корпус:2/3 кожа {сердце, лёгкие, желудок, кишка, кишка}- 3
    `);
    b.meat = mass(b);
    const kinds = organKinds(b);
    const r = applyMutation(b, byId("extraArm"), new Rng(1), { source: "abyss", ceiling: mass(b) });
    expect(r).toBeNull();
    expect(organKinds(b)).toBe(kinds);
    // A gland of 4 fits by the two guts alone; the heart, the lungs and the stomach are never on the list.
    const g = applyMutation(b, byId("venomGland"), new Rng(1), { source: "abyss", ceiling: mass(b) })!;
    expect(g.fallback).toBe(false);
    expect(g.displaced.map((o) => o.kind)).toEqual(["gut", "gut"]);
    expect(hearts(b)).toHaveLength(1);
    expect(breathing(b)).toBe(1);
    expect(b.segments[5]!.cavity.some((o) => o.kind === "stomach")).toBe(true);
    expect(validate(b)).toEqual([]);
  });

  it("100 seeds x 60 strikes: no body without a heart, a brain or a breathing organ by eviction", () => {
    let evictedHearts = 0;
    let evictedBreath = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const rng = new Rng(`h-vital-${seed}`);
      const b = human();
      for (let i = 0; i < 60; i++) {
        const r = strike(b, rng);
        const where = `seed ${seed} strike ${i}`;
        for (const o of r?.displaced ?? []) {
          expect(hasTag(o.kind, "brain"), where).toBe(false);
          expect(o.kind === "head" && hasKind(o.contents ?? [], "brain"), where).toBe(false);
          if (o.kind === "heart") {
            evictedHearts += 1;
            expect(hearts(b).length, where).toBeGreaterThanOrEqual(1);
          }
          if (ORGANS[o.kind].breath !== undefined) {
            evictedBreath += 1;
            expect(breathing(b), where).toBeGreaterThanOrEqual(1);
          }
        }
        expect(hearts(b).length, where).toBeGreaterThanOrEqual(1);
        expect(selfBrain(b), where).toBeDefined();
        if (i % 10 === 9) expect(validate(b), `${where}\n${bodyToText(b)}`).toEqual([]);
      }
    }
    console.log(`evicted while another remained: hearts ${evictedHearts}, breathing organs ${evictedBreath}`);
  });
});

describe("the abyss rewrites instead of piling up", () => {
  interface Tally {
    lost: number;
    tumours: number;
    displaced: number;
    /** Strikes at the ceiling (no room even for a tumour) that landed flesh of mass above zero. */
    fullAndFleshy: number;
    full: number;
    /** Mean defect organs per body. */
    defects: number;
    lead: number;
    noHeart: number;
  }

  function tally(seeds: number, strikes: number, ctx: MutationContext = {}): Tally {
    const t: Tally = { lost: 0, tumours: 0, displaced: 0, fullAndFleshy: 0, full: 0, defects: 0, lead: 0, noHeart: 0 };
    const total = seeds * strikes;
    for (let seed = 1; seed <= seeds; seed++) {
      const rng = new Rng(`h-loss-${seed}`);
      const b = human();
      for (let i = 0; i < strikes; i++) {
        const full = mass(b) > SKELETON_CEILING - 4;
        const r = strike(b, rng, ctx);
        if (full) t.full += 1;
        if (r === null) t.lost += 1 / total;
        else if (r.fallback) t.tumours += 1 / total;
        else {
          t.displaced += r.displaced.length;
          if (full && (r.grown > 0 || r.displaced.length > 0)) t.fullAndFleshy += 1;
        }
      }
      t.defects += familyCounts(b).defects / seeds;
      if (hearts(b).length === 0) t.noHeart += 1;
      t.lead += leadShare(b) / seeds;
    }
    return t;
  }

  it("abyss losses: 100 seeds x 30 strikes lose under a tenth of the strikes (G measured 0.186)", () => {
    const t = tally(100, 30);
    console.log(`abyss 100 x 30: lost ${t.lost.toFixed(3)}, tumours ${t.tumours.toFixed(3)}, organs evicted ${t.displaced}, at the ceiling ${t.full} strikes of which ${t.fullAndFleshy} landed flesh, lead share ${t.lead.toFixed(3)}, without a heart ${t.noHeart}`);
    // Measured 0.097 (the lab's own count: 0.091). What is still lost: rows aimed at a hand or a foot after the abyss took
    // them (a head on a hand, a claw, a hoof, a fork), rows of 27-47 mass no set of organs pays for, membranes without a cycle.
    expect(t.lost).toBeLessThan(0.1);
    expect(t.noHeart).toBe(0);
    // Before H a strike at the ceiling landed flesh in 0.196 of the cases - and only the one organ's worth it had just pushed out.
    expect(t.fullAndFleshy / t.full).toBeGreaterThan(0.4);
  });

  it("defect convergence: the ceiling no longer pushes the body toward defects", () => {
    // G read the defects piling up as the ceiling letting only mass-0 organs land. They pile up without a ceiling too:
    // it is the lab's abyss rolling a defect 30 % of the time (body-graph.md, decisions of step H). Measured 0.97 defect
    // organs per body at the ceiling against 3.68 without one: the ceiling does not add them, eviction takes them.
    const ceiling = tally(100, 30);
    const none = tally(100, 30, { ceiling: 100_000 });
    console.log(`defects per body: ${ceiling.defects.toFixed(2)} at the ceiling, ${none.defects.toFixed(2)} without one`);
    expect(ceiling.defects).toBeLessThanOrEqual(none.defects + 0.5);
    expect(none.lost).toBe(0);
  });
});

describe("theme with a ceiling", () => {
  it("the theme multiplier of a row never exceeds the cap", () => {
    // 4 (the spec's start) left "tentacle attracts tentacles" at 0.21 against 0.166 on the human; 20 keeps it at 0.43 and the formless body at 13 %.
    expect(SPREAD.themeCap).toBe(20);
    const b = human();
    applyMutationAt(b, byId("amorphous"), { node: HUMAN_IDS.head });
    const w = new Map(themeWeights(b, MUTATIONS).map((x) => [x.mutation.id, x.weight]));
    // Five tentacles and four pseudopods, all of the limbs family: raw (1 + 3) x (1 + 3 x 5) = 64 for the tentacle row.
    expect(w.get("tentacle")).toBeCloseTo(8 * Math.min(SPREAD.themeCap, 64));
    expect(w.get("pseudopodLimb")).toBeCloseTo(6 * Math.min(SPREAD.themeCap, 4 * (1 + 3 * 9)));
    expect(w.get("venomGland")).toBeCloseTo(6);
    for (const { mutation, weight } of themeWeights(b, MUTATIONS)) expect(weight, mutation.id).toBeLessThanOrEqual(mutation.chance * SPREAD.themeCap + 1e-9);
  });

  it("after amorphousness the tentacle row takes at most 15 % of the draws (G measured 26 %)", () => {
    const b = human();
    applyMutationAt(b, byId("amorphous"), { node: HUMAN_IDS.head });
    const rng = new Rng("h-theme");
    const N = 4000;
    let tentacle = 0;
    for (let i = 0; i < N; i++) if (drawMutation(MUTATIONS, rng, { body: b, defect: false })!.id === "tentacle") tentacle += 1;
    console.log(`after amorphousness: tentacle row ${(tentacle / N).toFixed(3)}`);
    expect(tentacle / N).toBeLessThanOrEqual(0.15);
  });
});

describe("anatomical affinity", () => {
  it("a sprout whose ending is already next door weighs twice at that node; heads and mouths do not", () => {
    // "Next door" is the root of the limb whose tip holds the ending: the foot's leg bends at the knee and starts at
    // the hip, the hand's arm at the shoulder. The chest and the pelvis are full and take no sprout; the elbows and
    // knees of the human are bare joints of a two-segment limb and draw no fork either.
    const b = human();
    const leg = new Map(mutationTargets(b, byId("extraLeg"), { spread: false }).map((w) => [JSON.stringify(w.target), w.weight]));
    expect(leg.get(JSON.stringify({ node: HUMAN_IDS.hipL }))).toBeCloseTo(2);
    expect(leg.get(JSON.stringify({ node: HUMAN_IDS.hipR }))).toBeCloseTo(2);
    expect(leg.get(JSON.stringify({ node: HUMAN_IDS.shoulderL }))).toBeCloseTo(1);
    expect(leg.get(JSON.stringify({ node: HUMAN_IDS.head }))).toBeCloseTo(1);
    expect(leg.get(JSON.stringify({ node: HUMAN_IDS.kneeL }))).toBeUndefined();
    const arm = new Map(mutationTargets(b, byId("extraArm"), { spread: false }).map((w) => [JSON.stringify(w.target), w.weight]));
    expect(arm.get(JSON.stringify({ node: HUMAN_IDS.shoulderL }))).toBeCloseTo(2);
    expect(arm.get(JSON.stringify({ node: HUMAN_IDS.shoulderR }))).toBeCloseTo(2);
    expect(arm.get(JSON.stringify({ node: HUMAN_IDS.hipL }))).toBeCloseTo(1);
    expect(arm.get(JSON.stringify({ node: HUMAN_IDS.elbowL }))).toBeUndefined();
    expect(arm.get(JSON.stringify({ node: HUMAN_IDS.kneeL }))).toBeUndefined();
    // The hand's own node is the tip, not the root: no affinity there.
    expect(arm.get(JSON.stringify({ node: HUMAN_IDS.handL }))).toBeCloseTo(1);
    const head = new Map(mutationTargets(b, byId("secondHead"), { spread: false }).map((w) => [JSON.stringify(w.target), w.weight]));
    expect(head.get(JSON.stringify({ node: HUMAN_IDS.shoulderL }))).toBeCloseTo(1);
    // A tail with no ending at all, or a mouth on a stalk: no affinity either.
    const stalk = byId("stalkEye");
    const mouth: Mutation = { id: "test-mouth", family: stalk.family, target: {}, chance: 1, tags: [], i18n: stalk.i18n, op: "sprout", payload: { kind: "stalk", length: 1, girth: 1, cover: "skin", ending: organ("mouth") } };
    apply(b, "rebirth", { ending: organ("mouth") }, { ending: { node: HUMAN_IDS.handL, index: 0 } });
    for (const w of mutationTargets(b, mouth, { spread: false })) expect(w.weight).toBe(1);
    for (const w of mutationTargets(b, byId("whipTail"), { spread: false })) expect(w.weight).toBe(1);
  });

  it("leg affinity: the extra leg grows from the pelvis at least twice as often as from the chest", () => {
    const count = (ctx: MutationContext): { pelvis: number; chest: number } => {
      const out = { pelvis: 0, chest: 0 };
      for (let seed = 1; seed <= 2000; seed++) {
        const r = applyMutation(human(), byId("extraLeg"), new Rng(`h-leg-${seed}`), ctx)!;
        const node = (r.target as { node: number }).node;
        if (node === HUMAN_IDS.pelvis) out.pelvis += 1;
        if (node === HUMAN_IDS.chest) out.chest += 1;
      }
      return out;
    };
    const abyss = count({ source: "abyss" });
    const plain = count({});
    console.log(`extra leg: abyss pelvis ${abyss.pelvis} / chest ${abyss.chest}; plain pelvis ${plain.pelvis} / chest ${plain.chest}`);
    expect(abyss.pelvis).toBeGreaterThanOrEqual(2 * abyss.chest);
    expect(plain.pelvis).toBeGreaterThanOrEqual(1.6 * plain.chest);
  });
});

describe("determinism", () => {
  it("the same seed evicts the same organs and lands the same way", () => {
    const runSeed = (seed: number): { hash: string; trail: string } => {
      const rng = new Rng(`h-det-${seed}`);
      const b = human();
      const trail: string[] = [];
      for (let i = 0; i < 40; i++) {
        const r = strike(b, rng);
        trail.push(r === null ? "-" : `${r.op}:${r.displaced.map((o) => o.kind).join("+")}`);
        expect(mass(b)).toBeLessThanOrEqual(skeletonCeiling(b) + 1e-9);
        expect(mass(b)).toBeLessThanOrEqual(b.meat + 1e-9);
      }
      return { hash: bodyHash(b), trail: trail.join(" ") };
    };
    let withEvictions = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const a = runSeed(seed);
      const b = runSeed(seed);
      expect(a).toEqual(b);
      if (a.trail.includes("+") || /:[a-z]/.test(a.trail)) withEvictions += 1;
    }
    expect(withEvictions).toBeGreaterThan(40);
    expect(runSeed(1).hash).not.toBe(runSeed(2).hash);
  });
});
