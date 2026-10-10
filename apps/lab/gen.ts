/**
 * The generator tab: a batch of creatures from a human, as a grid of cards
 * in one look - the sprite, the limbs' sprite or the graph - each opening in
 * the lab. A finished batch goes to the store when the page has one. Below
 * the grid, on demand, the batch's summary: the old statistics tab, with the
 * spread on and off. DOM; the batch itself is `batch.ts`.
 */
import {
  FAMILIES,
  NEED_KINDS,
  ORGANS,
  type Body,
  type Family,
  CATALOG,
  isDisabled,
  BEASTS,
  CHANCE_STEPS,
  RULE_IDS,
  SOURCES,
  emptyTuning,
  isEmptyTuning,
  normalizeTuning,
  withTuning,
  type RuleId,
  type Start,
  type LabState,
  FAMILY_RU,
  NEED_RU,
  mutationRu,
} from "@mutant-engine/core";
import { NO_STORE, hasStore, saveBatch } from "./store.js";
import {
  DEFAULT_GEN,
  GEN_COUNT_MAX,
  GEN_MUTATIONS_MAX,
  batchStates,
  growCreature,
  hasRange,
  meanMutations,
  plainCatalog,
  sameBatch,
  startOf,
  startRu,
  summarizeCreature,
  tuningOf,
  type CreatureSummary,
  type GenParams,
  type GenSort,
  type GenSource,
  type GenTuning,
} from "./batch.js";
import { LOOKS, type Look, INK, TONE, LOOK_RU, lazyPictures, pictureEl } from "@mutant-engine/view";
import { FOE_LINES, lineById } from "@mutant-engine/core";
import { gauntlet, type GauntletResult } from "./gauntlet.js";
import { SURVIVAL_SWAY, abyssSummary, mean, needsSummary, planSummary, sampleState, shareAt, sharedHistograms, traitsSummary, type Sample } from "./stats.js";

interface GenHost {
  params(): GenParams;
  look(): Look;
  /** The batch or the look changed: into the view and the hash. */
  set(params: GenParams, look: Look): void;
  openInLab(state: LabState): void;
}

const GEN_SOURCE_RU: Record<GenSource, string> = {
  floor: "смешанный: источники первого этажа",
  abyss: "удар бездны",
  meat: "мясо твари",
  tumour: "созревшая опухоль",
  spring: "родник",
  vaccine: "прививка риппера",
};
const GEN_SOURCES: readonly GenSource[] = ["floor", ...SOURCES.map((s) => s.id).filter((s): s is Exclude<GenSource, "floor"> => s !== "id")];

/** What the batch may grow from, in the order of the picker; a beast is `z:<id>`. */
const START_IDS: readonly string[] = ["human", "swamp", "text", ...BEASTS.map((b) => `z:${b.id}`)];
const START_RU: Record<string, string> = { human: "человек", swamp: "болотник Топи", text: "фикстура текстом" };

function startId(start: Start): string {
  switch (start.kind) {
    case "human":
      return "human";
    case "swamp":
      return "swamp";
    case "text":
      return "text";
    case "beast":
      return `z:${start.id}`;
  }
}

function startName(id: string): string {
  if (!id.startsWith("z:")) return START_RU[id] ?? id;
  return BEASTS.find((b) => b.id === id.slice(2))?.ru ?? id.slice(2);
}

/** The rules of the model the panel switches; the spread is not here - it is a field of the state, and the lab replays it. */
const RULE_RU: Record<RuleId, string> = {
  needs: "нужды тела тянут строки и места (шаг J)",
  ceiling: "потолок массы скелета: вытеснение и потери (шаг H)",
  decay: "план затухает под нагрузкой (шаг I)",
  defects: "источник катит на дефект (доля дефектов источника)",
};

/** The panel's own view over the catalog; the tuning itself lives in the params, and so in the hash. */
const panel = { query: "", family: "" as Family | "", only: false, tuning: emptyTuning() };

interface Card {
  state: LabState;
  body: Body;
  summary: CreatureSummary;
  /** How far it got down the line of foes; absent when the batch fights nobody. */
  fight?: GauntletResult;
}

const job = { token: 0, cards: [] as Card[], params: null as GenParams | null, summaryFor: -1 };

const DEATH_RU: Record<string, string> = { blood: "кровь", brain: "мозг", mass: "истощение" };
const SORT_RU: Record<GenSort, string> = { strong: "сильные первыми", weak: "слабые первыми" };

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`no #${id}`);
  return el;
}

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function num(id: string, min: number, max: number, fallback: number): number {
  const v = Math.floor(Number(($(id) as HTMLInputElement).value));
  return Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
}

/** A number field that may be left empty: undefined then. */
function optional(id: string): number | undefined {
  const text = ($(id) as HTMLInputElement).value.trim();
  if (text === "") return undefined;
  const v = Math.floor(Number(text));
  return Number.isFinite(v) ? v : undefined;
}

