/**
 * Having something taken off a living body, and what the knife costs it. The
 * removal itself is `strip.ts` and nothing else - the model's own clean cut -
 * and the three cuts that take no organ are `reshape` of `knife.ts`. Nobody
 * here refuses over `Stripped.vital`: a knife that takes the last heart leaves
 * a corpse, and that is a decision, not an error.
 *
 * **The cut wounds**, and not by a rule of its own: the wound is a **blow** of
 * the damage track, `strike` of `damage.ts`, landed where the knife was, so
 * the bleeding, the pain, the organs it ruins on the way and the piece it may
 * tear off are all the ones a blow in a fight leaves (decision 902). The hand
 * is the size of it, and a hand good enough rounds it away to nothing.
 */
import { stable as carryHarm, hurtBrains, organSlots, strike, type Blow, type HarmEvent } from "./damage.js";
import type { Body, Organ } from "./graph.js";
import type { Kept } from "./keep.js";
import { reshape, type Reshape, type Reshaped } from "./knife.js";
import type { Rng } from "./rng.js";
import { strip, type Stripped } from "./strip.js";

/** What the hand that holds the knife does to the flesh, beside whatever it is paid. */
interface KnifeHand {
  /** The blow of the cut is multiplied by this. */
  bleed: number;
  /** The pain of the cut is multiplied by this. */
  pain: number;
  /** Chance the knife takes the flesh next to it as well, 0..1. */
  spoil: number;
  /** Nobody dressed it: it can fester. */
  dirty: boolean;
}

/** The knife as it is actually held: whose hand, and the generator the slip is rolled on. */
export interface Knife {
  hand: KnifeHand;
  rng: Rng;
}

/**
 * The blow of a cut, before the hand: one point for every two units of flesh
 * that left, and never less than one, because a knife went in. A hand of 0.5
 * and 0.2 rounds that away and a cut by a master is clean, which is what a
 * master is for; a hand of 4 makes a wound of it.
 */
export const CUT_PER_MASS = 0.5;
export const CUT_FLOOR = 1;

/** The organs named by the keys of `organSlots`, as a predicate over this body. */
export function organPicker(body: Body, keys: ReadonlySet<string>): (o: Organ) => boolean {
  const wanted = new Set(organSlots(body).filter((s) => keys.has(s.key)).map((s) => s.organ));
  return (o: Organ) => wanted.has(o);
}

/**
 * Where the knife was, read **before** the cut: the elements the picked
 * organs sit on, and both ends of every element named whole. After the cut,
 * whichever of them is still in the body is the wound - for an organ that is
 * the part it came out of, and for a limb taken at the base it is the stump
 * the far end of it left behind.
 */
function marksOf(body: Body, pick: (o: Organ) => boolean, elements: Iterable<number>): number[] {
  const out = new Set<number>();
  for (const s of organSlots(body)) if (pick(s.organ)) out.add(s.element);
  for (const id of elements) {
    out.add(id);
    const seg = body.segments[id];
    if (seg !== undefined) {
      out.add(seg.a);
      out.add(seg.b);
    }
  }
  return [...out].sort((a, b) => a - b);
}

/** What the cut does where it was made, as blows of the damage track. */
function pay(f: Kept, marks: readonly number[], lost: number, knife: Knife): HarmEvent[] {
  const damage = Math.floor(Math.max(CUT_FLOOR, lost * CUT_PER_MASS) * knife.hand.bleed);
  const events: HarmEvent[] = [];
  if (damage <= 0) return events;
  for (const id of marks) {
    if (f.body.nodes[id] === undefined && f.body.segments[id] === undefined) continue;
    const blow: Blow = { damage, profile: "at", aim: id, type: "cut", dirty: knife.hand.dirty };
    events.push(...strike(f.body, f.harm, blow, knife.rng));
    // The hand is felt as well as seen: what a blow hurts by itself is half
    // its damage, and the hand multiplies that over the whole cut.
    const extra = Math.floor((damage / 2) * (knife.hand.pain - 1));
    if (extra > 0) hurtBrains(f.body, f.harm, id, extra);
    // The knife slipped and took what stood beside it: a second blow in the
    // same place, which is where `strike` looks for organs to ruin.
    if (knife.rng.next() < knife.hand.spoil) events.push(...strike(f.body, f.harm, blow, knife.rng));
  }
  return events;
}

/**
 * Takes the picked organs, and whole elements by id, off a kept body. With a
 * `knife` the cut also costs the body what that hand costs it; without one it
 * is the clean removal `strip` always was.
 */
export function operate(f: Kept, pick: (o: Organ) => boolean, elements: Iterable<number> = [], knife?: Knife): { taken: Stripped; wound: HarmEvent[] } {
  const marks = knife === undefined ? [] : marksOf(f.body, pick, elements);
  const taken = carryHarm(f.body, f.harm, () => strip(f.body, pick, elements));
  const wound = knife === undefined ? [] : pay(f, marks, taken.lost, knife);
  return { taken, wound };
}

/**
 * The three cuts that take no organ - a membrane, a cover, a fusion
 * (decisions 1226-1228) - the way `operate` takes the rest: with a `knife`
 * the hand's blow lands where the model says the knife went in
 * (`Reshaped.marks`). A membrane is not an element, so cutting one off wounds
 * nothing.
 */
export function reshapeUnder(f: Kept, r: Reshape, knife?: Knife): { taken: Reshaped; wound: HarmEvent[] } {
  const taken = carryHarm(f.body, f.harm, () => reshape(f.body, r));
  const wound = knife === undefined || taken.marks.length === 0 ? [] : pay(f, taken.marks, taken.lost, knife);
  return { taken, wound };
}
