/**
 * A fight of several bodies, battle.md: the queue by the time a volley takes,
 * the target a policy picks, the part with a brain that comes off mid-fight
 * and keeps fighting for whoever lost it, and the end.
 */
import { LabRng as Rng } from "../rng.js";
import { describe, expect, it } from "vitest";
import {
  AIMS,
  aimPolicy,
  aimScore,
  battleView,
  bloodMax,
  bodyFromText,
  brains,
  fed,
  human,
  HUMAN_IDS,
  mass,
  newBattle,
  newHarm,
  planStrike,
  runBattle,
  severedBodies,
  stepBattle,
  strikes,
  totalBleed,
  validate,
  type Action,
  type BattleResult,
  type HarmEvent,
  type Aim,
  type Policy,
  type Sight,
  type View,
  fixtureBody,
  beastById,
} from "../index.js";
import { brainyBody, chain, swampMutant } from "./genHeads.js";

/** Long clawed arms in bark over bone plates: what actually cuts a body apart. */
const CLAWED = `голова[2] {голова(мозг*, глаз, глаз, дробящие челюсти, ухо, ухо, нос)}
грудь[3]
таз[3]
коготь.л[1] {коготь}
коготь.п[1] {коготь}
стопа.л[1] {стопа}
стопа.п[1] {стопа}
голова -шея:1/2 кора- грудь
грудь  -корпус:3/4 костяные пластины {сердце, лёгкие, желудок}- таз
грудь  -рука:3/2 кора- коготь.л
грудь  -рука:3/2 кора- коготь.п
таз    -нога:3/2 кора- стопа.л
таз    -нога:3/2 кора- стопа.п
`;

/** A second head with jaws of its own on one arm: what starves off it can still bite. */
const BITING_HEAD = `голова[2] {голова(мозг*, глаз, глаз, хищные челюсти)}
грудь[3]
таз[3]
плечо2[2] {голова(мозг!4, глаз, хищные челюсти)}
стопа.л[1] {стопа}
стопа.п[1] {стопа}
голова -шея:1/2 кожа- грудь
грудь  -корпус:2/4 кожа {сердце, лёгкие, желудок}- таз
грудь  -рука:2/2 кожа- плечо2
таз    -нога:2/2 кожа- стопа.л
таз    -нога:2/2 кожа- стопа.п
`;

const foes = () => ({
  fighters: [
    { id: "mine", side: "left", body: human() },
    { id: "theirs", side: "right", body: human() },
  ],
});

function fight(seed: number | string, setup = foes()): BattleResult {
  return runBattle(setup, new Rng(seed));
}

describe("a fight of several bodies", () => {
  it("one seed is one fight", () => {
    const a = fight(7);
    const b = fight(7);
    expect(JSON.stringify(a.log)).toBe(JSON.stringify(b.log));
    expect(a.turns).toBe(b.turns);
    expect(a.winner).toBe(b.winner);
    const other = fight(8);
    expect(other.turns === a.turns && other.acts === a.acts).toBe(false);
  });

  it("two bodies come to an end in a finite number of turns", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = fight(seed);
      expect(r.reason).toBe("beaten");
      expect(r.winner === "left" || r.winner === "right").toBe(true);
      expect(r.turns).toBeGreaterThan(0);
      expect(r.turns).toBeLessThanOrEqual(200);
      // The loser is down or worse, the winner still stands.
      const down = r.fighters.filter((f) => f.state !== "standing");
      expect(down.length).toBeGreaterThan(0);
      expect(r.fighters.find((f) => f.side === r.winner)!.state).toBe("standing");
    }
  });

  it("the queue runs on the time a volley takes, not on turns of one each", () => {
    const b = newBattle(foes());
    const rng = new Rng(3);
    stepBattle(b, rng);
    stepBattle(b, rng);
    // A human's volley is 100 or less: both acted before the first body turn.
    expect(b.fighters.every((f) => f.clock > 0)).toBe(true);
    expect(b.turn).toBe(0);
    for (let i = 0; i < 40; i++) stepBattle(b, rng);
    expect(b.turn).toBeGreaterThan(0);
    expect(b.time).toBeGreaterThanOrEqual(b.turn * 100);
  });

  it("a fight that never lands stops at the limit", () => {
    const wait: Policy = () => ({ k: "wait" });
    const r = runBattle(
      {
        fighters: [
          { id: "mine", side: "left", body: human(), policy: wait },
          { id: "theirs", side: "right", body: human(), policy: wait },
        ],
        options: { maxTurns: 12 },
      },
      new Rng(1),
    );
    expect(r.reason).toBe("limit");
    expect(r.winner).toBeNull();
    expect(r.turns).toBe(12);
    expect(r.fighters.every((f) => f.state === "standing" && f.blood === 1)).toBe(true);
  });
});

