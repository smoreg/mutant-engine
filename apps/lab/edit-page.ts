/**
 * The editor tab: a palette of every part of the model's tables on the left,
 * the lab's mutant in the middle as the graph or the sprite, its numbers and
 * its history on the right. A part is dragged onto the body with the pointer
 * (a mouse at once, a finger after a long tap): the body lights only the
 * places the model gives the part, a place it refuses says why, and a drop is
 * an `attach` command pushed onto the lab's state - the same state, the same
 * #hash, the same undo. A part of the body is taken off by a click (the
 * knife's list) or by a drag into the trash. The logic is `edit.ts`; this file
 * is the DOM.
 */
import { BEASTS, attachRu, attachWhy, bodyToText, targetName, type Body, type Command, type Ids, type LabState, type Operation, type Run } from "@mutant-engine/core";
import { TONE, sceneSvg, woundSpriteSvg, type Layout, type LengthScale, type Tint } from "@mutant-engine/view";
import { attachCommand, choiceLabel, choicesAt, dropPlan, editStats, historyRows, paletteEntries, removalsAt, trashOp, type DropPlan } from "./edit.js";
import { EDIT_TEXT } from "./edit-text.js";
import type { EditView } from "./hash.js";
import { PART_TABLES, type PartEntry, type PartTable } from "./parts.js";
import { TABLE_RU } from "./parts-text.js";

export interface EditHost {
  run(): Run;
  view(): EditView;
  setView(v: EditView): void;
  push(cmd: Command): void;
  undo(): void;
  redo(): void;
  canRedo(): boolean;
  /** Keeps the first n commands; the rest go to redo. */
  truncate(n: number): void;
  restart(start: LabState["start"]): void;
  openInLab(): void;
  layout(body: Body, scale: LengthScale): Layout;
  seed(): number;
}

type El = { node: number } | { segment: number };

interface Drag {
  kind: "part" | "body";
  /** The palette's part, or the element of the body taken. */
  part?: string;
  el?: El;
  plan?: DropPlan;
  ghost: HTMLElement;
  over: El | "trash" | null;
  pointer: number;
}

/** A pointer down that is not a drag yet: a mouse drags after a few pixels, a finger after a long tap. */
interface Pending {
  x: number;
  y: number;
  pointer: number;
  touch: boolean;
  timer: number;
  start: () => void;
  /** A tap or a click that never became a drag. */
  tap?: () => void;
}

const LONG_TAP_MS = 350;
const SLOP_MOUSE = 4;
const SLOP_TOUCH = 10;

const ed = { host: null as EditHost | null, drag: null as Drag | null, pending: null as Pending | null, hover: null as El | null, menu: false };

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`no #${id}`);
  return el;
}

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function host(): EditHost {
  if (ed.host === null) throw new Error("editor has no host");
  return ed.host;
}

function body(): Body {
  return host().run().body;
}

function elId(el: El): number {
  return "node" in el ? el.node : el.segment;
}

function sameEl(a: El | null, b: El | null): boolean {
  return a !== null && b !== null && elId(a) === elId(b) && "node" in a === "node" in b;
}

// ---------------------------------------------------------------- the palette

function cardHtml(e: PartEntry): string {
  const pic = e.sprite.kind === "none" ? `<span class="ed-nopic">${esc(e.ru.slice(0, 2))}</span>` : e.sprite.svg;
  return `<button type="button" class="ed-card" data-part="${esc(e.id)}" title="${esc(e.ru)}"><span class="ed-pic">${pic}</span><span class="ed-name">${esc(e.ru)}</span></button>`;
}

function renderPalette(): void {
  const v = host().view();
  const chips = [`<button type="button" class="chip${v.table === undefined ? " on" : ""}" data-etable="">${esc(EDIT_TEXT.all)}</button>`, ...PART_TABLES.map((t) => `<button type="button" class="chip${v.table === t ? " on" : ""}" data-etable="${t}">${esc(TABLE_RU[t])}</button>`)].join("");
  $("ed-chips").innerHTML = chips;
  const input = $("ed-search") as HTMLInputElement;
  if (document.activeElement !== input && input.value !== (v.q ?? "")) input.value = v.q ?? "";
  const cards = $("ed-cards");
  // A drop re-renders the tab: the palette stays where the hand left it, and is drawn anew only for a new filter.
  const key = JSON.stringify([v.table ?? "", v.q ?? ""]);
  if (cards.dataset.key === key) return;
  cards.innerHTML = paletteEntries(v).map(cardHtml).join("");
  cards.dataset.key = key;
  cards.scrollTop = 0;
  cards.scrollLeft = 0;
}

