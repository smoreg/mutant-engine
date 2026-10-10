/**
 * Wounds, docs/damage.md: a blow lands on one element of the graph, meets its
 * cover, takes hidden hp, may hurt an organ inside, bleeds, and hurts the
 * nearest brains; a turn bleeds, clots, starves what has no path to a heart,
 * heals from the energy reserve, lets pain ebb, knocks out brains in agony,
 * makes their territory twitch, lets an infected wound fester and a chill
 * run its course. Death is one of the four conditions of body-graph.md §5.
 *
 * The body keeps what the graph already carries (hp, segment bleed, wound,
 * ischemia); everything else lives in `Harm`, a plain record beside it, so
 * the shape of the body, its text and its hash stay as they were. Organ
 * states are keyed by where the organ sits (`n4.0`, `n1.0.2` inside a head,
 * `s9.c1` in a cavity, `s9.g0` on the surface) and re-keyed after every
 * change of the graph. Pure functions; randomness only through `{ next() }`.
 */
import type { Body, BrainRef, Organ, Place } from "./graph.js";
import { brainRefsIn, isBrainKind, nodeIds, removeSegment, segmentIds, segmentsAt, selfElement, selfRef, setSelf, sortedIds, touch } from "./graph.js";
import type { ExtraKind, HitType } from "./derive/attacks.js";
import { exposure, type PartKind } from "./derive/exposure.js";
import { acidToll } from "./derive/speed.js";
import { brains, placeDistance, type Brain } from "./brains.js";
import { cut, ischemiaTick, type Fate } from "./cut.js";
import { newStarve, resetStarve, starveTurn, type HungerBite, type Starve } from "./hunger.js";
import { bloodReach, bridges, distances, fed, hasKind, hearts, livingMass } from "./metrics.js";
import { tearMembranes } from "./membrane.js";
import { mentalLoad, brainPowers } from "./mind.js";
import { upkeep as upkeepOf } from "./budgets.js";
import { COVERS, mass, organControl, organMass, specOf, type GuardType } from "./parts.js";
import { ownership } from "./territory.js";
import { human } from "./human.js";
import type { Rng } from "./rng.js";

// ---------------------------------------------------------------- numbers (docs/damage.md)

/** The reserve a fresh human starts with: his `startReserve`. */
export const START_RESERVE = 400;
/**
 * A fresh record holds this many turns of the body's own upkeep (decision 1278):
 * the belly of keep.ts, so a bigger eater starts with more and a human with 400.
 */
export const RESERVE_TURNS = 20;
/**
 * Turns a body lives with its air tank empty before its brains die (decision 1277,
 * breath.md §4: "a human of mass 100 has seven turns of the blackout").
 */
export const SUFFOCATION_TURNS = 7;
/** Charges of the burst: turns of work past the draw the muscles pay without air (breath.md §3). */
export const BURST = 5;
/** Turns within the draw that bring one charge back. */
export const BURST_RECOVERY = 4;
/** Acid, and reserve, per unit of muscle air paid without oxygen (breath.md §3). */
export const ACID_PER_AIR = 5;
/** Acid at which the muscles refuse: no blow until the draw pays some of it off. */
export const ACID_MAX = 100;
/** A reserve at or above this counts as well fed: a disease recedes on rest. */
const FED_RESERVE = 200;
const CLOT_EVERY = 10;
const BIG_BLEED = 5;
/** A wound bleeds by its size, not by the number of blows: missing hp / 4, a scratch under 4 does not. */
const BLEED_PER_HP = 4;
/** A point of blood comes back every this many turns; each costs `BLOOD_COST` of the reserve. */
const BLOOD_EVERY = 4;
const BLOOD_COST = 5;
/** hp mended per turn over the whole body, and what each costs. */
export const HEAL_RATE = 0.5;
export const HEAL_COST = 10;
const MEND_TURNS = 40;
const MEND_COST = 50;
/**
 * Knitting (decision 129): the one action that spends the reserve on speed
 * instead of spending turns. `KNIT_PACE` is how many times the body's own
 * pace it runs at; `KNIT_TAX` multiplies what every point of hp and blood
 * costs, for being hurried. It burns only while it is on, and a dry reserve
 * stops it at once.
 */
export const KNIT_PACE = 8;
export const KNIT_TAX = 2;
const PAIN_EBB_EVERY = 5;
const TREMOR = 30;
const SPASM = 60;
const BLACKOUT = 85;
export const MAX_BLACKOUT = 12;
export const AWAKE_BETWEEN = 20;
/** Aimed blows land where meant with 50 % x 100 / mass. */
const AIM_BASE = 0.5;
const DIRTY_PER_DAMAGE = 0.02;
const FESTER_AT = 40;
const GANGRENE_AT = 120;
const CHILL_FEVER_AT = 50;
const CHILL_HEAT_AT = 150;
const CHILL_PASSES_AT = 200;
const CURE_EVERY = 30;

/**
 * What the five types of strike.md §6 do where they land. Each one moves a
 * roll the track already had, and none of them is a track of its own: a
 * crushing blow finishes a part it nearly took, a cutting blow takes a broken
 * one off, a piercing blow reaches into the cavity, a squeeze presses through
 * half the cover (strike.md §1.7), and a bite is dirty, which it already was.
 */
const CRUSH_SHARE = 0.25;
const PIERCE_DEEPER = 2;
export const SQUEEZE_COVER = 0.5;
/** Turns between a venomous bite and the dose it owes (strike.md §1.6). */
export const VENOM_TURNS = 3;

// ---------------------------------------------------------------- state

interface OrganHarm {
  /** Hurt: works at half; one more hit and it is destroyed. */
  hurt?: boolean;
  /** Turns of mending toward whole. */
  mend?: number;
  /** A brain's pain, 0..100. */
  pain?: number;
  /** A brain out cold: turns left. */
  out?: number;
  /** A brain just woken: turns it cannot black out again. */
  awake?: number;
}

export interface Sickness {
  stage: 1 | 2 | 3;
  /** Turns since it took hold. */
  turns: number;
  /** Turns of rest in a row with a full reserve, toward the next stage down. */
  rest: number;
}

interface Chill extends Sickness {
  /** The reserve ran dry while it lasted: it does not pass by itself. */
  starved: boolean;
}

export type DeathCause = "blood" | "brain" | "mass";

/**
 * What an addition of strike.md §1.6 owes the target on top of the die it rode
 * in on, already rolled by the one that threw the blow. The cover does not
 * hold it: a discharge tells at once, venom three turns later. It can break a
 * part and never takes one off - a dose is not a blow.
 */
export interface Dose {
  kind: ExtraKind;
  amount: number;
  /** Turns before it tells; 0 lands with the blow. */
  delay: number;
}

/** A dose still owed, on the element it went in by. */
interface Owed {
  kind: ExtraKind;
  amount: number;
  turns: number;
  id: number;
}

export interface Harm {
  turn: number;
  blood: number;
  reserve: number;
  /** Keyed by where the organ sits, see `organSlots`. */
  organs: Record<string, OrganHarm>;
  /** Bleeding of nodes; a segment bleeds through its own `bleed`. */
  nodeBleed: Record<number, number>;
  /** A festering wound on an element, by id. */
  infection: Record<number, Sickness>;
  chill: Chill | null;
  /** How long the reserve has been empty and how far along the next bite of the ladder is (`hunger.ts`). */
  starve: Starve;
  /** Doses the blood still owes: venom bitten in, waiting out its turns. */
  doses: Owed[];
  /** Fractions of hp mended, carried between turns. */
  healCarry: number;
  /** Fractions of blood and pain carried between turns. */
  bloodCarry: number;
  painCarry: number;
  /**
   * Air left in the common tank (lungs and blood, breath.md §1); absent while the
   * tank is full, so a body that breathes carries no field for it (decision 1277).
   */
  air?: number;
  /** Turns in a row the tank has been empty. */
  breathless?: number;
  /** Muscle air the actions since the last breath owe (`exert`); `breathe` pays it (decision 1294). */
  work?: number;
  /** Acid of the muscles, 0..`ACID_MAX` (breath.md §3); absent at 0. */
  acid?: number;
  /** Charges of the burst spent, fractions returning; absent when it is full. */
  burst?: number;
  dead: DeathCause | null;
}

export type Profile = "random" | "wound" | "low" | "aimed" | "at";

