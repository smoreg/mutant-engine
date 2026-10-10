/**
 * The studio's page and its lab tab: the file that holds the one state and
 * the tabs. State lives in `state.ts` as commands from a seed and is replayed
 * on every change; the hash carries it; this file draws the lab's run and
 * turns clicks into commands. The generator, the bestiary and the sprite
 * editor are their own files and reach the lab through a host.
 */
import "./lab.css";
import {
  FAMILIES,
  K_NEED,
  K_PLACE,
  ORGANS,
  bodyToText,
  brainPowers,
  brains,
  breathCost,
  bridges,
  closure,
  cloneBody,
  controlOf,
  derive,
  forks,
  humanoid,
  humanoidParts,
  longestChain,
  membraneArea,
  mentalLoad,
  mindPower,
  needs,
  nodeIds,
  organMass,
  organs,
  segmentIds,
  segmentMass,
  seizesBody,
  separate,
  sortedIds,
  type Stripped,
  summarize,
  survivalReport,
  type Body,
  type Brain,
  type Derived,
  type End,
  type Family,
  type Target,
  CATALOG,
  isDisabled,
  BEASTS,
  beastById,
  SOURCES,
  parseBrainKey,
  placeTargets,
  startBody,
  stripPreview,
  type Command,
  type ExciseCommand,
  type MutateEvent,
  type Source,
  type UnmutateCommand,
  decodeCommand,
  encodeCommand,
  initialState,
  run,
  type LabState,
  type Run,
  type Step,
  PART_GROUPS,
  RESHAPE_VERB,
  anatomy,
  operationsFor,
  organLabel,
  outcomeOf,
  reshapeGone,
  type Operation,
  type Outcome,
  type Part,
  FAMILY_RU,
  FATE_RU,
  GEAR_RU,
  NEED_PART_RU,
  NEED_RU,
  OP_RU,
  SUMMARY_RU,
  brainName,
  elementName,
  fmt,
  organsRu,
  segmentName,
  targetName,
  mutationAbout,
  mutationRu,
  COVERS,
  DIET,
  MEMBRANES,
  SEGMENT_KINDS,
  eatableRu,
  eatenRu,
  isEatable,
  attachRu,
} from "@mutant-engine/core";
import {
  composeBody,
  frameSvg,
  layout,
  relaxLayout,
  spritePlan,
  type Layout,
  type LengthScale,
  type Look,
  COVER_COLORS,
  INK,
  TONE,
  graphLook,
  sceneSvg,
  spriteSvg,
  type DetachedPiece,
  type Highlight,
  type Scene,
  type SeparateMark,
  TERRITORY_COLORS,
  drawSprite,
  foreignOverlays,
  pinAt,
  pinLayout,
  prunePins,
  SVG_UNIT,
} from "@mutant-engine/view";
import { NO_STORE, hasStore, saveCreature } from "./store.js";
import { DEFAULT_GEN, summarizeCreature } from "./batch.js";
import { buildEditor, showEditor } from "./editor.js";
import { buildGen, showGen } from "./gen.js";
import { buildArena, resetArena, showArena } from "./arena-page.js";
import { attackWord } from "./arena-words.js";
import { TABS, VIEW_MODES, decode, encode, type Shelf, type Tab, type View, type ViewMode } from "./hash.js";
import { catalogOptions, partInfoHtml, placeHtml, type PartRef } from "./panels.js";
import { buildZoo, renderZoo } from "./zoo-page.js";
import { buildParts, showParts } from "./parts-page.js";
import { buildEdit, showEdit, type EditHost } from "./edit-page.js";
import type { PartsFilter } from "./parts.js";

// ---------------------------------------------------------------- app state

/** How the lab mutates: a source's roll, a row by id, or a row placed by hand on a place picked on the body. */
interface Pick {
  source: Source;
  family: Family;
  id: string;
}
const VIEW_RU: Record<ViewMode, string> = { full: "полная укладка", sprite: "спрайты", s96: "спрайт 96" };
const SOURCE_SHORT: Record<Source, string> = { abyss: "бездна", meat: "мясо", tumour: "опухоль", spring: "родник", vaccine: "прививка", id: "по id" };

const app = {
  state: initialState(),
  view: {} as View,
  run: run(initialState()),
  other: null as Run | null,
  redo: [] as Command[],
  playing: false,
  timer: 0,
  speed: 4,
  pick: { source: "abyss", family: "limbs", id: "extraArm" } as Pick,
  sepPreview: null as string | null,
  labels: false,
  textDraft: "",
  textError: "",
  layouts: new WeakMap<Body, Partial<Record<LengthScale, Layout>>>(),
  /** The place under the pointer while placing by hand. */
  place: { hover: null as number | null },
  /** The body an operation under the pointer would leave: its halo on the table. */
  room: { hover: null as { after: Body } | null },
  /** A node being dragged: the layout before the pins, and the frame kept still while it moves. */
  drag: null as { node: number; base: Layout; bbox: Layout["bbox"]; moved: boolean; x: number; y: number } | null,
};

type Mode = "roll" | "hand" | "room";

function mode(): Mode {
  return app.view.room === true ? "room" : app.view.hand === true ? "hand" : "roll";
}

function placing(): boolean {
  return mode() === "hand";
}


function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`no #${id}`);
  return el;
}

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function layoutOf(body: Body, scale: LengthScale): Layout {
  let entry = app.layouts.get(body);
  if (entry === undefined) {
    entry = {};
    app.layouts.set(body, entry);
  }
  let l = entry[scale];
  if (l === undefined) {
    // Shaken out like a ragdoll: after many mutations the plain layout knots up.
    l = relaxLayout(body, layout(body, { scale }));
    // The graph view reads as a body: a head that is a head, legs longer than the torso.
    // The sprite scale is the rig's and keeps the model's lengths.
    if (scale === "linear") l = graphLook(body, l);
    entry[scale] = l;
  }
  return l;
}

/** The layout as it is shown: the model's, with the nodes dragged by hand on top. */
function shownLayout(body: Body, scale: LengthScale): Layout {
  const l = pinLayout(layoutOf(body, scale), app.view.pins ?? {}, body);
  return app.drag === null || l === layoutOf(body, scale) ? l : { ...l, bbox: app.drag.bbox };
}

function lastIndex(): number {
  return app.run.steps.length - 1;
}

function stepIndex(): number {
  const i = app.view.step ?? lastIndex();
  return Math.max(0, Math.min(lastIndex(), i));
}

function currentStep(): Step {
  return app.run.steps[stepIndex()]!;
}

function scaleOf(mode: ViewMode): LengthScale {
  return mode === "full" ? "linear" : "sqrt";
}

function viewMode(): ViewMode {
  return app.view.view ?? "full";
}

// ---------------------------------------------------------------- state changes

function recompute(resume = true): void {
  const previous = app.run;
  app.run = run(app.state, resume ? { resume: previous } : {});
  if (app.view.compare === true) {
    const flipped = { ...app.state, spread: !app.state.spread };
    app.other = run(flipped, app.other !== null && resume ? { resume: app.other } : {});
  } else app.other = null;
  if (app.view.step !== undefined && app.view.step > lastIndex()) app.view.step = undefined;
}

function syncHash(): void {
  const view: View = { ...app.view };
  if (view.step !== undefined && view.step >= lastIndex()) delete view.step;
  history.replaceState(null, "", `#${encode(app.state, view)}`);
}

function push(cmd: Command): void {
  stop();
  app.state.commands.push(cmd);
  app.redo = [];
  app.view.step = undefined;
  delete app.view.info;
  recompute(true);
  renderAll();
}

function undo(): void {
  const cmd = app.state.commands.pop();
  if (cmd === undefined) return;
  stop();
  app.redo.push(cmd);
  app.view.step = undefined;
  delete app.view.info;
  recompute(false);
  renderAll();
}

function redo(): void {
  const cmd = app.redo.pop();
  if (cmd === undefined) return;
  stop();
  app.state.commands.push(cmd);
  app.view.step = undefined;
  delete app.view.info;
  recompute(true);
  renderAll();
}

/** A new creature: its node ids name other nodes, so the pins go. */
function restart(state: LabState): void {
  stop();
  app.state = state;
  delete app.view.pins;
  app.redo = [];
  app.view.step = undefined;
  delete app.view.info;
  app.sepPreview = null;
  recompute(false);
  renderAll();
}

function setStep(i: number): void {
  const clamped = Math.max(0, Math.min(lastIndex(), i));
  app.view.step = clamped === lastIndex() ? undefined : clamped;
  delete app.view.info;
  renderStep();
}

function play(): void {
  if (app.playing) return;
  if (stepIndex() >= lastIndex()) app.view.step = 0;
  app.playing = true;
  app.timer = window.setInterval(() => {
    if (stepIndex() >= lastIndex()) {
      stop();
      return;
    }
    app.view.step = stepIndex() + 1;
    renderStep();
  }, 1000 / app.speed);
  renderPlayer();
}

function stop(): void {
  if (!app.playing) return;
  window.clearInterval(app.timer);
  app.playing = false;
  renderPlayer();
}

// ---------------------------------------------------------------- rendering: everything

function renderAll(): void {
  syncControls();
  renderTape();
  renderStep();
}

/** What changes when the step changes. */
function renderStep(): void {
  markTape();
  renderCanvasBar();
  renderCanvas();
  renderPlayer();
  renderDetail();
  renderHeads();
  renderNumbers();
  renderPlace();
  renderRoom();
  renderInfo();
  syncHash();
}

// ---------------------------------------------------------------- controls

/** A seed for a new creature: the page's own choice, never the simulation's rng. */
function freshSeed(): number {
  const words = new Uint32Array(1);
  crypto.getRandomValues(words);
  return (words[0]! % 999_983) + 1;
}