describe("the policy is a swap-in", () => {
  it("a policy of two lines decides the target", () => {
    const seen: View[] = [];
    const first: Policy = (view) => {
      seen.push(view);
      return view.foes.length === 0 ? { k: "wait" } : { k: "strike", target: view.foes[0]!.id };
    };
    const r = runBattle(
      {
        fighters: [
          { id: "mine", side: "left", body: human(), policy: first },
          { id: "a", side: "right", body: human() },
          { id: "b", side: "right", body: human() },
        ],
      },
      new Rng(5),
    );
    expect(seen.length).toBeGreaterThan(0);
    // It saw two foes and no ally of its own, and never struck the one it did not name.
    expect(seen[0]!.foes.map((f) => f.id).sort()).toEqual(["a", "b"]);
    expect(seen[0]!.allies).toEqual([]);
    expect(r.log.some((e) => e.k === "act" && e.who === "mine")).toBe(true);
  });

  it("nobody strikes its own side", () => {
    const r = fight(11, {
      fighters: [
        { id: "a1", side: "left", body: human() },
        { id: "a2", side: "left", body: human() },
        { id: "b1", side: "right", body: human() },
      ],
    });
    const side = new Map(r.fighters.map((f) => [f.id, f.side]));
    for (const e of r.log) if (e.k === "act") expect(side.get(e.who)).not.toBe(side.get(e.target));
  });

  it("a weight on bulk draws the blows to the big one, and zero leaves every temper as it was (decision 437)", () => {
    // A servant of half again the meat led out beside the fighter, in the same
    // skin so the fist reaches it: that is what a glutton hits, and nothing at
    // all to the tempers that ship with mass 0.
    const big = swampMutant(0);
    const pick = (aim: typeof AIMS.brute): string => {
      const b = newBattle({
        fighters: [
          { id: "foe", side: "right", body: human(), policy: aimPolicy(aim) },
          { id: "you", side: "left", body: human() },
          { id: "servant", side: "left", body: big, counts: false },
        ],
      });
      const action = aimPolicy(aim)(battleView(b, "foe")!);
      return action.k === "strike" ? action.target : "none";
    };
    const view = battleView(newBattle({ fighters: [{ id: "a", side: "l", body: human() }, { id: "b", side: "r", body: big }] }), "a")!;
    expect(view.foes[0]!.living).toBeGreaterThan(0);
    expect(view.foes[0]!.living).toBeLessThanOrEqual(view.foes[0]!.mass);
    expect(pick(AIMS.glutton)).toBe("servant");
    for (const name of ["brute", "hunter", "wary", "shedder"] as const) expect(AIMS[name].mass, name).toBe(0);
    expect(pick(AIMS.brute)).not.toBe(pick(AIMS.glutton));
    // With one target in front of it the weight costs nothing either way.
    const alone = aimScore(AIMS.glutton, view.foes[0]!);
    expect(alone).toBe(aimScore({ ...AIMS.glutton, mass: 0 }, view.foes[0]!) + AIMS.glutton.mass);
  });

  it("every reading of the score is a share of one, so the weights are a ranking (decision 594)", () => {
    // The five readings arrive in different units - damage per 100 energy,
    // kilograms of living flesh, a fraction of blood, cells of distance - and
    // each is divided by the best of it on the sand before its weight touches
    // it. That is the whole reason a row of `AIMS` can be read: `3` against
    // `1` means three times as much, and nothing can outvote the row by being
    // measured in larger numbers.
    //
    // This test is the guard on that, and it is written to bite the day
    // someone puts a raw reading back beside a share. If it fails, read
    // decision 594 before updating it - the numbers are not the point, the
    // shape is.
    const foe = (over: Partial<Sight>): Sight => ({
      id: "x", side: "r", severed: false, conscious: true, distance: 1,
      armor: 0, dodge: 0, blood: 1, mass: 100, living: 100, gain: 0, threat: 0, lifetime: null, ...over,
    });
    const flat: Aim = { gain: 1, threat: 1, weak: 1, near: 1, mass: 1, shed: null };
    const sand = { gain: 10, threat: 10, living: 100 };
    // Ten points of damage against a best of ten are worth one, not ten, and
    // half the best is worth exactly as much as half the blood.
    expect(aimScore(flat, foe({ gain: 10 }), sand) - aimScore(flat, foe({ gain: 0 }), sand)).toBe(1);
    expect(aimScore(flat, foe({ threat: 10 }), sand) - aimScore(flat, foe({ threat: 0 }), sand)).toBe(1);
    expect(aimScore(flat, foe({ gain: 5 }), sand) - aimScore(flat, foe({ gain: 0 }), sand)).toBe(0.5);
    expect(aimScore(flat, foe({ blood: 0 })) - aimScore(flat, foe({ blood: 1 }))).toBe(1);
    expect(aimScore(flat, foe({ living: 50 }), sand) - aimScore(flat, foe({ living: 0 }), sand)).toBe(0.5);
    expect(aimScore(flat, foe({ distance: 1 })) - aimScore(flat, foe({ distance: 4 }))).toBeCloseTo(0.75, 9);

    // The guard proper: each reading on its own, at weight 1, scores in 0..1
    // however large the number it arrives holding. A `gain` back in raw
    // damage would score 400 here and this line would say so.
    const zero: Aim = { gain: 0, threat: 0, weak: 0, near: 0, mass: 0, shed: null };
    const only: Record<string, Aim> = {
      gain: { ...zero, gain: 1 }, threat: { ...zero, threat: 1 }, weak: { ...zero, weak: 1 },
      near: { ...zero, near: 1 }, mass: { ...zero, mass: 1 },
    };
    const wild = { gain: 400, threat: 400, living: 4000 };
    const huge = foe({ gain: 400, threat: 400, living: 4000, blood: 0, distance: 1 });
    for (const [name, aim] of Object.entries(only)) {
      const s = aimScore(aim, huge, wild);
      expect(s, name).toBeGreaterThanOrEqual(0);
      expect(s, name).toBeLessThanOrEqual(1);
    }

    // And the consequence the owner asked for: bulk can hide an armoured
    // fighter behind a soft escort now. A troll fighter reads `gain` 8.70
    // against a hydra, a bare human escort 16.28 - a gap of 7.6 that no
    // weight on bulk could ever close while `gain` arrived in tens, because
    // a weight that big meant "the heaviest, always" (decision 438).
    const best = { gain: 16.28, threat: 0, living: 221 };
    const troll = foe({ id: "troll", gain: 8.7, living: 221 });
    const escort = foe({ id: "escort", gain: 16.28, living: 101 });
    expect(aimScore(AIMS.glutton, troll, best)).toBeGreaterThan(aimScore(AIMS.glutton, escort, best));
    // The brute is about the blow and not the bulk, and still takes the escort.
    expect(aimScore(AIMS.brute, escort, best)).toBeGreaterThan(aimScore(AIMS.brute, troll, best));
  });

  it("each temper is led by the reading it is named for, and they pick four different targets (decision 595)", () => {
    // The row is a ranking: the leading weight is what the temper is about,
    // and the small ones are what it consults when the leader ties.
    const leads: Record<keyof typeof AIMS, keyof Omit<Aim, "shed">> = {
      brute: "gain", hunter: "weak", wary: "threat", glutton: "mass", shedder: "gain",
    };
    const keys = ["gain", "threat", "weak", "near", "mass"] as const;
    for (const name of Object.keys(leads) as (keyof typeof AIMS)[]) {
      const row: Aim = AIMS[name];
      for (const k of keys) {
        if (k === leads[name]) continue;
        expect(row[leads[name]], `${name}: ${leads[name]} must lead ${k}`).toBeGreaterThan(row[k]);
      }
    }

    // Four targets, each the best on the sand at one reading and ordinary at
    // the rest. Four tempers, four different answers - which is what the
    // table is for, and what it could not do while `gain` outvoted every row.
    const foe = (over: Partial<Sight>): Sight => ({
      id: "x", side: "r", severed: false, conscious: true, distance: 1,
      armor: 0, dodge: 0, blood: 1, mass: 100, living: 50, gain: 4, threat: 2, lifetime: null, ...over,
    });
    const foes = [
      foe({ id: "soft", gain: 10 }),
      foe({ id: "bleeding", blood: 0.1 }),
      foe({ id: "deadly", threat: 20 }),
      foe({ id: "mountain", living: 300 }),
    ];
    const view: View = { self: foe({ id: "me", side: "l" }), allies: [], foes, shed: [], turn: 1, time: 100 };
    const pick = (aim: Aim): string => {
      const a = aimPolicy(aim)(view);
      return a.k === "strike" ? a.target : a.k;
    };
    expect(pick(AIMS.brute)).toBe("soft");
    expect(pick(AIMS.hunter)).toBe("bleeding");
    expect(pick(AIMS.wary)).toBe("deadly");
    expect(pick(AIMS.glutton)).toBe("mountain");
    expect(pick(AIMS.shedder)).toBe("soft");
  });

  it("the weights change who is picked first", () => {
    // Two foes alike but for the blood: `b` is nearly bled out. The hunter
    // finishes it; a temper that puts no weight on that takes them in order.
    const pick = (policy: Policy): string => {
      const b = newBattle({
        fighters: [
          { id: "mine", side: "left", body: human(), policy },
          { id: "a", side: "right", body: human() },
          { id: "b", side: "right", body: human() },
        ],
      });
      const hurt = b.fighters.find((f) => f.id === "b")!;
      hurt.harm = { ...newHarm(hurt.body), blood: bloodMax(hurt.body) * 0.2 };
      const view = battleView(b, "mine")!;
      const action: Action = policy(view);
      return action.k === "strike" ? action.target : "none";
    };
    expect(pick(aimPolicy(AIMS.hunter))).toBe("b");
    expect(pick(aimPolicy({ ...AIMS.brute, weak: 0 }))).toBe("a");
  });
});

