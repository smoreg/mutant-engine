/**
 * One strike of a body, the one named, at one part of another body, named
 * too: what the arena's strike mode throws. The chance shown before the blow
 * is the chance the blow is thrown with, a blow that lands lands on that part
 * and nowhere else, and the preview's expected damage is the mean of what the
 * damage track takes.
 */
import { describe, expect, it } from "vitest";
import {
  BEASTS,
  aimStrike,
  beastById,
  nodeIds,
  coverAgainst,
  defenseOf,
  dodgeOf,
  fixtureBody,
  human,
  mindState,
  newHarm,
  organSlots,
  runBattle,
  strikeAt,
  strikes,
  LabRng,
} from "../index.js";

const dragon = () => fixtureBody(beastById("dragon")!);
const FIRE = "1.o23.2";
const HEAD = 1;

describe("aimStrike: the blow before it is thrown", () => {
  it("names the strike, the part, the chance and the expected damage", () => {
    const foe = human();
    const p = aimStrike(dragon(), FIRE, foe, newHarm(foe), HEAD)!;
    expect(p).not.toBeNull();
    expect(p.strike.kind).toBe("fireGland");
    expect(p.part).toBe(HEAD);
    expect(p.reach).toBe(true);
    expect(p.chance).toBeGreaterThan(0);
    expect(p.chance).toBeLessThanOrEqual(1);
    expect(p.defense).toBe(coverAgainst(foe, HEAD, "pierce"));
    expect(p.expected).toBeGreaterThan(0);
  });

  it("is null for a strike the body does not have or a part the target does not have", () => {
    const foe = human();
    expect(aimStrike(dragon(), "nope", foe, newHarm(foe), HEAD)).toBeNull();
    expect(aimStrike(dragon(), FIRE, foe, newHarm(foe), 999)).toBeNull();
  });

  it("a strike that does not reach says so and has no chance", () => {
    const me = human();
    const foe = human();
    const fist = strikes(me)[0]!;
    const p = aimStrike(me, fist.key, foe, newHarm(foe), HEAD, fist.reach + 1)!;
    expect(p.reach).toBe(false);
    expect(p.chance).toBe(0);
  });

  it("a target out cold does not dodge", () => {
    // Whoever of the bestiary gets out of the way at all.
    const nimble = BEASTS.map(fixtureBody).find((b) => dodgeOf(b) > 0)!;
    expect(nimble).toBeDefined();
    const foe = nimble;
    const part = nodeIds(foe)[0]!;
    const harm = newHarm(foe);
    const awake = aimStrike(dragon(), FIRE, foe, harm, part)!;
    for (const s of organSlots(foe)) harm.organs[s.key] = { ...harm.organs[s.key], out: 5 };
    expect(mindState(foe, harm).conscious).toBe(false);
    const cold = aimStrike(dragon(), FIRE, foe, harm, part)!;
    expect(cold.chance).toBeGreaterThan(awake.chance);
  });

  it("a squeeze counts half the cover, as the damage track does", () => {
    const foe = human();
    expect(coverAgainst(foe, 9, "squeeze")).toBe(Math.floor(defenseOf(foe, 9) * 0.5));
    expect(coverAgainst(foe, 9, "cut")).toBe(defenseOf(foe, 9));
  });
});

describe("strikeAt: the blow thrown", () => {
  it("dragon fire into a man's head lands on the head or misses, never elsewhere", () => {
    let hits = 0;
    const N = 200;
    let chance = 0;
    let expected = 0;
    let dealt = 0;
    for (let seed = 1; seed <= N; seed++) {
      const foe = human();
      const harm = newHarm(foe);
      const r = strikeAt(dragon(), FIRE, foe, harm, HEAD, new LabRng(`at:${seed}`))!;
      chance = r.preview.chance;
      expected = r.preview.expected;
      const hit = r.landed.events.find((e) => e.k === "hit");
      if (r.landed.hits > 0) {
        hits += 1;
        expect(hit, `seed ${seed}`).toBeDefined();
        expect(hit!.k === "hit" && hit!.id).toBe(HEAD);
        if (hit!.k === "hit") dealt += hit!.damage;
        for (const e of r.landed.events) if (e.k === "hit") expect(e.id).toBe(HEAD);
      } else {
        expect(r.landed.missed.map((s) => s.key)).toEqual([FIRE]);
        expect(r.landed.events).toEqual([]);
      }
    }
    // The share of hits is the chance shown, within the noise of 200 throws.
    expect(Math.abs(hits / N - chance)).toBeLessThan(0.1);
    // And what the hits carried is what was expected of them.
    expect(Math.abs(dealt / N - expected)).toBeLessThan(expected * 0.25);
  });

  it("the same seed is the same blow", () => {
    const one = () => {
      const foe = human();
      const harm = newHarm(foe);
      return strikeAt(dragon(), FIRE, foe, harm, HEAD, new LabRng("same"))!.landed.events;
    };
    expect(one()).toEqual(one());
  });

  it("a blow that does not reach is not thrown", () => {
    const me = human();
    const foe = human();
    const harm = newHarm(foe);
    const fist = strikes(me)[0]!;
    const r = strikeAt(me, fist.key, foe, harm, HEAD, new LabRng("far"), fist.reach + 1)!;
    expect(r.landed.hits).toBe(0);
    expect(r.landed.events).toEqual([]);
  });
});

describe("a fight names what struck", () => {
  it("every act of a battle lists its blows by kind, and its hits count the ones that hit", () => {
    const r = runBattle({ fighters: [{ id: "L", side: "L", body: human() }, { id: "R", side: "R", body: fixtureBody(beastById("wolf")!) }] }, new LabRng("names"));
    const acts = r.log.filter((e) => e.k === "act");
    expect(acts.length).toBeGreaterThan(0);
    for (const e of acts) {
      if (e.k !== "act") continue;
      expect(e.blows.length).toBe(e.strikes);
      expect(e.blows.filter((b) => b.hit).length).toBeGreaterThanOrEqual(e.hits);
    }
    expect(acts.some((e) => e.k === "act" && e.blows.some((b) => b.kind === "head" && b.bite === "fangs"))).toBe(true);
  });
});