// ---------------------------------------------------------------- the body

function canvasSize(): number {
  const box = $("ed-canvas");
  return Math.max(260, Math.min(720, box.clientWidth - 16));
}

function renderCanvas(): void {
  const b = body();
  const v = host().view();
  const tints: Tint[] = [];
  const rings: { ids: Ids; color: string }[] = [];
  const d = ed.drag;
  if (d?.plan !== undefined) tints.push({ ids: d.plan.lit, color: TONE.bio, cls: "lit" });
  const over = d !== null && d.over !== null && d.over !== "trash" ? d.over : ed.hover;
  if (over !== null) {
    const ok = d?.plan === undefined || choicesAt(d.plan, elId(over)).length > 0;
    rings.push({ ids: { nodes: "node" in over ? [over.node] : [], segments: "segment" in over ? [over.segment] : [], membranes: [] }, color: ok ? TONE.amber : TONE.flesh });
  }
  if (d?.kind === "body" && d.el !== undefined) tints.push({ ids: { nodes: "node" in d.el ? [d.el.node] : [], segments: "segment" in d.el ? [d.el.segment] : [], membranes: [] }, color: TONE.flesh, cls: "taking" });
  const size = canvasSize();
  const svg =
    v.look === "sprite"
      ? woundSpriteSvg({ body: b, layout: host().layout(b, "sqrt"), seed: host().seed(), t: 0.4, size, tints, bleeding: [], rings, hit: true })
      : sceneSvg({ body: b, layout: host().layout(b, "linear"), size, tints, rings, hit: true, hitTitle: EDIT_TEXT.remove });
  $("ed-canvas").innerHTML = svg;
}

function renderBar(): void {
  const v = host().view();
  const r = host().run();
  const last = r.steps[r.steps.length - 1]!;
  const starts = [`<option value="">${esc(EDIT_TEXT.startKeep)}</option>`, `<option value="human">${esc(EDIT_TEXT.startHuman)}</option>`, `<option value="swamp">${esc(EDIT_TEXT.startSwamp)}</option>`, ...BEASTS.map((b) => `<option value="beast:${b.id}">${esc(b.ru)}</option>`)].join("");
  $("ed-bar").innerHTML = `<label class="small">${esc(EDIT_TEXT.start)} <select id="ed-start">${starts}</select></label>
<div class="modes"><button type="button" class="tab${v.look === "sprite" ? "" : " on"}" data-elook="graph">${esc(EDIT_TEXT.graph)}</button><button type="button" class="tab${v.look === "sprite" ? " on" : ""}" data-elook="sprite">${esc(EDIT_TEXT.sprite)}</button></div>
<button type="button" class="btn small" id="ed-undo"${r.state.commands.length === 0 ? " disabled" : ""}>${esc(EDIT_TEXT.undo)}</button>
<button type="button" class="btn small" id="ed-redo"${host().canRedo() ? "" : " disabled"}>${esc(EDIT_TEXT.redo)}</button>
<button type="button" class="btn small" id="ed-copy">${esc(EDIT_TEXT.copy)}</button>
<button type="button" class="btn small" id="ed-lab">${esc(EDIT_TEXT.toLab)}</button>
<span class="hash mono" title="${esc(EDIT_TEXT.hash)}">${last.hash.slice(0, 8)}</span>`;
}

function renderSide(): void {
  const r = host().run();
  const s = editStats(r.body);
  const kv = (rows: [string, string][]): string => rows.map(([k, v]) => `<div class="kv"><span class="k">${esc(k)}</span><span class="v mono">${esc(v)}</span></div>`).join("");
  const sound = s.errors.length === 0 ? `<p class="c-ok small">${esc(EDIT_TEXT.sound)}</p>` : `<p class="err">${esc(EDIT_TEXT.broken)}: ${s.errors.map(esc).join("; ")}</p>`;
  const rows = historyRows(r);
  const history =
    rows.length === 0
      ? `<p class="faint small">${esc(EDIT_TEXT.empty)}</p>`
      : `<ol class="ed-history">${rows
          .map((h) => `<li class="${h.rejected ? "lost" : ""}"><button type="button" class="ed-hrow" data-hist="${h.index}" title="${esc(EDIT_TEXT.rollback)}"><span class="n mono">${h.index + 1}</span><span class="t">${esc(h.text)}${h.rejected ? ` · ${esc(EDIT_TEXT.rejected)}` : ""}</span></button></li>`)
          .join("")}</ol>`;
  $("ed-side").innerHTML = `<div class="cap">${esc(EDIT_TEXT.history)}</div>${history}<div class="cap">${esc(EDIT_TEXT.budgets)}</div>${kv(s.budgets)}${sound}<div class="cap">${esc(EDIT_TEXT.stats)}</div>${kv(s.summary)}`;
}

