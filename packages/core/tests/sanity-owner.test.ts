/**
 * The owner's answers to round 4 of the sanity audit (docs/tasks/sanity,
 * decisions 1315-1320): a bite holds only in a mouth heavier than a man's; a
 * body swims by what pushes the water against its weight, the whale by its tail
 * and flippers, the octopus by its siphon; the number of legs has no ceiling of
 * its own - a nerve cord steers the trunk it runs along; the giant bear is a
 * tier above the bear. Read over the bestiary, the foes, the human and 200
 * random mutants.
 */
import { describe, expect, it } from "vitest";
import {
  BEASTS,
  FOES,
  SWIM_DRAG,
  armory,
  beastById,
  bodyFromText,
  brainDistances,
  capabilities,
  cloneBody,
  controlCap,
  controlLoad,
  derive,
  distances,
  fixtureBody,
  foeBody,
  human,
  mass,
  mouthMass,
  organ,
  segmentIds,
  strikes,
  swimThrust,
  tier,
  touch,
  weight,
  type Body,
} from "../index.js";
import { population } from "./gen.js";

const FIXTURES: { id: string; body: () => Body }[] = [
  { id: "human", body: () => human() },
  ...FOES.map((f) => ({ id: `foe:${f.id}`, body: () => foeBody(f) })),
  ...BEASTS.map((b) => ({ id: b.id, body: () => fixtureBody(b) })),
];
const MUTANTS = population(200);
const ALL: { id: string; body: () => Body }[] = [...FIXTURES, ...MUTANTS.map((b, i) => ({ id: `random:${i}`, body: () => cloneBody(b) }))];
const beast = (id: string): Body => fixtureBody(beastById(id)!);

describe("a bite holds only in a mouth heavier than a man's (decision 1315)", () => {
  it("every bite holds exactly when the jaws of its head outweigh the human's", () => {
    const man = strikes(human()).find((s) => s.type === "bite")!;
    const bad: string[] = [];
    for (const { id, body } of ALL) {
      const b = body();
      for (const s of armory(b)) {
        const want = s.type === "bite" && s.index !== null && mouthMass(b.nodes[s.node]!.ends[s.index]!) > mouthMass(human().nodes[man.node]!.ends[man.index!]!);
        if (s.holds !== want) bad.push(`${id} ${s.key} ${s.type}: holds ${s.holds}, want ${want}`);
      }
    }
    expect(bad.slice(0, 10).join("\n")).toBe("");
  });

  it("the man's bite does not hold; the bear's and the dragon's do", () => {
    expect(strikes(human()).filter((s) => s.type === "bite").every((s) => !s.holds)).toBe(true);
    for (const id of ["bear", "dragon"]) expect(strikes(beast(id)).some((s) => s.type === "bite" && s.holds), id).toBe(true);
  });
});

describe("a body swims by what pushes the water, against its weight (decision 1316)", () => {
  it("a fin pushes by the part it grows on: on a man's torso it carries him, on his forearm it does not", () => {
    const torso = human();
    const tid = segmentIds(torso).find((s) => torso.segments[s]!.kind === "torso")!;
    torso.segments[tid]!.growths.push(organ("fins"));
    touch(torso);
    expect(derive(torso).locomotion.swim).toBe(true);
    const arm = human();
    const aid = segmentIds(arm).find((s) => arm.segments[s]!.kind === "arm")!;
    arm.segments[aid]!.growths.push(organ("fins"));
    touch(arm);
    expect(swimThrust(arm)).toBeLessThan(swimThrust(torso));
    expect(derive(arm).locomotion.swim).toBe(false);
  });

  it("swimming is thrust over the weight to two thirds, on every body", () => {
    const bad: string[] = [];
    for (const { id, body } of ALL) {
      const b = body();
      const want = swimThrust(b) > 0 && swimThrust(b) >= SWIM_DRAG * weight(b) ** (2 / 3);
      if (derive(b).locomotion.swim !== want) bad.push(`${id}: swim ${derive(b).locomotion.swim}, thrust ${swimThrust(b)}, weight ${weight(b)}`);
      if (capabilities(b).swim !== want) bad.push(`${id}: capabilities disagree`);
    }
    expect(bad.slice(0, 10).join("\n")).toBe("");
  });

  it("the whale swims on its tail and flippers; the octopus on its siphon, with no fin at all", () => {
    expect(derive(beast("whale")).locomotion.swim).toBe(true);
    const o = beast("octopus");
    expect(derive(o).locomotion.swim).toBe(true);
    const finned = segmentIds(o).some((s) => o.segments[s]!.growths.some((g) => g.kind === "fins"));
    expect(finned).toBe(false);
    expect(segmentIds(o).some((s) => o.segments[s]!.cavity.some((g) => g.kind === "siphon"))).toBe(true);
  });

  it("a body grown alike in every part swims as it did: a bigger whale is no worse a swimmer", () => {
    const w = beast("whale");
    const big = cloneBody(w);
    for (const s of segmentIds(big)) {
      big.segments[s]!.length *= 2;
      big.segments[s]!.girth *= 2;
    }
    big.meat = Infinity;
    touch(big);
    expect(mass(big)).toBeGreaterThan(mass(w) * 4);
    expect(swimThrust(big) / weight(big) ** (2 / 3)).toBeGreaterThanOrEqual((swimThrust(w) / weight(w) ** (2 / 3)) * 0.9);
  });
});

