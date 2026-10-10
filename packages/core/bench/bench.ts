/**
 * The measuring stand of the arena, docs/battle.md §7 grown up: it runs fights
 * in batches and prints numbers. Not one rule of the fight is written here -
 * every battle goes through `runBattle` of `packages/core/battle.ts`, and this file
 * only builds setups, counts outcomes and searches for the threshold ("how many
 * rats kill a dragon").
 *
 * Everything is a pure function of the seeds it is given: the same seed list
 * gives the same table, so a row of the report can be re-checked. No
 * `Math.random`, no `Date.now` - `ms` is measured with `performance.now`, and it
 * never enters a result that a test or a document reads.
 */
import {
  AIMS,
  aimPolicy,
  derive,
  excessChannels,
  planStrike,
  runBattle,
  strikes,
  type Aim,
  type Body,
  type EndReason,
  type FighterSpec,
  type Rng,
  type SideId,
} from "../index.js";
import { combatant, type Combatant } from "./roster.js";

export const LEFT: SideId = "L";
export const RIGHT: SideId = "R";

type AimName = keyof typeof AIMS;

export interface BenchOptions {
  /** Seeds first..first+seeds-1, one fight each. */
  seeds?: number;
  /** The first seed; 1 when nobody says. */
  first?: number;
  distance?: number;
  maxTurns?: number;
  toDeath?: boolean;
  /** The temper both sides fight with; a side may override it. */
  aim?: AimName;
  leftAim?: AimName;
  rightAim?: AimName;
}

export interface Fight {
  seed: number;
  winner: SideId | null;
  reason: EndReason;
  turns: number;
  /** Actions taken: the fight also stops at `BATTLE.maxActs`, and `reason` does not say which cap it was. */
  acts: number;
  /** Parts with a brain that came off during the fight, both sides. */
  severed: number;
  /** Hits landed by each side on the other. */
  landed: Record<SideId, number>;
  /** Damage those hits carried. */
  damage: Record<SideId, number>;
  /** Fighters of each side that ended dead, down, or ran out of blood they carried. */
  dead: Record<SideId, number>;
  down: Record<SideId, number>;
  /** A side died although nothing of the other side ever hit it: it killed itself. */
  selfKilled: SideId[];
}

function aimOf(name: AimName | undefined, fallback: AimName | undefined): Aim {
  return AIMS[name ?? fallback ?? "brute"];
}

function setup(left: readonly Body[], right: readonly Body[], o: BenchOptions): { fighters: FighterSpec[]; options: { distance: number; maxTurns?: number; toDeath: boolean } } {
  const lp = aimPolicy(aimOf(o.leftAim, o.aim));
  const rp = aimPolicy(aimOf(o.rightAim, o.aim));
  const fighters: FighterSpec[] = [
    ...left.map((body, i): FighterSpec => ({ id: `L${i + 1}`, side: LEFT, body, policy: lp })),
    ...right.map((body, i): FighterSpec => ({ id: `R${i + 1}`, side: RIGHT, body, policy: rp })),
  ];
  return { fighters, options: { distance: o.distance ?? 1, maxTurns: o.maxTurns, toDeath: o.toDeath ?? false } };
}

/** One fight, read down to the numbers a table needs. */
export function runOne(left: readonly Body[], right: readonly Body[], rng: Rng, o: BenchOptions = {}): Fight {
  const r = runBattle(setup(left, right, o), rng);
  // What each side landed comes off the result, not off the log: the fight
  // counts its own blows now (`Standing.hits` and `dealt`, decision 424).
  const landed: Record<SideId, number> = { [LEFT]: 0, [RIGHT]: 0 };
  const damage: Record<SideId, number> = { [LEFT]: 0, [RIGHT]: 0 };
  for (const f of r.fighters) {
    landed[f.side] = (landed[f.side] ?? 0) + f.hits;
    damage[f.side] = (damage[f.side] ?? 0) + f.dealt;
  }
  const dead: Record<SideId, number> = { [LEFT]: 0, [RIGHT]: 0 };
  const down: Record<SideId, number> = { [LEFT]: 0, [RIGHT]: 0 };
  for (const f of r.fighters) {
    if (f.severed) continue;
    if (f.state === "dead") dead[f.side] = (dead[f.side] ?? 0) + 1;
    if (f.state === "down") down[f.side] = (down[f.side] ?? 0) + 1;
  }
  const selfKilled: SideId[] = [];
  for (const side of [LEFT, RIGHT]) {
    const other = side === LEFT ? RIGHT : LEFT;
    if ((dead[side] ?? 0) > 0 && (landed[other] ?? 0) === 0) selfKilled.push(side);
  }
  return {
    seed: 0,
    winner: r.winner,
    reason: r.reason,
    turns: r.turns,
    acts: r.acts,
    severed: r.fighters.filter((f) => f.severed).length,
    landed,
    damage,
    dead,
    down,
    selfKilled,
  };
}

