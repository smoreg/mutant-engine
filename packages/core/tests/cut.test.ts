import { describe, expect, it } from "vitest";
import {
  BRAIN_DEATH_TURNS,
  FALL,
  HUMAN_IDS,
  apply,
  autotomy,
  bodyFromText,
  bodyHash,
  brainAlive,
  brains,
  bridges,
  canAutotomize,
  cloneBody,
  closure,
  components,
  cut,
  cutPreview,
  fed,
  human,
  ischemiaTick,
  mass,
  nodeIds,
  organ,
  segmentIds,
  touch,
  validate,
  works,
  type Body,
  type BrainRef,
} from "../index.js";
import { population } from "./gen.js";

/**
 * A ring: chest – side – pelvis – torso – chest, heart in the torso, a hand beyond the side node.
 * Ids: head 1, chest 2, pelvis 3, side 4, hand 5; neck 6, torso 7, chest–side 8, side–pelvis 9, arm 10.
 */
function ring() {
  return bodyFromText(`
    голова[2] {голова(мозг*, глаз, глаз)}
    грудь[3]
    таз[3]
    бок[2]
    кисть[1] {кисть}
    голова -шея:1/1 кожа- грудь
    грудь -корпус:2/3 кожа {сердце, лёгкие, желудок}- таз
    грудь -щупальце:2/1 присоски- бок
    бок -щупальце:1/1 присоски- таз
    бок -рука:1/1 кожа- кисть
  `);
}

describe("cut", () => {
  it("preview equals real cut", () => {
    for (const b of population()) {
      for (const s of segmentIds(b)) {
        for (const end of ["a", "b"] as const) {
          const preview = cutPreview(b, s, end);
          const c = cloneBody(b);
          const result = cut(c, s, end);
          expect(result.yours).toEqual(preview.yours);
          expect(result.others).toEqual(preview.others);
          expect(result.bleeding).toEqual(preview.bleeding);
          expect(result.stump).toEqual(preview.stump);
          expect(nodeIds(c)).toEqual(preview.yours.nodes);
          expect(segmentIds(c)).toEqual(preview.yours.segments);
          expect(components(c)).toHaveLength(1);
          expect(validate(c)).toEqual([]);
          expect(c.meat).toBe(b.meat - (mass(b) - mass(c)));
        }
      }
    }
  });

  it("preview does not change the body", () => {
    for (const b of population(50)) {
      const before = bodyHash(b);
      for (const s of segmentIds(b)) cutPreview(b, s, "a");
      expect(bodyHash(b)).toBe(before);
    }
  });

  it("cutting a cycle segment separates nothing", () => {
    const b = ring();
    expect(closure(b)).toBe(1);
    const cycle = segmentIds(b).filter((s) => !bridges(b).includes(s));
    expect(cycle).toEqual([7, 8, 9]);
    for (const s of cycle) {
      const c = cloneBody(b);
      const stump = c.nextId;
      const r = cut(c, s, "a");
      expect(r.others).toEqual([]);
      expect(r.stump).toBe(stump);
      expect(segmentIds(c)).toEqual(segmentIds(b));
      expect(nodeIds(c)).toEqual([...nodeIds(b), stump]);
      expect(c.segments[s]!.a).toBe(stump);
      expect(c.nodes[stump]).toMatchObject({ size: 1, ends: [], wound: 20 });
      expect(c.nodes[b.segments[s]!.a]!.wound).toBe(20);
      expect(closure(c)).toBe(0);
      expect(c.meat).toBe(mass(c));
      expect(validate(c)).toEqual([]);
    }
  });

  it("cut at chosen end keeps the segment with the far side", () => {
    const atChest = human();
    const r1 = cut(atChest, HUMAN_IDS.armL, "a");
    expect(r1.others).toHaveLength(1);
    // The arm bends at the elbow: the part is the upper arm, the elbow, the forearm and the hand.
    expect(r1.others[0]!.part).toEqual({
      nodes: [HUMAN_IDS.handL, HUMAN_IDS.elbowL],
      segments: [HUMAN_IDS.armL, HUMAN_IDS.forearmL],
    });
    expect(r1.others[0]!.fate).toBe("meat");
    expect(r1.stump).toBeNull();
    expect(atChest.segments[HUMAN_IDS.armL]).toBeUndefined();
    // The arm hangs on the shoulder, a side node of the chest: the wound stays there.
    expect(atChest.nodes[HUMAN_IDS.shoulderL]!.wound).toBe(20);
    expect(atChest.nodes[HUMAN_IDS.chest]!.wound).toBe(0);
    expect(r1.removed.segments.map((s) => s.id)).toEqual([HUMAN_IDS.armL, HUMAN_IDS.forearmL]);
    expect(r1.removed.nodes.map((n) => n.id)).toEqual([HUMAN_IDS.handL, HUMAN_IDS.elbowL]);

    // Cut at the hand's end of the forearm: the forearm stays on the elbow, a fresh stump at its tip.
    const atHand = human();
    const r2 = cut(atHand, HUMAN_IDS.forearmL, "b");
    expect(r2.others[0]!.part).toEqual({ nodes: [HUMAN_IDS.handL], segments: [] });
    expect(r2.stump).toBe(32);
    expect(atHand.segments[HUMAN_IDS.forearmL]).toMatchObject({ a: HUMAN_IDS.elbowL, b: 32, wound: 0 });
    expect(atHand.nodes[32]).toMatchObject({ size: 1, ends: [], wound: 20 });
    expect(atHand.nodes[HUMAN_IDS.handL]).toBeUndefined();
    expect(validate(atHand)).toEqual([]);
  });

  it("meat leaves with the part", () => {
    const h = human();
    const before = mass(h);
    const r = cut(h, HUMAN_IDS.legL, "a");
    const gone = before - mass(h);
    expect(gone).toBe(7 + 2);
    expect(h.meat).toBe(101 - gone);
    expect(r.others[0]!.part.nodes).toEqual([HUMAN_IDS.footL, HUMAN_IDS.kneeL]);
  });

  it("the side with the heart bleeds, the side without does not", () => {
    const h = human();
    const r = cutPreview(h, HUMAN_IDS.armL, "a");
    expect(r.bleeding).toEqual([HUMAN_IDS.shoulderL]);
    const n = cutPreview(h, HUMAN_IDS.neck, "b");
    expect(n.bleeding).toEqual([HUMAN_IDS.chest]);
    expect(n.others[0]!.fate).toBe("heartOnly");
    const both = cutPreview(ring(), 8, "a");
    expect(both.bleeding).toEqual([2, 8]);
  });

  it("cutting yourself off from the heart is allowed and your side has no heart", () => {
    const h = human();
    const r = cut(h, HUMAN_IDS.neck, "b");
    expect(r.yours.nodes).toEqual([HUMAN_IDS.head, 32]);
    expect(r.yours.segments).toEqual([HUMAN_IDS.neck]);
    expect(fed(h).has(HUMAN_IDS.head)).toBe(false);
    expect(validate(h)).toEqual([]);
  });
});

