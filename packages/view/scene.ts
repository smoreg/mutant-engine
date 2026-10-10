/**
 * Pictures of the lab as SVG strings: the silhouette of the model with the
 * lab's layers folded in - halos under what a step added or changed, ghosts
 * of what it removed, the candidates of a draw as dots sized by weight with
 * the chosen one ringed, the preview of a cut or a separation, the pieces
 * that fell off drawn beside the body, and transparent hit areas for the
 * page. It also bends the layout towards a human before it draws
 * (`graphLook`). Strings only; the page puts them into the DOM.
 */
import { INK, silhouetteSvg, SVG_FRAME, TONE, type TerritoryOverlay } from "./svg.js";
import { composeBody } from "./compose.js";
import { pixelImageSvg } from "./png.js";
import { layout, polylineLength, type Layout, type Point } from "./layout.js";
import { nodeIds, segmentIds, selfElement, targetName, type Body, type CutPreview, type End, type Ids, type SegmentKind, type Target, type Weighted } from "@mutant-engine/core";
import { pose } from "./rig.js";
import type { SpritePlan } from "./sprite.js";
import { layoutBox, pinLayout, type Pins } from "./pins.js";

const U = SVG_FRAME.unit;
const PAD = SVG_FRAME.pad;

export interface Highlight {
  added: Ids;
  changed: Ids;
  removed: Ids;
  /** The body and layout before the step, where the ghosts of the removed are drawn. */
  before: Body | null;
  beforeLayout: Layout | null;
}

export interface Candidates {
  list: Weighted[];
  chosen: Target | null;
  /** The same list without the spread, when the spread is on. */
  base: Weighted[] | null;
}

interface CutMark {
  segment: number;
  end: End;
  preview: CutPreview;
  /** Elements that stay with you but lose their path to a heart once the cut is made. */
  starving: number[];
}

export interface SeparateMark {
  /** Segments of the border, with the share of each that stays with you, measured from your end. */
  border: { segment: number; mineShare: number; mineEnd: End }[];
  /** Nodes and segments of the territory that leaves. */
  leaves: Ids;
  bleeding: number[];
  color: string;
}

export interface DetachedPiece {
  body: Body;
  label: string;
}

/** A halo of one colour under some elements: the wound simulator paints states with it. */
export interface Tint {
  ids: Ids;
  color: string;
  cls: string;
}

export interface Scene {
  body: Body;
  layout: Layout;
  /** Width in pixels. */
  size: number;
  territories?: TerritoryOverlay[];
  highlight?: Highlight;
  candidates?: Candidates;
  cut?: CutMark;
  separate?: SeparateMark;
  detached?: DetachedPiece[];
  /** Halos under the body, drawn in order. */
  tints?: Tint[];
  /** Elements marked with a drop of blood. */
  bleeding?: number[];
  /** Rings around elements, over the body: the one selected. */
  rings?: { ids: Ids; color: string }[];
  /** Tooltip of the hit areas; the default says a click opens the part's card. */
  hitTitle?: string;
  /** Transparent hit areas with data-seg / data-node, for the page's clicks. */
  hit?: boolean;
  labels?: boolean;
}

function f(v: number): string {
  const s = v.toFixed(1);
  return s === "-0.0" ? "0.0" : s;
}

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function pathOf(points: Point[]): string {
  let d = "";
  for (let i = 0; i < points.length; i++) d += `${i === 0 ? "M" : "L"}${f(points[i]!.x * U)} ${f(points[i]!.y * U)}`;
  return d;
}

function along(points: Point[], t: number): { p: Point; angle: number } {
  const total = polylineLength(points);
  let want = total * t;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (want <= len || i === points.length - 1) {
      const k = len < 1e-12 ? 0 : Math.min(1, want / len);
      return { p: { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }, angle: Math.atan2(b.y - a.y, b.x - a.x) };
    }
    want -= len;
  }
  return { p: points[0]!, angle: 0 };
}

// ---------------------------------------------------------------- human proportions

