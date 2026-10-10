/**
 * One point of attachment (decision 1259, the owner: «on the sprites and the
 * graph the joints are in different places - one source of truth»). A side
 * node is drawn where `attachPoint` puts its place on its host, in the graph
 * and the sprite layouts, after relaxing and in every pose, and a limb never
 * comes off the wall of the torso it hangs on while the body moves.
 */
import { describe, expect, it } from "vitest";
import { BEASTS, FOES, fixtureBody, flankPlace, foeBody, human, segmentIds, type Body } from "@mutant-engine/core";
import { population } from "../../core/tests/gen.js";
import { attachPoint, layout, pose, relaxLayout, segmentHalfWidth, type Layout, type LengthScale, type Point } from "../index.js";

/** A pixel of the frame in layout units (compose.ts `PPU`). */
const PX = 1 / 24;

const SUBJECTS: { id: string; body: Body }[] = [
  { id: "human", body: human() },
  ...FOES.map((f) => ({ id: `foe:${f.id}`, body: foeBody(f) })),
  ...BEASTS.map((b) => ({ id: b.id, body: fixtureBody(b) })),
  ...population(100).map((b, i) => ({ id: `mutant ${i}`, body: b })),
];

type At = (id: number) => Point | undefined;

/** Side nodes that are not where `attachPoint` puts them on the host as it lies, by more than a pixel. */
function off(body: Body, at: At, scale: LengthScale, what: string, torsosOnly = false): string[] {
  const out: string[] = [];
  for (const id of segmentIds(body)) {
    const f = body.segments[id]!;
    if (f.kind !== "flank") continue;
    const place = flankPlace(body, id);
    if (place === undefined || (torsosOnly && body.segments[place.host]!.kind !== "torso")) continue;
    const host = body.segments[place.host]!;
    const a = at(host.a);
    const b = at(host.b);
    const side = at(f.b);
    if (a === undefined || b === undefined || side === undefined) continue;
    const want = attachPoint(body, id, [a, b], scale)!;
    const d = Math.hypot(want.x - side.x, want.y - side.y);
    if (d > PX) out.push(`${what}: side node ${f.b} of flank ${id} is ${(d / PX).toFixed(1)} px off its place`);
  }
  return out;
}

const fromLayout = (l: Layout): At => {
  const m = new Map(l.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
  return (id) => m.get(id);
};

/** Hosts the layout drew straight, node to node: the check reads a host as the line between its nodes, and a bent arm is not one. */
function straight(body: Body, l: Layout): boolean {
  return segmentIds(body).every((id) => {
    const place = body.segments[id]!.kind === "flank" ? flankPlace(body, id) : undefined;
    return place === undefined || l.segments.find((s) => s.id === place.host)!.points.length <= 2;
  });
}

describe("one point of attachment", () => {
  it("the graph, the sprite and the relaxed graph put every side node where its place is, beasts, foes and 100 mutants", () => {
    const bad: string[] = [];
    let checked = 0;
    for (const s of SUBJECTS) {
      for (const scale of ["linear", "sqrt"] as const) {
        const l = layout(s.body, { scale });
        if (!straight(s.body, l)) continue;
        checked += 1;
        bad.push(...off(s.body, fromLayout(l), scale, `${s.id} ${scale}`));
        bad.push(...off(s.body, fromLayout(relaxLayout(s.body, l)), scale, `${s.id} ${scale} relaxed`));
      }
    }
    expect(checked).toBeGreaterThan(150);
    expect(bad).toEqual([]);
  });

  it("in motion a side node stays on its place and its limb on the torso's wall", () => {
    const bad: string[] = [];
    for (const s of SUBJECTS.slice(0, 60)) {
      const l = layout(s.body, { scale: "sqrt" });
      if (!straight(s.body, l)) continue;
      for (const t of [0, 0.37, 1.1, 2.3, 3]) {
        const p = pose(s.body, l, t, 7);
        // A torso swings whole; a tentacle waves and bends, and a side node on it rides its root, not its curve.
        bad.push(...off(s.body, (id) => p.nodes[id], "sqrt", `${s.id} t=${t}`, true));
      }
    }
    expect(bad).toEqual([]);
  });

  it("the spider's cephalothorax carries its eight legs four and four, each pair a mirror image across its line", () => {
    const spider = SUBJECTS.find((s) => s.id === "spider")!.body;
    const ceph = segmentIds(spider).find((id) => spider.segments[id]!.kind === "torso")!;
    for (const scale of ["linear", "sqrt"] as const) {
      const l = layout(spider, { scale });
      const at = fromLayout(l);
      const c = spider.segments[ceph]!;
      const a = at(c.a)!;
      const b = at(c.b)!;
      const ux = b.x - a.x;
      const uy = b.y - a.y;
      const len = Math.hypot(ux, uy);
      const along = (p: Point): number => ((p.x - a.x) * ux + (p.y - a.y) * uy) / len;
      const across = (p: Point): number => ((p.y - a.y) * ux - (p.x - a.x) * uy) / len;
      const flanks = segmentIds(spider).filter((id) => spider.segments[id]!.kind === "flank" && flankPlace(spider, id)?.host === ceph);
      expect(flanks).toHaveLength(8);
      const left = flanks.filter((f) => across(at(spider.segments[f]!.b)!) < 0);
      expect(left, scale).toHaveLength(4);
      for (const f of left) {
        const p = flankPlace(spider, f)!;
        const mate = flanks.find((g) => g !== f && spider.segments[g]!.a === spider.segments[f]!.a && Math.abs(flankPlace(spider, g)!.t - p.t) < 1e-9)!;
        const x = at(spider.segments[f]!.b)!;
        const y = at(spider.segments[mate]!.b)!;
        expect(Math.abs(along(x) - along(y)), `${scale} flank ${f}`).toBeLessThan(PX);
        expect(Math.abs(across(x) + across(y)), `${scale} flank ${f}`).toBeLessThan(PX);
      }
    }
    expect(segmentHalfWidth(spider.segments[ceph]!)).toBeGreaterThan(0);
  });
});
