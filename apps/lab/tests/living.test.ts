/**
 * The living mutants: 100 mutants from six sources, deterministic from their
 * seeds. The page that showed them is gone; they are a shelf of the studio's
 * bestiary now (apps/lab/tests/studio.test.ts).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FAMILIES, bodyHash, validate } from "@mutant-engine/core";
import { LIVING_SOURCES, MUTATIONS_BY_SEED, growMutant, livingSpecs, type LivingSource } from "../living/grow.js";

const LIVING = join(import.meta.dirname, "..", "..", "..", "apps", "lab", "living");

describe("living specs", () => {
  it("are 100: abyss 20, meat 15, tumour 15, spring 15, vaccine 15, mixed 20, with 5 / 10 / 20 / 30 mutations by seed", () => {
    const specs = livingSpecs();
    expect(specs).toHaveLength(100);
    const bySource = new Map<LivingSource, number>();
    for (const s of specs) bySource.set(s.source, (bySource.get(s.source) ?? 0) + 1);
    expect(bySource.get("abyss")).toBe(20);
    expect(bySource.get("meat")).toBe(15);
    expect(bySource.get("tumour")).toBe(15);
    expect(bySource.get("spring")).toBe(15);
    expect(bySource.get("vaccine")).toBe(15);
    expect(bySource.get("mixed")).toBe(20);
    const seeds = new Set(specs.map((s) => s.seed));
    expect(seeds.size).toBe(100);
    for (const s of specs) {
      expect(MUTATIONS_BY_SEED).toContain(s.count);
      if (s.source === "meat" || s.source === "vaccine") expect(FAMILIES).toContain(s.family);
      else expect(s.family).toBeUndefined();
    }
    expect(new Set(specs.map((s) => s.count)).size).toBe(4);
    expect(LIVING_SOURCES.map((s) => s.id)).toEqual(["abyss", "meat", "tumour", "spring", "vaccine", "mixed"]);
  });

  it("grow deterministically from their seed, one step per mutation, sources kept in the steps", () => {
    for (const spec of livingSpecs().filter((_, i) => i % 9 === 0)) {
      const a = growMutant(spec);
      const b = growMutant(spec);
      expect(bodyHash(a.body)).toBe(bodyHash(b.body));
      expect(a.steps).toHaveLength(spec.count);
      expect(validate(a.body), `seed ${spec.seed}`).toEqual([]);
      for (const step of a.steps) {
        if (step.id === "") {
          expect(step.lost).toBe(false);
          continue;
        }
        expect(step.ru.length).toBeGreaterThan(0);
        if (spec.source === "mixed") expect(["abyss", "meat", "tumour", "spring", "vaccine"]).toContain(step.source);
        else expect(step.source).toBe(spec.source);
        if (step.lost) expect(step.fallback).toBe(false);
      }
      expect(a.steps.some((s) => !s.lost)).toBe(true);
    }
  });
});

describe("the living mutants", () => {
  it("keeps the DOM out of grow and the renderer", () => {
    for (const f of ["grow.ts"]) {
      const text = readFileSync(join(LIVING, f), "utf8");
      for (const re of [/\bdocument\b/, /\bwindow\b/, /Math\.random/, /Date\.now/, /\bnavigator\b/]) expect(text, `${f} matches ${re}`).not.toMatch(re);
    }
    const render = join(import.meta.dirname, "..", "..", "..", "packages", "view");
    for (const f of ["rig.ts", "pixel.ts", "stamps.ts", "paint.ts", "compose.ts", "sprites.ts"]) {
      const text = readFileSync(join(render, f), "utf8");
      for (const re of [/\bdocument\b/, /\bwindow\b/, /Math\.random/, /Date\.now/, /\bnavigator\b/, /\bAudio\b/]) expect(text, `${f} matches ${re}`).not.toMatch(re);
    }
  });
});