function buildControls(): void {
  const sources = SOURCES.map((s) => `<option value="${s.id}">${esc(s.ru)}</option>`).join("");
  const families = FAMILIES.map((f) => `<option value="${f}">${esc(FAMILY_RU[f])}</option>`).join("");
  $("controls").innerHTML = `
<div class="row">
  <button class="btn primary" id="new-btn" title="новое существо: человек, мутант из Топи, тварь из бестиария или текст фикстуры">Новый…</button>
  <span id="start-name" class="faint small"></span>
  <label class="small">сид <input id="seed" type="number" min="0" step="1" class="mono seed"></label>
</div>
<div id="new-menu" class="new-menu" hidden>
  <div class="cap">с чего начать · новый сид, без команд</div>
  <div class="new-grid">
    <button type="button" class="item" data-new="human"><span>человек</span></button>
    <button type="button" class="item" data-new="swamp"><span>мутант из Топи</span></button>
    ${BEASTS.map((b) => `<button type="button" class="item" data-new="beast:${b.id}"><span>${esc(b.ru)}</span></button>`).join("")}
    <button type="button" class="item" data-new="text"><span>текст фикстуры…</span></button>
  </div>
</div>
<div id="text-start" class="text-start" hidden>
  <textarea id="fixture-in" rows="9" spellcheck="false" class="mono"></textarea>
  <div class="row"><button id="apply-text" class="btn">применить фикстуру</button><span id="text-error" class="err"></span></div>
</div>
<div class="row">
  <label>мутация <select id="source">${sources}</select></label>
  <select id="family" title="семейство прививки">${families}</select>
  <select id="mutid" title="строка каталога">${catalogOptions()}</select>
</div>
<div id="mut-about"></div>
<div class="row btns" id="mut-row"><span class="cap">бросок</span><button class="btn primary" data-mut="1">×1</button><button class="btn" data-mut="10">×10</button><button class="btn" data-mut="50">×50</button></div>
<div class="row btns"><span class="cap">съесть</span><select id="eat-part" title="что съесть: вкус тянет мутации к себе и гаснет">${eatOptions()}</select><button class="btn" data-eat="1">×1</button><button class="btn" data-eat="3">×3</button></div>
<div class="row btns"><span class="cap">ходы</span><button class="btn" data-tick="1">+1</button><button class="btn" data-tick="10">+10</button><button class="btn" data-tick="100">+100</button></div>
<div class="row toggles">
  <label class="chk"><input type="checkbox" id="spread"> расползание</label>
  <label class="chk"><input type="checkbox" id="compare"> рядом с другим флагом</label>
</div>
<div class="row btns">
  <button class="btn" id="undo" title="отменить последнюю команду (реплей без неё)">отменить</button>
  <button class="btn" id="redo">повторить</button>
  <button class="btn" id="copy-link" title="скопировать ссылку на это состояние">ссылка</button>
  <button class="btn" id="copy-fix" title="скопировать тело текстом фикстуры">фикстура</button>
</div>
<div class="row btns">
  <button class="btn" id="to-start" title="снять все команды, оставить старт и сид">к старту</button>
  <button class="btn" id="keep" title="сохранить этого мутанта в бестиарий">в бестиарий</button>
  <span id="keep-status" class="faint small"></span>
</div>
<div class="row"><input id="link" class="mono link" readonly></div>`;

  $("seed").addEventListener("change", () => {
    const seed = Math.max(0, Math.floor(Number(($("seed") as HTMLInputElement).value) || 0));
    restart({ ...app.state, seed, commands: [...app.state.commands] });
  });
  $("new-btn").addEventListener("click", () => {
    $("new-menu").hidden = !$("new-menu").hidden;
  });
  $("new-menu").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-new]");
    if (b === null) return;
    const kind = b.dataset.new!;
    $("new-menu").hidden = true;
    if (kind === "text") {
      app.textDraft = app.textDraft || bodyToText(startBody(app.state.start));
      ($("fixture-in") as HTMLTextAreaElement).value = app.textDraft;
      $("text-start").hidden = false;
      return;
    }
    const start: LabState["start"] = kind.startsWith("beast:") ? { kind: "beast", id: kind.slice(6) } : { kind: kind as "human" | "swamp" };
    $("text-start").hidden = true;
    restart({ seed: freshSeed(), start, commands: [], spread: app.state.spread });
  });
  $("apply-text").addEventListener("click", () => {
    const text = ($("fixture-in") as HTMLTextAreaElement).value;
    app.textDraft = text;
    try {
      startBody({ kind: "text", text });
      app.textError = "";
      restart({ ...app.state, start: { kind: "text", text }, commands: [] });
    } catch (e) {
      app.textError = e instanceof Error ? e.message : String(e);
      $("text-error").textContent = app.textError;
    }
  });
  $("source").addEventListener("change", () => {
    app.pick.source = ($("source") as HTMLSelectElement).value as Pick["source"];
    app.place.hover = null;
    syncControls();
    renderPlace();
    renderCanvas();
  });
  $("family").addEventListener("change", () => {
    app.pick.family = ($("family") as HTMLSelectElement).value as Family;
  });
  $("mutid").addEventListener("change", () => {
    app.pick.id = ($("mutid") as HTMLSelectElement).value;
    app.place.hover = null;
    $("mut-about").innerHTML = about(app.pick.id);
    renderPlace();
    if (placing()) renderCanvas();
  });
  $("controls").addEventListener("click", (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>("[data-mut],[data-tick],[data-eat]");
    if (t === null) return;
    if (t.dataset.mut !== undefined) {
      const cmd: Command = { t: "mutate", source: app.pick.source, n: Number(t.dataset.mut) };
      if (app.pick.source === "vaccine") cmd.family = app.pick.family;
      if (app.pick.source === "id") cmd.id = app.pick.id;
      push(cmd);
    } else if (t.dataset.tick !== undefined) push({ t: "tick", n: Number(t.dataset.tick) });
    else if (t.dataset.eat !== undefined) {
      const part = ($("eat-part") as HTMLSelectElement).value;
      if (isEatable(part)) push({ t: "eat", part, n: Number(t.dataset.eat) });
    }
  });
  $("spread").addEventListener("change", () => {
    app.state.spread = ($("spread") as HTMLInputElement).checked;
    stop();
    recompute(false);
    renderAll();
  });
  $("compare").addEventListener("change", () => {
    app.view.compare = ($("compare") as HTMLInputElement).checked ? true : undefined;
    if (app.view.compare !== true) delete app.view.compare;
    recompute(false);
    renderAll();
  });
  $("to-start").addEventListener("click", () => restart({ ...app.state, commands: [] }));
  $("keep").addEventListener("click", () => void keep());
  $("undo").addEventListener("click", undo);
  $("redo").addEventListener("click", redo);
  $("copy-link").addEventListener("click", () => {
    syncHash();
    const link = $("link") as HTMLInputElement;
    link.value = location.href;
    link.select();
    void navigator.clipboard?.writeText(location.href);
  });
  $("copy-fix").addEventListener("click", () => {
    const text = bodyToText(currentStep().body);
    void navigator.clipboard?.writeText(text);
    const link = $("link") as HTMLInputElement;
    link.value = text.replace(/\n/g, " ⏎ ");
    link.select();
  });
}

function syncControls(): void {
  $("top-right").innerHTML = `<span class="mono faint">сид ${app.state.seed} · ${app.state.spread ? "с расползанием" : "без расползания"} · команд ${app.state.commands.length}</span>`;
  ($("seed") as HTMLInputElement).value = String(app.state.seed);
  $("start-name").textContent = startName();
  if (app.state.start.kind === "text") ($("fixture-in") as HTMLTextAreaElement).value = app.state.start.text;
  $("text-error").textContent = app.textError;
  ($("source") as HTMLSelectElement).value = app.pick.source;
  ($("family") as HTMLSelectElement).value = app.pick.family;
  ($("mutid") as HTMLSelectElement).value = app.pick.id;
  $("family").hidden = app.pick.source !== "vaccine";
  $("mutid").hidden = app.pick.source !== "id";
  $("mut-about").innerHTML = app.pick.source === "id" ? about(app.pick.id) : "";
  ($("spread") as HTMLInputElement).checked = app.state.spread;
  ($("compare") as HTMLInputElement).checked = app.view.compare === true;
  ($("undo") as HTMLButtonElement).disabled = app.state.commands.length === 0;
  ($("to-start") as HTMLButtonElement).disabled = app.state.commands.length === 0;
  ($("redo") as HTMLButtonElement).disabled = app.redo.length === 0;
  ($("link") as HTMLInputElement).value = location.href;
}

// ---------------------------------------------------------------- a mutation by hand

/**
 * The hand picker's own state: the search and the family it narrows the
 * catalog by, whether the list of places is unfolded, and where the catalog
 * is scrolled. It survives a redraw, so picking a row does not throw the
 * list back to the top. The counts of places are kept per body.
 */
const hand = { query: "", family: "" as Family | "", places: false, scroll: 0 };
const placeCounts = new WeakMap<Body, Map<string, number>>();

function placesOn(body: Body, id: string): number {
  let m = placeCounts.get(body);
  if (m === undefined) {
    m = new Map();
    placeCounts.set(body, m);
  }
  let n = m.get(id);
  if (n === undefined) {
    n = placeTargets(body, id).length;
    m.set(id, n);
  }
  return n;
}

/** What the row does, in one line, where it is chosen; empty until the catalog carries the table. */
function about(id: string): string {
  const line = mutationAbout(id);
  return line === "" ? "" : `<p class="about">${esc(line)}</p>`;
}

function pickRow(id: string): void {
  app.pick.id = id;
  app.view.row = id;
  app.place.hover = null;
  renderPlace();
  renderCanvas();
  syncHash();
}

function bindPlace(): void {
  $("place").innerHTML = `
<input id="pl-search" type="search" class="search" placeholder="поиск: рука, глаз, хвост, жабры…" autocomplete="off">
<div class="chips" id="pl-fams"><button type="button" class="chip on" data-fam="">все</button>${FAMILIES.map((f) => `<button type="button" class="chip" data-fam="${f}">${esc(FAMILY_RU[f])}</button>`).join("")}</div>
<div id="pl-chosen" class="chosen"></div>
<div class="list rows" id="pl-rows"></div>`;
  $("pl-search").addEventListener("input", () => {
    hand.query = ($("pl-search") as HTMLInputElement).value.trim().toLowerCase();
    renderPlace();
  });
  $("pl-fams").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-fam]");
    if (b === null) return;
    hand.family = (b.dataset.fam ?? "") as Family | "";
    renderPlace();
  });
  $("pl-rows").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-row]");
    if (b !== null) pickRow(b.dataset.row!);
  });
  $("pl-rows").addEventListener("scroll", () => {
    hand.scroll = $("pl-rows").scrollTop;
  });
  // The fold of the list of places is the page's, not the markup's: a redraw keeps it open.
  $("pl-chosen").addEventListener("toggle", (e) => {
    const d = (e.target as HTMLElement).closest<HTMLDetailsElement>("details.places");
    if (d !== null) hand.places = d.open;
  }, true);
  const hover = (e: Event): void => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-place]");
    const i = b === null ? null : Number(b.dataset.place);
    if (i === app.place.hover) return;
    app.place.hover = i;
    renderCanvas();
  };
  $("pl-chosen").addEventListener("mouseover", hover);
  $("pl-chosen").addEventListener("mouseleave", () => {
    app.place.hover = null;
    renderCanvas();
  });
  $("pl-chosen").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-place]");
    if (b === null) return;
    const w = placeTargets(currentStep().body, app.pick.id)[Number(b.dataset.place)];
    if (w !== undefined) placeAt(w.target);
  });
}

function placeAt(target: Target): void {
  app.place.hover = null;
  forkIfPast();
  push({ t: "place", id: app.pick.id, target });
}

/**
 * The hand picker: the chosen row with its places on top, the catalog below,
 * narrowed by the search and by the family. The fold of the list of places
 * and the scroll of the catalog are kept between redraws, so a row can be
 * picked and placed without the list jumping away.
 */
function renderPlace(): void {
  if (!placing()) return;
  const body = currentStep().body;
  for (const b of $("pl-fams").querySelectorAll<HTMLElement>("[data-fam]")) b.classList.toggle("on", (b.dataset.fam ?? "") === hand.family);
  const chosen = CATALOG.find((m) => m.id === app.pick.id);
  const n = chosen === undefined ? 0 : placesOn(body, chosen.id);
  $("pl-chosen").innerHTML =
    chosen === undefined
      ? `<p class="faint small">Выбери строку ниже, потом кликни по телу, куда её поставить.</p>`
      : `<div class="cap">выбрано</div><div class="chosen-name"><b>${esc(mutationRu(chosen.id))}</b> <span class="faint">· ${esc(FAMILY_RU[chosen.family])} · ${esc(OP_RU[chosen.op])}</span></div>${about(chosen.id)}` +
        (n === 0
          ? `<p class="c-flesh small">На этом теле ей некуда встать.</p>`
          : `<p class="faint small">Места подсвечены на теле — кликни по узлу или сегменту в полной укладке. Строка остаётся выбранной: можно ставить ещё.</p><details class="places"${hand.places ? " open" : ""}><summary>места списком · ${n}</summary>${placeHtml(chosen.id, body)}</details>`);
  const q = hand.query;
  const rows = CATALOG.filter((m) => (hand.family === "" || m.family === hand.family) && (q === "" || mutationRu(m.id).toLowerCase().includes(q) || m.id.toLowerCase().includes(q)));
  const list = $("pl-rows");
  list.innerHTML =
    rows.length === 0
      ? `<p class="faint small">Ничего не нашлось.</p>`
      : rows
          .map((m) => {
            const k = placesOn(body, m.id);
            const off = isDisabled(m.id) ? ` <i class="badge off" title="выключена в редакторе мутаций: сама не выпадает, вручную ставится">выкл</i>` : "";
            const line = mutationAbout(m.id);
            return `<button type="button" class="item${m.id === app.pick.id ? " on" : ""}${k === 0 ? " none" : ""}" data-row="${m.id}"${line === "" ? "" : ` title="${esc(line)}"`}><span>${esc(mutationRu(m.id))}${off}</span><small>${esc(FAMILY_RU[m.family])} · ${k === 0 ? "некуда" : `мест ${k}`}</small></button>`;
          })
          .join("");
  list.scrollTop = Math.min(hand.scroll, Math.max(0, list.scrollHeight - list.clientHeight));
  list.querySelector<HTMLElement>(".item.on")?.scrollIntoView({ block: "nearest" });
}

