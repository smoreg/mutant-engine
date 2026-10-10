/**
 * The generator's batch: the basis it grows from and the catalog it tunes for
 * itself. Both live in the #hash beside the batch's numbers, both are
 * temporary - nothing here reaches `overrides.ts` - and both keep the batch
 * deterministic by seed.
 */
import { describe, expect, it } from "vitest";
import { bodyHash, human, CATALOG, mutationById, BEASTS, RULE_IDS, currentTuning, emptyTuning, normalizeTuning, startBody, withTuning, initialState, run } from "@mutant-engine/core";
import { DEFAULT_GEN, batchStates, growCreature, hasRange, meanMutations, mutationsAt, sameBatch, startOf, tuningOf, type GenParams, type GenTuning } from "../batch.js";
import { decode, encode, type View } from "../hash.js";
import { TRAITS, sampleState, traitsOf, traitsSummary } from "../stats.js";

function params(over: Partial<GenParams> = {}): GenParams {
  return { ...DEFAULT_GEN, count: 8, mutations: 10, source: "abyss", first: 1, ...over };
}

function tuning(over: Partial<GenTuning> = {}): GenTuning {
  return normalizeTuning({ ...emptyTuning(), ...over });
}

/** Every row the batch drew, in order: the events of a light run carry them. */
function drawn(p: GenParams): string[] {
  return withTuning(tuningOf(p), () =>
    batchStates(p).flatMap((s) =>
      run(s, { light: true })
        .events.filter((e) => e.kind === "mutate")
        .map((e) => (e.kind === "mutate" && e.mutation !== null ? e.mutation.id : ""))
        .filter((id) => id !== ""),
    ),
  );
}

function hashes(p: GenParams): string[] {
  return batchStates(p).map((s) => bodyHash(growCreature(p, s)));
}

describe("the batch's basis", () => {
  it("round-trips through the hash: a human writes nothing, a beast, the swamp and a fixture come back whole", () => {
    const starts: GenParams["start"][] = [undefined, { kind: "swamp" }, { kind: "beast", id: "centaur" }, { kind: "beast", id: "hydra" }, { kind: "text", text: "торс 3x2\n" }];
    for (const start of starts) {
      const p = start === undefined ? params() : params({ start });
      const view: View = { tab: "gen", gen: p, look: "graph" };
      const back = decode(`#${encode(initialState(), view)}`);
      expect(back.view.gen).toEqual(p);
    }
  });

  it("a batch from a beast starts from that beast's graph", () => {
    for (const beast of BEASTS.slice(0, 5)) {
      const p = params({ start: { kind: "beast", id: beast.id }, count: 2, mutations: 3 });
      const states = batchStates(p);
      expect(states[0]!.start).toEqual({ kind: "beast", id: beast.id });
      const first = run(states[0]!).steps[0]!;
      expect(bodyHash(first.body)).toBe(bodyHash(startBody({ kind: "beast", id: beast.id })));
      // The card opens in the lab on the same basis: the state is the whole link.
      expect(decode(`#${encode(states[0]!)}`).state).toEqual(states[0]!);
    }
  });

  it("the swamp mutant and a human give different batches from the same seeds", () => {
    const human = hashes(params({ count: 4, mutations: 6 }));
    const swamp = hashes(params({ count: 4, mutations: 6, start: { kind: "swamp" } }));
    expect(human).not.toEqual(swamp);
    expect(startOf(params()).kind).toBe("human");
  });
});

/** The mutations one state of the batch actually carries. */
function mutationsOf(state: { commands: { t: string; n?: number }[] }): number {
  let n = 0;
  for (const c of state.commands) {
    if (c.t === "mutate") n += c.n ?? 0;
    else if (c.t === "place") n += 1;
  }
  return n;
}

