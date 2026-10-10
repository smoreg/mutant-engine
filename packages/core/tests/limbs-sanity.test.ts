/**
 * Common sense of limbs (sanity step 3, package "limbs", decisions 1265-1269).
 * Each rule is checked over the human, the enemies, the bestiary and 200
 * random mutants, not on one body:
 *
 * - L1: limbs fused at one node keep one thick stump: their bulk adds up,
 *   and the fused tip strikes once it is enough to club (S-limb-01);
 * - L2: one limb is one blow: a tail with a striking ending strikes with the
 *   ending, not with the ending and its lash (S-limb-02);
 * - L3: a longer limb reaches farther: an arm stretched once from the human
 *   length reaches a cell more, and no stretch shortens a reach (S-limb-06);
 * - L4: a blow of a gland empties the reserve (S-breath-04).
 */
import { describe, expect, it } from "vitest";
import {
  BARE_KINDS,
  BARE_MIN_BULK,
  BEASTS,
  FOES,
  REACH_MAX,
  WEAPONS,
  apply,
  cloneBody,
  derive,
  fixtureBody,
  foeBody,
  human,
  isFlank,
  mutationById,
  applyMutationAt,
  mutationTargets,
  segmentIds,
  segmentsAt,
  otherEnd,
  strikes,
  targets,
  type Body,
} from "../index.js";
import { population } from "./gen.js";

const TABLE: { id: string; body: () => Body }[] = [
  { id: "human", body: () => human() },
  ...FOES.map((f) => ({ id: `foe:${f.id}`, body: () => foeBody(f) })),
  ...BEASTS.map((b) => ({ id: b.id, body: () => fixtureBody(b) })),
];

const MUTANTS = population(200);

function all(): [string, Body][] {
  return [...TABLE.map((t) => [t.id, t.body()] as [string, Body]), ...MUTANTS.map((b, i) => [`mutant ${i}`, cloneBody(b)] as [string, Body])];
}

/** Non-flank segments at a node. */
function limbSegments(body: Body, node: number): number[] {
  return segmentsAt(body, node).filter((id) => !isFlank(body.segments[id]!));
}

/** Length x girth of a limb walked from a node through a segment, until a fork, a torso or a flank. */
function limbBulk(body: Body, node: number, first: number): number {
  let bulk = 0;
  let at = node;
  let sid: number | undefined = first;
  const seen = new Set<number>();
  while (sid !== undefined && !seen.has(sid)) {
    const s = body.segments[sid]!;
    if (!BARE_KINDS.has(s.kind)) break;
    seen.add(sid);
    bulk += s.length * s.girth;
    at = otherEnd(s, at);
    const next = segmentsAt(body, at).filter((id) => id !== sid);
    sid = next.length === 1 ? next[0] : undefined;
  }
  return bulk;
}

