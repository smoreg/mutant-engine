import { describe, expect, it } from "vitest";
import {
  GEAR_PATTERNS,
  LIMITS,
  apply,
  bodyFromText,
  bodyHash,
  cloneBody,
  derive,
  human,
  membranesOn,
  nodeIds,
  organ,
  segmentIds,
  segmentsAt,
  targets,
  touch,
  validate,
  type Body,
  type GearMatch,
} from "../../index.js";
import { population } from "../gen.js";
import { populationC } from "../genC.js";

const bodies = () => [...population(250), ...populationC(250)];

describe("derived properties over 500 bodies", () => {
  it("exposure sums to 100 %, every element listed once, joints without endings at 0", () => {
    for (const b of bodies()) {
      const d = derive(b);
      const ids = d.exposure.parts.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.length).toBe(nodeIds(b).length + segmentIds(b).length + Object.keys(b.membranes).length);
      expect(d.exposure.parts.reduce((s, p) => s + p.share, 0)).toBeCloseTo(1, 9);
      expect(d.exposure.parts.reduce((s, p) => s + p.area, 0)).toBe(d.exposure.total);
      // The crowd of endings moves weight between endings and never out of
      // them (decision 591): the flesh keeps bare area and the sum still is
      // the total, to the last place a float holds.
      expect(d.exposure.parts.reduce((s, p) => s + p.weight, 0)).toBeCloseTo(d.exposure.total, 9);
      const ends = d.exposure.parts.filter((p) => p.kind === "node");
      expect(ends.reduce((s, p) => s + p.weight, 0)).toBeCloseTo(ends.reduce((s, p) => s + p.area, 0), 9);
      for (const p of d.exposure.parts) {
        expect(p.weight).toBeGreaterThanOrEqual(0);
        if (p.kind !== "node") expect(p.weight).toBe(p.area);
        if (p.kind === "node" && b.nodes[p.id]!.ends.length === 0) expect(p.weight).toBe(0);
      }
    }
  });

  /**
   * What the rule is for, in the shape the owner asked for it: a head on a
   * body of five parts is an easy thing to find, and the same head on a body
   * of twenty is not. Both bodies carry the same head on the same neck over
   * the same torso; the difference is only how many other parts there are.
   */
  it("many parts hide a head: the same head catches a third as much on a body of twenty (decision 591)", () => {
    const few = bodyFromText(`
голова[2] {голова(мозг*, глаз, глаз, челюсть)}
грудь[3]
стопа[1] {стопа}
голова -шея:1/1 кожа- грудь
грудь -корпус:2/3 кожа {сердце, лёгкие, желудок}- стопа
`);
    const many = bodyFromText(`
голова[2] {голова(мозг*, глаз, глаз, челюсть)}
грудь[3]
таз[3]
хвост[3]
к1[1] {кисть}
к2[1] {кисть}
к3[1] {кисть}
к4[1] {кисть}
с1[1] {стопа}
с2[1] {стопа}
с3[1] {стопа}
с4[1] {стопа}
голова -шея:1/1 кожа- грудь
грудь -корпус:2/3 кожа {сердце, лёгкие, желудок}- таз
таз -корпус:2/3 кожа- хвост
грудь -рука:1/1 кожа- к1
грудь -рука:1/1 кожа- к2
таз -рука:1/1 кожа- к3
таз -рука:1/1 кожа- к4
хвост -нога:1/1 кожа- с1
хвост -нога:1/1 кожа- с2
таз -нога:1/1 кожа- с3
таз -нога:1/1 кожа- с4
`);
    const headShare = (b: Body): number => derive(b).exposure.parts.find((p) => p.kind === "node" && p.id === ("node" in b.self ? b.self.node : -1))!.share;
    const parts = (b: Body): number => derive(b).exposure.parts.filter((p) => p.weight > 0).length;
    expect(parts(few)).toBeLessThanOrEqual(5);
    expect(parts(many)).toBeGreaterThanOrEqual(20);
    expect(headShare(few)).toBeGreaterThan(0.2);
    expect(headShare(many)).toBeLessThan(0.08);
    expect(headShare(few) / headShare(many)).toBeGreaterThan(3);
  });

  // The crowd never turns the order of two endings around: a bigger ending is
  // still the likelier of the two, it just leads by less (decision 591).
  it("the crowd of endings keeps their order and never lifts one above the pool", () => {
    for (const b of bodies()) {
      const ends = derive(b).exposure.parts.filter((p) => p.kind === "node" && p.weight > 0);
      if (ends.length === 0) continue;
      const pool = ends.reduce((s, p) => s + p.weight, 0);
      for (const p of ends) expect(p.weight).toBeLessThanOrEqual(pool + 1e-9);
      const byArea = [...ends].sort((x, y) => x.area - y.area);
      for (let i = 1; i < byArea.length; i++) expect(byArea[i]!.weight).toBeGreaterThanOrEqual(byArea[i - 1]!.weight - 1e-9);
    }
  });

  it("gear patterns: glove needs a hand, vest needs a torso with 2-4 branches - matches equal a direct search", () => {
    const eyesIn = (o: { contents?: { kind: string }[] }) => (o.contents ?? []).filter((c) => c.kind === "eye" || c.kind === "facetEye").length;
    const brute = (b: Body): GearMatch[] => {
      const out: GearMatch[] = [];
      for (const p of GEAR_PATTERNS) {
        for (const id of nodeIds(b)) {
          b.nodes[id]!.ends.forEach((e, index) => {
            const push = () => out.push({ pattern: p.id, node: id, index });
            if (p.id === "glove" && (e.kind === "hand" || e.kind === "pseudopod")) push();
            if (p.id === "boot" && e.kind === "foot") push();
            if (p.id === "helmet" && e.kind === "head" && b.nodes[id]!.size <= 2 && eyesIn(e) <= 4) push();
          });
        }
        for (const id of segmentIds(b)) {
          const s = b.segments[id]!;
          if (s.kind !== "torso") continue;
          const veiled = membranesOn(b, id).length > 0;
          const girdle = [s.a, s.b].some((n) => {
            const others = segmentsAt(b, n).length - 1;
            return others >= 2 && others <= 4;
          });
          if (p.id === "vest" && girdle && !veiled && s.girth < 4) out.push({ pattern: p.id, segment: id });
          if (p.id === "backpack" && s.girth >= 2 && !veiled) out.push({ pattern: p.id, segment: id });
          if (p.id === "belt" || p.id === "holster") out.push({ pattern: p.id, segment: id });
        }
      }
      return out;
    };
    let matches = 0;
    for (const b of bodies()) {
      const got = derive(b).gear;
      expect(got).toEqual(brute(b));
      matches += got.length;
    }
    expect(matches).toBeGreaterThan(500 * 5);
  });

  it("every derived list is ordered by id and never names an element the body lacks", () => {
    for (const b of bodies()) {
      const d = derive(b);
      const has = (id: number) => b.nodes[id] !== undefined || b.segments[id] !== undefined || b.membranes[id] !== undefined;
      const ascending = (xs: number[]) => xs.every((x, i) => i === 0 || xs[i - 1]! <= x);
      expect(ascending(d.attacks.map((a) => a.node))).toBe(true);
      expect(ascending(d.grips.list.map((g) => g.node))).toBe(true);
      expect(ascending(d.speed.stands.map((s) => s.node))).toBe(true);
      expect(ascending(d.exposure.parts.map((p) => p.id))).toBe(true);
      expect(ascending(d.armor.parts.map((p) => p.id))).toBe(true);
      expect(ascending(d.senses.viewpoints.map((v) => v.node))).toBe(true);
      expect(ascending(d.blood.starving.map((s) => s.id))).toBe(true);
      for (const a of d.attacks) {
        expect(has(a.node)).toBe(true);
        expect(a.reach).toBeGreaterThanOrEqual(1);
        expect(a.reach).toBeLessThanOrEqual(3);
        for (const s of a.chain) expect(b.segments[s]).toBeDefined();
      }
      for (const o of d.breath.organs) expect(has(o.at)).toBe(true);
      for (const g of d.gear) expect(has(g.node ?? g.segment!)).toBe(true);
      expect(d.speed.value).toBeGreaterThanOrEqual(0);
      expect(d.grips.precise).toBeLessThanOrEqual(d.grips.total);
      expect(d.bulk).toBeGreaterThanOrEqual(1);
      expect(d.bulk).toBeLessThanOrEqual(9);
      expect(d.breath.tank.total).toBeCloseTo(d.breath.tank.common + d.breath.tank.muscle, 9);
      expect(d.budgets.mass).toBeLessThanOrEqual(b.meat + 1e-9);
      expect(d.eat.can).toBe(d.eat.mouths.some((m) => m.fed));
    }
  });
});

