/**
 * The three cuts of body-graph.md §12 that take no organ and no part: a
 * membrane cut off its cycle, a cover taken off a segment, a fused node
 * parted again (decisions 1226-1228). They are processes over the body, so
 * they live in the model, and the lab and the stable only call them.
 */
import { describe, expect, it } from "vitest";
import {
  HUMAN_IDS,
  addMembrane,
  apply,
  bodyFromText,
  bodyHash,
  bodyToText,
  cloneBody,
  fusions,
  human,
  mass,
  reshape,
  reshapes,
  segmentIds,
  startCoverFront,
  validate,
  type Body,
} from "../index.js";

function fused(): Body {
  const b = human();
  apply(b, "fusion", {}, { pair: [HUMAN_IDS.handL, HUMAN_IDS.handR] });
  return b;
}

describe("a human has nothing of the three to cut", () => {
  it("no membrane, no cover but skin, no fused node", () => {
    expect(reshapes(human())).toEqual([]);
  });
});

describe("cutting a membrane off (decision 1226)", () => {
  it("the membrane leaves, the limbs it hung on stay, nothing bleeds out of the mass", () => {
    const b = human();
    const id = addMembrane(b, [HUMAN_IDS.armL, HUMAN_IDS.forearmL], "wing");
    expect(reshapes(b)).toContainEqual({ t: "membrane", membrane: id });
    const segs = segmentIds(b).length;
    const before = mass(b);
    const r = reshape(b, { t: "membrane", membrane: id });
    expect(b.membranes[id]).toBeUndefined();
    expect(r.membranes.map((m) => m.id)).toEqual([id]);
    expect(segmentIds(b).length).toBe(segs);
    expect(mass(b)).toBe(before);
    expect(r.lost).toBe(0);
    expect(validate(b)).toEqual([]);
  });
});

describe("taking a cover off (decision 1227)", () => {
  it("one segment of plates goes back to skin and the flesh of the plates leaves", () => {
    const b = human();
    b.segments[HUMAN_IDS.legL]!.cover = "plates";
    b.meat = Math.max(b.meat, mass(b));
    expect(reshapes(b)).toContainEqual({ t: "cover", segment: HUMAN_IDS.legL });
    const before = mass(b);
    const r = reshape(b, { t: "cover", segment: HUMAN_IDS.legL });
    expect(b.segments[HUMAN_IDS.legL]!.cover).toBe("skin");
    expect(r.covers).toEqual([{ segment: HUMAN_IDS.legL, cover: "plates" }]);
    expect(r.lost).toBeCloseTo(before - mass(b));
    expect(r.lost).toBeGreaterThan(0);
    expect(r.marks).toEqual([HUMAN_IDS.legL]);
    expect(validate(b)).toEqual([]);
  });

  it("a cover on the move is taken off everywhere it is, and its front stops: one segment would be taken back in thirty turns", () => {
    const b = human();
    for (const id of [HUMAN_IDS.armL, HUMAN_IDS.torso]) b.segments[id]!.cover = "chitin";
    b.segments[HUMAN_IDS.legR]!.cover = "fur";
    expect(startCoverFront(b, "chitin")).toBe(true);
    expect(startCoverFront(b, "fur")).toBe(true);
    const r = reshape(b, { t: "cover", segment: HUMAN_IDS.armL });
    expect(r.covers.map((c) => c.segment).sort((x, y) => x - y)).toEqual([HUMAN_IDS.torso, HUMAN_IDS.armL].sort((x, y) => x - y));
    expect(segmentIds(b).filter((id) => b.segments[id]!.cover === "chitin")).toEqual([]);
    // The other cover and its front are not the knife's business.
    expect(b.segments[HUMAN_IDS.legR]!.cover).toBe("fur");
    expect(b.fronts?.map((f) => f.cover)).toEqual(["fur"]);
    expect(validate(b)).toEqual([]);
  });

  it("chrome is iron and skin is nothing: neither is offered", () => {
    const b = human();
    b.segments[HUMAN_IDS.armL]!.cover = "chrome";
    expect(reshapes(b).filter((r) => r.t === "cover")).toEqual([]);
  });
});

describe("parting a fusion (decision 1228)", () => {
  it("the fused node remembers which segments came to it, in the hash and in the text", () => {
    const b = fused();
    expect(fusions(b)).toHaveLength(1);
    const back = bodyFromText(bodyToText(b));
    expect(bodyHash(back)).toBe(bodyHash(b));
    expect(fusions(back)).toEqual(fusions(b));
  });

  it("the node splits, the cycle breaks, the endings do not come back", () => {
    const b = fused();
    const [f] = fusions(b);
    expect(reshapes(b)).toContainEqual({ t: "unfuse", node: f!.node });
    const nodes = Object.keys(b.nodes).length;
    const ends = Object.values(b.nodes).reduce((n, x) => n + x.ends.length, 0);
    const r = reshape(b, { t: "unfuse", node: f!.node });
    expect(r.split).not.toBeNull();
    expect(Object.keys(b.nodes).length).toBe(nodes + 1);
    expect(Object.values(b.nodes).reduce((n, x) => n + x.ends.length, 0)).toBe(ends);
    expect(fusions(b)).toEqual([]);
    expect(b.nodes[f!.node]!.fused).toBeUndefined();
    // Both ends of the knife's way are where it went in: the node that stays and the one that parted.
    expect(r.marks).toEqual([f!.node, r.split!].sort((x, y) => x - y));
    expect(validate(b)).toEqual([]);
    // No cycle through the arms is left: each hand node is a tip again, one segment each.
    const at = (n: number): number => segmentIds(b).filter((s) => b.segments[s]!.a === n || b.segments[s]!.b === n).length;
    expect(at(f!.node)).toBe(1);
    expect(at(r.split!)).toBe(1);
  });

  it("two fusions are two cuts, each parting its own node", () => {
    const b = human();
    apply(b, "fusion", {}, { pair: [HUMAN_IDS.footL, HUMAN_IDS.footR] });
    apply(b, "fusion", {}, { pair: [HUMAN_IDS.handL, HUMAN_IDS.handR] });
    expect(fusions(b)).toEqual([
      { node: HUMAN_IDS.handL, segments: [HUMAN_IDS.forearmR] },
      { node: HUMAN_IDS.footL, segments: [HUMAN_IDS.shinR] },
    ]);
    const probe = cloneBody(b);
    reshape(probe, { t: "unfuse", node: HUMAN_IDS.footL });
    expect(fusions(probe)).toEqual([{ node: HUMAN_IDS.handL, segments: [HUMAN_IDS.forearmR] }]);
    expect(validate(probe)).toEqual([]);
    reshape(probe, { t: "unfuse", node: HUMAN_IDS.handL });
    expect(fusions(probe)).toEqual([]);
    expect(validate(probe)).toEqual([]);
  });

  it("a stale record - its segment gone - offers nothing", () => {
    const b = fused();
    const [f] = fusions(b);
    b.nodes[f!.node]!.fused = [[99_999]];
    expect(fusions(b)).toEqual([]);
  });
});
