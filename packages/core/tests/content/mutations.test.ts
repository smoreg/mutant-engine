import { describe, expect, it } from "vitest";
import { LabRng as Rng } from "../../rng.js";
import {
  FAMILIES,
  ORGANS,
  applyMutation,
  bodyHash,
  bodyToText,
  cloneBody,
  drawMutation,
  human,
  isBrainKind,
  mass,
  validate,
  type OrganKind,
  MUTATIONS,
  checkMutations,
  mutationById,
  MUTATION_ABOUT,
  MUTATION_TEXT,
} from "../../index.js";

describe("catalog", () => {
  it("catalog check: every mutation has a family, an operation, a target rule and an i18n key; no duplicates", () => {
    expect(checkMutations()).toEqual([]);
    const ids = new Set<string>();
    for (const m of MUTATIONS) {
      expect(ids.has(m.id), `duplicate ${m.id}`).toBe(false);
      ids.add(m.id);
      expect(FAMILIES).toContain(m.family);
      expect(typeof m.op).toBe("string");
      expect(m.target).toBeTypeOf("object");
      expect(m.chance).toBeGreaterThan(0);
      expect(MUTATION_TEXT[m.i18n]).toBeDefined();
      expect(MUTATION_TEXT[m.i18n]!.ru.length).toBeGreaterThan(0);
      expect(MUTATION_TEXT[m.i18n]!.en.length).toBeGreaterThan(0);
    }
  });

  it("every row says what it does, in both languages, and no description hangs without a row (decision 163)", () => {
    for (const m of MUTATIONS) {
      const about = MUTATION_ABOUT[m.i18n];
      expect(about, m.id).toBeDefined();
      expect(about!.ru.length, m.id).toBeGreaterThan(10);
      expect(about!.en.length, m.id).toBeGreaterThan(10);
      // A description, not a second name: it ends in a sentence.
      expect(about!.ru.endsWith("."), m.id).toBe(true);
      expect(about!.en.endsWith("."), m.id).toBe(true);
      expect(about!.ru, m.id).not.toBe(MUTATION_TEXT[m.i18n]!.ru);
    }
    const keys = new Set(MUTATIONS.map((m) => m.i18n));
    for (const key of Object.keys(MUTATION_ABOUT)) expect(keys.has(key) || mutationById(key.replace(/^mutation\./, "")) !== undefined, key).toBe(true);
    // The check catches a row left without one.
    const base = MUTATIONS[0]!;
    expect(checkMutations([base], MUTATION_TEXT, {})).toContainEqual(expect.stringContaining("no description"));
    expect(checkMutations([base], MUTATION_TEXT, { ...MUTATION_ABOUT, "mutation.nothingOfTheKind": { ru: "нет", en: "no" } })).toContainEqual(
      expect.stringContaining("orphan description"),
    );
  });

  it("every organ a row grows says whether the knife can take it out: flesh or a trait (decision 1225)", () => {
    const mute = mutationById("muteness")!;
    const arm = mutationById("extraArm")!;
    expect(checkMutations([mute, arm], MUTATION_TEXT, MUTATION_ABOUT).filter((p) => p.includes("substance"))).toEqual([]);
    // A kind left without the column: the row that grows it is caught, whether it puts it in a head or on a tip.
    const { substance: _mute, ...unmarked } = ORGANS.muteness;
    const { substance: _hand, ...bareHand } = ORGANS.hand;
    const table = { ...ORGANS, muteness: unmarked, hand: bareHand } as unknown as typeof ORGANS;
    const problems = checkMutations([mute, arm], MUTATION_TEXT, MUTATION_ABOUT, table);
    expect(problems).toContainEqual(expect.stringMatching(/muteness.*substance/));
    expect(problems).toContainEqual(expect.stringMatching(/extraArm.*hand.*substance/));
  });

  it("every family has >= 6 mutations", () => {
    const counts = new Map<string, number>();
    for (const m of MUTATIONS) counts.set(m.family, (counts.get(m.family) ?? 0) + 1);
    for (const f of FAMILIES) expect(counts.get(f) ?? 0, f).toBeGreaterThanOrEqual(6);
    expect(FAMILIES).toHaveLength(18);
    expect(MUTATIONS.length).toBeGreaterThanOrEqual(108);
  });

  it("the key old mutations are in the catalog as operations", () => {
    const ids = new Set(MUTATIONS.map((m) => m.id));
    for (const id of ["secondHead", "hydraArm", "fleshMemory", "budding", "parasiticTwin", "wings", "amorphous", "weakNeck", "ganglion", "gutBrain"]) {
      expect(ids.has(id), id).toBe(true);
    }
    expect(MUTATIONS.find((m) => m.id === "secondHead")!.op).toBe("sprout");
    expect(MUTATIONS.find((m) => m.id === "fleshMemory")!.op).toBe("organ");
    expect(MUTATIONS.find((m) => m.id === "wings")!.op).toBe("wings");
  });

  it("the catalog is broken by a duplicate, a missing key, an unknown organ", () => {
    const base = MUTATIONS[0]!;
    expect(checkMutations([...MUTATIONS, { ...base }])).toContainEqual(expect.stringContaining(base.id));
    expect(checkMutations([{ ...base, i18n: "nothing.of.the.kind" }])).toContainEqual(expect.stringContaining("nothing.of.the.kind"));
    const organ = MUTATIONS.find((m) => m.op === "organ")!;
    const broken = { ...organ, payload: { ...organ.payload, organ: { kind: "tentacleBeard" as OrganKind, instability: 0 } } };
    expect(checkMutations([broken])).toContainEqual(expect.stringContaining("tentacleBeard"));
    expect(checkMutations([{ ...base, family: "limbs" }]).some((p) => p.includes("< 6"))).toBe(true);
  });

  it("every mutation applies to the human or falls back to growth within 20 tries", () => {
    let direct = 0;
    for (const m of MUTATIONS) {
      let landed = false;
      let fallbackOnly = true;
      for (let i = 1; i <= 20 && !landed; i++) {
        const b = human();
        const r = applyMutation(b, m, new Rng(`${m.id}-${i}`));
        expect(validate(b), `${m.id} try ${i}\n${bodyToText(b)}`).toEqual([]);
        expect(mass(b)).toBeLessThanOrEqual(b.meat + 1e-9);
        if (r !== null) {
          landed = true;
          fallbackOnly = r.fallback;
        }
      }
      expect(landed, m.id).toBe(true);
      if (!fallbackOnly) direct += 1;
    }
    console.log(`catalog: ${direct} of ${MUTATIONS.length} mutations land on the human directly`);
    expect(direct).toBeGreaterThanOrEqual(Math.floor(MUTATIONS.length * 0.8));
  });

  it("drawing by family and by defect is weighted by chance and deterministic", () => {
    const rng = new Rng(5);
    const seen = new Map<string, number>();
    for (let i = 0; i < 2000; i++) {
      const m = drawMutation(MUTATIONS, rng, { family: "limbs" })!;
      expect(m.family).toBe("limbs");
      seen.set(m.id, (seen.get(m.id) ?? 0) + 1);
    }
    const limbs = MUTATIONS.filter((m) => m.family === "limbs");
    const total = limbs.reduce((s, m) => s + m.chance, 0);
    for (const m of limbs) {
      const share = (seen.get(m.id) ?? 0) / 2000;
      expect(Math.abs(share - m.chance / total), m.id).toBeLessThan(0.05);
    }
    for (let i = 0; i < 200; i++) expect(drawMutation(MUTATIONS, rng, { defect: true })!.tags).toContain("defect");
    for (let i = 0; i < 200; i++) expect(drawMutation(MUTATIONS, rng, { defect: false })!.tags).not.toContain("defect");
    expect(drawMutation(MUTATIONS, new Rng(9), {})).toEqual(drawMutation(MUTATIONS, new Rng(9), {}));
    expect(drawMutation([], new Rng(1), {})).toBeNull();
  });

  it("determinism: applying the catalog on 100 seeds gives the same hashes", () => {
    const run = (seed: number) => {
      const rng = new Rng(seed);
      const b = human();
      for (let i = 0; i < 25; i++) {
        const m = drawMutation(MUTATIONS, rng, {})!;
        applyMutation(b, m, rng, { source: i % 4 === 0 ? "abyss" : undefined });
      }
      return bodyHash(b);
    };
    for (let seed = 1; seed <= 100; seed++) expect(run(seed)).toBe(run(seed));
  });

  it("organ table: names unique, brains are the kinds with channels, every kind mounts somewhere", () => {
    const names = new Set<string>();
    for (const [kind, spec] of Object.entries(ORGANS)) {
      expect(names.has(spec.ru), spec.ru).toBe(false);
      names.add(spec.ru);
      expect(spec.ru).not.toMatch(/[(),@*!~]/);
      expect(spec.mounts.length, kind).toBeGreaterThan(0);
      expect(spec.mass, kind).toBeGreaterThanOrEqual(0);
      expect(spec.control, kind).toBeGreaterThanOrEqual(0);
      const brain = spec.tags?.includes("brain") ?? false;
      expect(isBrainKind(kind as OrganKind), kind).toBe(brain);
      if (brain) expect(spec.channels, kind).toBeGreaterThan(0);
    }
    expect(ORGANS.brain.channels).toBe(10);
    expect(ORGANS.smallBrain.channels).toBe(6);
    expect(ORGANS.ganglion.channels).toBe(3);
    expect(ORGANS.gutBrain.channels).toBe(4);
  });

  it("the brain ladder: capacity is a kind, and the wide end is paid for in mass, in upkeep or in psionics (decisions 614-615)", () => {
    const ladder: OrganKind[] = ["ganglion", "gutBrain", "smallBrain", "slowBrain", "brain", "greatBrain", "nerveCord"];
    for (const kind of ladder) expect(ORGANS[kind].tags, kind).toContain("brain");
    const channels = ladder.map((k) => ORGANS[k].channels!);
    expect(channels).toEqual([3, 4, 6, 8, 10, 16, 20]);
    for (let i = 1; i < channels.length; i++) expect(channels[i], ladder[i]).toBeGreaterThan(channels[i - 1]!);
    // A step up the ladder is not free: above the human's brain it costs mass and upkeep.
    for (const kind of ["greatBrain", "nerveCord"] as OrganKind[]) {
      expect(ORGANS[kind].mass, kind).toBeGreaterThan(ORGANS.brain.mass);
      expect(ORGANS[kind].upkeep, kind).toBeGreaterThan(ORGANS.brain.upkeep - 1);
    }
    // Psionics mount in a head alone, so a cord - which never sees one - buys channels and nothing psychic.
    expect(ORGANS.nerveCord.mounts).toEqual(["cavity"]);
    expect(ORGANS.greatBrain.mounts).toContain("head");
    for (const [kind, spec] of Object.entries(ORGANS)) {
      if (spec.family === "psionics") expect(spec.mounts, kind).toEqual(["head"]);
    }
    // Resistance is the `damps` tag and nothing invented: the slow brain trades channels for it.
    expect(ORGANS.slowBrain.tags).toContain("damps");
    expect(ORGANS.slowBrain.channels!).toBeLessThan(ORGANS.brain.channels!);
    // Every new kind is reachable, named and described.
    for (const id of ["greatBrain", "nerveCord", "slowBrain"]) {
      const m = mutationById(id);
      expect(m, id).toBeDefined();
      expect(MUTATION_TEXT[m!.i18n], id).toBeDefined();
      expect(MUTATION_ABOUT[m!.i18n], id).toBeDefined();
    }
  });

  it("no mutation payload copies a live organ: applying twice does not share objects", () => {
    for (const m of MUTATIONS.filter((x) => x.op === "organ")) {
      const a = human();
      const b = cloneBody(a);
      applyMutation(a, m, new Rng(1));
      applyMutation(b, m, new Rng(1));
      for (const s of Object.values(a.segments)) for (const o of [...s.cavity, ...s.growths]) expect(o).not.toBe(m.payload.organ);
    }
  });
});
