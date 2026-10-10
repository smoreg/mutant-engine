import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FAMILIES, bodyHash, validate, type Body, SOURCES, run } from "@mutant-engine/core";
import { decode, encode } from "../../hash.js";
import { DEFAULT_SEED, DEFAULT_SIZE, FLOOR_SOURCES, SET_SIZES, SOURCE_RU, defaultState, describeStep, mutateCommand, randomSet, randomSource, stateOf } from "../../mutator/model.js";

const MUTATOR = join(import.meta.dirname, "..", "..", "..", "..", "apps", "lab", "mutator");
const FLOOR = new Set(FLOOR_SOURCES.map((s) => s.id));

describe("random set", () => {
  it("gives exactly N commands of one atom each, every one from a source of the first floor", () => {
    for (const n of SET_SIZES) {
      for (let seed = 1; seed <= 20; seed++) {
        const set = randomSet(seed, n);
        expect(set).toHaveLength(n);
        for (const c of set) {
          expect(c.t).toBe("mutate");
          expect(c.n).toBe(1);
          expect(FLOOR.has(c.source)).toBe(true);
          if (c.source === "vaccine") expect(FAMILIES).toContain(c.family);
          else expect(c.family).toBeUndefined();
        }
        expect(run(stateOf(seed, set)).steps).toHaveLength(n + 1);
      }
    }
  });

  it("is deterministic and differs between seeds", () => {
    expect(randomSet(5, 20)).toEqual(randomSet(5, 20));
    const a = randomSet(5, 40).map((c) => `${c.source}.${c.family ?? ""}`).join(";");
    const b = randomSet(6, 40).map((c) => `${c.source}.${c.family ?? ""}`).join(";");
    expect(a).not.toBe(b);
  });

  it("draws every source of the floor over 200 seeds, the abyss most of all", () => {
    const counts = new Map<string, number>();
    for (let seed = 1; seed <= 200; seed++) for (const c of randomSet(seed, 10)) counts.set(c.source, (counts.get(c.source) ?? 0) + 1);
    for (const s of FLOOR_SOURCES) expect(counts.get(s.id) ?? 0, s.id).toBeGreaterThan(0);
    const max = [...counts].sort((x, y) => y[1] - x[1])[0]!;
    expect(max[0]).toBe("abyss");
  });
});

describe("the mutate command", () => {
  it("names the source asked for, and a random source deterministically by seed and index", () => {
    for (const s of SOURCES) {
      if (s.id === "id") continue;
      const c = mutateCommand(s.id, "glands", 3, 0);
      expect(c.source).toBe(s.id);
      expect(c.n).toBe(1);
      if (s.id === "vaccine") expect(c.family).toBe("glands");
      else expect(c.family).toBeUndefined();
    }
    for (let i = 0; i < 50; i++) {
      const a = mutateCommand("random", undefined, 9, i);
      const b = mutateCommand("random", undefined, 9, i);
      expect(a).toEqual(b);
      expect(FLOOR.has(a.source)).toBe(true);
      expect(randomSource(9, i)).toBe(a.source);
      if (a.source === "vaccine") expect(FAMILIES).toContain(a.family);
    }
    const sources = new Set<string>();
    for (let i = 0; i < 200; i++) sources.add(randomSource(1, i));
    expect(sources.size).toBe(FLOOR_SOURCES.length);
  });

  it("a vaccine without a family gets one from the seed", () => {
    const c = mutateCommand("vaccine", undefined, 4, 2);
    expect(c.source).toBe("vaccine");
    expect(FAMILIES).toContain(c.family);
    expect(mutateCommand("vaccine", undefined, 4, 2)).toEqual(c);
  });

  it("every source has a Russian label", () => {
    expect(SOURCE_RU.random).toBeTruthy();
    for (const s of FLOOR_SOURCES) expect(SOURCE_RU[s.id]).toBeTruthy();
  });
});

describe("the same seed is the same creature", () => {
  it("a state replayed twice gives one body hash", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const state = stateOf(seed, randomSet(seed, 10));
      const a = run(state);
      const b = run(state);
      expect(bodyHash(a.body)).toBe(bodyHash(b.body));
      expect(validate(a.body)).toEqual([]);
    }
  });

  it("the page opens on a grown creature: the default state has the fixed seed and ten mutations", () => {
    const s = defaultState();
    expect(s.seed).toBe(DEFAULT_SEED);
    expect(s.start).toEqual({ kind: "human" });
    expect(s.spread).toBe(true);
    expect(s.commands).toHaveLength(DEFAULT_SIZE);
    expect(DEFAULT_SIZE).toBe(10);
    const r = run(s);
    expect(r.steps).toHaveLength(11);
  });

  it("undo is a replay without the last command", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const set = randomSet(seed, 8);
      const whole = run(stateOf(seed, set));
      const undone = run(stateOf(seed, set.slice(0, -1)));
      expect(undone.steps.map((s) => s.hash)).toEqual(whole.steps.slice(0, -1).map((s) => s.hash));
      expect(bodyHash(undone.body)).toBe(whole.steps[whole.steps.length - 2]!.hash);
    }
  });

  it("the link reproduces the creature: encode, decode, replay", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const state = stateOf(seed, randomSet(seed, 12));
      const hash = encode(state, { step: 5 });
      expect(hash).not.toMatch(/[#\s]/);
      const back = decode(`#${hash}`);
      expect(back.state).toEqual(state);
      expect(back.view.step).toBe(5);
      const a = run(state);
      const b = run(back.state);
      expect(bodyHash(b.body)).toBe(bodyHash(a.body));
    }
  });
});

describe("the card of a step", () => {
  it("names the mutation, its family, the operation and the place, and carries the moved numbers", () => {
    let landed = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const r = run(stateOf(seed, randomSet(seed, 10)));
      expect(describeStep(r.steps[0]!).outcome).toBe("start");
      for (const step of r.steps.slice(1)) {
        const card = describeStep(step);
        expect(card.index).toBe(step.index);
        expect(card.sourceRu).toBeTruthy();
        expect(card.moves).toEqual(step.derived);
        if (step.event.kind !== "mutate") continue;
        if (step.event.mutation === null) {
          expect(card.outcome).toBe("none");
          continue;
        }
        expect(card.name).toBeTruthy();
        expect(card.family).toBe(step.event.mutation.family);
        if (step.event.result === null) {
          expect(card.outcome).toBe("lost");
          continue;
        }
        expect(card.outcome).toBe(step.event.result.fallback ? "fallback" : "landed");
        expect(card.op).toBeTruthy();
        expect(card.where).toBeTruthy();
        landed += 1;
      }
    }
    expect(landed).toBeGreaterThan(100);
  });
});

describe("the mutator panel", () => {
  it("keeps the DOM out of the model", () => {
    for (const f of ["model.ts"]) {
      const text = readFileSync(join(MUTATOR, f), "utf8");
      for (const re of [/\bdocument\b/, /\bwindow\b/, /Math\.random/, /Date\.now/, /\bnavigator\b/, /\blocation\b/]) expect(text, `${f} matches ${re}`).not.toMatch(re);
    }
  });
});

/** Keeps the type import in use when a test above is skipped. */
export type { Body };
