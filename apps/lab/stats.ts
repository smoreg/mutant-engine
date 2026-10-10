/**
 * The statistics tab as pure functions: N seeds grown by M mutations from one
 * source, measured one body at a time, with the spread on or off. A sample
 * is a few numbers and the body's hash; the page draws histograms and a
 * heat map of the families over them and grows a thumbnail's body again from
 * its seed when it needs the picture. Since step H a sample also counts what
 * the abyss did at the ceiling: strikes lost, tumours, organs evicted and of
 * which kinds, whether a vital organ is missing, the alienness and the
 * leading family. Since step I it also measures the plan: how human the body
 * still is, its thickest torso, its torsos, a head sunk into one, the longest
 * chain, the forks, and how many strikes landed on the torso. Since step J it
 * reads the needs: their strengths, the brains and hearts, whether the body
 * eats, how far the mind is overloaded, and which foreign territories would
 * live on their own at a sway of two.
 */
import {
  FAMILIES,
  NEED_KINDS,
  ORGANS,
  bodyHash,
  brains,
  closure,
  derive,
  familyCounts,
  forks,
  hearts,
  humanoid,
  longestChain,
  mass,
  mentalLoad,
  mindPower,
  needs,
  nodeIds,
  organs,
  segmentIds,
  sortedIds,
  survivalReport,
  setSway,
  type Body,
  type Family,
  type MembraneKind,
  type NeedKind,
  type OrganKind,
  type SegmentKind,
  type Command,
  type Event,
  type Source,
  type Start,
  run,
  type LabState,
} from "@mutant-engine/core";

/**
 * The traits a reader looks for on a batch: what the body carries, by the
 * words of the picture rather than by catalog rows - one trait is many rows
 * and many organ kinds. A trait counts parts, so `mean` is parts per body and
 * `bodies` the share that carries any at all. The human's own are counted
 * too: an eye is an eye whether it grew or was always there.
 */
interface Trait {
  id: string;
  ru: string;
  organs?: readonly OrganKind[];
  segments?: readonly SegmentKind[];
  membranes?: readonly MembraneKind[];
  /** Endings of this kind on the nodes: a head is an ending, not an organ of a cavity. */
  ends?: readonly OrganKind[];
  /** What a human already has: the table shows the share beyond it. */
  human?: number;
}

export const TRAITS: readonly Trait[] = [
  { id: "eye", ru: "глаза", organs: ["eye", "facetEye", "heatEye", "innerEye", "symbioticEye"], human: 2 },
  { id: "ear", ru: "уши", organs: ["ear", "earCluster", "echo"], human: 2 },
  { id: "mouth", ru: "рты и челюсти", organs: ["mouth", "jaw", "fangs", "crusherJaw", "mandibles", "radula", "proboscis", "throatTeeth", "flower"], human: 1 },
  { id: "head", ru: "головы", ends: ["head"], human: 1 },
  { id: "hand", ru: "кисти", ends: ["hand"], human: 2 },
  { id: "pincer", ru: "клешни", ends: ["pincer"] },
  { id: "claw", ru: "когти и крючья", ends: ["claw", "hook"] },
  { id: "sting", ru: "жала и ядовитые железы", organs: ["sting", "venomGland"] },
  { id: "tentacle", ru: "щупальца", segments: ["tentacle"] },
  { id: "tail", ru: "хвосты", segments: ["tail"] },
  { id: "stalk", ru: "стебли", segments: ["stalk"] },
  { id: "wing", ru: "крылья (перепонка)", membranes: ["wing"] },
  { id: "gill", ru: "жабры", organs: ["gillCluster"], membranes: ["gill"] },
  { id: "breath", ru: "прочее дыхание", organs: ["lungs", "tracheae", "airSacs", "doubleBreath", "anaerobicGlands"], human: 1 },
  { id: "heart", ru: "сердца", organs: ["heart"], human: 1 },
  { id: "brain", ru: "мозги, кроме твоего", organs: ["smallBrain", "ganglion", "gutBrain", "coldMind", "mirrorLobes"] },
  { id: "gland", ru: "железы", organs: ["acidGland", "fireGland", "cryoGland", "sporeGland", "webGland", "pheromoneGland", "inkSac", "tarGland", "pusGland", "leechGland", "skinGland", "enzymeGland", "panaceaGland", "mirrorGland"] },
  { id: "womb", ru: "матки и кладки", organs: ["womb", "broodPouch", "ovipositor", "quickClutch", "bud", "eggInBody", "decoyEgg", "swarmWomb", "cannibalWomb", "parasiticClutch"] },
];

