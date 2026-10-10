import { describe, expect, it } from "vitest";
import { LabRng as Rng } from "../rng.js";
import {
  AWAKE_BETWEEN,
  HEAL_COST,
  HEAL_RATE,
  KNIT_PACE,
  KNIT_TAX,
  START_RESERVE,
  HUMAN_IDS,
  MAX_BLACKOUT,
  SWAMP_IDS,
  VENOM_TURNS,
  aimChance,
  bloodMax,
  bodyFromText,
  bodyHash,
  brains,
  cloneBody,
  defenseOf,
  drawMutation,
  applyMutation,
  elementState,
  fed,
  feed,
  human,
  hurtBrains,
  infect,
  keyOf,
  mindState,
  newHarm,
  organSlots,
  segmentIds,
  separate,
  separatePreview,
  splitHarm,
  strike,
  swampMutant,
  turn,
  validate,
  type Body,
  type Harm,
  type HarmEvent,
  type HitType,
  MUTATIONS,
} from "../index.js";
import { chain } from "./genHeads.js";

/** A source that always returns the same number: 0 lands every chance, 0.999 misses every one. */
const fixed = (v: number) => ({ next: () => v });

function wait(body: Body, harm: Harm, n: number, rest = false, rng = fixed(0.5)): HarmEvent[] {
  const out: HarmEvent[] = [];
  for (let i = 0; i < n; i++) out.push(...turn(body, harm, { rest, upkeep: false }, rng));
  return out;
}

function selfKey(body: Body): string {
  const me = brains(body).find((b) => b.self)!;
  return organSlots(body).find((s) => s.organ === me.organ)!.key;
}

function mutant(seed: number, strikes: number): Body {
  const b = human();
  const rng = new Rng(seed);
  for (let i = 0; i < strikes; i++) {
    const m = drawMutation(MUTATIONS, rng, { body: b, defect: rng.next() < 0.15, decay: true })!;
    applyMutation(b, m, rng, { source: "abyss" });
  }
  return b;
}

describe("a blow lands on one element", () => {
  it("takes hp, bleeds damage / 5 and hurts your brain by half of it", () => {
    const b = human();
    const h = newHarm(b);
    const ev = strike(b, h, { damage: 10, profile: "at", aim: HUMAN_IDS.torso }, fixed(0.999));
    const hit = ev.find((e) => e.k === "hit")!;
    expect(hit).toMatchObject({ id: HUMAN_IDS.torso, damage: 10, bleed: 2, before: "whole", after: "hurt" });
    expect(b.segments[HUMAN_IDS.torso]!.hp).toBe(18);
    expect(b.segments[HUMAN_IDS.torso]!.bleed).toBe(2);
    expect(h.organs[selfKey(b)]!.pain).toBe(5);
  });

  it("meets the cover: chitin takes 2 off a cut, a node wears the weakest cover around it, and what it holds whole takes nothing (decision 1282)", () => {
    const b = human();
    b.segments[HUMAN_IDS.forearmL]!.cover = "chitin";
    const h = newHarm(b);
    const ev = strike(b, h, { damage: 2, type: "cut", profile: "at", aim: HUMAN_IDS.forearmL }, fixed(0.999));
    expect(ev.find((e) => e.k === "hit")).toMatchObject({ defense: 2, damage: 0 });
    // The hand hangs off the chitin forearm and nothing else: it wears chitin too.
    const ev2 = strike(b, h, { damage: 5, type: "cut", profile: "at", aim: HUMAN_IDS.handL }, fixed(0.999));
    expect(ev2.find((e) => e.k === "hit")).toMatchObject({ defense: 2, damage: 3 });
  });

  it("states follow hp: whole, hurt, broken at 0, destroyed below -hpMax/2", () => {
    expect(elementState(12, 12)).toBe("whole");
    expect(elementState(1, 12)).toBe("hurt");
    expect(elementState(0, 12)).toBe("broken");
    expect(elementState(-5, 12)).toBe("broken");
    expect(elementState(-6, 12)).toBe("destroyed");
  });

  it("a destroyed arm tears off at the shoulder: the hand leaves, the stump bleeds 4 x girth", () => {
    const b = human();
    const h = newHarm(b);
    const ev = strike(b, h, { damage: 30, profile: "at", aim: HUMAN_IDS.armL }, fixed(0.999));
    const torn = ev.find((e) => e.k === "torn");
    // The upper arm hangs off the shoulder node, and everything past the elbow goes with it.
    expect(torn).toMatchObject({ segment: HUMAN_IDS.armL, stump: HUMAN_IDS.shoulderL, bleed: 4 });
    expect(b.nodes[HUMAN_IDS.handL]).toBeUndefined();
    expect(b.nodes[HUMAN_IDS.elbowL]).toBeUndefined();
    expect(b.segments[HUMAN_IDS.armL]).toBeUndefined();
    expect(b.segments[HUMAN_IDS.forearmL]).toBeUndefined();
    expect(validate(b)).toEqual([]);
    expect(h.blood).toBeLessThanOrEqual(bloodMax(b));
  });

  it("a broken element passes no blood: the hand beyond a broken arm starves", () => {
    const b = human();
    const h = newHarm(b);
    strike(b, h, { damage: 8, profile: "at", aim: HUMAN_IDS.forearmL }, fixed(0.999));
    expect(b.segments[HUMAN_IDS.forearmL]!.hp).toBe(0);
    expect(fed(b).has(HUMAN_IDS.handL)).toBe(false);
    // Starving, so the arm does not knit back and let the blood through again.
    h.reserve = 0;
    wait(b, h, 10);
    expect(b.nodes[HUMAN_IDS.handL]!.ischemia).toBe(10);
  });

  it("an organ inside takes the blow with damage / hpMax: hurt, then destroyed", () => {
    const b = human();
    const h = newHarm(b);
    strike(b, h, { damage: 14, profile: "at", aim: HUMAN_IDS.torso }, fixed(0));
    const hurt = Object.entries(h.organs).filter(([, s]) => s.hurt === true);
    expect(hurt).toHaveLength(1);
    const before = organSlots(b).length;
    strike(b, h, { damage: 1, profile: "at", aim: HUMAN_IDS.torso }, fixed(0));
    expect(organSlots(b).length).toBe(before - 1);
  });
});

