/**
 * Diet (decision 1253): what a body ate stays in its flesh for a while and
 * pulls its mutations toward itself. Eat eyes over and over and you grow
 * eyes. The memory is `Body.eaten`, part kind to amount. `eatParts` adds to it,
 * `dietTick` halves it every `DIET.halfLife` turns (`elapse` calls it), and
 * `dietFactor` scales the weight of a row in the draw by what the row grows:
 * min(cap, 1 + k x the amount eaten of the kinds it grows). Rations are
 * faceless and never reach it: only a corpse or a piece of one has parts.
 */
import type { Body, Eatable, Organ } from "./graph.js";
import { isChrome, organs } from "./parts.js";
import { rowKinds } from "./spread.js";
import type { Mutation } from "./mutation.js";

export const DIET = {
  /** A row weighs x (1 + k x the amount eaten of what it grows). */
  k: 0.5,
  /** ...never more than this. */
  cap: 4,
  /** Turns in which the memory of a meal halves: one day of the yard. */
  halfLife: 100,
  /** Below this a kind is forgotten and its key goes. */
  floor: 0.05,
};

const FADE = 0.5 ** (1 / DIET.halfLife);

/** Four decimals: the text and the hash write the number as it is, and it stays short. */
function round(v: number): number {
  return Math.round(v * 1e4) / 1e4;
}

/** The body ate these parts, `amount` of each (a share of a corpse is less than one). */
export function eatParts(body: Body, parts: readonly Eatable[], amount = 1): void {
  if (!(amount > 0) || parts.length === 0) return;
  const eaten = (body.eaten ??= {});
  for (const k of parts) eaten[k] = round((eaten[k] ?? 0) + amount);
}

/** One turn of forgetting: every kind fades by the half-life, and what falls under the floor goes. */
export function dietTick(body: Body): void {
  const eaten = body.eaten;
  if (eaten === undefined) return;
  for (const k of Object.keys(eaten) as Eatable[]) {
    const v = round(eaten[k]! * FADE);
    if (v < DIET.floor) delete eaten[k];
    else eaten[k] = v;
  }
  if (Object.keys(eaten).length === 0) delete body.eaten;
}

/** What a corpse tastes of, part by part: its organs (a head with what it holds), its limbs, its covers but skin and chrome, its membranes. Chrome is not food. */
export function tasteOf(corpse: Body): Eatable[] {
  const out: Eatable[] = [];
  const org = (o: Organ): void => {
    if (!isChrome(o)) out.push(o.kind);
  };
  for (const o of organs(corpse)) org(o);
  for (const s of Object.values(corpse.segments)) {
    if (s.kind === "flank") continue;
    out.push(s.kind);
    if (s.cover !== "skin" && s.cover !== "chrome") out.push(s.cover);
  }
  for (const m of Object.values(corpse.membranes)) out.push(m.kind);
  return out;
}

/** How much what the body ate pulls this row in the draw: 1 when it ate nothing the row grows. */
export function dietFactor(body: Body, m: Mutation): number {
  const eaten = body.eaten;
  if (eaten === undefined) return 1;
  let n = 0;
  for (const k of rowKinds(m)) n += eaten[k] ?? 0;
  return n === 0 ? 1 : Math.min(DIET.cap, 1 + DIET.k * n);
}
