import { describe, expect, it } from "vitest";
import { HUMAN_IDS, HUMAN_TEXT, bodyFromText, human, mass, nodeIds, organMass, segmentIds, strip, validate } from "../index.js";

describe("strip", () => {
  it("takes an ending, a cavity organ and a growth; nodes and segments stay, meat drops by exactly their mass", () => {
    const b = bodyFromText(HUMAN_TEXT.replace("мясо 101", "мясо 111").replace("-рука:1/1 кожа- 4", "-рука:1/1 кожа [шипы]- 4"));
    const hand = b.nodes[HUMAN_IDS.handL]!.ends[0]!;
    const stomach = b.segments[HUMAN_IDS.torso]!.cavity[2]!;
    const spines = b.segments[HUMAN_IDS.forearmL]!.growths[0]!;
    const nodes = nodeIds(b);
    const segments = segmentIds(b);
    const meat = b.meat;
    const r = strip(b, (o) => o === hand || o === stomach || o === spines, []);
    expect(r.organs.map((o) => o.kind).sort()).toEqual(["hand", "spines", "stomach"]);
    expect(r.lost).toBeCloseTo(organMass(hand) + organMass(stomach) + organMass(spines));
    expect(b.meat).toBeCloseTo(meat - r.lost);
    expect(nodeIds(b)).toEqual(nodes);
    expect(segmentIds(b)).toEqual(segments);
    expect(b.nodes[HUMAN_IDS.handL]!.ends).toEqual([]);
    expect(b.nodes[HUMAN_IDS.handL]!.wound).toBe(0);
    expect(validate(b)).toEqual([]);
  });

  it("takes a hanging limb with no wound and no stump", () => {
    const b = human();
    const next = b.nextId;
    // The arm bends at the elbow: taking the upper arm takes the forearm and the hand beyond it.
    const r = strip(b, () => false, [HUMAN_IDS.armL, HUMAN_IDS.handL]);
    expect(r.segments.map((s) => s.id)).toEqual([HUMAN_IDS.armL, HUMAN_IDS.forearmL]);
    expect(r.nodes.map((n) => n.id).sort((x, y) => x - y)).toEqual([HUMAN_IDS.handL, HUMAN_IDS.elbowL]);
    expect(b.nextId).toBe(next);
    expect(Object.values(b.nodes).every((n) => n.wound === 0)).toBe(true);
    expect(validate(b)).toEqual([]);
    expect(mass(b)).toBeCloseTo(b.meat);
  });

  it("whatever hangs beyond a removed segment goes with it", () => {
    const b = human();
    const r = strip(b, () => false, [HUMAN_IDS.torso]);
    // The pelvis side no longer reaches the head: hips, knees, feet, the penis and all.
    expect(r.nodes.map((n) => n.id)).toEqual([
      HUMAN_IDS.pelvis, HUMAN_IDS.footL, HUMAN_IDS.footR, HUMAN_IDS.hipL, HUMAN_IDS.hipR,
      HUMAN_IDS.kneeL, HUMAN_IDS.kneeR, HUMAN_IDS.penisTip,
    ]);
    expect(validate(b)).toEqual([]);
  });

  it("the last heart is reported vital", () => {
    const r = strip(human(), (o) => o.kind === "heart", []);
    expect(r.vital.map((o) => o.kind)).toEqual(["heart"]);
  });

  it("an ending before your head keeps self on the brain", () => {
    const b = bodyFromText(HUMAN_TEXT.replace("мясо 101", "мясо 111").replace("1[2] {голова(мозг*", "1[2] {кисть, голова(мозг*"));
    strip(b, (o) => o.kind === "hand" && b.nodes[1]!.ends.includes(o), []);
    expect(validate(b)).toEqual([]);
  });
});
