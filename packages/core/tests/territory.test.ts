import { describe, expect, it } from "vitest";
import {
  HUMAN_IDS,
  apply,
  bodyFromText,
  bodyHash,
  border,
  brainOrgan,
  brains,
  distances,
  human,
  nodeIds,
  organ,
  placeDistance,
  segmentIds,
  seizesBody,
  selfRef,
  swayOf,
  territories,
  territoryOf,
  validate,
  type Body,
  type BrainRef,
  type Territory,
} from "../index.js";
import { SWAMP, SWAMP_HEAD2, brainyBody, brainyPopulation, swampMutant } from "./genHeads.js";

const byId = (x: number, y: number): number => x - y;

/** Nodes reachable from the first node of the territory over the territory's own segments. */
function reach(body: Body, t: Territory): number[] {
  if (t.nodes.length === 0) return [];
  const inside = new Set(t.nodes);
  const seen = new Set<number>([t.nodes[0]!]);
  const stack = [t.nodes[0]!];
  while (stack.length > 0) {
    const n = stack.pop()!;
    for (const sid of t.segments) {
      const s = body.segments[sid]!;
      if (s.a !== n && s.b !== n) continue;
      const other = s.a === n ? s.b : s.a;
      if (inside.has(other) && !seen.has(other)) {
        seen.add(other);
        stack.push(other);
      }
    }
  }
  return [...seen].sort(byId);
}

/** Human with one extra head on a limb: `kind` of the given length from `at`, sway as given. */
function humanWithHead(at: number, kind: "neck" | "tentacle", length: number, sway: number): { body: Body; ref: BrainRef & { node: number } } {
  const body = human(1000);
  const node = apply(body, "sprout", { kind, length, girth: 1, cover: "skin", ending: organ("head", [brainOrgan(sway), organ("eye")]) }, { node: at }).created[0]!;
  return { body, ref: { node, end: 0 } };
}

