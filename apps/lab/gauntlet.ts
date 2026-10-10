/**
 * The gauntlet: one creature walks a line of foes (`foes.ts`) until something
 * kills it. It fights one foe, eats what is left of it, rests a while to knit,
 * and goes on to the next. Its score is how many it got through - that is what
 * tells a creature that is too strong from one that is too weak.
 *
 * No rules of its own, and no second engine: one fight is `newBattle` and
 * `stepBattle` of `packages/core/battle.ts` (which itself plans by `volley` and
 * lands by `strike` of the damage track), and what happens between fights -
 * the meal, the bandage, the rest - is `feed` and `elapse` (which binds and
 * rests on `packages/core/time.ts`). This file holds only the
 * walk down the line. Seeded throughout: the same seed is the same walk.
 * No DOM here.
 */
import {
  BATTLE,
  bloodMax,
  cloneBody,
  derive,
  feed,
  livingMass,
  newBattle,
  newHarm,
  stepBattle,
  elapse,
  type Body,
  type DeathCause,
  type Harm,
  type Rng,
  LabRng,
} from "@mutant-engine/core";
import { eatParts, foeBody, foeById, lineById, tasteOf, type FoeLine } from "@mutant-engine/core";

/** Turns of rest between two fights: the body knits what it can pay for. */
export const REST_TURNS = 40;
/** A fight that runs this long is a stalemate: neither can hurt the other. */
export const MAX_TURNS = BATTLE.maxTurns;
/** The sides of one fight of the walk. */
export const MINE = "mine";
export const THEIRS = "theirs";
/** What a corpse feeds, inside the band of meat in `hunger.md` (120..300 a meal). */
export const MEAL_MIN = 120;
export const MEAL_MAX = 300;

interface GauntletOptions {
  /** The line of foes; the first line of `FOE_LINES` when absent. */
  line?: string;
  /** Cells to the foe, as on the strike tab. */
  distance?: number;
  rest?: number;
  maxTurns?: number;
}

interface FightResult {
  foe: string;
  /** The foe went down and the creature walked away: a mutual kill is not a win. */
  won: boolean;
  /** Actions the fight took, both sides together. */
  acts: number;
  /** Turns of the damage track the creature lived through this fight. */
  turns: number;
}

export interface GauntletResult {
  line: string;
  /** Foes beaten in a row before it died or the line ran out. */
  beaten: number;
  /** It walked the whole line alive. */
  survived: boolean;
  /** What killed it, `null` when it lived. */
  dead: DeathCause | null;
  /** Blood left of its own, 0..1. */
  blood: number;
  turns: number;
  fights: FightResult[];
}

/** What one corpse feeds the creature that ate it: its living mass, inside the band of a meal. */
export function mealOf(corpse: Body): number {
  return Math.round(Math.max(MEAL_MIN, Math.min(MEAL_MAX, livingMass(corpse))));
}

/** The element losing the most blood: the model's own reading since decision 1230. */
export { worstBleed } from "@mutant-engine/core";

/** The creature as it walks: one body and one record of wounds carried from fight to fight. */
interface Walker {
  body: Body;
  harm: Harm;
}

/**
 * One fight of the walk, run by `battle.ts` and nothing else: the creature on
 * one side, the foe on the other, to the death, because the creature eats what
 * it beat. The creature walks in with the wounds of the last fight - that is
 * `FighterSpec.harm` (decision 423), not a hand put into the fight - and walks
 * out with the body and the record the fight wounded.
 */
function fight(me: Walker, foe: Body, distance: number, maxTurns: number, rng: Rng): { won: boolean; acts: number; turns: number } {
  const b = newBattle({
    fighters: [
      { id: "me", side: MINE, body: me.body, harm: me.harm },
      { id: "foe", side: THEIRS, body: foe },
    ],
    options: { distance, maxTurns, toDeath: true },
  });
  const was = me.harm.turn;
  while (b.result === null) stepBattle(b, rng);
  const mine = b.fighters[0]!;
  me.body = mine.body;
  me.harm = mine.harm;
  return { won: b.result.winner === MINE, acts: b.result.acts, turns: me.harm.turn - was };
}

/**
 * The walk: fight, eat, rest, next. The creature's body is cloned, so the card
 * that grew it keeps its own; the foes are fresh fixtures every time.
 */
export function gauntlet(base: Body, seed: number, opts: GauntletOptions = {}): GauntletResult {
  const line: FoeLine = lineById(opts.line);
  const distance = opts.distance ?? 1;
  const rest = opts.rest ?? REST_TURNS;
  const maxTurns = opts.maxTurns ?? MAX_TURNS;
  const rng = new LabRng(`gauntlet:${line.id}:${seed}`);
  const body = cloneBody(base);
  const me: Walker = { body, harm: newHarm(body) };
  const fights: FightResult[] = [];
  let beaten = 0;
  for (const id of line.foes) {
    const corpse = foeBody(foeById(id));
    // The battle's own side won it, and the creature is still standing: they killed each other is not a win.
    const r = fight(me, corpse, distance, maxTurns, rng);
    const won = r.won && me.harm.dead === null;
    fights.push({ foe: id, won, acts: r.acts, turns: r.turns });
    if (!won) break;
    beaten += 1;
    // The corpse is meat: a body with nothing to eat with gets nothing out of it.
    if (derive(me.body).eat.can) {
      feed(me.harm, mealOf(corpse));
      eatParts(me.body, tasteOf(corpse));
    }
    // The rest: a body with a grip binds its worst wound a turn, everyone knits what the reserve pays for.
    for (let i = 0; i < rest && me.harm.dead === null; i++) elapse(me.body, rng, { harm: me.harm, upkeep: true, rest: true, bind: true });
    if (me.harm.dead !== null) break;
  }
  return {
    line: line.id,
    beaten,
    survived: me.harm.dead === null && beaten === line.foes.length,
    dead: me.harm.dead,
    blood: Math.max(0, Math.min(1, me.harm.blood / Math.max(1, bloodMax(me.body)))),
    turns: me.harm.turn,
    fights,
  };
}
