/**
 * The body's blow (strike.md): every strike of an ending with its type, the
 * mass it moves, force and time from that mass, accuracy from three parts
 * and the nerve of the brain that leads it; the volley one command sends,
 * paid in accuracy for every strike past what a brain holds; the fold - what
 * a limb reaches on its own body when a head or a slip turns it on you.
 * Where the blow lands on a target and what it breaks there is the damage
 * track; this file hands it the rolls.
 */
import type { Body, CoverId, Organ, OrganKind, SegmentKind } from "./graph.js";
import { nodeIds, organ, otherEnd, segmentIds, selfElement, sortedIds } from "./graph.js";
import { derive } from "./derive.js";
import { JAWS, extraSources, extrasFor, headBite, reachOf, type HitType, type StrikeExtra } from "./derive/attacks.js";
import { fleshMass, torsoChains } from "./derive/context.js";
import { acidToll } from "./derive/speed.js";
import { parentSegment } from "./capability.js";
import { bloodReach, distances, works } from "./metrics.js";
import { mentalLoad, mindPower } from "./mind.js";
import { COVERS, isChrome, mass as massOf, organMass, segmentMass } from "./parts.js";
import { human } from "./human.js";
import { SQUEEZE_COVER, VENOM_TURNS, coverAgainst, mindState, strike as landBlow, type Blow, type Dose, type Harm, type HarmEvent, type Profile } from "./damage.js";
import type { Rng } from "./rng.js";
import { ownership } from "./territory.js";

// The five types the damage track tells apart live with the attacks they come from.
export type { HitType };
/** An ending, or a segment that strikes by itself: a tail lashes, a penis is a limb with an attack. */
/** A bare limb strikes as `stump`: no organ on its end, only its own length and girth (decision 126). */
type StrikeKind = OrganKind | "tail" | "penis" | "stump";

export const STRIKE = {
  /** Chance to hit at accuracy 0, and what one point of accuracy is worth. */
  base: 0.7,
  step: 0.05,
  minChance: 0.05,
  maxChance: 0.95,
  /** Accuracy every strike of a group loses for each strike past its free ones. */
  perExtra: 2,
  /** Excess channels of your brain per free strike. */
  excessPerFree: 5,
  /** Mass of the human's arm and hand: force 0, time 100. */
  unitMass: 8,
  /** Force per unit of the square root of a blow's mass past the arm's (`strikeForce`, decision 1263). */
  forcePerRoot: 4,
  /** A blow is never quicker than the human's arm: below it the command takes the turn, not the limb (decision 1298). */
  timeMin: 1,
  timeMax: 3,
  /** A head bites with the head: its mass, not the jaw's. */
  headMass: 8,
  /** Weight of an enemy in reach against your own flesh (sum 1) when an organ slips. */
  enemyWeight: 2,
  /** Body turns a grab is worth when the volley weighs it: it squeezes on every one of them without a roll (decision 1306). */
  holdTurns: 3,
  /** A bite holds: the next bite of the same mouth at the same target is this much stronger (strike.md §1.3, decision 1307). */
  biteHold: 1,
} as const;

/**
 * Getting out of the way (strike.md §1.9): a point per 25 of speed past the
 * human's 100, plus what the body sees coming, in these bounds. It lives here
 * because the volley asks for it; that a body out cold does not dodge is the
 * caller's to say, not the body's (decision 421 replaces 285).
 *
 * Sight is the second half (decision 592). The part that carries an eye is the
 * part that watches the blow, but the number a volley asks for is the body's:
 * `hitChance` is rolled before anyone knows where the blow will land, so a
 * dodge per element would be a second track of the same rule. So the body
 * counts its **seeing places** (`senses.viewpoints`). One is the human's and
 * worth nothing - it is what the 70 % of §1.4 was measured on, and a term that
 * moved it would silently re-tune every fight in the game. Eyes in a second
 * and a third place watch a second and a third side, and that is a point each:
 * the extra head a mutant grows is a liability that also keeps a lookout. A
 * body with nothing to see with takes the blow it never saw.
 */
export const DODGE = {
  base: 100,
  perStep: 25,
  min: -2,
  max: 4,
  /** Nothing sees the blow: no eye, no heat pit, no echo, no deep sense. */
  blind: -2,
  /** Every seeing place past the first, up to `sightMax`. */
  perViewpoint: 1,
  sightMax: 2,
  /** The human's bulk, and the bulk a point of dodge is worth past it (decision 1261). */
  bulk: 3,
  perBulk: 2,
} as const;

/**
 * What one seeing place is worth, a pair of eyes being one (decision 1273):
 * `1 - 2^-eyes` over its value at two, so a third eye adds a sixth, a fourth
 * a twelfth, and no count of eyes in one place is worth more than a third of
 * a second place. A lone eye is two thirds: one eye sees less than two.
 */
export function eyesWorth(eyes: number): number {
  return (1 - Math.pow(2, -eyes)) / (1 - Math.pow(2, -2));
}

/**
 * What the body watches the blow with: blind, or its seeing places summed by
 * their eyes past the human's one pair. Heat, echo, the deep sense,
 * electroreception and light-sensing skin keep a body without eyes from the
 * blind penalty (decision 1272).
 */
export function sightDodge(body: Body): number {
  const { viewpoints, heat, echo, deep, electro, light } = derive(body).senses;
  const seeing = viewpoints.filter((v) => v.eyes > 0);
  if (seeing.length === 0) return heat || echo || deep || electro || light ? 0 : DODGE.blind;
  const worth = seeing.reduce((n, v) => n + eyesWorth(v.eyes), 0);
  return Math.min(DODGE.sightMax, DODGE.perViewpoint * (worth - 1));
}

