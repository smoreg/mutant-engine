/**
 * The command language of a mutant and what each command does to a body: a
 * mutation from a source, a cut, a separation, a sway, turns. Every command is
 * data (it goes into the lab's #hash and, as text, to the game's client),
 * every application is one call into the model with the run's rng, and a run
 * is the replay of a list of them from a seed. On top of the model: a
 * source is a share of defects and a family filter (mutations.md, sources
 * table); only the abyss changes the model's weights. A mutation placed by
 * hand names its row and its place and draws nothing: the random draw stays
 * beside it and measures the game, the placed one sets up an experiment.
 */
import { type AttachHow, attachHows, attachPart, isAttachPart } from "./attach.js";
import { beastById } from "./beasts.js";
import { setSway } from "./brains.js";
import { mutationById, MUTATIONS } from "./content/mutations.js";
import { applyOverride, type MutationOverride } from "./content/override.js";
import { type Source, SOURCES, sourceSpec, type SourceSpec } from "./content/sources.js";
import { cut, type CutResult } from "./cut.js";
import { derive, type DerivedChange, diffDerived } from "./derive.js";
import { eatParts } from "./diet.js";
import { type Body, brainAt, type BrainRef, cloneBody, type Eatable, type End, type Organ, sortedIds } from "./graph.js";
import { hangingPart, sameTarget, type Target, targets, type Wandered, type Weighted } from "./grow.js";
import { bodyHash } from "./hash.js";
import { human } from "./human.js";
import { reshape, type Reshape, type Reshaped } from "./knife.js";
import { swampMutant } from "./mutant.js";
import { applyMutation, applyMutationAt, ceilingOf, drawMutation, drawWeights, makeRoom, type Mutation, type MutationContext, type MutationResult, mutationTargets } from "./mutation.js";
import { K_PLACE, needDrawFactors, type NeedKind, needOf, needPulls, needServed, needShare } from "./needs.js";
import { COVERS, FAMILIES, MEMBRANES, ORGANS, SEGMENT_KINDS, type Family } from "./parts.js";
import { planTargets } from "./plan.js";
import { LabRng, recording, type Rng, type RngWords } from "./rng.js";
import { cutOffBodies, separate, type Separation } from "./separate.js";
import type { Crept } from "./spread.js";
import { strip, type Stripped } from "./strip.js";
import { bodyFromText } from "./text.js";
import { elapse } from "./time.js";

// ---------------------------------------------------------------- the tuning of one run

/**
 * Rules of the model a run may switch off. They are on by default and stay
 * on everywhere else: the generator turns one off to see what it holds up.
 * The spread is not here - it is a field of the state, and the lab replays it.
 */
export type RuleId = "needs" | "ceiling" | "decay" | "defects";
export const RULE_IDS: readonly RuleId[] = ["needs", "ceiling", "decay", "defects"];

/**
 * A layer over the catalog for one run: the same edits the mutation editor
 * writes (`MutationOverride`), but held in memory instead of `overrides.ts`,
 * plus the rules switched off. Nothing here reaches the disk; the generator
 * keeps it in the #hash and puts it on around a batch with `withTuning`.
 */
export interface Tuning {
  rows: Readonly<Record<string, MutationOverride>>;
  off: readonly RuleId[];
}

const NO_TUNING: Tuning = { rows: {}, off: [] };

/**
 * The same layer as data, the way a page holds it and the #hash carries it:
 * rows never drawn, rows whose chance is multiplied, rules switched off.
 * `tuningFrom` turns it into the layer the draw reads. It lives here, beside
 * the commands, because the hash reads it and the hash must not import the
 * batch (which imports the hash back).
 */
export interface CatalogTuning {
  /** Row ids switched off; sorted. */
  off: string[];
  /** Row id to the factor its chance is multiplied by; never 1, keys sorted. */
  chance: Record<string, number>;
  /** Rules switched off, in the order of `RULE_IDS`. */
  rules: RuleId[];
}

/** What a chance button steps along: a row sits at one of these, 1 being the catalog's own. */
export const CHANCE_STEPS: readonly number[] = [0.1, 0.25, 0.5, 1, 2, 4, 10];

export function emptyTuning(): CatalogTuning {
  return { off: [], chance: {}, rules: [] };
}

export function isEmptyTuning(t: CatalogTuning | undefined): boolean {
  return t === undefined || (t.off.length === 0 && t.rules.length === 0 && Object.keys(t.chance).length === 0);
}

/** One spelling for one tuning: unknown rows go, a factor of 1 is no factor, ids are sorted. The hash round-trips only what this returns. */
export function normalizeTuning(t: CatalogTuning): CatalogTuning {
  const known = (id: string): boolean => mutationById(id) !== undefined;
  const off = [...new Set(t.off)].filter(known).sort();
  const chance: Record<string, number> = {};
  for (const id of Object.keys(t.chance).sort()) {
    const v = t.chance[id]!;
    if (known(id) && Number.isFinite(v) && v > 0 && v !== 1) chance[id] = v;
  }
  return { off, chance, rules: RULE_IDS.filter((r) => t.rules.includes(r)) };
}

