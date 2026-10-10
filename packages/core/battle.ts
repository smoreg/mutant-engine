/**
 * A fight of several bodies, docs/battle.md. The model already knew one blow
 * (`strike.ts`) and one wound (`damage.ts`); this file is the process over
 * them: who stands against whom, whose turn it is, what it strikes, when it
 * is over. Not one rule of the blow or of the wound is written again here -
 * a turn is `planStrike` and `landVolley` of strike.ts, the wounds it leaves
 * are the damage track's own, what a separation does to them is `splitHarm`,
 * and the clock between turns is the time the volley took, which `strike.ts`
 * reads off the mass that moved. What the battle adds is what a body cannot
 * know about itself: that a fighter out cold does not dodge, and what its
 * reserve will pay for a blow of the body. `packages/core/tests/engine.test.ts` keeps
 * it that way from the outside (decision 427).
 *
 * The part that makes the arena its own thing: a piece with a brain that
 * comes off a body mid-fight does not become meat. It is rebuilt as a body of
 * its own (`separate.ts` does the same for a head cut loose on purpose), joins
 * the fight on the side of whoever it came off, strikes by the ordinary rules
 * and cannot be struck back. It lives on the blood it carried
 * (`lifetimeWithoutHeart`) unless it left with a heart.
 *
 * Pure: no DOM, no clock of the host, randomness only through `{ next() }`.
 * Nothing inside `packages/core` imports this file - it is the outermost layer of
 * the model, so the state it keeps and the rules that move it may sit together
 * without a cycle.
 */
import type { Body, BrainRef } from "./graph.js";
import { cloneBody, makeNode, sameRef, setSelf, sortedIds } from "./graph.js";
import { brains, channelsOf } from "./brains.js";
import type { Fate } from "./cut.js";
import { pickHandover } from "./handover.js";
import { lifetimeWithoutHeart, separate, separatePreview } from "./separate.js";
import { derive } from "./derive.js";
import { effort } from "./derive/breath.js";
import { HUMAN_MASS, mass } from "./parts.js";
import { livingMass } from "./metrics.js";
import {
  bloodMax,
  carryBlood,
  exert,
  mindState,
  newHarm,
  spend,
  splitHarm,
  strike as landBlow,
  winded,
  type DeathCause,
  type Harm,
  type HarmEvent,
} from "./damage.js";
import { dodgeOf, escapeChance, grabs, landVolley, planStrike, pullOf, squeezeBlow, strikes, volleyCost, type Aimed, type Strike, type Volley } from "./strike.js";
import { elapse } from "./time.js";
import type { Rng } from "./rng.js";
import { defaultPolicy, type Action, type FighterId, type Policy, type ShedOption, type SideId, type Sight, type View } from "./policy.js";

export const BATTLE = {
  /** Energy of one turn, as strike.md counts it. */
  turnEnergy: 100,
  /** What a fighter spends when it has nothing to strike. */
  waitTime: 100,
  /** Turns after which a fight that goes nowhere is called off. */
  maxTurns: 200,
  /** A stop on actions, so no policy can hang the arena. */
  maxActs: 5000,
  /** Those who strike the human at once, and the fewest that reach any body (`meleePlaces`). */
  humanPlaces: 4,
  minPlaces: 2,
} as const;

/** How a fighter left the fight. */
export type Out = { k: "dead"; cause: DeathCause } | { k: "expired" };

export interface Fighter {
  id: FighterId;
  side: SideId;
  body: Body;
  harm: Harm;
  policy: Policy;
  /** It came off another fighter mid-fight: it strikes, nothing strikes it. */
  severed: boolean;
  /** It is counted when the fight asks whose side is down (decision 433). */
  counts: boolean;
  /** Whose body it left, null for the ones that started the fight. */
  from: FighterId | null;
  /** What it was when it came off; null for the ones that started the fight. */
  fate: Fate | null;
  /** Turns left on the blood it carried; null while it has a heart. */
  lifetime: number | null;
  /** Energy at which it acts next. */
  clock: number;
  /** Body turns already run for it. */
  turns: number;
  conscious: boolean;
  /** Blows it landed, and what they carried before the cover of the parts they found. */
  hits: number;
  dealt: number;
  /** What landed on it. */
  taken: number;
  out: Out | null;
  /** Grips that hold a foe (strike.md §1.7): the grab's key and whom it holds. They squeeze every body turn and sit out of the volley. */
  holds: { key: string; target: FighterId }[];
  /** Bites whose last bite landed, by the bite's key, and on whom: the next bite of that mouth at that target is stronger (strike.md §1.3). */
  bites: Record<string, FighterId>;
}

