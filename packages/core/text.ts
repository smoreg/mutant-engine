/**
 * The text fixture of body-graph.md §2: how bodies are written in tests, in
 * the developer mode and in the design notes. `bodyToText` writes the canonical
 * form (ids as names, one space between tokens); `bodyFromText` also accepts
 * word labels instead of ids, which it assigns in order of appearance.
 *
 *   мясо 100
 *   следующий 14
 *
 *   # узлы: id[размер] {окончания}; * — твой мозг
 *   1[2] {голова(мозг*, глаз, глаз, челюсть, ухо, ухо, нос)}
 *   4[1] {кисть@40} цел=3 рана=5 ишемия=12 приманка
 *   6[2] {голова(мозг!4, глаз)}      (!4: sway of a foreign brain)
 *
 *   # сегменты: id: узел -вид:длина/обхват покров {полость} [наросты]- узел
 *   9: 2 -корпус:2/3 кожа {сердце, лёгкие, желудок} [шипы] цел=3 кровь=1 боль=2- 3
 *   10: 2 ~рука:2/1 кожа~ 4          (~ instead of - : no break plane)
 *
 * A size step of an organ (sizes.ts) is a mark right after its name: `клешня>`
 * is huge, `клешня<` small, and the normal step writes nothing.
 */
import type { Body, BodyNode, CoverFront, CoverId, Eatable, Membrane, MembraneKind, Organ, PartSnapshot, Place, Regrowth, Segment, SegmentKind } from "./graph.js";
import { canonicalPlace, isBrainKind, makeNode, makeSegment, newBody, nodeHpMax, nodeIds, resolvePlace, segmentHpMax, segmentIds, sortedIds, type NodeSpec, type SegmentSpec } from "./graph.js";
import { canonicalCycle, membraneArea, spanNodes } from "./membrane.js";
import { flankPlace, reconcilePlaces, samePlace, workedPlace } from "./flank.js";
import { selfBrain, validate } from "./metrics.js";
import { COVERS, MEMBRANES, ORGANS, SEGMENT_KINDS, mass } from "./parts.js";
import { SIZE_MARKS, isSizedKind, sizeOf, sizeOfMark } from "./sizes.js";

const NODES_HEADER = "# узлы: id[размер] {окончания}; * — твой мозг";
const SEGMENTS_HEADER = "# сегменты: id: узел -вид:длина/обхват покров {полость} [наросты]- узел";
const MEMBRANES_HEADER = "# перепонки: id: вид [сегменты] площадь=N";
const REGROWTH_HEADER = "# отрастает: узел ходов=N копий=N; строки части — после |";

function reverse<K extends string>(table: Record<K, { ru: string }>): Map<string, K> {
  const m = new Map<string, K>();
  for (const key of Object.keys(table) as K[]) m.set(table[key].ru, key);
  return m;
}

const SEGMENT_BY_RU = reverse(SEGMENT_KINDS);
const COVER_BY_RU = reverse(COVERS);
const ORGAN_BY_RU = reverse(ORGANS);
const MEMBRANE_BY_RU = reverse(MEMBRANES);

/** What a body ate, by its Russian name and back (decision 1253): the four tables share no name. */
const EATABLE_RU = new Map<Eatable, string>();
for (const table of [ORGANS, SEGMENT_KINDS, COVERS, MEMBRANES] as Record<string, { ru: string }>[]) for (const [k, v] of Object.entries(table)) EATABLE_RU.set(k as Eatable, v.ru);
const EATABLE_BY_RU = new Map<string, Eatable>([...EATABLE_RU].map(([k, ru]) => [ru, k]));
const EATEN_RE = /^съедено\s+(.+?)\s+(\d+(?:\.\d+)?)$/;

// ---------------------------------------------------------------- writer

function organText(o: Organ, self: Organ | undefined): string {
  let t = ORGANS[o.kind].ru + SIZE_MARKS[sizeOf(o)];
  if (o.contents) t += `(${o.contents.map((c) => organText(c, self)).join(", ")})`;
  if (o.instability > 0) t += `@${o.instability}`;
  if (o.sway) t += `!${o.sway}`;
  if (o.wander) t += `~${o.wander}`;
  if (o === self) t += "*";
  return t;
}

function organList(list: Organ[], self: Organ | undefined): string {
  return list.map((o) => organText(o, self)).join(", ");
}

