/**
 * The mutants of the living gallery: a hundred humans grown by 5, 10, 20 or
 * 30 mutations from one of six sources, deterministic from a seed. The
 * sources are the lab's (a share of defects, families barred), on the lab's
 * own generator; unlike the lab, meat and a vaccine here ask for one random
 * family each, and `mixed` draws a source afresh at every step. No DOM.
 */
import {
  FAMILIES,
  applyMutation,
  drawMutation,
  human,
  type Body,
  type Family,
  type Mutation,
  type MutationContext,
  type OrganKind,
  MUTATIONS,
  MUTATION_TEXT,
  SOURCES,
  sourceSpec,
  type Source,
  LabRng,
} from "@mutant-engine/core";

export type LivingSource = Exclude<Source, "id"> | "mixed";

interface LivingSourceSpec {
  id: LivingSource;
  ru: string;
  /** How many of the hundred cards. */
  shown: number;
}

export const LIVING_SOURCES: readonly LivingSourceSpec[] = [
  { id: "abyss", ru: "удар бездны", shown: 20 },
  { id: "meat", ru: "мясо твари", shown: 15 },
  { id: "tumour", ru: "созревшая опухоль", shown: 15 },
  { id: "spring", ru: "родник", shown: 15 },
  { id: "vaccine", ru: "прививка риппера", shown: 15 },
  { id: "mixed", ru: "смешанный", shown: 20 },
];

export const MUTATIONS_BY_SEED = [5, 10, 20, 30] as const;

/** Sources a mixed mutant draws from at every step. */
const PLAIN: readonly Exclude<LivingSource, "mixed">[] = ["abyss", "meat", "tumour", "spring", "vaccine"];

export interface MutantSpec {
  seed: number;
  source: LivingSource;
  count: number;
  /** Asked of meat and a vaccine only. */
  family?: Family;
}

export function livingSourceSpec(id: LivingSource): LivingSourceSpec {
  return LIVING_SOURCES.find((s) => s.id === id)!;
}

/** The spec of a seed for a source: the count by the seed, a family for meat and a vaccine from the seed too. */
function specFor(seed: number, source: LivingSource): MutantSpec {
  const spec: MutantSpec = { seed, source, count: MUTATIONS_BY_SEED[seed % MUTATIONS_BY_SEED.length]! };
  if (source === "meat" || source === "vaccine") spec.family = FAMILIES[Math.floor(new LabRng(`family-${seed}`).next() * FAMILIES.length)]!;
  return spec;
}

/** The hundred cards: seeds 1..100 in source order. */
export function livingSpecs(): MutantSpec[] {
  const out: MutantSpec[] = [];
  let seed = 1;
  for (const s of LIVING_SOURCES) for (let i = 0; i < s.shown; i++) out.push(specFor(seed++, s.id));
  return out;
}

export interface Step {
  /** Mutation id, or "" when nothing could be drawn. */
  id: string;
  ru: string;
  family: Family | null;
  source: Exclude<LivingSource, "mixed">;
  defect: boolean;
  /** Landed as a tumour. */
  fallback: boolean;
  /** Drawn, but found no place at all, not even for a tumour. A draw that yields no row (a family with no defect rows) is not lost: `id` is empty. */
  lost: boolean;
  displaced: OrganKind[];
}

export interface Mutant {
  spec: MutantSpec;
  body: Body;
  steps: Step[];
}

/** One mutation from a source on the body in place, the lab's convention: a defect roll by the source's share, families it never gives filtered out. */
function mutateOnce(body: Body, source: Exclude<LivingSource, "mixed">, family: Family | undefined, rng: LabRng, spread = true): Step {
  const spec = sourceSpec(source);
  const catalog = spec.never.length === 0 ? MUTATIONS : MUTATIONS.filter((m) => !spec.never.includes(m.family));
  const defect = spec.defects !== null && spec.defects > 0 ? rng.next() < spec.defects : false;
  const opts: Parameters<typeof drawMutation>[2] = { spread, defect };
  if (family !== undefined) opts.family = family;
  if (spread) opts.body = body;
  const m: Mutation | null = drawMutation(catalog, rng, opts);
  const step: Step = { id: "", ru: "", family: family ?? null, source, defect, fallback: false, lost: false, displaced: [] };
  if (m === null) return step;
  step.id = m.id;
  step.ru = MUTATION_TEXT[m.i18n]?.ru ?? m.id;
  step.family = m.family;
  const ctx: MutationContext = { spread };
  if (source === "abyss") ctx.source = "abyss";
  const result = applyMutation(body, m, rng, ctx);
  if (result === null) step.lost = true;
  else {
    step.fallback = result.fallback;
    step.displaced = result.displaced.map((o) => o.kind);
  }
  return step;
}

/** A human grown by the spec: the same seed always gives the same mutant. */
export function growMutant(spec: MutantSpec): Mutant {
  const rng = new LabRng(spec.seed);
  const body = human();
  const steps: Step[] = [];
  for (let i = 0; i < spec.count; i++) {
    const source = spec.source === "mixed" ? PLAIN[Math.floor(rng.next() * PLAIN.length)]! : spec.source;
    steps.push(mutateOnce(body, source, spec.family, rng));
  }
  return { spec, body, steps };
}

export { SOURCES };
