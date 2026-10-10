/**
 * The place of a side node is data of the model (decision 1258): the flank
 * carries its host, its fraction along the host and its side. A sprout on a
 * segment lands on that segment, a segment holds no more side nodes than its
 * places, and a side node stays where it is when its neighbours grow or go.
 */
import { describe, expect, it } from "vitest";
import {
  BEASTS,
  FOES,
  apply,
  beastById,
  bodyFromText,
  bodyHash,
  bodyToText,
  cloneBody,
  fixtureBody,
  flankHost,
  flankPlace,
  flanksOf,
  foeBody,
  human,
  removeElements,
  segmentIds,
  sideSlots,
  targets,
  validate,
  type Body,
  type Payload,
} from "../index.js";
import { population } from "./gen.js";

const LEG: Payload<"sprout"> = { kind: "leg", length: 2, girth: 1, cover: "skin", ending: { kind: "foot", instability: 0 } };

const TABLE: { id: string; body: () => Body }[] = [
  { id: "human", body: () => human() },
  ...FOES.map((f) => ({ id: `foe:${f.id}`, body: () => foeBody(f) })),
  ...BEASTS.map((b) => ({ id: b.id, body: () => fixtureBody(b) })),
];

const MUTANTS = population(200);

function flanks(body: Body): number[] {
  return segmentIds(body).filter((id) => body.segments[id]!.kind === "flank");
}

/** Every flank's place as text, for comparing before and after. */
function places(body: Body): Map<number, string> {
  return new Map(flanks(body).map((f) => [f, JSON.stringify(flankPlace(body, f))]));
}

/** Segment targets of a sprout with the payload. */
function sproutTargets(body: Body, payload: Payload<"sprout">): number[] {
  return targets(body, "sprout", payload).flatMap((w) => ("segment" in w.target ? [w.target.segment] : []));
}

describe("the place of a side node is data", () => {
  it("K1: a sprout on a segment hangs its side node on that segment, whichever torso wins the node", () => {
    const bad: string[] = [];
    let tried = 0;
    for (const [name, body] of [...TABLE.map((t) => [t.id, t.body()] as const), ...MUTANTS.map((b, i) => [`mutant ${i}`, b] as const)]) {
      body.meat = Math.max(body.meat, 100_000);
      for (const seg of sproutTargets(body, LEG)) {
        const b = cloneBody(body);
        const r = apply(b, "sprout", LEG, { segment: seg });
        const flank = r.created.find((id) => b.segments[id]?.kind === "flank")!;
        tried += 1;
        if (flankHost(b, flank) !== seg) bad.push(`${name}: sprout on ${seg} went to ${flankHost(b, flank)}`);
      }
    }
    expect(tried).toBeGreaterThan(200);
    expect(bad).toEqual([]);
  });

  it("K2: eight sprouts on the centaur's croup land on the croup, and no segment holds more side nodes than its places", () => {
    const b = fixtureBody(beastById("centaur")!);
    b.meat = 100_000;
    const croup = segmentIds(b).filter((id) => b.segments[id]!.kind === "torso").at(-1)!;
    for (let i = 0; i < 8 && sproutTargets(b, LEG).includes(croup); i++) apply(b, "sprout", LEG, { segment: croup });
    expect(flanksOf(b, croup).length).toBe(sideSlots(b.segments[croup]!));
    for (const id of segmentIds(b)) expect(flanksOf(b, id).length, `segment ${id}`).toBeLessThanOrEqual(sideSlots(b.segments[id]!));
    expect(validate(b)).toEqual([]);
  });

  it("K2: every body of the table and every mutant holds no more side nodes on a segment than its places", () => {
    for (const body of [...TABLE.map((t) => t.body()), ...MUTANTS]) {
      for (const id of segmentIds(body)) {
        const s = body.segments[id]!;
        if (s.kind !== "flank") expect(flanksOf(body, id).length).toBeLessThanOrEqual(sideSlots(s));
      }
      expect(validate(body)).toEqual([]);
    }
  });

  it("validate catches a segment with more side nodes than places", () => {
    const b = human();
    const torso = segmentIds(b).find((id) => b.segments[id]!.kind === "torso")!;
    // A fifth flank on the human's torso of four places, set by hand at a place of its own.
    const f = flanksOf(b, torso)[0]!;
    const copy = cloneBody(b);
    const id = copy.nextId++;
    const node = copy.nextId++;
    copy.nodes[node] = { ...copy.nodes[copy.segments[f]!.b]!, id: node, ends: [] };
    copy.segments[id] = { ...copy.segments[f]!, id, b: node, place: { host: torso, t: 0.3, side: -1 } };
    expect(validate(copy).some((e) => e.includes("places are taken"))).toBe(true);
    expect(flanksOf(copy, torso).length).toBeLessThanOrEqual(sideSlots(copy.segments[torso]!));
  });

  it("K3: a side node keeps its place when a neighbour grows on its host and when a neighbour goes", () => {
    const bad: string[] = [];
    for (const [name, body] of [...TABLE.map((t) => [t.id, t.body()] as const), ...MUTANTS.slice(0, 60).map((b, i) => [`mutant ${i}`, b] as const)]) {
      body.meat = Math.max(body.meat, 100_000);
      const before = places(body);
      for (const seg of sproutTargets(body, LEG)) {
        const b = cloneBody(body);
        apply(b, "sprout", LEG, { segment: seg });
        for (const [f, p] of before) if (JSON.stringify(flankPlace(b, f)) !== p) bad.push(`${name}: sprout on ${seg} moved flank ${f}`);
      }
      for (const f of flanks(body).slice(0, 4)) {
        const b = cloneBody(body);
        const side = b.segments[f]!.b;
        const hanging = segmentIds(b).filter((id) => id !== f && (b.segments[id]!.a === side || b.segments[id]!.b === side));
        removeElements(b, [f, side, ...hanging]);
        for (const [g, p] of before) {
          if (g === f || b.segments[g] === undefined) continue;
          const host = JSON.parse(p) as { host: number } | undefined;
          if (host === undefined || b.segments[host.host] === undefined) continue;
          if (JSON.stringify(flankPlace(b, g)) !== p) bad.push(`${name}: losing flank ${f} moved flank ${g}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("the text of every fixture and its hash are what they were: a place the model would work out is not written", () => {
    for (const t of TABLE) {
      const b = t.body();
      const text = bodyToText(b);
      expect(text, t.id).not.toContain("место=");
      expect(bodyHash(bodyFromText(text)), t.id).toBe(bodyHash(b));
    }
  });

  it("a place of its own is written, read back and hashed", () => {
    const b = human(4000);
    b.meat = 100_000;
    const torso = segmentIds(b).find((id) => b.segments[id]!.kind === "torso")!;
    const f = flanksOf(b, torso)[0]!;
    const before = bodyHash(b);
    b.segments[f]!.place = { host: torso, t: 0.2, side: b.segments[f]!.place!.side };
    const text = bodyToText(b);
    expect(text).toContain("место=");
    const back = bodyFromText(text);
    expect(flankPlace(back, f)).toEqual(flankPlace(b, f));
    expect(bodyToText(back)).toBe(text);
    expect(bodyHash(back)).toBe(bodyHash(b));
    expect(bodyHash(b)).not.toBe(before);
  });
});