export function buildGen(host: GenHost): void {
  const sources = GEN_SOURCES.map((s) => `<option value="${s}">${esc(GEN_SOURCE_RU[s])}</option>`).join("");
  const families = FAMILIES.map((f) => `<option value="${f}">${esc(FAMILY_RU[f])}</option>`).join("");
  const looks = LOOKS.map((l) => `<button type="button" data-look="${l}">${esc(LOOK_RU[l])}</button>`).join("");
  const starts = START_IDS.map((s) => `<option value="${esc(s)}">${esc(startName(s))}</option>`).join("");
  const lines = FOE_LINES.map((l) => `<option value="${esc(l.id)}">${esc(l.ru)}: ${esc(l.about)}</option>`).join("");
  const sorts = [`<option value="">по сиду</option>`, ...(["strong", "weak"] as GenSort[]).map((s) => `<option value="${s}">${esc(SORT_RU[s])}</option>`)].join("");
  $("gen-form").innerHTML = `
<div class="row">
  <label>тварей <input id="g-count" type="number" min="1" max="${GEN_COUNT_MAX}" class="mono seed"></label>
  <label>мутаций <input id="g-muts" type="number" min="1" max="${GEN_MUTATIONS_MAX}" class="mono seed"></label>
  <label title="верх диапазона: каждой твари своё число мутаций от сида; пусто — всем поровну">…до <input id="g-muts-to" type="number" min="1" max="${GEN_MUTATIONS_MAX}" class="mono seed" placeholder="—"></label>
  <label>основа <select id="g-start">${starts}</select></label>
  <label>источник <select id="g-source">${sources}</select></label>
  <select id="g-family" title="семейство прививки">${families}</select>
  <label class="chk"><input type="checkbox" id="g-spread"> расползание</label>
  <label>с сида <input id="g-first" type="number" min="0" class="mono seed"></label>
  <button class="btn" id="g-dice" title="новый первый сид">🎲</button>
  <button class="btn primary" id="g-run">Сгенерировать</button>
</div>
<div class="row" id="g-text-row" hidden><textarea id="g-text" class="mono" rows="3" spellcheck="false" placeholder="фикстура телом, как её пишет лаборатория; пусто — человек" style="flex:1;min-width:280px"></textarea></div>
<div class="row">
  <label title="каждая тварь идёт по линии противников: дерётся, съедает, лечится и идёт дальше">бой <select id="g-line"><option value="">нет</option>${lines}</select></label>
  <label>порядок <select id="g-sort">${sorts}</select></label>
  <label title="показывать только тех, кто прошёл столько противников">пройдено ≥ <input id="g-min" type="number" min="0" max="99" class="mono seed" placeholder="—"></label>
  <span id="g-fight" class="faint"></span>
</div>
<div class="row"><span class="cap">вид</span><span class="seg" id="g-looks">${looks}</span><span id="g-status" class="faint"></span></div>
<details class="gen-tune" id="g-tune"><summary>каталог этой партии: строки и особые правила <span id="g-tune-sum" class="faint"></span></summary><div id="g-tune-body"></div></details>`;
  const read = (): GenParams => {
    const p: GenParams = {
      count: num("g-count", 1, GEN_COUNT_MAX, DEFAULT_GEN.count),
      mutations: num("g-muts", 1, GEN_MUTATIONS_MAX, DEFAULT_GEN.mutations),
      source: ($("g-source") as HTMLSelectElement).value as GenSource,
      spread: ($("g-spread") as HTMLInputElement).checked,
      first: num("g-first", 0, 1e9, 1),
    };
    const to = optional("g-muts-to");
    if (to !== undefined && to > p.mutations) p.mutationsTo = Math.min(GEN_MUTATIONS_MAX, to);
    const line = ($("g-line") as HTMLSelectElement).value;
    if (line !== "") p.line = line;
    const sort = ($("g-sort") as HTMLSelectElement).value;
    if (sort !== "") p.sort = sort as GenSort;
    const min = optional("g-min");
    if (min !== undefined && min > 0) p.min = min;
    if (p.source === "vaccine") p.family = ($("g-family") as HTMLSelectElement).value as Family;
    const start = readStart();
    if (start !== undefined) p.start = start;
    const tuning = normalizeTuning(panel.tuning);
    if (!isEmptyTuning(tuning)) p.tuning = tuning;
    return p;
  };
  // The order and the filter draw the same creatures again; everything else asks for a new batch.
  $("gen-form").addEventListener("change", (e) => {
    const id = (e.target as HTMLElement).id;
    if (id !== "g-sort" && id !== "g-min") return;
    host.set(read(), host.look());
    drawGrid(host, true);
  });
  $("g-source").addEventListener("change", () => {
    $("g-family").hidden = ($("g-source") as HTMLSelectElement).value !== "vaccine";
  });
  $("g-start").addEventListener("change", () => {
    $("g-text-row").hidden = ($("g-start") as HTMLSelectElement).value !== "text";
  });
  $("g-tune").addEventListener("toggle", () => {
    if (($("g-tune") as HTMLDetailsElement).open) renderTune(host);
  });
  $("g-tune-body").addEventListener("input", (e) => {
    const t = e.target as HTMLElement;
    if (t.id !== "g-tune-search") return;
    panel.query = (t as HTMLInputElement).value.trim().toLowerCase();
    renderTuneRows();
  });
  $("g-tune-body").addEventListener("change", (e) => onSwitch(host, e.target as HTMLElement));
  $("g-tune-body").addEventListener("click", (e) => onTune(host, e.target as HTMLElement));
  $("g-dice").addEventListener("click", () => {
    const words = new Uint32Array(1);
    crypto.getRandomValues(words);
    ($("g-first") as HTMLInputElement).value = String((words[0]! % 999_983) + 1);
  });
  $("g-run").addEventListener("click", () => {
    host.set(read(), host.look());
    generate(host);
  });
  $("g-looks").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-look]");
    if (b === null) return;
    host.set(host.params(), b.dataset.look as Look);
    syncForm(host);
    drawGrid(host);
  });
  $("gen-grid").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-open]");
    const card = b === null ? undefined : job.cards[Number(b.dataset.open)];
    if (card !== undefined) host.openInLab(card.state);
  });
  $("gen-summary").addEventListener("toggle", () => {
    if (($("gen-summary") as HTMLDetailsElement).open) summarize();
  });  syncForm(host);
}

