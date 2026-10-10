/**
 * Where a blow lands (body-graph.md §10) and what it meets there. A segment
 * is open by length x girth, a torso twice; a node by twice its size, a head
 * one more, an empty joint not at all; a membrane by half its area and it
 * catches the blow first. That is `area`; `weight` is it after the crowd of
 * endings below, and `weight` is what draws the blow. Armor is the cover of
 * the segment, a node wearing the cover of the segment it sits on.
 *
 * This is the only openness there is: `damage.ts` picks the element a blow
 * finds out of these shares, and what a screen reads off `derive` is the same
 * table (decision 590). It used to be two copies of one formula, one of which
 * decided nothing, and tuning the wrong one changed no fight.
 */
import type { Body } from "../graph.js";
import { nodeIds, segmentIds, segmentsAt, sortedIds } from "../graph.js";
import { parentSegment } from "../capability.js";
import { COVERS, endsBulk } from "../parts.js";
import type { Ctx } from "./context.js";

export type PartKind = "node" | "segment" | "membrane";

/**
 * How much of an ending's openness is the crowd it stands in rather than its
 * own size (decision 591). Area alone made a body hide its head by being
 * thick and not by having parts: eleven thick parts on a troll hid its head
 * better than sixteen thin ones on a human. So half of what an ending is worth
 * is its own size and half is one seat at the table, and the more endings, the
 * smaller every seat. At 0 the rule is the old one.
 */
export const CROWD = 0.5;

export interface ExposurePart {
  id: number;
  kind: PartKind;
  /** Area of the part: what a blow aimed at a patch of flesh would find. */
  area: number;
  /** Area and the even share together: what the blow is drawn by. */
  weight: number;
  /** Its share of every blow, the parts summing to 1. */
  share: number;
}

export interface Exposure {
  total: number;
  parts: ExposurePart[];
}

export interface ArmorPart {
  id: number;
  kind: "node" | "segment";
  defense: number;
}

export interface Armor {
  /** Defense weighted by exposure. */
  mean: number;
  parts: ArmorPart[];
}

export function exposure(body: Body): Exposure {
  const raw: { id: number; kind: PartKind; area: number }[] = [];
  for (const id of nodeIds(body)) {
    const n = body.nodes[id]!;
    const heads = n.ends.filter((e) => e.kind === "head").length;
    // A huge ending is more of a target and a small one less (sizes.ts).
    raw.push({ id, kind: "node", area: n.ends.length === 0 ? 0 : Math.max(1, n.size * 2 + heads + endsBulk(n.ends)) });
  }
  for (const id of segmentIds(body)) {
    const s = body.segments[id]!;
    raw.push({ id, kind: "segment", area: s.length * s.girth * (s.kind === "torso" ? 2 : 1) });
  }
  for (const id of sortedIds(body.membranes)) raw.push({ id, kind: "membrane", area: body.membranes[id]!.area / 2 });
  raw.sort((x, y) => x.id - y.id);
  const total = raw.reduce((s, p) => s + p.area, 0);
  // The crowd of endings: what a blow that finds a node finds is split by
  // `CROWD` between the size of the node and the count of them. The flesh -
  // segments and membranes - keeps its plain area, because that is a real
  // surface and a node's is a stand-in. Nodes keep their share of the body
  // between them, so the crowd moves blows from the big ending to the small
  // ones and never from the flesh to the endings.
  const ends = raw.filter((p) => p.kind === "node" && p.area > 0);
  const endArea = ends.reduce((s, p) => s + p.area, 0);
  const even = ends.length > 0 ? (CROWD * endArea) / ends.length : 0;
  const parts = raw.map((p) => {
    const weight = p.area <= 0 ? 0 : p.kind === "node" ? (1 - CROWD) * p.area + even : p.area;
    return { ...p, weight, share: total > 0 ? weight / total : 0 };
  });
  return { total, parts };
}

export function armor(ctx: Ctx, exp: Exposure): Armor {
  const { body } = ctx;
  const parts: ArmorPart[] = [];
  for (const id of nodeIds(body)) {
    const sid = parentSegment(body, id, ctx.dist) ?? segmentsAt(body, id)[0];
    const seg = sid === undefined ? undefined : body.segments[sid];
    parts.push({ id, kind: "node", defense: seg === undefined ? 0 : COVERS[seg.cover].defense });
  }
  for (const id of segmentIds(body)) parts.push({ id, kind: "segment", defense: COVERS[body.segments[id]!.cover].defense });
  parts.sort((x, y) => x.id - y.id);
  const weight = new Map(exp.parts.map((p) => [p.id, p.weight]));
  let sum = 0;
  for (const p of parts) sum += p.defense * (weight.get(p.id) ?? 0);
  return { mean: exp.total > 0 ? sum / exp.total : 0, parts };
}
