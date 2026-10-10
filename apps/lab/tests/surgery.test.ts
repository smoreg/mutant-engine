/**
 * The operating room (#3): the body as parts a player names, what can be done
 * to each, and what every operation does before it is done. What the page
 * shows must be what the lab then does: the outcome on a copy is the body the
 * command leaves.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HUMAN_IDS, bodyHash, human, validate, decodeCommand, encodeCommand, run, type LabState, anatomy, operationsFor, outcomeOf, type Part } from "@mutant-engine/core";
import { randomSet, stateOf } from "../mutator/model.js";

function partOf(parts: Part[], group: Part["group"], i = 0): Part {
  const p = parts.filter((x) => x.group === group)[i];
  if (p === undefined) throw new Error(`no ${group} ${i}`);
  return p;
}

describe("the parts of a body", () => {
  it("a human is a head, a neck, a torso, two arms with hands and two legs with feet", () => {
    const parts = anatomy(human());
    // Arms and legs bend: an upper arm and a forearm each, a thigh and a shin; the hand and the foot sit on the lower part.
    const arms = parts.filter((p) => p.group === "arms");
    const legs = parts.filter((p) => p.group === "legs");
    expect(arms).toHaveLength(4);
    expect(legs).toHaveLength(4);
    expect(arms.filter((a) => a.organs.some((o) => o.organ.kind === "hand")).map((a) => a.segment)).toEqual([HUMAN_IDS.forearmL, HUMAN_IDS.forearmR]);
    expect(legs.filter((l) => l.organs.some((o) => o.organ.kind === "foot")).map((l) => l.segment)).toEqual([HUMAN_IDS.shinL, HUMAN_IDS.shinR]);
    const head = parts.find((p) => p.segment === null)!;
    expect(head.ru).toBe("голова");
    // The eyes are inside the head and can be taken one by one.
    expect(head.organs.filter((o) => o.organ.kind === "eye" && o.inside !== undefined)).toHaveLength(2);
    expect(parts.find((p) => p.group === "torso")!.organs.map((o) => o.organ.kind)).toEqual(expect.arrayContaining(["heart", "lungs", "stomach"]));
  });

  it("every part of 30 grown bodies is listed once, with names a player reads", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const body = run(stateOf(seed, randomSet(seed, 25)), { light: true }).body;
      const parts = anatomy(body);
      const segs = parts.filter((p) => p.segment !== null).map((p) => p.segment);
      expect(new Set(segs).size).toBe(segs.length);
      expect(segs.length).toBe(Object.keys(body.segments).length);
      for (const p of parts) expect(p.ru).not.toMatch(/undefined|NaN/);
    }
  });
});

describe("an operation, before it is done", () => {
  it("taking a hand: no wound, the hand leaves, grips fall - worse", () => {
    const body = human();
    // The hand is on the forearm, the second arm part.
    const arm = anatomy(body).find((p) => p.segment === HUMAN_IDS.forearmL)!;
    const hand = operationsFor(body, arm).find((o) => o.kind === "excise" && o.what === "кисть")!;
    const out = outcomeOf(body, hand);
    expect(out.wound).toBe(false);
    expect(out.gone).toEqual(["кисть"]);
    expect(out.mass).toBeGreaterThan(0);
    const grips = out.stats.find((s) => s.key === "grips")!;
    expect(grips.verdict).toBe("worse");
  });

  it("cutting a leg off at its base leaves a wound and takes the foot with it", () => {
    const body = human();
    // The first leg part is the thigh: cut at the hip, it takes the shin and the foot with it.
    const leg = partOf(anatomy(body), "legs");
    expect(leg.segment).toBe(HUMAN_IDS.legL);
    const amp = operationsFor(body, leg).find((o) => o.kind === "amputate")!;
    const out = outcomeOf(body, amp);
    expect(out.wound).toBe(true);
    expect(out.gone).toEqual(expect.arrayContaining(["нога ×2", "стопа"]));
    expect(out.stats.find((s) => s.key === "speed")!.verdict).toBe("worse");
  });

  it("says in plain words what the body stops being able to do: the second eye out blinds it", () => {
    const body = human();
    const head = anatomy(body).find((p) => p.segment === null)!;
    const eyes = operationsFor(body, head).filter((o) => o.what.startsWith("глаз"));
    expect(eyes).toHaveLength(2);
    expect(outcomeOf(body, eyes[0]!).warnings).not.toContain("ослепнет");
    const one = outcomeOf(body, eyes[0]!).after;
    const last = operationsFor(one, anatomy(one).find((p) => p.segment === null)!).find((o) => o.what.startsWith("глаз"))!;
    expect(outcomeOf(one, last).warnings).toContain("ослепнет");
  });

  it("warns about what is vital: the heart of a human is its last", () => {
    const body = human();
    const torso = partOf(anatomy(body), "torso");
    const heart = operationsFor(body, torso).find((o) => o.what === "сердце")!;
    const out = outcomeOf(body, heart);
    expect(out.warnings.join(" ")).toMatch(/жизненно важное: сердце/);
    expect(out.warnings).toContain("не останется сердца");
  });

  it("the outcome is what the lab then does: every operation on 10 grown bodies replays to the body the preview showed", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const state: LabState = stateOf(seed, randomSet(seed, 15));
      const r = run(state);
      const body = r.body;
      const name = (step: number): string | null => (r.steps[step]?.event.kind === "mutate" ? `шаг ${step}` : null);
      for (const part of anatomy(body)) {
        for (const o of operationsFor(body, part, name)) {
          const back = decodeCommand(o.code);
          expect(back, o.code).toEqual(o.command);
          expect(encodeCommand(o.command)).toBe(o.code);
          const out = outcomeOf(body, o);
          const done = run({ ...state, commands: [...state.commands, o.command] }, { resume: r }).body;
          expect(bodyHash(done), `seed ${seed}: ${o.verb} ${o.what}`).toBe(bodyHash(out.after));
          expect(validate(out.after), `seed ${seed}: ${o.verb} ${o.what}`).toEqual([]);
        }
      }
    }
  }, 120_000);

  it("keeps the DOM out", () => {
    const text = readFileSync(join(import.meta.dirname, "..", "..", "..", "packages", "core", "knife-ops.ts"), "utf8");
    for (const re of [/\bdocument\b/, /\bwindow\b/, /Math\.random/, /Date\.now/]) expect(text).not.toMatch(re);
  });
});
