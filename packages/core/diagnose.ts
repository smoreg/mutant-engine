/**
 * What is wrong with a body, and which cut of the operating room helps
 * (decision 1323). `diagnose` reads the body - and, when it is handed one,
 * its record of wounds - and lists every problem with the numbers that make
 * it one: what the body has, what it needs, how grave that is, which parts
 * are to blame. One rule a problem, the same for every body: the gravity is
 * the share of the need that goes unmet, times how much that need matters,
 * and no family has a threshold of its own.
 *
 * `treatments` tries every operation the knife offers on a copy of the body
 * and keeps those the copy proves: the problem eases, and the body as a whole
 * is no worse for it. What the knife cannot give - an organ the body lacks -
 * is named as the catalog rows that would grow it.
 *
 * Pure: nothing here writes into the body or the harm it is handed.
 */
import { effort } from "./derive/breath.js";
import { acidToll } from "./derive/speed.js";
import { EAR_KINDS, EYE_KINDS } from "./derive/senses.js";
import { derive, type Derived } from "./derive.js";
import { brains } from "./brains.js";
import { DIAGNOSIS_TEXT, type Text } from "./content/i18n.js";
import { MUTATIONS } from "./content/mutations.js";
import { bloodMax, mindState, organSlots, totalBleed, type Harm } from "./damage.js";
import { nodeIds, segmentIds, type Body, type OrganKind } from "./graph.js";
import { human } from "./human.js";
import { anatomy, operationsFor, outcomeOf, type Operation, type Part } from "./knife-ops.js";
import { mentalLoad, mindPower } from "./mind.js";
import { ORGANS, organControl } from "./parts.js";
import { planStrike } from "./strike.js";

export type ProblemId =
  | "heart"
  | "air"
  | "eat"
  | "walk"
  | "strike"
  | "blood"
  | "infection"
  | "hunger"
  | "acid"
  | "pain"
  | "control"
  | "sight"
  | "starving"
  | "burden"
  | "ceiling"
  | "sway"
  | "hearing";

/**
 * How much each need matters, 0..1: the gravity of a problem is this times
 * the share of the need unmet. What stops a body living or fighting is 1,
 * what a body fights on without is less.
 */
export const PROBLEM_WEIGHT: Record<ProblemId, number> = {
  heart: 1,
  air: 1,
  eat: 1,
  walk: 1,
  strike: 0.8,
  blood: 1,
  infection: 0.8,
  hunger: 0.8,
  acid: 0.8,
  pain: 0.7,
  control: 0.5,
  sight: 0.6,
  starving: 0.6,
  burden: 0.5,
  ceiling: 0.5,
  sway: 0.5,
  hearing: 0.3,
};

export interface Problem {
  id: ProblemId;
  /** 0..1: the weight of the need times the share of it unmet. */
  severity: number;
  /** What the body has of what it needs, in the need's own measure. */
  have: number;
  need: number;
  /** What a player reads, the numbers in it. */
  text: Text;
  /** Elements (node or segment ids) the problem sits in or comes from. */
  culprits: number[];
  /** The problem this one follows from: pain from acid, acid from air. Null when it is its own cause. */
  cause: ProblemId | null;
  /** Catalog rows that grow what the body lacks for this need: what a stone can give where the knife cannot. */
  rows: string[];
}

/** A pain this high costs a brain its calm (damage.ts, `TREMOR`). */
const PAIN_TELLS = 30;
const EPS = 1e-9;

function round(x: number): number {
  return Math.round(x * 100) / 100;
}

function words(id: ProblemId, variant: string, vars: Record<string, number>): Text {
  const t = DIAGNOSIS_TEXT[`${id}.${variant}`] ?? DIAGNOSIS_TEXT[id]!;
  const fill = (s: string): string => s.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] === undefined ? `{${k}}` : String(Math.round(vars[k]! * 10) / 10)));
  return { ru: fill(t.ru), en: fill(t.en) };
}

