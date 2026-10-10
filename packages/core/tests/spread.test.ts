import { describe, expect, it } from "vitest";
import { LabRng as Rng } from "../rng.js";
import {
  FAMILIES,
  HUMAN_IDS,
  LIMITS,
  SPREAD,
  apply,
  applyMutation,
  applyMutationAt,
  bodyHash,
  bodyToText,
  closure,
  contagionTick,
  coverTick,
  distances,
  drawMutation,
  familyCounts,
  human,
  mass,
  mutationTargets,
  neighborhoodWeight,
  nodeIds,
  organ,
  segmentIds,
  segmentsAt,
  sortedIds,
  startCoverFront,
  themeWeights,
  tick,
  validate,
  wanderTick,
  type Body,
  type Family,
  type Mutation,
  type MutationContext,
} from "../index.js";
import { MUTATIONS } from "../index.js";

function byId(id: string): Mutation {
  const m = MUTATIONS.find((x) => x.id === id);
  if (m === undefined) throw new Error(`no mutation ${id} in the catalog`);
  return m;
}

/**
 * A human with one tentacle (suckers, a sucker at the tip) grown from the left shoulder: node 32, segment 33.
 * The chest is the small neck node and full since the joints, so the tentacle takes the shoulder, a side node
 * of the torso's chest end: as far from everything as the chest, and next to both upper arms (spread.ts `touches`).
 */
function tentacled(): Body {
  const b = human();
  const r = applyMutationAt(b, byId("tentacle"), { node: HUMAN_IDS.shoulderL });
  expect(r.created).toEqual([32, 33]);
  return b;
}

function tentacles(b: Body): number[] {
  return segmentIds(b).filter((id) => b.segments[id]!.kind === "tentacle");
}

/** Path distance between two segments: the closest pair of their ends, 0 when they share a node. */
function segmentDistance(b: Body, x: number, y: number): number {
  const sx = b.segments[x]!;
  const sy = b.segments[y]!;
  let best = Infinity;
  for (const from of [sx.a, sx.b]) {
    const d = distances(b, { node: from });
    for (const to of [sy.a, sy.b]) best = Math.min(best, d[to] ?? Infinity);
  }
  return best;
}

/** Draws the next limbs mutation and applies it: did a tentacle appear within 2 of the one already there? */
function nextLimbIsTentacleNearby(b: Body, seed: string, ctx: MutationContext = {}): boolean {
  const rng = new Rng(seed);
  const before = tentacles(b);
  const m = drawMutation(MUTATIONS, rng, { family: "limbs", body: b, ...ctx })!;
  const r = applyMutation(b, m, rng, ctx);
  if (r === null || r.fallback) return false;
  const fresh = tentacles(b).filter((id) => !before.includes(id));
  if (fresh.length === 0) return false;
  if (before.length === 0) return true;
  return fresh.some((id) => before.some((old) => segmentDistance(b, id, old) <= 2));
}

function share(make: () => Body, seeds: number, prefix: string, ctx: MutationContext = {}): number {
  let hits = 0;
  for (let seed = 1; seed <= seeds; seed++) if (nextLimbIsTentacleNearby(make(), `${prefix}-${seed}`, ctx)) hits += 1;
  return hits / seeds;
}

const SEEDS = 2000;

const K = SPREAD.kTheme;

/** Step H put a ceiling on the theme: the raw multiplier of a row is capped (body-graph.md §11). */
const capped = (chance: number, raw: number): number => chance * Math.min(SPREAD.themeCap, raw);

describe("the numbers", () => {
  it("start where D-spread.md starts; kTheme is 3, not 2, since 2 left the tentacle test at +22 points", () => {
    expect(SPREAD.kFamily).toBe(1.5);
    expect(SPREAD.kTheme).toBe(3);
    expect(SPREAD.damping).toBeCloseTo(1 / 3);
    expect(SPREAD.coverTurns).toBe(30);
    expect(SPREAD.contagion).toBe(0.15);
    expect(SPREAD.pressure).toBe(5);
    expect(SPREAD.pressureTurns).toBe(50);
  });
});