export interface Blow {
  damage: number;
  profile: Profile;
  /** For `aimed` and `at`: the element meant; `aimed` without it goes for the element holding your brain. */
  aim?: number;
  /** A dirty blow can fester (claws, teeth, rust). */
  dirty?: boolean;
  /** Burn or acid: +5 pain. */
  burn?: boolean;
  /**
   * What the blow does where it lands (strike.md §6): a crushing blow breaks,
   * a cutting one takes a broken part off, a piercing one reaches the cavity,
   * a squeeze presses through half the cover. `blunt` when nobody says.
   */
  type?: HitType;
  /** Venom, acid, a discharge, spikes the blow carried (strike.md §1.6). */
  doses?: readonly Dose[];
}

export type ElementState = "whole" | "hurt" | "broken" | "destroyed";

interface PainShare {
  key: string;
  amount: number;
}

export interface Piece {
  /** Nodes and segments that left, with the organs they held. */
  nodes: number[];
  segments: number[];
  organs: Organ["kind"][];
  mass: number;
  fate: Fate;
}

export type HarmEvent =
  | { k: "miss"; aim: number }
  | { k: "membrane"; id: number; lost: number; torn: boolean }
  | {
      k: "hit";
      id: number;
      kind: "node" | "segment";
      raw: number;
      defense: number;
      damage: number;
      before: ElementState;
      after: ElementState;
      bleed: number;
      pain: PainShare[];
    }
  | { k: "organ"; key: string; kind: Organ["kind"]; result: "hurt" | "destroyed"; where: number }
  | { k: "infected"; id: number }
  | { k: "owed"; kind: ExtraKind; id: number; turns: number }
  | { k: "dose"; kind: ExtraKind; id: number; amount: number; pain: PainShare[] }
  | { k: "torn"; segment: number; stump: number; bleed: number; pieces: Piece[] }
  | { k: "vanished"; segment: number }
  | { k: "crushed"; node: number; lost: Organ["kind"][]; bleed: number }
  | { k: "handover"; to: string }
  | { k: "death"; cause: DeathCause }
  | { k: "bled"; amount: number }
  | { k: "clot"; id: number }
  | { k: "blackout"; key: string; turns: number; why: "pain" | "blood" }
  | { k: "wake"; key: string }
  | { k: "twitch"; key: string; organ: Organ["kind"]; where: number }
  | { k: "flail"; key: string; organs: number }
  | { k: "necrosis"; ids: number[] }
  | { k: "fallen"; ids: number[]; pieces: Piece[] }
  | { k: "brainDead"; key: string }
  | { k: "fester"; id: number; stage: 1 | 2 | 3 }
  | { k: "spread"; from: number; to: number }
  | { k: "cured"; id: number | null }
  | { k: "chill"; stage: 1 | 2 | 3 }
  | { k: "healed"; hp: number; blood: number; spent: number; knit: boolean }
  | { k: "mended"; key: string; kind: Organ["kind"] }
  | { k: "starving" }
  /** The body ate a piece of itself: one bite of one rung of the ladder of `hunger.ts`. */
  | { k: "gnawed"; bite: HungerBite }
  | { k: "bandaged"; id: number; bleed: number }
  | { k: "cauterized"; id: number; pain: PainShare[] }
  | { k: "ate"; amount: number };

/** What a fresh record of this body holds in reserve: `RESERVE_TURNS` of its upkeep. */
export function startReserve(body: Body): number {
  return upkeepOf(body, bloodReach(body)) * RESERVE_TURNS;
}

export function newHarm(body: Body): Harm {
  return {
    turn: 0,
    blood: bloodMax(body),
    reserve: startReserve(body),
    organs: {},
    nodeBleed: {},
    infection: {},
    chill: null,
    starve: newStarve(),
    doses: [],
    healCarry: 0,
    bloodCarry: 0,
    painCarry: 0,
    dead: null,
  };
}

/**
 * One record of harm split across the bodies a separation left it in
 * (`separate.ts`, `battle.ts`): blood and the reserve by the share of living
 * mass each part holds, and every bleeding element, festering wound, organ
 * state and owed dose with the body that still has it - the pain of a brain
 * goes where the brain goes. The first body is the one that was there before:
 * it keeps the carries, the death and the count of turns; every other part
 * starts its own. Pure - the record given is not touched.
 */
export function splitHarm(harm: Harm, parts: readonly Body[]): Harm[] {
  const caps = parts.map(bloodMax);
  const total = caps.reduce((s, x) => s + x, 0);
  return parts.map((body, i) => {
    const keys = new Set(organSlots(body).map((s) => s.key));
    const has = (id: number): boolean => body.nodes[id] !== undefined || body.segments[id] !== undefined;
    const cap = caps[i]!;
    const share = total > 0 ? cap / total : 0;
    const out: Harm = {
      turn: harm.turn,
      blood: Math.min(cap, Math.round(harm.blood * share)),
      reserve: Math.round(harm.reserve * share),
      organs: {},
      nodeBleed: {},
      infection: {},
      chill: harm.chill === null ? null : { ...harm.chill },
      // Every part carries the hunger the whole body had: a piece does not start its ladder over.
      starve: { ...harm.starve },
      doses: harm.doses.filter((d) => has(d.id)).map((d) => ({ ...d })),
      healCarry: i === 0 ? harm.healCarry : 0,
      bloodCarry: i === 0 ? harm.bloodCarry : 0,
      painCarry: i === 0 ? harm.painCarry : 0,
      dead: i === 0 ? harm.dead : null,
    };
    if (harm.air !== undefined) out.air = harm.air * share;
    if (harm.breathless !== undefined) out.breathless = harm.breathless;
    if (harm.acid !== undefined) out.acid = harm.acid;
    if (harm.burst !== undefined) out.burst = harm.burst;
    if (harm.work !== undefined && i === 0) out.work = harm.work;
    for (const key of Object.keys(harm.organs).sort()) if (keys.has(key)) out.organs[key] = { ...harm.organs[key]! };
    for (const id of sortedIds(harm.nodeBleed)) if (body.nodes[id] !== undefined) out.nodeBleed[id] = harm.nodeBleed[id]!;
    for (const id of sortedIds(harm.infection)) if (has(id)) out.infection[id] = { ...harm.infection[id]! };
    return out;
  });
}

/**
 * The blood a part carried away: every element counts as fed for this turn, so
 * the brain of a piece with no heart does not starve in five turns
 * (`BRAIN_DEATH_TURNS`) but lives out the lifetime `separate.ts` gives it.
 */
export function carryBlood(body: Body): void {
  for (const id of nodeIds(body)) body.nodes[id]!.ischemia = 0;
  for (const id of segmentIds(body)) body.segments[id]!.ischemia = 0;
  touch(body);
}

// ---------------------------------------------------------------- organs by place

interface OrganSlot {
  key: string;
  organ: Organ;
  /** The node or segment that holds it. */
  element: number;
}

/** Every organ of the body with its key, by element id. */
export function organSlots(body: Body): OrganSlot[] {
  const out: OrganSlot[] = [];
  const ids = [...nodeIds(body), ...segmentIds(body)].sort((x, y) => x - y);
  for (const id of ids) {
    const node = body.nodes[id];
    if (node !== undefined) {
      node.ends.forEach((e, i) => {
        out.push({ key: `n${id}.${i}`, organ: e, element: id });
        (e.contents ?? []).forEach((c, j) => out.push({ key: `n${id}.${i}.${j}`, organ: c, element: id }));
      });
      continue;
    }
    const s = body.segments[id]!;
    s.cavity.forEach((o, i) => out.push({ key: `s${id}.c${i}`, organ: o, element: id }));
    s.growths.forEach((o, i) => out.push({ key: `s${id}.g${i}`, organ: o, element: id }));
  }
  return out;
}

/** The key of one organ object, or undefined when it is no longer in the body. */
export function keyOf(body: Body, organ: Organ): string | undefined {
  return organSlots(body).find((s) => s.organ === organ)?.key;
}

/**
 * Runs a change of the graph and carries organ states and `self` over to
 * wherever the organs sit afterwards; states of organs that left are gone.
 */
