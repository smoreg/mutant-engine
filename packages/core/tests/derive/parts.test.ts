import { describe, expect, it } from "vitest";
import {
  FLIGHT_AREA,
  HUMAN_IDS,
  addMembrane,
  apply,
  bodyFromText,
  breathCost,
  derive,
  human,
  organ,
  strideOf,
  targets,
  touch,
  validate,
  wearMembrane,
  type Body,
} from "../../index.js";

const H = HUMAN_IDS;

function sproutAtHand(b: Body, length: number, ending = organ("hand")): number {
  return apply(b, "sprout", { kind: "tentacle", length, girth: 1, cover: "skin", ending }, { node: H.handL }).created[0]!;
}

describe("attacks", () => {
  it("reach grows with tentacle length: from the hand, 1 reaches 2 and 6 reaches 3", () => {
    const short = human(1000);
    const n4 = sproutAtHand(short, 1);
    const a4 = derive(short).attacks.find((a) => a.node === n4)!;
    expect(a4.reach).toBe(2);
    // Tentacle, forearm, upper arm and the shoulder's flank, which adds no length.
    expect(a4.chain).toEqual([a4.segment, H.forearmL, H.armL]);
    const long = human(1000);
    const n6 = sproutAtHand(long, 6);
    expect(derive(long).attacks.find((a) => a.node === n6)!.reach).toBe(3);
    // Straight from the torso the same tentacle reaches by its own length, a cell per two (decision 1267): 6 -> 3.
    // The chest is a small full node now: the tentacle grows from the shoulder, a side node of the torso.
    const chest = human(1000);
    const c = apply(chest, "sprout", { kind: "tentacle", length: 6, girth: 1, cover: "skin", ending: organ("hand") }, { node: H.shoulderR }).created[0]!;
    expect(derive(chest).attacks.find((a) => a.node === c)!.reach).toBe(3);
  });

  it("a pincer on a torso node strikes from the torso: reach 1, mass of the pincer alone", () => {
    const b = bodyFromText(`
      голова[2] {голова(мозг*, глаз)}
      грудь[3] {клешня}
      таз[3]
      голова -шея:1/1 кожа- грудь
      грудь -корпус:2/3 кожа {сердце, лёгкие, желудок}- таз
    `);
    const a = derive(b).attacks.find((x) => x.kind === "pincer")!;
    expect(a).toMatchObject({ node: 2, dice: "1d8", reach: 1, chain: [], mass: 3 });
  });

  it("a chrome arm strikes for free: the chain weighs nothing to the lungs", () => {
    // The whole arm in chrome: the upper arm and the forearm, 3 + 3 of mass.
    const b = human(1000);
    b.segments[H.armL]!.cover = "chrome";
    b.segments[H.forearmL]!.cover = "chrome";
    touch(b);
    const d = derive(b);
    expect(d.attacks.find((a) => a.node === H.handL)!.mass).toBe(2);
    expect(d.breath.muscles.limbs).toBe(34 - 6);
  });

  it("a tail strikes backward from its tip: 1d6 with the tail's own mass, listed after the endings of its node", () => {
    const b = human(1000);
    // The pelvis is a small full node now: the tail grows from a hip; its node is 32, its segment 33.
    const tip = apply(b, "sprout", { kind: "tail", length: 2, girth: 1, cover: "skin", ending: null }, { node: H.hipL }).created[0]!;
    const tail = apply(b, "sprout", { kind: "tail", length: 1, girth: 1, cover: "skin", ending: organ("sting") }, { node: tip }).created[1]!;
    const d = derive(b);
    const strikes = d.attacks.filter((a) => a.kind === "tail");
    // The second tail strikes with its sting alone: one limb is one blow (decision 1266).
    expect(strikes).toHaveLength(1);
    expect(strikes[0]).toEqual({ node: tip, index: null, kind: "tail", dice: "1d6", reach: 1, segment: 33, chain: [33], mass: 6, extras: [] });
    // The second tail hangs off the first: its tip strikes with the sting on it, over both, reach 2 for length 3.
    const sting = d.attacks.find((a) => a.kind === "sting")!;
    expect(sting).toMatchObject({ segment: tail, chain: [tail, 33], reach: 2 });
    expect(d.attacks.filter((a) => a.node === sting.node).map((a) => a.kind)).toEqual(["sting"]);
  });
});

