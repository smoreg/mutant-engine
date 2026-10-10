/**
 * The studio (#3): four big tabs over one page - the generator, the lab, the
 * bestiary, the sprite editor - and a local SQLite store of the creatures
 * the generator makes. Tests first: the hash of the tabs and its old links,
 * the batch as data, the store on a temporary base, the living shelf.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bodyHash, bodyToText, type Body, startBody, run, type LabState } from "@mutant-engine/core";
import { DEFAULT_GEN, batchStates, genState, stateKey, summarizeCreature, type GenParams } from "../batch.js";
import { decode, encode } from "../hash.js";
import { sampleSeed, sampleState } from "../stats.js";
import { livingShelf, textStart } from "../zoo.js";
import { growMutant, livingSpecs } from "../living/grow.js";
import { randomSet, stateOf } from "../mutator/model.js";
import { apiRoute, Store, type CreatureRecord } from "../studio/db.js";

const ROOT = join(import.meta.dirname, "..", "..", "..", "apps", "lab");

function bodyOf(state: LabState): Body {
  return run(state, { light: true }).body;
}

function records(p: GenParams): CreatureRecord[] {
  return batchStates(p).map((s) => summarizeCreature(s, bodyOf(s)));
}

function tempStore(): { store: Store; done: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "studio-"));
  const store = new Store(join(dir, "studio.sqlite"));
  return {
    store,
    done: () => {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

describe("the tabs in the hash", () => {
  it("the lab is the default and is not written; the other tabs round-trip", () => {
    const s: LabState = { seed: 4, start: { kind: "human" }, commands: [], spread: true };
    expect(encode(s, { tab: "lab" })).toBe(encode(s, {}));
    for (const tab of ["gen", "zoo", "parts"] as const) expect(decode(`#${encode(s, { tab })}`).view).toEqual({ tab });
  });

  it("old links open in the new tabs: the statistics in the generator, the bestiary panel in the bestiary, the rest in the lab", () => {
    expect(decode("#s=1&b=h&sp=1&tab=stats&x=40.12.abyss").view).toEqual({ tab: "gen", gen: { count: 40, mutations: 12, source: "abyss", spread: true, first: 1 } });
    expect(decode("#s=1&b=h&sp=1&tab=stats&x=10.5.vaccine.limbs").view.gen).toEqual({ count: 10, mutations: 5, source: "vaccine", family: "limbs", spread: true, first: 1 });
    expect(decode("#s=1&b=h&sp=1&tab=body").view).toEqual({});
    expect(decode("#s=1&b=h&sp=1&pn=beasts&bst=centaur").view).toEqual({ tab: "zoo", shelf: "myth", beast: "centaur" });
    for (const pn of ["lab", "mutator", "place"]) expect(decode(`#s=1&b=h&sp=1&pn=${pn}`).view).toEqual({});
  });

  it("drops what it cannot read: an unknown tab, a broken batch, an unknown shelf or look", () => {
    const v = decode("#s=1&b=h&sp=1&tab=nope&g=0.5.abyss.1.1&shelf=attic&look=oil").view;
    expect(v).toEqual({});
  });
});

describe("a batch of the generator", () => {
  it("is data: the same parameters give the same states, one seed each from the first", () => {
    const p: GenParams = { ...DEFAULT_GEN, count: 12, mutations: 6, first: 40 };
    const a = batchStates(p);
    expect(a).toEqual(batchStates(p));
    expect(a.map((s) => s.seed)).toEqual(Array.from({ length: 12 }, (_, i) => 40 + i));
    expect(new Set(a.map(stateKey)).size).toBe(12);
  });

  it("the floor mixes the sources the way the mutator's random set did; one source is one mutate command", () => {
    const floor = genState({ ...DEFAULT_GEN, source: "floor", mutations: 7 }, 9);
    expect(floor).toEqual({ ...stateOf(9, randomSet(9, 7)), spread: true });
    const vaccine = genState({ ...DEFAULT_GEN, source: "vaccine", family: "jaws", mutations: 5, spread: false }, 3);
    expect(vaccine).toEqual({ seed: 3, start: { kind: "human" }, commands: [{ t: "mutate", source: "vaccine", n: 5, family: "jaws" }], spread: false });
  });

  it("a card is the body the lab opens: its state goes through the hash and replays to the same body hash", () => {
    for (const source of ["floor", "abyss", "meat"] as const) {
      for (const r of records({ ...DEFAULT_GEN, source, count: 6, mutations: 8, first: 100 })) {
        const back = decode(r.key).state;
        expect(stateKey(back)).toBe(r.key);
        expect(bodyHash(run(back).body)).toBe(r.bodyHash);
        expect(r.name.length).toBeGreaterThan(0);
        expect(r.nodes).toBeGreaterThan(0);
      }
    }
  });

  it("the summary of a batch reads any state: a sample of a state is the sample of its seed", () => {
    const p = { seeds: 5, mutations: 10, source: "abyss" as const };
    for (let seed = 1; seed <= 5; seed++) {
      const s = genState({ ...DEFAULT_GEN, source: "abyss", mutations: 10 }, seed);
      expect(sampleState(s)).toEqual(sampleSeed(p, true, seed));
    }
  });
});

describe("the store", () => {
  it("keeps a batch and lists it back with its creatures, newest batch first", () => {
    const { store, done } = tempStore();
    try {
      const a = store.saveBatch({ label: "первая", params: DEFAULT_GEN }, records({ ...DEFAULT_GEN, count: 4, first: 1 }), "2026-09-18T10:00:00.000Z");
      const b = store.saveBatch({ label: "вторая", params: DEFAULT_GEN }, records({ ...DEFAULT_GEN, count: 3, first: 50 }), "2026-09-18T11:00:00.000Z");
      const list = store.list();
      expect(list.batches.map((x) => x.id)).toEqual([b, a]);
      expect(list.batches.map((x) => x.count)).toEqual([3, 4]);
      expect(list.creatures.filter((c) => c.batch === a)).toHaveLength(4);
      expect(list.creatures.filter((c) => c.batch === b).map((c) => c.seed)).toEqual([50, 51, 52]);
      expect(list.batches[0]!.params).toEqual(DEFAULT_GEN);
    } finally {
      done();
    }
  });

  it("the same creature saved again is one row: it moves to the newer batch and keeps its star", () => {
    const { store, done } = tempStore();
    try {
      const recs = records({ ...DEFAULT_GEN, count: 3, first: 7 });
      store.saveBatch({ label: "a", params: DEFAULT_GEN }, recs, "2026-09-18T10:00:00.000Z");
      const first = store.list().creatures.find((c) => c.seed === 8)!;
      store.setStar(first.id!, true);
      const b = store.saveBatch({ label: "b", params: DEFAULT_GEN }, recs, "2026-09-18T12:00:00.000Z");
      const list = store.list();
      expect(list.creatures).toHaveLength(3);
      const again = list.creatures.find((c) => c.seed === 8)!;
      expect(again.id).toBe(first.id);
      expect(again.star).toBe(true);
      expect(again.batch).toBe(b);
      expect(list.batches.map((x) => x.id)).toEqual([b]);
    } finally {
      done();
    }
  });

  it("a creature saved from the lab has no batch; a star and a removal work by id", () => {
    const { store, done } = tempStore();
    try {
      const s: LabState = { seed: 5, start: { kind: "swamp" }, commands: [{ t: "mutate", source: "abyss", n: 4 }], spread: true };
      const id = store.saveOne(summarizeCreature(s, bodyOf(s)), "2026-09-18T10:00:00.000Z");
      let c = store.list().creatures[0]!;
      expect(c.id).toBe(id);
      expect(c.batch).toBeNull();
      expect(c.star).toBe(false);
      store.setStar(id, true);
      expect(store.list().creatures[0]!.star).toBe(true);
      store.remove(id);
      expect(store.list().creatures).toHaveLength(0);
      c = summarizeCreature(s, bodyOf(s));
      expect(store.saveOne(c, "2026-09-18T11:00:00.000Z")).toBeGreaterThan(0);
    } finally {
      done();
    }
  });

  it("the api answers the page: list, a batch, one, a star, a removal, and 404 for the rest", () => {
    const { store, done } = tempStore();
    try {
      const now = "2026-09-18T10:00:00.000Z";
      const recs = records({ ...DEFAULT_GEN, count: 2, first: 3 });
      expect(apiRoute(store, "POST", "/batch", { label: "x", params: DEFAULT_GEN, creatures: recs }, now).status).toBe(200);
      const list = apiRoute(store, "GET", "/creatures", undefined, now);
      expect(list.status).toBe(200);
      const id = (list.json as ReturnType<Store["list"]>).creatures[0]!.id!;
      expect(apiRoute(store, "PATCH", `/creatures/${id}`, { star: true }, now).status).toBe(200);
      expect(apiRoute(store, "DELETE", `/creatures/${id}`, undefined, now).status).toBe(200);
      expect(apiRoute(store, "POST", "/creatures", recs[0], now).status).toBe(200);
      expect(apiRoute(store, "GET", "/health", undefined, now).status).toBe(200);
      expect(apiRoute(store, "GET", "/nope", undefined, now).status).toBe(404);
      expect(apiRoute(store, "POST", "/batch", { label: "x" }, now).status).toBe(400);
      expect((apiRoute(store, "GET", "/creatures", undefined, now).json as ReturnType<Store["list"]>).creatures).toHaveLength(2);
    } finally {
      done();
    }
  });
});

describe("the bestiary", () => {
  it("the living shelf grows the same hundred bodies as the living gallery", () => {
    const shelf = livingShelf();
    const specs = livingSpecs();
    expect(shelf).toHaveLength(specs.length);
    for (let i = 0; i < specs.length; i += 7) expect(bodyHash(shelf[i]!.body())).toBe(bodyHash(growMutant(specs[i]!).body));
  });

  it("any body opens in the lab as a fixture start of the same shape (the hash also counts the version, which a fixture resets)", () => {
    for (const spec of livingSpecs().slice(0, 12)) {
      const body = growMutant(spec).body;
      const start = textStart(body);
      expect(start).toEqual({ kind: "text", text: bodyToText(body) });
      expect(bodyToText(startBody(start))).toBe(bodyToText(body));
    }
  });
});

describe("the studio's files", () => {
  it("the page never imports node, the store never touches the DOM", () => {
    for (const f of ["main.ts", "gen.ts", "zoo-page.ts", "store.ts", "batch.ts", "zoo.ts"]) expect(readFileSync(join(ROOT, f), "utf8"), f).not.toMatch(/from "node:/);
    const db = readFileSync(join(ROOT, "studio/db.ts"), "utf8");
    for (const re of [/\bdocument\b/, /\bwindow\b/, /Math\.random/, /Date\.now/]) expect(db).not.toMatch(re);
  });
});
