/**
 * The bestiary tab: three shelves of creatures, each one a click away from
 * the lab - mine (the store: the generator's batches and what the lab kept),
 * the mythic beasts (each one a form, with its likeness to the body in the lab) and
 * the living gallery (a hundred mutants grown here). DOM.
 */
import { type Body, BEASTS, beastById, startBody, run, type LabState } from "@mutant-engine/core";
import { NO_STORE, hasStore, listCreatures, removeCreature, starCreature, type Listing, type StoredCreature } from "./store.js";
import { LOOKS, type Look, LOOK_RU, lazyPictures, pictureEl } from "@mutant-engine/view";
import { decode, type Shelf } from "./hash.js";
import { beastHtml } from "./panels.js";
import { livingShelf, textStart, type LivingCard } from "./zoo.js";

interface ZooHost {
  shelf(): Shelf;
  beast(): string | undefined;
  look(): Look;
  setShelf(shelf: Shelf): void;
  setBeast(id: string | undefined): void;
  setLook(look: Look): void;
  /** The body on the lab's screen: the mythic beasts measure against it. */
  labBody(): Body;
  labSeed(): number;
  openInLab(state: LabState): void;
}

/** How many of your creatures the shelf shows at first: each card replays its creature, and a store of hundreds took seconds. */
const MINE_PAGE = 20;

const zoo = { listing: null as Listing | null, starsOnly: false, living: null as LivingCard[] | null, shown: MINE_PAGE, bodies: new Map<string, Body>() };

/** A creature of the store replayed once and kept by its key. */
function bodyOfKey(key: string): Body {
  let b = zoo.bodies.get(key);
  if (b === undefined) {
    b = run(decode(key).state, { light: true }).body;
    zoo.bodies.set(key, b);
  }
  return b;
}

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`no #${id}`);
  return el;
}

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildZoo(host: ZooHost): void {
  $("shelves").insertAdjacentHTML("beforeend", `<span class="seg" id="z-looks">${LOOKS.map((l) => `<button type="button" data-look="${l}">${esc(LOOK_RU[l])}</button>`).join("")}</span>`);
  $("shelves").addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const shelf = t.closest<HTMLElement>("[data-shelf]");
    if (shelf !== null) {
      host.setShelf(shelf.dataset.shelf as Shelf);
      renderZoo(host);
      return;
    }
    const look = t.closest<HTMLElement>("[data-look]");
    if (look !== null) {
      host.setLook(look.dataset.look as Look);
      renderZoo(host);
    }
  });
  $("zoo-body").addEventListener("click", (e) => void onClick(host, e.target as HTMLElement));
  $("zoo-body").addEventListener("change", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.id !== "z-stars") return;
    zoo.starsOnly = t.checked;
    renderMine(host);
  });
}

async function onClick(host: ZooHost, t: HTMLElement): Promise<void> {
  if (t.closest("[data-more]") !== null) {
    zoo.shown += MINE_PAGE;
    renderMine(host);
    return;
  }
  const mine = t.closest<HTMLElement>("[data-mine]");
  if (mine !== null) {
    const c = zoo.listing?.creatures.find((x) => x.id === Number(mine.dataset.id));
    if (c === undefined) return;
    if (mine.dataset.mine === "open") host.openInLab(decode(c.key).state);
    else if (mine.dataset.mine === "star") {
      await starCreature(c.id, !c.star);
      c.star = !c.star;
      renderMine(host);
    } else if (mine.dataset.mine === "remove" && confirm(`Убрать «${c.name}» из бестиария?`)) {
      await removeCreature(c.id);
      zoo.listing = await listCreatures();
      renderMine(host);
    }
    return;
  }
  const beast = t.closest<HTMLElement>("[data-beast]");
  if (beast !== null) {
    host.setBeast(beast.dataset.beast);
    renderMyth(host);
    return;
  }
  const open = t.closest<HTMLElement>("[data-open]");
  const id = host.beast();
  const b = id === undefined ? undefined : beastById(id);
  if (open !== null && b !== undefined) {
    host.openInLab({ seed: host.labSeed(), start: { kind: "beast", id: b.id }, commands: [], spread: true });
    return;
  }
  const living = t.closest<HTMLElement>("[data-living]");
  if (living !== null) {
    const card = zoo.living?.[Number(living.dataset.living)];
    if (card !== undefined) host.openInLab({ seed: card.spec.seed, start: textStart(card.body()), commands: [], spread: true });
  }
}