/**
 * A body bigger than the human's is a bigger mark and turns slower: a point
 * less per two of bulk past his 3, a point more per two below it (decision
 * 1261). The speed already pays for the load; this is the size of the mark.
 */
export function sizeDodge(body: Body): number {
  return Math.trunc((DODGE.bulk - derive(body).bulk) / DODGE.perBulk);
}

/** The body's dodge; `acid` is the acid of its muscles, which takes its share of the speed (decision 1302). */
export function dodgeOf(body: Body, acid?: number): number {
  const step = Math.round((derive(body).speed.value * acidToll(acid).speed - DODGE.base) / DODGE.perStep);
  return Math.max(DODGE.min, Math.min(DODGE.max, step + sightDodge(body) + sizeDodge(body)));
}

/** Share of a segment's mass that goes into the blow (strike.md §1.1). */
export const MUSCLE: Record<SegmentKind, number> = {
  arm: 1,
  leg: 1,
  tail: 1,
  neck: 1,
  tentacle: 0.7,
  torso: 0.5,
  penis: 0.5,
  gullet: 0.3,
  growth: 0.3,
  stalk: 0.2,
  flank: 0,
};

export const END_ACCURACY: Partial<Record<StrikeKind, number>> = { hand: 1, sting: 1, implant: 1, foot: -1, hoof: -1, snout: -1, drill: -2, stump: -1 };
export const KIND_ACCURACY: Record<SegmentKind, number> = { arm: 0, neck: 0, flank: 0, leg: -1, tentacle: -1, tail: -1, stalk: -1, gullet: -1, penis: -1, torso: -2, growth: -2 };
/**
 * A hard heavy cover stiffens the limb it is on (strike.md §1.4, decision 1308):
 * a point of accuracy per 3 of its best guard times its weight. Soft covers
 * cost nothing; plates, stone, chrome and a dragon's scale do, and stone the most.
 */
export function coverAccuracy(cover: CoverId): number {
  const c = COVERS[cover];
  return 0 - Math.floor((c.defense * c.massFactor) / 3 + 1e-9);
}
export const COVER_ACCURACY: Record<CoverId, number> = Object.fromEntries((Object.keys(COVERS) as CoverId[]).map((id) => [id, coverAccuracy(id)])) as Record<CoverId, number>;

export const HIT_TYPES: Partial<Record<StrikeKind, HitType>> = {
  hand: "blunt",
  foot: "blunt",
  hoof: "blunt",
  tail: "blunt",
  penis: "blunt",
  snout: "blunt",
  pincer: "cut",
  claw: "cut",
  sting: "pierce",
  hook: "pierce",
  drill: "pierce",
  implant: "pierce",
  mouth: "bite",
  flower: "bite",
};

/** What a head bites with: the best of its contents, not their sum (strike.md §1.3). The table is `JAWS` of derive since decision 1236. */
export const HEAD_BITES: Partial<Record<OrganKind, { dice: string; type: HitType }>> = JAWS;

interface Dice {
  n: number;
  faces: number;
}

export function parseDice(text: string): Dice {
  const m = /(\d+)d(\d+)/.exec(text);
  if (m === null) throw new Error(`parseDice: ${text}`);
  return { n: Number(m[1]), faces: Number(m[2]) };
}

/** E[max(0, roll + bonus)]: armor is a negative bonus. Exact over the faces. */
export function expectedOver(d: Dice, bonus: number): number {
  let dist = new Map<number, number>([[0, 1]]);
  for (let i = 0; i < d.n; i++) {
    const next = new Map<number, number>();
    for (const [v, p] of dist) for (let k = 1; k <= d.faces; k++) next.set(v + k, (next.get(v + k) ?? 0) + p / d.faces);
    dist = next;
  }
  let e = 0;
  for (const [v, p] of dist) e += p * Math.max(0, v + bonus);
  return e;
}

/**
 * The force a blow adds to its die: four points per unit of the square root of
 * its mass past the human's arm (decision 1263). It grows with the mass it
 * swings, not with its logarithm: twice the arm is 1, four times 4, eight times 7.
 * The same formula runs below the arm (decision 1298): half of it is -2, a
 * rat's paw of 4.5 is -1 - a light blow is weaker, as a heavy one is stronger.
 */
export function strikeForce(mass: number): number {
  return mass <= 0 ? 0 : Math.floor(STRIKE.forcePerRoot * (Math.sqrt(mass / STRIKE.unitMass) - 1));
}

/**
 * The length of the pendulum a limb swings as (decision 1300): the chain hangs
 * from the torso, every segment a rod of its own mass and the ending a weight
 * at its tip, and a compound pendulum swings as a simple one of length I / (M d).
 * It is the lever that sets the time, and the mass only where it sits: a thick
 * limb is as quick as a thin one of its length, a heavy fist on a short arm is
 * slower than a bare arm, but never by more than the lever it hangs on.
 */
export function swingLength(body: Body, chain: readonly number[], tip: number): number {
  let r = 0;
  let inertia = 0;
  let moment = 0;
  for (let i = chain.length - 1; i >= 0; i--) {
    const s = body.segments[chain[i]!]!;
    const m = segmentMass(s);
    const l = s.length;
    inertia += m * (r * r + r * l + (l * l) / 3);
    moment += m * (r + l / 2);
    r += l;
  }
  inertia += tip * r * r;
  moment += tip * r;
  return moment > 0 ? inertia / moment : 0;
}

let armSwing: number | undefined;