describe("speed", () => {
  const leg = { kind: "leg", length: 2, girth: 1, cover: "skin", ending: organ("foot") } as const;

  it("more legs, less from each past the human's two, and a leg too little to carry its weight slows (decision 1291)", () => {
    const b = human(100_000);
    const values = [derive(b).speed.value];
    // Chest and pelvis are small full nodes now: legs grow from the hips and the shoulders.
    for (const node of [H.hipL, H.hipR, H.hipL, H.shoulderL, H.shoulderR]) {
      apply(b, "sprout", leg, { node });
      values.push(derive(b).speed.value);
    }
    expect(values).toHaveLength(6);
    expect(values[0]).toBe(100);
    const steps = values.slice(1).map((v, i) => v - values[i]!);
    // Past the human's support every leg adds less than the one before, and weighs its own:
    // the third, the fourth and the fifth still add; a leg past the fifth, at a quarter of a stand, is dead weight.
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeLessThan(steps[i - 1]!);
    for (const s of steps.slice(0, 3)) expect(s).toBeGreaterThan(0);
  });

  it("a longer leg is a faster leg; a hoof stands higher than a foot", () => {
    const b = human(1000);
    apply(b, "stretch", { delta: 1 }, { segment: H.legL });
    expect(derive(b).speed.value).toBeGreaterThan(100);
    expect(derive(b).speed.stands[0]!.length).toBe(3);
    const h = human(1000);
    apply(h, "rebirth", { ending: organ("hoof") }, { ending: { node: H.footL, index: 0 } });
    expect(derive(h).speed.stands[0]!.level).toBe(4);
    expect(derive(h).speed.value).toBeGreaterThan(100);
  });

  it("a ring of six segments with stands on it rolls: x1.5 and no climbing", () => {
    const b = bodyFromText(`
      мясо 1000
      голова[2] {голова(мозг*, глаз, глаз)}
      грудь[3]
      таз[3]
      к1[1] {коготь}
      к2[1] {коготь}
      к3[1] {коготь}
      к4[1] {коготь}
      к5[1] {коготь}
      голова -шея:1/1 кожа- грудь
      грудь -корпус:2/3 кожа {сердце, лёгкие, желудок}- таз
      таз -нога:1/1 кожа- к1
      к1 -нога:1/1 кожа- к2
      к2 -нога:1/1 кожа- к3
      к3 -нога:1/1 кожа- к4
      к4 -нога:1/1 кожа- к5
      к5 -нога:1/1 кожа- таз
    `);
    expect(validate(b)).toEqual([]);
    const d = derive(b);
    expect(d.speed.ring).toBe(true);
    expect(d.speed.stands.every((s) => s.onRing)).toBe(true);
    expect(d.speed.value).toBe(Math.round(100 * strideOf(d.speed.support) * 1.5 * d.speed.burden));
    expect(d.locomotion.climb).toBe(false);
    expect(d.locomotion.dig).toBe(2);
  });
});

