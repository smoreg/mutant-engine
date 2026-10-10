/**
 * The gauntlet of the generator: a creature walks a line of foes until
 * something kills it, and how far it got is its score. The lines are data both
 * the studio and this file read, the walk is the strike tab's volley and the
 * wound tab's track, and the same seed is the same walk.
 */
import { describe, expect, it } from "vitest";
import {
  blowOf,
  bodyHash,
  cloneBody,
  derive,
  elementState,
  excessChannels,
  human,
  landVolley,
  newHarm,
  nodeIds,
  planStrike,
  rollVolley,
  segmentIds,
  strike as landBlow,
  strikes,
  turn as harmTurn,
  volley,
  type Body,
  type Harm,
  LabRng,
  initialState,
} from "@mutant-engine/core";
import { DEFAULT_GEN, type GenParams } from "../batch.js";
import { simulate } from "../damage.js";
import { FOES, FOE_LINES, foeBody, foeById, lineById } from "@mutant-engine/core";
import { MAX_TURNS, gauntlet, mealOf, worstBleed } from "../gauntlet.js";
import { decode, encode } from "../hash.js";

const SEEDS = [1, 2, 3, 4, 5];

function sum(list: readonly number[]): number {
  return list.reduce((a, b) => a + b, 0);
}

function walked(body: Body, line: string): number[] {
  return SEEDS.map((s) => gauntlet(body, s, { line }).beaten);
}

describe("the lines of foes", () => {
  it("are data: every line is a list of the foes the strike tab fights, weakest first", () => {
    const ids = new Set(FOES.map((f) => f.id));
    expect(FOE_LINES.length).toBeGreaterThanOrEqual(3);
    for (const line of FOE_LINES) {
      expect(line.foes.length, line.id).toBeGreaterThan(0);
      for (const id of line.foes) expect(ids, `${line.id}: ${id}`).toContain(id);
      expect(foeBody(foeById(line.foes[0]!))).toBeDefined();
    }
    expect(lineById("nothing of the sort").id).toBe(FOE_LINES[0]!.id);
    expect(lineById(undefined).id).toBe(FOE_LINES[0]!.id);
  });

  it("the studio and the test name the same line: the id rides in the batch's link", () => {
    for (const line of FOE_LINES) {
      const gen: GenParams = { ...DEFAULT_GEN, count: 2, line: line.id, sort: "strong", min: 2 };
      const back = decode(`#${encode(initialState(), { tab: "gen", gen })}`).view.gen;
      expect(back?.line, line.id).toBe(line.id);
      expect(back?.sort).toBe("strong");
      expect(back?.min).toBe(2);
      // And the walk goes down exactly that list.
      const walk = gauntlet(foeBody(foeById("troll")), 1, { line: line.id });
      expect(walk.line).toBe(line.id);
      expect(walk.fights.map((f) => f.foe)).toEqual(line.foes.slice(0, walk.fights.length));
    }
  });

  it("a line unknown to the studio is dropped from the link, and the batch fights nobody", () => {
    const gen = decode(`#s=1&b=h&sp=1&tab=gen&g=8.10.abyss.1.1~fno-such-line~snowhere~k0`).view.gen;
    expect(gen?.line).toBeUndefined();
    expect(gen?.sort).toBeUndefined();
    expect(gen?.min).toBeUndefined();
  });
});

describe("the walk", () => {
  it("the same seed is the same walk, and the creature's own body is left alone", () => {
    const body = human();
    const before = bodyHash(body);
    const a = gauntlet(body, 7, { line: "floor1" });
    const b = gauntlet(cloneBody(body), 7, { line: "floor1" });
    expect(b).toEqual(a);
    expect(bodyHash(body)).toBe(before);
  });

  it("different seeds are different walks", () => {
    const walks = SEEDS.map((s) => JSON.stringify(gauntlet(foeBody(foeById("orc")), s, { line: "crowd" })));
    expect(new Set(walks).size).toBeGreaterThan(1);
  });

  it("the score is the foes beaten in a row: the walk ends at the first one it did not beat", () => {
    for (const seed of SEEDS) {
      for (const line of FOE_LINES) {
        const w = gauntlet(foeBody(foeById("orc")), seed, { line: line.id });
        const won = w.fights.filter((f) => f.won).length;
        expect(won, `${line.id} ${seed}`).toBe(w.beaten);
        expect(w.beaten).toBeLessThanOrEqual(line.foes.length);
        expect(w.fights.filter((f) => !f.won).length).toBeLessThanOrEqual(1);
        expect(w.survived).toBe(w.dead === null && w.beaten === line.foes.length);
        if (w.dead === null && !w.survived) expect(w.fights[w.fights.length - 1]!.acts).toBeGreaterThanOrEqual(0);
        expect(w.blood).toBeGreaterThanOrEqual(0);
        expect(w.blood).toBeLessThanOrEqual(1);
      }
    }
  });

  it("it tells the strong from the weak: a troll walks past an orc, an orc past a man", () => {
    for (const line of ["floor1", "crowd", "orcs"]) {
      const man = sum(walked(human(), line));
      const orc = sum(walked(foeBody(foeById("orc")), line));
      const troll = sum(walked(foeBody(foeById("troll")), line));
      expect(troll, line).toBeGreaterThan(orc);
      expect(orc, line).toBeGreaterThanOrEqual(man);
    }
  });

  it("a fight of its own runs no longer than the battle's ceiling of turns", () => {
    for (const f of gauntlet(human(), 3, { line: "crowd" }).fights) expect(f.turns).toBeLessThanOrEqual(MAX_TURNS);
  });

  it("a corpse feeds inside the band of meat, and a wound is found by how much it bleeds", () => {
    for (const foe of FOES) {
      const meal = mealOf(foeBody(foe));
      expect(meal).toBeGreaterThanOrEqual(120);
      expect(meal).toBeLessThanOrEqual(300);
    }
    const body = human();
    const harm = newHarm(body);
    expect(worstBleed(body, harm)).toBeNull();
    const seg = body.segments[Object.keys(body.segments).map(Number)[0]!]!;
    seg.bleed = 4;
    expect(worstBleed(body, harm)).toBe(seg.id);
  });
});