/** The human's arm and hand swing in 100: the pendulum's period is the root of its length (decision 1300). */
function humanArm(): number {
  if (armSwing !== undefined) return armSwing;
  const h = human();
  const fist = derive(h).attacks.find((a) => a.kind === "hand")!;
  return (armSwing = swingLength(h, fist.chain, organMass(h.nodes[fist.node]!.ends[fist.index!]!)));
}

export function strikeTime(swing: number): number {
  return Math.round(100 * Math.min(STRIKE.timeMax, Math.max(STRIKE.timeMin, Math.sqrt(swing / humanArm()))));
}

export interface Strike {
  /** `<node>.<index>` or `<node>.t<segment>` for a tail: stable within one body state. */
  key: string;
  node: number;
  /** Position of the ending (a bite names its head); null for a tail. */
  index: number | null;
  kind: StrikeKind;
  /** For a bite: the content of the head it bites with. */
  bite: OrganKind | null;
  /** A bite that holds what it lands on: its mouth outweighs a man's (decision 1315). */
  holds: boolean;
  dice: string;
  type: HitType;
  /** Mass that moves in the blow, weighted by muscle. */
  mass: number;
  force: number;
  time: number;
  /** Ending + segment kind + cover - the nerve tax from the leading brain; before the turn's penalties. */
  accuracy: number;
  reach: number;
  segment: number | null;
  /** Segments from the node to the nearest torso, nearest first. */
  chain: number[];
  /** Index in `brains(body)` of the brain whose territory holds the node: it leads the strike. */
  group: number;
  /** The leading brain is yours. */
  mine: boolean;
  /** Nerve from the leading brain to the node. */
  nerve: number;
  /** The blow carries venom: a sting of its own, or a bite fed by a venom gland in the same part of the body. */
  venom: boolean;
  /**
   * What the blow carries on top of its die: venom, acid, a discharge, spikes
   * (strike.md §1.6). The flat part of it rides in the roll; what it owes past
   * the cover is rolled by `rollVolley` and handed to the damage track.
   */
  extras: StrikeExtra[];
  /** The blow burns, whatever its type: fire, cold, acid (strike.md §1.8). */
  burn: boolean;
  /** Energy of the metabolic reserve the blow empties; 0 for everything a limb swings. */
  cost: number;
}

let humanMass: number | undefined;

/**
 * Accuracy a blow pays for the nerve it travels (decision 1297): the nerve is
 * read in bodies, not in cells. A body k times the human's size (k³ his mass)
 * reaches k times as far for the same price, so the tail of a whale pays for
 * how far it sprawls past its bulk, not for the bulk itself. A body smaller
 * than the human pays by his measure: his radius 5 is free for everyone.
 */
export function nerveTax(d: number, bodyMass: number): number {
  const scale = Math.max(1, Math.cbrt(bodyMass / (humanMass ??= massOf(human()))));
  const r = d / scale;
  return r > 5 + 1e-9 ? Math.ceil((r - 5) / 3 - 1e-9) : 0;
}

function chainMass(body: Body, chain: number[]): number {
  let m = 0;
  for (const sid of chain) {
    const s = body.segments[sid]!;
    m += (fleshMass(s) > 0 ? segmentMass(s) : 0) * MUSCLE[s.kind];
  }
  return m;
}

/** What a mouth weighs: the jaws of the head, every one of them (`JAWS`), at their size steps. */
export function mouthMass(head: Organ): number {
  let m = 0;
  for (const c of head.contents ?? []) if (JAWS[c.kind] !== undefined) m += organMass(c);
  return m;
}

/**
 * A bite holds when its mouth outweighs the human's (decision 1315): a man's jaw
 * bites and lets go, fangs and a giant jaw close and keep. One rule by mass, no
 * list of beasts.
 */
export function biteHolds(head: Organ): boolean {
  return mouthMass(head) > (humanMouth ??= mouthMass(organ("head", [organ("jaw")])));
}
let humanMouth: number | undefined;

