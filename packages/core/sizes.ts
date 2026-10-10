/**
 * The size step of an organ (decision 140): the same kind of ending or jaw
 * comes small, normal or huge, and the step is a dimension of the data, not a
 * kind of its own. A pincer is still `pincer`; `size` on the instance says how
 * much of a pincer it is.
 *
 * Every number the step changes is written out per kind and per size in
 * `ORGAN_SIZE_TABLE`, a full record with no `Partial` anywhere: a kind added to
 * `SizedOrganKind` without its three rows does not compile, and
 * `packages/view/tests/sprites-sizes.test.ts` walks the table so a row filled with the
 * wrong sort of number fails a test rather than passing quietly.
 *
 * The `normal` row is the row `ORGANS` already holds - a test asserts that,
 * so a body of normal organs weighs, hits and stands exactly as before.
 * `hp` and `bulk` are read as what the step lends over the normal one, which
 * is why they are 0 down the whole normal column.
 *
 * This file is a leaf: it imports types only, so `graph.ts` (which needs the
 * hp a big ending lends its node) can read it without an import cycle through
 * parts -> flank -> graph. `parts.ts` re-exports all of it.
 */
import type { Organ, OrganKind } from "./graph.js";

export type OrganSize = "small" | "normal" | "huge";

/** Small first, huge last: everything monotone reads in this order. */
export const ORGAN_SIZES: readonly OrganSize[] = ["small", "normal", "huge"];

/**
 * Kinds that come in three sizes: the endings a body grabs, walks and bites
 * with, and the jaw inside a head. Every name here is a kind of `ORGANS`.
 */
export type SizedOrganKind = "hand" | "pincer" | "claw" | "hook" | "sucker" | "mouth" | "foot" | "hoof" | "jaw";

export const SIZED_ORGANS: readonly SizedOrganKind[] = ["hand", "pincer", "claw", "hook", "sucker", "mouth", "foot", "hoof", "jaw"];

const SIZED = new Set<string>(SIZED_ORGANS);

export function isSizedKind(kind: OrganKind): kind is SizedOrganKind {
  return SIZED.has(kind);
}

export interface OrganSizeSpec {
  /**
   * The organ's name at this step, for the text fixture and the studio, beside
   * `ORGANS[kind].ru`: like those, a name of a part, not a string of the player
   * (the player's strings are the catalog's, packages/core/content/i18n.ts).
   */
  ru: string;
  /** Mass of the organ at this step; the normal row is the kind's own. */
  mass: number;
  /** Upkeep at this step. */
  upkeep: number;
  /** Channels asked for at this step. */
  control: number;
  /** Grip, stand and dig at this step; a kind that has none of them keeps 0 everywhere. */
  grip: number;
  stand: number;
  dig: number;
  /** The die the organ strikes with; "" for a kind that does not strike. */
  attack: string;
  /** Hp the organ lends the node it sits on, over what the normal step lends. */
  hp: number;
  /** How much more of a blow the organ catches than the normal step: its area. */
  bulk: number;
  /** The 16 px stamp drawn this many times across; the graph's glyph takes it too. */
  sprite: number;
}

/**
 * Nine kinds times three steps, written out. The rules of thumb behind the
 * numbers: mass roughly halves down and doubles up, the die steps once either
 * way on `DICE_LADDER`, a huge gripping organ never grips better than the
 * clamp of two allows but holds more of the body's weight, and a huge organ
 * both stiffens its node (hp) and gives a blow more to land on (bulk).
 */
