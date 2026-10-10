import { describe, expect, it } from "vitest";
import {
  HUMAN_IDS,
  bodyFromText,
  bodyHash,
  bridges,
  cloneBody,
  closure,
  components,
  distances,
  human,
  mass,
  nodeIds,
  removeSegment,
  segmentIds,
  validate,
} from "../index.js";
import { population } from "./gen.js";

describe("distances", () => {
  it("distances from brain", () => {
    const h = human();
    const d = distances(h, h.self);
    expect(d[HUMAN_IDS.head]).toBe(0);
    expect(d[HUMAN_IDS.chest]).toBe(1);
    expect(d[HUMAN_IDS.handL]).toBe(3);
    expect(d[HUMAN_IDS.handR]).toBe(3);
    expect(d[HUMAN_IDS.pelvis]).toBe(3);
    expect(d[HUMAN_IDS.footL]).toBe(5);
    expect(d[HUMAN_IDS.footR]).toBe(5);
  });

  it("a brain in a cavity measures from the middle of its torso", () => {
    const b = bodyFromText(`
      грудь[3]
      таз[3]
      стопа[1] {стопа}
      грудь -корпус:4/3 кожа {мозг*, сердце}- таз
      таз -нога:2/1 кожа- стопа
    `);
    const d = distances(b, b.self);
    expect(d[1]).toBe(2);
    expect(d[2]).toBe(2);
    expect(d[3]).toBe(4);
  });

  it("a cycle shortens the way", () => {
    const b = bodyFromText(`
      голова[2] {голова(мозг*)}
      грудь[3]
      таз[3]
      бок[1]
      голова -шея:1/1 кожа- грудь
      грудь -корпус:4/3 кожа {сердце}- таз
      грудь -щупальце:1/1 кожа- бок
      бок -щупальце:1/1 кожа- таз
    `);
    const d = distances(b, b.self);
    expect(d[3]).toBe(3);
  });

  it("an unreachable node has no distance", () => {
    const h = human();
    removeSegment(h, HUMAN_IDS.armL);
    const d = distances(h, h.self);
    expect(d[HUMAN_IDS.handL]).toBeUndefined();
    expect(d[HUMAN_IDS.handR]).toBe(3);
  });
});

describe("components, closure, bridges", () => {
  it("closure equals segments - nodes + 1", () => {
    for (const b of population()) {
      expect(closure(b)).toBe(segmentIds(b).length - nodeIds(b).length + 1);
      expect(components(b)).toHaveLength(1);
    }
  });

  it("bridge iff cut raises component count", () => {
    for (const b of population()) {
      const before = components(b).length;
      const bridgeSet = new Set(bridges(b));
      for (const s of segmentIds(b)) {
        const c = cloneBody(b);
        removeSegment(c, s);
        const raises = components(c).length > before;
        expect(bridgeSet.has(s), `segment ${s} of body ${bodyHash(b)}`).toBe(raises);
      }
    }
  });

  it("human has fifteen bridges - neck, torso, four limbs of two segments, four flanks, the penis - and no cycles", () => {
    const h = human();
    expect(bridges(h)).toEqual([8, 9, 10, 11, 12, 13, 18, 19, 20, 21, 27, 28, 29, 30, 31]);
    expect(closure(h)).toBe(0);
  });

  it("components list nodes and segments in id order", () => {
    const h = human();
    removeSegment(h, HUMAN_IDS.torso);
    const parts = components(h);
    expect(parts).toHaveLength(2);
    const H = HUMAN_IDS;
    expect(parts[0]!.nodes).toEqual([H.head, H.chest, H.handL, H.handR, H.shoulderL, H.shoulderR, H.elbowL, H.elbowR]);
    expect(parts[0]!.segments).toEqual([
      H.neck,
      H.armL,
      H.armR,
      H.flankShoulderL,
      H.flankShoulderR,
      H.forearmL,
      H.forearmR,
    ]);
    expect(parts[1]!.nodes).toEqual([H.pelvis, H.footL, H.footR, H.hipL, H.hipR, H.kneeL, H.kneeR, H.penisTip]);
    expect(parts[1]!.segments).toEqual([H.legL, H.legR, H.flankHipL, H.flankHipR, H.shinL, H.shinR, H.penis]);
  });
});

describe("validate", () => {
  it("accepts the human and the population", () => {
    expect(validate(human())).toEqual([]);
    for (const b of population(100)) expect(validate(b)).toEqual([]);
  });

  it("catches a disconnected body, a wrong mount, a full node, mass over meat", () => {
    const h = human();
    removeSegment(h, HUMAN_IDS.armL);
    expect(validate(h).join("\n")).toMatch(/connect/i);

    const m = human();
    m.nodes[HUMAN_IDS.handL]!.ends.push({ kind: "heart", instability: 0 });
    expect(validate(m).join("\n")).toMatch(/mount/i);

    const f = human();
    f.nodes[HUMAN_IDS.handL]!.ends.push({ kind: "hand", instability: 0 });
    expect(validate(f).join("\n")).toMatch(/end/i);

    const o = human();
    o.meat = 90;
    expect(validate(o).join("\n")).toMatch(/meat/i);

    const s = human();
    s.self = { node: 99 };
    expect(validate(s).join("\n")).toMatch(/self/i);
  });

  it("catches limits", () => {
    const b = human();
    for (let i = 0; i < 7; i++) b.nodes[HUMAN_IDS.chest]!.ends.push({ kind: "eye", instability: 0 });
    expect(validate(b).join("\n")).toMatch(/end/i);
  });
});

describe("purity", () => {
  it("metrics are pure", () => {
    for (const b of population(50)) {
      const before = bodyHash(b);
      distances(b, b.self);
      components(b);
      bridges(b);
      closure(b);
      mass(b);
      validate(b);
      expect(bodyHash(b)).toBe(before);
    }
  });
});