export function stable<T>(body: Body, harm: Harm, change: () => T): T {
  const kept = new Map<Organ, OrganHarm>();
  for (const s of organSlots(body)) {
    const st = harm.organs[s.key];
    if (st !== undefined) kept.set(s.organ, st);
  }
  const me = selfRef(body);
  const myBrain = me === undefined ? undefined : brainOrganAt(body, me);
  const out = change();
  harm.organs = {};
  for (const s of organSlots(body)) {
    const st = kept.get(s.organ);
    if (st !== undefined) harm.organs[s.key] = st;
  }
  if (myBrain !== undefined) {
    const ref = refOfBrain(body, myBrain);
    if (ref !== undefined) setSelf(body, ref);
  }
  for (const id of sortedIds(harm.nodeBleed)) if (body.nodes[id] === undefined) delete harm.nodeBleed[id];
  for (const id of sortedIds(harm.infection)) if (body.nodes[id] === undefined && body.segments[id] === undefined) delete harm.infection[id];
  harm.doses = harm.doses.filter((d) => body.nodes[d.id] !== undefined || body.segments[d.id] !== undefined);
  return out;
}

function brainOrganAt(body: Body, ref: BrainRef): Organ | undefined {
  if ("node" in ref) return body.nodes[ref.node]?.ends[ref.end]?.contents?.find((c) => isBrainKind(c.kind));
  return body.segments[ref.segment]?.cavity[ref.slot];
}

function refOfBrain(body: Body, organ: Organ): BrainRef | undefined {
  for (const id of [...nodeIds(body), ...segmentIds(body)]) {
    for (const ref of brainRefsIn(body, id)) if (brainOrganAt(body, ref) === organ) return ref;
  }
  return undefined;
}

function stateOf(harm: Harm, key: string): OrganHarm {
  let st = harm.organs[key];
  if (st === undefined) {
    st = {};
    harm.organs[key] = st;
  }
  return st;
}

// ---------------------------------------------------------------- reading the harm

export function elementState(hp: number, hpMax: number): ElementState {
  if (hp >= hpMax) return "whole";
  if (hp > 0) return "hurt";
  if (hp > -hpMax / 2) return "broken";
  return "destroyed";
}

/**
 * Blood a body holds: the mass the blood still reaches (decision 128). A limb
 * cut off from the heart is carried, not filled - the part that is separated
 * in fact stops counting as the organism at once, and the reading drops with
 * it instead of pretending the body is whole.
 */
export function bloodMax(body: Body): number {
  return livingMass(body);
}

type BloodLevel = "fine" | "weak" | "grave" | "faint" | "none";

export function bloodLevel(body: Body, harm: Harm): BloodLevel {
  const max = bloodMax(body);
  const share = max > 0 ? harm.blood / max : 0;
  if (harm.blood <= 0) return "none";
  if (share < 0.15) return "faint";
  if (share < 0.3) return "grave";
  if (share <= 0.5) return "weak";
  return "fine";
}

export function bleedOf(body: Body, harm: Harm, id: number): number {
  return body.segments[id]?.bleed ?? harm.nodeBleed[id] ?? 0;
}

/** The element losing the most blood, or null when nothing bleeds: what a free hand binds first. */
export function worstBleed(body: Body, harm: Harm): number | null {
  let best: number | null = null;
  let most = 0;
  for (const id of [...nodeIds(body), ...segmentIds(body)]) {
    const b = bleedOf(body, harm, id);
    if (b > most) {
      most = b;
      best = id;
    }
  }
  return best;
}

export function totalBleed(body: Body, harm: Harm): number {
  let sum = 0;
  for (const id of segmentIds(body)) sum += body.segments[id]!.bleed;
  for (const id of sortedIds(harm.nodeBleed)) sum += harm.nodeBleed[id]!;
  return sum;
}

function painless(body: Body): boolean {
  for (const s of organSlots(body)) if (s.organ.kind === "noPain") return true;
  return false;
}

type PainLevel = "calm" | "tremor" | "spasm" | "out";

function painLevel(st: OrganHarm | undefined): PainLevel {
  if ((st?.out ?? 0) > 0) return "out";
  const p = st?.pain ?? 0;
  if (p >= SPASM) return "spasm";
  if (p >= TREMOR) return "tremor";
  return "calm";
}

interface MindOf {
  brain: Brain;
  key: string;
  pain: number;
  level: PainLevel;
  hurt: boolean;
  /** Channels of the kind x integrity x blood (mind.ts), before pain. */
  base: number;
  /** After pain, a hurt brain, a blackout, blood loss and a chill. */
  power: number;
}

interface MindState {
  brains: MindOf[];
  power: number;
  load: number;
  /** Organs acting by themselves this turn for want of channels. */
  loose: number;
  conscious: boolean;
  /** Who drives the body while you are out: a brain key, "reflex", or "nobody". */
  driver: string | null;
}

export function mindState(body: Body, harm: Harm): MindState {
  const level = bloodLevel(body, harm);
  const slots = organSlots(body);
  const keys = new Map(slots.map((s) => [s.organ, s.key]));
  const list: MindOf[] = [];
  for (const p of brainPowers(body)) {
    const key = keys.get(p.brain.organ) ?? p.brain.key;
    const st = harm.organs[key];
    const pain = st?.pain ?? 0;
    let power = p.power * (1 - pain / 100) * (st?.hurt === true ? 0.5 : 1);
    if ((st?.out ?? 0) > 0) power = 0;
    if (power > 0 && level === "grave") power -= 2;
    if (power > 0 && harm.chill !== null && harm.chill.stage >= 2) power -= 1;
    list.push({ brain: p.brain, key, pain, level: painLevel(st), hurt: st?.hurt === true, base: p.power, power: Math.max(0, power) });
  }
  const power = list.reduce((s, b) => s + b.power, 0);
  const load = mentalLoad(body).total;
  const me = list.find((b) => b.brain.self);
  const conscious = harm.dead === null && me !== undefined && me.level !== "out" && me.brain.alive;
  let driver: string | null = null;
  if (!conscious && harm.dead === null) {
    const other = list.find((b) => !b.brain.self && b.brain.alive && b.level !== "out" && b.brain.head !== null);
    const reflex = list.find((b) => !b.brain.self && b.brain.alive && b.level !== "out");
    driver = other?.key ?? (reflex !== undefined ? "reflex" : "nobody");
  }
  return { brains: list, power, load, loose: Math.max(0, Math.ceil(load - power)), conscious, driver };
}

// ---------------------------------------------------------------- where a blow lands

interface Candidate {
  kind: PartKind;
  id: number;
  weight: number;
}

/**
 * Where a blow falls by itself: the openness of the model (body-graph.md §10),
 * read off `derive/exposure.ts` and not written here a second time. This file
 * kept its own copy of that formula for as long as both existed, so the table
 * a screen showed and the table a blow obeyed were two things that only looked
 * alike - and every tuning of the wrong one changed nothing (decision 590).
 */
function openness(body: Body): Candidate[] {
  return exposure(body).parts.map((p) => ({ kind: p.kind, id: p.id, weight: p.weight }));
}

function pick<T extends { weight: number }>(list: readonly T[], rng: Rng): T | undefined {
  const total = list.reduce((s, c) => s + c.weight, 0);
  if (total <= 0) return undefined;
  let r = rng.next() * total;
  for (const c of list) {
    r -= c.weight;
    if (r < 0) return c;
  }
  return list.filter((c) => c.weight > 0).at(-1);
}

function hurtNow(body: Body, id: number): boolean {
  const el = body.nodes[id] ?? body.segments[id];
  return el !== undefined && el.hp < el.hpMax;
}

/** Elements within two lengths of an ending that stands: all a small biter reaches. */
function lowElements(body: Body): Set<number> {
  const out = new Set<number>();
  for (const id of nodeIds(body)) {
    if (!body.nodes[id]!.ends.some((e) => (specOf(e).stand ?? 0) > 0)) continue;
    const d = distances(body, { node: id });
    for (const n of nodeIds(body)) if ((d[n] ?? Infinity) <= 2) out.add(n);
    for (const s of segmentIds(body)) {
      const seg = body.segments[s]!;
      if (Math.min(d[seg.a] ?? Infinity, d[seg.b] ?? Infinity) < 2) out.add(s);
    }
  }
  return out;
}

/** What an aimed blow goes for by default: the element that holds your brain. */
function defaultAim(body: Body): number {
  return selfElement(body);
}

export function aimChance(body: Body): number {
  const m = mass(body);
  return m <= 0 ? 1 : Math.min(1, (AIM_BASE * 100) / m);
}

