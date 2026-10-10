/**
 * Perf budget moved from packages/view/tests/sprites.test.ts (step 0, docs/tasks/modules/README.md D.2):
 * excluded from `npm test`, runs under `npm run bench`.
 */
import { describe, expect, it } from "vitest";
import { layout, renderPixels } from "../index.js";
import { swampMutant, type Body } from "@mutant-engine/core";
import { population } from "../../core/tests/gen.js";

describe("sprite budget", () => {
  it("a 96 px frame of a body of many parts is drawn in a millisecond on average, the swamp mutant included", () => {
    const bodies: Body[] = [...population(20), swampMutant()];
    const rigs = bodies.map((b, i) => ({ b, l: layout(b, { scale: "sqrt" }), seed: i }));
    for (const { b, l, seed } of rigs) renderPixels(b, { px: 96, layout: l, seed, t: 0 });
    let best = Infinity;
    for (let round = 0; round < 3; round++) {
      const t0 = performance.now();
      let frames = 0;
      for (let k = 0; k < 5; k++) {
        for (const { b, l, seed } of rigs) {
          renderPixels(b, { px: 96, layout: l, seed, t: k * 0.1 });
          frames += 1;
        }
      }
      best = Math.min(best, (performance.now() - t0) / frames);
    }
    console.log(`sprite frame 96: ${best.toFixed(2)} ms`);
    expect(best).toBeLessThanOrEqual(1);
  });
});
