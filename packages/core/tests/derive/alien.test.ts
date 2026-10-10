/**
 * Alienness is one formula over the body (the owner's requirement): how far
 * the body is from the human, not a table of families. Every rule here is a
 * property over the bestiary, the foes and random mutants.
 */
import { describe, expect, it } from "vitest";
import { LabRng as Rng } from "../../rng.js";
import {
  BEASTS,
  FOES,
  MUTATIONS,
  alienness,
  applyMutation,
  bodyFromText,
  bodyToText,
  cut,
  derive,
  drawMutation,
  fixtureBody,
  foeBody,
  human,
  humanoid,
  isBrainKind,
  mass,
  nodeIds,
  organs,
  segmentIds,
  segmentsAt,
  summarize,
  type Body,
} from "../../index.js";
import { population } from "../gen.js";

const SUBJECTS: { id: string; body: () => Body }[] = [
  ...FOES.map((f) => ({ id: `foe:${f.id}`, body: () => foeBody(f) })),
  ...BEASTS.map((b) => ({ id: b.id, body: () => fixtureBody(b) })),
];

/** Random mutants of the catalog: a human struck `steps` times by the abyss. */
function mutantSteps(seed: number, steps: number): { body: Body; displaced: boolean }[] {
  const rng = new Rng(seed);
  const b = human(100_000);
  const out: { body: Body; displaced: boolean }[] = [];
  for (let i = 0; i < steps; i++) {
    const m = drawMutation(MUTATIONS, rng, { body: b, defect: rng.next() < 0.3 })!;
    const r = applyMutation(b, m, rng, { source: "abyss" });
    out.push({ body: bodyFromText(bodyToText(b)), displaced: (r?.displaced.length ?? 0) > 0 });
  }
  return out;
}

/** The same body with every id renumbered backwards: nodes, segments and membranes. */
function renumbered(b: Body): Body {
  const text = bodyToText(b);
  const next = Number(/следующий (\d+)/.exec(text)![1]);
  const map = (id: string): string => String(next - Number(id));
  const lines = text.split("\n").map((line) => {
    let m = /^(\d+)(\[.*)$/.exec(line);
    if (m) return map(m[1]!) + m[2];
    m = /^(\d+): (\d+) (.*) (\d+)$/.exec(line);
    if (m) return `${map(m[1]!)}: ${map(m[2]!)} ${m[3]!.replace(/место=№(\d+):/, (_, n: string) => `место=№${map(n)}:`)} ${map(m[4]!)}`;
    m = /^(\d+): (\S+) \[([\d, ]+)\](.*)$/.exec(line);
    if (m) return `${map(m[1]!)}: ${m[2]} [${m[3]!.split(", ").map(map).join(", ")}]${m[4]}`;
    return line;
  });
  return bodyFromText(lines.join("\n"));
}

/** The upper end of the scale: every element of both bodies counted as foreign. */
function ceilingOf(b: Body): number {
  const elements = (x: Body) => nodeIds(x).length + segmentIds(x).length + [...organs(x)].length + Object.keys(x.membranes).length;
  return mass(b) + elements(b) + mass(human()) + elements(human());
}

describe("alienness: one formula over the body", () => {
  it("is 0 on the human, and the human foe is a human", () => {
    expect(alienness(human())).toBe(0);
    expect(alienness(foeBody(FOES.find((f) => f.id === "human")!))).toBe(0);
    expect(derive(human()).budgets.alien).toBe(0);
    expect(summarize(derive(human())).alien).toBe(0);
  });

  it("every beast and foe but the human is alien, within the scale", () => {
    for (const s of SUBJECTS) {
      const b = s.body();
      const a = alienness(b);
      if (s.id === "foe:human") continue;
      expect(a, s.id).toBeGreaterThan(0);
      expect(a, s.id).toBeLessThanOrEqual(ceilingOf(b));
    }
  });

  it("does not depend on the order of ids", () => {
    for (const s of SUBJECTS) {
      const b = s.body();
      expect(alienness(renumbered(b)), s.id).toBeCloseTo(alienness(b), 9);
    }
    for (const b of population(60)) expect(alienness(renumbered(b))).toBeCloseTo(alienness(b), 9);
  });

  it("is deterministic and cached on the version", () => {
    const b = fixtureBody(BEASTS.find((x) => x.id === "dragon")!);
    expect(alienness(b)).toBe(alienness(fixtureBody(BEASTS.find((x) => x.id === "dragon")!)));
    expect(derive(b).budgets.alien).toBe(alienness(b));
  });

  it("every catalog row that changes the human raises it, but a row that only rehangs a limb or sets an ending wandering", () => {
    // Alienness is what the body is made of; where a limb hangs is the plan, and `humanoid` measures that.
    for (const m of MUTATIONS) {
      for (let seed = 1; seed <= 3; seed++) {
        const b = human(100_000);
        const was = bodyToText(b);
        if (applyMutation(b, m, new Rng(seed), { source: "abyss" }) === null || bodyToText(b) === was) continue;
        const wanders = [...organs(b)].some((o) => o.wander !== undefined);
        if (humanoid(b) < 1 || wanders) continue;
        expect(alienness(b), m.id).toBeGreaterThan(0);
      }
    }
  });

  it("the abyss makes it grow; a strike lowers it only by what it took away", () => {
    // A strike at the ceiling evicts organs, and an evicted foreign organ takes its weight
    // with it, as the knife does. Without an eviction a strike lowers it only when it
    // shrinks or takes off a part the human has fewer of, or gives back one the body lost.
    let steps = 0;
    let lowered = 0;
    const at = new Map<number, number>();
    for (let seed = 1; seed <= 40; seed++) {
      let before = 0;
      mutantSteps(seed, 25).forEach(({ body, displaced }, i) => {
        const a = alienness(body);
        if (a < before - 1e-9 && !displaced) lowered += 1;
        at.set(i, (at.get(i) ?? 0) + a / 40);
        steps += 1;
        before = a;
      });
    }
    expect(lowered / steps).toBeLessThan(0.03);
    expect(at.get(24)!).toBeGreaterThan(at.get(9)!);
    expect(at.get(9)!).toBeGreaterThan(at.get(2)!);
    expect(at.get(2)!).toBeGreaterThan(0);
  });

  it("the knife that takes a foreign limb off lowers it", () => {
    const bodies = [...SUBJECTS.map((s) => s.body()), ...population(60)];
    let cuts = 0;
    for (const b of bodies) {
      const thinks = (node: number) => b.nodes[node]!.ends.some((o) => isBrainKind(o.kind) || o.contents?.some((x) => isBrainKind(x.kind)));
      for (const sid of segmentIds(b)) {
        const s = b.segments[sid]!;
        if (["arm", "leg", "neck", "torso", "flank", "penis"].includes(s.kind)) continue;
        for (const [tip, near] of [[s.b, "a"], [s.a, "b"]] as const) {
          if (segmentsAt(b, tip).length !== 1 || thinks(tip)) continue;
          const c = bodyFromText(bodyToText(b));
          const before = alienness(c);
          cut(c, sid, near);
          expect(nodeIds(c).includes(tip)).toBe(false);
          expect(alienness(c)).toBeLessThan(before);
          cuts += 1;
        }
      }
    }
    expect(cuts).toBeGreaterThan(20);
  });
});
