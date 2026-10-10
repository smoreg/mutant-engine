/**
 * Blood and food off the graph: where the hearts are, what has no path to
 * one and for how long; which mouths there are and whether each leads to
 * something that digests in its component (body-graph.md §5, hunger.md).
 */
import type { OrganKind } from "../graph.js";
import { nodeIds, segmentIds } from "../graph.js";
import { components, hearts, works } from "../metrics.js";
import { ORGANS, chewsInHead, hasTag } from "../parts.js";
import { endingOf, type Ctx } from "./context.js";

export interface Starving {
  id: number;
  /** Turns without blood so far. */
  ischemia: number;
}

export interface Blood {
  /** Segments whose cavity holds a working heart. */
  hearts: number[];
  starving: Starving[];
}

export interface Mouth {
  node: number;
  /** The ending's position; a jaw names its head. */
  index: number;
  kind: OrganKind;
  /** Something digests in the same component. */
  fed: boolean;
}

export interface Eat {
  can: boolean;
  mouths: Mouth[];
}

export function blood(ctx: Ctx): Blood {
  const { body } = ctx;
  const starving: Starving[] = [];
  const ids = [...nodeIds(body), ...segmentIds(body)].sort((x, y) => x - y);
  for (const id of ids) {
    if (ctx.fedSet.has(id)) continue;
    const el = body.nodes[id] ?? body.segments[id]!;
    starving.push({ id, ischemia: el.ischemia });
  }
  return { hearts: hearts(body), starving };
}

export function eat(ctx: Ctx): Eat {
  const { body } = ctx;
  const digesting = new Map<number, boolean>();
  for (const part of components(body)) {
    let yes = false;
    for (const sid of part.segments) {
      if (!works(body, sid)) continue;
      const s = body.segments[sid]!;
      for (const o of [...s.cavity, ...s.growths]) if (hasTag(o.kind, "digests")) yes = true;
    }
    for (const n of part.nodes) digesting.set(n, yes);
  }
  const mouths: Mouth[] = [];
  for (const cap of ctx.caps) {
    const fed = digesting.get(cap.node) ?? false;
    if (ORGANS[cap.kind].flags?.includes("eat")) mouths.push({ node: cap.node, index: cap.index, kind: cap.kind, fed });
    // A head is one mouth however many jaws it holds: the jaw names it when there is one.
    const chewing = (endingOf(ctx, cap).contents ?? []).filter((c) => chewsInHead(c.kind));
    const jaw = chewing.find((c) => c.kind === "jaw") ?? chewing[0];
    if (jaw !== undefined) mouths.push({ node: cap.node, index: cap.index, kind: jaw.kind, fed });
  }
  return { can: mouths.some((m) => m.fed), mouths };
}