/** Every strike the body has, by node id then position; a tail after the node's endings. */
export function strikes(body: Body): Strike[] {
  const d = derive(body);
  const own = ownership(body);
  const dist = own.brains.map((b) => distances(body, b.place));
  const bodyMass = massOf(body);
  const out: Strike[] = [];
  const lead = (node: number): { group: number; mine: boolean; nerve: number } => {
    const group = own.owner.get(node) ?? own.self;
    return { group, mine: group === own.self, nerve: group < 0 ? 0 : (dist[group]![node] ?? 0) };
  };
  const accuracyOf = (kind: StrikeKind, segment: number | null, nerve: number): number => {
    const s = segment === null ? undefined : body.segments[segment];
    return (END_ACCURACY[kind] ?? 0) + (s === undefined ? 0 : KIND_ACCURACY[s.kind] + (COVER_ACCURACY[s.cover] ?? 0)) - nerveTax(nerve, bodyMass);
  };
  const chains = torsoChains(body);
  const sources = extraSources(body, bloodReach(body));
  const dir = distances(body, body.self);
  for (const node of nodeIds(body)) {
    if (!works(body, node)) continue;
    body.nodes[node]!.ends.forEach((ending, index) => {
      if (ending.kind !== "head") return;
      // A bite: one per head, with the best of its contents - the same bite the derived table lists.
      const bite = headBite(ending);
      if (bite === null) return;
      const best = bite.organ.kind;
      const chain = chains[node]?.segments ?? [];
      const length = chains[node]?.length ?? 0;
      const segment = parentSegment(body, node, dir);
      const mass = (isChrome(ending) ? 0 : STRIKE.headMass) + chainMass(body, chain);
      const l = lead(node);
      const extras = extrasFor(sources, body, node, "head", chain);
      const time = strikeTime(swingLength(body, chain, STRIKE.headMass));
      out.push({ key: `${node}.${index}`, node, index, kind: "head", bite: best, holds: bite.type === "bite" && biteHolds(ending), dice: bite.dice, type: bite.type, mass, force: strikeForce(mass), time, accuracy: accuracyOf("jaw", segment, l.nerve), reach: reachOf(length), segment, chain, ...l, venom: extras.some((e) => e.kind === "venom"), extras, burn: false, cost: 0 });
    });
  }
  for (const a of d.attacks) {
    const ending = a.index === null ? undefined : body.nodes[a.node]!.ends[a.index];
    if (ending?.kind === "head") continue;
    const kind: StrikeKind = a.kind;
    const endMass = ending === undefined || isChrome(ending) ? 0 : organMass(ending);
    // A blow of the body itself weighs its organ and takes the time of its own row: a gland empties, it does not swing.
    const mass = a.blow === undefined ? endMass + chainMass(body, a.chain) : a.mass;
    const l = lead(a.node);
    out.push({
      key: a.key ?? (a.index === null ? `${a.node}.t${a.segment}` : `${a.node}.${a.index}`),
      node: a.node,
      index: a.index,
      kind,
      bite: null,
      holds: false,
      dice: a.dice,
      type: a.blow?.type ?? HIT_TYPES[kind] ?? "blunt",
      mass,
      // A gland empties, it does not swing: a light organ loses nothing of its blow (decision 1298).
      force: a.blow === undefined ? strikeForce(mass) : Math.max(0, strikeForce(mass)),
      time: a.blow?.time ?? strikeTime(swingLength(body, a.chain, ending === undefined ? 0 : organMass(ending))),
      accuracy: accuracyOf(kind, a.segment, l.nerve),
      reach: a.reach,
      segment: a.segment,
      chain: a.chain,
      ...l,
      venom: a.extras.some((e) => e.kind === "venom"),
      extras: a.extras,
      burn: a.blow?.burn ?? false,
      cost: a.blow?.cost ?? 0,
    });
  }
  return out.sort((x, y) => x.node - y.node || (x.index ?? 99) - (y.index ?? 99) || x.key.localeCompare(y.key));
}

/** Tentacles and pincers that hold a creature and squeeze it every turn (strike.md §1.7). */
export function grabs(body: Body): Strike[] {
  const d = derive(body);
  const own = ownership(body);
  const dist = own.brains.map((b) => distances(body, b.place));
  const bodyMass = massOf(body);
  const out: Strike[] = [];
  for (const g of d.grips.list) {
    const seg = g.segment === null ? undefined : body.segments[g.segment];
    if (g.kind !== "pincer" && seg?.kind !== "tentacle") continue;
    const chain = d.attacks.find((a) => a.node === g.node)?.chain ?? (g.segment === null ? [] : [g.segment]);
    const ending = body.nodes[g.node]!.ends[g.index]!;
    const mass = (isChrome(ending) ? 0 : organMass(ending)) + chainMass(body, chain);
    const group = own.owner.get(g.node) ?? own.self;
    const nerve = group < 0 ? 0 : (dist[group]![g.node] ?? 0);
    out.push({
      // Its own key: a pincer both cuts and grabs, and the volley tells the two apart.
      key: `${g.node}.g${g.index}`,
      node: g.node,
      index: g.index,
      kind: g.kind,
      bite: null,
      holds: false,
      dice: "1d2",
      type: "squeeze",
      mass,
      force: strikeForce(mass),
      time: strikeTime(swingLength(body, chain, organMass(ending))),
      accuracy: (END_ACCURACY[g.kind] ?? 0) + (seg === undefined ? 0 : KIND_ACCURACY[seg.kind] + (COVER_ACCURACY[seg.cover] ?? 0)) - nerveTax(nerve, bodyMass),
      reach: d.attacks.find((a) => a.node === g.node)?.reach ?? 1,
      segment: g.segment,
      chain,
      group,
      mine: group === own.self,
      nerve,
      venom: false,
      extras: [],
      burn: false,
      cost: 0,
    });
  }
  return out;
}

/**
 * What a body fights with (strike.md §1.7, decision 1306): its blows and its
 * grabs. A tip that grips has an attack of its own, so it does not also club
 * as a bare stump; a pincer keeps its cut beside its grab, and the volley
 * takes one of the two - the same ending strikes once a volley.
 */
export function armory(body: Body): Strike[] {
  const g = grabs(body);
  if (g.length === 0) return strikes(body);
  const grips = new Set(g.map((x) => x.node));
  return [...strikes(body).filter((s) => s.kind !== "stump" || !grips.has(s.node)), ...g].sort((x, y) => x.node - y.node || (x.index ?? 99) - (y.index ?? 99) || x.key.localeCompare(y.key));
}

/**
 * What a held body tears loose with (strike.md §1.7, decision 1313): the mass
 * of the heaviest blow it swings - the limb it wrenches free with. A blow of the
 * body does not swing and does not pull.
 */
export function pullOf(body: Body): number {
  return armory(body).reduce((m, s) => (s.cost === 0 ? Math.max(m, s.mass) : m), 0);
}

/**
 * The chance a held body tears loose at a body turn of the one holding it: its
 * pull against the mass of every grip on it (decision 1313). A body that does
 * not pull - out cold, or with nothing to swing - stays held.
 */
export function escapeChance(pull: number, hold: number): number {
  return pull <= 0 ? 0 : pull / (pull + Math.max(0, hold));
}

