/**
 * Hunger, docs/hunger.md «Голод ест тело»: an empty reserve is not a line in
 * a report. The body stops being fed and starts being eaten - by itself, from
 * the cheapest flesh to the dearest - down six rungs in one fixed order: the
 * fat, the muscle of the limbs, the mutations it grew, the limbs themselves,
 * the innards, and last the brain, which is the end of it.
 *
 * **The rung is not remembered.** It is read off the body every turn
 * (`hungerStep`), because what the body still has to eat is the only thing
 * that decides which rung it stands on. A rung with nothing left on it is
 * skipped the same turn, so the ladder never stalls, and no bite ever puts
 * back what a bite before it took, so the walk down it is finite and ends in
 * death. Eat, and the ladder stops where it stands; what is eaten stays
 * eaten.
 *
 * **Nothing is freed by being eaten.** Every rung that takes flesh off the
 * graph takes the same amount off `body.meat`, so the fat rung never finds
 * the muscle rung's leavings and calls them fat.
 *
 * The record it keeps is two numbers (`Starve`). It lives here and not in
 * `damage.ts`, which moves it: the file with the mechanics does not own the
 * state everyone else reads. Pure functions over the graph, and not one roll
 * - hunger asks no generator for anything.
 */
import type { Body, Organ, OrganKind, Segment, SegmentKind } from "./graph.js";
import { nodeIds, refreshSegmentHp, segmentIds, touch } from "./graph.js";
import { brains } from "./brains.js";
import { membraneArea, membranesOn } from "./membrane.js";
import { distances } from "./metrics.js";
import { isVital } from "./mutation.js";
import { ORGANS, capacity, cavityLoad, isChrome, mass, organMass, organUpkeep, organs, segmentMass } from "./parts.js";
import { strip } from "./strip.js";

// ---------------------------------------------------------------- the ladder

export type HungerStep = "fat" | "muscle" | "resorb" | "necrosis" | "innards" | "brain";

/** The rungs in the order the body goes down them, docs/hunger.md. */
export const LADDER: readonly HungerStep[] = ["fat", "muscle", "resorb", "necrosis", "innards", "brain"];

/**
 * Turns on an empty reserve one bite of each rung costs. These are the
 * numbers of the table in docs/hunger.md, in the units the graph has:
 *
 * - `fat` and `muscle` are the table's 30 turns, a point of free meat and a
 *   point of a limb's girth;
 * - `resorb` and `innards` are the table's 100 and 150, one organ each;
 * - `necrosis` is the table's 150 a limb, split four ways: a limb is several
 *   elements and each of them breaks before it falls (decision 763);
 * - `brain` is the table's 50, one brain instead of one channel (decision 765).
 */
export const HUNGER_TURNS: Record<HungerStep, number> = {
  fat: 30,
  muscle: 30,
  resorb: 100,
  necrosis: 40,
  innards: 150,
  brain: 50,
};

/** What hangs off the body and carries it: what the muscle and necrosis rungs eat. */
const LIMBS: ReadonlySet<SegmentKind> = new Set<SegmentKind>(["arm", "leg", "tentacle", "tail"]);

// ---------------------------------------------------------------- state

export interface Starve {
  /** Turns on an empty reserve since it last ate. */
  turns: number;
  /** Turns counted toward the next bite; a meal puts it back to zero. */
  carry: number;
}

export function newStarve(): Starve {
  return { turns: 0, carry: 0 };
}

/** It ate: the clock starts again, and the rung it reached stays reached. */
export function resetStarve(s: Starve): void {
  s.turns = 0;
  s.carry = 0;
}

/** One bite of one rung: what it took, and from where. */
export interface HungerBite {
  step: HungerStep;
  /** Mass the body took back out of itself. */
  mass: number;
  /** Elements it changed or took off, ascending. */
  elements: number[];
  /** Organs gone for good, in the order they left. */
  organs: OrganKind[];
  /** The elements named are gone from the graph, not only broken. */
  lost: boolean;
}

// ---------------------------------------------------------------- 1. the fat

/** Flesh the body carries and no organ occupies: what it lives on first. */
function freeMeat(body: Body): number {
  return body.meat - mass(body);
}

