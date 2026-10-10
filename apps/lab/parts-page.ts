/**
 * The parts tab: a gallery of every kind the model's tables know, grouped by
 * table, filtered by table, family, tag and substance and searched by name,
 * each card with its drawing, its numbers and what it does to a human. The
 * list is `parts.ts` over the tables; the filter and the open card live in the
 * #hash. The html is built by pure functions; only `buildParts` and
 * `showParts` touch the DOM.
 */
import { FAMILY_RU, SUMMARY_RU, fmt, mutationRu, type Family, type LabState, type SummaryValue } from "@mutant-engine/core";
import { lazyPictures, pictureEl } from "@mutant-engine/view";
import { PART_TABLES, facetCounts, filterParts, partById, partEntries, partTags, seatPart, type PartEntry, type PartSprite, type PartTable, type PartsFilter } from "./parts.js";
import { FIELD_RU, FLAG_RU, MOUNT_RU, PARTS_TEXT, SPRITE_RU, SUBSTANCE_RU, TABLE_RU, TAG_RU, YES_NO } from "./parts-text.js";
import { textStart } from "./zoo.js";

interface PartsHost {
  filter(): PartsFilter;
  setFilter(f: PartsFilter): void;
  labSeed(): number;
  openInLab(state: LabState): void;
}

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const word = (table: Record<string, string>, key: string): string => table[key] ?? key;

// ---------------------------------------------------------------- values

function valueRu(key: string, v: unknown): string {
  if (Array.isArray(v)) {
    if (v.length === 0) return "—";
    const table = key === "mounts" ? MOUNT_RU : key === "tags" ? TAG_RU : key === "flags" ? FLAG_RU : {};
    return v.map((x) => word(table, String(x))).join(", ");
  }
  if (key === "family") return FAMILY_RU[v as Family] ?? String(v);
  if (key === "substance") return word(SUBSTANCE_RU, String(v));
  if (typeof v === "boolean") return v ? YES_NO.yes : YES_NO.no;
  if (typeof v === "number") return v === Infinity ? "∞" : fmt(v);
  if (typeof v === "string") return v === "" ? "—" : v;
  if (v !== null && typeof v === "object") return Object.entries(v).map(([k, x]) => `${word(FIELD_RU, k)} ${valueRu(k, x)}`).join(" · ");
  return String(v);
}

function summaryRu(v: SummaryValue): string {
  return fmt(v);
}

/** The field a card shows first: what the part weighs, however its table says it. */
function massLine(e: PartEntry): string {
  for (const key of ["mass", "massPer", "massFactor"]) {
    const f = e.fields.find(([k]) => k === key);
    if (f !== undefined) return `${word(FIELD_RU, key)} ${valueRu(key, f[1])}`;
  }
  return "";
}

// ---------------------------------------------------------------- the filter bar

function chip(attr: string, value: string, label: string, count: number | null, on: boolean): string {
  const n = count === null ? "" : ` <span class="n">${count}</span>`;
  return `<button type="button" class="chip${on ? " on" : ""}${count === 0 ? " zero" : ""}" data-${attr}="${esc(value)}" aria-pressed="${on}">${esc(label)}${n}</button>`;
}

function group(title: string, chips: string[]): string {
  return `<div class="pf-group"><span class="cap">${esc(title)}</span><div class="chips">${chips.join("")}</div></div>`;
}

/** The chips of every facet, each with the count it would leave under the other filters. */
export function partsFiltersHtml(list: readonly PartEntry[], f: PartsFilter): string {
  const c = facetCounts(list, f);
  const total = (r: Partial<Record<string, number>>): number => Object.values(r).reduce<number>((a, b) => a + (b ?? 0), 0);
  const tables = [chip("pf-table", "", PARTS_TEXT.all, total(c.table), f.table === undefined), ...PART_TABLES.map((t) => chip("pf-table", t, TABLE_RU[t], c.table[t], f.table === t))];
  const subst = [chip("pf-substance", "", PARTS_TEXT.all, null, f.substance === undefined), ...(["flesh", "trait"] as const).map((s) => chip("pf-substance", s, word(SUBSTANCE_RU, s), c.substance[s] ?? 0, f.substance === s))];
  const families = [...new Set(list.flatMap((e) => (e.family === undefined ? [] : [e.family])))];
  const fam = [chip("pf-family", "", PARTS_TEXT.all, null, f.family === undefined), ...families.map((x) => chip("pf-family", x, FAMILY_RU[x] ?? x, c.family[x] ?? 0, f.family === x))];
  const tags = [chip("pf-tag", "", PARTS_TEXT.all, null, f.tag === undefined), ...[...new Set(list.flatMap((e) => e.tags))].map((t) => chip("pf-tag", t, word(TAG_RU, t), c.tag[t] ?? 0, f.tag === t))];
  const shown = filterParts(list, f).length;
  const any = f.table !== undefined || f.family !== undefined || f.tag !== undefined || f.substance !== undefined || (f.q ?? "") !== "";
  const summary = `<div class="pf-summary"><span class="faint">${esc(PARTS_TEXT.shown)} <b class="mono">${shown}</b> ${esc(PARTS_TEXT.of)} <span class="mono">${list.length}</span></span>${any ? `<button type="button" class="btn small" data-pf-reset="1">${esc(PARTS_TEXT.reset)}</button>` : ""}</div>`;
  return `${summary}${group(PARTS_TEXT.table, tables)}${group(PARTS_TEXT.substance, subst)}${group(PARTS_TEXT.family, fam)}${group(PARTS_TEXT.tag, tags)}`;
}

