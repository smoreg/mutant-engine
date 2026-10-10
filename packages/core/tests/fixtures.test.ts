import { describe, expect, it } from "vitest";
import {
  HUMAN_IDS,
  HUMAN_TEXT,
  bodyFromText,
  bodyHash,
  bodyToText,
  bulk,
  capacity,
  controlCap,
  controlLoad,
  human,
  mass,
  upkeep,
  validate,
} from "../index.js";
import { population } from "./gen.js";

/**
 * The §2 fixture as a person writes it: labels instead of ids. Side nodes,
 * elbows, knees and the penis tip keep their numeric ids: word labels take the
 * lowest free ids in order, and the fixture numbers side nodes after the six
 * original segments and the joints after the flanks.
 */
const HUMAN_NAMED = `
# узлы: имя[размер] {окончания}; * — твой мозг
голова[2]  {голова(мозг*, глаз, глаз, челюсть, ухо, ухо, нос)}
грудь[1]
таз[1]
кисть.л[1] {кисть}
кисть.п[1] {кисть}
стопа.л[1] {стопа}
стопа.п[1] {стопа}
14[3]
15[3]
16[2]
17[2]
22[1]
23[1]
24[1]
25[1]
26[1]

# сегменты: узел -вид:длина/обхват покров {полость}- узел
голова  -шея:1/1 кожа-                               грудь
грудь   -корпус:2/3 кожа {сердце, лёгкие, желудок}-  таз
14      -рука:1/1 кожа-                              22
15      -рука:1/1 кожа-                              23
16      -нога:1/1 кожа-                              24
17      -нога:1/1 кожа-                              25
грудь   ~бок:0/1 кожа~                               14
грудь   ~бок:0/1 кожа~                               15
таз     ~бок:0/1 кожа~                               16
таз     ~бок:0/1 кожа~                               17
22      -рука:1/1 кожа-                              кисть.л
23      -рука:1/1 кожа-                              кисть.п
24      -нога:1/1 кожа-                              стопа.л
25      -нога:1/1 кожа-                              стопа.п
таз     -член:1/1 кожа-                              26
`;

describe("human", () => {
  it("human matches body.md numbers", () => {
    const h = human();
    expect(validate(h)).toEqual([]);
    // MEAT 101: body.md's 100 and the penis's 1.
    expect(mass(h)).toBe(101);
    expect(h.meat).toBe(101);
    expect(upkeep(h)).toBe(20);
    expect(controlLoad(h)).toBe(10);
    expect(controlCap(h)).toBe(10);
    expect(bulk(h)).toBe(3);
    expect(capacity(h.segments[HUMAN_IDS.torso]!)).toBe(30);
    expect(h.self).toEqual({ node: HUMAN_IDS.head });
  });

  it("human text is canonical and the named fixture is the same body", () => {
    expect(HUMAN_TEXT).toContain("мясо 101\n");
    expect(HUMAN_TEXT).toContain("следующий 32\n");
    expect(HUMAN_TEXT).toContain("\n1[2] {голова(мозг*, глаз, глаз, челюсть, ухо, ухо, нос)}\n");
    expect(HUMAN_TEXT).toContain("\n2[1]\n");
    expect(HUMAN_TEXT).toContain("\n14[3]\n");
    expect(HUMAN_TEXT).toContain("\n16[2]\n");
    expect(HUMAN_TEXT).toContain("\n8: 1 -шея:1/1 кожа- 2\n");
    expect(HUMAN_TEXT).toContain("\n9: 2 -корпус:2/3 кожа {сердце, лёгкие, желудок}- 3\n");
    expect(HUMAN_TEXT).toContain("\n10: 14 -рука:1/1 кожа- 22\n");
    expect(HUMAN_TEXT).toContain("\n18: 2 ~бок:0/1 кожа~ 14\n");
    expect(HUMAN_TEXT).toContain("\n27: 22 -рука:1/1 кожа- 4\n");
    expect(HUMAN_TEXT.endsWith("31: 3 -член:1/1 кожа- 26\n")).toBe(true);
    expect(bodyToText(human())).toBe(HUMAN_TEXT);
    expect(bodyHash(bodyFromText(HUMAN_NAMED))).toBe(bodyHash(human()));
    expect(bodyToText(bodyFromText(HUMAN_NAMED))).toBe(HUMAN_TEXT);
  });

  it("human ids are fixed by the fixture order", () => {
    const h = human();
    expect(Object.keys(h.nodes).map(Number).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 14, 15, 16, 17, 22, 23, 24, 25, 26,
    ]);
    expect(Object.keys(h.segments).map(Number).sort((a, b) => a - b)).toEqual([
      8, 9, 10, 11, 12, 13, 18, 19, 20, 21, 27, 28, 29, 30, 31,
    ]);
    expect(h.nextId).toBe(32);
    expect(h.segments[HUMAN_IDS.armL]).toMatchObject({ a: HUMAN_IDS.shoulderL, b: HUMAN_IDS.elbowL, kind: "arm" });
    expect(h.segments[HUMAN_IDS.forearmL]).toMatchObject({ a: HUMAN_IDS.elbowL, b: HUMAN_IDS.handL, kind: "arm" });
    expect(h.segments[HUMAN_IDS.penis]).toMatchObject({ a: HUMAN_IDS.pelvis, b: HUMAN_IDS.penisTip, kind: "penis" });
    expect(h.segments[HUMAN_IDS.flankShoulderL]).toMatchObject({ a: HUMAN_IDS.chest, b: HUMAN_IDS.shoulderL, kind: "flank", length: 0 });
  });
});