/** The tuning as the draw reads it: an edit per row named, and the rules off. */
export function tuningFrom(t: CatalogTuning | undefined): Tuning {
  if (t === undefined || isEmptyTuning(t)) return NO_TUNING;
  const rows: Record<string, MutationOverride> = {};
  for (const id of t.off) rows[id] = { disabled: true };
  for (const [id, factor] of Object.entries(t.chance)) {
    const m = mutationById(id);
    if (m === undefined) continue;
    rows[id] = { ...rows[id], chance: Math.max(0.01, Math.round(m.chance * factor * 100) / 100) };
  }
  return { rows, off: [...t.rules] };
}

/** The ceiling a run meets with the ceiling rule off: high enough that nothing is ever displaced. */
const NO_CEILING = 100_000;

let tuning: Tuning = NO_TUNING;

/** The layer in force right now; the draw reads it, nothing else. */
export function currentTuning(): Tuning {
  return tuning;
}

/** Runs `body` with the layer on and puts back what was there, whatever happens. */
export function withTuning<T>(t: Tuning, body: () => T): T {
  const was = tuning;
  tuning = t;
  try {
    return body();
  } finally {
    tuning = was;
  }
}

function ruleOff(rule: RuleId): boolean {
  return tuning.off.includes(rule);
}

export interface MutateCommand {
  t: "mutate";
  source: Source;
  family?: Family;
  id?: string;
  n: number;
}
export interface CutCommand {
  t: "cut";
  segment: number;
  end: End;
}
interface SeparateCommand {
  t: "separate";
  /** `brainKey` of the brain that leaves. */
  brain: string;
}
interface SwayCommand {
  t: "sway";
  brain: string;
  sway: number;
}
interface TickCommand {
  t: "tick";
  n: number;
}
/** A row of the catalog at a place of its own candidates, chosen by hand. */
export interface PlaceCommand {
  t: "place";
  id: string;
  target: Target;
}
/** Where an excision lands: an ending of a node, an organ in a cavity or on a surface by slot, or the part hanging beyond a segment. */
export interface ExciseCommand {
  t: "excise";
  at: "end" | "cavity" | "growth" | "limb";
  id: number;
  slot: number;
  /** An organ inside the one at the slot: an eye in a head. */
  sub?: number;
}
/** Takes back everything a mutation step grew, by its step index. */
export interface UnmutateCommand {
  t: "unmutate";
  step: number;
}
/** A membrane cut off, a cover taken off, a fusion parted: the model's `reshape`, nothing of the lab's own (decisions 1226-1228). */
export interface ReshapeCommand {
  t: "reshape";
  r: Reshape;
}
/** The body eats `n` of a part: its taste pulls the next mutations toward it and fades with time (decision 1253). */
export interface EatCommand {
  t: "eat";
  part: Eatable;
  n: number;
}
/** A part of the tables put on by hand at a place of its own (the editor, attach.ts): `organ:eye` into a head, `segment:arm` on a free place. */
export interface AttachCommand {
  t: "attach";
  part: string;
  how: AttachHow;
  target: Target;
}
export type Command = MutateCommand | CutCommand | SeparateCommand | SwayCommand | TickCommand | ExciseCommand | UnmutateCommand | PlaceCommand | ReshapeCommand | EatCommand | AttachCommand;

/** A beast starts from its fixture, drawn by hand in packages/core/beasts.ts. */
export type Start = { kind: "human" } | { kind: "swamp" } | { kind: "text"; text: string } | { kind: "beast"; id: string };

export function startBody(start: Start): Body {
  switch (start.kind) {
    case "human":
      return human();
    case "swamp":
      return swampMutant();
    case "text":
      return bodyFromText(start.text);
    case "beast": {
      const beast = beastById(start.id);
      if (beast === undefined) throw new Error(`no beast ${start.id}`);
      return bodyFromText(beast.fixture);
    }
  }
}

// ---------------------------------------------------------------- brains by key

export function parseBrainKey(key: string): BrainRef | null {
  const m = /^([ns])(\d+)\.(\d+)$/.exec(key);
  if (m === null) return null;
  return m[1] === "n" ? { node: Number(m[2]), end: Number(m[3]) } : { segment: Number(m[2]), slot: Number(m[3]) };
}

// ---------------------------------------------------------------- atoms

/** One step's worth of a command: a mutate of n is n atoms. */
type Atom = (MutateCommand & { n: 1 }) | CutCommand | SeparateCommand | SwayCommand | TickCommand | ExciseCommand | UnmutateCommand | PlaceCommand | ReshapeCommand | EatCommand | AttachCommand;

function expand(cmd: Command): Atom[] {
  if (cmd.t !== "mutate") return [cmd];
  const out: Atom[] = [];
  for (let i = 0; i < cmd.n; i++) out.push({ ...cmd, n: 1 });
  return out;
}