export interface FighterSpec {
  id: FighterId;
  side: SideId;
  body: Body;
  policy?: Policy;
  /**
   * The wounds it walks in with (decision 423): a gauntlet carries the last
   * fight's blood loss into the next one, and the arena's first floor is a
   * hurt man. Copied like the body - the fight never writes into what it was
   * given. Whole when nobody says.
   */
  harm?: Harm;
  /**
   * It is counted when the fight asks whose side is down. False makes it a
   * legal target that decides nothing - the servant led out beside a fighter
   * on the sand (decision 433). True when nobody says.
   */
  counts?: boolean;
}

interface BattleOptions {
  /** Cells between any two fighters; 1 is adjacent, and the arena is a pit. */
  distance?: number;
  maxTurns?: number;
  /**
   * A stop on actions, so no policy can hang the arena. Passable because a
   * longer fight needs a longer rope: the coliseum's whistle is 300 turns
   * (`arena.md` А8), not the library's 200 (decision 431).
   */
  maxActs?: number;
  /** Fight to the death instead of stopping when a side is down. */
  toDeath?: boolean;
}

export interface BattleSetup {
  fighters: readonly FighterSpec[];
  options?: BattleOptions;
}

export type BattleEvent =
  /** `blows`: what the volley struck with, in its order, and whether each roll hit - what a screen names the act by. */
  | { k: "act"; who: FighterId; target: FighterId; strikes: number; hits: number; damage: number; time: number; blows: { key: string; kind: Strike["kind"]; bite: Strike["bite"]; grab: boolean; hit: boolean }[] }
  /** The grips that hold `target` squeezed it at a body turn, without a roll (strike.md §1.7). */
  | { k: "squeeze"; who: FighterId; target: FighterId; keys: string[]; damage: number }
  /**
   * Grips that let go: the target is out, the holder is down, or the limb that
   * held is gone. `torn`: the held one tore loose - its pull beat their mass
   * (strike.md §1.7, decision 1313).
   */
  | { k: "release"; who: FighterId; keys: string[]; torn?: FighterId }
  | { k: "wait"; who: FighterId }
  | { k: "harm"; who: FighterId; from: "blow" | "turn"; events: HarmEvent[] }
  | { k: "turn"; turn: number }
  | { k: "shed"; who: FighterId; brain: string; born: FighterId }
  | { k: "severed"; who: FighterId; born: FighterId; fate: Fate; lifetime: number | null }
  | { k: "down"; who: FighterId }
  | { k: "up"; who: FighterId }
  | { k: "out"; who: FighterId; how: Out["k"]; cause: DeathCause | null }
  | { k: "end"; winner: SideId | null; reason: EndReason };

/** Why the fight stopped: a side is down, nothing is left, or it went nowhere for too long. */
export type EndReason = "beaten" | "empty" | "limit";

export type FighterState = "standing" | "down" | "dead" | "expired";

export interface Standing {
  id: FighterId;
  side: SideId;
  severed: boolean;
  /** It decided nothing about who won: a servant on the sand (decision 433). */
  counts: boolean;
  from: FighterId | null;
  state: FighterState;
  cause: DeathCause | null;
  /**
   * The flesh it leaves the sand with, and the wounds on it (decision 436).
   * The loser is dragged off alive and goes on bleeding in the stable, so what
   * the game keeps is a body, not a reading of one - the same reason
   * `severed` carries its own (432). These are the fight's own copies: the
   * bodies given to it were cloned at the start and never written into.
   */
  body: Body;
  harm: Harm;
  /** Blood left of what it holds, 0..1. */
  blood: number;
  mass: number;
  /** Blows it landed on others, what they carried, and what landed on it (decision 424). */
  hits: number;
  dealt: number;
  taken: number;
}

export interface BattleResult {
  winner: SideId | null;
  reason: EndReason;
  turns: number;
  time: number;
  acts: number;
  fighters: Standing[];
  /**
   * Every part that came off a body during the fight, in order, with the flesh
   * and the wounds it walked off with: what the stable keeps is a body, not a
   * name, and reading it off `Battle.fighters` by hand was the only reason to
   * step a fight instead of running it (decision 432).
   */
  severed: { id: FighterId; from: FighterId; fate: Fate; lifetime: number | null; body: Body; harm: Harm }[];
  log: BattleEvent[];
}

export interface Battle {
  fighters: Fighter[];
  /** Energy elapsed; a turn is 100. */
  time: number;
  turn: number;
  acts: number;
  options: Required<BattleOptions>;
  log: BattleEvent[];
  result: BattleResult | null;
}

// ---------------------------------------------------------------- readings

/**
 * A body that is not conscious does not get out of the way. The number itself
 * is `dodgeOf` of strike.ts, where the volley that asks for it lives; what the
 * battle knows and the body does not is who is still awake (decision 421).
 */
