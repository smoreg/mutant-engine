/**
 * Size in a fight (sanity step 3, package "dragon", decisions 1280-1286).
 * Each rule is checked over the human, the foes, the bestiary and 200 random
 * mutants, not on one body:
 *
 * - Z1: a wound hurts by the share of the body it takes: the same amount of
 *   harm is pain in inverse proportion to the body's hp, the human's being
 *   what the table of damage.md §4 says;
 * - Z2: a crowd reaches a body only as far as its size lets it: in one round
 *   of a crowd no more attackers strike a body than its girth has room for,
 *   a small body two or three, the human four, a body of tens of humans many;
 * - Z3: the bestiary is drawn in real sizes: a dragon weighs tens of humans,
 *   a whale more than a dragon, a rat the least of all;
 * - Z4: a blow the cover holds whole does nothing;
 * - Z5: a segment holds as much as it weighs.
 */
import { describe, expect, it } from "vitest";
import { LabRng as Rng } from "../rng.js";
import {
  BEASTS,
  COVERS,
  FOES,
  HUMAN_MASS,
  aimPolicy,
  aimStrike,
  AIMS,
  coverAgainst,
  parseDice,
  strike,
  strikes,
  beastById,
  cloneBody,
  fixtureBody,
  foeBody,
  human,
  hurtBrains,
  isFlank,
  mass,
  mutationById,
  newBattle,
  newHarm,
  planStrike,
  sectionGirth,
  skeletonCeiling,
  selfElement,
  stepBattle,
  type Body,
} from "../index.js";
import { population } from "./gen.js";

const TABLE: { id: string; body: () => Body }[] = [
  { id: "human", body: () => human() },
  ...FOES.map((f) => ({ id: `foe:${f.id}`, body: () => foeBody(f) })),
  ...BEASTS.map((b) => ({ id: b.id, body: () => fixtureBody(b) })),
];

const MUTANTS = population(200);

function all(): [string, Body][] {
  return [...TABLE.map((t) => [t.id, t.body()] as [string, Body]), ...MUTANTS.map((b, i) => [`mutant ${i}`, cloneBody(b)] as [string, Body])];
}

/** Hp of every element that is flesh: nodes and segments, a flank (no length, no mass) aside. */
function hpOf(body: Body): number {
  let hp = 0;
  for (const n of Object.values(body.nodes)) hp += n.hpMax;
  for (const s of Object.values(body.segments)) if (!isFlank(s)) hp += s.hpMax;
  return hp;
}

const HUMAN_HP = hpOf(human());

/** Pain the own brain takes from `amount` of harm at the element it sits in. */
function painOf(body: Body, amount: number): number {
  const harm = newHarm(body);
  const shares = hurtBrains(body, harm, selfElement(body), amount);
  return shares[0]?.amount ?? 0;
}

describe("Z1: pain is the share of the body a wound takes", () => {
  it("the human takes the table's pain", () => {
    expect(painOf(human(), 40)).toBe(40);
  });

  it("the same harm hurts a body in inverse proportion to its hp", () => {
    const AMOUNT = 60;
    for (const [id, body] of all()) {
      const got = painOf(body, AMOUNT);
      if (got === 0) continue; // painless, or no brain at the element
      const want = Math.round((AMOUNT * HUMAN_HP) / hpOf(body));
      expect(Math.abs(got - want), `${id}: боль ${got}, ожидалось ${want} (hp ${hpOf(body)})`).toBeLessThanOrEqual(1);
    }
  });

  it("a body of tens of humans does not black out from a wound that knocks a human out", () => {
    const dragon = fixtureBody(beastById("dragon")!);
    expect(painOf(dragon, 85), "дракон от 85 боли человека").toBeLessThan(30);
  });
});

