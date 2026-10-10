/**
 * The ladder of hunger, docs/hunger.md «Голод ест тело»: an empty reserve is
 * not a line in a report, it is the body starting to eat itself. Six rungs,
 * always in the same order, and each one is tested here on a body that has
 * nothing above it left to eat - the fat, the muscle of a thick limb, the
 * mutation that is resorbed for good, the limb that dies and falls, the
 * innards, and the brain, which is the end.
 *
 * Two invariants close the file: a body that eats loses nothing at all, and a
 * body that never eats dies in a finite number of turns, having walked the
 * rungs downward and never back up.
 */
import { describe, expect, it } from "vitest";
import { LabRng as Rng } from "../rng.js";
import {
  HUMAN_IDS,
  HUNGER_TURNS,
  LADDER,
  bodyHash,
  elementState,
  feed,
  human,
  hungerStep,
  mass,
  newHarm,
  refreshSegmentHp,
  segmentIds,
  strip,
  turn,
  validate,
  type Body,
  type Harm,
  type HarmEvent,
  type HungerBite,
  type HungerStep,
} from "../index.js";

/** Turns on an empty reserve. Nothing here is random, but `turn` asks for a generator. */
function starve(body: Body, harm: Harm, turns: number): HarmEvent[] {
  const out: HarmEvent[] = [];
  const rng = new Rng(1);
  harm.reserve = 0;
  for (let i = 0; i < turns && harm.dead === null; i++) out.push(...turn(body, harm, {}, rng));
  return out;
}

function gnawed(events: readonly HarmEvent[]): HungerBite[] {
  return events.flatMap((e) => (e.k === "gnawed" ? [e.bite] : []));
}

function steps(events: readonly HarmEvent[]): HungerStep[] {
  return gnawed(events).map((b) => b.step);
}

/** A body with no free meat: every rung above the one being tested is empty. */
function tight(body: Body): Body {
  body.meat = mass(body);
  return body;
}

describe("1. the fat goes first", () => {
  it("burns free meat and leaves the graph where it was", () => {
    const body = human(140);
    const harm = newHarm(body);
    expect(hungerStep(body)).toBe("fat");
    const before = mass(body);
    const events = starve(body, harm, HUNGER_TURNS.fat);
    expect(steps(events)).toEqual(["fat"]);
    expect(body.meat).toBe(139);
    expect(mass(body)).toBe(before);
    expect(segmentIds(body).length).toBe(segmentIds(human()).length);
    expect(validate(body)).toEqual([]);
  });

  it("goes on until there is no fat left, and then it is another rung's turn", () => {
    const body = human(103);
    const harm = newHarm(body);
    const events = starve(body, harm, HUNGER_TURNS.fat * 2);
    expect(steps(events)).toEqual(["fat", "fat"]);
    expect(body.meat).toBe(101);
    expect(hungerStep(body)).not.toBe("fat");
  });
});

describe("2. then the muscle of the limbs", () => {
  /** A human with one arm of a bull: three of girth where the human has one. */
  function thickArmed(): Body {
    const body = human();
    const arm = body.segments[HUMAN_IDS.armL]!;
    arm.girth = 3;
    refreshSegmentHp(arm);
    return tight(body);
  }

  it("takes a point of girth off the fattest limb and no free meat appears out of it", () => {
    const body = thickArmed();
    expect(hungerStep(body)).toBe("muscle");
    const before = mass(body);
    const events = starve(body, newHarm(body), HUNGER_TURNS.muscle);
    const bite = gnawed(events)[0]!;
    expect(bite.step).toBe("muscle");
    expect(bite.elements).toEqual([HUMAN_IDS.armL]);
    expect(body.segments[HUMAN_IDS.armL]!.girth).toBe(2);
    expect(mass(body)).toBeLessThan(before);
    // The muscle is eaten, not freed: the fat rung finds nothing where it was.
    expect(body.meat).toBeCloseTo(mass(body), 9);
    expect(validate(body)).toEqual([]);
  });

  it("is empty on a human, whose limbs are already as thin as a limb gets", () => {
    expect(hungerStep(tight(human()))).not.toBe("muscle");
  });
});

describe("3. then the mutations are resorbed", () => {
  /** A human with one growth it was not born with: the hungriest thing on it that it can live without. */
  function mutant(): Body {
    const body = human();
    body.segments[HUMAN_IDS.torso]!.growths.push({ kind: "skinGland", instability: 0 });
    return tight(body);
  }

  it("takes the spare organ out for good, and it is not a wound", () => {
    const body = mutant();
    expect(hungerStep(body)).toBe("resorb");
    const events = starve(body, newHarm(body), HUNGER_TURNS.resorb);
    const bite = gnawed(events)[0]!;
    expect(bite.step).toBe("resorb");
    expect(bite.organs).toEqual(["skinGland"]);
    expect(bite.mass).toBeGreaterThan(0);
    expect(body.segments[HUMAN_IDS.torso]!.growths).toEqual([]);
    expect(validate(body)).toEqual([]);
    // Nothing bled for it and nothing broke: hunger is surgery, not a blow.
    expect(events.some((e) => e.k === "hit" || e.k === "bled")).toBe(false);
  });

  it("never takes what the body cannot live without", () => {
    const body = tight(human());
    expect(hungerStep(body)).not.toBe("resorb");
  });
});