/** Body turns a grab is expected to squeeze after it lands, out of `STRIKE.holdTurns`, against a target that pulls `pull`. */
function heldTurns(grip: number, pull: number): number {
  const keep = 1 - escapeChance(pull, grip);
  let sum = 0;
  for (let t = 1; t <= STRIKE.holdTurns; t++) sum += keep ** t;
  return sum;
}

/** One ending, one blow a volley: a pincer's cut and its grab are the same ending. */
function slotOf(s: Strike): string {
  return s.type === "squeeze" ? `${s.node}.${s.index}` : s.key;
}

/**
 * A grip that holds squeezes every body turn without a roll (strike.md §1.7):
 * `1d2 + force`, the acid of the muscles taken off as off any blow they swing;
 * the damage track presses it through half the cover.
 */
export function squeezeBlow(g: Strike, rng: Rng, acid?: number): Blow {
  return { damage: Math.max(0, rollDice(g.dice, rng) + g.force - acidToll(acid).damage), profile: "random", dirty: false, type: "squeeze", burn: false, doses: [] };
}

// ---------------------------------------------------------------- the volley

interface VolleyTarget {
  /** The armor a strike expects: the target's mean defense. */
  armor: number;
  dodge?: number;
  /** Cells to the target; 1 is adjacent. */
  distance?: number;
  /** Your own body: it does not dodge. */
  self?: boolean;
  /** What the target tears loose with (`pullOf`); a grab is weighed against it. None pulls when nobody says. */
  pull?: number;
  /** Mass of your grips already holding the target: a new grab holds together with them. */
  gripped?: number;
}

interface VolleyOptions {
  /** Excess channels of the mind: `max(0, mindPower - mentalLoad)`. */
  excess?: number;
  /** Strikes that sit out: slipped, switched off, holding. Keys of `Strike`. */
  skip?: ReadonlySet<string>;
  /** Accuracy per group (index in brains): a head's agenda. */
  bonus?: Readonly<Record<number, number>>;
  /** Only these groups strike (a head that took the turn strikes with its own). */
  groups?: ReadonlySet<number>;
  /** Pain, blood, whatever the turn takes off every strike. */
  penalty?: number;
  /**
   * What the body can pay out of its metabolic reserve this volley: a blow of
   * the body costs (strike.md §1.8), and a gland with nothing behind it does
   * not fire. Unbounded when nobody says - the strike tab plans on a whole body.
   */
  reserve?: number;
}

interface Planned {
  strike: Strike;
  /** After the volley's penalty, range, bonus and the turn's penalty. */
  accuracy: number;
  chance: number;
  /** Chance x E[max(0, roll + force - armor)]. */
  expected: number;
}

export interface Volley {
  planned: Planned[];
  /** Energy the volley takes: its slowest strike; 0 when nothing strikes. */
  time: number;
  /** Expected damage per 100 energy. */
  rate: number;
  expected: number;
  /** Per group: free strikes and the strikes taken. */
  groups: { group: number; free: number; taken: number; penalty: number }[];
  /** Strikes that could reach but were left out. */
  idle: Strike[];
}

export function hitChance(accuracy: number, dodge = 0): number {
  return Math.min(STRIKE.maxChance, Math.max(STRIKE.minChance, STRIKE.base + STRIKE.step * (accuracy - dodge)));
}

/**
 * Flat damage the additions put into the blow itself (strike.md §1.6): acid's
 * +1, spikes' +1. It is part of the roll, so the volley weighs a venomous bite
 * for what it is instead of for the die alone (decision 422).
 */
export function extraBonus(s: Pick<Strike, "extras">): number {
  return s.extras.reduce((sum, e) => sum + e.bonus, 0);
}

/** What a volley empties of the metabolic reserve: every blow of the body in it (strike.md §1.8). */
export function volleyCost(v: Volley): number {
  return v.planned.reduce((sum, p) => sum + p.strike.cost, 0);
}

/** Free strikes of a group. */
export function freeStrikes(s: { mine: boolean }, excess: number): number {
  return 1 + (s.mine ? Math.floor(Math.max(0, excess) / STRIKE.excessPerFree) : 0);
}

/** Excess channels of a body: what the mind gives past what it is asked. */
export function excessChannels(body: Body): number {
  return Math.max(0, mindPower(body) - mentalLoad(body).total);
}

function plan(s: Strike, penalty: number, target: VolleyTarget, opts: VolleyOptions): Planned {
  const range = Math.max(0, (target.distance ?? 1) - 1);
  const accuracy = s.accuracy - penalty - range + (opts.bonus?.[s.group] ?? 0) - (opts.penalty ?? 0);
  const chance = hitChance(accuracy, target.self === true ? 0 : (target.dodge ?? 0));
  // A grab that lands keeps squeezing: it is weighed for the turns it is expected to hold, through half the armor (strike.md §1.7).
  const hold = s.type === "squeeze" ? 1 + heldTurns(s.mass + (target.gripped ?? 0), target.pull ?? 0) : 1;
  const armor = s.type === "squeeze" ? Math.floor(target.armor * SQUEEZE_COVER) : target.armor;
  return { strike: s, accuracy, chance, expected: hold * chance * expectedOver(parseDice(s.dice), s.force + extraBonus(s) - armor) };
}

/**
 * The volley one command sends at a target (strike.md §2): for every time
 * threshold, every group takes the number of strikes that gives it the most,
 * each count judged with its own penalty; the threshold with the best rate
 * wins, the smaller on a tie. Pure: no dice are rolled here.
 */