describe("neighbourhood: a mutation lands next to its family", () => {
  it("weight = 1 + k x sum over organs of the family of 1 / (1 + d); the human is neutral", () => {
    const h = human();
    for (const f of FAMILIES) {
      for (const id of nodeIds(h)) expect(neighborhoodWeight(h, { node: id }, f)).toBe(1);
      for (const id of segmentIds(h)) expect(neighborhoodWeight(h, { segment: id }, f)).toBe(1);
    }
    const b = tentacled();
    // The sucker at the tip is the only limbs organ beyond the human's own: d = 0 at the tip, 3 at the shoulder and the chest, 4 at the head, 5 at a hand.
    expect(neighborhoodWeight(b, { node: 32 }, "limbs")).toBeCloseTo(1 + 1.5);
    expect(neighborhoodWeight(b, { node: HUMAN_IDS.shoulderL }, "limbs")).toBeCloseTo(1 + 1.5 / 4);
    expect(neighborhoodWeight(b, { node: HUMAN_IDS.chest }, "limbs")).toBeCloseTo(1 + 1.5 / 4);
    expect(neighborhoodWeight(b, { node: HUMAN_IDS.head }, "limbs")).toBeCloseTo(1 + 1.5 / 5);
    expect(neighborhoodWeight(b, { ending: { node: HUMAN_IDS.handL, index: 0 } }, "limbs")).toBeCloseTo(1 + 1.5 / 6);
    // A segment sits at its nearer end; the tentacle itself holds the sucker.
    expect(neighborhoodWeight(b, { segment: 33 }, "limbs")).toBeCloseTo(1 + 1.5);
    expect(neighborhoodWeight(b, { segment: HUMAN_IDS.neck }, "limbs")).toBeCloseTo(1 + 1.5 / 4);
    expect(neighborhoodWeight(b, { pair: [HUMAN_IDS.handL, 32] }, "limbs")).toBeCloseTo(1 + 1.5);
    // Another family feels nothing.
    expect(neighborhoodWeight(b, { node: 32 }, "glands")).toBe(1);
  });

  it("organs of a kind the human already has count only beyond the baseline, spread evenly", () => {
    const b = human();
    // The pelvis is small and full since the joints: the arm grows from the left hip, as far from the hands as the pelvis.
    applyMutationAt(b, byId("extraArm"), { node: HUMAN_IDS.hipL });
    // Three hands, baseline two: each hand pulls with 1 / 3. The new hand is 6 from the old ones, the old ones 4 apart.
    const hand = 1 / 3;
    expect(neighborhoodWeight(b, { node: 32 }, "limbs")).toBeCloseTo(1 + 1.5 * (hand + hand / (1 + 6) + hand / (1 + 6)));
    expect(neighborhoodWeight(b, { node: HUMAN_IDS.handL }, "limbs")).toBeCloseTo(1 + 1.5 * (hand + hand / (1 + 4) + hand / (1 + 6)));
  });

  it("covers and membranes are family members too", () => {
    const b = human(1000);
    apply(b, "cover", { cover: "chitin" }, { segment: HUMAN_IDS.legL });
    expect(neighborhoodWeight(b, { segment: HUMAN_IDS.legL }, "covers")).toBeCloseTo(2.5);
    // The other leg shares the pelvis with the chitin one: d = 0.
    expect(neighborhoodWeight(b, { segment: HUMAN_IDS.legR }, "covers")).toBeCloseTo(2.5);
    expect(neighborhoodWeight(b, { segment: HUMAN_IDS.neck }, "covers")).toBeCloseTo(1 + 1.5 / 3);
    expect(neighborhoodWeight(b, { segment: HUMAN_IDS.legL }, "limbs")).toBe(1);
    const w = human(1000);
    // A wing hangs on one bent arm, and its mirror takes one at once (decision 121): two membranes pull, both touching the chest.
    applyMutationAt(w, byId("wings"), { segment: HUMAN_IDS.armL });
    expect(neighborhoodWeight(w, { node: HUMAN_IDS.chest }, "movement")).toBeCloseTo(1 + 1.5 * 2);
    expect(neighborhoodWeight(w, { node: HUMAN_IDS.footL }, "movement")).toBeCloseTo(1 + (1.5 * 2) / (1 + 4));
  });

  it("the mutation's targets carry the weight; the flag turns it off", () => {
    const b = tentacled();
    const on = mutationTargets(b, byId("extraArm"));
    const off = mutationTargets(b, byId("extraArm"), { spread: false });
    expect(on.map((w) => w.target)).toEqual(off.map((w) => w.target));
    // With the flag off only §8 remains - and since step H the anatomical affinity in it: a shoulder, a hand's limb root, weighs 2 for an arm.
    const shoulders: number[] = [HUMAN_IDS.shoulderL, HUMAN_IDS.shoulderR];
    for (const w of off) expect(w.weight).toBe("node" in w.target && shoulders.includes(w.target.node) ? 2 : 1);
    const tip = on.find((w) => "node" in w.target && w.target.node === 32)!;
    const foot = on.find((w) => "node" in w.target && w.target.node === HUMAN_IDS.footL)!;
    expect(tip.weight).toBeCloseTo(2.5);
    expect(foot.weight).toBeCloseTo(1 + 1.5 / 8);
  });
});