interface StatsParams {
  seeds: number;
  mutations: number;
  source: Source;
  family?: Family;
  /** The human by default. */
  start?: Start;
}

/** What must never be missing after a run: a heart, a brain, an organ that breathes. */
interface Vitals {
  noHeart: boolean;
  noBrain: boolean;
  noBreath: boolean;
}

export interface Sample {
  seed: number;
  /** Sees nothing: no eye and no heat pit (decision 115). */
  blind: boolean;
  /** Stands on nothing: speed 0 (decision 115). */
  lame: boolean;
  nodes: number;
  segments: number;
  closure: number;
  heads: number;
  mass: number;
  /** Families with three organs or more beyond the human. */
  familiesAt3: number;
  counts: Record<Family, number>;
  hash: string;
  /** Mutations that found no place, not even for a tumour. */
  lost: number;
  /** Mutations that became a tumour. */
  tumours: number;
  /** Organs the abyss pushed out at the ceiling, and of which kinds. */
  displaced: number;
  displacedKinds: Partial<Record<OrganKind, number>>;
  vitals: Vitals;
  /** How far the body is from the human (`alienness`, decision 1254). */
  alien: number;
  /** Share of the leading family among everything that grew beyond the human; 0 for the human. */
  lead: number;
  /** 0..1, how much of the human plan is left (plan.ts). */
  humanoid: number;
  /** The thickest torso's girth. */
  maxGirth: number;
  torsos: number;
  /** A head sits directly on an end of a torso. */
  sunkHead: boolean;
  /** The longest unbranched chain, in segments. */
  chain: number;
  /** Nodes of degree 3 or more. */
  forks: number;
  /** Mutations that landed (not lost, not a tumour), and how many of them on the torso or its nodes, and how many were defects. */
  landed: number;
  onPlan: number;
  defectsLanded: number;
  /** The needs of the body after the run, 0..1 each (step J). */
  needs: Record<NeedKind, number>;
  brains: number;
  gutBrains: number;
  hearts: number;
  eats: boolean;
  /** Mental load less the mind's power: above zero the channels are short. */
  overload: number;
  /** Foreign territories at sway SURVIVAL_SWAY, and how many would live on their own when separated. */
  survival: { territories: number; survived: number };
  /** Parts of each trait of `TRAITS` the body carries. */
  traits: Record<string, number>;
  /** Rows of the catalog this body drew, and of them the ones that found a place: what never appears is read from here. */
  drew: Record<string, number>;
  seated: Record<string, number>;
  /** It flies: a wing membrane wide enough to carry it. */
  flies: boolean;
}

/** Every foreign brain is read at this sway for the survival count: a head the body has put up with for a while. */
export const SURVIVAL_SWAY = 2;

/** The lab command a sample is grown by; a thumbnail opens the lab with exactly this. */
function statsCommand(params: StatsParams): Command {
  const cmd: Command = { t: "mutate", source: params.source, n: params.mutations };
  if (params.source === "vaccine" && params.family !== undefined) cmd.family = params.family;
  return cmd;
}

export function heads(body: Body): number {
  let n = 0;
  for (const id of nodeIds(body)) for (const e of body.nodes[id]!.ends) if (e.kind === "head") n += 1;
  return n;
}

