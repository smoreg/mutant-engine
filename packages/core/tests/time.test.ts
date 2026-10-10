/**
 * Time (`packages/core/time.ts`): one turn of everything time does to a body, in
 * one call. Every clock the model keeps - wounds and blood, hunger and
 * healing, a wandering ending, a creeping cover, a tumour's pressure, flesh
 * that remembers a lost part - moves by `elapse` and by nothing else, so the
 * lab, the yard, the field and the sand cannot run different clocks.
 */
import { describe, expect, it } from "vitest";
import { LabRng as Rng } from "../rng.js";
import {
  HUMAN_IDS,
  SPREAD,
  apply,
  applyMutationAt,
  bleedOf,
  bodyHash,
  cloneBody,
  elapse,
  human,
  newHarm,
  organ,
  segmentIds,
  type Body,
  type Mutation,
  MUTATIONS,
} from "../index.js";

function byId(id: string): Mutation {
  const m = MUTATIONS.find((x) => x.id === id);
  if (m === undefined) throw new Error(`no mutation ${id} in the catalog`);
  return m;
}

function covered(b: Body, cover: string): number {
  return segmentIds(b).filter((id) => b.segments[id]!.cover === cover).length;
}

function chitined(): Body {
  const b = human(1000);
  const r = applyMutationAt(b, byId("chitin"), { segment: HUMAN_IDS.armL });
  expect(r.fallback).toBe(false);
  return b;
}

describe("elapse", () => {
  it("creeps a cover one segment every 30 turns, with a record of wounds and without one", () => {
    const bare = chitined();
    const rng = new Rng(1);
    for (let i = 0; i < SPREAD.coverTurns - 1; i++) elapse(bare, rng);
    expect(covered(bare, "chitin")).toBe(1);
    const last = elapse(bare, rng);
    expect(last.crept).toEqual([{ cover: "chitin", segment: HUMAN_IDS.neck }]);
    expect(covered(bare, "chitin")).toBe(2);

    const hurt = chitined();
    const harm = newHarm(hurt);
    for (let i = 0; i < SPREAD.coverTurns * 3; i++) elapse(hurt, rng, { harm, upkeep: false });
    expect(covered(hurt, "chitin")).toBe(4);
    expect(harm.turn).toBe(SPREAD.coverTurns * 3);
  });

  it("presses the organs next to a tumour by 5 every 50 turns", () => {
    const b = human(1000);
    apply(b, "organ", { organ: organ("spines"), mount: "growth" }, { segment: HUMAN_IDS.armL });
    apply(b, "growth", {}, { node: HUMAN_IDS.shoulderL });
    const harm = newHarm(b);
    const rng = new Rng(2);
    for (let i = 0; i < SPREAD.pressureTurns - 1; i++) expect(elapse(b, rng, { harm, upkeep: false }).pressed).toEqual([]);
    expect(elapse(b, rng, { harm, upkeep: false }).pressed).toEqual([HUMAN_IDS.torso, HUMAN_IDS.armL]);
    expect(b.segments[HUMAN_IDS.armL]!.growths[0]!.instability).toBe(SPREAD.pressure);
  });

  it("heals a wound off the reserve, and binds the worst bleed when asked and the body has hands", () => {
    const b = human();
    const harm = newHarm(b);
    b.segments[HUMAN_IDS.armL]!.hp = 2;
    const rng = new Rng(3);
    const events = [];
    for (let i = 0; i < 100; i++) events.push(...elapse(b, rng, { harm, rest: true }).events);
    expect(b.segments[HUMAN_IDS.armL]!.hp).toBeGreaterThan(2);
    expect(events.some((e) => e.k === "healed")).toBe(true);

    const cut = human();
    const ch = newHarm(cut);
    cut.segments[HUMAN_IDS.legL]!.bleed = 12;
    const ev = elapse(cut, rng, { harm: ch, bind: true }).events;
    expect(ev.find((e) => e.k === "bandaged")).toMatchObject({ id: HUMAN_IDS.legL });
    expect(bleedOf(cut, ch, HUMAN_IDS.legL)).toBeLessThan(12);
  });

  it("ages wounds and runs the blood on a body with no record of wounds", () => {
    const b = human();
    b.segments[HUMAN_IDS.armL]!.wound = 3;
    const out = elapse(b, new Rng(4));
    expect(b.segments[HUMAN_IDS.armL]!.wound).toBe(2);
    expect(out.ischemia).not.toBeNull();
    expect(out.events).toEqual([]);
  });

  it("does nothing to a dead body", () => {
    const b = chitined();
    const harm = newHarm(b);
    harm.dead = "blood";
    const before = bodyHash(b);
    for (let i = 0; i < SPREAD.coverTurns * 2; i++) elapse(b, new Rng(5), { harm });
    expect(bodyHash(b)).toBe(before);
  });

  it("is a function of the body and the seed", () => {
    const start = chitined();
    apply(start, "growth", {}, { node: HUMAN_IDS.shoulderR });
    const run = (): string => {
      const b = cloneBody(start);
      const harm = newHarm(b);
      const rng = new Rng(77);
      for (let i = 0; i < 400; i++) elapse(b, rng, { harm, rest: i % 2 === 0 });
      return bodyHash(b) + JSON.stringify(harm);
    };
    expect(run()).toBe(run());
  });
});
