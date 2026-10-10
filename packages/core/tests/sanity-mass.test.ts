/**
 * Common sense of the body's weight (docs/tasks/sanity, findings S-size-01,
 * S-size-02, S-size-06, S-breath-03): flesh weighs by its section, not by its
 * girth; the skeleton holds the body it carries, limbs included; flesh eats
 * with the mass it adds; a membrane is living tissue and eats too. Every rule
 * is read over the bestiary, the foes, the human and 200 random mutants.
 */
import { describe, expect, it } from "vitest";
import {
  BEASTS,
  COVERS,
  FOES,
  HUMAN_MASS,
  cloneBody,
  fixtureBody,
  foeBody,
  human,
  mass,
  segmentIds,
  segmentMass,
  skeletonCeiling,
  touch,
  upkeep,
  type Body,
} from "../index.js";
import { population } from "./gen.js";

const FIXTURES: { id: string; body: () => Body }[] = [
  { id: "human", body: () => human() },
  ...FOES.map((f) => ({ id: `foe:${f.id}`, body: () => foeBody(f) })),
  ...BEASTS.map((b) => ({ id: b.id, body: () => fixtureBody(b) })),
];

const MUTANTS = population(200);
const ALL: { id: string; body: () => Body }[] = [...FIXTURES, ...MUTANTS.map((b, i) => ({ id: `random:${i}`, body: () => cloneBody(b) }))];

/** The human's one torso, length 2 at girth 3, and the torsos of a body. */
const HUMAN_TRUNK = segmentMass(human().segments[9]!);
const trunk = (b: Body): number => segmentIds(b).reduce((m, id) => m + (b.segments[id]!.kind === "torso" ? segmentMass(b.segments[id]!) : 0), 0);

/** The human's rate: what a unit of mass burns a turn. */
const HUMAN_RATE = 20 / HUMAN_MASS;

describe("the weight of flesh", () => {
  it("S-size-01: a segment weighs by its section - one girth more multiplies it by at least the square of the ratio", () => {
    const bad: string[] = [];
    for (const { id, body } of ALL) {
      const b = body();
      for (const sid of segmentIds(b)) {
        const s = b.segments[sid]!;
        if (s.length === 0 || s.kind === "flank") continue;
        const before = segmentMass(s);
        const thick = { ...s, girth: s.girth + 1 };
        const want = before * ((s.girth + 1) / s.girth) ** 2;
        if (segmentMass(thick) < want - 1e-9) bad.push(`${id} ${sid} ${s.kind} ${s.length}/${s.girth}: ${segmentMass(thick)} < ${want}`);
      }
    }
    expect(bad.slice(0, 10).join("\n")).toEqual("");
  });

  it("S-size-01: a beast with a torso of the bull's tier weighs several humans", () => {
    expect(mass(fixtureBody(BEASTS.find((b) => b.id === "dragon")!))).toBeGreaterThanOrEqual(3 * HUMAN_MASS);
  });

  it("S-size-06: no fixture weighs more than its own skeleton holds", () => {
    const bad: string[] = [];
    for (const { id, body } of FIXTURES) {
      const b = body();
      if (mass(b) > skeletonCeiling(b) + 1e-9) bad.push(`${id}: ${mass(b)} > ${skeletonCeiling(b)}`);
    }
    expect(bad).toEqual([]);
  });

  it("S-size-06: a thicker limb or torso does not eat the room under the skeleton - the bone it adds holds its own flesh", () => {
    const bad: string[] = [];
    for (const { id, body } of ALL) {
      const b = body();
      for (const sid of segmentIds(b)) {
        const s = b.segments[sid]!;
        if (!["arm", "leg", "tail", "neck", "torso", "tentacle"].includes(s.kind) || !COVERS[s.cover].stretches) continue;
        // A trunk lighter than the human's is still within the human's skeleton: its flesh starts to count past his.
        if (s.kind === "torso" && trunk(b) < HUMAN_TRUNK) continue;
        const room = skeletonCeiling(b) - mass(b);
        const c = cloneBody(b);
        c.segments[sid]!.girth += 1;
        touch(c);
        if (skeletonCeiling(c) - mass(c) < room - 1e-9) bad.push(`${id} ${sid} ${s.kind}: ${room} -> ${skeletonCeiling(c) - mass(c)}`);
      }
    }
    expect(bad.slice(0, 10).join("\n")).toEqual("");
  });
});

describe("what flesh eats", () => {
  it("S-size-02: a torso one girth thicker eats at least half the human's rate on the mass it adds", () => {
    const bad: string[] = [];
    for (const { id, body } of ALL) {
      const b = body();
      for (const sid of segmentIds(b)) {
        if (b.segments[sid]!.kind !== "torso" || b.segments[sid]!.girth < 3) continue;
        const c = cloneBody(b);
        c.segments[sid]!.girth += 1;
        touch(c);
        const dm = mass(c) - mass(b);
        const du = upkeep(c) - upkeep(b);
        if (du < 0.5 * HUMAN_RATE * dm - 1e-9) bad.push(`${id} ${sid}: +${dm.toFixed(1)} mass, +${du.toFixed(2)} upkeep`);
      }
    }
    expect(bad.slice(0, 10).join("\n")).toEqual("");
  });

  it("S-size-02: a fixture twice the human's mass eats at least half again the human's upkeep", () => {
    const bad: string[] = [];
    for (const { id, body } of FIXTURES) {
      const b = body();
      if (mass(b) >= 2 * HUMAN_MASS && upkeep(b) < 1.5 * 20) bad.push(`${id}: mass ${mass(b)}, upkeep ${upkeep(b)}`);
    }
    expect(bad).toEqual([]);
  });

  it("S-breath-03: a membrane is living tissue - a body with membranes eats more than the same body without them", () => {
    const bad: string[] = [];
    let seen = 0;
    for (const { id, body } of ALL) {
      const b = body();
      if (Object.keys(b.membranes).length === 0) continue;
      seen += 1;
      const c = cloneBody(b);
      c.membranes = {};
      touch(c);
      if (upkeep(b) <= upkeep(c)) bad.push(`${id}: ${upkeep(b)} <= ${upkeep(c)}`);
    }
    expect(seen).toBeGreaterThan(3);
    expect(bad.slice(0, 10).join("\n")).toEqual("");
  });
});
