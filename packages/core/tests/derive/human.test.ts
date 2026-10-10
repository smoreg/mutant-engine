import { describe, expect, it } from "vitest";
import { HUMAN_IDS, breathCost, derive, human } from "../../index.js";

const H = HUMAN_IDS;

/** The human of body-graph.md §2 derives to the numbers of body.md §8, §10 and breath.md §1-2. */
describe("human derives to body.md and breath.md numbers", () => {
  const d = derive(human());

  it("attacks: a bite and two hands at 1d3, two feet at 1d2, all reaching 1", () => {
    expect(d.attacks.map((a) => [a.node, a.kind, a.dice, a.reach, a.segment])).toEqual([
      [H.head, "jaw", "1d3", 1, null],
      [H.handL, "hand", "1d3", 1, H.forearmL],
      [H.handR, "hand", "1d3", 1, H.forearmR],
      [H.footL, "foot", "1d2", 1, H.shinL],
      [H.footR, "foot", "1d2", 1, H.shinR],
    ]);
    // A hand strikes with its forearm and upper arm: 2 + 3 + 3 of mass; the shoulder's flank adds nothing.
    expect(d.attacks[1]!.mass).toBe(8);
    expect(d.attacks[1]!.chain).toEqual([H.forearmL, H.armL]);
  });

  it("speed: two stands of 3 on legs of 2 are the base, 100", () => {
    expect(d.speed.value).toBe(100);
    expect(d.speed.ring).toBe(false);
    expect(d.speed.stands.map((s) => [s.node, s.level, s.length])).toEqual([
      [H.footL, 3, 2],
      [H.footR, 3, 2],
    ]);
  });

  it("grip: two precise grips of two", () => {
    expect(d.grips.list.map((g) => [g.node, g.level])).toEqual([
      [H.handL, 2],
      [H.handR, 2],
    ]);
    expect(d.grips.precise).toBe(2);
    expect(d.grips.total).toBe(2);
  });

  it("locomotion: no digging, climbing, swimming or flight; falls into holes; lays no egg", () => {
    expect(d.locomotion).toMatchObject({ dig: 0, climb: false, swim: false, fly: false, wings: [], edge: false, falls: true, squeeze: 0, layEgg: false });
  });

  it("bulk 3, one cell, passes width 1", () => {
    expect(d.bulk).toBe(3);
    expect(d.footprint).toBe(1);
    expect(d.passage).toEqual({ bulk: 3, free: 1, squeeze: 1, slits: false, cycles: 0 });
  });

  // The penis adds 1 to the total (34 -> 35) and shaves a point off the torso, the head and each limb.
  it("exposure: torso 34 %, head 11 %, arm with hand 12 %, leg with foot 12 %, neck 3 %, penis 3 %", () => {
    const share = (id: number) => d.exposure.parts.find((p) => p.id === id)!.share;
    const pct = (x: number) => Math.round(x * 100);
    expect(d.exposure.total).toBe(35);
    expect(pct(share(H.torso))).toBe(34);
    expect(pct(share(H.head))).toBe(11);
    expect(pct(share(H.armL) + share(H.forearmL) + share(H.handL))).toBe(12);
    expect(pct(share(H.legL) + share(H.shinL) + share(H.footL))).toBe(12);
    expect(pct(share(H.neck))).toBe(3);
    expect(pct(share(H.penis))).toBe(3);
    expect(share(H.chest)).toBe(0);
    expect(share(H.elbowL)).toBe(0);
    expect(share(H.penisTip)).toBe(0);
    expect(d.exposure.parts.reduce((s, p) => s + p.share, 0)).toBeCloseTo(1, 9);
  });

  // The head is 5 of the 13 the five endings share, and the crowd halves that
  // lead: 3.8 against 2.3 a hand (decision 591). The flesh keeps bare area, so
  // the torso stays where body-graph.md §10 put it.
  it("the crowd of endings: the head drops from 14 % to 11 %, a hand rises, the torso does not move", () => {
    const w = (id: number) => d.exposure.parts.find((p) => p.id === id)!.weight;
    const area = (id: number) => d.exposure.parts.find((p) => p.id === id)!.area;
    expect(area(H.head)).toBe(5);
    expect(w(H.head)).toBeCloseTo(3.8, 9);
    expect(w(H.handL)).toBeCloseTo(2.3, 9);
    expect(w(H.torso)).toBe(area(H.torso));
    expect(w(H.neck)).toBe(area(H.neck));
    const ends = [H.head, H.handL, H.handR, H.footL, H.footR];
    expect(ends.reduce((s, id) => s + w(id), 0)).toBeCloseTo(13, 9);
  });

  it("armor: skin everywhere is 0", () => {
    expect(d.armor.mean).toBe(0);
    expect(d.armor.parts.every((p) => p.defense === 0)).toBe(true);
    expect(d.armor.parts.map((p) => p.id)).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
  });

  it("senses: one viewpoint with two eyes, two ears, one nose, speech", () => {
    expect(d.senses).toEqual({
      viewpoints: [{ node: H.head, eyes: 2, heat: false }],
      sight: true,
      heat: false,
      echo: false,
      deep: false,
      electro: false,
      light: false,
      hearing: 2,
      hearingAt: [H.head],
      smell: 1,
      speak: true,
    });
  });

  // Blood and the base scale with mass: 101, not 100, so blood 12.12 and the base 1.0025.
  it("breath: air 20.12 (lungs 5, blood 12.12, muscle 3), intake 3 of air, base 1.0025, delivery 2", () => {
    expect(d.breath.organs).toEqual([{ kind: "lungs", at: H.torso, air: 3, water: 0, tank: 5 }]);
    expect(d.breath.intake).toEqual({ air: 3, water: 0 });
    expect(d.breath.tank.lungs).toBe(5);
    expect(d.breath.tank.blood).toBeCloseTo(12.12, 9);
    expect(d.breath.tank.muscle).toBe(3);
    expect(d.breath.tank.common).toBeCloseTo(17.12, 9);
    expect(d.breath.tank.total).toBeCloseTo(20.12, 9);
    expect(d.breath.base).toBeCloseTo(1.0025, 9);
    expect(d.breath.delivery).toBe(2);
    expect(d.breath.media).toEqual(["air"]);
  });

  it("breath cost by action: muscles are the graph's mass, not body.md's", () => {
    // Legs with feet 9 each, arms with hands 8 each: from the segment table, lighter than body.md §8.
    expect(d.breath.muscles).toEqual({ stands: 18, limbs: 34, wings: 0, dig: 0, manipulator: 8 });
    // The penis is no limb in this table: it adds only its mass to the base.
    const base = 1.0025;
    expect(breathCost(d, "rest")).toBeCloseTo(base, 9);
    expect(breathCost(d, "step")).toBeCloseTo(base + 0.2 * 1.8, 9);
    expect(breathCost(d, "swim")).toBeCloseTo(base + 0.3 * 3.4, 9);
    expect(breathCost(d, "strike", 1)).toBeCloseTo(base + 0.7 * 0.8, 9);
    expect(breathCost(d, "strike", 3)).toBeCloseTo(base + 0.7 * 0.9, 9);
    expect(breathCost(d, "climb")).toBeCloseTo(base + 0.4 * 3.4, 9);
    expect(breathCost(d, "surgery")).toBeCloseTo(base + 0.2 * 0.8, 9);
    expect(breathCost(d, "dig")).toBeCloseTo(base, 9);
    expect(breathCost(d, "fly")).toBeCloseTo(base, 9);
  });

  it("budgets: mass 101 of 101, upkeep 20, control 10 of 10", () => {
    expect(d.budgets).toMatchObject({ mass: 101, meat: 101, ceiling: 160, upkeep: 20, control: { load: 10, cap: 10 } });
    expect(Object.values(d.budgets.parts).every((n) => n === 0)).toBe(true);
    expect(d.budgets.alien).toBe(0);
  });

  it("blood: one heart in the torso, nothing starving", () => {
    expect(d.blood).toEqual({ hearts: [H.torso], starving: [] });
  });

  it("eats through the jaw", () => {
    expect(d.eat).toEqual({ can: true, mouths: [{ node: H.head, index: 0, kind: "jaw", fed: true }] });
  });

  it("gear: gloves on both hands, boots on both feet, a helmet, a vest, a backpack, a belt and a holster on the torso", () => {
    expect(d.gear).toEqual([
      { pattern: "glove", node: H.handL, index: 0 },
      { pattern: "glove", node: H.handR, index: 0 },
      { pattern: "boot", node: H.footL, index: 0 },
      { pattern: "boot", node: H.footR, index: 0 },
      { pattern: "helmet", node: H.head, index: 0 },
      { pattern: "vest", segment: H.torso },
      { pattern: "backpack", segment: H.torso },
      { pattern: "belt", segment: H.torso },
      { pattern: "holster", segment: H.torso },
    ]);
  });
});
