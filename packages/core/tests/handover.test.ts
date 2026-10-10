import { describe, expect, it } from "vitest";
import {
  HUMAN_IDS,
  apply,
  bodyFromText,
  bodyHash,
  bodyToText,
  brainOrgan,
  brains,
  cloneBody,
  controlCap,
  controlLoad,
  handover,
  handoverCandidates,
  human,
  organ,
  pickHandover,
  selfRef,
  setSelf,
  territories,
  validate,
  type Body,
} from "../index.js";
import { brainyBody } from "./genHeads.js";

const head = (sway: number) => ({ kind: "neck", length: 1, girth: 1, cover: "skin", ending: organ("head", [brainOrgan(sway), organ("eye")]) }) as const;

/** Heads sprout from a shoulder (as far from you as the old chest) or a hip (as far as the old pelvis). */
function withHeads(...at: number[]): Body {
  const b = human(1000);
  for (const node of at) apply(b, "sprout", head(0), { node });
  return b;
}

describe("handover", () => {
  it("handover: nearest living brain, tie -> more channels, tie -> id", () => {
    // A head off a shoulder (distance 2) and one off a hip (distance 4).
    const b = withHeads(HUMAN_IDS.shoulderR, HUMAN_IDS.hipL);
    expect(brains(b).map((x) => x.key)).toEqual(["n1.0", "n32.0", "n34.0"]);
    expect(handover(b)).toEqual({ node: 32, end: 0 });
    expect(handoverCandidates(b)).toEqual([
      { ref: { node: 32, end: 0 }, distance: 2, channels: 10 },
      { ref: { node: 34, end: 0 }, distance: 4, channels: 10 },
    ]);

    // Two heads off one shoulder: the same distance, the lower id wins.
    const tie = withHeads(HUMAN_IDS.shoulderR, HUMAN_IDS.shoulderR);
    expect(handover(tie)).toEqual({ node: 32, end: 0 });

    // The comparator alone: channels break a distance tie, then the order of the list (id).
    const a = { ref: { node: 20, end: 0 }, distance: 2, channels: 6 };
    const c = { ref: { node: 14, end: 0 }, distance: 2, channels: 10 };
    expect(pickHandover([a, c])).toEqual(c.ref);
    expect(pickHandover([{ ...a, channels: 10 }, c])).toEqual(c.ref);
    expect(pickHandover([c, { ...a, channels: 10 }])).toEqual(c.ref);
    expect(pickHandover([{ ...a, distance: 1 }, c])).toEqual(a.ref);
    expect(pickHandover([])).toBeNull();
  });

  it("a dead brain is skipped, and with nobody left there is no handover", () => {
    const b = withHeads(HUMAN_IDS.shoulderR, HUMAN_IDS.hipL);
    b.nodes[32]!.ischemia = 5;
    expect(handover(b)).toEqual({ node: 34, end: 0 });
    expect(handoverCandidates(b).map((c) => c.ref)).toEqual([{ node: 34, end: 0 }]);
    b.nodes[34]!.ischemia = 7;
    expect(handover(b)).toBeNull();
    expect(handover(human())).toBeNull();
  });

  it("a brain in a cavity is measured to the middle of its torso", () => {
    const b = human(1000);
    apply(b, "thicken", {}, { segment: HUMAN_IDS.armL });
    b.segments[HUMAN_IDS.armL]!.cavity.push(brainOrgan(0));
    apply(b, "sprout", head(0), { node: HUMAN_IDS.hipL });
    // Cavity: shoulder 1 + half of the upper arm's 1; head off a hip: 3 + 1.
    expect(handoverCandidates(b)).toEqual([
      { ref: { segment: HUMAN_IDS.armL, slot: 0 }, distance: 1.5, channels: 10 },
      { ref: { node: 32, end: 0 }, distance: 4, channels: 10 },
    ]);
    expect(handover(b)).toEqual({ segment: HUMAN_IDS.armL, slot: 0 });
  });

  it("you move: self points at the new brain, the body stays valid", () => {
    const b = withHeads(HUMAN_IDS.shoulderR);
    const to = handover(b)!;
    setSelf(b, to);
    expect(b.self).toEqual({ node: 32 });
    expect(selfRef(b)).toEqual({ node: 32, end: 0 });
    expect(brains(b).map((x) => x.self)).toEqual([false, true]);
    expect(validate(b)).toEqual([]);
    expect(controlCap(b)).toBe(20);
    expect(controlLoad(b)).toBeGreaterThan(0);
    expect(bodyToText(b)).toContain("32[1] {голова(мозг*, глаз)}");
    expect(bodyToText(b)).toContain("1[2] {голова(мозг, глаз, глаз, челюсть, ухо, ухо, нос)}");
    // The old head is now a foreign brain with no sway: it keeps only what is strictly closer to it.
    const old = territories(b).find((t) => t.brain.key === "n1.0")!;
    expect(old.nodes).toEqual([HUMAN_IDS.head]);
    expect(handover(b)).toEqual({ node: 1, end: 0 });
  });

  it("two brains in one node: handover lands on the other ending, and the text says which", () => {
    const b = bodyFromText(`
      голова[2] {голова(мозг*, глаз), голова(мозг!2, глаз)}
      грудь[3]
      таз[3]
      голова -шея:1/1 кожа- грудь
      грудь -корпус:2/3 кожа {сердце}- таз
    `);
    expect(handoverCandidates(b)).toEqual([{ ref: { node: 1, end: 1 }, distance: 0, channels: 10 }]);
    setSelf(b, handover(b)!);
    expect(b.self).toEqual({ node: 1, end: 1 });
    expect(bodyToText(b)).toContain("1[2] {голова(мозг, глаз), голова(мозг!2*, глаз)}");
    const back = bodyFromText(bodyToText(b));
    expect(back.self).toEqual({ node: 1, end: 1 });
    expect(bodyHash(back)).toBe(bodyHash(b));
    expect(validate(b)).toEqual([]);
  });

  it("handover is pure and deterministic", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const a = brainyBody(seed);
      const before = bodyHash(a);
      const pick = handover(a);
      const list = handoverCandidates(a);
      expect(bodyHash(a)).toBe(before);
      expect(handover(cloneBody(a))).toEqual(pick);
      expect(handoverCandidates(brainyBody(seed))).toEqual(list);
      expect(pick).toEqual(list.length === 0 ? null : list[0]!.ref);
      for (let i = 1; i < list.length; i++) {
        const x = list[i - 1]!;
        const y = list[i]!;
        expect(x.distance <= y.distance).toBe(true);
        if (x.distance === y.distance) expect(x.channels >= y.channels).toBe(true);
      }
      for (const c of list) {
        const brain = brains(a).find((x) => JSON.stringify(x.ref) === JSON.stringify(c.ref))!;
        expect(brain.alive).toBe(true);
        expect(brain.self).toBe(false);
      }
    }
  });
});