function problem(id: ProblemId, share: number, have: number, need: number, text: Text, culprits: number[] = [], cause: ProblemId | null = null): Problem {
  const severity = round(PROBLEM_WEIGHT[id] * Math.max(0, Math.min(1, share)));
  return { id, severity, have: round(have), need: round(need), text, culprits: [...new Set(culprits)].sort((a, b) => a - b), cause, rows: rowsFor(id) };
}

// ---------------------------------------------------------------- what a stone could give

/** What answers a need, by the organ a row places or the ending it grows: lungs for air, a foot for walking. */
const GROWS: Partial<Record<ProblemId, (k: OrganKind) => boolean>> = {
  walk: (k) => (ORGANS[k].stand ?? 0) > 0,
  air: (k) => {
    const b = ORGANS[k].breath;
    return b !== undefined && (b.air > 0 || b.water > 0);
  },
  heart: (k) => k === "heart",
  sight: (k) => EYE_KINDS.has(k),
  hearing: (k) => EAR_KINDS.has(k),
};

const rowsCache = new Map<ProblemId, string[]>();

/** The catalog rows that place an organ, or sprout a limb ending in one, answering the need. */
function rowsFor(id: ProblemId): string[] {
  const hit = rowsCache.get(id);
  if (hit !== undefined) return hit;
  const fits = GROWS[id];
  const out: string[] = [];
  if (fits !== undefined) {
    for (const m of MUTATIONS) {
      const p = m.payload as { organ?: { kind: OrganKind }; ending?: { kind: OrganKind } | null };
      const kind = m.op === "organ" ? p.organ?.kind : m.op === "sprout" ? p.ending?.kind : undefined;
      if (kind !== undefined && fits(kind)) out.push(m.id);
    }
  }
  rowsCache.set(id, out);
  return out;
}

// ---------------------------------------------------------------- the body

let man: Body | null = null;

/** The mass of a volley at a man: what its muscles throw in one turn of a fight. */
function volleyMass(body: Body): number {
  man ??= human();
  return planStrike(body, man).planned.reduce((s, p) => s + p.strike.mass, 0);
}

/** Elements that hold a brain that is not yours: what thinks and breathes past you. */
function otherBrains(body: Body): number[] {
  return brains(body)
    .filter((b) => !b.self && b.alive)
    .map((b) => ("node" in b.place ? b.place.node : b.place.segment));
}

/** Elements by how much their organs ask of the channels, the heaviest first. */
function controlCulprits(body: Body, n = 3): number[] {
  const load = new Map<number, number>();
  for (const s of organSlots(body)) {
    const c = organControl(s.organ);
    if (c > 0) load.set(s.element, (load.get(s.element) ?? 0) + c);
  }
  return [...load]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, n)
    .map(([id]) => id);
}

/**
 * Air short at rest: the draw does not cover what the brains, the hearts and
 * the mass spend doing nothing (breath.md §2). Such a body pays every blow on
 * credit and never pays it back - the acid of a fight stays for good and burns
 * its brains (breath.md §3). Half the gravity is that the acid cannot leave at
 * all; the rest grows with the share of the need unmet. A body that is only
 * winded by a long fight is not ill: the draw pays the acid off afterwards.
 */
function air(body: Body, d: Derived): Problem | null {
  const have = Math.max(d.breath.intake.air, d.breath.intake.water);
  const need = d.breath.base;
  if (have > need + EPS || need <= 0) return null;
  const share = 0.5 + (need - have) / need;
  return problem("air", share, have, need, words("air", have <= 0 ? "none" : "", { have, need }), otherBrains(body));
}