describe("theme: the body pulls the draw", () => {
  it("weight = chance x (1 + k x family share) x (1 + k x features of the kind beyond the human)", () => {
    const h = human();
    for (const { mutation, weight } of themeWeights(h, MUTATIONS)) expect(weight, mutation.id).toBe(mutation.chance);
    const b = tentacled();
    const w = new Map(themeWeights(b, MUTATIONS).map((x) => [x.mutation.id, x.weight]));
    // Two features counted by family: the sucker (limbs) and the suckers cover (covers): limbs share 1 / 2.
    // A tentacle row grows three parts - a tentacle, a sucker, suckers - and the body has all three.
    expect(w.get("tentacle")).toBeCloseTo(capped(8, (1 + K * 0.5) * (1 + K * 3)));
    expect(w.get("pseudopodLimb")).toBeCloseTo(capped(6, (1 + K * 0.5) * (1 + K * 1)));
    expect(w.get("extraArm")).toBeCloseTo(capped(10, 1 + K * 0.5));
    expect(w.get("suckerTip")).toBeCloseTo(capped(4, (1 + K * 0.5) * (1 + K * 1)));
    expect(w.get("suckers")).toBeCloseTo(capped(5, (1 + K * 0.5) * (1 + K * 1)));
    expect(w.get("venomGland")).toBeCloseTo(6);
    expect(w.get("amorphous")).toBeCloseTo(capped(1, 1 + K * 1));
    // The human's own arms, legs, neck, torso, hands and feet are the baseline: only what grew beyond it pulls.
    const arms = human();
    applyMutationAt(arms, byId("extraArm"), { node: HUMAN_IDS.hipL });
    const wa = new Map(themeWeights(arms, MUTATIONS).map((x) => [x.mutation.id, x.weight]));
    expect(wa.get("extraArm")).toBeCloseTo(capped(10, (1 + K) * (1 + K * (1 + 1))));
    expect(wa.get("extraLeg")).toBeCloseTo(capped(8, 1 + K));
  });

  it("drawMutation reads the body when given one; the flag turns it off", () => {
    const b = tentacled();
    const count = (opts: Parameters<typeof drawMutation>[2]): number => {
      const rng = new Rng(11);
      let n = 0;
      for (let i = 0; i < 2000; i++) {
        const m = drawMutation(MUTATIONS, rng, { family: "limbs", ...opts })!;
        if (m.op === "sprout" && m.payload.kind === "tentacle") n += 1;
      }
      return n / 2000;
    };
    const plain = count({});
    const off = count({ body: b, spread: false });
    const themed = count({ body: b });
    expect(plain).toBeCloseTo(14 / 85, 1);
    expect(off).toBeCloseTo(plain, 1);
    expect(themed).toBeGreaterThan(plain + 0.2);
  });

  it("tentacle attracts tentacles: the next limbs mutation is a tentacle nearby far more often than on the human", () => {
    const withTentacle = share(tentacled, SEEDS, "d-tentacle");
    const plainHuman = share(human, SEEDS, "d-human");
    const flagOff = share(tentacled, SEEDS, "d-tentacle", { spread: false });
    // Measured on 2000 seeds: 0.4495 with a tentacle, 0.166 on the human, 0.1235 with the flag off (kTheme 3; kTheme 2 gave 0.3865).
    // Since the joints: 0.4105, 0.166, 0.1365 - the gap fell from 0.28 to 0.24: bent limbs add targets (shins, forearms,
    // the penis tip) more than 2 away from a tentacle at the shoulder, so the gap threshold went from 0.25 to 0.2.
    console.log(`tentacle nearby: with a tentacle ${withTentacle}, human ${plainHuman}, flag off ${flagOff}`);
    expect(plainHuman).toBeGreaterThan(0.12);
    expect(plainHuman).toBeLessThan(0.21);
    expect(flagOff).toBeLessThan(plainHuman + 0.05);
    expect(withTentacle).toBeGreaterThan(0.38);
    expect(withTentacle - plainHuman).toBeGreaterThanOrEqual(0.2);
  });

  it("theme converges: 30 abyss mutations touch fewer families and one family leads by more", () => {
    interface Spread {
      touched: number;
      lead: number;
      atThree: number;
    }
    const after = (seed: number, spread: boolean): Spread => {
      const rng = new Rng(`d-theme-${seed}`);
      const b = human();
      for (let i = 0; i < 30; i++) {
        const m = drawMutation(MUTATIONS, rng, { body: b, spread })!;
        applyMutation(b, m, rng, { source: "abyss", spread });
      }
      const counts = familyCounts(b);
      let total = 0;
      let max = 0;
      for (const f of FAMILIES) {
        total += counts[f];
        max = Math.max(max, counts[f]);
      }
      return {
        touched: FAMILIES.filter((f) => counts[f] >= 1).length,
        lead: total > 0 ? max / total : 0,
        atThree: FAMILIES.filter((f) => counts[f] >= 3).length,
      };
    };
    const mean = (spread: boolean): Spread => {
      const sum: Spread = { touched: 0, lead: 0, atThree: 0 };
      for (let seed = 1; seed <= 200; seed++) {
        const s = after(seed, spread);
        sum.touched += s.touched / 200;
        sum.lead += s.lead / 200;
        sum.atThree += s.atThree / 200;
      }
      return sum;
    };
    const on = mean(true);
    const off = mean(false);
    // Measured on 200 seeds: touched 7.3 vs 9.315, lead share 0.307 vs 0.213, families at 3+ 1.195 vs 1.04
    // (before the main merge and the joints; since the joints touched 5.67 vs 7.74, lead 0.345 vs 0.258, at 3+ 1.17 vs 1.045).
    // "Fewer families at 3+" from D-spread.md turns the right way only past 60 mutations (1.26 vs 1.395): after 30 abyss
    // strikes hardly any family reaches 3 without the spread, so gathering the draws raises that count instead of lowering it.
    console.log(`after 30 abyss mutations: families touched ${on.touched} vs ${off.touched}, lead share ${on.lead.toFixed(3)} vs ${off.lead.toFixed(3)}, at 3+ ${on.atThree} vs ${off.atThree}`);
    expect(off.touched - on.touched).toBeGreaterThan(1.5);
    expect(on.lead - off.lead).toBeGreaterThan(0.06);
  });
});