export function renderZoo(host: ZooHost): void {
  const shelf = host.shelf();
  for (const b of $("shelves").querySelectorAll<HTMLElement>("[data-shelf]")) b.classList.toggle("on", b.dataset.shelf === shelf);
  for (const b of $("shelves").querySelectorAll<HTMLElement>("[data-look]")) b.setAttribute("aria-pressed", b.dataset.look === host.look() ? "true" : "false");
  if (shelf === "mine") void loadMine(host);
  else if (shelf === "myth") renderMyth(host);
  else renderLiving(host);
}

// ---------------------------------------------------------------- mine

async function loadMine(host: ZooHost): Promise<void> {
  $("zoo-body").innerHTML = `<p class="faint">читаю хранилище…</p>`;
  const store = await hasStore();
  // The viewer may have moved to another shelf while the store answered.
  if (host.shelf() !== "mine") return;
  if (!store) {
    $("zoo-body").innerHTML = `<p class="faint">${esc(NO_STORE)}. Генератор и лаборатория работают и без него, но ничего не запоминают.</p>`;
    return;
  }
  try {
    zoo.listing = await listCreatures();
    if (host.shelf() !== "mine") return;
  } catch (e) {
    $("zoo-body").innerHTML = `<p class="c-flesh">${esc(e instanceof Error ? e.message : String(e))}</p>`;
    return;
  }
  renderMine(host);
}

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function mineCard(c: StoredCreature): string {
  return `<article class="card-gen"><div class="pic-slot" data-key="${c.id}"></div><div class="name">${esc(c.name)}</div><div class="meta mono faint">сид ${c.seed} · мут. ${c.mutations} · узл. ${c.nodes} · гол. ${c.heads}</div><div class="row"><button class="btn small" data-mine="open" data-id="${c.id}">в лабу</button><button class="btn small star${c.star ? " on" : ""}" data-mine="star" data-id="${c.id}" title="звёздочка">${c.star ? "★" : "☆"}</button><button class="btn small" data-mine="remove" data-id="${c.id}" title="убрать">✕</button></div></article>`;
}

