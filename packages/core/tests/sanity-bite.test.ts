/**
 * Common sense of the bite (docs/tasks/sanity, finding S-fight-02,
 * strike.md §1.3): a bite holds - the next bite of the same mouth at the same
 * target is +1. Read over the bestiary, the foes, the human and 200 random
 * mutants, and in the fight itself.
 */
import { LabRng as Rng } from "../rng.js";
import { describe, expect, it } from "vitest";
import { BEASTS, FOES, STRIKE, armory, cloneBody, fixtureBody, foeBody, human, newBattle, planStrike, stepBattle, type Body } from "../index.js";
import { population } from "./gen.js";

const FIXTURES: { id: string; body: () => Body }[] = [
  { id: "human", body: () => human() },
  ...FOES.map((f) => ({ id: `foe:${f.id}`, body: () => foeBody(f) })),
  ...BEASTS.map((b) => ({ id: b.id, body: () => fixtureBody(b) })),
];
const MUTANTS = population(200);
const ALL: { id: string; body: () => Body }[] = [...FIXTURES, ...MUTANTS.map((b, i) => ({ id: `random:${i}`, body: () => cloneBody(b) }))];

describe("a bite holds", () => {
  it("S-fight-02: a bite that holds is planned one stronger, and nothing but a holding bite is (decision 1315)", () => {
    const bad: string[] = [];
    for (const { id, body } of ALL) {
      const b = body();
      const all = armory(b);
      const base = new Map(all.map((s) => [s.key, s.force]));
      const holding = new Set(all.map((s) => s.key));
      for (const p of planStrike(b, human(), 1, { holding }).planned) {
        const want = base.get(p.strike.key)! + (p.strike.type === "bite" && p.strike.holds ? STRIKE.biteHold : 0);
        if (p.strike.force !== want) bad.push(`${id} ${p.strike.key} ${p.strike.type}: ${p.strike.force} want ${want}`);
      }
    }
    expect(bad.slice(0, 10).join("\n")).toBe("");
  });

  it("S-fight-02: in the fight a bite that landed holds its target, a bite that missed lets go", () => {
    const bad: string[] = [];
    let held = 0;
    for (const { id, body } of FIXTURES) {
      const b = newBattle({ fighters: [{ id: "a", side: "A", body: body() }, { id: "b", side: "B", body: human() }], options: { toDeath: true, maxTurns: 20 } });
      const rng = new Rng(3);
      while (b.result === null) {
        for (const e of stepBattle(b, rng)) {
          if (e.k !== "act") continue;
          const f = b.fighters.find((x) => x.id === e.who)!;
          for (const x of e.blows) {
            const s = armory(f.body).find((y) => y.key === x.key);
            if (s?.type !== "bite") continue;
            // A mouth no heavier than a man's does not hold at all (decision 1315).
            if (!s.holds) {
              if (f.bites[x.key] !== undefined) bad.push(`${id} ${e.who} ${x.key}: a light mouth holds`);
              continue;
            }
            const now = f.bites[x.key];
            if (x.hit && b.fighters.find((t) => t.id === e.target)!.out === null) {
              held += 1;
              if (now !== e.target) bad.push(`${id} ${e.who} ${x.key}: landed on ${e.target}, holds ${now}`);
            }
            if (!x.hit && now !== undefined) bad.push(`${id} ${e.who} ${x.key}: missed and still holds ${now}`);
          }
        }
      }
    }
    expect(held).toBeGreaterThan(0);
    expect(bad.slice(0, 10).join("\n")).toBe("");
  });
});