describe("the number of mutations as a range", () => {
  it("round-trips through the hash, and a high end below the low one is dropped", () => {
    const p = params({ count: 6, mutations: 5, mutationsTo: 40 });
    const back = decode(`#${encode(initialState(), { tab: "gen", gen: p })}`);
    expect(back.view.gen).toEqual(p);
    // A link without the group is the batch as it was before the range: everyone by the same count.
    expect(decode(`#${encode(initialState(), { tab: "gen", gen: params() })}`).view.gen?.mutationsTo).toBeUndefined();
    expect(decode(`#s=1&b=h&sp=1&tab=gen&g=6.20.abyss.1.1~n5`).view.gen?.mutationsTo).toBeUndefined();
    expect(decode(`#s=1&b=h&sp=1&tab=gen&g=6.20.abyss.1.1~n40`).view.gen?.mutationsTo).toBe(40);
  });

  it("every creature rolls its own count inside the range, and the same batch rolls the same counts", () => {
    const p = params({ count: 40, mutations: 4, mutationsTo: 24, source: "abyss" });
    expect(hasRange(p)).toBe(true);
    const counts = batchStates(p).map(mutationsOf);
    expect(counts).toEqual(batchStates(p).map(mutationsOf));
    expect(new Set(counts).size).toBeGreaterThan(3);
    for (const n of counts) {
      expect(n).toBeGreaterThanOrEqual(4);
      expect(n).toBeLessThanOrEqual(24);
    }
    expect(Math.round(meanMutations(p) * 1000) / 1000).toBe(Math.round((counts.reduce((a, b) => a + b, 0) / counts.length) * 1000) / 1000);
    // A creature's count follows its seed, not its place in the batch.
    const shifted = batchStates({ ...p, first: p.first + 1 }).map(mutationsOf);
    expect(shifted.slice(0, counts.length - 1)).toEqual(counts.slice(1));
  });

  it("without a range every creature takes the batch's number, as before", () => {
    const p = params({ count: 8, mutations: 7 });
    expect(hasRange(p)).toBe(false);
    expect(batchStates(p).map(mutationsOf)).toEqual(new Array(8).fill(7));
    expect(mutationsAt(p, 123)).toBe(7);
    expect(meanMutations(p)).toBe(7);
    // The same low end with a range still holds the low end as the floor.
    expect(mutationsAt(params({ mutations: 7, mutationsTo: 7 }), 123)).toBe(7);
  });

  it("the order and the filter of the grid are a view, not a batch: the same creatures either way", () => {
    const p = params({ count: 4 });
    expect(sameBatch(p, { ...p, sort: "strong", min: 3 })).toBe(true);
    expect(sameBatch(p, { ...p, mutationsTo: 30 })).toBe(false);
    expect(sameBatch(p, { ...p, line: "floor1" })).toBe(false);
    expect(batchStates({ ...p, sort: "weak", min: 2 })).toEqual(batchStates(p));
  });
});

describe("the traits of a batch", () => {
  it("counts the human's own parts, so a trait is what the picture shows and not a catalog row", () => {
    const t = traitsOf(human());
    expect(t.eye).toBe(2);
    expect(t.ear).toBe(2);
    expect(t.mouth).toBe(1);
    expect(t.head).toBe(1);
    expect(t.hand).toBe(2);
    expect(t.heart).toBe(1);
    expect(t.tail).toBe(0);
    expect(t.wing).toBe(0);
    expect(t.pincer).toBe(0);
  });

  it("the summary says what the batch carries and what it never seats", () => {
    const p = params({ count: 12, mutations: 12, source: "floor" });
    const samples = batchStates(p).map((s) => sampleState(s));
    const t = traitsSummary(samples, CATALOG.length);
    expect(t.rows.map((r) => r.id)).toEqual(TRAITS.map((r) => r.id));
    for (const r of t.rows) {
      expect(r.bodies).toBeGreaterThanOrEqual(0);
      expect(r.bodies).toBeLessThanOrEqual(1);
      expect(r.mean).toBeGreaterThanOrEqual(0);
    }
    // Every body keeps an eye, an ear, a mouth and a heart on the first layer.
    for (const id of ["eye", "ear", "mouth", "heart"]) expect(t.rows.find((r) => r.id === id)!.bodies, id).toBeGreaterThan(0.8);
    expect(t.drawn + t.unseen).toBe(CATALOG.length);
    // A row in `never` is one the batch drew and never once seated.
    for (const x of t.never) {
      expect(x.drawn).toBeGreaterThan(0);
      expect(samples.reduce((a, s) => a + (s.seated[x.id] ?? 0), 0)).toBe(0);
      expect(samples.reduce((a, s) => a + (s.drew[x.id] ?? 0), 0)).toBe(x.drawn);
    }
  }, 60_000);
});

