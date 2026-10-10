import { describe, expect, it } from "vitest";
import {
  HUMAN_IDS,
  apply,
  bodyFromText,
  bodyHash,
  bodyToText,
  brainAt,
  brainOrgan,
  brainRefsIn,
  brains,
  canonicalPlace,
  cloneBody,
  controlCap,
  human,
  ischemiaTick,
  organ,
  selfOf,
  selfRef,
  setSelf,
  swayOf,
  validate,
} from "../index.js";
import { brainyPopulation } from "./genHeads.js";

const HEAD_WITH_BRAIN = (sway: number) => organ("head", [brainOrgan(sway), organ("eye")]);

/*
 * The human's chest and pelvis are small full nodes (decision 118): a second
 * head grows from a shoulder (was the chest) or a hip (was the pelvis). The
 * sprout's node is 32, its neck 33.
 */

/** Two heads with a brain in one node; the second one is you. */
function twoHeads(sway: number) {
  return bodyFromText(`
    голова[2] {голова(мозг${sway > 0 ? `!${sway}` : ""}, глаз), голова(мозг*, глаз)}
    грудь[3]
    таз[3]
    голова -шея:1/1 кожа- грудь
    грудь -корпус:2/3 кожа {сердце}- таз
  `);
}

describe("sway as data on the brain", () => {
  it("brainOrgan carries sway, absent means 0", () => {
    expect(swayOf(organ("brain"))).toBe(0);
    expect(swayOf(brainOrgan(0))).toBe(0);
    expect(brainOrgan(0)).toEqual(organ("brain"));
    expect(swayOf(brainOrgan(7))).toBe(7);
  });

  it("sway is written as мозг!n and read back", () => {
    const b = human(1000);
    apply(b, "sprout", { kind: "neck", length: 1, girth: 1, cover: "skin", ending: HEAD_WITH_BRAIN(6) }, { node: HUMAN_IDS.shoulderR });
    const text = bodyToText(b);
    expect(text).toContain("{голова(мозг!6, глаз)}");
    expect(text).toContain("{голова(мозг*, глаз, глаз, челюсть, ухо, ухо, нос)}");
    const back = bodyFromText(text);
    expect(bodyHash(back)).toBe(bodyHash(b));
    expect(bodyToText(back)).toBe(text);
    expect(swayOf(back.nodes[32]!.ends[0]!.contents![0]!)).toBe(6);
  });

  it("sway changes the hash", () => {
    const a = twoHeads(0);
    const b = twoHeads(3);
    expect(bodyHash(a)).not.toBe(bodyHash(b));
    const c = cloneBody(b);
    c.nodes[1]!.ends[0]!.contents![0]!.sway = 0;
    expect(bodyHash(c)).toBe(bodyHash(a));
  });

  it("validate rejects sway outside 0..10 and sway on anything but a brain", () => {
    const b = twoHeads(4);
    b.nodes[1]!.ends[0]!.contents![0]!.sway = 11;
    expect(validate(b).join("\n")).toMatch(/sway/);
    const h = human();
    h.nodes[HUMAN_IDS.handL]!.ends[0]!.sway = 2;
    expect(validate(h).join("\n")).toMatch(/sway/);
    expect(() => bodyFromText("a[1] {голова(мозг*)}\nb[1] {кисть!3}\na -рука:1/1 кожа- b")).toThrow(/sway|!/);
  });
});

