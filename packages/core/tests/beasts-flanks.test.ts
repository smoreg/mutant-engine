/**
 * A beast carries its limbs as the human does (decisions 116, 220, 1252, 1256): a
 * torso's arms, legs and tentacles hang on its side nodes, not in a bunch on
 * one of its end nodes, where the picture draws them from one point; in
 * mirrored pairs on a two-sided body; on the torso its anatomy puts them on
 * (decision 1256). A property over the whole bestiary and every foe.
 */
import { describe, expect, it } from "vitest";
import { BEASTS, FOES, brains, derive, fixtureBody, flankPlace, flanksOf, foeBody, freeSideSlots, limbChains, segmentIds, segmentsAt, sideNodesOf, torsoNodes, validate, type Body } from "../index.js";
import { layout } from "@mutant-engine/view";

const SUBJECTS: { id: string; body: () => Body }[] = [
  ...FOES.map((f) => ({ id: `foe:${f.id}`, body: () => foeBody(f) })),
  ...BEASTS.map((b) => ({ id: b.id, body: () => fixtureBody(b) })),
];

const LIMBS = new Set(["arm", "leg", "tentacle"]);

/** Bodies built around a centre, not a line: the jellyfish hangs three short tentacles and five long ones off its bell. */
const RADIAL = new Set(["jellyfish"]);

/** What hangs from a side node: the limb chain rooted there, as kind and length. */
function limbFrom(body: Body, node: number): string {
  const c = limbChains(body).find((x) => x.root === node && LIMBS.has(x.kind));
  return c === undefined ? "nothing" : `${c.kind} ${c.length}`;
}

/** The pairs of side nodes of every torso: flanks of one end by id, two at a time, as `flankPlace` sides them. */
function pairsOf(body: Body): [number, number[]][] {
  const out: [number, number[]][] = [];
  for (const id of segmentIds(body)) {
    const s = body.segments[id]!;
    if (s.kind !== "torso") continue;
    for (const end of [s.a, s.b]) {
      const row = flanksOf(body, id).filter((f) => body.segments[f]!.a === end);
      for (let i = 0; i + 1 < row.length; i += 2) out.push([id, [row[i]!, row[i + 1]!]]);
    }
  }
  return out;
}

/** Rows of side nodes that are odd, and pairs that are not mirror images: two kinds, two lengths, one side. */
function unpaired(body: Body): string[] {
  const out: string[] = [];
  for (const id of segmentIds(body)) {
    const s = body.segments[id]!;
    if (s.kind !== "torso") continue;
    for (const end of [s.a, s.b]) {
      const row = flanksOf(body, id).filter((f) => body.segments[f]!.a === end);
      if (row.length % 2 === 1) out.push(`torso ${id}: ${row.length} side nodes at node ${end}`);
    }
  }
  for (const [id, [x, y]] of pairsOf(body)) {
    const px = flankPlace(body, x!)!;
    const py = flankPlace(body, y!)!;
    const lx = limbFrom(body, body.segments[x!]!.b);
    const ly = limbFrom(body, body.segments[y!]!.b);
    if (lx !== ly || px.side === py.side || px.t !== py.t) out.push(`torso ${id}: ${lx} (${px.side}, ${px.t}) against ${ly} (${py.side}, ${py.t})`);
  }
  return out;
}

/** Limbs on each torso, by segment id: the side nodes it hosts and its own end nodes, as "kind×count". */
function carried(body: Body): string[] {
  const out: string[] = [];
  for (const id of segmentIds(body)) {
    const s = body.segments[id]!;
    if (s.kind !== "torso") continue;
    const count = new Map<string, number>();
    for (const n of sideNodesOf(body, id)) {
      const c = limbChains(body).find((x) => x.root === n && LIMBS.has(x.kind));
      if (c !== undefined) count.set(c.kind, (count.get(c.kind) ?? 0) + 1);
    }
    out.push([...count].map(([k, v]) => `${k}×${v}`).join(" "));
  }
  return out;
}

