/**
 * A capability is assembled from three parts (body-graph.md §3): the ending,
 * the kind of the segment it sits on, and that segment's cover. Content is
 * three tables in parts.ts; the combinations come out by themselves - a hand
 * on a tentacle in slime grips nothing, a mouth on a tentacle in suckers
 * climbs and eats, a pincer on a torso has the cavity at hand.
 *
 * The segment an ending sits on is the one leading toward your brain: for a
 * tip that is its only segment, for a joint the one on the shortest path.
 */
import type { Body, CoverId, OrganKind, SegmentKind } from "./graph.js";
import { nodeIds, otherEnd, segmentIds } from "./graph.js";
import { distances } from "./metrics.js";
import { holds, waterThrust } from "./derive/locomotion.js";
import { COVERS, SEGMENT_KINDS, TENTACLE_REACH_LENGTH, chewsInHead, hasTag, specOf, type CapFlag } from "./parts.js";

export interface EndingCapability {
  node: number;
  index: number;
  kind: OrganKind;
  /** The segment it sits on, null at the node your brain is in. */
  segment: number | null;
  segmentKind: SegmentKind | null;
  cover: CoverId | null;
  /** 0..2 */
  grip: number;
  stand: number;
  dig: number;
  /** Cells it reaches: 1, or 2 on a tentacle of length 4+. */
  reach: number;
  climb: boolean;
  swim: boolean;
  /** A mouth with a stomach somewhere in the body. */
  eat: boolean;
  /** The ending sits on a torso: its cavity is at hand. */
  cavity: boolean;
  attack: string;
  flags: CapFlag[];
}

interface Capabilities {
  endings: EndingCapability[];
  /** Every grip above 0, strongest first. */
  grips: number[];
  /** Sum over every stand of the body. */
  stand: number;
  /** The best digging, when the diggers move the body (decision 1279). */
  dig: number;
  reach: number;
  /** Climbing and swimming of the body, its weight weighed: `holds` of derive/locomotion.ts, the one answer. */
  climb: boolean;
  swim: boolean;
  eat: boolean;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** The segment through which the node is reached from your brain, by ascending id among ties. */
export function parentSegment(body: Body, nodeId: number, dist: Record<number, number> = distances(body, body.self)): number | null {
  if (!("node" in body.self)) {
    const s = body.segments[body.self.segment];
    if (s !== undefined && (s.a === nodeId || s.b === nodeId)) return s.id;
  }
  const d = dist[nodeId];
  if (d === undefined || d === 0) return null;
  for (const sid of segmentIds(body)) {
    const s = body.segments[sid]!;
    if (s.a !== nodeId && s.b !== nodeId) continue;
    const from = dist[otherEnd(s, nodeId)];
    if (from !== undefined && Math.abs(from + s.length - d) < 1e-9) return sid;
  }
  return null;
}

function bodyDigests(body: Body): boolean {
  for (const id of segmentIds(body)) for (const o of body.segments[id]!.cavity) if (hasTag(o.kind, "digests")) return true;
  return false;
}

export function endingCapability(body: Body, nodeId: number, index: number, dist?: Record<number, number>, digests = bodyDigests(body)): EndingCapability {
  const node = body.nodes[nodeId];
  const o = node?.ends[index];
  if (node === undefined || o === undefined) throw new Error(`endingCapability: no ending ${index} at node ${nodeId}`);
  // The organ's own row at its size step: a huge pincer grips, digs and strikes as the huge row says.
  const spec = specOf(o);
  const segId = parentSegment(body, nodeId, dist);
  const seg = segId === null ? undefined : body.segments[segId];
  const kind = seg === undefined ? null : SEGMENT_KINDS[seg.kind];
  const cover = seg === undefined ? null : COVERS[seg.cover];
  const flags = new Set<CapFlag>([...(spec.flags ?? []), ...(kind?.flags ?? []), ...(cover?.flags ?? [])]);
  // Pads anywhere on the limb hold the ending that limb carries, up to the torso (decision 1279).
  for (const f of limbPads(body, nodeId, segId, dist ?? distances(body, body.self))) flags.add(f);
  // A tentacle takes a grip point away, except under suckers.
  const kindGrip = seg?.kind === "tentacle" && seg.cover === "suckers" ? 0 : (kind?.grip ?? 0);
  const grip = clamp((spec.grip ?? 0) + kindGrip + (cover?.grip ?? 0), 0, 2);
  const stand = Math.max(0, (spec.stand ?? 0) + (kind?.stand ?? 0));
  const dig = seg?.kind === "stalk" ? 0 : (spec.dig ?? 0);
  const reach = seg?.kind === "tentacle" && seg.length >= TENTACLE_REACH_LENGTH ? 2 : 1;
  const climb = flags.has("climb") && !flags.has("noClimb");
  return {
    node: nodeId,
    index,
    kind: o.kind,
    segment: segId,
    segmentKind: seg?.kind ?? null,
    cover: seg?.cover ?? null,
    grip: spec.grip === undefined ? 0 : grip,
    stand: spec.stand === undefined ? 0 : stand,
    dig,
    reach,
    climb,
    swim: flags.has("swim"),
    eat: flags.has("eat") && digests,
    cavity: seg?.kind === "torso",
    attack: spec.attack ?? "",
    flags: [...flags].sort(),
  };
}

/** What the climbing covers of the limb from the segment up to the torso add to its ending. */
function limbPads(body: Body, nodeId: number, segId: number | null, dist: Record<number, number>): CapFlag[] {
  const out: CapFlag[] = [];
  let at = nodeId;
  let sid = segId;
  // A flank has no length, so two nodes can stand at one distance: a segment is walked once.
  const seen = new Set<number>();
  while (sid !== null && !seen.has(sid)) {
    seen.add(sid);
    const s = body.segments[sid];
    if (s === undefined || s.kind === "torso") break;
    const flags = COVERS[s.cover].flags;
    if (flags.includes("climb")) out.push(...flags);
    at = otherEnd(s, at);
    sid = parentSegment(body, at, dist);
  }
  return out;
}

/** Every ending of the body with what it can do, by node id then position, and the body's totals. */
export function capabilities(body: Body): Capabilities {
  const dist = distances(body, body.self);
  const digests = bodyDigests(body);
  const endings: EndingCapability[] = [];
  for (const id of nodeIds(body)) {
    body.nodes[id]!.ends.forEach((_, index) => endings.push(endingCapability(body, id, index, dist, digests)));
  }
  const grips = endings.map((e) => e.grip).filter((g) => g > 0).sort((x, y) => y - x);
  let stand = 0;
  let reach = 1;
  for (const e of endings) {
    stand += e.stand;
    reach = Math.max(reach, e.reach);
  }
  const h = holds(body, endings);
  return {
    endings,
    grips,
    stand,
    dig: h.dig,
    reach,
    climb: h.climb,
    swim: h.swim,
    eat: endings.some((e) => e.eat) || (digests && hasJaw(body)),
  };
}

/** What pushes the body through water, every ending weighed (decision 1316). */
export function swimThrust(body: Body): number {
  return waterThrust(body, capabilities(body).endings);
}

/** A jaw inside a head eats like a mouth does: any jaw of the head (`chewsInHead`, decision 1235). */
function hasJaw(body: Body): boolean {
  for (const id of nodeIds(body)) for (const e of body.nodes[id]!.ends) if (e.contents?.some((c) => chewsInHead(c.kind))) return true;
  return false;
}
