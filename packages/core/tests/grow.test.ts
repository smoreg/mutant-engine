import { describe, expect, it } from "vitest";
import { LabRng as Rng } from "../rng.js";
import {
  HUMAN_IDS,
  LIMITS,
  apply,
  bodyFromText,
  bodyHash,
  bodyToText,
  capacity,
  cavityLoad,
  closure,
  grow,
  human,
  mass,
  nodeIds,
  organ,
  pickTarget,
  segmentIds,
  segmentsAt,
  targets,
  validate,
  type Body,
  type Target,
} from "../index.js";
import { randomBody, randomOp } from "./gen.js";

const ARM = { kind: "arm", length: 2, girth: 1, cover: "skin", ending: organ("hand") } as const;

function newIds(body: Body, before: number[]): number[] {
  const seen = new Set(before);
  return [...nodeIds(body), ...segmentIds(body)].filter((id) => !seen.has(id)).sort((a, b) => a - b);
}

describe("operations", () => {
  it("sprout adds an end node and a segment", () => {
    const b = human(1000);
    // The chest is the full neck node now: the third arm grows on a shoulder.
    const r = apply(b, "sprout", ARM, { node: HUMAN_IDS.shoulderL });
    expect(r.created).toEqual([32, 33]);
    expect(b.nodes[32]).toMatchObject({ size: 1 });
    expect(b.nodes[32]!.ends.map((e) => e.kind)).toEqual(["hand"]);
    expect(b.segments[33]).toMatchObject({ a: HUMAN_IDS.shoulderL, b: 32, kind: "arm", length: 2, girth: 1, cover: "skin", breakPlane: false });
    expect(mass(b)).toBe(101 + 6 + 2);
    expect(b.nextId).toBe(34);
    expect(b.version).toBeGreaterThan(human().version);
    expect(validate(b)).toEqual([]);
  });

  it("sprout needs a free slot: a full node is not a target", () => {
    const b = human(1000);
    const t = targets(b, "sprout", ARM).map((w) => w.target);
    expect(t).toContainEqual({ node: HUMAN_IDS.shoulderL });
    expect(t).toContainEqual({ node: HUMAN_IDS.handL });
    // The chest (size 1) holds the neck and the torso; the shoulder flanks take no slot at their host's end, so it is full.
    expect(segmentsAt(b, HUMAN_IDS.chest)).toHaveLength(4);
    expect(t).not.toContainEqual({ node: HUMAN_IDS.chest });
    // A shoulder (size 3) holds its flank and the arm: four of six are free.
    expect(segmentsAt(b, HUMAN_IDS.shoulderL)).toHaveLength(2);
    for (let i = 0; i < 4; i++) apply(b, "sprout", ARM, { node: HUMAN_IDS.shoulderL });
    expect(segmentsAt(b, HUMAN_IDS.shoulderL)).toHaveLength(6);
    expect(targets(b, "sprout", ARM).map((w) => w.target)).not.toContainEqual({ node: HUMAN_IDS.shoulderL });
  });

  it("joint splits a segment in the middle", () => {
    const b = human(1000);
    // The upper arm has length 1 and cannot split: stretch it to 2 first (+3 meat).
    expect(targets(b, "joint", { ending: null }).map((w) => w.target)).not.toContainEqual({ segment: HUMAN_IDS.armL });
    apply(b, "stretch", { delta: 1 }, { segment: HUMAN_IDS.armL });
    const r = apply(b, "joint", { ending: organ("mouth") }, { segment: HUMAN_IDS.armL });
    const [node, seg] = r.created;
    expect(b.nodes[node!]).toMatchObject({ size: 1 });
    expect(b.nodes[node!]!.ends.map((e) => e.kind)).toEqual(["mouth"]);
    expect(b.segments[HUMAN_IDS.armL]).toMatchObject({ a: HUMAN_IDS.shoulderL, b: node, length: 1 });
    expect(b.segments[seg!]).toMatchObject({ a: node, b: HUMAN_IDS.elbowL, length: 1, kind: "arm", cover: "skin", breakPlane: false });
    expect(b.segments[HUMAN_IDS.armL]!.breakPlane).toBe(true);
    expect(mass(b)).toBe(101 + 3 + 2);
    expect(validate(b)).toEqual([]);
    expect(targets(b, "joint", { ending: null }).map((w) => w.target)).not.toContainEqual({ segment: HUMAN_IDS.neck });
  });

  it("joint on a torso keeps the cavity on the longer half", () => {
    const b = bodyFromText(`
      голова[2] {голова(мозг*)}
      грудь[3]
      таз[3]
      голова -шея:1/1 кожа- грудь
      грудь -корпус:3/3 кожа {сердце, лёгкие, желудок}- таз
    `);
    const r = apply(b, "joint", { ending: null }, { segment: 5 });
    expect(r.created).toEqual([6, 7]);
    expect(b.segments[5]).toMatchObject({ a: 2, b: 6, length: 2 });
    expect(b.segments[5]!.cavity.map((o) => o.kind)).toEqual(["heart", "lungs", "stomach"]);
    expect(b.segments[7]).toMatchObject({ a: 6, b: 3, length: 1, kind: "torso" });
    expect(b.segments[7]!.cavity).toEqual([]);
    expect(validate(b)).toEqual([]);
  });

  it("branch forks an ending into two", () => {
    const b = human(1000);
    apply(b, "enlarge", {}, { node: HUMAN_IDS.handL });
    expect(b.nodes[HUMAN_IDS.handL]!.size).toBe(2);
    expect(targets(b, "enlarge", {}).map((w) => w.target)).not.toContainEqual({ node: HUMAN_IDS.handL });
    const before = [...nodeIds(b), ...segmentIds(b)];
    const r = apply(b, "branch", { kind: "arm", length: 1, girth: 1, cover: "scales" }, { ending: { node: HUMAN_IDS.handL, index: 0 } });
    expect(r.created).toHaveLength(4);
    expect(newIds(b, before)).toEqual(r.created);
    expect(b.nodes[HUMAN_IDS.handL]!.ends).toEqual([]);
    const tips = r.created.filter((id) => b.nodes[id] !== undefined);
    expect(tips).toHaveLength(2);
    for (const t of tips) expect(b.nodes[t]!.ends.map((e) => e.kind)).toEqual(["hand"]);
    expect(segmentsAt(b, HUMAN_IDS.handL)).toHaveLength(3);
    expect(validate(b)).toEqual([]);
  });

  it("branch needs two free slots", () => {
    const b = human(1000);
    expect(targets(b, "branch", { kind: "arm", length: 1, girth: 1, cover: "skin" })).toEqual([]);
    apply(b, "enlarge", {}, { node: HUMAN_IDS.handL });
    expect(targets(b, "branch", { kind: "arm", length: 1, girth: 1, cover: "skin" }).map((w) => w.target)).toEqual([
      { ending: { node: HUMAN_IDS.handL, index: 0 } },
    ]);
  });

  it("rebirth changes an ending and never touches your head", () => {
    const b = human(1000);
    apply(b, "rebirth", { ending: organ("pincer") }, { ending: { node: HUMAN_IDS.handL, index: 0 } });
    expect(b.nodes[HUMAN_IDS.handL]!.ends.map((e) => e.kind)).toEqual(["pincer"]);
    const t = targets(b, "rebirth", { ending: organ("hoof") }).map((w) => w.target);
    expect(t).not.toContainEqual({ ending: { node: HUMAN_IDS.head, index: 0 } });
    expect(t).toHaveLength(4);
    apply(b, "rebirth", { ending: organ("head", [organ("eye"), organ("jaw")]) }, { ending: { node: HUMAN_IDS.handR, index: 0 } });
    expect(b.nodes[HUMAN_IDS.handR]!.ends[0]!.contents!.map((o) => o.kind)).toEqual(["eye", "jaw"]);
    expect(validate(b)).toEqual([]);
  });

  it("thickening opens a cavity of 5 x length x girth", () => {
    const b = human(1000);
    apply(b, "thicken", {}, { segment: HUMAN_IDS.armL });
    const s = b.segments[HUMAN_IDS.armL]!;
    // The upper arm is 1 long now: 5 x 1 x 2.
    expect(s).toMatchObject({ kind: "torso", girth: 2, length: 1 });
    expect(capacity(s)).toBe(10);
    expect(s.cavity).toEqual([]);
    // A torso of girth 2 weighs by section (decision 1260): 6.5 x 1 x 4 / 3.
    expect(mass(b)).toBeCloseTo(101 - 3 + (6.5 * 1 * 4) / 3, 9);
    expect(validate(b)).toEqual([]);
    b.segments[HUMAN_IDS.armR]!.cover = "chitin";
    const t = targets(b, "thicken", {}).map((w) => w.target);
    expect(t).not.toContainEqual({ segment: HUMAN_IDS.armR });
    expect(t).not.toContainEqual({ segment: HUMAN_IDS.neck });
    expect(t).not.toContainEqual({ segment: HUMAN_IDS.torso });
    expect(t).toContainEqual({ segment: HUMAN_IDS.legL });
  });

  it("thinning evicts what no longer fits", () => {
    const b = bodyFromText(`
      голова[2] {голова(мозг*)}
      грудь[3]
      таз[3]
      голова -шея:1/1 кожа- грудь
      грудь -корпус:2/2 кожа {сердце, лёгкие, желудок, кишка, кишка}- таз
    `);
    const torso = b.segments[5]!;
    expect(capacity(torso)).toBe(20);
    expect(cavityLoad(torso)).toBe(16);
    const before = mass(b);
    const r = apply(b, "thin", {}, { segment: 5 });
    expect(torso.girth).toBe(1);
    expect(capacity(torso)).toBe(10);
    expect(cavityLoad(torso)).toBeLessThanOrEqual(10);
    expect(r.evicted.map((o) => o.kind)).toEqual(["gut", "gut", "stomach"]);
    expect(torso.cavity.map((o) => o.kind)).toEqual(["heart", "lungs"]);
    // Girth 2 to 1 by section (decision 1260): 6.5 x 2 x (4 - 1) / 3.
    expect(mass(b)).toBeCloseTo(before - (6.5 * 2 * 3) / 3 - 8, 9);
    expect(targets(b, "thin", {})).toEqual([]);
    expect(validate(b)).toEqual([]);
  });

  it("thinning never evicts your brain", () => {
    const b = bodyFromText(`
      грудь[3]
      таз[3]
      грудь -корпус:2/2 кожа {сердце, лёгкие, желудок, кишка, мозг*}- таз
    `);
    const r = apply(b, "thin", {}, { segment: 3 });
    expect(r.evicted.map((o) => o.kind)).toEqual(["gut", "stomach"]);
    expect(b.segments[3]!.cavity.map((o) => o.kind)).toEqual(["heart", "lungs", "brain"]);
    expect(validate(b)).toEqual([]);
  });

  it("stretch changes length within 1..6", () => {
    const b = human(1000);
    apply(b, "stretch", { delta: 1 }, { segment: HUMAN_IDS.neck });
    expect(b.segments[HUMAN_IDS.neck]!.length).toBe(2);
    expect(mass(b)).toBe(104);
    apply(b, "stretch", { delta: -1 }, { segment: HUMAN_IDS.neck });
    expect(b.segments[HUMAN_IDS.neck]!.length).toBe(1);
    expect(targets(b, "stretch", { delta: -1 }).map((w) => w.target)).not.toContainEqual({ segment: HUMAN_IDS.neck });
    for (let i = 0; i < 5; i++) apply(b, "stretch", { delta: 1 }, { segment: HUMAN_IDS.neck });
    expect(b.segments[HUMAN_IDS.neck]!.length).toBe(6);
    expect(targets(b, "stretch", { delta: 1 }).map((w) => w.target)).not.toContainEqual({ segment: HUMAN_IDS.neck });
    expect(validate(b)).toEqual([]);
  });

  it("enlarge grows a node that ran out of room", () => {
    const b = human(1000);
    const t = targets(b, "enlarge", {}).map((w) => w.target);
    // The full neck node and pelvis (size 1, two segments each), hands and feet, elbows and knees;
    // shoulders (3) and hips (2) have room, the penis tip holds one segment of two.
    expect(t).toEqual([
      { node: HUMAN_IDS.chest },
      { node: HUMAN_IDS.pelvis },
      { node: HUMAN_IDS.handL },
      { node: HUMAN_IDS.handR },
      { node: HUMAN_IDS.footL },
      { node: HUMAN_IDS.footR },
      { node: HUMAN_IDS.elbowL },
      { node: HUMAN_IDS.elbowR },
      { node: HUMAN_IDS.kneeL },
      { node: HUMAN_IDS.kneeR },
    ]);
    apply(b, "enlarge", {}, { node: HUMAN_IDS.handL });
    expect(b.nodes[HUMAN_IDS.handL]!.size).toBe(2);
    expect(b.nodes[HUMAN_IDS.handL]!.hpMax).toBe(12);
    expect(mass(b)).toBe(101);
    expect(validate(b)).toEqual([]);
  });

  it("fusion creates exactly one cycle and kills endings", () => {
    const b = human(1000);
    const pairs = targets(b, "fusion", {}).map((w) => w.target);
    expect(pairs).toContainEqual({ pair: [HUMAN_IDS.handL, HUMAN_IDS.handR] });
    expect(pairs).toContainEqual({ pair: [HUMAN_IDS.footL, HUMAN_IDS.footR] });
    // A hand and a foot are two joints from the torso each way now and share no node within two steps;
    // the penis tip is one step from the pelvis and fuses with a foot.
    expect(pairs).not.toContainEqual({ pair: [HUMAN_IDS.handL, HUMAN_IDS.footL] });
    expect(pairs).toContainEqual({ pair: [HUMAN_IDS.footL, HUMAN_IDS.penisTip] });
    expect(pairs).not.toContainEqual({ pair: [HUMAN_IDS.head, HUMAN_IDS.pelvis] });
    expect(pairs).not.toContainEqual({ pair: [HUMAN_IDS.chest, HUMAN_IDS.pelvis] });
    const before = closure(b);
    const r = apply(b, "fusion", {}, { pair: [HUMAN_IDS.handL, HUMAN_IDS.handR] });
    expect(closure(b)).toBe(before + 1);
    expect(r.removed).toEqual([HUMAN_IDS.handR]);
    expect(b.nodes[HUMAN_IDS.handR]).toBeUndefined();
    expect(b.nodes[HUMAN_IDS.handL]!.ends).toEqual([]);
    expect(b.segments[HUMAN_IDS.forearmR]!.b).toBe(HUMAN_IDS.handL);
    expect(segmentsAt(b, HUMAN_IDS.handL)).toEqual([HUMAN_IDS.forearmL, HUMAN_IDS.forearmR]);
    expect(mass(b)).toBe(97);
    expect(validate(b)).toEqual([]);
  });

  it("fusion keeps ids: the removed id is never reused", () => {
    const b = human(1000);
    apply(b, "fusion", {}, { pair: [HUMAN_IDS.handL, HUMAN_IDS.handR] });
    const r = apply(b, "sprout", ARM, { node: HUMAN_IDS.shoulderL });
    expect(r.created[0]).toBe(32);
    expect(b.nodes[HUMAN_IDS.handR]).toBeUndefined();
  });

  it("growth adds a tumour segment", () => {
    const b = human(1000);
    // The pelvis is full on the human: the tumour grows on a hip.
    const r = apply(b, "growth", {}, { node: HUMAN_IDS.hipL });
    const seg = b.segments[r.created[1]!]!;
    expect(seg).toMatchObject({ kind: "growth", length: 1, girth: 1, a: HUMAN_IDS.hipL, b: r.created[0], breakPlane: false });
    expect(b.nodes[seg.b]!.ends).toEqual([]);
    expect(mass(b)).toBe(105);
    expect(validate(b)).toEqual([]);
  });

  it("necrosis needs a starved part", () => {
    const b = human(1000);
    expect(targets(b, "necrosis", {})).toEqual([]);
    b.segments[HUMAN_IDS.legL]!.hp = 0;
    // A dead thigh starves the knee, the shin and the foot beyond it.
    expect(targets(b, "necrosis", {}).map((w) => w.target)).toEqual([{ node: HUMAN_IDS.footL }, { node: HUMAN_IDS.kneeL }, { segment: HUMAN_IDS.shinL }]);
    apply(b, "necrosis", {}, { node: HUMAN_IDS.footL });
    expect(b.nodes[HUMAN_IDS.footL]).toBeUndefined();
    expect(b.nodes[HUMAN_IDS.kneeL]).toBeUndefined();
    expect(b.segments[HUMAN_IDS.shinL]).toBeUndefined();
    expect(b.segments[HUMAN_IDS.legL]).toMatchObject({ a: HUMAN_IDS.hipL, b: 32 });
    expect(validate(b)).toEqual([]);
  });

  it("apply rejects an invalid target", () => {
    const b = human(1000);
    expect(() => apply(b, "sprout", ARM, { node: 99 })).toThrow();
    expect(() => apply(b, "thicken", {}, { segment: HUMAN_IDS.torso })).toThrow();
    expect(() => apply(b, "fusion", {}, { pair: [HUMAN_IDS.head, HUMAN_IDS.chest] })).toThrow();
  });
});