/** The creature on the screen into the bestiary's store. */
async function keep(): Promise<void> {
  const status = $("keep-status");
  if (!(await hasStore())) {
    status.textContent = NO_STORE;
    return;
  }
  try {
    await saveCreature(summarizeCreature(app.state, app.run.body));
    status.textContent = "в бестиарии";
  } catch (e) {
    status.textContent = e instanceof Error ? e.message : String(e);
  }
}


// ---------------------------------------------------------------- the operating room

function room(): boolean {
  return app.view.room === true;
}

const partsCache = new WeakMap<Body, Part[]>();

function partsOf(body: Body): Part[] {
  let p = partsCache.get(body);
  if (p === undefined) {
    p = anatomy(body);
    partsCache.set(body, p);
  }
  return p;
}

function partKey(p: Part): string {
  return p.segment === null ? `c${p.tip}` : String(p.segment);
}

function selectedPart(body: Body): Part | undefined {
  const key = app.view.part;
  return key === undefined ? undefined : partsOf(body).find((p) => partKey(p) === key);
}

/** The mutation a step of the tape landed, by its Russian name: what "снять мутацию" takes back. */
function originName(step: number): string | null {
  const e = app.run.steps[step]?.event;
  if (e === undefined) return null;
  if (e.kind === "mutate" && e.mutation !== null && e.result !== null) return mutationRu(e.mutation.id);
  if (e.kind === "place" && e.result !== null) return mutationRu(e.id);
  return null;
}

function setMode(m: Mode): void {
  const on = m === "room";
  delete app.view.room;
  delete app.view.hand;
  if (m === "room") app.view.room = true;
  else delete app.view.part;
  if (m === "hand") app.view.hand = true;
  delete app.view.info;
  app.room.hover = null;
  app.place.hover = null;
  for (const b of $("lab-modes").querySelectorAll<HTMLElement>("[data-mode]")) b.classList.toggle("on", b.dataset.mode === m);
  $("controls").hidden = m !== "roll";
  $("place").hidden = m !== "hand";
  $("room").hidden = !on;
  // The operations take the right column: the part, what can be done, what it does - without scrolling past the body.
  $("ops").hidden = !on;
  $("heads").hidden = on;
  $("numbers").hidden = on;
  $("step-detail").hidden = on;
  $("page-lab").classList.toggle("in-room", on);
  renderRoom();
  renderPlace();
  renderCanvas();
  renderDetail();
  renderInfo();
  syncHash();
}

function selectPart(key: string | undefined): void {
  if (key === undefined) delete app.view.part;
  else app.view.part = key;
  app.room.hover = null;
  renderRoom();
  renderCanvas();
  renderDetail();
  syncHash();
}

/** The halo on the table: the part chosen, and what the operation under the pointer takes. */
function roomHighlight(body: Body): Highlight {
  const none = (): { nodes: number[]; segments: number[]; membranes: number[] } => ({ nodes: [], segments: [], membranes: [] });
  const chosen = none();
  const going = none();
  const part = selectedPart(body);
  if (part !== undefined) {
    chosen.nodes.push(part.tip);
    if (part.segment !== null) chosen.segments.push(part.segment);
  }
  const hover = app.room.hover;
  if (hover !== null) {
    for (const id of nodeIds(body)) if (hover.after.nodes[id] === undefined) going.nodes.push(id);
    for (const id of segmentIds(body)) if (hover.after.segments[id] === undefined) going.segments.push(id);
    // An organ alone: its place glows.
    if (going.nodes.length + going.segments.length === 0 && part !== undefined) {
      going.nodes.push(part.tip);
      if (part.segment !== null) going.segments.push(part.segment);
    }
  }
  return { added: hover === null ? chosen : none(), changed: going, removed: none(), before: null, beforeLayout: null };
}

/** The parts of the body on the screen, by group; the chosen one open with what is on it. */
function renderRoom(): void {
  if (!room()) return;
  const body = currentStep().body;
  const parts = partsOf(body);
  const chosen = selectedPart(body);
  const groups = PART_GROUPS.map((g) => {
    const list = parts.filter((p) => p.group === g.id);
    if (list.length === 0) return "";
    const rows = list.map((p) => {
      const on = chosen !== undefined && partKey(p) === partKey(chosen);
      const inside = p.organs.filter((o) => o.inside === undefined).map((o) => o.ru);
      const sub = inside.length === 0 ? "пусто" : inside.join(", ");
      return `<button type="button" class="item${on ? " on" : ""}" data-part="${partKey(p)}"><span>${esc(p.ru)}</span><small>${esc(sub)}</small></button>`;
    });
    return `<div class="cap">${esc(g.ru)} · ${list.length}</div><div class="list">${rows.join("")}</div>`;
  });
  const past = stepIndex() !== lastIndex() ? `<p class="c-bile small">Смотришь на прошлый шаг: операция сотрёт ленту после него.</p>` : "";
  $("room").innerHTML = `<p class="faint small">Выбери часть тела — списком или кликом по телу в полной укладке. Справа появятся операции: что уйдёт и как изменится тело.</p>${past}${groups.join("")}`;
}

/** One operation as a card: the verb, what leaves, the numbers that move (worse first), the plain warnings, the body after. */
function operationCard(o: Operation, out: Outcome, i: number): string {
  if (out.empty) return "";
  const fmtV = (v: unknown): string => (typeof v === "boolean" ? (v ? "да" : "нет") : fmt(v as number));
  const worse = out.stats.filter((d) => d.verdict === "worse").map((d) => `${esc(d.ru)} ${fmtV(d.before)} → ${fmtV(d.after)}`);
  const better = out.stats.filter((d) => d.verdict === "better").map((d) => `${esc(d.ru)} ${fmtV(d.before)} → ${fmtV(d.after)}`);
  const lines = [
    `<div class="op-line"><span class="k">уйдёт</span> ${esc(out.gone.join(", ") || "—")} <span class="faint">· ${out.mass > 0 ? `масса −${fmt(out.mass)}` : "масса почти не меняется"}</span></div>`,
    `<div class="op-line"><span class="k">рана</span> ${out.wound ? `<span class="c-flesh">да — края кровоточат${out.falls.length > 0 ? `; отпадёт: ${esc(out.falls.join(", "))}` : ""}</span>` : `<span class="c-ok">нет, чисто</span>`}</div>`,
  ];
  if (worse.length > 0) lines.push(`<div class="op-line"><span class="k c-flesh">хуже</span> ${worse.join(" · ")}</div>`);
  if (better.length > 0) lines.push(`<div class="op-line"><span class="k c-ok">лучше</span> ${better.join(" · ")}</div>`);
  if (worse.length + better.length === 0) lines.push(`<div class="op-line"><span class="k">статы</span> <span class="faint">не меняются</span></div>`);
  const warn = out.warnings.length === 0 ? "" : `<div class="op-warn">⚠ ${out.warnings.map(esc).join(" · ")}</div>`;
  const grave = out.warnings.length > 0 ? " grave" : "";
  return `<article class="op-card${grave}" data-op="${i}"><div class="op-head"><b>${esc(o.verb)}</b> ${esc(o.what)}<button class="btn small${out.warnings.length > 0 ? "" : " primary"}" data-do="${i}">сделать</button></div><div class="op-body"><div class="op-text">${lines.join("")}${warn}</div><canvas class="op-after" width="112" height="112" data-after="${i}" title="тело после операции"></canvas></div></article>`;
}

let roomOps: { op: Operation; out: Outcome }[] = [];

function renderOperations(): void {
  const body = currentStep().body;
  const part = selectedPart(body);
  if (part === undefined) {
    roomOps = [];
    $("ops").innerHTML = `<h3>Операционная</h3><p class="faint">Выбери часть тела слева или кликом по телу в полной укладке. Для каждой операции будет видно, что уйдёт, останется ли рана, что станет хуже и лучше и чего тело больше не сможет.</p>`;
    return;
  }
  roomOps = operationsFor(body, part, originName).map((op) => ({ op, out: outcomeOf(body, op) }));
  const cards = roomOps.map(({ op, out }, i) => operationCard(op, out, i)).join("");
  const organs = part.organs.map(organLabel);
  $("ops").innerHTML = `<h3>${esc(part.ru)}</h3><p class="faint">${organs.length === 0 ? "на части ничего нет" : `на части: ${esc(organs.join(", "))}`}</p><div class="op-list">${cards || `<p class="faint">Здесь нечего делать.</p>`}</div>`;
  for (const c of $("ops").querySelectorAll<HTMLCanvasElement>("canvas[data-after]")) {
    const entry = roomOps[Number(c.dataset.after)];
    if (entry !== undefined) drawSprite(c, entry.out.after, app.state.seed);
  }
}

function bindRoom(): void {
  $("lab-modes").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-mode]");
    if (b !== null) setMode(b.dataset.mode as Mode);
  });
  $("room").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-part]");
    if (b !== null) selectPart(b.dataset.part === app.view.part ? undefined : b.dataset.part);
  });
  $("ops").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-do]");
    const entry = b === null ? undefined : roomOps[Number(b.dataset.do)];
    if (entry === undefined) return;
    app.room.hover = null;
    forkIfPast();
    const keep = app.view.part;
    push(entry.op.command);
    // The part stays on the table when it is still there.
    if (keep !== undefined && partsOf(currentStep().body).some((p) => partKey(p) === keep)) app.view.part = keep;
    renderRoom();
    renderCanvas();
    renderDetail();
    syncHash();
  });
  $("ops").addEventListener("mouseover", (e) => {
    const card = (e.target as HTMLElement).closest<HTMLElement>("[data-op]");
    const entry = card === null ? null : (roomOps[Number(card.dataset.op)]?.out ?? null);
    const after = entry === null ? null : entry.after;
    if (after === (app.room.hover?.after ?? null)) return;
    app.room.hover = after === null ? null : { after };
    renderCanvas();
  });
  $("ops").addEventListener("mouseleave", () => {
    if (app.room.hover === null) return;
    app.room.hover = null;
    renderCanvas();
  });
}

// ---------------------------------------------------------------- tape

function startName(): string {
  const st = app.state.start;
  switch (st.kind) {
    case "human":
      return "человек";
    case "swamp":
      return "мутант из Топи";
    case "text":
      return "текст фикстуры";
    case "beast":
      return `${beastById(st.id)?.ru ?? st.id}: фикстура бестиария`;
  }
}

/** Every part a body can eat, organs first, by name (decision 1253). */
function eatOptions(): string {
  const kinds = [...Object.keys(ORGANS), ...Object.keys(SEGMENT_KINDS).filter((k) => k !== "flank"), ...Object.keys(COVERS), ...Object.keys(MEMBRANES)].filter(isEatable);
  return kinds.map((k) => `<option value="${k}"${k === "eye" ? " selected" : ""}>${esc(eatableRu(k))}</option>`).join("");
}