describe("brains", () => {
  it("lists every brain by element id and position, with the self flag", () => {
    const b = human(1000);
    apply(b, "sprout", { kind: "neck", length: 1, girth: 1, cover: "skin", ending: HEAD_WITH_BRAIN(3) }, { node: HUMAN_IDS.hipL });
    apply(b, "thicken", {}, { segment: HUMAN_IDS.armL });
    b.segments[HUMAN_IDS.armL]!.cavity.push(brainOrgan(5));
    const list = brains(b);
    expect(list.map((x) => x.key)).toEqual(["n1.0", "s10.0", "n32.0"]);
    expect(list.map((x) => x.sway)).toEqual([0, 5, 3]);
    expect(list.map((x) => x.self)).toEqual([true, false, false]);
    expect(list.map((x) => x.alive)).toEqual([true, true, true]);
    expect(list[0]!.head!.kind).toBe("head");
    expect(list[1]!.head).toBeNull();
    expect(list[1]!.place).toEqual({ segment: HUMAN_IDS.armL });
    expect(list[2]!.ref).toEqual({ node: 32, end: 0 });
    expect(list[2]!.organ).toBe(b.nodes[32]!.ends[0]!.contents![0]);
    expect(selfOf(b)!.key).toBe("n1.0");
    expect(validate(b)).toEqual([]);
  });

  it("two brains in one node are two brains", () => {
    const b = twoHeads(2);
    expect(brainRefsIn(b, 1)).toEqual([
      { node: 1, end: 0 },
      { node: 1, end: 1 },
    ]);
    expect(brains(b).map((x) => [x.key, x.self, x.sway])).toEqual([
      ["n1.0", false, 2],
      ["n1.1", true, 0],
    ]);
    expect(brainAt(b, { node: 1, end: 1 })).toBe(b.nodes[1]!.ends[1]!.contents![0]);
  });

  it("your own brain dies after 5 turns without blood: its element cannot come off you", () => {
    const b = human(1000);
    b.segments[9]!.hp = 0;
    for (let t = 0; t < 4; t++) expect(ischemiaTick(b).brainDead).toBe(false);
    expect(selfOf(b)!.alive).toBe(true);
    expect(ischemiaTick(b).brainDead).toBe(true);
    expect(selfOf(b)!.alive).toBe(false);
    // The part that holds you is never in the falling set, so it is still there to die on.
    expect(brains(b)).toHaveLength(1);
  });

  it("another head comes off alive a turn before its brain would die (decision 596)", () => {
    const b = human(1000);
    apply(b, "sprout", { kind: "neck", length: 1, girth: 1, cover: "skin", ending: HEAD_WITH_BRAIN(3) }, { node: HUMAN_IDS.hipL });
    b.segments[33]!.hp = 0;
    for (let t = 0; t < 3; t++) expect(ischemiaTick(b).fallen).toEqual([]);
    expect(brains(b)[1]!.alive).toBe(true);
    // It leaves on `FALL.brained`, one turn short of BRAIN_DEATH_TURNS: a thinking part is
    // carried off whole instead of rotting on a body that no longer feeds it.
    expect(ischemiaTick(b).fallen).toEqual([32]);
    expect(b.nodes[32]).toBeUndefined();
    expect(brains(b)).toHaveLength(1);
    expect(selfOf(b)!.alive).toBe(true);
  });

  it("control cap sums the living brains", () => {
    const b = human(1000);
    expect(controlCap(b)).toBe(10);
    apply(b, "sprout", { kind: "neck", length: 1, girth: 1, cover: "skin", ending: HEAD_WITH_BRAIN(3) }, { node: HUMAN_IDS.shoulderR });
    expect(controlCap(b)).toBe(20);
    b.nodes[32]!.ischemia = 5;
    expect(controlCap(b)).toBe(10);
  });
});

