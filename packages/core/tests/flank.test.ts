import { describe, expect, it } from "vitest";
import { LabRng as Rng } from "../rng.js";
import {
  HUMAN_IDS,
  apply,
  bodyFromText,
  bodyToText,
  cavitySlots,
  derive,
  distances,
  flankHost,
  flanksOf,
  freeSideSlots,
  growthSlots,
  human,
  mass,
  segmentIds,
  sideNodesOf,
  sideSlots,
  targets,
  tier,
  validate,
  type Body,
  type Payload,
  MUTATIONS,
  applyMutation,
  drawMutation,
} from "../index.js";
import { layout, silhouetteSvg } from "@mutant-engine/view";

const LEG: Payload<"sprout"> = { kind: "leg", length: 2, girth: 1, cover: "skin", ending: { kind: "foot", instability: 0 } };
const SPINES = { kind: "spines", instability: 0 } as const;

/** The human's torso swollen `times` over, with meat to spare. */
function swollen(times: number, meat = 1000): Body {
  const b = human(meat);
  for (let i = 0; i < times; i++) {
    const t = targets(b, "bloat", {}).find((w) => "segment" in w.target && w.target.segment === HUMAN_IDS.torso)!;
    apply(b, "bloat", {}, t.target);
  }
  return b;
}

