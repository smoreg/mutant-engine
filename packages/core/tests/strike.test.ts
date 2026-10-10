/**
 * The body's blow, strike.md: strikes from the graph, the volley by brain
 * territories, grabs, the fold a head or a slip strikes you with.
 */
import { LabRng as Rng } from "../rng.js";
import { describe, expect, it } from "vitest";
import {
  DODGE,
  STRIKE,
  blowOf,
  bodyFromText,
  brains,
  derive,
  dodgeOf,
  excessChannels,
  extraBonus,
  foldReach,
  grabs,
  human,
  HUMAN_IDS,
  landVolley,
  newHarm,
  organ,
  ownership,
  planStrike,
  rollVolley,
  seizedReach,
  selfElement,
  sightDodge,
  sizeDodge,
  eyesWorth,
  slipPool,
  strikeForce,
  strikeTime,
  strikes,
  swingLength,
  organMass,
  touch,
  volley,
  volleyCost,
  type Body,
  type Dose,
  fixtureBody,
  beastById,
} from "../index.js";
import { population } from "./gen.js";
import { swampMutant } from "./genHeads.js";

function beast(id: string): Body {
  return fixtureBody(beastById(id)!);
}

describe("a strike from the graph", () => {
  it("human strike numbers", () => {
    const list = strikes(human());
    const fist = list.find((s) => s.kind === "hand")!;
    expect(fist).toMatchObject({ dice: "1d3", mass: 8, force: 0, time: 100, accuracy: 1, reach: 1, type: "blunt", mine: true });
    const bite = list.find((s) => s.kind === "head")!;
    expect(bite).toMatchObject({ bite: "jaw", dice: "1d3", mass: 11, time: 100, accuracy: 0 });
    expect(list.find((s) => s.kind === "foot")!.mass).toBe(9);
    expect(list.length).toBe(5);
  });

  it("force grows with mass, time with the lever it swings on", () => {
    // Force is four per unit of the root of the mass past the arm's (decision 1263).
    // Below the arm the same formula goes negative, and no blow is quicker than the arm (decision 1298).
    const table: [number, number][] = [[4, -2], [8, 0], [11, 0], [12, 0], [16, 1], [23, 2], [32, 4], [45, 5], [64, 7], [90, 9]];
    for (const [m, force] of table) expect(strikeForce(m), `force ${m}`).toBe(force);
    // Time is the period of the pendulum the limb swings as, the human's arm 100 (decision 1300).
    const h = human();
    const fist = strikes(h).find((s) => s.kind === "hand")!;
    const arm = swingLength(h, fist.chain, organMass(h.nodes[fist.node]!.ends[fist.index!]!));
    const times: [number, number][] = [[0.5, 100], [1, 100], [1.5, 122], [2, 141], [4, 200], [8, 283], [9, 300], [20, 300]];
    for (const [k, time] of times) expect(strikeTime(arm * k), `time x${k}`).toBe(time);
    for (let m = 1; m < 200; m++) {
      expect(strikeForce(m + 1)).toBeGreaterThanOrEqual(strikeForce(m));
      expect(strikeTime((arm * (m + 1)) / 10)).toBeGreaterThanOrEqual(strikeTime((arm * m) / 10));
    }
  });

  it("head bites with its best content", () => {
    const body = bodyFromText(`# узлы: имя[размер] {окончания}; * — твой мозг
голова[2] {голова(мозг*, глаз, челюсть, хищные челюсти)}
грудь[3]
таз[3]

# сегменты: узел -вид:длина/обхват покров {полость}- узел
голова -шея:1/1 кожа- грудь
грудь -корпус:2/3 кожа {сердце, лёгкие, желудок}- таз
`);
    const bites = strikes(body).filter((s) => s.kind === "head");
    expect(bites).toHaveLength(1);
    expect(bites[0]).toMatchObject({ bite: "fangs", dice: "1d8", type: "bite" });
  });

  it("a venom gland makes the bite venomous, and only the bite (decision 122)", () => {
    const spider = beast("spider");
    const bite = strikes(spider).find((s) => s.kind === "head")!;
    expect(bite).toMatchObject({ bite: "mandibles", dice: "1d6", venom: true });
    for (const s of strikes(spider).filter((x) => x.kind !== "head")) expect(s.venom, s.key).toBe(false);
    // The human has the jaw but no gland; a sting carries venom with no gland at all.
    expect(strikes(human()).every((s) => !s.venom)).toBe(true);
    const stung = bodyFromText(`
голова[2] {голова(мозг*, глаз, челюсть)}
грудь[3]
таз[3]
жало.узел[1] {жало}
голова -шея:1/1 кожа- грудь
грудь -корпус:2/3 кожа {сердце, лёгкие, желудок}- таз
таз -хвост:2/1 кожа- жало.узел
`);
    expect(strikes(stung).find((s) => s.kind === "sting")!.venom).toBe(true);
    expect(strikes(stung).find((s) => s.kind === "head")!.venom).toBe(false);
  });
});

