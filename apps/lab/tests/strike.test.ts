/**
 * The strike tab: the foes as fixtures, the tab and the foe in the hash, and
 * the mutant's volley taken by the damage track - a fight runs to a death
 * damage.md names, the same every time for the same seed.
 */
import { describe, expect, it } from "vitest";
import {
  blowOf,
  bloodLevel,
  cloneBody,
  derive,
  excessChannels,
  human,
  mindState,
  newHarm,
  rollVolley,
  strike as landBlow,
  strikes,
  turn as harmTurn,
  validate,
  volley,
  type Body,
  type DeathCause,
  type Harm,
  LabRng,
  initialState,
} from "@mutant-engine/core";
import { FOES, foeBody, foeById } from "@mutant-engine/core";
import { decode, encode } from "../hash.js";

interface Fought {
  body: Body;
  harm: Harm;
  volleys: number;
  fainted: boolean;
}

function fight(me: Body, foeId: string, seed: number, maxVolleys = 300): Fought {
  const body = foeBody(foeById(foeId));
  const harm = newHarm(body);
  const rng = new LabRng(`t${seed}`);
  const list = strikes(me);
  let energy = 0;
  let fainted = false;
  let volleys = 0;
  for (; volleys < maxVolleys && harm.dead === null; volleys++) {
    const v = volley(list, { armor: derive(body).armor.mean }, { excess: excessChannels(me) });
    if (v.planned.length === 0) break;
    for (const roll of rollVolley(v, rng)) {
      if (!roll.hit) continue;
      landBlow(body, harm, blowOf(roll), rng);
      if (harm.dead !== null) break;
    }
    const was = Math.floor(energy / 100);
    energy += v.time;
    for (let i = was; i < Math.floor(energy / 100) && harm.dead === null; i++) harmTurn(body, harm, { upkeep: false }, rng);
    if (!mindState(body, harm).conscious) fainted = true;
  }
  return { body, harm, volleys, fainted };
}

describe("the foes", () => {
  it("human, orc, troll and the scavenger parse into sound bodies within their channels", () => {
    // The scavenger came last on purpose (decision 730): the human stays row zero,
    // which is what `foeById` falls back to, and the troll stays row two.
    // The people in their sizes and the goblin come after them (decision 1284).
    expect(FOES.map((f) => f.id)).toEqual(["human", "orc", "troll", "scavenger", "warrior", "fat", "child", "goblin"]);
    for (const f of FOES) {
      const b = foeBody(f);
      expect(validate(b), f.id).toEqual([]);
      const d = derive(b);
      expect(d.budgets.control.load, f.id).toBeLessThanOrEqual(d.budgets.control.cap);
    }
  });

  it("they grow: the scavenger under a man, orc heavier than a man, troll heavier and armored", () => {
    const [man, orc, troll, scavenger] = FOES.map((f) => derive(foeBody(f)));
    expect(scavenger!.budgets.mass).toBeLessThan(man!.budgets.mass);
    expect(orc!.budgets.mass).toBeGreaterThan(man!.budgets.mass);
    expect(troll!.budgets.mass).toBeGreaterThan(orc!.budgets.mass);
    expect(troll!.armor.mean).toBeGreaterThan(1);
    expect(foeById("nobody").id).toBe("human");
  });

  it("the foe rides in the hash, and the strike tab's link opens the arena", () => {
    const back = decode(`#${encode(initialState(), { tab: "arena", foe: "troll" })}`);
    expect(back.view.tab).toBe("arena");
    expect(back.view.foe).toBe("troll");
    expect(decode("#s=1&b=h&sp=1&tab=strike&foe=troll").view).toEqual({ tab: "arena", foe: "troll" });
  });
});

describe("a fight to the end", () => {
  it("a man beats a man to death, by a cause damage.md names", () => {
    const causes: DeathCause[] = ["blood", "brain", "mass"];
    for (let seed = 1; seed <= 10; seed++) {
      const f = fight(human(), "human", seed);
      expect(f.harm.dead, `seed ${seed}`).not.toBeNull();
      expect(causes).toContain(f.harm.dead!);
      expect(f.fainted, `seed ${seed}: fainted before dying`).toBe(true);
      // A corpse whose brain was crushed is not a sound body any more, so validate is asked of the living.
      const alive = fight(human(), "human", seed, 3);
      expect(validate(alive.body), `seed ${seed}`).toEqual([]);
    }
  });

  it("the same seed is the same fight", () => {
    const a = fight(human(), "orc", 3);
    const b = fight(human(), "orc", 3);
    expect(b.volleys).toBe(a.volleys);
    expect(b.harm.dead).toBe(a.harm.dead);
    expect(b.harm.turn).toBe(a.harm.turn);
    expect(Math.round(b.harm.blood)).toBe(Math.round(a.harm.blood));
  });

  it("the troll holds out longer against fists than the man", () => {
    const sum = (id: string) => [1, 2, 3, 4, 5].map((s) => fight(human(), id, s).volleys).reduce((x, y) => x + y, 0);
    expect(sum("troll")).toBeGreaterThan(1.5 * sum("human"));
  });

  it("the blow the damage track takes is the roll the volley made; claws come dirty", () => {
    const me = human();
    for (const id of [4, 5]) me.nodes[id]!.ends = [{ kind: "claw", instability: 0 }];
    me.version++;
    const v = volley(strikes(me), { armor: 0 });
    const rolls = rollVolley(v, new LabRng("blow"));
    for (const r of rolls) {
      const blow = blowOf(r);
      expect(blow.damage).toBe(r.amount);
      expect(blow.profile).toBe("random");
      if (r.planned.strike.type === "cut" || r.planned.strike.type === "bite") expect(blow.dirty).toBe(true);
    }
  });

  it("a fight leaves the foe bleeding and losing blood before it dies", () => {
    const f = fight(human(), "human", 2, 4);
    expect(f.harm.dead).toBeNull();
    expect(f.harm.blood).toBeLessThan(newHarm(cloneBody(f.body)).blood);
    expect(["fine", "weak", "grave", "faint"]).toContain(bloodLevel(f.body, f.harm));
  });
});
