/**
 * Territories, body-graph.md §7. A node belongs to the foreign brain h whose
 * claim `d(h, x) - sway(h) / 2` is the smallest and below your own `d(you, x)`;
 * ties go to you, and between foreign brains to the earlier one in `brains`
 * order. What no foreign brain claims is yours. A dead brain claims nothing.
 *
 * A segment belongs to a territory when both its ends do; with one end inside
 * it lies on the border. A brain seizes the body when the element holding
 * your brain is inside its territory: your node, or your whole torso.
 */
import type { Body, BrainRef } from "./graph.js";
import { nodeIds, sameRef, segmentIds, selfElement } from "./graph.js";
import { brains, type Brain } from "./brains.js";
import { distances } from "./metrics.js";

export interface Territory {
  brain: Brain;
  nodes: number[];
  /** Segments with both ends inside. */
  segments: number[];
  /** Segments with exactly one end inside. */
  border: number[];
}

interface Ownership {
  brains: Brain[];
  /** Distances from every brain, in `brains` order. */
  dist: Record<number, number>[];
  /** node id -> index into `brains` of the owner. */
  owner: Map<number, number>;
  /** Index of your brain, or -1. */
  self: number;
}

/** A brain's claim on a node: its distance less half its sway; yours is the plain distance. */
export function claimOf(own: Ownership, i: number, node: number): number {
  const d = own.dist[i]![node];
  if (d === undefined) return Infinity;
  const b = own.brains[i]!;
  if (b.self) return d;
  return b.alive ? d - b.sway / 2 : Infinity;
}

/** Who owns every node. */
export function ownership(body: Body): Ownership {
  const list = brains(body);
  const dist = list.map((b) => distances(body, b.place));
  const self = list.findIndex((b) => b.self);
  const own: Ownership = { brains: list, dist, owner: new Map(), self };
  for (const node of nodeIds(body)) {
    let best = self;
    let bestClaim = self < 0 ? Infinity : claimOf(own, self, node);
    for (let i = 0; i < list.length; i++) {
      if (i === self) continue;
      const claim = claimOf(own, i, node);
      if (claim < bestClaim) {
        best = i;
        bestClaim = claim;
      }
    }
    if (best >= 0) own.owner.set(node, best);
  }
  return own;
}

/** Territories over an ownership already computed. */
export function territoriesOf(body: Body, own: Ownership): Territory[] {
  const out: Territory[] = own.brains.map((brain) => ({ brain, nodes: [], segments: [], border: [] }));
  for (const [node, i] of own.owner) out[i]!.nodes.push(node);
  for (const t of out) t.nodes.sort((x, y) => x - y);
  for (const sid of segmentIds(body)) {
    const s = body.segments[sid]!;
    const a = own.owner.get(s.a);
    const b = own.owner.get(s.b);
    if (a === undefined || b === undefined) continue;
    if (a === b) out[a]!.segments.push(sid);
    else {
      out[a]!.border.push(sid);
      out[b]!.border.push(sid);
    }
  }
  return out;
}

/** One territory per brain, in `brains` order; together they hold every node. */
export function territories(body: Body): Territory[] {
  return territoriesOf(body, ownership(body));
}

export function territoryOf(body: Body, ref: BrainRef): Territory | undefined {
  return territories(body).find((t) => sameRef(t.brain.ref, ref));
}

/** Segments with exactly one end in the brain's territory. */
export function border(body: Body, ref: BrainRef): number[] {
  return territoryOf(body, ref)?.border ?? [];
}

/** Index of the brain whose territory holds the element with your brain, or -1 when it is yours or nobody's. */
export function seizerOf(body: Body, own: Ownership): number {
  const el = selfElement(body);
  const seg = body.segments[el];
  const i = seg === undefined ? own.owner.get(el) : own.owner.get(seg.a) === own.owner.get(seg.b) ? own.owner.get(seg.a) : undefined;
  return i === undefined || i === own.self ? -1 : i;
}

/** Whether the brain's territory has swallowed the element that holds your brain. */
export function seizesBody(body: Body, ref: BrainRef): boolean {
  const own = ownership(body);
  const i = seizerOf(body, own);
  return i >= 0 && sameRef(own.brains[i]!.ref, ref);
}
