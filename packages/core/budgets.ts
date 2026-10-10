/**
 * The three budgets of body.md read off the graph: upkeep, control with the
 * distance tax of body-graph.md §4, and bulk. Mass lives in parts.ts.
 */
import type { Body, Organ } from "./graph.js";
import { isBrainKind, nodeIds, segmentIds } from "./graph.js";
import { brains, channelsOf } from "./brains.js";
import { distances, distancesFrom, elementDistance } from "./metrics.js";
import { ORGANS, UPKEEP_PER_AREA, hasTag, mass, organControl, organUpkeep, organs, segmentUpkeep } from "./parts.js";

export { mass } from "./parts.js";

/**
 * What the body burns a turn. `live` (metrics.ts `bloodReach`) narrows it to
 * the elements the blood reaches: dead flesh is carried, not fed. Absent, the
 * whole graph pays, which is the same thing on a sound body.
 */
export function upkeep(body: Body, live?: ReadonlySet<number>): number {
  let u = 0;
  for (const id of segmentIds(body)) {
    if (live !== undefined && !live.has(id)) continue;
    const s = body.segments[id]!;
    u += segmentUpkeep(s);
    for (const o of s.cavity) u += organUpkeep(o);
    for (const o of s.growths) u += organUpkeep(o);
  }
  for (const id of nodeIds(body)) {
    if (live !== undefined && !live.has(id)) continue;
    for (const o of body.nodes[id]!.ends) u += organUpkeep(o);
  }
  // A membrane is living skin: it eats by its area while the blood reaches its whole walk (decision 1260).
  for (const m of Object.values(body.membranes)) {
    if (live !== undefined && !m.cycle.every((id) => live.has(id))) continue;
    u += UPKEEP_PER_AREA * m.area;
  }
  return u;
}

/** Channels an organ needs at distance d from the brain: +1 per 3 lengths beyond 5. */
export function controlOf(o: Organ, d: number | undefined): number {
  let c = 0;
  const base = organControl(o);
  if (base > 0) c += base + (d !== undefined && d > 5 ? Math.ceil((d - 5) / 3) : 0);
  if (o.contents) for (const inner of o.contents) c += controlOf(inner, d);
  return c;
}

/**
 * Every node's distance to the nearest living brain (body-graph.md §4, decision 1317): a brain steers what
 * lies near it, the head's brain the head, a brain in a cavity from the ends of its segment. A brain that
 * runs the trunk (tag `trunk`: the nerve cord) steers from every node of the torso run its segment lies in,
 * so a long trunk pays no distance for its legs. With no living brain, the distance is from you.
 */
export function brainDistances(body: Body): Record<number, number> {
  const seeds: Record<number, number> = {};
  const seed = (id: number, d: number) => {
    if (seeds[id] === undefined || d < seeds[id]!) seeds[id] = d;
  };
  for (const b of brains(body)) {
    if (!b.alive) continue;
    if ("node" in b.place) {
      seed(b.place.node, 0);
      continue;
    }
    const s = body.segments[b.place.segment]!;
    if (ORGANS[b.organ.kind].tags?.includes("trunk") && s.kind === "torso") for (const n of torsoRun(body, b.place.segment)) seed(n, 0);
    else {
      seed(s.a, s.length / 2);
      seed(s.b, s.length / 2);
    }
  }
  return Object.keys(seeds).length === 0 ? distances(body, body.self) : distancesFrom(body, seeds);
}

/** The nodes of the torso segments joined to this one through torso segments. */
function torsoRun(body: Body, start: number): Set<number> {
  const nodes = new Set<number>();
  const seen = new Set<number>([start]);
  const stack = [start];
  while (stack.length > 0) {
    const s = body.segments[stack.pop()!]!;
    for (const n of [s.a, s.b]) {
      if (nodes.has(n)) continue;
      nodes.add(n);
      for (const sid of segmentIds(body)) {
        const o = body.segments[sid]!;
        if (seen.has(sid) || o.kind !== "torso" || (o.a !== n && o.b !== n)) continue;
        seen.add(sid);
        stack.push(sid);
      }
    }
  }
  return nodes;
}

/** Load on the channels: every organ's control plus the distance tax. A part with no blood (`live`) asks for nothing. */
export function controlLoad(body: Body, live?: ReadonlySet<number>): number {
  const dist = brainDistances(body);
  let load = 0;
  for (const id of nodeIds(body)) {
    if (live !== undefined && !live.has(id)) continue;
    const d = dist[id];
    for (const o of body.nodes[id]!.ends) load += controlOf(o, d);
  }
  for (const id of segmentIds(body)) {
    if (live !== undefined && !live.has(id)) continue;
    const s = body.segments[id]!;
    const d = elementDistance(dist, body, id);
    for (const o of s.cavity) load += controlOf(o, d);
    for (const o of s.growths) load += controlOf(o, d);
  }
  return load;
}

/**
 * Channels available: what every living brain gives, yours and the others
 * alike, plus what an organ that is not a brain gives (a brain worm, a
 * second soul: the parasites' channels for free).
 */
export function controlCap(body: Body): number {
  let cap = 0;
  for (const b of brains(body)) if (b.alive) cap += channelsOf(b);
  for (const o of organs(body)) if (!isBrainKind(o.kind)) cap += ORGANS[o.kind].channels ?? 0;
  return cap;
}

/** 1..9 from mass and the sum of node sizes: a human of 101 with sizes 23 (joints since decision 118) is 3.00, well inside its round. */
export function bulk(body: Body): number {
  let sizes = 0;
  for (const id of nodeIds(body)) sizes += body.nodes[id]!.size;
  const raw = Math.round(mass(body) / 40 + sizes / 48);
  return Math.min(9, Math.max(1, raw));
}
