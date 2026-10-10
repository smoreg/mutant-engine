/**
 * Perf budgets moved from apps/lab/tests/lab.test.ts (step 0, docs/tasks/modules/README.md D.2):
 * excluded from `npm test`, runs under `npm run bench`.
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildLab } from "../build.js";
import { run, type LabState, type Step } from "@mutant-engine/core";

describe("the lab page", () => {
  it("builds one self-contained file under 2 MB in at most 20 s", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lab-"));
    try {
      const out = join(dir, "lab.html");
      const t0 = performance.now();
      const result = await buildLab(out);
      const ms = performance.now() - t0;
      expect(ms).toBeLessThanOrEqual(20_000);
      expect(readdirSync(dir)).toEqual(["lab.html"]);
      const html = readFileSync(out, "utf8");
      expect(statSync(out).size).toBeLessThanOrEqual(2 * 1024 * 1024);
      expect(result.bytes).toBe(statSync(out).size);
      expect(html).toContain("<!doctype html>");
      expect(html).toMatch(/<script[^>]*>[^<]{100}/);
      expect(html).not.toMatch(/<(script|link|img)\s[^>]*(src|href)=/);
      expect(html).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
      expect(html).not.toMatch(/@import|url\(http/);
      expect(html).toContain("Лаборатория");
      // The studio: four big tabs over one page, the beasts are inside.
      for (const tab of ["gen", "lab", "zoo", "parts"]) expect(html).toContain(`data-tab="${tab}"`);
      expect(html).not.toContain("data-panel=");
      expect(html).toContain("кентавр");
      console.log(`lab: ${(result.bytes / 1024).toFixed(0)} KB in ${ms.toFixed(0)} ms`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it("50 abyss strikes replay with diffs and numbers in at most 30 ms a step", () => {
    const state: LabState = { seed: 11, start: { kind: "human" }, commands: [{ t: "mutate", source: "abyss", n: 50 }], spread: true };
    run(state);
    const t0 = performance.now();
    const r = run(state);
    const perStep = (performance.now() - t0) / r.steps.length;
    console.log(`lab replay: ${perStep.toFixed(2)} ms per step over ${r.steps.length} steps`);
    expect(r.steps).toHaveLength(51);
    expect(perStep).toBeLessThanOrEqual(30);
    const withSteps = (r.steps as Step[]).filter((s) => s.event.kind === "mutate" && s.event.result !== null);
    expect(withSteps.length).toBeGreaterThan(40);
  });
});
