/**
 * The abyss at the ceiling pushes out the lightest organs first, and before
 * this the eyes and the feet were the lightest: ten humans after 300 mixed
 * mutations were blind in seven cases of ten and could not walk in eight
 * (decision 115). The last eye and the last ending that stands are vital now,
 * like the last heart and the last mouth: the abyss may take every eye but
 * one, and every foot but one.
 */
import { describe, expect, it } from "vitest";
import { derive, human, isVital, organs, type Body, type Organ, run, type LabState } from "../index.js";
import { ORGANS } from "../parts.js";
import { randomSet, stateOf } from "../../../apps/lab/mutator/model.js";

const EYES = new Set(["eye", "facetEye"]);

function eyes(b: Body): Organ[] {
  return [...organs(b)].filter((o) => EYES.has(o.kind));
}

function standing(b: Body): Organ[] {
  const out: Organ[] = [];
  for (const id of Object.keys(b.nodes)) for (const e of b.nodes[Number(id)]!.ends) if ((ORGANS[e.kind].stand ?? 0) > 0) out.push(e);
  return out;
}

describe("the last eye and the last stand", () => {
  it("a human's two eyes are not vital, the one left after the other goes is", () => {
    const b = human();
    const [a, c] = eyes(b);
    expect(a).toBeDefined();
    expect(isVital(b, a!)).toBe(false);
    // Take the second eye out of wherever it sits.
    for (const o of organs(b)) if (o.contents?.includes(c!)) o.contents.splice(o.contents.indexOf(c!), 1);
    expect(eyes(b)).toHaveLength(1);
    expect(isVital(b, a!)).toBe(true);
  });

  it("a human's two feet are not vital, the one left is", () => {
    const b = human();
    const feet = standing(b);
    expect(feet.length).toBe(2);
    expect(isVital(b, feet[0]!)).toBe(false);
    for (const id of Object.keys(b.nodes)) {
      const ends = b.nodes[Number(id)]!.ends;
      if (ends.includes(feet[1]!)) ends.splice(ends.indexOf(feet[1]!), 1);
    }
    expect(isVital(b, feet[0]!)).toBe(true);
  });

  it("the abyss never pushes out the last eye or the last foot: 20 humans x 300 mixed mutations", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const state: LabState = stateOf(seed, randomSet(seed, 300));
      const r = run(state);
      for (const st of r.steps) {
        const e = st.event;
        if (e.kind !== "mutate" || e.result === null || st.before === null) continue;
        const outEyes = e.result.displaced.filter((o) => EYES.has(o.kind)).length;
        if (outEyes > 0) expect(eyes(st.before).length - outEyes, `seed ${seed} step ${st.index}: the last eye went`).toBeGreaterThanOrEqual(1);
        const outFeet = e.result.displaced.filter((o) => (ORGANS[o.kind].stand ?? 0) > 0).length;
        if (outFeet > 0) expect(standing(st.before).length - outFeet, `seed ${seed} step ${st.index}: the last foot went`).toBeGreaterThanOrEqual(1);
      }
    }
  }, 120_000);

  it("after 300 mixed mutations most bodies still see and still walk", () => {
    let seeing = 0;
    let walking = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const b = run(stateOf(seed, randomSet(seed, 300)), { light: true }).body;
      const d = derive(b);
      if (d.senses.sight) seeing += 1;
      if (d.speed.value > 0) walking += 1;
    }
    expect(seeing).toBeGreaterThanOrEqual(16);
    expect(walking).toBeGreaterThanOrEqual(12);
  }, 120_000);
});