function dodgeFor(f: Fighter): number {
  return f.conscious ? dodgeOf(f.body, f.harm.acid) : 0;
}

/** A body out cold does not tear loose: what it pulls with is the battle's to say (strike.md §1.7). */
function pullFor(f: Fighter): number {
  return f.conscious ? pullOf(f.body) : 0;
}

function conscious(f: Fighter): boolean {
  return f.out === null && f.harm.dead === null && mindState(f.body, f.harm).conscious;
}

function bloodShare(f: Fighter): number {
  const max = bloodMax(f.body);
  return max <= 0 ? 0 : Math.max(0, Math.min(1, f.harm.blood / max));
}

// ---------------------------------------------------------------- a part that comes off

interface SeveredBody {
  body: Body;
  fate: Fate;
  /** Turns it lives on the blood it carried; null when it left with a heart. */
  lifetime: number | null;
}

/**
 * Builds a body out of one part of another: the elements by id, the membranes
 * whose cycle lies whole inside, and a brain of its own, chosen the way a
 * handover chooses - the most channels, then the lower id (`handover.ts`).
 * The segment the blow cut leaves with the part while its far end stays on the
 * body, so an end with nobody at it gets a stump, the same fresh node of size 1
 * with a wound that `cut.ts` leaves on the other side of the cut. Null when the
 * part holds no brain at all.
 */
function partBody(src: Body, nodes: readonly number[], segments: readonly number[]): Body | null {
  const own: Body = { nodes: {}, segments: {}, membranes: {}, self: { node: 0 }, meat: 0, nextId: src.nextId, version: 0 };
  for (const id of nodes) {
    const n = src.nodes[id];
    if (n !== undefined) own.nodes[id] = n;
  }
  for (const id of segments) {
    const s = src.segments[id];
    if (s !== undefined) own.segments[id] = s;
  }
  for (const id of sortedIds(own.segments)) {
    const s = own.segments[id]!;
    for (const end of ["a", "b"] as const) {
      if (own.nodes[s[end]] !== undefined) continue;
      const stump = makeNode(own.nextId++, 1, { wound: 20 });
      own.nodes[stump.id] = stump;
      s[end] = stump.id;
    }
  }
  for (const id of sortedIds(src.membranes)) {
    const m = src.membranes[id]!;
    if (m.cycle.every((sid) => own.segments[sid] !== undefined)) own.membranes[id] = m;
  }
  // A piece with no living brain is meat, whatever organ it carries: a brain
  // that starved before the blow does not wake up because the limb came off
  // (decision 428). Without this the piece joined the fight with a dead `self`,
  // and `carryBlood` cleared its ischemia on the next turn - the tear raised it.
  const alive = brains(own).filter((b) => b.alive);
  const self = pickHandover(alive.map((b) => ({ ref: b.ref, distance: 0, channels: channelsOf(b) })));
  if (self === null) return null;
  setSelf(own, self);
  own.meat = mass(own);
  return own;
}

/**
 * The bodies that came off a body: every piece of the damage track that holds
 * a brain, rebuilt from the body as it was before. Pure - `before` is left as
 * it is, and the pieces are its own flesh, not a view of it. A piece without a
 * heart carries its lifetime with it.
 *
 * Two events make a piece and they are the same kind of thing (decision 597).
 * `torn` is a blow that cut it loose. `fallen` is starvation: a part that lost
 * its path to a heart comes off while its brain is still alive (`FALL.brained`
 * in `cut.ts`) and is a fighter exactly as a torn one is. Reading only `torn`
 * left the second half unreachable, which is why it was never noticed that
 * nothing ever fell off alive.
 */
export function severedBodies(before: Body, events: readonly HarmEvent[]): SeveredBody[] {
  const wanted: { nodes: number[]; segments: number[]; fate: Fate }[] = [];
  for (const e of events) {
    if (e.k !== "torn" && e.k !== "fallen") continue;
    for (const p of e.pieces) if (p.fate === "creature" || p.fate === "brainOnly") wanted.push({ nodes: p.nodes, segments: p.segments, fate: p.fate });
  }
  if (wanted.length === 0) return [];
  const src = cloneBody(before);
  const out: SeveredBody[] = [];
  for (const w of wanted) {
    const body = partBody(src, w.nodes, w.segments);
    if (body === null) continue;
    out.push({ body, fate: w.fate, lifetime: w.fate === "brainOnly" ? lifetimeWithoutHeart(mass(body)) : null });
  }
  return out;
}

// ---------------------------------------------------------------- setting up