describe("the volley", () => {
  it("volley human: three strikes on skin, none on chitin", () => {
    const list = strikes(human());
    expect(volley(list, { armor: 0 }).planned).toHaveLength(3);
    expect(volley(list, { armor: 3 }).planned).toHaveLength(0);
  });

  it("volley centipede: it swings what its channels allow, never all twenty-two claws", () => {
    const body = beast("centipede");
    const list = strikes(body);
    // Sixteen since decision 1256: a pair of legs on each of eight segments instead of four on each of six;
    // twenty-two since decision 1317, when the nerve cord came to steer the whole trunk.
    expect(list.filter((s) => s.kind === "claw")).toHaveLength(22);
    // The count moved when the bestiary gave the centipede a spinal node per segment to fix its
    // channels: more channels, more legs at once. The rule is what holds - the budget still binds.
    const planned = volley(list, { armor: 0 }, { excess: excessChannels(body) }).planned;
    expect(planned.length).toBeGreaterThan(0);
    expect(planned.length).toBeLessThan(list.length);
  });

  it("heads volley in parallel: each head of the hydra bites without a penalty", () => {
    const body = beast("hydra");
    const v = volley(strikes(body), { armor: 0 }, { excess: excessChannels(body) });
    // A head is a brain in a head; the spinal nodes that fixed the hydra's channels are brains in a
    // cavity, and they pay a penalty like any brain swinging what is not theirs. Heads do not.
    const heads = v.groups.filter((g) => {
      const b = brains(body)[g.group]!;
      return !b.self && b.head !== null;
    });
    expect(heads.length).toBe(brains(body).filter((b) => !b.self && b.head !== null).length);
    expect(heads.length).toBeGreaterThanOrEqual(4);
    for (const g of heads) expect(g.penalty).toBe(0);
  });

  it("extra limb never lowers the rate", () => {
    const bodies = population(120);
    for (const body of bodies) {
      const list = strikes(body);
      if (list.length < 2) continue;
      for (const armor of [0, 2]) {
        const all = volley(list, { armor }).rate;
        const less = volley(list.slice(1), { armor }).rate;
        expect(all + 1e-9).toBeGreaterThanOrEqual(less);
      }
    }
  });

  it("excess channels free strikes", () => {
    const list = strikes(human());
    expect(volley(list, { armor: 0 }, { excess: 10 }).groups[0]!.free).toBe(3);
    expect(volley(list, { armor: 0 }, { excess: 4 }).groups[0]!.free).toBe(1);
  });

  it("slipped organ leaves the volley", () => {
    const list = strikes(human());
    const skip = new Set(list.filter((s) => s.kind === "hand").map((s) => s.key));
    const v = volley(list, { armor: 0 }, { skip });
    expect(v.planned.some((p) => p.strike.kind === "hand")).toBe(false);
  });

  it("reach decides who strikes at a distance", () => {
    const list = strikes(beast("snake"));
    const far = volley(list, { armor: 0, distance: 2 });
    expect(far.planned.length).toBeGreaterThan(0);
    for (const p of far.planned) expect(p.strike.reach).toBeGreaterThanOrEqual(2);
    expect(volley(strikes(human()), { armor: 0, distance: 2 }).planned).toHaveLength(0);
  });

  it("octopus grabs", () => {
    const body = beast("octopus");
    const g = grabs(body);
    expect(g).toHaveLength(8);
    for (const s of g) expect(s.type).toBe("squeeze");
  });

  it("deterministic: one body, one seed - one volley and one roll", () => {
    const body = beast("scorpion");
    const a = volley(strikes(body), { armor: 2 }, { excess: excessChannels(body) });
    const b = volley(strikes(structuredClone(body)), { armor: 2 }, { excess: excessChannels(body) });
    expect(b.planned.map((p) => p.strike.key)).toEqual(a.planned.map((p) => p.strike.key));
    const r1 = rollVolley(a, new Rng(5)).map((x) => [x.hit, x.amount]);
    const r2 = rollVolley(b, new Rng(5)).map((x) => [x.hit, x.amount]);
    expect(r2).toEqual(r1);
    expect(a.rate).toBeCloseTo(b.rate, 9);
  });
});