// ---------------------------------------------------------------- events

interface Draw {
  /** The rows the draw ran over after the source's filters. */
  rows: number;
  /** Weight of the row drawn and the sum over the rows: the chance the lab saw. */
  weight: number;
  total: number;
}

export interface MutateEvent {
  kind: "mutate";
  source: Source;
  family: Family | null;
  id: string | null;
  /** The defect roll of the source; null when the source does not roll. */
  defect: boolean | null;
  mutation: Mutation | null;
  draw: Draw | null;
  ctx: MutationContext;
  /** Null when nothing could be drawn or the mutation was lost. */
  result: MutationResult | null;
  target: Target | null;
  /** The list the target draw ran over: the mutation's candidates, or the tumour's when it fell back. */
  candidates: Weighted[];
  /** The same candidates weighed without the spread (§8 alone); null when the spread is off or the draw was the tumour's. */
  base: Weighted[] | null;
  /** How many places the mutation itself had; 0 explains a tumour. */
  own: number;
  /** The rng value the target draw used, null when there was no draw. */
  roll: number | null;
  /** The organs the abyss pushed out at the ceiling before the draw; since step H they leave only for a mutation that lands. */
  displaced: Organ[];
  /** The target lay on a torso or one of its nodes (step I); false when nothing landed. */
  plan: boolean;
  /** The needs the row served (step J): each with its strength, what it did to the row in the draw and to the place that was taken. */
  needs: NeedPush[];
}

interface NeedPush {
  kind: NeedKind;
  strength: number;
  /** The row's weight in the draw was multiplied by this. */
  draw: number;
  /** The chosen place's weight was multiplied by this; 1 when nothing landed. */
  place: number;
}

interface Detached {
  body: Body;
  fate: string;
  lifetime: number | null;
}

interface CutEvent {
  kind: "cut";
  segment: number;
  end: End;
  /** What the segment was before the cut, for the note. */
  name: string;
  result: CutResult;
  detached: Detached[];
}

interface SeparateEvent {
  kind: "separate";
  brain: string;
  result: Separation | null;
  detached: Detached[];
}

interface SwayEvent {
  kind: "sway";
  brain: string;
  from: number;
  to: number;
  /** The brain was not there: nothing changed. */
  missing: boolean;
}

interface TickEvent {
  kind: "tick";
  turns: number;
  brainDead: boolean;
  necrotic: number[];
  fallen: number[];
  wandered: Wandered[];
  crept: Crept[];
  pressed: number[];
  /** Ids created by parts that grew back. */
  regrown: number[];
}

interface StripEvent {
  kind: "strip";
  command: ExciseCommand | UnmutateCommand;
  /** Null when the place held nothing to take. */
  result: Stripped | null;
}

interface EatEvent {
  kind: "eat";
  part: Eatable;
  n: number;
}

interface StartEvent {
  kind: "start";
}

interface PlaceEvent {
  kind: "place";
  id: string;
  target: Target;
  mutation: Mutation | null;
  /** Null when refused. */
  result: MutationResult | null;
  /** Why the place was refused, in words; null when it landed. */
  rejected: string | null;
  /** The row's places on the body before it landed. */
  candidates: Weighted[];
}

interface ReshapeEvent {
  kind: "reshape";
  command: ReshapeCommand;
  result: Reshaped;
}

export interface AttachEvent {
  kind: "attach";
  command: AttachCommand;
  /** Null when refused. */
  result: MutationResult | null;
  /** Why the place was refused, in words; null when it landed. */
  rejected: string | null;
  /** The places of the part's way before it landed. */
  candidates: Weighted[];
}

export type Event = StartEvent | MutateEvent | CutEvent | SeparateEvent | SwayEvent | TickEvent | StripEvent | PlaceEvent | ReshapeEvent | EatEvent | AttachEvent;

// ---------------------------------------------------------------- the draw

/** The rows a source draws from: the catalog without what is switched off, with the run's layer on top of every row it names. */
function catalogFor(spec: SourceSpec): readonly Mutation[] {
  const rows = tuning.rows;
  let list: readonly Mutation[] = MUTATIONS;
  if (Object.keys(rows).length > 0) list = list.filter((m) => rows[m.id]?.disabled !== true).map((m) => applyOverride(m, rows[m.id]));
  return spec.never.length === 0 ? list : list.filter((m) => !spec.never.includes(m.family));
}

interface DrawOpts {
  family?: Family;
  defect?: boolean;
  spread: boolean;
  decay: boolean;
  heal: boolean;
  /** False with the needs rule switched off for this run. */
  needs: boolean;
}

/** The rows `drawMutation` would keep, and the weights it would use. */
function rowsFor(body: Body, catalog: readonly Mutation[], opts: DrawOpts): { rows: Mutation[]; weights: number[] } {
  const rows = catalog.filter((m) => {
    if (opts.family !== undefined && m.family !== opts.family) return false;
    if (opts.defect !== undefined && m.tags.includes("defect") !== opts.defect) return false;
    return true;
  });
  return { rows, weights: drawWeights(rows, { body, spread: opts.spread, decay: opts.decay, heal: opts.heal, needs: opts.needs }) };
}