// ---------------------------------------------------------------- a wall against a wall

export interface Wall {
  left: string;
  right: string;
  n: number;
  m: number;
  seeds: number;
  wins: Record<SideId, number>;
  /** Seeds nobody won: both sides down, or the turn cap. */
  none: number;
  reasons: Record<EndReason, number>;
  turns: { median: number; min: number; max: number };
  acts: { median: number; max: number };
  /** Hits landed per side over all the seeds, and the damage they carried. */
  landed: Record<SideId, number>;
  damage: Record<SideId, number>;
  dead: Record<SideId, number>;
  severed: number;
  /** Seeds where one side died with nothing of the other ever landing on it. */
  selfKills: number;
  /** Damage per 100 energy one body of each would do the other, before a blow falls. */
  rate: Record<SideId, number>;
  ms: number;
}

function median(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const i = s.length >> 1;
  return s.length % 2 === 1 ? s[i]! : Math.round((s[i - 1]! + s[i]!) / 2);
}

/** What one body would do to another per 100 energy, the reading the view shows a policy. */
function rateAgainst(mine: Body, other: Body, distance = 1): number {
  return planStrike(mine, other, distance).rate;
}

export type MakeRng = (seed: number) => Rng;

/** N bodies of one against M of another, over the seeds given. */
export function wall(leftId: string | Combatant, rightId: string | Combatant, n: number, m: number, makeRng: MakeRng, o: BenchOptions = {}): Wall {
  const t0 = performance.now();
  const seeds = o.seeds ?? 30;
  const left = typeof leftId === "string" ? combatant(leftId) : leftId;
  const right = typeof rightId === "string" ? combatant(rightId) : rightId;
  const first = o.first ?? 1;
  const wins: Record<SideId, number> = { [LEFT]: 0, [RIGHT]: 0 };
  const reasons: Record<EndReason, number> = { beaten: 0, empty: 0, limit: 0 };
  const landed: Record<SideId, number> = { [LEFT]: 0, [RIGHT]: 0 };
  const damage: Record<SideId, number> = { [LEFT]: 0, [RIGHT]: 0 };
  const dead: Record<SideId, number> = { [LEFT]: 0, [RIGHT]: 0 };
  const turns: number[] = [];
  const acts: number[] = [];
  let none = 0;
  let severed = 0;
  let selfKills = 0;
  for (let seed = first; seed < first + seeds; seed++) {
    const f = runOne(
      Array.from({ length: n }, () => left.body()),
      Array.from({ length: m }, () => right.body()),
      makeRng(seed),
      o,
    );
    if (f.winner === null) none += 1;
    else wins[f.winner] = (wins[f.winner] ?? 0) + 1;
    reasons[f.reason] += 1;
    turns.push(f.turns);
    acts.push(f.acts);
    severed += f.severed;
    selfKills += f.selfKilled.length > 0 ? 1 : 0;
    for (const side of [LEFT, RIGHT]) {
      landed[side] = (landed[side] ?? 0) + (f.landed[side] ?? 0);
      damage[side] = (damage[side] ?? 0) + (f.damage[side] ?? 0);
      dead[side] = (dead[side] ?? 0) + (f.dead[side] ?? 0);
    }
  }
  return {
    left: left.id,
    right: right.id,
    n,
    m,
    seeds,
    wins,
    none,
    reasons,
    turns: { median: median(turns), min: Math.min(...turns), max: Math.max(...turns) },
    acts: { median: median(acts), max: Math.max(...acts) },
    landed,
    damage,
    dead,
    severed,
    selfKills,
    rate: { [LEFT]: rateAgainst(left.body(), right.body(), o.distance), [RIGHT]: rateAgainst(right.body(), left.body(), o.distance) },
    ms: performance.now() - t0,
  };
}

/** One against one, the ordinary case. */
export function duel(leftId: string | Combatant, rightId: string | Combatant, makeRng: MakeRng, o: BenchOptions = {}): Wall {
  return wall(leftId, rightId, 1, 1, makeRng, o);
}

