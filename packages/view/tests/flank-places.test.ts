import { describe, expect, it } from "vitest";
import {
  BEASTS,
  HUMAN_IDS,
  apply,
  bodyFromText,
  freeSideSlots,
  human,
  segmentIds,
  sideNodesOf,
  targets,
  tier,
  validate,
  type Body,
  type Payload,
} from "@mutant-engine/core";
import { layout, polylineLength, type LengthScale } from "../index.js";

const LEG: Payload<"sprout"> = { kind: "leg", length: 2, girth: 1, cover: "skin", ending: { kind: "foot", instability: 0 } };
const ARM: Payload<"sprout"> = { kind: "arm", length: 2, girth: 1, cover: "skin", ending: { kind: "hand", instability: 0 } };

/** Every torso of the body swollen up to the whale's tier, as far as the operation lets it. */
function bloated(b: Body, upTo = 6): Body {
  b.meat = Math.max(b.meat, 4000);
  for (const id of segmentIds(b)) {
    for (let k = 0; k < 8 && b.segments[id]!.kind === "torso" && tier(b.segments[id]!) < upTo; k++) {
      const t = targets(b, "bloat", {}).find((w) => "segment" in w.target && w.target.segment === id);
      if (t === undefined) break;
      apply(b, "bloat", {}, t.target);
    }
  }
  return b;
}

/** Every free side place of every torso takes a limb, legs and arms by turns. */
function filled(b: Body): Body {
  let k = 0;
  for (const id of segmentIds(b)) {
    if (b.segments[id]!.kind !== "torso") continue;
    for (let guard = 0; guard < 12 && freeSideSlots(b, id) > 0; guard++) {
      const limb = k++ % 3 === 2 ? ARM : LEG;
      if (!targets(b, "sprout", limb).some((w) => "segment" in w.target && w.target.segment === id)) break;
      apply(b, "sprout", limb, { segment: id });
    }
  }
  return b;
}

/** The human's torso swollen to the tier and every side place of it holding a limb. */
function tierBody(t: 3 | 4 | 5 | 6): Body {
  const b = human(4000);
  bloated(b, t);
  expect(tier(b.segments[HUMAN_IDS.torso]!)).toBe(t);
  return filled(b);
}

const BODIES: [string, () => Body][] = [
  ["human", () => human()],
  ["bull", () => tierBody(4)],
  ["elephant", () => tierBody(5)],
  ["whale", () => tierBody(6)],
  ...BEASTS.map((beast) => [beast.id, () => bodyFromText(beast.fixture)] as [string, () => Body]),
  ...BEASTS.map((beast) => [`${beast.id} as a whale`, () => filled(bloated(bodyFromText(beast.fixture)))] as [string, () => Body]),
];

/** Of an even share of its torso's outline, how much two attachment points keep between them at the least. */
const FAIR = 0.6;

/**
 * Pairs of attachment points of one torso that the picture lays on top of
 * each other: two side nodes, or a side node and an end of its host, closer
 * than their two radii. A torso whose outline is too short for all of its
 * points at full size (a whale's tier on a torso of length 1) must still
 * spread them along it: there the bar is a fair part of an even share.
 */
function piled(body: Body, scale: LengthScale): string[] {
  const l = layout(body, { scale });
  const at = new Map(l.nodes.map((n) => [n.id, n]));
  const out: string[] = [];
  for (const id of segmentIds(body)) {
    const s = body.segments[id]!;
    if (s.kind !== "torso") continue;
    const sides = sideNodesOf(body, id);
    const points = [...sides, s.a, s.b];
    const drawn = l.segments.find((sg) => sg.id === id)!;
    // A torso the placement bent into an arc (a ring through it) squeezes its inner side: its side nodes are placed
    // for a straight body, and that is what this checks (decision 1259).
    if (drawn.points.length > 2) continue;
    const share = (FAIR * (2 * polylineLength(drawn.points) + Math.PI * drawn.width)) / points.length;
    for (let i = 0; i < sides.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const p = at.get(points[i]!)!;
        const q = at.get(points[j]!)!;
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        const need = Math.min(p.r + q.r, share);
        if (d < need * (1 - 1e-6)) out.push(`torso ${id} (tier ${tier(s)}): ${points[i]}-${points[j]} ${d.toFixed(3)} < ${need.toFixed(3)}`);
      }
    }
  }
  return out;
}

describe("side nodes of a big torso are laid out apart", () => {
  it("the fixtures of the check: tiers grow the side places, and every one of them holds a limb", () => {
    for (const t of [4, 5, 6] as const) {
      const b = tierBody(t);
      expect(validate(b)).toEqual([]);
      expect(sideNodesOf(b, HUMAN_IDS.torso)).toHaveLength([0, 0, 0, 4, 6, 8, 10][t]!);
    }
  });

  for (const scale of ["linear", "sqrt"] as const) {
    it(`on the ${scale} scale no two attachment points of one torso lie on each other, in every tier and every beast`, () => {
      const bad: string[] = [];
      for (const [name, make] of BODIES) for (const line of piled(make(), scale)) bad.push(`${name}: ${line}`);
      expect(bad).toEqual([]);
    });
  }
});