/** Where the anatomy puts the limbs of the many-legged: per torso in segment order (decision 1256). */
const OWNED: Record<string, string[]> = {
  spider: ["leg×8", ""],
  beetle: ["leg×6"],
  centipede: Array.from({ length: 11 }, () => "leg×2"),
  scorpion: ["arm×2 leg×6", ""],
  mantis: ["arm×4 leg×4", ""],
  antQueen: ["leg×6", ""],
  crab: ["arm×2 leg×6", ""],
  octopus: ["tentacle×8"],
};

/**
 * End nodes of a torso that hold two limbs or more straight on them, each as
 * "id: node (limbs), free places of the torsos there".
 */
function bunched(body: Body): string[] {
  const sides = new Set<number>();
  for (const s of Object.values(body.segments)) if (s.kind === "torso") for (const n of sideNodesOf(body, s.id)) sides.add(n);
  const out: string[] = [];
  for (const n of torsoNodes(body)) {
    if (sides.has(n)) continue;
    const at = segmentsAt(body, n).map((sid) => body.segments[sid]!);
    const limbs = at.filter((s) => LIMBS.has(s.kind)).length;
    if (limbs < 2) continue;
    const free = at.filter((s) => s.kind === "torso").map((s) => freeSideSlots(body, s.id));
    out.push(`${n} (${limbs}), free ${free.join("/")}`);
  }
  return out;
}

describe("a beast's limbs hang on side nodes", () => {
  it("every body of the table is valid", () => {
    for (const s of SUBJECTS) expect(validate(s.body()), s.id).toEqual([]);
  });

  it("no end node of a torso carries two limbs or more", () => {
    // The beetle and the centipede were the exceptions while a torso took no more side nodes than its tier:
    // since decision 1256 a drawn torso holds as many as it has limbs.
    expect(SUBJECTS.flatMap((s) => bunched(s.body()).map((line) => `${s.id}: ${line}`))).toEqual([]);
  });

  it("a two-sided body has its limbs in mirrored pairs: a row of side nodes is even, each pair one kind and one length", () => {
    const bad: string[] = [];
    for (const s of SUBJECTS) {
      if (RADIAL.has(s.id)) continue;
      const body = s.body();
      for (const line of unpaired(body)) bad.push(`${s.id}: ${line}`);
    }
    expect(bad).toEqual([]);
  });

  it("the picture keeps the pairs mirrored: the two side nodes of a pair lie on opposite sides of their torso", () => {
    const bad: string[] = [];
    for (const s of SUBJECTS) {
      if (RADIAL.has(s.id)) continue;
      const body = s.body();
      const l = layout(body, { scale: "sqrt" });
      const at = new Map(l.nodes.map((n) => [n.id, n]));
      for (const [host, pair] of pairsOf(body)) {
        const seg = body.segments[host]!;
        const a = at.get(seg.a)!;
        const b = at.get(seg.b)!;
        const cross = (n: number): number => {
          const p = at.get(n)!;
          return Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
        };
        const [x, y] = pair.map((f) => body.segments[f]!.b);
        if (cross(x!) * cross(y!) >= 0) bad.push(`${s.id}: torso ${host}, side nodes ${x} and ${y}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("the limbs a beast's anatomy puts on a torso hang on it: a spider's eight legs on its cephalothorax", () => {
    for (const [id, want] of Object.entries(OWNED)) {
      const beast = BEASTS.find((b) => b.id === id)!;
      expect(carried(fixtureBody(beast)), id).toEqual(want);
    }
  });

  it("the spider thinks with one great brain that carries all it has to steer", () => {
    const spider = fixtureBody(BEASTS.find((b) => b.id === "spider")!);
    const all = brains(spider);
    expect(all.map((b) => b.organ.kind)).toEqual(["greatBrain"]);
    const control = derive(spider).budgets.control;
    expect(control.load).toBeLessThanOrEqual(control.cap);
  });
});
