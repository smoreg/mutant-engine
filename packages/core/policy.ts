/**
 * What a fighter decides on its turn, battle.md §3. A policy is a pure
 * function of one snapshot - itself, its side, the enemies it may hit, the
 * heads it could shed - and it returns one action. Nothing here touches a
 * body: the battle builds the view, the policy only reads it, so a test can
 * hand the battle a policy of two lines and the bots of the arena can read
 * the same rows.
 *
 * The policy that ships is a table of weights, not a chain of ifs: a target
 * is scored by what it gives, what it threatens, how close it is to falling
 * and how far away it stands, and the rows of `AIMS` are what makes a brute
 * different from a hunter. A new temper is a row, not a branch.
 */
import type { BrainRef } from "./graph.js";
import type { Fate } from "./cut.js";
import type { Profile } from "./damage.js";

export type FighterId = string;
export type SideId = string;

/** One fighter as another one sees it. */
export interface Sight {
  id: FighterId;
  side: SideId;
  /** A part that left a body mid-battle: it strikes, nothing strikes it. */
  severed: boolean;
  conscious: boolean;
  /** Cells between the two; 1 is adjacent. */
  distance: number;
  /** Mean defense, what a strike expects. */
  armor: number;
  dodge: number;
  /** Blood left of what it holds, 0..1. */
  blood: number;
  mass: number;
  /**
   * Mass the blood still reaches: what counts as the organism, and what a
   * target weighs when two of them stand there (`arena.md` А12,
   * decision 437). `mass` beside it is the whole of the flesh, dead limbs
   * carried along with it.
   */
  living: number;
  /** Damage per 100 energy the one who looks would do to it; 0 when nothing reaches. */
  gain: number;
  /** Damage per 100 energy it would do back. */
  threat: number;
  /** Turns it has left on the blood it carried; null while it has a heart. */
  lifetime: number | null;
}

/** A foreign brain that could be cut loose, with what would leave with it. */
export interface ShedOption {
  brain: BrainRef;
  /** `n<node>.<end>` or `s<segment>.<slot>`, as `brains()` keys them. */
  key: string;
  fate: Fate;
  /** Strikes the leaving body would have. */
  strikes: number;
  /** Turns it would live on the blood it carries; null when it leaves with a heart. */
  lifetime: number | null;
  mass: number;
}

export interface View {
  self: Sight;
  /** Everyone else of your side, severed parts included. */
  allies: Sight[];
  /** Everyone of another side you are allowed to strike. */
  foes: Sight[];
  shed: ShedOption[];
  /** Turns elapsed, and the energy behind them; a turn is 100. */
  turn: number;
  time: number;
}

export type Action =
  /**
   * Where the volley goes on the target is the order's to say, not the blow's
   * (damage.md §6, decision 434): `random` by the openness of the body when
   * nobody says, `wound` to finish what already bleeds, `low` for what stands
   * near the ground, `aimed`/`at` for a named element. A temper that does not
   * think about it leaves both out and strikes as every strike struck before.
   */
  | { k: "strike"; target: FighterId; profile?: Profile; aim?: number }
  | { k: "shed"; brain: BrainRef }
  | { k: "wait" };

export type Policy = (view: View) => Action;

/**
 * The weights of the policy that ships. Every one multiplies a reading of the
 * target that is already in the view, so a temper is a row of numbers.
 *
 * Every reading is a share of one, and the row means what it looks like
 * (decision 594). `gain` and `threat` used to enter raw, in damage per 100
 * energy - tens on an ordinary body - beside three readings that were shares.
 * At weights of about one that made `gain` the thing that decided and the rest
 * near-tie breakers, and `mass: 3` could not move a gap of 7.6 in `gain`: a
 * troll fighter read 8.70 against a hydra, a bare human escort 16.28, so the
 * blows went to whatever was softest and **no weight could move them** - not to
 * the mountain of meat the row was asking for, not anywhere. Now each reading is
 * divided by the best of it on the sand, the way `mass` was already divided by
 * the heaviest, and a weight of 3 against a weight of 1 means three times as
 * much - which is the only reason to write a table of weights instead of a
 * chain of ifs.
 *
 * The row is therefore read as a ranking, not as a unit: the leading weight of
 * a temper is what that temper is about, and the small ones are what it
 * consults when the leader ties.
 */
export interface Aim {
  /** What you would do to it against the most you could do to anyone, 0..1. */
  gain: number;
  /** What it would do to you against the worst on the sand, 0..1: raise it to kill the dangerous first. */
  threat: number;
  /** How far it already is from standing: `1 - blood`. */
  weak: number;
  /** Nearness, `1 / distance`. */
  near: number;
  /**
   * The bulk of it against the biggest thing it could hit instead, 0..1: the
   * rule of the mountain of meat raised a level (`arena.md` А12,
   * decision 437). Raise it and a big body draws the blows, which is what lets
   * a servant be led out as meat to soak them. With one target in front of you
   * the weight costs nothing either way.
   */
  mass: number;
  /** Shed a head when what leaves still strikes and lives at least this many turns; null: never. */
  shed: number | null;
}

