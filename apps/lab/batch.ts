/**
 * The generator's batch as data: N creatures, one seed each from the first,
 * grown from one basis - a human, the swamp mutant, a beast of the bestiary,
 * a text fixture - by M mutations of one source or of the floor's mixed
 * sources (the mutator's random set). A creature is its lab state, so a card
 * opens in the lab on the same basis and the store keeps only the state and a
 * few numbers. The batch may also tune the catalog for itself: rows switched
 * off, rows weighed, rules of the model switched off - all of it temporary,
 * carried by the #hash, never written to `overrides.ts`. No DOM here.
 */
import {
  bodyHash,
  humanoid,
  nodeIds,
  type Body,
  type Family,
  beastById,
  isEmptyTuning,
  tuningFrom,
  withTuning,
  type CatalogTuning,
  type Command,
  type Source,
  type Start,
  type Tuning,
  LabRng,
  run,
  type LabState,
} from "@mutant-engine/core";
import { randomSet } from "./mutator/model.js";
import { encode } from "./hash.js";
import { heads } from "./stats.js";

/** One source for the whole batch, or the floor: a source drawn afresh for every mutation. */
export type GenSource = Exclude<Source, "id"> | "floor";

/**
 * What a batch changes about the catalog for itself: rows it never draws,
 * rows whose chance it multiplies, rules of the model it switches off. The
 * edits land as `MutationOverride`, the same shape the mutation editor
 * writes - the difference is where they live: here, in the link, for one
 * batch; there, on disk, for everyone. The type itself sits in `commands.ts`
 * so the hash can read it without importing this file back.
 */
export type GenTuning = CatalogTuning;

export interface GenParams {
  count: number;
  /** Mutations per creature, or the low end of the range when `mutationsTo` is there. */
  mutations: number;
  /** The high end of the range: every creature rolls its own count in `mutations..mutationsTo` from its seed. Absent - every creature takes `mutations`. */
  mutationsTo?: number;
  source: GenSource;
  /** Asked of a vaccine only. */
  family?: Family;
  spread: boolean;
  /** The seed of the first creature; the rest follow it. */
  first: number;
  /** The basis every creature grows from; a human when absent. */
  start?: Start;
  /** The catalog as this batch wants it; the catalog as it stands when absent. */
  tuning?: GenTuning;
  /** The line of foes every creature is run through (`foes.ts`); no fight when absent. */
  line?: string;
  /** How the grid is ordered; by seed when absent. Not part of the batch: changing it draws the same creatures again. */
  sort?: GenSort;
  /** Only the creatures that got through this many foes are shown. */
  min?: number;
}

/** The order of the cards: as the seeds come, the ones that got furthest first, the ones that fell first. */
export type GenSort = "strong" | "weak";
export const GEN_SORTS: readonly GenSort[] = ["strong", "weak"];

/** Whether two params grow the same creatures: the order and the filter are a view over one batch, not a batch of their own. */
export function sameBatch(a: GenParams | null, b: GenParams | null): boolean {
  if (a === null || b === null) return a === b;
  const bare = ({ sort: _s, min: _m, ...rest }: GenParams): unknown => rest;
  return JSON.stringify(bare(a)) === JSON.stringify(bare(b));
}

export const DEFAULT_GEN: GenParams = { count: 24, mutations: 10, source: "floor", spread: true, first: 1 };
export const GEN_COUNT_MAX = 400;
export const GEN_MUTATIONS_MAX = 1000;

/** The batch's tuning as the run reads it: the edits per row and the rules off. */
export function tuningOf(p: GenParams): Tuning {
  return tuningFrom(p.tuning);
}

/** Whether the batch takes the catalog as it stands. */
export function plainCatalog(p: GenParams): boolean {
  return isEmptyTuning(p.tuning);
}

export function startOf(p: GenParams): Start {
  return p.start ?? { kind: "human" };
}

/** Whether the batch rolls the number of mutations instead of taking the same one every time. */
export function hasRange(p: GenParams): boolean {
  return p.mutationsTo !== undefined && p.mutationsTo > p.mutations;
}

/**
 * How many mutations one creature of the batch takes: the batch's number, or a
 * roll in `mutations..mutationsTo` from a stream of its own seed - so the same
 * batch is the same creatures, and moving the high end does not reshuffle the
 * low ones.
 */
export function mutationsAt(p: GenParams, seed: number): number {
  if (!hasRange(p)) return p.mutations;
  const span = p.mutationsTo! - p.mutations + 1;
  return p.mutations + Math.floor(new LabRng(`muts:${seed}`).next() * span);
}

/** The mutations of the whole batch, for a summary that counts strikes. */
export function meanMutations(p: GenParams): number {
  if (!hasRange(p)) return p.mutations;
  let sum = 0;
  for (let i = 0; i < p.count; i++) sum += mutationsAt(p, p.first + i);
  return sum / Math.max(1, p.count);
}

/** The basis in Russian, for the cards and the status line; empty for a human. */
export function startRu(start: Start): string {
  switch (start.kind) {
    case "human":
      return "";
    case "swamp":
      return "болотник";
    case "text":
      return "фикстура";
    case "beast":
      return beastById(start.id)?.ru ?? start.id;
  }
}

export function genState(p: GenParams, seed: number): LabState {
  const start = structuredClone(startOf(p));
  const n = mutationsAt(p, seed);
  if (p.source === "floor") return { seed, start, commands: randomSet(seed, n), spread: p.spread };
  const cmd: Command = { t: "mutate", source: p.source, n };
  if (p.source === "vaccine" && p.family !== undefined) cmd.family = p.family;
  return { seed, start, commands: [cmd], spread: p.spread };
}

/** One creature of the batch, grown with the batch's tuning on and nothing left of it afterwards. */
export function growCreature(p: GenParams, state: LabState): Body {
  return withTuning(tuningOf(p), () => run(state, { light: true }).body);
}

export function batchStates(p: GenParams): LabState[] {
  return Array.from({ length: p.count }, (_, i) => genState(p, p.first + i));
}

/** The key of a creature in the store: its state as the lab's hash writes it. */
export function stateKey(state: LabState): string {
  return encode(state);
}

/** What the store keeps of a creature: its state and the numbers a shelf sorts and shows by. */
export interface CreatureSummary {
  key: string;
  seed: number;
  name: string;
  /** The batch's source, `lab` for a creature saved from the lab. */
  source: string;
  mutations: number;
  nodes: number;
  heads: number;
  humanoid: number;
  bodyHash: string;
}

function mutationsOf(state: LabState): number {
  let n = 0;
  for (const c of state.commands) {
    if (c.t === "mutate") n += c.n;
    else if (c.t === "place") n += 1;
  }
  return n;
}

export function summarizeCreature(state: LabState, body: Body, source = "lab"): CreatureSummary {
  const basis = startRu(state.start);
  return {
    key: stateKey(state),
    seed: state.seed,
    // No generated names (owner, decision 119): a creature is its seed, its step count and what it grew from.
    name: `сид ${state.seed} · ${mutationsOf(state)} мут.${basis === "" ? "" : ` · ${basis}`}`,
    source,
    mutations: mutationsOf(state),
    nodes: nodeIds(body).length,
    heads: heads(body),
    humanoid: Math.round(humanoid(body) * 100) / 100,
    bodyHash: bodyHash(body),
  };
}