function renderMine(host: ZooHost): void {
  const listing = zoo.listing;
  if (listing === null || host.shelf() !== "mine") return;
  // The newest first: the last few and every starred one; the rest a button away.
  const newest = [...listing.creatures].sort((x, y) => y.created.localeCompare(x.created) || y.id - x.id);
  const recent = new Set(newest.slice(0, zoo.shown).map((c) => c.id));
  const shown = listing.creatures.filter((c) => (!zoo.starsOnly || c.star) && (recent.has(c.id) || c.star));
  const hiddenCount = listing.creatures.length - listing.creatures.filter((c) => recent.has(c.id) || c.star).length;
  const groups: string[] = [];
  const fromLab = shown.filter((c) => c.batch === null);
  if (fromLab.length > 0) groups.push(`<div class="cap">из лаборатории · ${fromLab.length}</div><div class="grid">${fromLab.map(mineCard).join("")}</div>`);
  for (const b of listing.batches) {
    const list = shown.filter((c) => c.batch === b.id);
    if (list.length === 0) continue;
    groups.push(`<div class="cap">${esc(b.label)} · ${esc(when(b.created))} · ${list.length}</div><div class="grid">${list.map(mineCard).join("")}</div>`);
  }
  const total = listing.creatures.length;
  const more = hiddenCount > 0 && !zoo.starsOnly ? `<div class="row"><button class="btn" data-more="1">показать ещё ${Math.min(MINE_PAGE, hiddenCount)}</button><span class="faint small">скрыто старых: ${hiddenCount}</span></div>` : "";
  $("zoo-body").innerHTML = `<div class="row"><span class="faint">всего ${total} · партий ${listing.batches.length} · показаны последние ${Math.min(zoo.shown, total)} и со звёздочкой</span><label class="chk"><input type="checkbox" id="z-stars"${zoo.starsOnly ? " checked" : ""}> только со звёздочкой</label></div>${groups.join("") || `<p class="faint">Пусто. Твари попадают сюда из генератора и кнопкой «в бестиарий» в лаборатории.</p>`}${more}`;
  const lazy = lazyPictures();
  const byId = new Map(listing.creatures.map((c) => [c.id, c]));
  for (const slot of $("zoo-body").querySelectorAll<HTMLElement>(".pic-slot[data-key]")) {
    const c = byId.get(Number(slot.dataset.key));
    if (c === undefined) continue;
    lazy(slot, () => pictureEl(bodyOfKey(c.key), host.look(), c.seed, 160));
  }
}

// ---------------------------------------------------------------- myth

function renderMyth(host: ZooHost): void {
  const id = host.beast();
  const selected = id !== undefined && beastById(id) !== undefined ? id : undefined;
  const cards = BEASTS.map((b) => `<article class="card-gen${b.id === selected ? " on" : ""}" data-beast="${b.id}"><div class="pic-slot" data-beast-pic="${b.id}"></div><div class="name">${esc(b.ru)}</div><div class="meta mono faint">${b.unexpressible.length > 0 ? `не выразить: ${b.unexpressible.length}` : "выражается целиком"}</div></article>`);
  $("zoo-body").innerHTML = `<div class="myth"><div class="grid">${cards.join("")}</div><aside class="beast-detail">${beastHtml(selected, host.labBody())}</aside></div>`;
  const lazy = lazyPictures();
  for (const slot of $("zoo-body").querySelectorAll<HTMLElement>("[data-beast-pic]")) {
    lazy(slot, () => pictureEl(startBody({ kind: "beast", id: slot.dataset.beastPic! }), host.look(), host.labSeed(), 140));
  }
}

// ---------------------------------------------------------------- living

function renderLiving(host: ZooHost): void {
  zoo.living ??= livingShelf();
  const shelf = zoo.living;
  const groups = new Map<string, LivingCard[]>();
  for (const c of shelf) groups.set(c.sourceRu, [...(groups.get(c.sourceRu) ?? []), c]);
  const html: string[] = [`<p class="faint">Сто мутантов из человека, по сиду, с расползанием — то же, что <span class="mono">npm run living</span>. «В лабу» открывает тело как фикстуру: форма та же, история мутаций остаётся здесь.</p>`];
  for (const [ru, list] of groups) {
    html.push(`<div class="cap">${esc(ru)} · ${list.length}</div><div class="grid">${list.map((c) => `<article class="card-gen"><div class="pic-slot" data-living-pic="${c.index}"></div><div class="name">тварь ${c.index + 1}</div><div class="meta mono faint">сид ${c.spec.seed} · мутаций ${c.spec.count}</div><button class="btn small" data-living="${c.index}">в лабу</button></article>`).join("")}</div>`);
  }
  $("zoo-body").innerHTML = html.join("");
  const lazy = lazyPictures();
  for (const slot of $("zoo-body").querySelectorAll<HTMLElement>("[data-living-pic]")) {
    const c = shelf[Number(slot.dataset.livingPic)]!;
    lazy(slot, () => {
      const body = c.body();
      return pictureEl(body, host.look(), c.spec.seed, 160);
    });
  }
}
