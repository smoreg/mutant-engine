/**
 * The state of the lab in the #hash: the seed, the start, the spread flag
 * and the commands, plus what the page is looking at (step, view, the card of
 * a part, the studio's tab, the generator's batch and look, the bestiary's shelf and
 * beast, the nodes dragged by hand). Links from before the tabs still open:
 * the statistics in the generator, the bestiary panel in the bestiary. `decode(encode(s))` is `s`; anything the
 * decoder cannot read is dropped, so a broken link opens the initial state.
 */
import {
  RULE_IDS,
  beastById,
  decodeCommand,
  encodeCommand,
  initialState,
  int,
  isBrainKey,
  isEmptyTuning,
  isFamily,
  isSource,
  mutationById,
  normalizeTuning,
  type CatalogTuning,
  type LabState,
  type RuleId,
  type Start,
} from "@mutant-engine/core";
import { GEN_SORTS, type GenParams, type GenSort, type GenSource } from "./batch.js";
import type { Look, Pins } from "@mutant-engine/view";
import { FOE_LINES } from "@mutant-engine/core";
import { PART_TABLES, partById, partTags, type PartTable, type PartsFilter } from "./parts.js";

export type ViewMode = "full" | "sprite" | "s96";
export const VIEW_MODES: readonly ViewMode[] = ["full", "sprite", "s96"];
/** Views the lab had before (the sidebar, the small tiles): an old link opens the nearest one left. */
const OLD_VIEWS: Record<string, ViewMode | undefined> = { sqrt: undefined, s32: "s96", s64: "s96" };

/** The studio's big tabs: the mass generator, the lab over one mutant, the arena of two fighters, the bestiary, the engine's sprite editor, the gallery of parts, the editor. */
export type Tab = "gen" | "lab" | "arena" | "zoo" | "muts" | "parts" | "edit";
export const TABS: readonly Tab[] = ["gen", "lab", "arena", "zoo", "muts", "parts", "edit"];
/** Tabs the arena took the place of: the strike on a foe and the wound simulator. */
const OLD_TABS: Record<string, Tab | undefined> = { strike: "arena", damage: "arena" };

/** The editor tab's own view: the body as a sprite instead of the graph, the palette's category and search. */
export interface EditView {
  look?: "sprite";
  table?: PartTable;
  q?: string;
}

/** The shelves of the bestiary: creatures from the store, the mythic beasts, the living gallery. */
export type Shelf = "mine" | "myth" | "living";
const SHELVES: readonly Shelf[] = ["mine", "myth", "living"];

const LOOK_IDS: readonly string[] = ["sprite", "limbs", "graph"];

export interface View {
  step?: number;
  view?: ViewMode;
  /** The part whose card is open in the lab: a node or a segment (never a cut). */
  info?: { node: number } | { segment: number };
  /** The lab when absent; the lab is never written. */
  tab?: Tab;
  compare?: boolean;
  /** The batch the generator shows. */
  gen?: GenParams;
  look?: Look;
  /** A brain whose separation is previewed, by key. */
  brain?: string;
  shelf?: Shelf;
  /** The lab's operating room is open instead of the mutation controls. */
  room?: boolean;
  /** The lab places a mutation by hand: pick a row, click where it goes. */
  hand?: boolean;
  /** The catalog row picked to place by hand. */
  row?: string;
  /** The part on the operating table: a segment id, or `c<node>` for the node of your brain. */
  part?: string;
  /** The beast the bestiary is looking at, by id: a mythic beast's id or a living card's number. */
  beast?: string;
  pins?: Pins;
  /** The foe the strike tab hits, by id (foes.ts). */
  foe?: string;
  /** The wound simulator's state, encoded by `damage.ts`: the arena's strike mode keeps its tape here. */
  damage?: string;
  /** The arena: its fighters, mode, seed and tape, encoded by `arena.ts`. */
  arena?: string;
  /** The parts tab: its filter and the card open in it. */
  parts?: PartsFilter;
  /** The editor tab. */
  edit?: EditView;
}