describe("segment contagion: a tentacle next door", () => {
  it("a stretched or reborn neighbour becomes a tentacle with 0.15 per adjacent tentacle", () => {
    // Since the joints an arm is two segments; only the upper arms touch the tentacle at the shoulder
    // (their shoulders anchor at the chest, as the tentacle's does), a forearm meets it nowhere and never turns.
    const upper: number[] = [HUMAN_IDS.armL, HUMAN_IDS.armR];
    let turned = 0;
    let stretched = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const b = tentacled();
      const rng = new Rng(`d-stretch-${seed}`);
      const r = applyMutation(b, byId("longArm"), rng)!;
      expect(r.fallback).toBe(false);
      if (!upper.includes((r.target as { segment: number }).segment)) {
        expect(r.infected).toBeNull();
        continue;
      }
      stretched += 1;
      if (r.infected !== null) {
        turned += 1;
        expect(b.segments[r.infected]!.kind).toBe("tentacle");
        expect([HUMAN_IDS.armL, HUMAN_IDS.armR]).toContain(r.infected);
      }
      expect(validate(b)).toEqual([]);
    }
    const p = turned / stretched;
    console.log(`stretch next to a tentacle turns: ${p}`);
    expect(Math.abs(p - SPREAD.contagion)).toBeLessThan(0.03);
    // A rebirth reads the segment the ending sits on; a leg shares no node with the tentacle. A hand sits on
    // its forearm now, far from the shoulder, so here the tentacle grows from the left hand next to the forearm.
    let legs = 0;
    let armsTurned = 0;
    for (let seed = 1; seed <= 500; seed++) {
      const b = human();
      applyMutationAt(b, byId("tentacle"), { node: HUMAN_IDS.handL });
      const r = applyMutation(b, byId("clawFoot"), new Rng(`d-rebirth-${seed}`))!;
      const node = (r.target as { ending: { node: number } }).ending.node;
      if (node !== HUMAN_IDS.handL) {
        if (node === HUMAN_IDS.footL || node === HUMAN_IDS.footR) legs += 1;
        expect(r.infected).toBeNull();
      } else if (r.infected !== null) {
        armsTurned += 1;
        expect(r.infected).toBe(HUMAN_IDS.forearmL);
      }
    }
    expect(legs).toBeGreaterThan(50);
    expect(armsTurned).toBeGreaterThan(5);
    // Two tentacles at the shoulder: 0.3 for an upper arm.
    let two = 0;
    let twoStretched = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const b = tentacled();
      applyMutationAt(b, byId("tentacle"), { node: HUMAN_IDS.shoulderL });
      const r = applyMutation(b, byId("longArm"), new Rng(`d-two-${seed}`))!;
      if (!upper.includes((r.target as { segment: number }).segment)) continue;
      twoStretched += 1;
      if (r.infected !== null) two += 1;
    }
    expect(Math.abs(two / twoStretched - 2 * SPREAD.contagion)).toBeLessThan(0.04);
  });

  it("the infected segment keeps its mass rule: the lighter kind weighs the stretch, meat follows the mass", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const b = tentacled();
      const meat = b.meat;
      const before = mass(b);
      const r = applyMutation(b, byId("longArm"), new Rng(`d-mass-${seed}`))!;
      if (r.infected === null) continue;
      // The stretch added a unit of arm (3) to an upper arm of 1; the lighter kind took part of it back: a tentacle
      // of 2 weighs 4 against the arm of 1's 3, so the body pays 1, not the arm's 3. (Before the joints the arm was
      // one segment of 2, and a tentacle of 3 weighed exactly what it did: 0.)
      expect(b.segments[r.infected]!.length).toBe(2);
      expect(r.grown).toBe(1);
      expect(b.meat).toBe(meat + 1);
      expect(mass(b)).toBe(before + 1);
      expect(mass(b)).toBeLessThanOrEqual(b.meat);
      expect(validate(b)).toEqual([]);
      return;
    }
    throw new Error("no contagion in 200 seeds");
  });

  it("with the flag off, or on the human, nothing turns and the rng is untouched", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const b = tentacled();
      const rng = new Rng(`d-off-${seed}`);
      expect(applyMutation(b, byId("longArm"), rng, { spread: false })!.infected).toBeNull();
      const h = human();
      expect(applyMutation(h, byId("longArm"), new Rng(`d-off-${seed}`))!.infected).toBeNull();
      expect(tentacles(h)).toEqual([]);
    }
  });
});