describe("the heart, the brain and death", () => {
  it("one heart: a broken torso kills your brain in 5 turns", () => {
    const b = human();
    const h = newHarm(b);
    strike(b, h, { damage: 28, profile: "at", aim: HUMAN_IDS.torso }, fixed(0.999));
    expect(b.segments[HUMAN_IDS.torso]!.hp).toBe(0);
    wait(b, h, 4);
    expect(h.dead).toBeNull();
    wait(b, h, 1);
    expect(h.dead).toBe("brain");
  });

  it("blood 0 is death by blood; pain alone never kills", () => {
    const b = human();
    const h = newHarm(b);
    h.organs[selfKey(b)] = { pain: 100 };
    wait(b, h, 300);
    expect(h.dead).toBeNull();
    b.segments[HUMAN_IDS.torso]!.bleed = 60;
    wait(b, h, 2);
    expect(h.dead).toBe("blood");
    expect(h.blood).toBe(0);
  });

  it("losing your head with a second brain elsewhere hands the body over", () => {
    const b = swampMutant();
    const h = newHarm(b);
    const ev = strike(b, h, { damage: 40, profile: "at", aim: SWAMP_IDS.head }, fixed(0.999));
    expect(ev.some((e) => e.k === "crushed")).toBe(true);
    expect(ev.some((e) => e.k === "handover")).toBe(true);
    expect(h.dead).toBeNull();
    expect(brains(b).find((b2) => b2.self)?.alive).toBe(true);
  });

  it("a brain dead in its place hands the body over too, and the handover holds (decision 1301)", () => {
    // The brain is still there, only dead: the handover must not be undone by keeping it as yours.
    const b = swampMutant();
    const h = newHarm(b);
    // The neck broken: no blood reaches the head, and the brain in it dies on the fifth turn.
    for (const s of Object.values(b.segments)) if (s.kind === "neck") s.hp = 0;
    // Starving, so the neck does not knit back and let the blood through again.
    h.reserve = 0;
    const ev = wait(b, h, 5);
    expect(ev.some((e) => e.k === "handover")).toBe(true);
    expect(h.dead).toBeNull();
    expect(brains(b).find((b2) => b2.self)?.alive).toBe(true);
  });
});

