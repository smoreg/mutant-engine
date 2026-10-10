/**
 * Common sense of breath and of the ways to move (docs/tasks/sanity/README.md,
 * findings S-breath-01/02/05/06, S-size-07, S-move-01..04/08): every rule is a
 * property over the bestiary, the foes, the human and 200 random mutants.
 */
import { LabRng as Rng } from "../rng.js";
import { describe, expect, it } from "vitest";
import { capabilities, derive, elapse, human, mass, newHarm, organ, segmentIds, touch, HUMAN_IDS, type Body } from "../index.js";
import { bellyOf } from "../keep.js";
import { ROSTER } from "../bench/roster.js";
import { rowBody } from "../bench/source.js";
import { randomBody } from "./gen.js";
import { SEALED_DEFENSE } from "../derive/breath.js";
import { COVERS, ORGANS } from "../parts.js";
import { SUFFOCATION_TURNS } from "../damage.js";

type Named = readonly [string, () => Body];

const POPULATION: readonly Named[] = [
  ...ROSTER.map((c): Named => [c.id, c.body]),
  ["human", () => human()],
  ...Array.from({ length: 200 }, (_, i): Named => [`random:${i + 1}`, () => randomBody(i + 1, 10 + ((i + 1) % 30), 100_000, { breathe: false })]),
];

const intakeOf = (b: Body): number => {
  const i = derive(b).breath.intake;
  return Math.max(i.air, i.water);
};

/** Turns of time until the body dies, or `limit` when it lives through them; the reserve is not burnt, so hunger does not decide. */
function lifespan(body: Body, limit: number, seed = 1): { turns: number; harm: ReturnType<typeof newHarm> } {
  const harm = newHarm(body);
  const rng = new Rng(seed);
  let t = 0;
  while (harm.dead === null && t < limit) {
    elapse(body, rng, { harm, upkeep: false });
    t++;
  }
  return { turns: t, harm };
}

describe("breath is read by time (S-breath-01)", () => {
  it("a body that breathes nothing dies within its tank plus the suffocation; a breathing one never runs out of air", () => {
    let still = 0;
    let breathing = 0;
    for (const [id, make] of POPULATION) {
      const body = make();
      const d = derive(body).breath;
      if (intakeOf(body) <= 0) {
        still++;
        const limit = Math.ceil(d.tank.common / d.base) + SUFFOCATION_TURNS + 2;
        const { harm } = lifespan(body, limit);
        expect(harm.dead, id).not.toBeNull();
      } else if (breathing < 40) {
        breathing++;
        const { harm } = lifespan(body, 40);
        expect(harm.air ?? d.tank.common, id).toBeGreaterThan(0);
      }
    }
    expect(still).toBeGreaterThan(10);
  });

  it("a human with his lungs torn out dies, one with them lives", () => {
    const body = human();
    const torso = body.segments[HUMAN_IDS.torso]!;
    torso.cavity = torso.cavity.filter((o) => o.kind !== "lungs");
    touch(body);
    expect(intakeOf(body)).toBe(0);
    expect(lifespan(body, 60).harm.dead).not.toBeNull();
    expect(lifespan(human(), 60).harm.dead).toBeNull();
  });
});

describe("blood without a heart does not run (S-breath-02)", () => {
  it("every body with its hearts taken out dies within a few turns", () => {
    for (const [id, make] of POPULATION.slice(0, ROSTER.length + 1)) {
      const body = make();
      for (const sid of segmentIds(body)) {
        const s = body.segments[sid]!;
        s.cavity = s.cavity.filter((o) => o.kind !== "heart");
      }
      touch(body);
      expect(derive(body).breath.delivery, id).toBe(0);
      expect(lifespan(body, 8).harm.dead, id).not.toBeNull();
    }
  });
});

describe("lungs grow with the body that holds them (S-breath-05)", () => {
  it("a wider chest holds more air and draws more", () => {
    let seen = 0;
    for (const [id, make] of POPULATION) {
      const body = make();
      const at = segmentIds(body).find((sid) => body.segments[sid]!.cavity.some((o) => o.kind === "lungs"));
      if (at === undefined) continue;
      seen++;
      const before = derive(body).breath;
      const s = body.segments[at]!;
      s.girth += 6;
      touch(body);
      const after = derive(body).breath;
      expect(after.tank.lungs, id).toBeGreaterThan(before.tank.lungs);
      expect(after.intake.air, id).toBeGreaterThan(before.intake.air);
    }
    expect(seen).toBeGreaterThan(20);
    const dragon = ROSTER.find((c) => c.id === "dragon")!.body();
    expect(derive(dragon).breath.tank.lungs).toBeGreaterThan(derive(human()).breath.tank.lungs);
    expect(derive(dragon).breath.intake.air).toBeGreaterThan(derive(human()).breath.intake.air);
  });
});

