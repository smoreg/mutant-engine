/**
 * Gear as a table: the cheap things a body straps on, and the one thing each
 * of them does. Rows of data over rules written in `../gear.ts`: which kinds of
 * ending a thing goes on, and what the ending under it counts as while it is
 * on. So a worn thing changes no rule at all: it moves one ending up the size
 * table of `../sizes.ts`, and every derived quantity - the die of the blow,
 * the grip, the stand, the hp of the node, the area a blow finds, the mass,
 * the upkeep, the mass that swings in a volley - follows on its own
 * (decision 890).
 *
 * Words and price are whoever sells it: a game that puts these on a shelf
 * checks its own shelf against this table.
 */
import type { OrganKind } from "../graph.js";
import type { OrganSize } from "../sizes.js";

export type GearId = "brace" | "shod";

export interface GearItem {
  /** Its id; a game that sells it sells it under this id. */
  id: GearId;
  /** The kinds of ending it straps to. The game's word about its own thing, not the model's about a body. */
  on: readonly OrganKind[];
  /** The step the ending under it counts as while it is on (`sizes.ts`). */
  step: OrganSize;
  /** The kind it is stored under when it is not worn. */
  kind: string;
}

/**
 * The table. Both rows are the same thing done twice, on the two endings a
 * bare human has and the model reads as sized: the fist and the foot. They are
 * a prop for a naked man, not a road of their own - a brace turns `1d3` into
 * `1d6`, which a single mutation of the claw family beats outright and on
 * every limb, and the table runs out the moment every hand and every foot is
 * fitted (decision 891).
 */
export const GEAR: readonly GearItem[] = [
  { id: "brace", on: ["hand"], step: "huge", kind: "gear.brace" },
  { id: "shod", on: ["foot"], step: "huge", kind: "gear.shod" },
];

export const GEAR_IDS: ReadonlySet<string> = new Set(GEAR.map((g) => g.id));

export function gearItem(id: string | null | undefined): GearItem | undefined {
  return id === null || id === undefined ? undefined : GEAR.find((g) => g.id === id);
}
