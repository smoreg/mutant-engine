/**
 * The parts tab without the page: every kind of the model's tables (ORGANS,
 * SEGMENT_KINDS, COVERS, MEMBRANES) as an entry, read from the tables when
 * first asked for, never from a list of its own - a kind added to the model
 * shows up here by itself. For each: its drawing from mutant_view (or why it
 * has none), its fields, and the part put on a human through the catalog - the
 * rows that grow it, the carrier, what derive moves and what the knife takes.
 */
import {
  CATALOG,
  COVERS,
  LabRng,
  MEMBRANES,
  ORGANS,
  SEGMENT_KINDS,
  anatomy,
  applyMutation,
  cloneBody,
  derive,
  diffDerived,
  human,
  nodeHpMax,
  operationsFor,
  organ,
  organs,
  segmentHpMax,
  sortedIds,
  type Body,
  type CoverId,
  type DerivedChange,
  type Family,
  type Mutation,
  type OrganKind,
  type SegmentKind,
  type Substance,
} from "@mutant-engine/core";
import {
  ENDING_SPRITES,
  HEAD_SPRITES,
  RAMPS,
  S,
  TILES,
  VISUALS,
  fitFrame,
  frameSvg,
  limbKindOf,
  rampOf,
  segmentPixels,
  stampFor,
  type Ramp,
} from "@mutant-engine/view";
import { frameOf, maskFrame, tilePatch } from "./mask-frame.js";

/** Which table of the model an entry comes from. */
export type PartSource = "organ" | "segment" | "cover" | "membrane";
/** The categories of the gallery: ORGANS split into the endings (mounted at a tip) and the rest. */
export type PartTable = "endings" | "organs" | "segments" | "covers" | "membranes";
export const PART_TABLES: readonly PartTable[] = ["endings", "organs", "segments", "covers", "membranes"];

export type PartSprite =
  | { kind: "ending" | "head" | "spot" | "limb" | "torso" | "tile"; svg: string; own: boolean; as?: string }
  | { kind: "none"; why: "hidden" | "membrane" | "noTile"; reason?: string };

export interface PartEntry {
  /** `organ:pincer`, `segment:tail`, `cover:fur`, `membrane:wing`. */
  id: string;
  source: PartSource;
  kind: string;
  table: PartTable;
  ru: string;
  family?: Family;
  tags: string[];
  substance?: Substance;
  /** The row of the table as it stands, `ru` aside, and what the tab computes from it (hp). */
  fields: [string, unknown][];
  sprite: PartSprite;
}

export interface KnifeOp {
  verb: string;
  what: string;
}

export interface Seat {
  /** A human with the part: one grown by the catalog, or the human itself when it has one already; null when neither. */
  carrier: Body | null;
  /** The catalog row the carrier was grown with. */
  row?: string;
  /** The human has the part and no row grows another. */
  had: boolean;
  /** derive of the human against derive of the carrier. */
  delta: DerivedChange[];
  /** Rows of the catalog that grow the part: on a human, or that name it as the organ they place. */
  rows: string[];
  /** What the knife does to the part on the carrier. */
  knife: KnifeOp[];
}

export interface PartsFilter {
  table?: PartTable;
  family?: Family;
  tag?: string;
  substance?: Substance;
  q?: string;
  /** The entry whose card is open, by id. */
  open?: string;
}

// ---------------------------------------------------------------- entries

const PIXEL = 3;

function svgOfMask(m: Parameters<typeof maskFrame>[0], ramp: Ramp): string {
  return frameSvg(maskFrame(m, ramp), PIXEL);
}

function organSprite(kind: OrganKind): PartSprite {
  const ending = ENDING_SPRITES[kind];
  if (ending !== undefined) return { kind: "ending", svg: svgOfMask(ending.s.mask, RAMPS.skin), own: true };
  if (kind === "head") return { kind: "head", svg: svgOfMask(HEAD_SPRITES.human.front.mask, RAMPS.skin), own: true };
  const vis = VISUALS[kind];
  if (vis.hidden !== undefined || vis.stamp === "") return { kind: "none", why: "hidden", ...(vis.hidden === undefined ? {} : { reason: vis.hidden }) };
  const st = stampFor(vis.stamp, 12);
  return { kind: "spot", svg: svgOfMask({ w: st.size, h: st.size, rows: st.rows }, RAMPS[rampOf(kind, "skin")]), own: true };
}

function segmentSprite(kind: SegmentKind): PartSprite {
  const girth = kind === "torso" ? 3 : 1;
  const limb = limbKindOf(kind, girth);
  const sheet = segmentPixels(kind, girth, "skin", S, kind === "torso" ? 60 : 44);
  const svg = frameSvg(fitFrame(frameOf(sheet), 64), 2);
  const own = limb === kind;
  return { kind: limb === "torso" || limb === "belly" ? "torso" : "limb", svg, own, ...(own ? {} : { as: limb }) };
}