describe("cover creeps", () => {
  it("cover spreads one segment per 30 turns and stops at chrome", () => {
    const b = human(1000);
    b.segments[HUMAN_IDS.armR]!.cover = "chrome";
    const r = applyMutationAt(b, byId("chitin"), { segment: HUMAN_IDS.armL });
    expect(r.fallback).toBe(false);
    expect(b.fronts).toEqual([{ cover: "chitin", turns: 30 }]);
    const chitin = () => segmentIds(b).filter((id) => b.segments[id]!.cover === "chitin");
    for (let i = 0; i < 29; i++) expect(coverTick(b)).toEqual([]);
    expect(chitin()).toEqual([HUMAN_IDS.armL]);
    expect(coverTick(b)).toEqual([{ cover: "chitin", segment: HUMAN_IDS.neck }]);
    expect(chitin()).toEqual([HUMAN_IDS.neck, HUMAN_IDS.armL]);
    expect(b.fronts).toEqual([{ cover: "chitin", turns: 30 }]);
    for (let i = 0; i < 30; i++) coverTick(b);
    expect(chitin()).toEqual([HUMAN_IDS.neck, HUMAN_IDS.torso, HUMAN_IDS.armL]);
    for (let i = 0; i < 30 * 3; i++) coverTick(b);
    // The smallest id first: both thighs (from the pelvis), then the left forearm (from the elbow).
    expect(chitin()).toEqual([HUMAN_IDS.neck, HUMAN_IDS.torso, HUMAN_IDS.armL, HUMAN_IDS.legL, HUMAN_IDS.legR, HUMAN_IDS.forearmL]);
    for (let i = 0; i < 30 * 3; i++) coverTick(b);
    expect(chitin()).toEqual([
      HUMAN_IDS.neck,
      HUMAN_IDS.torso,
      HUMAN_IDS.armL,
      HUMAN_IDS.legL,
      HUMAN_IDS.legR,
      HUMAN_IDS.forearmL,
      HUMAN_IDS.shinL,
      HUMAN_IDS.shinR,
      HUMAN_IDS.penis,
    ]);
    // The chrome arm stops the creep, and the forearm behind it is reached from nowhere else.
    expect(b.segments[HUMAN_IDS.armR]!.cover).toBe("chrome");
    expect(b.segments[HUMAN_IDS.forearmR]!.cover).toBe("skin");
    // Nothing left to take: the front waits, and takes a fresh skin segment when one grows.
    for (let i = 0; i < 60; i++) coverTick(b);
    expect(chitin()).toHaveLength(9);
    expect(b.fronts).toHaveLength(1);
    // The pelvis is small and full since the joints: the arm grows from the left hip (node 32, segment 33).
    apply(b, "sprout", { kind: "arm", length: 1, girth: 1, cover: "skin", ending: organ("hand") }, { node: HUMAN_IDS.hipL });
    let crept: number[] = [];
    for (let i = 0; i < 30 && crept.length === 0; i++) crept = coverTick(b).map((c) => c.segment);
    expect(crept).toEqual([33]);
    expect(validate(b)).toEqual([]);
  });

  it("the border moves: neither cover holds a segment for good", () => {
    const b = human(1000);
    applyMutationAt(b, byId("chitin"), { segment: HUMAN_IDS.legL });
    for (let i = 0; i < 10; i++) coverTick(b);
    applyMutationAt(b, byId("scales"), { segment: HUMAN_IDS.armL });
    expect(b.fronts).toEqual([
      { cover: "chitin", turns: 20 },
      { cover: "scales", turns: 30 },
    ]);
    for (let i = 0; i < 300; i++) coverTick(b);
    // Flanks are no parts: they keep their skin and are left out.
    const covers = Object.fromEntries(
      segmentIds(b)
        .filter((id) => b.segments[id]!.kind !== "flank")
        .map((id) => [id, b.segments[id]!.cover]),
    );
    // Chitin took the torso first and so all below it; scales keep the neck and the left arm, and once their own
    // skin ran out they went on and took the right arm back off the chitin (decision 321).
    expect(covers).toEqual({
      [HUMAN_IDS.neck]: "scales",
      [HUMAN_IDS.torso]: "chitin",
      [HUMAN_IDS.armL]: "scales",
      [HUMAN_IDS.armR]: "scales",
      [HUMAN_IDS.legL]: "chitin",
      [HUMAN_IDS.legR]: "chitin",
      [HUMAN_IDS.forearmL]: "scales",
      [HUMAN_IDS.forearmR]: "chitin",
      [HUMAN_IDS.shinL]: "chitin",
      [HUMAN_IDS.shinR]: "chitin",
      [HUMAN_IDS.penis]: "chitin",
    });
    expect(validate(b)).toEqual([]);
  });

  it("two fronts wanting one segment on the same turn: the earlier takes it", () => {
    const b = human(1000);
    expect(startCoverFront(b, "scales")).toBe(false);
    expect(b.fronts ?? []).toEqual([]);
    // Whole legs, and the penis chrome: since the joints a shin and the penis would give chitin another way out,
    // and the torso must be the only skin either front can reach.
    b.segments[HUMAN_IDS.penis]!.cover = "chrome";
    apply(b, "cover", { cover: "scales" }, { segment: HUMAN_IDS.legR });
    apply(b, "cover", { cover: "scales" }, { segment: HUMAN_IDS.shinR });
    expect(startCoverFront(b, "scales")).toBe(true);
    expect(startCoverFront(b, "scales")).toBe(false);
    apply(b, "cover", { cover: "chitin" }, { segment: HUMAN_IDS.legL });
    apply(b, "cover", { cover: "chitin" }, { segment: HUMAN_IDS.shinL });
    startCoverFront(b, "chitin");
    expect(b.fronts!.map((f) => f.cover)).toEqual(["scales", "chitin"]);
    // Both fronts fire on turn 30 and both want the torso; the scales came first, and a segment changes hands
    // once a turn (decision 321), so chitin leaves the torso alone and goes for the scales below instead.
    let crept: { cover: string; segment: number }[] = [];
    for (let i = 0; i < 30; i++) crept = coverTick(b);
    expect(crept[0]).toEqual({ cover: "scales", segment: HUMAN_IDS.torso });
    expect(crept.some((c) => c.cover === "chitin" && c.segment === HUMAN_IDS.torso)).toBe(false);
    expect(b.segments[HUMAN_IDS.torso]!.cover).toBe("scales");
    expect(b.segments[HUMAN_IDS.neck]!.cover).toBe("skin");
  });

  it("a cut segment blocks the creep; a front whose cover left the body is dropped", () => {
    const b = human(1000);
    apply(b, "cover", { cover: "fur" }, { segment: HUMAN_IDS.legL });
    startCoverFront(b, "fur");
    b.segments[HUMAN_IDS.torso]!.hp = 0;
    for (let i = 0; i < 30; i++) coverTick(b);
    expect(b.segments[HUMAN_IDS.legR]!.cover).toBe("fur");
    expect(b.segments[HUMAN_IDS.torso]!.cover).toBe("skin");
    for (let i = 0; i < 90; i++) coverTick(b);
    // The pelvis side fills (thighs, shins, the penis); nothing crosses the cut torso to the neck and arms.
    const fur = segmentIds(b).filter((id) => b.segments[id]!.cover === "fur");
    expect(fur).toEqual([HUMAN_IDS.legL, HUMAN_IDS.legR, HUMAN_IDS.shinL, HUMAN_IDS.shinR, HUMAN_IDS.penis]);
    for (const id of fur) b.segments[id]!.cover = "skin";
    expect(coverTick(b)).toEqual([]);
    expect(b.fronts).toEqual([]);
  });

  it("plates bring their flesh and respect the ceiling", () => {
    const b = human(1000);
    apply(b, "cover", { cover: "plates" }, { segment: HUMAN_IDS.legL });
    b.meat = mass(b);
    startCoverFront(b, "plates");
    const before = mass(b);
    for (let i = 0; i < 30; i++) coverTick(b);
    expect(b.segments[HUMAN_IDS.torso]!.cover).toBe("plates");
    expect(mass(b)).toBeGreaterThan(before);
    expect(b.meat).toBeCloseTo(mass(b));
    expect(validate(b)).toEqual([]);
    const full = human(1000);
    apply(full, "cover", { cover: "plates" }, { segment: HUMAN_IDS.legL });
    full.meat = mass(full);
    startCoverFront(full, "plates");
    for (let i = 0; i < 30; i++) expect(coverTick(full, mass(full))).toEqual([]);
    expect(full.segments[HUMAN_IDS.torso]!.cover).toBe("skin");
  });

  it("the front is state: in the hash and in the text", () => {
    const a = human(1000);
    const b = human(1000);
    apply(a, "cover", { cover: "chitin" }, { segment: HUMAN_IDS.legL });
    apply(b, "cover", { cover: "chitin" }, { segment: HUMAN_IDS.legL });
    expect(bodyHash(a)).toBe(bodyHash(b));
    startCoverFront(b, "chitin");
    expect(bodyHash(a)).not.toBe(bodyHash(b));
    // The text carries it too (decision 980): the same text plus one line of the front.
    expect(bodyToText(b)).toBe(bodyToText(a).replace(/^(следующий \d+)$/m, "$1\nфронт хитин 30"));
    coverTick(b);
    b.fronts![0]!.turns = 0;
    expect(validate(b)).toContainEqual(expect.stringContaining("front"));
  });
});