function chooseTarget(body: Body, blow: Blow, rng: Rng, events: HarmEvent[]): Candidate | undefined {
  const all = openness(body);
  const find = (id: number): Candidate | undefined => {
    if (body.nodes[id] !== undefined) return { kind: "node", id, weight: 1 };
    if (body.segments[id] !== undefined) return { kind: "segment", id, weight: 1 };
    if (body.membranes[id] !== undefined) return { kind: "membrane", id, weight: 1 };
    return undefined;
  };
  if (blow.profile === "at" && blow.aim !== undefined) return find(blow.aim);
  if (blow.profile === "aimed") {
    const aim = blow.aim ?? defaultAim(body);
    if (rng.next() < aimChance(body)) {
      const c = find(aim);
      if (c !== undefined) return c;
    }
    events.push({ k: "miss", aim });
    return pick(all, rng);
  }
  if (blow.profile === "wound") return pick(all.map((c) => ({ ...c, weight: c.weight * (c.kind !== "membrane" && hurtNow(body, c.id) ? 3 : 1) })), rng);
  if (blow.profile === "low") {
    const low = lowElements(body);
    const reach = all.filter((c) => c.kind !== "membrane" && low.has(c.id));
    return pick(reach, rng) ?? pick(all, rng);
  }
  return pick(all, rng);
}

/** A segment's cover; a node wears the weakest cover of its segments. */
export function defenseOf(body: Body, id: number): number {
  const seg = body.segments[id];
  if (seg !== undefined) return COVERS[seg.cover].defense;
  const around = segmentsAt(body, id).map((s) => COVERS[body.segments[s]!.cover].defense);
  return around.length === 0 ? 0 : Math.min(...around);
}

/**
 * The cover a blow of this type meets on the element, by the cover's guard of
 * that type (decision 1262); a node wears the weakest guard of its segments. A
 * squeeze crushes and does not cut: it presses through half the blunt guard
 * (strike.md §1.7).
 */
export function coverAgainst(body: Body, id: number, type: HitType): number {
  const kind: GuardType = type === "squeeze" ? "blunt" : type;
  const of = (sid: number): number => COVERS[body.segments[sid]!.cover].guard[kind];
  const seg = body.segments[id];
  const around = seg !== undefined ? [of(id)] : segmentsAt(body, id).map(of);
  const g = around.length === 0 ? 0 : Math.min(...around);
  return type === "squeeze" ? Math.floor(g * SQUEEZE_COVER) : g;
}

// ---------------------------------------------------------------- pain

function elementPlace(body: Body, id: number): Place {
  return body.nodes[id] !== undefined ? { node: id } : { segment: id };
}

/** Living brains by their claim on the element: nearest first, a foreign brain closer by half its sway. */
function nearestBrains(body: Body, id: number): { brain: Brain; key: string }[] {
  const keys = new Map(organSlots(body).map((s) => [s.organ, s.key]));
  const to = elementPlace(body, id);
  const list: { brain: Brain; key: string; claim: number; i: number }[] = [];
  brains(body).forEach((b, i) => {
    if (!b.alive) return;
    const d = placeDistance(body, b.place, to);
    if (d === undefined) return;
    list.push({ brain: b, key: keys.get(b.organ) ?? b.key, claim: b.self ? d : d - b.sway / 2, i });
  });
  list.sort((x, y) => x.claim - y.claim || x.i - y.i);
  return list;
}

/** Hp of the body's flesh: every node and every segment, a flank (no length, no mass) aside. */
export function bodyHp(body: Body): number {
  let hp = 0;
  for (const n of Object.values(body.nodes)) hp += n.hpMax;
  for (const s of Object.values(body.segments)) if (s.kind !== "flank") hp += s.hpMax;
  return hp;
}

let humanHp: number | undefined;

/** The human's `bodyHp`: the body the table of pain (damage.md §4) is written for. */
export function humanBodyHp(): number {
  return (humanHp ??= bodyHp(human()));
}

/**
 * How much of the table's pain a wound is to this body (decision 1280): the
 * share of the body it takes, measured against the human's. The table is the
 * human's; a body of ten humans' hp feels a tenth of it, a rat three times.
 */
export function painScale(body: Body): number {
  return humanBodyHp() / Math.max(1, bodyHp(body));
}

/**
 * Pain of a wound to the nearest brains: all of it, half, a quarter. Anything
 * that hurts a body from outside the track calls this with the amount of the
 * table; the share of the body it is comes off here (`painScale`).
 */
export function hurtBrains(body: Body, harm: Harm, id: number, raw: number): PainShare[] {
  if (raw <= 0 || painless(body)) return [];
  const amount = Math.round(raw * painScale(body));
  if (amount <= 0) return [];
  const out: PainShare[] = [];
  const list = nearestBrains(body, id).slice(0, 3);
  list.forEach((b, i) => {
    const st = stateOf(harm, b.key);
    const share = Math.floor((amount / 2 ** i) * (st.hurt === true ? 2 : 1));
    if (share <= 0) return;
    st.pain = Math.min(100, (st.pain ?? 0) + share);
    out.push({ key: b.key, amount: share });
  });
  return out;
}

// ---------------------------------------------------------------- organs hit

function organsIn(body: Body, id: number): OrganSlot[] {
  return organSlots(body).filter((s) => s.element === id && s.organ.kind !== "head");
}

/** Removes one organ from where it sits. */
function dropOrgan(body: Body, harm: Harm, slot: OrganSlot): void {
  stable(body, harm, () => {
    delete harm.organs[slot.key];
    const node = body.nodes[slot.element];
    if (node !== undefined) {
      for (const e of node.ends) if (e.contents !== undefined) e.contents = e.contents.filter((c) => c !== slot.organ);
      node.ends = node.ends.filter((e) => e !== slot.organ);
    } else {
      const s = body.segments[slot.element]!;
      s.cavity = s.cavity.filter((o) => o !== slot.organ);
      s.growths = s.growths.filter((o) => o !== slot.organ);
    }
    body.meat -= organMass(slot.organ);
    touch(body);
  });
}

// ---------------------------------------------------------------- losing parts

function pieceOf(body: Body, nodes: { id: number; ends: Organ[] }[], segments: { id: number; cavity: Organ[]; growths: Organ[] }[], m: number, fate: Fate): Piece {
  const organs: Organ["kind"][] = [];
  for (const n of nodes) for (const e of n.ends) organs.push(e.kind, ...(e.contents ?? []).map((c) => c.kind));
  for (const s of segments) for (const o of [...s.cavity, ...s.growths]) organs.push(o.kind);
  void body;
  return { nodes: nodes.map((n) => n.id).sort((a, b) => a - b), segments: segments.map((s) => s.id).sort((a, b) => a - b), organs, mass: m, fate };
}

interface FallenNode {
  id: number;
  ends: Organ[];
}

interface FallenSegment {
  id: number;
  a: number;
  b: number;
  length: number;
  girth: number;
  cavity: Organ[];
  growths: Organ[];
}

/**
 * What a part that fell off by itself is once it is on its own: the same rule
 * as `fateOf` of a cut (body-graph.md §6), read on what fell, because the body
 * does not hold it any more. A brain in a growth does not make a creature, as
 * it does not when the part is cut off.
 */
function fateOfFallen(nodes: readonly FallenNode[], segments: readonly FallenSegment[]): Fate {
  const has = (kind: "brain" | "heart"): boolean => nodes.some((n) => hasKind(n.ends, kind)) || segments.some((s) => hasKind(s.cavity, kind));
  const brain = has("brain");
  const heart = has("heart");
  if (brain && heart) return "creature";
  if (brain) return "brainOnly";
  if (heart) return "heartOnly";
  return "meat";
}

/**
 * The elements that fell in one tick, split into the parts they fell as: a
 * segment ties the nodes at its ends together. Two limbs that rot off at once
 * are two pieces with two fates, not one heap.
 */
function fallenParts(nodes: readonly FallenNode[], segments: readonly FallenSegment[]): { nodes: FallenNode[]; segments: FallenSegment[] }[] {
  const root = new Map<number, number>();
  const find = (x: number): number => {
    let at = x;
    while (root.get(at) !== at) at = root.get(at) ?? at;
    return at;
  };
  for (const n of nodes) root.set(n.id, n.id);
  for (const s of segments) root.set(s.id, s.id);
  const join = (x: number, y: number): void => {
    if (!root.has(x) || !root.has(y)) return;
    const a = find(x);
    const b = find(y);
    if (a !== b) root.set(b, a);
  };
  for (const s of segments) {
    join(s.id, s.a);
    join(s.id, s.b);
  }
  const parts = new Map<number, { nodes: FallenNode[]; segments: FallenSegment[] }>();
  const at = (id: number): { nodes: FallenNode[]; segments: FallenSegment[] } => {
    const key = find(id);
    const got = parts.get(key);
    if (got !== undefined) return got;
    const made = { nodes: [], segments: [] };
    parts.set(key, made);
    return made;
  };
  for (const n of nodes) at(n.id).nodes.push(n);
  for (const s of segments) at(s.id).segments.push(s);
  return [...parts.entries()].sort((x, y) => x[0] - y[0]).map(([, p]) => p);
}

