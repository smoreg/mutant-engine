import { describe, expect, it } from "vitest";
import {
  FAMILIES,
  HUMAN_IDS,
  apply,
  bloodMax,
  bloodReach,
  bodyFromText,
  derive,
  familyCounts,
  human,
  livingMass,
  mass,
  newHarm,
  organ,
  partCounts,
  strike,
  strikes,
  touch,
  turn,
  upkeep,
  validate,
} from "../../index.js";

const H = HUMAN_IDS;
const fixed = (v: number) => ({ next: () => v });

/**
 * Decision 128: a part the blood no longer reaches stops counting as the
 * organism - in mass, upkeep, channels, blows and senses alike. The graph
 * still carries it; the economy does not.
 */
describe("a part cut off from the blood is not the body any more", () => {
  /** A human whose upper left arm is broken: the elbow, the forearm and the hand behind it lose their blood. */
  function brokenArm(): { body: ReturnType<typeof human>; before: ReturnType<typeof derive> } {
    const body = human();
    const before = derive(body);
    body.segments[H.armL]!.hp = 0;
    touch(body);
    return { body, before };
  }

  it("the blood stops at the broken segment, and the mass behind it stops being living mass", () => {
    const { body } = brokenArm();
    const live = bloodReach(body);
    expect(live.has(H.armL)).toBe(true);
    for (const id of [H.elbowL, H.forearmL, H.handL]) expect(live.has(id)).toBe(false);
    expect(livingMass(body)).toBeLessThan(mass(body));
    expect(bloodMax(body)).toBe(livingMass(body));
  });

  it("dead flesh eats nothing and asks for no channels", () => {
    const { body, before } = brokenArm();
    const after = derive(body);
    expect(after.budgets.living).toBe(livingMass(body));
    expect(after.budgets.living).toBeLessThan(after.budgets.mass);
    expect(after.budgets.upkeep).toBeLessThan(before.budgets.upkeep);
    expect(after.budgets.upkeep).toBe(upkeep(body, bloodReach(body)));
    expect(after.budgets.control.load).toBeLessThan(before.budgets.control.load);
  });

  it("it strikes with nothing and grips with nothing", () => {
    const { body, before } = brokenArm();
    expect(before.attacks.some((a) => a.node === H.handL)).toBe(true);
    const after = derive(body);
    expect(after.attacks.some((a) => a.node === H.handL)).toBe(false);
    expect(after.grips.list.some((g) => g.node === H.handL)).toBe(false);
    expect(strikes(body).some((s) => s.node === H.handL)).toBe(false);
  });

  it("an eye on a limb that lost its blood sees nothing", () => {
    const body = human(1000);
    const made = apply(body, "sprout", { kind: "tentacle", length: 2, girth: 1, cover: "skin", ending: organ("eye") }, { node: H.shoulderR });
    const [tip, stalk] = made.created;
    expect(derive(body).senses.viewpoints.some((v) => v.node === tip)).toBe(true);
    body.segments[stalk!]!.hp = 0;
    touch(body);
    expect(derive(body).senses.viewpoints.some((v) => v.node === tip)).toBe(false);
  });

  it("the whole body counts while a heart still beats for it, and a heartless body is dying, not severed", () => {
    const whole = human();
    expect(livingMass(whole)).toBe(mass(whole));
    const heartless = human();
    heartless.segments[HUMAN_IDS.torso]!.cavity = heartless.segments[HUMAN_IDS.torso]!.cavity.filter((o) => o.kind !== "heart");
    touch(heartless);
    // No heart at all: every part is equally its own, and the reading does not collapse to nothing.
    expect(livingMass(heartless)).toBe(mass(heartless));
  });

  it("the reading holds over a real blow and a turn: blood never exceeds what the body can hold", () => {
    const body = human();
    const harm = newHarm(body);
    strike(body, harm, { damage: 8, profile: "at", aim: H.forearmL }, fixed(0.999));
    turn(body, harm, { upkeep: true }, fixed(0.5));
    expect(harm.blood).toBeLessThanOrEqual(bloodMax(body));
    expect(validate(body)).toEqual([]);
  });
});

/**
 * Decision 127: two different counters of families. `familyCounts` counts the
 * organs beyond the human's (the theme of the spread reads it); `parts` counts
 * what is on the body, limbs included. A beast on eight bare legs must not read zero.
 */
describe("families on the body against families of organs", () => {
  function eightLegs() {
    return bodyFromText(`
      мясо 1000
      голова[2] {голова(мозг*, глаз)}
      грудь[3]
      таз[3]
      к1[1]
      к2[1]
      к3[1]
      к4[1]
      к5[1]
      к6[1]
      к7[1]
      к8[1]
      голова -шея:1/1 кожа- грудь
      грудь -корпус:2/3 кожа {сердце, лёгкие, желудок}- таз
      таз -нога:3/1 кожа- к1
      таз -нога:3/1 кожа- к2
      таз -нога:3/1 кожа- к3
      таз -нога:3/1 кожа- к4
      грудь -нога:3/1 кожа- к5
      грудь -нога:3/1 кожа- к6
      грудь -нога:3/1 кожа- к7
      грудь -нога:3/1 кожа- к8
    `);
  }

  it("the human is neutral in both counters", () => {
    const b = human();
    for (const f of FAMILIES) expect(partCounts(b)[f], f).toBe(0);
    expect(partCounts(b)).toEqual(familyCounts(b));
  });

  it("eight bare legs read eight limbs on the body and no limb organ", () => {
    const b = eightLegs();
    expect(validate(b)).toEqual([]);
    const d = derive(b);
    // Not one ending organ: `familyCounts` counts organs, and there are none.
    expect(familyCounts(b).limbs).toBe(0);
    // What a reader sees: eight legs, six of them beyond the human's two.
    expect(d.budgets.parts.limbs).toBe(6);
    expect(d.budgets.parts).not.toEqual(familyCounts(b));
  });

  it("every bare leg long enough clubs: the beast is not unarmed", () => {
    const d = derive(eightLegs());
    expect(d.attacks.filter((a) => a.kind === "stump")).toHaveLength(8);
  });
});