describe("locomotion", () => {
  /** A human whose left arm is jointed into a triangle with the chest and a side node: a cycle of three of total length 9. */
  function winged(): { body: Body; membrane: number } {
    const body = bodyFromText(`
      мясо 1000
      голова[2] {голова(мозг*, глаз, глаз, челюсть)}
      грудь[3]
      таз[3]
      бок[2]
      кончик[1]
      стопа.л[1] {стопа}
      стопа.п[1] {стопа}
      голова -шея:1/1 кожа- грудь
      грудь -корпус:2/3 кожа {сердце, лёгкие, желудок}- таз
      грудь -рука:3/1 кожа- бок
      бок -рука:3/1 кожа- кончик
      кончик -рука:3/1 кожа- грудь
      таз -нога:2/1 кожа- стопа.л
      таз -нога:2/1 кожа- стопа.п
    `);
    const membrane = addMembrane(body, [10, 11, 12], "wing");
    return { body, membrane };
  }

  it("wing membrane of area >= 8 grants flight, torn - not", () => {
    const { body, membrane } = winged();
    expect(body.membranes[membrane]!.area).toBe(9);
    let d = derive(body);
    expect(d.locomotion.fly).toBe(true);
    expect(d.locomotion.falls).toBe(false);
    expect(d.locomotion.wings).toEqual([{ membrane, area: 9 }]);
    expect(d.breath.muscles.wings).toBe(27);
    expect(breathCost(d, "fly")).toBeCloseTo(d.breath.base + 1.5 * 2.7, 9);
    wearMembrane(body, membrane, 6);
    d = derive(body);
    expect(body.membranes[membrane]!.area).toBe(FLIGHT_AREA - 1);
    expect(d.locomotion.fly).toBe(false);
    expect(d.locomotion.wings).toEqual([{ membrane, area: 7 }]);
    wearMembrane(body, membrane, 30);
    d = derive(body);
    expect(d.locomotion.fly).toBe(false);
    expect(d.locomotion.wings).toEqual([]);
    expect(d.breath.muscles.wings).toBe(0);
  });

  it("a sail is not a wing; a fin swims", () => {
    const { body, membrane } = winged();
    body.membranes[membrane]!.kind = "sail";
    touch(body);
    expect(derive(body).locomotion).toMatchObject({ fly: false, swim: false, wings: [] });
    body.membranes[membrane]!.kind = "fin";
    touch(body);
    expect(derive(body).locomotion).toMatchObject({ fly: false, swim: true, wings: [] });
    expect(derive(body).breath.muscles.wings).toBe(0);
  });

  it("a hook holds the edge; a claw climbs and holds it too; a pseudopod squeezes", () => {
    const b = human(1000);
    apply(b, "rebirth", { ending: organ("hook") }, { ending: { node: H.handL, index: 0 } });
    // One hook digs 1, but not enough to move a human through the ground (decision 1279).
    expect(derive(b).locomotion).toMatchObject({ edge: true, falls: false, climb: false, dig: 0 });
    const c = human(1000);
    apply(c, "rebirth", { ending: organ("claw") }, { ending: { node: H.handL, index: 0 } });
    // One claw holds the edge and digs; it takes a pair to hold a human on a wall (decision 1279).
    expect(derive(c).locomotion).toMatchObject({ edge: true, falls: false, climb: false, dig: 2 });
    apply(c, "rebirth", { ending: organ("claw") }, { ending: { node: H.handR, index: 0 } });
    expect(derive(c).locomotion).toMatchObject({ edge: true, falls: false, climb: true, dig: 2 });
    const p = human(1000);
    apply(p, "rebirth", { ending: organ("pseudopod") }, { ending: { node: H.handL, index: 0 } });
    apply(p, "rebirth", { ending: organ("pseudopod") }, { ending: { node: H.handR, index: 0 } });
    expect(derive(p).locomotion.squeeze).toBe(2);
  });

  it("scales do not swim, fins do (decision 1239); a womb or an ovipositor lays eggs, sterility does not", () => {
    const b = human(1000);
    // An ending takes the cover of the segment it hangs on: the foot's is the shin - and a scaled shin is still a leg.
    b.segments[H.shinL]!.cover = "scales";
    touch(b);
    expect(derive(b).locomotion.swim).toBe(false);
    b.segments[H.torso]!.growths.push(organ("fins"));
    touch(b);
    expect(derive(b).locomotion.swim).toBe(true);
    const w = human(1000);
    w.segments[H.torso]!.cavity.push(organ("womb"));
    touch(w);
    expect(derive(w).locomotion.layEgg).toBe(true);
    w.segments[H.torso]!.cavity.push(organ("sterility"));
    touch(w);
    expect(derive(w).locomotion.layEgg).toBe(false);
    const o = human(1000);
    o.segments[H.torso]!.cavity.push(organ("ovipositor"));
    touch(o);
    expect(derive(o).locomotion.layEgg).toBe(true);
  });
});