/** The end of a segment nearer your brain: the torn part is the other side. */
function nearEnd(body: Body, segId: number): "a" | "b" {
  const s = body.segments[segId]!;
  const me = selfRef(body);
  if (me === undefined) return "a";
  const d = distances(body, "node" in me ? { node: me.node } : { segment: me.segment });
  return (d[s.a] ?? Infinity) <= (d[s.b] ?? Infinity) ? "a" : "b";
}

function holdsSelf(body: Body, id: number): boolean {
  return selfElement(body) === id;
}

/** Your brain is gone: the nearest living brain takes over, or you are dead. */
function afterSelfLost(body: Body, harm: Harm, events: HarmEvent[]): void {
  if (harm.dead !== null) return;
  const me = selfRef(body);
  if (me !== undefined && brainOrganAt(body, me) !== undefined && brains(body).find((b) => b.self)?.alive === true) return;
  const next = nearestLiving(body);
  if (next === null) {
    die(harm, "brain", events);
    return;
  }
  // Not through `stable`: it keeps the brain that was yours as yours, and that brain is the dead one (decision 1301).
  setSelf(body, next);
  events.push({ k: "handover", to: keyOf(body, brainOrganAt(body, next)!) ?? "" });
}

function nearestLiving(body: Body): BrainRef | null {
  const list = brains(body).filter((b) => b.alive && !b.self);
  if (list.length === 0) return null;
  const from = selfElement(body);
  const fromPlace: Place = body.nodes[from] !== undefined ? { node: from } : body.segments[from] !== undefined ? { segment: from } : list[0]!.place;
  let best = list[0]!;
  let bestD = Infinity;
  for (const b of list) {
    const d = placeDistance(body, fromPlace, b.place) ?? Infinity;
    if (d < bestD) {
      best = b;
      bestD = d;
    }
  }
  return best.ref;
}

function die(harm: Harm, cause: DeathCause, events: HarmEvent[]): void {
  if (harm.dead !== null) return;
  harm.dead = cause;
  events.push({ k: "death", cause });
}

function tearSegment(body: Body, harm: Harm, segId: number, events: HarmEvent[]): void {
  const seg = body.segments[segId]!;
  if (holdsSelf(body, segId)) {
    // A torso torn apart takes the brain in it; you move first, then the flesh goes.
    for (const slot of organsIn(body, segId)) dropOrgan(body, harm, slot);
    afterSelfLost(body, harm, events);
    if (harm.dead !== null) return;
  }
  if (!bridges(body).includes(segId)) {
    stable(body, harm, () => {
      body.meat -= organsIn(body, segId).reduce((s, o) => s + organMass(o.organ), 0);
      removeSegment(body, segId);
      tearMembranes(body);
      touch(body);
    });
    events.push({ k: "vanished", segment: segId });
    return;
  }
  const end = nearEnd(body, segId);
  const near = end === "a" ? seg.a : seg.b;
  const r = stable(body, harm, () => cut(body, segId, end));
  const pieces = r.others.map((o) => {
    const nodes = r.removed.nodes.filter((n) => o.part.nodes.includes(n.id));
    const segments = r.removed.segments.filter((s) => o.part.segments.includes(s.id));
    let m = 0;
    for (const s of segments) m += s.length * s.girth; // rough flesh of the part for the bleed
    for (const n of nodes) for (const e of n.ends) m += organMass(e);
    for (const s of segments) for (const x of [...s.cavity, ...s.growths]) m += organMass(x);
    return pieceOf(body, nodes, segments, m, o.fate);
  });
  let bleed = 4 * seg.girth;
  for (const p of pieces) if (p.organs.includes("heart") || p.segments.some((id) => r.removed.segments.find((s) => s.id === id)?.kind === "torso")) bleed += Math.ceil(p.mass / 10);
  harm.nodeBleed[near] = (harm.nodeBleed[near] ?? 0) + bleed;
  events.push({ k: "torn", segment: segId, stump: near, bleed, pieces });
}

function crushNode(body: Body, harm: Harm, nodeId: number, events: HarmEvent[]): void {
  const node = body.nodes[nodeId]!;
  const lost: Organ["kind"][] = [];
  const hadHead = node.ends.some((e) => e.kind === "head");
  const mine = holdsSelf(body, nodeId);
  for (const e of node.ends) lost.push(e.kind, ...(e.contents ?? []).map((c) => c.kind));
  stable(body, harm, () => {
    for (const e of node.ends) body.meat -= organMass(e);
    node.ends = [];
    touch(body);
  });
  const bleed = hadHead ? 15 : 2 * node.size;
  harm.nodeBleed[nodeId] = (harm.nodeBleed[nodeId] ?? 0) + bleed;
  events.push({ k: "crushed", node: nodeId, lost, bleed });
  if (mine) afterSelfLost(body, harm, events);
}

// ---------------------------------------------------------------- doses past the cover

/**
 * Damage the cover never held: a discharge as it lands, a dose of venom when
 * its turns run out. It wounds the element and hurts the brains around it, and
 * stops one point short of destroying anything - venom breaks a limb, it does
 * not tear one off.
 */
function dose(body: Body, harm: Harm, owed: Owed, events: HarmEvent[]): void {
  const el = body.nodes[owed.id] ?? body.segments[owed.id];
  if (el === undefined || owed.amount <= 0) return;
  const floor = -Math.floor(el.hpMax / 2) + 1;
  el.hp = Math.max(floor, el.hp - owed.amount);
  el.wound = 20;
  touch(body);
  const pain = hurtBrains(body, harm, owed.id, Math.round(owed.amount / 2));
  events.push({ k: "dose", kind: owed.kind, id: owed.id, amount: owed.amount, pain });
}

// ---------------------------------------------------------------- the blow