// ---------------------------------------------------------------- 2. the muscle

/** Membranes lie on the flesh of the segments they span: thinner flesh, less of a wing. */
function clampMembranes(body: Body, segId: number): void {
  for (const id of membranesOn(body, segId)) {
    const m = body.membranes[id]!;
    m.area = Math.min(m.area, membraneArea(body, m));
  }
}

/** The fattest limb that can spare a point of girth without squeezing what it holds inside. */
function thinnable(body: Body): Segment | null {
  let best: Segment | null = null;
  for (const id of segmentIds(body)) {
    const s = body.segments[id]!;
    if (!LIMBS.has(s.kind) || s.girth <= 1) continue;
    if (cavityLoad(s) > capacity({ ...s, girth: s.girth - 1 })) continue;
    if (best === null || s.girth > best.girth) best = s;
  }
  return best;
}

function eatMuscle(body: Body, seg: Segment): HungerBite {
  const before = segmentMass(seg);
  seg.girth -= 1;
  refreshSegmentHp(seg);
  const lost = before - segmentMass(seg);
  body.meat -= lost;
  clampMembranes(body, seg.id);
  touch(body);
  return { step: "muscle", mass: lost, elements: [seg.id], organs: [], lost: false };
}

// ---------------------------------------------------------------- 3 and 5. the organs

/** One organ and the element it sits on. */
interface Spot {
  organ: Organ;
  where: number;
}

/** What hangs on the body: endings, what a head holds, and growths on the skin. */
function outside(body: Body): Spot[] {
  const out: Spot[] = [];
  for (const id of nodeIds(body)) {
    for (const e of body.nodes[id]!.ends) {
      out.push({ organ: e, where: id });
      for (const c of e.contents ?? []) out.push({ organ: c, where: id });
    }
  }
  for (const id of segmentIds(body)) for (const o of body.segments[id]!.growths) out.push({ organ: o, where: id });
  return out;
}

/** What is inside it: the cavities, and nothing else. */
function inside(body: Body): Spot[] {
  const out: Spot[] = [];
  for (const id of segmentIds(body)) for (const o of body.segments[id]!.cavity) out.push({ organ: o, where: id });
  return out;
}

function kindCounts(body: Body): Map<OrganKind, number> {
  const out = new Map<OrganKind, number>();
  for (const o of organs(body)) out.set(o.kind, (out.get(o.kind) ?? 0) + 1);
  return out;
}

/** Flesh with something in it: chrome is iron, a mark weighs nothing, and the vital is never food. */
function edible(body: Body, o: Organ): boolean {
  return !isChrome(o) && organMass(o) > 0 && !isVital(body, o);
}

/** An organ the body grew beyond the human it started as: a mutation, and the resorption takes those. */
function spare(body: Body, o: Organ, counts: Map<OrganKind, number>): boolean {
  const spec = ORGANS[o.kind];
  if (spec.family === undefined) return false;
  if ((counts.get(o.kind) ?? 0) <= (spec.baseline ?? 0)) return false;
  return edible(body, o);
}

/** The most expensive of them to keep; the heavier one at a tie, the first one found at both. */
function hungriest(list: readonly Spot[]): Spot | null {
  let best: Spot | null = null;
  for (const s of list) {
    if (best === null) {
      best = s;
      continue;
    }
    const mine = organUpkeep(s.organ);
    const theirs = organUpkeep(best.organ);
    if (mine > theirs || (mine === theirs && organMass(s.organ) > organMass(best.organ))) best = s;
  }
  return best;
}

function spares(body: Body): Spot[] {
  const counts = kindCounts(body);
  return outside(body).filter((s) => spare(body, s.organ, counts));
}

function innards(body: Body): Spot[] {
  return inside(body).filter((s) => edible(body, s.organ));
}

/** Out it goes, the way the lab takes back what it grew: no wound, no stump, no bleeding. */
function eatOrgan(body: Body, step: HungerStep, spot: Spot): HungerBite {
  const gone = strip(body, (o) => o === spot.organ, []);
  return { step, mass: gone.lost, elements: [spot.where], organs: gone.organs.map((o) => o.kind), lost: false };
}