/** The basis the form names; undefined for a human, so the params and the hash stay as they were. */
function readStart(): Start | undefined {
  const id = ($("g-start") as HTMLSelectElement).value;
  if (id === "swamp") return { kind: "swamp" };
  if (id.startsWith("z:")) return { kind: "beast", id: id.slice(2) };
  if (id === "text") {
    const text = ($("g-text") as HTMLTextAreaElement).value.trim();
    if (text !== "") return { kind: "text", text };
  }
  return undefined;
}

function syncForm(host: GenHost): void {
  const p = host.params();
  ($("g-count") as HTMLInputElement).value = String(p.count);
  ($("g-muts") as HTMLInputElement).value = String(p.mutations);
  ($("g-muts-to") as HTMLInputElement).value = hasRange(p) ? String(p.mutationsTo) : "";
  ($("g-line") as HTMLSelectElement).value = p.line ?? "";
  ($("g-sort") as HTMLSelectElement).value = p.sort ?? "";
  ($("g-min") as HTMLInputElement).value = p.min === undefined || p.min <= 0 ? "" : String(p.min);
  ($("g-source") as HTMLSelectElement).value = p.source;
  ($("g-family") as HTMLSelectElement).value = p.family ?? "limbs";
  $("g-family").hidden = p.source !== "vaccine";
  ($("g-spread") as HTMLInputElement).checked = p.spread;
  ($("g-first") as HTMLInputElement).value = String(p.first);
  const start = startOf(p);
  ($("g-start") as HTMLSelectElement).value = startId(start);
  if (start.kind === "text") ($("g-text") as HTMLTextAreaElement).value = start.text;
  $("g-text-row").hidden = start.kind !== "text";
  panel.tuning = normalizeTuning(p.tuning ?? emptyTuning());
  $("g-tune-sum").textContent = tuneSummary(p.tuning);
  if (($("g-tune") as HTMLDetailsElement).open) renderTune(host);
  for (const b of $("g-looks").querySelectorAll<HTMLElement>("[data-look]")) b.setAttribute("aria-pressed", b.dataset.look === host.look() ? "true" : "false");
}

// ---------------------------------------------------------------- the catalog of one batch

function tuneSummary(t: GenTuning | undefined): string {
  if (t === undefined || isEmptyTuning(t)) return "· каталог как есть";
  const parts: string[] = [];
  if (t.off.length > 0) parts.push(`выкл ${t.off.length}`);
  const chance = Object.keys(t.chance).length;
  if (chance > 0) parts.push(`шансов ${chance}`);
  if (t.rules.length > 0) parts.push(`правил ${t.rules.length}`);
  return `· ${parts.join(" · ")}`;
}

/** The tuning changed: into the params, into the hash, back into the panel. */
function setTuning(host: GenHost, next: GenTuning): void {
  panel.tuning = normalizeTuning(next);
  const p = { ...host.params() };
  if (isEmptyTuning(panel.tuning)) delete p.tuning;
  else p.tuning = panel.tuning;
  host.set(p, host.look());
  $("g-tune-sum").textContent = tuneSummary(p.tuning);
  renderBar();
  renderTuneRows();
}