/**
 * How the graph view bends the layout towards a human (decision 125): a head
 * reads as a head and legs are longer than the torso. The body is not
 * touched, and neither is `layout()`: this is the picture only, and the page
 * hangs its hit areas and its dragged pins on the same bent layout, so a
 * click lands where the eye sees the part.
 */
export const GRAPH_LOOK = {
  /** The radius of a node that carries a head. */
  head: 1.6,
  /** Drawn length of a segment by kind; anything missing keeps the model's. */
  stretch: { leg: 1.7 } as Partial<Record<SegmentKind, number>>,
};

function adjacency(body: Body): Map<number, { segment: number; other: number }[]> {
  const out = new Map<number, { segment: number; other: number }[]>();
  const add = (at: number, segment: number, other: number): void => {
    const list = out.get(at);
    if (list === undefined) out.set(at, [{ segment, other }]);
    else list.push({ segment, other });
  };
  for (const [key, s] of Object.entries(body.segments)) {
    const id = Number(key);
    add(s.a, id, s.b);
    add(s.b, id, s.a);
  }
  return out;
}

/** How far each node moves when the stretched kinds grow: a node carries everything hanging beyond it. */
function stretchDeltas(body: Body, l: Layout): Pins {
  const at = new Map(l.nodes.map((n) => [n.id, n]));
  // The picture hangs from your brain, whether it sits in a head or in a torso.
  const self = selfElement(body);
  const root = at.has(self) ? self : (body.segments[self]?.a ?? l.order[0] ?? l.nodes[0]?.id);
  if (root === undefined) return {};
  const adj = adjacency(body);
  const delta = new Map<number, Point>([[root, { x: 0, y: 0 }]]);
  const queue = [root];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const d = delta.get(id)!;
    for (const { segment, other } of adj.get(id) ?? []) {
      if (delta.has(other)) continue;
      const k = GRAPH_LOOK.stretch[body.segments[segment]!.kind] ?? 1;
      const from = at.get(id);
      const to = at.get(other);
      delta.set(other, k === 1 || from === undefined || to === undefined ? d : { x: d.x + (k - 1) * (to.x - from.x), y: d.y + (k - 1) * (to.y - from.y) });
      queue.push(other);
    }
  }
  const pins: Pins = {};
  for (const [id, d] of delta) if (d.x !== 0 || d.y !== 0) pins[id] = d;
  return pins;
}

/** The layout of the graph view: the model's, bent to human proportions. */
export function graphLook(body: Body, l: Layout): Layout {
  const heads = new Set<number>();
  for (const [key, n] of Object.entries(body.nodes)) if (n.ends.some((e) => e.kind === "head")) heads.add(Number(key));
  const nodes = l.nodes.map((n) => (heads.has(n.id) ? { ...n, r: n.r * GRAPH_LOOK.head } : n));
  const grown: Layout = nodes.every((n, i) => n === l.nodes[i]) ? l : { ...l, nodes };
  const out = pinLayout(grown, stretchDeltas(body, l), body);
  return { ...out, bbox: layoutBox(out) };
}

function nodeMap(l: Layout): Map<number, Layout["nodes"][number]> {
  return new Map(l.nodes.map((n) => [n.id, n]));
}

function segMap(l: Layout): Map<number, Layout["segments"][number]> {
  return new Map(l.segments.map((s) => [s.id, s]));
}

