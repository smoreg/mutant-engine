/**
 * Bulk on the grid (body.md §6, world.md): cells occupied, the width that
 * passes freely, the width that takes a squeeze, and what makes the body
 * smaller for passages than it is.
 */
export type Footprint = 1 | 2 | 3;

export interface Passage {
  /** Bulk for passages: the body's, less what folds, or 1 for alien geometry. */
  bulk: number;
  /** Width that passes freely. */
  free: number;
  /** Narrowest width a squeeze gets through; null when nothing narrower than `free` does. */
  squeeze: number | null;
  /** Alien geometry: any slit is a passage. */
  slits: boolean;
  /** Cycles do not fold: one more of damage per cycle when squeezing (body-graph.md §9). */
  cycles: number;
}

/** 1..5 one cell, 6..7 two by two, 8..9 three by three. */
export function footprintOf(bulk: number): Footprint {
  return bulk <= 5 ? 1 : bulk <= 7 ? 2 : 3;
}

/** Ways to squeeze past two take nothing more off. */
export const SQUEEZE_MAX = 2;
/** Nothing squeezes at this bulk: dig or go around. */
export const NO_SQUEEZE_BULK = 8;

export function passage(bulk: number, squeeze: number, slits: boolean, cycles: number): Passage {
  const effective = slits ? 1 : Math.max(1, bulk - Math.min(SQUEEZE_MAX, squeeze));
  const footprint = footprintOf(effective);
  const free = footprint === 1 ? (effective <= 3 ? 1 : 2) : footprint;
  const narrow = effective >= NO_SQUEEZE_BULK ? null : Math.max(1, free - 1);
  return { bulk: effective, free, squeeze: narrow, slits, cycles };
}
