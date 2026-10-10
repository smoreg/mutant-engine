/**
 * How much mind the body has and how much it spends (step J). A brain's power
 * is its channels by kind (parts.ts: a human brain 10, a small brain 6, a
 * spinal ganglion 3, a gut brain 4) times the integrity of the node or the
 * segment that holds it, times its blood (a path to a working heart, and the
 * brain still alive), times what is left of it after chrome - a share the
 * model does not carry yet, so it is 0 and the factor is 1. The mental load
 * is the load on the channels with the distance tax of body-graph.md §4 plus
 * two per psionic organ. Everything here is read-only.
 */
import type { Body, Organ } from "./graph.js";
import { isBrainKind, nodeIds, segmentIds } from "./graph.js";
import { brains, type Brain } from "./brains.js";
import { controlLoad } from "./budgets.js";
import { fed } from "./metrics.js";
import { ORGANS, hasTag } from "./parts.js";

/** What a psionic organ adds to the mental load beyond its channels. */
const PSIONIC_LOAD = 2;

interface BrainPower {
  brain: Brain;
  /** Channels of the kind (parts.ts). */
  channels: number;
  /** hp / hpMax of the node or the segment that holds the brain, 0..1. */
  integrity: number;
  /** 1 with a path to a working heart and the brain alive, else 0. */
  blood: number;
  /** Share of the brain replaced by chrome, 0..1; the model carries none yet. */
  chrome: number;
  /** channels x integrity x blood x (1 - chrome). */
  power: number;
}

interface MentalLoad {
  /** Every organ's control with the distance tax (budgets.ts). */
  control: number;
  /** Two per organ tagged `psionic`. */
  psionics: number;
  total: number;
}

function integrityOf(body: Body, id: number): number {
  const el = body.nodes[id] ?? body.segments[id];
  if (el === undefined || el.hpMax <= 0) return 0;
  return Math.max(0, Math.min(1, el.hp / el.hpMax));
}

/** The power of one brain; `fedSet` may be handed in when many brains are read at once. */
export function brainPower(body: Body, brain: Brain, fedSet: Set<number> = fed(body)): BrainPower {
  const id = "node" in brain.ref ? brain.ref.node : brain.ref.segment;
  const channels = ORGANS[brain.organ.kind].channels ?? 0;
  const integrity = integrityOf(body, id);
  const blood = brain.alive && fedSet.has(id) ? 1 : 0;
  const chrome = 0;
  return { brain, channels, integrity, blood, chrome, power: channels * integrity * blood * (1 - chrome) };
}

/** Every brain of the body with its power, in `brains` order. */
export function brainPowers(body: Body): BrainPower[] {
  const fedSet = fed(body);
  return brains(body).map((b) => brainPower(body, b, fedSet));
}

/** Organs that give channels without thinking (a brain worm, a second soul, cortex folds), with the element that holds them. */
function* channelOrgans(body: Body): Generator<{ organ: Organ; holder: number }> {
  for (const id of nodeIds(body)) {
    for (const e of body.nodes[id]!.ends) {
      for (const o of [e, ...(e.contents ?? [])]) if (!isBrainKind(o.kind) && (ORGANS[o.kind].channels ?? 0) > 0) yield { organ: o, holder: id };
    }
  }
  for (const id of segmentIds(body)) {
    const s = body.segments[id]!;
    for (const o of [...s.cavity, ...s.growths]) if (!isBrainKind(o.kind) && (ORGANS[o.kind].channels ?? 0) > 0) yield { organ: o, holder: id };
  }
}

/** The mind of the whole body: every brain's power plus the channels of organs that are not brains, each with its blood and integrity. */
export function mindPower(body: Body): number {
  const fedSet = fed(body);
  let power = 0;
  for (const p of brainPowers(body)) power += p.power;
  for (const { organ, holder } of channelOrgans(body)) if (fedSet.has(holder)) power += (ORGANS[organ.kind].channels ?? 0) * integrityOf(body, holder);
  return power;
}

/** What the body asks of its mind. */
export function mentalLoad(body: Body): MentalLoad {
  const control = controlLoad(body);
  let psionic = 0;
  for (const id of nodeIds(body)) for (const e of body.nodes[id]!.ends) for (const o of [e, ...(e.contents ?? [])]) if (hasTag(o.kind, "psionic")) psionic += 1;
  for (const id of segmentIds(body)) {
    const s = body.segments[id]!;
    for (const o of [...s.cavity, ...s.growths]) if (hasTag(o.kind, "psionic")) psionic += 1;
  }
  const psionics = PSIONIC_LOAD * psionic;
  return { control, psionics, total: control + psionics };
}
