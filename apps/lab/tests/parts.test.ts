/**
 * The parts tab: a gallery of every kind the model's tables know, built from
 * the tables at run time. Every test walks the tables themselves, never a
 * list of its own, so a kind added to `parts.ts` is checked the day it lands.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CATALOG,
  COVERS,
  FAMILIES,
  MEMBRANES,
  ORGANS,
  SEGMENT_KINDS,
  derive,
  diffDerived,
  human,
  initialState,
  isFlesh,
  organs,
  sortedIds,
  validate,
  type Body,
  type OrganKind,
} from "@mutant-engine/core";
import { ENDING_SPRITES, TILES } from "@mutant-engine/view";
import { TABS, decode, encode } from "../hash.js";
import { PART_TABLES, facetCounts, filterParts, partEntries, seatPart, type PartEntry } from "../parts.js";
import { partsGridHtml, partDetailHtml, partsFiltersHtml } from "../parts-page.js";
import { FIELD_RU, FLAG_RU, MOUNT_RU, PARTS_TEXT, TAG_RU } from "../parts-text.js";

/** Every kind of every table of the model, read from the tables. */
function tableIds(): string[] {
  return [
    ...Object.keys(ORGANS).map((k) => `organ:${k}`),
    ...Object.keys(SEGMENT_KINDS).map((k) => `segment:${k}`),
    ...Object.keys(COVERS).map((k) => `cover:${k}`),
    ...Object.keys(MEMBRANES).map((k) => `membrane:${k}`),
  ];
}

function byId(id: string): PartEntry {
  const e = partEntries().find((x) => x.id === id);
  if (e === undefined) throw new Error(`no entry ${id}`);
  return e;
}

function has(body: Body, e: PartEntry): number {
  let n = 0;
  if (e.source === "organ") for (const o of organs(body)) n += o.kind === e.kind ? 1 : 0;
  for (const id of sortedIds(body.segments)) {
    const s = body.segments[id]!;
    if (e.source === "segment" && s.kind === e.kind) n += 1;
    if (e.source === "cover" && s.cover === e.kind) n += 1;
  }
  if (e.source === "membrane") for (const id of sortedIds(body.membranes)) n += body.membranes[id]!.kind === e.kind ? 1 : 0;
  return n;
}

describe("the gallery is the tables", () => {
  it("every kind of every table has exactly one entry, and nothing else does", () => {
    const ids = partEntries().map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(tableIds().sort());
  });

  it("the page draws a card for every kind of every table", () => {
    const html = partsGridHtml(partEntries(), {});
    for (const id of tableIds()) expect(html, id).toContain(`data-part="${id}"`);
  });

  it("an entry's name is its table's own word, and its table is where the kind sits", () => {
    for (const [k, s] of Object.entries(ORGANS)) {
      const e = byId(`organ:${k}`);
      expect(e.ru).toBe(s.ru);
      expect(e.table).toBe(s.mounts.includes("end") ? "endings" : "organs");
      expect(e.substance).toBe(s.substance);
      expect(e.family).toBe(s.family);
      expect(e.tags).toEqual(s.tags ?? []);
    }
    for (const [k, s] of Object.entries(SEGMENT_KINDS)) expect(byId(`segment:${k}`)).toMatchObject({ ru: s.ru, table: "segments" });
    for (const [k, s] of Object.entries(COVERS)) expect(byId(`cover:${k}`)).toMatchObject({ ru: s.ru, table: "covers" });
    for (const [k, s] of Object.entries(MEMBRANES)) expect(byId(`membrane:${k}`)).toMatchObject({ ru: s.ru, table: "membranes", family: s.family });
  });

  it("every field, tag, flag and mount of the tables has a Russian word on the page", () => {
    const specs: object[] = [...Object.values(ORGANS), ...Object.values(SEGMENT_KINDS), ...Object.values(COVERS), ...Object.values(MEMBRANES)];
    for (const s of specs) {
      for (const [key, value] of Object.entries(s)) {
        if (key === "ru") continue;
        expect(FIELD_RU[key], key).toBeDefined();
        if (value !== null && typeof value === "object" && !Array.isArray(value)) for (const sub of Object.keys(value)) expect(FIELD_RU[sub], `${key}.${sub}`).toBeDefined();
      }
      const spec = s as { tags?: string[]; flags?: string[]; mounts?: string[] };
      for (const t of spec.tags ?? []) expect(TAG_RU[t], t).toBeDefined();
      for (const f of spec.flags ?? []) expect(FLAG_RU[f], f).toBeDefined();
      for (const m of spec.mounts ?? []) expect(MOUNT_RU[m], m).toBeDefined();
    }
  });
});

describe("the picture of a part", () => {
  it("a kind with a drawing of its own shows it; one without says so", () => {
    for (const e of partEntries()) {
      if (e.source === "organ" && ENDING_SPRITES[e.kind as OrganKind] !== undefined) expect(e.sprite).toMatchObject({ kind: "ending", own: true });
      if (e.source === "cover" && e.kind in TILES) expect(e.sprite).toMatchObject({ kind: "tile", own: true });
      if (e.source === "membrane") expect(e.sprite.kind).toBe("none");
      if (e.sprite.kind !== "none") expect(e.sprite.svg).toMatch(/^<svg/);
      const card = partsGridHtml([e], {});
      if (e.sprite.kind === "none" || !e.sprite.own) expect(card, e.id).toContain(PARTS_TEXT.noSprite);
      else expect(card, e.id).not.toContain(PARTS_TEXT.noSprite);
    }
  });
});