export const ORGAN_SIZE_TABLE: Record<SizedOrganKind, Record<OrganSize, OrganSizeSpec>> = {
  hand: {
    small: { ru: "малая кисть", mass: 1, upkeep: 0, control: 1, grip: 1, stand: 0, dig: 0, attack: "1d2", hp: -1, bulk: -1, sprite: 0.6 },
    normal: { ru: "кисть", mass: 2, upkeep: 0, control: 2, grip: 2, stand: 0, dig: 0, attack: "1d3", hp: 0, bulk: 0, sprite: 1 },
    huge: { ru: "огромная кисть", mass: 5, upkeep: 1, control: 3, grip: 2, stand: 1, dig: 0, attack: "1d6", hp: 3, bulk: 2, sprite: 2 },
  },
  pincer: {
    small: { ru: "малая клешня", mass: 2, upkeep: 0, control: 1, grip: 1, stand: 0, dig: 0, attack: "1d6", hp: -1, bulk: -1, sprite: 0.6 },
    normal: { ru: "клешня", mass: 3, upkeep: 0, control: 2, grip: 1, stand: 0, dig: 0, attack: "1d8", hp: 0, bulk: 0, sprite: 1 },
    huge: { ru: "исполинская клешня", mass: 8, upkeep: 1, control: 3, grip: 2, stand: 0, dig: 1, attack: "1d10", hp: 4, bulk: 3, sprite: 2 },
  },
  claw: {
    small: { ru: "малый коготь", mass: 1, upkeep: 0, control: 1, grip: 1, stand: 0, dig: 1, attack: "1d4", hp: -1, bulk: -1, sprite: 0.6 },
    normal: { ru: "коготь", mass: 1, upkeep: 0, control: 1, grip: 1, stand: 1, dig: 2, attack: "1d6", hp: 0, bulk: 0, sprite: 1 },
    huge: { ru: "исполинский коготь", mass: 4, upkeep: 1, control: 2, grip: 1, stand: 1, dig: 3, attack: "1d8", hp: 2, bulk: 2, sprite: 2 },
  },
  hook: {
    small: { ru: "малый крюк", mass: 1, upkeep: 0, control: 1, grip: 1, stand: 0, dig: 0, attack: "1d3", hp: -1, bulk: -1, sprite: 0.6 },
    normal: { ru: "крюк", mass: 1, upkeep: 0, control: 1, grip: 1, stand: 0, dig: 1, attack: "1d4", hp: 0, bulk: 0, sprite: 1 },
    huge: { ru: "исполинский крюк", mass: 3, upkeep: 1, control: 2, grip: 2, stand: 0, dig: 2, attack: "1d6", hp: 2, bulk: 2, sprite: 2 },
  },
  sucker: {
    small: { ru: "малая присоска", mass: 1, upkeep: 0, control: 1, grip: 1, stand: 0, dig: 0, attack: "", hp: -1, bulk: -1, sprite: 0.6 },
    normal: { ru: "присоска", mass: 1, upkeep: 0, control: 1, grip: 1, stand: 0, dig: 0, attack: "", hp: 0, bulk: 0, sprite: 1 },
    huge: { ru: "исполинская присоска", mass: 3, upkeep: 1, control: 2, grip: 2, stand: 1, dig: 0, attack: "", hp: 2, bulk: 2, sprite: 2 },
  },
  mouth: {
    small: { ru: "малая пасть", mass: 1, upkeep: 0, control: 1, grip: 0, stand: 0, dig: 0, attack: "1d4", hp: -1, bulk: -1, sprite: 0.6 },
    normal: { ru: "пасть", mass: 2, upkeep: 0, control: 1, grip: 0, stand: 0, dig: 0, attack: "1d6", hp: 0, bulk: 0, sprite: 1 },
    huge: { ru: "исполинская пасть", mass: 6, upkeep: 2, control: 2, grip: 0, stand: 0, dig: 0, attack: "1d8", hp: 3, bulk: 3, sprite: 2 },
  },
  foot: {
    small: { ru: "малая стопа", mass: 1, upkeep: 0, control: 1, grip: 0, stand: 1, dig: 0, attack: "1d2", hp: -1, bulk: -1, sprite: 0.6 },
    normal: { ru: "стопа", mass: 2, upkeep: 0, control: 1, grip: 0, stand: 2, dig: 0, attack: "1d2", hp: 0, bulk: 0, sprite: 1 },
    huge: { ru: "исполинская стопа", mass: 5, upkeep: 1, control: 2, grip: 0, stand: 4, dig: 0, attack: "1d4", hp: 3, bulk: 2, sprite: 2 },
  },
  hoof: {
    small: { ru: "малое копыто", mass: 2, upkeep: 0, control: 1, grip: 0, stand: 2, dig: 0, attack: "1d3", hp: -1, bulk: -1, sprite: 0.6 },
    normal: { ru: "копыто", mass: 3, upkeep: 0, control: 1, grip: 0, stand: 3, dig: 0, attack: "1d4", hp: 0, bulk: 0, sprite: 1 },
    huge: { ru: "исполинское копыто", mass: 7, upkeep: 1, control: 2, grip: 0, stand: 5, dig: 0, attack: "1d6", hp: 3, bulk: 2, sprite: 2 },
  },
  // A jaw carries no mass of its own at the normal step: the head it sits in carries it (ORGANS).
  jaw: {
    small: { ru: "малая челюсть", mass: 0, upkeep: 1, control: 1, grip: 0, stand: 0, dig: 0, attack: "1d2", hp: -1, bulk: -1, sprite: 0.6 },
    normal: { ru: "челюсть", mass: 0, upkeep: 1, control: 1, grip: 0, stand: 0, dig: 0, attack: "1d3", hp: 0, bulk: 0, sprite: 1 },
    huge: { ru: "исполинская челюсть", mass: 4, upkeep: 2, control: 2, grip: 0, stand: 0, dig: 0, attack: "1d6", hp: 3, bulk: 2, sprite: 2 },
  },
};