/** A centipede with `pairs` pairs of legs, one pair on every trunk segment past the first. */
function centipede(pairs: number): Body {
  const lines = ["голова[2] {голова(мозг*, складки коры, складки коры, складки коры, глаз, глаз, жвалы, челюсть, вибрисы)}", "т1[3]"];
  for (let i = 2; i <= pairs + 1; i++) lines.push(`т${i}[2]`);
  for (let i = 1; i <= 2 * pairs; i++) lines.push(`н${i}[1] {коготь}`);
  for (let i = 1; i <= pairs; i++) lines.push(`бедро${i}.л[2]`, `бедро${i}.п[2]`);
  lines.push("", "голова -шея:1/1 хитин- т1");
  const cavity: Record<number, string> = { 1: " {сердце} [трахеи]", 2: " {лёгкие}", 3: " {желудок}", 4: " {нервный ствол}" };
  for (let i = 1; i <= pairs; i++) lines.push(`т${i} -корпус:1/2 хитин${cavity[i] ?? ""}- т${i + 1}`);
  for (let p = 1; p <= pairs; p++) {
    lines.push(`т${p + 1} ~бок:0/1 хитин~ бедро${p}.л`, `бедро${p}.л -нога:1/1 хитин- н${2 * p - 1}`);
    lines.push(`т${p + 1} ~бок:0/1 хитин~ бедро${p}.п`, `бедро${p}.п -нога:1/1 хитин- н${2 * p}`);
  }
  return bodyFromText(lines.join("\n"));
}

describe("legs have no ceiling of their own: a nerve cord steers the trunk (decision 1317)", () => {
  it("the centipede of the bestiary walks on twenty-two legs, and its brains carry them", () => {
    const c = beast("centipede");
    const legs = capabilities(c).endings.filter((e) => e.kind === "claw").length;
    expect(legs).toBe(22);
    expect(controlLoad(c)).toBeLessThanOrEqual(controlCap(c));
  });

  it("every pair of legs along a trunk costs the same channels, however long the trunk", () => {
    const step = controlLoad(centipede(9)) - controlLoad(centipede(8));
    for (let n = 9; n < 24; n++) expect(controlLoad(centipede(n + 1)) - controlLoad(centipede(n)), `${n} → ${n + 1}`).toBe(step);
  });

  it("the distance tax runs from the nearest living brain, never farther than from you", () => {
    const bad: string[] = [];
    for (const { id, body } of ALL) {
      const b = body();
      const near = brainDistances(b);
      const mine = distances(b, b.self);
      for (const [k, d] of Object.entries(mine)) if ((near[Number(k)] ?? Infinity) > d) bad.push(`${id} node ${k}: ${near[Number(k)]} > ${d}`);
    }
    expect(bad.slice(0, 10).join("\n")).toBe("");
  });
});

describe("the giant bear is a tier above the bear (decision 1319)", () => {
  it("its torso is a tier bigger, it weighs more than twice the bear, and its claws swing harder", () => {
    const bear = beast("bear");
    const giant = beast("giantBear");
    const top = (b: Body) => Math.max(...segmentIds(b).map((s) => tier(b.segments[s]!)));
    expect(top(giant)).toBeGreaterThan(top(bear));
    expect(mass(giant)).toBeGreaterThan(2 * mass(bear));
    const claw = (b: Body) => Math.max(...strikes(b).filter((s) => s.kind === "claw").map((s) => s.force));
    expect(claw(giant)).toBeGreaterThan(claw(bear));
  });
});
