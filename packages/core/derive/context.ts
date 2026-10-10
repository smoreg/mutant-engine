/**
 * What every derived quantity reads once: distances from your brain, the
 * chain from every node to the nearest torso, which elements have blood,
 * and the capability of every working ending. Built by derive(), passed down.
 */
import type { Body, Organ, Segment } from "../graph.js";
import { nodeIds, otherEnd, segmentIds, selfElement, sortedIds } from "../graph.js";
import { endingCapability, type EndingCapability } from "../capability.js";
import { adjacency, bloodReach, distances, fed, works } from "../metrics.js";
import { hasTag, isChrome, organMass, segmentMass } from "../parts.js";
import { torsoNodes as bodyNodes } from "../flank.js";

/** The segments from a node to the nearest torso node, nearest first; their total length and flesh mass. */
export interface Chain {
  segments: number[];
  length: number;
  mass: number;
}

export interface Ctx {
  body: Body;
  /** From your brain, by segment lengths (body-graph.md §4). */
  dist: Record<number, number>;
  chains: Record<number, Chain>;
  fedSet: Set<number>;
  /**
   * Elements the body still runs on (metrics.ts `bloodReach`): what the blood
   * reaches, or all of it when no heart beats. A part cut off from the blood
   * is dead weight and takes no part in what the body can do.
   */
  live: Set<number>;
  /** Every ending of a working, living node, by node id then position. */
  caps: EndingCapability[];
  digests: boolean;
}

/** The element takes part in the body: intact, not starved out, and still on the blood. */
export function running(ctx: Ctx, id: number): boolean {
  return works(ctx.body, id) && ctx.live.has(id);
}

/** Flesh weighs; chrome is iron and breathes nothing (breath.md §2). */
export function fleshMass(seg: Segment): number {
  return seg.cover === "chrome" ? 0 : segmentMass(seg);
}

export function organFleshMass(o: Organ): number {
  return isChrome(o) ? 0 : organMass(o);
}

const EMPTY: Chain = { segments: [], length: 0, mass: 0 };

/** Nodes of the body proper - torso ends and their side nodes (flank.ts); when the body has no torso, the element your brain is in. */
function torsoNodes(body: Body): number[] {
  const out = new Set<number>(bodyNodes(body));
  if (out.size === 0) {
    const self = selfElement(body);
    const seg = body.segments[self];
    if (seg !== undefined) {
      out.add(seg.a);
      out.add(seg.b);
    } else if (body.nodes[self] !== undefined) out.add(self);
  }
  return [...out].sort((x, y) => x - y);
}

/**
 * Shortest chain from every node to the nearest torso node, by segment
 * lengths; ties go to the smaller segment id. A node with no path has the
 * empty chain.
 */
export function torsoChains(body: Body): Record<number, Chain> {
  const d: Record<number, number> = {};
  const via: Record<number, number> = {};
  const done = new Set<number>();
  for (const n of torsoNodes(body)) d[n] = 0;
  const adj = adjacency(body);
  for (;;) {
    let best = -1;
    let bestD = Infinity;
    for (const id of sortedIds(d)) {
      if (done.has(id)) continue;
      const x = d[id]!;
      if (x < bestD) {
        bestD = x;
        best = id;
      }
    }
    if (best < 0) break;
    done.add(best);
    for (const sid of adj.get(best) ?? []) {
      const s = body.segments[sid]!;
      const other = otherEnd(s, best);
      if (done.has(other)) continue;
      const nd = bestD + s.length;
      const cur = d[other];
      const curVia = via[other];
      if (cur === undefined || nd < cur || (nd === cur && curVia !== undefined && sid < curVia)) {
        d[other] = nd;
        via[other] = sid;
      }
    }
  }
  const out: Record<number, Chain> = {};
  for (const n of nodeIds(body)) {
    if (d[n] === undefined) {
      out[n] = EMPTY;
      continue;
    }
    const segments: number[] = [];
    let length = 0;
    let mass = 0;
    let at = n;
    for (;;) {
      const sid = via[at];
      if (sid === undefined) break;
      const s = body.segments[sid]!;
      segments.push(sid);
      length += s.length;
      mass += fleshMass(s);
      at = otherEnd(s, at);
    }
    out[n] = { segments, length, mass };
  }
  return out;
}

function bodyDigests(body: Body): boolean {
  for (const id of segmentIds(body)) for (const o of body.segments[id]!.cavity) if (hasTag(o.kind, "digests")) return true;
  return false;
}

export function buildContext(body: Body): Ctx {
  const dist = distances(body, body.self);
  const digests = bodyDigests(body);
  const live = bloodReach(body);
  const caps: EndingCapability[] = [];
  for (const id of nodeIds(body)) {
    if (!works(body, id) || !live.has(id)) continue;
    body.nodes[id]!.ends.forEach((_, index) => caps.push(endingCapability(body, id, index, dist, digests)));
  }
  return { body, dist, chains: torsoChains(body), fedSet: fed(body), live, caps, digests };
}

/** The ending a capability names. */
export function endingOf(ctx: Ctx, cap: EndingCapability): Organ {
  return ctx.body.nodes[cap.node]!.ends[cap.index]!;
}

/** What the ending strikes, stands or digs with: itself plus the chain to the torso. */
export function partMass(ctx: Ctx, cap: EndingCapability): number {
  return organFleshMass(endingOf(ctx, cap)) + (ctx.chains[cap.node] ?? EMPTY).mass;
}

export function chainOf(ctx: Ctx, node: number): Chain {
  return ctx.chains[node] ?? EMPTY;
}
