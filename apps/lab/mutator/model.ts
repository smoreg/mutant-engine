/**
 * The mutator's model on top of the lab's: a state is the lab's state with a
 * human start and the spread on; a random set is N mutate commands of one
 * atom each, drawn from the sources of the first floor by the seed; a step is
 * read into a card. Every command is data, so the lab opens the same link.
 * No DOM here: the page reads, the tests replay.
 */
import {
  FAMILIES,
  type Family,
  type MutateCommand,
  type Source,
  LabRng,
  type LabState,
  type Step,
  FAMILY_RU,
  OP_RU,
  elementName,
  organsRu,
  segmentName,
  targetName,
  mutationRu,
  type DerivedChange,
} from "@mutant-engine/core";

/** The sources a body meets on the first floor and how often a random set draws each: the abyss first, its beasts next. */
export const FLOOR_SOURCES: readonly { id: Source; weight: number }[] = [
  { id: "abyss", weight: 4 },
  { id: "meat", weight: 3 },
  { id: "tumour", weight: 1 },
  { id: "spring", weight: 1 },
  { id: "vaccine", weight: 1 },
];

export type Pick = Source | "random";

export const SOURCE_RU: Record<Pick, string> = {
  random: "случайный источник",
  abyss: "удар бездны",
  meat: "мясо твари",
  tumour: "опухоль",
  spring: "родник",
  vaccine: "прививка",
  id: "мутация по id",
};

export const SET_SIZES = [5, 10, 20, 40] as const;
export const DEFAULT_SIZE = 10;
/** The creature the page opens on. */
export const DEFAULT_SEED = 12;

function drawSource(rng: LabRng): Source {
  let total = 0;
  for (const s of FLOOR_SOURCES) total += s.weight;
  let roll = rng.next() * total;
  for (const s of FLOOR_SOURCES) {
    roll -= s.weight;
    if (roll < 0) return s.id;
  }
  return FLOOR_SOURCES[0]!.id;
}

function drawFamily(rng: LabRng): Family {
  return FAMILIES[Math.floor(rng.next() * FAMILIES.length)]!;
}

function command(source: Source, family: Family | undefined, rng: LabRng): MutateCommand {
  const cmd: MutateCommand = { t: "mutate", source, n: 1 };
  if (source === "vaccine") cmd.family = family ?? drawFamily(rng);
  return cmd;
}

/** The source the page's "random" picks for the command at `index` of a creature of `seed`. */
export function randomSource(seed: number, index: number): Source {
  return drawSource(new LabRng(`pick-${seed}-${index}`));
}

/** One more mutation: the source asked for, or one of the floor's by the seed and the command's index. */
export function mutateCommand(pick: Pick, family: Family | undefined, seed: number, index: number): MutateCommand {
  const rng = new LabRng(`pick-${seed}-${index}`);
  const source = pick === "random" ? drawSource(rng) : pick;
  return command(source, family, rng);
}

/** N mutations from random sources of the first floor, fixed by the seed. */
export function randomSet(seed: number, n: number): MutateCommand[] {
  const rng = new LabRng(`set-${seed}`);
  const out: MutateCommand[] = [];
  for (let i = 0; i < n; i++) out.push(command(drawSource(rng), undefined, rng));
  return out;
}

export function stateOf(seed: number, commands: MutateCommand[]): LabState {
  return { seed, start: { kind: "human" }, commands, spread: true };
}

export function defaultState(): LabState {
  return stateOf(DEFAULT_SEED, randomSet(DEFAULT_SEED, DEFAULT_SIZE));
}

// ---------------------------------------------------------------- the card of a step

export type Outcome = "start" | "landed" | "fallback" | "lost" | "none" | "other";

interface StepCard {
  index: number;
  outcome: Outcome;
  sourceRu: string;
  defect: boolean;
  /** Russian name of the mutation; null when the source gave none. */
  name: string | null;
  id: string | null;
  family: Family | null;
  familyRu: string | null;
  /** The operation that happened, in the lab's capitals; null when nothing landed. */
  op: string | null;
  where: string | null;
  /** Organs the abyss pushed out at the ceiling for this landing, one line. */
  displaced: string | null;
  /** Organs squeezed out of a cavity, one line. */
  evicted: string | null;
  removed: string[];
  infected: string | null;
  moves: DerivedChange[];
}

export function describeStep(step: Step): StepCard {
  const e = step.event;
  const before = step.before ?? step.body;
  const card: StepCard = {
    index: step.index,
    outcome: "other",
    sourceRu: "",
    defect: false,
    name: null,
    id: null,
    family: null,
    familyRu: null,
    op: null,
    where: null,
    displaced: null,
    evicted: null,
    removed: [],
    infected: null,
    moves: step.derived,
  };
  if (e.kind === "start") {
    card.outcome = "start";
    card.sourceRu = "человек";
    return card;
  }
  if (e.kind === "place") {
    card.sourceRu = "вручную";
    card.id = e.id;
    if (e.mutation !== null) {
      card.name = mutationRu(e.mutation.id);
      card.family = e.mutation.family;
      card.familyRu = FAMILY_RU[e.mutation.family];
    }
    if (e.result === null) {
      card.outcome = "lost";
      return card;
    }
    card.outcome = "landed";
    card.op = OP_RU[e.result.op];
    card.where = targetName(before, e.result.target);
    if (e.result.evicted.length > 0) card.evicted = organsRu(e.result.evicted);
    card.removed = e.result.removed.map((id) => elementName(before, id));
    return card;
  }
  if (e.kind !== "mutate") return card;
  card.sourceRu = SOURCE_RU[e.source];
  card.defect = e.defect === true;
  if (e.mutation === null) {
    card.outcome = "none";
    return card;
  }
  card.name = mutationRu(e.mutation.id);
  card.id = e.mutation.id;
  card.family = e.mutation.family;
  card.familyRu = FAMILY_RU[e.mutation.family];
  if (e.result === null) {
    card.outcome = "lost";
    return card;
  }
  const r = e.result;
  card.outcome = r.fallback ? "fallback" : "landed";
  card.op = OP_RU[r.op];
  card.where = targetName(before, r.target);
  if (r.displaced.length > 0) card.displaced = organsRu(r.displaced);
  if (r.evicted.length > 0) card.evicted = organsRu(r.evicted);
  card.removed = r.removed.map((id) => elementName(before, id));
  if (r.infected !== null) card.infected = segmentName(step.body, r.infected);
  return card;
}