function coverSprite(kind: CoverId): PartSprite {
  const tile = (TILES as Partial<Record<string, (typeof TILES)[keyof typeof TILES]>>)[kind];
  if (tile === undefined) return { kind: "none", why: "noTile" };
  return { kind: "tile", svg: svgOfMask(tilePatch(tile), RAMPS[kind] ?? RAMPS.bio), own: true };
}

function fieldsOf(spec: object): [string, unknown][] {
  return Object.entries(spec).filter(([k]) => k !== "ru");
}

let entries: PartEntry[] | null = null;

/** Every kind of every table, in table order; built once. */
export function partEntries(): PartEntry[] {
  if (entries !== null) return entries;
  const out: PartEntry[] = [];
  for (const [k, s] of Object.entries(ORGANS) as [OrganKind, (typeof ORGANS)[OrganKind]][]) {
    const fields = fieldsOf(s);
    if (s.mounts.includes("end")) fields.push(["hpNode", nodeHpMax(1, [organ(k)])]);
    out.push({
      id: `organ:${k}`,
      source: "organ",
      kind: k,
      table: s.mounts.includes("end") ? "endings" : "organs",
      ru: s.ru,
      ...(s.family === undefined ? {} : { family: s.family }),
      tags: [...(s.tags ?? [])],
      substance: s.substance,
      fields,
      sprite: organSprite(k),
    });
  }
  for (const [k, s] of Object.entries(SEGMENT_KINDS) as [SegmentKind, (typeof SEGMENT_KINDS)[SegmentKind]][]) {
    out.push({ id: `segment:${k}`, source: "segment", kind: k, table: "segments", ru: s.ru, tags: [], fields: [...fieldsOf(s), ["hpSegment", segmentHpMax(1, 1, k)]], sprite: segmentSprite(k) });
  }
  for (const [k, s] of Object.entries(COVERS) as [CoverId, (typeof COVERS)[CoverId]][]) {
    out.push({ id: `cover:${k}`, source: "cover", kind: k, table: "covers", ru: s.ru, tags: [], fields: fieldsOf(s), sprite: coverSprite(k) });
  }
  for (const [k, s] of Object.entries(MEMBRANES)) {
    out.push({ id: `membrane:${k}`, source: "membrane", kind: k, table: "membranes", ru: s.ru, family: s.family, tags: [], fields: fieldsOf(s), sprite: { kind: "none", why: "membrane" } });
  }
  entries = out;
  return out;
}

export function partById(id: string): PartEntry | undefined {
  return partEntries().find((e) => e.id === id);
}

/** Every tag the organs carry, in the order they first appear. */
export function partTags(): string[] {
  return [...new Set(partEntries().flatMap((e) => e.tags))];
}

// ---------------------------------------------------------------- a part on a human

/** How many of each part a body has, by entry id. */
function inventory(body: Body): Map<string, number> {
  const out = new Map<string, number>();
  const add = (id: string): void => void out.set(id, (out.get(id) ?? 0) + 1);
  for (const o of organs(body)) add(`organ:${o.kind}`);
  for (const id of sortedIds(body.segments)) {
    const s = body.segments[id]!;
    add(`segment:${s.kind}`);
    add(`cover:${s.cover}`);
  }
  for (const id of sortedIds(body.membranes)) add(`membrane:${body.membranes[id]!.kind}`);
  return out;
}

interface Grown {
  body: Body;
  /** How much the inventory moved: the smaller, the more the row is about the part alone. */
  spread: number;
}

interface Catalogued {
  human: Body;
  had: Map<string, number>;
  /** Entry id -> rows that grow more of it on a human, with the body each grew. */
  grown: Map<string, { row: string; g: Grown }[]>;
  /** Entry id -> rows whose payload names the organ they place. */
  named: Map<string, string[]>;
}

let catalogued: Catalogued | null = null;

/** Every row of the catalog once on a human, by its own seed: what it grew. */
function catalog(): Catalogued {
  if (catalogued !== null) return catalogued;
  const base = human();
  const had = inventory(base);
  const grown = new Map<string, { row: string; g: Grown }[]>();
  const named = new Map<string, string[]>();
  for (const m of CATALOG) {
    const kind = namedOrgan(m);
    if (kind !== null) named.set(`organ:${kind}`, [...(named.get(`organ:${kind}`) ?? []), m.id]);
    const body = cloneBody(base);
    const r = applyMutation(body, m, new LabRng(`parts:${m.id}`));
    if (r === null || r.fallback) continue;
    const now = inventory(body);
    const keys = new Set([...now.keys(), ...had.keys()]);
    let spread = 0;
    for (const k of keys) spread += Math.abs((now.get(k) ?? 0) - (had.get(k) ?? 0));
    for (const [k, n] of now) if (n > (had.get(k) ?? 0)) grown.set(k, [...(grown.get(k) ?? []), { row: m.id, g: { body, spread } }]);
  }
  catalogued = { human: base, had, grown, named };
  return catalogued;
}

