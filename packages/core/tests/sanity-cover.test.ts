/**
 * Common sense of armour on the one who wears it (docs/tasks/sanity, finding
 * S-fight-03, strike.md §1.4): a hard heavy cover stiffens the limb it is on.
 * The accuracy a cover costs is one formula of its hardness and weight, so no
 * cover heavier and harder than another strikes truer, and a soft one costs
 * nothing. Read over every cover and over the bodies of the bestiary, the foes
 * and 200 random mutants.
 */
import { describe, expect, it } from "vitest";
import { BEASTS, COVERS, FOES, KIND_ACCURACY, END_ACCURACY, coverAccuracy, cloneBody, fixtureBody, foeBody, human, strikes, type Body, type CoverId } from "../index.js";
import { population } from "./gen.js";

const IDS = Object.keys(COVERS) as CoverId[];

describe("a hard cover stiffens the blow", () => {
  it("S-fight-03: a cover at least as hard and as heavy as another never strikes truer", () => {
    const bad: string[] = [];
    for (const a of IDS) {
      for (const b of IDS) {
        const A = COVERS[a];
        const B = COVERS[b];
        if (A.defense >= B.defense && A.massFactor >= B.massFactor && coverAccuracy(a) > coverAccuracy(b)) bad.push(`${a} ${coverAccuracy(a)} > ${b} ${coverAccuracy(b)}`);
      }
    }
    expect(bad.join("\n")).toBe("");
  });

  it("S-fight-03: soft covers cost nothing; plates, stone, chrome and a dragon's scale cost the blow", () => {
    for (const id of IDS) if (COVERS[id].defense === 0) expect(coverAccuracy(id), id).toBe(0);
    for (const id of ["plates", "stone", "chrome", "dragonScales"] as const) expect(coverAccuracy(id), id).toBeLessThan(0);
    expect(coverAccuracy("stone")).toBeLessThanOrEqual(coverAccuracy("plates"));
  });

  it("S-fight-03: every limb's blow pays the cover of its segment by that formula", () => {
    const bodies: { id: string; body: Body }[] = [
      { id: "human", body: human() },
      ...FOES.map((f) => ({ id: `foe:${f.id}`, body: foeBody(f) })),
      ...BEASTS.map((b) => ({ id: b.id, body: fixtureBody(b) })),
      ...population(200).map((b, i) => ({ id: `random:${i}`, body: cloneBody(b) })),
    ];
    const bad: string[] = [];
    for (const { id, body } of bodies) {
      for (const s of strikes(body)) {
        if (s.segment === null || s.nerve > 5) continue;
        const seg = body.segments[s.segment];
        if (seg === undefined) continue;
        const kind = s.kind === "head" ? "jaw" : s.kind;
        const want = (END_ACCURACY[kind] ?? 0) + KIND_ACCURACY[seg.kind] + coverAccuracy(seg.cover);
        if (s.accuracy !== want) bad.push(`${id} ${s.key} ${seg.cover}: ${s.accuracy} want ${want}`);
      }
    }
    expect(bad.slice(0, 10).join("\n")).toBe("");
  });
});