describe("a part with a brain fights on", () => {
  it("a torn piece with a brain is rebuilt as a body of its own", () => {
    const body = swampMutant(4);
    // The head on the second torso leaves with the pelvis and both legs.
    const piece = { nodes: [3, 6, 7, 8], segments: [13, 14, 15, 16], organs: [], mass: 40, fate: "brainOnly" as const };
    const events: HarmEvent[] = [{ k: "torn", segment: 10, stump: 2, bleed: 8, pieces: [piece] }];
    const parts = severedBodies(body, events);
    expect(parts).toHaveLength(1);
    const part = parts[0]!;
    expect(part.fate).toBe("brainOnly");
    expect(part.lifetime).toBeGreaterThan(0);
    expect(brains(part.body).some((x) => x.self)).toBe(true);
    expect(validate(part.body)).toEqual([]);
    expect(strikes(part.body).length).toBeGreaterThan(0);
    // The body it came off is untouched: the piece is flesh of its own.
    expect(body.nodes[6]).toBeDefined();
    expect(part.body.nodes[6]).not.toBe(body.nodes[6]);
    // Meat and blood follow the piece, not the body it left.
    expect(part.body.meat).toBeGreaterThan(0);
    expect(bloodMax(part.body)).toBeGreaterThan(0);
  });

  it("a head cut loose joins the fight on the side of the one that lost it", () => {
    const b = newBattle({
      fighters: [
        { id: "mutant", side: "left", body: swampMutant(4), policy: aimPolicy(AIMS.shedder) },
        { id: "man", side: "right", body: human() },
      ],
    });
    const rng = new Rng(2);
    for (let i = 0; i < 6 && b.fighters.length < 3; i++) stepBattle(b, rng);
    const born = b.fighters.find((f) => f.severed);
    expect(born).toBeDefined();
    expect(born!.side).toBe("left");
    expect(born!.from).toBe("mutant");
    expect(born!.lifetime).toBeGreaterThan(0);
    expect(b.log.some((e) => e.k === "shed")).toBe(true);
    expect(strikes(born!.body).length).toBeGreaterThan(0);
    expect(validate(born!.body)).toEqual([]);
    // It is nobody's target: not the enemy's, and not its own side's.
    expect(battleView(b, "man")!.foes.map((f) => f.id)).toEqual(["mutant"]);
    expect(battleView(b, "mutant")!.foes.map((f) => f.id)).toEqual(["man"]);
    expect(battleView(b, "mutant")!.allies.map((f) => f.id)).toEqual([born!.id]);
    expect(battleView(b, born!.id)!.foes.map((f) => f.id)).toEqual(["man"]);
  });

  it("a head starved of blood comes off alive and joins the fight (decision 597)", () => {
    // Nothing is cut here: the road to the second head is simply broken, so
    // the head keeps its organs and loses its blood. Before the thresholds
    // were turned round it sat there for eighty turns, necrotic from the
    // fortieth, and what finally fell was meat - so starvation never once put
    // a fighter on the sand.
    const body = bodyFromText(BITING_HEAD);
    const second = brains(body).find((x) => !x.self)!;
    const head = "node" in second.ref ? second.ref.node : -1;
    // Every road to it has to go: a bypass through a cycle would be a bypass
    // for the blood too.
    for (const s of Object.values(body.segments)) if (s!.a === head || s!.b === head) s!.hp = 0;
    expect(fed(body).has(head)).toBe(false);
    const b = newBattle({
      fighters: [
        { id: "mutant", side: "left", body, policy: aimPolicy(AIMS.brute) },
        { id: "man", side: "right", body: human() },
      ],
    });
    const rng = new Rng(5);
    for (let i = 0; i < 60 && b.fighters.length < 3; i++) stepBattle(b, rng);

    const born = b.fighters.find((f) => f.severed);
    expect(born, "starvation put nobody on the sand").toBeDefined();
    expect(born!.from).toBe("mutant");
    expect(born!.side).toBe("left");
    // It came off by starvation, not by a blow: the event that made it is a
    // `fallen` of a body turn, and no head was shed on purpose.
    expect(b.log.some((e) => e.k === "shed")).toBe(false);
    expect(b.log.some((e) => e.k === "harm" && e.from === "turn" && e.events.some((h) => h.k === "fallen"))).toBe(true);
    // And it is a fighter, not a carcass: it thinks, it stands, it swings.
    expect(born!.fate === "brainOnly" || born!.fate === "creature").toBe(true);
    expect(brains(born!.body).some((x) => x.self && x.alive)).toBe(true);
    expect(strikes(born!.body).length).toBeGreaterThan(0);
    expect(validate(born!.body)).toEqual([]);
    expect(battleView(b, born!.id)!.foes.map((f) => f.id)).toEqual(["man"]);
  });

  it("a strike aimed at a severed part lands on nothing", () => {
    const at = (id: string): Policy => () => ({ k: "strike", target: id });
    const b = newBattle({
      fighters: [
        { id: "mutant", side: "left", body: swampMutant(4), policy: aimPolicy(AIMS.shedder) },
        { id: "man", side: "right", body: human() },
      ],
    });
    const rng = new Rng(4);
    for (let i = 0; i < 6 && b.fighters.length < 3; i++) stepBattle(b, rng);
    const born = b.fighters.find((f) => f.severed)!;
    const bloodBefore = born.harm.blood;
    // Both sides now try to hit it: the enemy, and the side it belongs to.
    for (const f of b.fighters) if (!f.severed) f.policy = at(born.id);
    for (let i = 0; i < 20; i++) stepBattle(b, rng);
    expect(b.log.some((e) => e.k === "act" && e.target === born.id)).toBe(false);
    expect(born.harm.blood).toBe(bloodBefore);
    expect(born.out).toBeNull();
  });

  it("a piece torn off in the fight joins it on the side of the one it left", () => {
    // A body of two foreign heads on one leg against claws: a torn leg takes a
    // head with it, and the head keeps fighting for the one that lost it.
    let found: BattleResult | null = null;
    for (let seed = 30; seed <= 40 && found === null; seed++) {
      const r = runBattle(
        {
          fighters: [
            { id: "mine", side: "left", body: chain() },
            { id: "claws", side: "right", body: bodyFromText(CLAWED) },
          ],
        },
        new Rng(`b${seed}`),
      );
      if (r.log.some((e) => e.k === "severed")) found = r;
    }
    expect(found, "no piece with a brain came off in eleven fights").not.toBeNull();
    const r = found!;
    const born = r.severed[0]!;
    expect(born.from).toBe("mine");
    expect(r.fighters.find((f) => f.id === born.id)!.side).toBe("left");
    expect(born.fate === "brainOnly" || born.fate === "creature").toBe(true);
    if (born.fate === "brainOnly") expect(born.lifetime).toBeGreaterThan(0);
    // Nobody ever struck it, and it is no reason for the fight to go on.
    expect(r.log.some((e) => e.k === "act" && e.target === born.id)).toBe(false);
    expect(r.reason).toBe("beaten");
  });

  it("the fight is over when a side is down, whatever its severed parts still do", () => {
    const b = newBattle({
      fighters: [
        { id: "mutant", side: "left", body: swampMutant(4), policy: aimPolicy(AIMS.shedder) },
        { id: "man", side: "right", body: human() },
      ],
    });
    const rng = new Rng(6);
    let guard = 0;
    while (b.result === null && guard++ < 4000) stepBattle(b, rng);
    expect(b.result).not.toBeNull();
    const r = b.result as BattleResult;
    expect(r.severed.length).toBeGreaterThan(0);
    // A severed part counts for nobody: the outcome names a side of the ones that started.
    expect(r.winner === "left" || r.winner === "right" || r.winner === null).toBe(true);
    expect(r.fighters.filter((f) => f.severed).every((f) => f.from === "mutant")).toBe(true);
  });
});