describe("4. then the limbs die", () => {
  it("breaks the farthest limb element, and the next bite takes it off", () => {
    const body = tight(human());
    const harm = newHarm(body);
    expect(hungerStep(body)).toBe("necrosis");

    const first = gnawed(starve(body, harm, HUNGER_TURNS.necrosis))[0]!;
    expect(first.step).toBe("necrosis");
    expect(first.lost).toBe(false);
    const id = first.elements[0]!;
    const seg = body.segments[id]!;
    expect(elementState(seg.hp, seg.hpMax)).toBe("broken");

    const second = gnawed(starve(body, harm, HUNGER_TURNS.necrosis)).find((b) => b.elements.includes(id))!;
    expect(second.step).toBe("necrosis");
    expect(second.lost).toBe(true);
    expect(body.segments[id]).toBeUndefined();
    expect(validate(body)).toEqual([]);
  });
});

describe("5. then the innards", () => {
  /** A human with a second heart: neither of them is the last one, so neither is vital. */
  function twoHearted(): Body {
    const body = human();
    for (const id of [HUMAN_IDS.armL, HUMAN_IDS.armR, HUMAN_IDS.legL, HUMAN_IDS.legR, HUMAN_IDS.penis]) strip(body, () => false, [id]);
    body.segments[HUMAN_IDS.torso]!.cavity.push({ kind: "heart", instability: 0 });
    return tight(body);
  }

  it("takes a spare organ out of the cavity once there are no limbs left to lose", () => {
    const body = twoHearted();
    expect(hungerStep(body)).toBe("innards");
    const bite = gnawed(starve(body, newHarm(body), HUNGER_TURNS.innards))[0]!;
    expect(bite.step).toBe("innards");
    expect(bite.organs).toEqual(["heart"]);
    expect(body.segments[HUMAN_IDS.torso]!.cavity.filter((o) => o.kind === "heart")).toHaveLength(1);
    expect(validate(body)).toEqual([]);
  });

  it("leaves the last heart, the last breath and the last stomach where they are", () => {
    const body = twoHearted();
    starve(body, newHarm(body), HUNGER_TURNS.innards);
    expect(hungerStep(body)).toBe("brain");
  });
});

describe("6. and then the brain, which is the end", () => {
  /** A trunk with a head on it: no fat, no limbs, nothing spare inside. */
  function trunk(): Body {
    const body = human();
    for (const id of [HUMAN_IDS.armL, HUMAN_IDS.armR, HUMAN_IDS.legL, HUMAN_IDS.legR, HUMAN_IDS.penis]) strip(body, () => false, [id]);
    return tight(body);
  }

  it("eats the last brain and the body is dead of it", () => {
    const body = trunk();
    const harm = newHarm(body);
    expect(hungerStep(body)).toBe("brain");
    const events = starve(body, harm, HUNGER_TURNS.brain);
    const bite = gnawed(events)[0]!;
    expect(bite.step).toBe("brain");
    expect(bite.organs).toContain("brain");
    expect(harm.dead).toBe("brain");
    expect(events.some((e) => e.k === "death")).toBe(true);
  });
});

describe("a body that eats loses nothing", () => {
  it("stands five hundred turns on a full reserve with the same hash it started with", () => {
    const body = human(140);
    const harm = newHarm(body);
    const hash = bodyHash(body);
    const rng = new Rng(7);
    const events: HarmEvent[] = [];
    for (let i = 0; i < 500; i++) {
      feed(harm, 500);
      events.push(...turn(body, harm, {}, rng));
    }
    expect(gnawed(events)).toEqual([]);
    expect(events.some((e) => e.k === "starving")).toBe(false);
    expect(body.meat).toBe(140);
    expect(bodyHash(body)).toBe(hash);
    expect(harm.dead).toBe(null);
  });

  it("stops the ladder where it stands: what is eaten is eaten, and the next bite waits", () => {
    const body = human(140);
    const harm = newHarm(body);
    starve(body, harm, HUNGER_TURNS.fat + HUNGER_TURNS.fat - 1);
    expect(body.meat).toBe(139);
    // One turn short of the second bite; a meal resets the clock, so the turn after it takes nothing.
    feed(harm, 1000);
    const rng = new Rng(3);
    expect(gnawed(turn(body, harm, {}, rng))).toEqual([]);
    expect(body.meat).toBe(139);
  });
});

describe("hunger kills in a finite number of turns", () => {
  it("walks a human down the ladder to death, and never climbs back up a rung", () => {
    const body = human(140);
    const harm = newHarm(body);
    const seen: HungerStep[] = [];
    let turns = 0;
    const rng = new Rng(11);
    while (harm.dead === null && turns < 5000) {
      harm.reserve = 0;
      seen.push(...steps(turn(body, harm, {}, rng)));
      turns += 1;
    }
    expect(harm.dead, `still alive after ${turns} turns`).not.toBe(null);
    expect(turns).toBeLessThan(5000);
    expect(seen[0]).toBe("fat");
    expect(seen.at(-1)).toBe("brain");
    const rungs = seen.map((s) => LADDER.indexOf(s));
    expect(rungs.every((r, i) => i === 0 || r >= rungs[i - 1]!), `rungs went ${seen.join(" ")}`).toBe(true);
  });

  it("takes hundreds of turns over it, so there is time to do something desperate", () => {
    const body = tight(human());
    const harm = newHarm(body);
    let turns = 0;
    const rng = new Rng(12);
    while (harm.dead === null && turns < 5000) {
      harm.reserve = 0;
      turn(body, harm, {}, rng);
      turns += 1;
    }
    expect(turns).toBeGreaterThan(300);
  });
});