describe("striking yourself", () => {
  it("fold reach: a hand folds at its shoulder and reaches the head, the other hand and the pelvis, never its own arm", () => {
    const body = human();
    const hand = strikes(body).find((s) => s.kind === "hand" && s.node === 4)!;
    const fold = foldReach(body, hand);
    // The chain is forearm and upper arm; it folds at the shoulder, two lengths from the hand.
    expect(hand.chain).toEqual([27, 10]);
    expect(fold.root).toBe(14);
    expect(fold.length).toBe(2);
    // head, chest, pelvis, the other hand, the neck, the torso, the other arm, both legs
    for (const id of [1, 2, 3, 5, 8, 9, 11, 12, 13]) expect(fold.elements, `reaches ${id}`).toContain(id);
    // its own node, its own elbow and its own two segments stay out
    for (const id of [4, 22, 27, 10]) expect(fold.elements, `holds back from ${id}`).not.toContain(id);
  });

  it("head never strikes its own territory", () => {
    for (const sway of [0, 1, 4, 8]) {
      const body = swampMutant(sway);
      const own = ownership(body);
      brains(body).forEach((b, group) => {
        if (b.self) return;
        for (const r of seizedReach(body, group)) {
          for (const id of r.elements) {
            const seg = body.segments[id];
            const mine = seg === undefined ? own.owner.get(id) === group : own.owner.get(seg.a) === group && own.owner.get(seg.b) === group;
            expect(mine, `sway ${sway}: head ${group} strikes its own ${id}`).toBe(false);
          }
        }
      });
    }
  });

  it("swamp head: nothing to strike with at sway 0, kicks the torso from sway 1", () => {
    const calm = swampMutant(0);
    expect(seizedReach(calm, 1)).toHaveLength(0);
    const loud = swampMutant(1);
    const reach = seizedReach(loud, 1);
    expect(reach.map((r) => r.strike.kind).sort()).toEqual(["foot", "foot"]);
    for (const r of reach) expect(r.elements).toContain(10);
    expect(reach.some((r) => r.elements.includes(selfElement(loud)))).toBe(false);
  });

  it("a slipped limb weighs an enemy at 2 against the whole of your fold at 1", () => {
    const body = human();
    const hand = strikes(body).find((s) => s.kind === "hand")!;
    const pool = slipPool(body, hand, 1);
    const enemy = pool.filter((p) => p.enemy !== null).reduce((a, p) => a + p.weight, 0);
    const self = pool.filter((p) => p.enemy === null).reduce((a, p) => a + p.weight, 0);
    expect(enemy).toBe(STRIKE.enemyWeight);
    expect(self).toBeCloseTo(1, 9);
  });
});

