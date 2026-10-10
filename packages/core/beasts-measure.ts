/**
 * How a body is read against a beast: the shape of a body in numbers
 * (`features`), how close it is to the shape wanted (`similarity`) and the
 * beast's own hand-drawn form (`fixtureBody`). Pure functions over the model.
 */
import type { Beast, Shape, ShapeKey } from "./beasts.js";
import type { Body, CoverId, Organ } from "./graph.js";
import { segmentIds, sortedIds } from "./graph.js";
import { bodyFromText } from "./text.js";

export const SHAPE_KEYS: readonly ShapeKey[] = ["torsos", "limbs", "tails", "heads", "eyes", "hand", "claw", "hoof", "pincer", "sucker", "foot", "mouth", "sting", "wings", "gills"];

export const SHAPE_RU: Record<keyof Shape, string> = {
  torsos: "корпуса",
  limbs: "конечности",
  tails: "хвосты",
  heads: "головы",
  eyes: "глаза",
  hand: "кисти",
  claw: "когти",
  hoof: "копыта",
  pincer: "клешни",
  sucker: "присоски",
  foot: "стопы",
  mouth: "пасти",
  sting: "жала",
  wings: "крылья",
  gills: "жабры",
  cover: "покров",
};

// ---------------------------------------------------------------- the shape of a body

export interface Features extends Shape {
  /** Share of the segments under each cover, 0..1. */
  covers: Partial<Record<CoverId, number>>;
}

const LIMB_KINDS = new Set(["arm", "leg", "tentacle"]);
type EndingKey = "hand" | "claw" | "hoof" | "pincer" | "sucker" | "foot" | "mouth" | "sting";
const ENDING_KEYS: ReadonlySet<string> = new Set<EndingKey>(["hand", "claw", "hoof", "pincer", "sucker", "foot", "mouth", "sting"]);
const EYE_KINDS = new Set(["eye", "facetEye"]);

function countEyes(o: Organ): number {
  let n = EYE_KINDS.has(o.kind) ? 1 : 0;
  for (const c of o.contents ?? []) if (EYE_KINDS.has(c.kind)) n += 1;
  return n;
}

/** The shape of the body in the numbers the beasts are specified in. */
export function features(body: Body): Features {
  const degree = new Map<number, number[]>();
  for (const id of segmentIds(body)) {
    const s = body.segments[id]!;
    for (const n of [s.a, s.b]) {
      const list = degree.get(n);
      if (list === undefined) degree.set(n, [id]);
      else list.push(id);
    }
  }
  const f: Features = { torsos: 0, limbs: 0, tails: 0, heads: 0, eyes: 0, hand: 0, claw: 0, hoof: 0, pincer: 0, sucker: 0, foot: 0, mouth: 0, sting: 0, wings: 0, gills: 0, cover: "skin", covers: {} };
  const perCover: Partial<Record<CoverId, number>> = {};
  let segments = 0;
  for (const id of segmentIds(body)) {
    const s = body.segments[id]!;
    // A flank is a side node's link, no part with a cover of its own.
    if (s.kind === "flank") continue;
    segments += 1;
    perCover[s.cover] = (perCover[s.cover] ?? 0) + 1;
    if (s.kind === "torso") f.torsos += 1;
    for (const g of s.growths) if (g.kind === "gillCluster") f.gills += 1;
  }
  for (const id of sortedIds(body.nodes)) {
    const n = body.nodes[id]!;
    const holdsHead = n.ends.some((e) => e.kind === "head");
    const segs = degree.get(id) ?? [];
    if (segs.length === 1) {
      const kind = body.segments[segs[0]!]!.kind;
      if (LIMB_KINDS.has(kind) && !holdsHead) f.limbs += 1;
      if (kind === "tail") f.tails += 1;
    }
    for (const e of n.ends) {
      if (e.kind === "head") f.heads += 1;
      f.eyes += countEyes(e);
      if (ENDING_KEYS.has(e.kind)) f[e.kind as EndingKey] += 1;
    }
  }
  for (const id of sortedIds(body.membranes)) {
    const m = body.membranes[id]!;
    if (m.kind === "wing") f.wings += 1;
    if (m.kind === "gill") f.gills += 1;
  }
  let best: CoverId = "skin";
  let bestShare = -1;
  for (const [cover, n] of Object.entries(perCover) as [CoverId, number][]) {
    const share = segments > 0 ? n / segments : 0;
    f.covers[cover] = share;
    if (share > bestShare) {
      bestShare = share;
      best = cover;
    }
  }
  f.cover = best;
  return f;
}

// ---------------------------------------------------------------- similarity

/** A count is close enough within one, or a quarter of the target when that is more. */
export function tolerance(target: number): number {
  return Math.max(1, Math.ceil(target * 0.25));
}

/** The cover wanted must sit on at least this share of the segments. */
export const COVER_SHARE = 0.5;
/** A body with this share of the beast's traits is "almost" the beast. */
const LOOSE_SCORE = 0.75;

export interface Similarity {
  /** Keys off: the counts out of tolerance, and `cover` when the wanted cover is under half. */
  off: (keyof Shape)[];
  /** Every key within tolerance: the body is the beast. */
  strict: boolean;
  /** The traits that make the beast - the keys where it differs from the human - and how many of them the body has. */
  traits: { total: number; hit: number };
  /** hit / total over the traits: how much of the beast is there, whatever else grew. */
  score: number;
  /** Three quarters of the traits or more. */
  loose: boolean;
}

/** The keys where the beast differs from the human: what the abyss has to reach. */
export function traitsOf(want: Shape): (keyof Shape)[] {
  const out: (keyof Shape)[] = SHAPE_KEYS.filter((k) => want[k] !== HUMAN_SHAPE[k]);
  if (want.cover !== HUMAN_SHAPE.cover) out.push("cover");
  return out;
}

export const HUMAN_SHAPE: Shape = { torsos: 1, limbs: 4, tails: 0, heads: 1, eyes: 2, hand: 2, claw: 0, hoof: 0, pincer: 0, sucker: 0, foot: 2, mouth: 0, sting: 0, wings: 0, gills: 0, cover: "skin" };

export function similarity(want: Shape, have: Features): Similarity {
  const off: (keyof Shape)[] = [];
  for (const key of SHAPE_KEYS) if (Math.abs(have[key] - want[key]) > tolerance(want[key])) off.push(key);
  if ((have.covers[want.cover] ?? 0) < COVER_SHARE) off.push("cover");
  const traits = traitsOf(want);
  const hit = traits.filter((k) => !off.includes(k)).length;
  const score = traits.length === 0 ? 1 : hit / traits.length;
  return { off, strict: off.length === 0, traits: { total: traits.length, hit }, score, loose: score >= LOOSE_SCORE };
}

// ---------------------------------------------------------------- the fixture

export function fixtureBody(beast: Beast): Body {
  return bodyFromText(beast.fixture);
}
