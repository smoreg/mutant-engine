/**
 * Attacks: every ending that strikes, every jaw inside a head, every tail,
 * every bare limb long enough to club with itself - and the body itself, when
 * it carries an organ that is a weapon: a gland breathes, an electric organ
 * discharges, spines shoot (strike.md §1.8). Reach is the length of the chain
 * from the nearest torso, a cell per two (decision 1267);
 * a body's blow reaches as far as its own row says. Mass is what the lungs pay
 * for the blow. Beside the blows, the same organs feed other blows: venom on a
 * bite, acid, a discharge, spikes on the chain (strike.md §1.6).
 */
import type { Body, Organ, OrganKind, Segment, SegmentKind } from "../graph.js";
import { nodeIds, otherEnd, segmentIds, segmentsAt } from "../graph.js";
import { isFlank } from "../flank.js";
import { bloodReach, components, works } from "../metrics.js";
import { ORGANS, SEGMENT_KINDS, organAttack, organsOfSegment, sizeOf, sizedDice } from "../parts.js";
import { chainOf, endingOf, organFleshMass, partMass, running, type Ctx } from "./context.js";

export const REACH_PER_LENGTH = 2;
export const REACH_MAX = 3;

/**
 * Kinds a bare limb clubs with (decision 126): a torso is no limb, a flank
 * has no length, a gullet is a tube and a lump does not swing.
 */
export const BARE_KINDS: ReadonlySet<SegmentKind> = new Set<SegmentKind>(["arm", "leg", "tentacle", "tail", "neck", "stalk", "penis"]);

/** Length x girth a bare limb needs before it strikes at all: a nub is not a club. */
export const BARE_MIN_BULK = 3;

/**
 * What a bare limb hits for, by its length x girth: a stem taps, an elephant's
 * trunk clubs. Null when there is too little of it to swing.
 */
export function bareDice(length: number, girth: number): string | null {
  return bareBulkDice(length * girth);
}

/** The same by the bulk itself: a limb walked whole, or limbs fused into one stump. */
export function bareBulkDice(bulk: number): string | null {
  if (bulk < BARE_MIN_BULK) return null;
  return bulk >= 16 ? "1d6" : bulk >= 9 ? "1d4" : bulk >= 5 ? "1d3" : "1d2";
}

/** What a blow does where it lands; the damage track tells these five apart and nothing else. */
export type HitType = "blunt" | "cut" | "pierce" | "bite" | "squeeze";

export type StrikeSource = OrganKind | "tail" | "penis" | "stump";

export interface Attack {
  node: number;
  /** Position of the ending (a jaw names its head); null for a tail's lash, a bare limb's and a body's blow. */
  index: number | null;
  kind: StrikeSource;
  dice: string;
  /** Cells reached: 1..3. */
  reach: number;
  /** The segment the ending sits on toward your brain; a tail and a bare limb name themselves, a body's blow swings nothing. */
  segment: number | null;
  /** Segments from the node to the nearest torso, nearest first. */
  chain: number[];
  /** Flesh that moves in the blow: the ending and its chain; for a body's blow, the organ alone. */
  mass: number;
  /** The row of the organ the body strikes with; absent for an ending, a tail and a bare limb. */
  blow?: OrganBlow;
  /** A key of its own where the node and the position do not make one: two glands in one torso. */
  key?: string;
  /** What the blow carries on top of its die (strike.md §1.6). */
  extras: StrikeExtra[];
}

// ---------------------------------------------------------------- weapon organs

/** What an addition puts into the blow it rides on (strike.md §1.6). */
export type ExtraKind = "venom" | "acid" | "shock" | "spikes";

/**
 * Which blows an addition reaches: every mouth of its own component (a gland
 * feeds a bite the way a stomach feeds eating), everything swung off the
 * segment that holds it, everything whose chain runs over its segment.
 */
export type ExtraScope = "bite" | "torso" | "chain";