function fighterOf(spec: FighterSpec): Fighter {
  const body = cloneBody(spec.body);
  return {
    id: spec.id,
    side: spec.side,
    body,
    harm: spec.harm === undefined ? newHarm(body) : structuredClone(spec.harm),
    policy: spec.policy ?? defaultPolicy,
    severed: false,
    counts: spec.counts ?? true,
    from: null,
    fate: null,
    lifetime: null,
    clock: 0,
    turns: 0,
    conscious: true,
    hits: 0,
    dealt: 0,
    taken: 0,
    out: null,
    holds: [],
    bites: {},
  };
}

/** The fight before its first blow. The bodies given are cloned: the fight never writes into them. */
export function newBattle(setup: BattleSetup): Battle {
  const b: Battle = {
    fighters: setup.fighters.map(fighterOf),
    time: 0,
    turn: 0,
    acts: 0,
    options: {
      distance: setup.options?.distance ?? 1,
      maxTurns: setup.options?.maxTurns ?? BATTLE.maxTurns,
      maxActs: setup.options?.maxActs ?? BATTLE.maxActs,
      toDeath: setup.options?.toDeath ?? false,
    },
    log: [],
    result: null,
  };
  for (const f of b.fighters) f.conscious = conscious(f);
  return b;
}

// ---------------------------------------------------------------- what a fighter sees

function sightOf(b: Battle, looker: Fighter, other: Fighter, gain: number, threat: number): Sight {
  return {
    id: other.id,
    side: other.side,
    severed: other.severed,
    conscious: other.conscious,
    distance: looker === other ? 0 : b.options.distance,
    armor: derive(other.body).armor.mean,
    dodge: dodgeFor(other),
    blood: bloodShare(other),
    mass: mass(other.body),
    living: livingMass(other.body),
    gain,
    threat,
    lifetime: other.lifetime,
  };
}

/** Heads the fighter could cut loose right now, with what would leave with each. */
function shedOptions(f: Fighter): ShedOption[] {
  const out: ShedOption[] = [];
  for (const brain of brains(f.body)) {
    if (brain.self || !brain.alive) continue;
    const preview = separatePreview(f.body, brain.ref);
    const born = preview?.leaves.body;
    if (preview === null || born === undefined || born === null) continue;
    out.push({
      brain: brain.ref,
      key: brain.key,
      fate: preview.leaves.fate,
      strikes: strikes(born).length,
      lifetime: preview.leaves.lifetime,
      mass: mass(born),
    });
  }
  return out;
}

interface Look {
  view: View;
  /** The volley planned against every target the fighter can strike. */
  plans: Map<FighterId, Volley>;
}

/**
 * The volley one fighter plans at another. It is `planStrike` of strike.ts and
 * nothing else: the battle adds only what the body cannot know - that a
 * fighter out cold does not dodge, and what its reserve will pay for a blow of
 * the body (strike.md §1.8).
 */
function planOf(b: Battle, actor: Fighter, other: Fighter): Volley {
  const opts: NonNullable<Parameters<typeof planStrike>[3]> = { dodge: dodgeFor(other), reserve: actor.harm.reserve, acid: actor.harm.acid, pull: pullFor(other) };
  // A grip that holds is busy: it squeezes at the body turn and does not strike (strike.md §1.7).
  if (actor.holds.length > 0) {
    opts.skip = new Set(actor.holds.map((h) => h.key));
    // A new grab holds together with the grips already on this target: their masses pull against it as one (decision 1313).
    const mass = new Map(grabs(actor.body).map((g) => [g.key, g.mass]));
    opts.gripped = actor.holds.filter((h) => h.target === other.id).reduce((sum, h) => sum + (mass.get(h.key) ?? 0), 0);
  }
  // A bite that landed on this target holds it: the same mouth bites it again stronger (strike.md §1.3).
  const holding = Object.entries(actor.bites).filter(([, t]) => t === other.id).map(([k]) => k);
  if (holding.length > 0) opts.holding = new Set(holding);
  return planStrike(actor.body, other.body, b.options.distance, opts);
}

/**
 * Room around a body for those who strike it at once (decision 1281): its
 * girth, and girth grows as the cube root of mass. Four around the human, never
 * fewer than two - a rat is reached by two, a body of tens of humans by a dozen
 * and more. The rest of a crowd waits for a place.
 */
export function meleePlaces(body: Body): number {
  return Math.max(BATTLE.minPlaces, Math.round(BATTLE.humanPlaces * Math.cbrt(mass(body) / HUMAN_MASS)));
}

/** Where a fighter stands in the line of its side: the order the fight was set up in. */
function rank(b: Battle, f: Fighter): number {
  let i = 0;
  for (const o of b.fighters) {
    if (o === f) return i;
    if (o.side === f.side) i += 1;
  }
  return i;
}

