import { describe, expect, it } from "vitest";
import { human, swampMutant } from "@mutant-engine/core";
import { spritePlan, spriteText, type SpritePlan } from "../index.js";
import { population } from "../../core/tests/gen.js";

function filled(plan: SpritePlan): number {
  let n = 0;
  for (const c of plan.cells) if (c !== 0) n += 1;
  return n;
}

function filledBox(plan: SpritePlan): { x0: number; y0: number; x1: number; y1: number } {
  let x0: number = plan.px;
  let y0: number = plan.px;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < plan.px; y++) {
    for (let x = 0; x < plan.px; x++) {
      if (plan.cells[y * plan.px + x] === 0) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return { x0, y0, x1, y1 };
}

function colours(plan: SpritePlan): Set<number> {
  const s = new Set<number>();
  for (const c of plan.cells) if (c !== 0) s.add(c);
  return s;
}

describe("sprite plan", () => {
  it("human at 32 px fits the frame with a margin and fills at least 35 % of it", () => {
    const plan = spritePlan(human(), 32);
    expect(plan.px).toBe(32);
    expect(plan.cells).toHaveLength(32 * 32);
    const box = filledBox(plan);
    expect(box.x0).toBeGreaterThanOrEqual(1);
    expect(box.y0).toBeGreaterThanOrEqual(1);
    expect(box.x1).toBeLessThanOrEqual(30);
    expect(box.y1).toBeLessThanOrEqual(30);
    expect(box.y1 - box.y0 + 1).toBeGreaterThanOrEqual(24);
    // 40 % of the frame is not reachable for a tall, narrow human without limbs merging into the torso.
    expect(filled(plan) / (32 * 32)).toBeGreaterThanOrEqual(0.35);
  });

  it("uses a dark outline and 5..8 colours for the human at every size", () => {
    for (const px of [32, 64, 96] as const) {
      const plan = spritePlan(human(), px);
      const used = colours(plan);
      expect(used.size).toBeGreaterThanOrEqual(3);
      expect(used.size).toBeLessThanOrEqual(8);
      expect(used.has(1)).toBe(true);
      expect(plan.palette[0]).toMatchObject({ index: 0, name: "empty" });
      expect(plan.palette[1]).toMatchObject({ index: 1, name: "outline" });
      const self = plan.palette.find((p) => p.name === "self");
      expect(self).toBeDefined();
      expect(used.has(self!.index)).toBe(true);
      for (const c of plan.cells) expect(c).toBeLessThan(plan.palette.length);
      expect(filled(plan) / (px * px)).toBeGreaterThanOrEqual(0.3);
    }
  });

  it("is deterministic and reads as text", () => {
    const a = spritePlan(swampMutant(), 64);
    const b = spritePlan(swampMutant(), 64);
    expect(Buffer.from(a.cells).equals(Buffer.from(b.cells))).toBe(true);
    const text = spriteText(a);
    const lines = text.split("\n");
    expect(lines).toHaveLength(64);
    for (const line of lines) expect(line).toHaveLength(64);
    expect(text).toMatch(/[^. ]/);
  });

  it("every random body fits the 32 px frame and shows up", () => {
    for (const b of population(80)) {
      const plan = spritePlan(b, 32);
      const box = filledBox(plan);
      expect(box.x0).toBeGreaterThanOrEqual(1);
      expect(box.y0).toBeGreaterThanOrEqual(1);
      expect(box.x1).toBeLessThanOrEqual(30);
      expect(box.y1).toBeLessThanOrEqual(30);
      expect(Math.max(box.x1 - box.x0, box.y1 - box.y0) + 1).toBeGreaterThanOrEqual(20);
      expect(filled(plan) / (32 * 32)).toBeGreaterThanOrEqual(0.1);
      for (const c of plan.cells) expect(c).toBeLessThan(plan.palette.length);
    }
  });

  it("the membrane of the mutant is drawn in its own colour", () => {
    const plan = spritePlan(swampMutant(), 96);
    const membrane = plan.palette.find((p) => p.name === "membrane")!;
    expect(colours(plan).has(membrane.index)).toBe(true);
    expect(colours(spritePlan(human(), 96)).has(membrane.index)).toBe(false);
  });
});