function nodeLine(n: BodyNode, self: Organ | undefined): string {
  const parts = [`${n.id}[${n.size}]`];
  if (n.ends.length > 0) parts.push(`{${organList(n.ends, self)}}`);
  if (n.hp !== n.hpMax) parts.push(`цел=${n.hp}`);
  // hpMax as the node was built; a size or an ending changed later without a refresh keeps the old one.
  if (n.hpMax !== nodeHpMax(n.size, n.ends)) parts.push(`макс=${n.hpMax}`);
  if (n.wound > 0) parts.push(`рана=${n.wound}`);
  if (n.ischemia > 0) parts.push(`ишемия=${n.ischemia}`);
  if (n.bait) parts.push("приманка");
  if (n.fused !== undefined) parts.push(`срост=${n.fused.map((g) => g.join(",")).join(";")}`);
  return parts.join(" ");
}

function segmentLine(s: Segment, self: Organ | undefined, body?: Body): string {
  const d = s.breakPlane ? "-" : "~";
  const inner = [`${SEGMENT_KINDS[s.kind].ru}:${s.length}/${s.girth}`, COVERS[s.cover].ru];
  if (s.cavity.length > 0) inner.push(`{${organList(s.cavity, self)}}`);
  if (s.growths.length > 0) inner.push(`[${organList(s.growths, self)}]`);
  if (s.hp !== s.hpMax) inner.push(`цел=${s.hp}`);
  if (s.hpMax !== segmentHpMax(s.length, s.girth, s.kind)) inner.push(`макс=${s.hpMax}`);
  if (s.bleed > 0) inner.push(`кровь=${s.bleed}`);
  if (s.pain > 0) inner.push(`боль=${s.pain}`);
  if (s.wound > 0) inner.push(`рана=${s.wound}`);
  if (s.ischemia > 0) inner.push(`ишемия=${s.ischemia}`);
  const place = body === undefined ? undefined : placeAttr(body, s);
  if (place !== undefined) inner.push(place);
  return `${s.id}: ${s.a} ${d}${inner.join(" ")}${d} ${s.b}`;
}

function membraneLine(m: Membrane, full: number | undefined): string {
  const parts = [`${m.id}: ${MEMBRANES[m.kind].ru} [${m.cycle.join(", ")}]`];
  if (m.area !== full) parts.push(`площадь=${m.area}`);
  return parts.join(" ");
}

/** `self` spelled out, for a body whose place holds no brain: `я узел 1`, `я сегмент 9.2`. */
function placeText(place: Place): string {
  if ("node" in place) return `я узел ${place.node}${place.end === undefined ? "" : `.${place.end}`}`;
  return `я сегмент ${place.segment}${place.slot === undefined ? "" : `.${place.slot}`}`;
}

export function bodyToText(body: Body): string {
  const self = selfBrain(body);
  const lines: string[] = [`мясо ${body.meat}`, `следующий ${body.nextId}`];
  if (self === undefined) lines.push(placeText(body.self));
  if (body.pressure !== undefined) lines.push(`давление ${body.pressure}`);
  for (const f of body.fronts ?? []) lines.push(`фронт ${COVERS[f.cover].ru} ${f.turns}`);
  for (const k of Object.keys(body.eaten ?? {}).sort() as Eatable[]) lines.push(`съедено ${EATABLE_RU.get(k)} ${body.eaten![k]}`);
  lines.push("", NODES_HEADER);
  for (const id of nodeIds(body)) lines.push(nodeLine(body.nodes[id]!, self));
  lines.push("", SEGMENTS_HEADER);
  for (const id of segmentIds(body)) lines.push(segmentLine(body.segments[id]!, self, body));
  const membranes = sortedIds(body.membranes);
  if (membranes.length > 0) {
    lines.push("", MEMBRANES_HEADER);
    for (const id of membranes) {
      const m = body.membranes[id]!;
      lines.push(membraneLine(m, membraneArea(body, m)));
    }
  }
  if (body.regrowth !== undefined && body.regrowth.length > 0) {
    lines.push("", REGROWTH_HEADER);
    for (const r of body.regrowth) {
      lines.push(`отрастает ${r.at} ходов=${r.turns} копий=${r.copies}`);
      // The part in its own order - the hash walks it so - with every area written: its segments are not the body's.
      for (const n of r.part.nodes) lines.push(`| ${nodeLine(n, undefined)}`);
      for (const s of r.part.segments) lines.push(`| ${segmentLine(s, undefined)}`);
      for (const m of r.part.membranes) lines.push(`| ${membraneLine(m, undefined)}`);
    }
  }
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------- parser

class Marks {
  self: Organ | undefined;
  count = 0;
}

function fail(line: string, msg: string): never {
  throw new Error(`body text: ${msg} in "${line}"`);
}

function splitTop(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of text) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter((s) => s.length > 0);
}