/** The line above the rows: what the batch changed, and the way back to the catalog. */
function renderBar(): void {
  $("g-tune-bar").innerHTML = `<span class="small">${esc(tuneSummary(panel.tuning).replace(/^· /, ""))}</span><button class="btn small" data-reset="1"${isEmptyTuning(panel.tuning) ? " disabled" : ""}>Вернуть каталог</button>`;
}

function factorOf(id: string): number {
  return panel.tuning.chance[id] ?? 1;
}

/** One step up or down the ladder of factors. */
function stepped(from: number, by: 1 | -1): number {
  const at = CHANCE_STEPS.indexOf(from);
  const i = at < 0 ? CHANCE_STEPS.indexOf(1) : at;
  return CHANCE_STEPS[Math.max(0, Math.min(CHANCE_STEPS.length - 1, i + by))] ?? 1;
}

/** The checkboxes of the panel: a rule of the model, or the filter over the rows. */
function onSwitch(host: GenHost, target: HTMLElement): void {
  const box = target as HTMLInputElement;
  if (box.dataset.only !== undefined) {
    panel.only = box.checked;
    renderTune(host);
    return;
  }
  const id = box.dataset.rule;
  if (id === undefined) return;
  if (id === "spread") {
    // The spread is a field of the state, not of the tuning: the checkbox above the panel is the same switch.
    host.set({ ...host.params(), spread: box.checked }, host.look());
    ($("g-spread") as HTMLInputElement).checked = box.checked;
    return;
  }
  const rules = box.checked ? panel.tuning.rules.filter((r) => r !== id) : [...panel.tuning.rules, id as RuleId];
  setTuning(host, { ...panel.tuning, rules });
}

function onTune(host: GenHost, target: HTMLElement): void {
  const chip = target.closest<HTMLElement>("[data-fam]");
  if (chip !== null) {
    panel.family = (chip.dataset.fam ?? "") as Family | "";
    renderTune(host);
    return;
  }
  if (target.closest("[data-reset]") !== null) {
    setTuning(host, emptyTuning());
    return;
  }
  const row = target.closest<HTMLElement>("[data-act]");
  if (row === null) return;
  const id = row.dataset.id!;
  const t: GenTuning = { off: [...panel.tuning.off], chance: { ...panel.tuning.chance }, rules: [...panel.tuning.rules] };
  if (row.dataset.act === "off") {
    if (t.off.includes(id)) t.off = t.off.filter((x) => x !== id);
    else t.off.push(id);
  } else {
    const factor = stepped(factorOf(id), row.dataset.act === "up" ? 1 : -1);
    if (factor === 1) delete t.chance[id];
    else t.chance[id] = factor;
  }
  setTuning(host, t);
}

function renderTune(host: GenHost): void {
  const fams = `<button type="button" class="chip${panel.family === "" ? " on" : ""}" data-fam="">все</button>${FAMILIES.map((f) => `<button type="button" class="chip${panel.family === f ? " on" : ""}" data-fam="${f}">${esc(FAMILY_RU[f])}</button>`).join("")}`;
  const rules = [
    { id: "spread", on: host.params().spread, ru: "расползание: тема тела тянет строки и места (§11)" },
    ...RULE_IDS.map((r) => ({ id: r as string, on: !panel.tuning.rules.includes(r), ru: RULE_RU[r] })),
  ]
    .map((r) => `<label class="chk"><input type="checkbox" data-rule="${r.id}"${r.on ? " checked" : ""}> ${esc(r.ru)}</label>`)
    .join("");
  $("g-tune-body").innerHTML = `
<p class="faint small">Правки живут в ссылке и только в этой партии: каталог на диске не меняется — для этого есть вкладка «Мутации». Выключенная строка не выпадает ни из одного источника. Карточка, открытая в лабе, переигрывается по каталогу с диска: там этих правок нет.</p>
<div class="row" id="g-tune-bar"></div>
<div class="cap">особые правила</div>
<div class="row">${rules}</div>
<div class="cap">строки каталога</div>
<div class="row"><input id="g-tune-search" type="search" class="search" placeholder="поиск по названию или id" autocomplete="off" value="${esc(panel.query)}"><label class="chk"><input type="checkbox" data-only="1"${panel.only ? " checked" : ""}> только изменённые</label></div>
<div class="chips">${fams}</div>
<div class="list rows" id="g-tune-rows" style="max-height:260px;overflow:auto"></div>`;
  renderBar();
  renderTuneRows();
}