/**
 * Whether the attacker has a place at the target: the target's standing foes,
 * nearest in the line first (a crowd faces a crowd rank by rank), take the
 * places it has room for. A foe out cold or out of the fight gives its place up.
 */
function hasPlace(b: Battle, attacker: Fighter, target: Fighter): boolean {
  const at = rank(b, target);
  const near = b.fighters
    .filter((f) => f.side !== target.side && f.out === null && f.conscious)
    .map((f) => ({ f, d: Math.abs(rank(b, f) - at), r: rank(b, f) }))
    .sort((x, y) => x.d - y.d || x.r - y.r)
    .slice(0, meleePlaces(target.body));
  return near.some((x) => x.f === attacker);
}

function look(b: Battle, actor: Fighter): Look {
  const plans = new Map<FighterId, Volley>();
  const allies: Sight[] = [];
  const foes: Sight[] = [];
  for (const other of b.fighters) {
    if (other === actor || other.out !== null) continue;
    if (other.side === actor.side) {
      allies.push(sightOf(b, actor, other, 0, 0));
      continue;
    }
    if (other.severed || !hasPlace(b, actor, other)) continue;
    const plan = planOf(b, actor, other);
    plans.set(other.id, plan);
    const back = other.conscious && hasPlace(b, other, actor) ? planOf(b, other, actor) : null;
    foes.push(sightOf(b, actor, other, plan.rate, back === null ? 0 : back.rate));
  }
  // The list of heads to shed costs a `separatePreview` - a clone and a whole
  // separation - per foreign brain, and the policy that ships throws it away
  // unread. So it is built on the first read and never for a policy that does
  // not ask (decision 430): on six brains that was a fifth of the fight's time.
  const has = brains(actor.body).some((x) => !x.self && x.alive);
  let shed: ShedOption[] | null = has ? null : [];
  const view: View = {
    self: sightOf(b, actor, actor, 0, 0),
    allies,
    foes,
    get shed(): ShedOption[] {
      return (shed ??= shedOptions(actor));
    },
    turn: b.turn,
    time: b.time,
  };
  return { view, plans };
}

/** What the fighter's policy is given: the same snapshot a screen would draw. */
export function battleView(b: Battle, id: FighterId): View | null {
  const actor = b.fighters.find((f) => f.id === id);
  return actor === undefined ? null : look(b, actor).view;
}

// ---------------------------------------------------------------- the fight

function note(b: Battle, events: BattleEvent[], e: BattleEvent): void {
  events.push(e);
  b.log.push(e);
}

/** Reads a fighter again after something happened to it: who went down, who is out. */
function refresh(b: Battle, f: Fighter, events: BattleEvent[]): void {
  if (f.out !== null) return;
  if (f.harm.dead !== null) {
    f.out = { k: "dead", cause: f.harm.dead };
    f.conscious = false;
    note(b, events, { k: "out", who: f.id, how: "dead", cause: f.harm.dead });
    return;
  }
  const now = conscious(f);
  if (now !== f.conscious) {
    f.conscious = now;
    note(b, events, { k: now ? "up" : "down", who: f.id });
  }
}

function join(b: Battle, owner: Fighter, born: Body, harm: Harm, fate: Fate, lifetime: number | null, events: BattleEvent[]): Fighter {
  const id = `${owner.id}/${b.fighters.filter((f) => f.from === owner.id).length + 1}`;
  const f: Fighter = {
    id,
    side: owner.side,
    body: born,
    harm,
    // A part that comes off is nobody's to command: it fights by a temper of
    // its own, not by the policy of the body it left (decision 435). With the
    // owner's policy a manager played his own severed head, and every caller
    // that cared had to put a gatekeeper in front of its own policy.
    policy: defaultPolicy,
    severed: true,
    counts: false,
    from: owner.id,
    fate,
    lifetime,
    clock: b.time,
    turns: b.turn,
    conscious: true,
    hits: 0,
    dealt: 0,
    taken: 0,
    out: null,
    holds: [],
    bites: {},
  };
  f.conscious = conscious(f);
  b.fighters.push(f);
  note(b, events, { k: "severed", who: owner.id, born: id, fate, lifetime });
  return f;
}