describe("bulk and passage", () => {
  it("footprint follows bulk: 1 to 5 one cell, 6-7 two by two, 8-9 three by three", () => {
    const b = human(100_000);
    const seen = new Map<number, number>();
    for (let i = 0; i < 60; i++) {
      const t = targets(b, "sprout", { kind: "leg", length: 3, girth: 2, cover: "plates", ending: organ("hoof") });
      if (t.length === 0) break;
      apply(b, "sprout", { kind: "leg", length: 3, girth: 2, cover: "plates", ending: organ("hoof") }, t[0]!.target);
      const d = derive(b);
      seen.set(d.bulk, d.footprint);
      expect(d.footprint).toBe(d.bulk <= 5 ? 1 : d.bulk <= 7 ? 2 : 3);
      expect(d.passage.free).toBe(d.footprint === 1 ? (d.bulk <= 3 ? 1 : 2) : d.footprint);
      expect(d.passage.squeeze).toBe(d.bulk >= 8 ? null : 1);
    }
    expect(Math.max(...seen.keys())).toBeGreaterThanOrEqual(6);
  });

  it("a folding skeleton passes as one smaller; alien geometry as bulk 1; slime squeezes one smaller", () => {
    const b = human(1000);
    b.segments[H.torso]!.cavity.push(organ("foldingSkeleton"));
    touch(b);
    expect(derive(b).bulk).toBe(3);
    expect(derive(b).passage).toMatchObject({ bulk: 2, free: 1 });
    const g = human(1000);
    g.segments[H.torso]!.growths.push(organ("alienGeometry"));
    touch(g);
    expect(derive(g).passage).toMatchObject({ bulk: 1, free: 1, slits: true });
    const s = human(1000);
    s.segments[H.legL]!.cover = "slime";
    touch(s);
    expect(derive(s).locomotion.squeeze).toBe(1);
    expect(derive(s).passage).toMatchObject({ bulk: 2, free: 1 });
    // Two ways to squeeze take two off; a third takes nothing more.
    s.segments[H.torso]!.cavity.push(organ("foldingSkeleton"));
    apply(s, "rebirth", { ending: organ("pseudopod") }, { ending: { node: H.handL, index: 0 } });
    expect(derive(s).locomotion.squeeze).toBe(3);
    expect(derive(s).passage.bulk).toBe(1);
  });
});

describe("senses", () => {
  it("eye on a stalk sees from its own node", () => {
    const b = human(1000);
    // From the shoulder, so that the eye is within the brain's reach (decision 1270).
    const stalk = apply(b, "sprout", { kind: "stalk", length: 2, girth: 1, cover: "skin", ending: organ("eye") }, { node: H.shoulderL }).created[0]!;
    const s = derive(b).senses;
    expect(s.viewpoints).toEqual([
      { node: H.head, eyes: 2, heat: false },
      { node: stalk, eyes: 1, heat: false },
    ]);
  });

  it("blindness and deafness in a head silence its eyes and ears; heat eyes, echo and deep sense are their own channels", () => {
    const b = human(1000);
    const head = b.nodes[H.head]!.ends[0]!;
    head.contents!.push(organ("blindness"), organ("deafness"));
    touch(b);
    let s = derive(b).senses;
    expect(s.viewpoints).toEqual([]);
    expect(s.sight).toBe(false);
    expect(s.hearing).toBe(0);
    head.contents = head.contents!.filter((o) => o.kind !== "blindness" && o.kind !== "deafness");
    head.contents.push(organ("heatEye"), organ("echo"));
    b.segments[H.torso]!.cavity.push(organ("deepSense"));
    touch(b);
    s = derive(b).senses;
    expect(s.viewpoints).toEqual([{ node: H.head, eyes: 2, heat: true }]);
    expect(s).toMatchObject({ sight: true, heat: true, echo: true, deep: true, hearing: 2 });
  });

  it("a snout smells; two faces speak without a jaw, muteness takes speech from both (decision 1274)", () => {
    const b = human(1000);
    apply(b, "rebirth", { ending: organ("snout") }, { ending: { node: H.handL, index: 0 } });
    expect(derive(b).senses.smell).toBe(2);
    const head = b.nodes[H.head]!.ends[0]!;
    head.contents = head.contents!.filter((o) => o.kind !== "jaw");
    touch(b);
    expect(derive(b).senses.speak).toBe(false);
    head.contents.push(organ("twoFaces"));
    touch(b);
    expect(derive(b).senses.speak).toBe(true);
    head.contents.push(organ("muteness"));
    touch(b);
    expect(derive(b).senses.speak).toBe(false);
  });
});