function renderTuneRows(): void {
  const list = $("g-tune-rows");
  const at = list.scrollTop;
  const rows = CATALOG.filter((m) => {
    if (panel.family !== "" && m.family !== panel.family) return false;
    if (panel.query !== "" && !mutationRu(m.id).toLowerCase().includes(panel.query) && !m.id.toLowerCase().includes(panel.query)) return false;
    if (panel.only && !panel.tuning.off.includes(m.id) && factorOf(m.id) === 1) return false;
    return true;
  });
  const html = rows.map((m) => {
    const gone = isDisabled(m.id);
    const off = gone || panel.tuning.off.includes(m.id);
    const factor = factorOf(m.id);
    const chance = Math.max(0.01, Math.round(m.chance * factor * 100) / 100);
    const badge = gone ? `<i class="badge off">выкл на диске</i>` : off ? `<i class="badge off">выкл</i>` : factor === 1 ? "" : `<i class="badge edit">×${factor}</i>`;
    const buttons = gone
      ? `<span class="faint small">правится в «Мутациях»</span>`
      : `<button class="btn small" data-act="off" data-id="${m.id}">${off ? "включить" : "выключить"}</button><button class="btn small" data-act="down" data-id="${m.id}" title="понизить шанс"${factor === CHANCE_STEPS[0] ? " disabled" : ""}>−</button><button class="btn small" data-act="up" data-id="${m.id}" title="повысить шанс"${factor === CHANCE_STEPS[CHANCE_STEPS.length - 1] ? " disabled" : ""}>+</button>`;
    return `<div class="item${off ? " none" : ""}" style="cursor:default"><span>${esc(mutationRu(m.id))} ${badge}</span><small>${esc(FAMILY_RU[m.family])} · шанс ${m.chance}${factor === 1 ? "" : ` → ${chance}`}</small><span style="margin-left:auto;display:flex;gap:4px">${buttons}</span></div>`;
  });
  list.innerHTML = html.length === 0 ? `<p class="faint small">ни одной строки по этому фильтру</p>` : html.join("");
  list.scrollTop = at;
}

/** Shows the tab: the batch of the view, grown once. */
export function showGen(host: GenHost): void {
  syncForm(host);
  if (!sameBatch(job.params, host.params())) generate(host, false);
  else {
    job.params = host.params();
    drawGrid(host, true);
  }
}

function label(p: GenParams): string {
  const basis = startRu(startOf(p));
  const tuned = plainCatalog(p) ? "" : ` · каталог партии: ${tuneSummary(p.tuning).replace(/^· /, "")}`;
  const muts = hasRange(p) ? `${p.mutations}–${p.mutationsTo}` : String(p.mutations);
  const line = p.line === undefined ? "" : ` · бой: ${lineById(p.line).ru}`;
  return `${p.count} × ${muts} · ${GEN_SOURCE_RU[p.source]}${p.family === undefined ? "" : ` · ${FAMILY_RU[p.family]}`}${basis === "" ? "" : ` · из ${basis}`}${p.spread ? "" : " · без расползания"} · сиды ${p.first}–${p.first + p.count - 1}${line}${tuned}`;
}

/** Grows the batch in slices so the page answers; `store` puts it in the store when done. */
function generate(host: GenHost, store = true): void {
  const params = host.params();
  const token = ++job.token;
  job.params = params;
  job.cards = [];
  job.summaryFor = -1;
  $("gen-summary-out").innerHTML = "";
  ($("gen-summary") as HTMLDetailsElement).open = false;
  syncForm(host);
  const states = batchStates(params);
  $("gen-grid").innerHTML = "";
  $("g-fight").textContent = "";
  let i = 0;
  const slice = (): void => {
    if (token !== job.token) return;
    const t0 = performance.now();
    // One creature at a time while it also fights: a walk down a line costs far more than growing the body.
    while (i < states.length && (performance.now() - t0 < 30 || (params.line !== undefined && i === 0))) {
      const state = states[i]!;
      const body = growCreature(params, state);
      const card: Card = { state, body, summary: summarizeCreature(state, body, params.source) };
      if (params.line !== undefined) card.fight = gauntlet(body, state.seed, { line: params.line });
      job.cards.push(card);
      i += 1;
      if (params.line !== undefined) break;
    }
    $("g-status").textContent = `${label(params)} · ${i} / ${states.length}`;
    drawGrid(host);
    if (i < states.length) {
      window.setTimeout(slice, 0);
      return;
    }
    drawGrid(host, true);
    if (store) void keep(params, token);
    else $("g-status").textContent = label(params);
  };
  window.setTimeout(slice, 0);
}

/** The line of the fight over the whole batch: who fell at once, who got furthest, the mean. */
function fightLine(params: GenParams, cards: readonly Card[]): string {
  if (params.line === undefined) return "";
  const beaten = cards.map((c) => c.fight?.beaten ?? 0);
  if (beaten.length === 0) return "";
  const line = lineById(params.line);
  const fell = beaten.filter((b) => b === 0).length;
  const whole = cards.filter((c) => c.fight?.survived === true).length;
  const best = Math.max(...beaten);
  return `бой · ${esc(line.ru)}, ${line.foes.length} противников: пройдено в среднем ${(mean(beaten)).toFixed(2)}, лучший ${best} · пали на первом ${fell} из ${cards.length}${whole === 0 ? "" : ` · прошли всю линию ${whole}`}`;
}