/**
 * The owner saw a part at zero hp living on and asked whether the tabs differ.
 * They do not: one track, one rule, and zero is not the threshold of tearing.
 */
describe("one track for both tabs: a part at zero", () => {
  const blows = [
    { t: "hit" as const, dice: "5", profile: "at" as const, at: 4 },
    { t: "hit" as const, dice: "5", profile: "at" as const, at: 4 },
    { t: "hit" as const, dice: "5", profile: "at" as const, at: 4 },
  ];

  function shot(body: Body, harm: Harm): string {
    const parts = [...nodeIds(body), ...segmentIds(body)]
      .sort((a, b) => a - b)
      .map((id) => {
        const el = body.nodes[id] ?? body.segments[id]!;
        return `${id}:${el.hp}/${el.hpMax}:${elementState(el.hp, el.hpMax)}:${body.nodes[id]?.ends.length ?? "-"}`;
      });
    return `${parts.join(" ")}|${Math.round(harm.blood)}|${harm.dead}`;
  }

  it("the wound tab's own run is the track itself: the same blows leave the same body", () => {
    const run = simulate(foeBody(foeById("human")), { seed: 1, hunger: false, commands: blows });
    const last = run.steps[run.steps.length - 1]!;
    const body = foeBody(foeById("human"));
    const harm = newHarm(body);
    const rng = new LabRng("damage:1");
    for (const h of blows) landBlow(body, harm, { damage: 5, profile: "at", aim: h.at }, rng);
    expect(shot(body, harm)).toBe(shot(last.body, last.harm));
    expect(bodyHash(body)).toBe(bodyHash(last.body));
  });

  it("the strike tab's own volley is the track too: landing it by hand leaves the same body", () => {
    const me = human();
    const foe = foeBody(foeById("human"));
    const v = planStrike(me, foe);
    const a = cloneBody(foe);
    const aHarm = newHarm(a);
    landVolley(v, a, aHarm, new LabRng("one"));
    const b = cloneBody(foe);
    const bHarm = newHarm(b);
    const rng = new LabRng("one");
    for (const roll of rollVolley(v, rng)) {
      if (!roll.hit) continue;
      landBlow(b, bHarm, blowOf(roll), rng);
      if (bHarm.dead !== null) break;
    }
    expect(shot(b, bHarm)).toBe(shot(a, aHarm));
  });

  it("zero is not the threshold: a part at zero is broken and keeps what it holds, tearing starts past half its hpMax below", () => {
    const body = foeBody(foeById("human"));
    const harm = newHarm(body);
    const rng = new LabRng("steps");
    const node = body.nodes[4]!;
    expect(node.hpMax).toBe(6);
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      landBlow(body, harm, { damage: 3, profile: "at", aim: 4 }, rng);
      seen.push(`${node.hp}:${elementState(node.hp, node.hpMax)}:${node.ends.length}`);
    }
    // 3/6 hurt with its hand, 0/6 broken and still holding it, -3/6 destroyed and crushed.
    expect(seen).toEqual(["3:hurt:1", "0:broken:1", "-3:destroyed:0"]);
  });

  it("time does not take a broken part away: with a reserve it knits back", () => {
    const body = foeBody(foeById("human"));
    const harm = newHarm(body);
    const rng = new LabRng("time");
    body.nodes[4]!.hp = 0;
    for (let i = 0; i < 60; i++) harmTurn(body, harm, { upkeep: false }, rng);
    const node = body.nodes[4]!;
    expect(node).toBeDefined();
    expect(node.hp).toBeGreaterThan(0);
  });
});

describe("no second engine: the walk is the strike tab's volley and the wound tab's track", () => {
  it("planStrike is the volley the strike tab plans", () => {
    const me = human();
    const foe = foeBody(foeById("troll"));
    expect(planStrike(me, foe, 2)).toEqual(volley(strikes(me), { armor: derive(foe).armor.mean, distance: 2 }, { excess: excessChannels(me) }));
  });

  it("landVolley rolls what rollVolley rolls and hands every hit to the damage track", () => {
    const me = human();
    const foe = foeBody(foeById("human"));
    const v = planStrike(me, foe);
    const rolled = rollVolley(v, new LabRng("same"));
    const body = cloneBody(foe);
    const harm = newHarm(body);
    const landed = landVolley(v, body, harm, new LabRng("same"));
    expect(landed.rolls).toEqual(rolled);
    expect(landed.missed.map((s) => s.key)).toEqual(rolled.filter((r) => !r.hit).map((r) => r.planned.strike.key));
    // The track took the blows: something is hurt, and the events are the track's own.
    if (rolled.some((r) => r.hit)) expect(landed.events.length).toBeGreaterThan(0);
  });
});
