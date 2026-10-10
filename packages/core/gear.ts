/**
 * What a body wears: a thing strapped to an ending of a hand or a foot. Four
 * things and no more, because four is what everyone who deals with gear asks
 * for (decision 893):
 *
 * - `gearSlots`  · every place on this body a thing goes, with what is in it;
 * - `betterGear` · is this thing better than that one **on this body**;
 * - `wearGear`   · strap it on;
 * - `takeOffGear`· take it off.
 *
 * **Where a slot comes from.** Not from a column: from the body, counted here.
 * `capabilities(body)` of the model's public entry lists every ending a body
 * has, with the node it hangs from, its position and its kind - a plain
 * reading of flesh that has no idea anyone is thinking about equipment - and a
 * slot is an ending of a kind some row of `GEAR` names. A two-handed man has
 * two places for a brace and a man who lost an arm has one; a man who lost
 * both has nowhere to put one, and nothing had to be taught that, because it
 * is the same sentence as "he has no hands" (decision 894).
 *
 * The rest of the model is not asked about gear anywhere: the matching of a
 * thing to a place is done here, over data the model keeps about bodies
 * whether or not anyone ever straps anything to one (decision 906). It moved
 * here from the game by the owner's word: a thing on a hand is an ending of
 * the hand in every variant of the game, not in one.
 *
 * **What a worn thing does.** It moves the ending under it one step up the
 * size table of `packages/core/sizes.ts` - `Organ.size`, which the model has had
 * since decision 140 - and nothing else. Every quantity then follows by
 * itself, through `derive()`: the die of the blow and the grip through
 * `capability.ts`, the hp the ending lends its node and the area a blow finds
 * through `sizes.ts`, the mass that swings in the volley through
 * `derive/attacks.ts`, the mass and the upkeep through `budgets.ts`. There is
 * no branch anywhere that asks whether a fighter is wearing anything
 * (decision 890).
 *
 * **What it costs.** A braced fist is a huge hand: 1d3 becomes 1d6, and with
 * it goes mass 2 -> 5, upkeep 0 -> 1 (a ration sooner), two more points of area for a blow to find, one more channel
 * of a mind that is already full, and a heavier arm, so the volley takes
 * longer. The thing buys a blow and the body pays the rent (decision 895).
 *
 * Pure: no screens, no host clock, and the only chance is whatever the caller
 * hands in - there is none here at all.
 */
import { capabilities } from "./capability.js";
import { GEAR, gearItem, type GearId, type GearItem } from "./content/gear.js";
import { touch, type Body, type Organ, type OrganKind } from "./graph.js";
import { sizeOf, sizeSpec, type OrganSize } from "./sizes.js";

/**
 * Anyone who can wear something: the flesh, and the ids of what is on it. The
 * kept body is one of these already, and so is a body walking a line
 * in the field - which is the whole point of the shape. The record is a list
 * of ids and not of places, because the places are the body's and the body
 * changes under them: an arm that came off took its brace with it, and the id
 * that lost its place is dropped by `settleGear`.
 */
export interface Wearer {
  body: Body;
  /** Ids of `GEAR`, absent or empty when nothing is on. */
  gear?: string[];
}

/** One ending of a body, and what is strapped to it. */
interface GearSlot {
  /** The node it hangs from and its position on that node: how the model addresses an ending. */
  node: number;
  index: number;
  /** The organ that is the ending. A row of `GEAR` names kinds, and this is what it is matched against. */
  kind: OrganKind;
  /** What is on it, or nothing. */
  item: GearItem | null;
  /** Nothing is on it. */
  free: boolean;
}

/** The ending a slot is over, or nothing when the flesh is gone. */
function endingAt(body: Body, slot: GearSlot): Organ | undefined {
  return body.nodes[slot.node]?.ends[slot.index];
}

/**
 * The mean of a die, the way `sizes.ts` weighs its own ladder. Two lines of
 * arithmetic over the model's own notation rather than a column of worth in
 * the table: what a step is worth is the model's answer, and a column here
 * would be a second one.
 */
function meanOf(dice: string): number {
  const m = /(\d+)d(\d+)/.exec(dice);
  return m === null ? 0 : (Number(m[1]) * (Number(m[2]) + 1)) / 2;
}

/** What an ending strikes for at a step; 0 for a kind with no steps and for a kind that does not strike. */
function diceAt(o: Organ, step: OrganSize): number {
  return meanOf(sizeSpec(o.kind, step)?.attack ?? "");
}

/** A thing goes on an ending of a kind it names, that has steps, strikes, and is not already at the step it lends. */
function takesGear(o: Organ | undefined, item: GearItem): boolean {
  if (o === undefined || !item.on.includes(o.kind)) return false;
  const spec = sizeSpec(o.kind, item.step);
  return spec !== undefined && spec.attack !== "" && sizeOf(o) !== item.step;
}

