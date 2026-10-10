/**
 * Alienness: how far the body is from the human, by one formula and no table
 * of families (decision 1254). The body is read as a bag of parts - every
 * segment by kind and cover, every organ by kind and where it sits, every
 * membrane by kind - each weighing 1 plus its mass. Alienness is the weight
 * the bag differs from the human's by, both ways:
 *
 *   alien = sum over keys |W_body(key) - W_human(key)|
 *
 * What the human has not is alien; what the human has and the body lost is
 * alien too; a longer arm is alien by the mass it grew. The human is 0, a
 * grown part adds its weight, a part the knife takes off that the human has
 * not takes its weight away. Keys are kinds, never ids.
 */
import type { Body, Organ } from "../graph.js";
import { sortedIds } from "../graph.js";
import { human } from "../human.js";
import { SEGMENT_KINDS, specOf } from "../parts.js";

type Bag = Map<string, number>;

function add(bag: Bag, key: string, mass: number): void {
  bag.set(key, (bag.get(key) ?? 0) + 1 + mass);
}

/** An organ by kind, size step and place; it weighs 1 plus its own mass (a head without what it holds). */
function addOrgan(bag: Bag, place: string, o: Organ): void {
  add(bag, `${place} ${o.kind}${o.size === undefined ? "" : `:${o.size}`}`, specOf(o).mass);
}

function bagOf(body: Body): Bag {
  const bag: Bag = new Map();
  const at = new Map<number, Set<string>>();
  for (const id of sortedIds(body.segments)) {
    const s = body.segments[id]!;
    if (s.kind === "flank") continue;
    for (const n of [s.a, s.b]) at.set(n, (at.get(n) ?? new Set<string>()).add(s.kind));
  }
  for (const id of sortedIds(body.nodes)) {
    const on = [...(at.get(id) ?? [])].sort().join("+");
    add(bag, `node ${body.nodes[id]!.size}`, 0);
    for (const o of body.nodes[id]!.ends) {
      addOrgan(bag, `end ${on}`, o);
      for (const c of o.contents ?? []) addOrgan(bag, `in ${o.kind}`, c);
    }
  }
  for (const id of sortedIds(body.segments)) {
    const s = body.segments[id]!;
    add(bag, `seg ${s.kind}`, SEGMENT_KINDS[s.kind].massPer * s.length * s.girth);
    add(bag, `cover ${s.cover} ${s.kind}`, s.length * s.girth);
    for (const o of s.cavity) addOrgan(bag, `cavity ${s.kind}`, o);
    for (const o of s.growths) addOrgan(bag, `growth ${s.kind}`, o);
  }
  for (const id of sortedIds(body.membranes)) add(bag, `membrane ${body.membranes[id]!.kind}`, 0);
  return bag;
}

let humanBag: Bag | null = null;
const cache = new WeakMap<Body, { version: number; nextId: number; alien: number }>();

/** How far the body is from the human, in weight of parts (1 each plus mass); the human is 0. */
export function alienness(body: Body): number {
  const hit = cache.get(body);
  if (hit !== undefined && hit.version === body.version && hit.nextId === body.nextId) return hit.alien;
  humanBag ??= bagOf(human());
  const bag = bagOf(body);
  let alien = 0;
  for (const [key, w] of bag) alien += Math.abs(w - (humanBag.get(key) ?? 0));
  for (const [key, w] of humanBag) if (!bag.has(key)) alien += w;
  alien = Math.round(alien * 100) / 100;
  cache.set(body, { version: body.version, nextId: body.nextId, alien });
  return alien;
}
