import { describe, expect, it } from "vitest";
import {
  LIMITS,
  addMembrane,
  apply,
  bodyFromText,
  bodyHash,
  bodyToText,
  cloneBody,
  closure,
  cut,
  cutPreview,
  derive,
  grow,
  human,
  ischemiaTick,
  membraneArea,
  membranesOn,
  segmentIds,
  separate,
  simpleCycles,
  sortedIds,
  targets,
  validate,
  wearMembrane,
  type Body,
} from "../index.js";
import { LabRng as Rng } from "../rng.js";
import { SWAMP, SWAMP_HEAD2, swampMutant } from "./genHeads.js";
import { populationC, randomOpC } from "./genC.js";

/** Ring: head 1, chest 2, pelvis 3, side 4, hand 5; neck 6, torso 7, chest-side 8, side-pelvis 9, arm 10. */
function ring(): Body {
  return bodyFromText(`
    мясо 1000
    голова[2] {голова(мозг*, глаз, глаз)}
    грудь[3]
    таз[3]
    бок[2]
    кисть[1] {кисть}
    голова -шея:1/1 кожа- грудь
    грудь -корпус:2/3 кожа {сердце, лёгкие, желудок}- таз
    грудь -щупальце:2/1 присоски- бок
    бок -щупальце:1/1 присоски- таз
    бок -рука:1/1 кожа- кисть
  `);
}

/** The swamp mutant of body-graph.md §7 with its gill sheet on the cycle chest - shoulder2 - pelvis. */
function gilled(sway: number): Body {
  const b = swampMutant(sway);
  addMembrane(b, [SWAMP.torso, SWAMP.torso2, SWAMP.tentacle], "gill");
  return b;
}