/**
 * Every ending anything in `GEAR` could go on, in the model's own order,
 * with what is on it. A worn id is paired with the first ending of a kind it
 * names; ids that find none are worn on flesh the body no longer has and are
 * left out - `settleGear` is what drops them for good.
 */
export function gearSlots(w: Wearer): GearSlot[] {
  const left = [...(w.gear ?? [])];
  const out: GearSlot[] = [];
  for (const cap of capabilities(w.body).endings) {
    if (!GEAR.some((g) => g.on.includes(cap.kind))) continue;
    const slot: GearSlot = { node: cap.node, index: cap.index, kind: cap.kind, item: null, free: true };
    const i = left.findIndex((id) => gearItem(id)?.on.includes(cap.kind) === true);
    if (i >= 0) {
      slot.item = gearItem(left[i]!) ?? null;
      left.splice(i, 1);
    }
    slot.free = slot.item === null;
    out.push(slot);
  }
  return out;
}

/** The endings this thing could go on, empty and of a kind it names, in the model's order. */
export function slotsFor(w: Wearer, item: GearItem): GearSlot[] {
  return gearSlots(w).filter((s) => s.free && takesGear(endingAt(w.body, s), item));
}

/**
 * What the thing is worth on this body: how much more the best ending it fits
 * would strike for with it on. Zero when it fits nowhere, which is the answer
 * a man with no hands gets about a brace, and zero for nothing at all - so
 * `betterGear(w, item, null)` is the plain question "is this worth picking
 * up".
 */
export function gearWorth(w: Wearer, item: GearItem | null | undefined): number {
  if (item === null || item === undefined) return 0;
  let best = 0;
  for (const s of gearSlots(w)) {
    const o = endingAt(w.body, s);
    if (!takesGear(o, item)) continue;
    best = Math.max(best, diceAt(o!, item.step) - diceAt(o!, sizeOf(o!)));
  }
  return best;
}

/**
 * This thing beats that one on this body. One comparison and not a list of
 * fields at the call site: the field picks up what it finds by this and
 * nothing else, and so does whoever hands things out
 * (decision 896).
 */
export function betterGear(w: Wearer, item: GearItem, than: GearItem | null | undefined): boolean {
  return gearWorth(w, item) > gearWorth(w, than);
}

/** What is on the wearer right now, as rows; ids with no place on the body are left out. */
export function wornGear(w: Wearer): GearItem[] {
  return gearSlots(w)
    .map((s) => s.item)
    .filter((i): i is GearItem => i !== null);
}

/**
 * Straps it on. The slot is named or the first free one of its pattern; the
 * ending under it counts as the step of the row from here on, and the id goes
 * onto the wearer. False when there is nowhere to put it, and then nothing
 * moved at all.
 */
export function wearGear(w: Wearer, item: GearItem, slot?: GearSlot): boolean {
  const at = slot ?? slotsFor(w, item)[0];
  if (at === undefined || !at.free) return false;
  const o = endingAt(w.body, at);
  if (!takesGear(o, item)) return false;
  o!.size = item.step;
  touch(w.body);
  w.gear = [...(w.gear ?? []), item.id];
  return true;
}

/**
 * Takes it off: the ending goes back to the step every ending is at, and the
 * id leaves the wearer. False when it is not on.
 *
 * It returns the ending to `normal` and never to what it used to be, because a
 * thing only ever goes onto an ending that is at `normal` (`takesGear` reads
 * the step off the model before it lets the thing on). That is the whole of
 * how a worn step is told apart from a grown one: a huge hand the flesh grew
 * has no room for a brace, so no brace can be taken off it (decision 897).
 */
export function takeOffGear(w: Wearer, id: string, slot?: GearSlot): boolean {
  const worn = w.gear ?? [];
  const i = worn.indexOf(id);
  if (i < 0) return false;
  const at = slot ?? gearSlots(w).find((s) => s.item?.id === id);
  const o = at === undefined ? undefined : endingAt(w.body, at);
  if (o !== undefined) {
    delete o.size;
    touch(w.body);
  }
  w.gear = [...worn.slice(0, i), ...worn.slice(i + 1)];
  return true;
}

/**
 * Drops what the wearer no longer has anywhere to wear, and hands back what it
 * dropped. A brace goes out on a hand and the hand stays in the field: the id
 * has to go with it, and nobody unbolts a brace off an arm before taking the
 * arm off. What is handed back is for a caller that wants to say what was
 * lost; `outfit` says nothing and loses it (decision 905).
 */
export function settleGear(w: Wearer): GearItem[] {
  const kept = wornGear(w).map((g) => g.id as string);
  const worn = w.gear ?? [];
  const lost: GearItem[] = [];
  const left = [...kept];
  for (const id of worn) {
    const i = left.indexOf(id);
    if (i >= 0) left.splice(i, 1);
    else {
      const item = gearItem(id);
      if (item !== undefined) lost.push(item);
    }
  }
  w.gear = kept;
  return lost;
}

export type { GearId, GearItem };