describe("a fighter walks in with its wounds (decision 423)", () => {
  it("a hurt man is weaker than a whole one, and what he is given is never written into", () => {
    const hurt = (): { body: ReturnType<typeof human>; harm: ReturnType<typeof newHarm> } => {
      const body = human();
      const harm = newHarm(body);
      harm.blood = Math.round(bloodMax(body) / 4);
      return { body, harm };
    };
    const { body, harm } = hurt();
    const before = JSON.stringify(harm);
    const b = newBattle({
      fighters: [
        { id: "hurt", side: "left", body, harm },
        { id: "whole", side: "right", body: human() },
      ],
    });
    expect(JSON.stringify(harm)).toBe(before);
    const mine = b.fighters[0]!;
    expect(mine.harm.blood).toBe(harm.blood);
    expect(mine.harm).not.toBe(harm);
    // Four fights of the two, and the hurt one never wins more than the whole one.
    let hurtWins = 0;
    let wholeWins = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const r = runBattle(
        {
          fighters: [
            { id: "hurt", side: "left", body: hurt().body, harm: hurt().harm },
            { id: "whole", side: "right", body: human() },
          ],
        },
        new Rng(`hurt${seed}`),
      );
      if (r.winner === "left") hurtWins += 1;
      if (r.winner === "right") wholeWins += 1;
    }
    expect(wholeWins).toBeGreaterThan(hurtWins);
  });

  it("nobody says: the fighter is whole, exactly as before", () => {
    const body = human();
    const b = newBattle({ fighters: [{ id: "a", side: "left", body }] });
    expect(b.fighters[0]!.harm).toEqual(newHarm(body));
  });
});

