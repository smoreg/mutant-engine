/**
 * Common sense of getting anywhere (docs/tasks/sanity, finding S3-body-01):
 * a body that has something to push against the ground with - an arm, a leg,
 * a tentacle, a tail - moves, if only by dragging itself. A limb without a
 * foot is no stand, but it is not nothing. Read over the bestiary, the foes,
 * 200 random mutants and 100 bodies of the abyss.
 */
import { describe, expect, it } from "vitest";
import { BEASTS, CRAWL_SPEED, FOES, cloneBody, derive, fixtureBody, foeBody, human, segmentIds, touch, works, type Body } from "../index.js";
import { abyssBody } from "../bench/source.js";
import { population } from "./gen.js";

const LIMBS = new Set(["arm", "leg", "tail"]);

const ALL: { id: string; body: () => Body }[] = [
  { id: "human", body: () => human() },
  ...FOES.map((f) => ({ id: `foe:${f.id}`, body: () => foeBody(f) })),
  ...BEASTS.map((b) => ({ id: b.id, body: () => fixtureBody(b) })),
  ...population(200).map((b, i) => ({ id: `random:${i}`, body: () => cloneBody(b) })),
  ...Array.from({ length: 100 }, (_, i) => ({ id: `abyss:${i + 1}`, body: () => abyssBody(i + 1, 12) })),
];

function limbs(body: Body): number {
  return segmentIds(body).filter((id) => {
    const s = body.segments[id]!;
    return LIMBS.has(s.kind) && works(body, s.a) && works(body, s.b);
  }).length;
}

describe("whatever can push, moves", () => {
  it("S3-body-01: a body with a working limb is never stuck where it lies", () => {
    const bad: string[] = [];
    for (const { id, body } of ALL) {
      const b = body();
      if (limbs(b) === 0) continue;
      const d = derive(b);
      const l = d.locomotion;
      if (d.speed.value <= 0 && !l.swim && !l.fly && !l.dig && !l.climb) bad.push(`${id}: ${limbs(b)} limbs, stands ${d.speed.stands.length}, speed 0`);
    }
    expect(bad.slice(0, 10).join("\n")).toBe("");
  });

  it("S3-body-01: dragging on limbs is slow - never faster than a crawl in waves", () => {
    const bad: string[] = [];
    for (const { id, body } of ALL) {
      const b = body();
      const s = derive(b).speed;
      if (s.crawl && s.value > CRAWL_SPEED * 3) bad.push(`${id}: crawls at ${s.value}`);
    }
    expect(bad.slice(0, 10).join("\n")).toBe("");
  });

  it("S3-body-01: a man whose feet are gone drags himself on his arms, slower than any crawl in waves", () => {
    const b = human();
    for (const n of Object.values(b.nodes)) n.ends = n.ends.filter((e) => e.kind !== "foot");
    touch(b);
    const s = derive(b).speed;
    expect(s.stands).toHaveLength(0);
    expect(s.crawl).toBe(true);
    expect(s.value).toBeGreaterThan(0);
    expect(s.value).toBeLessThan(CRAWL_SPEED);
  });
});