export function volley(list: readonly Strike[], target: VolleyTarget, opts: VolleyOptions = {}): Volley {
  const distance = target.distance ?? 1;
  const purse = opts.reserve ?? Infinity;
  const cands = list.filter((s) => s.reach >= distance && s.cost <= purse && opts.skip?.has(s.key) !== true && (opts.groups === undefined || opts.groups.has(s.group)));
  const times = [...new Set(cands.map((s) => s.time))].sort((x, y) => x - y);
  let best: Volley = { planned: [], time: 0, rate: 0, expected: 0, groups: [], idle: [...cands] };
  for (const T of times) {
    const byGroup = new Map<number, Strike[]>();
    for (const s of cands) {
      if (s.time > T) continue;
      const g = byGroup.get(s.group);
      if (g === undefined) byGroup.set(s.group, [s]);
      else g.push(s);
    }
    const planned: Planned[] = [];
    const groups: Volley["groups"] = [];
    let sum = 0;
    for (const g of [...byGroup.keys()].sort((x, y) => x - y)) {
      const arr = byGroup.get(g)!;
      const free = freeStrikes(arr[0]!, opts.excess ?? 0);
      let gBest: Planned[] = [];
      let gSum = 0;
      let gPen = 0;
      for (let k = 1; k <= arr.length; k++) {
        const pen = STRIKE.perExtra * Math.max(0, k - free);
        const ps = arr.map((s) => plan(s, pen, target, opts)).sort((x, y) => y.expected - x.expected || x.strike.node - y.strike.node || (x.strike.index ?? -1) - (y.strike.index ?? -1));
        const seen = new Set<string>();
        const top: Planned[] = [];
        for (const p of ps) {
          if (top.length === k) break;
          if (seen.has(slotOf(p.strike))) continue;
          seen.add(slotOf(p.strike));
          top.push(p);
        }
        const v = top.reduce((a, p) => a + p.expected, 0);
        if (v > gSum + 1e-9) {
          gSum = v;
          gBest = top;
          gPen = pen;
        }
      }
      groups.push({ group: g, free, taken: gBest.length, penalty: gPen });
      planned.push(...gBest);
      sum += gSum;
    }
    const rate = (sum * 100) / T;
    if (rate > best.rate + 1e-9) {
      planned.sort((x, y) => x.strike.group - y.strike.group || x.strike.node - y.strike.node || (x.strike.index ?? -1) - (y.strike.index ?? -1) || x.strike.key.localeCompare(y.strike.key));
      const chosen = new Set(planned.map((p) => p.strike.key));
      best = { planned, time: T, rate, expected: sum, groups, idle: cands.filter((s) => !chosen.has(s.key)) };
    }
  }
  return best;
}

interface StrikeRoll {
  planned: Planned;
  hit: boolean;
  /** The dice alone; 0 on a miss. */
  roll: number;
  /** Roll + force + the flat part of the additions, before the armor of the part it lands on; 0 on a miss. */
  amount: number;
  /** What the additions owe past the cover, already rolled (strike.md §1.6); empty on a miss. */
  doses: Dose[];
}

function rollDice(text: string, rng: Rng): number {
  const d = parseDice(text);
  let sum = 0;
  for (let i = 0; i < d.n; i++) sum += 1 + Math.floor(rng.next() * d.faces);
  return sum;
}

/**
 * The volley's dice: one draw for the hit, then the faces, then whatever the
 * additions owe on top, strike by strike in the volley's order. The flat part
 * of an addition is in `amount` with the die; what the cover does not hold is
 * a dose of its own, and the damage track lands it (decision 420).
 */
export function rollVolley(v: Volley, rng: Rng): StrikeRoll[] {
  return v.planned.map((p) => {
    const hit = rng.next() < p.chance;
    if (!hit) return { planned: p, hit, roll: 0, amount: 0, doses: [] };
    const roll = rollDice(p.strike.dice, rng);
    const doses: Dose[] = [];
    for (const e of p.strike.extras) {
      if (e.dice === "") continue;
      doses.push({ kind: e.kind, amount: rollDice(e.dice, rng), delay: e.kind === "venom" ? VENOM_TURNS : 0 });
    }
    return { planned: p, hit, roll, amount: roll + p.strike.force + extraBonus(p.strike), doses };
  });
}

// ---------------------------------------------------------------- the fold: striking yourself

export interface Fold {
  /** The torso node the chain folds at. */
  root: number;
  /** How far past the root the ending reaches: the chain's length, at least 1. */
  length: number;
  /** Elements it reaches: nodes and segments, by id; membranes by a node of their cycle. */
  elements: number[];
}

/** What an ending reaches on its own body by folding its chain at the torso (strike.md §4.1). */
export function foldReach(body: Body, s: Pick<Strike, "node" | "chain">): Fold {
  let root = s.node;
  let length = 0;
  for (const sid of s.chain) {
    const seg = body.segments[sid]!;
    root = otherEnd(seg, root);
    length += seg.length;
  }
  length = Math.max(1, length);
  const d = distances(body, { node: root });
  const own = new Set(s.chain);
  const limb = new Set<number>([s.node]);
  let at = s.node;
  for (const sid of s.chain) {
    at = otherEnd(body.segments[sid]!, at);
    if (at !== root) limb.add(at);
  }
  const near = (n: number): boolean => d[n] !== undefined && d[n]! <= length;
  const elements: number[] = [];
  for (const n of nodeIds(body)) if (!limb.has(n) && near(n)) elements.push(n);
  for (const sid of segmentIds(body)) {
    if (own.has(sid)) continue;
    const seg = body.segments[sid]!;
    if (near(seg.a) || near(seg.b)) elements.push(sid);
  }
  for (const mid of sortedIds(body.membranes)) {
    const m = body.membranes[mid]!;
    if (m.cycle.some((sid) => {
      const seg = body.segments[sid];
      return seg !== undefined && (near(seg.a) || near(seg.b));
    })) elements.push(mid);
  }
  return { root, length, elements: elements.sort((x, y) => x - y) };
}