const ORGAN_RE = /^([^()@*!~<>]+?)\s*([<>])?\s*(?:\((.*)\))?\s*(?:@(\d+))?\s*(?:!(\d+))?\s*(?:~(\d+))?\s*(\*)?$/;

function parseOrgans(text: string, line: string, marks: Marks): Organ[] {
  return splitTop(text).map((item) => {
    const m = ORGAN_RE.exec(item);
    if (!m) fail(line, `cannot read organ "${item}"`);
    const kind = ORGAN_BY_RU.get(m[1]!.trim());
    if (kind === undefined) fail(line, `unknown organ "${m[1]!.trim()}"`);
    const o: Organ = { kind, instability: m[4] === undefined ? 0 : Number(m[4]) };
    const size = sizeOfMark(m[2]);
    if (size !== "normal") {
      if (!isSizedKind(kind)) fail(line, `${m[2]} marks a size on a ${kind}, which has no sizes`);
      o.size = size;
    }
    if (m[3] !== undefined) o.contents = parseOrgans(m[3], line, marks);
    if (m[5] !== undefined) {
      if (!isBrainKind(kind)) fail(line, `!${m[5]} marks sway on a ${kind}, only a brain has sway`);
      const sway = Number(m[5]);
      if (sway > 0) o.sway = sway;
    }
    if (m[6] !== undefined) {
      const wander = Number(m[6]);
      if (wander > 0) o.wander = wander;
    }
    if (m[7] !== undefined) {
      if (!isBrainKind(kind)) fail(line, `* marks a ${kind}, only a brain can be you`);
      marks.count += 1;
      marks.self = o;
    }
    return o;
  });
}

function parseNumber(line: string, key: string, value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) fail(line, `${key} needs a number, got "${value}"`);
  return n;
}

interface NodeLine {
  label: string;
  size: 1 | 2 | 3;
  spec: NodeSpec;
  /** `макс=`: an hpMax the size and the endings do not give. */
  hpMax: number | undefined;
  line: string;
}

interface SegmentLine {
  id: number | undefined;
  a: string;
  b: string;
  spec: SegmentSpec;
  hpMax: number | undefined;
  /** A flank's `место=` as written: the host's other end, the fraction, the side. */
  place?: { end: string; t: number; side: -1 | 1 };
  line: string;
}

const NODE_RE = /^(\S+)\[([123])\](.*)$/;
const SEGMENT_RE = /^(?:(\d+):\s+)?(\S+)\s+([-~])(.*)([-~])\s+(\S+)$/;
const INNER_RE = /^\s*(.+?):(\d+)\/(\d+)(.*)$/;
const MEMBRANE_RE = /^(?:(\d+):\s+)?([^[\]]+?)\s*\[([^\]]*)\]\s*(.*)$/;

interface MembraneLine {
  id: number | undefined;
  kind: MembraneKind;
  /** Segment ids, or node labels to walk through (a person's spelling). */
  items: string[];
  area: number | undefined;
  line: string;
}

function parseMembraneLine(m: RegExpExecArray, line: string): MembraneLine {
  const [, id, kindRu, inner, rest] = m;
  const kind = MEMBRANE_BY_RU.get(kindRu!.trim()) as MembraneKind | undefined;
  if (kind === undefined) fail(line, `unknown membrane "${kindRu!.trim()}"`);
  const items = inner!
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  let area: number | undefined;
  for (const tok of rest!.split(/\s+/).filter((t) => t.length > 0)) {
    const [key, value] = tok.split("=") as [string, string | undefined];
    if (key === "площадь" && value !== undefined) area = parseNumber(line, key, value);
    else fail(line, `unknown membrane attribute "${tok}"`);
  }
  return { id: id === undefined ? undefined : Number(id), kind, items, area, line };
}

