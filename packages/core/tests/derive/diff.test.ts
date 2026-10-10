import { describe, expect, it } from "vitest";
import { HUMAN_IDS, apply, derive, diffDerived, human, organ, summarize, swampMutant } from "../../index.js";

const H = HUMAN_IDS;

/** The gallery labels every step of growth with what it moved: a list of quantities, was -> is. */
describe("diffDerived", () => {
  it("two humans differ in nothing", () => {
    expect(diffDerived(derive(human()), derive(human()))).toEqual([]);
    const s = summarize(derive(human()));
    expect(s).toMatchObject({ speed: 100, grips: 2, precise: 2, bulk: 3, mass: 101, upkeep: 20, load: 10, channels: 10, eats: true, media: "air" });
  });

  it("a third leg moves speed, mass, upkeep, load, attacks and gear, and nothing it did not touch", () => {
    const before = derive(human(1000));
    // The pelvis is a small full node now: the third leg grows from a hip.
    const b = human(1000);
    apply(b, "sprout", { kind: "leg", length: 2, girth: 1, cover: "skin", ending: organ("foot") }, { node: H.hipL });
    const changes = diffDerived(before, derive(b));
    const by = Object.fromEntries(changes.map((c) => [c.key, [c.before, c.after]]));
    expect(by).toMatchObject({
      speed: [100, 117],
      support: [6, 9],
      mass: [101, 110],
      upkeep: [20, 22],
      load: [10, 11],
      attacks: [5, 6],
      gear: [9, 10],
    });
    expect(by.air).toBeUndefined();
    expect(by.grips).toBeUndefined();
    expect(by.fly).toBeUndefined();
    // Every key is listed once, in the order of the summary.
    const keys = changes.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    const order = Object.keys(summarize(before));
    expect(keys).toEqual(order.filter((k) => keys.includes(k)));
  });

  it("a hand reborn as a claw: one precise grip fewer, digging, climbing and an edge to hold", () => {
    const before = derive(human(1000));
    const b = human(1000);
    apply(b, "rebirth", { ending: organ("claw") }, { ending: { node: H.handL, index: 0 } });
    const by = Object.fromEntries(diffDerived(before, derive(b)).map((c) => [c.key, [c.before, c.after]]));
    // One claw does not hold a human on a wall (decision 1279): no climbing yet.
    expect(by).toMatchObject({ precise: [2, 1], dig: [0, 2], edge: [false, true], falls: [true, false], mass: [101, 100] });
    expect(by.climb).toBeUndefined();
    expect(by.grips).toBeUndefined();
  });

  it("the human and the mutant from the Swamp differ in what §7 says", () => {
    const by = Object.fromEntries(diffDerived(derive(human()), derive(swampMutant())).map((c) => [c.key, [c.before, c.after]]));
    expect(by).toMatchObject({ bulk: [3, 4], cycles: [0, 1], viewpoints: [1, 2], eyes: [2, 3], hearing: [2, 1], water: [0, 2], media: ["air", "air+water"], channels: [10, 20], mouths: [1, 2] });
  });
});