function stepTitle(step: Step): { main: string; sub: string; cls: string } {
  const e = step.event;
  const body = step.body;
  switch (e.kind) {
    case "start":
      return { main: "старт", sub: startName(), cls: "start" };
    case "mutate": {
      const src = SOURCE_SHORT[e.source] + (e.defect === true ? " · дефект" : "");
      if (e.mutation === null) return { main: `${src} · ничего`, sub: "источник ничего не дал", cls: "lost" };
      const name = `${mutationRu(e.mutation.id)} · ${FAMILY_RU[e.mutation.family]}`;
      if (e.result === null) return { main: `${src} · ${name}`, sub: "потеряна: некуда встать даже наросту", cls: "lost" };
      const op = OP_RU[e.result.op];
      const where = targetName(step.before ?? body, e.result.target);
      if (e.result.fallback) return { main: `${src} · ${name}`, sub: `нет места → ${op} у ${where}`, cls: "fallback" };
      const shed = e.result.shed.length === 0 ? "" : ` и ${e.result.shed.map((id) => segmentName(step.before ?? body, id)).join(", ")}`;
      const evicted = e.result.displaced.length === 0 && e.result.shed.length === 0 ? "" : ` · вытеснив: ${organsRu(e.result.displaced)}${shed}`;
      const orphan = e.result.orphan ? " · сирота: выросло, чего не нашлось" : "";
      return { main: `${src} · ${name}`, sub: `${op} → ${where}${evicted}${orphan}${needNote(e)}`, cls: "" };
    }
    case "place": {
      const name = `${mutationRu(e.id)}${e.mutation === null ? "" : ` · ${FAMILY_RU[e.mutation.family]}`}`;
      if (e.result === null) return { main: `вручную · ${name}`, sub: `отклонена: ${e.rejected ?? ""}`, cls: "lost" };
      return { main: `вручную · ${name}`, sub: `${OP_RU[e.result.op]} → ${targetName(step.before ?? body, e.result.target)}`, cls: "" };
    }
    case "attach": {
      const name = `редактор · ${attachRu(e.command.part)}`;
      if (e.result === null) return { main: name, sub: `отклонено: ${e.rejected ?? ""}`, cls: "lost" };
      return { main: name, sub: `${OP_RU[e.result.op]} → ${targetName(step.before ?? body, e.result.target)}`, cls: "" };
    }
    case "cut":
      return { main: `разрез: ${segmentName(step.before ?? body, e.segment)}`, sub: `у конца ${e.end}; отпало частей: ${e.result.others.length}`, cls: "cut" };
    case "separate":
      return { main: `отделение: ${brainName(step.before ?? body, e.brain)}`, sub: e.result === null ? "нечего отделять" : `граница ${e.result.border.length}, боль ${e.result.pain}`, cls: "cut" };
    case "sway":
      return { main: `sway ${e.from} → ${e.to}`, sub: brainName(body, e.brain), cls: "sway" };
    case "tick": {
      const notes: string[] = [];
      if (e.brainDead) notes.push("твой мозг мёртв");
      if (e.fallen.length > 0) notes.push(`отпало ${e.fallen.length}`);
      if (e.necrotic.length > 0) notes.push(`некроз ${e.necrotic.length}`);
      if (e.crept.length > 0) notes.push(`покров +${e.crept.length}`);
      if (e.wandered.length > 0) notes.push(`миграций ${e.wandered.length}`);
      if (e.pressed.length > 0) notes.push(`давление на ${e.pressed.length}`);
      if (e.regrown.length > 0) notes.push(`отросло ${e.regrown.length}`);
      return { main: `+${e.turns} ход${e.turns === 1 ? "" : e.turns < 5 ? "а" : "ов"}`, sub: notes.length === 0 ? "тихо" : notes.join(", "), cls: "tick" };
    }
    case "strip": {
      const c = e.command;
      const main = c.t === "unmutate" ? `снята мутация шага ${c.step}` : c.at === "limb" ? `снята часть за ${segmentName(step.before ?? body, c.id)}` : "вырезан орган";
      return { main, sub: e.result === null ? "там ничего не было" : `ушло: ${stripSummary(e.result)}`, cls: "cut" };
    }
    case "reshape": {
      const gone = reshapeGone(e.result);
      return { main: RESHAPE_VERB[e.command.r.t], sub: gone.length === 0 ? "там ничего не было" : `ушло: ${gone.join(", ")}`, cls: "cut" };
    }
    case "eat":
      return { main: `съедено: ${eatableRu(e.part)} ×${e.n}`, sub: `во вкусе: ${eatenRu(body) || "ничего"}`, cls: "tick" };
  }
}

/** `глаз, кисть · узлов 1, сегментов 1 · масса 3` - what a strip takes, in one line. */
function stripSummary(r: Stripped): string {
  const bits: string[] = [];
  if (r.organs.length > 0) bits.push(organsRu(r.organs));
  if (r.nodes.length + r.segments.length > 0) bits.push(`узлов ${r.nodes.length}, сегментов ${r.segments.length}`);
  if (r.membranes.length > 0) bits.push(`перепонок ${r.membranes.length}`);
  return bits.length === 0 ? "ничего" : `${bits.join(" · ")} · масса ${fmt(r.lost)}`;
}

/** A button that issues a removal, with its outcome on the body it lands on and a warning when something vital goes. */
function stripButton(body: Body, cmd: ExciseCommand | UnmutateCommand, label: string): string {
  const r = stripPreview(body, cmd);
  if (r === null || r.organs.length + r.nodes.length + r.segments.length + r.membranes.length === 0) return "";
  const vital = r.vital.length === 0 ? "" : ` <span class="c-flesh">⚠ жизненно важное: ${esc(organsRu(r.vital))}</span>`;
  return `<li><button class="btn small" data-strip="${encodeCommand(cmd)}">${esc(label)}</button> ${esc(stripSummary(r))}${vital}</li>`;
}

/** ` · нужда сердце ×2,6, место ×2,5` - what the needs did for the row (step J); empty when none pushed. */
function needNote(e: MutateEvent): string {
  const pushed = e.needs.filter((n) => Math.abs(n.draw - 1) > 1e-9 || Math.abs(n.place - 1) > 1e-9);
  if (pushed.length === 0) return "";
  return " · " + pushed.map((n) => `нужда ${NEED_RU[n.kind]} ×${fmt(Math.round(n.draw * 100) / 100)}${Math.abs(n.place - 1) > 1e-9 ? `, место ×${fmt(Math.round(n.place * 100) / 100)}` : ""}`).join("; ");
}

function renderTape(): void {
  const rows = app.run.steps.map((step) => {
    const t = stepTitle(step);
    return `<div class="step ${t.cls}" data-step="${step.index}"><span class="n mono">${step.index}</span><div class="txt"><div class="main">${esc(t.main)}</div><div class="sub">${esc(t.sub)}</div></div></div>`;
  });
  $("tape").innerHTML = `<div class="cap">лента · ${app.run.steps.length - 1} шаг${plural(app.run.steps.length - 1)}</div>${rows.join("")}`;
  markTape();
}

function plural(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m100 >= 11 && m100 <= 14) return "ов";
  if (m10 === 1) return "";
  if (m10 >= 2 && m10 <= 4) return "а";
  return "ов";
}

function markTape(): void {
  const i = stepIndex();
  for (const el of $("tape").querySelectorAll<HTMLElement>(".step")) {
    const on = Number(el.dataset.step) === i;
    el.classList.toggle("on", on);
    if (on) el.scrollIntoView({ block: "nearest" });
  }
}

// ---------------------------------------------------------------- canvas

function separationMark(body: Body, key: string): SeparateMark | null {
  const ref = parseBrainKey(key);
  if (ref === null) return null;
  const { list } = foreignOverlays(body);
  const index = list.findIndex((t) => t.brain.key === key);
  if (index < 0) return null;
  const terr = list[index]!;
  const clone = cloneBody(body);
  const sep = separate(clone, ref);
  if (sep === null) return null;
  const inside = new Set(terr.nodes);
  const border = terr.border.map((sid) => {
    const s = body.segments[sid]!;
    const mineEnd: End = inside.has(s.a) ? "b" : "a";
    const mine = clone.segments[sid]?.length ?? 0;
    return { segment: sid, mineShare: Math.min(1, mine / s.length), mineEnd };
  });
  return { border, leaves: { nodes: terr.nodes, segments: terr.segments, membranes: [] }, bleeding: [...sep.bleeding, ...sep.leaves.bleeding], color: TERRITORY_COLORS[index % TERRITORY_COLORS.length]! };
}

function sceneFor(r: Run, step: Step, size: number, main: boolean): string {
  const body = step.body;
  const mode = viewMode();
  if (mode === "s96") {
    const px = 96;
    const plan = spritePlan(body, px, { layout: shownLayout(body, "sqrt") });
    return `<div class="tile">${spriteSvg(plan, Math.max(2, Math.floor(Math.min(size, 384) / px)))}</div>`;
  }
  if (mode === "sprite") {
    const frame = composeBody(body, { layout: shownLayout(body, "sqrt"), seed: app.state.seed, t: 0.4 });
    const v = frame.box ?? { x0: 0, y0: 0, x1: frame.w - 1, y1: frame.h - 1 };
    const w = v.x1 - v.x0 + 3;
    const h = v.y1 - v.y0 + 3;
    const cell = Math.max(1, Math.floor(size / Math.max(w, h)));
    // Cropped to the silhouette with a pixel of margin, drawn by whole pixels.
    const svg = frameSvg(frame).replace(/width="\d+" height="\d+" viewBox="[^"]*"/, `width="${w * cell}" height="${h * cell}" viewBox="${v.x0 - 1} ${v.y0 - 1} ${w} ${h}"`);
    return `<div class="tile">${svg}</div>`;
  }
  const scale = scaleOf(mode);
  const l = shownLayout(body, scale);
  const scene: Scene = {
    body,
    layout: l,
    size,
    territories: foreignOverlays(body).overlays,
    highlight: main && room() ? roomHighlight(body) : { added: step.added, changed: step.changed, removed: step.removed, before: step.before, beforeLayout: step.before === null ? null : shownLayout(step.before, scale) },
    hit: main,
    hitTitle: room() ? "клик — на операционный стол" : placing() ? "клик — поставить сюда выбранную строку" : "клик — карточка части",
    labels: app.labels,
  };
  if (main && placing()) {
    const list = placeTargets(body, app.pick.id);
    scene.candidates = { list, chosen: app.place.hover === null ? null : (list[app.place.hover]?.target ?? null), base: null };
  } else if (step.event.kind === "mutate" && step.event.result !== null) {
    scene.candidates = { list: step.event.candidates, chosen: step.event.target, base: step.event.base };
  } else if (step.event.kind === "place" && step.event.result !== null) {
    scene.candidates = { list: step.event.candidates, chosen: step.event.result.target, base: null };
  }
  if (step.event.kind === "cut" || step.event.kind === "separate") {
    const pieces: DetachedPiece[] = step.event.detached.map((d) => ({ body: d.body, label: `${FATE_RU[d.fate]?.split(":")[0] ?? d.fate}${d.lifetime === null ? "" : ` · ${d.lifetime} ходов`}` }));
    if (pieces.length > 0) scene.detached = pieces;
  }
  // The part whose card is open is ringed, not cut: the knife lives in the operating room.
  const card = main ? shownPart(body) : undefined;
  if (card !== undefined) scene.rings = [...(scene.rings ?? []), { ids: { nodes: "node" in card ? [card.node] : [], segments: "segment" in card ? [card.segment] : [], membranes: [] }, color: TONE.amber }];
  if (main && app.sepPreview !== null) {
    const mark = separationMark(body, app.sepPreview);
    if (mark !== null) scene.separate = mark;
  }
  void r;
  return sceneSvg(scene);
}