describe("the result says who dealt what (decision 424)", () => {
  it("dealt and taken add up to the same blows the log names", () => {
    const r = fight(3);
    const fromLog: Record<string, { hits: number; damage: number }> = {};
    for (const e of r.log) {
      if (e.k !== "act") continue;
      const row = (fromLog[e.who] ??= { hits: 0, damage: 0 });
      row.hits += e.hits;
      row.damage += e.damage;
    }
    let dealt = 0;
    let taken = 0;
    for (const f of r.fighters) {
      expect(f.hits).toBe(fromLog[f.id]?.hits ?? 0);
      expect(f.dealt).toBe(fromLog[f.id]?.damage ?? 0);
      dealt += f.dealt;
      taken += f.taken;
    }
    expect(dealt).toBe(taken);
    expect(dealt).toBeGreaterThan(0);
  });
});

describe("a part with a brain never becomes meat (battle.md §4, decisions 428-429)", () => {
  it("shedding a head keeps every brain of the side: what lost its path leaves with it", () => {
    const shedOnce: Policy = (view): Action => {
      const opt = view.shed[0];
      return opt === undefined ? { k: "wait" } : { k: "shed", brain: opt.brain };
    };
    const b = newBattle({
      fighters: [
        { id: "a", side: "left", body: chain(), policy: shedOnce },
        { id: "b", side: "right", body: human() },
      ],
    });
    const before = brains(b.fighters[0]!.body).length;
    expect(before).toBe(3);
    const rng = new Rng(3);
    for (let i = 0; i < 10 && !b.log.some((e) => e.k === "shed"); i++) stepBattle(b, rng);
    expect(b.log.some((e) => e.k === "shed")).toBe(true);
    const mine = b.fighters.filter((f) => f.side === "left");
    expect(mine.reduce((n, f) => n + brains(f.body).length, 0)).toBe(before);
    // Everyone that left is a fighter of the same side, and every one of them is in the result.
    expect(mine.length).toBeGreaterThan(1);
    for (const f of mine.filter((x) => x.severed)) expect(brains(f.body).some((x) => x.self && x.alive)).toBe(true);
  });

  it("a piece with no living brain is meat: nothing joins the queue brain-dead", () => {
    for (const shape of [11, 29]) {
      for (let seed = 1; seed <= 40; seed++) {
        const b = newBattle({
          fighters: [
            { id: "a", side: "left", body: brainyBody(shape), policy: aimPolicy(AIMS.hunter) },
            { id: "b", side: "right", body: bodyFromText(CLAWED) },
          ],
        });
        const rng = new Rng(`dead${seed}`);
        while (b.result === null) stepBattle(b, rng);
        // A piece that joined alive may die in the fight later - its own head cut loose again takes its heart
        // (shape 11, seed 6 since decision 1260): that is a death on the sand, not meat that joined.
        for (const f of b.fighters.filter((x) => x.severed)) {
          if (f.out?.k === "dead") {
            expect(b.log.some((e) => (e.k === "wait" || e.k === "act") && e.who === f.id), `${shape}/${seed} ${f.id} never stood`).toBe(true);
            continue;
          }
          const self = brains(f.body).find((x) => x.self);
          expect(self?.alive, `${shape}/${seed} ${f.id}`).toBe(true);
        }
      }
    }
  });
});