function fortyNodes(): Body {
  const b = human(100_000);
  const arm = { kind: "arm", length: 2, girth: 1, cover: "skin", ending: organ("hand") } as const;
  while (nodeIds(b).length < LIMITS.nodes) {
    const t = targets(b, "sprout", arm);
    apply(b, "sprout", arm, t[t.length - 1]!.target);
  }
  return b;
}

describe("derive is pure and cached", () => {
  it("does not change the body, returns the same object until the body changes, and the second call is cheaper", () => {
    const b = human(1000);
    const before = bodyHash(b);
    const text = JSON.stringify(b);
    const d1 = derive(b);
    expect(bodyHash(b)).toBe(before);
    expect(JSON.stringify(b)).toBe(text);
    expect(validate(b)).toEqual([]);
    expect(derive(b)).toBe(d1);
    touch(b);
    const d2 = derive(b);
    expect(d2).not.toBe(d1);
    expect(d2).toEqual(d1);
    // A clone is another body with its own cache.
    const c = cloneBody(b);
    expect(derive(c)).not.toBe(d2);
    expect(derive(c)).toEqual(d2);

    const big = fortyNodes();
    const N = 300;
    let t0 = performance.now();
    for (let i = 0; i < N; i++) {
      touch(big);
      derive(big);
    }
    const uncached = (performance.now() - t0) / N;
    t0 = performance.now();
    for (let i = 0; i < N; i++) derive(big);
    const cached = (performance.now() - t0) / N;
    console.log(`derive: ${uncached.toFixed(3)} ms uncached, ${cached.toFixed(4)} ms cached`);
    expect(cached).toBeLessThan(uncached);
  });

  // "derive on a 40-node body takes <= 2 ms" moved to packages/core/bench/derive-properties.test.ts (D.2).
});