function hint(text: string, cls = ""): void {
  const h = $("ed-hint");
  h.textContent = text;
  h.className = `ed-hint ${cls}`;
}

function idleHint(): void {
  hint(matchMedia("(pointer: coarse)").matches ? EDIT_TEXT.helpTouch : EDIT_TEXT.help);
}

function renderAll(): void {
  renderPalette();
  renderBar();
  renderCanvas();
  renderSide();
  closeMenu();
  idleHint();
}

// ---------------------------------------------------------------- the menu

function closeMenu(): void {
  ed.menu = false;
  $("ed-menu").hidden = true;
}

function openMenu(x: number, y: number, title: string, items: { label: string; run: () => void }[]): void {
  const m = $("ed-menu");
  m.innerHTML = `<div class="cap">${esc(title)}</div>${items.map((it, i) => `<button type="button" class="ed-mi" data-mi="${i}">${esc(it.label)}</button>`).join("")}<button type="button" class="ed-mi faint" data-mi="-1">${esc(EDIT_TEXT.cancel)}</button>`;
  m.hidden = false;
  ed.menu = true;
  const w = Math.min(320, window.innerWidth - 16);
  m.style.width = `${w}px`;
  m.style.left = `${Math.max(8, Math.min(x, window.innerWidth - w - 8))}px`;
  m.style.top = `${Math.max(8, Math.min(y, window.innerHeight - m.offsetHeight - 8))}px`;
  m.onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-mi]");
    if (b === null) return;
    const i = Number(b.dataset.mi);
    closeMenu();
    if (i >= 0) items[i]!.run();
  };
}

function push(cmd: Command): void {
  host().push(cmd);
  renderAll();
}

function removalMenu(el: El, x: number, y: number): void {
  const b = body();
  const ops: Operation[] = removalsAt(b, el);
  const name = targetName(b, el);
  if (ops.length === 0) {
    hint(`${name}: ${EDIT_TEXT.nothingToRemove}`, "bad");
    return;
  }
  openMenu(x, y, `${EDIT_TEXT.remove}: ${name}`, ops.map((o) => ({ label: `${o.verb} · ${o.what}`, run: () => push(o.command) })));
}

// ---------------------------------------------------------------- dragging

function elementAt(x: number, y: number): El | "trash" | null {
  const hit = document.elementFromPoint(x, y);
  if (hit === null) return null;
  if (hit.closest("#ed-trash") !== null) return "trash";
  if (hit.closest("#ed-canvas") === null) return null;
  const e = hit.closest<SVGElement>("[data-node],[data-seg]");
  if (e === null) return null;
  return e.dataset.node !== undefined ? { node: Number(e.dataset.node) } : { segment: Number(e.dataset.seg) };
}

function ghostOf(label: string, pic: string): HTMLElement {
  const g = document.createElement("div");
  g.className = "ed-ghost";
  g.innerHTML = `${pic}<span>${esc(label)}</span>`;
  document.body.appendChild(g);
  return g;
}

function moveGhost(g: HTMLElement, x: number, y: number): void {
  g.style.transform = `translate(${x + 12}px, ${y + 12}px)`;
}

function startPartDrag(part: string, pointer: number, x: number, y: number, card: HTMLElement): void {
  const plan = dropPlan(body(), part);
  const pic = card.querySelector(".ed-pic")?.innerHTML ?? "";
  ed.drag = { kind: "part", part, plan, ghost: ghostOf(attachRu(part), pic), over: null, pointer };
  moveGhost(ed.drag.ghost, x, y);
  document.body.classList.add("ed-dragging");
  hint(plan.choices.length === 0 ? `${attachRu(part)}: ${EDIT_TEXT.none}` : `${attachRu(part)}: ${EDIT_TEXT.places} ${plan.choices.length}`, plan.choices.length === 0 ? "bad" : "");
  renderCanvas();
}