/** Where a target sits on the picture, in body units. */
function targetPoint(body: Body, l: Layout, t: Target): Point | null {
  const nodes = nodeMap(l);
  const segs = segMap(l);
  if ("node" in t) {
    const n = nodes.get(t.node);
    return n === undefined ? null : { x: n.x, y: n.y };
  }
  if ("segment" in t) {
    const s = segs.get(t.segment);
    return s === undefined ? null : along(s.points, 0.5).p;
  }
  if ("ending" in t) {
    const n = nodes.get(t.ending.node);
    if (n === undefined) return null;
    const count = body.nodes[t.ending.node]?.ends.length ?? 1;
    const spread = count > 1 ? (t.ending.index - (count - 1) / 2) * 0.22 : 0;
    return { x: n.x + spread, y: n.y - n.r * 0.3 };
  }
  if ("pair" in t) {
    const a = nodes.get(t.pair[0]);
    const b = nodes.get(t.pair[1]);
    return a === undefined || b === undefined ? null : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  const ids = new Set<number>();
  for (const sid of t.cycle) {
    const s = body.segments[sid];
    if (s !== undefined) ids.add(s.a).add(s.b);
  }
  const pts = [...ids].map((id) => nodes.get(id)).filter((n): n is Layout["nodes"][number] => n !== undefined);
  if (pts.length === 0) return null;
  return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
}

function frameOf(l: Layout): { vx: number; vy: number; w: number; h: number } {
  return { vx: (l.bbox.x0 - PAD) * U, vy: (l.bbox.y0 - PAD) * U, w: (l.bbox.x1 - l.bbox.x0 + 2 * PAD) * U, h: (l.bbox.y1 - l.bbox.y0 + 2 * PAD) * U };
}

/** Halos under the body: a wider stroke along a segment, a disc around a node, a polygon over a membrane. */
function haloLayer(body: Body, l: Layout, ids: Ids, color: string, upp: number, cls: string): string {
  const nodes = nodeMap(l);
  const segs = segMap(l);
  const out: string[] = [];
  for (const id of ids.segments) {
    const s = segs.get(id);
    if (s !== undefined) out.push(`<path d="${pathOf(s.points)}" stroke="${color}" stroke-width="${f(s.width * U + 9 * upp)}" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity=".75"/>`);
  }
  for (const id of ids.nodes) {
    const n = nodes.get(id);
    if (n !== undefined) out.push(`<circle cx="${f(n.x * U)}" cy="${f(n.y * U)}" r="${f(n.r * U + 5 * upp)}" fill="${color}" opacity=".8"/>`);
  }
  for (const id of ids.membranes) {
    const m = l.membranes.find((x) => x.id === id);
    if (m !== undefined && m.polygon.length >= 3) out.push(`<polygon points="${m.polygon.map((p) => `${f(p.x * U)},${f(p.y * U)}`).join(" ")}" fill="none" stroke="${color}" stroke-width="${f(6 * upp)}" opacity=".8"/>`);
  }
  void body;
  return out.length === 0 ? "" : `<g class="${cls}">${out.join("")}</g>`;
}

/** Ghosts of what a step removed, on the places the previous layout gave them. */
function ghostLayer(before: Body, bl: Layout, ids: Ids, upp: number): string {
  const nodes = nodeMap(bl);
  const segs = segMap(bl);
  const out: string[] = [];
  const dash = `${f(4 * upp)} ${f(3 * upp)}`;
  for (const id of ids.membranes) {
    const m = bl.membranes.find((x) => x.id === id);
    if (m !== undefined && m.polygon.length >= 3) out.push(`<polygon points="${m.polygon.map((p) => `${f(p.x * U)},${f(p.y * U)}`).join(" ")}" fill="${TONE.flesh}" fill-opacity=".12" stroke="${TONE.flesh}" stroke-width="${f(1.5 * upp)}" stroke-dasharray="${dash}"/>`);
  }
  for (const id of ids.segments) {
    const s = segs.get(id);
    if (s === undefined) continue;
    out.push(`<path d="${pathOf(s.points)}" stroke="${TONE.flesh}" stroke-width="${f(Math.max(2 * upp, s.width * U * 0.7))}" stroke-dasharray="${dash}" stroke-linecap="round" fill="none" opacity=".7"/>`);
  }
  for (const id of ids.nodes) {
    const n = nodes.get(id);
    if (n === undefined) continue;
    out.push(`<circle cx="${f(n.x * U)}" cy="${f(n.y * U)}" r="${f(n.r * U)}" fill="${TONE.flesh}" fill-opacity=".15" stroke="${TONE.flesh}" stroke-width="${f(1.5 * upp)}" stroke-dasharray="${dash}"/>`);
  }
  void before;
  return out.length === 0 ? "" : `<g class="ghost">${out.join("")}</g>`;
}

function candidateLayer(body: Body, l: Layout, c: Candidates, upp: number): string {
  if (c.list.length === 0) return "";
  const nodes = nodeMap(l);
  let max = 0;
  let total = 0;
  for (const w of c.list) {
    max = Math.max(max, w.weight);
    total += w.weight;
  }
  const out: string[] = [];
  const chosenKey = c.chosen === null ? "" : JSON.stringify(c.chosen);
  let chosenMark = "";
  c.list.forEach((w, i) => {
    const p = targetPoint(body, l, w.target);
    if (p === null) return;
    const r = (4.5 + 9 * Math.sqrt(w.weight / max)) * upp;
    const share = total > 0 ? (100 * w.weight) / total : 0;
    const base = c.base?.[i];
    const why = base !== undefined && Math.abs(base.weight - w.weight) > 1e-9 ? `; §8 ${base.weight.toFixed(2)} × соседство ${(w.weight / base.weight).toFixed(2)}` : "";
    const title = `<title>${esc(targetName(body, w.target))}: вес ${w.weight.toFixed(2)} (${share.toFixed(1)} %)${why}</title>`;
    if ("pair" in w.target) {
      const a = nodes.get(w.target.pair[0]);
      const b = nodes.get(w.target.pair[1]);
      if (a !== undefined && b !== undefined) out.push(`<line x1="${f(a.x * U)}" y1="${f(a.y * U)}" x2="${f(b.x * U)}" y2="${f(b.y * U)}" stroke="${TONE.amber}" stroke-width="${f(1.5 * upp)}" stroke-dasharray="${f(3 * upp)} ${f(3 * upp)}" opacity=".7"/>`);
    }
    const chosen = JSON.stringify(w.target) === chosenKey;
    out.push(`<circle class="cand${chosen ? " chosen" : ""}" cx="${f(p.x * U)}" cy="${f(p.y * U)}" r="${f(r)}" fill="${TONE.amber}" fill-opacity="${chosen ? "1" : ".8"}" stroke="${INK.paper}" stroke-width="${f(1.2 * upp)}">${title}</circle>`);
    if (chosen) {
      chosenMark = `<circle cx="${f(p.x * U)}" cy="${f(p.y * U)}" r="${f(r + 7 * upp)}" fill="none" stroke="${INK.ground}" stroke-width="${f(6 * upp)}"/><circle cx="${f(p.x * U)}" cy="${f(p.y * U)}" r="${f(r + 7 * upp)}" fill="none" stroke="${INK.paper}" stroke-width="${f(3 * upp)}"/><circle cx="${f(p.x * U)}" cy="${f(p.y * U)}" r="${f(r + 7 * upp)}" fill="none" stroke="${TONE.amber}" stroke-width="${f(1.5 * upp)}" stroke-dasharray="${f(3 * upp)} ${f(3 * upp)}"/>`;
    }
  });
  return `<g class="candidates">${out.join("")}${chosenMark}</g>`;
}

/** A tick across a segment at a fraction of its length: where a knife would go. */
function knife(points: Point[], t: number, width: number, upp: number, color: string): string {
  const { p, angle } = along(points, t);
  const half = width * U * 0.5 + 6 * upp;
  const nx = -Math.sin(angle) * half;
  const ny = Math.cos(angle) * half;
  return `<path d="M${f(p.x * U - nx)} ${f(p.y * U - ny)}L${f(p.x * U + nx)} ${f(p.y * U + ny)}" stroke="${INK.ground}" stroke-width="${f(5 * upp)}" stroke-linecap="round"/><path d="M${f(p.x * U - nx)} ${f(p.y * U - ny)}L${f(p.x * U + nx)} ${f(p.y * U + ny)}" stroke="${color}" stroke-width="${f(2.5 * upp)}" stroke-linecap="round"/>`;
}

function bleedDots(body: Body, l: Layout, ids: number[], upp: number): string {
  const nodes = nodeMap(l);
  const segs = segMap(l);
  const out: string[] = [];
  for (const id of ids) {
    const n = nodes.get(id);
    let p: Point | null = null;
    if (n !== undefined) p = { x: n.x, y: n.y };
    else {
      const s = segs.get(id);
      if (s !== undefined) p = along(s.points, 0.5).p;
    }
    if (p === null) continue;
    out.push(`<circle class="bleed" cx="${f(p.x * U)}" cy="${f(p.y * U)}" r="${f(4 * upp)}" fill="${TONE.flesh}" stroke="${INK.paper}" stroke-width="${f(1.2 * upp)}"><title>кровь: ${esc(String(id))}</title></circle>`);
  }
  void body;
  return out.join("");
}

function cutLayer(body: Body, l: Layout, c: CutMark, upp: number): string {
  const segs = segMap(l);
  const s = segs.get(c.segment);
  if (s === undefined) return "";
  const leaving: Ids = { nodes: [], segments: [], membranes: [] };
  for (const o of c.preview.others) {
    leaving.nodes.push(...o.part.nodes);
    leaving.segments.push(...o.part.segments);
  }
  leaving.membranes.push(...c.preview.torn);
  const out: string[] = [];
  out.push(haloLayer(body, l, leaving, TONE.flesh, upp, "leaving"));
  // The segment goes with the far side: the knife sits near the end it is cut at; points[0] is end a.
  const t = c.end === "a" ? 0.12 : 0.88;
  out.push(`<path d="${pathOf(s.points)}" stroke="${TONE.flesh}" stroke-width="${f(s.width * U + 4 * upp)}" stroke-linecap="round" fill="none" opacity=".35"/>`);
  out.push(knife(s.points, t, s.width, upp, INK.paper));
  const nodes = nodeMap(l);
  const dash = `${f(3 * upp)} ${f(3 * upp)}`;
  for (const id of c.starving) {
    const n = nodes.get(id);
    if (n !== undefined) {
      out.push(`<circle cx="${f(n.x * U)}" cy="${f(n.y * U)}" r="${f(n.r * U + 4 * upp)}" fill="none" stroke="${INK.paper2}" stroke-width="${f(1.5 * upp)}" stroke-dasharray="${dash}"><title>останется без крови</title></circle>`);
      continue;
    }
    const sg = segs.get(id);
    if (sg !== undefined) out.push(`<path d="${pathOf(sg.points)}" stroke="${INK.paper2}" stroke-width="${f(sg.width * U + 5 * upp)}" stroke-dasharray="${dash}" stroke-linecap="round" fill="none" opacity=".6"><title>останется без крови</title></path>`);
  }
  out.push(bleedDots(body, l, c.preview.bleeding, upp));
  return `<g class="cut">${out.join("")}</g>`;
}

function separateLayer(body: Body, l: Layout, m: SeparateMark, upp: number): string {
  const segs = segMap(l);
  const out: string[] = [haloLayer(body, l, m.leaves, m.color, upp, "leaving")];
  for (const b of m.border) {
    const s = segs.get(b.segment);
    const seg = body.segments[b.segment];
    if (s === undefined || seg === undefined) continue;
    // points[0] is end a; the knife sits mineShare of the way from your end.
    const t = b.mineEnd === "a" ? b.mineShare : 1 - b.mineShare;
    out.push(`<path d="${pathOf(s.points)}" stroke="${m.color}" stroke-width="${f(s.width * U + 4 * upp)}" stroke-dasharray="${f(5 * upp)} ${f(4 * upp)}" stroke-linecap="round" fill="none" opacity=".7"/>`);
    out.push(knife(s.points, Math.min(0.94, Math.max(0.06, t)), s.width, upp, INK.paper));
  }
  out.push(bleedDots(body, l, m.bleeding, upp));
  return `<g class="separate">${out.join("")}</g>`;
}

function hitLayer(body: Body, l: Layout, upp: number, title = "клик — карточка части"): string {
  const out: string[] = [];
  for (const s of l.segments) {
    out.push(`<path class="hit" data-seg="${s.id}" d="${pathOf(s.points)}" stroke="transparent" stroke-width="${f(Math.max(s.width * U + 6 * upp, 12 * upp))}" stroke-linecap="round" fill="none" pointer-events="stroke"><title>${esc(targetName(body, { segment: s.id }))}: ${esc(title)}</title></path>`);
  }
  for (const n of l.nodes) {
    out.push(`<circle class="hit" data-node="${n.id}" cx="${f(n.x * U)}" cy="${f(n.y * U)}" r="${f(Math.max(n.r * U + 2 * upp, 8 * upp))}" fill="transparent" pointer-events="fill"><title>${esc(targetName(body, { node: n.id }))}</title></circle>`);
  }
  return `<g class="hits">${out.join("")}</g>`;
}

/** Outlines over the body: a dashed ring around a node, a dashed band along a segment. */
function ringLayer(l: Layout, ids: Ids, color: string, upp: number): string {
  const nodes = nodeMap(l);
  const segs = segMap(l);
  const dash = `${f(4 * upp)} ${f(3 * upp)}`;
  const out: string[] = [];
  for (const id of ids.nodes) {
    const n = nodes.get(id);
    if (n !== undefined) out.push(`<circle cx="${f(n.x * U)}" cy="${f(n.y * U)}" r="${f(n.r * U + 6 * upp)}" fill="none" stroke="${color}" stroke-width="${f(2 * upp)}" stroke-dasharray="${dash}"/>`);
  }
  for (const id of ids.segments) {
    const s = segs.get(id);
    if (s !== undefined) out.push(`<path d="${pathOf(s.points)}" stroke="${color}" stroke-width="${f(s.width * U + 10 * upp)}" stroke-dasharray="${dash}" stroke-linecap="round" fill="none" opacity=".9"/>`);
  }
  return `<g class="rings" pointer-events="none">${out.join("")}</g>`;
}

function labelLayer(l: Layout, upp: number): string {
  const out: string[] = [];
  for (const n of l.nodes) out.push(`<text x="${f(n.x * U + n.r * U + 2 * upp)}" y="${f(n.y * U - n.r * U)}" font-size="${f(9 * upp)}" font-family="ui-monospace,monospace" fill="${INK.paper3}">${n.id}</text>`);
  for (const s of l.segments) {
    const { p } = along(s.points, 0.5);
    out.push(`<text x="${f(p.x * U + 3 * upp)}" y="${f(p.y * U - 3 * upp)}" font-size="${f(8 * upp)}" font-family="ui-monospace,monospace" fill="${INK.paper3}" opacity=".8">${s.id}</text>`);
  }
  return `<g class="labels" pointer-events="none">${out.join("")}</g>`;
}

/** A detached piece drawn to the right of the body at the same scale, faded, with a caption. */
function detachedLayer(pieces: DetachedPiece[], frame: { vx: number; vy: number; w: number; h: number }, upp: number): { svg: string; w: number; h: number } {
  let x = frame.vx + frame.w + 1.2 * U;
  let h = frame.h;
  const out: string[] = [];
  for (const piece of pieces) {
    const l = layout(piece.body);
    const pf = frameOf(l);
    const inner = silhouetteSvg(piece.body, { size: pf.w, layout: l, bridges: false }).replace(/^<svg /, `<svg x="${f(x)}" y="${f(frame.vy + 14 * upp)}" `).replace('class="silhouette"', 'class="detached"');
    out.push(`<g class="piece" opacity=".6">${inner}</g>`);
    out.push(`<text x="${f(x + pf.w / 2)}" y="${f(frame.vy + 10 * upp)}" text-anchor="middle" font-size="${f(12 * upp)}" font-weight="600" font-family="system-ui,sans-serif" fill="${TONE.flesh}">${esc(piece.label)}</text>`);
    x += pf.w + 0.8 * U;
    h = Math.max(h, pf.h + 14 * upp);
  }
  return { svg: `<g class="pieces">${out.join("")}</g>`, w: x - frame.vx, h };
}

/**
 * Organ and growth stamps at a fraction of the size the silhouette gives
 * them, about their own centre: at full size a heart and a stomach cover the
 * torso they sit in. A stamp is a group of one image, so the group is
 * scaled where it stands and nothing else moves.
 */
const STAMP_SHRINK = 0.6;

function shrinkStamps(svg: string, k: number): string {
  return svg.replace(/<g class="(?:organ|growth|psi)[^"]*" shape-rendering="crispEdges">[\s\S]*?<\/g>/g, (group) => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const m of group.matchAll(/<(?:rect|image) x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)) {
      const x = Number(m[1]);
      const y = Number(m[2]);
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x + Number(m[3]));
      y1 = Math.max(y1, y + Number(m[4]));
    }
    if (!Number.isFinite(x0)) return group;
    const cx = ((x0 + x1) / 2) * (1 - k);
    const cy = ((y0 + y1) / 2) * (1 - k);
    return group.replace(' shape-rendering="crispEdges"', ` transform="translate(${f(cx)} ${f(cy)}) scale(${k})" shape-rendering="crispEdges"`);
  });
}