function renderCanvasBar(): void {
  const modes = VIEW_MODES.map((m) => `<button class="tab${viewMode() === m ? " on" : ""}" data-view="${m}">${esc(VIEW_RU[m])}</button>`).join("");
  const step = currentStep();
  $("canvas-bar").innerHTML = `<div class="modes">${modes}</div><label class="chk small"><input type="checkbox" id="labels"${app.labels ? " checked" : ""}> id</label>${app.view.pins === undefined ? "" : `<button class="btn small" id="unpin" title="вернуть узлы туда, куда их кладёт укладка">сбросить позиции</button>`}<span class="hash mono" title="хэш тела">${step.hash.slice(0, 8)}</span>`;
  $("labels").addEventListener("change", () => {
    app.labels = ($("labels") as HTMLInputElement).checked;
    renderCanvas();
  });
  document.getElementById("unpin")?.addEventListener("click", () => {
    delete app.view.pins;
    renderCanvasBar();
    renderCanvas();
    syncHash();
  });
}

function renderCanvas(): void {
  const step = currentStep();
  const compare = app.other !== null && app.view.compare === true;
  const room = Math.max(360, $("canvases").clientWidth - 24);
  const size = compare ? Math.min(560, Math.floor((room - 12) / 2)) : Math.min(900, room);
  const main = `<figure class="fig main"><figcaption>${compare ? (app.state.spread ? "с расползанием" : "без расползания") : "шаг " + step.index}</figcaption>${sceneFor(app.run, step, size, true)}</figure>`;
  let other = "";
  if (compare && app.other !== null) {
    const o = app.other.steps[Math.min(step.index, app.other.steps.length - 1)]!;
    other = `<figure class="fig other"><figcaption>${app.state.spread ? "без расползания" : "с расползанием"} · тот же сид</figcaption>${sceneFor(app.other, o, size, false)}</figure>`;
  }
  $("canvases").innerHTML = main + other;
  $("canvases").classList.toggle("pair", compare);
}

// ---------------------------------------------------------------- the card of a part

/** The card's part when the body on the screen still has it. */
function shownPart(body: Body): PartRef | undefined {
  const ref = app.view.info;
  if (ref === undefined) return undefined;
  if ("node" in ref) return body.nodes[ref.node] === undefined ? undefined : ref;
  return body.segments[ref.segment] === undefined ? undefined : ref;
}

/** A click on the body: the card of the part, a window over the same state, no move and no cut. */
function openPart(ref: PartRef): void {
  app.view.info = ref;
  renderCanvas();
  renderInfo();
  syncHash();
}

function closePart(): void {
  if (app.view.info === undefined) return;
  delete app.view.info;
  renderCanvas();
  renderInfo();
  syncHash();
}

/** The card as a panel over the page: the body underneath does not move while it is open. */
function renderInfo(): void {
  const back = $("info");
  const ref = shownPart(currentStep().body);
  if (ref === undefined) {
    back.hidden = true;
    back.innerHTML = "";
    return;
  }
  back.hidden = false;
  back.innerHTML = `<div class="info-card" role="dialog" aria-modal="false">${partInfoHtml(currentStep().body, ref)}</div>`;
}

function bindInfo(): void {
  $("info").addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    // Outside the card, or the close button: the card goes.
    if (t.closest(".info-card") === null || t.closest("[data-info-close]") !== null) {
      closePart();
      return;
    }
    const room = t.closest<HTMLElement>("[data-info-room]");
    if (room === null) return;
    const ref = shownPart(currentStep().body);
    closePart();
    setMode("room");
    if (ref === undefined) return;
    const part = partsOf(currentStep().body).find((p) => ("segment" in ref ? p.segment === ref.segment : p.tip === ref.node));
    if (part !== undefined) selectPart(partKey(part));
  });
}

function bindCanvas(): void {
  $("canvases").addEventListener("click", (e) => {
    const target = e.target as Element;
    if (app.drag?.moved === true) return;
    if (room() && target.closest("figure.main") !== null) {
      // The operating room: a click on the body puts the part under it on the table.
      const hit = target.closest<SVGElement>("[data-node],[data-seg]");
      if (hit === null) return;
      const body = currentStep().body;
      const parts = partsOf(body);
      const part = hit.dataset.seg !== undefined ? parts.find((p) => p.segment === Number(hit.dataset.seg)) : parts.find((p) => p.tip === Number(hit.dataset.node));
      if (part !== undefined) selectPart(partKey(part));
      return;
    }
    if (placing() && target.closest("figure.main") !== null) {
      // By hand: a click on a node or a segment that is a place of the row places it there.
      const hit = target.closest<SVGElement>("[data-node],[data-seg]");
      if (hit === null) return;
      const t: Target = hit.dataset.node !== undefined ? { node: Number(hit.dataset.node) } : { segment: Number(hit.dataset.seg) };
      if (placeTargets(currentStep().body, app.pick.id).some((w) => JSON.stringify(w.target) === JSON.stringify(t))) placeAt(t);
      return;
    }
    // Plain looking: a click on a part opens its card. Nothing is cut here.
    const hit = target.closest<SVGElement>("[data-node],[data-seg]");
    if (hit !== null) {
      openPart(hit.dataset.node !== undefined ? { node: Number(hit.dataset.node) } : { segment: Number(hit.dataset.seg) });
      return;
    }
    if (app.view.info !== undefined && target.closest("figure.main") !== null) closePart();
  });
}

/** A point of the page in layout units of the main figure. */
function layoutPoint(clientX: number, clientY: number): { x: number; y: number } | null {
  const svg = document.querySelector<SVGSVGElement>("#canvases figure.main svg");
  const ctm = svg?.getScreenCTM() ?? null;
  if (ctm === null) return null;
  const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  return { x: pt.x / SVG_UNIT, y: pt.y / SVG_UNIT };
}

/** Dragging a node: only a look, the graph stays; the pin goes into the hash on release. */
function bindDrag(): void {
  let frame = 0;
  $("canvases").addEventListener("pointerdown", (e) => {
    const mode = viewMode();
    if (e.button !== 0 || mode !== "full") return;
    const hit = (e.target as Element).closest<SVGElement>("figure.main [data-node]");
    if (hit === null) return;
    const body = currentStep().body;
    const base = layoutOf(body, scaleOf(mode));
    app.drag = { node: Number(hit.dataset.node), base, bbox: shownLayout(body, scaleOf(mode)).bbox, moved: false, x: e.clientX, y: e.clientY };
    e.preventDefault();
  });
  window.addEventListener("pointermove", (e) => {
    const d = app.drag;
    if (d === null) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return;
    d.moved = true;
    const at = layoutPoint(e.clientX, e.clientY);
    if (at === null) return;
    app.view.pins = pinAt(app.view.pins ?? {}, d.base, d.node, at);
    if (frame === 0)
      frame = requestAnimationFrame(() => {
        frame = 0;
        renderCanvas();
        document.querySelector("#canvases figure.main")?.classList.add("dragging");
      });
  });
  window.addEventListener("pointerup", () => {
    const d = app.drag;
    if (d === null) return;
    // The click that ends a drag is not a click on the body.
    window.setTimeout(() => {
      app.drag = null;
      if (!d.moved) return;
      const pins = prunePins(app.view.pins ?? {}, currentStep().body);
      if (Object.keys(pins).length === 0) delete app.view.pins;
      else app.view.pins = pins;
      renderCanvasBar();
      renderCanvas();
      syncHash();
    }, 0);
  });
}

// ---------------------------------------------------------------- player

function renderPlayer(): void {
  const i = stepIndex();
  const n = lastIndex();
  $("player").innerHTML = `
<button class="btn icon" data-go="first" title="в начало">⏮</button>
<button class="btn icon" data-go="prev" title="шаг назад (←)">◀</button>
<button class="btn icon play" data-go="play" title="проиграть (пробел)">${app.playing ? "⏸" : "▶"}</button>
<button class="btn icon" data-go="next" title="шаг вперёд (→)">▶</button>
<button class="btn icon" data-go="last" title="в конец">⏭</button>
<input type="range" id="scrub" min="0" max="${n}" value="${i}" class="scrub">
<span class="mono where">${i} / ${n}</span>
<label class="speed">скорость <input type="range" id="speed" min="1" max="10" value="${app.speed}"> <span class="mono">${app.speed}/с</span></label>`;
  $("player").querySelectorAll<HTMLElement>("[data-go]").forEach((b) =>
    b.addEventListener("click", () => {
      switch (b.dataset.go) {
        case "first":
          stop();
          setStep(0);
          break;
        case "prev":
          stop();
          setStep(stepIndex() - 1);
          break;
        case "next":
          stop();
          setStep(stepIndex() + 1);
          break;
        case "last":
          stop();
          setStep(lastIndex());
          break;
        case "play":
          if (app.playing) stop();
          else play();
          break;
        default:
          break;
      }
    }),
  );
  $("scrub").addEventListener("input", () => {
    stop();
    setStep(Number(($("scrub") as HTMLInputElement).value));
  });
  $("speed").addEventListener("input", () => {
    app.speed = Number(($("speed") as HTMLInputElement).value);
    $("player").querySelector(".speed .mono")!.textContent = `${app.speed}/с`;
    if (app.playing) {
      window.clearInterval(app.timer);
      app.playing = false;
      play();
    }
  });
}

// ---------------------------------------------------------------- step detail

function candidateRows(body: Body, e: MutateEvent): string {
  const list = e.candidates.map((w, i) => ({ w, base: e.base?.[i] ?? null })).sort((p, q) => q.w.weight - p.w.weight);
  let total = 0;
  for (const c of list) total += c.w.weight;
  const chosen = e.target === null ? "" : JSON.stringify(e.target);
  const top = list.slice(0, 14);
  const rows = top.map(({ w, base }) => {
    const on = JSON.stringify(w.target) === chosen;
    const pull = base !== null && Math.abs(base.weight - w.weight) > 1e-9 ? `<span class="faint">= ${fmt(base.weight)} × ${fmt(w.weight / base.weight)}</span>` : "";
    return `<tr class="${on ? "on" : ""}"><td>${on ? "◉" : "·"}</td><td>${esc(targetName(body, w.target))}</td><td class="mono r">${fmt(w.weight)} ${pull}</td><td class="mono r">${total > 0 ? ((100 * w.weight) / total).toFixed(1) : "0"} %</td></tr>`;
  });
  const more = list.length > top.length ? `<tr><td></td><td class="faint" colspan="3">… ещё ${list.length - top.length}</td></tr>` : "";
  const head = e.base !== null ? "вес = §8 × соседство" : "вес по §8";
  return `<table class="cands"><thead><tr><th></th><th>цель</th><th class="r">${head}</th><th class="r">доля</th></tr></thead><tbody>${rows.join("")}${more}</tbody></table>`;
}

function derivedRows(step: Step): string {
  if (step.derived.length === 0) return `<p class="faint">числа не сдвинулись</p>`;
  return `<div class="moves">${step.derived.map((d) => `<span class="move"><b>${esc(SUMMARY_RU[d.key] ?? d.key)}</b> <span class="was">${esc(fmt(d.before))}</span> → <span class="now">${esc(fmt(d.after))}</span></span>`).join("")}</div>`;
}

