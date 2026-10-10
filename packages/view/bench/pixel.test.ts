/**
 * Perf budget moved from packages/view/tests/pixel.test.ts (step 0, docs/tasks/modules/README.md D.2):
 * excluded from `npm test`, runs under `npm run bench`.
 */
import { describe, expect, it } from "vitest";
import { layout, renderPixels } from "../index.js";
import type { Body } from "@mutant-engine/core";
import { population } from "../../core/tests/gen.js";

describe("pixel frame", () => {
  it("a body of many parts still renders in under 8 ms a frame on average", () => {
    const bodies: Body[] = population(20);
    const rigs = bodies.map((b, i) => ({ b, l: layout(b, { scale: "sqrt" }), seed: i }));
    for (const { b, l, seed } of rigs) renderPixels(b, { px: 96, layout: l, seed, t: 0 });
    const t0 = performance.now();
    let frames = 0;
    for (let k = 0; k < 5; k++) {
      for (const { b, l, seed } of rigs) {
        renderPixels(b, { px: 96, layout: l, seed, t: k * 0.1 });
        frames += 1;
      }
    }
    const per = (performance.now() - t0) / frames;
    console.log(`pixel frame: ${per.toFixed(2)} ms`);
    expect(per).toBeLessThanOrEqual(8);
  });
});