describe("self points at one brain", () => {
  it("self without an index is the first brain of the element", () => {
    const h = human();
    expect(h.self).toEqual({ node: HUMAN_IDS.head });
    expect(selfRef(h)).toEqual({ node: HUMAN_IDS.head, end: 0 });
    const b = twoHeads(0);
    expect(b.self).toEqual({ node: 1, end: 1 });
    expect(selfRef(b)).toEqual({ node: 1, end: 1 });
  });

  it("canonical self drops the index of the first brain and keeps any other", () => {
    const b = twoHeads(0);
    expect(canonicalPlace(b, { node: 1, end: 0 })).toEqual({ node: 1 });
    expect(canonicalPlace(b, { node: 1, end: 1 })).toEqual({ node: 1, end: 1 });
    setSelf(b, { node: 1, end: 0 });
    expect(b.self).toEqual({ node: 1 });
    expect(selfRef(b)).toEqual({ node: 1, end: 0 });
    expect(brains(b).map((x) => x.self)).toEqual([true, false]);
  });

  it("text marks the exact brain and round-trips the index", () => {
    const b = twoHeads(3);
    const text = bodyToText(b);
    expect(text).toContain("1[2] {голова(мозг!3, глаз), голова(мозг*, глаз)}");
    const back = bodyFromText(text);
    expect(back.self).toEqual({ node: 1, end: 1 });
    expect(bodyHash(back)).toBe(bodyHash(b));
    setSelf(b, { node: 1, end: 0 });
    expect(bodyToText(b)).toContain("1[2] {голова(мозг!3*, глаз), голова(мозг, глаз)}");
    expect(bodyFromText(bodyToText(b)).self).toEqual({ node: 1 });
  });

  it("a brain in a cavity is addressed by its slot", () => {
    const b = bodyFromText(`
      грудь[3]
      таз[3]
      грудь -корпус:2/3 кожа {мозг!4, сердце, мозг*}- таз
    `);
    expect(b.self).toEqual({ segment: 3, slot: 2 });
    expect(brains(b).map((x) => x.key)).toEqual(["s3.0", "s3.2"]);
    expect(bodyHash(bodyFromText(bodyToText(b)))).toBe(bodyHash(b));
  });

  it("the index survives an ending spliced out before it", () => {
    const b = bodyFromText(`
      голова[3] {кисть, голова(мозг!1), голова(мозг*)}
      грудь[3]
      голова -шея:1/1 кожа- грудь
      грудь -корпус:2/3 кожа {сердце}- голова
    `);
    b.meat = 1000;
    expect(selfRef(b)).toEqual({ node: 1, end: 2 });
    apply(b, "branch", { kind: "arm", length: 1, girth: 1, cover: "skin" }, { ending: { node: 1, index: 0 } });
    expect(b.nodes[1]!.ends.map((e) => e.kind)).toEqual(["head", "head"]);
    expect(selfRef(b)).toEqual({ node: 1, end: 1 });
    expect(brains(b).find((x) => x.self)!.sway).toBe(0);
    expect(validate(b)).toEqual([]);
  });

  it("thinning never evicts your brain and keeps your slot honest", () => {
    const b = bodyFromText(`
      грудь[3]
      таз[3]
      грудь -корпус:2/2 кожа {мозг!2, сердце, лёгкие, желудок, мозг*}- таз
    `);
    expect(selfRef(b)).toEqual({ segment: 3, slot: 4 });
    const r = apply(b, "thin", {}, { segment: 3 });
    expect(r.evicted.map((o) => o.kind)).toEqual(["stomach", "lungs"]);
    expect(b.segments[3]!.cavity.map((o) => o.kind)).toEqual(["brain", "heart", "brain"]);
    expect(selfRef(b)).toEqual({ segment: 3, slot: 2 });
    expect(swayOf(brainAt(b, selfRef(b)!)!)).toBe(0);
    expect(validate(b)).toEqual([]);
  });

  it("validate catches a self index that holds no brain", () => {
    const h = human();
    h.self = { node: HUMAN_IDS.head, end: 1 };
    expect(validate(h).join("\n")).toMatch(/self/);
    const c = human();
    c.self = { node: HUMAN_IDS.handL, end: 0 };
    expect(validate(c).join("\n")).toMatch(/self/);
  });

  it("random brainy bodies are valid and keep exactly one self", () => {
    for (const b of brainyPopulation(200)) {
      expect(validate(b)).toEqual([]);
      const list = brains(b);
      expect(list.filter((x) => x.self)).toHaveLength(1);
      expect(list.length).toBeGreaterThanOrEqual(1);
      expect(list.length).toBeLessThanOrEqual(6);
      const back = bodyFromText(bodyToText(b));
      expect(bodyHash(back)).toBe(bodyHash(b));
      expect(brains(back).map((x) => [x.key, x.sway, x.self])).toEqual(list.map((x) => [x.key, x.sway, x.self]));
    }
  });
});