describe("the fight takes its limits from outside (decisions 430-431)", () => {
  it("the cap on actions is passable: the coliseum's whistle is not the library's", () => {
    const setup = (maxActs: number): BattleResult =>
      runBattle(
        {
          fighters: [
            { id: "a", side: "left", body: human() },
            { id: "b", side: "right", body: human() },
          ],
          options: { maxActs, maxTurns: 1000, toDeath: true },
        },
        new Rng("cap"),
      );
    const short = setup(4);
    expect(short.acts).toBeLessThanOrEqual(4);
    expect(short.reason).toBe("limit");
    expect(setup(5000).acts).toBeGreaterThan(4);
  });

  it("the list of heads to shed is built only when a policy reads it", () => {
    const b = newBattle({
      fighters: [
        { id: "a", side: "left", body: chain() },
        { id: "b", side: "right", body: human() },
      ],
    });
    const view = battleView(b, "a")!;
    expect(Object.getOwnPropertyDescriptor(view, "shed")?.get, "shed is eager again").toBeTypeOf("function");
    // Read twice: the same list, built once.
    expect(view.shed.length).toBeGreaterThan(0);
    expect(view.shed).toBe(view.shed);
  });
});

describe("what the fight hands back (decisions 432-435)", () => {
  /** A fight that sheds on its first action, so there is always a severed part to read. */
  const shedder: Policy = (view): Action => {
    const opt = view.shed[0];
    return opt === undefined ? { k: "wait" } : { k: "shed", brain: opt.brain };
  };

  it("a severed part comes back as flesh, not as a name", () => {
    const r = runBattle(
      {
        fighters: [
          { id: "a", side: "left", body: chain(), policy: shedder },
          { id: "b", side: "right", body: human() },
        ],
      },
      new Rng(3),
    );
    expect(r.severed.length).toBeGreaterThan(0);
    for (const s of r.severed) {
      expect(validate(s.body)).toEqual([]);
      expect(brains(s.body).some((x) => x.self && x.alive)).toBe(true);
      expect(s.harm.blood).toBeGreaterThan(0);
      expect(s.harm.blood).toBeLessThanOrEqual(bloodMax(s.body));
      expect(r.fighters.find((f) => f.id === s.id)?.severed).toBe(true);
    }
  });

  it("everyone who walked onto the sand comes back as flesh: the loser goes on bleeding", () => {
    const r = fight(5);
    for (const f of r.fighters) {
      expect(validate(f.body)).toEqual([]);
      expect(f.harm.turn).toBeGreaterThanOrEqual(0);
      expect(f.mass).toBeCloseTo(mass(f.body), 9);
      expect(f.blood * bloodMax(f.body)).toBeCloseTo(Math.max(0, f.harm.blood), 6);
    }
    // The one that lost is hurt, and the record says how: a reading would not.
    const loser = r.fighters.find((f) => f.state !== "standing")!;
    expect(loser.harm.blood).toBeLessThan(bloodMax(loser.body));
    expect(totalBleed(loser.body, loser.harm) + Object.keys(loser.harm.organs).length).toBeGreaterThan(0);
    // What the fight hands back is its own copy; the whole fight runs without stepping it.
    const again = fight(5);
    expect(again.fighters[0]!.body).not.toBe(r.fighters[0]!.body);
  });

  it("a part that came off is nobody's to command: it fights by a temper of its own", () => {
    const given: string[] = [];
    const nosy: Policy = (view) => {
      given.push(view.self.id);
      return shedder(view);
    };
    const b = newBattle({
      fighters: [
        { id: "a", side: "left", body: chain(), policy: nosy },
        { id: "bb", side: "right", body: human() },
      ],
    });
    const rng = new Rng(3);
    for (let i = 0; i < 40 && b.result === null; i++) stepBattle(b, rng);
    expect(b.fighters.some((f) => f.severed)).toBe(true);
    // The policy it was given was asked about its own body and about nothing else.
    expect([...new Set(given)]).toEqual(["a"]);
    for (const f of b.fighters.filter((x) => x.severed)) expect(f.policy).not.toBe(nosy);
  });

  it("a fighter that counts for nothing is a target and no more", () => {
    const setup = (counts: boolean): BattleResult =>
      runBattle(
        {
          fighters: [
            { id: "you", side: "left", body: human() },
            { id: "servant", side: "left", body: human(), counts },
            { id: "foe", side: "right", body: human() },
          ],
        },
        new Rng("servant"),
      );
    const withServant = setup(false);
    // It is in the result, it is a legal target, and it never kept its side standing.
    const row = withServant.fighters.find((f) => f.id === "servant")!;
    expect(row.counts).toBe(false);
    expect(withServant.log.some((e) => e.k === "act" && e.target === "servant")).toBe(true);
    if (withServant.winner === "right") {
      expect(withServant.fighters.find((f) => f.id === "you")!.state).not.toBe("standing");
    }
    expect(setup(true).fighters.find((f) => f.id === "servant")!.counts).toBe(true);
  });

  it("where on the target the volley goes is the order's to say", () => {
    const at = (aim: number): Policy => (view) => (view.foes.length === 0 ? { k: "wait" } : { k: "strike", target: view.foes[0]!.id, profile: "at", aim });
    const b = newBattle({
      fighters: [
        { id: "a", side: "left", body: human(), policy: at(HUMAN_IDS.armR) },
        { id: "b", side: "right", body: human() },
      ],
    });
    const rng = new Rng("aimed");
    for (let i = 0; i < 6 && b.result === null; i++) stepBattle(b, rng);
    const hits = b.log.flatMap((e) => (e.k === "harm" && e.who === "b" ? e.events : [])).filter((e) => e.k === "hit");
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) expect(h.id).toBe(HUMAN_IDS.armR);
    // Saying nothing is the old behaviour: the openness of the body decides.
    const plain = fight(4);
    const spread = new Set(plain.log.flatMap((e) => (e.k === "harm" ? e.events : [])).filter((e) => e.k === "hit").map((e) => e.id));
    expect(spread.size).toBeGreaterThan(1);
  });
});

describe("a blow of the body is paid for (strike.md §1.8, decision 425)", () => {
  it("a gland empties the reserve of the one that breathed, and stops when it is dry", () => {
    // The young dragon: the grown one swings every limb at three turns and never needs the breath on a man (decision 1284).
    const dragon = fixtureBody(beastById("youngDragon")!);
    const b = newBattle({
      fighters: [
        { id: "drake", side: "left", body: dragon },
        { id: "man", side: "right", body: human() },
      ],
      options: { toDeath: true },
    });
    const drake = b.fighters[0]!;
    const start = drake.harm.reserve;
    const rng = new Rng("breath");
    let guard = 0;
    while (b.result === null && guard++ < 4000) stepBattle(b, rng);
    expect(drake.harm.reserve).toBeLessThan(start);
    // Once the reserve cannot pay for it, the fire is out of the volley for good.
    const dry = planStrike(drake.body, human(), 1, { reserve: 0 });
    expect(dry.planned.some((p) => p.strike.cost > 0)).toBe(false);
  });
});