/** Whether an element lies in the territory of brain `group`: a node it owns, a segment with both ends its. */
function inTerritory(body: Body, owner: Map<number, number>, group: number, id: number): boolean {
  const seg = body.segments[id];
  if (seg !== undefined) return owner.get(seg.a) === group && owner.get(seg.b) === group;
  if (body.nodes[id] !== undefined) return owner.get(id) === group;
  const m = body.membranes[id];
  return m !== undefined && m.cycle.every((sid) => inTerritory(body, owner, group, sid));
}

interface SelfReach {
  strike: Strike;
  /** Elements of the fold outside the leading brain's territory: what it can hit of you. */
  elements: number[];
  /** Your brain's element is among them. */
  brain: boolean;
}

/** For a head (index in brains): every strike of its territory and what of you it reaches. A head never strikes its own territory. */
export function seizedReach(body: Body, group: number, list: readonly Strike[] = strikes(body)): SelfReach[] {
  const own = ownership(body);
  const me = selfElement(body);
  return list
    .filter((s) => s.group === group && works(body, s.node))
    .map((s) => {
      const elements = foldReach(body, s).elements.filter((id) => !inTerritory(body, own.owner, group, id));
      return { strike: s, elements, brain: elements.includes(me) };
    });
}

/** Where a head with the agenda KILL strikes you: your brain's element if the fold holds it, else the element nearest to it by nerve. */
export function killTarget(body: Body, reach: SelfReach): number | null {
  if (reach.elements.length === 0) return null;
  const me = selfElement(body);
  if (reach.brain) return me;
  const d = distances(body, body.self);
  let best: number | null = null;
  let bestD = Infinity;
  for (const id of reach.elements) {
    const seg = body.segments[id];
    const x = seg !== undefined ? Math.min(d[seg.a] ?? Infinity, d[seg.b] ?? Infinity) : (d[id] ?? Infinity);
    if (x < bestD) {
      bestD = x;
      best = id;
    }
  }
  return best;
}

/** Where a head with the agenda EAT bites you: the heaviest segment of the fold, a node when no segment is there. */
export function eatTarget(body: Body, reach: SelfReach): number | null {
  if (reach.strike.type !== "bite" && reach.strike.kind !== "mouth" && reach.strike.kind !== "head") return null;
  let best: number | null = null;
  let bestM = -1;
  for (const id of reach.elements) {
    const seg = body.segments[id];
    const m = seg === undefined ? 0 : segmentMass(seg);
    if (m > bestM) {
      bestM = m;
      best = id;
    }
  }
  return best;
}

interface SlipChoice {
  /** An enemy's index, or an element of your body. */
  enemy: number | null;
  element: number | null;
  weight: number;
}

/** The pool a slipped limb or jaw strikes from (strike.md §4.2): each enemy in reach weighs 2, your fold 1 in all, by exposure. */
export function slipPool(body: Body, s: Strike, enemies: number): SlipChoice[] {
  const out: SlipChoice[] = [];
  for (let i = 0; i < enemies; i++) out.push({ enemy: i, element: null, weight: STRIKE.enemyWeight });
  const exp = new Map(derive(body).exposure.parts.map((p) => [p.id, p.weight]));
  const fold = foldReach(body, s).elements;
  const total = fold.reduce((a, id) => a + (exp.get(id) ?? 0), 0);
  if (total > 0) for (const id of fold) if ((exp.get(id) ?? 0) > 0) out.push({ enemy: null, element: id, weight: exp.get(id)! / total });
  return out;
}

/**
 * A hit that landed, as the damage track takes it (damage.md): claws and
 * teeth are dirty, everything else is clean; where it lands the openness of
 * the target decides, so the profile is `random`. Everything the strike knows
 * goes over with it - its type, whether it burns, and the doses its additions
 * rolled - because the seam used to stop here and the fire never burned
 * (decision 420).
 */
export function blowOf(r: StrikeRoll, aimed: Aimed = {}): Blow {
  const s = r.planned.strike;
  const blow: Blow = {
    damage: r.amount,
    profile: aimed.profile ?? "random",
    dirty: s.type === "cut" || s.type === "bite",
    type: s.type,
    burn: s.burn || s.extras.some((e) => e.burn),
    doses: r.doses,
  };
  if (aimed.aim !== undefined) blow.aim = aimed.aim;
  return blow;
}

/**
 * Where a volley goes on the target (damage.md §6). The strike itself does not
 * know: the die and the type are the body's, the intent is the order's. Left
 * out, the volley falls by the openness of the target, which is how every
 * volley fell before (decision 434).
 */
export interface Aimed {
  profile?: Profile;
  /** For `aimed` and `at`: the element meant. */
  aim?: number;
}

// ---------------------------------------------------------------- one body at another

interface PlanOptions extends VolleyOptions {
  /**
   * The target's dodge; its own (`dodgeOf`) when nobody says. A body out cold
   * does not dodge, and only the one running the fight knows that.
   */
  dodge?: number;
  /** The acid of the thrower's muscles: every blow a muscle swings loses its toll (breath.md §3, decision 1302). */
  acid?: number;
  /** Keys of the bites whose last bite landed on this very target: they hold, and bite again `STRIKE.biteHold` stronger (strike.md §1.3). */
  holding?: ReadonlySet<string>;
  /** What the target tears loose with; its own `pullOf` when nobody says. A body out cold does not pull. */
  pull?: number;
  /** Mass of your grips already holding the target (decision 1313). */
  gripped?: number;
}