describe("pain lives in the brains", () => {
  it("goes to the nearest brains: all, half, a quarter", () => {
    const b = swampMutant();
    const h = newHarm(b);
    const ev = strike(b, h, { damage: 20, profile: "at", aim: SWAMP_IDS.tentacle }, fixed(0.999));
    const shares = ev.find((e) => e.k === "hit")!.k === "hit" ? (ev.find((e) => e.k === "hit") as Extract<HarmEvent, { k: "hit" }>).pain : [];
    expect(shares.length).toBe(2);
    expect(shares[1]!.amount).toBe(Math.floor(shares[0]!.amount / 2));
  });

  it("a brain at 85 blacks out for at most 12 turns, then stays awake 20", () => {
    const b = human();
    const h = newHarm(b);
    const key = selfKey(b);
    h.organs[key] = { pain: 100 };
    const ev = wait(b, h, 1, false, fixed(0.999));
    const out = ev.find((e) => e.k === "blackout");
    expect(out).toBeDefined();
    expect(mindState(b, h).conscious).toBe(false);
    let turns = 1;
    while ((h.organs[key]?.out ?? 0) > 0) {
      wait(b, h, 1);
      turns += 1;
    }
    expect(turns).toBeLessThanOrEqual(MAX_BLACKOUT + 1);
    h.organs[key]!.pain = 100;
    const again = wait(b, h, AWAKE_BETWEEN - 1);
    expect(again.some((e) => e.k === "blackout")).toBe(false);
  });

  it("pain takes channels: power falls with pain", () => {
    const b = human();
    const h = newHarm(b);
    const calm = mindState(b, h).power;
    h.organs[selfKey(b)] = { pain: 50 };
    expect(mindState(b, h).power).toBeCloseTo(calm / 2);
  });

  it("at 60 one organ of the brain's territory twitches each turn", () => {
    const b = human();
    const h = newHarm(b);
    h.organs[selfKey(b)] = { pain: 70 };
    const ev = wait(b, h, 1);
    expect(ev.filter((e) => e.k === "twitch")).toHaveLength(1);
  });
});

describe("healing is rest and food", () => {
  it("mends at most HEAL_RATE hp a turn over the whole body, twice at rest, and costs the reserve", () => {
    const b = human();
    const h = newHarm(b);
    // Wounds deeper than the stretch can mend and food enough to pay for it: what is measured is the pace, not the purse.
    for (const s of Object.values(b.segments)) s.hp = Math.min(s.hp, 2);
    feed(h, 5000);
    const total = () => Object.values(b.segments).reduce((s, x) => s + x.hp, 0);
    const t0 = total();
    wait(b, h, 50);
    expect(total() - t0).toBe(50 * HEAL_RATE);
    const t1 = total();
    wait(b, h, 50, true);
    expect(total() - t1).toBe(100 * HEAL_RATE);
    expect(h.reserve).toBeLessThan(5400);
  });

  it("knitting spends the reserve on speed: KNIT_PACE times the hp, KNIT_TAX times the price of each", () => {
    const plain = human();
    const ph = newHarm(plain);
    for (const s of Object.values(plain.segments)) s.hp = Math.min(s.hp, 2);
    feed(ph, 50_000);
    const knit = cloneBody(plain);
    const kh = newHarm(knit);
    kh.reserve = ph.reserve;
    const sum = (b: Body): number => Object.values(b.segments).reduce((s, x) => s + x.hp, 0);
    const p0 = sum(plain);
    const k0 = sum(knit);
    const fixed05 = fixed(0.5);
    for (let i = 0; i < 10; i++) turn(plain, ph, { rest: true, upkeep: false }, fixed05);
    for (let i = 0; i < 10; i++) turn(knit, kh, { rest: true, upkeep: false, knit: true }, fixed05);
    expect(sum(knit) - k0).toBe(KNIT_PACE * (sum(plain) - p0));
    // Every point of hp costs KNIT_TAX times as much, so the same hp costs the same times more.
    expect(50_000 + START_RESERVE - kh.reserve).toBe(KNIT_PACE * KNIT_TAX * (50_000 + START_RESERVE - ph.reserve));
  });

  it("knitting stops dead on an empty reserve, and heals nothing more than the body lacks", () => {
    const b = human();
    const h = newHarm(b);
    b.segments[HUMAN_IDS.armL]!.hp = 2;
    h.reserve = HEAL_COST * KNIT_TAX * 3;
    const before = b.segments[HUMAN_IDS.armL]!.hp;
    for (let i = 0; i < 20; i++) turn(b, h, { rest: true, upkeep: false, knit: true }, fixed(0.5));
    expect(b.segments[HUMAN_IDS.armL]!.hp - before).toBe(3);
    expect(h.reserve).toBeLessThan(HEAL_COST * KNIT_TAX);
  });

  it("an empty reserve heals nothing", () => {
    const b = human();
    const h = newHarm(b);
    b.segments[HUMAN_IDS.armL]!.hp = 2;
    h.reserve = 0;
    wait(b, h, 50);
    expect(b.segments[HUMAN_IDS.armL]!.hp).toBe(2);
    feed(h, 300);
    wait(b, h, 50);
    expect(b.segments[HUMAN_IDS.armL]!.hp).toBeGreaterThan(2);
  });
});

