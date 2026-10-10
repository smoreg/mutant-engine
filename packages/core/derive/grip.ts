/**
 * Grips: every ending that holds anything, with its level from the three
 * parts of body-graph.md §3. Precise grips (2) load and fire guns (gear.md).
 */
import type { OrganKind } from "../graph.js";
import type { Ctx } from "./context.js";

export interface Grip {
  node: number;
  index: number;
  kind: OrganKind;
  /** 1 rough, 2 precise. */
  level: number;
  segment: number | null;
}

export interface Grips {
  list: Grip[];
  /** Grips of level 2. */
  precise: number;
  total: number;
}

export function grips(ctx: Ctx): Grips {
  const list: Grip[] = [];
  for (const cap of ctx.caps) {
    if (cap.grip <= 0) continue;
    list.push({ node: cap.node, index: cap.index, kind: cap.kind, level: cap.grip, segment: cap.segment });
  }
  return { list, precise: list.filter((g) => g.level >= 2).length, total: list.length };
}