/** One blow. Returns what happened, in order. */
export function strike(body: Body, harm: Harm, blow: Blow, rng: Rng): HarmEvent[] {
  const events: HarmEvent[] = [];
  if (harm.dead !== null) return events;
  const target = chooseTarget(body, blow, rng, events);
  if (target === undefined) return events;

  if (target.kind === "membrane") {
    const m = body.membranes[target.id]!;
    const lost = Math.ceil(blow.damage / 3);
    m.area -= lost;
    const torn = m.area <= 0;
    if (torn) delete body.membranes[target.id];
    touch(body);
    events.push({ k: "membrane", id: target.id, lost, torn });
    return events;
  }

  const el = (body.nodes[target.id] ?? body.segments[target.id])!;
  const type = blow.type ?? "blunt";
  const defense = coverAgainst(body, target.id, type);
  // A blow the cover holds whole does nothing to the flesh (decision 1282): a fist does not get through a scale.
  const damage = Math.max(0, blow.damage - defense);
  const through = damage > 0;
  const before = elementState(el.hp, el.hpMax);
  el.hp -= damage;
  // A crushing blow breaks: a part left with a quarter of itself does not stand.
  if (through && type === "blunt" && el.hp > 0 && el.hp <= el.hpMax * CRUSH_SHARE) el.hp = 0;
  if (through) el.wound = 20;
  const after = elementState(el.hp, el.hpMax);
  const seg = body.segments[target.id];
  const was = seg !== undefined ? seg.bleed : (harm.nodeBleed[target.id] ?? 0);
  const now = Math.max(was, Math.floor((el.hpMax - Math.max(el.hp, -el.hpMax)) / BLEED_PER_HP));
  const bleed = now - was;
  if (seg !== undefined) seg.bleed = now;
  else if (now > 0) harm.nodeBleed[target.id] = now;
  touch(body);

  let pain = damage / 2 + (through && blow.burn === true ? 5 : 0);
  if (before !== "broken" && before !== "destroyed" && after === "broken") pain += 20;
  const destroyedNow = after === "destroyed" && before !== "destroyed";
  if (destroyedNow) pain += 35;

  // An organ inside may take it: the harder the blow for its place, the likelier.
  const organEvents: HarmEvent[] = [];
  const inside = organsIn(body, target.id);
  // A piercing blow reaches the cavity: liquid, a spike and a discharge find what is inside twice as often.
  const deep = type === "pierce" ? PIERCE_DEEPER : 1;
  if (inside.length > 0 && after !== "destroyed" && rng.next() < Math.min(1, (deep * damage) / el.hpMax)) {
    const slot = pick(
      inside.map((s) => ({ ...s, weight: Math.max(0.5, organMass(s.organ)) })),
      rng,
    )!;
    const st = stateOf(harm, slot.key);
    if (st.hurt === true) {
      organEvents.push({ k: "organ", key: slot.key, kind: slot.organ.kind, result: "destroyed", where: target.id });
      pain += 20;
      const wasSelf = isBrainKind(slot.organ.kind) && brains(body).some((b) => b.self && b.organ === slot.organ);
      dropOrgan(body, harm, slot);
      if (wasSelf) afterSelfLost(body, harm, organEvents);
    } else {
      st.hurt = true;
      st.mend = 0;
      organEvents.push({ k: "organ", key: slot.key, kind: slot.organ.kind, result: "hurt", where: target.id });
      pain += 10;
    }
  }

  const shares = hurtBrains(body, harm, target.id, Math.round(pain));
  events.push({ k: "hit", id: target.id, kind: target.kind, raw: blow.damage, defense, damage, before, after, bleed, pain: shares });
  events.push(...organEvents);

  if (blow.dirty === true && harm.infection[target.id] === undefined && after !== "destroyed" && rng.next() < damage * DIRTY_PER_DAMAGE) {
    harm.infection[target.id] = { stage: 1, turns: 0, rest: 0 };
    events.push({ k: "infected", id: target.id });
  }

  // What the blow carried on top of its die (strike.md §1.6). A discharge and
  // acid tell at once; venom waits out its turns in the blood.
  for (const d of blow.doses ?? []) {
    if (d.amount <= 0) continue;
    const owed: Owed = { kind: d.kind, amount: d.amount, turns: d.delay, id: target.id };
    if (d.delay > 0) {
      harm.doses.push(owed);
      events.push({ k: "owed", kind: d.kind, id: target.id, turns: d.delay });
    } else dose(body, harm, owed, events);
  }

  // A cutting blow takes a broken part off; everything else waits until it is destroyed.
  const severs = through && type === "cut" && target.kind === "segment" && (after === "broken" || after === "destroyed");
  if ((destroyedNow || severs) && harm.dead === null) {
    if (target.kind === "segment") tearSegment(body, harm, target.id, events);
    else crushNode(body, harm, target.id, events);
  }
  clampBlood(body, harm);
  checkDeath(body, harm, events);
  return events;
}

/** Blood never stands above what the living mass holds: whoever cuts a body down calls this after. */
function clampBlood(body: Body, harm: Harm): void {
  harm.blood = Math.min(harm.blood, bloodMax(body));
}

function checkDeath(body: Body, harm: Harm, events: HarmEvent[]): void {
  if (harm.dead !== null) return;
  if (harm.blood <= 0) {
    harm.blood = 0;
    die(harm, "blood", events);
    return;
  }
  if (mass(body) <= 0) {
    die(harm, "mass", events);
    return;
  }
  if (!brains(body).some((b) => b.alive)) die(harm, "brain", events);
}

// ---------------------------------------------------------------- hands on

/** A bandage: a bleed up to 8 stops, a bigger one loses 8. */
export function bandage(body: Body, harm: Harm, id: number): HarmEvent[] {
  if (harm.dead !== null) return [];
  const seg = body.segments[id];
  const was = bleedOf(body, harm, id);
  const now = was <= 8 ? 0 : was - 8;
  if (seg !== undefined) seg.bleed = now;
  else if (body.nodes[id] !== undefined) {
    if (now === 0) delete harm.nodeBleed[id];
    else harm.nodeBleed[id] = now;
  } else return [];
  return [{ k: "bandaged", id, bleed: was - now }];
}

/** Burning the wound shut: every bleed stops, a festering wound is gone, +15 pain. */
export function cauterize(body: Body, harm: Harm, id: number): HarmEvent[] {
  if (harm.dead !== null) return [];
  const seg = body.segments[id];
  if (seg !== undefined) seg.bleed = 0;
  else if (body.nodes[id] !== undefined) delete harm.nodeBleed[id];
  else return [];
  delete harm.infection[id];
  return [{ k: "cauterized", id, pain: hurtBrains(body, harm, id, 15) }];
}

export function feed(harm: Harm, amount: number): HarmEvent[] {
  if (harm.dead !== null) return [];
  harm.reserve += amount;
  return [{ k: "ate", amount }];
}

/**
 * The metabolic reserve pays for something: a blow of the body (strike.md
 * §1.8), a mutation, anything with a price in `cost`. It never goes below
 * empty, and nobody outside the track takes it off by hand.
 */
export function spend(harm: Harm, amount: number): void {
  harm.reserve = Math.max(0, harm.reserve - amount);
}

export function infect(harm: Harm, id: number): HarmEvent[] {
  if (harm.infection[id] !== undefined) return [];
  harm.infection[id] = { stage: 1, turns: 0, rest: 0 };
  return [{ k: "infected", id }];
}

export function catchChill(harm: Harm): HarmEvent[] {
  if (harm.chill !== null) return [];
  harm.chill = { stage: 1, turns: 0, rest: 0, starved: false };
  return [{ k: "chill", stage: 1 }];
}

// ---------------------------------------------------------------- air

/** What the body's breath is this turn, off `derive(body).breath`. */
export interface Air {
  /** Drawn per turn in the medium the body breathes best. */
  intake: number;
  /** Spent at rest. */
  base: number;
  /** The common tank at its fullest. */
  tank: number;
  /** What the hearts carry to the muscles in a turn at most. */
  delivery: number;
}

/** An action's muscle air (`effort` of derive/breath.ts), owed until the next `breathe`. */
export function exert(harm: Harm, air: number): void {
  if (air > 0) harm.work = (harm.work ?? 0) + air;
}

/** Muscles at the top of their acid: no blow, no dig, no flight (breath.md §3). */
export function winded(harm: Harm): boolean {
  return (harm.acid ?? 0) >= ACID_MAX;
}

/**
 * One turn of air (decisions 1277, 1294; breath.md §1, §3, §4). The rest is
 * paid first: by the draw when the body draws anything, from the common tank
 * when it draws nothing, and with that tank empty its brains die after
 * `SUFFOCATION_TURNS`. Then the muscles pay what the turn's actions owe
 * (`exert`): a turn of work past the draw is the burst's while it has
 * charges; otherwise up to the hearts' delivery from what is left of the
 * draw and then from the tank, and the rest without oxygen - acid and
 * reserve, `ACID_PER_AIR` each per unit, acid up to `ACID_MAX`. What is left
 * of the draw pays the acid off, then fills the tank. The medium is the
 * body's own - the world has no water yet - and the muscle tank of §1 is not
 * kept apart: the burst stands for it.
 */
export function breathe(harm: Harm, air: Air, events: HarmEvent[] = []): HarmEvent[] {
  if (harm.dead !== null) return events;
  const work = harm.work ?? 0;
  delete harm.work;
  let left = Math.min(air.tank, harm.air ?? air.tank);
  let spare = air.intake > 0 ? Math.max(0, air.intake - air.base) : 0;
  if (air.intake <= 0) left = Math.max(0, left - air.base);
  const over = air.base + work > air.intake;
  let owed = 0;
  if (work > 0 && over && BURST - (harm.burst ?? 0) >= 1) harm.burst = (harm.burst ?? 0) + 1;
  else if (work > 0) {
    const fed = Math.min(work, air.delivery);
    const fromDraw = Math.min(spare, fed);
    spare -= fromDraw;
    const fromTank = Math.min(left, fed - fromDraw);
    left -= fromTank;
    owed = work - fromDraw - fromTank;
  }
  if (!over && harm.burst !== undefined) {
    harm.burst -= 1 / BURST_RECOVERY;
    if (harm.burst <= 0) delete harm.burst;
  }
  let acid = harm.acid ?? 0;
  const sour = Math.min(ACID_MAX - acid, ACID_PER_AIR * owed);
  harm.reserve = Math.max(0, harm.reserve - sour);
  // The draw pays the whole debt off before the top is taken (breath.md §3, S-breath-07): capped first, a body
  // owing past the top with a wide draw paid the cap off in the same turn and never winded.
  acid += ACID_PER_AIR * owed;
  const paid = Math.min(spare, acid / ACID_PER_AIR);
  acid = Math.min(ACID_MAX, acid - paid * ACID_PER_AIR);
  spare -= paid;
  if (acid > 1e-9) harm.acid = acid;
  else delete harm.acid;
  const now = Math.min(air.tank, left + spare);
  const breathless = now <= 0 && air.intake <= 0 ? (harm.breathless ?? 0) + 1 : 0;
  if (now >= air.tank - 1e-9) delete harm.air;
  else harm.air = now;
  if (breathless > 0) harm.breathless = breathless;
  else delete harm.breathless;
  if (breathless >= SUFFOCATION_TURNS) die(harm, "brain", events);
  return events;
}