describe("festering and aim", () => {
  it("a festering wound reaches gangrene at 120 turns and stops passing blood", () => {
    const b = human();
    const h = newHarm(b);
    infect(h, HUMAN_IDS.armL);
    h.reserve = 0;
    // An empty reserve ages it twice as fast.
    wait(b, h, 60);
    expect(h.infection[HUMAN_IDS.armL]?.stage).toBe(3);
    expect(b.segments[HUMAN_IDS.armL]!.hp).toBeLessThanOrEqual(0);
    expect(fed(b).has(HUMAN_IDS.handL)).toBe(false);
  });

  it("an aimed blow lands where meant with min(1, 50 / mass)", () => {
    for (const body of [human(), mutant(3, 30)]) {
      const rng = new Rng(7);
      let hits = 0;
      const n = 4000;
      for (let i = 0; i < n; i++) {
        const b = cloneBody(body);
        const h = newHarm(b);
        const ev = strike(b, h, { damage: 1, profile: "aimed", aim: HUMAN_IDS.torso }, rng);
        if (!ev.some((e) => e.k === "miss")) hits += 1;
      }
      expect(Math.abs(hits / n - aimChance(body))).toBeLessThan(0.03);
    }
  });
});

describe("the simulator is a pure, repeatable model", () => {
  it("the same seed gives the same body and the same harm; every body stays valid", () => {
    const run = (): string => {
      const b = mutant(11, 30);
      const h = newHarm(b);
      const rng = new Rng(5);
      for (let i = 0; i < 60 && h.dead === null; i++) {
        strike(b, h, { damage: 1 + Math.floor(rng.next() * 12), profile: i % 3 === 0 ? "wound" : "random", dirty: true }, rng);
        turn(b, h, { upkeep: true }, rng);
        expect(validate(b)).toEqual([]);
      }
      return bodyHash(b) + JSON.stringify(h);
    };
    expect(run()).toBe(run());
  });

  it("100 mutants beaten to death all die of one of the four causes, never of pain", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const b = mutant(seed, 30);
      const h = newHarm(b);
      const rng = new Rng(seed);
      for (let i = 0; i < 600 && h.dead === null; i++) {
        strike(b, h, { damage: 2 + Math.floor(rng.next() * 10), profile: "random" }, rng);
        turn(b, h, { upkeep: false }, rng);
      }
      expect(h.dead, `seed ${seed}`).not.toBeNull();
      expect(["blood", "brain", "mass"]).toContain(h.dead);
      // A body that lost its last brain points `self` at nothing; every other dead body is still a valid graph.
      if (h.dead !== "brain") expect(validate(b), `seed ${seed}`).toEqual([]);
    }
  });
});