function parseNodeLine(m: RegExpExecArray, line: string, marks: Marks): NodeLine {
  const spec: NodeSpec = {};
  let hpMax: number | undefined;
  let rest = m[3]!.trim();
  if (rest.startsWith("{")) {
    const close = rest.indexOf("}");
    if (close < 0) fail(line, "unclosed {");
    spec.ends = parseOrgans(rest.slice(1, close), line, marks);
    rest = rest.slice(close + 1).trim();
  }
  for (const tok of rest.split(/\s+/).filter((t) => t.length > 0)) {
    const [key, value] = tok.split("=") as [string, string | undefined];
    if (tok === "приманка") spec.bait = true;
    else if (value === undefined) fail(line, `unknown node attribute "${tok}"`);
    else if (key === "цел") spec.hp = parseNumber(line, key, value);
    else if (key === "макс") hpMax = parseNumber(line, key, value);
    else if (key === "рана") spec.wound = parseNumber(line, key, value);
    else if (key === "ишемия") spec.ischemia = parseNumber(line, key, value);
    else if (key === "срост") spec.fused = value.split(";").map((g) => g.split(",").map((x) => parseNumber(line, key, x)));
    else fail(line, `unknown node attribute "${tok}"`);
  }
  return { label: m[1]!, size: Number(m[2]) as 1 | 2 | 3, spec, hpMax, line };
}

function parseSegmentLine(m: RegExpExecArray, line: string, marks: Marks): SegmentLine {
  const [, id, a, open, inner, close, b] = m;
  if (open !== close) fail(line, `segment opens with ${open} and closes with ${close}`);
  const im = INNER_RE.exec(inner!);
  if (!im) fail(line, "expected вид:длина/обхват");
  const kind = SEGMENT_BY_RU.get(im[1]!.trim()) as SegmentKind | undefined;
  if (kind === undefined) fail(line, `unknown segment kind "${im[1]!.trim()}"`);
  const spec: SegmentSpec = { kind, length: Number(im[2]), girth: Number(im[3]), breakPlane: open === "-" };
  let rest = im[4]!;
  const cavity = /\{([^}]*)\}/.exec(rest);
  if (cavity) {
    spec.cavity = parseOrgans(cavity[1]!, line, marks);
    rest = rest.replace(cavity[0], " ");
  }
  const growths = /\[([^\]]*)\]/.exec(rest);
  if (growths) {
    spec.growths = parseOrgans(growths[1]!, line, marks);
    rest = rest.replace(growths[0], " ");
  }
  const words: string[] = [];
  let hpMax: number | undefined;
  let place: SegmentLine["place"];
  for (const tok of rest.split(/\s+/).filter((t) => t.length > 0)) {
    const eq = tok.indexOf("=");
    if (eq < 0) {
      words.push(tok);
      continue;
    }
    const key = tok.slice(0, eq);
    const value = tok.slice(eq + 1);
    if (key === "цел") spec.hp = parseNumber(line, key, value);
    else if (key === "макс") hpMax = parseNumber(line, key, value);
    else if (key === "кровь") spec.bleed = parseNumber(line, key, value);
    else if (key === "боль") spec.pain = parseNumber(line, key, value);
    else if (key === "рана") spec.wound = parseNumber(line, key, value);
    else if (key === "ишемия") spec.ischemia = parseNumber(line, key, value);
    else if (key === "место") place = parsePlace(line, value);
    else fail(line, `unknown segment attribute "${tok}"`);
  }
  const coverRu = words.join(" ");
  const cover = COVER_BY_RU.get(coverRu) as CoverId | undefined;
  if (cover === undefined) fail(line, coverRu.length === 0 ? "missing cover" : `unknown cover "${coverRu}"`);
  spec.cover = cover;
  if (place !== undefined && spec.kind !== "flank") fail(line, "only a flank has a place");
  return { id: id === undefined ? undefined : Number(id), a: a!, b: b!, spec, hpMax, ...(place === undefined ? {} : { place }), line };
}

/**
 * `место=№12:0.26:л` - the host by its id, the fraction along it from the
 * flank's end, left or right; a fixture drawn by hand may name the host by
 * its other end instead, `место=таз:0.26:л`.
 */