describe("a tumour presses its neighbours", () => {
  it("+5 instability every 50 turns to organs on adjacent segments and endings at its nodes", () => {
    const b = human(1000);
    apply(b, "organ", { organ: organ("spines"), mount: "growth" }, { segment: HUMAN_IDS.armL });
    apply(b, "organ", { organ: organ("spines"), mount: "growth" }, { segment: HUMAN_IDS.legL });
    // The chest and the pelvis are small and full since the joints: tumours grow on the side nodes, which touch
    // what the torso end touches (spread.ts `touches`).
    apply(b, "growth", {}, { node: HUMAN_IDS.shoulderL });
    expect(b.pressure).toBeUndefined();
    for (let i = 0; i < 49; i++) expect(contagionTick(b)).toEqual([]);
    expect(b.pressure).toBe(1);
    // The elements whose organs felt it: the neck and the other arm carry nothing.
    expect(contagionTick(b)).toEqual([HUMAN_IDS.torso, HUMAN_IDS.armL]);
    expect(b.pressure).toBe(50);
    for (const o of b.segments[HUMAN_IDS.torso]!.cavity) expect(o.instability).toBe(5);
    expect(b.segments[HUMAN_IDS.armL]!.growths[0]!.instability).toBe(5);
    expect(b.segments[HUMAN_IDS.legL]!.growths[0]!.instability).toBe(0);
    expect(b.nodes[HUMAN_IDS.head]!.ends[0]!.instability).toBe(0);
    for (let i = 0; i < 50; i++) contagionTick(b);
    for (const o of b.segments[HUMAN_IDS.torso]!.cavity) expect(o.instability).toBe(10);
    // A tumour at a hand presses the hand.
    apply(b, "growth", {}, { node: HUMAN_IDS.handR });
    for (let i = 0; i < 50; i++) contagionTick(b);
    expect(b.nodes[HUMAN_IDS.handR]!.ends[0]!.instability).toBe(5);
    expect(b.nodes[HUMAN_IDS.handL]!.ends[0]!.instability).toBe(0);
    // Never above 100; two tumours press twice.
    b.segments[HUMAN_IDS.torso]!.cavity[0]!.instability = 98;
    apply(b, "growth", {}, { node: HUMAN_IDS.hipL });
    for (let i = 0; i < 50; i++) contagionTick(b);
    expect(b.segments[HUMAN_IDS.torso]!.cavity[0]!.instability).toBe(100);
    expect(b.segments[HUMAN_IDS.torso]!.cavity[1]!.instability).toBe(25);
    expect(validate(b)).toEqual([]);
  });

  it("without a tumour the clock is off; marks and chrome feel no pressure", () => {
    const b = human(1000);
    for (let i = 0; i < 10; i++) expect(contagionTick(b)).toEqual([]);
    expect(b.pressure).toBeUndefined();
    apply(b, "organ", { organ: organ("hydra"), mount: "growth" }, { segment: HUMAN_IDS.armL });
    b.nodes[HUMAN_IDS.handL]!.ends[0] = organ("implant");
    apply(b, "growth", {}, { node: HUMAN_IDS.handL });
    for (let i = 0; i < 50; i++) contagionTick(b);
    expect(b.segments[HUMAN_IDS.armL]!.growths[0]!.instability).toBe(0);
    expect(b.nodes[HUMAN_IDS.handL]!.ends[0]!.instability).toBe(0);
    const bare = human(1000);
    apply(bare, "growth", {}, { node: HUMAN_IDS.shoulderL });
    for (let i = 0; i < 50; i++) contagionTick(bare);
    expect(bare.pressure).toBe(50);
    const g = segmentIds(bare).find((id) => bare.segments[id]!.kind === "growth")!;
    const tip = bare.segments[g]!.b;
    delete bare.segments[g];
    delete bare.nodes[tip];
    expect(contagionTick(bare)).toEqual([]);
    expect(bare.pressure).toBeUndefined();
  });
});