export interface StrikeExtra {
  kind: ExtraKind;
  /** Damage it puts into this very blow, before armour. */
  bonus: number;
  /** What it owes the target past this blow - venom over turns, a discharge the armour does not hold; "" when it owes nothing. */
  dice: string;
  /** It burns: the wound is worth more pain (damage.md). */
  burn: boolean;
  /** The organ it comes from; a sting is its own. */
  from: OrganKind;
}

/** A blow of the body itself: the organ's die, and what the blow costs instead of a swing. */
export interface OrganBlow {
  dice: string;
  type: HitType;
  /** Cells reached: a cone of fire is thrown, not swung. */
  reach: number;
  /** Energy of the turn one blow takes; a gland does not pay by its mass. */
  time: number;
  /** Energy of the metabolic reserve it empties: the gland's own currency (damage.md `reserve`). */
  cost: number;
  /** It has to go out through a mouth: no mouth in the component, no blow. */
  vent: boolean;
  burn: boolean;
}

export interface OrganAddition {
  kind: ExtraKind;
  scope: ExtraScope;
  bonus: number;
  dice: string;
  burn: boolean;
}

/** A weapon organ strikes by itself, feeds another strike, or both. */
export interface OrganWeapon {
  blow?: OrganBlow;
  addition?: OrganAddition;
}

function blow(dice: string, type: HitType, reach: number, time: number, cost: number, vent: boolean, burn = false): OrganBlow {
  return { dice, type, reach, time, cost, vent, burn };
}

function addition(kind: ExtraKind, scope: ExtraScope, bonus: number, dice: string, burn = false): OrganAddition {
  return { kind, scope, bonus, dice, burn };
}

/**
 * Every organ tagged `weapon` in parts.ts, and what it does (strike.md §1.6,
 * §1.8). A liquid and a discharge go past the cover, so they land as `pierce`:
 * the five types are what the damage track tells apart, and the burning is a
 * flag of its own. Numbers are starting ones, measured on the bestiary.
 */
export const WEAPONS: Partial<Record<OrganKind, OrganWeapon>> = {
  // A cone of flame, out through the mouth: the strongest blow a body has and the dearest.
  fireGland: { blow: blow("2d6", "pierce", 3, 150, 30, true, true) },
  cryoGland: { blow: blow("2d4", "pierce", 3, 150, 30, true, true) },
  // Acid does both: it is spat, and it makes the bite of its own body caustic.
  acidGland: { blow: blow("1d6", "pierce", 2, 120, 20, true, true), addition: addition("acid", "bite", 1, "", true) },
  // A discharge needs no mouth: it goes off the flesh that holds the organ.
  electricOrgan: { blow: blow("1d8", "pierce", 2, 100, 25, false), addition: addition("shock", "torso", 0, "1d4") },
  shootingSpines: { blow: blow("1d6", "pierce", 3, 120, 15, false) },
  bodyTeeth: { blow: blow("1d4", "bite", 1, 75, 0, false) },
  // A gland that only feeds: the venom is the bite's, not a blow of its own (decision 122).
  venomGland: { addition: addition("venom", "bite", 0, "1d4") },
  spines: { addition: addition("spikes", "chain", 1, "") },
};

/**
 * What a head bites with, by the jaw it holds (strike.md §1.3). The table lives
 * here and not in strike.ts since decision 1236: the derived table and the fight
 * have to read one bite, and strike.ts already reads derive. `HEAD_BITES` in
 * strike.ts is this table under its old name.
 */
export const JAWS: Partial<Record<OrganKind, { dice: string; type: HitType }>> = {
  jaw: { dice: "1d3", type: "bite" },
  fangs: { dice: "1d8", type: "bite" },
  crusherJaw: { dice: "2d4", type: "blunt" },
  mandibles: { dice: "1d6", type: "cut" },
  radula: { dice: "1d3", type: "cut" },
  proboscis: { dice: "1d2", type: "pierce" },
};

function meanOf(dice: string): number {
  const m = /(\d+)d(\d+)/.exec(dice);
  return m === null ? 0 : (Number(m[1]) * (Number(m[2]) + 1)) / 2;
}