/** Every body turn the clock has run past, for everyone still in the fight. */
function runTurns(b: Battle, rng: Rng, events: BattleEvent[]): void {
  const upTo = Math.floor(b.time / BATTLE.turnEnergy);
  while (b.turn < upTo && b.result === null) {
    b.turn += 1;
    note(b, events, { k: "turn", turn: b.turn });
    for (const f of b.fighters) {
      if (f.out !== null || f.turns >= b.turn) continue;
      f.turns = b.turn;
      // A part that left with no heart runs on the blood it carried: while its
      // lifetime lasts, nothing in it starves (separate.ts, decision 283).
      if (f.severed && f.lifetime !== null) carryBlood(f.body);
      // A head that lost its blood comes off alive and joins the fight on the
      // side of the body that starved it, exactly as a head cut off by a blow
      // does (decision 597). Same snapshot rule as `doStrike`: a body with one
      // brain has no piece that thinks to lose.
      const before = brains(f.body).length > 1 ? cloneBody(f.body) : null;
      const wounds = before === null ? null : structuredClone(f.harm);
      const ev = elapse(f.body, rng, { harm: f.harm, upkeep: false }).events;
      if (ev.length > 0) note(b, events, { k: "harm", who: f.id, from: "turn", events: ev });
      if (before !== null && wounds !== null) {
        const parts = severedBodies(before, ev);
        if (parts.length > 0) {
          const shares = splitHarm(wounds, [f.body, ...parts.map((p) => p.body)]);
          f.harm = shares[0]!;
          parts.forEach((part, i) => join(b, f, part.body, shares[i + 1]!, part.fate, part.lifetime, events));
        }
      }
      refresh(b, f, events);
      if (f.out === null) squeezeTurn(b, f, rng, events);
      if (f.out === null && f.lifetime !== null) {
        f.lifetime -= 1;
        if (f.lifetime <= 0) {
          f.out = { k: "expired" };
          f.conscious = false;
          note(b, events, { k: "out", who: f.id, how: "expired", cause: null });
        }
      }
    }
    checkEnd(b, events);
  }
}

/** Whoever the fight counts when it asks whose side is down: not a severed part, not a servant. */
function counted(f: Fighter): boolean {
  return !f.severed && f.counts;
}

function standingSides(b: Battle): Set<SideId> {
  const out = new Set<SideId>();
  for (const f of b.fighters) {
    if (!counted(f) || f.out !== null) continue;
    if (b.options.toDeath || f.conscious) out.add(f.side);
  }
  return out;
}

function stateOf(f: Fighter): FighterState {
  if (f.out?.k === "dead") return "dead";
  if (f.out?.k === "expired") return "expired";
  return f.conscious ? "standing" : "down";
}

function finish(b: Battle, events: BattleEvent[], reason: EndReason, winner: SideId | null): void {
  b.result = {
    winner,
    reason,
    turns: b.turn,
    time: b.time,
    acts: b.acts,
    fighters: b.fighters.map((f) => ({
      id: f.id,
      side: f.side,
      severed: f.severed,
      counts: f.counts,
      from: f.from,
      state: stateOf(f),
      cause: f.out?.k === "dead" ? f.out.cause : null,
      body: f.body,
      harm: f.harm,
      blood: bloodShare(f),
      mass: mass(f.body),
      hits: f.hits,
      dealt: f.dealt,
      taken: f.taken,
    })),
    severed: b.fighters.filter((f) => f.severed).map((f) => ({ id: f.id, from: f.from!, fate: f.fate!, lifetime: f.lifetime, body: f.body, harm: f.harm })),
    log: b.log,
  };
  note(b, events, { k: "end", winner, reason });
}

function checkEnd(b: Battle, events: BattleEvent[]): boolean {
  if (b.result !== null) return true;
  const sides = standingSides(b);
  if (sides.size === 0) {
    finish(b, events, "empty", null);
    return true;
  }
  if (sides.size === 1) {
    const only = [...sides][0]!;
    // One side standing is a victory only when there was another side to beat.
    if (b.fighters.some((f) => counted(f) && f.side !== only)) {
      finish(b, events, "beaten", only);
      return true;
    }
  }
  if (b.turn >= b.options.maxTurns || b.acts >= b.options.maxActs) {
    finish(b, events, "limit", null);
    return true;
  }
  return false;
}

/** The one that acts next: the smallest clock, ties by the order they joined. */
function nextActor(b: Battle): Fighter | undefined {
  let best: Fighter | undefined;
  for (const f of b.fighters) {
    if (f.out !== null) continue;
    if (best === undefined || f.clock < best.clock) best = f;
  }
  return best;
}

/**
 * Whose action comes next, with every body turn the clock has already run past
 * run. Null when the fight is over.
 *
 * `stepBattle` does exactly this before it asks a policy; what this adds is
 * asking **before** the action, which is what a screen that waits for a person
 * needs and a policy never does. A policy is handed its view and answers in the
 * same call; a person has to be shown the sand first, and the sand it must be
 * shown is the one the turn will find - after the blood of this turn, after
 * whoever starved in it, after whoever fell off alive. Working that out outside
 * this file means turning the queue outside this file (decision 710).
 *
 * Idempotent: the turns it ran are marked run, so a second call runs nothing
 * twice and the `stepBattle` after it draws the rolls it would have drawn on
 * its own. That is what keeps a fight played by hand and the same fight run
 * whole the same fight, roll for roll.
 */
