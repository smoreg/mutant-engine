/**
 * Common sense of the grip against a body that pulls (docs/tasks/sanity, finding
 * R4-fight-01, strike.md §1.7): a held body tears loose with its heaviest limb
 * against the mass of every grip that holds it, so one claw does not hold a
 * bear for good. Read over the bestiary, the foes, the human and 200 random
 * mutants.
 */
import { LabRng as Rng } from "../rng.js";
import { describe, expect, it } from "vitest";
import { BEASTS, FOES, armory, cloneBody, escapeChance, fixtureBody, foeBody, grabs, human, pullOf, runBattle, volley, type Body } from "../index.js";
import { population } from "./gen.js";

const FIXTURES: { id: string; body: () => Body }[] = [
  { id: "human", body: () => human() },
  ...FOES.map((f) => ({ id: `foe:${f.id}`, body: () => foeBody(f) })),
  ...BEASTS.map((b) => ({ id: b.id, body: () => fixtureBody(b) })),
];
const MUTANTS = population(200);
const ALL: { id: string; body: () => Body }[] = [...FIXTURES, ...MUTANTS.map((b, i) => ({ id: `random:${i}`, body: () => cloneBody(b) }))];

describe("a held body tears loose", () => {
  it("R4-fight-01: the pull is the heaviest blow a body swings, and nothing past it", () => {
    const bad: string[] = [];
    for (const { id, body } of ALL) {
      const b = body();
      const swung = armory(b).filter((s) => s.cost === 0);
      const want = swung.reduce((m, s) => Math.max(m, s.mass), 0);
      if (pullOf(b) !== want) bad.push(`${id}: pull ${pullOf(b)} vs heaviest blow ${want}`);
    }
    expect(bad.slice(0, 10).join("\n")).toBe("");
  });

  it("R4-fight-01: the chance to tear loose grows with the pull and falls with the grip, and a body that does not pull never does", () => {
    for (const hold of [1, 7, 32, 100]) {
      expect(escapeChance(0, hold)).toBe(0);
      let last = 0;
      for (const pull of [1, 4, 8, 32, 64, 300]) {
        const p = escapeChance(pull, hold);
        expect(p).toBeGreaterThan(last);
        expect(p).toBeLessThan(1);
        last = p;
      }
      // Stronger than the grip: it is out more often than it is held.
      expect(escapeChance(hold * 2, hold)).toBeGreaterThan(0.5);
      expect(escapeChance(hold, hold * 2)).toBeLessThan(0.5);
    }
  });

  it("R4-fight-01: a grab is worth less the harder its target pulls, and never less than the one squeeze it lands with", () => {
    const bad: string[] = [];
    for (const { id, body } of ALL) {
      const b = body();
      for (const g of grabs(b)) {
        const at = (pull: number): number => volley([g], { armor: 0, pull }).expected;
        const one = at(1e9);
        const values = [0, g.mass / 2, g.mass, g.mass * 4].map(at);
        for (let i = 1; i < values.length; i++) if (values[i]! > values[i - 1]! + 1e-9) bad.push(`${id} ${g.key}: worth ${values.map((v) => v.toFixed(2)).join(" ")}`);
        if (values[values.length - 1]! + 1e-9 < one) bad.push(`${id} ${g.key}: worth below one squeeze`);
      }
    }
    expect(bad.slice(0, 10).join("\n")).toBe("");
  });

  it("R4-fight-01: a body that pulls harder than any one grip tears loose in the fight - nobody is held for good", () => {
    const bad: string[] = [];
    let checked = 0;
    const bear = fixtureBody(BEASTS.find((x) => x.id === "bear")!);
    for (const { id, body } of FIXTURES) {
      const b = body();
      const g = grabs(b);
      if (g.length === 0) continue;
      const hold = g.reduce((m, x) => Math.max(m, x.mass), 0);
      if (pullOf(bear) <= hold) continue;
      let escapes = 0;
      let squeezed = 0;
      for (let seed = 1; seed <= 6; seed++) {
        const log = runBattle({ fighters: [{ id: "a", side: "A", body: cloneBody(b) }, { id: "b", side: "B", body: cloneBody(bear) }], options: { toDeath: true, maxTurns: 40 } }, new Rng(seed)).log;
        escapes += log.filter((e) => e.k === "release" && e.torn === "b").length;
        squeezed += log.filter((e) => e.k === "squeeze" && e.who === "a").length;
      }
      // Only a grip that held the bear through a body turn had the chance to be torn loose.
      if (squeezed + escapes < 3) continue;
      checked += 1;
      if (escapes === 0) bad.push(`${id}: holds ${hold.toFixed(0)} against a pull of ${pullOf(bear).toFixed(0)} and is never torn loose`);
    }
    expect(checked).toBeGreaterThan(0);
    expect(bad.slice(0, 10).join("\n")).toBe("");
  });
});
