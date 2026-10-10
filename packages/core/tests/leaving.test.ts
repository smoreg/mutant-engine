/**
 * What the lab used to do to a body by itself and the model does now
 * (decision 1232): a part a cut takes off as a body of its own, with the
 * lifetime a brain without a heart has; and a brain's sway moved by hand.
 */
import { describe, expect, it } from "vitest";
import {
  HUMAN_IDS,
  SWAMP_IDS,
  brainAt,
  cut,
  cutOffBodies,
  human,
  mass,
  setSway,
  swampMutant,
} from "../index.js";

describe("cutOffBodies", () => {
  it("gives the forearm cut off at the elbow a body of its own, with a stump for the end that stayed", () => {
    const b = human();
    const r = cut(b, HUMAN_IDS.forearmL, "a");
    const off = cutOffBodies(r);
    expect(off).toHaveLength(r.others.length);
    expect(off.length).toBeGreaterThan(0);
    for (const o of off) {
      for (const seg of Object.values(o.body.segments)) for (const end of [seg.a, seg.b]) expect(o.body.nodes[end]).toBeDefined();
      expect(o.body.meat).toBe(mass(o.body));
      expect(o.lifetime).toBeNull();
    }
  });
});

describe("setSway", () => {
  it("holds sway inside 0..10, rounds it, and writes 0 as none", () => {
    const b = swampMutant();
    const ref = { node: SWAMP_IDS.shoulder2, end: 0 };
    const v = b.version;
    expect(setSway(b, ref, 14.2)).toEqual({ from: brainAt(swampMutant(), ref)!.sway ?? 0, to: 10 });
    expect(brainAt(b, ref)!.sway).toBe(10);
    expect(b.version).toBeGreaterThan(v);
    expect(setSway(b, ref, -3)).toEqual({ from: 10, to: 0 });
    expect(brainAt(b, ref)!.sway).toBeUndefined();
  });

  it("is null where there is no brain", () => {
    expect(setSway(human(), { node: HUMAN_IDS.handL, end: 0 }, 3)).toBeNull();
  });
});