/** Candidates as the model's own draw sees them: with the abyss pushing organs out first when the ceiling or a full cavity is what stops it. */
function candidatesOf(body: Body, m: Mutation, ctx: MutationContext): { list: Weighted[]; probe: Body; displaced: Organ[] } {
  const probe = cloneBody(body);
  probe.meat = ceilingOf(probe, ctx);
  let list = mutationTargets(probe, m, ctx);
  let displaced: Organ[] = [];
  if (list.length === 0 && ctx.source === "abyss") {
    const gone = makeRoom(probe, m, ctx);
    displaced = gone.organs;
    if (gone.mass > 0 || gone.segments.length > 0) list = mutationTargets(probe, m, ctx);
  }
  return { list, probe, displaced };
}

/** What the needs did for the row (step J): its draw factors on the body before the strike, and the place factor at the target it took. */
function needsOf(body: Body, m: Mutation, heal: boolean, target: Target | null): NeedPush[] {
  const factors = needDrawFactors(body, m, heal);
  return factors.map((f) => {
    let place = 1;
    if (target !== null) {
      const n = needOf(body, f.kind);
      const share = needShare(body, n, target);
      if (n.strength > 0) place = share > 0 ? 1 + K_PLACE * n.strength * share : needServed(body, n, target) ? 1 / (1 + K_PLACE * n.strength) : 1;
    }
    return { kind: f.kind, strength: f.strength, draw: f.draw, place };
  });
}

function mutate(body: Body, atom: MutateCommand, base: Rng, spread: boolean): MutateEvent {
  const spec = sourceSpec(atom.source);
  const tape: number[] = [];
  const rng = recording(base, tape);
  const needs = !ruleOff("needs");
  const decay = spec.decay && !ruleOff("decay");
  const ctx: MutationContext = { spread };
  if (atom.source === "abyss") ctx.source = "abyss";
  if (!needs) ctx.needs = false;
  if (ruleOff("ceiling")) ctx.ceiling = NO_CEILING;
  const event: MutateEvent = {
    kind: "mutate",
    source: atom.source,
    family: atom.family ?? null,
    id: atom.id ?? null,
    defect: null,
    mutation: null,
    draw: null,
    ctx,
    result: null,
    target: null,
    candidates: [],
    base: null,
    own: 0,
    roll: null,
    displaced: [],
    plan: false,
    needs: [],
  };
  let m: Mutation | null = null;
  if (atom.source === "id") {
    m = atom.id === undefined ? null : (mutationById(atom.id) ?? null);
  } else {
    const opts: DrawOpts = { spread, decay, heal: spec.heal, needs };
    if (spec.family && atom.family !== undefined) opts.family = atom.family;
    // With the defect rule off the source rolls nothing and draws over defects and the rest alike.
    const defects = ruleOff("defects") ? null : spec.defects;
    if (defects !== null && defects > 0) {
      event.defect = rng.next() < defects;
      opts.defect = event.defect;
    } else if (defects === 0) {
      event.defect = false;
      opts.defect = false;
    }
    const catalog = catalogFor(spec);
    const { rows, weights } = rowsFor(body, catalog, opts);
    const drawOpts: Parameters<typeof drawMutation>[2] = { spread, decay, heal: spec.heal, needs, body };
    if (opts.family !== undefined) drawOpts.family = opts.family;
    if (opts.defect !== undefined) drawOpts.defect = opts.defect;
    m = drawMutation(catalog, rng, drawOpts);
    if (m !== null) {
      const i = rows.indexOf(m);
      let total = 0;
      for (const w of weights) total += w;
      event.draw = { rows: rows.length, weight: i < 0 ? 0 : weights[i]!, total };
    }
  }
  event.mutation = m;
  if (m === null) return event;

  const { list, probe, displaced } = candidatesOf(body, m, ctx);
  event.own = list.length;
  event.displaced = displaced;
  const onPlan = planTargets(body);
  const before = needs && needPulls(m).length > 0 ? cloneBody(body) : null;
  const at = tape.length;
  const result = applyMutation(body, m, rng, ctx);
  event.result = result;
  if (before !== null) event.needs = needsOf(before, m, spec.heal, result === null || result.fallback ? null : result.target);
  if (result === null) return event;
  event.target = result.target;
  event.plan = !result.fallback && onPlan(result.target);
  if (!result.fallback) {
    event.candidates = list;
    event.roll = tape[at] ?? null;
    if (spread) event.base = mutationTargets(probe, m, { ...ctx, spread: false });
  } else {
    // The tumour drew over the growth's own places, with the meat at the ceiling as the model had it.
    event.candidates = targets(probe, "growth", {}, ctx);
    event.roll = tape[list.length > 0 ? at + 1 : at] ?? null;
  }
  return event;
}

// ---------------------------------------------------------------- placed by hand

