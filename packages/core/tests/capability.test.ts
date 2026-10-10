import { describe, expect, it } from "vitest";
import {
  HUMAN_IDS,
  apply,
  bodyFromText,
  capabilities,
  endingCapability,
  human,
  organ,
  validate,
} from "../index.js";
import { population } from "./gen.js";
import { populationC } from "./genC.js";

/** A human whose left arm is something else: kind, cover and ending as given. Node ids as in the human. */
function armed(kind: string, cover: string, ending: string, length = 2) {
  return bodyFromText(`
    голова[2] {голова(мозг*, глаз, глаз, челюсть, ухо, ухо, нос)}
    грудь[3]
    таз[3]
    кисть.л[1] {${ending}}
    кисть.п[1] {кисть}
    стопа.л[1] {стопа}
    стопа.п[1] {стопа}
    голова -шея:1/1 кожа- грудь
    грудь -корпус:2/3 кожа {сердце, лёгкие, желудок}- таз
    грудь -${kind}:${length}/1 ${cover}- кисть.л
    грудь -рука:2/1 кожа- кисть.п
    таз -нога:2/1 кожа- стопа.л
    таз -нога:2/1 кожа- стопа.п
  `);
}

describe("three-part capability", () => {
  it("hand on an arm in skin: grip 2", () => {
    const c = endingCapability(human(), HUMAN_IDS.handL, 0);
    expect(c).toMatchObject({ kind: "hand", segment: HUMAN_IDS.forearmL, segmentKind: "arm", cover: "skin", grip: 2, stand: 0, dig: 0 });
    expect(c.climb).toBe(false);
    expect(c.swim).toBe(false);
  });

  it("hand on a tentacle in slime: grip 0, nobody grabs it back", () => {
    const b = armed("щупальце", "слизь", "кисть");
    const c = endingCapability(b, HUMAN_IDS.handL, 0);
    expect(c.grip).toBe(0);
    expect(c.segmentKind).toBe("tentacle");
    expect(c.cover).toBe("slime");
  });

  it("mouth on a tentacle in suckers: climbs, holds and eats what it holds", () => {
    const b = armed("щупальце", "присоски", "пасть");
    const c = endingCapability(b, HUMAN_IDS.handL, 0);
    expect(c.kind).toBe("mouth");
    expect(c.climb).toBe(true);
    expect(c.eat).toBe(true);
    expect(c.grip).toBe(1);
    expect(capabilities(b).climb).toBe(true);
    expect(endingCapability(armed("щупальце", "кожа", "пасть"), HUMAN_IDS.handL, 0).grip).toBe(0);
  });

  it("a mouth eats only with a stomach in the body", () => {
    const b = armed("щупальце", "присоски", "пасть");
    b.segments[HUMAN_IDS.torso]!.cavity = b.segments[HUMAN_IDS.torso]!.cavity.filter((o) => o.kind !== "stomach");
    expect(endingCapability(b, HUMAN_IDS.handL, 0).eat).toBe(false);
    expect(capabilities(b).eat).toBe(false);
  });

  it("pincer on a torso: grip 1 and the cavity is at hand", () => {
    const b = armed("корпус", "кожа", "клешня");
    const c = endingCapability(b, HUMAN_IDS.handL, 0);
    expect(c).toMatchObject({ kind: "pincer", segmentKind: "torso", grip: 1, cavity: true });
    expect(endingCapability(b, HUMAN_IDS.handR, 0).cavity).toBe(false);
  });

  it("the human: two precise grips, stand 6 (a foot on a leg is 3), no climb, swim or dig", () => {
    const c = capabilities(human());
    expect(c.grips).toEqual([2, 2]);
    expect(c.stand).toBe(6);
    expect(endingCapability(human(), HUMAN_IDS.footL, 0).stand).toBe(3);
    expect(c.dig).toBe(0);
    expect(c.climb).toBe(false);
    expect(c.swim).toBe(false);
    expect(c.reach).toBe(1);
    expect(c.eat).toBe(true);
    expect(c.endings.map((e) => e.kind)).toEqual(["head", "hand", "hand", "foot", "foot"]);
  });

  it("stand sums over every stand: a hoof on a leg is 4, a claw on an arm is 0", () => {
    const b = human(1000);
    apply(b, "rebirth", { ending: organ("hoof") }, { ending: { node: HUMAN_IDS.footL, index: 0 } });
    expect(endingCapability(b, HUMAN_IDS.footL, 0).stand).toBe(4);
    expect(capabilities(b).stand).toBe(7);
    apply(b, "rebirth", { ending: organ("claw") }, { ending: { node: HUMAN_IDS.handL, index: 0 } });
    expect(endingCapability(b, HUMAN_IDS.handL, 0)).toMatchObject({ grip: 1, stand: 0, dig: 2, climb: true });
    expect(capabilities(b).stand).toBe(7);
    expect(capabilities(b).dig).toBe(2);
    // One claw does not hold a human on a wall (decision 1279).
    expect(capabilities(b).climb).toBe(false);
  });

  it("a stalk carries no digging; scales do not swim (decision 1239); a hoof never climbs", () => {
    const stalk = armed("стебель", "кожа", "коготь", 1);
    expect(endingCapability(stalk, HUMAN_IDS.handL, 0).dig).toBe(0);
    expect(endingCapability(stalk, HUMAN_IDS.handL, 0).climb).toBe(true);
    const scaled = armed("рука", "чешуя", "кисть");
    expect(endingCapability(scaled, HUMAN_IDS.handL, 0).swim).toBe(false);
    expect(capabilities(scaled).swim).toBe(false);
    const hoofed = armed("нога", "присоски", "копыто");
    expect(endingCapability(hoofed, HUMAN_IDS.handL, 0).climb).toBe(false);
  });

  it("reach: a tentacle of length 4 reaches 2", () => {
    const short = armed("щупальце", "кожа", "кисть", 3);
    expect(endingCapability(short, HUMAN_IDS.handL, 0).reach).toBe(1);
    const long = armed("щупальце", "кожа", "кисть", 4);
    expect(endingCapability(long, HUMAN_IDS.handL, 0).reach).toBe(2);
    expect(capabilities(long).reach).toBe(2);
  });

  it("an ending sits on the segment toward the brain", () => {
    const b = bodyFromText(`
      голова[2] {голова(мозг*, глаз, глаз)}
      грудь[3]
      локоть[1] {пасть}
      кисть[1] {кисть}
      голова -шея:1/1 кожа- грудь
      грудь -корпус:2/3 кожа {сердце, лёгкие, желудок}- локоть
      локоть -щупальце:1/1 присоски- кисть
    `);
    expect(endingCapability(b, 3, 0)).toMatchObject({ kind: "mouth", segment: 6, segmentKind: "torso", cavity: true });
    expect(endingCapability(b, 4, 0)).toMatchObject({ kind: "hand", segment: 7, segmentKind: "tentacle", cover: "suckers", grip: 2, climb: true });
    expect(endingCapability(b, 1, 0)).toMatchObject({ kind: "head", segment: null });
  });

  it("a brain in a cavity: the ends of its torso sit on that torso", () => {
    const b = bodyFromText(`
      грудь[3] {клешня}
      таз[3] {стопа}
      грудь -корпус:2/3 кожа {мозг*, сердце, желудок}- таз
    `);
    expect(endingCapability(b, 1, 0)).toMatchObject({ kind: "pincer", segment: 3, segmentKind: "torso", cavity: true });
    expect(endingCapability(b, 2, 0)).toMatchObject({ kind: "foot", segment: 3, stand: 2 });
  });

  it("capability never leaves [0, 2] for grip", () => {
    for (const b of [...population(200), ...populationC(200)]) {
      expect(validate(b)).toEqual([]);
      const c = capabilities(b);
      for (const e of c.endings) {
        expect(e.grip).toBeGreaterThanOrEqual(0);
        expect(e.grip).toBeLessThanOrEqual(2);
        expect(e.stand).toBeGreaterThanOrEqual(0);
        expect(e.dig).toBeGreaterThanOrEqual(0);
        expect(e.reach).toBeGreaterThanOrEqual(1);
      }
      expect(c.grips).toEqual([...c.grips].sort((x, y) => y - x));
      expect(c.stand).toBe(c.endings.reduce((s, e) => s + e.stand, 0));
      expect(c.grips).toEqual(c.endings.map((e) => e.grip).filter((g) => g > 0).sort((x, y) => y - x));
    }
  });
});
