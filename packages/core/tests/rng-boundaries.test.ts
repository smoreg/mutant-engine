import { expect, it } from "vitest";
import { SeededRng } from "../rng.js";

it("never picks zero-weight entries, including an exact zero draw", () => {
  const rng = new SeededRng(1);
  rng.next = () => 0;
  expect(rng.weighted({ impossible: 0, certain: 1 })).toBe("certain");
});
it("rejects invalid distributions without consuming randomness", () => {
  for (const weights of [{}, { a: 0 }, { a: -1, b: 2 }, { a: NaN }, { a: Infinity }, { a: Number.MAX_VALUE, b: Number.MAX_VALUE }]) {
    const rng = new SeededRng(1), before = rng.state;
    expect(() => rng.weighted(weights as Record<string, number>)).toThrow(RangeError);
    expect(rng.state).toEqual(before);
  }
});
it("rejects invalid integer ranges and dice instead of returning nonsense or looping forever", () => {
  const rng = new SeededRng(2), before = rng.state;
  for (const [lo, hi] of [[2,1], [0.5,2], [0,Infinity], [NaN,2], [-Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER]]) {
    expect(() => rng.int(lo!,hi!)).toThrow(RangeError);
  }
  expect(() => rng.die(0)).toThrow(RangeError);
  for (const n of [-1, 0.5, Infinity, NaN]) expect(() => rng.roll(n,6)).toThrow(RangeError);
  expect(rng.state).toEqual(before);
});
it("resumes the exact stream and keeps forks independent of their parent", () => {
  const rng = new SeededRng("replay");
  rng.next();
  const copy = new SeededRng(rng.state), before = rng.state;
  const fork = rng.fork(9);
  fork.roll(5,6);
  expect(rng.state).toEqual(before);
  expect(Array.from({length:100},()=>rng.next())).toEqual(Array.from({length:100},()=>copy.next()));
});
