/**
 * Common sense of the grip in a fight (docs/tasks/sanity, finding S-fight-01,
 * strike.md §1.7): a tip that grips fights by holding - the grab is in the
 * volley, a grab that lands holds the target, and every body turn a held grip
 * squeezes without a roll and sits out of the volley. Read over the bestiary,
 * the foes, the human and 200 random mutants.
 */
import { LabRng as Rng } from "../rng.js";
import { describe, expect, it } from "vitest";
import { BEASTS, FOES, armory, cloneBody, fixtureBody, foeBody, grabs, human, runBattle, strikes, type BattleEvent, type Body } from "../index.js";
import { population } from "./gen.js";

const FIXTURES: { id: string; body: () => Body }[] = [
  { id: "human", body: () => human() },
  ...FOES.map((f) => ({ id: `foe:${f.id}`, body: () => foeBody(f) })),
  ...BEASTS.map((b) => ({ id: b.id, body: () => fixtureBody(b) })),
];
const MUTANTS = population(200);
const ALL: { id: string; body: () => Body }[] = [...FIXTURES, ...MUTANTS.map((b, i) => ({ id: `random:${i}`, body: () => cloneBody(b) }))];

function fight(a: Body, b: Body, seed: number): BattleEvent[] {
  return runBattle({ fighters: [{ id: "a", side: "A", body: a }, { id: "b", side: "B", body: b }], options: { toDeath: true, maxTurns: 40 } }, new Rng(seed)).log;
}

describe("a tip that grips fights by holding", () => {
  it("S-fight-01: every grab of a body is in what it fights with, and a gripping tip does not also club as a bare stump", () => {
    const bad: string[] = [];
    for (const { id, body } of ALL) {
      const b = body();
      const list = armory(b);
      const keys = new Set(list.map((s) => s.key));
      for (const g of grabs(b)) {
        if (!keys.has(g.key)) bad.push(`${id}: grab ${g.key} is not in the armory`);
        if (list.some((s) => s.kind === "stump" && s.node === g.node)) bad.push(`${id}: node ${g.node} grips and clubs`);
      }
      // A grab never shares its key with a blow: the volley tells them apart.
      if (keys.size !== list.length) bad.push(`${id}: duplicate keys`);
      for (const s of strikes(b)) if (s.kind !== "stump" || !grabs(b).some((g) => g.node === s.node)) if (!keys.has(s.key)) bad.push(`${id}: blow ${s.key} lost`);
    }
    expect(bad.slice(0, 10).join("\n")).toBe("");
  });

  it("S-fight-01: a body that plans a grab at a man holds him and squeezes him in the fight", () => {
    const bad: string[] = [];
    let checked = 0;
    for (const { id, body } of ALL) {
      const b = body();
      if (grabs(b).length === 0) continue;
      // A grab that landed on a man still in the fight squeezes him at the next body turn.
      let due = false;
      let squeezes = 0;
      for (let seed = 1; seed <= 3; seed++) {
        let grabbed = false;
        for (const e of fight(b, human(), seed)) {
          if (e.k === "act" && e.who === "a" && e.blows.some((x) => x.grab && x.hit)) grabbed = true;
          if (e.k === "turn" && grabbed) due = true;
          if (e.k === "out" && e.who === "b") grabbed = false;
          if (e.k === "squeeze" && e.who === "a") squeezes += 1;
        }
      }
      if (!due) continue;
      checked += 1;
      if (squeezes === 0) bad.push(`${id}: held a man through a turn and never squeezed`);
    }
    expect(checked).toBeGreaterThan(0);
    expect(bad.slice(0, 10).join("\n")).toBe("");
  });

  it("S-fight-01: a grip that holds sits out of the volley until it lets go", () => {
    const bad: string[] = [];
    for (const { id, body } of ALL) {
      const b = body();
      if (grabs(b).length === 0) continue;
      for (let seed = 1; seed <= 2; seed++) {
        const held = new Set<string>();
        for (const e of fight(b, human(), seed)) {
          if (e.k === "squeeze" && e.who === "a") for (const k of e.keys) held.add(k);
          if (e.k === "release" && e.who === "a") for (const k of e.keys) held.delete(k);
          if (e.k === "act" && e.who === "a") for (const x of e.blows) if (held.has(x.key)) bad.push(`${id} seed ${seed}: ${x.key} struck while holding`);
        }
      }
    }
    expect(bad.slice(0, 10).join("\n")).toBe("");
  });

  it("S-fight-01: the octopus holds with its eight arms - it squeezes in half the fights with a man, who tears loose (decision 1313)", () => {
    const octopus = fixtureBody(BEASTS.find((x) => x.id === "octopus")!);
    let fights = 0;
    for (let seed = 1; seed <= 10; seed++) if (fight(octopus, human(), seed).some((e) => e.k === "squeeze" && e.who === "a" && e.damage > 0)) fights += 1;
    expect(fights).toBeGreaterThanOrEqual(5);
  });
});