function renderDetail(): void {
  if (room()) {
    renderOperations();
    return;
  }
  const step = currentStep();
  const e = step.event;
  const before = step.before ?? step.body;
  const parts: string[] = [];
  const t = stepTitle(step);
  parts.push(`<h3>шаг ${step.index} · ${esc(t.main)}</h3>`);
  if (e.kind === "mutate") {
    if (e.mutation !== null) {
      const m = e.mutation;
      const draw = e.draw === null ? "" : ` · выпала с весом ${fmt(e.draw.weight)} из ${fmt(e.draw.total)} (${((100 * e.draw.weight) / Math.max(1e-9, e.draw.total)).toFixed(1)} %) среди ${e.draw.rows} строк`;
      const defect = e.defect === null ? "" : e.defect ? " · бросок на дефект: да" : " · бросок на дефект: нет";
      parts.push(`<p><b>${esc(mutationRu(m.id))}</b> <span class="mono faint">${m.id}</span> · ${esc(FAMILY_RU[m.family])} · ${OP_RU[m.op]}${esc(defect)}${esc(draw)}</p>`);
      if (e.result === null) {
        parts.push(`<p class="c-flesh">потеряна: у мутации ${e.own} мест, и наросту тоже некуда встать; ни один орган не ушёл</p>`);
      }
      else {
        const r = e.result;
        const notes: string[] = [];
        if (r.fallback) notes.push(`у мутации не было места (кандидатов ${e.own}) — вырос НАРОСТ у ${targetName(before, r.target)}`);
        else notes.push(`${OP_RU[r.op]} → <b>${esc(targetName(before, r.target))}</b>${r.steps > 1 ? ` за ${r.steps} операций` : ""}`);
        if (r.grown > 0) notes.push(`плоть выросла на ${fmt(r.grown)}, запас платит ${fmt(r.reserve)}`);
        if (r.displaced.length > 0 || r.shed.length > 0) {
          let freed = 0;
          for (const o of r.displaced) freed += organMass(o);
          for (const id of r.shed) freed += segmentMass(before.segments[id]!);
          const limbs = r.shed.length === 0 ? "" : ` и целиком: ${r.shed.map((id) => esc(segmentName(before, id))).join(", ")}`;
          notes.push(`<span class="c-bile">бездна на потолке скелета вытеснила разом: ${esc(organsRu(r.displaced))}${limbs} (масса ${fmt(freed)})</span>`);
        }
        if (r.infected !== null) notes.push(`<span class="c-bio">заражение: ${esc(segmentName(step.body, r.infected))} стал щупальцем</span>`);
        if (r.orphan) notes.push(`<span class="c-bio">строка-сирота: окончания для неё в теле нет, и она вырастила его ОТРОСТКОМ к узлу конечности</span>`);
        for (const n of e.needs) {
          if (Math.abs(n.draw - 1) <= 1e-9 && Math.abs(n.place - 1) <= 1e-9) continue;
          notes.push(`нужда <b>${esc(NEED_RU[n.kind])}</b> силой ${n.strength.toFixed(2)}: строка в выборке ×${fmt(Math.round(n.draw * 100) / 100)}${Math.abs(n.place - 1) > 1e-9 ? `, выбранное место ×${fmt(Math.round(n.place * 100) / 100)}` : ""}`);
        }
        if (r.evicted.length > 0) notes.push(`выдавлено из полости: ${r.evicted.map((o) => esc(ORGANS[o.kind].ru)).join(", ")}`);
        if (r.removed.length > 0) notes.push(`убрано: ${r.removed.map((id) => esc(elementName(before, id))).join(", ")}`);
        parts.push(`<ul class="notes">${notes.map((n) => `<li>${n}</li>`).join("")}</ul>`);
        parts.push(`<div class="cap">кандидаты · ${e.candidates.length}${r.fallback ? " (наросту)" : ""}</div>`);
        parts.push(candidateRows(before, e));
      }
    } else parts.push(`<p class="faint">источник не дал мутации</p>`);
  } else if (e.kind === "place") {
    parts.push(`<p><b>${esc(mutationRu(e.id))}</b> <span class="mono faint">${e.id}</span>${e.mutation === null ? "" : ` · ${esc(FAMILY_RU[e.mutation.family])} · ${OP_RU[e.mutation.op]}`} · вручную, без броска</p>`);
    if (e.result === null) parts.push(`<p class="c-flesh">отклонена: ${esc(e.rejected ?? "")}</p>`);
    else {
      const r = e.result;
      const notes = [`${OP_RU[r.op]} → <b>${esc(targetName(before, r.target))}</b>${r.steps > 1 ? ` за ${r.steps} операций` : ""}`];
      if (r.grown > 0) notes.push(`плоть выросла на ${fmt(r.grown)}, запас платит ${fmt(r.reserve)}`);
      if (r.evicted.length > 0) notes.push(`выдавлено из полости: ${r.evicted.map((o) => esc(ORGANS[o.kind].ru)).join(", ")}`);
      if (r.removed.length > 0) notes.push(`убрано: ${r.removed.map((id) => esc(elementName(before, id))).join(", ")}`);
      parts.push(`<ul class="notes">${notes.map((n) => `<li>${n}</li>`).join("")}</ul>`);
    }
    parts.push(`<div class="cap">мест у строки · ${e.candidates.length}</div><p class="faint">${e.candidates.map((w) => esc(targetName(before, w.target))).join(" · ") || "ни одного"}</p>`);
  } else if (e.kind === "cut") {
    const r = e.result;
    const lines = r.others.map((o) => `${esc(FATE_RU[o.fate] ?? o.fate)}: узлов ${o.part.nodes.length}, сегментов ${o.part.segments.length}`);
    parts.push(`<ul class="notes"><li>отпало частей: ${r.others.length}${lines.length > 0 ? " — " + lines.join("; ") : ""}</li><li>кровь на гранях: ${r.bleeding.length === 0 ? "нет" : r.bleeding.map((id) => esc(elementName(before, id))).join(", ")}</li>${r.stump !== null ? `<li>культя: узел ${r.stump}</li>` : ""}${r.torn.length > 0 ? `<li>порваны перепонки: ${r.torn.join(", ")}</li>` : ""}</ul>`);
  } else if (e.kind === "separate") {
    if (e.result === null) parts.push(`<p class="faint">отделять нечего: мозг мёртв, без территории или уже держит твой</p>`);
    else {
      const r = e.result;
      parts.push(`<ul class="notes"><li>граница: ${r.border.map((id) => esc(segmentName(before, id))).join(", ")} · боль ${r.pain}</li><li>ушло: ${esc(FATE_RU[r.leaves.fate] ?? r.leaves.fate)}, узлов ${r.leaves.part.nodes.length}${r.leaves.lifetime !== null ? `, живёт ${r.leaves.lifetime} ходов без сердца` : ""}</li>${r.others.length > 0 ? `<li>вместе с ней оторвалось: ${r.others.map((o) => esc(FATE_RU[o.fate] ?? o.fate)).join("; ")}</li>` : ""}<li>кровь у тебя: ${r.bleeding.length === 0 ? "нет" : r.bleeding.map((id) => esc(elementName(step.body, id))).join(", ")}</li></ul>`);
    }
  } else if (e.kind === "sway") {
    parts.push(`<p>${esc(brainName(step.body, e.brain))}: sway ${e.from} → ${e.to}${e.missing ? " (мозга нет)" : ""}</p>`);
  } else if (e.kind === "tick") {
    const notes: string[] = [];
    if (e.brainDead) notes.push(`<span class="c-flesh">твой мозг 5 ходов без крови — смерть игры</span>`);
    if (e.necrotic.length > 0) notes.push(`органы погибли (40 ходов без крови): ${e.necrotic.map((id) => esc(elementName(before, id))).join(", ")}`);
    if (e.fallen.length > 0) notes.push(`отпало (80 ходов): ${e.fallen.map((id) => esc(elementName(before, id))).join(", ")}`);
    if (e.crept.length > 0) notes.push(`покров пополз: ${e.crept.map((c) => `${esc(segmentName(step.body, c.segment))} ← ${esc(c.cover)}`).join(", ")}`);
    if (e.wandered.length > 0) notes.push(`миграция: ${e.wandered.map((w) => `окончание ${w.index} узла ${w.node} → узел ${w.to}`).join(", ")}`);
    if (e.pressed.length > 0) notes.push(`опухоль давит на ${e.pressed.map((id) => esc(elementName(step.body, id))).join(", ")}`);
    if (e.regrown.length > 0) notes.push(`отросло по памяти плоти: ${e.regrown.join(", ")}`);
    parts.push(notes.length === 0 ? `<p class="faint">за ${e.turns} ход(ов) ничего не случилось: раны затягиваются, кровь идёт</p>` : `<ul class="notes">${notes.map((n) => `<li>${n}</li>`).join("")}</ul>`);
  } else if (e.kind === "eat") {
    parts.push(`<p>съедено: ${esc(eatableRu(e.part))} ×${e.n}. Строки, что растят съеденное, весят ×(1 + ${fmt(DIET.k)}·съеденное), не больше ×${DIET.cap}; вкус вдвое слабеет за ${DIET.halfLife} ходов.</p><p class="faint">во вкусе: ${esc(eatenRu(step.body) || "ничего")}</p>`);
} else parts.push(`<p class="faint">стартовое тело. Мутируй кнопками слева; клик по узлу или сегменту — карточка части.</p>`);
  if (e.kind === "mutate" && e.result !== null) {
    const button = stripButton(app.run.body, { t: "unmutate", step: step.index }, "снять мутацию");
    parts.push(`<div class="preview"><div class="cap">снять эту мутацию в конце ленты — только то, что она вырастила; что выросло поверх, уйдёт с ней</div><ul class="notes">${button === "" ? "<li>нечего: она ничего не создала или созданное уже ушло; изменения (обхват, покров, перерождение) не откатываются</li>" : button}</ul></div>`);
  }
  if (app.sepPreview !== null) {
    const ref = parseBrainKey(app.sepPreview);
    const sep = ref === null ? null : separate(cloneBody(step.body), ref);
    if (sep !== null) {
      parts.push(`<div class="preview head"><div class="cap">предпросмотр отделения · ${esc(brainName(step.body, app.sepPreview))}</div><ul class="notes"><li>граница: ${sep.border.map((id) => esc(segmentName(step.body, id))).join(", ")} · боль ${sep.pain}</li><li>уйдёт: ${esc(FATE_RU[sep.leaves.fate] ?? sep.leaves.fate)}, узлов ${sep.leaves.part.nodes.length}${sep.leaves.lifetime !== null ? `, проживёт ${sep.leaves.lifetime} ходов без сердца` : ""}</li>${sep.others.length > 0 ? `<li>вместе с ней оторвётся: ${sep.others.map((o) => esc(FATE_RU[o.fate] ?? o.fate)).join("; ")}</li>` : ""}<li>кровь у тебя: ${sep.bleeding.length === 0 ? "нет" : sep.bleeding.length + " гран."}</li></ul></div>`);
    }
  }
  parts.push(`<div class="cap">сдвиги чисел</div>${derivedRows(step)}`);
  $("step-detail").innerHTML = parts.join("");
}

// ---------------------------------------------------------------- heads

