/**
 * The senses by common sense (docs/tasks/sanity, findings S-senses-01..06):
 * a sense organ works only where a living brain reaches it, an organ grown on
 * the flesh senses like one in a head, every sense organ of the catalog is
 * measurable, more eyes see better up to a bound, and a mute head does not
 * speak whatever it speaks with. Each rule is a property over the bestiary,
 * the foes, 200 random mutants and the sense rows of the catalog.
 */
import { describe, expect, it } from "vitest";
import {
  BEASTS,
  DODGE,
  FOES,
  HUMAN_IDS,
  SENSE_REACH,
  bloodReach,
  brains,
  derive,
  distances,
  fixtureBody,
  foeBody,
  human,
  needOf,
  nodeIds,
  organ,
  segmentIds,
  sightDodge,
  touch,
  works,
  type Body,
  type Organ,
  type OrganKind,
} from "../index.js";
import { rowBody } from "../bench/source.js";
import { randomBody } from "./gen.js";

interface Subject {
  id: string;
  body: () => Body;
}

const ROWS = ["earOnBody", "electroSense", "lightSkin", "extraEye", "ear", "earCluster", "stalkEye", "eyeOnJoint", "secondHead", "headAnywhere", "headInstead", "twoFaces", "muteness", "deepSense", "echo"];

const SUBJECTS: Subject[] = [
  ...FOES.map((f): Subject => ({ id: `foe:${f.id}`, body: () => foeBody(f) })),
  ...BEASTS.map((b): Subject => ({ id: b.id, body: () => fixtureBody(b) })),
  ...Array.from({ length: 200 }, (_, i): Subject => ({ id: `random:${i + 1}`, body: () => randomBody(i + 1, 10 + ((i + 1) % 30)) })),
  ...ROWS.flatMap((r) => [1, 2, 3, 4, 5].map((s): Subject => ({ id: `row:${r}:${s}`, body: () => rowBody(r, s) }))),
];

const EYES = new Set<OrganKind>(["eye", "facetEye"]);
const EARS = new Set<OrganKind>(["ear", "earCluster"]);

/** Elements a living brain reaches, by the rule, computed apart from derive. */
function reached(body: Body): Set<number> {
  const live = bloodReach(body);
  const rows = brains(body)
    .filter((b) => b.alive)
    .map((b) => distances(body, b.place));
  const near = (n: number): boolean => rows.some((d) => (d[n] ?? Infinity) <= SENSE_REACH + 1e-9);
  const out = new Set<number>();
  for (const id of nodeIds(body)) if (works(body, id) && live.has(id) && near(id)) out.add(id);
  for (const id of segmentIds(body)) {
    const s = body.segments[id]!;
    if (works(body, id) && live.has(id) && (near(s.a) || near(s.b))) out.add(id);
  }
  return out;
}

/** Every list of organs of a reached element: a head's contents, a segment's cavity and growths; the endings apart. */
function reachedLists(body: Body): { ends: Organ[]; lists: Organ[][] } {
  const r = reached(body);
  const ends: Organ[] = [];
  const lists: Organ[][] = [];
  for (const id of nodeIds(body)) {
    if (!r.has(id)) continue;
    for (const e of body.nodes[id]!.ends) {
      ends.push(e);
      if (e.contents !== undefined) lists.push(e.contents);
    }
  }
  for (const id of segmentIds(body)) if (r.has(id)) lists.push([...body.segments[id]!.cavity, ...body.segments[id]!.growths]);
  return { ends, lists };
}

const has = (l: readonly Organ[], k: OrganKind): boolean => l.some((o) => o.kind === k);