export function nextTurn(b: Battle, rng: Rng): FighterId | null {
  const events: BattleEvent[] = [];
  if (checkEnd(b, events)) return null;
  while (b.result === null) {
    const actor = nextActor(b);
    if (actor === undefined) {
      finish(b, events, "empty", null);
      break;
    }
    b.time = Math.max(b.time, actor.clock);
    runTurns(b, rng, events);
    if (b.result !== null) break;
    // The turns that just ran took it out of the fight: the next one is somebody else.
    if (actor.out === null) return actor.id;
    if (checkEnd(b, events)) break;
  }
  return null;
}

/**
 * Blows land on a target, and whatever they cut loose with a brain joins the
 * fight. A body with one brain cannot lose a piece that thinks: only take the
 * snapshot a severed part would be rebuilt from when there is one to lose.
 * The wounds are snapshot with it: what a piece carries off is the blood, the
 * bleeding and the pain of its brain as they were before the blow. `land`
 * lands the blows and hands back the damage track's events; `report` writes
 * what the fight says about them before the wounds are.
 */
function hurt(b: Battle, target: Fighter, land: () => HarmEvent[], report: () => void, events: BattleEvent[]): void {
  const before = brains(target.body).length > 1 ? cloneBody(target.body) : null;
  const wounds = before === null ? null : structuredClone(target.harm);
  const landed = land();
  report();
  if (landed.length > 0) note(b, events, { k: "harm", who: target.id, from: "blow", events: landed });
  if (before !== null && wounds !== null) {
    const parts = severedBodies(before, landed);
    if (parts.length > 0) {
      const shares = splitHarm(wounds, [target.body, ...parts.map((p) => p.body)]);
      parts.forEach((part, i) => join(b, target, part.body, shares[i + 1]!, part.fate, part.lifetime, events));
    }
  }
  refresh(b, target, events);
}

function doStrike(b: Battle, actor: Fighter, target: Fighter, plan: Volley, aimed: Aimed, rng: Rng, events: BattleEvent[]): void {
  let landed: ReturnType<typeof landVolley> | undefined;
  hurt(
    b,
    target,
    // Where on the target the volley goes is the order's (damage.md §6, decision 434).
    () => (landed = landVolley(plan, target.body, target.harm, rng, aimed)).events,
    () => {
      const l = landed!;
      // A blow of the body empties the reserve of the one that threw it (strike.md §1.8, decision 425).
      spend(actor.harm, volleyCost(plan));
      // And the air of what it moved, paid at its next turn of breath (breath.md §2, decision 1294).
      exert(actor.harm, plan.planned.reduce((sum, p) => sum + effort("strike", p.strike.mass), 0));
      actor.clock += Math.max(1, plan.time);
      actor.hits += l.hits;
      actor.dealt += l.damage;
      target.taken += l.damage;
      // A grab that lands holds (strike.md §1.7, decision 1306): from the next body turn it squeezes.
      if (target.harm.dead === null) for (const r of l.rolls) if (r.hit && r.planned.strike.type === "squeeze") actor.holds.push({ key: r.planned.strike.key, target: target.id });
      // A bite that lands holds its target for the next bite of the same mouth; one that misses lets go (decision 1307).
      // Only a mouth heavier than a man's holds (decision 1315).
      for (const r of l.rolls) {
        if (!r.planned.strike.holds) continue;
        if (r.hit && target.harm.dead === null) actor.bites[r.planned.strike.key] = target.id;
        else delete actor.bites[r.planned.strike.key];
      }
      note(b, events, { k: "act", who: actor.id, target: target.id, strikes: plan.planned.length, hits: l.hits, damage: l.damage, time: plan.time, blows: l.rolls.map((r) => ({ key: r.planned.strike.key, kind: r.planned.strike.kind, bite: r.planned.strike.bite, grab: r.planned.strike.type === "squeeze", hit: r.hit })) });
    },
    events,
  );
}

/**
 * The body turn of a fighter that holds (strike.md §1.7): every grip whose
 * limb is still there and whose target is still in the fight squeezes it,
 * without a roll; the others let go, and a holder out cold lets go of all.
 */
