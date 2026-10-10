import { describe, expect, it } from "vitest";
import { SWAMP_IDS, breathCost, derive, familyCounts, swampMutant, validate } from "../../index.js";

const S = SWAMP_IDS;

/**
 * The mutant from the Swamp, body-graph.md §7, as the second reference body:
 * every derived quantity written out. Mass 156 (segments 107, organs 49),
 * exposure total 56 with the gill sheet at 4.
 */
describe("Swamp mutant derives to its table", () => {
  const b = swampMutant();
  const d = derive(b);

  it("is a sound body", () => {
    expect(validate(b)).toEqual([]);
  });

  it("attacks: bite, mouth on the elbow, hand, two feet", () => {
    expect(d.attacks.map((a) => [a.node, a.kind, a.dice, a.reach, a.segment, a.mass])).toEqual([
      [S.head, "jaw", "1d3", 1, null, 3],
      [S.elbow, "mouth", "1d6", 1, S.armUpper, 5],
      [S.hand, "hand", "1d3", 1, S.armLower, 8],
      [S.footL, "foot", "1d2", 1, S.legL, 9],
      [S.footR, "foot", "1d2", 1, S.legR, 9],
    ]);
    expect(d.attacks[2]!.chain).toEqual([S.armLower, S.armUpper]);
  });

  it("speed 82 on two legs: they carry 143 and the gills on the human's 6 of support (decisions 1261, 1292); the gill cycle of three is no ring", () => {
    expect(d.speed.value).toBe(82);
    expect(d.speed.ring).toBe(false);
    expect(d.speed.support).toBe(6);
  });

  it("grip: one precise grip; the mouth on the arm holds nothing", () => {
    expect(d.grips).toEqual({ list: [{ node: S.hand, index: 0, kind: "hand", level: 2, segment: S.armLower }], precise: 1, total: 1 });
  });

  it("locomotion: the suckered tentacle joins two nodes and carries no ending, so nothing climbs", () => {
    expect(d.locomotion).toEqual({ dig: 0, climb: false, ceiling: false, swim: false, fly: false, wings: [], edge: false, falls: true, squeeze: 0, layEgg: false });
  });

  it("bulk 4: one cell, passes width 2 freely and squeezes into 1 with one cycle to pay for", () => {
    expect(d.bulk).toBe(4);
    expect(d.footprint).toBe(1);
    expect(d.passage).toEqual({ bulk: 4, free: 2, squeeze: 1, slits: false, cycles: 1 });
  });

  it("exposure: 56 in all, the second torso as open as the first, the gill sheet first to catch a blow", () => {
    const area = Object.fromEntries(d.exposure.parts.map((p) => [p.id, p.area]));
    expect(d.exposure.total).toBe(56);
    expect(area).toEqual({
      [S.head]: 5,
      [S.chest]: 0,
      [S.pelvis]: 0,
      [S.elbow]: 2,
      [S.hand]: 2,
      [S.shoulder2]: 5,
      [S.footL]: 2,
      [S.footR]: 2,
      [S.neck]: 1,
      [S.torso]: 12,
      [S.armUpper]: 1,
      [S.armLower]: 1,
      [S.torso2]: 12,
      [S.tentacle]: 3,
      [S.legL]: 2,
      [S.legR]: 2,
      [S.gill]: 4,
    });
    expect(d.exposure.parts.find((p) => p.id === S.gill)).toMatchObject({ kind: "membrane", share: 4 / 56 });
  });

  // Six endings share 18 of area, so each keeps half of its own and takes 1.5
  // of the crowd (decision 591): both heads come down, the four small ones go
  // up, and the flesh around them does not move at all.
  it("the crowd of endings: two heads of 5 drop to 4, an elbow of 2 rises to 2.5, the flesh is untouched", () => {
    const w = Object.fromEntries(d.exposure.parts.map((p) => [p.id, p.weight]));
    expect(w[S.head]).toBe(4);
    expect(w[S.shoulder2]).toBe(4);
    expect(w[S.elbow]).toBe(2.5);
    expect(w[S.footL]).toBe(2.5);
    expect(w[S.torso]).toBe(12);
    expect(w[S.torso2]).toBe(12);
    expect(w[S.neck]).toBe(1);
    expect(w[S.gill]).toBe(4);
    const ends = [S.head, S.shoulder2, S.elbow, S.hand, S.footL, S.footR];
    expect(ends.reduce((s, id) => s + w[id]!, 0)).toBeCloseTo(18, 9);
  });

  it("armor: chitin on the second torso covers it and the head on it", () => {
    const a = Object.fromEntries(d.armor.parts.map((p) => [p.id, p.defense]));
    expect(a[S.torso2]).toBe(2);
    expect(a[S.shoulder2]).toBe(2);
    expect(a[S.torso]).toBe(0);
    expect(a[S.head]).toBe(0);
    expect(a[S.chest]).toBe(0);
    // Weighted by what a blow actually finds, not by bare area: the chitin
    // torso is 12 of it and the head on it 4 after the crowd (decision 591).
    expect(d.armor.mean).toBeCloseTo((2 * 16) / 56, 9);
  });

  it("senses: two viewpoints, one ear, one nose, speech from the first head", () => {
    expect(d.senses).toEqual({
      viewpoints: [
        { node: S.head, eyes: 2, heat: false },
        { node: S.shoulder2, eyes: 1, heat: false },
      ],
      sight: true,
      heat: false,
      echo: false,
      deep: false,
      electro: false,
      light: false,
      hearing: 1,
      hearingAt: [S.head],
      smell: 1,
      speak: true,
    });
  });

  it("breath: two lungs and a gill sheet; two brains breathe for two", () => {
    expect(d.breath.organs).toEqual([
      { kind: "lungs", at: S.torso, air: 3, water: 0, tank: 5 },
      { kind: "lungs", at: S.torso2, air: 3, water: 0, tank: 5 },
      { kind: "gill", at: S.gill, air: 0, water: 2, tank: 0 },
    ]);
    expect(d.breath.intake).toEqual({ air: 6, water: 2 });
    expect(d.breath.tank.lungs).toBe(10);
    // Blood is 12 per 100 of mass; the mass is 143 since flesh weighs by section (decision 1260).
    expect(d.breath.tank.blood).toBeCloseTo(17.16, 9);
    expect(d.breath.tank.muscle).toBe(3);
    expect(d.breath.tank.total).toBeCloseTo(30.16, 9);
    expect(d.breath.base).toBeCloseTo(0.5 * 2 + 0.25 + 0.25 * 1.43, 9);
    expect(d.breath.delivery).toBe(2);
    expect(d.breath.media).toEqual(["air", "water"]);
    expect(d.breath.muscles).toEqual({ stands: 18, limbs: 34, wings: 0, dig: 0, manipulator: 8 });
    expect(breathCost(d, "strike", 1)).toBeCloseTo(d.breath.base + 0.35, 9);
  });

  it("budgets: mass 143 of 220, upkeep 29, control 11 of 20", () => {
    // The second torso of girth 2 weighs by section, and the gill sheet of area 8 eats 2 (decision 1260).
    expect(d.budgets).toMatchObject({ mass: 143, meat: 220, upkeep: 29, control: { load: 11, cap: 20 } });
    expect(familyCounts(b).heads).toBe(1);
    expect(familyCounts(b).internals).toBe(2);
    expect(familyCounts(b).jaws).toBe(2);
    expect(familyCounts(b).covers).toBe(2);
  });

  it("blood: one heart, everything fed", () => {
    expect(d.blood).toEqual({ hearts: [S.torso], starving: [] });
  });

  it("eats with the jaw and the elbow mouth", () => {
    expect(d.eat).toEqual({
      can: true,
      mouths: [
        { node: S.head, index: 0, kind: "jaw", fed: true },
        { node: S.elbow, index: 0, kind: "mouth", fed: true },
      ],
    });
  });

  it("gear: a glove, two boots, two helmets; no vest or backpack while the gill sheet holds both torsos; belt and holster on either", () => {
    expect(d.gear).toEqual([
      { pattern: "glove", node: S.hand, index: 0 },
      { pattern: "boot", node: S.footL, index: 0 },
      { pattern: "boot", node: S.footR, index: 0 },
      { pattern: "helmet", node: S.head, index: 0 },
      { pattern: "helmet", node: S.shoulder2, index: 0 },
      { pattern: "belt", segment: S.torso },
      { pattern: "belt", segment: S.torso2 },
      { pattern: "holster", segment: S.torso },
      { pattern: "holster", segment: S.torso2 },
    ]);
  });
});
