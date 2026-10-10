/**
 * The mutation editor tab (#4): the catalog as rows - search, families, what
 * is edited or switched off - and one row open to edit: its text RU and EN,
 * its chance, its tags, its target rule, and a switch that takes it out of
 * every source. Edits are drafts in this browser until accepted; accepting
 * checks them as the catalog is checked and writes `packages/core/content/overrides.ts`
 * through the studio's server, and the page reloads on the new catalog. DOM.
 */
import {
  FAMILIES,
  applyMutation,
  human,
  type Body,
  type Family,
  type Mutation,
  type MutationTag,
  BASE_MUTATION_TEXT,
  BASE_MUTATIONS,
  applyOverride,
  pruneOverride,
  type MutationOverride,
  MUTATION_OVERRIDES,
  LabRng,
  FAMILY_RU,
  OP_RU,
  targetName,
} from "@mutant-engine/core";
import { overrideProblems, type Overrides } from "./studio/overrides.js";
import { drawSprite } from "@mutant-engine/view";
import { NO_STORE, hasStore } from "./store.js";

interface EditorHost {
  /** The row open in the editor, from the hash. */
  row(): string | undefined;
  setRow(id: string | undefined): void;
  /** Opens the lab to place the row by hand. */
  placeInLab(id: string): void;
}

const KEY = "mutant-engine.mutation-drafts";
const TAGS: readonly MutationTag[] = ["defect", "psychic", "sleeping", "key", "psionic", "tidal"];
const TAG_RU: Record<MutationTag, string> = { defect: "дефект", psychic: "психика", sleeping: "спящая", key: "ключевая", psionic: "псионика", tidal: "приливная" };

const ed = { query: "", family: "" as Family | "", only: "" as "" | "edited" | "off", drafts: loadDrafts(), problems: [] as string[], busy: false };

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`no #${id}`);
  return el;
}

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function loadDrafts(): Overrides {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Overrides;
  } catch {
    return {};
  }
}

function saveDrafts(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(ed.drafts));
  } catch {
    // A private window keeps no drafts; they live until the page closes.
  }
}

function base(id: string): Mutation {
  return BASE_MUTATIONS.find((m) => m.id === id)!;
}

function textOf(m: Mutation): { ru: string; en: string } {
  return BASE_MUTATION_TEXT[m.i18n] ?? { ru: m.id, en: m.id };
}

/** The edit of a row as it stands: the accepted one with the draft on top. */
function editOf(id: string): MutationOverride {
  return { ...(MUTATION_OVERRIDES[id] ?? {}), ...(ed.drafts[id] ?? {}) };
}

/** Every edit that would be written: the accepted set with the drafts over it, each pruned against its row. */
function proposed(): Overrides {
  const out: Overrides = {};
  for (const id of new Set([...Object.keys(MUTATION_OVERRIDES), ...Object.keys(ed.drafts)])) {
    const m = BASE_MUTATIONS.find((x) => x.id === id);
    if (m === undefined) continue;
    const p = pruneOverride(m, textOf(m), editOf(id));
    if (p !== undefined) out[id] = p;
  }
  return out;
}

function setDraft(id: string, patch: MutationOverride): void {
  const next: MutationOverride = { ...(ed.drafts[id] ?? {}), ...patch };
  for (const k of Object.keys(patch) as (keyof MutationOverride)[]) if (patch[k] === undefined) delete next[k];
  ed.drafts[id] = next;
  if (JSON.stringify(next) === "{}") delete ed.drafts[id];
  saveDrafts();
}

export function buildEditor(host: EditorHost): void {
  $("muts-left").innerHTML = `
<input id="me-search" type="search" class="search" placeholder="поиск по названию или id" autocomplete="off">
<div class="chips" id="me-fams"><button type="button" class="chip on" data-fam="">все</button>${FAMILIES.map((f) => `<button type="button" class="chip" data-fam="${f}">${esc(FAMILY_RU[f])}</button>`).join("")}</div>
<div class="chips" id="me-only"><button type="button" class="chip on" data-only="">все строки</button><button type="button" class="chip" data-only="edited">с правками</button><button type="button" class="chip" data-only="off">выключенные</button></div>
<div class="me-bar" id="me-bar"></div>
<div class="list rows" id="me-rows"></div>`;
  $("me-search").addEventListener("input", () => {
    ed.query = ($("me-search") as HTMLInputElement).value.trim().toLowerCase();
    renderRows(host);
  });
  $("me-fams").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-fam]");
    if (b === null) return;
    ed.family = (b.dataset.fam ?? "") as Family | "";
    renderRows(host);
  });
  $("me-only").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-only]");
    if (b === null) return;
    ed.only = (b.dataset.only ?? "") as typeof ed.only;
    renderRows(host);
  });
  $("me-rows").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-row]");
    if (b !== null) {
      host.setRow(b.dataset.row);
      renderEditor(host);
    }
  });
  $("me-bar").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-bar]");
    if (b === null) return;
    if (b.dataset.bar === "accept") void accept(host);
    else if (b.dataset.bar === "drop") {
      ed.drafts = {};
      saveDrafts();
      renderEditor(host);
    }
  });
  $("muts-edit").addEventListener("change", (e) => onEdit(host, e.target as HTMLElement));
  $("muts-edit").addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const id = host.row();
    if (id === undefined) return;
    if (t.closest("[data-revert]") !== null) {
      delete ed.drafts[id];
      saveDrafts();
      renderEditor(host);
    } else if (t.closest("[data-try]") !== null) renderPreview(id);
    else if (t.closest("[data-lab]") !== null) host.placeInLab(id);
  });
}

