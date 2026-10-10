/**
 * The rig: a pose of the body at a moment, forward kinematics over the
 * placement tree from your brain. Every test here is a property over the
 * standard populations: deterministic, finite, lengths kept, in the frame,
 * and moving.
 */
import { describe, expect, it } from "vitest";
import { bridges, human, swampMutant, type Body } from "@mutant-engine/core";
import { layout, polylineLength, type Layout, pose, poseBox, poseOf, rig, type Pose } from "../index.js";
import { population } from "../../core/tests/gen.js";
import { brainyPopulation } from "../../core/tests/genHeads.js";

function finite(p: Pose): boolean {
  for (const n of Object.values(p.nodes)) if (!Number.isFinite(n.x) || !Number.isFinite(n.y) || !Number.isFinite(n.angle)) return false;
  for (const s of Object.values(p.segments)) for (const q of s) if (!Number.isFinite(q.x) || !Number.isFinite(q.y)) return false;
  for (const m of p.membranes) for (const q of m.polygon) if (!Number.isFinite(q.x) || !Number.isFinite(q.y)) return false;
  return true;
}

function bodies(): { body: Body; l: Layout; seed: number }[] {
  const out: { body: Body; l: Layout; seed: number }[] = [];
  const all = [...population(400), ...brainyPopulation(99), swampMutant()];
  all.forEach((body, i) => out.push({ body, l: layout(body, { scale: "sqrt" }), seed: i + 1 }));
  return out;
}

const MOMENTS = Array.from({ length: 20 }, (_, i) => i * 0.37);

describe("rig: pose", () => {
  const all = bodies();

  it("is deterministic and finite on 500 bodies x 20 moments", () => {
    expect(all).toHaveLength(500);
    for (const { body, l, seed } of all) {
      const r = rig(body, l, seed);
      for (const t of MOMENTS) {
        const a = poseOf(r, t);
        const b = pose(body, l, t, seed);
        expect(finite(a), `seed ${seed} t ${t}`).toBe(true);
        expect(a).toEqual(b);
        expect(Object.keys(a.nodes)).toHaveLength(Object.keys(body.nodes).length);
        expect(Object.keys(a.segments)).toHaveLength(Object.keys(body.segments).length);
      }
    }
  });

  it("keeps the length of every straight tree segment within 2 %, a bent one within 3 % and every cycle segment within 15 %", () => {
    let treeChecked = 0;
    let cycleChecked = 0;
    for (const { body, l, seed } of all) {
      const tree = new Set(bridges(body));
      // A torso is drawn a half-width short of its nodes and swings from node to node (decision 1259): its bone is the node-to-node line.
      const at = new Map(l.nodes.map((n) => [n.id, n]));
      const bone = (s: (typeof l.segments)[number]): number => {
        const seg = body.segments[s.id]!;
        if (seg.kind !== "torso") return polylineLength(s.points);
        const pts = s.points.map((q) => ({ ...q }));
        pts[0] = { x: at.get(seg.a)!.x, y: at.get(seg.a)!.y };
        pts[pts.length - 1] = { x: at.get(seg.b)!.x, y: at.get(seg.b)!.y };
        return polylineLength(pts);
      };
      const rest = new Map(l.segments.map((s) => [s.id, bone(s)]));
      const r = rig(body, l, seed);
      for (const t of MOMENTS) {
        const p = poseOf(r, t);
        for (const [id, spine] of Object.entries(p.segments)) {
          const sid = Number(id);
          const want = rest.get(sid)!;
          const got = polylineLength(spine);
          // A tree segment bent into an arc by a boxed placement keeps 3 %: side nodes spread limb roots over the
          // torso outline and bodies with more limbs per torso end jam more (old HEAD: all tree segments within 2 %;
          // now 3 bent ones reach 2.8 %).
          const tol = tree.has(sid) ? (l.segments.find((s) => s.id === sid)!.points.length > 2 ? 0.03 : 0.02) : 0.15;
          expect(Math.abs(got - want) <= tol * want + 1e-9, `seed ${seed} t ${t} segment ${sid}: ${got} vs ${want}`).toBe(true);
          if (tree.has(sid)) treeChecked += 1;
          else cycleChecked += 1;
        }
      }
    }
    expect(treeChecked).toBeGreaterThan(50_000);
    expect(cycleChecked).toBeGreaterThan(500);
  });

  it("never leaves the frame of the layout by more than a tenth", () => {
    for (const { body, l, seed } of all) {
      const r = rig(body, l, seed);
      const w = l.bbox.x1 - l.bbox.x0;
      const h = l.bbox.y1 - l.bbox.y0;
      const slack = 0.1 * Math.max(w, h);
      for (const t of MOMENTS) {
        const box = poseBox(poseOf(r, t));
        expect(box.x0, `seed ${seed} t ${t}`).toBeGreaterThanOrEqual(l.bbox.x0 - slack - 1e-9);
        expect(box.y0, `seed ${seed} t ${t}`).toBeGreaterThanOrEqual(l.bbox.y0 - slack - 1e-9);
        expect(box.x1, `seed ${seed} t ${t}`).toBeLessThanOrEqual(l.bbox.x1 + slack + 1e-9);
        expect(box.y1, `seed ${seed} t ${t}`).toBeLessThanOrEqual(l.bbox.y1 + slack + 1e-9);
      }
    }
  });

  it("moves: the human's hands and feet are elsewhere half a second later, the root stays", () => {
    const b = human();
    const l = layout(b, { scale: "sqrt" });
    const a = pose(b, l, 0, 1);
    const c = pose(b, l, 0.5, 1);
    const moved = (id: number): number => Math.hypot(a.nodes[id]!.x - c.nodes[id]!.x, a.nodes[id]!.y - c.nodes[id]!.y);
    expect(moved(1)).toBeLessThan(1e-9);
    // Legs now hang from the hips (side nodes), so the gait's phase lands the right foot 0.021 away
    // after half a second (0.039 when legs hung from the pelvis): still clearly off its rest.
    for (const id of [4, 5, 6, 7]) expect(moved(id), `node ${id}`).toBeGreaterThan(0.015);
    expect(a.breathe).not.toBe(c.breathe);
  });

  it("differs by seed and stays at the root's rest position", () => {
    const b = swampMutant();
    const l = layout(b, { scale: "sqrt" });
    const a = pose(b, l, 1.1, 1);
    const c = pose(b, l, 1.1, 2);
    let diff = 0;
    for (const id of Object.keys(a.nodes)) if (Math.hypot(a.nodes[Number(id)]!.x - c.nodes[Number(id)]!.x, a.nodes[Number(id)]!.y - c.nodes[Number(id)]!.y) > 1e-6) diff += 1;
    expect(diff).toBeGreaterThan(3);
    const root = l.nodes.find((n) => n.id === l.order[0]!)!;
    expect(a.nodes[root.id]!.x).toBeCloseTo(root.x, 9);
    expect(a.nodes[root.id]!.y).toBeCloseTo(root.y, 9);
  });
});
