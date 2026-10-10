/**
 * Common sense of the load, second round (docs/tasks/sanity, findings
 * R2-body-01, R2-body-02, R2-body-03): mass slows a crawl as it slows a walk,
 * stands that give speed do not also lift the weight off it, and a membrane
 * weighs. Read over the bestiary, the foes, the human and 200 random mutants.
 */
import { describe, expect, it } from "vitest";
import { BEASTS, FOES, HUMAN_MASS, WING_LOAD, cloneBody, derive, fixtureBody, foeBody, human, mass, segmentIds, sortedIds, touch, weight, type Body } from "../index.js";
import { population } from "./gen.js";

const FIXTURES: { id: string; body: () => Body }[] = [
  { id: "human", body: () => human() },
  ...FOES.map((f) => ({ id: `foe:${f.id}`, body: () => foeBody(f) })),
  ...BEASTS.map((b) => ({ id: b.id, body: () => fixtureBody(b) })),
];
const MUTANTS = population(200);
const ALL: { id: string; body: () => Body }[] = [...FIXTURES, ...MUTANTS.map((b, i) => ({ id: `random:${i}`, body: () => cloneBody(b) }))];
const beast = (id: string): Body => fixtureBody(BEASTS.find((b) => b.id === id)!);
const HUMAN_SPEED = derive(human()).speed.value;

describe("R2-body-01: mass slows a crawl", () => {
  it("a thicker trunk never speeds a crawler, and slows every crawler past the human's mass", () => {
    const bad: string[] = [];
    let slower = 0;
    for (const { id, body } of ALL) {
      const b = body();
      const s = derive(b).speed;
      if (!s.crawl) continue;
      for (const sid of segmentIds(b)) {
        if (b.segments[sid]!.kind !== "torso") continue;
        const c = cloneBody(b);
        c.segments[sid]!.girth += 1;
        touch(c);
        const t = derive(c).speed;
        if (!t.crawl) continue;
        if (t.value > s.value) bad.push(`${id} ${sid}: ${s.value} -> ${t.value}`);
        else if (weight(c) > HUMAN_MASS && !(t.value < s.value)) bad.push(`${id} ${sid}: ${s.value} -> ${t.value} at ${Math.round(weight(c))}`);
        else if (t.value < s.value) slower += 1;
      }
    }
    expect(bad.slice(0, 10).join("\n")).toBe("");
    expect(slower).toBeGreaterThan(0);
  });

  it("the whale on land, thirty humans of mass, crawls slower than the snake and slower than a plain crawl", () => {
    const whale = derive(beast("whale")).speed;
    expect(whale.crawl).toBe(true);
    expect(whale.value).toBeLessThan(derive(beast("snake")).speed.value);
    expect(whale.value).toBeLessThan(25);
  });
});

describe("R2-body-02: the stands give speed, the mass takes it", () => {
  it("no stands lift the weight off: what the load leaves is at most the root of the human's mass over the body's", () => {
    const bad: string[] = [];
    for (const { id, body } of ALL) {
      const b = body();
      const s = derive(b).speed;
      const m = weight(b);
      if (s.burden > Math.min(1, Math.sqrt(HUMAN_MASS / m)) + 1e-9) bad.push(`${id}: burden ${s.burden.toFixed(2)} at ${Math.round(m)}`);
    }
    expect(bad.slice(0, 10).join("\n")).toBe("");
  });

  it("stands past the human's give less and less: a body never runs faster than the root of its support over his", () => {
    const bad: string[] = [];
    for (const { id, body } of ALL) {
      const s = derive(body()).speed;
      if (s.crawl || s.support <= 6) continue;
      const cap = HUMAN_SPEED * Math.sqrt(s.support / 6) * (s.ring ? 1.5 : 1);
      if (s.value > Math.round(cap)) bad.push(`${id}: ${s.value} on support ${s.support.toFixed(1)}`);
    }
    expect(bad.slice(0, 10).join("\n")).toBe("");
  });

  it("the centaur, 2.75 humans, is no more than half again as fast as the human", () => {
    expect(derive(beast("centaur")).speed.value).toBeLessThanOrEqual(1.5 * HUMAN_SPEED);
  });

  it("most mutants half again as heavy as the human are slower than him", () => {
    let heavy = 0;
    let notSlower = 0;
    for (const b of MUTANTS) {
      if (weight(b) <= 1.5 * HUMAN_MASS) continue;
      heavy += 1;
      if (derive(b).speed.value >= HUMAN_SPEED) notSlower += 1;
    }
    expect(heavy).toBeGreaterThan(50);
    expect(notSlower / heavy).toBeLessThan(0.2);
  });
});

describe("R2-body-03: a membrane weighs", () => {
  it("every body with a membrane weighs less without it; its flesh under the skeleton stays the same", () => {
    const bad: string[] = [];
    let seen = 0;
    for (const { id, body } of ALL) {
      const b = body();
      for (const mid of sortedIds(b.membranes)) {
        const c = cloneBody(b);
        delete c.membranes[mid];
        touch(c);
        seen += 1;
        if (!(weight(c) < weight(b)) || !(derive(c).budgets.weight < derive(b).budgets.weight)) bad.push(`${id} membrane ${mid}: ${weight(b)} -> ${weight(c)}`);
        if (mass(c) !== mass(b)) bad.push(`${id} membrane ${mid}: flesh ${mass(b)} -> ${mass(c)}`);
      }
    }
    expect(seen).toBeGreaterThan(10);
    expect(bad.slice(0, 10).join("\n")).toBe("");
  });

  it("every winged beast still flies with the weight of its wings", () => {
    for (const id of ["dragon", "youngDragon", "gargoyle", "griffin", "harpy", "basilisk", "bat", "sphinx", "mantis"]) {
      expect(derive(beast(id)).locomotion.fly, id).toBe(true);
    }
  });

  it("S3-body-02: no winged beast hangs within a few per cent of falling - a small edit of mass does not ground it", () => {
    const bad: string[] = [];
    for (const b of BEASTS) {
      const body = fixtureBody(b);
      const area = derive(body).locomotion.wings.reduce((a, w) => a + w.area, 0);
      if (area === 0) continue;
      const margin = (area * WING_LOAD) / weight(body) - 1;
      if (margin < 0.03) bad.push(`${b.id}: ${(margin * 100).toFixed(1)} %`);
    }
    expect(bad.join("\n")).toBe("");
  });
});
