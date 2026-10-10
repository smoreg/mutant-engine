/**
 * Clean removal (issue #2): organs and elements taken out without a wound or
 * a stump, the way the lab takes back what it grew. Segments that lose an
 * end and whatever no longer reaches your brain go with them. The game's
 * surgery will price it; here it is instant and free.
 */
import type { Body, BodyNode, Membrane, Organ, Segment } from "./graph.js";
import { nodeIds, otherEnd, segmentIds, selfElement, sortedIds, touch } from "./graph.js";
import { tearMembranes } from "./membrane.js";
import { adjacency } from "./metrics.js";
import { isVital, keepSelf, selfHolder } from "./mutation.js";
import { organMass, segmentMass } from "./parts.js";

export interface Stripped {
  /** Organs taken off elements that stay, and every organ of the elements that go. */
  organs: Organ[];
  nodes: BodyNode[];
  segments: Segment[];
  membranes: Membrane[];
  lost: number;
  /** What was vital before it went (`isVital`): a brain, the last heart, mouth, stomach or breath. */
  vital: Organ[];
}

/** Nodes still joined to your brain once the given elements are gone; with your brain gone, to the first node left. */
function reached(body: Body, gone: ReadonlySet<number>): Set<number> {
  const selfId = selfElement(body);
  const selfSeg = body.segments[selfId];
  const alive = nodeIds(body).filter((id) => !gone.has(id));
  const start = !gone.has(selfId) && body.nodes[selfId] !== undefined ? selfId : selfSeg !== undefined && !gone.has(selfId) ? selfSeg.a : alive[0];
  const seen = new Set<number>();
  if (start === undefined || gone.has(start)) return seen;
  const adj = adjacency(body);
  const stack = [start];
  seen.add(start);
  while (stack.length > 0) {
    const n = stack.pop()!;
    for (const sid of adj.get(n) ?? []) {
      if (gone.has(sid)) continue;
      const o = otherEnd(body.segments[sid]!, n);
      if (gone.has(o) || seen.has(o)) continue;
      seen.add(o);
      stack.push(o);
    }
  }
  return seen;
}

/** Takes out the picked organs (inside heads too) and the given elements, with everything they held and everything hanging beyond them. */
export function strip(body: Body, pick: (o: Organ) => boolean, elements: Iterable<number>): Stripped {
  const gone = new Set(elements);
  const keep = reached(body, gone);
  const dropNodes = nodeIds(body).filter((id) => !keep.has(id));
  const dropSegments = segmentIds(body).filter((id) => {
    const s = body.segments[id]!;
    return gone.has(id) || !keep.has(s.a) || !keep.has(s.b);
  });
  const out: Stripped = { organs: [], nodes: [], segments: [], membranes: [], lost: 0, vital: [] };
  const picked: { list: Organ[]; organ: Organ }[] = [];
  const walk = (list: Organ[]): void => {
    for (const o of list) {
      if (pick(o)) picked.push({ list, organ: o });
      else if (o.contents !== undefined) walk(o.contents);
    }
  };
  for (const id of nodeIds(body)) if (keep.has(id)) walk(body.nodes[id]!.ends);
  for (const id of segmentIds(body)) {
    if (dropSegments.includes(id)) continue;
    walk(body.segments[id]!.cavity);
    walk(body.segments[id]!.growths);
  }
  for (const id of dropSegments) {
    const s = body.segments[id]!;
    out.segments.push(s);
    out.lost += segmentMass(s);
    out.organs.push(...s.cavity, ...s.growths);
  }
  for (const id of dropNodes) {
    out.nodes.push(body.nodes[id]!);
    out.organs.push(...body.nodes[id]!.ends);
  }
  out.organs.push(...picked.map((p) => p.organ));
  // ponytail: each organ is judged alone on the body as it was; two hearts taken at once are not "the last heart". Judge the body after, if that bites.
  for (const o of out.organs) {
    out.lost += organMass(o);
    if (isVital(body, o)) out.vital.push(o);
  }
  const selfId = selfElement(body);
  const me = dropNodes.includes(selfId) || dropSegments.includes(selfId) ? null : selfHolder(body);
  for (const { list, organ } of picked) list.splice(list.indexOf(organ), 1);
  for (const id of dropSegments) delete body.segments[id];
  for (const id of dropNodes) delete body.nodes[id];
  for (const id of sortedIds(body.membranes)) {
    if (!gone.has(id)) continue;
    out.membranes.push(body.membranes[id]!);
    delete body.membranes[id];
  }
  tearMembranes(body);
  if (body.regrowth !== undefined) body.regrowth = body.regrowth.filter((r) => body.nodes[r.at] !== undefined);
  keepSelf(body, me);
  body.meat -= out.lost;
  touch(body);
  return out;
}