/** The silhouette with the lab's layers folded in. */
export function sceneSvg(sc: Scene): string {
  const { body, layout: l } = sc;
  // A body of one node would fill the canvas with a head: the picture never grows past five times its natural size.
  const size = Math.min(sc.size, Math.max(160, Math.round(5 * frameOf(l).w)));
  // The scheme is the inside view: organs as their stamps, so a heart and a lung tell apart.
  const base = shrinkStamps(silhouetteSvg(body, { size, layout: l, territories: sc.territories ?? [], organStamps: true }), STAMP_SHRINK);
  const frame = frameOf(l);
  let w = frame.w;
  let h = frame.h;
  let upp = w / size;
  let pieces = "";
  if (sc.detached !== undefined && sc.detached.length > 0) {
    const d = detachedLayer(sc.detached, frame, upp);
    w = d.w;
    h = d.h;
    upp = w / size;
    pieces = d.svg;
  }
  const height = Math.round((size * h) / w);
  const under: string[] = [];
  const over: string[] = [];
  if (sc.highlight !== undefined) {
    under.push(haloLayer(body, l, sc.highlight.changed, TONE.bile, upp, "changed"));
    under.push(haloLayer(body, l, sc.highlight.added, TONE.bio, upp, "added"));
    if (sc.highlight.before !== null && sc.highlight.beforeLayout !== null) over.push(ghostLayer(sc.highlight.before, sc.highlight.beforeLayout, sc.highlight.removed, upp));
  }
  for (const t of sc.tints ?? []) under.push(haloLayer(body, l, t.ids, t.color, upp, t.cls));
  for (const r of sc.rings ?? []) over.push(ringLayer(l, r.ids, r.color, upp));
  if (sc.bleeding !== undefined && sc.bleeding.length > 0) over.push(`<g class="bleeding">${bleedDots(body, l, sc.bleeding, upp)}</g>`);
  if (sc.cut !== undefined) over.push(cutLayer(body, l, sc.cut, upp));
  if (sc.separate !== undefined) over.push(separateLayer(body, l, sc.separate, upp));
  if (sc.candidates !== undefined) over.push(candidateLayer(body, l, sc.candidates, upp));
  if (sc.labels === true) over.push(labelLayer(l, upp));
  over.push(pieces);
  if (sc.hit === true) over.push(hitLayer(body, l, upp, sc.hitTitle));
  const open = base.indexOf(">") + 1;
  const tag = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${height}" viewBox="${f(frame.vx)} ${f(frame.vy)} ${f(w)} ${f(h)}" class="silhouette scene" data-upp="${upp}">`;
  return tag + under.join("") + base.slice(open, -6) + over.join("") + "</svg>";
}

