import { describe, expect, it } from "vitest";
import { LabRng as Rng } from "../rng.js";
import {
  LIMITS,
  apply,
  bridges,
  closure,
  components,
  distances,
  grow,
  human,
  mass,
  nodeIds,
  organ,
  targets,
  validate,
  type Body,
} from "../index.js";
import { randomOp } from "../tests/gen.js";

function fortyNodes(): Body {
  const b = human(100_000);
  const arm = { kind: "arm", length: 2, girth: 1, cover: "skin", ending: organ("hand") } as const;
  while (nodeIds(b).length < LIMITS.nodes) {
    const t = targets(b, "sprout", arm);
    apply(b, "sprout", arm, t[t.length - 1]!.target);
  }
  return b;
}

describe("performance", () => {
  it("metrics on a 40-node body take <= 1 ms on average over 1000 calls", () => {
    const b = fortyNodes();
    expect(nodeIds(b)).toHaveLength(40);
    const run = () => {
      distances(b, b.self);
      components(b);
      bridges(b);
      closure(b);
      mass(b);
      validate(b);
    };
    for (let i = 0; i < 50; i++) run();
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) run();
    const perCall = (performance.now() - t0) / 1000;
    console.log(`metrics: ${perCall.toFixed(3)} ms per call`);
    expect(perCall).toBeLessThanOrEqual(1);
  });

  it("1000 random operations take <= 1 s", () => {
    const rng = new Rng(42);
    const b = human(100_000);
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) {
      const c = randomOp(rng);
      grow(b, c.op, c.payload, rng);
    }
    const ms = performance.now() - t0;
    console.log(`1000 ops: ${ms.toFixed(0)} ms, ${nodeIds(b).length} nodes`);
    expect(ms).toBeLessThanOrEqual(1000);
  });
});