describe("territories", () => {
  it("territories partition all nodes", () => {
    for (const b of brainyPopulation()) {
      const ts = territories(b);
      expect(ts.map((t) => t.brain.key)).toEqual(brains(b).map((x) => x.key));
      const all = ts.flatMap((t) => t.nodes).sort(byId);
      expect(all, bodyHash(b)).toEqual(nodeIds(b));
      const inside = new Set<number>();
      for (const t of ts) {
        expect(t.nodes).toEqual([...t.nodes].sort(byId));
        expect(t.segments).toEqual([...t.segments].sort(byId));
        expect(t.border).toEqual([...t.border].sort(byId));
        expect(reach(b, t)).toEqual(t.nodes);
        const mine = new Set(t.nodes);
        for (const s of t.segments) {
          expect(mine.has(b.segments[s]!.a) && mine.has(b.segments[s]!.b)).toBe(true);
          inside.add(s);
        }
        for (const s of t.border) expect(mine.has(b.segments[s]!.a) !== mine.has(b.segments[s]!.b)).toBe(true);
        if (t.nodes.length === 0) {
          expect(t.segments).toEqual([]);
          expect(t.border).toEqual([]);
          continue;
        }
        if ("node" in t.brain.place) expect(t.nodes).toContain(t.brain.place.node);
        else {
          const s = b.segments[t.brain.place.segment]!;
          expect(mine.has(s.a) || mine.has(s.b)).toBe(true);
        }
      }
      const borders = new Set(ts.flatMap((t) => t.border));
      for (const s of segmentIds(b)) expect(inside.has(s) !== borders.has(s), `segment ${s}`).toBe(true);
    }
  });

  it("a dead brain claims nothing", () => {
    // The chest is a small full node now: the head grows from the shoulder, as far from you.
    const { body, ref } = humanWithHead(HUMAN_IDS.shoulderR, "neck", 1, 8);
    expect(territoryOf(body, ref)!.nodes.length).toBeGreaterThan(1);
    body.nodes[ref.node]!.ischemia = 5;
    expect(territoryOf(body, ref)!.nodes).toEqual([]);
    expect(territoryOf(body, selfRef(body)!)!.nodes).toEqual(nodeIds(body));
  });

  it("sway 0: territory is the strictly closer set", () => {
    const b = swampMutant(0);
    const dYou = distances(b, b.self);
    const dHead = distances(b, { node: SWAMP.head2 });
    expect(dYou[SWAMP.pelvis]).toBe(3);
    expect(dHead[SWAMP.pelvis]).toBe(3);
    const t = territoryOf(b, SWAMP_HEAD2)!;
    expect(t.nodes).toEqual(nodeIds(b).filter((n) => dHead[n]! < dYou[n]!));
    expect(t.nodes).toEqual([SWAMP.head2]);
    expect(t.nodes).not.toContain(SWAMP.pelvis);
    const one = swampMutant(1);
    expect(territoryOf(one, SWAMP_HEAD2)!.nodes).toContain(SWAMP.pelvis);
  });

  it("Топь mutant table", () => {
    const all = [1, 2, 3, 4, 5, 6, 7, 8];
    const expected = (sway: number): number[] =>
      sway === 0 ? [6] : sway <= 4 ? [3, 6, 7, 8] : sway <= 8 ? [2, 3, 4, 5, 6, 7, 8] : all;
    for (let sway = 0; sway <= 10; sway++) {
      const b = swampMutant(sway);
      expect(validate(b)).toEqual([]);
      expect(swayOf(b.nodes[SWAMP.head2]!.ends[0]!.contents![0]!)).toBe(sway);
      const t = territoryOf(b, SWAMP_HEAD2)!;
      expect(t.nodes, `sway ${sway}`).toEqual(expected(sway));
      expect(territoryOf(b, selfRef(b)!)!.nodes, `sway ${sway}`).toEqual(all.filter((n) => !t.nodes.includes(n)));
      expect(seizesBody(b, SWAMP_HEAD2), `sway ${sway}`).toBe(sway >= 9);
    }
    const t4 = territoryOf(swampMutant(4), SWAMP_HEAD2)!;
    expect(t4.segments).toEqual([SWAMP.tentacle, SWAMP.legL, SWAMP.legR]);
    expect(t4.border).toEqual([SWAMP.torso, SWAMP.torso2]);
    expect(border(swampMutant(4), selfRef(swampMutant(4))!)).toEqual([SWAMP.torso, SWAMP.torso2]);
    const t6 = territoryOf(swampMutant(6), SWAMP_HEAD2)!;
    expect(t6.segments).toEqual([10, 11, 12, 13, 14, 15, 16]);
    expect(t6.border).toEqual([SWAMP.neck]);
    const t9 = territoryOf(swampMutant(9), SWAMP_HEAD2)!;
    expect(t9.segments).toEqual(segmentIds(swampMutant(9)));
    expect(t9.border).toEqual([]);
  });

  it("body seizure iff d(head, self) < sway / 2", () => {
    let seized = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const b = brainyBody(seed);
      const list = brains(b);
      if (!("node" in b.self)) continue;
      const me = list.find((x) => x.self)!;
      const others = list.filter((x) => !x.self && x.alive);
      const formula = others.filter((h) => placeDistance(b, h.place, me.place)! < h.sway / 2);
      const seizers = others.filter((h) => seizesBody(b, h.ref));
      expect(seizers.length).toBeLessThanOrEqual(1);
      if (others.length === 1) expect(seizers.map((h) => h.key)).toEqual(formula.map((h) => h.key));
      else {
        for (const h of seizers) expect(formula.map((x) => x.key)).toContain(h.key);
        expect(seizers.length > 0).toBe(formula.length > 0);
      }
      const mine = territoryOf(b, me.ref)!;
      expect(mine.nodes.includes(b.self.node)).toBe(seizers.length === 0);
      expect(mine.nodes.length === 0).toBe(seizers.length === 1);
      seized += seizers.length;
    }
    expect(seized).toBeGreaterThan(5);
  });

  it("seizure of a brain in a cavity: your torso is hers", () => {
    const make = (sway: number) =>
      bodyFromText(`
        грудь[3]
        таз[3]
        стопа[1] {голова(мозг${sway > 0 ? `!${sway}` : ""})}
        грудь -корпус:2/3 кожа {мозг*, сердце}- таз
        таз -нога:2/1 кожа- стопа
      `);
    const ref: BrainRef = { node: 3, end: 0 };
    // From the foot: pelvis 2, chest 4, middle of the torso 3.
    for (let sway = 0; sway <= 10; sway++) {
      const b = make(sway);
      const t = territoryOf(b, ref)!;
      const seized = seizesBody(b, ref);
      expect(seized, `sway ${sway}`).toBe(t.nodes.includes(1) && t.nodes.includes(2));
      expect(seized, `sway ${sway}`).toBe(t.segments.includes(4));
      expect(territoryOf(b, selfRef(b)!)!.nodes.length === 0, `sway ${sway}`).toBe(seized);
    }
    expect(seizesBody(make(6), ref)).toBe(false);
    expect(seizesBody(make(9), ref)).toBe(true);
  });

  it("head on a length-6 tentacle never seizes the body below sway 10", () => {
    // The shoulder stands in for the chest, a small full node on the human now.
    for (const at of [HUMAN_IDS.head, HUMAN_IDS.shoulderR, HUMAN_IDS.handL]) {
      for (let sway = 0; sway <= 10; sway++) {
        const { body, ref } = humanWithHead(at, "tentacle", 6, sway);
        expect(seizesBody(body, ref), `at ${at} sway ${sway}`).toBe(false);
        expect(territoryOf(body, selfRef(body)!)!.nodes).toContain(HUMAN_IDS.head);
      }
    }
    const near = humanWithHead(HUMAN_IDS.head, "neck", 1, 3);
    expect(seizesBody(near.body, near.ref)).toBe(true);
    const nearer = humanWithHead(HUMAN_IDS.head, "neck", 1, 2);
    expect(seizesBody(nearer.body, nearer.ref)).toBe(false);
  });

  it("a head sharing your node needs sway 1 to take everything", () => {
    const b = bodyFromText(`
      голова[2] {голова(мозг*, глаз), голова(мозг, глаз)}
      грудь[3]
      голова -шея:1/1 кожа- грудь
    `);
    const ref: BrainRef = { node: 1, end: 1 };
    expect(territoryOf(b, ref)!.nodes).toEqual([]);
    expect(seizesBody(b, ref)).toBe(false);
    b.nodes[1]!.ends[1]!.contents![0]!.sway = 1;
    expect(territoryOf(b, ref)!.nodes).toEqual([1, 2]);
    expect(seizesBody(b, ref)).toBe(true);
    expect(territoryOf(b, selfRef(b)!)!.nodes).toEqual([]);
  });

  it("between two foreign heads the smaller claim wins, ties go by order", () => {
    const b = bodyFromText(`
      голова[2] {голова(мозг*)}
      грудь[3]
      лев[1] {голова(мозг!4)}
      прав[1] {голова(мозг!4)}
      низ[2]
      голова -шея:1/1 кожа- грудь
      грудь -корпус:2/3 кожа {сердце}- низ
      низ -рука:2/1 кожа- лев
      низ -рука:2/1 кожа- прав
    `);
    const left = territoryOf(b, { node: 3, end: 0 })!;
    const right = territoryOf(b, { node: 4, end: 0 })!;
    expect(left.nodes).toEqual([3, 5]);
    expect(right.nodes).toEqual([4]);
    b.nodes[4]!.ends[0]!.contents![0]!.sway = 6;
    expect(territoryOf(b, { node: 3, end: 0 })!.nodes).toEqual([3]);
    expect(territoryOf(b, { node: 4, end: 0 })!.nodes).toEqual([4, 5]);
  });

  it("placeDistance measures to a node or to the middle of a torso", () => {
    const b = bodyFromText(`
      голова[2] {голова(мозг*)}
      грудь[3]
      таз[3]
      голова -шея:1/1 кожа- грудь
      грудь -корпус:4/3 кожа {сердце, мозг!2}- таз
      таз -корпус:2/3 кожа {мозг!1}- голова
    `);
    expect(placeDistance(b, b.self, { node: 3 })).toBe(2);
    expect(placeDistance(b, b.self, { segment: 5 })).toBe(3);
    expect(placeDistance(b, { segment: 5 }, { segment: 5 })).toBe(0);
    expect(placeDistance(b, { segment: 5 }, { segment: 6 })).toBe(3);
    expect(placeDistance(b, { segment: 6 }, { node: 1 })).toBe(1);
    expect(placeDistance(b, { node: 1 }, { node: 99 })).toBeUndefined();
  });

  it("territories are pure and deterministic", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const a = brainyBody(seed);
      const before = bodyHash(a);
      const ta = JSON.stringify(territories(a));
      for (const x of brains(a)) {
        seizesBody(a, x.ref);
        border(a, x.ref);
      }
      expect(bodyHash(a)).toBe(before);
      const b = brainyBody(seed);
      expect(bodyHash(b)).toBe(before);
      expect(JSON.stringify(territories(b))).toBe(ta);
    }
  });

  // "territories on a 40-node body with six brains take <= 1 ms" moved to packages/core/bench/territory.test.ts (D.2).
});