describe("regulators damp contagion", () => {
  it("culling in the body or meditation cut every pull to a third", () => {
    const b = tentacled();
    applyMutationAt(b, byId("culling"), { segment: HUMAN_IDS.torso });
    expect(neighborhoodWeight(b, { node: 32 }, "limbs")).toBeCloseTo(1 + 0.5);
    expect(neighborhoodWeight(tentacled(), { node: 32 }, "limbs", { meditating: true })).toBeCloseTo(1 + 0.5);
    const w = new Map(themeWeights(b, MUTATIONS).map((x) => [x.mutation.id, x.weight]));
    // Three features by family now (sucker, suckers, culling): limbs share 1 / 3; every k is a third of itself.
    expect(w.get("tentacle")).toBeCloseTo(capped(8, (1 + (K / 3) / 3) * (1 + (K / 3) * 3)));
    // Only an upper arm touches the tentacle at the shoulder (see the contagion test above).
    const upper: number[] = [HUMAN_IDS.armL, HUMAN_IDS.armR];
    let turned = 0;
    let stretched = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const c = tentacled();
      const r = applyMutation(c, byId("longArm"), new Rng(`d-damp-${seed}`), { meditating: true })!;
      if (!upper.includes((r.target as { segment: number }).segment)) continue;
      stretched += 1;
      if (r.infected !== null) turned += 1;
    }
    expect(Math.abs(turned / stretched - SPREAD.contagion / 3)).toBeLessThan(0.02);
  });

  it("with a regulator the share of tentacle nearby falls", () => {
    const withCulling = (): Body => {
      const b = tentacled();
      applyMutationAt(b, byId("culling"), { segment: HUMAN_IDS.torso });
      return b;
    };
    const plain = share(tentacled, SEEDS, "d-reg");
    const culled = share(withCulling, SEEDS, "d-reg");
    const meditating = share(tentacled, SEEDS, "d-reg", { meditating: true });
    // Measured on 2000 seeds: 0.4405 plain, 0.2875 with culling, 0.2875 meditating; since the joints 0.413, 0.2965, 0.2975.
    console.log(`tentacle nearby: plain ${plain}, culling ${culled}, meditating ${meditating}`);
    expect(plain - culled).toBeGreaterThan(0.1);
    expect(plain - meditating).toBeGreaterThan(0.1);
    expect(Math.abs(culled - meditating)).toBeLessThan(0.05);
  });
});

