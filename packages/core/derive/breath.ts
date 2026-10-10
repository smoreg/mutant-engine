/**
 * Air as breath.md §1-2 reads it off the graph: which organs breathe and
 * what, the three tanks, the resting base, delivery per heart, and the flesh
 * that works in each action. Lungs breathe from any torso cavity, a gill
 * sheet is a membrane, a chrome part weighs nothing to the lungs.
 */
import type { MembraneKind, OrganKind } from "../graph.js";
import { segmentIds, sortedIds } from "../graph.js";
import { COVERS, MEMBRANES, ORGANS, type BreathSpec } from "../parts.js";
import type { Derived } from "../derive.js";
import type { Attack } from "./attacks.js";
import { fleshMass, organFleshMass, partMass, running, type Ctx } from "./context.js";
import type { Grips } from "./grip.js";
import type { Locomotion } from "./locomotion.js";
import type { Speed } from "./speed.js";

/** breath.md §1: lungs 5 per organ, blood 12 at full blood (blood's ceiling is mass), muscle 3. */
export const LUNG_TANK_DENSITY = 1;
export const BLOOD_TANK = 12;
export const MUSCLE_TANK = 3;
export const BASE_PER_BRAIN = 0.5;
export const BASE_PER_HEART = 0.25;
export const BASE_PER_MASS = 0.25;
export const COLD_BLOOD_FACTOR = 0.6;
export const DELIVERY_PER_HEART = 2;
/** The cover that keeps a skin wet: pores under it breathe water (decision 1240). */
export const WET_COVER = "slime";
/** A cover this hard lets no air through: pores under chitin, plates, chrome or stone are shut (decision 1275). */
export const SEALED_DEFENSE = 2;
/**
 * Length x girth of the human chest: lungs in it breathe and hold what their row
 * says, lungs in a wider one that much more, never less (decision 1276).
 */
export const LUNG_VOLUME = 6;
/**
 * Tracheae breathe only in a small body (breath.md §12). Since flesh weighs by
 * its section (decision 1260) the beetle - a torso of the bull's tier for its
 * six legs (decision 1258) - is bulk 4 (3.9), and the line moves with it.
 */
export const TRACHEAE_MAX_BULK = 4;

export type Medium = "air" | "water";

export interface BreathOrgan {
  kind: OrganKind | MembraneKind;
  /** The segment it sits in or on, or the membrane it is. */
  at: number;
  air: number;
  water: number;
  tank: number;
}

/** Flesh that works in each action, by mass (breath.md §2). */
export interface Muscles {
  /** Feet with their legs. */
  stands: number;
  /** Every limb with its ending. */
  limbs: number;
  /** Wing membranes: the segments of their cycles. */
  wings: number;
  /** The best digger with the limb that carries it. */
  dig: number;
  /** The best grip with its limb. */
  manipulator: number;
}

export interface Breath {
  organs: BreathOrgan[];
  intake: { air: number; water: number };
  tank: { lungs: number; blood: number; muscle: number; common: number; total: number };
  /** Spent at rest: brains, hearts, mass. */
  base: number;
  /** What the muscles get per turn at most. */
  delivery: number;
  media: Medium[];
  muscles: Muscles;
}

export type BreathAction = "rest" | "step" | "swim" | "strike" | "dig" | "fly" | "climb" | "surgery";

/**
 * k per action, breath.md §2. A strike is 0.7 (decision 1304): the naked human
 * fights on air as long as he likes, so his full volley - two fists and a bite,
 * mass 27 - fits the 2 his hearts deliver past the rest; at 1 it was 2.7.
 */
export const BREATH_K: Record<BreathAction, number> = { rest: 0, step: 0.2, swim: 0.3, strike: 0.7, dig: 0.7, fly: 1.5, climb: 0.4, surgery: 0.2 };

const LIMB_KINDS = new Set(["arm", "leg", "tentacle", "tail"]);

function breathOrgans(ctx: Ctx, bulk: number): BreathOrgan[] {
  const { body } = ctx;
  const out: BreathOrgan[] = [];
  const push = (kind: OrganKind | MembraneKind, at: number, spec: BreathSpec) => out.push({ kind, at, air: spec.air, water: spec.water, tank: spec.tank });
  for (const id of segmentIds(body)) {
    if (!running(ctx, id)) continue;
    const seg = body.segments[id]!;
    // What breathes in a cavity is as big as the cavity: a dragon's chest draws and holds more than a man's.
    const k = Math.max(1, (seg.length * seg.girth) / LUNG_VOLUME);
    for (const o of seg.cavity) {
      const spec = ORGANS[o.kind].breath;
      if (spec !== undefined) push(o.kind, id, { air: spec.air * k, water: spec.water * k, tank: spec.tank * k });
    }
  }
  for (const id of segmentIds(body)) {
    if (!running(ctx, id)) continue;
    const seg = body.segments[id]!;
    for (const o of seg.growths) {
      const spec = ORGANS[o.kind].breath;
      if (spec === undefined) continue;
      if (o.kind === "tracheae" && bulk > TRACHEAE_MAX_BULK) continue;
      // Skin breathes only through a cover that lets the air in (decision 1275).
      if (o.kind === "pores" && COVERS[seg.cover].defense >= SEALED_DEFENSE) continue;
      // Skin breathes what it is wet with: pores under slime take water, not air (decision 1240).
      if (o.kind === "pores" && seg.cover === WET_COVER) {
        push(o.kind, id, { air: 0, water: spec.air, tank: spec.tank });
        continue;
      }
      push(o.kind, id, spec);
    }
  }
  for (const id of sortedIds(body.membranes)) {
    const m = body.membranes[id]!;
    const spec = MEMBRANES[m.kind].breath;
    if (spec !== undefined) push(m.kind, id, spec);
  }
  return out;
}

