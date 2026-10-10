/**
 * Soak test moved from packages/core/tests/grotesque.test.ts (step 0, docs/tasks/modules/README.md D.2):
 * the full 200-seed run, excluded from `npm test`, runs under `npm run bench`.
 * A reduced version of the same invariant (20 seeds) stays in packages/core/tests/grotesque.test.ts.
 */
import { describe, expect, it } from "vitest";
import { LabRng as Rng } from "../rng.js";
import {
  applyMutation,
  bodyToText,
  components,
  drawMutation,
  forks,
  human,
  humanoid,
  longestChain,
  mass,
  nodeIds,
  planTargets,
  segmentIds,
  skeletonCeiling,
  validate,
  type Body,
  type MutationContext,
} from "../index.js";
import { MUTATIONS } from "../index.js";

/** Mass and meat agree after every operation: the model's bookkeeping of flesh. */
function sound(b: Body, where = ""): void {
  expect(validate(b), where).toEqual([]);
  expect(components(b), where).toHaveLength(1);
}

/** The abyss of the first layer as the lab reads it: a defect in 15 % of the strikes, the plan decays with the load. */
function strike(b: Body, rng: Rng, ctx: MutationContext = {}): ReturnType<typeof applyMutation> {
  const defect = rng.next() < 0.15;
  const m = drawMutation(MUTATIONS, rng, { body: b, defect, decay: true })!;
  return applyMutation(b, m, rng, { ...ctx, source: "abyss" });
}

function median(values: number[]): number {
  const s = [...values].sort((x, y) => x - y);
  return s.length % 2 === 1 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
}

function torsos(b: Body): number[] {
  return segmentIds(b).filter((id) => b.segments[id]!.kind === "torso");
}

function maxGirth(b: Body): number {
  let g = 0;
  for (const id of torsos(b)) g = Math.max(g, b.segments[id]!.girth);
  return g;
}

/** A head sitting directly on an end of a torso: no neck under it. */
function sunkHeads(b: Body): number {
  const torsoEnds = new Set<number>();
  for (const id of torsos(b)) torsoEnds.add(b.segments[id]!.a).add(b.segments[id]!.b);
  let n = 0;
  for (const id of nodeIds(b)) if (torsoEnds.has(id)) for (const e of b.nodes[id]!.ends) if (e.kind === "head") n += 1;
  return n;
}

describe("grotesque emerges", () => {
  it("200 seeds x abyss of the first layer: the plan falls apart by 30 strikes, further by 60; by 100 it branches instead of chaining", () => {
    const seeds = 200;
    const at30: number[] = [];
    const at60: number[] = [];
    const chains100: number[] = [];
    const forks30: number[] = [];
    const forks100: number[] = [];
    let thick = 0;
    let twoOrSunk = 0;
    let landed = 0;
    let defects = 0;
    let onTorso = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const rng = new Rng(`i-grotesque-${seed}`);
      const b = human();
      for (let i = 0; i < 100; i++) {
        const torsoTargets = planTargets(b);
        const r = strike(b, rng);
        if (r !== null && !r.fallback) {
          landed += 1;
          if (r.mutation.tags.includes("defect")) defects += 1;
          if (torsoTargets(r.target)) onTorso += 1;
        }
        if (i === 29) {
          at30.push(humanoid(b));
          forks30.push(forks(b));
          if (maxGirth(b) >= 4) thick += 1;
          if (torsos(b).length >= 2 || sunkHeads(b) > 0) twoOrSunk += 1;
        }
        if (i === 59) at60.push(humanoid(b));
        if (i % 25 === 24) sound(b, `seed ${seed} strike ${i}\n${bodyToText(b)}`);
      }
      chains100.push(longestChain(b));
      forks100.push(forks(b));
      expect(mass(b)).toBeLessThanOrEqual(skeletonCeiling(b) + 1e-9);
    }
    console.log(
      `humanoid median after 30: ${median(at30).toFixed(3)}, after 60: ${median(at60).toFixed(3)}; thick torso ${(thick / seeds).toFixed(2)}, two torsos or a sunk head ${(twoOrSunk / seeds).toFixed(2)}, defects among landed ${(defects / landed).toFixed(3)}; ` +
        `longest chain median at 100: ${median(chains100)} (main: 4); forks median at 30: ${median(forks30)}, at 100: ${median(forks100)} (main: 2 / 2); landed on the torso or its nodes ${(onTorso / landed).toFixed(3)} (main: 0.26)`,
    );
    expect(median(at30)).toBeLessThanOrEqual(0.6);
    expect(median(at60)).toBeLessThanOrEqual(0.36);
    expect(thick / seeds).toBeGreaterThanOrEqual(0.4);
    expect(twoOrSunk / seeds).toBeGreaterThanOrEqual(0.25);
    expect(defects / landed).toBeLessThanOrEqual(0.2);
    expect(median(chains100)).toBeLessThanOrEqual(4);
    expect(median(forks100)).toBeGreaterThanOrEqual(Math.max(3, median(forks30) + 1));
    expect(onTorso / landed).toBeGreaterThanOrEqual(0.2);
  });
});