// ---------------------------------------------------------------- cards

function spriteHtml(s: PartSprite): string {
  if (s.kind === "none") return `<span class="nosprite">${esc(PARTS_TEXT.noSprite)}</span>`;
  const note = s.own ? "" : `<span class="nosprite small">${esc(PARTS_TEXT.noSprite)} · ${esc(PARTS_TEXT.drawnAs)} ${esc(s.as ?? "")}</span>`;
  return `${s.svg}${note}`;
}

function tagsHtml(e: PartEntry): string {
  const out = [`<span class="tag">${esc(TABLE_RU[e.table])}</span>`];
  if (e.family !== undefined) out.push(`<span class="tag">${esc(FAMILY_RU[e.family] ?? e.family)}</span>`);
  if (e.substance !== undefined) out.push(`<span class="tag${e.substance === "flesh" ? " flesh" : " trait"}">${esc(word(SUBSTANCE_RU, e.substance))}</span>`);
  for (const t of e.tags) out.push(`<span class="tag">${esc(word(TAG_RU, t))}</span>`);
  return out.join("");
}

/** At most three moves of derive, as a card has room for. */
function deltaChips(e: PartEntry): string {
  const s = seatPart(e);
  if (s.carrier === null) return `<div class="pd-line faint">${esc(PARTS_TEXT.noCarrier)}</div>`;
  if (s.delta.length === 0) return `<div class="pd-line faint">${esc(s.had ? PARTS_TEXT.carrierHad : PARTS_TEXT.noDelta)}</div>`;
  // Alienness first: what the part adds to it is the one number every part has (decision 1254).
  const delta = [...s.delta].sort((a, b) => Number(b.key === "alien") - Number(a.key === "alien"));
  const shown = delta.slice(0, 3).map((d) => `<span class="pd-chip"><span class="k">${esc(word(SUMMARY_RU, d.key))}</span> <span class="mono">${esc(summaryRu(d.before))}→${esc(summaryRu(d.after))}</span></span>`);
  const more = s.delta.length > 3 ? `<span class="faint small">+${s.delta.length - 3}</span>` : "";
  return `<div class="pd-line">${shown.join("")}${more}</div>`;
}

function card(e: PartEntry, open: string | undefined): string {
  const carrier = seatPart(e).carrier === null ? "" : `<div class="pc-carrier" data-carrier="${e.id}"></div>`;
  return `<article class="card-gen part-card${e.id === open ? " on" : ""}" data-part="${e.id}" tabindex="0">
<div class="pc-pics"><div class="pc-sprite">${spriteHtml(e.sprite)}</div>${carrier}</div>
<div class="name">${esc(e.ru)}</div>
<div class="meta mono faint">${esc(e.kind)}${massLine(e) === "" ? "" : ` · ${esc(massLine(e))}`}</div>
<div class="pc-tags">${tagsHtml(e)}</div>
${deltaChips(e)}
</article>`;
}

/** The gallery under a filter, grouped by table, each group with its count. */
export function partsGridHtml(list: readonly PartEntry[], f: PartsFilter): string {
  const shown = filterParts(list, f);
  if (shown.length === 0) return `<p class="faint">${esc(PARTS_TEXT.empty)}</p>`;
  const out: string[] = [];
  for (const t of PART_TABLES) {
    const inT = shown.filter((e) => e.table === t);
    if (inT.length === 0) continue;
    out.push(`<div class="cap">${esc(TABLE_RU[t])} · ${inT.length}</div><div class="grid parts-grid">${inT.map((e) => card(e, f.open)).join("")}</div>`);
  }
  return out.join("");
}