describe("the five types tell the track what the blow was (strike.md §6, decision 420)", () => {
  /** The same blow, one type at a time, always on the same element. */
  function hit(type: HitType, damage: number, id: number, rng: { next(): number } = fixed(0.999)): { body: Body; harm: Harm; events: HarmEvent[] } {
    const body = human();
    const harm = newHarm(body);
    return { body, harm, events: strike(body, harm, { damage, profile: "at", aim: id, type }, rng) };
  }

  it("a crushing blow finishes what it nearly took: a quarter left standing is no quarter", () => {
    // The arm holds 8; a blow of 6 leaves 2, and 2 is a quarter of 8.
    const arm = HUMAN_IDS.armL;
    const edge = hit("cut", 6, arm);
    expect(edge.body.segments[arm]!.hp).toBe(2);
    expect(edge.events.find((e) => e.k === "hit")).toMatchObject({ after: "hurt" });
    const crush = hit("blunt", 6, arm);
    expect(crush.body.segments[arm]!.hp).toBe(0);
    expect(crush.events.find((e) => e.k === "hit")).toMatchObject({ after: "broken" });
  });

  it("a cutting blow takes a broken part off, and nothing else does", () => {
    const arm = HUMAN_IDS.armL;
    const blunt = hit("blunt", 8, arm);
    expect(blunt.events.some((e) => e.k === "torn" || e.k === "vanished")).toBe(false);
    expect(blunt.body.segments[arm]).toBeDefined();
    const cut = hit("cut", 8, arm);
    expect(cut.events.some((e) => e.k === "torn")).toBe(true);
    expect(cut.body.segments[arm]).toBeUndefined();
  });

  it("a piercing blow reaches the cavity twice as often", () => {
    // The roll for an organ is damage / hpMax = 6 / 28; 0.4 is over it and under twice it.
    const torso = HUMAN_IDS.torso;
    expect(hit("blunt", 6, torso, fixed(0.4)).events.some((e) => e.k === "organ")).toBe(false);
    expect(hit("pierce", 6, torso, fixed(0.4)).events.some((e) => e.k === "organ")).toBe(true);
  });

  it("a squeeze presses through half the cover (strike.md §1.7)", () => {
    const plated = bodyFromText(`голова[2] {голова(мозг*, глаз, челюсть)}
грудь[3]
таз[3]
кисть[1] {коготь}
голова -шея:1/1 кожа- грудь
грудь -корпус:2/3 костяные пластины {сердце, лёгкие, желудок}- таз
грудь -рука:2/1 кожа- кисть
`);
    const torso = segmentIds(plated).find((id) => plated.segments[id]!.kind === "torso")!;
    const cover = defenseOf(plated, torso);
    expect(cover).toBe(3);
    const through = (type: HitType): number => {
      const body = cloneBody(plated);
      const ev = strike(body, newHarm(body), { damage: 10, profile: "at", aim: torso, type }, fixed(0.999));
      return (ev.find((e) => e.k === "hit") as Extract<HarmEvent, { k: "hit" }>).damage;
    };
    // Plates guard a club with 2 and an edge with 3 (decision 1262); a squeeze meets half the club's guard.
    expect(through("cut")).toBe(7);
    expect(through("blunt")).toBe(8);
    expect(through("squeeze")).toBe(9);
  });

  it("a blow that names no type is a crushing one: nothing said means no edge", () => {
    const arm = HUMAN_IDS.armL;
    const body = human();
    strike(body, newHarm(body), { damage: 6, profile: "at", aim: arm }, fixed(0.999));
    expect(body.segments[arm]!.hp).toBe(hit("blunt", 6, arm).body.segments[arm]!.hp);
  });
});