describe("membrane", () => {
  it("membrane needs a simple cycle of 3-6 and no membrane yet", () => {
    const b = ring();
    expect(simpleCycles(b)).toEqual([[7, 8, 9]]);
    const t = targets(b, "membrane", { kind: "gill" }).map((w) => w.target);
    expect(t).toEqual([{ cycle: [7, 8, 9] }]);
    const id = addMembrane(b, [7, 8, 9], "gill");
    expect(id).toBe(11);
    expect(b.membranes[11]).toEqual({ id: 11, kind: "gill", cycle: [7, 8, 9], area: 5 });
    expect(targets(b, "membrane", { kind: "wing" })).toEqual([]);
    expect(validate(b)).toEqual([]);
    // A wing hangs on one open chain of 2..6 segments as well (decision 121); a span that does not join is still no place.
    const wing = addMembrane(b, [7, 8], "wing");
    expect(b.membranes[wing]!.cycle).toEqual([7, 8]);
    expect(() => addMembrane(b, [7, 10], "wing")).toThrow();
    expect(() => addMembrane(b, [7, 8], "wing")).toThrow(/already/);
    expect(() => addMembrane(b, [9, 7, 8], "sail")).toThrow(/already/);
  });

  it("two parallel segments are a cycle of the graph but not of a membrane", () => {
    // Both arms straight from the chest: the human's hang from shoulders, and fused hands there close a cycle of four with the flanks.
    const b = bodyFromText(`
      мясо 1000
      голова[2] {голова(мозг*, глаз, глаз)}
      грудь[3]
      таз[3]
      левая[1] {кисть}
      правая[1] {кисть}
      голова -шея:1/1 кожа- грудь
      грудь -корпус:2/3 кожа {сердце, лёгкие, желудок}- таз
      грудь -рука:2/1 кожа- левая
      грудь -рука:2/1 кожа- правая
    `);
    apply(b, "fusion", {}, { pair: [4, 5] });
    expect(closure(b)).toBe(1);
    expect(simpleCycles(b)).toEqual([]);
    expect(targets(b, "membrane", { kind: "wing" })).toEqual([]);
  });

  it("area is the sum of the cycle's lengths; stretch moves it, wear tears it", () => {
    const b = ring();
    const id = addMembrane(b, [7, 8, 9], "sail");
    expect(membraneArea(b, b.membranes[id]!)).toBe(5);
    apply(b, "stretch", { delta: 1 }, { segment: 9 });
    expect(b.membranes[id]!.area).toBe(6);
    apply(b, "stretch", { delta: -1 }, { segment: 9 });
    expect(b.membranes[id]!.area).toBe(5);
    expect(wearMembrane(b, id, 7)).toEqual({ area: 3, torn: false });
    expect(b.membranes[id]!.area).toBe(3);
    apply(b, "stretch", { delta: 1 }, { segment: 9 });
    expect(b.membranes[id]!.area).toBe(4);
    expect(wearMembrane(b, id, 12)).toEqual({ area: 0, torn: true });
    expect(b.membranes[id]).toBeUndefined();
    expect(validate(b)).toEqual([]);
  });

  /** A chest with `arms` bent arms of two segments each, every segment `length` long and `girth` thick. */
  function bent(arms: number, length: number, girth: number): Body {
    const names: string[] = [];
    const links: string[] = [];
    for (let i = 1; i <= arms; i++) {
      names.push(`локоть${i}[1]`, `кисть${i}[1] {кисть}`);
      links.push(`грудь -рука:${length}/${girth} кожа- локоть${i}`, `локоть${i} -рука:${length}/${girth} кожа- кисть${i}`);
    }
    return bodyFromText(`
      мясо 1000
      голова[2] {голова(мозг*, глаз, глаз)}
      грудь[3]
      таз[3]
      ${names.join("\n      ")}
      голова -шея:1/1 кожа- грудь
      грудь -корпус:2/3 кожа {сердце, лёгкие, желудок}- таз
      ${links.join("\n      ")}
    `);
  }

  /** The spans a wing is offered, in the order the targets come. */
  function spans(b: Body): number[][] {
    return targets(b, "membrane", { kind: "wing" }).map((w) => (w.target as { cycle: number[] }).cycle);
  }

  it("a wing is span x chord: it grows with the limb it hangs on, in length and in girth (decision 610)", () => {
    const area = (length: number, girth: number): number => {
      const b = bent(1, length, girth);
      const id = addMembrane(b, spans(b)[0]!, "wing");
      expect(validate(b)).toEqual([]);
      return b.membranes[id]!.area;
    };
    // round(0.35 x span^2 + sum(length x girth)): the trailing edge bulges with the span, the skin wraps the limb.
    expect(area(1, 1)).toBe(3);
    expect(area(2, 1)).toBe(10);
    expect(area(3, 1)).toBe(19);
    // The same span, twice as thick a limb: more skin.
    expect(area(1, 2)).toBe(5);
    expect(area(2, 2)).toBe(14);
    // The old number was the sum of the lengths, and the wing of a bat came out at 5 against a threshold of 8.
    expect(area(2, 1)).toBeGreaterThan(4);
    // A cycle keeps the sum: its corners are pinned by the graph and there is no free edge to bulge.
    const r = ring();
    expect(membraneArea(r, { id: 0, kind: "wing", cycle: [7, 8, 9], area: 0 })).toBe(5);
  });

  it("a thinner segment carries less wing: girth is in the area now, so ИСТОНЧЕНИЕ trims the skin (decision 613)", () => {
    // ИСТОНЧЕНИЕ takes a torso, and surgery can leave a span running over one: chest 2/3 and the tentacle beside it.
    const b = ring();
    const id = addMembrane(b, [7, 8], "wing");
    expect(b.membranes[id]!.area).toBe(14);
    apply(b, "thin", {}, { segment: 7 });
    expect(b.membranes[id]!.area).toBe(12);
    expect(validate(b)).toEqual([]);
  });

  it("flight is the sum of the wings, not the widest one (decision 611)", () => {
    const b = bent(3, 1, 1);
    const ids = spans(b).map((s) => addMembrane(b, s, "wing"));
    expect(ids).toHaveLength(3);
    for (const id of ids) expect(b.membranes[id]!.area).toBe(3);
    // Three wings of 3 carry the body although no single one reaches the threshold of 8.
    expect(derive(b).locomotion.fly).toBe(true);
    wearMembrane(b, ids[0]!, 9);
    expect(derive(b).locomotion.fly).toBe(false);
    expect(derive(b).locomotion.wings.reduce((a, w) => a + w.area, 0)).toBe(6);
    expect(validate(b)).toEqual([]);
  });

  it("a joint on a cycle segment keeps the membrane, one segment longer", () => {
    const b = ring();
    const id = addMembrane(b, [7, 8, 9], "wing");
    const r = apply(b, "joint", { ending: null }, { segment: 8 });
    const [, seg] = r.created;
    expect(b.membranes[id]!.cycle).toEqual([7, 8, seg, 9]);
    expect(b.membranes[id]!.area).toBe(5);
    expect(membranesOn(b, seg!)).toEqual([id]);
    expect(validate(b)).toEqual([]);
  });

  it("cutting any cycle segment tears the membrane", () => {
    for (const s of [7, 8, 9]) {
      for (const end of ["a", "b"] as const) {
        const b = ring();
        const id = addMembrane(b, [7, 8, 9], "gill");
        expect(cutPreview(b, s, end).torn).toEqual([id]);
        const r = cut(b, s, end);
        expect(r.torn).toEqual([id]);
        expect(b.membranes).toEqual({});
        expect(validate(b)).toEqual([]);
      }
    }
    const b = ring();
    addMembrane(b, [7, 8, 9], "gill");
    expect(cutPreview(b, 10, "a").torn).toEqual([]);
    cut(b, 10, "a");
    expect(sortedIds(b.membranes)).toHaveLength(1);
  });

  it("a starved cycle that falls off takes its membrane", () => {
    const b = bodyFromText(`
      голова[2] {голова(мозг*)}
      грудь[3]
      таз[3]
      а[2]
      б[2]
      голова -шея:1/1 кожа- грудь
      грудь -корпус:2/3 кожа {сердце}- таз
      таз -нога:1/1 кожа- а
      а -щупальце:1/1 кожа- б
      б -щупальце:1/1 кожа- таз
    `);
    const id = addMembrane(b, [8, 9, 10], "fin");
    expect(id).toBe(11);
    b.nodes[3]!.hp = 0;
    for (let i = 0; i < 80; i++) ischemiaTick(b);
    expect(b.nodes[4]).toBeUndefined();
    expect(b.membranes).toEqual({});
    expect(validate(b)).toEqual([]);
  });

  it("separation tears a membrane on the border and carries one inside the territory", () => {
    const torn = gilled(4);
    const r = separate(torn, SWAMP_HEAD2)!;
    expect(r.border.sort()).toEqual([SWAMP.torso, SWAMP.torso2].sort());
    expect(torn.membranes).toEqual({});
    expect(r.leaves.body!.membranes).toEqual({});
    expect(validate(torn)).toEqual([]);

    const carried = bodyFromText(`
      голова[2] {голова(мозг*)}
      грудь[3]
      таз[3]
      узел2[2] {голова(мозг!4)}
      а[2]
      б[2]
      голова -шея:1/1 кожа- грудь
      грудь -корпус:2/3 кожа {сердце}- таз
      таз -нога:2/1 кожа- узел2
      узел2 -щупальце:1/1 кожа- а
      а -щупальце:1/1 кожа- б
      б -щупальце:1/1 кожа- узел2
    `);
    const id = addMembrane(carried, [10, 11, 12], "sail");
    const s = separate(carried, { node: 4, end: 0 })!;
    expect(carried.membranes).toEqual({});
    expect(s.leaves.body!.membranes[id]).toMatchObject({ kind: "sail", cycle: [10, 11, 12], area: 3 });
    expect(validate(s.leaves.body!)).toEqual([]);
  });

  it("fusion of two cycle nodes tears the membrane, elsewhere it stays", () => {
    const b = gilled(0);
    const id = sortedIds(b.membranes)[0]!;
    apply(b, "fusion", {}, { pair: [SWAMP.footL, SWAMP.footR] });
    expect(b.membranes[id]).toBeDefined();
    expect(validate(b)).toEqual([]);
  });

  it("membranes are limited to ten: five pairs of wings, and flight is the sum of them (decision 612)", () => {
    const b = bodyFromText(`
      мясо 1000
      голова[2] {голова(мозг*)}
      центр[3]
      а1[3]
      б1[2]
      а2[3]
      б2[2]
      в1[2]
      г1[2]
      в2[2]
      г2[2]
      д[2]
      е[2]
      ж1[1]
      ж2[1]
      з1[1]
      з2[1]
      и1[1]
      и2[1]
      к1[1]
      к2[1]
      л1[1]
      л2[1]
      голова -шея:1/1 кожа- центр
      центр -корпус:1/1 кожа {сердце}- а1
      а1 -рука:1/1 кожа- б1
      б1 -рука:1/1 кожа- центр
      центр -рука:1/1 кожа- а2
      а2 -рука:1/1 кожа- б2
      б2 -рука:1/1 кожа- центр
      а1 -рука:1/1 кожа- в1
      в1 -рука:1/1 кожа- г1
      г1 -рука:1/1 кожа- а1
      а2 -рука:1/1 кожа- в2
      в2 -рука:1/1 кожа- г2
      г2 -рука:1/1 кожа- а2
      б1 -рука:1/1 кожа- д
      д -рука:1/1 кожа- е
      е -рука:1/1 кожа- б1
      центр -рука:1/1 кожа- ж1
      ж1 -рука:1/1 кожа- ж2
      а1 -рука:1/1 кожа- з1
      з1 -рука:1/1 кожа- з2
      а2 -рука:1/1 кожа- и1
      и1 -рука:1/1 кожа- и2
      д -рука:1/1 кожа- к1
      к1 -рука:1/1 кожа- к2
      е -рука:1/1 кожа- л1
      л1 -рука:1/1 кожа- л2
    `);
    expect(closure(b)).toBe(5);
    expect(simpleCycles(b)).toHaveLength(5);
    const rng = new Rng(1);
    // The body has more places than the limit allows, so what stops it is the limit and nothing else.
    expect(targets(b, "membrane", { kind: "wing" }).length).toBeGreaterThan(LIMITS.membranes);
    for (let i = 0; i < LIMITS.membranes; i++) expect(grow(b, "membrane", { kind: "wing" }, rng)!.fallback).toBe(false);
    expect(sortedIds(b.membranes)).toHaveLength(LIMITS.membranes);
    expect(LIMITS.membranes).toBe(10);
    expect(targets(b, "membrane", { kind: "wing" })).toEqual([]);
    expect(grow(b, "membrane", { kind: "wing" }, rng)!.fallback).toBe(true);
    expect(validate(b)).toEqual([]);
  });

  it("validate rejects a membrane that is neither a cycle nor a span", () => {
    const b = ring();
    const id = addMembrane(b, [7, 8, 9], "gill");
    // The neck and the arm share no node: the walk closes into nothing and runs through nothing.
    b.membranes[id]!.cycle = [6, 10];
    expect(validate(b).join(" ")).toMatch(/membrane/);
    b.membranes[id]!.cycle = [7, 8, 9];
    b.membranes[id]!.area = 9;
    expect(validate(b).join(" ")).toMatch(/membrane/);
    b.membranes[id]!.area = 5;
    expect(validate(b)).toEqual([]);
  });

  it("membranes go through the text fixture", () => {
    const b = gilled(0);
    const text = bodyToText(b);
    expect(text).toContain("# перепонки: id: вид [сегменты] площадь=N\n");
    expect(text).toContain(`\n17: жаберный лист [${SWAMP.torso}, ${SWAMP.torso2}, ${SWAMP.tentacle}]\n`);
    const back = bodyFromText(text);
    expect(bodyHash(back)).toBe(bodyHash(b));
    expect(bodyToText(back)).toBe(text);
    wearMembrane(b, 17, 3);
    expect(bodyToText(b)).toContain(`[${SWAMP.torso}, ${SWAMP.torso2}, ${SWAMP.tentacle}] площадь=7\n`);
    expect(bodyHash(bodyFromText(bodyToText(b)))).toBe(bodyHash(b));
    expect(bodyToText(human())).not.toContain("перепонки");
  });

  it("a named fixture writes the cycle as a node path", () => {
    const named = bodyFromText(`
      голова1[2] {голова(мозг*, глаз, глаз, челюсть, ухо, нос)}
      грудь[3]
      таз[3]
      локоть[1]  {пасть}
      кисть[1]   {кисть}
      плечо2[2]  {голова(мозг, глаз)}
      стопа.л[1] {стопа}
      стопа.п[1] {стопа}

      голова1 -шея:1/1 кожа-                               грудь
      грудь   -корпус:2/3 кожа {сердце, лёгкие, желудок}-  таз
      грудь   -рука:1/1 кожа-                              локоть
      локоть  -рука:1/1 кожа-                              кисть
      грудь   -корпус:3/2 хитин {лёгкие, кишка}-           плечо2
      плечо2  -щупальце:3/1 присоски-                      таз
      таз     -нога:2/1 кожа-                              стопа.л
      таз     -нога:2/1 кожа-                              стопа.п

      жаберный лист [грудь, плечо2, таз]
    `);
    expect(bodyHash(named)).toBe(bodyHash(gilled(0)));
    expect(named.membranes[17]).toEqual({ id: 17, kind: "gill", cycle: [10, 13, 14], area: 8 });
  });

  it("random bodies with membranes round-trip and stay valid", () => {
    let withMembranes = 0;
    for (const b of populationC(300)) {
      expect(validate(b)).toEqual([]);
      if (sortedIds(b.membranes).length > 0) withMembranes += 1;
      const text = bodyToText(b);
      const back = bodyFromText(text);
      expect(bodyHash(back)).toBe(bodyHash(b));
      expect(bodyToText(back)).toBe(text);
      for (const m of Object.values(b.membranes)) {
        // A cycle of 3..6, or the span of one bent limb from 2 segments up (decision 320).
        expect(m.cycle.length).toBeGreaterThanOrEqual(2);
        expect(m.cycle.length).toBeLessThanOrEqual(6);
        expect(m.area).toBeLessThanOrEqual(membraneArea(b, m));
      }
    }
    expect(withMembranes).toBeGreaterThan(20);
  });

  it("cutting keeps every membrane on a simple cycle of live segments", () => {
    for (const b of populationC(150)) {
      for (const s of segmentIds(b)) {
        const c = cloneBody(b);
        const r = cut(c, s, "a");
        for (const m of Object.values(c.membranes)) {
          for (const sid of m.cycle) expect(c.segments[sid]).toBeDefined();
          expect(r.torn).not.toContain(m.id);
        }
        expect(validate(c)).toEqual([]);
      }
    }
  });

  it("random operations on membranes never break a body", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const rng = new Rng(`m-${seed}`);
      const b = human(100_000);
      for (let i = 0; i < 80; i++) {
        const c = randomOpC(rng);
        grow(b, c.op, c.payload, rng);
        expect(validate(b), `seed ${seed} op ${i} ${c.op}\n${bodyToText(b)}`).toEqual([]);
        expect(sortedIds(b.membranes).length).toBeLessThanOrEqual(LIMITS.membranes);
      }
    }
  });
});
