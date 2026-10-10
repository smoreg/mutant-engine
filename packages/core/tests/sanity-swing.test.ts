/**
 * Common sense of the swing (docs/tasks/sanity, package q3, decision 1300): a
 * limb swings as a pendulum - its time is the root of its lever, and the mass
 * it carries only moves where the lever balances. A thick limb is not a slow
 * one, a long one is. Read over the bestiary, the foes, the human and 200
 * random mutants.
 */
import { describe, expect, it } from "vitest";
import { BEASTS, FOES, cloneBody, fixtureBody, foeBody, human, strikes, touch, type Body } from "../index.js";
import { population } from "./gen.js";

const ALL: { id: string; body: () => Body }[] = [
  { id: "human", body: () => human() },
  ...FOES.map((f) => ({ id: `foe:${f.id}`, body: () => foeBody(f) })),
  ...BEASTS.map((b) => ({ id: b.id, body: () => fixtureBody(b) })),
  ...population(200).map((b, i) => ({ id: `random:${i}`, body: () => cloneBody(b) })),
];

/** The same body with every segment scaled: `length` times as long, `girth` times as thick. */
function scaled(body: Body, length: number, girth: number): Body {
  const b = cloneBody(body);
  for (const s of Object.values(b.segments)) {
    s.length *= length;
    s.girth *= girth;
  }
  touch(b);
  return b;
}

/** Time of every swung blow by key: a gland keeps the time of its own row. */
function swung(body: Body): Map<string, number> {
  return new Map(strikes(body).filter((s) => s.cost === 0 && s.chain.length > 0).map((s) => [s.key, s.time]));
}

describe("a blow swings as a pendulum", () => {
  it("q3-1: a limb four times as thick - sixteen times the mass - swings no slower", () => {
    const bad: string[] = [];
    for (const { id, body } of ALL) {
      const b = body();
      const thick = swung(scaled(b, 1, 4));
      for (const [key, t] of swung(b)) {
        const u = thick.get(key);
        if (u !== undefined && u > t) bad.push(`${id} ${key}: ${t} -> ${u}`);
      }
    }
    expect(bad.slice(0, 10).join("\n")).toBe("");
  });

  it("q3-1: a limb twice as long swings about the root of two slower, whatever it carries", () => {
    const bad: string[] = [];
    for (const { id, body } of ALL) {
      const b = body();
      const long = swung(scaled(b, 2, 1));
      for (const [key, t] of swung(b)) {
        const u = long.get(key);
        if (u === undefined || t <= 100 || u >= 300) continue;
        const r = u / t;
        if (r < 1.25 || r > 1.6) bad.push(`${id} ${key}: ${t} -> ${u} (x${r.toFixed(2)})`);
      }
    }
    expect(bad.slice(0, 10).join("\n")).toBe("");
  });

  it("q3-1: a limb as long as the human's arm swings as quick as his arm, however heavy", () => {
    const bear = BEASTS.find((b) => b.id === "bear")!;
    const b = fixtureBody(bear);
    for (const s of strikes(b)) {
      const length = s.chain.reduce((n, sid) => n + b.segments[sid]!.length, 0);
      if (s.kind === "claw" && length === 2) expect(s.time, `${s.key} m${s.mass}`).toBe(100);
    }
  });
});