function breathing(body: Body): number {
  let n = 0;
  for (const o of organs(body)) if (ORGANS[o.kind].breath !== undefined) n += 1;
  return n;
}

export function leadShare(counts: Record<Family, number>): number {
  let total = 0;
  let max = 0;
  for (const f of FAMILIES) {
    total += counts[f];
    max = Math.max(max, counts[f]);
  }
  return total > 0 ? max / total : 0;
}

/** A head sitting directly on an end of a torso: no neck under it. */
function sunkHead(body: Body): boolean {
  const ends = new Set<number>();
  for (const id of segmentIds(body)) {
    const s = body.segments[id]!;
    if (s.kind === "torso") ends.add(s.a).add(s.b);
  }
  for (const id of ends) if (body.nodes[id]?.ends.some((e) => e.kind === "head")) return true;
  return false;
}

/** The survival of the foreign territories at SURVIVAL_SWAY, read on a clone so the sample's body stays as the run left it. */
function survivalOf(body: Body): { territories: number; survived: number } {
  const c = structuredClone(body);
  for (const b of brains(c)) if (!b.self && b.organ.sway !== SURVIVAL_SWAY) setSway(c, b.ref, SURVIVAL_SWAY);
  const r = survivalReport(c);
  return { territories: r.heads.length, survived: r.heads.filter((h) => h.survives).length };
}

/** Every trait of `TRAITS` counted in parts on one body. */
export function traitsOf(body: Body): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of TRAITS) out[t.id] = 0;
  for (const t of TRAITS) {
    let n = 0;
    if (t.organs !== undefined) {
      const want = new Set<OrganKind>(t.organs);
      for (const o of organs(body)) if (want.has(o.kind)) n += 1;
    }
    if (t.ends !== undefined) {
      const want = new Set<OrganKind>(t.ends);
      for (const id of nodeIds(body)) for (const e of body.nodes[id]!.ends) if (want.has(e.kind)) n += 1;
    }
    if (t.segments !== undefined) {
      const want = new Set<SegmentKind>(t.segments);
      for (const id of segmentIds(body)) if (want.has(body.segments[id]!.kind)) n += 1;
    }
    if (t.membranes !== undefined) {
      const want = new Set<MembraneKind>(t.membranes);
      for (const id of sortedIds(body.membranes)) if (want.has(body.membranes[id]!.kind)) n += 1;
    }
    out[t.id] = n;
  }
  return out;
}

