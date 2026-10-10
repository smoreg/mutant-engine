/**
 * How the body moves through the world besides walking: digging, climbing,
 * swimming, flight on a wing membrane, holding an edge, squeezing, laying
 * an egg (body.md §7, world.md, brood.md).
 */
import type { Body } from "../graph.js";
import { segmentIds, sortedIds } from "../graph.js";
import type { EndingCapability } from "../capability.js";
import { MASS_PER_AREA, MEMBRANES, ORGANS, hasTag, specOf, type CapFlag } from "../parts.js";
import { organs, weight } from "../parts.js";
import type { Ctx } from "./context.js";

/** Wing membrane of this area, summed over every wing, carries the body (decision 611). */
export const FLIGHT_AREA = 8;
/**
 * Mass one unit of wing carries (decision 1233): skin in the air lifts a body of
 * its own weight, not any body. Measured on the bestiary - the stone gargoyle
 * carries 18.75 per unit since flesh weighs by its section (decision 1260; 14.4
 * before), the heaviest flier the tables have - so every winged beast still
 * flies, and a spider or a hydra on two pairs of human wings does not. The
 * wing weighs too (decision 1292): a unit of it carries itself and the 19 it
 * carried of the body.
 */
export const WING_LOAD = 19 + MASS_PER_AREA;

/**
 * Mass one hold carries on a wall, and one point of digging moves through the
 * ground (decision 1279): a pair of claws holds a human, one claw does not, and
 * a body too heavy for its limbs neither climbs nor digs.
 */
export const HOLD_LOAD = 60;
/** Holds of a sheet that climbs: an ending held by the sucker pads of its limb, or a thread. */
export const SHEET_HOLDS = 2;
/**
 * Swimming is thrust against drag (decision 1316): water carries the weight, and
 * what pushes it - a fin, a fin sheet, a siphon - pushes by its area against the
 * body's section, its weight to two thirds. A fin is as big as the part it grows
 * on (length times girth), a siphon pushes the water of the part it sits in, a
 * sheet by its own area. Measured on the swimmers of the bestiary - the whale
 * 0.21 on its tail and flippers, the octopus 0.27 on its siphon, the jellyfish
 * 0.28 on its sheet - and on a fin on a man's torso (0.28) that carries him, where
 * one on his forearm (0.09) does not. A body grown alike in every part swims as
 * it did; one ten times heavier on the same fins sinks.
 */
export const SWIM_DRAG = 0.2;

export interface Wing {
  membrane: number;
  area: number;
}

export interface Locomotion {
  /** Hardness dug, the best digger. */
  dig: number;
  climb: boolean;
  /** Climbs upside down: a climber that holds by suckers. */
  ceiling: boolean;
  swim: boolean;
  fly: boolean;
  /** Every wing membrane, whole or not. */
  wings: Wing[];
  /** Holds the edge of a hole: a hook, or anything that climbs. */
  edge: boolean;
  /** Falls into a hole it steps over: neither flies nor holds the edge. */
  falls: boolean;
  /** Ways to squeeze through: pseudopods, slime, a folding skeleton. */
  squeeze: number;
  layEgg: boolean;
}

function growthsWith(body: Body, flag: CapFlag): number {
  let n = 0;
  for (const id of segmentIds(body)) for (const o of body.segments[id]!.growths) if (ORGANS[o.kind].flags?.includes(flag)) n += 1;
  return n;
}

/** The area of a part that pushes water: its length by its girth. */
function pushArea(body: Body, segment: number | null): number {
  const s = segment === null ? undefined : body.segments[segment];
  return s === undefined ? 1 : s.length * s.girth;
}

/**
 * What pushes the body through water (decision 1316): every fin growth and
 * swimming organ by the part it sits on, every swimming sheet by its area,
 * every swimming ending by the part it ends.
 */
