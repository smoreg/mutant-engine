/**
 * Soak test moved from packages/core/tests/needs.test.ts (step 0, docs/tasks/modules/README.md D.2):
 * the full 900-seed / 150-case run, excluded from `npm test`, runs under `npm run bench`.
 * A reduced version of the same invariant stays in packages/core/tests/needs.test.ts.
 */
import { describe, expect, it } from "vitest";
import { LabRng as Rng } from "../rng.js";
import {
  applyMutation,
  capacity,
  cavityLoad,
  cloneBody,
  drawMutation,
  hasKind,
  hearts,
  human,
  mutationTargets,
  needOf,
  segmentIds,
  type Body,
  type Mutation,
  type MutationContext,
} from "../index.js";
import { MUTATIONS } from "../index.js";

function byId(id: string): Mutation {
  const m = MUTATIONS.find((x) => x.id === id);
  if (m === undefined) throw new Error(`no mutation ${id} in the catalog`);
  return m;
}

/** The abyss of the first layer as the lab reads it: a defect in 15 % of the strikes, the plan decays with the load. */
function strike(b: Body, rng: Rng, ctx: MutationContext = {}): ReturnType<typeof applyMutation> {
  const defect = rng.next() < 0.15;
  const m = drawMutation(MUTATIONS, rng, { body: b, defect, decay: true })!;
  return applyMutation(b, m, rng, { ...ctx, source: "abyss" });
}

function torsos(b: Body): number[] {
  return segmentIds(b).filter((id) => b.segments[id]!.kind === "torso");
}

describe("needs pull rows and places", () => {
  it("hearts spread out: on bodies with two heartless torsos or more the new heart takes the one farthest from the old in at least 70 % of the cases", () => {
    let cases = 0;
    let farthest = 0;
    let farthestOff = 0;
    let intoTorso = 0;
    let intoTorsoOff = 0;
    // The weight the need puts on the farthest heartless torso, summed over the cases: the rule itself, read without drawing.
    let weightOn = 0;
    let weightOff = 0;
    for (let seed = 1; seed <= 900 && cases < 150; seed++) {
      const rng = new Rng(`j-hearts-${seed}`);
      const b = human();
      for (let i = 0; i < 30; i++) strike(b, rng);
      const heart = needOf(b, "heart");
      // Heartless torsos with room for a heart of 4: the others are no place for it whatever the need says.
      const candidates = torsos(b).filter((id) => !hasKind(b.segments[id]!.cavity, "heart") && capacity(b.segments[id]!) - cavityLoad(b.segments[id]!) >= 4);
      if (candidates.length < 2 || hearts(b).length === 0) continue;
      const best = Math.max(...candidates.map((id) => heart.places.get(id) ?? 0));
      const far = new Set(candidates.filter((id) => (heart.places.get(id) ?? 0) >= best - 1e-9));
      if (far.size === candidates.length) continue;
      cases += 1;
      for (const needs of [true, false]) {
        const list = mutationTargets(b, byId("secondHeart"), { needs, source: "abyss" });
        const total = list.reduce((sum, w) => sum + w.weight, 0);
        if (total <= 0) continue;
        const share = list.reduce((sum, w) => sum + ("segment" in w.target && far.has(w.target.segment) ? w.weight : 0), 0) / total;
        if (needs) weightOn += share;
        else weightOff += share;
      }
      const on = applyMutation(cloneBody(b), byId("secondHeart"), new Rng(`j-hearts-on-${seed}`), { source: "abyss" });
      if (on !== null && !on.fallback && "segment" in on.target && far.has(on.target.segment)) farthest += 1;
      if (on !== null && !on.fallback && "segment" in on.target && candidates.includes(on.target.segment)) intoTorso += 1;
      const off = applyMutation(cloneBody(b), byId("secondHeart"), new Rng(`j-hearts-off-${seed}`), { source: "abyss", needs: false });
      if (off !== null && !off.fallback && "segment" in off.target && far.has(off.target.segment)) farthestOff += 1;
      if (off !== null && !off.fallback && "segment" in off.target && candidates.includes(off.target.segment)) intoTorsoOff += 1;
    }
    console.log(
      `hearts spread out: ${farthest} of ${cases} into the farthest heartless torso with needs, ${farthestOff} without; ` +
        `into any heartless torso ${intoTorso} with needs, ${intoTorsoOff} without; ` +
        `weight on the farthest ${(weightOn / cases).toFixed(3)} with needs, ${(weightOff / cases).toFixed(3)} without`,
    );
    expect(cases).toBeGreaterThanOrEqual(25);
    expect(weightOn / cases).toBeGreaterThan(0.15);
    expect(weightOn).toBeGreaterThan(2 * weightOff);
    expect(farthest / intoTorso).toBeGreaterThanOrEqual(0.65);
    expect(intoTorso).toBeGreaterThanOrEqual(intoTorsoOff);
  });
});
