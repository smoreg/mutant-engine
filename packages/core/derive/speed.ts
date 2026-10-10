/**
 * Speed from the stands of the body: their level, the length of the leg
 * under each, a ring that rolls, and ever less from every stand past the
 * fourth; the stands past the human's give as the root of their share. Then
 * the load: a body heavier than the human, or than its stands hold at his
 * measure, goes slower as the root of the share it carries (decisions 1261,
 * 1290, 1291). A human on two legs of two is 100 (F-derived.md, body-graph.md §9).
 */
import type { OrganKind } from "../graph.js";
import { segmentIds } from "../graph.js";
import { cycleNodes, simpleCycles } from "../membrane.js";
import { closure } from "../metrics.js";
import { HUMAN_MASS, ORGANS, weight } from "../parts.js";
import { chainOf, running, type Ctx } from "./context.js";

/** Stands that count in full; the k-th past them counts half of the one before. */
export const FULL_STANDS = 4;
/** The human's support: two stands of 3 on legs of 2. */
export const BASE_SUPPORT = 6;
export const BASE_SPEED = 100;
/** A ring of this many segments with stands on it rolls. */
export const RING_MIN = 6;
export const RING_MAX = 12;
/** Stands a ring needs on its nodes to be a rim. */
export const RING_STANDS = 3;
export const RING_FACTOR = 1.5;
/**
 * A body with no stand still gets somewhere when it is built to crawl
 * (decision 1238): a belly or a tail this long to throw in waves, or tentacles
 * in suckers to pull itself along. A crawl of `CRAWL_LENGTH` is a quarter of a
 * human's walk; a longer one is faster, as the root of its length (decision 1261),
 * and a heavier one slower, as a walker is (decision 1290).
 */
export const CRAWL_SPEED = 25;
/** Mass one unit of support carries at full speed: the human's 101 on his 6 (the support need of needs.ts reads the same measure). */
export const LOAD_PER_SUPPORT = HUMAN_MASS / BASE_SUPPORT;
export const CRAWL_LENGTH = 4;
export const CRAWL_TENTACLES = 2;

export interface Stand {
  node: number;
  index: number;
  kind: OrganKind;
  /** Ending plus segment kind (§3): a foot on a leg is 3. */
  level: number;
  /** Length of the leg: the chain from the nearest torso, at least 1. */
  length: number;
  segment: number | null;
  onRing: boolean;
}

export interface Speed {
  value: number;
  /** Sum of the stands' contributions after the diminishing past the fourth; 6 for a human. */
  support: number;
  ring: boolean;
  stands: Stand[];
  /** No stand, and the body crawls: `value` is `crawlSpeed` under the load. */
  crawl: boolean;
  /** What the load leaves of the speed, 0..1: the root of what the body carries at full speed over its weight (`burdenOf`). */
  burden: number;
}

/**
 * What the acid of the muscles takes below its top (breath.md §3, decision
 * 1302): from 30 a point off every blow a muscle swings, from 50 a tenth of
 * the speed and a point of pain a turn, from 70 two points and a fifth. At 100
 * the muscles refuse (`winded` of damage.ts); this is the road there. The body
 * does not know its acid - the one who holds its harm asks here.
 */
export function acidToll(acid: number | undefined): { damage: number; speed: number; burn: number } {
  const a = acid ?? 0;
  return { damage: a >= 70 ? 2 : a >= 30 ? 1 : 0, speed: a >= 70 ? 0.8 : a >= 50 ? 0.9 : 1, burn: a >= 50 ? 1 : 0 };
}

/** A leg of 2 is the unit; longer legs stride further, shorter ones less. What the longer leg weighs the load takes back (`burdenOf`). */
export function lengthFactor(length: number): number {
  return (Math.max(1, length) + 2) / 4;
}

/**
 * What the load leaves of the speed: all of it while the body weighs no more
 * than it carries at full speed, then the square root of the share it carries.
 * It carries what its stands hold at the human's measure, and never more than
 * the human's own weight (decision 1291): stands that give the speed do not
 * also take the weight off it. A body with no stand lies on the ground, which
 * holds it, and carries the human's weight (decision 1290).
 */
export function burdenOf(support: number | null, bodyWeight: number): number {
  const carried = support === null ? HUMAN_MASS : Math.min(HUMAN_MASS, support * LOAD_PER_SUPPORT);
  return bodyWeight <= 0 ? 1 : Math.min(1, Math.sqrt(carried / bodyWeight));
}

/** The stride of the stands: the support over the human's, and past his the root of it (decision 1291) - more legs and bigger hooves give ever less. */
export function strideOf(support: number): number {
  const share = support / BASE_SUPPORT;
  return share <= 1 ? share : Math.sqrt(share);
}

