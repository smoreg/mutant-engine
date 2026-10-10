/**
 * Who beats whom, over seeds: the duel share, the crowd threshold and the
 * matrix of the sanity stand. Every fight is `runBattle` through `bench.ts`;
 * this file only names the sides by source string (`source.ts`).
 */
import { LabRng as Rng } from "../rng.js";
import { LEFT, RIGHT, threshold, wall, type BenchOptions } from "./bench.js";
import { one } from "./source.js";

export const makeRng = (seed: number): Rng => new Rng(seed);

export interface Share {
  a: string;
  b: string;
  n: number;
  m: number;
  seeds: number;
  first: number;
  winsA: number;
  winsB: number;
  none: number;
  /** Share of the seeds `n` of A won against `m` of B. */
  share: number;
  turns: number;
}

/** `n` of A against `m` of B over `seeds` seeds from `first`. */
export function share(a: string, b: string, o: { n?: number; m?: number; seeds?: number; first?: number } & BenchOptions = {}): Share {
  const n = o.n ?? 1;
  const m = o.m ?? 1;
  const seeds = o.seeds ?? 200;
  const first = o.first ?? 1;
  const w = wall(one(a), one(b), n, m, makeRng, { ...o, seeds, first });
  const winsA = w.wins[LEFT] ?? 0;
  return { a, b, n, m, seeds, first, winsA, winsB: w.wins[RIGHT] ?? 0, none: w.none, share: winsA / seeds, turns: w.turns.median };
}

/** Fewest of A that beat one B in at least half the seeds; null past the cap. */
export function crowd(a: string, b: string, o: { seeds?: number; first?: number; cap?: number } = {}): { count: number | null; blunt: boolean; probes: { m: number; share: number }[] } {
  const t = threshold(one(a), one(b), makeRng, { seeds: o.seeds ?? 30, first: o.first, cap: o.cap ?? 64 });
  return { count: t.count, blunt: t.blunt, probes: t.probes };
}

/** Every source against every other: the share of the row over the column. */
export function matrix(ids: readonly string[], o: { seeds?: number; first?: number } = {}): string {
  const lines = [["A\\B", ...ids].join("\t")];
  for (const a of ids) {
    lines.push([a, ...ids.map((b) => (a === b ? "-" : share(a, b, o).share.toFixed(2)))].join("\t"));
  }
  return lines.join("\n");
}