/** A placed mutation is an experiment, not a draw: no spread, no source. */
const PLACE_CTX: MutationContext = { spread: false };

/** The places a row of the catalog has on the body, as a placed mutation sees them; empty for an unknown row. */
export function placeTargets(body: Body, id: string): Weighted[] {
  const m = mutationById(id);
  return m === undefined ? [] : mutationTargets(cloneBody(body), m, PLACE_CTX);
}

function place(body: Body, atom: PlaceCommand): PlaceEvent {
  const m = mutationById(atom.id) ?? null;
  const event: PlaceEvent = { kind: "place", id: atom.id, target: atom.target, mutation: m, result: null, rejected: null, candidates: [] };
  if (m === null) {
    event.rejected = `строки ${atom.id} нет в каталоге`;
    return event;
  }
  event.candidates = placeTargets(body, atom.id);
  const hit = event.candidates.find((w) => sameTarget(w.target, atom.target));
  if (hit === undefined) {
    event.rejected = event.candidates.length === 0 ? "у мутации нет ни одного места на этом теле" : `это место не среди ${event.candidates.length} мест мутации`;
    return event;
  }
  try {
    // The candidate's own spelling of the place: a cycle may come from the link in another rotation.
    event.result = applyMutationAt(body, m, hit.target, PLACE_CTX);
  } catch (e) {
    event.rejected = e instanceof Error ? e.message : String(e);
  }
  return event;
}

// ---------------------------------------------------------------- pieces that leave

function cutAt(body: Body, atom: CutCommand): CutEvent | null {
  const seg = body.segments[atom.segment];
  if (seg === undefined) return null;
  const name = `${seg.kind} ${seg.id}`;
  const result = cut(body, atom.segment, atom.end);
  const detached: Detached[] = cutOffBodies(result);
  return { kind: "cut", segment: atom.segment, end: atom.end, name, result, detached };
}

function separateAt(body: Body, atom: SeparateCommand): SeparateEvent {
  const ref = parseBrainKey(atom.brain);
  const result = ref === null || brainAt(body, ref) === undefined ? null : separate(body, ref);
  const detached: Detached[] = [];
  if (result !== null) {
    for (const s of [result.leaves, ...result.others]) if (s.body !== null) detached.push({ body: s.body, fate: s.fate, lifetime: s.lifetime });
  }
  return { kind: "separate", brain: atom.brain, result, detached };
}

function swayAt(body: Body, atom: SwayCommand): SwayEvent {
  const ref = parseBrainKey(atom.brain);
  const moved = ref === null ? null : setSway(body, ref, atom.sway);
  if (moved === null) return { kind: "sway", brain: atom.brain, from: 0, to: atom.sway, missing: true };
  return { kind: "sway", brain: atom.brain, from: moved.from, to: moved.to, missing: false };
}

function turns(body: Body, atom: TickCommand, rng: Rng): TickEvent {
  const e: TickEvent = { kind: "tick", turns: atom.n, brainDead: false, necrotic: [], fallen: [], wandered: [], crept: [], pressed: [], regrown: [] };
  const add = (into: number[], ids: number[]): void => {
    for (const id of ids) if (!into.includes(id)) into.push(id);
  };
  // Time is the model's: the lab only counts what `elapse` said (decision 1230).
  for (let i = 0; i < atom.n; i++) {
    const t = elapse(body, rng);
    const blood = t.ischemia!;
    if (blood.brainDead) e.brainDead = true;
    add(e.necrotic, blood.necrotic);
    add(e.fallen, blood.fallen);
    e.wandered.push(...t.wandered);
    e.crept.push(...t.crept);
    add(e.pressed, t.pressed);
    for (const ids of t.regrown) add(e.regrown, ids);
  }
  e.necrotic.sort((x, y) => x - y);
  e.fallen.sort((x, y) => x - y);
  e.pressed.sort((x, y) => x - y);
  e.regrown.sort((x, y) => x - y);
  return e;
}

// ---------------------------------------------------------------- taking back

interface StripArgs {
  pick: (o: Organ) => boolean;
  elements: number[];
}

/** What a removal command asks `strip` for on this body; null when there is nothing there. */
export function stripArgs(body: Body, cmd: ExciseCommand | UnmutateCommand): StripArgs | null {
  if (cmd.t === "unmutate") {
    const elements = [body.nodes, body.segments, body.membranes].flatMap((rec) => Object.values(rec).filter((e) => e.origin === cmd.step).map((e) => e.id));
    return { pick: (o) => o.origin === cmd.step, elements };
  }
  if (cmd.at === "limb") {
    const h = hangingPart(body, cmd.id);
    return h === null ? null : { pick: () => false, elements: [...h.part.nodes.map((n) => n.id), ...h.part.segments.map((s) => s.id)] };
  }
  const list = cmd.at === "end" ? body.nodes[cmd.id]?.ends : cmd.at === "cavity" ? body.segments[cmd.id]?.cavity : body.segments[cmd.id]?.growths;
  const outer = list?.[cmd.slot];
  const organ = cmd.sub === undefined ? outer : outer?.contents?.[cmd.sub];
  return organ === undefined ? null : { pick: (o) => o === organ, elements: [] };
}