/** The sprite as one crisp image: a rect per run of pixels was thousands of DOM nodes a body. */
export function spriteSvg(plan: SpritePlan, cell = 3): string {
  return pixelImageSvg({ w: plan.px, h: plan.px, cells: plan.cells, palette: plan.palette }, cell, "sprite");
}

// ---------------------------------------------------------------- the wounded sprite

interface WoundSprite {
  body: Body;
  layout: Layout;
  /** The seed the sprite is composed from. */
  seed: number;
  /** The moment the body is posed at. */
  t: number;
  /** Width in pixels. */
  size: number;
  /** Halos under the parts, from `bodyTints` of `damage.ts`. */
  tints: readonly Tint[];
  bleeding: readonly number[];
  rings: readonly { ids: Ids; color: string }[];
  /** Transparent hit areas with data-seg / data-node, for the page's clicks. */
  hit?: boolean;
}

/**
 * The same wounds on the pixel sprite: the body is posed and drawn by
 * `composeBody`, and every hurt, starving, bleeding or rotting part gets a
 * mark over it. The pose is worked out here and handed to the frame, so a
 * mark sits exactly where the limb it names is drawn (`ppu`, `ox`, `oy` map
 * layout units to pixels).
 *
 * It was the wound tab's own and read that page's singleton; it takes its
 * arguments now, because the colosseum draws its fighters the same way and a
 * second page could not call it (decision 571).
 */