export function measure(seed: number, body: Body, events: readonly Event[] = []): Sample {
  const counts = familyCounts(body);
  let lost = 0;
  let tumours = 0;
  let displaced = 0;
  let landed = 0;
  let onPlan = 0;
  let defectsLanded = 0;
  const displacedKinds: Partial<Record<OrganKind, number>> = {};
  const drew: Record<string, number> = {};
  const seated: Record<string, number> = {};
  for (const e of events) {
    if (e.kind !== "mutate" || e.mutation === null) continue;
    drew[e.mutation.id] = (drew[e.mutation.id] ?? 0) + 1;
    if (e.result !== null && !e.result.fallback) seated[e.mutation.id] = (seated[e.mutation.id] ?? 0) + 1;
    if (e.result === null) lost += 1;
    else if (e.result.fallback) tumours += 1;
    else {
      landed += 1;
      if (e.plan) onPlan += 1;
      if (e.mutation.tags.includes("defect")) defectsLanded += 1;
      for (const o of e.result.displaced) {
        displaced += 1;
        displacedKinds[o.kind] = (displacedKinds[o.kind] ?? 0) + 1;
      }
    }
  }
  let maxGirth = 0;
  let torsos = 0;
  for (const id of segmentIds(body)) {
    const s = body.segments[id]!;
    if (s.kind !== "torso") continue;
    torsos += 1;
    maxGirth = Math.max(maxGirth, s.girth);
  }
  const needTable = Object.fromEntries(NEED_KINDS.map((k) => [k, 0])) as Record<NeedKind, number>;
  for (const n of needs(body)) needTable[n.kind] = n.strength;
  let gutBrains = 0;
  for (const o of organs(body)) if (o.kind === "gutBrain") gutBrains += 1;
  const d = derive(body);
  return {
    seed,
    blind: d.senses.viewpoints.length === 0,
    lame: d.speed.value === 0,
    nodes: nodeIds(body).length,
    segments: segmentIds(body).length,
    closure: closure(body),
    heads: heads(body),
    mass: Math.round(mass(body) * 100) / 100,
    familiesAt3: FAMILIES.filter((f) => counts[f] >= 3).length,
    counts,
    hash: bodyHash(body),
    lost,
    tumours,
    displaced,
    displacedKinds,
    vitals: { noHeart: hearts(body).length === 0, noBrain: brains(body).length === 0, noBreath: breathing(body) === 0 },
    alien: d.budgets.alien,
    lead: leadShare(counts),
    humanoid: humanoid(body),
    maxGirth,
    torsos,
    sunkHead: sunkHead(body),
    chain: longestChain(body),
    forks: forks(body),
    landed,
    onPlan,
    defectsLanded,
    needs: needTable,
    brains: brains(body).length,
    gutBrains,
    hearts: hearts(body).length,
    eats: derive(body).eat.can,
    overload: mentalLoad(body).total - mindPower(body),
    survival: survivalOf(body),
    traits: traitsOf(body),
    drew,
    seated,
    flies: d.locomotion.fly,
  };
}

/** One row of the traits table: how many bodies carry the trait at all, and how many parts of it they carry. */
interface TraitShare {
  id: string;
  ru: string;
  /** Share of bodies with at least one, 0..1, and with more than the human has. */
  bodies: number;
  beyondHuman: number;
  /** Parts per body. */
  mean: number;
  human: number;
}

interface TraitsSummary {
  rows: TraitShare[];
  flies: number;
  /** Rows of the catalog the batch drew but never seated anywhere, most drawn first. */
  never: { id: string; drawn: number }[];
  /** Rows the batch never even drew. */
  unseen: number;
  /** Rows the batch drew at all. */
  drawn: number;
}

export function traitsSummary(samples: Sample[], catalogRows: number): TraitsSummary {
  const n = Math.max(1, samples.length);
  const rows = TRAITS.map((t) => {
    const human = t.human ?? 0;
    let bodies = 0;
    let beyond = 0;
    let total = 0;
    for (const s of samples) {
      const v = s.traits[t.id] ?? 0;
      if (v > 0) bodies += 1;
      if (v > human) beyond += 1;
      total += v;
    }
    return { id: t.id, ru: t.ru, bodies: bodies / n, beyondHuman: beyond / n, mean: total / n, human };
  });
  const drew = new Map<string, number>();
  const seated = new Map<string, number>();
  for (const s of samples) {
    for (const [id, k] of Object.entries(s.drew)) drew.set(id, (drew.get(id) ?? 0) + k);
    for (const [id, k] of Object.entries(s.seated)) seated.set(id, (seated.get(id) ?? 0) + k);
  }
  const never = [...drew]
    .filter(([id]) => (seated.get(id) ?? 0) === 0)
    .map(([id, drawn]) => ({ id, drawn }))
    .sort((a, b) => b.drawn - a.drawn || a.id.localeCompare(b.id));
  return { rows, flies: samples.filter((s) => s.flies).length / n, never, unseen: Math.max(0, catalogRows - drew.size), drawn: drew.size };
}

/** The body of one seed, grown as the statistics grow it. */
export function grow(params: StatsParams, spread: boolean, seed: number): Body {
  return run({ seed, start: params.start ?? { kind: "human" }, commands: [statsCommand(params)], spread }, { light: true }).body;
}