function parsePlace(line: string, value: string): { end: string; t: number; side: -1 | 1 } {
  const m = /^(.+):([0-9.eE+-]+):([лп])$/.exec(value);
  if (!m) fail(line, `cannot read place "${value}"`);
  return { end: m[1]!, t: parseNumber(line, "место", m[2]!), side: m[3] === "л" ? -1 : 1 };
}

/**
 * A flank's place as text, when it is not the one its node gives it
 * (`workedPlace`): the host named by its other end, so that a fixture of
 * labels reads it too. Nothing otherwise, so every body drawn before places
 * were data reads and writes as it did (decision 1258).
 */
function placeAttr(body: Body, s: Segment): string | undefined {
  if (s.kind !== "flank") return undefined;
  const p = flankPlace(body, s.id);
  if (p === undefined || samePlace(p, workedPlace(body, s.id))) return undefined;
  return `место=№${p.host}:${p.t}:${p.side < 0 ? "л" : "п"}`;
}

/**
 * Segment ids of a membrane line: numbers as they are; node labels walked in
 * order, the lowest segment between neighbours. The walk closes into a cycle
 * only when a segment joins the last label to the first; otherwise it is the
 * open span of one bent limb (decision 320). The kind does not decide it: any
 * membrane hangs either way.
 */
function membraneCycle(body: Body, m: MembraneLine, nodeId: Map<string, number>): number[] {
  if (m.items.every((t) => /^\d+$/.test(t))) return m.items.map(Number);
  const nodes = m.items.map((label) => {
    const id = nodeId.get(label);
    if (id === undefined) fail(m.line, `unknown node "${label}"`);
    return id;
  });
  const between = (a: number, b: number): number | undefined =>
    segmentIds(body).find((id) => {
      const s = body.segments[id]!;
      return (s.a === a && s.b === b) || (s.a === b && s.b === a);
    });
  const open = between(nodes[nodes.length - 1]!, nodes[0]!) === undefined;
  const cycle: number[] = [];
  for (let i = 0; i < nodes.length - (open ? 1 : 0); i++) {
    const seg = between(nodes[i]!, nodes[(i + 1) % nodes.length]!);
    if (seg === undefined) fail(m.line, `no segment between "${m.items[i]}" and "${m.items[(i + 1) % nodes.length]}"`);
    cycle.push(seg);
  }
  return cycle;
}

function buildNode(id: number, n: NodeLine): BodyNode {
  const node = makeNode(id, n.size, n.spec);
  if (n.hpMax !== undefined) {
    node.hpMax = n.hpMax;
    node.hp = n.spec.hp ?? n.hpMax;
  }
  return node;
}

function buildSegment(id: number, a: number, b: number, s: SegmentLine): Segment {
  const seg = makeSegment(id, a, b, s.spec);
  if (s.hpMax !== undefined) {
    seg.hpMax = s.hpMax;
    seg.hp = s.spec.hp ?? s.hpMax;
  }
  return seg;
}

const SELF_RE = /^я\s+(узел|сегмент)\s+(\d+)(?:\.(\d+))?$/;
const FRONT_RE = /^фронт\s+(.+?)\s+(\d+)$/;
const REGROWTH_RE = /^отрастает\s+(\d+)\s+ходов=(\d+)\s+копий=(\d+)$/;

/**
 * One line of a part on its way back: a node, a segment or a membrane in the
 * canonical spelling, ids only. Its endpoints may name nodes of the body or
 * nodes long gone; the part keeps them as they are.
 */
function parsePartLine(line: string, part: PartSnapshot): void {
  const marks = new Marks();
  let m: RegExpExecArray | null;
  if ((m = NODE_RE.exec(line))) {
    const n = parseNodeLine(m, line, marks);
    if (!/^\d+$/.test(n.label)) fail(line, "a regrowing part names its nodes by id");
    part.nodes.push(buildNode(Number(n.label), n));
  } else if ((m = SEGMENT_RE.exec(line))) {
    const s = parseSegmentLine(m, line, marks);
    if (s.id === undefined || !/^\d+$/.test(s.a) || !/^\d+$/.test(s.b)) fail(line, "a regrowing part names its segments and their ends by id");
    part.segments.push(buildSegment(s.id, Number(s.a), Number(s.b), s));
  } else if ((m = MEMBRANE_RE.exec(line))) {
    const r = parseMembraneLine(m, line);
    if (r.id === undefined || r.area === undefined || !r.items.every((t) => /^\d+$/.test(t))) fail(line, "a regrowing membrane needs its id, segment ids and площадь=");
    part.membranes.push({ id: r.id, kind: r.kind, cycle: r.items.map(Number), area: r.area });
  } else fail(line, "cannot read a line of a regrowing part");
  if (marks.count > 0) fail(line, "* marks you in a part that is not grown yet");
}

