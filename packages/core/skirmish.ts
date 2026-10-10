/**
 * A meeting in the open: a few bodies against one, to the death, run by
 * `battle.ts` and nothing else, and the readings of a body a walk needs
 * between two of them - what a corpse feeds, how much blood is left, whether
 * it can still get itself home.
 */
import { capabilities } from "./capability.js";
import { newBattle, stepBattle } from "./battle.js";
import { bloodMax, type Harm } from "./damage.js";
import { derive } from "./derive.js";
import type { Body } from "./graph.js";
import { livingMass } from "./metrics.js";
import type { Rng } from "./rng.js";

/** What a corpse feeds, inside the band of meat in `hunger.md` (120..300 a meal). */
export const MEAL_MIN = 120;
export const MEAL_MAX = 300;

/** What one corpse feeds the body that ate it: its living mass, inside the band of a meal. */
export function mealOf(corpse: Body): number {
  return Math.round(Math.max(MEAL_MIN, Math.min(MEAL_MAX, livingMass(corpse))));
}

/** Blood left of its own, 0..1. */
export function bloodShare(body: Body, harm: Harm): number {
  return Math.max(0, Math.min(1, harm.blood / Math.max(1, bloodMax(body))));
}

/**
 * It can still get itself home: one support, or it climbs, or it flies
 * (body.md §7), or it crawls (decision 1238).
 */
export function canWalk(body: Body): boolean {
  const caps = capabilities(body);
  const d = derive(body);
  return caps.stand > 0 || caps.climb || d.locomotion.fly || d.speed.crawl;
}

/** One body of a side: its place in the side, its flesh and its wounds. Both are replaced by what the fight left. */
interface Skirmisher {
  n: number;
  body: Body;
  harm: Harm;
}

const MINE = "mine";
const THEIRS = "theirs";

/**
 * One meeting: your side on one side, the foe on the other, to the death,
 * because the body eats what it beat. Your side is one body or several - the
 * library has fought several bodies since it was written (decision 731).
 *
 * The fight takes the wounds each body walks in with (`FighterSpec.harm`,
 * decision 423), copies what it is given and never writes into it, so every
 * member takes back the body and the record the fight actually wounded.
 */
export function skirmish(mine: readonly Skirmisher[], foe: Body, distance: number, maxTurns: number, rng: Rng): { won: boolean; acts: number } {
  const b = newBattle({
    fighters: [
      ...mine.map((m) => ({ id: `me${m.n}`, side: MINE, body: m.body, harm: m.harm })),
      { id: "foe", side: THEIRS, body: foe },
    ],
    options: { distance, maxTurns, toDeath: true },
  });
  while (b.result === null) stepBattle(b, rng);
  for (const m of mine) {
    // By id and not by index: a part that comes off a body joins the list mid-fight.
    const stood = b.fighters.find((f) => f.id === `me${m.n}`);
    if (stood === undefined) continue;
    m.body = stood.body;
    m.harm = stood.harm;
  }
  return { won: b.result.winner === MINE, acts: b.result.acts };
}