function muscles(ctx: Ctx, sp: Speed, gr: Grips, loco: Locomotion): Muscles {
  const { body } = ctx;
  let stands = 0;
  for (const s of sp.stands) {
    const cap = ctx.caps.find((c) => c.node === s.node && c.index === s.index)!;
    stands += partMass(ctx, cap);
  }
  let limbs = 0;
  for (const id of segmentIds(body)) {
    const s = body.segments[id]!;
    if (LIMB_KINDS.has(s.kind)) limbs += fleshMass(s);
  }
  for (const cap of ctx.caps) {
    if (cap.segmentKind !== null && LIMB_KINDS.has(cap.segmentKind)) limbs += organFleshMass(body.nodes[cap.node]!.ends[cap.index]!);
  }
  const wingSegments = new Set<number>();
  for (const w of loco.wings) for (const sid of body.membranes[w.membrane]!.cycle) wingSegments.add(sid);
  let wings = 0;
  for (const sid of wingSegments) wings += fleshMass(body.segments[sid]!);
  const diggers = ctx.caps.filter((c) => c.dig > 0).sort((x, y) => y.dig - x.dig || x.node - y.node || x.index - y.index);
  const dig = diggers.length === 0 ? 0 : partMass(ctx, diggers[0]!);
  const best = [...gr.list].sort((x, y) => y.level - x.level || x.node - y.node || x.index - y.index)[0];
  const manipulator = best === undefined ? 0 : partMass(ctx, ctx.caps.find((c) => c.node === best.node && c.index === best.index)!);
  return { stands, limbs, wings, dig, manipulator };
}

export interface BreathInputs {
  mass: number;
  bulk: number;
  /** Living brains of flesh. */
  brains: number;
  /** Working hearts. */
  hearts: number;
  coldBlood: boolean;
}

export function breath(ctx: Ctx, sp: Speed, gr: Grips, loco: Locomotion, inputs: BreathInputs): Breath {
  const organs = breathOrgans(ctx, inputs.bulk);
  let air = 0;
  let water = 0;
  let lungs = 0;
  for (const o of organs) {
    air += o.air;
    water += o.water;
    lungs += o.tank * LUNG_TANK_DENSITY;
  }
  const blood = (BLOOD_TANK * inputs.mass) / 100;
  const common = lungs + blood;
  const base = (BASE_PER_BRAIN * inputs.brains + BASE_PER_HEART * inputs.hearts + (BASE_PER_MASS * inputs.mass) / 100) * (inputs.coldBlood ? COLD_BLOOD_FACTOR : 1);
  const media: Medium[] = [];
  if (air > 0) media.push("air");
  if (water > 0) media.push("water");
  return {
    organs,
    intake: { air, water },
    tank: { lungs, blood, muscle: MUSCLE_TANK, common, total: common + MUSCLE_TANK },
    base,
    delivery: DELIVERY_PER_HEART * inputs.hearts,
    media,
    muscles: muscles(ctx, sp, gr, loco),
  };
}

/** The flesh an action moves, by mass. */
export function workingMass(d: Derived, action: BreathAction, attack = 0): number {
  const m = d.breath.muscles;
  switch (action) {
    case "rest":
      return 0;
    case "step":
      return m.stands;
    case "swim":
    case "climb":
      return m.limbs;
    case "strike":
      return (d.attacks[attack] as Attack | undefined)?.mass ?? 0;
    case "dig":
      return m.dig;
    case "fly":
      return m.wings;
    case "surgery":
      return m.manipulator;
  }
}

/**
 * Air spent in a turn of the action: the base plus k x working mass / 10
 * (breath.md §2). A strike names its attack by index in `attacks`.
 * Understanding of the working part (x0.7 at 3) is the game's, not the body's.
 */
export function breathCost(d: Derived, action: BreathAction, attack = 0): number {
  return d.breath.base + effort(action, workingMass(d, action, attack));
}

/**
 * What the muscles of an action spend over the rest in a turn: k x the mass
 * they move / 10 (breath.md §2). The one formula every action pays by: the
 * fight hands it the mass of each strike it threw (decision 1294).
 */
export function effort(action: BreathAction, mass: number): number {
  return (BREATH_K[action] * mass) / 10;
}