describe("autotomy", () => {
  it("autotomy requires a break plane and consumes it", () => {
    const h = human();
    expect(canAutotomize(h, HUMAN_IDS.armL)).toBe(true);
    const r = autotomy(h, HUMAN_IDS.armL);
    expect(r).not.toBeNull();
    expect(r!.others[0]!.part).toEqual({
      nodes: [HUMAN_IDS.handL, HUMAN_IDS.elbowL],
      segments: [HUMAN_IDS.armL, HUMAN_IDS.forearmL],
    });
    expect(r!.stump).toBeNull();
    expect(h.segments[HUMAN_IDS.armL]).toBeUndefined();

    // The chest is a full small node now; a grown arm sprouts from the big shoulder.
    const grown = human(1000);
    const res = apply(grown, "sprout", { kind: "arm", length: 2, girth: 1, cover: "skin", ending: organ("hand") }, {
      node: HUMAN_IDS.shoulderL,
    });
    const seg = res.created.find((id) => grown.segments[id] !== undefined)!;
    expect(grown.segments[seg]!.breakPlane).toBe(false);
    expect(canAutotomize(grown, seg)).toBe(false);
    expect(autotomy(grown, seg)).toBeNull();
    expect(grown.segments[seg]).toBeDefined();
  });

  it("a segment in a cycle cannot be cast off even with a plane", () => {
    const b = ring();
    for (const s of [7, 8, 9]) {
      expect(b.segments[s]!.breakPlane).toBe(true);
      expect(canAutotomize(b, s)).toBe(false);
    }
    expect(canAutotomize(b, 6)).toBe(true);
    expect(canAutotomize(b, 10)).toBe(true);
  });

  it("autotomy cuts at the end near you", () => {
    const h = human();
    const r = autotomy(h, HUMAN_IDS.legL)!;
    expect(r.others[0]!.part.segments).toEqual([HUMAN_IDS.legL, HUMAN_IDS.shinL]);
    expect(h.nodes[HUMAN_IDS.hipL]!.wound).toBe(20);
  });
});