/** Distinct fighters of the crowd that struck the body in the first round, when all of them act at once. */
function reachedBy(body: Body, crowd: number): number {
  const pol = aimPolicy(AIMS.brute);
  const b = newBattle({
    fighters: [{ id: "T", side: "T", body, policy: pol }, ...Array.from({ length: crowd }, (_, i) => ({ id: `C${i + 1}`, side: "C", body: human(), policy: pol }))],
    options: { distance: 1 },
  });
  const rng = new Rng(1);
  const who = new Set<string>();
  // Everyone acts at clock 0, the body first: the first round is the crowd's first swing.
  for (let i = 0; i <= crowd && b.result === null; i++) {
    for (const e of stepBattle(b, rng)) if (e.k === "act" && e.target === "T") who.add(e.who);
    if (b.time >= 100) break;
  }
  return who.size;
}

describe("Z2: a crowd reaches a body only as far as its size lets it", () => {
  const CROWD = 20;
  const subjects = all().filter((_, i) => i % 5 === 0);

  it("no more strike at once than the body has room for, and a bigger body has room for more", () => {
    // A body no blow of the human gets through is not struck at all: nothing there to count.
    const rows = subjects.filter(([, body]) => planStrike(human(), body).planned.length > 0).map(([id, body]) => ({ id, m: mass(body), n: reachedBy(body, CROWD) }));
    for (const r of rows) {
      expect(r.n, `${r.id}: толпа не достала совсем`).toBeGreaterThanOrEqual(2);
      if (r.m < HUMAN_MASS / 2) expect(r.n, `${r.id} (масса ${r.m}): ${r.n} бьют разом`).toBeLessThanOrEqual(3);
    }
    rows.sort((x, y) => x.m - y.m);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]!.n, `${rows[i]!.id} (масса ${rows[i]!.m}) тяжелее ${rows[i - 1]!.id} (${rows[i - 1]!.m})`).toBeGreaterThanOrEqual(rows[i - 1]!.n);
    }
  });

  it("the human is reached by four, a dragon by far more", () => {
    expect(reachedBy(human(), CROWD)).toBe(4);
    expect(reachedBy(fixtureBody(beastById("dragon")!), CROWD)).toBeGreaterThanOrEqual(10);
  });
});

describe("Z4: a blow the cover holds whole does nothing", () => {
  it("a blow no stronger than the guard of its type takes no hp and gives no pain, on every element of every body", () => {
    for (const [id, body] of all()) {
      for (const el of [...Object.keys(body.nodes), ...Object.keys(body.segments)].map(Number)) {
        if (body.segments[el] !== undefined && isFlank(body.segments[el]!)) continue;
        for (const type of ["blunt", "cut", "pierce", "bite"] as const) {
          const guard = coverAgainst(body, el, type);
          if (guard <= 0) continue;
          const b = cloneBody(body);
          const harm = newHarm(b);
          const was = (b.nodes[el] ?? b.segments[el])!.hp;
          const events = strike(b, harm, { damage: guard, profile: "at", aim: el, type }, new Rng(1));
          const hit = events.find((e) => e.k === "hit");
          expect(hit?.k === "hit" ? hit.damage : -1, `${id}: ${type} ${guard} по ${el}`).toBe(0);
          expect((b.nodes[el] ?? b.segments[el])!.hp, `${id}: ${el}`).toBe(was);
        }
      }
    }
  });

  it("the preview agrees: a strike whose best roll the guard holds expects nothing", () => {
    const man = human();
    let held = 0;
    for (const [id, foe] of TABLE.map((t) => [t.id, t.body()] as const)) {
      for (const el of Object.keys(foe.segments).map(Number)) {
        if (isFlank(foe.segments[el]!)) continue;
        for (const s of strikes(man)) {
          const p = aimStrike(man, s.key, foe, newHarm(foe), el)!;
          const d = parseDice(s.dice);
          const best = d.n * d.faces + s.force;
          if (best <= p.defense) {
            held += 1;
            expect(p.expected, `${id}: ${s.kind} по ${el}`).toBe(0);
          } else expect(p.expected, `${id}: ${s.kind} по ${el}`).toBeGreaterThan(0);
        }
      }
    }
    expect(held, "some cover holds some blow of the human").toBeGreaterThan(0);
  });
});

