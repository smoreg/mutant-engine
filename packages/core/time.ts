/**
 * Time: one turn of everything a turn does to a body, in one call and in one
 * fixed order (decision 1230).
 *
 * 1. The flesh. With a record of wounds it is `turn` of `damage.ts` - upkeep
 *    and hunger, bleeding and clotting, venom, wounds ageing, blood by the
 *    graph, sickness, healing - and then its air (`breathe`, decisions 1277, 1294):
 *    the rest and whatever the turn's actions owed it (`exert`). Without one it is `tick` of `cut.ts`: wounds
 *    age and the blood runs, nothing is fed and nothing heals. A body that
 *    asks to bind binds its worst bleed first, when it has a hand to do it.
 * 2. A wandering ending crawls (`wanderTick`, grow.ts).
 * 3. A cover creeps (`coverTick`, spread.ts §11).
 * 4. A tumour presses its neighbours (`contagionTick`).
 * 5. Flesh that remembers a lost part grows it back (`regrowTick`).
 * 6. What the body ate fades (`dietTick`, decision 1253).
 *
 * Every clock of the model moves here and nowhere else: the lab, the evening
 * of the yard, the rest in the field and the turns of a fight all call this,
 * so there is one clock and not four copies of it. The only chance is `rng`.
 * A dead body does not age.
 */
import type { Body } from "./graph.js";
import { tick as bloodTick, type IschemiaEvents } from "./cut.js";
import { bandage, breathe, stable, turn, worstBleed, type Harm, type HarmEvent } from "./damage.js";
import { derive } from "./derive.js";
import { dietTick } from "./diet.js";
import { regrowTick, wanderTick, type Wandered } from "./grow.js";
import { contagionTick, coverTick, type Crept } from "./spread.js";
import type { Rng } from "./rng.js";

interface ElapseOptions {
  /** The record of wounds the turn is lived on; without one only the blood runs. */
  harm?: Harm;
  /** The body burns its upkeep from the reserve; on unless said otherwise, as in `turn`. */
  upkeep?: boolean;
  /** Resting in a safe place: `TurnOptions.rest`. */
  rest?: boolean;
  /** Knitting: `TurnOptions.knit`. */
  knit?: boolean;
  /** Binds its worst bleed before the turn, if it has a grip to bind with. */
  bind?: boolean;
  /** The mass a creeping cover or a regrown part stops at; the skeleton's ceiling when absent. */
  ceiling?: number;
}

interface Elapsed {
  /** What `damage.ts` said, the bandage first; empty without a record of wounds. */
  events: HarmEvent[];
  /** What the blood did, when there was no record of wounds to say it in `events`. */
  ischemia: IschemiaEvents | null;
  wandered: Wandered[];
  crept: Crept[];
  /** Elements whose organs a tumour pressed. */
  pressed: number[];
  /** Ids made by each part that grew back. */
  regrown: number[][];
}

/** A clock that can move an organ from one place to another: the record of wounds has to follow it. */
function moves(body: Body): boolean {
  if (body.regrowth !== undefined && body.regrowth.length > 0) return true;
  for (const n of Object.values(body.nodes)) for (const o of n.ends) if (o.wander !== undefined && o.wander > 0) return true;
  return false;
}

/** One turn of time over the body. */
export function elapse(body: Body, rng: Rng, opts: ElapseOptions = {}): Elapsed {
  const out: Elapsed = { events: [], ischemia: null, wandered: [], crept: [], pressed: [], regrown: [] };
  const harm = opts.harm;
  if (harm !== undefined) {
    if (harm.dead !== null) return out;
    if (opts.bind === true && derive(body).grips.total > 0) {
      const wound = worstBleed(body, harm);
      if (wound !== null) out.events.push(...bandage(body, harm, wound));
    }
    out.events.push(...turn(body, harm, { upkeep: opts.upkeep !== false, rest: opts.rest === true, knit: opts.knit === true }, rng));
    if (harm.dead !== null) return out;
    const b = derive(body).breath;
    breathe(harm, { intake: Math.max(b.intake.air, b.intake.water), base: b.base, tank: b.tank.common, delivery: b.delivery }, out.events);
    if (harm.dead !== null) return out;
  } else {
    out.ischemia = bloodTick(body);
  }
  const drift = (): void => {
    out.wandered = wanderTick(body, rng);
    out.crept = opts.ceiling === undefined ? coverTick(body) : coverTick(body, opts.ceiling);
    out.pressed = contagionTick(body);
    out.regrown = opts.ceiling === undefined ? regrowTick(body) : regrowTick(body, opts.ceiling);
  };
  if (harm !== undefined && moves(body)) stable(body, harm, drift);
  else drift();
  dietTick(body);
  return out;
}