function onEdit(host: EditorHost, t: HTMLElement): void {
  const id = host.row();
  if (id === undefined) return;
  const f = t.dataset.field;
  if (f === "disabled") setDraft(id, { disabled: (t as HTMLInputElement).checked });
  else if (f === "chance") setDraft(id, { chance: Number((t as HTMLInputElement).value) });
  else if (f === "ru" || f === "en") setDraft(id, { [f]: (t as HTMLInputElement).value });
  else if (f === "tag") {
    const tags = [...$("muts-edit").querySelectorAll<HTMLInputElement>("[data-field=tag]")].filter((x) => x.checked).map((x) => x.value as MutationTag);
    setDraft(id, { tags });
  } else if (f === "target") {
    const text = (t as HTMLTextAreaElement).value;
    try {
      setDraft(id, { target: JSON.parse(text) as Mutation["target"] });
    } catch {
      ed.problems = [`${id}: цель — не JSON`];
      renderChecks();
      return;
    }
  }
  renderEditor(host);
}

/** Shows the tab: the list and the row open. */
export function showEditor(host: EditorHost): void {
  renderEditor(host);
  void hasStore().then((ok) => {
    if (!ok) $("me-bar").insertAdjacentHTML("beforeend", `<p class="faint small">${esc(NO_STORE)}: смотреть можно, принять нельзя.</p>`);
  });
}

function renderEditor(host: EditorHost): void {
  ed.problems = overrideProblems(proposed());
  renderRows(host);
  renderRow(host);
  renderChecks();
}

function renderRows(host: EditorHost): void {
  for (const b of $("me-fams").querySelectorAll<HTMLElement>("[data-fam]")) b.classList.toggle("on", (b.dataset.fam ?? "") === ed.family);
  for (const b of $("me-only").querySelectorAll<HTMLElement>("[data-only]")) b.classList.toggle("on", (b.dataset.only ?? "") === ed.only);
  const drafts = Object.keys(ed.drafts).length;
  $("me-bar").innerHTML = `<div class="row"><span class="small">черновиков: <b>${drafts}</b> · принятых правок: ${Object.keys(MUTATION_OVERRIDES).length}</span></div><div class="row"><button class="btn primary" data-bar="accept"${drafts === 0 || ed.problems.length > 0 || ed.busy ? " disabled" : ""}>Принять</button><button class="btn" data-bar="drop"${drafts === 0 ? " disabled" : ""}>Откатить черновики</button></div>`;
  const q = ed.query;
  const rows = BASE_MUTATIONS.filter((m) => {
    if (ed.family !== "" && m.family !== ed.family) return false;
    if (q !== "" && !textOf(m).ru.toLowerCase().includes(q) && !m.id.toLowerCase().includes(q)) return false;
    const e = editOf(m.id);
    if (ed.only === "off" && e.disabled !== true) return false;
    if (ed.only === "edited" && pruneOverride(m, textOf(m), e) === undefined) return false;
    return true;
  });
  $("me-rows").innerHTML = rows
    .map((m) => {
      const e = editOf(m.id);
      const edited = pruneOverride(m, textOf(m), e) !== undefined;
      const badges = [e.disabled === true ? `<i class="badge off">выкл</i>` : "", ed.drafts[m.id] !== undefined ? `<i class="badge draft">черновик</i>` : edited ? `<i class="badge edit">правка</i>` : ""].join("");
      return `<button type="button" class="item${m.id === host.row() ? " on" : ""}${e.disabled === true ? " none" : ""}" data-row="${m.id}"><span>${esc(e.ru ?? textOf(m).ru)} ${badges}</span><small>${esc(FAMILY_RU[m.family])} · шанс ${e.chance ?? m.chance}</small></button>`;
    })
    .join("");
}