async function keep(params: GenParams, token: number): Promise<void> {
  if (!(await hasStore())) {
    $("g-status").textContent = `${label(params)} · ${NO_STORE}`;
    return;
  }
  try {
    const r = await saveBatch(label(params), params, job.cards.map((c) => c.summary));
    if (token === job.token) $("g-status").textContent = `${label(params)} · в бестиарии: ${r.saved}`;
  } catch (e) {
    $("g-status").textContent = `не сохранилось: ${e instanceof Error ? e.message : String(e)}`;
  }
}

let drawn = { token: -1, look: "" as Look | "", order: "", count: 0 };

/** Whether every creature of the batch is there: until then the grid grows by seed and neither sorts nor filters. */
function complete(params: GenParams): boolean {
  return job.cards.length >= params.count;
}

/** The cards as the grid shows them: the filter first, then the order. Indices are into `job.cards`. */
function shown(params: GenParams): number[] {
  const ready = complete(params);
  const min = ready ? (params.min ?? 0) : 0;
  const keep: number[] = [];
  for (let k = 0; k < job.cards.length; k++) {
    if (min > 0 && (job.cards[k]!.fight?.beaten ?? 0) < min) continue;
    keep.push(k);
  }
  if (!ready) return keep;
  const beaten = (k: number): number => job.cards[k]!.fight?.beaten ?? 0;
  if (params.sort === "strong") keep.sort((a, b) => beaten(b) - beaten(a) || a - b);
  else if (params.sort === "weak") keep.sort((a, b) => beaten(a) - beaten(b) || a - b);
  return keep;
}

/** What a card says about its walk down the line. */
function fightMeta(f: GauntletResult | undefined): string {
  if (f === undefined) return "";
  const of = lineById(f.line).foes.length;
  const how = f.dead === null ? (f.survived ? "прошла всю линию" : "встала") : `пала: ${DEATH_RU[f.dead] ?? f.dead}`;
  return `<div class="meta mono ${f.beaten === 0 ? "c-flesh" : f.survived ? "c-ok" : "faint"}">бой ${f.beaten} / ${of} · ${esc(how)} · ходов ${f.turns}</div>`;
}

function drawGrid(host: GenHost, rebuild = false): void {
  const look = host.look();
  const params = job.params ?? host.params();
  const order = complete(params) ? `${params.sort ?? ""}:${params.min ?? 0}` : "seed";
  const grid = $("gen-grid");
  if (rebuild || drawn.token !== job.token || drawn.look !== look || drawn.order !== order) {
    grid.innerHTML = "";
    drawn = { token: job.token, look, order, count: 0 };
  }
  const list = shown(params);
  const lazy = lazyPictures();
  for (let i = drawn.count; i < list.length; i++) {
    const k = list[i]!;
    const c = job.cards[k]!;
    const s = c.summary;
    const el = document.createElement("article");
    el.className = "card-gen";
    el.innerHTML = `<div class="pic-slot"></div><div class="name">${esc(s.name)}</div><div class="meta mono faint">сид ${s.seed} · узл. ${s.nodes} · гол. ${s.heads} · ч ${s.humanoid.toFixed(2)}</div>${fightMeta(c.fight)}<button class="btn small" data-open="${k}">в лабу</button>`;
    grid.append(el);
    lazy(el.querySelector<HTMLElement>(".pic-slot")!, () => pictureEl(c.body, look, s.seed, 160));
  }
  drawn.count = list.length;
  $("g-fight").innerHTML = fightLine(params, job.cards);
}

// ---------------------------------------------------------------- the summary of the batch

function summarize(): void {
  const params = job.params;
  if (params === null || job.cards.length < params.count || job.summaryFor === job.token) return;
  job.summaryFor = job.token;
  const token = job.token;
  const on: Sample[] = [];
  const off: Sample[] = [];
  let i = 0;
  const out = $("gen-summary-out");
  const slice = (): void => {
    if (token !== job.token) return;
    const t0 = performance.now();
    // The summary reads the same catalog the batch was grown on, tuning and all.
    withTuning(tuningOf(params), () => {
      while (i < job.cards.length && performance.now() - t0 < 40) {
        const s = job.cards[i]!.state;
        on.push(sampleState({ ...s, spread: true }));
        off.push(sampleState({ ...s, spread: false }));
        i += 1;
      }
    });
    if (i < job.cards.length) {
      out.innerHTML = `<p class="faint">считаю… ${i} / ${job.cards.length}</p>`;
      window.setTimeout(slice, 0);
      return;
    }
    out.innerHTML = summaryHtml(on, off, params);
  };
  window.setTimeout(slice, 0);
}