describe("invariants", () => {
  // Full 1000 x 100 run moved to packages/core/bench/spread.test.ts (D.2); this is a x100-smaller sample
  // of the same invariant.
  it("spread never violates limits: 50 catalog mutations on 10 seeds, ticking", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const rng = new Rng(`d-limits-${seed}`);
      const b = human(100_000);
      const ctx: MutationContext = { ceiling: 100_000 };
      for (let i = 0; i < 50; i++) {
        const m = drawMutation(MUTATIONS, rng, { body: b })!;
        applyMutation(b, m, rng, i % 3 === 0 ? { ...ctx, source: "abyss" } : ctx);
        coverTick(b, 100_000);
        contagionTick(b);
        wanderTick(b, rng);
        tick(b);
        if (i % 10 === 9) expect(validate(b), `seed ${seed} step ${i} ${m.id}\n${bodyToText(b)}`).toEqual([]);
      }
      expect(nodeIds(b).length).toBeLessThanOrEqual(LIMITS.nodes);
      expect(segmentIds(b).length).toBeLessThanOrEqual(LIMITS.segments);
      expect(closure(b)).toBeLessThanOrEqual(LIMITS.cycles);
      expect(sortedIds(b.membranes).length).toBeLessThanOrEqual(LIMITS.membranes);
      // A flank takes no slot at its host's end (flank.ts).
      for (const n of nodeIds(b)) expect(segmentsAt(b, n).filter((sid) => !(b.segments[sid]!.kind === "flank" && b.segments[sid]!.a === n)).length).toBeLessThanOrEqual(2 * b.nodes[n]!.size);
      expect(mass(b)).toBeLessThanOrEqual(b.meat + 1e-9);
      expect(validate(b)).toEqual([]);
    }
  }, 300_000);

  it("determinism: the same seed spreads the same way; the flag changes the path", () => {
    const run = (seed: number, spread: boolean): string => {
      const rng = new Rng(seed);
      const b = tentacled();
      for (let i = 0; i < 40; i++) {
        const m = drawMutation(MUTATIONS, rng, { body: b, spread })!;
        applyMutation(b, m, rng, { spread, source: i % 4 === 0 ? "abyss" : undefined });
        coverTick(b);
        contagionTick(b);
        expect(validate(b), `seed ${seed} step ${i} ${m.id}\n${bodyToText(b)}`).toEqual([]);
      }
      return bodyHash(b);
    };
    let differ = 0;
    for (let seed = 1; seed <= 50; seed++) {
      expect(run(seed, true)).toBe(run(seed, true));
      expect(run(seed, false)).toBe(run(seed, false));
      if (run(seed, true) !== run(seed, false)) differ += 1;
    }
    expect(differ).toBeGreaterThan(40);
    expect(run(1, true)).not.toBe(run(2, true));
  });

  it("the human draws and lands the same with the spread on and off", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const on = new Rng(seed);
      const off = new Rng(seed);
      const a = human();
      const b = human();
      const ma = drawMutation(MUTATIONS, on, { body: a })!;
      const mb = drawMutation(MUTATIONS, off, { body: b, spread: false })!;
      expect(ma.id).toBe(mb.id);
      applyMutation(a, ma, on);
      applyMutation(b, mb, off, { spread: false });
      // A cover front is the one thing the spread adds on a human: the texts match but for its line.
      const bare = (t: string): string => t.replace(/^фронт .*\n/gm, "");
      expect(bare(bodyToText(a))).toBe(bare(bodyToText(b)));
    }
  });
});

describe("family counts stay where step C left them", () => {
  it("the human counts nothing; a suckered tentacle counts one limb and one cover", () => {
    for (const n of Object.values(familyCounts(human()))) expect(n).toBe(0);
    const counts = familyCounts(tentacled());
    const expected: Partial<Record<Family, number>> = { limbs: 1, covers: 1 };
    for (const f of FAMILIES) expect(counts[f], f).toBe(expected[f] ?? 0);
  });
});
