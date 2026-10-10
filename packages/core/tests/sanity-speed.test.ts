/**
 * Common sense of speed (docs/tasks/sanity, findings S-size-03, S-size-04,
 * S-move-05, S-move-06, S-move-07): the load on the stands slows the body, a
 * big body dodges worse, a longer belly crawls faster, one leg limps, and a
 * heavy leg is no free stride. Read over the bestiary, the foes, the human and
 * 200 random mutants.
 */
import { describe, expect, it } from "vitest";
import {
  BEASTS,
  COVERS,
  CRAWL_LENGTH,
  FOES,
  HUMAN_IDS,
  HUMAN_MASS,
  cloneBody,
  derive,
  dodgeOf,
  fixtureBody,
  foeBody,
  human,
  removeElements,
  segmentIds,
  touch,
  weight,
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

const speedOf = (b: Body): number => derive(b).speed.value;

/** The body with one segment one girth thicker, or null when its cover does not stretch. */
function thicker(b: Body, sid: number): Body | null {
  if (!COVERS[b.segments[sid]!.cover].stretches) return null;
  const c = cloneBody(b);
  c.segments[sid]!.girth += 1;
  touch(c);
  return c;
}

describe("the load on the stands", () => {
  it("S-size-03: flesh on the trunk never makes a walking body faster, and past the human's load it makes it slower", () => {
    const bad: string[] = [];
    let slower = 0;
    for (const { id, body } of ALL) {
      const b = body();
      const v = speedOf(b);
      if (derive(b).speed.stands.length === 0) continue;
      for (const sid of segmentIds(b)) {
        if (b.segments[sid]!.kind !== "torso") continue;
        const c = thicker(b, sid);
        if (c === null) continue;
        if (speedOf(c) > v) bad.push(`${id} ${sid}: ${v} -> ${speedOf(c)}`);
        if (speedOf(c) < v) slower += 1;
      }
    }
    expect(bad.slice(0, 10).join("\n")).toBe("");
    expect(slower).toBeGreaterThan(50);
  });

  it("S-size-03: a beast three times the human's mass is not faster than the human", () => {
    const dragon = fixtureBody(BEASTS.find((b) => b.id === "dragon")!);
    expect(speedOf(dragon)).toBeLessThanOrEqual(speedOf(human()));
  });

  it("S-move-07: a thicker leg is no free stride - it never makes the body faster", () => {
    const bad: string[] = [];
    for (const { id, body } of ALL) {
      const b = body();
      const v = speedOf(b);
      for (const sid of segmentIds(b)) {
        if (b.segments[sid]!.kind !== "leg") continue;
        const c = thicker(b, sid);
        if (c !== null && speedOf(c) > v) bad.push(`${id} ${sid}: ${v} -> ${speedOf(c)}`);
      }
    }
    expect(bad.slice(0, 10).join("\n")).toBe("");
  });

  it("S-move-07: long legs stride further, but long heavy ones pay for their weight", () => {
    const long = (girth: number): Body => {
      const b = human();
      for (const sid of [HUMAN_IDS.legL, HUMAN_IDS.legR]) {
        b.segments[sid]!.length = 5;
        b.segments[sid]!.girth = girth;
      }
      touch(b);
      return b;
    };
    expect(speedOf(long(1))).toBeGreaterThan(speedOf(human()));
    expect(speedOf(long(3))).toBeLessThan(speedOf(long(1)));
  });
});

describe("how the body moves", () => {
  it("S-size-04: a bigger body dodges no better - flesh on the trunk never raises the dodge; the dragon dodges worse than the human", () => {
    const bad: string[] = [];
    for (const { id, body } of FIXTURES) {
      const b = body();
      const d = dodgeOf(b);
      for (const sid of segmentIds(b)) {
        if (b.segments[sid]!.kind !== "torso") continue;
        const c = thicker(b, sid);
        if (c !== null && dodgeOf(c) > d) bad.push(`${id} ${sid}: ${d} -> ${dodgeOf(c)}`);
      }
    }
    expect(bad.join("\n")).toBe("");
    expect(dodgeOf(fixtureBody(BEASTS.find((b) => b.id === "dragon")!))).toBeLessThan(dodgeOf(human()));
  });

  it("S-move-06: one leg limps - slower than half the same body on two", () => {
    const one = human();
    removeElements(one, [HUMAN_IDS.legR, HUMAN_IDS.kneeR, HUMAN_IDS.shinR, HUMAN_IDS.footR]);
    expect(derive(one).speed.stands).toHaveLength(1);
    expect(speedOf(one)).toBeLessThan(speedOf(human()) / 2);
  });

  it("S-move-05: a longer belly crawls faster, as long as it is not too heavy for it", () => {
    const bad: string[] = [];
    let seen = 0;
    for (const { id, body } of ALL) {
      const b = body();
      const s = derive(b).speed;
      if (!s.crawl) continue;
      const belly = segmentIds(b).filter((sid) => ["torso", "tail"].includes(b.segments[sid]!.kind));
      const longest = belly.sort((x, y) => b.segments[y]!.length - b.segments[x]!.length)[0]!;
      // Crawled on tentacles in suckers, not in waves of the belly.
      if (b.segments[longest]!.length < CRAWL_LENGTH) continue;
      const c = cloneBody(b);
      c.segments[longest]!.length += 1;
      touch(c);
      seen += 1;
      // A longer belly is a heavier one too (decision 1290): at the human's weight or less it crawls faster, past it never slower.
      if (speedOf(c) < s.value || (weight(c) <= HUMAN_MASS && !(speedOf(c) > s.value))) bad.push(`${id}: ${s.value} -> ${speedOf(c)}`);
    }
    expect(seen).toBeGreaterThan(0);
    expect(bad.slice(0, 10).join("\n")).toBe("");
  });
});
