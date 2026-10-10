/**
 * The body's problems and the knife's answers to them (body-graph.md, decision
 * 1323): `diagnose` lists what is broken with the numbers, `treatments` offers
 * only operations a copy of the body has proved.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { abyssBody } from "../bench/source.js";
import { bodyFromText, cloneBody, cut, diagnose, human, outcomeOf, severityOf, treatments, type Harm, type Problem } from "../index.js";
import { randomBody } from "./gen.js";

const FIX = join(import.meta.dirname, "fixtures");
/** Fighter 14 of a colosseum run: seven brains on four lungs' worth of air, acid at the top for good. */
const f14 = () => bodyFromText(readFileSync(join(FIX, "f14.txt"), "utf8"));
const f14Harm = (): Harm => JSON.parse(readFileSync(join(FIX, "f14-harm.json"), "utf8")) as Harm;

const of = (list: readonly Problem[], id: Problem["id"]): Problem | undefined => list.find((p) => p.id === id);

describe("diagnose", () => {
  it("finds nothing wrong with the human", () => {
    expect(diagnose(human())).toEqual([]);
  });

  it("fighter 14 is short of air at rest: the draw is under the brains' need, so the acid never goes", () => {
    const list = diagnose(f14());
    const air = of(list, "air")!;
    expect(air).toBeDefined();
    expect(air.have).toBe(4);
    expect(air.need).toBeCloseTo(4.79, 2);
    expect(air.severity).toBeGreaterThan(0);
    expect(air.text.ru).toMatch(/воздух/);
    // The brains past yours are what eat the air.
    expect(air.culprits.length).toBeGreaterThan(0);
  });

  it("with his wounds, fighter 14 has no channels left: pain from the acid takes them, and the acid is the air's", () => {
    const list = diagnose(f14(), f14Harm());
    const control = of(list, "control")!;
    expect(control).toBeDefined();
    expect(control.have).toBeLessThan(control.need);
    expect(control.cause).toBe("pain");
    expect(of(list, "pain")!.cause).toBe("acid");
    expect(of(list, "acid")!.cause).toBe("air");
  });

  it("lists a cause before what follows from it, the chain by its gravest; every severity within 0..1", () => {
    const list = diagnose(f14(), f14Harm());
    for (const p of list) expect(p.severity).toBeGreaterThan(0), expect(p.severity).toBeLessThanOrEqual(1);
    expect(list.slice(0, 4).map((p) => p.id)).toEqual(["air", "acid", "pain", "control"]);
    const roots = list.filter((p) => p.cause === null);
    const chain = (r: Problem): number => Math.max(...list.filter((p) => p === r || p.cause !== null).map((p) => p.severity));
    for (let i = 1; i < roots.length; i++) expect(roots[i]!.severity).toBeLessThanOrEqual(i === 1 ? chain(roots[0]!) : roots[i - 1]!.severity);
  });
});

describe("treatments", () => {
  it("offers fighter 14 a cut that eases his air, and the cut does ease it on a copy", () => {
    const body = f14();
    const air = treatments(body).find((t) => t.problem.id === "air")!;
    expect(air.remedies.length).toBeGreaterThan(0);
    const best = air.remedies[0]!;
    const after = outcomeOf(body, best.op).after;
    expect(of(diagnose(after), "air")?.severity ?? 0).toBeLessThan(air.problem.severity);
  });

  it("names catalog rows for what the knife cannot give: air comes with lungs", () => {
    const air = treatments(f14()).find((t) => t.problem.id === "air")!;
    expect(air.problem.rows).toContain("extraLungs");
  });

  it("a man without arms and legs cannot move, the knife has nothing for it, and the rows that grow a leg are named", () => {
    const body = human();
    for (const id of Object.keys(body.segments).map(Number)) if (body.segments[id]?.kind === "leg" || body.segments[id]?.kind === "arm") cut(body, id, "a");
    const walk = treatments(body).find((t) => t.problem.id === "walk")!;
    expect(walk).toBeDefined();
    expect(walk.remedies).toEqual([]);
    expect(walk.problem.rows).toContain("extraLeg");
  });

  it("does not touch the body it reads", () => {
    const body = f14();
    const before = JSON.stringify(cloneBody(body));
    treatments(body, f14Harm());
    expect(JSON.stringify(cloneBody(body))).toBe(before);
  });

  it("on 200 mutants, every offered cut eases its problem and leaves the whole no worse", () => {
    const bodies = [...Array.from({ length: 100 }, (_, i) => randomBody(i + 1, 10 + ((i + 1) % 30))), ...Array.from({ length: 100 }, (_, i) => abyssBody(i + 1, 12))];
    let offered = 0;
    for (const body of bodies) {
      const total = severityOf(diagnose(body));
      for (const t of treatments(body)) {
        for (const r of t.remedies) {
          offered += 1;
          const after = diagnose(outcomeOf(body, r.op).after);
          expect(of(after, t.problem.id)?.severity ?? 0).toBeLessThan(t.problem.severity);
          expect(severityOf(after)).toBeLessThanOrEqual(total + 1e-9);
        }
      }
    }
    expect(offered).toBeGreaterThan(0);
  }, 120_000);
});