export function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string): string | null {
  try {
    const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function isGenSource(s: string | undefined): s is GenSource {
  return s === "floor" || (isSource(s) && s !== "id");
}

/**
 * The batch: its numbers first, as the links before it had them, then groups
 * of its own after a `~` - the basis (`b`), the rows switched off (`o`), the
 * rows whose chance is multiplied (`c`), the rules switched off (`r`), the high
 * end of the range of mutations (`n`), the line of foes the batch is run
 * through (`f`) with the order (`s`) and the floor (`k`) of the grid. A link
 * without the groups is a batch from a human on the catalog as it stands,
 * every creature by the same count and no fight.
 */
function encodeGen(g: GenParams): string {
  const head = `${g.count}.${g.mutations}.${g.source}.${g.spread ? 1 : 0}.${g.first}${g.family === undefined ? "" : `.${g.family}`}`;
  const groups: string[] = [];
  if (g.mutationsTo !== undefined && g.mutationsTo > g.mutations) groups.push(`n${g.mutationsTo}`);
  if (g.line !== undefined) groups.push(`f${g.line}`);
  if (g.sort !== undefined) groups.push(`s${g.sort}`);
  if (g.min !== undefined && g.min > 0) groups.push(`k${g.min}`);
  if (g.start !== undefined && g.start.kind !== "human") groups.push(`b${encodeStart(g.start)}`);
  const t = g.tuning;
  if (t !== undefined) {
    if (t.off.length > 0) groups.push(`o${t.off.join(",")}`);
    const chance = Object.entries(t.chance);
    if (chance.length > 0) groups.push(`c${chance.map(([id, factor]) => `${id}:${factor}`).join(",")}`);
    if (t.rules.length > 0) groups.push(`r${t.rules.join(",")}`);
  }
  return groups.length === 0 ? head : `${head}~${groups.join("~")}`;
}

function decodeGen(text: string | undefined): GenParams | null {
  if (text === undefined) return null;
  const [head, ...groups] = text.split("~");
  const p = (head ?? "").split(".");
  const count = int(p[0]);
  const mutations = int(p[1]);
  const first = int(p[4]);
  if (count === null || mutations === null || first === null || count < 1 || count > 400 || mutations < 1 || mutations > 1000 || first < 0) return null;
  if (!isGenSource(p[2]) || (p[3] !== "0" && p[3] !== "1")) return null;
  const g: GenParams = { count, mutations, source: p[2], spread: p[3] === "1", first };
  if (p[5] !== undefined) {
    if (!isFamily(p[5])) return null;
    g.family = p[5];
  }
  const tuning: CatalogTuning = { off: [], chance: {}, rules: [] };
  for (const group of groups) {
    const rest = group.slice(1);
    switch (group[0]) {
      case "n": {
        const to = int(rest);
        if (to !== null && to > mutations && to <= 1000) g.mutationsTo = to;
        break;
      }
      case "f":
        if (FOE_LINES.some((l) => l.id === rest)) g.line = rest;
        break;
      case "s":
        if ((GEN_SORTS as readonly string[]).includes(rest)) g.sort = rest as GenSort;
        break;
      case "k": {
        const min = int(rest);
        if (min !== null && min > 0) g.min = min;
        break;
      }
      case "b": {
        const start = decodeStart(rest);
        if (start.kind !== "human") g.start = start;
        break;
      }
      case "o":
        for (const id of rest.split(",")) if (mutationById(id) !== undefined && !tuning.off.includes(id)) tuning.off.push(id);
        break;
      case "c":
        for (const piece of rest.split(",")) {
          const [id, value] = piece.split(":");
          const factor = Number(value);
          if (id === undefined || mutationById(id) === undefined || !Number.isFinite(factor) || factor <= 0 || factor === 1) continue;
          tuning.chance[id] = factor;
        }
        break;
      case "r":
        for (const r of rest.split(",")) if ((RULE_IDS as readonly string[]).includes(r) && !tuning.rules.includes(r as RuleId)) tuning.rules.push(r as RuleId);
        break;
      default:
        break;
    }
  }
  const normal = normalizeTuning(tuning);
  if (!isEmptyTuning(normal)) g.tuning = normal;
  return g;
}

// ---------------------------------------------------------------- start

function encodeStart(s: Start): string {
  switch (s.kind) {
    case "human":
      return "h";
    case "swamp":
      return "w";
    case "text":
      return `t.${toBase64Url(s.text)}`;
    case "beast":
      return `z.${s.id}`;
  }
}

function decodeStart(text: string | undefined): Start {
  if (text === "w") return { kind: "swamp" };
  if (text !== undefined && text.startsWith("z.") && beastById(text.slice(2)) !== undefined) return { kind: "beast", id: text.slice(2) };
  if (text !== undefined && text.startsWith("t.")) {
    const decoded = fromBase64Url(text.slice(2));
    if (decoded !== null) return { kind: "text", text: decoded };
  }
  return { kind: "human" };
}

// ---------------------------------------------------------------- the whole hash

export function encode(state: LabState, view: View = {}): string {
  const parts = [`s=${state.seed}`, `b=${encodeStart(state.start)}`, `sp=${state.spread ? 1 : 0}`];
  if (state.commands.length > 0) parts.push(`c=${state.commands.map(encodeCommand).join(";")}`);
  if (view.step !== undefined) parts.push(`st=${view.step}`);
  if (view.view !== undefined) parts.push(`v=${view.view}`);
  if (view.info !== undefined) parts.push(`i=${"node" in view.info ? `n${view.info.node}` : `s${view.info.segment}`}`);
  if (view.tab !== undefined && view.tab !== "lab") parts.push(`tab=${view.tab}`);
  if (view.compare === true) parts.push("cmp=1");
  if (view.gen !== undefined) parts.push(`g=${encodeGen(view.gen)}`);
  if (view.look !== undefined) parts.push(`look=${view.look}`);
  if (view.brain !== undefined) parts.push(`br=${view.brain}`);
  if (view.shelf !== undefined) parts.push(`shelf=${view.shelf}`);
  if (view.room === true) parts.push("room=1");
  if (view.hand === true) parts.push("hand=1");
  if (view.row !== undefined) parts.push(`row=${view.row}`);
  if (view.part !== undefined) parts.push(`pt=${view.part}`);
  if (view.damage !== undefined) parts.push(`dmg=${view.damage}`);
  if (view.beast !== undefined) parts.push(`bst=${view.beast}`);
  if (view.foe !== undefined) parts.push(`foe=${view.foe}`);
  if (view.arena !== undefined) parts.push(`ar=${view.arena}`);
  const pf = view.parts ?? {};
  if (pf.table !== undefined) parts.push(`pgt=${pf.table}`);
  if (pf.family !== undefined) parts.push(`pgf=${pf.family}`);
  if (pf.tag !== undefined) parts.push(`pgg=${pf.tag}`);
  if (pf.substance !== undefined) parts.push(`pgs=${pf.substance}`);
  if (pf.q !== undefined && pf.q !== "") parts.push(`pgq=${encodeURIComponent(pf.q)}`);
  if (pf.open !== undefined) parts.push(`pgo=${pf.open}`);
  const ev = view.edit ?? {};
  if (ev.look !== undefined) parts.push(`el=${ev.look}`);
  if (ev.table !== undefined) parts.push(`etb=${ev.table}`);
  if (ev.q !== undefined && ev.q !== "") parts.push(`eq=${encodeURIComponent(ev.q)}`);
  const pins = Object.entries(view.pins ?? {});
  if (pins.length > 0) parts.push(`pin=${pins.map(([id, d]) => `${id}:${d.x}:${d.y}`).join(",")}`);
  return parts.join("&");
}

export function decode(hash: string): { state: LabState; view: View } {
  const state = initialState();
  const view: View = {};
  const text = hash.startsWith("#") ? hash.slice(1) : hash;
  const fields = new Map<string, string>();
  for (const piece of text.split("&")) {
    const eq = piece.indexOf("=");
    if (eq <= 0) continue;
    let value = piece.slice(eq + 1);
    try {
      value = decodeURIComponent(value);
    } catch {
      continue;
    }
    fields.set(piece.slice(0, eq), value);
  }
  const seed = int(fields.get("s"));
  if (seed !== null) state.seed = seed;
  state.start = decodeStart(fields.get("b"));
  if (fields.get("sp") === "0") state.spread = false;
  const c = fields.get("c");
  if (c !== undefined && c.length > 0) {
    for (const piece of c.split(";")) {
      const cmd = decodeCommand(piece);
      if (cmd !== null) state.commands.push(cmd);
    }
  }
  const step = int(fields.get("st"));
  if (step !== null && step >= 0) view.step = step;
  const v = fields.get("v");
  if (v !== undefined && (VIEW_MODES as readonly string[]).includes(v)) view.view = v as ViewMode;
  else if (v !== undefined && OLD_VIEWS[v] !== undefined) view.view = OLD_VIEWS[v];
  const info = fields.get("i");
  if (info !== undefined) {
    const m = /^([ns])(\d+)$/.exec(info);
    if (m !== null) view.info = m[1] === "n" ? { node: Number(m[2]) } : { segment: Number(m[2]) };
  }
  const tab = fields.get("tab");
  const dmg = fields.get("dmg");
  if (dmg !== undefined && /^[A-Za-z0-9_-]+$/.test(dmg)) view.damage = dmg;
  const ar = fields.get("ar");
  if (ar !== undefined && /^[A-Za-z0-9._~-]+$/.test(ar)) view.arena = ar;
  if (tab === "stats") view.tab = "gen";
  else if (tab !== undefined && OLD_TABS[tab] !== undefined) {
    view.tab = OLD_TABS[tab];
    // The wound tab struck the lab's mutant: the arena opens in its strike mode with the mutant as the target.
    if (tab === "damage") view.arena ??= "m.s~a.r";
  } else if (tab !== undefined && tab !== "lab" && (TABS as readonly string[]).includes(tab)) view.tab = tab as Tab;
  const foe = fields.get("foe");
  if (foe !== undefined && /^[a-z]+$/.test(foe)) view.foe = foe;
  if (fields.get("cmp") === "1") view.compare = true;
  const g = decodeGen(fields.get("g"));
  if (g !== null) view.gen = g;
  const x = fields.get("x");
  if (x !== undefined && view.gen === undefined) {
    // The statistics before the tabs: seeds, mutations, a source, a family.
    const p = x.split(".");
    const seeds = int(p[0]);
    const mutations = int(p[1]);
    if (seeds !== null && mutations !== null && isGenSource(p[2]) && seeds > 0 && mutations > 0) {
      view.gen = { count: Math.min(400, seeds), mutations: Math.min(1000, mutations), source: p[2], spread: true, first: 1 };
      if (isFamily(p[3])) view.gen.family = p[3];
    }
  }
  const look = fields.get("look");
  if (look !== undefined && LOOK_IDS.includes(look)) view.look = look as Look;
  const br = fields.get("br");
  if (isBrainKey(br)) view.brain = br;
  const shelf = fields.get("shelf");
  if (shelf !== undefined && (SHELVES as readonly string[]).includes(shelf)) view.shelf = shelf as Shelf;
  if (fields.get("room") === "1") view.room = true;
  else if (fields.get("hand") === "1") view.hand = true;
  const row = fields.get("row");
  if (row !== undefined && mutationById(row) !== undefined) view.row = row;
  const pt = fields.get("pt");
  if (pt !== undefined && /^c?\d+$/.test(pt)) view.part = pt;
  if (fields.get("pn") === "beasts") {
    // The bestiary panel before the tabs.
    view.tab = "zoo";
    view.shelf = "myth";
  }
  const bst = fields.get("bst");
  if (bst !== undefined && (beastById(bst) !== undefined || /^\d+$/.test(bst))) view.beast = bst;
  const pf = decodePartsFilter(fields);
  if (pf !== null) view.parts = pf;
  const ev: EditView = {};
  if (fields.get("el") === "sprite") ev.look = "sprite";
  const etb = fields.get("etb");
  if (etb !== undefined && (PART_TABLES as readonly string[]).includes(etb)) ev.table = etb as PartTable;
  const eq = fields.get("eq");
  if (eq !== undefined && eq !== "") ev.q = eq;
  if (Object.keys(ev).length > 0) view.edit = ev;
  const pin = fields.get("pin");
  if (pin !== undefined) {
    const pins: Pins = {};
    for (const piece of pin.split(",")) {
      const m = /^(\d+):(-?\d+(?:\.\d+)?):(-?\d+(?:\.\d+)?)$/.exec(piece);
      if (m !== null) pins[Number(m[1])] = { x: Number(m[2]), y: Number(m[3]) };
    }
    if (Object.keys(pins).length > 0) view.pins = pins;
  }
  return { state, view };
}

/** The parts tab's filter; a field the tables do not know is dropped. */
function decodePartsFilter(fields: Map<string, string>): PartsFilter | null {
  const f: PartsFilter = {};
  const table = fields.get("pgt");
  if (table !== undefined && (PART_TABLES as readonly string[]).includes(table)) f.table = table as PartTable;
  const family = fields.get("pgf");
  if (isFamily(family)) f.family = family;
  const tag = fields.get("pgg");
  if (tag !== undefined && partTags().includes(tag)) f.tag = tag;
  const substance = fields.get("pgs");
  if (substance === "flesh" || substance === "trait") f.substance = substance;
  const q = fields.get("pgq");
  if (q !== undefined && q !== "") f.q = q;
  const open = fields.get("pgo");
  if (open !== undefined && partById(open) !== undefined) f.open = open;
  return Object.keys(f).length === 0 ? null : f;
}
