import { describe, expect, it } from "vitest";
import {
  HUMAN_IDS,
  apply,
  bodyFromText,
  bodyHash,
  brainAt,
  brainOrgan,
  brains,
  cloneBody,
  components,
  fed,
  human,
  lifetimeWithoutHeart,
  mass,
  nodeIds,
  segmentIds,
  selfRef,
  separate,
  separatePreview,
  swayOf,
  territories,
  territoryOf,
  validate,
  type BrainRef,
} from "../index.js";
import { CHAIN, SWAMP, SWAMP_HEAD2, brainyBody, brainyPopulation, chain, swampMutant } from "./genHeads.js";

describe("separation", () => {
  it("Топь at sway 4: the head leaves with your legs and without the heart", () => {
    const b = swampMutant(4);
    // The second torso of girth 2 weighs by section (decision 1260).
    expect(mass(b)).toBeCloseTo(143, 9);
    const r = separate(b, SWAMP_HEAD2)!;
    expect(r).not.toBeNull();
    expect(r.border).toEqual([SWAMP.torso, SWAMP.torso2]);
    expect(r.pain).toBe(60);
    expect(r.yours).toEqual({ nodes: [1, 2, 4, 5, 17], segments: [9, 10, 11, 12] });
    expect(r.leaves.part).toEqual({ nodes: [3, 6, 7, 8, 18, 20], segments: [13, 14, 15, 16, 19] });
    expect(r.others).toEqual([]);
    expect(r.bleeding).toEqual([2, 10]);

    // The torso chest-pelvis is cut in the middle: your half keeps the id, the heart and the break plane.
    expect(b.segments[SWAMP.torso]).toMatchObject({ a: SWAMP.chest, b: 17, length: 1, girth: 3, kind: "torso", breakPlane: true, hpMax: 16, hp: 16 });
    expect(b.segments[SWAMP.torso]!.cavity.map((o) => o.kind)).toEqual(["heart", "lungs", "stomach"]);
    expect(b.nodes[17]).toMatchObject({ size: 1, ends: [], wound: 20 });
    expect(b.nodes[SWAMP.chest]!.wound).toBe(20);
    expect(b.segments[SWAMP.torso2]).toBeUndefined();
    expect(nodeIds(b)).toEqual(r.yours.nodes);
    expect(segmentIds(b)).toEqual(r.yours.segments);
    expect(mass(b)).toBe(56.5);
    expect(b.meat).toBe(56.5);
    expect(b.nextId).toBe(21);
    expect(validate(b)).toEqual([]);
    expect(fed(b).has(SWAMP.chest)).toBe(true);

    // The leaving body: the head, the pelvis with both legs, the thickened arm with its cavity, half a torso.
    const l = r.leaves;
    expect(l.fate).toBe("brainOnly");
    expect(l.body).not.toBeNull();
    const lb = l.body!;
    expect(nodeIds(lb)).toEqual(l.part.nodes);
    expect(segmentIds(lb)).toEqual(l.part.segments);
    expect(lb.self).toEqual({ node: SWAMP.head2 });
    expect(swayOf(brainAt(lb, selfRef(lb)!)!)).toBe(4);
    expect(lb.segments[SWAMP.torso2]).toMatchObject({ a: 20, b: SWAMP.head2, length: 3, girth: 2, cover: "chitin" });
    expect(lb.segments[SWAMP.torso2]!.cavity.map((o) => o.kind)).toEqual(["lungs", "gut"]);
    expect(lb.segments[19]).toMatchObject({ a: 18, b: SWAMP.pelvis, length: 1, girth: 3, kind: "torso", cavity: [], breakPlane: false });
    expect(lb.nodes[18]).toMatchObject({ size: 1, ends: [], wound: 20 });
    expect(lb.nodes[20]).toMatchObject({ size: 1, ends: [], wound: 20 });
    // The torso 3/2 weighs by section (decision 1260).
    expect(mass(lb)).toBe(86.5);
    expect(lb.meat).toBe(86.5);
    expect(lb.nextId).toBe(21);
    expect(l.lifetime).toBe(63);
    expect(l.bleeding).toEqual([]);
    expect(validate(lb)).toEqual([]);
    expect(components(lb)).toHaveLength(1);
  });

  it("separation cuts exactly the border", () => {
    for (const b of brainyPopulation(300)) {
      for (const h of brains(b)) {
        if (h.self) continue;
        const t = territoryOf(b, h.ref)!;
        const c = cloneBody(b);
        const r = separate(c, h.ref);
        if (r === null) {
          expect(t.nodes.length === 0 || t.nodes.includes("node" in b.self ? b.self.node : -1) || t.segments.includes("segment" in b.self ? b.self.segment : -1)).toBe(true);
          expect(bodyHash(c)).toBe(bodyHash(b));
          continue;
        }
        expect(r.border).toEqual(t.border);
        expect(r.pain).toBe(50 + 10 * (t.border.length - 1));
        // Every segment inside the territory left whole; every other non-border segment stayed whole.
        for (const s of t.segments) {
          expect(c.segments[s]).toBeUndefined();
          expect(r.leaves.part.segments).toContain(s);
        }
        for (const s of segmentIds(b)) {
          if (t.border.includes(s) || t.segments.includes(s)) continue;
          if (r.yours.segments.includes(s)) expect(c.segments[s]).toMatchObject({ length: b.segments[s]!.length, a: b.segments[s]!.a, b: b.segments[s]!.b });
        }
        for (const n of t.nodes) {
          expect(c.nodes[n]).toBeUndefined();
          expect(r.leaves.part.nodes).toContain(n);
        }
        // Wounds: the segments cut at a node wound that node, cuts inside a segment leave stumps of wound 20.
        for (const s of t.border) {
          const before = b.segments[s]!;
          const mineEnd = t.nodes.includes(before.a) ? before.b : before.a;
          const theirEnd = t.nodes.includes(before.a) ? before.a : before.b;
          const stays = c.segments[s];
          const leaves = r.leaves.body!.segments[s];
          if (stays !== undefined) {
            const stump = stays.a === mineEnd ? stays.b : stays.a;
            expect(stays.length).toBeGreaterThanOrEqual(1);
            expect(stays.length).toBeLessThanOrEqual(before.length);
            expect(c.nodes[stump]).toMatchObject({ size: 1, ends: [], wound: 20 });
          } else if (leaves !== undefined) {
            expect(leaves.length).toBe(before.length);
            const stump = leaves.a === theirEnd ? leaves.b : leaves.a;
            expect(r.leaves.body!.nodes[stump]).toMatchObject({ size: 1, ends: [], wound: 20 });
            const mineNode = c.nodes[mineEnd] ?? r.others.map((o) => o.body?.nodes[mineEnd]).find((n) => n !== undefined);
            if (mineNode !== undefined) expect(mineNode.wound).toBe(20);
          }
        }
        expect(validate(c)).toEqual([]);
        expect(components(c)).toHaveLength(1);
        expect(c.meat).toBeCloseTo(b.meat - (mass(b) - mass(c)), 9);
        expect(nodeIds(c)).toEqual(r.yours.nodes);
        expect(segmentIds(c)).toEqual(r.yours.segments);
      }
    }
  });

  it("preview equals the real separation and leaves the body alone", () => {
    for (const b of brainyPopulation(300)) {
      const before = bodyHash(b);
      for (const h of brains(b)) {
        if (h.self) continue;
        const preview = separatePreview(b, h.ref);
        expect(bodyHash(b)).toBe(before);
        const c = cloneBody(b);
        const real = separate(c, h.ref);
        expect(real).toEqual(preview);
        if (real === null) continue;
        for (const part of [real.leaves, ...real.others]) {
          expect(part.body === null).toBe(part.fate === "meat" || part.fate === "heartOnly");
          expect(part.lifetime === null).toBe(part.fate !== "brainOnly");
          if (part.body === null) continue;
          expect(validate(part.body)).toEqual([]);
          expect(components(part.body)).toHaveLength(1);
          expect(nodeIds(part.body)).toEqual(part.part.nodes);
          expect(segmentIds(part.body)).toEqual(part.part.segments);
          expect(part.body.meat).toBeCloseTo(mass(part.body), 9);
          expect(part.body.nextId).toBe(c.nextId);
          expect(brains(part.body).filter((x) => x.self)).toHaveLength(1);
          if (part.fate === "brainOnly") expect(part.lifetime).toBe(lifetimeWithoutHeart(mass(part.body)));
        }
        const leaving = brains(real.leaves.body!).find((x) => x.self)!;
        expect(leaving.sway).toBe(h.sway);
        expect(leaving.organ.instability).toBe(h.organ.instability);
        expect(selfRef(c)).toBeDefined();
        expect(swayOf(brainAt(c, selfRef(c)!)!)).toBe(brains(b).find((x) => x.self)!.sway);
        const gone = mass(b) - mass(c);
        let carried = 0;
        for (const part of [real.leaves, ...real.others]) if (part.body !== null) carried += mass(part.body);
        expect(gone).toBeGreaterThanOrEqual(carried - 1e-9);
      }
    }
  });

  it("cavity goes to the longer side, tie -> self", () => {
    const tie = swampMutant(4);
    separate(tie, SWAMP_HEAD2);
    expect(tie.segments[SWAMP.torso]!.cavity.map((o) => o.kind)).toEqual(["heart", "lungs", "stomach"]);

    const make = (sway: number) =>
      bodyFromText(`
        голова[2] {голова(мозг*)}
        грудь[3]
        узел[1] {голова(мозг!${sway})}
        голова -шея:1/1 кожа- грудь
        грудь -корпус:4/3 кожа {сердце, желудок}- узел
      `);
    // t = (3 - sway / 2) / 2 of the torso stays with you: sway 2 -> 1 of 4, the cavity goes with the longer 3.
    const longer = make(2);
    expect(territoryOf(longer, { node: 3, end: 0 })!.nodes).toEqual([3]);
    const r = separate(longer, { node: 3, end: 0 })!;
    expect(r.border).toEqual([5]);
    expect(longer.segments[5]).toMatchObject({ a: 2, b: 6, length: 1, cavity: [] });
    const lb = r.leaves.body!;
    expect(lb.segments[8]).toMatchObject({ a: 7, b: 3, length: 3, kind: "torso", girth: 3 });
    expect(lb.segments[8]!.cavity.map((o) => o.kind)).toEqual(["heart", "stomach"]);
    expect(r.leaves.fate).toBe("creature");
    expect(r.leaves.lifetime).toBeNull();
    expect(r.leaves.bleeding).toEqual([8]);
    expect(r.bleeding).toEqual([]);
    expect(fed(longer).size).toBe(0);
    expect(validate(longer)).toEqual([]);
    expect(validate(lb)).toEqual([]);

    // sway 6 -> t = 0: the whole torso leaves, cut at the chest.
    const whole = make(6);
    const w = separate(whole, { node: 3, end: 0 })!;
    expect(whole.segments[5]).toBeUndefined();
    expect(whole.nodes[2]!.wound).toBe(20);
    expect(w.leaves.body!.segments[5]).toMatchObject({ a: 6, b: 3, length: 4 });
    expect(w.leaves.body!.segments[5]!.cavity.map((o) => o.kind)).toEqual(["heart", "stomach"]);
    expect(w.yours).toEqual({ nodes: [1, 2], segments: [4] });
  });

  it("a cavity that no longer fits its piece is squeezed, last in first out", () => {
    const b = bodyFromText(`
      голова[2] {голова(мозг*)}
      грудь[3]
      узел[1] {голова(мозг!2)}
      голова -шея:1/1 кожа- грудь
      грудь -корпус:4/1 кожа {сердце, лёгкие, желудок, кишка, кишка}- узел
    `);
    // Capacity 20 holds 16; the piece of length 3 holds 15: one gut is pushed out.
    const before = mass(b);
    const r = separate(b, { node: 3, end: 0 })!;
    const seg = r.leaves.body!.segments[8]!;
    expect(seg.cavity.map((o) => o.kind)).toEqual(["heart", "lungs", "stomach", "gut"]);
    expect(r.leaves.evicted.map((o) => o.kind)).toEqual(["gut"]);
    expect(r.evicted).toEqual([]);
    expect(mass(b) + mass(r.leaves.body!) + 2).toBeCloseTo(before, 9);
    expect(b.meat).toBeCloseTo(mass(b), 9);
    expect(validate(r.leaves.body!)).toEqual([]);
  });

  it("separated part with brain but no heart dies in 20 + mass / 2 turns", () => {
    expect(lifetimeWithoutHeart(0)).toBe(20);
    expect(lifetimeWithoutHeart(99.5)).toBe(69);
    expect(lifetimeWithoutHeart(36.5)).toBe(38);
    const r = separate(swampMutant(4), SWAMP_HEAD2)!;
    expect(r.leaves.fate).toBe("brainOnly");
    // The piece is lighter since flesh weighs by section (decision 1260).
    expect(r.leaves.lifetime).toBe(63);
  });

  it("what loses its path to you leaves too: the chain", () => {
    const b = chain();
    const a: BrainRef = { node: CHAIN.headA, end: 0 };
    const bb: BrainRef = { node: CHAIN.headB, end: 0 };
    expect(territoryOf(b, a)!.nodes).toEqual([CHAIN.pelvis, CHAIN.headA]);
    expect(territoryOf(b, bb)!.nodes).toEqual([CHAIN.headB]);

    const r = separate(cloneBody(b), a)!;
    expect(r.border).toEqual([CHAIN.torso, CHAIN.legB]);
    expect(r.pain).toBe(60);
    expect(r.yours).toEqual({ nodes: [1, 2, 10], segments: [6, 7] });
    expect(r.leaves.part).toEqual({ nodes: [3, 4, 11], segments: [8, 12] });
    expect(r.leaves.fate).toBe("brainOnly");
    expect(r.leaves.lifetime).toBe(38);
    expect(r.leaves.body!.nodes[CHAIN.headA]!.wound).toBe(20);
    expect(r.others).toHaveLength(1);
    expect(r.others[0]!.part).toEqual({ nodes: [5, 13], segments: [9] });
    expect(r.others[0]!.fate).toBe("brainOnly");
    expect(r.others[0]!.lifetime).toBe(28);
    expect(r.others[0]!.body!.self).toEqual({ node: CHAIN.headB });
    expect(r.others[0]!.body!.segments[CHAIN.legB]).toMatchObject({ a: 13, b: CHAIN.headB, length: 2 });
    expect(r.bleeding).toEqual([CHAIN.torso]);

    const only = separate(cloneBody(b), bb)!;
    expect(only.border).toEqual([CHAIN.legB]);
    expect(only.pain).toBe(50);
    expect(only.yours).toEqual({ nodes: [1, 2, 3, 4], segments: [6, 7, 8] });
    expect(only.leaves.part).toEqual({ nodes: [5, 10], segments: [9] });
    expect(only.others).toEqual([]);
    expect(only.bleeding).toEqual([CHAIN.headA]);
  });

  it("nothing to separate: no territory, a seizing head, yourself, a dead brain", () => {
    const shared = bodyFromText(`
      голова[2] {голова(мозг*, глаз), голова(мозг, глаз)}
      грудь[3]
      голова -шея:1/1 кожа- грудь
      грудь -корпус:2/3 кожа {сердце}- голова
    `);
    expect(separate(cloneBody(shared), { node: 1, end: 1 })).toBeNull();
    expect(separate(cloneBody(shared), { node: 1, end: 0 })).toBeNull();
    expect(separate(cloneBody(shared), { node: 99, end: 0 })).toBeNull();
    expect(separate(cloneBody(swampMutant(9)), SWAMP_HEAD2)).toBeNull();
    const dead = swampMutant(4);
    dead.nodes[SWAMP.head2]!.ischemia = 5;
    expect(separate(dead, SWAMP_HEAD2)).toBeNull();
    expect(separate(human(), selfRef(human())!)).toBeNull();
  });

  it("a brain in a cavity takes its cavity along", () => {
    const b = human(1000);
    // The shin, not the thigh: a sway-4 brain in the middle of the thigh (0.5 from the hip) would claim the chest too.
    apply(b, "thicken", {}, { segment: HUMAN_IDS.shinL });
    b.segments[HUMAN_IDS.shinL]!.cavity.push(brainOrgan(4));
    const ref: BrainRef = { segment: HUMAN_IDS.shinL, slot: 0 };
    // From the middle of the shin, less sway 2: pelvis -0.5, feet -1.5 and 1.5, chest 1.5;
    // from you: pelvis 3, feet 5, chest 1.
    const pelvisSide = [
      HUMAN_IDS.pelvis, HUMAN_IDS.footL, HUMAN_IDS.footR, HUMAN_IDS.hipL, HUMAN_IDS.hipR,
      HUMAN_IDS.kneeL, HUMAN_IDS.kneeR, HUMAN_IDS.penisTip,
    ];
    expect(territoryOf(b, ref)!.nodes).toEqual(pelvisSide);
    const r = separate(b, ref)!;
    expect(r.border).toEqual([HUMAN_IDS.torso]);
    expect(r.leaves.part).toEqual({
      nodes: [...pelvisSide, 32],
      segments: [
        HUMAN_IDS.torso, HUMAN_IDS.legL, HUMAN_IDS.legR, HUMAN_IDS.flankHipL, HUMAN_IDS.flankHipR,
        HUMAN_IDS.shinL, HUMAN_IDS.shinR, HUMAN_IDS.penis,
      ],
    });
    expect(r.leaves.fate).toBe("creature");
    const lb = r.leaves.body!;
    expect(lb.self).toEqual({ segment: HUMAN_IDS.shinL });
    expect(swayOf(brainAt(lb, selfRef(lb)!)!)).toBe(4);
    expect(validate(lb)).toEqual([]);
    expect(validate(b)).toEqual([]);
  });

  it("a brain in the cavity of a border torso stays with its side", () => {
    const b = bodyFromText(`
      грудь[3]
      таз[3]
      стопа[1] {стопа}
      грудь -корпус:2/3 кожа {мозг*, сердце}- таз
      грудь -корпус:4/3 кожа {мозг!1}- стопа
    `);
    const ref: BrainRef = { segment: 5, slot: 0 };
    // From the second torso's middle: foot 2, chest 2; from you: chest 1, foot 5. Chest is yours at sway 1.
    expect(territoryOf(b, ref)!.nodes).toEqual([3]);
    const r = separate(b, ref)!;
    expect(r.border).toEqual([5]);
    // t = (1.5 + 4 - 1) / 2 = 2.25: two and two, a tie that would go to you - but the cavity holds the leaving brain.
    expect(b.segments[5]).toMatchObject({ a: 1, b: 6, length: 2, cavity: [] });
    const lb = r.leaves.body!;
    expect(lb.segments[8]).toMatchObject({ a: 7, b: 3, length: 2 });
    expect(brains(lb).map((x) => [x.key, x.self, x.sway])).toEqual([["s8.0", true, 1]]);
    expect(lb.segments[8]!.cavity.map((o) => o.kind)).toEqual(["brain"]);
    expect(brains(b).map((x) => x.key)).toEqual(["s4.0"]);
    expect(validate(b)).toEqual([]);
    expect(validate(lb)).toEqual([]);

    const mine = bodyFromText(`
      таз[3]
      грудь[3]
      стопа[1] {голова(мозг!2)}
      таз -корпус:2/3 кожа {сердце}- грудь
      грудь -корпус:4/3 кожа {мозг*}- стопа
    `);
    // Your torso is a border segment: the head at the foot claims the foot end but the cavity stays with you.
    const head: BrainRef = { node: 3, end: 0 };
    expect(territoryOf(mine, head)!.nodes).toEqual([3]);
    const m = separate(mine, head)!;
    expect(m.border).toEqual([5]);
    expect(mine.segments[5]!.cavity.map((o) => o.kind)).toEqual(["brain"]);
    expect(selfRef(mine)).toEqual({ segment: 5, slot: 0 });
    expect(validate(mine)).toEqual([]);

    // A third brain in the cavity of the border torso owns the near end: the cavity stays on its side even though the longer piece leaves.
    const third = bodyFromText(`
      голова[2] {голова(мозг*)}
      грудь[3]
      низ[3]
      узел[1] {голова(мозг!6)}
      голова -шея:1/1 кожа- грудь
      грудь -корпус:3/3 кожа {мозг!2}- низ
      низ -корпус:2/3 кожа {сердце}- узел
    `);
    const far: BrainRef = { node: 4, end: 0 };
    expect(territories(third).map((t) => [t.brain.key, t.nodes])).toEqual([
      ["n1.0", [1]],
      ["n4.0", [3, 4]],
      ["s6.0", [2]],
    ]);
    // t = (-1 + 3 - 0.5) / 2 = 0.75: one of three stays, the longer two leave - without the cavity.
    const r3 = separate(third, far)!;
    expect(r3.border).toEqual([6]);
    expect(r3.yours).toEqual({ nodes: [1, 2, 8], segments: [5, 6] });
    expect(third.segments[6]).toMatchObject({ a: 2, b: 8, length: 1 });
    expect(third.segments[6]!.cavity.map((o) => o.kind)).toEqual(["brain"]);
    expect(r3.leaves.body!.segments[10]).toMatchObject({ a: 9, b: 3, length: 2, cavity: [] });
    expect(r3.leaves.fate).toBe("creature");
    expect(brains(third).map((x) => [x.key, x.sway])).toEqual([
      ["n1.0", 0],
      ["s6.0", 2],
    ]);
    expect(validate(third)).toEqual([]);
  });

  it("separation is deterministic", () => {
    const run = (seed: number): string => {
      const b = brainyBody(seed);
      const out: unknown[] = [];
      for (const h of brains(b)) {
        if (h.self) continue;
        const c = cloneBody(b);
        const r = separate(c, h.ref);
        out.push(r === null ? null : { yours: r.yours, border: r.border, hash: bodyHash(c), leaves: bodyHash(r.leaves.body!) });
      }
      return JSON.stringify(out);
    };
    for (let seed = 1; seed <= 100; seed++) expect(run(seed)).toBe(run(seed));
  });
});
