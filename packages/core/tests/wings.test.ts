import { describe, expect, it } from "vitest";
import { LabRng as Rng } from "../rng.js";
import { applyMutation, drawMutation, human, sortedIds, MUTATIONS, mutationById } from "../index.js";
import { spanNodes } from "../membrane.js";
import { mutationTargets } from "../mutation.js";

/**
 * A wing hangs on the limb itself (decision 121), so every target the wings row
 * offers has to be an open span. A limb that runs back into its own root - two
 * segments in parallel between the same pair of nodes - is a ring of two: the
 * span rejects it for not being a path, and the cycle rejects it for being
 * shorter than three. Offering it threw from deep inside `addMembrane`, and
 * which bodies reach it is decided by the draw, so any row added to the catalog
 * shifts the rng and can uncover it again. Hence the contract, not a seed.
 */
describe("wings spread only on an open span", () => {
  it("every target the wings row offers makes a wing span, never a ring", () => {
    const wings = mutationById("wings")!;
    let offered = 0;
    for (let seed = 0; seed < 400; seed++) {
      const spread = seed % 2 === 0;
      const rng = new Rng(`wing-contract-${seed}`);
      const body = human();
      for (let i = 0; i < 40; i++) {
        const m = drawMutation(MUTATIONS, rng, { body, spread })!;
        applyMutation(body, m, rng, { source: "abyss", spread });
      }
      for (const w of mutationTargets(body, wings)) {
        offered++;
        const work = structuredClone(body);
        const before = new Set(sortedIds(work.membranes));
        expect(() => applyMutation(work, wings, new Rng(`w-${seed}-${offered}`), { target: w.target } as never)).not.toThrow();
        for (const id of sortedIds(work.membranes)) {
          if (before.has(id)) continue;
          const m = work.membranes[id]!;
          expect(spanNodes(work, m.cycle), `membrane ${id} on ${JSON.stringify(m.cycle)} is not a span`).not.toBeNull();
        }
      }
    }
    expect(offered).toBeGreaterThan(100);
  });
});