function histogramSvg(title: string, on: number[], off: number[]): string {
  const h = sharedHistograms(on, off, 12);
  const W = 300;
  const H = 110;
  const top = 8;
  const bottom = 22;
  const max = Math.max(1, ...h.a, ...h.b);
  const bw = (W - 10) / h.a.length;
  const bars: string[] = [];
  h.a.forEach((a, i) => {
    const b = h.b[i]!;
    const x = 5 + i * bw;
    const ha = ((H - top - bottom) * a) / max;
    const hb = ((H - top - bottom) * b) / max;
    bars.push(`<rect x="${(x + 1).toFixed(1)}" y="${(H - bottom - ha).toFixed(1)}" width="${(bw / 2 - 1.5).toFixed(1)}" height="${ha.toFixed(1)}" fill="${TONE.bio}"><title>с расползанием: ${a}</title></rect>`);
    bars.push(`<rect x="${(x + bw / 2).toFixed(1)}" y="${(H - bottom - hb).toFixed(1)}" width="${(bw / 2 - 1.5).toFixed(1)}" height="${hb.toFixed(1)}" fill="${INK.paper3}"><title>без: ${b}</title></rect>`);
    const edge = h.edges[i]!;
    const text = Number.isInteger(edge) ? String(edge) : edge.toFixed(1);
    if (h.a.length <= 8 || i % 2 === 0) bars.push(`<text x="${(x + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="9" fill="${INK.paper3}">${text}</text>`);
  });
  return `<figure class="hist"><figcaption>${esc(title)} <span class="faint mono">ср. ${mean(on).toFixed(1)} / ${mean(off).toFixed(1)}</span></figcaption><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${bars.join("")}</svg></figure>`;
}