export function sampleSeed(params: StatsParams, spread: boolean, seed: number): Sample {
  return sampleState({ seed, start: params.start ?? { kind: "human" }, commands: [statsCommand(params)], spread });
}

/** Any state measured as the statistics measure a seed: the generator's batches mix sources. */
export function sampleState(state: LabState): Sample {
  const r = run(state, { light: true });
  return measure(state.seed, r.body, r.events);
}

/** Seeds 1..N unless a list is given; the page hands the list in chunks to stay responsive. */
export function statsFor(params: StatsParams, spread: boolean, seeds?: number[]): Sample[] {
  const list = seeds ?? Array.from({ length: params.seeds }, (_, i) => i + 1);
  return list.map((seed) => sampleSeed(params, spread, seed));
}

interface Histogram {
  /** bins + 1 edges, the first at the smallest value. */
  edges: number[];
  counts: number[];
}

/** Equal-width bins over [min, max]; every value lands in exactly one bin, the maximum in the last. */
export function histogram(values: number[], bins: number): Histogram {
  const counts = new Array<number>(bins).fill(0);
  if (values.length === 0) return { edges: Array.from({ length: bins + 1 }, (_, i) => i), counts };
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  if (hi === lo) hi = lo + 1;
  const width = (hi - lo) / bins;
  for (const v of values) {
    const i = Math.min(bins - 1, Math.floor((v - lo) / width));
    counts[i] = (counts[i] ?? 0) + 1;
  }
  return { edges: Array.from({ length: bins + 1 }, (_, i) => lo + i * width), counts };
}

/** Whole-number bins shared by two samples, so the two histograms line up: one bin per value up to `maxBins`. */
export function sharedHistograms(a: number[], b: number[], maxBins = 12): { edges: number[]; a: number[]; b: number[] } {
  const all = [...a, ...b];
  if (all.length === 0) return { edges: [0, 1], a: [0], b: [0] };
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of all) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  lo = Math.floor(lo);
  hi = Math.max(Math.ceil(hi), lo + 1);
  const span = hi - lo;
  const bins = Math.min(maxBins, span);
  const width = span / bins;
  const edges = Array.from({ length: bins + 1 }, (_, i) => lo + i * width);
  const count = (values: number[]): number[] => {
    const out = new Array<number>(bins).fill(0);
    for (const v of values) {
      const i = Math.min(bins - 1, Math.floor((v - lo) / width));
      out[i] = (out[i] ?? 0) + 1;
    }
    return out;
  };
  return { edges, a: count(a), b: count(b) };
}

export function shareAt(samples: Sample[], n: number): Record<Family, number> {
  const out = Object.fromEntries(FAMILIES.map((f) => [f, 0])) as Record<Family, number>;
  if (samples.length === 0) return out;
  for (const s of samples) for (const f of FAMILIES) if (s.counts[f] >= n) out[f] += 1 / samples.length;
  return out;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((x, y) => x - y);
  return s.length % 2 === 1 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
}

/** The plan over a whole sample (step I): the goals of `grotesque emerges` as the page shows them. */
interface PlanSummary {
  humanoid: number;
  /** Share of bodies whose thickest torso is girth 4 or more. */
  thick: number;
  /** Share of bodies with two torsos or more, or a head sunk into one. */
  twoOrSunk: number;
  chain: number;
  forks: number;
  /** Share of the landed mutations that landed on the torso or its nodes, and the share that were defects. */
  onPlan: number;
  defects: number;
}

export function planSummary(samples: Sample[]): PlanSummary {
  const n = Math.max(1, samples.length);
  let thick = 0;
  let twoOrSunk = 0;
  let landed = 0;
  let onPlan = 0;
  let defects = 0;
  for (const s of samples) {
    if (s.maxGirth >= 4) thick += 1;
    if (s.torsos >= 2 || s.sunkHead) twoOrSunk += 1;
    landed += s.landed;
    onPlan += s.onPlan;
    defects += s.defectsLanded;
  }
  return {
    humanoid: median(samples.map((s) => s.humanoid)),
    thick: thick / n,
    twoOrSunk: twoOrSunk / n,
    chain: median(samples.map((s) => s.chain)),
    forks: median(samples.map((s) => s.forks)),
    onPlan: landed > 0 ? onPlan / landed : 0,
    defects: landed > 0 ? defects / landed : 0,
  };
}