export interface HeadBite {
  /** The content of the head it bites with. */
  organ: Organ;
  dice: string;
  type: HitType;
}

/**
 * The one bite of a head: the best of its jaws at their size steps, not their
 * sum; the first in the head wins a tie. Null for a head with no jaw at all.
 */
export function headBite(head: Organ): HeadBite | null {
  let best: HeadBite | null = null;
  for (const c of head.contents ?? []) {
    const row = JAWS[c.kind];
    if (row === undefined) continue;
    // A jaw's size step moves its die a rung (sizes.ts).
    const dice = sizedDice(row.dice, sizeOf(c));
    if (best === null || meanOf(dice) > meanOf(best.dice)) best = { organ: c, dice, type: row.type };
  }
  return best;
}

/** Blows a gland can ride: every mouth of the body, and the sting that carries its own venom. */
export const VENOMABLE: ReadonlySet<StrikeSource> = new Set<StrikeSource>(["mouth", "flower", "head", "jaw", "sting"]);

/** The venom a sting has without any gland at all (decision 122). */
export const STING_VENOM = "1d4";

export interface ExtraSource {
  spec: OrganAddition;
  from: OrganKind;
  /** The segment the organ sits in. */
  segment: number;
  /** Nodes of its component: how far a gland reaches. */
  nodes: ReadonlySet<number>;
}

/** Every living organ of the body that feeds another blow, with the component it feeds (strike.md §1.6). */
export function extraSources(body: Body, live: ReadonlySet<number> = bloodReach(body)): ExtraSource[] {
  const parts = components(body);
  const out: ExtraSource[] = [];
  for (const sid of segmentIds(body)) {
    const seg = body.segments[sid]!;
    if (!works(body, sid) || !live.has(sid)) continue;
    let nodes: ReadonlySet<number> | undefined;
    for (const o of organsOfSegment(seg)) {
      const spec = WEAPONS[o.kind]?.addition;
      if (spec === undefined) continue;
      nodes ??= new Set(parts.find((p) => p.segments.includes(sid))?.nodes ?? [seg.a, seg.b]);
      out.push({ spec, from: o.kind, segment: sid, nodes });
    }
  }
  return out;
}

/** The torso node a chain folds at: walk the chain from the node that strikes. */
function rootOf(body: Body, node: number, chain: readonly number[]): number {
  let at = node;
  for (const sid of chain) {
    const seg = body.segments[sid];
    if (seg === undefined) break;
    at = otherEnd(seg, at);
  }
  return at;
}

function reaches(body: Body, s: ExtraSource, node: number, root: number, kind: StrikeSource, chain: readonly number[]): boolean {
  if (s.spec.scope === "bite") return VENOMABLE.has(kind) && s.nodes.has(node);
  if (s.spec.scope === "chain") return chain.includes(s.segment);
  const seg = body.segments[s.segment];
  return seg !== undefined && (root === seg.a || root === seg.b);
}

/**
 * What a blow from this node carries on top of its die. One of a kind at most:
 * a second venom gland is still venom, and §1.6 stacks nothing.
 */
export function extrasFor(sources: readonly ExtraSource[], body: Body, node: number, kind: StrikeSource, chain: readonly number[]): StrikeExtra[] {
  const best = new Map<ExtraKind, StrikeExtra>();
  const put = (e: StrikeExtra): void => {
    const had = best.get(e.kind);
    if (had === undefined || e.bonus > had.bonus) best.set(e.kind, e);
  };
  if (kind === "sting") put({ kind: "venom", bonus: 0, dice: STING_VENOM, burn: false, from: "sting" });
  const root = rootOf(body, node, chain);
  for (const s of sources) {
    if (!reaches(body, s, node, root, kind, chain)) continue;
    put({ kind: s.spec.kind, bonus: s.spec.bonus, dice: s.spec.dice, burn: s.spec.burn, from: s.from });
  }
  return [...best.values()].sort((x, y) => x.kind.localeCompare(y.kind));
}