/** What the command would take, on a copy: the organ is found again there, not by reference. */
export function stripPreview(body: Body, cmd: ExciseCommand | UnmutateCommand): Stripped | null {
  const probe = cloneBody(body);
  const args = stripArgs(probe, cmd);
  return args === null ? null : strip(probe, args.pick, args.elements);
}

function stripAt(body: Body, cmd: ExciseCommand | UnmutateCommand): StripEvent {
  const args = stripArgs(body, cmd);
  return { kind: "strip", command: cmd, result: args === null ? null : strip(body, args.pick, args.elements) };
}

/** Every element and organ without an origin was made by this step. */
function tagOrigin(body: Body, step: number): void {
  const mark = (o: { origin?: number }): void => {
    if (o.origin === undefined) o.origin = step;
  };
  const organs = (list: Organ[]): void => {
    for (const o of list) {
      mark(o);
      if (o.contents !== undefined) organs(o.contents);
    }
  };
  for (const n of Object.values(body.nodes)) {
    mark(n);
    organs(n.ends);
  }
  for (const s of Object.values(body.segments)) {
    mark(s);
    organs(s.cavity);
    organs(s.growths);
  }
  for (const m of Object.values(body.membranes)) mark(m);
}

/** Applies one atom to the body in place with the run's rng and says what happened. */
function applyAtom(body: Body, atom: Atom, rng: Rng, spread: boolean): Event {
  switch (atom.t) {
    case "mutate":
      return mutate(body, atom, rng, spread);
    case "cut":
      return cutAt(body, atom) ?? { kind: "cut", segment: atom.segment, end: atom.end, name: `segment ${atom.segment}`, result: { yours: { nodes: [], segments: [] }, others: [], bleeding: [], stump: null, torn: [], removed: { nodes: [], segments: [] } }, detached: [] };
    case "separate":
      return separateAt(body, atom);
    case "sway":
      return swayAt(body, atom);
    case "tick":
      return turns(body, atom, rng);
    case "place":
      return place(body, atom);
    case "excise":
    case "unmutate":
      return stripAt(body, atom);
    case "reshape":
      return { kind: "reshape", command: atom, result: reshape(body, atom.r) };
    case "eat":
      eatParts(body, [atom.part], atom.n);
      return { kind: "eat", part: atom.part, n: atom.n };
    case "attach":
      return { kind: "attach", command: atom, ...attachPart(body, atom.part, atom.how, atom.target) };
  }
}

// ---------------------------------------------------------------- the commands as text

const SOURCE_IDS = new Set<string>(SOURCES.map((s) => s.id));

const FAMILY_IDS = new Set<string>(FAMILIES);

export function isFamily(s: string | undefined): s is Family {
  return s !== undefined && FAMILY_IDS.has(s);
}

export function isSource(s: string | undefined): s is Source {
  return s !== undefined && SOURCE_IDS.has(s);
}

/** A kind of part a body can eat: an organ, a limb, a cover, a membrane. */
export function isEatable(s: string | undefined): s is Eatable {
  return s !== undefined && (s in ORGANS || s in SEGMENT_KINDS || s in COVERS || s in MEMBRANES);
}

export function isBrainKey(s: string | undefined): s is string {
  return s !== undefined && /^[ns]\d+\.\d+$/.test(s);
}

export function int(s: string | undefined): number | null {
  if (s === undefined || !/^-?\d+$/.test(s)) return null;
  return Number(s);
}

function ids(text: string | undefined, n?: number): number[] | null {
  if (text === undefined || !/^\d+(-\d+)*$/.test(text)) return null;
  const out = text.split("-").map(Number);
  return n === undefined || out.length === n ? out : null;
}

function encodeTarget(t: Target): string {
  if ("node" in t) return `n${t.node}`;
  if ("segment" in t) return `s${t.segment}`;
  if ("ending" in t) return `e${t.ending.node}-${t.ending.index}`;
  if ("pair" in t) return `p${t.pair[0]}-${t.pair[1]}`;
  return `c${t.cycle.join("-")}`;
}

function decodeTarget(text: string | undefined): Target | null {
  if (text === undefined || text.length < 2) return null;
  const rest = text.slice(1);
  switch (text[0]) {
    case "n": {
      const v = ids(rest, 1);
      return v === null ? null : { node: v[0]! };
    }
    case "s": {
      const v = ids(rest, 1);
      return v === null ? null : { segment: v[0]! };
    }
    case "e": {
      const v = ids(rest, 2);
      return v === null ? null : { ending: { node: v[0]!, index: v[1]! } };
    }
    case "p": {
      const v = ids(rest, 2);
      return v === null ? null : { pair: [v[0]!, v[1]!] };
    }
    case "c": {
      const v = ids(rest);
      return v === null || v.length < 2 ? null : { cycle: v };
    }
    default:
      return null;
  }
}