/** The needs over a whole sample (step J), for the rows of the statistics tab. */
interface NeedsSummary {
  /** Mean strength of each need after the run. */
  strength: Record<NeedKind, number>;
  brains: number;
  gutBrains: number;
  hearts: number;
  /** Shares of bodies. */
  cannotEat: number;
  overloaded: number;
  /** Foreign territories per body, and the share of them that would live on their own. */
  territories: number;
  survive: number;
}

export function needsSummary(samples: Sample[]): NeedsSummary {
  const n = Math.max(1, samples.length);
  const strength = Object.fromEntries(NEED_KINDS.map((k) => [k, 0])) as Record<NeedKind, number>;
  let brainsSum = 0;
  let gut = 0;
  let heartsSum = 0;
  let cannotEat = 0;
  let overloaded = 0;
  let territories = 0;
  let survived = 0;
  for (const s of samples) {
    for (const k of NEED_KINDS) strength[k] += s.needs[k] / n;
    brainsSum += s.brains / n;
    gut += s.gutBrains / n;
    heartsSum += s.hearts / n;
    if (!s.eats) cannotEat += 1 / n;
    if (s.overload > 5) overloaded += 1 / n;
    territories += s.survival.territories;
    survived += s.survival.survived;
  }
  return { strength, brains: brainsSum, gutBrains: gut, hearts: heartsSum, cannotEat, overloaded, territories: territories / n, survive: territories === 0 ? 0 : survived / territories };
}

/** What the abyss did over a whole sample, for the rows of the statistics tab. */
export interface AbyssSummary {
  /** Shares of all the strikes. */
  lost: number;
  tumours: number;
  /** Organs evicted per body, and the kinds most often evicted, most first. */
  displaced: number;
  kinds: { kind: OrganKind; n: number }[];
  /** Bodies missing a vital organ. */
  noHeart: number;
  noBrain: number;
  noBreath: number;
  blind: number;
  lame: number;
  /** Mean alienness of the bodies. */
  alien: number;
  lead: number;
}

export function abyssSummary(samples: Sample[], mutations: number): AbyssSummary {
  const n = Math.max(1, samples.length);
  const strikes = n * mutations;
  const kinds = new Map<OrganKind, number>();
  let lost = 0;
  let tumours = 0;
  let displaced = 0;
  let noHeart = 0;
  let noBrain = 0;
  let noBreath = 0;
  let blind = 0;
  let lame = 0;
  let alien = 0;
  let lead = 0;
  for (const s of samples) {
    lost += s.lost;
    tumours += s.tumours;
    displaced += s.displaced;
    for (const [kind, count] of Object.entries(s.displacedKinds) as [OrganKind, number][]) kinds.set(kind, (kinds.get(kind) ?? 0) + count);
    if (s.vitals.noHeart) noHeart += 1;
    if (s.vitals.noBrain) noBrain += 1;
    if (s.vitals.noBreath) noBreath += 1;
    if (s.blind) blind += 1;
    if (s.lame) lame += 1;
    alien += s.alien;
    lead += s.lead;
  }
  return {
    lost: lost / strikes,
    tumours: tumours / strikes,
    displaced: displaced / n,
    kinds: [...kinds].map(([kind, count]) => ({ kind, n: count })).sort((x, y) => y.n - x.n || x.kind.localeCompare(y.kind)),
    noHeart,
    noBrain,
    noBreath,
    blind,
    lame,
    alien: alien / n,
    lead: lead / n,
  };
}