/** A source that lands every roll: the dice are the lowest face, and nothing is ever a miss. */
const lands = { next: () => 0 };

describe("the seam to the damage track (strike.md §6, decision 420)", () => {
  it("a blow carries its type, its burn and what its additions rolled - not the damage alone", () => {
    const dragon = beast("dragon");
    const fire = strikes(dragon).find((s) => s.kind === "fireGland")!;
    expect(fire).toMatchObject({ type: "pierce", burn: true, cost: 30 });
    const roll = rollVolley(volley([fire], { armor: 0 }), lands)[0]!;
    const blow = blowOf(roll);
    expect(blow).toMatchObject({ type: "pierce", burn: true, damage: roll.amount });
  });

  it("a venomous bite hands the track a dose, a bare one hands it none", () => {
    const spider = beast("spider");
    const list = strikes(spider);
    const venomous = list.find((s) => s.extras.some((e) => e.kind === "venom"))!;
    expect(venomous).toBeDefined();
    const bare = list.find((s) => s.extras.length === 0)!;
    const doses = (s: (typeof list)[number]): readonly Dose[] => blowOf(rollVolley(volley([s], { armor: 0 }), lands)[0]!).doses ?? [];
    expect(doses(venomous).map((d) => d.kind)).toEqual(["venom"]);
    expect(doses(venomous)[0]!.amount).toBeGreaterThan(0);
    expect(doses(venomous)[0]!.delay).toBeGreaterThan(0);
    expect(doses(bare)).toEqual([]);
  });

  it("the dragon's fire reaches the track and burns there", () => {
    const dragon = beast("dragon");
    const target = human();
    const harm = newHarm(target);
    const fire = strikes(dragon).find((s) => s.kind === "fireGland")!;
    // One strike, a roll forced to land: what the track sees is the fire alone.
    const landed = landVolley(volley([fire], { armor: 0 }), target, harm, lands);
    const hit = landed.events.find((e) => e.k === "hit")!;
    expect(hit.k).toBe("hit");
    // Pain is damage / 2 and the five of the burn on top; without the flag the five are not there.
    const pain = hit.pain.reduce((s, p) => s + p.amount, 0);
    expect(pain).toBeGreaterThanOrEqual(Math.round(hit.damage / 2) + 5);
  });
});

describe("the additions are in the roll and in the plan (decision 422)", () => {
  const ACID = `голова[2] {голова(мозг*, глаз, челюсть)}
грудь[3]
таз[3]
голова -шея:1/1 кожа- грудь
грудь -корпус:2/3 кожа {сердце, лёгкие, желудок, кислотная железа}- таз
`;

  it("a flat addition rides in the amount the track is handed, and in what the plan expects", () => {
    const acid = bodyFromText(ACID);
    const bite = strikes(acid).find((s) => s.kind === "head")!;
    expect(extraBonus(bite)).toBe(1);
    const roll = rollVolley(volley([bite], { armor: 0 }), lands)[0]!;
    expect(roll.amount).toBe(roll.roll + bite.force + 1);
    const plain = { ...bite, extras: [] };
    expect(volley([bite], { armor: 0 }).expected).toBeGreaterThan(volley([plain], { armor: 0 }).expected);
  });

  it("a bare strike rolls exactly what it always rolled", () => {
    const fist = strikes(human()).find((s) => s.kind === "hand")!;
    expect(extraBonus(fist)).toBe(0);
    const roll = rollVolley(volley([fist], { armor: 0 }), lands)[0]!;
    expect(roll.amount).toBe(roll.roll + fist.force);
    expect(roll.doses).toEqual([]);
  });
});

