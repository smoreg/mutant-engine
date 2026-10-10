/**
 * Perf budget moved from packages/core/tests/territory.test.ts (step 0, docs/tasks/modules/README.md D.2):
 * excluded from `npm test`, runs under `npm run bench`.
 */
import { describe, expect, it } from "vitest";
import { apply, brainOrgan, brains, human, nodeIds, organ, targets, territories } from "../index.js";

describe("territories", () => {
  it("territories on a 40-node body with six brains take <= 1 ms", () => {
    const b = human(100_000);
    const arm = { kind: "arm", length: 2, girth: 1, cover: "skin", ending: organ("hand") } as const;
    const headOn = (sway: number) =>
      ({ kind: "neck", length: 1, girth: 1, cover: "skin", ending: organ("head", [brainOrgan(sway), organ("eye")]) }) as const;
    let heads = 0;
    while (nodeIds(b).length < 40) {
      const payload = heads < 5 ? headOn(heads * 2) : arm;
      const list = targets(b, "sprout", payload);
      apply(b, "sprout", payload, list[list.length - 1]!.target);
      if (heads < 5) heads += 1;
    }
    expect(nodeIds(b)).toHaveLength(40);
    expect(brains(b)).toHaveLength(6);
    for (let i = 0; i < 50; i++) territories(b);
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) territories(b);
    const perCall = (performance.now() - t0) / 1000;
    console.log(`territories: ${perCall.toFixed(3)} ms per call`);
    expect(perCall).toBeLessThanOrEqual(1);
  });
});
