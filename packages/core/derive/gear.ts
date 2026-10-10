/**
 * Gear finds its place in the graph by pattern (body-graph.md §13): a thing
 * of one to three elements the body must have. The patterns are data; one
 * matcher reads them. Several matches are listed by id, the player picks.
 */
import type { Body, OrganKind } from "../graph.js";
import { nodeIds, segmentIds, segmentsAt } from "../graph.js";
import { membranesOn } from "../membrane.js";

export type GearPatternId = "glove" | "boot" | "helmet" | "vest" | "backpack" | "belt" | "holster";

export interface EndingPattern {
  kinds: OrganKind[];
  /** The node holding the ending is no larger. */
  maxNodeSize?: number;
  /** For a head: eyes inside, at most. */
  maxEyes?: number;
}

export interface TorsoPattern {
  minGirth?: number;
  maxGirth?: number;
  /** One end of the torso is a girdle: this many other segments leave it. */
  girdle?: [number, number];
  /** No membrane may run through the torso. */
  bare?: boolean;
}

export interface GearPattern {
  id: GearPatternId;
  ru: string;
  ending?: EndingPattern;
  torso?: TorsoPattern;
}

export const GEAR_PATTERNS: readonly GearPattern[] = [
  { id: "glove", ru: "перчатка", ending: { kinds: ["hand", "pseudopod"] } },
  { id: "boot", ru: "сапог", ending: { kinds: ["foot"] } },
  { id: "helmet", ru: "шлем", ending: { kinds: ["head"], maxNodeSize: 2, maxEyes: 4 } },
  { id: "vest", ru: "бронежилет", torso: { girdle: [2, 4], maxGirth: 3, bare: true } },
  { id: "backpack", ru: "рюкзак", torso: { minGirth: 2, bare: true } },
  { id: "belt", ru: "ремень", torso: {} },
  { id: "holster", ru: "кобура", torso: {} },
];

export interface GearMatch {
  pattern: GearPatternId;
  node?: number;
  index?: number;
  segment?: number;
}

const EYES = new Set<OrganKind>(["eye", "facetEye"]);

/** Every place every pattern fits, pattern by pattern, places by id. */
export function gearMatches(body: Body, patterns: readonly GearPattern[] = GEAR_PATTERNS): GearMatch[] {
  const out: GearMatch[] = [];
  for (const p of patterns) {
    if (p.ending !== undefined) {
      const e = p.ending;
      for (const id of nodeIds(body)) {
        const n = body.nodes[id]!;
        if (e.maxNodeSize !== undefined && n.size > e.maxNodeSize) continue;
        n.ends.forEach((o, index) => {
          if (!e.kinds.includes(o.kind)) return;
          if (e.maxEyes !== undefined && (o.contents ?? []).filter((c) => EYES.has(c.kind)).length > e.maxEyes) return;
          out.push({ pattern: p.id, node: id, index });
        });
      }
    }
    if (p.torso !== undefined) {
      const t = p.torso;
      for (const id of segmentIds(body)) {
        const s = body.segments[id]!;
        if (s.kind !== "torso") continue;
        if (t.minGirth !== undefined && s.girth < t.minGirth) continue;
        if (t.maxGirth !== undefined && s.girth > t.maxGirth) continue;
        if (t.bare && membranesOn(body, id).length > 0) continue;
        if (t.girdle !== undefined) {
          const [lo, hi] = t.girdle;
          const girdle = [s.a, s.b].some((n) => {
            const others = segmentsAt(body, n).length - 1;
            return others >= lo && others <= hi;
          });
          if (!girdle) continue;
        }
        out.push({ pattern: p.id, segment: id });
      }
    }
  }
  return out;
}