// ---------------------------------------------------------------- the open card

function kv(k: string, v: string, cls = ""): string {
  return `<div class="kv${cls}"><span class="k">${esc(k)}</span><span class="v mono">${esc(v)}</span></div>`;
}

/** Everything about one part: its fields, the human with it, what derive moves, the rows, the knife. */
export function partDetailHtml(e: PartEntry): string {
  const s = seatPart(e);
  const out: string[] = [];
  out.push(`<div class="pd-head"><h2>${esc(e.ru)}</h2><button type="button" class="btn small" data-pf-close="1" title="${esc(PARTS_TEXT.close)}">✕</button></div>`);
  out.push(`<div class="meta mono faint">${esc(e.id)}</div><div class="pc-tags">${tagsHtml(e)}</div>`);
  const spriteKind = SPRITE_RU[e.sprite.kind] ?? e.sprite.kind;
  const why = e.sprite.kind === "none" && e.sprite.reason !== undefined ? `<div class="faint small">${esc(e.sprite.reason)}</div>` : "";
  out.push(`<div class="pd-pics"><figure class="fig"><figcaption>${esc(PARTS_TEXT.sprite)} · ${esc(spriteKind)}</figcaption><div class="pc-sprite big">${spriteHtml(e.sprite)}</div>${why}</figure>`);
  if (s.carrier !== null) {
    const via = s.row === undefined ? PARTS_TEXT.carrierHad : `${PARTS_TEXT.viaRow} ${mutationRu(s.row)}`;
    out.push(`<figure class="fig"><figcaption>${esc(PARTS_TEXT.carrier)}</figcaption><div class="pic-slot" data-carrier-big="${e.id}"></div><div class="faint small">${esc(via)}</div><button type="button" class="btn small" data-pf-lab="1">${esc(PARTS_TEXT.openLab)}</button></figure>`);
  } else out.push(`<p class="faint small">${esc(PARTS_TEXT.noCarrier)}</p>`);
  out.push(`</div>`);
  out.push(`<div class="sec"><div class="cap">${esc(PARTS_TEXT.fields)}</div>${e.fields.map(([k, v]) => kv(word(FIELD_RU, k), valueRu(k, v))).join("")}</div>`);
  const delta = s.carrier === null ? `<p class="faint small">${esc(PARTS_TEXT.noCarrier)}</p>` : s.delta.length === 0 ? `<p class="faint small">${esc(s.had ? PARTS_TEXT.carrierHad : PARTS_TEXT.noDelta)}</p>` : s.delta.map((d) => `<div class="kv moved"><span class="k">${esc(word(SUMMARY_RU, d.key))}</span><span class="v mono"><span class="was">${esc(summaryRu(d.before))}</span> → ${esc(summaryRu(d.after))}</span></div>`).join("");
  out.push(`<div class="sec"><div class="cap">${esc(PARTS_TEXT.delta)}</div>${delta}</div>`);
  const rows = s.rows.length === 0 ? `<p class="faint small">${esc(PARTS_TEXT.noRows)}</p>` : `<ul class="notes">${s.rows.map((r) => `<li>${esc(mutationRu(r))} <span class="mono faint small">${esc(r)}</span></li>`).join("")}</ul>`;
  out.push(`<div class="sec"><div class="cap">${esc(PARTS_TEXT.rows)} · ${s.rows.length}</div>${rows}</div>`);
  const knife =
    e.substance === "trait"
      ? `<p class="faint small">${esc(PARTS_TEXT.traitKnife)}</p>`
      : s.knife.length === 0
        ? `<p class="faint small">${esc(PARTS_TEXT.noKnife)}</p>`
        : `<ul class="notes">${s.knife.map((k) => `<li>${esc(k.verb)} · <span class="faint">${esc(k.what)}</span></li>`).join("")}</ul>`;
  out.push(`<div class="sec"><div class="cap">${esc(PARTS_TEXT.knife)}</div>${knife}</div>`);
  return out.join("");
}

// ---------------------------------------------------------------- DOM

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`no #${id}`);
  return el;
}

function without<K extends keyof PartsFilter>(f: PartsFilter, key: K, value: PartsFilter[K] | undefined): PartsFilter {
  const next = { ...f };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}