export function waterThrust(body: Body, caps: readonly EndingCapability[]): number {
  let t = 0;
  for (const id of segmentIds(body)) {
    const s = body.segments[id]!;
    for (const o of s.growths) if (ORGANS[o.kind].flags?.includes("swim")) t += pushArea(body, id);
    for (const o of s.cavity) if (ORGANS[o.kind].flags?.includes("swim")) t += pushArea(body, id);
  }
  for (const id of sortedIds(body.membranes)) {
    const m = body.membranes[id]!;
    if (MEMBRANES[m.kind].flags?.includes("swim")) t += m.area;
  }
  for (const cap of caps) if (cap.swim) t += pushArea(body, cap.segment);
  return t;
}

/** Climbing, swimming and digging of the whole body, its weight weighed (decision 1279). */
export interface Holds {
  climb: boolean;
  ceiling: boolean;
  swim: boolean;
  /** Hardness dug by the best digger, 0 when the diggers cannot move the body. */
  dig: number;
}

/**
 * The one answer to "does the body climb, swim, dig" (decision 1279), read by
 * `derive` and by `capabilities` alike. An ending that climbs by itself is a
 * hold of its grip (at least one); one held by the pads of its limb and a
 * climbing growth are `SHEET_HOLDS`; a sheet with no ending on it holds nothing.
 * The holds climb when they carry the body at `HOLD_LOAD` each.
 * Digging is the sum of the diggers against the same load, swimming the thrust
 * of `waterThrust` against `SWIM_DRAG` of the weight to two thirds. A wheel's climbing is the
 * speed's business (`locomotion`), not this.
 */
export function holds(body: Body, caps: readonly EndingCapability[]): Holds {
  const m = weight(body);
  let grip = 0;
  let ceilingGrip = false;
  let dig = 0;
  let dug = 0;
  for (const cap of caps) {
    if (cap.climb) {
      const spec = specOf(body.nodes[cap.node]!.ends[cap.index]!);
      grip += spec.flags?.includes("climb") === true ? Math.max(1, spec.grip ?? 0) : SHEET_HOLDS;
      if (cap.flags.includes("wallCeiling")) ceilingGrip = true;
    }
    dig = Math.max(dig, cap.dig);
    dug += cap.dig;
  }
  grip += SHEET_HOLDS * growthsWith(body, "climb");
  const thrust = waterThrust(body, caps);
  const climb = grip > 0 && grip * HOLD_LOAD >= m;
  return {
    climb,
    ceiling: climb && ceilingGrip,
    swim: thrust > 0 && thrust >= SWIM_DRAG * m ** (2 / 3),
    dig: dug * HOLD_LOAD >= m ? dig : 0,
  };
}

export function locomotion(ctx: Ctx, ring: boolean): Locomotion {
  const { body } = ctx;
  let edge = false;
  let squeeze = 0;
  for (const cap of ctx.caps) {
    edge ||= cap.climb || cap.flags.includes("edge");
    if (cap.flags.includes("squeeze") && (ORGANS[cap.kind].flags ?? []).includes("squeeze")) squeeze += 1;
  }
  const h = holds(body, ctx.caps);
  const climb = h.climb && !ring;
  const { dig, swim } = h;
  const wings: Wing[] = [];
  for (const id of sortedIds(body.membranes)) {
    const m = body.membranes[id]!;
    if (m.kind === "wing") wings.push({ membrane: id, area: m.area });
  }
  // Lift is the skin in the air, so every wing counts: one wide pair carries the body, and so do three or four narrow ones -
  // as long as there is skin enough for the weight (decision 1233).
  const area = wings.reduce((a, w) => a + w.area, 0);
  const fly = area >= FLIGHT_AREA && area * WING_LOAD >= weight(body);
  let slime = false;
  for (const id of segmentIds(body)) if (body.segments[id]!.cover === "slime") slime = true;
  let folding = false;
  let eggs = false;
  let sterile = false;
  for (const o of organs(body)) {
    if (o.kind === "foldingSkeleton") folding = true;
    if (hasTag(o.kind, "eggs")) eggs = true;
    if (o.kind === "sterility") sterile = true;
  }
  if (slime) squeeze += 1;
  if (folding) squeeze += 1;
  return { dig, climb, ceiling: climb && h.ceiling, swim, fly, wings, edge, falls: !fly && !edge, squeeze, layEgg: eggs && !sterile };
}
