/**
 * The mutation editor (#4), tests first for its model: an edit lands only on
 * what it names, a row switched off is never drawn by a source and can still
 * be placed by hand, the file the editor writes reads back the same, and an
 * edit that breaks the catalog is refused.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  drawMutation,
  human,
  BASE_MUTATION_TEXT,
  MUTATION_TEXT,
  BASE_MUTATIONS,
  CATALOG,
  MUTATIONS,
  checkMutations,
  applyOverride,
  pruneOverride,
  MUTATION_OVERRIDES,
  SOURCES,
  sourceSpec,
  LabRng,
} from "../../index.js";
import { normalize, overrideProblems, overridesRoute, overridesSource, parseOverridesSource, type Overrides } from "../../../../apps/lab/studio/overrides.js";

describe("the catalog under the editor's edits", () => {
  it("the accepted edits in the repository leave a sound catalog; an empty set is the catalog as written", () => {
    expect(checkMutations()).toEqual([]);
    if (Object.keys(MUTATION_OVERRIDES).length === 0) {
      expect(CATALOG).toEqual(BASE_MUTATIONS);
      expect(MUTATIONS).toEqual(BASE_MUTATIONS);
      expect(MUTATION_TEXT).toEqual(BASE_MUTATION_TEXT);
    }
  });

  it("an edit changes only the fields it names", () => {
    const m = BASE_MUTATIONS.find((x) => x.id === "extraArm")!;
    const e = applyOverride(m, { chance: 3, tags: ["defect"] });
    expect(e.chance).toBe(3);
    expect(e.tags).toEqual(["defect"]);
    expect({ ...e, chance: m.chance, tags: m.tags }).toEqual(m);
    expect(m.chance).toBe(10);
    expect(applyOverride(m, undefined)).toBe(m);
  });

  it("an edit equal to the row is no edit", () => {
    const m = BASE_MUTATIONS.find((x) => x.id === "extraArm")!;
    expect(pruneOverride(m, BASE_MUTATION_TEXT[m.i18n], { chance: m.chance, tags: [...m.tags], ru: BASE_MUTATION_TEXT[m.i18n]!.ru })).toBeUndefined();
    expect(pruneOverride(m, BASE_MUTATION_TEXT[m.i18n], { chance: 4, disabled: true })).toEqual({ chance: 4, disabled: true });
  });

  it("a row switched off is never drawn by any source in 2000 draws, the others still are", () => {
    const off = new Set(["extraArm", "tentacle", "eyeOnStalk"]);
    const catalog = BASE_MUTATIONS.filter((m) => !off.has(m.id));
    for (const s of SOURCES.filter((x) => x.id !== "id")) {
      const spec = sourceSpec(s.id);
      const list = spec.never.length === 0 ? catalog : catalog.filter((m) => !spec.never.includes(m.family));
      const rng = new LabRng(`off-${s.id}`);
      const seen = new Set<string>();
      for (let i = 0; i < 2000; i++) {
        const m = drawMutation(list, rng, { body: human(), spread: true });
        if (m !== null) seen.add(m.id);
      }
      for (const id of off) expect(seen.has(id), `${s.id} drew ${id}`).toBe(false);
      expect(seen.size).toBeGreaterThan(50);
    }
  });
});

describe("the file the editor writes", () => {
  it("reads back the same edits, rows by id, only what differs", () => {
    const o: Overrides = { tentacle: { chance: 2 }, extraArm: { disabled: true, ru: "лишняя рука" }, hoof: { chance: BASE_MUTATIONS.find((m) => m.id === "hoof")!.chance } };
    const text = overridesSource(o);
    expect(parseOverridesSource(text)).toEqual({ extraArm: { disabled: true, ru: "лишняя рука" }, tentacle: { chance: 2 } });
    expect(overridesSource(o)).toBe(text);
    expect(Object.keys(normalize(o))).toEqual(["extraArm", "tentacle"]);
  });

  it("an empty set writes exactly the file in the repository when it holds no edits", () => {
    const current = readFileSync(join(import.meta.dirname, "..", "..", "..", "..", "packages", "core", "content", "overrides.ts"), "utf8");
    if (Object.keys(MUTATION_OVERRIDES).length === 0) expect(overridesSource({})).toBe(current);
    expect(parseOverridesSource(current)).toEqual(MUTATION_OVERRIDES);
  });
});

describe("accepting an edit", () => {
  it("refuses what breaks the catalog: an unknown row, a chance of 0, an unknown tag, an empty text", () => {
    expect(overrideProblems({ nope: { chance: 1 } }).join(" ")).toMatch(/no such row/);
    expect(overrideProblems({ extraArm: { chance: 0 } }).join(" ")).toMatch(/chance/);
    expect(overrideProblems({ extraArm: { tags: ["wat" as never] } }).join(" ")).toMatch(/unknown tag/);
    expect(overrideProblems({ extraArm: { ru: " " } }).join(" ")).toMatch(/empty ru/);
    expect(overrideProblems({ extraArm: { chance: 4, disabled: true }, tentacle: { tags: ["defect"] } })).toEqual([]);
  });

  it("the api writes a sound set and nothing else", () => {
    const dir = mkdtempSync(join(tmpdir(), "overrides-"));
    const path = join(dir, "overrides.ts");
    try {
      writeFileSync(path, overridesSource({}));
      const write = (t: string): void => writeFileSync(path, t);
      const current = (): Overrides => parseOverridesSource(readFileSync(path, "utf8")) ?? {};
      expect(overridesRoute("PUT", { overrides: { extraArm: { chance: -1 } } }, current, write).status).toBe(400);
      expect(current()).toEqual({});
      const ok = overridesRoute("PUT", { overrides: { extraArm: { chance: 5 } } }, current, write);
      expect(ok.status).toBe(200);
      expect(current()).toEqual({ extraArm: { chance: 5 } });
      expect((overridesRoute("GET", undefined, current, write).json as { overrides: Overrides }).overrides).toEqual({ extraArm: { chance: 5 } });
      expect(overridesRoute("DELETE", undefined, current, write).status).toBe(405);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
