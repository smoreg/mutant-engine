/**
 * The acid of the muscles below the top (breath.md §3, decision 1302): 30-99
 * weaken every blow a muscle swings, slow the body and burn. One reading of
 * the acid, `acidToll`, and every place that pays it reads the same one. Read
 * over the bestiary, the foes, the human and 200 random mutants.
 */
import { LabRng as Rng } from "../rng.js";
import { describe, expect, it } from "vitest";
import { BEASTS, FOES, acidToll, armory, brains, breathe, cloneBody, derive, dodgeOf, effort, exert, fixtureBody, foeBody, human, keyOf, newHarm, planStrike, strikes, turn, type Body } from "../index.js";
import { population } from "./gen.js";

const ALL: { id: string; body: () => Body }[] = [
  { id: "human", body: () => human() },
  ...FOES.map((f) => ({ id: `foe:${f.id}`, body: () => foeBody(f) })),
  ...BEASTS.map((b) => ({ id: b.id, body: () => fixtureBody(b) })),
  ...population(200).map((b, i) => ({ id: `random:${i}`, body: () => cloneBody(b) })),
];

describe("acid below the top", () => {
  it("q3-2: the bands of breath.md §3 - nothing to 29, then -1, then the burn and a tenth of the speed, then -2 and a fifth", () => {
    const rows: [number, number, number, number][] = [
      [0, 0, 1, 0], [29, 0, 1, 0], [30, 1, 1, 0], [49, 1, 1, 0], [50, 1, 0.9, 1], [69, 1, 0.9, 1], [70, 2, 0.8, 1], [99, 2, 0.8, 1],
    ];
    for (const [acid, damage, speed, burn] of rows) expect(acidToll(acid), `acid ${acid}`).toEqual({ damage, speed, burn });
    expect(acidToll(undefined)).toEqual({ damage: 0, speed: 1, burn: 0 });
  });

  it("q3-2: every blow a muscle swings loses the toll, a gland loses nothing", () => {
    const bad: string[] = [];
    for (const { id, body } of ALL) {
      const b = body();
      const base = new Map(armory(b).map((s) => [s.key, s.force]));
      for (const acid of [40, 80]) {
        const toll = acidToll(acid).damage;
        for (const p of planStrike(b, human(), 1, { acid }).planned) {
          const want = base.get(p.strike.key)! - (p.strike.cost === 0 ? toll : 0);
          if (p.strike.force !== want) bad.push(`${id} ${p.strike.key} acid ${acid}: ${p.strike.force} want ${want}`);
        }
      }
    }
    expect(bad.slice(0, 10).join("\n")).toBe("");
  });

  it("q3-2: a sour body is never quicker out of the way, and the human at 70 loses a point of dodge", () => {
    const bad: string[] = [];
    for (const { id, body } of ALL) {
      const b = body();
      const d0 = dodgeOf(b);
      for (const acid of [30, 50, 70, 99]) if (dodgeOf(b, acid) > d0) bad.push(`${id} acid ${acid}: ${dodgeOf(b, acid)} > ${d0}`);
    }
    expect(bad.slice(0, 10).join("\n")).toBe("");
    expect(dodgeOf(human(), 70)).toBe(dodgeOf(human()) - 1);
  });

  it("q3-2: the naked human boxes on air as long as he likes; the heavy and the many-armed go sour (breath.md §2)", () => {
    // Thirty turns of the body's full volley at a human, breathed as `elapse` breathes.
    const acidAfter = (body: Body): number => {
      const air = planStrike(body, human(), 1).planned.reduce((n, p) => n + effort("strike", p.strike.mass), 0);
      const b = derive(body).breath;
      const h = newHarm(body);
      for (let t = 0; t < 30; t++) {
        exert(h, air);
        breathe(h, { intake: Math.max(b.intake.air, b.intake.water), base: b.base, tank: b.tank.common, delivery: b.delivery });
      }
      return h.acid ?? 0;
    };
    expect(acidAfter(human())).toBeLessThan(30);
    for (const id of ["troll", "warrior", "orc"]) {
      const f = FOES.find((x) => x.id === id)!;
      expect(acidAfter(foeBody(f)), id).toBeGreaterThanOrEqual(30);
    }
    expect(acidAfter(fixtureBody(BEASTS.find((b) => b.id === "bear")!)), "bear").toBeGreaterThanOrEqual(30);
  });

  it("q3-2: from 50 the muscles burn - a point of pain a turn more than the same body calm", () => {
    const painAfter = (acid: number): number => {
      const b = human();
      const h = newHarm(b);
      if (acid > 0) h.acid = acid;
      turn(b, h, { upkeep: false }, new Rng(1));
      const me = brains(b).find((x) => x.self)!;
      return h.organs[keyOf(b, me.organ)!]?.pain ?? 0;
    };
    expect(painAfter(40)).toBe(painAfter(0));
    expect(painAfter(60)).toBe(painAfter(0) + 1);
    expect(painAfter(90)).toBe(painAfter(0) + 1);
  });
});