function summaryHtml(on: Sample[], off: Sample[], params: GenParams): string {
  const hists = [
    histogramSvg("узлы", on.map((s) => s.nodes), off.map((s) => s.nodes)),
    histogramSvg("замкнутость", on.map((s) => s.closure), off.map((s) => s.closure)),
    histogramSvg("головы", on.map((s) => s.heads), off.map((s) => s.heads)),
    histogramSvg("масса", on.map((s) => s.mass), off.map((s) => s.mass)),
    histogramSvg("семейств с ≥ 3", on.map((s) => s.familiesAt3), off.map((s) => s.familiesAt3)),
    histogramSvg("человечность, %", on.map((s) => Math.round(100 * s.humanoid)), off.map((s) => Math.round(100 * s.humanoid))),
    histogramSvg("самая длинная цепочка", on.map((s) => s.chain), off.map((s) => s.chain)),
    histogramSvg("развилки", on.map((s) => s.forks), off.map((s) => s.forks)),
  ];
  const pct = (v: number): string => `${(100 * v).toFixed(1)} %`;
  const row = (title: string, a: string, b: string, cls = ""): string => `<tr class="${cls}"><td>${title}</td><td class="mono">${a}</td><td class="mono">${b}</td></tr>`;
  const table = (head: string, rows: string[]): string => `<table class="heatmap abyss"><thead><tr><th>${head}</th><th>с</th><th>без</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
  const planOn = planSummary(on);
  const planOff = planSummary(off);
  const plan = table("план тела", [
    row("человечность, медиана", planOn.humanoid.toFixed(2), planOff.humanoid.toFixed(2)),
    row("тел с корпусом обхвата ≥ 4", pct(planOn.thick), pct(planOff.thick)),
    row("тел с двумя корпусами или вросшей головой", pct(planOn.twoOrSunk), pct(planOff.twoOrSunk)),
    row("самая длинная цепочка, медиана", String(planOn.chain), String(planOff.chain)),
    row("развилок (степень ≥ 3), медиана", String(planOn.forks), String(planOff.forks)),
    row("севших мутаций на корпус или его узлы", pct(planOn.onPlan), pct(planOff.onPlan)),
    row("дефектов среди севших", pct(planOn.defects), pct(planOff.defects)),
  ]);
  // Strikes per body: the batch's number, or the mean of the rolled ones when it is a range.
  const muts = meanMutations(params);
  const aOn = abyssSummary(on, muts);
  const aOff = abyssSummary(off, muts);
  const kinds = (s: ReturnType<typeof abyssSummary>): string => (s.kinds.length === 0 ? "—" : s.kinds.slice(0, 6).map((k) => `${esc(ORGANS[k.kind].ru)} ${k.n}`).join(", "));
  const vitals = (s: ReturnType<typeof abyssSummary>): string => `${s.noHeart} · ${s.noBrain} · ${s.noBreath}`;
  const abyss = table("потолок и вытеснение", [
    row("потерянные удары", pct(aOn.lost), pct(aOff.lost)),
    row("ушли в нарост", pct(aOn.tumours), pct(aOff.tumours)),
    row("вытеснено органов на тело", aOn.displaced.toFixed(2), aOff.displaced.toFixed(2)),
    row("каких", kinds(aOn), kinds(aOff)),
    row("тел без сердца · без мозга · без дыхания (должно быть 0 · 0 · 0)", vitals(aOn), vitals(aOff), aOn.noHeart + aOn.noBrain + aOn.noBreath + aOff.noHeart + aOff.noBrain + aOff.noBreath > 0 ? "bad" : ""),
    row("слепых тел · тел, которые не ходят", `${aOn.blind} · ${aOn.lame}`, `${aOff.blind} · ${aOff.lame}`, aOn.blind + aOff.blind > 0 ? "bad" : ""),
    row("чуждость, ср.", aOn.alien.toFixed(1), aOff.alien.toFixed(1)),
    row("доля семейства-лидера, ср.", aOn.lead.toFixed(3), aOff.lead.toFixed(3)),
  ]);
  const nOn = needsSummary(on);
  const nOff = needsSummary(off);
  const needs = table("нужды тела", [
    ...NEED_KINDS.map((k) => row(`нужда «${NEED_RU[k]}», ср. сила`, nOn.strength[k].toFixed(2), nOff.strength[k].toFixed(2))),
    row("мозгов на тело · из них в брюхе", `${nOn.brains.toFixed(2)} · ${nOn.gutBrains.toFixed(2)}`, `${nOff.brains.toFixed(2)} · ${nOff.gutBrains.toFixed(2)}`),
    row("сердец на тело", nOn.hearts.toFixed(2), nOff.hearts.toFixed(2)),
    row("тел, которые не могут есть", pct(nOn.cannotEat), pct(nOff.cannotEat)),
    row("тел с перегрузкой каналов больше 5", pct(nOn.overloaded), pct(nOff.overloaded)),
    row(`чужих территорий на тело (sway ${SURVIVAL_SWAY}) · выживут при отделении`, `${nOn.territories.toFixed(2)} · ${pct(nOn.survive)}`, `${nOff.territories.toFixed(2)} · ${pct(nOff.survive)}`),
  ]);
  const tOn = traitsSummary(on, CATALOG.length);
  const tOff = traitsSummary(off, CATALOG.length);
  const traitRows = tOn.rows.map((r, i) => {
    const b = tOff.rows[i]!;
    const beyond = r.human === 0 ? "" : ` <span class="faint">(больше человечьих ${(100 * r.beyondHuman).toFixed(0)} %)</span>`;
    return `<tr class="${r.bodies === 0 ? "bad" : ""}"><td>${esc(r.ru)}${beyond}</td><td class="mono">${pct(r.bodies)} · ${r.mean.toFixed(2)}</td><td class="mono">${pct(b.bodies)} · ${b.mean.toFixed(2)}</td></tr>`;
  });
  const never = tOn.never.slice(0, 12).map((x) => `${esc(mutationRu(x.id))} ×${x.drawn}`).join(", ");
  const traits = `<table class="heatmap abyss"><thead><tr><th>черта: доля тел · частей на тело</th><th>с</th><th>без</th></tr></thead><tbody>${traitRows.join("")}${row("летает (крыло площадью ≥ 8)", pct(tOn.flies), pct(tOff.flies), tOn.flies === 0 ? "bad" : "")}</tbody></table>
<p class="faint small">Строк каталога выпало ${tOn.drawn} из ${CATALOG.length}; ни разу не выпало ${tOn.unseen}. Выпали, но ни разу не сели (${tOn.never.length}): ${never === "" ? "—" : never}. Строка, которая выпадает и никогда не садится, — это черта, которой в партии нет: ей некуда встать.</p>`;
  const threeOn = shareAt(on, 3);
  const threeOff = shareAt(off, 3);
  const cell = (v: number, color: string): string => `<td class="heat mono" style="background:${color}${Math.round(Math.min(1, v * 1.4) * 255).toString(16).padStart(2, "0")}">${(100 * v).toFixed(0)} %</td>`;
  const famRows = FAMILIES.map((f) => `<tr><td>${esc(FAMILY_RU[f])}</td>${cell(threeOn[f], TONE.bio)}${cell(threeOff[f], INK.paper3)}</tr>`);
  const fam = `<table class="heatmap"><thead><tr><th>семейство</th><th colspan="2">≥ 3 органов</th></tr><tr><th></th><th>с</th><th>без</th></tr></thead><tbody>${famRows.join("")}</tbody></table>`;
  return `
<div class="legend"><i style="background:${TONE.bio}"></i> с расползанием <i style="background:${INK.paper3}"></i> без · те же сиды и команды</div>
<div class="hists">${hists.join("")}</div>
<div class="cap">план тела: человечность, корпуса, цепочки и развилки, куда садятся удары</div>${plan}
<div class="cap">удары и потолок скелета: потери, вытеснение, жизненно важное, чуждость, тема</div>${abyss}
<div class="cap">нужды тела: чего не хватает, мозги и сердца, кто ест, чьи территории выживут</div>${needs}
<div class="cap">черты: что тела вообще несут и чего в партии не бывает</div>${traits}
<div class="cap">семейства: доля тел с тремя органами семейства и больше</div>${fam}`;
}