export function bodyFromText(text: string): Body {
  const marks = new Marks();
  let meat: number | undefined;
  let nextId: number | undefined;
  const nodeLines: NodeLine[] = [];
  const segmentLines: SegmentLine[] = [];
  const membraneLines: MembraneLine[] = [];
  let place: Place | undefined;
  let pressure: number | undefined;
  const fronts: CoverFront[] = [];
  const regrowth: Regrowth[] = [];
  const eaten: Partial<Record<Eatable, number>> = {};

  for (const raw of text.split("\n")) {
    const hash = raw.indexOf("#");
    const line = (hash < 0 ? raw : raw.slice(0, hash)).trim();
    if (line.length === 0) continue;
    let m: RegExpExecArray | null;
    if ((m = /^мясо\s+(\S+)$/.exec(line))) meat = parseNumber(line, "мясо", m[1]!);
    else if ((m = /^следующий\s+(\d+)$/.exec(line))) nextId = Number(m[1]);
    else if ((m = SELF_RE.exec(line))) {
      if (place !== undefined) fail(line, "a second я");
      const index = m[3] === undefined ? undefined : Number(m[3]);
      if (m[1] === "узел") place = index === undefined ? { node: Number(m[2]) } : { node: Number(m[2]), end: index };
      else place = index === undefined ? { segment: Number(m[2]) } : { segment: Number(m[2]), slot: index };
    } else if ((m = /^давление\s+(\d+)$/.exec(line))) pressure = Number(m[1]);
    else if ((m = EATEN_RE.exec(line))) {
      const k = EATABLE_BY_RU.get(m[1]!);
      if (k === undefined) fail(line, `unknown part "${m[1]}"`);
      eaten[k] = Number(m[2]);
    }
    else if ((m = FRONT_RE.exec(line))) {
      const cover = COVER_BY_RU.get(m[1]!) as CoverId | undefined;
      if (cover === undefined) fail(line, `unknown cover "${m[1]}"`);
      fronts.push({ cover, turns: Number(m[2]) });
    } else if ((m = REGROWTH_RE.exec(line))) regrowth.push({ at: Number(m[1]), turns: Number(m[2]), copies: Number(m[3]), part: { nodes: [], segments: [], membranes: [] } });
    else if (line.startsWith("|")) {
      const r = regrowth[regrowth.length - 1];
      if (r === undefined) fail(line, "a part line before any отрастает");
      parsePartLine(line.slice(1).trim(), r.part);
    }
    else if ((m = NODE_RE.exec(line))) nodeLines.push(parseNodeLine(m, line, marks));
    else if ((m = SEGMENT_RE.exec(line))) segmentLines.push(parseSegmentLine(m, line, marks));
    else if ((m = MEMBRANE_RE.exec(line))) membraneLines.push(parseMembraneLine(m, line));
    else fail(line, "cannot read line");
  }

  // Ids: numeric labels are ids; word labels get the lowest free ids in order of appearance.
  const used = new Set<number>();
  const claim = (id: number, line: string): void => {
    if (used.has(id)) fail(line, `id ${id} is used twice`);
    used.add(id);
  };
  const nodeId = new Map<string, number>();
  for (const n of nodeLines) {
    if (nodeId.has(n.label)) fail(n.line, `node "${n.label}" is defined twice`);
    nodeId.set(n.label, -1);
    if (/^\d+$/.test(n.label)) claim(Number(n.label), n.line);
  }
  for (const s of segmentLines) if (s.id !== undefined) claim(s.id, s.line);
  for (const m of membraneLines) if (m.id !== undefined) claim(m.id, m.line);
  let counter = 1;
  const nextFree = (): number => {
    while (used.has(counter)) counter += 1;
    used.add(counter);
    return counter;
  };
  for (const n of nodeLines) nodeId.set(n.label, /^\d+$/.test(n.label) ? Number(n.label) : nextFree());
  for (const s of segmentLines) if (s.id === undefined) s.id = nextFree();
  for (const m of membraneLines) if (m.id === undefined) m.id = nextFree();

  const body = newBody();
  for (const n of nodeLines) {
    const id = nodeId.get(n.label)!;
    body.nodes[id] = buildNode(id, n);
  }
  for (const s of segmentLines) {
    const a = nodeId.get(s.a);
    const b = nodeId.get(s.b);
    if (a === undefined) fail(s.line, `unknown node "${s.a}"`);
    if (b === undefined) fail(s.line, `unknown node "${s.b}"`);
    if (a === b) fail(s.line, `segment joins node "${s.a}" to itself`);
    body.segments[s.id!] = buildSegment(s.id!, a, b, s);
  }
  // Places written in the text first, then every other flank takes the place its node gives it.
  for (const s of segmentLines) {
    if (s.place === undefined) continue;
    const f = body.segments[s.id!]!;
    const byId = /^№(\d+)$/.exec(s.place.end);
    const end = nodeId.get(s.place.end);
    const host =
      byId !== null
        ? Number(byId[1])
        : segmentIds(body).find((id) => {
            const h = body.segments[id]!;
            return h.kind !== "flank" && ((h.a === f.a && h.b === end) || (h.b === f.a && h.a === end));
          });
    if (host !== undefined && (body.segments[host] === undefined || body.segments[host]!.kind === "flank")) fail(s.line, `place names ${s.place.end}, which is no segment to hold a side node`);
    if (host === undefined) fail(s.line, `no segment from "${s.a}" to "${s.place.end}" to hold the side node`);
    f.place = { host, t: s.place.t, side: s.place.side };
  }
  reconcilePlaces(body);
  for (const m of membraneLines) {
    const cycle = membraneCycle(body, m, nodeId);
    const span = spanNodes(body, cycle) !== null;
    const membrane = { id: m.id!, kind: m.kind, cycle: span ? cycle : canonicalCycle(cycle), area: 0 };
    membrane.area = m.area ?? membraneArea(body, membrane);
    body.membranes[m.id!] = membrane;
  }
  const maxId = Math.max(0, ...used);
  if (nextId !== undefined && nextId <= maxId) throw new Error(`body text: следующий ${nextId} is not above id ${maxId}`);
  body.nextId = nextId ?? maxId + 1;

  if (pressure !== undefined) body.pressure = pressure;
  if (fronts.length > 0) body.fronts = fronts;
  if (regrowth.length > 0) body.regrowth = regrowth;
  if (Object.keys(eaten).length > 0) body.eaten = eaten;
  body.meat = meat ?? mass(body);

  // A place with no brain in it: the brain was destroyed, and `я` says where you were (decision 980).
  if (place !== undefined) {
    if (marks.count > 0) throw new Error("body text: я and a brain marked with * both say where you are");
    if (resolvePlace(body, place) !== undefined) throw new Error(`body text: ${placeText(place)} names a brain, mark it with * instead`);
    body.self = place;
    const errors = validate(body, { self: false, meat: false });
    if (errors.length > 0) throw new Error(`body text: ${errors.join("; ")}`);
    return body;
  }

  if (marks.count === 0) throw new Error("body text: no brain marked with * — where are you?");
  if (marks.count > 1) throw new Error(`body text: ${marks.count} brains marked with *, only one is you`);
  const self = marks.self!;
  let placed = false;
  for (const id of nodeIds(body)) {
    body.nodes[id]!.ends.forEach((e, end) => {
      if (e.contents?.includes(self)) {
        body.self = canonicalPlace(body, { node: id, end });
        placed = true;
      }
    });
  }
  for (const id of segmentIds(body)) {
    const slot = body.segments[id]!.cavity.indexOf(self);
    if (slot >= 0) {
      body.self = canonicalPlace(body, { segment: id, slot });
      placed = true;
    }
  }
  if (!placed) throw new Error("body text: the brain marked with * sits neither in a head nor in a cavity");

  // мясо is a number the body holds, and gear takes mass past it (decision 981): the text reports it, it does not judge it.
  const errors = validate(body, { meat: false });
  if (errors.length > 0) throw new Error(`body text: ${errors.join("; ")}`);
  return body;
}