describe("what the blow carried past the cover (strike.md §1.6, decision 420)", () => {
  it("a discharge tells at once, and the cover never held it", () => {
    const body = human();
    const harm = newHarm(body);
    const torso = HUMAN_IDS.torso;
    const ev = strike(body, harm, { damage: 4, profile: "at", aim: torso, type: "pierce", doses: [{ kind: "shock", amount: 3, delay: 0 }] }, fixed(0.999));
    expect(ev.find((e) => e.k === "dose")).toMatchObject({ kind: "shock", id: torso, amount: 3 });
    expect(body.segments[torso]!.hp).toBe(28 - 4 - 3);
  });

  it("venom waits out its turns in the blood and then tells", () => {
    const body = human();
    const harm = newHarm(body);
    const torso = HUMAN_IDS.torso;
    const ev = strike(body, harm, { damage: 2, profile: "at", aim: torso, type: "bite", doses: [{ kind: "venom", amount: 4, delay: VENOM_TURNS }] }, fixed(0.999));
    expect(ev.find((e) => e.k === "owed")).toMatchObject({ kind: "venom", id: torso, turns: VENOM_TURNS });
    expect(harm.doses).toHaveLength(1);
    // An empty reserve: nothing knits while the venom waits, so the hp is the venom's alone.
    harm.reserve = 0;
    const hp = body.segments[torso]!.hp;
    expect(wait(body, harm, VENOM_TURNS - 1).some((e) => e.k === "dose")).toBe(false);
    expect(body.segments[torso]!.hp).toBe(hp);
    expect(wait(body, harm, 1).find((e) => e.k === "dose")).toMatchObject({ kind: "venom", amount: 4 });
    expect(body.segments[torso]!.hp).toBe(hp - 4);
    expect(harm.doses).toEqual([]);
  });

  it("a dose breaks a part and never takes one off", () => {
    const body = human();
    const arm = HUMAN_IDS.armL;
    strike(body, newHarm(body), { damage: 1, profile: "at", aim: arm, type: "pierce", doses: [{ kind: "shock", amount: 100, delay: 0 }] }, fixed(0.999));
    const el = body.segments[arm]!;
    expect(el).toBeDefined();
    expect(elementState(el.hp, el.hpMax)).toBe("broken");
  });

  it("a burning blow is worth five more pain, and that is the whole of fire in the track", () => {
    const pain = (burn: boolean): number => {
      const body = human();
      const harm = newHarm(body);
      const ev = strike(body, harm, { damage: 10, profile: "at", aim: HUMAN_IDS.torso, type: "pierce", burn }, fixed(0.999));
      return (ev.find((e) => e.k === "hit") as Extract<HarmEvent, { k: "hit" }>).pain.reduce((s, p) => s + p.amount, 0);
    };
    expect(pain(true) - pain(false)).toBe(5);
  });
});

describe("one record of harm splits with the flesh (decision 426)", () => {
  it("bleeding, a festering wound, the pain of a brain and an owed dose go where their element goes", () => {
    const body = chain();
    const harm = newHarm(body);
    const other = brains(body).find((b) => !b.self && b.alive)!;
    const key = keyOf(body, other.organ)!;
    const leaving = separatePreview(body, other.ref)!.leaves.part.nodes[0]!;
    hurtBrains(body, harm, leaving, 40);
    infect(harm, leaving);
    harm.nodeBleed[leaving] = 4;
    harm.doses.push({ kind: "venom", amount: 3, turns: 2, id: leaving });
    harm.reserve = 300;
    const born = separate(body, other.ref)!.leaves.body!;

    const [mine, theirs] = splitHarm(harm, [body, born]);
    expect(theirs!.infection[leaving]).toBeDefined();
    expect(mine!.infection[leaving]).toBeUndefined();
    expect(theirs!.nodeBleed[leaving]).toBe(4);
    expect(mine!.nodeBleed[leaving]).toBeUndefined();
    expect(theirs!.doses).toEqual([{ kind: "venom", amount: 3, turns: 2, id: leaving }]);
    expect(mine!.doses).toEqual([]);
    expect(theirs!.organs[key]?.pain).toBeGreaterThan(0);
    expect(mine!.organs[key]).toBeUndefined();
    // Blood and the reserve go by the mass each holds, and neither holds more than it can.
    expect(mine!.blood).toBeGreaterThan(0);
    expect(theirs!.blood).toBeGreaterThan(0);
    expect(mine!.blood).toBeLessThanOrEqual(bloodMax(body));
    expect(theirs!.blood).toBeLessThanOrEqual(bloodMax(born));
    expect(mine!.reserve + theirs!.reserve).toBe(300);
    // The carries and the death belong to the body that was there before.
    expect(theirs!.dead).toBeNull();
    expect(theirs!.painCarry).toBe(0);
  });

  it("the record it is given is never written into", () => {
    const body = human();
    const harm = newHarm(body);
    infect(harm, HUMAN_IDS.torso);
    const before = JSON.stringify(harm);
    splitHarm(harm, [body, cloneBody(body)]);
    expect(JSON.stringify(harm)).toBe(before);
  });
});
