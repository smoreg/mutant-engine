import { describe, expect, it } from "vitest";
import {
  HUMAN_IDS,
  SEGMENT_KINDS,
  apply,
  derive,
  distances,
  human,
  mass,
  mutationTargets,
  segmentsAt,
  targets,
  validate,
  type Payload,
  MUTATIONS,
} from "../index.js";
import { layout, silhouetteSvg } from "@mutant-engine/view";

const H = HUMAN_IDS;
const ARM: Payload<"sprout"> = { kind: "arm", length: 1, girth: 1, cover: "skin", ending: { kind: "hand", instability: 0 } };

describe("the human's joints", () => {
  it("three nodes on top: big shoulders, a small neck node; two medium hips below and a small pelvis node", () => {
    const b = human();
    expect(validate(b)).toEqual([]);
    expect(b.nodes[H.shoulderL]!.size).toBe(3);
    expect(b.nodes[H.shoulderR]!.size).toBe(3);
    expect(b.nodes[H.chest]!.size).toBe(1);
    expect(b.nodes[H.hipL]!.size).toBe(2);
    expect(b.nodes[H.hipR]!.size).toBe(2);
    expect(b.nodes[H.pelvis]!.size).toBe(1);
  });

  it("elbows and knees: arm and leg are two segments of 1 each around a joint", () => {
    const b = human();
    for (const [upper, joint, lower, end] of [
      [H.armL, H.elbowL, H.forearmL, H.handL],
      [H.armR, H.elbowR, H.forearmR, H.handR],
      [H.legL, H.kneeL, H.shinL, H.footL],
      [H.legR, H.kneeR, H.shinR, H.footR],
    ] as const) {
      expect(b.segments[upper]!.length).toBe(1);
      expect(b.segments[upper]!.b).toBe(joint);
      expect(b.segments[lower]!.a).toBe(joint);
      expect(b.segments[lower]!.b).toBe(end);
      expect(b.segments[lower]!.length).toBe(1);
    }
    const d = distances(b, b.self);
    expect(d[H.handL]).toBe(d[H.chest]! + 2);
    expect(d[H.footR]).toBe(d[H.pelvis]! + 2);
  });

  it("the penis: a small limb from the pelvis, no joint at its tip, meat grows by its mass", () => {
    const b = human();
    const p = b.segments[H.penis]!;
    expect(p.kind).toBe("penis");
    expect(p.a).toBe(H.pelvis);
    expect(p.length).toBe(1);
    expect(b.nodes[p.b]!.ends).toEqual([]);
    expect(segmentsAt(b, p.b)).toEqual([H.penis]);
    expect(mass(b)).toBeCloseTo(b.meat);
    expect(SEGMENT_KINDS.penis.pain).toBeGreaterThanOrEqual(3);
  });

  it("three sizes: the penis stretches to 3 and no further; at 3 it strikes", () => {
    const b = human(300);
    const stretchable = (): boolean => targets(b, "stretch", { delta: 1 }).some((w) => "segment" in w.target && w.target.segment === H.penis);
    expect(derive(b).attacks.some((a) => a.segment === H.penis)).toBe(false);
    apply(b, "stretch", { delta: 1 }, { segment: H.penis });
    apply(b, "stretch", { delta: 1 }, { segment: H.penis });
    expect(b.segments[H.penis]!.length).toBe(3);
    expect(stretchable()).toBe(false);
    expect(derive(b).attacks.some((a) => a.segment === H.penis)).toBe(true);
  });

  it("the catalog grows it: longer, another one, one out of place - and never on the forehead alone (decision 160)", () => {
    const b = human(300);
    const grow = MUTATIONS.find((m) => m.id === "penisGrowth")!;
    expect(mutationTargets(b, grow).map((w) => w.target)).toEqual([{ segment: H.penis }]);
    expect(MUTATIONS.some((m) => m.id === "extraPenis")).toBe(true);
    // The place is the target rule's: anywhere there is room, the head among the rest, never the tip of the penis (decision 161).
    const elsewhere = MUTATIONS.find((m) => m.id === "penisElsewhere")!;
    const nodes = mutationTargets(b, elsewhere)
      .map((w) => w.target)
      .filter((t) => "node" in t)
      .map((t) => (t as { node: number }).node);
    expect(nodes.length).toBeGreaterThan(3);
    expect(nodes).toContain(H.head);
    expect(nodes).not.toContain(H.penisTip);
    expect(MUTATIONS.every((m) => !("atHead" in m.target))).toBe(true);
  });

  it("a big joint takes bigger things: a sprout is no thicker than the node it grows from", () => {
    const b = human(300);
    const thick: Payload<"sprout"> = { ...ARM, girth: 2 };
    const at = (p: Payload<"sprout">): number[] =>
      targets(b, "sprout", p)
        .filter((w) => "node" in w.target)
        .map((w) => (w.target as { node: number }).node);
    expect(at(thick)).toContain(H.shoulderL);
    expect(at(thick)).not.toContain(H.handL);
    expect(at(ARM)).toContain(H.handL);
  });

  it("the drawing: joints by size, the penis hangs down between the legs, its tip draws no joint", () => {
    const b = human();
    const l = layout(b);
    const at = (id: number) => l.nodes.find((n) => n.id === id)!;
    expect(at(H.shoulderL).r).toBeGreaterThan(at(H.hipL).r);
    expect(at(H.hipL).r).toBeGreaterThan(at(H.chest).r);
    const tip = at(b.segments[H.penis]!.b);
    expect(tip.y).toBeGreaterThan(at(H.pelvis).y);
    expect(Math.abs(tip.x - at(H.pelvis).x)).toBeLessThan(0.3);
    expect(l.collisions).toBe(0);
    const svg = silhouetteSvg(b);
    expect(svg).toContain("seg penis");
  });
});