/** The step of an organ; an organ without one is normal. */
export function sizeOf(o: Organ): OrganSize {
  return o.size ?? "normal";
}

/** The row for a kind at a step, or undefined when the kind has no steps. */
export function sizeSpec(kind: OrganKind, size: OrganSize): OrganSizeSpec | undefined {
  return isSizedKind(kind) ? ORGAN_SIZE_TABLE[kind][size] : undefined;
}

/** The row of an organ instance, or undefined when its kind has no steps. */
export function organSizeSpec(o: Organ): OrganSizeSpec | undefined {
  return sizeSpec(o.kind, sizeOf(o));
}

/** The organ and everything it holds: hp lent to the node beyond the normal step. */
function organHpBonus(o: Organ): number {
  let hp = organSizeSpec(o)?.hp ?? 0;
  if (o.contents) for (const c of o.contents) hp += organHpBonus(c);
  return hp;
}

/** The organ and everything it holds: area a blow finds beyond the normal step. */
function organBulk(o: Organ): number {
  let bulk = organSizeSpec(o)?.bulk ?? 0;
  if (o.contents) for (const c of o.contents) bulk += organBulk(c);
  return bulk;
}

/** Every ending of a node: what its big or small organs lend its hp. */
export function endsHpBonus(ends: readonly Organ[]): number {
  let hp = 0;
  for (const o of ends) hp += organHpBonus(o);
  return hp;
}

/** Every ending of a node: what its big or small organs add to the area a blow finds. */
export function endsBulk(ends: readonly Organ[]): number {
  let bulk = 0;
  for (const o of ends) bulk += organBulk(o);
  return bulk;
}

/** How many times across the 16 px stamp of the organ is drawn. */
export function spriteScaleOf(o: Organ): number {
  return organSizeSpec(o)?.sprite ?? 1;
}

/**
 * The ladder a die climbs when a part grows: means 1.5, 2, 2.5, 3.5, 4.5,
 * 5.5, 6.5, 9, 10.5, 14. A die off the ladder joins it at the nearest mean.
 */
const DICE_LADDER: readonly string[] = ["1d2", "1d3", "1d4", "1d6", "1d8", "1d10", "1d12", "2d8", "3d6", "4d6"];

function meanOf(dice: string): number {
  const m = /(\d+)d(\d+)/.exec(dice);
  return m === null ? 0 : (Number(m[1]) * (Number(m[2]) + 1)) / 2;
}

const LADDER_MEANS = DICE_LADDER.map(meanOf);

/** The die `steps` rungs up (or down) the ladder; "" stays "". */
function stepDice(dice: string, steps: number): string {
  if (dice === "" || steps === 0) return dice;
  const want = meanOf(dice);
  let at = 0;
  for (let i = 1; i < LADDER_MEANS.length; i++) if (Math.abs(LADDER_MEANS[i]! - want) < Math.abs(LADDER_MEANS[at]! - want)) at = i;
  return DICE_LADDER[Math.min(DICE_LADDER.length - 1, Math.max(0, at + steps))]!;
}

/** Rungs a step moves a die that the table does not name itself: a head's bite by the size of its jaw. */
const DICE_STEPS: Record<OrganSize, number> = { small: -1, normal: 0, huge: 1 };

/** The die of an organ whose base die lives elsewhere (a head's bite), moved by its step. */
export function sizedDice(dice: string, size: OrganSize): string {
  return stepDice(dice, DICE_STEPS[size]);
}

/** The mark a step writes in the text fixture and in the hash; the normal step writes nothing. */
export const SIZE_MARKS: Record<OrganSize, string> = { small: "<", normal: "", huge: ">" };

export function sizeOfMark(mark: string | undefined): OrganSize {
  return mark === "<" ? "small" : mark === ">" ? "huge" : "normal";
}

/**
 * The name of an organ at its step, beside `ORGANS[kind].ru`: the step's own
 * name when the kind has steps, and undefined when it has none, so a caller
 * falls back to the kind's row.
 */
export function organSizeName(o: Organ): string | undefined {
  return organSizeSpec(o)?.ru;
}