describe("targets and weights", () => {
  function tally(body: Body, seed: number, ctx?: { source?: "abyss" }): Map<string, number> {
    const rng = new Rng(seed);
    const counts = new Map<string, number>();
    for (let i = 0; i < 2000; i++) {
      const t = pickTarget(body, "sprout", ARM, rng, ctx);
      const key = JSON.stringify(t);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }
  const key = (t: Target) => JSON.stringify(t);

  it("target weights: a fresh wound doubles", () => {
    const b = human(1000);
    b.nodes[HUMAN_IDS.handL]!.wound = 20;
    const w = targets(b, "sprout", ARM);
    expect(w.find((x) => key(x.target) === key({ node: HUMAN_IDS.handL }))!.weight).toBe(2);
    expect(w.find((x) => key(x.target) === key({ node: HUMAN_IDS.handR }))!.weight).toBe(1);
    const c = tally(b, 1);
    const wounded = c.get(key({ node: HUMAN_IDS.handL }))!;
    const plain = c.get(key({ node: HUMAN_IDS.handR }))!;
    // Nineteen targets, ten nodes and nine limb segments with a free side slot: 2/20 and 1/20 of 2000 draws,
    // ~200 and ~100 (seed 1: 179 and 103; was 2/13 and 1/13, bounds 250-370 and 100-210).
    expect(wounded).toBeGreaterThan(150);
    expect(wounded).toBeLessThan(250);
    expect(plain).toBeGreaterThan(60);
    expect(plain).toBeLessThan(140);
  });

  it("target weights: instability of organs in the place", () => {
    const b = human(1000);
    b.nodes[HUMAN_IDS.handL]!.ends[0]!.instability = 100;
    const w = targets(b, "sprout", ARM);
    expect(w.find((x) => key(x.target) === key({ node: HUMAN_IDS.handL }))!.weight).toBe(5);
    const c = tally(b, 2);
    const unstable = c.get(key({ node: HUMAN_IDS.handL }))!;
    // 5/24 of 2000, ~417 (seed 2: 442; was 5/16, ~625, bounds 550-700).
    expect(unstable).toBeGreaterThan(350);
    expect(unstable).toBeLessThan(490);
  });

  it("target weights: the abyss strikes far from the brain", () => {
    const b = human(1000);
    const w = targets(b, "sprout", ARM, { source: "abyss" });
    expect(w.find((x) => key(x.target) === key({ node: HUMAN_IDS.head }))!.weight).toBe(1);
    expect(w.find((x) => key(x.target) === key({ node: HUMAN_IDS.footL }))!.weight).toBe(2);
    expect(w.find((x) => key(x.target) === key({ node: HUMAN_IDS.handL }))!.weight).toBeCloseTo(1.6);
    const c = tally(b, 3, { source: "abyss" });
    const foot = c.get(key({ node: HUMAN_IDS.footL }))!;
    const head = c.get(key({ node: HUMAN_IDS.head }))!;
    // The weights sum to 28.6 with the joints and limb segments: 2/28.6 and 1/28.6 of 2000, ~140 and ~70
    // (seed 3: 144 and 73; was 17.6, ~227 and ~114, bounds 170-290 and 70-160).
    expect(foot).toBeGreaterThan(100);
    expect(foot).toBeLessThan(180);
    expect(head).toBeGreaterThan(40);
    expect(head).toBeLessThan(105);
    expect(targets(b, "sprout", ARM).find((x) => key(x.target) === key({ node: HUMAN_IDS.footL }))!.weight).toBe(1);
  });

  it("target weights: a ripper stub draws x5", () => {
    const b = human(1000);
    // The pelvis is full on the human and no target at all: the bait sits on a hip.
    b.nodes[HUMAN_IDS.hipL]!.bait = true;
    const w = targets(b, "sprout", ARM);
    expect(w.find((x) => key(x.target) === key({ node: HUMAN_IDS.hipL }))!.weight).toBe(5);
    const c = tally(b, 4);
    const stub = c.get(key({ node: HUMAN_IDS.hipL }))!;
    // 5/24 of 2000, ~417 (seed 4: 439; was 5/16, ~625, bounds 550-700).
    expect(stub).toBeGreaterThan(350);
    expect(stub).toBeLessThan(490);
  });

  it("targets are listed by id", () => {
    const b = human(1000);
    const ids = targets(b, "sprout", ARM).map((w) => (w.target as { node: number }).node);
    expect(ids).toEqual([...ids].sort((x, y) => x - y));
    expect(pickTarget(b, "sprout", ARM, new Rng(7))).toEqual(pickTarget(b, "sprout", ARM, new Rng(7)));
    expect(pickTarget(b, "necrosis", {}, new Rng(7))).toBeNull();
  });

  it("no target -> growth", () => {
    const b = human(1000);
    for (const s of Object.values(b.segments)) s.cover = "chitin";
    const rng = new Rng(1);
    const r = grow(b, "thicken", {}, rng);
    expect(r).not.toBeNull();
    expect(r!.op).toBe("growth");
    expect(r!.fallback).toBe(true);
    expect(segmentIds(b).some((s) => b.segments[s]!.kind === "growth")).toBe(true);
    expect(validate(b)).toEqual([]);
  });

  it("no meat -> growth, no meat for a growth -> lost", () => {
    const b = human(106);
    const r = grow(b, "sprout", ARM, new Rng(1));
    expect(r!.op).toBe("growth");
    expect(mass(b)).toBe(105);
    const lost = grow(b, "sprout", ARM, new Rng(1));
    expect(lost).toBeNull();
    expect(mass(b)).toBe(105);
    expect(validate(b)).toEqual([]);
  });

  it("limits hold", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const b = randomBody(seed, 1000);
      expect(nodeIds(b).length).toBeLessThanOrEqual(LIMITS.nodes);
      expect(segmentIds(b).length).toBeLessThanOrEqual(LIMITS.segments);
      expect(closure(b)).toBeLessThanOrEqual(LIMITS.cycles);
      // A flank takes no slot at its host's end.
      const slotsUsed = (n: number) => segmentsAt(b, n).filter((s) => !(b.segments[s]!.kind === "flank" && b.segments[s]!.a === n)).length;
      for (const n of nodeIds(b)) expect(slotsUsed(n)).toBeLessThanOrEqual(2 * b.nodes[n]!.size);
      expect(validate(b)).toEqual([]);
    }
  });

  it("pressure fills the body up to the limits", () => {
    const b = randomBody(3, 1000);
    expect(nodeIds(b).length).toBeGreaterThanOrEqual(LIMITS.nodes - 2);
  });

  it("grown bodies stay valid", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const rng = new Rng(seed);
      const b = human(100_000);
      for (let i = 0; i < 60; i++) {
        const c = randomOp(rng);
        const r = grow(b, c.op, c.payload, rng);
        const errors = validate(b);
        expect(errors, `seed ${seed} op ${i} ${c.op} -> ${JSON.stringify(r)}\n${bodyToText(b)}`).toEqual([]);
        expect(mass(b)).toBeLessThanOrEqual(b.meat);
      }
    }
  });

  it("same seed same body", () => {
    for (let seed = 1; seed <= 100; seed++) {
      expect(bodyHash(randomBody(seed, 40))).toBe(bodyHash(randomBody(seed, 40)));
    }
    expect(bodyHash(randomBody(1, 40))).not.toBe(bodyHash(randomBody(2, 40)));
  });

  it("insertion order does not matter, ids do", () => {
    const a = randomBody(5, 40);
    const reversed: Body = { ...a, nodes: {}, segments: {} };
    for (const id of nodeIds(a).reverse()) reversed.nodes[id] = structuredClone(a.nodes[id]!);
    for (const id of segmentIds(a).reverse()) reversed.segments[id] = structuredClone(a.segments[id]!);
    expect(bodyHash(reversed)).toBe(bodyHash(a));
    reversed.version = 0;
    expect(bodyHash(reversed)).toBe(bodyHash(a));
    reversed.nextId += 1;
    expect(bodyHash(reversed)).not.toBe(bodyHash(a));
  });
});
