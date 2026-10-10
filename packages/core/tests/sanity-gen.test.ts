/**
 * The random population is bodies the catalog could make (docs/tasks/sanity,
 * finding S-life-01): no row of the catalog leaves a body with nothing to
 * breathe with, so the generator of the tests does not either. A random body
 * that lost every lung, gill and pore gets its lungs back.
 */
import { describe, expect, it } from "vitest";
import { derive } from "../index.js";
import { population } from "./gen.js";

describe("the random population breathes", () => {
  it("S-life-01: every body of the standard population has an organ to breathe with", () => {
    const bad: string[] = [];
    population(500).forEach((b, i) => {
      if (derive(b).breath.media.length === 0) bad.push(`random:${i}`);
    });
    expect(bad.slice(0, 20).join(" ")).toBe("");
  });
});