function startBodyDrag(el: El, pointer: number, x: number, y: number): void {
  ed.drag = { kind: "body", el, ghost: ghostOf(targetName(body(), el), ""), over: null, pointer };
  moveGhost(ed.drag.ghost, x, y);
  document.body.classList.add("ed-dragging");
  $("ed-trash").classList.add("armed");
  hint(EDIT_TEXT.trash);
  renderCanvas();
}

function dragMove(x: number, y: number): void {
  const d = ed.drag!;
  moveGhost(d.ghost, x, y);
  const over = elementAt(x, y);
  const same = over === d.over || (over !== null && over !== "trash" && d.over !== null && d.over !== "trash" && sameEl(over, d.over));
  if (same) return;
  d.over = over;
  $("ed-trash").classList.toggle("over", over === "trash");
  if (d.kind === "part" && d.plan !== undefined) {
    if (over === null || over === "trash") hint(`${attachRu(d.part!)}: ${EDIT_TEXT.places} ${d.plan.choices.length}`);
    else {
      const here = choicesAt(d.plan, elId(over));
      const b = body();
      if (here.length > 0) hint(`${EDIT_TEXT.drop} ${here.length === 1 ? choiceLabel(b, here[0]!) : `${EDIT_TEXT.pick} (${here.length})`}`, "good");
      else hint(`${EDIT_TEXT.refuse} ${targetName(b, over)} — ${attachWhy(b, d.part!, over) ?? ""}`, "bad");
    }
  }
  renderCanvas();
}

function endDrag(x: number, y: number): void {
  const d = ed.drag!;
  ed.drag = null;
  d.ghost.remove();
  document.body.classList.remove("ed-dragging");
  $("ed-trash").classList.remove("armed", "over");
  const over = elementAt(x, y);
  if (d.kind === "part" && d.plan !== undefined && over !== null && over !== "trash") {
    const here = choicesAt(d.plan, elId(over));
    if (here.length === 1) return push(attachCommand(d.part!, here[0]!));
    if (here.length > 1) {
      renderCanvas();
      const b = body();
      return openMenu(x, y, `${attachRu(d.part!)} · ${EDIT_TEXT.pick}`, here.map((c) => ({ label: choiceLabel(b, c), run: () => push(attachCommand(d.part!, c)) })));
    }
    renderCanvas();
    return hint(`${EDIT_TEXT.refuse} ${targetName(body(), over)} — ${attachWhy(body(), d.part!, over) ?? ""}`, "bad");
  }
  if (d.kind === "body" && over === "trash" && d.el !== undefined) {
    const op = trashOp(body(), d.el);
    if (op !== null) return push(op.command);
    hint(EDIT_TEXT.nothingToRemove, "bad");
  }
  renderCanvas();
  idleHint();
}

function cancelDrag(): void {
  if (ed.drag === null) return;
  ed.drag.ghost.remove();
  ed.drag = null;
  document.body.classList.remove("ed-dragging");
  $("ed-trash").classList.remove("armed", "over");
  renderCanvas();
  idleHint();
}

function clearPending(): void {
  if (ed.pending !== null) window.clearTimeout(ed.pending.timer);
  ed.pending = null;
}

function arm(e: PointerEvent, start: () => void, tap?: () => void): void {
  clearPending();
  const touch = e.pointerType !== "mouse";
  const p: Pending = { x: e.clientX, y: e.clientY, pointer: e.pointerId, touch, timer: 0, start, ...(tap === undefined ? {} : { tap }) };
  if (touch)
    p.timer = window.setTimeout(() => {
      if (ed.pending !== p) return;
      ed.pending = null;
      navigator.vibrate?.(15);
      start();
    }, LONG_TAP_MS);
  ed.pending = p;
}