describe("the catalog of one batch", () => {
  it("round-trips through the hash: rows off, chances raised, rules off", () => {
    const t = tuning({ off: ["extraArm", "tentacle"], chance: { hoof: 4, extraLeg: 0.25 }, rules: [...RULE_IDS] });
    const p = params({ tuning: t, start: { kind: "beast", id: "spider" } });
    const back = decode(`#${encode(initialState(), { tab: "gen", gen: p })}`);
    expect(back.view.gen).toEqual(p);
    expect(back.view.gen?.tuning).toEqual(t);
    // A link with no tuning has no tuning: the empty one is never written.
    const plain = decode(`#${encode(initialState(), { tab: "gen", gen: params({ tuning: emptyTuning() }) })}`);
    expect(plain.view.gen).toEqual(params());
  });

  it("a hash with an unknown row or an unknown rule drops it and keeps the rest", () => {
    const hash = `s=1&b=h&sp=1&tab=gen&g=8.10.abyss.1.1~onoSuchRow,extraArm~cnoSuchRow:4~rneeds,noSuchRule`;
    const g = decode(hash).view.gen;
    expect(g?.tuning).toEqual({ off: ["extraArm"], chance: {}, rules: ["needs"] });
  });

  it("a row switched off for the batch never falls out of any source", () => {
    const wide = params({ count: 20, mutations: 20, source: "floor" });
    const before = drawn(wide);
    const id = before.find((x) => x !== undefined)!;
    expect(before).toContain(id);
    const after = drawn({ ...wide, tuning: tuning({ off: [id] }) });
    expect(after).not.toContain(id);
    expect(after.length).toBeGreaterThan(0);
    // The catalog on disk is untouched: the row is still there for everyone else.
    expect(mutationById(id)).toBeDefined();
    expect(currentTuning().rows).toEqual({});
  });

  it("a row whose chance is raised falls out far more often", () => {
    const id = "extraArm";
    expect(mutationById(id)).toBeDefined();
    const wide = params({ count: 24, mutations: 20 });
    const plain = drawn(wide).filter((x) => x === id).length;
    const loud = drawn({ ...wide, tuning: tuning({ chance: { [id]: 10 } }) }).filter((x) => x === id).length;
    expect(loud).toBeGreaterThan(plain);
    expect(loud).toBeGreaterThanOrEqual(2 * Math.max(1, plain));
  }, 60_000);

  it("the tuning is the batch's alone: it is off again afterwards and the same seeds repeat", () => {
    const p = params({ count: 4, mutations: 8, tuning: tuning({ off: ["extraArm"], rules: ["needs", "ceiling"] }) });
    const once = hashes(p);
    const twice = hashes(p);
    expect(once).toEqual(twice);
    expect(currentTuning()).toEqual({ rows: {}, off: [] });
    expect(once).not.toEqual(hashes(params({ count: 4, mutations: 8 })));
  });

  it("every rule switched off changes the batch, and the catalog keeps its numbers", () => {
    // Twenty mutations, not twelve: the human starts at 101 of a ceiling of 160, and a short batch
    // never reaches it - switching the ceiling off then changed nothing and the test passed on luck.
    const base = params({ count: 4, mutations: 20 });
    const plain = hashes(base);
    for (const rule of RULE_IDS) {
      const off = hashes({ ...base, tuning: tuning({ rules: [rule] }) });
      expect(off).toHaveLength(plain.length);
      expect(off).not.toEqual(plain);
    }
    for (const m of CATALOG) expect(m.chance).toBeGreaterThan(0);
  }, 60_000);

  it("the edits land as the mutation editor's own: a row off is disabled, a factor is a chance", () => {
    const t = tuning({ off: ["tentacle"], chance: { extraArm: 2 } });
    const layer = tuningOf(params({ tuning: t }));
    expect(layer.rows.tentacle).toEqual({ disabled: true });
    expect(layer.rows.extraArm?.chance).toBe(mutationById("extraArm")!.chance * 2);
  });
});