describe("side nodes", () => {
  it("the human: the chest holds the neck and the torso, shoulders and hips are side nodes of the torso", () => {
    const b = human();
    expect(validate(b)).toEqual([]);
    expect(sideNodesOf(b, HUMAN_IDS.torso)).toEqual([HUMAN_IDS.shoulderL, HUMAN_IDS.shoulderR, HUMAN_IDS.hipL, HUMAN_IDS.hipR]);
    expect(b.segments[HUMAN_IDS.armL]!.a).toBe(HUMAN_IDS.shoulderL);
    expect(b.segments[HUMAN_IDS.legR]!.a).toBe(HUMAN_IDS.hipR);
    const atChest = segmentIds(b).filter((id) => [b.segments[id]!.a, b.segments[id]!.b].includes(HUMAN_IDS.chest) && b.segments[id]!.kind !== "flank");
    expect(atChest).toEqual([HUMAN_IDS.neck, HUMAN_IDS.torso]);
    expect(freeSideSlots(b, HUMAN_IDS.torso)).toBe(0);
  });

  it("a flank weighs nothing and adds no nerve: the hand is as far from the brain as before, mass is the meat", () => {
    const b = human();
    expect(mass(b)).toBeCloseTo(b.meat);
    const d = distances(b, b.self);
    expect(d[HUMAN_IDS.shoulderL]).toBe(d[HUMAN_IDS.chest]);
    expect(d[HUMAN_IDS.handL]).toBe(d[HUMAN_IDS.chest]! + 2);
    expect(d[HUMAN_IDS.hipR]).toBe(d[HUMAN_IDS.pelvis]);
  });

  it("the text round-trips with flanks", () => {
    const b = human();
    const text = bodyToText(b);
    expect(text).toContain("~бок:0/1 кожа~");
    expect(bodyToText(bodyFromText(text))).toBe(text);
  });

  it("tiers: limb 1, every torso the human's 3 or more, bull 4, elephant 5, whale 6; side nodes 1 4 6 8 10", () => {
    const b = swollen(0);
    expect(tier(b.segments[HUMAN_IDS.armL]!)).toBe(1);
    expect(sideSlots(b.segments[HUMAN_IDS.armL]!)).toBe(1);
    expect(tier(b.segments[HUMAN_IDS.torso]!)).toBe(3);
    const slots = [1, 2, 3].map((n) => sideSlots(swollen(n).segments[HUMAN_IDS.torso]!));
    expect(slots).toEqual([6, 8, 10]);
    // A thickened limb is a torso like any other: four places, not a pair (decision 220).
    const torso = b.segments[HUMAN_IDS.torso]!;
    expect(sideSlots({ ...torso, girth: 2 })).toBe(4);
    expect(sideSlots({ ...torso, girth: 1 })).toBe(4);
    // Length counts as well as girth: a torso six units long on a limb's girth is a bull's.
    expect(tier({ ...torso, length: 4, girth: 2 })).toBe(3);
    expect(tier({ ...torso, length: 6, girth: 2 })).toBe(4);
    expect(tier({ ...torso, length: 6, girth: 6 })).toBe(6);
  });

  it("a flank is never the target of an operation", () => {
    const b = swollen(1);
    const flanks = new Set(segmentIds(b).filter((id) => b.segments[id]!.kind === "flank"));
    for (const op of ["stretch", "cover", "thicken", "joint", "double", "split", "engulf"] as const) {
      const payload = op === "stretch" ? { delta: 1 } : op === "cover" ? { cover: "chitin" } : op === "joint" ? { ending: null } : {};
      for (const w of targets(b, op, payload as never)) if ("segment" in w.target) expect(flanks.has(w.target.segment)).toBe(false);
    }
  });

  it("the bull grows a new pair of side nodes at one end, left then right, and a limb from each", () => {
    const b = swollen(1);
    expect(freeSideSlots(b, HUMAN_IDS.torso)).toBe(2);
    expect(targets(b, "sprout", LEG).some((w) => "segment" in w.target && w.target.segment === HUMAN_IDS.torso)).toBe(true);
    const before = flanksOf(b, HUMAN_IDS.torso);
    apply(b, "sprout", LEG, { segment: HUMAN_IDS.torso });
    apply(b, "sprout", LEG, { segment: HUMAN_IDS.torso });
    const added = flanksOf(b, HUMAN_IDS.torso).filter((f) => !before.includes(f));
    expect(added).toHaveLength(2);
    expect(new Set(added.map((f) => b.segments[f]!.a)).size).toBe(1);
    expect(freeSideSlots(b, HUMAN_IDS.torso)).toBe(0);
    expect(targets(b, "sprout", LEG).some((w) => "segment" in w.target && w.target.segment === HUMAN_IDS.torso)).toBe(false);
    expect(validate(b)).toEqual([]);
    // On opposite sides of the torso's line, whichever way that line runs: a torso on four legs lies along the ground (decision 120).
    const l = layout(b);
    const at = (id: number) => l.nodes.find((n) => n.id === id)!;
    const torso = l.segments.find((sg) => sg.id === HUMAN_IDS.torso)!;
    const axis = { x: torso.points[torso.points.length - 1]!.x - torso.points[0]!.x, y: torso.points[torso.points.length - 1]!.y - torso.points[0]!.y };
    const side = (f: number): number => {
      const n = at(b.segments[f]!.b);
      const root = at(b.segments[f]!.a);
      return Math.sign(axis.x * (n.y - root.y) - axis.y * (n.x - root.x));
    };
    expect(side(added[0]!)).toBe(-side(added[1]!));
  });

  it("a limb holds one side node, from the middle of it", () => {
    const b = human(200);
    expect(freeSideSlots(b, HUMAN_IDS.armL)).toBe(1);
    const sprout: Payload<"sprout"> = { kind: "arm", length: 1, girth: 1, cover: "skin", ending: { kind: "hand", instability: 0 } };
    apply(b, "sprout", sprout, { segment: HUMAN_IDS.armL });
    expect(freeSideSlots(b, HUMAN_IDS.armL)).toBe(0);
    const [f] = flanksOf(b, HUMAN_IDS.armL);
    expect(flankHost(b, f!)).toBe(HUMAN_IDS.armL);
    expect(validate(b)).toEqual([]);
  });

  it("a limb holds one organ inside and two growths, three from length 3", () => {
    const b = human(300);
    const arm = b.segments[HUMAN_IDS.armL]!;
    expect(cavitySlots(arm)).toBe(1);
    expect(growthSlots(arm)).toBe(2);
    expect(growthSlots({ ...arm, length: 3 })).toBe(3);
    const organTargets = (): number[] =>
      targets(b, "organ", { organ: { kind: "gland", instability: 0 }, mount: "cavity" })
        .filter((w) => "segment" in w.target)
        .map((w) => (w.target as { segment: number }).segment);
    expect(organTargets()).toContain(HUMAN_IDS.armL);
    apply(b, "organ", { organ: { kind: "gland", instability: 0 }, mount: "cavity" }, { segment: HUMAN_IDS.armL });
    expect(organTargets()).not.toContain(HUMAN_IDS.armL);
    const growthTargets = (): number[] =>
      targets(b, "organ", { organ: SPINES, mount: "growth" })
        .filter((w) => "segment" in w.target)
        .map((w) => (w.target as { segment: number }).segment);
    apply(b, "organ", { organ: SPINES, mount: "growth" }, { segment: HUMAN_IDS.armR });
    expect(growthTargets()).toContain(HUMAN_IDS.armR);
    apply(b, "organ", { organ: SPINES, mount: "growth" }, { segment: HUMAN_IDS.armR });
    expect(growthTargets()).not.toContain(HUMAN_IDS.armR);
    expect(validate(b)).toEqual([]);
  });

  it("the drawing: side nodes sit on the torso's outline, shoulders at its top on both sides; flanks are not drawn", () => {
    const b = human();
    const l = layout(b);
    const at = (id: number) => l.nodes.find((n) => n.id === id)!;
    const torso = l.segments.find((s) => s.id === HUMAN_IDS.torso)!;
    // On the outline: half a width from the torso's spine, which since decision 1259 may be on its round cap.
    const spine = torso.points;
    const fromSpine = (p: { x: number; y: number }): number => {
      let best = Infinity;
      for (let i = 1; i < spine.length; i++) {
        const a = spine[i - 1]!;
        const c = spine[i]!;
        const ex = c.x - a.x;
        const ey = c.y - a.y;
        const k = Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey) / Math.max(1e-12, ex * ex + ey * ey)));
        best = Math.min(best, Math.hypot(p.x - (a.x + ex * k), p.y - (a.y + ey * k)));
      }
      return best;
    };
    for (const id of [HUMAN_IDS.shoulderL, HUMAN_IDS.shoulderR, HUMAN_IDS.hipL, HUMAN_IDS.hipR]) {
      expect(Math.abs(fromSpine(at(id)) - torso.width / 2)).toBeLessThan(1e-6);
    }
    expect(at(HUMAN_IDS.shoulderL).x).toBeLessThan(0);
    expect(at(HUMAN_IDS.shoulderR).x).toBeGreaterThan(0);
    expect(at(HUMAN_IDS.shoulderL).y).toBeLessThan(at(HUMAN_IDS.hipL).y);
    expect(at(HUMAN_IDS.handL).x).toBeLessThan(at(HUMAN_IDS.shoulderL).x);
    expect(l.collisions).toBe(0);
    const svg = silhouetteSvg(b);
    expect(svg).not.toContain("seg flank");
    expect(svg).toContain("flank-outline");
  });

  it("derived numbers do not see the flanks: reach and speed of the human hold", () => {
    const d = derive(human());
    expect(d.speed.stands.length).toBe(2);
    for (const a of d.attacks) expect(a.reach).toBeGreaterThanOrEqual(1);
  });

  it("300 catalog mutations on 20 seeds keep bodies valid and every flank 0/1 and bare", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rng = new Rng(seed);
      const b = human();
      for (let i = 0; i < 300; i++) {
        const m = drawMutation(MUTATIONS, rng);
        if (m !== null) applyMutation(b, m, rng);
      }
      expect(validate(b)).toEqual([]);
      for (const id of segmentIds(b)) {
        const s = b.segments[id]!;
        if (s.kind === "flank") expect([s.length, s.girth, s.growths.length, s.cavity.length]).toEqual([0, 1, 0, 0]);
      }
    }
  });
});