describe("breath", () => {
  it("lungs in a limb-turned-torso breathe", () => {
    const b = human(1000);
    apply(b, "thicken", {}, { segment: H.armL });
    expect(b.segments[H.armL]!.kind).toBe("torso");
    const t = targets(b, "organ", { organ: organ("lungs"), mount: "cavity" }).map((w) => w.target);
    expect(t).toContainEqual({ segment: H.armL });
    apply(b, "organ", { organ: organ("lungs"), mount: "cavity" }, { segment: H.armL });
    const d = derive(b);
    expect(d.breath.organs.map((o) => [o.kind, o.at, o.air])).toEqual([
      ["lungs", H.torso, 3],
      ["lungs", H.armL, 3],
    ]);
    expect(d.breath.intake.air).toBe(6);
    expect(d.breath.tank.lungs).toBe(10);
  });

  it("a gill cluster and a gill sheet breathe water; pores breathe air; double breath does both", () => {
    const b = human(1000);
    b.segments[H.neck]!.growths.push(organ("gillCluster"));
    b.segments[H.armL]!.growths.push(organ("pores"));
    b.segments[H.torso]!.cavity.push(organ("doubleBreath"));
    touch(b);
    const d = derive(b);
    expect(d.breath.organs).toEqual([
      { kind: "lungs", at: H.torso, air: 3, water: 0, tank: 5 },
      { kind: "doubleBreath", at: H.torso, air: 3, water: 2, tank: 5 },
      { kind: "gillCluster", at: H.neck, air: 0, water: 2, tank: 0 },
      { kind: "pores", at: H.armL, air: 1, water: 0, tank: 0 },
    ]);
    expect(d.breath.intake).toEqual({ air: 7, water: 4 });
    expect(d.breath.media).toEqual(["air", "water"]);
  });

  it("no breathing organ: no medium, and the tanks still hold what blood and muscle keep", () => {
    const b = human(1000);
    b.segments[H.torso]!.cavity = b.segments[H.torso]!.cavity.filter((o) => o.kind !== "lungs");
    touch(b);
    const d = derive(b);
    expect(d.breath.media).toEqual([]);
    expect(d.breath.intake).toEqual({ air: 0, water: 0 });
    // Mass 97 (was 96 before the penis): blood 12 x 0.97.
    expect(d.breath.tank.lungs).toBe(0);
    expect(d.breath.tank.blood).toBeCloseTo(11.64, 9);
    expect(d.breath.tank.muscle).toBe(3);
    expect(d.breath.tank.common).toBeCloseTo(11.64, 9);
    expect(d.breath.tank.total).toBeCloseTo(14.64, 9);
  });

  it("base: half per flesh brain, a quarter per heart, a quarter per hundred of mass; cold blood x0.6; two hearts deliver 4", () => {
    const b = human(1000);
    b.segments[H.torso]!.cavity.push(organ("heart"));
    touch(b);
    let d = derive(b);
    // Mass 105 with the second heart (104 before the penis), 107 with cold blood too.
    expect(d.breath.base).toBeCloseTo(0.5 + 0.5 + 0.25 * 1.05, 9);
    expect(d.breath.delivery).toBe(4);
    expect(d.blood.hearts).toEqual([H.torso]);
    b.segments[H.torso]!.cavity.push(organ("coldBlood"));
    touch(b);
    d = derive(b);
    expect(d.breath.base).toBeCloseTo((0.5 + 0.5 + 0.25 * 1.07) * 0.6, 9);
  });

  it("digging costs the digger and its limb; a second head breathes for two", () => {
    const b = human(1000);
    apply(b, "rebirth", { ending: organ("claw") }, { ending: { node: H.handL, index: 0 } });
    let d = derive(b);
    // The claw digs with its forearm and upper arm: 1 + 3 + 3.
    expect(d.breath.muscles.dig).toBe(1 + 6);
    expect(breathCost(d, "dig")).toBeCloseTo(d.breath.base + 0.7 * 0.7, 9);
    apply(b, "sprout", { kind: "neck", length: 1, girth: 1, cover: "skin", ending: organ("head", [organ("brain"), organ("eye")]) }, { node: H.shoulderR });
    d = derive(b);
    expect(d.breath.base).toBeCloseTo(0.5 * 2 + 0.25 + 0.25 * (d.budgets.mass / 100), 9);
  });
});