// ---------------------------------------------------------------- a turn

export interface TurnOptions {
  /** Resting in a safe place: healing and the ebb of pain twice as fast, sickness recedes. */
  rest?: boolean;
  /** The body burns its upkeep from the reserve. */
  upkeep?: boolean;
  /** Knitting: the reserve is thrown at the wounds, `KNIT_PACE` times faster and `KNIT_TAX` times dearer. */
  knit?: boolean;
}

/** Where a festering wound creeps: the nodes at the ends of a segment, the segments at a node. */
function neighbours(body: Body, id: number): number[] {
  const seg = body.segments[id];
  if (seg !== undefined) return [seg.a, seg.b].filter((n) => body.nodes[n] !== undefined);
  return segmentsAt(body, id);
}

function dice(rng: Rng, sides: number): number {
  return 1 + Math.floor(rng.next() * sides);
}

/** Organs that ask for channels in a brain's territory, with their distance from it. */
function territoryOrgans(body: Body, brainIndex: number): { slot: OrganSlot; d: number }[] {
  const own = ownership(body);
  const nodes = new Set<number>();
  for (const [n, i] of own.owner) if (i === brainIndex) nodes.add(n);
  const dist = own.dist[brainIndex] ?? {};
  const out: { slot: OrganSlot; d: number }[] = [];
  for (const slot of organSlots(body)) {
    if (organControl(slot.organ) <= 0) continue;
    const s = body.segments[slot.element];
    const inside = s !== undefined ? nodes.has(s.a) && nodes.has(s.b) : nodes.has(slot.element);
    if (!inside) continue;
    const d = s !== undefined ? Math.min(dist[s.a] ?? 0, dist[s.b] ?? 0) : (dist[slot.element] ?? 0);
    out.push({ slot, d });
  }
  return out;
}

function sick(harm: Harm, s: Sickness, rest: boolean): boolean {
  // One step of a sickness: it ages twice as fast on an empty reserve, recedes on a fed rest.
  s.turns += harm.reserve <= 0 ? 2 : 1;
  if (rest && harm.reserve >= FED_RESERVE) {
    s.rest += 1;
    if (s.rest >= CURE_EVERY) {
      s.rest = 0;
      if (s.stage === 1) return true;
      s.stage = (s.stage - 1) as 1 | 2;
      s.turns = s.stage === 1 ? 0 : FESTER_AT;
    }
  } else s.rest = 0;
  return false;
}