describe("Z5: a segment holds as much as it weighs", () => {
  it("hp past the base grows with the section, as mass does: the same hp per unit of flesh on every segment", () => {
    for (const [id, body] of all()) {
      for (const s of Object.values(body.segments)) {
        if (isFlank(s)) continue;
        const flesh = (s.length * s.girth * s.girth) / sectionGirth(s.kind);
        expect(Math.abs(s.hpMax - 4 - 4 * flesh), `${id}: ${s.kind} ${s.length}/${s.girth} hp ${s.hpMax}`).toBeLessThanOrEqual(0.5);
      }
    }
  });

  it("the human holds what he held", () => {
    expect(hpOf(human())).toBe(246);
  });
});

describe("Z6: a dragon's scale is not a snake's", () => {
  it("the dragon's scale guards no worse than the scale against every type, and holds every bare blow of the human", () => {
    const d = COVERS.dragonScales;
    for (const type of ["blunt", "cut", "pierce", "bite"] as const) expect(d.guard[type], type).toBeGreaterThanOrEqual(COVERS.scales.guard[type]);
    for (const s of strikes(human())) {
      const dice = parseDice(s.dice);
      expect(dice.n * dice.faces + s.force, `${s.kind} ${s.dice}`).toBeLessThanOrEqual(d.guard[s.type === "squeeze" ? "blunt" : s.type]);
    }
  });

  it("the dragon wears it, and the catalog grows it", () => {
    expect(beastById("dragon")!.want.cover).toBe("dragonScales");
    expect(mutationById("dragonScales")?.payload).toEqual({ cover: "dragonScales" });
  });
});

describe("Z7: a cover is not bone", () => {
  it("changing a cover never puts the mass above the ceiling it leaves: a lighter cover takes nothing off the skeleton", () => {
    const lighter = (Object.keys(COVERS) as (keyof typeof COVERS)[]).sort((x, y) => COVERS[x].massFactor - COVERS[y].massFactor);
    for (const [id, body] of all()) {
      if (mass(body) > skeletonCeiling(body) + 1e-9) continue; // a body over its ceiling is another test's
      for (const s of Object.values(body.segments)) {
        if (isFlank(s)) continue;
        for (const c of lighter) {
          if (COVERS[c].massFactor > COVERS[s.cover].massFactor) continue;
          const b = cloneBody(body);
          b.segments[s.id]!.cover = c;
          expect(mass(b), `${id}: ${s.kind} ${s.id} ${s.cover}→${c}`).toBeLessThanOrEqual(skeletonCeiling(b) + 1e-9);
        }
      }
    }
  });
});

describe("Z3: the bestiary in real sizes", () => {
  const m = (id: string): number => {
    const beast = beastById(id);
    if (beast !== undefined) return mass(fixtureBody(beast));
    const foe = FOES.find((f) => f.id === id);
    if (foe === undefined) throw new Error(`no ${id} in the bestiary or the foes`);
    return mass(foeBody(foe));
  };

  it("a dragon weighs tens of humans, a whale more, a bear a few, a rat the least of all", () => {
    expect(m("dragon")).toBeGreaterThanOrEqual(20 * HUMAN_MASS);
    expect(m("whale")).toBeGreaterThan(m("dragon"));
    expect(m("bear")).toBeGreaterThanOrEqual(2 * HUMAN_MASS);
    // The model draws no limb thinner than girth 1: the rat is the lightest body of the table, not a three-hundredth of a man.
    for (const t of TABLE) if (t.id !== "rat") expect(m("rat"), t.id).toBeLessThan(mass(t.body()));
    expect(m("rat")).toBeLessThan(0.6 * HUMAN_MASS);
  });

  it("the people come in sizes: the child below the goblin below the human below the warrior below the fat man", () => {
    expect(m("child")).toBeLessThan(m("goblin"));
    expect(m("goblin")).toBeLessThan(m("human"));
    expect(m("human")).toBeLessThan(m("warrior"));
    expect(m("warrior")).toBeLessThan(m("fat"));
  });
});
