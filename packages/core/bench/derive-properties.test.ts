/**
 * Perf budget moved from packages/core/tests/derive/properties.test.ts (step 0, docs/tasks/modules/README.md D.2):
 * excluded from `npm test`, runs under `npm run bench`.
 */
import { describe, expect, it } from "vitest";
import { LIMITS, apply, derive, human, nodeIds, organ, targets, touch, type Body } from "../index.js";

function fortyNodes(): Body {
  const b = human(100_000);
  const arm = { kind: "arm", length: 2, girth: 1, cover: "skin", ending: organ("hand") } as const;
  while (nodeIds(b).length < LIMITS.nodes) {
    const t = targets(b, "sprout", arm);
    apply(b, "sprout", arm, t[t.length - 1]!.target);
  }
  return b;
}

describe("derive is pure and cached", () => {
  it("derive on a 40-node body takes <= 2 ms", () => {
    const b = fortyNodes();
    expect(nodeIds(b)).toHaveLength(40);
    for (let i = 0; i < 30; i++) {
      touch(b);
      derive(b);
    }
    const N = 300;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      touch(b);
      derive(b);
    }
    const perCall = (performance.now() - t0) / N;
    console.log(`derive on 40 nodes: ${perCall.toFixed(3)} ms per call`);
    expect(perCall).toBeLessThanOrEqual(2);
  });
});