export function buildParts(host: PartsHost): void {
  $("parts-search").setAttribute("placeholder", PARTS_TEXT.search);
  $("parts-search").addEventListener("input", (e) => {
    const q = (e.target as HTMLInputElement).value;
    host.setFilter(without(host.filter(), "q", q === "" ? undefined : q));
    renderChips(host);
    renderGrid(host);
  });
  $("parts-chips").addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest("[data-pf-reset]") !== null) {
      const open = host.filter().open;
      host.setFilter(open === undefined ? {} : { open });
      ($("parts-search") as HTMLInputElement).value = "";
      showParts(host);
      return;
    }
    const b = t.closest<HTMLElement>("[data-pf-table],[data-pf-family],[data-pf-tag],[data-pf-substance]");
    if (b === null) return;
    const f = host.filter();
    const pick = (v: string | undefined, now: string | undefined): string | undefined => (v === "" || v === now ? undefined : v);
    if (b.dataset.pfTable !== undefined) host.setFilter(without(f, "table", pick(b.dataset.pfTable, f.table) as PartTable | undefined));
    else if (b.dataset.pfFamily !== undefined) host.setFilter(without(f, "family", pick(b.dataset.pfFamily, f.family) as Family | undefined));
    else if (b.dataset.pfTag !== undefined) host.setFilter(without(f, "tag", pick(b.dataset.pfTag, f.tag)));
    else if (b.dataset.pfSubstance !== undefined) host.setFilter(without(f, "substance", pick(b.dataset.pfSubstance, f.substance) as PartsFilter["substance"]));
    renderChips(host);
    renderGrid(host);
  });
  const open = (el: HTMLElement): void => {
    const c = el.closest<HTMLElement>("[data-part]");
    if (c === null) return;
    host.setFilter(without(host.filter(), "open", c.dataset.part));
    renderGrid(host);
    renderDetail(host);
    if (window.matchMedia("(max-width: 900px)").matches) $("parts-detail").scrollIntoView({ block: "start" });
  };
  $("parts-grid").addEventListener("click", (e) => open(e.target as HTMLElement));
  $("parts-grid").addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open(e.target as HTMLElement);
    }
  });
  $("parts-detail").addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest("[data-pf-close]") !== null) {
      host.setFilter(without(host.filter(), "open", undefined));
      renderGrid(host);
      renderDetail(host);
      return;
    }
    if (t.closest("[data-pf-lab]") !== null) {
      const id = host.filter().open;
      const e2 = id === undefined ? undefined : partById(id);
      const carrier = e2 === undefined ? null : seatPart(e2).carrier;
      if (carrier !== null) host.openInLab({ seed: host.labSeed(), start: textStart(carrier), commands: [], spread: true });
    }
  });
}

function renderChips(host: PartsHost): void {
  $("parts-chips").innerHTML = partsFiltersHtml(partEntries(), host.filter());
}

function renderGrid(host: PartsHost): void {
  const grid = $("parts-grid");
  grid.innerHTML = partsGridHtml(partEntries(), host.filter());
  const lazy = lazyPictures();
  for (const slot of grid.querySelectorAll<HTMLElement>("[data-carrier]")) {
    const e = partById(slot.dataset.carrier!);
    const body = e === undefined ? null : seatPart(e).carrier;
    if (body !== null) lazy(slot, () => pictureEl(body, "sprite", host.labSeed(), 72));
  }
}

function renderDetail(host: PartsHost): void {
  const id = host.filter().open;
  const e = id === undefined ? undefined : partById(id);
  const box = $("parts-detail");
  box.classList.toggle("open", e !== undefined);
  if (e === undefined) {
    box.innerHTML = `<p class="faint">${esc(PARTS_TEXT.pick)}</p>`;
    return;
  }
  box.innerHTML = partDetailHtml(e);
  const slot = box.querySelector<HTMLElement>("[data-carrier-big]");
  const body = seatPart(e).carrier;
  if (slot !== null && body !== null) slot.replaceChildren(pictureEl(body, "sprite", host.labSeed(), 160));
}

export function showParts(host: PartsHost): void {
  const f = host.filter();
  // A tag the tables no longer carry is not a filter.
  if (f.tag !== undefined && !partTags().includes(f.tag)) host.setFilter(without(f, "tag", undefined));
  const input = $("parts-search") as HTMLInputElement;
  if (input.value !== (host.filter().q ?? "")) input.value = host.filter().q ?? "";
  renderChips(host);
  renderGrid(host);
  renderDetail(host);
}