describe("eating and blood", () => {
  it("mouth without a stomach in its component cannot eat", () => {
    const b = bodyFromText(`
      мясо 1000
      голова[2] {голова(мозг*, глаз, глаз)}
      грудь[3]
      таз[3]
      кисть[1] {пасть}
      голова -шея:1/1 кожа- грудь
      грудь -корпус:2/3 кожа {сердце, лёгкие}- таз
      грудь -щупальце:2/1 присоски- кисть
    `);
    let d = derive(b);
    expect(d.eat).toEqual({ can: false, mouths: [{ node: 4, index: 0, kind: "mouth", fed: false }] });
    b.segments[6]!.cavity.push(organ("stomach"));
    touch(b);
    d = derive(b);
    expect(d.eat).toEqual({ can: true, mouths: [{ node: 4, index: 0, kind: "mouth", fed: true }] });
    expect(d.locomotion.climb).toBe(true);
  });

  it("a broken torso starves what hangs on it; starving elements carry their counters", () => {
    // The shin is the segment the foot hangs on: breaking it starves the foot alone.
    const b = human(1000);
    b.segments[H.shinL]!.hp = 0;
    b.nodes[H.footL]!.ischemia = 12;
    touch(b);
    const d = derive(b);
    expect(d.blood.hearts).toEqual([H.torso]);
    expect(d.blood.starving).toEqual([{ id: H.footL, ischemia: 12 }]);
    b.segments[H.torso]!.hp = 0;
    touch(b);
    expect(derive(b).blood.hearts).toEqual([]);
    expect(derive(b).blood.starving.map((s) => s.id)).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
  });
});

describe("a bare limb strikes with itself (decision 126)", () => {
  /** A limb of the given size straight off the shoulder, with nothing on its end. */
  function bareLimb(length: number, girth: number): { body: Body; tip: number } {
    const b = human(1000);
    const tip = apply(b, "sprout", { kind: "tentacle", length, girth, cover: "skin", ending: null }, { node: H.shoulderR }).created[0]!;
    return { body: b, tip };
  }

  it("a long bare limb clubs by its length x girth; a nub does not strike at all", () => {
    const small = bareLimb(1, 1);
    expect(derive(small.body).attacks.find((a) => a.node === small.tip)).toBeUndefined();
    const stem = bareLimb(4, 1);
    expect(derive(stem.body).attacks.find((a) => a.node === stem.tip)).toMatchObject({ kind: "stump", dice: "1d2", index: null });
    const thick = bareLimb(5, 1);
    expect(derive(thick.body).attacks.find((a) => a.node === thick.tip)).toMatchObject({ kind: "stump", dice: "1d3" });
    const trunk = bareLimb(6, 3);
    const a = derive(trunk.body).attacks.find((x) => x.node === trunk.tip)!;
    expect(a).toMatchObject({ kind: "stump", dice: "1d6", reach: 3 });
    // It swings the flesh of its chain, as a tail does.
    expect(a.mass).toBeGreaterThan(0);
  });

  it("an ending that strikes takes the place of the bare blow, and one that does not leaves it", () => {
    const handed = human(1000);
    const withHand = apply(handed, "sprout", { kind: "tentacle", length: 4, girth: 2, cover: "skin", ending: organ("hand") }, { node: H.shoulderR }).created[0]!;
    expect(derive(handed).attacks.filter((a) => a.node === withHand).map((a) => a.kind)).toEqual(["hand"]);
    // A sucker has no blow of its own: the limb still lashes with itself.
    const suckered = human(1000);
    const withSucker = apply(suckered, "sprout", { kind: "tentacle", length: 4, girth: 2, cover: "skin", ending: organ("sucker") }, { node: H.shoulderR }).created[0]!;
    expect(derive(suckered).attacks.filter((a) => a.node === withSucker).map((a) => a.kind)).toEqual(["stump"]);
  });

  it("a fork is no tip: a limb that carries another one does not club on its own", () => {
    const b = human(1000);
    const mid = apply(b, "sprout", { kind: "tentacle", length: 4, girth: 2, cover: "skin", ending: null }, { node: H.shoulderR }).created[0]!;
    // A limb no thicker than the joint it grows from: the tip node is size 1.
    apply(b, "sprout", { kind: "tentacle", length: 4, girth: 1, cover: "skin", ending: null }, { node: mid });
    expect(derive(b).attacks.find((a) => a.node === mid)).toBeUndefined();
  });

  it("the human gains nothing: an elbow and a knee are no tips", () => {
    expect(derive(human()).attacks.some((a) => a.kind === "stump")).toBe(false);
  });
});
