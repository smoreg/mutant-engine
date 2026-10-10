import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COVERS,
  bodyHash,
  brains,
  controlCap,
  controlLoad,
  derive,
  human,
  mass,
  organs,
  skeletonCeiling,
  summarize,
  validate,
  type CoverId,
  LabRng,
  COVER_SHARE,
  features,
  fixtureBody,
  similarity,
  traitsOf,
  BEASTS,
  beastById,
} from "@mutant-engine/core";
import { layout, silhouetteSvg, RAMPS, TILES, COVER_COLORS } from "@mutant-engine/view";
import { grow } from "../../stats.js";
import { ADDITIONS, NEEDS, additionById, opens } from "../../beasts/additions.js";
import { beastsData, buildBeasts, type BeastsData } from "../../beasts/build.js";
import { abyssStrike, randomAssembly } from "../../beasts/measure.js";

const SMALL = { seeds: 24, strikes: 20 };

let cached: BeastsData | null = null;
function data(): BeastsData {
  cached ??= beastsData(SMALL);
  return cached;
}

describe("the bestiary check", () => {
  it("has thirty-one beasts with distinct ids, each a shape of its own, every need in the additions", () => {
    expect(BEASTS).toHaveLength(31);
    expect(new Set(BEASTS.map((b) => b.id)).size).toBe(31);
    for (const b of BEASTS) {
      expect(b.fixture.trim().length, b.id).toBeGreaterThan(0);
      expect(traitsOf(b.want).length, `${b.id} differs from the human`).toBeGreaterThan(0);
      for (const need of NEEDS[b.id] ?? []) expect(additionById(need)).toBeDefined();
    }
    const order = BEASTS.map((b) => b.id);
    for (const a of ADDITIONS) expect(opens(a.id, order).length, `${a.id} opens a beast`).toBeGreaterThan(0);
    expect(ADDITIONS.filter((a) => a.kind === "op")).toHaveLength(3);
    expect(ADDITIONS.reduce((n, a) => n + a.rows, 0)).toBeLessThanOrEqual(25);
  });

  it("every fixture is a valid body that lays out, draws, derives and is its own beast", () => {
    for (const b of BEASTS) {
      const body = fixtureBody(b);
      expect(validate(body), b.id).toEqual([]);
      const l = layout(body);
      expect(Object.keys(l.nodes).length).toBe(Object.keys(body.nodes).length);
      const svg = silhouetteSvg(body);
      expect(svg.startsWith("<svg"), b.id).toBe(true);
      const s = summarize(derive(body));
      expect(typeof s.speed).toBe("number");
      const sim = similarity(b.want, features(body));
      expect(sim.off, `${b.id}: fixture matches its own shape`).toEqual([]);
      expect(sim.strict).toBe(true);
    }
  });

  /**
   * Room a beast must have left under its own ceiling: the flesh of one heavy
   * row. A body that starts at its ceiling is taken apart by the first strike -
   * the abyss evicts to make room, and the lightest parts go first, which is how
   * every minotaur lost its horns within one mutation (decision 240).
   */
  const BEAST_ROOM = 10;

  it("no beast starts above its own ceiling: a start with no room is dismantled by its first mutation", () => {
    for (const b of BEASTS) {
      const body = fixtureBody(b);
      const ceiling = skeletonCeiling(body);
      expect(mass(body), `${b.id}: масса ${mass(body)} при потолке ${ceiling}`).toBeLessThanOrEqual(ceiling - BEAST_ROOM);
    }
  });

  it("no beast starts with more load on its channels than it has: a beast tears at itself every turn otherwise", () => {
    for (const b of BEASTS) {
      const body = fixtureBody(b);
      const cap = controlCap(body);
      expect(controlLoad(body), `${b.id}: нагрузка ${controlLoad(body)} при ёмкости ${cap}`).toBeLessThanOrEqual(cap);
    }
  });

  /**
   * A brain sits where the animal has one: one per head, plus one nerve cord for a segmented
   * invertebrate. Ganglia were being stacked in the torsos as a cure for channel overload, and
   * every extra brain claims a territory of its own (body-graph.md §7) - the hydra ended with
   * eight and the centipede with seven. Capacity belongs to the kind now (decision 616).
   */
  it("no beast stacks brains: one to a head, at most one cord in the flesh, and no spinal ganglia at all", () => {
    const cords: string[] = [];
    for (const b of BEASTS) {
      const body = fixtureBody(b);
      const all = brains(body);
      const inHeads = all.filter((x) => x.head !== null);
      const inFlesh = all.filter((x) => x.head === null);
      const heads = [...organs(body)].filter((o) => o.kind === "head").length;
      expect(inHeads.length, `${b.id}: ${inHeads.length} мозгов на ${heads} голов`).toBeLessThanOrEqual(heads);
      expect(new Set(inHeads.map((x) => ("node" in x.ref ? x.ref.node : x.ref.segment))).size, `${b.id}: две головы одного узла с мозгами`).toBe(inHeads.length);
      expect(inFlesh.length, `${b.id}: ${inFlesh.length} мозгов в полостях`).toBeLessThanOrEqual(1);
      for (const x of all) expect(x.organ.kind, `${b.id} carries a ganglion`).not.toBe("ganglion");
      if (inFlesh.length === 1) {
        expect(inFlesh[0]!.organ.kind, b.id).toBe("nerveCord");
        cords.push(b.id);
      }
    }
    // The cord goes where the animal has one: the segmented invertebrates, and the jellyfish's nerve ring.
    // The spider thinks with one great brain in its head instead (decision 1256).
    expect(cords.sort()).toEqual(["centipede", "crab", "jellyfish", "mantis", "scorpion"]);
    // The hydra is right and untouched: five heads, five brains (decision 616).
    expect(brains(fixtureBody(beastById("hydra")!)).length).toBe(5);
    expect(brains(fixtureBody(beastById("centipede")!)).map((x) => x.organ.kind)).toEqual(["brain", "nerveCord"]);
  });

  it("every beast wears its cover on half its body at least, and wings come two to a beast", () => {
    for (const b of BEASTS) {
      const f = features(fixtureBody(b));
      expect(COVERS[b.want.cover], `${b.id}: ${b.want.cover} is a cover of the tables`).toBeDefined();
      expect(f.covers[b.want.cover] ?? 0, `${b.id} wears ${b.want.cover}`).toBeGreaterThanOrEqual(COVER_SHARE);
      expect(f.wings % 2, `${b.id}: a wing is a limb and its mirror`).toBe(0);
    }
    const worn: Record<string, CoverId> = {
      dragon: "dragonScales",
      youngDragon: "scales",
      hydra: "scales",
      snake: "scales",
      minotaur: "fur",
      cerberus: "fur",
      sphinx: "fur",
      bat: "fur",
      spider: "chitin",
      scorpion: "chitin",
      centipede: "chitin",
      mantis: "chitin",
      antQueen: "chitin",
      crab: "chitin",
      beetle: "chitin",
      harpy: "feathers",
      basilisk: "feathers",
      griffin: "feathers",
      gargoyle: "stone",
      jellyfish: "slime",
      octopus: "suckers",
      gorgon: "skin",
      centaur: "fur",
      dog: "fur",
      cat: "fur",
      wolf: "fur",
      lion: "fur",
      rat: "fur",
      bear: "fur",
      giantBear: "fur",
      whale: "skin",
    };
    for (const [id, cover] of Object.entries(worn)) expect(beastById(id)!.want.cover, id).toBe(cover);
    expect(Object.keys(worn).sort()).toEqual(BEASTS.map((b) => b.id).sort());
    for (const id of ["dragon", "gargoyle", "griffin", "harpy", "basilisk", "bat", "sphinx", "mantis"]) {
      expect(features(fixtureBody(beastById(id)!)).wings, `${id} has two wings`).toBe(2);
    }
  });

  /**
   * A winged beast flies. Before decisions 610-611 not one of them did: the area of a wing was the
   * sum of the lengths of the limb it hangs on, 4 or 5 against a threshold of 8, and only the widest
   * wing was read. Now the area is span x chord and flight is the sum of the wings.
   */
  it("every beast that has wings flies, and every beast that has none does not", () => {
    const flew: string[] = [];
    for (const b of BEASTS) {
      const body = fixtureBody(b);
      const d = derive(body);
      expect(d.locomotion.fly, `${b.id}: крылья ${d.locomotion.wings.map((w) => w.area).join("+") || "нет"}`).toBe(b.want.wings > 0);
      if (d.locomotion.fly) flew.push(b.id);
    }
    expect(flew.sort()).toEqual(["basilisk", "bat", "dragon", "gargoyle", "griffin", "harpy", "mantis", "sphinx", "youngDragon"]);
    // The bat hangs its wing on a long limb for its size; the dragon of tens of humans spreads the widest (decision 1284).
    const areas = (id: string): number[] => derive(fixtureBody(beastById(id)!)).locomotion.wings.map((w) => w.area);
    expect(areas("bat")).toEqual([14, 14]);
    expect(areas("dragon")).toEqual([74, 74]);
  });

  it("a new cover pays for itself: feathers are the lightest, stone the heaviest and the hardest", () => {
    expect(COVERS.feathers.massFactor).toBeLessThan(COVERS.skin.massFactor);
    expect(COVERS.feathers.defense).toBe(0);
    expect(COVERS.stone.massFactor).toBeGreaterThan(COVERS.plates.massFactor);
    expect(COVERS.stone.defense).toBeGreaterThan(COVERS.plates.defense);
    expect(COVERS.stone.stretches).toBe(false);
    for (const cover of ["feathers", "stone"] as const) {
      expect(TILES[cover], `${cover} has a tile of its own`).toBeDefined();
      expect(RAMPS[cover], `${cover} has a ramp of its own`).toBeDefined();
      expect(COVER_COLORS[cover], `${cover} has a colour of its own`).toBeDefined();
    }
    // The armour of a body is its covers: the gargoyle is the hardest beast of the bestiary, the harpy among the softest.
    const mean = (id: string): number => derive(fixtureBody(beastById(id)!)).armor.mean;
    for (const id of BEASTS.map((b) => b.id).filter((id) => id !== "gargoyle")) expect(mean("gargoyle"), id).toBeGreaterThan(mean(id));
    expect(mean("harpy")).toBeLessThan(mean("dragon"));
  });

  it("the report is the fixtures: the same form, the same verdict, twice over", () => {
    const d = data();
    expect(d.beasts.map((b) => b.beast.id)).toEqual(BEASTS.map((b) => b.id));
    for (const b of d.beasts) {
      const sim = similarity(b.beast.want, features(fixtureBody(b.beast)));
      expect(b.fixture.similarity.score, b.beast.id).toBe(sim.score);
      expect(b.fixture.similarity.off, b.beast.id).toEqual(sim.off);
      expect(b.verdict, b.beast.id).toBe(sim.strict ? "да" : sim.off.length <= 1 ? "почти" : "нет");
      expect(b.fixture.mass, b.beast.id).toBeGreaterThan(0);
      expect(b.fixture.nodes, b.beast.id).toBeGreaterThan(1);
    }
  });

  it("the abyss loop draws exactly as the lab does", () => {
    const body = human();
    const rng = new LabRng(7);
    for (let i = 0; i < 12; i++) abyssStrike(body, rng);
    expect(bodyHash(body)).toBe(bodyHash(grow({ seeds: 1, mutations: 12, source: "abyss" }, true, 7)));
  });

  it("random assembly reports shares in 0..1 per strike, consistent peaks, and the human is no beast", () => {
    const r = randomAssembly(BEASTS, { seeds: 8, strikes: 6, turnsPerStrike: 0 });
    expect(r.beasts).toHaveLength(BEASTS.length);
    for (const b of r.beasts) {
      expect(b.strict).toHaveLength(6);
      expect(b.loose).toHaveLength(6);
      for (const s of [...b.strict, ...b.loose]) expect(s >= 0 && s <= 1).toBe(true);
      expect(b.peakStrict.share).toBe(Math.max(...b.strict));
      expect(b.peakLoose.share).toBe(Math.max(...b.loose));
      expect(b.everStrict).toBeGreaterThanOrEqual(b.peakStrict.share);
      expect(b.everLoose).toBeGreaterThanOrEqual(b.peakLoose.share);
      expect(b.meanBest >= 0 && b.meanBest <= 1).toBe(true);
    }
    const h = features(human());
    for (const b of BEASTS) expect(similarity(b.want, h).strict, b.id).toBe(false);
  });

  it("builds one page with twenty articles, no outside links, no fonts, dark tokens, system fonts", () => {
    const dir = mkdtempSync(join(tmpdir(), "beasts-"));
    try {
      const out = join(dir, "beasts.html");
      const r = buildBeasts(out, { data: data() });
      const html = readFileSync(out, "utf8");
      expect(r.bytes).toBe(Buffer.byteLength(html));
      expect(html.startsWith("<title>Бестиарий mutant-engine</title>")).toBe(true);
      expect(html).not.toContain("<!doctype");
      expect(html).not.toMatch(/<(html|head|body)[\s>]/);
      expect(html.match(/<article class="beast"/g)).toHaveLength(BEASTS.length);
      for (const b of BEASTS) expect(html, b.id).toContain(`id="b-${b.id}"`);
      for (const a of ADDITIONS) expect(html, a.id).toContain(`id="a-${a.id}"`);
      const links = html.match(/https?:\/\/[^"'\s)]+/g) ?? [];
      expect(links.filter((l) => !l.startsWith("http://www.w3.org/2000/svg"))).toEqual([]);
      expect(html).not.toContain("<link");
      expect(html).toContain("--ink-0:#0b0a09");
      expect(html).toContain("system-ui");
      expect(html.match(/<svg/g)!.length).toBeGreaterThanOrEqual(40);
      expect(html).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
      expect(html.length).toBeLessThanOrEqual(2 * 1024 * 1024);
      console.log(`beasts: ${(r.bytes / 1024).toFixed(0)} KB, abyss ${(data().ms.random / 1000).toFixed(1)} s on ${SMALL.seeds} x ${SMALL.strikes}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