function squeezeTurn(b: Battle, f: Fighter, rng: Rng, events: BattleEvent[]): void {
  if (f.holds.length === 0) return;
  const mine = new Map(grabs(f.body).map((g) => [g.key, g]));
  const keep = f.holds.filter((h) => f.conscious && mine.has(h.key) && b.fighters.some((t) => t.id === h.target && t.out === null));
  const gone = f.holds.filter((h) => !keep.includes(h)).map((h) => h.key);
  f.holds = keep;
  if (gone.length > 0) note(b, events, { k: "release", who: f.id, keys: gone });
  for (const target of b.fighters) {
    const held = f.holds.filter((h) => h.target === target.id);
    if (held.length === 0 || target.out !== null) continue;
    // The held body pulls against every grip on it; torn loose, it is not squeezed this turn (decision 1313).
    const grip = held.reduce((sum, h) => sum + mine.get(h.key)!.mass, 0);
    if (rng.next() < escapeChance(pullFor(target), grip)) {
      f.holds = f.holds.filter((h) => h.target !== target.id);
      note(b, events, { k: "release", who: f.id, keys: held.map((h) => h.key), torn: target.id });
      continue;
    }
    let damage = 0;
    hurt(
      b,
      target,
      () => {
        const out: HarmEvent[] = [];
        for (const h of held) {
          if (target.harm.dead !== null) break;
          const g = mine.get(h.key)!;
          const blow = squeezeBlow(g, rng, f.harm.acid);
          damage += blow.damage;
          exert(f.harm, effort("strike", g.mass));
          out.push(...landBlow(target.body, target.harm, blow, rng));
        }
        return out;
      },
      () => {
        f.dealt += damage;
        target.taken += damage;
        note(b, events, { k: "squeeze", who: f.id, target: target.id, keys: held.map((h) => h.key), damage });
      },
      events,
    );
  }
}

function doShed(b: Battle, actor: Fighter, brain: BrainRef, events: BattleEvent[]): boolean {
  const key = brains(actor.body).find((x) => !x.self && x.alive && sameRef(x.ref, brain))?.key;
  if (key === undefined) return false;
  const r = separate(actor.body, brain);
  if (r === null || r.leaves.body === null) return false;
  // Cutting a head loose also cuts loose whatever lost its path to you with it
  // (`Separation.others`, body-graph.md §7). Every one of those that carries a
  // brain is a fighter too - joining only `leaves` deleted the rest from the
  // donor and dropped them out of the fight, out of `severed` and out of the
  // stable (decision 429). The wounds are divided among all of them at once by
  // `splitHarm` of the damage track (decision 426).
  const parts = [r.leaves, ...r.others].filter((p) => p.body !== null);
  const shares = splitHarm(actor.harm, [actor.body, ...parts.map((p) => p.body!)]);
  actor.harm = shares[0]!;
  const joined = parts.map((p, i) => join(b, actor, p.body!, shares[i + 1]!, p.fate, p.lifetime, events));
  actor.clock += BATTLE.turnEnergy;
  note(b, events, { k: "shed", who: actor.id, brain: key, born: joined[0]!.id });
  refresh(b, actor, events);
  return true;
}

/** One action of one fighter, and every body turn the clock ran past before it. */
export function stepBattle(b: Battle, rng: Rng): BattleEvent[] {
  const events: BattleEvent[] = [];
  if (b.result !== null) return events;
  const actor = nextActor(b);
  if (actor === undefined) {
    finish(b, events, "empty", null);
    return events;
  }
  b.acts += 1;
  b.time = Math.max(b.time, actor.clock);
  runTurns(b, rng, events);
  if (b.result !== null) return events;
  if (actor.out !== null) {
    checkEnd(b, events);
    return events;
  }

  if (!actor.conscious) {
    actor.clock += BATTLE.waitTime;
    note(b, events, { k: "wait", who: actor.id });
    checkEnd(b, events);
    return events;
  }

  const seen = look(b, actor);
  const action: Action = actor.policy(seen.view);
  let acted = false;
  // Muscles sour to the top do not strike: the fighter stands and breathes it off (breath.md §3).
  if (action.k === "strike" && !winded(actor.harm)) {
    const target = b.fighters.find((f) => f.id === action.target);
    const plan = seen.plans.get(action.target);
    // A severed part, an ally and anyone already out are no targets: the
    // lookup goes through the plans of the view, and only foes are there.
    if (target !== undefined && plan !== undefined && plan.planned.length > 0) {
      doStrike(b, actor, target, plan, { profile: action.profile, aim: action.aim }, rng, events);
      acted = true;
    }
  } else if (action.k === "shed") {
    acted = doShed(b, actor, action.brain, events);
  }
  if (!acted) {
    actor.clock += BATTLE.waitTime;
    note(b, events, { k: "wait", who: actor.id });
  }
  checkEnd(b, events);
  return events;
}

/** The whole fight, from the setup to the outcome. One rng, one battle. */
export function runBattle(setup: BattleSetup, rng: Rng): BattleResult {
  const b = newBattle(setup);
  checkEnd(b, []);
  while (b.result === null) stepBattle(b, rng);
  return b.result;
}
