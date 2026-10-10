/**
 * Common sense of the fight (docs/tasks/sanity, findings S-fight-01..04): the
 * nerve a blow travels is paid in bodies, not in cells, so the heaviest blow of
 * a big body still reaches its mark. Read over the bestiary, the foes, the
 * human and 200 random mutants.
 */
import { describe, expect, it } from "vitest";
import { BEASTS, FOES, STRIKE, cloneBody, fixtureBody, foeBody, hitChance, human, mass, nerveTax, strikeForce, strikes, type Body } from "../index.js";
import { population } from "./gen.js";

const FIXTURES: { id: string; body: () => Body }[] = [
  { id: "human", body: () => human() },
  ...FOES.map((f) => ({ id: `foe:${f.id}`, body: () => foeBody(f) })),
  ...BEASTS.map((b) => ({ id: b.id, body: () => fixtureBody(b) })),
];
const MUTANTS = population(200);
const ALL: { id: string; body: () => Body }[] = [...FIXTURES, ...MUTANTS.map((b, i) => ({ id: `random:${i}`, body: () => cloneBody(b) }))];

describe("the nerve of a blow is paid in bodies", () => {
  it("S-fight-01: a body k times the size - k³ the mass, every nerve k times longer - pays the same tax", () => {
    const bad: string[] = [];
    const human0 = mass(human());
    for (const { id, body } of ALL) {
      const b = body();
      const m = Math.max(human0, mass(b));
      for (const s of strikes(b)) {
        for (const k of [2, 3]) {
          const small = nerveTax(s.nerve, m);
          const big = nerveTax(s.nerve * k, m * k ** 3);
          if (small !== big) bad.push(`${id} ${s.kind} nerve ${s.nerve} mass ${m.toFixed(0)} x${k}: ${small} vs ${big}`);
        }
      }
    }
    expect(bad.slice(0, 10).join("\n")).toBe("");
  });

  it("S-fight-01: the human's own blows pay nothing, and a limb grown past his reach still pays", () => {
    const m = mass(human());
    for (const s of strikes(human())) expect(nerveTax(s.nerve, m)).toBe(0);
    expect(nerveTax(7, m)).toBe(1);
  });

  it("S-fight-01: the heaviest blow of every drawn animal and foe lands at least 45 % of the time on a still mark", () => {
    const bad: string[] = [];
    for (const { id, body } of FIXTURES) {
      const list = strikes(body());
      if (list.length === 0) continue;
      const top = list.reduce((a, s) => (s.force > a.force ? s : a));
      const chance = hitChance(top.accuracy);
      if (chance < 0.45) bad.push(`${id} ${top.kind} f${top.force} nerve ${top.nerve} acc ${top.accuracy}: ${chance.toFixed(2)}`);
    }
    expect(bad.join("\n")).toBe("");
  });
});

describe("a light blow is a small blow", () => {
  it("S-fight-03: below the human's arm the force falls by the same formula it rises by above it", () => {
    for (let m = 1; m < STRIKE.unitMass; m++) {
      expect(strikeForce(m), `mass ${m}`).toBeLessThanOrEqual(strikeForce(m + 1));
    }
    expect(strikeForce(STRIKE.unitMass / 2)).toBeLessThan(0);
    expect(strikeForce(STRIKE.unitMass)).toBe(0);
  });

  it("S-fight-03: no blow a limb swings is quicker than the human's arm - light limbs do not buy speed with weakness", () => {
    const bad: string[] = [];
    for (const { id, body } of ALL) {
      for (const s of strikes(body())) if (s.cost === 0 && s.time < 100) bad.push(`${id} ${s.kind} m${s.mass}: t${s.time}`);
    }
    expect(bad.slice(0, 10).join("\n")).toBe("");
  });

  it("S-fight-03: a gland empties, it does not swing - a light organ keeps its whole blow", () => {
    const bad: string[] = [];
    for (const { id, body } of ALL) for (const s of strikes(body())) if (s.cost > 0 && s.force < 0) bad.push(`${id} ${s.kind} f${s.force}`);
    expect(bad.slice(0, 10).join("\n")).toBe("");
  });
});