export function woundSpriteSvg(s: WoundSprite): string {
  const { body } = s;
  const p = pose(body, s.layout, s.t, s.seed);
  const frame = composeBody(body, { layout: s.layout, seed: s.seed, t: s.t, pose: p });
  const box = frame.box ?? { x0: 0, y0: 0, x1: frame.w - 1, y1: frame.h - 1 };
  const pad = 6;
  const x0 = Math.max(0, box.x0 - pad);
  const y0 = Math.max(0, box.y0 - pad);
  const w = Math.max(1, Math.min(frame.w - 1, box.x1 + pad) - x0 + 1);
  const h = Math.max(1, Math.min(frame.h - 1, box.y1 + pad) - y0 + 1);
  const cell = Math.max(1, Math.floor(s.size / Math.max(w, h)));
  const X = (u: number): number => u * frame.ppu + frame.ox;
  const Y = (u: number): number => u * frame.ppu + frame.oy;
  const spot = (id: number): { x: number; y: number; r: number } | null => {
    const seg = body.segments[id];
    if (seg !== undefined) {
      const pts = p.segments[id];
      if (pts === undefined || pts.length === 0) return null;
      const q = pts[Math.floor(pts.length / 2)]!;
      return { x: X(q.x), y: Y(q.y), r: Math.max(3, 0.3 * frame.ppu * seg.girth) };
    }
    const n = p.nodes[id];
    const node = body.nodes[id];
    if (n === undefined || node === undefined) return null;
    return { x: X(n.x), y: Y(n.y), r: Math.max(3, 0.35 * frame.ppu * node.size) };
  };
  const marks: string[] = [];
  for (const t of s.tints) {
    for (const id of [...t.ids.nodes, ...t.ids.segments]) {
      const q = spot(id);
      if (q !== null) marks.push(`<circle cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="${q.r.toFixed(1)}" fill="${t.color}" fill-opacity="0.5"/>`);
    }
  }
  for (const r of s.rings) {
    for (const id of [...r.ids.nodes, ...r.ids.segments]) {
      const q = spot(id);
      if (q !== null) marks.push(`<circle cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="${(q.r + 2).toFixed(1)}" fill="none" stroke="${r.color}" stroke-width="1.5"/>`);
    }
  }
  for (const id of s.bleeding) {
    const q = spot(id);
    if (q === null) continue;
    marks.push(`<circle cx="${(q.x + q.r).toFixed(1)}" cy="${(q.y + q.r).toFixed(1)}" r="2" fill="${TONE.flesh}"/>`);
  }
  const hits: string[] = [];
  if (s.hit === true) {
    for (const id of nodeIds(body)) {
      const q = spot(id);
      if (q !== null) hits.push(`<circle class="hit" data-node="${id}" cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="${Math.max(4, q.r).toFixed(1)}" fill="transparent"><title>${esc(targetName(body, { node: id }))}</title></circle>`);
    }
    for (const id of segmentIds(body)) {
      const q = spot(id);
      if (q !== null) hits.push(`<circle class="hit" data-seg="${id}" cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="${Math.max(4, q.r).toFixed(1)}" fill="transparent"><title>${esc(targetName(body, { segment: id }))}</title></circle>`);
    }
  }
  // The pixels are one image of the cropped region, not a rect per run: a mutated body was ten thousand nodes.
  const svg = pixelImageSvg(frame, cell, "pixels", x0, y0, w, h);
  return svg.replace("</svg>", `<g class="wounds" pointer-events="none">${marks.join("")}</g><g class="hit">${hits.join("")}</g></svg>`);
}

export { U as SVG_UNIT };