describe("a part on a human", () => {
  it("the carrier is a valid human with the part, and the delta is derive against the human", () => {
    const base = derive(human());
    let seated = 0;
    let moved = 0;
    for (const e of partEntries()) {
      const s = seatPart(e);
      if (s.carrier === null) continue;
      seated += 1;
      expect(validate(s.carrier), e.id).toEqual([]);
      expect(has(s.carrier, e), e.id).toBeGreaterThan(0);
      expect(s.delta).toEqual(diffDerived(base, derive(s.carrier)));
      if (s.had) expect(s.carrier).toEqual(human());
      else expect(has(s.carrier, e), e.id).toBeGreaterThan(has(human(), e));
      if (s.delta.length > 0) moved += 1;
    }
    expect(seated).toBeGreaterThan(partEntries().length * 0.8);
    expect(moved).toBeGreaterThan(partEntries().length / 2);
  });

  it("the rows that grow a part are rows of the catalog, and an organ row names its organ", () => {
    const ids = new Set(CATALOG.map((m) => m.id));
    for (const e of partEntries()) for (const r of seatPart(e).rows) expect(ids.has(r), `${e.id} ${r}`).toBe(true);
    for (const m of CATALOG) {
      if (m.op !== "organ") continue;
      const kind = (m.payload as { organ: { kind: string } }).organ.kind;
      expect(seatPart(byId(`organ:${kind}`)).rows, `${m.id} -> ${kind}`).toContain(m.id);
    }
  });

  it("the knife takes flesh and finds nothing in a trait", () => {
    let cut = 0;
    for (const e of partEntries()) {
      const s = seatPart(e);
      if (e.source === "organ" && !isFlesh(e.kind as OrganKind)) expect(s.knife, e.id).toEqual([]);
      if (s.knife.length > 0) cut += 1;
    }
    expect(cut).toBeGreaterThan(partEntries().length / 2);
    expect(seatPart(byId("organ:pincer")).knife.length).toBeGreaterThan(0);
  });

  it("the card of a part shows its fields, its delta, its rows and the knife", () => {
    const e = byId("organ:pincer");
    const html = partDetailHtml(e);
    expect(html).toContain(e.ru);
    expect(html).toContain(FIELD_RU.mass!);
    expect(html).toContain(PARTS_TEXT.delta);
    expect(html).toContain(PARTS_TEXT.rows);
    expect(html).toContain(PARTS_TEXT.knife);
  });
});

describe("categories", () => {
  it("the table filter splits the gallery, and the counts add up", () => {
    const all = partEntries();
    const counts = facetCounts(all, {});
    let sum = 0;
    for (const t of PART_TABLES) {
      const list = filterParts(all, { table: t });
      expect(list.every((e) => e.table === t)).toBe(true);
      expect(counts.table[t]).toBe(list.length);
      sum += list.length;
    }
    expect(sum).toBe(all.length);
  });

  it("family, tag, substance and search narrow, and each count is what the chip would show", () => {
    const all = partEntries();
    for (const f of FAMILIES) {
      const list = filterParts(all, { family: f });
      expect(list.every((e) => e.family === f)).toBe(true);
      expect(facetCounts(all, {}).family[f] ?? 0).toBe(list.length);
    }
    const weapons = filterParts(all, { tag: "weapon" });
    expect(weapons.length).toBeGreaterThan(0);
    expect(weapons.every((e) => e.tags.includes("weapon"))).toBe(true);
    const traits = filterParts(all, { substance: "trait" });
    expect(traits.every((e) => e.substance === "trait")).toBe(true);
    expect(filterParts(all, { q: "клеш" }).map((e) => e.id)).toContain("organ:pincer");
    expect(filterParts(all, { q: "PINCER" }).map((e) => e.id)).toContain("organ:pincer");
    // A facet counts under the other filters, not its own.
    const limbsEndings = filterParts(all, { table: "endings", family: "limbs" }).length;
    expect(facetCounts(all, { table: "endings", family: "senses" }).family.limbs).toBe(limbsEndings);
  });

  it("the filter bar names every table, family and tag with its count", () => {
    const html = partsFiltersHtml(partEntries(), {});
    for (const t of PART_TABLES) expect(html).toContain(`data-pf-table="${t}"`);
    for (const e of partEntries()) for (const t of e.tags) expect(html).toContain(`data-pf-tag="${t}"`);
    for (const f of new Set(partEntries().flatMap((e) => (e.family === undefined ? [] : [e.family])))) expect(html).toContain(`data-pf-family="${f}"`);
  });
});

describe("the tab in the hash", () => {
  it("parts is a tab, and its filter and open card go through the hash", () => {
    expect(TABS).toContain("parts");
    const view = { tab: "parts" as const, parts: { table: "endings" as const, family: "limbs" as const, tag: "weapon", substance: "flesh" as const, q: "клешня & co", open: "organ:pincer" } };
    const back = decode(`#${encode(initialState(), view)}`);
    expect(back.view).toEqual(view);
  });

  it("a broken filter is dropped, not guessed", () => {
    const back = decode("#s=1&tab=parts&pgt=nope&pgf=nofamily&pgs=stone&pgo=organ:nothing&pgg=weapon");
    expect(back.view).toEqual({ tab: "parts", parts: { tag: "weapon" } });
  });

  it("every tab has its button and its page in the studio", () => {
    const html = readFileSync(join(import.meta.dirname, "..", "index.html"), "utf8");
    for (const t of TABS) {
      expect(html, t).toContain(`data-tab="${t}"`);
      expect(html, t).toContain(`id="page-${t}"`);
    }
  });
});