describe("ischemia", () => {
  it("ischemia: 10 / 40 / 80 turns", () => {
    // The forearm is the segment the hand hangs on: breaking it starves the hand alone.
    const h = human();
    h.segments[HUMAN_IDS.forearmL]!.hp = 0;
    expect(fed(h).has(HUMAN_IDS.handL)).toBe(false);
    expect(fed(h).has(HUMAN_IDS.handR)).toBe(true);
    expect(fed(h).has(HUMAN_IDS.forearmL)).toBe(true);

    for (let t = 1; t <= 9; t++) ischemiaTick(h);
    expect(works(h, HUMAN_IDS.handL)).toBe(true);
    ischemiaTick(h);
    expect(h.nodes[HUMAN_IDS.handL]!.ischemia).toBe(10);
    expect(works(h, HUMAN_IDS.handL)).toBe(false);
    expect(works(h, HUMAN_IDS.handR)).toBe(true);
    expect(works(h, HUMAN_IDS.forearmL)).toBe(false);

    for (let t = 11; t <= 39; t++) ischemiaTick(h);
    expect(h.nodes[HUMAN_IDS.handL]!.ends).toHaveLength(1);
    const r40 = ischemiaTick(h);
    expect(r40.necrotic).toEqual([HUMAN_IDS.handL]);
    expect(h.nodes[HUMAN_IDS.handL]!.ends).toHaveLength(0);
    expect(mass(h)).toBe(99);
    expect(h.meat).toBe(99);

    for (let t = 41; t <= 79; t++) ischemiaTick(h);
    expect(h.nodes[HUMAN_IDS.handL]).toBeDefined();
    const r80 = ischemiaTick(h);
    expect(r80.fallen).toEqual([HUMAN_IDS.handL]);
    expect(r80.brainDead).toBe(false);
    expect(h.nodes[HUMAN_IDS.handL]).toBeUndefined();
    expect(h.segments[HUMAN_IDS.forearmL]).toMatchObject({ a: HUMAN_IDS.elbowL, b: 32 });
    expect(h.nodes[32]).toMatchObject({ size: 1, ends: [] });
    expect(h.meat).toBe(99);
    expect(validate(h)).toEqual([]);
  });

  it("a part with a bypass through a cycle stays fed", () => {
    const b = ring();
    b.segments[8]!.hp = 0;
    const f = fed(b);
    expect(f.has(4)).toBe(true);
    expect(f.has(5)).toBe(true);
    expect(f.has(10)).toBe(true);
    for (let t = 0; t < 100; t++) ischemiaTick(b);
    expect(b.nodes[4]).toBeDefined();
    expect(b.nodes[5]!.ends).toHaveLength(1);
    expect(works(b, 5)).toBe(true);
  });

  it("a stopped heart feeds nobody", () => {
    const h = human();
    h.segments[HUMAN_IDS.torso]!.hp = 0;
    expect(fed(h).size).toBe(0);
  });

  it("brain without heart path dies in 5 turns", () => {
    const h = human();
    h.segments[HUMAN_IDS.neck]!.hp = 0;
    for (let t = 1; t <= 4; t++) expect(ischemiaTick(h).brainDead).toBe(false);
    expect(ischemiaTick(h).brainDead).toBe(true);
    expect(ischemiaTick(h).brainDead).toBe(true);
  });

  it("a fed part resets its counter", () => {
    const h = human();
    h.segments[HUMAN_IDS.armL]!.hp = 0;
    for (let t = 0; t < 5; t++) ischemiaTick(h);
    expect(h.nodes[HUMAN_IDS.handL]!.ischemia).toBe(5);
    h.segments[HUMAN_IDS.armL]!.hp = 3;
    ischemiaTick(h);
    expect(h.nodes[HUMAN_IDS.handL]!.ischemia).toBe(0);
  });

  it("necrosis as an operation removes the starved part now", () => {
    const h = human();
    h.segments[HUMAN_IDS.forearmL]!.hp = 0;
    const r = apply(h, "necrosis", {}, { node: HUMAN_IDS.handL });
    expect(r.removed).toEqual([HUMAN_IDS.handL]);
    expect(h.segments[HUMAN_IDS.forearmL]).toMatchObject({ a: HUMAN_IDS.elbowL, b: 32 });
    expect(validate(h)).toEqual([]);
    expect(h.meat).toBe(mass(h));
  });

  /**
   * A head cut off from the blood has to come off **alive**, or the half of
   * the model that makes servants out of it is unreachable (decision 596).
   * While the fall stood at 80 and necrosis at 40, what fell had been empty
   * for forty turns, so `fateOfFallen` could only ever answer `meat`.
   */
  describe("a part that still thinks comes off before its brain dies (decision 596)", () => {
    /** A second head on a shoulder, and one arm the blood has to travel to reach it. */
    const TWO_HEADS = `голова[2] {голова(мозг*, глаз, хищные челюсти)}
грудь[3]
таз[3]
плечо2[2] {голова(мозг!2, глаз, хищные челюсти)}
стопа.л[1] {стопа}
стопа.п[1] {стопа}
голова -шея:1/2 кожа- грудь
грудь -корпус:2/4 кожа {сердце, лёгкие, желудок}- таз
грудь -рука:2/2 кожа- плечо2
таз -нога:2/2 кожа- стопа.л
таз -нога:2/2 кожа- стопа.п
`;

    /** The body, the node the second brain sits in, and the one segment that feeds it. */
    function starving(): { b: Body; head: number; road: number; ref: BrainRef } {
      const b = bodyFromText(TWO_HEADS);
      const second = brains(b).find((x) => !x.self)!;
      const head = "node" in second.ref ? second.ref.node : -1;
      const road = segmentIds(b).find((id) => b.segments[id]!.a === head || b.segments[id]!.b === head)!;
      b.segments[road]!.hp = 0;
      return { b, head, road, ref: second.ref };
    }

    it("the threshold sits inside the life of a brain, and before necrosis", () => {
      expect(FALL.brained).toBeLessThan(BRAIN_DEATH_TURNS);
      expect(FALL.brained).toBeLessThan(FALL.rot);
      // The thing the decision is about: the fall no longer waits for the
      // organs to die, so what comes off still has them.
      expect(FALL.brained).toBeLessThan(40);
    });

    it("it comes off on the fourth turn, whole, with its brain still alive", () => {
      const { b, head, ref } = starving();
      expect(fed(b).has(head)).toBe(false);

      for (let t = 1; t < FALL.brained; t++) {
        const r = ischemiaTick(b);
        expect(r.fallen, `turn ${t}`).toEqual([]);
        expect(r.necrotic, `turn ${t}`).toEqual([]);
      }
      // Still attached and still thinking on the turn before.
      expect(b.nodes[head]).toBeDefined();
      expect(brainAlive(b, ref)).toBe(true);

      const r = ischemiaTick(b);
      expect(r.fallen).toContain(head);
      expect(r.necrotic).toEqual([]);
      expect(r.brainDead).toBe(false);
      expect(b.nodes[head]).toBeUndefined();
      expect(validate(b)).toEqual([]);
      expect(b.meat).toBe(mass(b));
    });

    it("plain flesh is not hurried: a hand with no brain still waits for the rot", () => {
      const h = human();
      h.segments[HUMAN_IDS.forearmL]!.hp = 0;
      for (let t = 1; t < FALL.rot; t++) expect(ischemiaTick(h).fallen, `turn ${t}`).toEqual([]);
      expect(ischemiaTick(h).fallen).toEqual([HUMAN_IDS.handL]);
    });

    it("the same shoulder without the head on it waits for the rot", () => {
      // The one thing that tells the two apart is the brain: take it off and
      // the very same node starves for eighty turns like any other meat.
      const b = bodyFromText(TWO_HEADS);
      const second = brains(b).find((x) => !x.self)!;
      const head = "node" in second.ref ? second.ref.node : -1;
      b.nodes[head]!.ends = [];
      touch(b);
      const road = segmentIds(b).find((id) => b.segments[id]!.a === head || b.segments[id]!.b === head)!;
      b.segments[road]!.hp = 0;
      for (let t = 1; t <= FALL.brained + 2; t++) expect(ischemiaTick(b).fallen, `turn ${t}`).toEqual([]);
      expect(b.nodes[head]).toBeDefined();
    });
  });
});
