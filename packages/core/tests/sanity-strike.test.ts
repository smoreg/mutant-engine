/**
 * Common sense of the blow and the cover (docs/tasks/sanity, findings S-size-05,
 * S-limb-03, S-combat-01, S-combat-02): a limb twice as heavy strikes clearly
 * harder; a hard cover turns an edge and a point better than a club, fur and
 * skin hold almost nothing, chrome holds best of all. Read over the bestiary,
 * the foes, the human and 200 random mutants.
 */
import { describe, expect, it } from "vitest";
import {
  BEASTS,
  COVERS,
  FOES,
  STRIKE,
  cloneBody,
  coverAgainst,
  fixtureBody,
  foeBody,
  human,
  segmentIds,
  strikeForce,
  strikes,
  type Body,
  type CoverId,
  type HitType,
} from "../index.js";
import { population } from "./gen.js";

const FIXTURES: { id: string; body: () => Body }[] = [
  { id: "human", body: () => human() },
  ...FOES.map((f) => ({ id: `foe:${f.id}`, body: () => foeBody(f) })),
  ...BEASTS.map((b) => ({ id: b.id, body: () => fixtureBody(b) })),
];
const MUTANTS = population(200);
const ALL: { id: string; body: () => Body }[] = [...FIXTURES, ...MUTANTS.map((b, i) => ({ id: `random:${i}`, body: () => cloneBody(b) }))];

const TYPES: HitType[] = ["blunt", "cut", "pierce", "bite"];
const HARD: CoverId[] = ["chitin", "scales", "plates", "stone", "chrome"];
const SOFT: CoverId[] = ["skin", "fur", "slime", "feathers"];

describe("the force of a blow", () => {
  it("S-size-05: every blow twice as heavy as one of at least the human's arm strikes clearly harder - at least one point more", () => {
    const bad: string[] = [];
    for (const { id, body } of ALL) {
      for (const s of strikes(body())) {
        if (s.mass < STRIKE.unitMass) continue;
        if (strikeForce(2 * s.mass) - strikeForce(s.mass) < 1) bad.push(`${id} ${s.kind} m${s.mass}: ${strikeForce(s.mass)} -> ${strikeForce(2 * s.mass)}`);
      }
    }
    expect(bad.slice(0, 10).join("\n")).toBe("");
  });

  it("S-limb-03: force follows the mass, not its logarithm - eight times the human's arm strikes at least seven points harder", () => {
    expect(strikeForce(4 * STRIKE.unitMass) - strikeForce(STRIKE.unitMass)).toBeGreaterThanOrEqual(4);
    expect(strikeForce(8 * STRIKE.unitMass) - strikeForce(STRIKE.unitMass)).toBeGreaterThanOrEqual(7);
  });

  it("S-limb-03: a claw of the dragon strikes several points harder than the human's fist", () => {
    const fist = Math.max(...strikes(human()).filter((s) => s.kind === "hand").map((s) => s.force));
    const claws = strikes(fixtureBody(BEASTS.find((b) => b.id === "dragon")!)).filter((s) => s.kind === "claw" && s.chain.some((c) => c > 0));
    const legClaw = Math.max(...claws.map((s) => s.force));
    expect(legClaw - fist).toBeGreaterThanOrEqual(4);
  });
});

describe("the cover against the type of the blow", () => {
  const one = (cover: CoverId): Body => {
    const b = human();
    for (const sid of segmentIds(b)) b.segments[sid]!.cover = cover;
    return b;
  };
  const guard = (cover: CoverId, type: HitType): number => coverAgainst(one(cover), 9, type);

  it("S-combat-01: a hard cover turns an edge and a point better than a club", () => {
    for (const c of HARD) {
      expect(guard(c, "cut"), `${c} cut`).toBeGreaterThan(guard(c, "blunt"));
      expect(guard(c, "pierce"), `${c} pierce`).toBeGreaterThan(guard(c, "blunt"));
    }
  });

  it("S-combat-01: fur, skin, slime and feathers hold almost nothing against any blow", () => {
    for (const c of SOFT) for (const t of TYPES) expect(guard(c, t), `${c} ${t}`).toBeLessThanOrEqual(1);
  });

  it("S-combat-02: chrome holds best of all covers against every type of blow", () => {
    for (const t of TYPES) {
      for (const c of Object.keys(COVERS) as CoverId[]) {
        if (c === "chrome") continue;
        expect(guard("chrome", t), `chrome vs ${c} ${t}`).toBeGreaterThan(guard(c, t));
      }
    }
  });

  it("a node wears the weakest cover of its segments, type by type", () => {
    const b = human();
    b.segments[9]!.cover = "plates";
    // The chest carries the neck in skin and the torso in plates: skin is what a blow meets there.
    for (const t of TYPES) expect(coverAgainst(b, 2, t)).toBe(coverAgainst(human(), 2, t));
  });
});