function namedOrgan(m: Mutation): string | null {
  if (m.op !== "organ") return null;
  const p = m.payload as { organ?: { kind?: unknown } };
  return typeof p.organ?.kind === "string" ? p.organ.kind : null;
}

function knifeOf(body: Body, e: PartEntry): KnifeOp[] {
  const out: KnifeOp[] = [];
  for (const part of anatomy(body)) {
    const ops = operationsFor(body, part);
    if (e.source === "organ") {
      for (const o of part.organs) {
        if (o.organ.kind !== e.kind) continue;
        for (const op of ops) if (op.command === o.excise) out.push({ verb: op.verb, what: op.what });
      }
      continue;
    }
    const seg = part.segment === null ? undefined : body.segments[part.segment];
    if (seg === undefined) continue;
    for (const op of ops) {
      const fits =
        (e.source === "segment" && seg.kind === e.kind && (op.kind === "remove" || op.kind === "amputate")) ||
        (e.source === "cover" && seg.cover === e.kind && op.kind === "uncover") ||
        (e.source === "membrane" && op.kind === "membrane" && op.command.t === "reshape" && op.command.r.t === "membrane" && body.membranes[op.command.r.membrane]?.kind === e.kind);
      if (fits) out.push({ verb: op.verb, what: op.what });
    }
  }
  // The same cut on twin parts reads once.
  const seen = new Set<string>();
  return out.filter((k) => {
    const key = `${k.verb}|${k.what.replace(/ \d+/g, "")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const seats = new Map<string, Seat>();

/** The part on a human: the carrier, the delta of derive, the rows that grow it, the knife. */
export function seatPart(e: PartEntry): Seat {
  const hit = seats.get(e.id);
  if (hit !== undefined) return hit;
  const c = catalog();
  const growers = c.grown.get(e.id) ?? [];
  const rows = [...new Set([...growers.map((x) => x.row), ...(c.named.get(e.id) ?? [])])];
  const best = growers.reduce<{ row: string; g: Grown } | null>((a, b) => (a === null || b.g.spread < a.g.spread ? b : a), null);
  const had = best === null && (c.had.get(e.id) ?? 0) > 0;
  const carrier = best !== null ? best.g.body : had ? c.human : null;
  const seat: Seat = {
    carrier,
    ...(best === null ? {} : { row: best.row }),
    had,
    delta: carrier === null ? [] : diffDerived(derive(c.human), derive(carrier)),
    rows,
    knife: carrier === null ? [] : knifeOf(carrier, e),
  };
  seats.set(e.id, seat);
  return seat;
}

// ---------------------------------------------------------------- filters

type Facet = "table" | "family" | "tag" | "substance" | "q";

function matches(e: PartEntry, f: PartsFilter, skip?: Facet): boolean {
  if (skip !== "table" && f.table !== undefined && e.table !== f.table) return false;
  if (skip !== "family" && f.family !== undefined && e.family !== f.family) return false;
  if (skip !== "tag" && f.tag !== undefined && !e.tags.includes(f.tag)) return false;
  if (skip !== "substance" && f.substance !== undefined && e.substance !== f.substance) return false;
  if (skip !== "q" && f.q !== undefined && f.q.trim() !== "") {
    const q = f.q.trim().toLowerCase();
    if (!e.ru.toLowerCase().includes(q) && !e.kind.toLowerCase().includes(q)) return false;
  }
  return true;
}

export function filterParts(list: readonly PartEntry[], f: PartsFilter): PartEntry[] {
  return list.filter((e) => matches(e, f));
}

export interface FacetCounts {
  table: Record<PartTable, number>;
  family: Partial<Record<Family, number>>;
  tag: Record<string, number>;
  substance: Partial<Record<Substance, number>>;
}

/** What each chip would show: the entries it keeps under every other filter but its own. */
export function facetCounts(list: readonly PartEntry[], f: PartsFilter): FacetCounts {
  const out: FacetCounts = { table: { endings: 0, organs: 0, segments: 0, covers: 0, membranes: 0 }, family: {}, tag: {}, substance: {} };
  for (const e of list) {
    if (matches(e, f, "table")) out.table[e.table] += 1;
    if (e.family !== undefined && matches(e, f, "family")) out.family[e.family] = (out.family[e.family] ?? 0) + 1;
    if (matches(e, f, "tag")) for (const t of e.tags) out.tag[t] = (out.tag[t] ?? 0) + 1;
    if (e.substance !== undefined && matches(e, f, "substance")) out.substance[e.substance] = (out.substance[e.substance] ?? 0) + 1;
  }
  return out;
}
