/**
 * Soak test moved from packages/core/tests/spread.test.ts (step 0, docs/tasks/modules/README.md D.2):
 * the full 1000 mutations x 100 seeds run, excluded from `npm test`, runs under `npm run bench`.
 * A reduced version of the same invariant (50 mutations x 10 seeds) stays in packages/core/tests/spread.test.ts.
 */
import { describe, expect, it } from "vitest";
import { LabRng as Rng } from "../rng.js";
import {
  LIMITS,
  applyMutation,
  bodyToText,
  closure,
  contagionTick,
  coverTick,
  drawMutation,
  human,
  mass,
  nodeIds,
  segmentIds,
  segmentsAt,
  sortedIds,
  tick,
  validate,
  wanderTick,
  type MutationContext,
} from "../index.js";
import { MUTATIONS } from "../index.js";

describe("invariants", () => {
  it("spread never violates limits: 1000 catalog mutations on 100 seeds, ticking", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const rng = new Rng(`d-limits-${seed}`);
      const b = human(100_000);
      const ctx: MutationContext = { ceiling: 100_000 };
      for (let i = 0; i < 1000; i++) {
        const m = drawMutation(MUTATIONS, rng, { body: b })!;
        applyMutation(b, m, rng, i % 3 === 0 ? { ...ctx, source: "abyss" } : ctx);
        coverTick(b, 100_000);
        contagionTick(b);
        wanderTick(b, rng);
        tick(b);
        if (i % 100 === 99) expect(validate(b), `seed ${seed} step ${i} ${m.id}\n${bodyToText(b)}`).toEqual([]);
      }
      expect(nodeIds(b).length).toBeLessThanOrEqual(LIMITS.nodes);
      expect(segmentIds(b).length).toBeLessThanOrEqual(LIMITS.segments);
      expect(closure(b)).toBeLessThanOrEqual(LIMITS.cycles);
      expect(sortedIds(b.membranes).length).toBeLessThanOrEqual(LIMITS.membranes);
      // A flank takes no slot at its host's end (flank.ts).
      for (const n of nodeIds(b)) expect(segmentsAt(b, n).filter((sid) => !(b.segments[sid]!.kind === "flank" && b.segments[sid]!.a === n)).length).toBeLessThanOrEqual(2 * b.nodes[n]!.size);
      expect(mass(b)).toBeLessThanOrEqual(b.meat + 1e-9);
      expect(validate(b)).toEqual([]);
    }
  }, 300_000);
});