function control(body: Body, harm: Harm | undefined): Problem | null {
  const cap = mindPower(body);
  const state = harm === undefined ? null : mindState(body, harm);
  const have = state === null ? cap : state.power;
  const need = state === null ? mentalLoad(body).total : state.load;
  if (have >= need - EPS || need <= 0) return null;
  // Channels the structure has and pain takes away are pain's to answer for.
  const pained = state !== null && cap >= need - EPS && state.brains.some((b) => b.pain >= PAIN_TELLS || b.level === "out");
  const culprits = pained ? state.brains.filter((b) => b.pain >= PAIN_TELLS).map((b) => ("node" in b.brain.place ? b.brain.place.node : b.brain.place.segment)) : controlCulprits(body);
  return problem("control", (need - have) / need, have, need, words("control", pained ? "pain" : "body", { have, need, n: Math.ceil(need - have) }), culprits, pained ? "pain" : null);
}

function bodyProblems(body: Body, d: Derived): Problem[] {
  const out: Problem[] = [];
  const push = (p: Problem | null): void => {
    if (p !== null && p.severity > 0) out.push(p);
  };
  if (d.blood.hearts.length === 0) push(problem("heart", 1, 0, 1, words("heart", "", {})));
  push(air(body, d));
  if (!d.eat.can) push(problem("eat", 1, 0, 1, words("eat", "", {})));
  if (d.speed.value <= 0) push(problem("walk", 1, 0, 1, words("walk", "", {})));
  else if (d.speed.burden < 1 - EPS) push(problem("burden", 1 - d.speed.burden, d.speed.burden * 100, 100, words("burden", "", { have: d.speed.burden * 100 })));
  if (d.attacks.length === 0) push(problem("strike", 1, 0, 1, words("strike", "", {})));
  if (!d.senses.sight) push(problem("sight", 1, 0, 1, words("sight", "", {})));
  if (d.senses.hearing <= 0) push(problem("hearing", 1, 0, 1, words("hearing", "", {})));
  const { mass, ceiling } = d.budgets;
  if (mass > ceiling + EPS) push(problem("ceiling", (mass - ceiling) / mass, ceiling, mass, words("ceiling", "", { have: mass, need: ceiling })));
  if (d.blood.starving.length > 0) {
    const all = nodeIds(body).length + segmentIds(body).length;
    const ids = d.blood.starving.map((s) => s.id);
    push(problem("starving", ids.length / all, all - ids.length, all, words("starving", "", { n: ids.length }), ids));
  }
  const swayed = brains(body).filter((b) => !b.self && b.alive && b.sway > 0);
  if (swayed.length > 0) {
    const top = Math.max(...swayed.map((b) => b.sway));
    push(problem("sway", top / 10, 10 - top, 10, words("sway", "", { n: swayed.length, have: top }), swayed.map((b) => ("node" in b.place ? b.place.node : b.place.segment))));
  }
  return out;
}

// ---------------------------------------------------------------- the wounds

function harmProblems(body: Body, harm: Harm, found: readonly Problem[]): Problem[] {
  const out: Problem[] = [];
  const push = (p: Problem | null): void => {
    if (p !== null && p.severity > 0) out.push(p);
  };
  if (harm.dead !== null) return out;
  const max = bloodMax(body);
  const bleed = totalBleed(body, harm);
  if (max > 0 && (harm.blood < max - EPS || bleed > 0)) {
    const bleeding = segmentIds(body).filter((id) => body.segments[id]!.bleed > 0);
    for (const id of Object.keys(harm.nodeBleed).map(Number)) if ((harm.nodeBleed[id] ?? 0) > 0) bleeding.push(id);
    // A bleed is as grave as the blood it will have taken in the twenty turns a belly lasts.
    const share = (max - harm.blood + 20 * bleed) / max;
    push(problem("blood", share, harm.blood, max, words("blood", bleed > 0 ? "bleed" : "", { have: harm.blood, need: max, n: bleed }), bleeding));
  }
  const sick = Object.keys(harm.infection).map(Number);
  if (sick.length > 0) {
    const stage = Math.max(...sick.map((id) => harm.infection[id]!.stage));
    push(problem("infection", stage / 3, 3 - stage, 3, words("infection", "", { n: sick.length, have: stage }), sick));
  }
  if (harm.reserve <= 0) push(problem("hunger", 1, 0, 1, words("hunger", "", {})));
  const acid = harm.acid ?? 0;
  if (acid > 0) {
    const stuck = found.some((p) => p.id === "air");
    push(problem("acid", acid / 100, acid, 0, words("acid", stuck ? "stuck" : "", { have: acid }), [], stuck ? "air" : null));
  }
  let pain = 0;
  const hurting: number[] = [];
  const state = mindState(body, harm);
  for (const b of state.brains) {
    pain = Math.max(pain, b.pain);
    if (b.pain >= PAIN_TELLS) hurting.push("node" in b.brain.place ? b.brain.place.node : b.brain.place.segment);
  }
  if (pain >= PAIN_TELLS) push(problem("pain", pain / 100, pain, 0, words("pain", "", { have: pain, n: hurting.length }), hurting, acidToll(acid).burn > 0 ? "acid" : null));
  return out;
}