describe("limbs: common sense", () => {
  it("L1: the human with fused arms keeps a stump where the hands were", () => {
    const b = human();
    const m = mutationById("fusedArms")!;
    const t = mutationTargets(b, m)[0]!;
    applyMutationAt(b, m, t.target);
    const fused = Number(Object.keys(b.nodes).find((id) => b.nodes[Number(id)]!.fused !== undefined));
    const blows = derive(b).attacks.filter((a) => a.node === fused);
    expect(blows.map((a) => a.kind)).toEqual(["stump"]);
  });

  it("L1: every fusion of two tips leaves a stump that strikes when the limbs together are bulky enough", () => {
    const bad: string[] = [];
    let tried = 0;
    for (const [name, body] of all()) {
      body.meat = Math.max(body.meat, 100_000);
      for (const w of targets(body, "fusion", {}).slice(0, 6)) {
        const [u] = (w.target as { pair: [number, number] }).pair;
        const b = cloneBody(body);
        apply(b, "fusion", {}, w.target);
        const here = limbSegments(b, u);
        if (here.length < 2 || !here.every((id) => BARE_KINDS.has(b.segments[id]!.kind))) continue;
        const bulk = here.reduce((s, id) => s + limbBulk(b, u, id), 0);
        if (bulk < BARE_MIN_BULK) continue;
        tried += 1;
        if (!derive(b).attacks.some((a) => a.node === u)) bad.push(`${name}: fused ${u} of bulk ${bulk} strikes with nothing`);
      }
    }
    expect(tried).toBeGreaterThan(20);
    expect(bad).toEqual([]);
  });

  it("L2: a segment that strikes by itself does not strike again under an ending that strikes", () => {
    const bad: string[] = [];
    let tails = 0;
    for (const [name, body] of all()) {
      const list = derive(body).attacks;
      for (const a of list) {
        if (a.kind !== "tail" && a.kind !== "penis") continue;
        tails += 1;
        const twin = list.find((o) => o !== a && o.node === a.node && o.segment === a.segment && o.index !== null);
        if (twin !== undefined) bad.push(`${name}: segment ${a.segment} lashes beside its ${twin.kind}`);
      }
    }
    expect(tails).toBeGreaterThan(10);
    expect(bad).toEqual([]);
  });

  it("L2: a grasping tail on the human is one blow", () => {
    const b = human();
    const m = mutationById("graspingTail")!;
    applyMutationAt(b, m, mutationTargets(b, m)[0]!.target);
    const tail = segmentIds(b).find((id) => b.segments[id]!.kind === "tail")!;
    expect(derive(b).attacks.filter((a) => a.segment === tail).map((a) => a.kind)).toEqual(["hook"]);
  });

  it("L3: the long arm on the human reaches a cell farther", () => {
    const b = human();
    const before = Math.max(...strikes(b).filter((s) => s.kind === "hand").map((s) => s.reach));
    const m = mutationById("longArm")!;
    applyMutationAt(b, m, mutationTargets(b, m)[0]!.target);
    const after = Math.max(...strikes(b).filter((s) => s.kind === "hand").map((s) => s.reach));
    expect(after).toBe(before + 1);
  });

  it("L3: stretching a limb never shortens a blow through it, and a limb twice the human arm reaches two cells", () => {
    const bad: string[] = [];
    let tried = 0;
    for (const [name, body] of all()) {
      body.meat = Math.max(body.meat, 100_000);
      const was = new Map(strikes(body).map((s) => [s.key, s]));
      for (const w of targets(body, "stretch", { delta: 1 }).slice(0, 6)) {
        const seg = (w.target as { segment: number }).segment;
        const b = cloneBody(body);
        apply(b, "stretch", { delta: 1 }, w.target);
        for (const s of strikes(b)) {
          if (!s.chain.includes(seg)) continue;
          const old = was.get(s.key);
          if (old === undefined) continue;
          tried += 1;
          if (s.reach < old.reach) bad.push(`${name}: ${s.kind} at ${s.node} reach ${old.reach} -> ${s.reach}`);
        }
      }
      for (const a of derive(body).attacks) {
        const length = a.chain.reduce((l, id) => l + body.segments[id]!.length, 0);
        if (a.blow === undefined && length >= 4 && a.reach < Math.min(2, REACH_MAX)) bad.push(`${name}: ${a.kind} on a chain of ${length} reaches ${a.reach}`);
      }
    }
    expect(tried).toBeGreaterThan(100);
    expect(bad).toEqual([]);
  });

  it("L4: every blow of a gland costs the reserve", () => {
    const bad: string[] = [];
    let glands = 0;
    for (const [name, body] of all()) {
      for (const s of strikes(body)) {
        const row = WEAPONS[s.kind as keyof typeof WEAPONS]?.blow;
        if (row === undefined || !row.vent) continue;
        glands += 1;
        if (!(s.cost > 0)) bad.push(`${name}: ${s.kind} costs ${s.cost}`);
      }
    }
    expect(glands).toBeGreaterThan(0);
    expect(bad).toEqual([]);
  });
});
