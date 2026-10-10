/**
 * Effort costs air (docs/tasks/sanity/README.md, findings S-breath-07/08,
 * breath.md §2-3): what a blow moves is paid in air over the rest, work past
 * the heart's delivery goes into acid, and acid at its top stops the blow.
 * Every rule is a property over the bestiary, the foes, the human and 200
 * random mutants.
 */
import { LabRng as Rng } from "../rng.js";
import { describe, expect, it } from "vitest";
import {
  ACID_MAX,
  derive,
  effort,
  elapse,
  exert,
  human,
  newBattle,
  newHarm,
  planStrike,
  stepBattle,
  type Body,
  type Harm,
} from "../index.js";
import { ROSTER } from "../bench/roster.js";
import { rowBody } from "../bench/source.js";
import { randomBody } from "./gen.js";

type Named = readonly [string, () => Body];

const POPULATION: readonly Named[] = [
  ...ROSTER.map((c): Named => [c.id, c.body]),
  ["human", () => human()],
  ...Array.from({ length: 200 }, (_, i): Named => [`random:${i + 1}`, () => randomBody(i + 1, 10 + ((i + 1) % 30), 100_000, { breathe: false })]),
];

/** Air one full volley at a human spends over the rest. */
function volleyAir(body: Body): number {
  return planStrike(body, human()).planned.reduce((s, p) => s + effort("strike", p.strike.mass), 0);
}

const intakeOf = (b: Body): number => {
  const i = derive(b).breath.intake;
  return Math.max(i.air, i.water);
};

/** `turns` turns of the body, striking a full volley in each when `work` is given. */
function live(body: Body, turns: number, work: number): Harm {
  const harm = newHarm(body);
  const rng = new Rng(1);
  for (let t = 0; t < turns && harm.dead === null; t++) {
    if (work > 0) exert(harm, work);
    elapse(body, rng, { harm, upkeep: false });
  }
  return harm;
}

describe("a blow costs air over the rest (S-breath-07)", () => {
  it("the rest is what it was: a breathing body keeps its tank full and owes nothing", () => {
    for (const [id, make] of POPULATION) {
      const body = make();
      if (intakeOf(body) <= 0) continue;
      const h = live(body, 15, 0);
      expect(h.air, id).toBeUndefined();
      expect(h.acid, id).toBeUndefined();
      expect(h.burst, id).toBeUndefined();
    }
  });

  it("fighting is never cheaper than resting, and a fight the breath carries costs nothing", () => {
    let winded = 0;
    for (const [id, make] of POPULATION) {
      const body = make();
      const w = volleyAir(body);
      if (w <= 0) continue;
      const rest = live(body, 15, 0);
      const fight = live(body, 15, w);
      expect(fight.acid ?? 0, id).toBeGreaterThanOrEqual(rest.acid ?? 0);
      expect(fight.reserve, id).toBeLessThanOrEqual(rest.reserve);
      if (rest.dead === null) expect(fight.air ?? Infinity, id).toBeLessThanOrEqual(rest.air ?? Infinity);
      const b = derive(body).breath;
      if (b.base + w <= intakeOf(body)) {
        expect(fight.acid, id).toBeUndefined();
        expect(fight.air, id).toBe(rest.air);
      }
      if ((fight.acid ?? 0) > 0) winded++;
    }
    expect(winded).toBeGreaterThan(10);
  });

  it("work past both what the hearts deliver and what the draw spares winds the body", () => {
    let seen = 0;
    for (const [id, make] of POPULATION) {
      const body = make();
      const b = derive(body).breath;
      const w = volleyAir(body);
      if (intakeOf(body) <= 0 || w <= b.delivery || b.base + w <= intakeOf(body)) continue;
      seen++;
      expect(live(body, 12, w).acid ?? 0, id).toBeGreaterThan(0);
    }
    expect(seen).toBeGreaterThan(5);
  });

  it("the first turns over the breath are free: the burst pays them", () => {
    for (const [id, make] of POPULATION) {
      const body = make();
      const w = volleyAir(body);
      if (w <= 0 || derive(body).breath.base + w <= intakeOf(body)) continue;
      const h = live(body, 3, w);
      expect(h.acid, id).toBeUndefined();
      expect(h.burst, id).toBe(3);
    }
  });

  it("a body that draws nothing dies sooner fighting than standing", () => {
    let faster = 0;
    for (const [id, make] of POPULATION) {
      const body = make();
      const w = volleyAir(body);
      if (intakeOf(body) > 0 || w <= 0) continue;
      const turnsTo = (work: number): number => {
        const harm = newHarm(body);
        const rng = new Rng(1);
        let t = 0;
        while (harm.dead === null && t < 200) {
          if (work > 0) exert(harm, work);
          elapse(body, rng, { harm, upkeep: false });
          t++;
        }
        return t;
      };
      const still = turnsTo(0);
      const fighting = turnsTo(w);
      expect(fighting, id).toBeLessThanOrEqual(still);
      if (fighting < still) faster++;
    }
    expect(faster).toBeGreaterThan(5);
  });
});

describe("the fight pays for its blows (S-breath-07)", () => {
  /** Steps a fight of the body against a human until the body has struck once. */
  function firstBlow(body: Body, harm?: Harm): { acted: boolean; work: number; waited: boolean } {
    const b = newBattle({ fighters: [{ id: "a", side: "A", body, ...(harm === undefined ? {} : { harm }) }, { id: "h", side: "B", body: human() }] });
    const rng = new Rng(3);
    for (let i = 0; i < 20 && b.result === null; i++) {
      const ev = stepBattle(b, rng);
      const a = b.fighters.find((f) => f.id === "a")!;
      if (ev.some((e) => e.k === "act" && e.who === "a")) return { acted: true, work: a.harm.work ?? 0, waited: false };
      if (ev.some((e) => e.k === "wait" && e.who === "a") && a.conscious) return { acted: false, work: 0, waited: true };
    }
    return { acted: false, work: 0, waited: false };
  }

  it("a volley in a fight owes the air its strikes move", () => {
    let struck = 0;
    for (const [id, make] of POPULATION.slice(0, ROSTER.length + 41)) {
      const body = make();
      const r = firstBlow(body);
      if (!r.acted) continue;
      struck++;
      if (volleyAir(body) > 0) expect(r.work, id).toBeGreaterThan(0);
    }
    expect(struck).toBeGreaterThan(20);
  });

  it("muscles at the top of their acid do not strike", () => {
    for (const [id, make] of POPULATION.slice(0, ROSTER.length + 41)) {
      const body = make();
      if (!firstBlow(body).acted) continue;
      const harm = { ...newHarm(body), acid: ACID_MAX };
      const r = firstBlow(body, harm);
      expect(r.acted, id).toBe(false);
    }
  });
});

describe("a gland pays its blow in air like any flesh (S-breath-08)", () => {
  it("fire, cold and acid glands cost air by the organ that throws them", () => {
    for (const row of ["fireGland", "cryoGland", "acidGland"]) {
      let seen = 0;
      for (let seed = 1; seed <= 5; seed++) {
        const body = rowBody(row, seed);
        const glands = planStrike(body, human(), 2).planned.filter((p) => p.strike.kind === row);
        seen += glands.length;
        for (const p of glands) expect(effort("strike", p.strike.mass), `${row} ${seed}`).toBeGreaterThan(0);
      }
      expect(seen, row).toBeGreaterThan(0);
    }
  });
});