// ---------------------------------------------------------------- the list

/**
 * The gravest first, a cause before what follows from it: a problem stands as
 * high as the gravest of its consequences, so the air comes before the acid,
 * the acid before the pain, the pain before the channels it took.
 */
function order(list: Problem[]): Problem[] {
  const rank = new Map(Object.keys(PROBLEM_WEIGHT).map((k, i) => [k, i]));
  const by = new Map(list.map((p) => [p.id, p]));
  const depth = (p: Problem): number => (p.cause === null || !by.has(p.cause) ? 0 : 1 + depth(by.get(p.cause)!));
  const root = (p: Problem): Problem => (p.cause === null || !by.has(p.cause) ? p : root(by.get(p.cause)!));
  const top = new Map<ProblemId, number>();
  for (const p of list) {
    const r = root(p).id;
    top.set(r, Math.max(top.get(r) ?? 0, p.severity));
  }
  const key = (p: Problem): number => top.get(root(p).id)!;
  return list.sort((a, b) => key(b) - key(a) || rank.get(root(a).id)! - rank.get(root(b).id)! || depth(a) - depth(b) || b.severity - a.severity || rank.get(a.id)! - rank.get(b.id)!);
}

/**
 * Every problem of the body, the gravest first. With a record of wounds the
 * list also holds what the wounds are doing - blood, festering, hunger, the
 * acid and the pain - and the channels are those the pain has left.
 */
export function diagnose(body: Body, harm?: Harm): Problem[] {
  const d = derive(body);
  const found = bodyProblems(body, d);
  const c = control(body, harm);
  if (c !== null && c.severity > 0) found.push(c);
  if (harm !== undefined) found.push(...harmProblems(body, harm, found));
  return order(found);
}

/** The sum of the gravities: how bad the body is, all told. */
export function severityOf(list: readonly Problem[]): number {
  return round(list.reduce((s, p) => s + p.severity, 0));
}

// ---------------------------------------------------------------- the knife's answers

export interface Remedy {
  part: Part;
  op: Operation;
  /** How much the problem's gravity drops. */
  gain: number;
  /** The problem is gone after it. */
  cures: boolean;
  /** How much the body's whole gravity drops (never below zero: a cut that worsens the whole is not offered). */
  total: number;
  /** A cut through flesh that leaves a stump to bleed. */
  wound: boolean;
  mass: number;
  /** What the body gives up for it, as the room words its numbers: `атаки 10 → 8`. */
  losses: string[];
}

export interface Treatment {
  problem: Problem;
  /** Proven on a copy, the best first; empty when the knife cannot help. */
  remedies: Remedy[];
}

/** How many cuts a problem offers at most. */
export const REMEDIES_MAX = 4;

interface Tried {
  part: Part;
  op: Operation;
  after: Map<ProblemId, number>;
  total: number;
  removed: Set<number>;
  /** The mass that leaves and the problems left: two cuts that end the same are the same answer. */
  takes: string;
  wound: boolean;
  mass: number;
  losses: string[];
}