/**
 * The tempers that ship. One reading leads each row and the rest break its
 * ties, so what a temper is can be read off the table: the leader is three
 * against the ones at a half and the one at a quarter (decision 595).
 *
 * `near` sits at 1 on every row on purpose. On a sand where everyone stands
 * adjacent it is the same constant for every target and decides nothing; it
 * earns its keep only when something stands further off, and then it is worth
 * a third of a leading weight - enough to prefer what is in reach, never
 * enough to overrule what the temper is for.
 */
export const AIMS = {
  /** Hits whatever it hurts most and never lets go of a head. */
  brute: { gain: 3, threat: 0, weak: 0.5, near: 1, mass: 0, shed: null },
  /** Finishes the one already bleeding. */
  hunter: { gain: 1, threat: 0.25, weak: 3, near: 1, mass: 0, shed: null },
  /** Takes the dangerous one down first. */
  wary: { gain: 1, threat: 3, weak: 0.5, near: 1, mass: 0, shed: null },
  /** Takes the biggest thing on the sand: a servant led out as meat draws it off the fighter. */
  glutton: { gain: 1, threat: 0, weak: 0.5, near: 1, mass: 3, shed: null },
  /** Throws every head it carries into the fight as soon as the head can stand. */
  shedder: { gain: 3, threat: 0, weak: 0.5, near: 1, mass: 0, shed: 5 },
} satisfies Record<string, Aim>;

const DEFAULT_AIM: Aim = AIMS.brute;

/**
 * The best each reading reaches among the targets on offer: what the shares in
 * `aimScore` are shares of.
 */
interface Best {
  gain: number;
  threat: number;
  living: number;
}

/** The best on offer among these targets. Alone, a target is its own best of everything. */
function bestOf(foes: readonly Sight[]): Best {
  const top = (read: (f: Sight) => number) => foes.reduce((m, f) => Math.max(m, read(f)), 0);
  return { gain: top((f) => f.gain), threat: top((f) => f.threat), living: top((f) => f.living) };
}

/**
 * What one target is worth to this temper: five readings, each a share of the
 * best of it on the sand, each multiplied by its weight (decision 594).
 *
 * Normalising is what makes the weights comparable, and it is the reason the
 * table can be read at all: before it, `gain` arrived in tens and outvoted
 * everything whatever the row said, so `mass: 3` could not lead a glutton to
 * the mountain of meat and no larger number would have helped - it would only
 * have meant "the heaviest, always". `packages/core/tests/battle.test.ts` pins the
 * shape, so the day the scales are mixed again is a day someone notices.
 *
 * A target with nothing to compare against is the best of everything, so its
 * score is the plain sum of the weights: one foe in front of you cannot be
 * ranked, and the readings say nothing rather than something arbitrary.
 */
export function aimScore(aim: Aim, foe: Sight, best: Best = bestOf([foe])): number {
  const share = (x: number, top: number) => (top > 0 ? x / top : 0);
  return (
    aim.gain * share(foe.gain, best.gain) +
    aim.threat * share(foe.threat, best.threat) +
    aim.weak * (1 - foe.blood) +
    aim.near / Math.max(1, foe.distance) +
    aim.mass * share(foe.living, best.living)
  );
}

/**
 * The policy of a table of weights: shed first while a head is worth more
 * outside than in, then strike the best target, then wait. Ties go to the
 * lower id, so one seed is one battle.
 */
export function aimPolicy(aim: Aim): Policy {
  return (view) => {
    if (aim.shed !== null) {
      const ready = view.shed.filter((s) => s.strikes > 0 && (s.lifetime === null || s.lifetime >= aim.shed!));
      const best = ready.sort((x, y) => y.strikes - x.strikes || x.key.localeCompare(y.key))[0];
      if (best !== undefined) return { k: "shed", brain: best.brain };
    }
    let choice: Sight | null = null;
    let score = -Infinity;
    // The shares are taken over everyone on offer, not only over the ones
    // worth striking: a target nothing of ours reaches is still the worst
    // threat on the sand, and dropping it from the best would flatter the rest.
    const best = bestOf(view.foes);
    for (const foe of view.foes) {
      if (foe.gain <= 0) continue;
      const s = aimScore(aim, foe, best);
      if (s > score || (s === score && choice !== null && foe.id < choice.id)) {
        score = s;
        choice = foe;
      }
    }
    // Nothing of ours reaches anything: swing at the nearest anyway, so a
    // fight between two creatures that cannot hurt each other still happens.
    if (choice === null) {
      for (const foe of view.foes) {
        if (choice === null || foe.distance < choice.distance || (foe.distance === choice.distance && foe.id < choice.id)) choice = foe;
      }
    }
    return choice === null ? { k: "wait" } : { k: "strike", target: choice.id };
  };
}

export const defaultPolicy: Policy = aimPolicy(DEFAULT_AIM);