export function reachOf(length: number): number {
  return Math.min(REACH_MAX, Math.max(1, Math.ceil(length / REACH_PER_LENGTH)));
}

/**
 * The limb a node clubs with, and its bulk: the node is the end of one limb
 * (its only live segment that is not a flank, and that segment leads to the
 * torso), or a knot where limbs were fused (decision 1265). Every limb that
 * meets there adds its length x girth, walked from the node to the first fork,
 * torso or flank: fused arms are one thick stump. Undefined for a fork, for a
 * torso node and for anything the chain does not hang from.
 */
function bareTip(ctx: Ctx, node: number, chain: number[]): { segment: number; bulk: number } | undefined {
  const { body } = ctx;
  const limbAt = (at: number): number[] => segmentsAt(body, at).filter((id) => !isFlank(body.segments[id]!));
  const here = limbAt(node);
  if (here.length === 0 || !here.every((id) => BARE_KINDS.has(body.segments[id]!.kind) && ctx.live.has(id) && works(body, id))) return undefined;
  if (here.length > 1 && body.nodes[node]!.fused === undefined) return undefined;
  const sid = chain[0];
  if (sid === undefined || !here.includes(sid)) return undefined;
  let bulk = 0;
  const seen = new Set<number>();
  for (const first of here) {
    let at = node;
    let cur: number | undefined = first;
    while (cur !== undefined && !seen.has(cur)) {
      const s: Segment = body.segments[cur]!;
      if (!BARE_KINDS.has(s.kind)) break;
      seen.add(cur);
      bulk += s.length * s.girth;
      at = otherEnd(s, at);
      const next: number[] = segmentsAt(body, at).filter((id) => id !== cur);
      cur = next.length === 1 ? next[0] : undefined;
    }
  }
  return { segment: sid, bulk };
}

/** A mouth the body pushes a gland out through: an ending that eats, or a head with jaws in it. */
function isVent(o: Organ): boolean {
  if (ORGANS[o.kind].flags?.includes("eat") === true) return true;
  return o.contents?.some((c) => ORGANS[c.kind].family === "jaws" || ORGANS[c.kind].flags?.includes("eat") === true) ?? false;
}

/** The end of the segment nearest your brain: where a discharge goes off the flesh. Ties go to the smaller id. */
function nearEnd(ctx: Ctx, a: number, b: number): number {
  const da = ctx.dist[a] ?? Infinity;
  const db = ctx.dist[b] ?? Infinity;
  if (da === db) return Math.min(a, b);
  return da < db ? a : b;
}

/**
 * Blows of the body itself (strike.md §1.8): every living organ tagged as a
 * weapon with a row of its own. A gland goes out through a mouth of its
 * component - the lowest node of it that has one, so one gland is one blow
 * however many heads the body grew; a discharge and a volley of spines leave
 * the flesh where they sit.
 */
function organAttacks(ctx: Ctx, sources: readonly ExtraSource[]): Attack[] {
  const { body } = ctx;
  const vents: number[] = [];
  for (const id of nodeIds(body)) if (running(ctx, id) && body.nodes[id]!.ends.some(isVent)) vents.push(id);
  const parts = components(body);
  const out: Attack[] = [];
  for (const sid of segmentIds(body)) {
    const seg = body.segments[sid]!;
    if (!works(body, sid) || !ctx.live.has(sid)) continue;
    let mouth: number | undefined;
    let slot = -1;
    for (const o of organsOfSegment(seg)) {
      slot += 1;
      const row = WEAPONS[o.kind]?.blow;
      if (row === undefined) continue;
      let node: number;
      if (row.vent) {
        mouth ??= (parts.find((p) => p.segments.includes(sid))?.nodes ?? []).find((n) => vents.includes(n));
        if (mouth === undefined) continue;
        node = mouth;
      } else {
        node = nearEnd(ctx, seg.a, seg.b);
      }
      if (!running(ctx, node)) continue;
      out.push({
        node,
        index: null,
        kind: o.kind,
        dice: sizedDice(row.dice, sizeOf(o)),
        reach: row.reach,
        segment: null,
        chain: [],
        mass: organFleshMass(o),
        blow: row,
        key: `${node}.o${sid}.${slot}`,
        extras: extrasFor(sources, body, node, o.kind, []),
      });
    }
  }
  return out;
}