/**
 * The volley one body plans at another: its strikes against the target's mean
 * defense and its dodge, its own excess channels paying for the free ones.
 * Pure - no dice. One target, no queue: who acts when is the caller's business.
 */
export function planStrike(me: Body, foe: Body, distance = 1, opts: PlanOptions = {}): Volley {
  const { dodge, acid, holding, pull, gripped, ...rest } = opts;
  const toll = acidToll(acid).damage;
  // A gland empties, it does not swing: the acid of the muscles is not in its blow.
  // A bite that holds bites again stronger (decision 1307).
  const edge = (s: Strike): number => (s.cost === 0 ? -toll : 0) + (s.holds && holding?.has(s.key) === true ? STRIKE.biteHold : 0);
  const list = armory(me).map((s) => (edge(s) === 0 ? s : { ...s, force: s.force + edge(s) }));
  return volley(list, { armor: derive(foe).armor.mean, dodge: dodge ?? dodgeOf(foe), distance, pull: pull ?? pullOf(foe), gripped }, { excess: excessChannels(me), ...rest });
}

interface LandedVolley {
  rolls: StrikeRoll[];
  events: HarmEvent[];
  /** Strikes whose roll missed. */
  missed: Strike[];
  /** Blows that landed before the volley stopped. */
  hits: number;
  /** What those blows carried, before the cover of the parts they found. */
  damage: number;
}

/**
 * The volley thrown: the dice, then every blow that lands goes through the
 * damage track (`strike` of damage.md), and the volley stops on a death. The
 * clock is the caller's - what the volley costs is `v.time`, and what it
 * empties of the thrower's reserve is `volleyCost`.
 */
export function landVolley(v: Volley, body: Body, harm: Harm, rng: Rng, aimed: Aimed = {}): LandedVolley {
  const rolls = rollVolley(v, rng);
  const events: HarmEvent[] = [];
  const missed: Strike[] = [];
  let hits = 0;
  let damage = 0;
  for (const roll of rolls) {
    if (!roll.hit) {
      missed.push(roll.planned.strike);
      continue;
    }
    hits += 1;
    damage += roll.amount;
    events.push(...landBlow(body, harm, blowOf(roll, aimed), rng));
    if (harm.dead !== null) break;
  }
  return { rolls, events, missed, hits, damage };
}

// ---------------------------------------------------------------- one named blow at one named part

/** One strike of a body at one element of another, before it is thrown: the arena's strike mode shows it. */
export interface StrikePreview {
  strike: Strike;
  /** The element meant; the blow lands on it or misses. */
  part: number;
  /** The strike reaches at this distance; a strike that does not has no chance. */
  reach: boolean;
  /** After range and the attacker's free strikes; the volley's own penalty does not apply to one blow. */
  accuracy: number;
  chance: number;
  /** The cover the blow meets on the part, as the damage track counts it for this type. */
  defense: number;
  /** Chance x E[max(0, roll + force + additions - defense)]: what the guard holds takes nothing (decision 1282). */
  expected: number;
}

/**
 * The strike keyed `key` of `me` at the element `part` of `foe` (damage.md
 * §6, profile `at`): the chance is the one `hitChance` gives against the
 * foe's dodge, and a foe out cold does not dodge. Null when `me` has no such
 * strike or `foe` no such element. Pure: no dice.
 */
export function aimStrike(me: Body, key: string, foe: Body, harm: Harm, part: number, distance = 1): StrikePreview | null {
  const s = strikes(me).find((x) => x.key === key);
  if (s === undefined || (foe.nodes[part] === undefined && foe.segments[part] === undefined)) return null;
  const dodge = mindState(foe, harm).conscious ? dodgeOf(foe, harm.acid) : 0;
  const defense = coverAgainst(foe, part, s.type);
  const planned = volley([s], { armor: 0, dodge, distance }, { excess: excessChannels(me) }).planned[0];
  if (planned === undefined) return { strike: s, part, reach: false, accuracy: s.accuracy, chance: 0, defense, expected: 0 };
  const expected = planned.chance * expectedOver(parseDice(s.dice), s.force + extraBonus(s) - defense);
  return { strike: s, part, reach: true, accuracy: planned.accuracy, chance: planned.chance, defense, expected };
}

/**
 * The blow `aimStrike` shows, thrown: one roll for the hit with the chance
 * shown, the die, and on a hit the damage track takes it on that part and no
 * other. A strike that does not reach throws nothing. Null as `aimStrike`.
 */
export function strikeAt(me: Body, key: string, foe: Body, harm: Harm, part: number, rng: Rng, distance = 1): { preview: StrikePreview; landed: LandedVolley } | null {
  const preview = aimStrike(me, key, foe, harm, part, distance);
  if (preview === null) return null;
  if (!preview.reach) return { preview, landed: { rolls: [], events: [], missed: [], hits: 0, damage: 0 } };
  const v: Volley = {
    planned: [{ strike: preview.strike, accuracy: preview.accuracy, chance: preview.chance, expected: preview.expected }],
    time: preview.strike.time,
    rate: (preview.expected * 100) / preview.strike.time,
    expected: preview.expected,
    groups: [],
    idle: [],
  };
  return { preview, landed: landVolley(v, foe, harm, rng, { profile: "at", aim: part }) };
}