function bindPointers(): void {
  const page = $("page-edit");
  page.addEventListener("pointerdown", (e) => {
    if (ed.drag !== null || e.button > 0) return;
    const t = e.target as HTMLElement;
    const card = t.closest<HTMLElement>(".ed-card");
    if (card !== null) {
      const part = card.dataset.part!;
      if (e.pointerType === "mouse") e.preventDefault();
      arm(e, () => startPartDrag(part, e.pointerId, ed.pending?.x ?? e.clientX, ed.pending?.y ?? e.clientY, card));
      return;
    }
    if (t.closest("#ed-canvas") !== null) {
      const el = elementAt(e.clientX, e.clientY);
      if (el === null || el === "trash") return;
      if (e.pointerType === "mouse") e.preventDefault();
      const x = e.clientX;
      const y = e.clientY;
      arm(
        e,
        () => startBodyDrag(el, e.pointerId, x, y),
        () => removalMenu(el, x, y),
      );
    }
  });
  window.addEventListener("pointermove", (e) => {
    const p = ed.pending;
    if (p !== null && e.pointerId === p.pointer) {
      const dist = Math.hypot(e.clientX - p.x, e.clientY - p.y);
      if (p.touch) {
        // A finger that moves before the long tap scrolls the palette: no drag.
        if (dist > SLOP_TOUCH) clearPending();
      } else if (dist > SLOP_MOUSE) {
        clearPending();
        p.start();
      }
    }
    if (ed.drag !== null && e.pointerId === ed.drag.pointer) dragMove(e.clientX, e.clientY);
    else if (ed.drag === null && ed.pending === null && e.pointerType === "mouse" && !$("page-edit").hidden) {
      const el = elementAt(e.clientX, e.clientY);
      const over = el === "trash" ? null : el;
      if (!sameEl(over, ed.hover) && !(over === null && ed.hover === null)) {
        ed.hover = over;
        renderCanvas();
      }
    }
  });
  window.addEventListener("pointerup", (e) => {
    const p = ed.pending;
    if (p !== null && e.pointerId === p.pointer) {
      clearPending();
      p.tap?.();
      return;
    }
    if (ed.drag !== null && e.pointerId === ed.drag.pointer) endDrag(e.clientX, e.clientY);
  });
  window.addEventListener("pointercancel", (e) => {
    if (ed.pending?.pointer === e.pointerId) clearPending();
    if (ed.drag?.pointer === e.pointerId) cancelDrag();
  });
  // While a finger drags, the page does not scroll under it.
  document.addEventListener(
    "touchmove",
    (e) => {
      if (ed.drag !== null) e.preventDefault();
    },
    { passive: false },
  );
  page.addEventListener("contextmenu", (e) => {
    if ((e.target as HTMLElement).closest(".ed-card,#ed-canvas") !== null) e.preventDefault();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || $("page-edit").hidden) return;
    cancelDrag();
    closeMenu();
  });
}

// ---------------------------------------------------------------- the bar and the side

function bindControls(): void {
  $("ed-search").addEventListener("input", () => {
    const q = ($("ed-search") as HTMLInputElement).value.trim();
    const v = { ...host().view() };
    if (q === "") delete v.q;
    else v.q = q;
    host().setView(v);
    renderPalette();
  });
  $("ed-chips").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-etable]");
    if (b === null) return;
    const v = { ...host().view() };
    const t = b.dataset.etable as PartTable | "";
    if (t === "" || v.table === t) delete v.table;
    else v.table = t;
    host().setView(v);
    renderPalette();
  });
  $("ed-bar").addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const look = t.closest<HTMLElement>("[data-elook]");
    if (look !== null) {
      const v = { ...host().view() };
      if (look.dataset.elook === "sprite") v.look = "sprite";
      else delete v.look;
      host().setView(v);
      renderBar();
      renderCanvas();
      return;
    }
    switch (t.closest<HTMLElement>("button")?.id) {
      case "ed-undo":
        host().undo();
        renderAll();
        break;
      case "ed-redo":
        host().redo();
        renderAll();
        break;
      case "ed-copy": {
        void navigator.clipboard?.writeText(bodyToText(body())).catch(() => undefined);
        hint(EDIT_TEXT.copied, "good");
        break;
      }
      case "ed-lab":
        host().openInLab();
        break;
    }
  });
  $("ed-bar").addEventListener("change", (e) => {
    const s = e.target as HTMLSelectElement;
    if (s.id !== "ed-start" || s.value === "") return;
    const start: LabState["start"] = s.value.startsWith("beast:") ? { kind: "beast", id: s.value.slice(6) } : { kind: s.value as "human" | "swamp" };
    host().restart(start);
    renderAll();
  });
  $("ed-side").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-hist]");
    if (b === null) return;
    host().truncate(Number(b.dataset.hist) + 1);
    renderAll();
  });
  window.addEventListener("resize", () => {
    if (!$("page-edit").hidden) renderCanvas();
  });
}

export function buildEdit(h: EditHost): void {
  ed.host = h;
  $("ed-search").setAttribute("placeholder", EDIT_TEXT.search);
  $("ed-trash").textContent = EDIT_TEXT.trash;
  bindPointers();
  bindControls();
}

export function showEdit(h: EditHost): void {
  ed.host = h;
  renderAll();
}