function renderRow(host: EditorHost): void {
  const id = host.row();
  const m = id === undefined ? undefined : BASE_MUTATIONS.find((x) => x.id === id);
  if (m === undefined) {
    $("muts-edit").innerHTML = `<h2>Редактор мутаций</h2><p class="faint">Выбери строку слева. Правки — черновики в этом браузере, пока их не принять: «Принять» проверяет каталог и записывает <span class="mono">packages/core/content/overrides.ts</span>. Выключенная строка не выпадает ни из одного источника, но ставится вручную. Операция и полезная нагрузка — код модели, здесь не правятся.</p>`;
    return;
  }
  const e = editOf(m.id);
  const text = textOf(m);
  const tags = e.tags ?? m.tags;
  const draft = ed.drafts[m.id] !== undefined;
  $("muts-edit").innerHTML = `
<h2>${esc(e.ru ?? text.ru)} <span class="mono faint small">${m.id}</span></h2>
<p class="faint">${esc(FAMILY_RU[m.family])} · операция ${esc(OP_RU[m.op])}${draft ? ` · <span class="c-bile">черновик</span>` : ""}</p>
<label class="chk big"><input type="checkbox" data-field="disabled"${e.disabled === true ? " checked" : ""}> выключить везде: ни бездна, ни мясо, ни опухоль, ни родник, ни прививка, ни генератор</label>
<div class="me-grid">
  <label>название RU <input type="text" data-field="ru" value="${esc(e.ru ?? text.ru)}"></label>
  <label>название EN <input type="text" data-field="en" value="${esc(e.en ?? text.en)}"></label>
  <label>шанс (вес в выборке; у строки ${m.chance}) <input type="number" min="0.1" step="0.5" data-field="chance" value="${e.chance ?? m.chance}"></label>
  <div><div class="cap">теги</div><div class="row">${TAGS.map((t) => `<label class="chk"><input type="checkbox" data-field="tag" value="${t}"${tags.includes(t) ? " checked" : ""}> ${esc(TAG_RU[t])}</label>`).join("")}</div></div>
</div>
<div class="cap">цель (правило места, JSON)</div>
<textarea data-field="target" rows="4" spellcheck="false" class="mono">${esc(JSON.stringify(e.target ?? m.target, null, 1))}</textarea>
<div class="cap">полезная нагрузка (код, только чтение)</div>
<pre class="mono me-payload">${esc(JSON.stringify(m.payload))}</pre>
<div class="row"><button class="btn" data-try="1">попробовать на человеке</button><button class="btn" data-lab="1">поставить вручную в лабе</button><button class="btn" data-revert="1"${draft ? "" : " disabled"}>откатить строку</button></div>
<div id="me-preview" class="me-preview"></div>
<div id="me-checks" class="me-checks"></div>`;
}

function renderChecks(): void {
  const el = document.getElementById("me-checks");
  if (el === null) return;
  el.innerHTML = ed.problems.length === 0 ? `<p class="c-ok small">каталог с черновиками проходит проверку</p>` : `<div class="cap c-flesh">не примется</div><ul class="notes">${ed.problems.map((p) => `<li class="c-flesh">${esc(p)}</li>`).join("")}</ul>`;
}

/** The row as drafted applied to a human with a few seeds: where it lands, and the body before and after. */
function renderPreview(id: string): void {
  const m = applyOverride(base(id), editOf(id));
  const cards: string[] = [];
  const bodies: Body[] = [];
  for (let seed = 1; seed <= 3; seed++) {
    const b = human(1000);
    let line: string;
    try {
      const before = human(1000);
      const r = applyMutation(b, m, new LabRng(`try-${id}-${seed}`), { spread: true });
      line = r === null ? "некуда встать" : `${OP_RU[r.op]} → ${targetName(before, r.target)}${r.fallback ? " (нарост)" : ""}`;
    } catch (e) {
      line = `ошибка: ${e instanceof Error ? e.message : String(e)}`;
    }
    bodies.push(b);
    cards.push(`<figure class="me-try"><canvas width="120" height="120" data-try-body="${seed - 1}"></canvas><figcaption class="small">${esc(line)}</figcaption></figure>`);
  }
  $("me-preview").innerHTML = `<div class="cap">на человеке, три броска</div><div class="row">${cards.join("")}</div>`;
  for (const c of $("me-preview").querySelectorAll<HTMLCanvasElement>("canvas[data-try-body]")) drawSprite(c, bodies[Number(c.dataset.tryBody)]!, 1);
}

async function accept(host: EditorHost): Promise<void> {
  if (!(await hasStore())) return;
  ed.busy = true;
  renderRows(host);
  try {
    const res = await fetch("./api/overrides", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ overrides: proposed() }) });
    const json = (await res.json()) as { problems?: string[] };
    if (!res.ok) {
      ed.problems = json.problems ?? [`ответ ${res.status}`];
      renderChecks();
      return;
    }
    // The file changed: the page reloads on the new catalog; the drafts are in it now.
    ed.drafts = {};
    saveDrafts();
    $("me-bar").insertAdjacentHTML("beforeend", `<p class="c-ok small">принято, записано в overrides.ts — страница перезагрузится</p>`);
    window.setTimeout(() => location.reload(), 600);
  } finally {
    ed.busy = false;
  }
}