/** Every operation of the table on a copy of the body, with the body's problems after it. */
function tryAll(body: Body): Tried[] {
  const out: Tried[] = [];
  const grips = derive(body).grips.total;
  for (const part of anatomy(body)) {
    for (const op of operationsFor(body, part)) {
      const o = outcomeOf(body, op);
      if (o.empty) continue;
      const list = diagnose(o.after);
      // A cut that takes a whole ability away is never advice: the last heart, sight, the legs and the mouth are
      // problems of their own and weigh the whole down; the last hand is checked here.
      if (grips > 0 && derive(o.after).grips.total === 0) continue;
      const removed = new Set<number>();
      for (const id of [...nodeIds(body), ...segmentIds(body)]) if (o.after.nodes[id] === undefined && o.after.segments[id] === undefined) removed.add(id);
      const after = new Map(list.map((p) => [p.id, p.severity]));
      const takes = `${o.mass}|${JSON.stringify([...after])}`;
      const said = (v: string | number | boolean): string => (typeof v === "number" ? String(Math.round(v * 10) / 10) : String(v));
      const losses = o.stats.filter((x) => x.verdict === "worse").map((x) => `${x.ru} ${said(x.before)} → ${said(x.after)}`);
      out.push({ part, op, after, total: severityOf(list), removed, takes, wound: o.wound, mass: o.mass, losses });
    }
  }
  return out;
}

/**
 * Every problem of `diagnose`, each with the cuts that ease it. A cut is
 * offered for a problem when, on a copy, the problem's gravity drops and the
 * gravity of the whole body does not grow; a problem of the wounds is eased
 * by a cut that takes away the parts it sits in. A problem that follows from
 * another (`cause`) is answered by that one's cuts. A cut that takes a whole
 * ability away is never offered. Best first: what eases most, then the clean
 * cut before the stump, then what gives up least, then the lighter.
 */
export function treatments(body: Body, harm?: Harm): Treatment[] {
  const problems = diagnose(body, harm);
  if (problems.length === 0) return [];
  const before = diagnose(body);
  const total = severityOf(before);
  const tried = tryAll(body);
  return problems.map((problem) => {
    if (problem.cause !== null) return { problem, remedies: [] };
    const structural = before.find((p) => p.id === problem.id);
    const remedies: (Remedy & { takes: string })[] = [];
    for (const t of tried) {
      if (t.total > total + EPS) continue;
      let gain: number;
      let cures: boolean;
      if (structural !== undefined) {
        const left = t.after.get(problem.id) ?? 0;
        gain = round(structural.severity - left);
        cures = left === 0;
      } else if (problem.culprits.length > 0 && problem.culprits.every((id) => t.removed.has(id))) {
        gain = problem.severity;
        cures = true;
      } else continue;
      if (gain <= EPS) continue;
      remedies.push({ part: t.part, op: t.op, gain, cures, total: round(total - t.total), wound: t.wound, mass: t.mass, losses: t.losses, takes: t.takes });
    }
    remedies.sort((a, b) => b.gain - a.gain || Number(a.wound) - Number(b.wound) || a.losses.length - b.losses.length || b.total - a.total || a.mass - b.mass);
    // Two cuts that take the same flesh are one answer: a flank and the torso it carries, a clean removal and the stump.
    const seen = new Set<string>();
    const out: Remedy[] = [];
    for (const { takes, ...r } of remedies) {
      if (seen.has(takes)) continue;
      seen.add(takes);
      out.push(r);
      if (out.length === REMEDIES_MAX) break;
    }
    return { problem, remedies: out };
  });
}

/** Exposed for the stand: the mass of the volley a body throws at a man, the air need's working part. */
export function volleyEffort(body: Body): number {
  return effort("strike", volleyMass(body));
}