export function attacks(ctx: Ctx): Attack[] {
  const { body } = ctx;
  const sources = extraSources(body, ctx.live);
  const out: Attack[] = [];
  const tailsAt = new Map<number, number[]>();
  for (const id of segmentIds(body)) {
    const s = body.segments[id]!;
    const spec = SEGMENT_KINDS[s.kind];
    if (spec.attack === undefined || s.length < (spec.attackFrom ?? 0)) continue;
    if (!ctx.live.has(id)) continue;
    const da = ctx.dist[s.a];
    const db = ctx.dist[s.b];
    // The tip is the end farther from your brain; unknown distances count as far.
    const tip = da === undefined ? s.a : db === undefined ? s.b : db >= da ? s.b : s.a;
    const list = tailsAt.get(tip);
    if (list === undefined) tailsAt.set(tip, [id]);
    else list.push(id);
  }
  for (const node of nodeIds(body)) {
    if (!running(ctx, node)) continue;
    const chain = chainOf(ctx, node);
    const reach = reachOf(chain.length);
    const before = out.length;
    const extras = (kind: StrikeSource): StrikeExtra[] => extrasFor(sources, body, node, kind, chain.segments);
    for (const cap of ctx.caps) {
      if (cap.node !== node) continue;
      // The capability already read the ending's row at its size step (capability.ts).
      if (cap.attack !== "") {
        out.push({ node, index: cap.index, kind: cap.kind, dice: cap.attack, reach, segment: cap.segment, chain: chain.segments, mass: partMass(ctx, cap), extras: extras(cap.kind) });
      }
      const ending = endingOf(ctx, cap);
      const contents = ending.contents;
      if (contents === undefined) continue;
      // A head bites once, with the best of its jaws (decision 1236); a jaw bites with itself and the neck behind the head, not with the whole head.
      const bite = headBite(ending);
      if (bite !== null) {
        out.push({ node, index: cap.index, kind: bite.organ.kind, dice: bite.dice, reach, segment: cap.segment, chain: chain.segments, mass: organFleshMass(bite.organ) + chain.mass, extras: extras("head") });
      }
      // Anything else in the head with a die of its own - iron - strikes by itself.
      for (const c of contents) {
        if (JAWS[c.kind] !== undefined) continue;
        const dice = organAttack(c);
        if (dice === "") continue;
        out.push({ node, index: cap.index, kind: c.kind, dice, reach, segment: cap.segment, chain: chain.segments, mass: organFleshMass(c) + chain.mass, extras: extras(c.kind) });
      }
    }
    for (const tail of tailsAt.get(node) ?? []) {
      // One limb is one blow: an ending that strikes off this segment is its blow, not a lash beside it (decision 1266).
      if (out.slice(before).some((a) => a.segment === tail)) continue;
      const kind = body.segments[tail]!.kind === "penis" ? "penis" : "tail";
      out.push({ node, index: null, kind, dice: SEGMENT_KINDS[body.segments[tail]!.kind].attack!, reach, segment: tail, chain: chain.segments, mass: chain.mass, extras: extras(kind) });
    }
    // Nothing on this tip strikes: the limb itself clubs, by its length and girth.
    if (out.length > before) continue;
    const bare = bareTip(ctx, node, chain.segments);
    if (bare === undefined) continue;
    const dice = bareBulkDice(bare.bulk);
    if (dice === null) continue;
    out.push({ node, index: null, kind: "stump", dice, reach, segment: bare.segment, chain: chain.segments, mass: chain.mass, extras: extras("stump") });
  }
  return [...out, ...organAttacks(ctx, sources)];
}