export function encodeCommand(c: Command): string {
  switch (c.t) {
    case "mutate": {
      const extra = c.source === "id" ? c.id : c.source === "vaccine" ? c.family : undefined;
      return `m.${c.source}.${c.n}${extra === undefined ? "" : `.${extra}`}`;
    }
    case "cut":
      return `c.${c.segment}.${c.end}`;
    case "separate":
      return `x.${c.brain}`;
    case "sway":
      return `w.${c.brain}.${c.sway}`;
    case "tick":
      return `t.${c.n}`;
    case "place":
      return `p.${c.id}.${encodeTarget(c.target)}`;
    case "excise":
      return `e.${c.at}.${c.id}.${c.slot}${c.sub === undefined ? "" : `.${c.sub}`}`;
    case "unmutate":
      return `u.${c.step}`;
    case "reshape": {
      const r = c.r;
      return r.t === "membrane" ? `r.m.${r.membrane}` : r.t === "cover" ? `r.v.${r.segment}` : `r.f.${r.node}`;
    }
    case "eat":
      return `f.${c.part}.${c.n}`;
    case "attach":
      return `a.${c.part.replace(":", "-")}.${c.how}.${encodeTarget(c.target)}`;
  }
}

export function decodeCommand(text: string): Command | null {
  const p = text.split(".");
  switch (p[0]) {
    case "m": {
      const source = p[1];
      const n = int(p[2]);
      if (!isSource(source) || n === null || n < 1 || n > 10_000) return null;
      const cmd: Command = { t: "mutate", source, n };
      if (source === "vaccine") {
        if (!isFamily(p[3])) return null;
        cmd.family = p[3];
      } else if (source === "id") {
        if (p[3] === undefined || !/^[A-Za-z][A-Za-z0-9]*$/.test(p[3])) return null;
        cmd.id = p[3];
      }
      return cmd;
    }
    case "c": {
      const segment = int(p[1]);
      if (segment === null || (p[2] !== "a" && p[2] !== "b")) return null;
      return { t: "cut", segment, end: p[2] };
    }
    case "x": {
      const brain = `${p[1]}.${p[2]}`;
      return isBrainKey(brain) ? { t: "separate", brain } : null;
    }
    case "w": {
      const brain = `${p[1]}.${p[2]}`;
      const sway = int(p[3]);
      return isBrainKey(brain) && sway !== null && sway >= 0 && sway <= 10 ? { t: "sway", brain, sway } : null;
    }
    case "t": {
      const n = int(p[1]);
      return n === null || n < 1 || n > 100_000 ? null : { t: "tick", n };
    }
    case "p": {
      const target = decodeTarget(p[2]);
      if (p[1] === undefined || mutationById(p[1]) === undefined || target === null || p.length !== 3) return null;
      return { t: "place", id: p[1], target };
    }
    case "e": {
      const id = int(p[2]);
      const slot = int(p[3]);
      if ((p[1] !== "end" && p[1] !== "cavity" && p[1] !== "growth" && p[1] !== "limb") || id === null || slot === null || slot < 0) return null;
      if (p[4] === undefined) return { t: "excise", at: p[1], id, slot };
      const sub = int(p[4]);
      return sub === null || sub < 0 ? null : { t: "excise", at: p[1], id, slot, sub };
    }
    case "u": {
      const step = int(p[1]);
      return step === null || step < 1 ? null : { t: "unmutate", step };
    }
    case "r": {
      const id = int(p[2]);
      if (id === null || p.length !== 3) return null;
      if (p[1] === "m") return { t: "reshape", r: { t: "membrane", membrane: id } };
      if (p[1] === "v") return { t: "reshape", r: { t: "cover", segment: id } };
      if (p[1] === "f") return { t: "reshape", r: { t: "unfuse", node: id } };
      return null;
    }
    case "f": {
      const n = int(p[2]);
      if (!isEatable(p[1]) || n === null || n < 1 || n > 100 || p.length !== 3) return null;
      return { t: "eat", part: p[1], n };
    }
    case "a": {
      const part = (p[1] ?? "").replace("-", ":");
      const target = decodeTarget(p[3]);
      if (p.length !== 4 || !isAttachPart(part) || target === null) return null;
      const how = attachHows(part).find((h) => h === p[2]);
      return how === undefined ? null : { t: "attach", part, how, target };
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------- the replay
/*
 * A state is a list of commands from a seed, and a run is its replay: every
 * step keeps the body after it, what the step added, removed and changed, and
 * what it moved in `derive`. Undo is a replay without the last command; a run
 * may resume from an older one whose commands it extends.
 */

export interface LabState {
  seed: number;
  start: Start;
  commands: Command[];
  spread: boolean;
}

export interface Ids {
  nodes: number[];
  segments: number[];
  membranes: number[];
}

interface Diff {
  added: Ids;
  removed: Ids;
  changed: Ids;
}

export interface Step extends Diff {
  index: number;
  /** Index into `state.commands`; -1 for the start. */
  command: number;
  event: Event;
  /** The body after the step; never written to. */
  body: Body;
  /** The previous step's body; null at the start. */
  before: Body | null;
  derived: DerivedChange[];
  hash: string;
  /** The rng after the step: a later run resumes from here. */
  rng: RngWords;
}

export interface Run {
  state: LabState;
  steps: Step[];
  /** The body after the last step. */
  body: Body;
  /** One event per atom, in order, kept even by a light run: the statistics count them. */
  events: Event[];
}

interface RunOptions {
  /** A run of a state this one extends: its steps are kept and only the new commands replay. */
  resume?: Run;
  /** Skip the bookkeeping (clones, diffs, numbers): only the final body matters. */
  light?: boolean;
}

export function initialState(): LabState {
  return { seed: 1, start: { kind: "human" }, commands: [], spread: true };
}

function noIds(): Ids {
  return { nodes: [], segments: [], membranes: [] };
}

function nodeKey(b: Body, id: number): string {
  const n = b.nodes[id]!;
  return JSON.stringify({ size: n.size, ends: n.ends, bait: n.bait });
}

function segmentKey(b: Body, id: number): string {
  const s = b.segments[id]!;
  return JSON.stringify({ a: s.a, b: s.b, kind: s.kind, length: s.length, girth: s.girth, cover: s.cover, cavity: s.cavity, growths: s.growths, breakPlane: s.breakPlane });
}

function membraneKey(b: Body, id: number): string {
  const m = b.membranes[id]!;
  return JSON.stringify({ kind: m.kind, cycle: m.cycle, area: m.area });
}

/**
 * What a step did to the graph, by ascending id: elements new, gone, or
 * changed in what they are (size, endings, kind, length, cover, organs);
 * wounds and blood counters are not a change of the body's shape.
 */
export function diffBodies(before: Body, after: Body): Diff {
  const out: Diff = { added: noIds(), removed: noIds(), changed: noIds() };
  const compare = (kind: keyof Ids, was: Record<number, unknown>, now: Record<number, unknown>, key: (b: Body, id: number) => string): void => {
    const wasIds = sortedIds(was);
    const nowIds = sortedIds(now);
    const wasSet = new Set(wasIds);
    const nowSet = new Set(nowIds);
    for (const id of nowIds) {
      if (!wasSet.has(id)) out.added[kind].push(id);
      else if (key(before, id) !== key(after, id)) out.changed[kind].push(id);
    }
    for (const id of wasIds) if (!nowSet.has(id)) out.removed[kind].push(id);
  };
  compare("nodes", before.nodes, after.nodes, nodeKey);
  compare("segments", before.segments, after.segments, segmentKey);
  compare("membranes", before.membranes, after.membranes, membraneKey);
  return out;
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Whether `older` is a run of a state that `state` extends by commands only. */
function extendsRun(state: LabState, older: Run): boolean {
  const o = older.state;
  if (o.seed !== state.seed || o.spread !== state.spread || !sameJson(o.start, state.start)) return false;
  if (o.commands.length > state.commands.length) return false;
  for (let i = 0; i < o.commands.length; i++) if (!sameJson(o.commands[i], state.commands[i])) return false;
  return older.steps.length > 0;
}

export function run(state: LabState, opts: RunOptions = {}): Run {
  const light = opts.light === true;
  const steps: Step[] = [];
  const events: Event[] = [];
  let body: Body;
  let rng: LabRng;
  let from = 0;
  if (opts.resume !== undefined && !light && extendsRun(state, opts.resume)) {
    steps.push(...opts.resume.steps);
    events.push(...opts.resume.events);
    const last = steps[steps.length - 1]!;
    body = cloneBody(last.body);
    rng = new LabRng(last.rng);
    from = opts.resume.state.commands.length;
  } else {
    body = startBody(state.start);
    tagOrigin(body, 0);
    rng = new LabRng(state.seed);
    if (!light) {
      const snapshot = cloneBody(body);
      steps.push({ index: 0, command: -1, event: { kind: "start" }, body: snapshot, before: null, added: noIds(), removed: noIds(), changed: noIds(), derived: [], hash: bodyHash(snapshot), rng: rng.state });
    }
  }
  for (let c = from; c < state.commands.length; c++) {
    for (const atom of expand(state.commands[c]!)) {
      const event = applyAtom(body, atom, rng, state.spread);
      events.push(event);
      tagOrigin(body, events.length);
      if (light) continue;
      const before = steps[steps.length - 1]!.body;
      const after = cloneBody(body);
      const diff = diffBodies(before, after);
      steps.push({
        index: steps.length,
        command: c,
        event,
        body: after,
        before,
        ...diff,
        derived: diffDerived(derive(before), derive(after)),
        hash: bodyHash(after),
        rng: rng.state,
      });
    }
  }
  return { state: { ...state, start: structuredClone(state.start), commands: state.commands.map((cmd) => ({ ...cmd })) }, steps, body, events };
}