/** The nodes of the ring the stands roll on: the cycle of 6..12 segments with the most stands, three at least. */
function ringNodes(ctx: Ctx, standNodes: number[]): Set<number> | null {
  if (standNodes.length < RING_STANDS || closure(ctx.body) === 0) return null;
  let best: number[] | null = null;
  let bestCount = 0;
  for (const cycle of simpleCycles(ctx.body, RING_MAX)) {
    if (cycle.length < RING_MIN) continue;
    const nodes = cycleNodes(ctx.body, cycle);
    if (nodes === null) continue;
    const count = standNodes.filter((n) => nodes.includes(n)).length;
    if (count >= RING_STANDS && count > bestCount) {
      best = nodes;
      bestCount = count;
    }
  }
  return best === null ? null : new Set(best);
}

/** Segments a body pushes against the ground with when it has nothing to stand on (decision 1309). */
const PUSHERS = new Set(["arm", "leg", "tail"]);

/**
 * A long belly or tail, or tentacles that pull - in suckers, or ending in a
 * pseudopod that pushes (decision 1279): the body crawls without a stand (decision 1238).
 * Built to crawl or not, a working arm, leg or tail drags the body along
 * (`crawlSpeed` makes that slow, decision 1309); a tentacle pulls only as
 * 1279 says - a jellyfish's threads have nothing to push with.
 */
export function crawls(ctx: Ctx): boolean {
  return crawlBuilt(ctx) || segmentIds(ctx.body).some((id) => running(ctx, id) && PUSHERS.has(ctx.body.segments[id]!.kind));
}

/** The body is built to crawl: a belly or a tail to throw in waves, or tentacles that pull. */
function crawlBuilt(ctx: Ctx): boolean {
  let tentacles = 0;
  for (const id of segmentIds(ctx.body)) {
    if (!running(ctx, id)) continue;
    const s = ctx.body.segments[id]!;
    if ((s.kind === "torso" || s.kind === "tail") && s.length >= CRAWL_LENGTH) return true;
    if (s.kind === "tentacle" && s.cover === "suckers") tentacles += 1;
  }
  for (const cap of ctx.caps) {
    if (cap.segment === null || cap.segmentKind !== "tentacle" || cap.cover === "suckers" || !running(ctx, cap.segment)) continue;
    if ((ORGANS[cap.kind].flags ?? []).includes("squeeze")) tentacles += 1;
  }
  return tentacles >= CRAWL_TENTACLES;
}

/**
 * A crawl goes by the length of the belly and the tails that throw it in
 * waves, as the root of it over `CRAWL_LENGTH` (decision 1261); tentacles that
 * pull count as that length. A body that only drags itself on its limbs has
 * nothing but its short belly to throw, so the same root gives it less: a man
 * on his arms crawls at a fifth of his walk (decision 1309).
 */
export function crawlSpeed(ctx: Ctx): number {
  let length = 0;
  for (const id of segmentIds(ctx.body)) {
    if (!running(ctx, id)) continue;
    const s = ctx.body.segments[id]!;
    if (s.kind === "torso" || s.kind === "tail") length += s.length;
  }
  const throws = crawlBuilt(ctx) ? Math.max(CRAWL_LENGTH, length) : Math.max(1, length);
  return Math.round(CRAWL_SPEED * Math.sqrt(throws / CRAWL_LENGTH));
}

export function speed(ctx: Ctx): Speed {
  const stands: Stand[] = [];
  for (const cap of ctx.caps) {
    if (cap.stand <= 0) continue;
    const chain = chainOf(ctx, cap.node);
    stands.push({ node: cap.node, index: cap.index, kind: cap.kind, level: cap.stand, length: Math.max(1, chain.length), segment: cap.segment, onRing: false });
  }
  const ring = ringNodes(
    ctx,
    stands.map((s) => s.node),
  );
  if (ring !== null) for (const s of stands) s.onRing = ring.has(s.node);
  const contributions = stands.map((s) => s.level * lengthFactor(s.length)).sort((x, y) => y - x);
  let support = 0;
  contributions.forEach((c, i) => {
    support += i < FULL_STANDS ? c : c * Math.pow(0.5, i - FULL_STANDS + 1);
  });
  const crawl = stands.length === 0 && crawls(ctx);
  const burden = burdenOf(crawl ? null : support, weight(ctx.body));
  const value = Math.round(burden * (crawl ? crawlSpeed(ctx) : BASE_SPEED * strideOf(support) * (ring !== null ? RING_FACTOR : 1)));
  return { value, support, ring: ring !== null, stands, crawl, burden };
}