describe("text round trip", () => {
  it("bodyToText round-trips for the human and 200 random bodies", () => {
    const bodies = [human(), ...population(200)];
    for (const b of bodies) {
      const text = bodyToText(b);
      const back = bodyFromText(text);
      expect(bodyHash(back)).toBe(bodyHash(b));
      expect(bodyToText(back)).toBe(text);
    }
  });

  it("round trip keeps state that is not structure", () => {
    const b = human(120);
    b.nodes[HUMAN_IDS.handL]!.ends[0]!.instability = 40;
    b.nodes[HUMAN_IDS.handR]!.wound = 7;
    b.nodes[HUMAN_IDS.footL]!.bait = true;
    b.nodes[HUMAN_IDS.footR]!.hp = 2;
    b.segments[HUMAN_IDS.armL]!.breakPlane = false;
    b.segments[HUMAN_IDS.armR]!.hp = 0;
    b.segments[HUMAN_IDS.armR]!.ischemia = 12;
    b.segments[HUMAN_IDS.legL]!.bleed = 3;
    b.segments[HUMAN_IDS.legL]!.pain = 9;
    const text = bodyToText(b);
    expect(text).toContain("кисть@40");
    expect(text).toContain("~рука:1/1 кожа~");
    expect(text).toContain("приманка");
    const back = bodyFromText(text);
    expect(bodyHash(back)).toBe(bodyHash(b));
    expect(back.meat).toBe(120);
  });

  it("a brain in a cavity is self on a segment", () => {
    const b = bodyFromText(`
      грудь[3]
      таз[3]
      грудь -корпус:2/3 кожа {мозг*, сердце}- таз
    `);
    expect(b.self).toEqual({ segment: 3 });
    expect(bodyHash(bodyFromText(bodyToText(b)))).toBe(bodyHash(b));
  });
});

describe("text parser rejects", () => {
  it("a duplicated node", () => {
    expect(() =>
      bodyFromText(`
        a[1] {голова(мозг*)}
        a[1]
        a -шея:1/1 кожа- a
      `),
    ).toThrow(/a/);
  });

  it("a segment to an unknown node", () => {
    expect(() =>
      bodyFromText(`
        a[1] {голова(мозг*)}
        a -шея:1/1 кожа- b
      `),
    ).toThrow(/b/);
  });

  it("a cavity where the kind holds none, or a second organ in a limb", () => {
    // A limb holds one organ inside since side nodes (flank.ts); a stalk holds none.
    expect(() =>
      bodyFromText(`
        a[1] {голова(мозг*)}
        b[1]
        a -стебель:1/1 кожа {сердце}- b
      `),
    ).toThrow(/полост|cavity/i);
    expect(() =>
      bodyFromText(`
        a[1] {голова(мозг*)}
        b[1]
        a -рука:1/1 кожа {сердце, лёгкие}- b
      `),
    ).toThrow(/полост|cavity/i);
  });

  it("a body without a brain, or with two selves", () => {
    expect(() =>
      bodyFromText(`
        a[1] {кисть}
        b[1]
        a -рука:1/1 кожа- b
      `),
    ).toThrow();
    expect(() =>
      bodyFromText(`
        a[1] {голова(мозг*)}
        b[1] {голова(мозг*)}
        a -шея:1/1 кожа- b
      `),
    ).toThrow();
  });

  it("an unknown kind, an ending in a cavity, a head organ outside a head", () => {
    expect(() => bodyFromText(`a[1] {голова(мозг*)}\nb[1] {ласт}\na -рука:1/1 кожа- b`)).toThrow(/ласт/);
    expect(() => bodyFromText(`a[1] {голова(мозг*)}\nb[1]\na -корпус:1/1 кожа {кисть}- b`)).toThrow();
    expect(() => bodyFromText(`a[1] {голова(мозг*)}\nb[1] {челюсть}\na -рука:1/1 кожа- b`)).toThrow();
  });
});