function renderHeads(): void {
  const step = currentStep();
  const body = step.body;
  const list = brains(body);
  const foreign = foreignOverlays(body).list;
  const rows = list.map((b: Brain) => {
    const fi = foreign.findIndex((t) => t.brain.key === b.key);
    const color = b.self ? TONE.amber : TERRITORY_COLORS[Math.max(0, fi) % TERRITORY_COLORS.length]!;
    const terr = foreign[fi];
    const tags: string[] = [];
    if (!b.alive) tags.push(`<span class="tag flesh">мёртв</span>`);
    if (!b.self && b.alive && seizesBody(body, b.ref)) tags.push(`<span class="tag flesh">перехват тела</span>`);
    const size = b.self ? "" : `<span class="faint">территория: ${terr === undefined ? 0 : terr.nodes.length} узл., ${terr === undefined ? 0 : terr.segments.length} сегм., граница ${terr === undefined ? 0 : terr.border.length}</span>`;
    const sway = b.self
      ? `<span class="tag">ты</span>`
      : `<label class="sway">sway <input type="range" min="0" max="10" value="${b.sway}" data-sway="${b.key}"> <span class="mono">${b.sway}</span></label>`;
    const canSeparate = !b.self && b.alive && terr !== undefined && terr.nodes.length > 0 && !seizesBody(body, b.ref);
    const sep = b.self ? "" : `<button class="btn small" data-sep="${b.key}"${canSeparate ? "" : " disabled"} title="${canSeparate ? "наведи — предпросмотр, клик — отделить" : "нечего отделять"}">отделить</button>`;
    return `<div class="brain"><i class="sw" style="background:${color}"></i><div class="txt"><div class="main">${esc(brainName(body, b.key))} ${tags.join(" ")}</div><div class="sub">${sway} ${size}</div></div>${sep}</div>`;
  });
  $("heads").innerHTML = `<div class="cap">головы · ${list.length}</div>${rows.join("")}`;
  $("heads").querySelectorAll<HTMLInputElement>("[data-sway]").forEach((input) => {
    input.addEventListener("input", () => {
      input.parentElement!.querySelector(".mono")!.textContent = input.value;
    });
    input.addEventListener("change", () => {
      forkIfPast();
      push({ t: "sway", brain: input.dataset.sway!, sway: Number(input.value) });
    });
  });
  $("heads").querySelectorAll<HTMLButtonElement>("[data-sep]").forEach((btn) => {
    btn.addEventListener("mouseenter", () => {
      app.sepPreview = btn.dataset.sep!;
      app.view.brain = app.sepPreview;
      renderCanvas();
      renderDetail();
      syncHash();
    });
    btn.addEventListener("mouseleave", () => {
      app.sepPreview = null;
      delete app.view.brain;
      renderCanvas();
      renderDetail();
      syncHash();
    });
    btn.addEventListener("click", () => {
      app.sepPreview = null;
      forkIfPast();
      push({ t: "separate", brain: btn.dataset.sep! });
    });
  });
}

/** A command issued while looking at the past cuts the tape there. */
function forkIfPast(): void {
  if (stepIndex() === lastIndex()) return;
  app.state.commands = app.state.commands.slice(0, currentStep().command + 1);
  app.redo = [];
}

// ---------------------------------------------------------------- numbers

function renderNumbers(): void {
  const step = currentStep();
  const body = step.body;
  const d: Derived = derive(body);
  const s = summarize(d);
  const moved = new Map(step.derived.map((c) => [c.key, c]));
  const kv = (key: string, label?: string, value?: string): string => {
    const v = value ?? fmt(s[key] ?? "");
    const m = moved.get(key);
    const was = m === undefined ? "" : `<span class="was">${esc(fmt(m.before))} →</span> `;
    return `<div class="kv${m === undefined ? "" : " moved"}"><span class="k">${esc(label ?? SUMMARY_RU[key] ?? key)}</span><span class="v mono">${was}${esc(v)}</span></div>`;
  };
  const sec = (title: string, inner: string): string => `<section class="sec"><div class="cap">${esc(title)}</div>${inner}</section>`;
  const out: string[] = [];

  let baseLoad = 0;
  for (const o of organs(body)) baseLoad += controlOf(o, undefined);
  const tax = Math.max(0, d.budgets.control.load - baseLoad);
  out.push(
    sec(
      "бюджеты",
      kv("mass", "масса / мясо / потолок", `${fmt(d.budgets.mass)} / ${fmt(d.budgets.meat)} / ${d.budgets.ceiling}`) +
        kv("upkeep") +
        kv("alien") +
        kv("load", "каналы: нагрузка / есть", `${d.budgets.control.load} / ${d.budgets.control.cap}`) +
        kv("tax", "в том числе налог расстояния", String(tax)) +
        (body.eaten === undefined ? "" : kv("eaten", "съедено (гаснет)", `${eatenRu(body)} · тянет ×(1 + ${fmt(DIET.k)}·съеденное) до ×${DIET.cap}, полураспад ${DIET.halfLife} ходов`)),
    ),
  );

  // What stands on the body by family, limbs and necks too (decision 127); only the families it has.
  const onBody = d.budgets.parts;
  const fam = FAMILIES.filter((f) => onBody[f] > 0).map((f) => kv(`fam:${f}`, FAMILY_RU[f], String(onBody[f])));
  out.push(sec("семейства: частей сверх человека", fam.join("") || `<div class="faint small">нет</div>`));

  out.push(
    sec(
      "граф",
      kv("nodes", "узлы", String(nodeIds(body).length)) +
        kv("segments", "сегменты", String(segmentIds(body).length)) +
        kv("cycles", "замкнутость", String(closure(body))) +
        kv("bridges", "мосты", String(bridges(body).length)) +
        kv("membranes", "перепонки", sortedIds(body.membranes).map((id) => `${id}: ${body.membranes[id]!.area}/${membraneArea(body, body.membranes[id]!)}`).join(", ") || "нет"),
    ),
  );

  const hp = humanoidParts(body);
  const hv = step.before === null ? null : humanoid(step.before);
  const hNow = humanoid(body);
  const hLine = hv !== null && Math.abs(hv - hNow) > 1e-9 ? `<span class="was">${hv.toFixed(2)} →</span> ` : "";
  out.push(
    sec(
      "план тела",
      `<div class="kv${hLine ? " moved" : ""}"><span class="k">человечность</span><span class="v mono">${hLine}${hNow.toFixed(2)}</span></div>` +
        [
          ["голова", hp.head],
          ["туловище", hp.trunk],
          ["руки", hp.arms],
          ["ноги", hp.legs],
          ["обхват", hp.girth],
          ["пропорции", hp.proportions],
          ["лишнее", hp.extras],
        ]
          .map(([k, v]) => `<div class="kv small"><span class="k">· ${k}</span><span class="v mono">${(v as number).toFixed(2)}</span></div>`)
          .join("") +
        kv("chain", "самая длинная цепочка", String(longestChain(body))) +
        kv("forks", "развилок (степень ≥ 3)", String(forks(body))),
    ),
  );

  const attacks = d.attacks.map((a) => `<div class="kv"><span class="k">${esc(attackWord(a.kind))} у узла ${a.node}</span><span class="v mono">${a.dice} · дос. ${a.reach} · масса ${fmt(a.mass)}</span></div>`);
  out.push(sec(`атаки · ${d.attacks.length}`, kv("reach", "лучшая досягаемость") + (attacks.join("") || `<p class="faint">нечем бить</p>`)));

  out.push(
    sec(
      "движение",
      kv("speed", "скорость", `${d.speed.value} (опора ${fmt(d.speed.support)}${d.speed.ring ? ", кольцо" : ""})`) +
        kv("grips", "хваты", `${d.grips.total} (точных ${d.grips.precise})`) +
        kv("dig") +
        kv("climb") +
        kv("swim") +
        kv("fly", "полёт", `${fmt(d.locomotion.fly)}${d.locomotion.wings.length > 0 ? ` · крылья ${d.locomotion.wings.map((w) => w.area).join(", ")}` : ""}`) +
        kv("edge") +
        kv("falls") +
        kv("squeeze") +
        kv("layEgg"),
    ),
  );

  out.push(sec("габарит", kv("bulk") + kv("footprint", "след на сетке") + kv("passage", "проход: свободно / протиснуться", `${d.passage.free} / ${d.passage.squeeze ?? "—"}`) + kv("cycles", "циклы при протискивании", String(d.passage.cycles))));

  const partsSorted = [...d.exposure.parts].filter((p) => p.share > 0).sort((p, q) => q.share - p.share);
  const barSegs = partsSorted.map((p) => {
    const color = p.kind === "membrane" ? TONE.bio : p.kind === "node" ? INK.paper3 : COVER_COLORS[body.segments[p.id]!.cover];
    return `<i style="width:${(100 * p.share).toFixed(2)}%;background:${color}" title="${esc(elementName(body, p.id))}: ${(100 * p.share).toFixed(1)} %"></i>`;
  });
  const topParts = partsSorted.slice(0, 7).map((p) => `<div class="kv"><span class="k">${esc(elementName(body, p.id))}</span><span class="v mono">${(100 * p.share).toFixed(1)} %</span></div>`);
  out.push(sec("открытость удару", kv("exposure", "вес всех частей") + `<div class="stack">${barSegs.join("")}</div>` + topParts.join("") + kv("armor", "защита (средняя)")));

  const vps = d.senses.viewpoints.map((v) => `узел ${v.node}: глаз ${v.eyes}${v.heat ? ", тепло" : ""}`).join("; ");
  out.push(sec("восприятие", kv("viewpoints", "точки обзора", `${d.senses.viewpoints.length}${vps ? " · " + vps : ""}`) + kv("eyes") + kv("heat") + kv("echo") + kv("deep") + kv("hearing") + kv("smell") + kv("speak")));

  out.push(
    sec(
      "дыхание",
      kv("air", "приток: воздух / вода", `${fmt(d.breath.intake.air)} / ${fmt(d.breath.intake.water)}`) +
        kv("tank", "баки: лёгкие + кровь + мышцы", `${fmt(d.breath.tank.lungs)} + ${fmt(d.breath.tank.blood)} + ${fmt(d.breath.tank.muscle)} = ${fmt(d.breath.tank.total)}`) +
        kv("base") +
        kv("delivery") +
        kv("media", "среда", d.breath.media.map((m) => (m === "air" ? "воздух" : "вода")).join(" + ") || "—") +
        kv("cost", "расход: шаг / удар / плавание / полёт", `${fmt(breathCost(d, "step"))} / ${fmt(breathCost(d, "strike"))} / ${fmt(breathCost(d, "swim"))} / ${fmt(breathCost(d, "fly"))}`),
    ),
  );

  const starving = d.blood.starving.map((x) => `${elementName(body, x.id)} (${x.ischemia})`).join(", ");
  out.push(sec("кровь и еда", kv("hearts", "сердца", d.blood.hearts.map((id) => segmentName(body, id)).join(", ") || "нет") + kv("starving", "без крови", starving || "никто") + kv("eats") + kv("mouths", "рты", d.eat.mouths.map((m) => `${ORGANS[m.kind].ru} у ${m.node}${m.fed ? "" : " (не кормит)"}`).join(", ") || "нет")));

  // Step J: the mind's power against its load, brain by brain.
  const powers = brainPowers(body);
  const load = mentalLoad(body);
  const power = mindPower(body);
  const powerBefore = step.before === null ? null : mindPower(step.before);
  const loadBefore = step.before === null ? null : mentalLoad(step.before).total;
  const powerLine = powerBefore !== null && Math.abs(powerBefore - power) > 1e-9 ? `<span class="was">${fmt(powerBefore)} →</span> ` : "";
  const loadLine = loadBefore !== null && Math.abs(loadBefore - load.total) > 1e-9 ? `<span class="was">${fmt(loadBefore)} →</span> ` : "";
  const brainRows = powers.map(
    (p) =>
      `<div class="kv small"><span class="k">· ${esc(brainName(body, p.brain.key))}${p.brain.self ? " (ты)" : ""}</span><span class="v mono">${fmt(p.channels)} × ${p.integrity.toFixed(2)} × ${p.blood}${p.chrome > 0 ? ` × ${(1 - p.chrome).toFixed(2)}` : ""} = ${fmt(Math.round(p.power * 100) / 100)}</span></div>`,
  );
  out.push(
    sec(
      "разум",
      `<div class="kv${powerLine ? " moved" : ""}"><span class="k">сила мозгов (каналы × целостность × кровь)</span><span class="v mono">${powerLine}${fmt(Math.round(power * 100) / 100)}</span></div>` +
        brainRows.join("") +
        `<div class="kv${loadLine ? " moved" : ""}"><span class="k">нагрузка: каналы с налогом + псионика ×2</span><span class="v mono">${loadLine}${load.control} + ${load.psionics} = ${load.total}</span></div>` +
        `<div class="kv"><span class="k">${load.total > power ? "не хватает" : "запас"}</span><span class="v mono${load.total > power ? " c-flesh" : ""}">${fmt(Math.round(Math.abs(power - load.total) * 100) / 100)}</span></div>`,
    ),
  );

  // The needs as bars: what the body lacks, and how many places want it.
  const needRows = needs(body).map((n) => {
    const before = step.before === null ? null : (needs(step.before).find((x) => x.kind === n.kind)?.strength ?? null);
    const moved = before !== null && Math.abs(before - n.strength) > 1e-9;
    const parts = Object.entries(n.parts)
      .map(([k, v]) => `${NEED_PART_RU[k] ?? k} ${fmt(Math.round(v * 100) / 100)}`)
      .join(" · ");
    const surplus = n.surplus > 0 ? ` · избыток ${n.surplus.toFixed(2)}` : "";
    return `<div class="fam${n.strength >= 1 ? " crossed" : ""}${n.strength === 0 ? " zero" : ""}" title="${esc(parts)}${esc(surplus)}"><span class="k">${esc(NEED_RU[n.kind])}</span><span class="bar"><i style="width:${(100 * n.strength).toFixed(0)}%"></i></span><span class="v mono${moved ? " c-bile" : ""}">${n.strength.toFixed(2)} (${n.places.size})</span></div>`;
  });
  out.push(sec("нужды тела · сила 0..1 (мест)", needRows.join("") + `<p class="faint">строка ×(1 + ${K_NEED} × сила) в выборке, место ×(1 + ${K_PLACE} × сила × доля); наведи — из чего сложилась</p>`));

  // What the collapse would leave: each foreign head separated, each heavy part beyond a bridge.
  const sr = survivalReport(body);
  const yesNo = (v: boolean, label: string): string => `<span class="${v ? "c-ok" : "c-flesh"}">${label}</span>`;
  const headRows = sr.heads.map(
    (h) =>
      `<div class="kv small"><span class="k">${esc(brainName(body, h.brain.key))} · ${h.nodes} узл.</span><span class="v">${yesNo(h.heart, "сердце")} ${yesNo(h.breath, "дыхание")} ${yesNo(h.eats, "пасть")} → <b>${h.survives ? "живёт" : h.lifetime !== null ? `${h.lifetime} ходов` : "гибнет"}</b></span></div>`,
  );
  const bridgeRows = sr.bridges.map(
    (b) =>
      `<div class="kv small"><span class="k">за ${esc(segmentName(body, b.segment))}: масса ${fmt(Math.round(b.mass))}, ${b.nodes} узл.</span><span class="v">${esc(FATE_RU[b.fate] ?? b.fate)} · ${yesNo(b.brain, "мозг")} ${yesNo(b.heart, "сердце")} ${yesNo(b.breath, "дыхание")} ${yesNo(b.eats, "пасть")} → <b>${b.survives ? "живёт" : "гибнет"}</b></span></div>`,
  );
  out.push(sec(`выживание при распаде · голов ${sr.heads.length}, тяжёлых мостов ${sr.bridges.length}`, (headRows.length === 0 ? `<p class="faint">чужих голов с территорией нет</p>` : headRows.join("")) + (bridgeRows.length === 0 ? `<p class="faint">за мостами меньше 20 массы</p>` : bridgeRows.join(""))));

  const gear = new Map<string, number>();
  for (const g of d.gear) gear.set(g.pattern, (gear.get(g.pattern) ?? 0) + 1);
  out.push(sec("снаряжение по образцам", kv("gear", "мест всего") + [...gear].map(([p, n]) => `<div class="kv"><span class="k">${esc(GEAR_RU[p] ?? p)}</span><span class="v mono">×${n}</span></div>`).join("")));

  out.push(`<details class="fixture"><summary>фикстура текстом</summary><pre class="mono">${esc(bodyToText(body))}</pre></details>`);
  $("numbers").innerHTML = out.join("");
}

