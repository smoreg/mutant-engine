/**
 * What it costs to keep a body: read off the body and nothing else. The
 * upkeep of `budgets.ts` over the flesh the blood still reaches is what the
 * body burns a turn (`damage.ts` burns exactly that), and the reserve it can
 * carry is that upkeep over `BELLY_TURNS` turns - the twenty turns without
 * food of docs/hunger.md. So a body that grew six limbs and three heads eats
 * for six limbs and three heads without a line of arithmetic here, and a limb
 * cut off from the heart stops costing anything the turn it dies.
 *
 * There is no hunger counter in this file. Food goes into the reserve through
 * `feed` and hunger happens inside `turn`, where it already lives.
 */
import { upkeep } from "./budgets.js";
import { feed, type Harm, type HarmEvent } from "./damage.js";
import type { Body } from "./graph.js";
import { bloodReach } from "./metrics.js";
import type { Rng } from "./rng.js";
import { elapse } from "./time.js";

/** A body and the record of wounds kept beside it. */
export interface Kept {
  body: Body;
  harm: Harm;
}

/** Turns of its own upkeep a body carries as reserve. A fresh human: 20 x 20 = the `START_RESERVE` of damage.ts. */
export const BELLY_TURNS = 20;

/** What the body burns in a turn. */
export function burnOf(body: Body): number {
  return upkeep(body, bloodReach(body));
}

/** The reserve the body can hold. */
export function bellyOf(body: Body): number {
  return burnOf(body) * BELLY_TURNS;
}

/** What the body would take right now: enough to fill it up, never more. A reserve gone negative asks for the difference. */
export function rationOf(f: Kept): number {
  return Math.max(0, bellyOf(f.body) - f.harm.reserve);
}

/** What a group of bodies would take this turn, body by body, if the stores were bottomless. */
export function rations(fighters: readonly Kept[]): number {
  let total = 0;
  for (const f of fighters) total += rationOf(f);
  return total;
}

/**
 * One turn of a kept body: it takes its ration out of what is on hand, never
 * more than `food`, and then lives the turn through `elapse`. What it took is
 * `fed`; whoever holds the stores takes that much out of them.
 */
export function liveTurn(k: Kept, rng: Rng, opts: { food: number; rest: boolean }): { fed: number; events: HarmEvent[] } {
  const events: HarmEvent[] = [];
  const fed = Math.min(rationOf(k), opts.food);
  if (fed > 0) events.push(...feed(k.harm, fed));
  events.push(...elapse(k.body, rng, { harm: k.harm, rest: opts.rest }).events);
  return { fed, events };
}