// ---------------------------------------------------------------- 4. the limbs

/** The limb element farthest from your brain: what dies first is what is least yours. */
function outermostLimb(body: Body): Segment | null {
  const dist = distances(body, body.self);
  let best: Segment | null = null;
  let far = -Infinity;
  for (const id of segmentIds(body)) {
    const s = body.segments[id]!;
    if (!LIMBS.has(s.kind)) continue;
    const d = Math.max(dist[s.a] ?? -1, dist[s.b] ?? -1);
    if (d > far) {
      best = s;
      far = d;
    }
  }
  return best;
}

/**
 * A limb dies in two bites: the first breaks it, the second takes it off with
 * everything hanging beyond it. Between them the blood stops at the break
 * (`fed` of metrics.ts), so what is past it starves by the rules that were
 * already written - hunger does not need its own rot.
 */
function eatLimb(body: Body, seg: Segment): HungerBite {
  if (seg.hp > 0) {
    seg.hp = 0;
    touch(body);
    return { step: "necrosis", mass: 0, elements: [seg.id], organs: [], lost: false };
  }
  const gone = strip(body, () => false, [seg.id]);
  const elements = [...gone.nodes.map((n) => n.id), ...gone.segments.map((s) => s.id)].sort((x, y) => x - y);
  return { step: "necrosis", mass: gone.lost, elements, organs: gone.organs.map((o) => o.kind), lost: true };
}

// ---------------------------------------------------------------- 6. the brain

/** A brain already dead first, then a brain that is not you; you are the last thing the body eats. */
function eatBrain(body: Body): HungerBite | null {
  const list = brains(body);
  if (list.length === 0) return null;
  const victim = [...list].sort((a, b) => Number(a.alive) - Number(b.alive) || Number(a.self) - Number(b.self) || a.sway - b.sway || a.key.localeCompare(b.key))[0]!;
  const where = "node" in victim.place ? victim.place.node : victim.place.segment;
  const gone = strip(body, (o) => o === victim.organ, []);
  return { step: "brain", mass: gone.lost, elements: [where], organs: gone.organs.map((o) => o.kind), lost: false };
}

// ---------------------------------------------------------------- the ladder read and walked

/** The rung the body stands on: the first one with anything left on it. Null when there is nothing at all. */
export function hungerStep(body: Body): HungerStep | null {
  if (freeMeat(body) >= 1) return "fat";
  if (thinnable(body) !== null) return "muscle";
  if (spares(body).length > 0) return "resorb";
  if (outermostLimb(body) !== null) return "necrosis";
  if (innards(body).length > 0) return "innards";
  return brains(body).length > 0 ? "brain" : null;
}

function biteOf(body: Body, step: HungerStep): HungerBite | null {
  switch (step) {
    case "fat":
      body.meat -= 1;
      touch(body);
      return { step, mass: 1, elements: [], organs: [], lost: false };
    case "muscle": {
      const seg = thinnable(body);
      return seg === null ? null : eatMuscle(body, seg);
    }
    case "resorb": {
      const spot = hungriest(spares(body));
      return spot === null ? null : eatOrgan(body, "resorb", spot);
    }
    case "necrosis": {
      const seg = outermostLimb(body);
      return seg === null ? null : eatLimb(body, seg);
    }
    case "innards": {
      const spot = hungriest(innards(body));
      return spot === null ? null : eatOrgan(body, "innards", spot);
    }
    case "brain":
      return eatBrain(body);
  }
}

/**
 * One turn of an empty reserve. Returns the bite the ladder took, or null on
 * the turns between bites - which is most of them, because the cheapest rung
 * costs thirty turns.
 */
export function starveTurn(body: Body, s: Starve): HungerBite | null {
  s.turns += 1;
  const step = hungerStep(body);
  if (step === null) return null;
  s.carry += 1;
  if (s.carry < HUNGER_TURNS[step]) return null;
  const bite = biteOf(body, step);
  s.carry = bite === null ? 0 : Math.max(0, s.carry - HUNGER_TURNS[step]);
  return bite;
}