describe("pores breathe only through a cover that lets air in (S-breath-06)", () => {
  it("pores under a hard cover do not breathe, under a soft one they do", () => {
    for (const [id, make] of POPULATION.slice(0, ROSTER.length + 1)) {
      for (const cover of Object.keys(COVERS) as (keyof typeof COVERS)[]) {
        const body = make();
        const sid = segmentIds(body).find((x) => body.segments[x]!.kind === "torso")!;
        const s = body.segments[sid]!;
        s.growths.push(organ("pores"));
        s.cover = cover;
        const n = s.growths.filter((o) => o.kind === "pores").length;
        touch(body);
        const pores = derive(body).breath.organs.filter((o) => o.kind === "pores" && o.at === sid);
        if (COVERS[cover].defense >= SEALED_DEFENSE) expect(pores, `${id} ${cover}`).toEqual([]);
        else expect(pores.length, `${id} ${cover}`).toBe(n);
      }
    }
  });
});

describe("the start reserve is the body's own (S-size-07)", () => {
  it("a fresh record holds the belly of its body: a human 400, a bigger eater more", () => {
    expect(newHarm(human()).reserve).toBe(400);
    for (const [id, make] of POPULATION) {
      const body = make();
      expect(newHarm(body).reserve, id).toBe(bellyOf(body));
    }
    const dragon = ROSTER.find((c) => c.id === "dragon")!.body();
    expect(newHarm(dragon).reserve).toBeGreaterThan(newHarm(human()).reserve);
  });
});

/**
 * The body made heavier by a torso that much wider - one that pushes no water: a fin or a siphon is as big as
 * the part it sits on (decision 1316), so widening that part would not leave the same fins.
 */
function heavier(body: Body, times: number): Body {
  const b = structuredClone(body);
  const target = mass(b) * times;
  const swims = (x: number) => [...b.segments[x]!.growths, ...b.segments[x]!.cavity].some((o) => ORGANS[o.kind].flags?.includes("swim"));
  const dry = segmentIds(b).filter((x) => b.segments[x]!.kind !== "flank" && !swims(x));
  const sid = dry.find((x) => b.segments[x]!.kind === "torso") ?? dry[0] ?? segmentIds(b)[0]!;
  b.meat = Infinity;
  while (mass(b) < target) {
    b.segments[sid]!.girth += 1;
    touch(b);
  }
  return b;
}

describe("climbing, swimming and digging carry the body's weight (S-move-01)", () => {
  it("a body that climbs, swims or digs stops when it is twenty times heavier on the same limbs", () => {
    let moving = 0;
    for (const [id, make] of POPULATION) {
      const body = make();
      const l = derive(body).locomotion;
      if (!l.climb && !l.swim && l.dig === 0) continue;
      moving++;
      // Twenty, not ten, since decision 1317: the centipede digs on twenty-two claws, 44 points at 60 each - ten of itself.
      const h = derive(heavier(body, 20)).locomotion;
      expect(h.climb, id).toBe(false);
      expect(h.swim, id).toBe(false);
      expect(h.dig, id).toBe(0);
    }
    expect(moving).toBeGreaterThan(20);
  });

  it("one claw does not hold a human on a wall; two do", () => {
    const one = rowBody("diggingClaws", 1);
    expect(derive(one).locomotion.climb).toBe(false);
    expect(derive(one).locomotion.dig).toBeGreaterThan(0);
    const two = human();
    for (const n of [HUMAN_IDS.handL, HUMAN_IDS.handR]) two.nodes[n]!.ends[0] = organ("claw");
    touch(two);
    expect(derive(two).locomotion.climb).toBe(true);
  });

  it("capabilities and derive give one answer on climbing, swimming and digging", () => {
    for (const [id, make] of POPULATION) {
      const body = make();
      const c = capabilities(body);
      const d = derive(body);
      expect(c.climb && !d.speed.ring, id).toBe(d.locomotion.climb);
      expect(c.swim, id).toBe(d.locomotion.swim);
      expect(c.dig, id).toBe(d.locomotion.dig);
    }
  });
});

describe("sucker pads climb, and suckers hold upside down (S-move-02, S-move-08)", () => {
  it("sucker pads on a leg climb, on any seed", () => {
    for (let seed = 1; seed <= 10; seed++) expect(derive(rowBody("suckerPads", seed)).locomotion.climb, `seed ${seed}`).toBe(true);
  });

  it("only a climber with suckers holds a ceiling", () => {
    for (const [id, make] of POPULATION) {
      const l = derive(make()).locomotion;
      if (l.ceiling) expect(l.climb, id).toBe(true);
    }
    expect(derive(ROSTER.find((c) => c.id === "octopus")!.body()).locomotion.ceiling).toBe(true);
    expect(derive(ROSTER.find((c) => c.id === "spider")!.body()).locomotion.ceiling).toBe(false);
    expect(derive(rowBody("suckerPads", 1)).locomotion.ceiling).toBe(true);
  });
});

describe("what pushes the body moves it (S-move-04)", () => {
  it("a formless body on pseudopods crawls", () => {
    for (let seed = 1; seed <= 5; seed++) {
      const d = derive(rowBody("amorphous", seed));
      expect(d.speed.value, `seed ${seed}`).toBeGreaterThan(0);
    }
  });
});