/** One turn of the wounded body. */
export function turn(body: Body, harm: Harm, opts: TurnOptions, rng: Rng): HarmEvent[] {
  const events: HarmEvent[] = [];
  if (harm.dead !== null) return events;
  const rest = opts.rest === true;
  harm.turn += 1;

  // Upkeep: the reserve pays for the body; a chill burns a fifth more.
  if (opts.upkeep !== false) {
    // Dead flesh is carried, not fed: only what the blood reaches costs anything.
    const burn = upkeepOf(body, bloodReach(body)) * (harm.chill !== null ? 1.2 : 1);
    harm.reserve = Math.max(0, harm.reserve - burn);
  }
  if (harm.reserve <= 0) {
    events.push({ k: "starving" });
    if (harm.chill !== null) harm.chill.starved = true;
    // With nothing left to burn the body eats itself, one rung of `hunger.ts` at a time.
    const bite = stable(body, harm, () => starveTurn(body, harm.starve));
    if (bite !== null) {
      events.push({ k: "gnawed", bite });
      afterSelfLost(body, harm, events);
      clampBlood(body, harm);
      checkDeath(body, harm, events);
      if (harm.dead !== null) return events;
    }
  } else resetStarve(harm.starve);

  // Bleeding, then small bleeds clot.
  const bled = totalBleed(body, harm);
  if (bled > 0) {
    harm.blood -= bled;
    events.push({ k: "bled", amount: bled });
  }
  if (harm.turn % CLOT_EVERY === 0) {
    for (const id of segmentIds(body)) {
      const s = body.segments[id]!;
      if (s.bleed > 0 && s.bleed < BIG_BLEED) {
        s.bleed -= 1;
        if (s.bleed === 0) events.push({ k: "clot", id });
      }
    }
    for (const id of sortedIds(harm.nodeBleed)) {
      const b = harm.nodeBleed[id]!;
      if (b < BIG_BLEED) {
        if (b <= 1) {
          delete harm.nodeBleed[id];
          events.push({ k: "clot", id });
        } else harm.nodeBleed[id] = b - 1;
      }
    }
  }
  checkDeath(body, harm, events);
  if (harm.dead !== null) return events;

  // Venom bitten in a few turns ago tells now, and the cover never held it.
  if (harm.doses.length > 0) {
    const due: Owed[] = [];
    const left: Owed[] = [];
    for (const d of harm.doses) {
      const owed = { ...d, turns: d.turns - 1 };
      if (owed.turns <= 0) due.push(owed);
      else left.push(owed);
    }
    harm.doses = left;
    for (const d of due) dose(body, harm, d, events);
    checkDeath(body, harm, events);
    if (harm.dead !== null) return events;
  }

  // Blood by the graph: wounds age (a festering one does not), what has no path to a heart starves.
  for (const id of [...nodeIds(body), ...segmentIds(body)]) {
    const el = (body.nodes[id] ?? body.segments[id])!;
    if (el.wound > 0 && harm.infection[id] === undefined) el.wound -= 1;
  }
  const beating = hearts(body);
  const allHeartsHurt = beating.length > 0 && beating.every((sid) => organsIn(body, sid).filter((s) => s.organ.kind === "heart").every((s) => harm.organs[s.key]?.hurt === true));
  const brainsBefore = brains(body).map((b) => ({ organ: b.organ, alive: b.alive }));
  for (let pass = 0; pass < (allHeartsHurt ? 2 : 1); pass++) {
    const r = stable(body, harm, () => {
      const snapshot = new Map([...nodeIds(body), ...segmentIds(body)].map((id) => [id, structuredClone(body.nodes[id] ?? body.segments[id])]));
      const ev = ischemiaTick(body);
      return { ev, snapshot };
    });
    if (r.ev.necrotic.length > 0) events.push({ k: "necrosis", ids: r.ev.necrotic });
    if (r.ev.fallen.length > 0) {
      const nodes = r.ev.fallen.filter((id) => r.snapshot.get(id) !== undefined && "ends" in r.snapshot.get(id)!).map((id) => r.snapshot.get(id) as FallenNode);
      const segs = r.ev.fallen.filter((id) => r.snapshot.get(id) !== undefined && "cavity" in r.snapshot.get(id)!).map((id) => r.snapshot.get(id) as FallenSegment);
      // A limb that rots off is what it holds, like a limb torn off: a head on it goes on living (decision 263).
      const pieces = fallenParts(nodes, segs).map((p) => {
        let m = 0;
        for (const s of p.segments) m += s.length * s.girth;
        for (const n of p.nodes) for (const e of n.ends) m += organMass(e);
        for (const s of p.segments) for (const x of [...s.cavity, ...s.growths]) m += organMass(x);
        return pieceOf(body, p.nodes, p.segments, m, fateOfFallen(p.nodes, p.segments));
      });
      events.push({ k: "fallen", ids: r.ev.fallen, pieces });
    }
  }
  for (const b of brains(body)) {
    const was = brainsBefore.find((x) => x.organ === b.organ);
    if (was?.alive === true && !b.alive) events.push({ k: "brainDead", key: keyOf(body, b.organ) ?? b.key });
  }
  afterSelfLost(body, harm, events);
  checkDeath(body, harm, events);
  if (harm.dead !== null) return events;

  // A festering wound and a chill.
  for (const id of sortedIds(harm.infection)) {
    const s = harm.infection[id]!;
    const el = body.nodes[id] ?? body.segments[id];
    if (el === undefined) continue;
    if (sick(harm, s, rest)) {
      delete harm.infection[id];
      events.push({ k: "cured", id });
      continue;
    }
    const stage: 1 | 2 | 3 = s.turns >= GANGRENE_AT ? 3 : s.turns >= FESTER_AT ? 2 : 1;
    if (stage > s.stage) {
      s.stage = stage;
      events.push({ k: "fester", id, stage });
    }
    if (s.stage >= 2 && s.turns % 20 === 0) {
      el.hp -= 1;
      hurtBrains(body, harm, id, 1);
    }
    if (s.stage >= 2 && s.turns % 60 === 0) {
      const free = neighbours(body, id).filter((n) => harm.infection[n] === undefined);
      if (free.length > 0) {
        const to = free[Math.floor(rng.next() * free.length)]!;
        harm.infection[to] = { stage: 1, turns: 0, rest: 0 };
        events.push({ k: "spread", from: id, to });
      }
    }
    if (s.stage === 3 && el.hp > 0) el.hp = 0;
  }
  if (harm.chill !== null) {
    const c = harm.chill;
    if (sick(harm, c, rest) || (c.turns >= CHILL_PASSES_AT && !c.starved)) {
      harm.chill = null;
      events.push({ k: "cured", id: null });
    } else {
      const stage: 1 | 2 | 3 = c.turns >= CHILL_HEAT_AT ? 3 : c.turns >= CHILL_FEVER_AT ? 2 : 1;
      if (stage > c.stage) {
        c.stage = stage;
        events.push({ k: "chill", stage });
      }
      if (c.stage === 3) {
        if (c.turns % 10 === 0) for (const b of brains(body)) if (b.alive) { const k = keyOf(body, b.organ); if (k !== undefined) { const st = stateOf(harm, k); st.pain = Math.min(100, (st.pain ?? 0) + 1); } }
        if (c.turns % 20 === 0) for (const s of organSlots(body)) s.organ.instability = Math.min(100, s.organ.instability + 1);
      }
    }
  }

  // Acid in the muscles burns: a point of pain a turn to every living brain (breath.md §3, decision 1302).
  const burn = acidToll(harm.acid).burn;
  if (burn > 0) for (const b of brains(body)) if (b.alive) { const k = keyOf(body, b.organ); if (k !== undefined) { const st = stateOf(harm, k); st.pain = Math.min(100, (st.pain ?? 0) + burn); } }

  // Healing: only from the reserve, only where blood reaches.
  if (harm.reserve > 0) {
    const spentBefore = harm.reserve;
    const slow = harm.chill !== null && harm.chill.stage >= 2 ? 0.5 : 1;
    const knit = opts.knit === true;
    const pace = (rest ? 2 : 1) * slow * (knit ? KNIT_PACE : 1);
    // Hurrying costs: every point of hp and blood is dearer while the body knits.
    const tax = knit ? KNIT_TAX : 1;
    let bloodGain = 0;
    const heartSlow = allHeartsHurt ? 0.5 : 1;
    harm.bloodCarry += (pace * heartSlow) / BLOOD_EVERY;
    while (harm.bloodCarry >= 1 && harm.blood < bloodMax(body) && harm.reserve >= BLOOD_COST * tax) {
      harm.bloodCarry -= 1;
      harm.blood += 1;
      harm.reserve -= BLOOD_COST * tax;
      bloodGain += 1;
    }
    if (harm.blood >= bloodMax(body)) harm.bloodCarry = 0;
    let hpGain = 0;
    harm.healCarry += HEAL_RATE * pace;
    const reach = fed(body);
    const me = selfRef(body);
    const dist = me === undefined ? {} : distances(body, "node" in me ? { node: me.node } : { segment: me.segment });
    while (harm.healCarry >= 1 && harm.reserve >= HEAL_COST * tax) {
      const wounded = [...nodeIds(body), ...segmentIds(body)].filter((id) => {
        const el = (body.nodes[id] ?? body.segments[id])!;
        const cap = harm.infection[id] !== undefined ? Math.floor(el.hpMax / 2) : el.hpMax;
        return el.hp < cap && reach.has(id) && (harm.infection[id]?.stage ?? 0) < 3;
      });
      if (wounded.length === 0) break;
      const d = (id: number): number => {
        const seg = body.segments[id];
        return seg !== undefined ? Math.min(dist[seg.a] ?? Infinity, dist[seg.b] ?? Infinity) : (dist[id] ?? Infinity);
      };
      wounded.sort((x, y) => Number(bleedOf(body, harm, y) > 0) - Number(bleedOf(body, harm, x) > 0) || d(x) - d(y) || x - y);
      const el = (body.nodes[wounded[0]!] ?? body.segments[wounded[0]!])!;
      el.hp += 1;
      harm.healCarry -= 1;
      harm.reserve -= HEAL_COST * tax;
      hpGain += 1;
    }
    if (harm.healCarry > 1) harm.healCarry = 1;
    if (hpGain > 0 || bloodGain > 0) events.push({ k: "healed", hp: hpGain, blood: bloodGain, spent: spentBefore - harm.reserve, knit });
    for (const slot of organSlots(body)) {
      const st = harm.organs[slot.key];
      if (st?.hurt !== true) continue;
      const el = body.nodes[slot.element] ?? body.segments[slot.element];
      if (el === undefined || el.hp <= 0 || !reach.has(slot.element)) continue;
      st.mend = (st.mend ?? 0) + pace;
      if (st.mend >= MEND_TURNS && harm.reserve >= MEND_COST * tax) {
        harm.reserve -= MEND_COST * tax;
        delete st.hurt;
        delete st.mend;
        events.push({ k: "mended", key: slot.key, kind: slot.organ.kind });
      }
    }
  }

  // Pain ebbs; brains in agony black out, wake, and their territory twitches.
  harm.painCarry += (rest ? 2 : 1) / PAIN_EBB_EVERY;
  const ebb = Math.floor(harm.painCarry);
  harm.painCarry -= ebb;
  const level = bloodLevel(body, harm);
  const list = brains(body);
  list.forEach((b, index) => {
    const key = keyOf(body, b.organ);
    if (key === undefined || !b.alive) return;
    const st = stateOf(harm, key);
    if (ebb > 0 && (st.pain ?? 0) > 0) st.pain = Math.max(0, (st.pain ?? 0) - ebb);
    if ((st.awake ?? 0) > 0) st.awake! -= 1;
    if ((st.out ?? 0) > 0) {
      st.out! -= 1;
      if (st.out === 0) {
        st.awake = AWAKE_BETWEEN;
        events.push({ k: "wake", key });
      } else {
        const flail = territoryOrgans(body, index);
        if (flail.length > 0) events.push({ k: "flail", key, organs: flail.length });
      }
      return;
    }
    const pain = st.pain ?? 0;
    const canFall = (st.awake ?? 0) === 0;
    let why: "pain" | "blood" | null = null;
    if (canFall && pain >= BLACKOUT) why = "pain";
    else if (canFall && b.self && (level === "faint" || (level === "grave" && rng.next() < 0.1))) why = "blood";
    if (why !== null) {
      const turns = Math.min(MAX_BLACKOUT, dice(rng, 6) + (why === "pain" ? Math.floor((pain - BLACKOUT) / 3) : 0));
      st.out = turns;
      events.push({ k: "blackout", key, turns, why });
      return;
    }
    if (pain >= SPASM) {
      const list2 = territoryOrgans(body, index);
      const one = pick(
        list2.map((x) => ({ ...x, weight: 1 + x.d / 5 })),
        rng,
      );
      if (one !== undefined) events.push({ k: "twitch", key, organ: one.slot.organ.kind, where: one.slot.element });
    }
  });
  for (const key of Object.keys(harm.organs)) {
    const st = harm.organs[key]!;
    if (st.hurt === undefined && (st.pain ?? 0) === 0 && (st.out ?? 0) === 0 && (st.awake ?? 0) === 0) delete harm.organs[key];
  }
  checkDeath(body, harm, events);
  return events;
}
