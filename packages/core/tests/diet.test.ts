/**
 * What a body ate pulls its mutations toward itself for a while (decision
 * 1253): eat eyes and the rows that grow eyes weigh more, and the memory
 * fades with time. Rations are faceless and leave nothing.
 */
import { describe, expect, it } from "vitest";
import {
  DIET,
  MUTATIONS,
  bodyFromText,
  bodyHash,
  bodyToText,
  cloneBody,
  decodeCommand,
  dietFactor,
  drawMutation,
  eatParts,
  elapse,
  encodeCommand,
  human,
  initialState,
  LabRng,
  liveTurn,
  newHarm,
  rowKinds,
  run,
  tasteOf,
  type Body,
  type Mutation,
} from "../index.js";

const SEEDS = 200;

function growsEyes(m: Mutation): boolean {
  return rowKinds(m).includes("eye");
}

/** Share of the draws over the seeds that grow an eye. */
function eyeShare(body: Body): number {
  let n = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const m = drawMutation(MUTATIONS, new LabRng(`diet:${seed}`), { body });
    if (m !== null && growsEyes(m)) n += 1;
  }
  return n / SEEDS;
}

function draws(body: Body): string[] {
  const out: string[] = [];
  for (let seed = 1; seed <= SEEDS; seed++) out.push(drawMutation(MUTATIONS, new LabRng(`diet:${seed}`), { body })?.id ?? "-");
  return out;
}

describe("diet", () => {
  it("a fresh body remembers nothing, and eating writes what was eaten", () => {
    const b = human();
    expect(b.eaten).toBeUndefined();
    eatParts(b, ["eye", "eye", "hand"]);
    expect(b.eaten).toEqual({ eye: 2, hand: 1 });
    eatParts(b, ["eye"], 0.5);
    expect(b.eaten!.eye).toBe(2.5);
  });

  it("a row that grows what was eaten weighs more, one formula with a cap", () => {
    const b = human();
    const extraEye = MUTATIONS.find((m) => m.id === "extraEye")!;
    const tentacle = MUTATIONS.find((m) => m.id === "tentacle")!;
    expect(dietFactor(b, extraEye)).toBe(1);
    eatParts(b, ["eye", "eye"]);
    expect(dietFactor(b, extraEye)).toBeCloseTo(1 + DIET.k * 2);
    expect(dietFactor(b, tentacle)).toBe(1);
    eatParts(b, Array(100).fill("eye"));
    expect(dietFactor(b, extraEye)).toBe(DIET.cap);
  });

  it("eating eyes makes eyes a clearly larger share of the draws over 200 seeds", () => {
    const control = eyeShare(human());
    const fed = human();
    eatParts(fed, Array(6).fill("eye"));
    const after = eyeShare(fed);
    expect(control).toBeGreaterThan(0);
    expect(after).toBeGreaterThan(control * 1.8);
  });

  it("the memory fades with time: after the turns without food it is gone and the draws are the control's", () => {
    const fed = human();
    eatParts(fed, Array(6).fill("eye"));
    const rng = new LabRng("diet:time");
    elapse(fed, rng);
    expect(fed.eaten!.eye).toBeLessThan(6);
    for (let t = 0; t < DIET.halfLife * 10; t++) elapse(fed, rng);
    expect(fed.eaten).toBeUndefined();
    expect(draws(fed)).toEqual(draws(human()));
  });

  it("half of it goes in a half-life", () => {
    const b = human();
    eatParts(b, ["eye"], 4);
    const rng = new LabRng("diet:half");
    for (let t = 0; t < DIET.halfLife; t++) elapse(b, rng);
    expect(b.eaten!.eye).toBeCloseTo(2, 1);
  });

  it("rations are faceless: a fed turn leaves no memory", () => {
    const b = human();
    const k = { body: b, harm: newHarm(b) };
    k.harm.reserve = 0;
    const r = liveTurn(k, new LabRng("diet:ration"), { food: 1000, rest: false });
    expect(r.fed).toBeGreaterThan(0);
    expect(b.eaten).toBeUndefined();
  });

  it("the taste of a corpse is its parts: organs with what a head holds, limbs, covers other than skin, membranes", () => {
    const t = tasteOf(human());
    expect(t.filter((k) => k === "eye")).toHaveLength(2);
    expect(t.filter((k) => k === "hand")).toHaveLength(2);
    expect(t).toContain("heart");
    expect(t).toContain("arm");
    expect(t).not.toContain("skin");
    expect(t).not.toContain("flank");
  });

  it("the memory is in the text and the hash, with an exact round trip; a body that ate nothing writes nothing", () => {
    const plain = human();
    expect(bodyToText(plain)).not.toContain("съедено");
    const b = cloneBody(plain);
    eatParts(b, ["eye", "eye", "tentacle", "smallBrain"], 1.25);
    const text = bodyToText(b);
    expect(text).toContain("съедено глаз 2.5");
    expect(text).toContain("съедено малый мозг 1.25");
    const back = bodyFromText(text);
    expect(back.eaten).toEqual(b.eaten);
    expect(bodyToText(back)).toBe(text);
    expect(bodyHash(back)).toBe(bodyHash(b));
    expect(bodyHash(b)).not.toBe(bodyHash(plain));
    const faded = cloneBody(b);
    elapse(faded, new LabRng("diet:text"));
    expect(bodyToText(bodyFromText(bodyToText(faded)))).toBe(bodyToText(faded));
  });

  it("is deterministic by seed", () => {
    const a = human();
    const b = human();
    eatParts(a, ["eye", "eye", "eye"]);
    eatParts(b, ["eye", "eye", "eye"]);
    expect(draws(a)).toEqual(draws(b));
  });

  it("the lab eats a part by a command that round-trips through the #hash", () => {
    const cmd = decodeCommand("f.eye.3");
    expect(cmd).toEqual({ t: "eat", part: "eye", n: 3 });
    expect(encodeCommand(cmd!)).toBe("f.eye.3");
    expect(decodeCommand("f.nothing.3")).toBeNull();
    const r = run({ ...initialState(), commands: [cmd!] });
    expect(r.body.eaten).toEqual({ eye: 3 });
  });
});