// ---------------------------------------------------------------- tabs, keys, boot

function tab(): Tab {
  return app.view.tab ?? "lab";
}

function look(): Look {
  return app.view.look ?? "sprite";
}

/** Any creature into the lab: a new state, the lab's tab in front. */
function openInLab(state: LabState): void {
  restart(state);
  showTab("lab");
}

const genHost = {
  params: () => app.view.gen ?? DEFAULT_GEN,
  look,
  set: (params: NonNullable<View["gen"]>, l: Look) => {
    app.view.gen = params;
    app.view.look = l;
    if (l === "sprite") delete app.view.look;
    syncHash();
  },
  openInLab,
};

const zooHost = {
  shelf: (): Shelf => app.view.shelf ?? "mine",
  beast: () => app.view.beast,
  look,
  setShelf: (s: Shelf) => {
    app.view.shelf = s;
    if (s === "mine") delete app.view.shelf;
    syncHash();
  },
  setBeast: (id: string | undefined) => {
    if (id === undefined) delete app.view.beast;
    else app.view.beast = id;
    syncHash();
  },
  setLook: (l: Look) => {
    app.view.look = l;
    if (l === "sprite") delete app.view.look;
    syncHash();
  },
  labBody: () => app.run.body,
  labSeed: () => app.state.seed,
  openInLab,
};

const editorHost = {
  row: () => app.view.row,
  setRow: (id: string | undefined) => {
    if (id === undefined) delete app.view.row;
    else app.view.row = id;
    syncHash();
  },
  placeInLab: (id: string) => {
    app.pick.id = id;
    app.view.row = id;
    showTab("lab");
    setMode("hand");
  },
};

/** The arena: the lab's mutant is the body of its current step; the arena and its wound tape keep their state in the hash. */
const arenaHost = {
  labBody: () => currentStep().body,
  labSeed: () => app.state.seed,
  territories: (body: Body) => foreignOverlays(body).overlays,
  arena: () => app.view.arena,
  foe: () => app.view.foe,
  save: (encoded: string | undefined) => {
    if (encoded === undefined) delete app.view.arena;
    else app.view.arena = encoded;
    // The old strike tab's foe now stands in the arena's state.
    delete app.view.foe;
    syncHash();
  },
  damage: () => app.view.damage,
  saveDamage: (encoded: string | undefined) => {
    if (encoded === undefined) delete app.view.damage;
    else app.view.damage = encoded;
    syncHash();
  },
  openInLab,
};

const partsHost = {
  filter: (): PartsFilter => app.view.parts ?? {},
  setFilter: (f: PartsFilter) => {
    if (Object.keys(f).length === 0) delete app.view.parts;
    else app.view.parts = f;
    syncHash();
  },
  labSeed: () => app.state.seed,
  openInLab,
};

/** The editor puts parts on the lab's own mutant: its commands are the lab's, its undo the lab's. */
const editHost: EditHost = {
  run: () => app.run,
  view: () => app.view.edit ?? {},
  setView: (v) => {
    if (Object.keys(v).length === 0) delete app.view.edit;
    else app.view.edit = v;
    syncHash();
  },
  push: (cmd) => push(cmd),
  undo: () => undo(),
  redo: () => redo(),
  canRedo: () => app.redo.length > 0,
  truncate: (n) => {
    const gone = app.state.commands.splice(n);
    if (gone.length === 0) return;
    app.redo.push(...gone.reverse());
    app.view.step = undefined;
    delete app.view.info;
    recompute(false);
    renderAll();
  },
  restart: (start) => restart({ seed: app.state.seed, start, commands: [], spread: app.state.spread }),
  openInLab: () => showTab("lab"),
  layout: (body, scale) => shownLayout(body, scale),
  seed: () => app.state.seed,
};

function showTab(t: Tab): void {
  if (t === "lab") delete app.view.tab;
  else app.view.tab = t;
  for (const id of TABS) $(`page-${id}`).hidden = id !== t;
  for (const b of $("tabs").querySelectorAll<HTMLElement>(".tab")) b.classList.toggle("on", b.dataset.tab === t);
  if (t !== "lab") stop();
  if (t === "gen") showGen(genHost);
  else if (t === "zoo") renderZoo(zooHost);
  else if (t === "muts") showEditor(editorHost);
  else if (t === "arena") showArena();
  else if (t === "parts") showParts(partsHost);
  else if (t === "edit") showEdit(editHost);
  else renderCanvas();
  syncHash();
}

function bindGlobal(): void {
  $("tabs").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-tab]");
    if (b !== null) showTab(b.dataset.tab as Tab);
  });
  $("canvas-bar").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-view]");
    if (b === null) return;
    app.view.view = b.dataset.view as ViewMode;
    if (app.view.view === "full") delete app.view.view;
    renderCanvasBar();
    renderCanvas();
    syncHash();
  });
  $("step-detail").addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-strip]");
    const cmd = btn === null ? null : decodeCommand(btn.dataset.strip!);
    if (cmd === null) return;
    if (cmd.t === "excise") forkIfPast();
    push(cmd);
  });
  $("tape").addEventListener("click", (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>("[data-step]");
    if (row === null) return;
    stop();
    setStep(Number(row.dataset.step));
  });
  document.addEventListener("keydown", (e) => {
    const tag = (e.target as HTMLElement).tagName;
    // Esc closes the card wherever the focus is: a window over the state, and nothing else, listens to it.
    if (e.key === "Escape" && tab() === "lab") {
      closePart();
      return;
    }
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tab() !== "lab") return;
    if (e.key === "ArrowLeft") {
      stop();
      setStep(stepIndex() - 1);
    } else if (e.key === "ArrowRight") {
      stop();
      setStep(stepIndex() + 1);
    } else if (e.key === " ") {
      e.preventDefault();
      if (app.playing) stop();
      else play();
    }
  });
  window.addEventListener("hashchange", () => {
    const { state, view } = decode(location.hash);
    if (encode(state, view) === encode(app.state, app.view)) return;
    boot(state, view);
  });
}

function boot(state: LabState, view: View): void {
  stop();
  app.place.hover = null;
  app.state = state;
  app.view = view;
  app.redo = [];
  app.sepPreview = view.brain ?? null;
  if (state.start.kind === "text") app.textDraft = state.start.text;
  try {
    recompute(false);
    app.textError = "";
  } catch (e) {
    // A fixture that does not parse: keep its text on the screen with the error, and stand a human in for it.
    app.textError = e instanceof Error ? e.message : String(e);
    app.state = { ...state, start: { kind: "human" } };
    recompute(false);
  }
  renderAll();
  if (app.textError !== "") {
    ($("fixture-in") as HTMLTextAreaElement).value = app.textDraft;
    $("text-start").hidden = false;
    $("text-error").textContent = app.textError;
  }
  resetArena();
  showTab(view.tab ?? "lab");
  if (view.row !== undefined) app.pick.id = view.row;
  setMode(view.room === true ? "room" : view.hand === true ? "hand" : "roll");
}

/** `#…&bench=1`: renders every step once and prints the time a step takes, for the acceptance of the lab. */
function bench(): void {
  const t0 = performance.now();
  for (let i = 0; i <= lastIndex(); i++) {
    app.view.step = i;
    renderStep();
  }
  const ms = (performance.now() - t0) / (lastIndex() + 1);
  const line = `bench: ${ms.toFixed(1)} ms per step over ${lastIndex() + 1} steps`;
  console.error(line);
  app.view.step = undefined;
  renderStep();
  $("top-right").innerHTML += ` <span class="mono c-bile">${esc(line)}</span>`;
}

buildControls();
bindPlace();
bindRoom();
buildGen(genHost);
buildEditor(editorHost);
buildZoo(zooHost);
buildArena(arenaHost);
buildParts(partsHost);
buildEdit(editHost);
bindCanvas();
bindInfo();
bindDrag();
bindGlobal();
const wantBench = /[#&]bench=1/.test(location.hash);
const initial = decode(location.hash);
boot(initial.state, initial.view);
if (wantBench) bench();