describe("the senses by common sense", () => {
  it("S-senses-01/02/05: eyes and ears count where a living brain reaches them, in a head or on the flesh", () => {
    for (const s of SUBJECTS) {
      const body = s.body();
      const { ends, lists } = reachedLists(body);
      const eyes = ends.filter((e) => e.kind === "eye").length + lists.reduce((n, l) => n + (has(l, "blindness") ? 0 : l.filter((o) => EYES.has(o.kind)).length), 0);
      const ears = lists.reduce((n, l) => n + (has(l, "deafness") ? 0 : l.filter((o) => EARS.has(o.kind)).length), 0);
      const d = derive(body).senses;
      expect(d.viewpoints.reduce((n, v) => n + v.eyes, 0), `${s.id}: eyes`).toBe(eyes);
      expect(d.hearing, `${s.id}: hearing`).toBe(ears);
    }
  });

  it("S-senses-01: a body without a living brain senses nothing; an eye beyond every brain is flesh", () => {
    const b = human();
    const head = b.nodes[HUMAN_IDS.head]!.ends[0]!;
    head.contents = head.contents!.filter((o) => o.kind !== "brain");
    b.self = { segment: HUMAN_IDS.torso };
    touch(b);
    const d = derive(b).senses;
    expect(d.sight).toBe(false);
    expect(d.hearing).toBe(0);
    expect(d.speak).toBe(false);

    const far = human();
    far.nodes[HUMAN_IDS.footL]!.ends.push(organ("eye"));
    touch(far);
    expect(derive(far).senses.viewpoints.map((v) => v.node)).toEqual([HUMAN_IDS.head]);
  });

  it("S-senses-02/05: the needs and the senses read the organs alike", () => {
    for (const s of SUBJECTS) {
      const body = s.body();
      const d = derive(body).senses;
      if (brains(body).some((b) => b.alive)) {
        if (needOf(body, "hearing").strength === 0) expect(d.hearing, `${s.id}: the need hears, the senses do not`).toBeGreaterThan(0);
        if (needOf(body, "sight").strength >= 1) expect(d.sight, `${s.id}: every brain blind, yet it sees`).toBe(false);
      }
    }
    const eared = human();
    eared.segments[HUMAN_IDS.torso]!.growths.push(organ("ear"));
    touch(eared);
    expect(derive(eared).senses.hearing).toBe(derive(human()).senses.hearing + 1);
    expect(derive(eared).senses.hearingAt).toContain(HUMAN_IDS.torso);
  });

  it("S-senses-03: electroreception and light-sensing skin are measurable and keep a body from the blind penalty", () => {
    for (const s of SUBJECTS) {
      const body = s.body();
      const { lists } = reachedLists(body);
      const d = derive(body).senses;
      expect(d.electro, `${s.id}: electro`).toBe(lists.some((l) => has(l, "electroSense")));
      expect(d.light, `${s.id}: light`).toBe(lists.some((l) => has(l, "lightSkin")));
      if (!d.sight && (d.electro || d.light)) expect(sightDodge(body), `${s.id}: blind penalty`).toBeGreaterThan(DODGE.blind);
    }
    for (const row of ["electroSense", "lightSkin"]) {
      const b = rowBody(row, 1);
      const head = b.nodes[HUMAN_IDS.head]!.ends[0]!;
      head.contents = head.contents!.filter((o) => !EYES.has(o.kind));
      touch(b);
      expect(derive(b).senses.sight, row).toBe(false);
      expect(sightDodge(b), row).toBeGreaterThan(DODGE.blind);
    }
  });

  it("S-senses-04: another eye where the body already sees helps, less every time, never past the cap", () => {
    for (const s of SUBJECTS) {
      const body = s.body();
      const at = derive(body).senses.viewpoints.find((v) => v.eyes > 0);
      const d0 = sightDodge(body);
      expect(d0, s.id).toBeLessThanOrEqual(DODGE.sightMax);
      if (at === undefined) continue;
      const head = body.nodes[at.node]!.ends.find((e) => e.kind === "head" && e.contents !== undefined && e.contents.some((o) => EYES.has(o.kind)));
      if (head === undefined) continue;
      head.contents!.push(organ("eye"));
      touch(body);
      const d1 = sightDodge(body);
      head.contents!.push(organ("eye"));
      touch(body);
      const d2 = sightDodge(body);
      expect(d2, s.id).toBeLessThanOrEqual(DODGE.sightMax);
      if (d0 < DODGE.sightMax) expect(d1, `${s.id}: a third eye`).toBeGreaterThan(d0);
      if (d1 < DODGE.sightMax) expect(d2 - d1, `${s.id}: saturation`).toBeLessThan(d1 - d0);
    }
  });

  it("S-senses-06: a mute head does not speak, with a jaw or with two faces", () => {
    for (const s of SUBJECTS) {
      const body = s.body();
      const { lists } = reachedLists(body);
      const speaks = lists.some((l) => !has(l, "muteness") && (has(l, "jaw") || has(l, "twoFaces")));
      // A voice is air through a jaw (decision 1234).
      const d = derive(body);
      expect(d.senses.speak, s.id).toBe(speaks && d.breath.intake.air > 0);
    }
    const b = human();
    b.nodes[HUMAN_IDS.head]!.ends[0]!.contents!.push(organ("twoFaces"), organ("muteness"));
    touch(b);
    expect(derive(b).senses.speak).toBe(false);
  });
});