// ---------------------------------------------------------------- the threshold

export interface ThresholdOptions extends BenchOptions {
  /** The largest crowd the search will try; past it the answer is "not with this many". */
  cap?: number;
  /** Share of the seeds the crowd has to win to count as enough. */
  win?: number;
  /** Bodies on the defending side. */
  defenders?: number;
}

interface Threshold {
  attacker: string;
  defender: string;
  /** Smallest crowd that wins `win` of the seeds; null when the cap was not enough. */
  count: number | null;
  cap: number;
  win: number;
  /**
   * One of them never took a point off the other: armor eats the whole blow
   * (`strike.md` §1.2), and a blow of zero does not grow with the crowd. The
   * search stops there instead of walking to the cap.
   */
  blunt: boolean;
  /** The measurement at `count`, and the one just below it. */
  at: Wall | null;
  below: Wall | null;
  /** Every crowd size the search tried, in order. */
  probes: { m: number; share: number }[];
  ms: number;
}

/**
 * How many of one it takes to beat the other: doubling to bracket the answer,
 * then a binary search inside the bracket. The search assumes the win share
 * grows with the crowd - it is not proven monotone, so `probes` keeps every
 * size tried and the report reads it.
 */
export function threshold(attacker: string | Combatant, defender: string | Combatant, makeRng: MakeRng, o: ThresholdOptions = {}): Threshold {
  const t0 = performance.now();
  const names = { attacker: typeof attacker === "string" ? attacker : attacker.id, defender: typeof defender === "string" ? defender : defender.id };
  const cap = o.cap ?? 32;
  const win = o.win ?? 0.5;
  const defenders = o.defenders ?? 1;
  const probes: { m: number; share: number }[] = [];
  const seen = new Map<number, Wall>();
  const at = (m: number): Wall => {
    const known = seen.get(m);
    if (known !== undefined) return known;
    const w = wall(defender, attacker, defenders, m, makeRng, o);
    seen.set(m, w);
    probes.push({ m, share: (w.wins[RIGHT] ?? 0) / w.seeds });
    return w;
  };
  const enough = (m: number): boolean => (at(m).wins[RIGHT] ?? 0) / at(m).seeds >= win;

  let hi = 1;
  if (!enough(1) && (at(1).damage[RIGHT] ?? 0) === 0) {
    return { ...names, count: null, cap, win, blunt: true, at: null, below: at(1), probes, ms: performance.now() - t0 };
  }
  while (!enough(hi)) {
    if (hi >= cap) {
      return { ...names, count: null, cap, win, blunt: false, at: null, below: seen.get(cap) ?? null, probes, ms: performance.now() - t0 };
    }
    hi = Math.min(cap, hi * 2);
  }
  let lo = 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (enough(mid)) hi = mid;
    else lo = mid + 1;
  }
  return { ...names, count: hi, cap, win, blunt: false, at: at(hi), below: hi > 1 ? at(hi - 1) : null, probes, ms: performance.now() - t0 };
}

// ---------------------------------------------------------------- what a body brings

interface Readings {
  id: string;
  ru: string;
  mass: number;
  ceiling: number;
  /** Strikes the body has at all, and the ones a volley actually sends. */
  strikes: number;
  sent: number;
  /** Damage per 100 energy against a human, and the energy one volley costs. */
  rate: number;
  time: number;
  /** Damage per 100 energy the human would do back: 0 means armor eats the whole fist. */
  back: number;
  armor: number;
  speed: number;
  /** Channels the mind has to spare; a body over its load slips organs every turn. */
  excess: number;
  load: number;
  cap: number;
}

export function readings(id: string, against: Body): Readings {
  const c = combatant(id);
  const body = c.body();
  const d = derive(body);
  const v = planStrike(body, against);
  return {
    id,
    ru: c.ru,
    mass: Math.round(d.budgets.mass * 10) / 10,
    ceiling: d.budgets.ceiling,
    strikes: strikes(body).length,
    sent: v.planned.length,
    rate: Math.round(v.rate * 10) / 10,
    time: v.time,
    back: Math.round(rateAgainst(against, body) * 10) / 10,
    armor: Math.round(d.armor.mean * 10) / 10,
    speed: d.speed.value,
    excess: excessChannels(body),
    load: d.budgets.control.load,
    cap: d.budgets.control.cap,
  };
}
