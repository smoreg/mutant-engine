/**
 * The three cuts of body-graph.md §12 that take neither an organ nor a part
 * (decisions 1226-1228): a membrane cut off the cycle or the limb it is
 * stretched over, a cover taken off the flesh under it, a fused node parted
 * again. What an organ or a part costs is `strip.ts`; these three reshape the
 * graph instead of emptying it, and say what they did in the shape `strip`
 * answers in, so the stable and the pages read both alike.
 */
import type { Body, CoverId, Membrane } from "./graph.js";
import { cloneBody, makeNode, segmentIds, sortedIds, touch } from "./graph.js";
import { tearMembranes } from "./membrane.js";
import { adjacency } from "./metrics.js";
import { COVERS, segmentMass } from "./parts.js";
import type { Stripped } from "./strip.js";

/** One of the three, and what it is done to. */
export type Reshape = { t: "membrane"; membrane: number } | { t: "cover"; segment: number } | { t: "unfuse"; node: number };

export interface Reshaped extends Stripped {
  /** The covers taken off, segment by segment, with what each one wore. */
  covers: { segment: number; cover: CoverId }[];
  /** The node a fusion parted into; null for the other two. */
  split: number | null;
  /** Where the knife went in: the elements a hand's blow lands on (the stable's `surgery.ts`). */
  marks: number[];
}

/** A fused node and the segments its last fusion brought, the ones a knife parts. */
interface Fusion {
  node: number;
  segments: number[];
}

/**
 * A cover the knife can take off: anything but bare skin, and not chrome,
 * which is iron and a ripper's work. A flank link is no flesh.
 */
function strippable(body: Body, segId: number): boolean {
  const s = body.segments[segId];
  return s !== undefined && s.kind !== "flank" && s.cover !== "skin" && COVERS[s.cover].mutates;
}

/**
 * The segments a cover comes off: the one the knife is on, or - when that
 * cover is creeping over the body - every segment wearing it. A front takes a
 * bare neighbour back in thirty turns, so skinning one segment of it buys
 * nothing; the cut worth making takes the whole cover and stops the front
 * (decision 1227).
 */
export function coverReach(body: Body, segId: number): number[] {
  if (!strippable(body, segId)) return [];
  const cover = body.segments[segId]!.cover;
  if (!(body.fronts ?? []).some((f) => f.cover === cover)) return [segId];
  return segmentIds(body).filter((id) => body.segments[id]!.cover === cover && strippable(body, id));
}

/** Whether every node of the body is reached from `from`. */
function whole(body: Body, from: number): boolean {
  const adj = adjacency(body);
  const seen = new Set<number>([from]);
  const stack = [from];
  while (stack.length > 0) {
    const n = stack.pop()!;
    for (const sid of adj.get(n) ?? []) {
      const s = body.segments[sid]!;
      const o = s.a === n ? s.b : s.a;
      if (seen.has(o)) continue;
      seen.add(o);
      stack.push(o);
    }
  }
  return seen.size === Object.keys(body.nodes).length;
}

/** The segments of the node's last fusion, still there and still ending at it; null when any of them is not. */
function lastFusion(body: Body, id: number): number[] | null {
  const groups = body.nodes[id]?.fused;
  if (groups === undefined || groups.length === 0) return null;
  const last = groups[groups.length - 1]!;
  const there = last.length > 0 && last.every((sid) => {
    const s = body.segments[sid];
    return s !== undefined && (s.a === id || s.b === id);
  });
  return there ? [...last] : null;
}

/** Moves the segments onto a new node and answers its id: the one step of parting a fusion. */
function part(body: Body, node: number, segs: readonly number[]): number {
  const id = body.nextId++;
  body.nodes[id] = makeNode(id, 1);
  for (const sid of segs) {
    const s = body.segments[sid]!;
    if (s.a === node) s.a = id;
    else s.b = id;
  }
  return id;
}

/**
 * Every fused node whose last fusion can be parted: the segments it brought
 * are still there and still end at the node, and parting them leaves one body
 * with a node more, not a piece on the floor (a cut elsewhere may have left
 * the fusion the only bridge). Ascending by node.
 */
export function fusions(body: Body): Fusion[] {
  const out: Fusion[] = [];
  for (const id of sortedIds(body.nodes)) {
    const segs = lastFusion(body, id);
    if (segs === null) continue;
    const probe = cloneBody(body);
    part(probe, id, segs);
    if (whole(probe, id)) out.push({ node: id, segments: segs });
  }
  return out;
}

/** Everything the three can be done to on this body: membranes, then covers, then fusions, each by id. */
export function reshapes(body: Body): Reshape[] {
  const out: Reshape[] = [];
  for (const id of sortedIds(body.membranes)) out.push({ t: "membrane", membrane: id });
  for (const id of segmentIds(body)) if (strippable(body, id)) out.push({ t: "cover", segment: id });
  for (const f of fusions(body)) out.push({ t: "unfuse", node: f.node });
  return out;
}

function empty(): Reshaped {
  return { organs: [], nodes: [], segments: [], membranes: [], lost: 0, vital: [], covers: [], split: null, marks: [] };
}

/**
 * Does one of the three in place and says what it did; a target that is not
 * there any more does nothing and answers empty.
 *
 * - a membrane leaves whole; the segments it hung on stay, and it weighs
 *   nothing (`mass` counts no membrane), so no flesh leaves;
 * - a cover goes back to skin on `coverReach`; what the cover weighed over
 *   skin leaves with it (plates, stone), what it weighed under skin (feathers)
 *   the body makes up as skin, and a front of that cover stops;
 * - a fused node parts: a new node takes the segments the last fusion brought,
 *   the cycle breaks, membranes on it tear, and the endings the fusion ate do
 *   not come back.
 */
export function reshape(body: Body, r: Reshape): Reshaped {
  const out = empty();
  switch (r.t) {
    case "membrane": {
      const m: Membrane | undefined = body.membranes[r.membrane];
      if (m === undefined) return out;
      delete body.membranes[r.membrane];
      out.membranes.push(m);
      touch(body);
      return out;
    }
    case "cover": {
      const reach = coverReach(body, r.segment);
      if (reach.length === 0) return out;
      const cover = body.segments[r.segment]!.cover;
      let delta = 0;
      for (const id of reach) {
        const s = body.segments[id]!;
        const before = segmentMass(s);
        out.covers.push({ segment: id, cover: s.cover });
        s.cover = "skin";
        delta += segmentMass(s) - before;
      }
      body.meat += delta;
      out.lost = Math.max(0, -delta);
      if (body.fronts !== undefined) {
        body.fronts = body.fronts.filter((f) => f.cover !== cover);
        if (body.fronts.length === 0) delete body.fronts;
      }
      out.marks = [...reach];
      touch(body);
      return out;
    }
    case "unfuse": {
      const f = fusions(body).find((x) => x.node === r.node);
      if (f === undefined) return out;
      const before = sortedIds(body.membranes).map((id) => body.membranes[id]!);
      const id = part(body, r.node, f.segments);
      const u = body.nodes[r.node]!;
      u.fused!.pop();
      if (u.fused!.length === 0) delete u.fused;
      const torn = new Set(tearMembranes(body));
      out.membranes.push(...before.filter((m) => torn.has(m.id)));
      out.split = id;
      out.marks = [r.node, id].sort((x, y) => x - y);
      touch(body);
      return out;
    }
  }
}
