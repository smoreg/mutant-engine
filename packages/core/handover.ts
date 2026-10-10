/**
 * Handover, surgery.md and body-graph.md §7: when your brain dies, you move
 * into the nearest living brain; on a tie into the one that gives more
 * channels, then into the lower id. The game decides when your brain has
 * died and calls `setSelf` with what `handover` returns.
 */
import type { Body, BrainRef } from "./graph.js";
import { brains, channelsOf, placeDistanceWith } from "./brains.js";
import { distances } from "./metrics.js";

interface HandoverCandidate {
  ref: BrainRef;
  /** From your brain to it: to its node, or to the middle of its torso. */
  distance: number;
  channels: number;
}

function refOrder(x: BrainRef, y: BrainRef): number {
  const ex = "node" in x ? x.node : x.segment;
  const ey = "node" in y ? y.node : y.segment;
  if (ex !== ey) return ex - ey;
  return ("node" in x ? x.end : x.slot) - ("node" in y ? y.end : y.slot);
}

function compare(x: HandoverCandidate, y: HandoverCandidate): number {
  if (x.distance !== y.distance) return x.distance - y.distance;
  if (x.channels !== y.channels) return y.channels - x.channels;
  return refOrder(x.ref, y.ref);
}

/** The best candidate of a list, by distance, channels, id; null for an empty list. */
export function pickHandover(candidates: readonly HandoverCandidate[]): BrainRef | null {
  let best: HandoverCandidate | undefined;
  for (const c of candidates) if (best === undefined || compare(c, best) < 0) best = c;
  return best === undefined ? null : best.ref;
}

/** Every living brain but yours, best first. */
export function handoverCandidates(body: Body): HandoverCandidate[] {
  const list = brains(body);
  const me = list.find((b) => b.self);
  if (me === undefined) return [];
  const dist = distances(body, me.place);
  const out: HandoverCandidate[] = [];
  for (const b of list) {
    if (b.self || !b.alive) continue;
    const distance = placeDistanceWith(body, dist, me.place, b.place);
    if (distance === undefined) continue;
    out.push({ ref: b.ref, distance, channels: channelsOf(b) });
  }
  return out.sort(compare);
}

/** Who becomes you after your brain dies, or null when nobody can. */
export function handover(body: Body): BrainRef | null {
  return pickHandover(handoverCandidates(body));
}
