import { expect, it } from "vitest";
import { drawWeighted } from "../grow.js";
import { drawMutation } from "../mutation.js";
import { BASE_MUTATIONS, checkMutations } from "../content/mutations.js";

it("does not invent a target when every weight is zero", () => {
  let draws=0;
  expect(drawWeighted([{target:{node:1},weight:0}], {next:()=>{draws++;return 0;}})).toBeNull();
  expect(draws).toBe(0);
});
it("rejects non-finite and negative target weights before drawing", () => {
  for (const weight of [-1, NaN, Infinity]) {
    expect(()=>drawWeighted([{target:{node:1},weight}], {next:()=>{throw Error("consumed RNG");}})).toThrow(RangeError);
  }
});
it("rejects infinite catalog chances and never draws a zero-chance row", () => {
  const base=BASE_MUTATIONS[0]!;
  expect(checkMutations([{...base,chance:Infinity}]).some(p=>p.includes("chance"))).toBe(true);
  expect(drawMutation([{...base,chance:0}],{next:()=>0})).toBeNull();
});
