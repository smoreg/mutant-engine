import { describe, expect, it } from "vitest";
import { LabRng as Rng } from "../rng.js";
import {
  HUMAN_IDS,
  apply,
  bodyFromText,
  bulk,
  controlCap,
  controlLoad,
  grow,
  human,
  mass,
  organ,
  upkeep,
  validate,
} from "../index.js";
import { population, randomOp } from "./gen.js";

describe("budgets", () => {
  it("distance tax", () => {
    const h = human();
    expect(controlLoad(h)).toBe(10);
    const t = human(1000);
    apply(t, "sprout", { kind: "tentacle", length: 4, girth: 1, cover: "skin", ending: organ("hand") }, { node: HUMAN_IDS.handL });
    expect(controlLoad(t)).toBe(10 + 2 + 1);
    const far = human(1000);
    apply(far, "sprout", { kind: "tentacle", length: 6, girth: 1, cover: "skin", ending: organ("foot") }, { node: HUMAN_IDS.footL });
    expect(controlLoad(far)).toBe(10 + 1 + 2);
    const cheap = human(1000);
    apply(cheap, "sprout", { kind: "tentacle", length: 6, girth: 1, cover: "skin", ending: organ("sting") }, { node: HUMAN_IDS.head });
    expect(controlLoad(cheap)).toBe(10 + 1 + 1);
  });

  it("a cavity organ is measured from the near end of its torso", () => {
    const b = bodyFromText(`
      голова[2] {голова(мозг*)}
      грудь[3]
      таз[3]
      голова -шея:6/1 кожа- грудь
      грудь -корпус:6/3 кожа {сердце, лёгкие}- таз
    `);
    expect(controlLoad(b)).toBe(1 + 1);
  });

  it("control cap comes from the brain", () => {
    expect(controlCap(human())).toBe(10);
  });

  it("upkeep counts organs and limbs", () => {
    const h = human(1000);
    expect(upkeep(h)).toBe(20);
    apply(h, "stretch", { delta: 1 }, { segment: HUMAN_IDS.armL });
    expect(upkeep(h)).toBe(21);
    // The chest is the full neck node now: the second neck grows on a shoulder.
    apply(h, "sprout", { kind: "neck", length: 1, girth: 1, cover: "skin", ending: organ("head", [organ("eye"), organ("jaw")]) }, { node: HUMAN_IDS.shoulderL });
    expect(upkeep(h)).toBe(21 + 0.5 + 1);
  });

  it("bulk is a pure function of mass and nodes", () => {
    expect(bulk(human())).toBe(3);
    const a = human(1000);
    const b = human(1000);
    // The chest and the pelvis are full on the human: the arms grow on a shoulder and a hip.
    apply(a, "sprout", { kind: "arm", length: 2, girth: 1, cover: "skin", ending: organ("hand") }, { node: HUMAN_IDS.shoulderL });
    apply(b, "sprout", { kind: "arm", length: 2, girth: 1, cover: "skin", ending: organ("hand") }, { node: HUMAN_IDS.hipL });
    expect(mass(a)).toBe(mass(b));
    expect(bulk(a)).toBe(bulk(b));
    for (const body of population(100)) {
      const twin = structuredClone(body);
      for (const n of Object.values(twin.nodes)) {
        n.hp = 1;
        n.wound = 5;
        n.bait = true;
      }
      for (const s of Object.values(twin.segments)) {
        s.cover = "chrome";
        s.breakPlane = false;
        s.hp = 0;
      }
      expect(bulk(twin)).toBe(bulk(body));
      expect(bulk(body)).toBeGreaterThanOrEqual(1);
      expect(bulk(body)).toBeLessThanOrEqual(9);
    }
    const big = human(100_000);
    const rng = new Rng(11);
    for (let i = 0; i < 300; i++) {
      const c = randomOp(rng);
      grow(big, c.op, c.payload, rng);
    }
    expect(bulk(big)).toBeGreaterThan(bulk(human()));
  });

  it("mass never exceeds meat", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const rng = new Rng(seed);
      const meat = 100 + seed * 3;
      const b = human(meat);
      for (let i = 0; i < 40; i++) {
        const c = randomOp(rng);
        grow(b, c.op, c.payload, rng);
        expect(mass(b)).toBeLessThanOrEqual(b.meat);
        expect(validate(b)).toEqual([]);
      }
    }
  });
});