describe("a blow of the body is paid for out of the reserve (strike.md §1.8, decision 425)", () => {
  it("the volley says what it empties", () => {
    // The swift half of the dragon at three cells: only the breath reaches there, the claws of its legs would outrate it (decision 1300).
    const swift = strikes(beast("dragon")).filter((s) => s.time <= 150);
    const v = volley(swift, { armor: 0, distance: 3 });
    const paid = v.planned.filter((p) => p.strike.cost > 0);
    expect(paid.length).toBeGreaterThan(0);
    expect(volleyCost(v)).toBe(paid.reduce((s, p) => s + p.strike.cost, 0));
    expect(volleyCost(volley(strikes(human()), { armor: 0 }))).toBe(0);
  });

  it("a gland with nothing behind it does not fire", () => {
    const swift = strikes(beast("dragon")).filter((s) => s.time <= 150);
    const rich = volley(swift, { armor: 0, distance: 3 }, { reserve: 400 });
    const dry = volley(swift, { armor: 0, distance: 3 }, { reserve: 0 });
    expect(rich.planned.some((p) => p.strike.kind === "fireGland")).toBe(true);
    expect(dry.planned.some((p) => p.strike.cost > 0)).toBe(false);
    expect(volleyCost(dry)).toBe(0);
  });
});

describe("dodge lives where the volley asks for it (decision 421)", () => {
  it("is the speed of the body, what it sees the blow with and the size of the mark, in its bounds", () => {
    for (const id of ["dragon", "spider", "crab"]) {
      for (const body of [human(), beast(id)]) {
        const step = Math.round((derive(body).speed.value - DODGE.base) / DODGE.perStep);
        expect(dodgeOf(body)).toBe(Math.max(DODGE.min, Math.min(DODGE.max, step + sightDodge(body) + sizeDodge(body))));
      }
    }
  });

  // Decision 552: the seeing part watches the blow, but the number is the
  // body's, because `hitChance` is rolled before the blow knows where it
  // lands. One pair of eyes is the human's and worth nothing - the 70 % of
  // §1.4 was measured on it.
  it("one seeing place is worth nothing, a second one a point, none at all costs two", () => {
    const one = human();
    expect(derive(one).senses.viewpoints.length).toBe(1);
    expect(sightDodge(one)).toBe(0);
    expect(dodgeOf(one)).toBe(0);

    const two = swampMutant(0);
    expect(derive(two).senses.viewpoints.length).toBe(2);
    // Its second place has one eye: two thirds of a pair (decision 1273).
    expect(sightDodge(two)).toBeCloseTo(DODGE.perViewpoint * eyesWorth(1), 9);

    const blind = human();
    for (const e of blind.nodes[HUMAN_IDS.head]!.ends) e.contents = (e.contents ?? []).filter((c) => c.kind !== "eye");
    touch(blind);
    expect(derive(blind).senses.sight).toBe(false);
    expect(sightDodge(blind)).toBe(DODGE.blind);
    expect(dodgeOf(blind)).toBe(DODGE.blind);
  });

  it("the sight term never runs past its cap, and the bounds of the whole still hold", () => {
    const many = human();
    // Two eyes on the chest and on both hands, all within the brain's reach
    // (decision 1270): four seeing places, and the term stops at `sightMax`
    // long before the count does.
    for (const id of [HUMAN_IDS.chest, HUMAN_IDS.handL, HUMAN_IDS.handR]) many.nodes[id]!.ends.push(organ("eye"), organ("eye"));
    touch(many);
    expect(derive(many).senses.viewpoints.length).toBe(4);
    expect(sightDodge(many)).toBe(DODGE.sightMax);
    expect(dodgeOf(many)).toBeLessThanOrEqual(DODGE.max);
    expect(dodgeOf(many)).toBeGreaterThanOrEqual(DODGE.min);
  });

  it("a plan takes the target's own dodge unless the caller says otherwise", () => {
    const me = human();
    const foe = beast("crab");
    expect(planStrike(me, foe, 1)).toEqual(volley(strikes(me), { armor: derive(foe).armor.mean, dodge: dodgeOf(foe), distance: 1 }, { excess: excessChannels(me) }));
    expect(planStrike(me, foe, 1, { dodge: 0 })).toEqual(volley(strikes(me), { armor: derive(foe).armor.mean, dodge: 0, distance: 1 }, { excess: excessChannels(me) }));
  });
});
