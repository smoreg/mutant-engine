/**
 * The silhouette of a body as an SVG string, drawn from `layout`: territories
 * underneath, membranes as fills, segments as strokes coloured by cover with
 * a torso as a body with an outline and its side nodes on it (flanks are not
 * drawn), the cavity of a torso as a dark channel and its organs as dots, break planes
 * as ticks across bridges, nodes as joints and endings as small glyphs, your
 * brain amber. Pure text, no DOM, one decimal per coordinate.
 */
import { bridges, hasTag, nodeIds, spriteScaleOf, type Body, type CoverId, type Organ, type OrganKind, type Segment } from "@mutant-engine/core";
import { layout, polylineLength, type Layout, type LayoutSegment, type LengthScale, type Point } from "./layout.js";
import { PALETTE, RAMPS, VISUALS, paletteIndex, rampOf, stampFor, type Ramp, type Stamp } from "./stamps.js";
import { ENDING_SPRITES, dirOf, endingSprite, type Mask } from "./sprites.js";
import { framePngUrl } from "./png.js";

/** What the underlay needs of a territory; `territories()` of a body fits as it is. */
export interface TerritoryOverlay {
  nodes: number[];
  color?: string;
}

interface SvgOptions {
  /** Width in pixels; the height follows the body. Default 240. */
  size?: number;
  /** Coloured underlay per foreign brain; nothing is drawn without it. */
  territories?: TerritoryOverlay[];
  /** Ticks of the break plane across bridges. Default true. */
  bridges?: boolean;
  /** Cavity channel and organ dots inside torsos. Default true. */
  cavities?: boolean;
  /** Organs in a cavity and growths on a surface as their pixel stamps instead of dots, so they tell apart. Default false. */
  organStamps?: boolean;
  /** Node ids next to nodes. Default false. */
  labels?: boolean;
  /** Paint the ink-0 ground; otherwise transparent. Default false. */
  background?: boolean;
  /** A layout computed earlier for the same body. */
  layout?: Layout;
  /** Length scale when no layout is given: `linear` (default, the full body view) or `sqrt` (a sidebar). */
  scale?: LengthScale;
}

/** Units to pixels inside the viewBox. */
const U = 20;
const PAD = 0.6;

/** The silhouette's frame: viewBox pixels per body unit and the padding around the bbox, for anything drawn over it. */
export const SVG_FRAME = { unit: U, pad: PAD } as const;

export const INK = { ground: "#0b0a09", panel: "#14110e", joint: "#28221c", line: "#3b3127", paper: "#e9dec9", paper2: "#b4a890", paper3: "#938775" } as const;
export const TONE = { amber: "#cf9550", flesh: "#c4493b", bile: "#d3a947", ok: "#8bab6c", chrome: "#7fa8ba", bio: "#5fd4b1", head: "#b58ad0", gut: "#c9a15b", sec: "#8fb35a", alien: "#d47aa8", ctrl: "#9a8f7d" } as const;

export const COVER_COLORS: Record<CoverId, string> = {
  skin: "#b98b6e",
  chitin: "#8c6a3f",
  scales: "#6d8f86",
  dragonScales: "#3f5f57",
  slime: "#6fae7f",
  suckers: "#a8636d",
  fur: "#9c805a",
  bark: "#6b5238",
  plates: "#a49d8c",
  chrome: TONE.chrome,
  // --- lab/beasts: covers
  feathers: "#8a5535",
  stone: "#78736c",
};

/** Skin of a head: a shade lighter than the cover of its neck. */
export const HEAD_COLOR = "#d2a07e";

const TERRITORY_COLORS = [TONE.head, TONE.alien, TONE.sec, TONE.gut, TONE.ctrl, TONE.chrome];

function f(v: number): string {
  const s = v.toFixed(1);
  return s === "-0.0" ? "0.0" : s;
}

function organColor(o: Organ, self: boolean): string {
  switch (o.kind) {
    case "heart":
      return TONE.flesh;
    case "brain":
      return self ? TONE.amber : TONE.head;
    case "lungs":
      return INK.paper2;
    case "stomach":
    case "gut":
      return TONE.gut;
    case "gland":
    case "womb":
      return TONE.sec;
    default:
      return INK.paper3;
  }
}

function pathOf(points: Point[]): string {
  let d = "";
  for (let i = 0; i < points.length; i++) d += `${i === 0 ? "M" : "L"}${f(points[i]!.x * U)} ${f(points[i]!.y * U)}`;
  return d;
}

/** Point and direction at a fraction of a polyline's length. */
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

/** A node that only ends a penis. */
function isBareTip(body: Body, id: number): boolean {
  const at = Object.values(body.segments).filter((s) => s.a === id || s.b === id);
  return at.length === 1 && at[0]!.kind === "penis";
}

function hasBrain(o: Organ): boolean {
  return o.contents?.some((c) => c.kind === "brain") ?? false;
}

const GRIPPERS = new Set<OrganKind>(["hand", "pincer", "claw", "hook", "sucker", "pseudopod"]);
const STANDERS = new Set<OrganKind>(["foot", "hoof"]);
const MOUTHS = new Set<OrganKind>(["mouth", "snout", "jaw"]);

/** A small mark for an ending that is not a head, drawn outward along the node's direction. */
function endingGlyph(o: Organ, x: number, y: number, r: number, dir: number): string {
  const kind = o.kind;
  // The glyph grows and shrinks with the organ's size step, as its sprite does (sizes.ts).
  r *= spriteScaleOf(o);
  const c = Math.cos(dir);
  const s = Math.sin(dir);
  const out = (d: number, side: number): Point => ({ x: x + c * d - s * side, y: y + s * d + c * side });
  if (GRIPPERS.has(kind)) {
    const spikes = kind === "pincer" ? [-0.3, 0.3] : [-0.24, 0, 0.24];
    let d = "";
    for (const side of spikes) {
      const a = out(r * 0.6, side * r);
      const b = out(r + 0.22, side * (r + 0.28));
      d += `M${f(a.x)} ${f(a.y)}L${f(b.x)} ${f(b.y)}`;
    }
    return `<path class="end ${kind}" d="${d}" stroke="${INK.paper2}" stroke-width="1.6" stroke-linecap="round" fill="none"/>`;
  }
  if (STANDERS.has(kind)) {
    const a = out(r * 0.9, -r * 0.9);
    const b = out(r * 0.9, r * 0.9);
    return `<path class="end ${kind}" d="M${f(a.x)} ${f(a.y)}L${f(b.x)} ${f(b.y)}" stroke="${INK.paper2}" stroke-width="${kind === "hoof" ? 3 : 2.2}" stroke-linecap="round" fill="none"/>`;
  }
  if (MOUTHS.has(kind)) {
    const a = out(r * 0.5, -r * 0.7);
    const m = out(r * 0.95, 0);
    const b = out(r * 0.5, r * 0.7);
    return `<path class="end ${kind}" d="M${f(a.x)} ${f(a.y)}Q${f(m.x)} ${f(m.y)} ${f(b.x)} ${f(b.y)}" stroke="${TONE.flesh}" stroke-width="1.8" stroke-linecap="round" fill="none"/>`;
  }
  if (kind === "sting") {
    const a = out(r * 0.5, -r * 0.5);
    const t = out(r + 0.3, 0);
    const b = out(r * 0.5, r * 0.5);
    return `<path class="end sting" d="M${f(a.x)} ${f(a.y)}L${f(t.x)} ${f(t.y)}L${f(b.x)} ${f(b.y)}Z" fill="${INK.paper2}"/>`;
  }
  if (kind === "eye") {
    return `<circle class="end eye" cx="${f(x)}" cy="${f(y)}" r="${f(r * 0.55)}" fill="${INK.paper}"/><circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 0.22)}" fill="${INK.ground}"/>`;
  }
  return "";
}

function headGlyph(head: Organ, x: number, y: number, r: number, self: boolean): string {
  const brain = head.contents?.find((c) => c.kind === "brain");
  const eyes = head.contents?.filter((c) => c.kind === "eye").length ?? 0;
  let out = `<circle class="head" cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${HEAD_COLOR}" stroke="${INK.ground}" stroke-width="1"/>`;
  if (brain !== undefined) {
    out += `<circle class="${self ? "self" : "brain"}" cx="${f(x)}" cy="${f(y - r * 0.2)}" r="${f(Math.max(2, r * 0.36))}" fill="${self ? TONE.amber : TONE.head}"/>`;
  }
  const eyeR = Math.max(1, r * 0.16);
  for (let i = 0; i < Math.min(eyes, 4); i++) {
    const ex = x + (i % 2 === 0 ? -1 : 1) * r * 0.42;
    const ey = y + r * (0.25 + 0.3 * Math.floor(i / 2));
    out += `<circle class="eye" cx="${f(ex)}" cy="${f(ey)}" r="${f(eyeR)}" fill="${INK.paper}"/>`;
  }
  if (head.contents?.some((c) => c.kind === "jaw")) {
    out += `<path class="jaw" d="M${f(x - r * 0.4)} ${f(y + r * 0.7)}L${f(x + r * 0.4)} ${f(y + r * 0.7)}" stroke="${INK.ground}" stroke-width="1.2" stroke-linecap="round"/>`;
  }
  return out;
}

const STAMP_ROLE: Record<string, (r: Ramp) => number> = {
  "#": () => paletteIndex("outline"),
  k: () => paletteIndex("outline"),
  "1": (r) => r.dark,
  "2": (r) => r.base,
  ",": (r) => r.base,
  "3": (r) => r.light,
  w: () => paletteIndex("white"),
  f: () => paletteIndex("flesh"),
  y: () => paletteIndex("amber"),
  g: () => paletteIndex("bio"),
  b: () => paletteIndex("bile"),
  n: () => paletteIndex("bone"),
};

/**
 * Pixel rows as one crisp image, `cell` viewBox units a pixel, its top left at
 * (x0, y0). It was a rect a pixel, and a mutated body on the scheme was
 * thousands of them; the PNG of a set of rows in a ramp is made once.
 */
const STAMP_PNG = new Map<string, string>();

function pixelsImage(rows: readonly string[], w: number, h: number, ramp: Ramp, x0: number, y0: number, cell: number, cls: string): string {
  const id = `${ramp.dark}.${ramp.base}.${ramp.light}|${rows.join("/")}`;
  let url = STAMP_PNG.get(id);
  if (url === undefined) {
    const cells = new Uint8Array(w * h);
    for (let j = 0; j < h; j++) {
      const row = rows[j]!;
      for (let i = 0; i < w; i++) {
        const role = STAMP_ROLE[row[i]!];
        if (role !== undefined) cells[j * w + i] = role(ramp);
      }
    }
    url = framePngUrl({ w, h, cells, palette: PALETTE });
    STAMP_PNG.set(id, url);
  }
  return (
    `<g class="${cls}" shape-rendering="crispEdges">` +
    `<image x="${f(x0)}" y="${f(y0)}" width="${f(w * cell)}" height="${f(h * cell)}" preserveAspectRatio="none" image-rendering="optimizeSpeed" style="image-rendering:-webkit-optimize-contrast;image-rendering:pixelated" href="${url}"/></g>`
  );
}

/** A mask as one image, `cell` viewBox units a pixel, the mask's (ax, ay) on (x, y). */
function maskRects(m: Mask, ramp: Ramp, x: number, y: number, ax: number, ay: number, cell: number, cls: string): string {
  return pixelsImage(m.rows, m.w, m.h, ramp, x - ax * cell, y - ay * cell, cell, cls);
}

/** Your brain on the scheme: amber, as the tape and the heads panel paint it. */
const SELF_RAMP: Ramp = { dark: paletteIndex("bile"), base: paletteIndex("amber"), light: paletteIndex("amber") };

/** An ending as its drawn sprite, pointing along `dir` from the node: a hand reads as a hand. */
function endingPixels(o: Organ, x: number, y: number, r: number, dir: number, cover: CoverId): string {
  const kind = o.kind;
  if (ENDING_SPRITES[kind] === undefined) return "";
  const p = endingSprite(kind, dirOf(dir), spriteScaleOf(o));
  const cell = Math.max(1.2, r / 4);
  return maskRects(p.mask, RAMPS[rampOf(kind, cover)], x, y, p.anchor.x, p.anchor.y, cell, `end ${kind}`);
}

/** The brain and the psionic organs of a head on the scheme, as their 12 px stamps over the head's disc. */
function headInsides(head: Organ, x: number, y: number, r: number, self: boolean): string {
  let out = "";
  const brain = head.contents?.find((c) => hasTag(c.kind, "brain"));
  if (brain !== undefined) {
    const cell = (r * 1.5) / 12;
    out += stampRects(stampFor("brain", 12), self ? SELF_RAMP : RAMPS.head, x, y - r * 0.15 + cell * 1.5, cell, self ? "self" : "brain");
  }
  const psi = (head.contents ?? []).filter((c) => hasTag(c.kind, "psionic"));
  psi.forEach((o, i) => {
    const a = -Math.PI / 2 + (i - (psi.length - 1) / 2) * 0.7;
    const cell = Math.max(0.9, r / 9);
    out += stampRects(stampFor("psi", 12), RAMPS[rampOf(o.kind, "skin")], x + Math.cos(a) * (r + 6 * cell), y + Math.sin(a) * (r + 6 * cell), cell, `psi ${o.kind}`);
  });
  return out;
}

/** A pixel stamp as one image, `cell` viewBox units a pixel, centred on (cx, cy). */
function stampRects(st: Stamp, ramp: Ramp, cx: number, cy: number, cell: number, cls: string): string {
  return pixelsImage(st.rows, st.size, st.size, ramp, cx - (st.size * cell) / 2, cy - (st.size * cell) / 2, cell, cls);
}

/** The organs of a cavity and the growths of a surface as stamps along the segment: inside on the axis, growths beside it. */
function organStampLayer(seg: Segment, drawn: LayoutSegment, selfSegment: boolean): string {
  const cell = Math.max(1.2, Math.min(3, (drawn.width * U) / 8));
  let out = "";
  const inside = seg.cavity.filter((o) => VISUALS[o.kind].hidden === undefined);
  inside.forEach((o, i) => {
    const { p } = along(drawn.points, (i + 1) / (inside.length + 1));
    // A brain in a cavity is a brain, not a dot: its own stamp, larger.
    if (hasTag(o.kind, "brain")) out += stampRects(stampFor("brain", 12), selfSegment ? SELF_RAMP : RAMPS.head, p.x * U, p.y * U, cell, `organ ${o.kind}`);
    else out += stampRects(stampFor(VISUALS[o.kind].stamp, 8), RAMPS[rampOf(o.kind, seg.cover)], p.x * U, p.y * U, cell, `organ ${o.kind}`);
  });
  const outside = seg.growths.filter((o) => VISUALS[o.kind].hidden === undefined);
  outside.forEach((o, i) => {
    const { p, angle } = along(drawn.points, (i + 1) / (outside.length + 1));
    const off = drawn.width * U * 0.5 + 4 * cell;
    const side = i % 2 === 0 ? 1 : -1;
    out += stampRects(stampFor(VISUALS[o.kind].stamp, 8), RAMPS[rampOf(o.kind, seg.cover)], p.x * U - Math.sin(angle) * off * side, p.y * U + Math.cos(angle) * off * side, cell, `growth ${o.kind}`);
  });
  return out;
}

function cavityLayer(seg: Segment, drawn: LayoutSegment, selfSegment: boolean): string {
  if (seg.kind !== "torso") return "";
  const w = Math.max(1.5, drawn.width * U * 0.45);
  let out = `<path class="cavity" d="${pathOf(drawn.points)}" stroke="${INK.panel}" stroke-opacity=".85" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
  const n = seg.cavity.length;
  for (let i = 0; i < n; i++) {
    const o = seg.cavity[i]!;
    const { p } = along(drawn.points, (i + 1) / (n + 1));
    const self = selfSegment && o.kind === "brain";
    out += `<circle class="organ ${o.kind}${self ? " self" : ""}" cx="${f(p.x * U)}" cy="${f(p.y * U)}" r="${f(self ? 3 : 2.2)}" fill="${organColor(o, self)}"/>`;
  }
  return out;
}

/** The break plane across a bridge: sized in pixels (`upp` is viewBox units per pixel), so it reads at any zoom. */
function planeTick(drawn: LayoutSegment, nearFirst: boolean, upp: number): string {
  const { p, angle } = along(drawn.points, nearFirst ? 0.22 : 0.78);
  const half = Math.max(drawn.width * U * 0.5 + 3, 6 * upp);
  const nx = -Math.sin(angle) * half;
  const ny = Math.cos(angle) * half;
  const stroke = Math.max(1.5, 1.5 * upp);
  const dash = f(Math.max(2, 2 * upp));
  return `<path class="plane" d="M${f(p.x * U - nx)} ${f(p.y * U - ny)}L${f(p.x * U + nx)} ${f(p.y * U + ny)}" stroke="${INK.paper3}" stroke-width="${f(stroke)}" stroke-dasharray="${dash} ${dash}" fill="none"/>`;
}

export function silhouetteSvg(body: Body, opts: SvgOptions = {}): string {
  const l = opts.layout ?? layout(body, { scale: opts.scale ?? "linear" });
  const size = opts.size ?? 240;
  const showBridges = opts.bridges ?? true;
  const showCavities = opts.cavities ?? true;
  const w = (l.bbox.x1 - l.bbox.x0 + 2 * PAD) * U;
  const h = (l.bbox.y1 - l.bbox.y0 + 2 * PAD) * U;
  const vx = (l.bbox.x0 - PAD) * U;
  const vy = (l.bbox.y0 - PAD) * U;
  const height = Math.round((size * h) / w);
  const upp = w / size;
  const orderIndex = new Map(l.order.map((id, i) => [id, i]));
  const bridgeSet = showBridges ? new Set(bridges(body)) : new Set<number>();
  const selfNode = "node" in body.self ? body.self.node : -1;
  const selfSegment = "segment" in body.self ? body.self.segment : -1;
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${height}" viewBox="${f(vx)} ${f(vy)} ${f(w)} ${f(h)}" class="silhouette">`,
  );
  if (opts.background) parts.push(`<rect x="${f(vx)}" y="${f(vy)}" width="${f(w)}" height="${f(h)}" fill="${INK.ground}"/>`);

  const nodeAt = new Map(l.nodes.map((n) => [n.id, n]));

  // Territories: a soft underlay along the segments and around the nodes of each foreign head.
  const territories = opts.territories ?? [];
  territories.forEach((t, i) => {
    const color = t.color ?? TERRITORY_COLORS[i % TERRITORY_COLORS.length]!;
    const inside = new Set(t.nodes);
    let d = "";
    for (const s of l.segments) {
      const seg = body.segments[s.id]!;
      if (inside.has(seg.a) && inside.has(seg.b)) d += pathOf(s.points);
    }
    parts.push(`<g class="territory" fill="${color}" fill-opacity=".28" stroke="${color}" stroke-opacity=".28">`);
    if (d.length > 0) parts.push(`<path d="${d}" fill="none" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>`);
    for (const id of t.nodes) {
      const n = nodeAt.get(id);
      if (n !== undefined) parts.push(`<circle cx="${f(n.x * U)}" cy="${f(n.y * U)}" r="${f((n.r + 0.3) * U)}" stroke="none"/>`);
    }
    parts.push("</g>");
  });

  for (const m of l.membranes) {
    if (m.polygon.length < 3) continue;
    const pts = m.polygon.map((p) => `${f(p.x * U)},${f(p.y * U)}`).join(" ");
    parts.push(`<polygon class="membrane" points="${pts}" fill="${TONE.bio}" fill-opacity=".22" stroke="${TONE.bio}" stroke-opacity=".55" stroke-width="1"/>`);
  }

  for (const s of l.segments) {
    const seg = body.segments[s.id]!;
    if (seg.kind === "flank") continue;
    const dead = seg.hp <= 0;
    const starved = seg.ischemia >= 10;
    const attrs = [`class="seg ${seg.kind} ${seg.cover}"`, `d="${pathOf(s.points)}"`, `stroke="${dead ? TONE.flesh : COVER_COLORS[seg.cover]}"`, `stroke-width="${f(s.width * U)}"`, `stroke-linecap="round"`, `stroke-linejoin="round"`, `fill="none"`];
    if (dead) attrs.push(`stroke-dasharray="4 3"`);
    if (starved) attrs.push(`stroke-opacity=".55"`);
    // A torso is a body with a flank, not a line: an outline under the flesh gives it its sides.
    if (seg.kind === "torso") parts.push(`<path class="flank-outline" d="${pathOf(s.points)}" stroke="${INK.ground}" stroke-width="${f(s.width * U + 3)}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`);
    parts.push(`<path ${attrs.join(" ")}/>`);
    if (opts.organStamps === true) {
      if (seg.kind === "torso" && showCavities) parts.push(cavityLayer({ ...seg, cavity: [] }, s, false));
      parts.push(organStampLayer(seg, s, s.id === selfSegment));
    } else if (showCavities) parts.push(cavityLayer(seg, s, s.id === selfSegment));
    if (bridgeSet.has(s.id) && seg.breakPlane) {
      const ia = orderIndex.get(seg.a) ?? 0;
      const ib = orderIndex.get(seg.b) ?? 0;
      parts.push(planeTick(s, ia <= ib, upp));
    }
  }

  for (const id of nodeIds(body)) {
    const node = body.nodes[id]!;
    const n = nodeAt.get(id)!;
    const x = n.x * U;
    const y = n.y * U;
    const head = node.ends.find((e) => e.kind === "head");
    const r = n.r * U;
    const stamps = opts.organStamps === true;
    const incomingCover = (): CoverId => {
      const inc = l.segments.find((s) => {
        const seg = body.segments[s.id]!;
        return seg.a === id || seg.b === id;
      });
      return inc === undefined ? "skin" : body.segments[inc.id]!.cover;
    };
    const ending = (o: Organ): string => {
      if (!stamps) return endingGlyph(o, x, y, r, n.dir);
      const px = endingPixels(o, x, y, r, n.dir, incomingCover());
      return px === "" ? endingGlyph(o, x, y, r, n.dir) : px;
    };
    if (head !== undefined) {
      const self = id === selfNode && hasBrain(head);
      parts.push(stamps ? headGlyph({ ...head, contents: (head.contents ?? []).filter((c) => !hasTag(c.kind, "brain")) }, x, y, r, false) + headInsides(head, x, y, r, self) : headGlyph(head, x, y, r, self));
      for (const e of node.ends) if (e !== head) parts.push(ending(e));
    } else if (node.ends.length === 0 && isBareTip(body, id)) {
      // The tip of a penis is no joint: the stroke ends there.
    } else {
      const incoming = l.segments.find((s) => {
        const seg = body.segments[s.id]!;
        return seg.a === id || seg.b === id;
      });
      const cover = incoming === undefined ? "skin" : body.segments[incoming.id]!.cover;
      const broken = node.hp <= 0;
      // An opaque knob in the colour of its flesh, as on the sprite.
      parts.push(`<circle class="node${broken ? " broken" : ""}" cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${broken ? TONE.flesh : COVER_COLORS[cover]}" stroke="${INK.ground}" stroke-width="1"/>`);
      for (const e of node.ends) parts.push(ending(e));
    }
    if (node.wound > 0) parts.push(`<circle class="wound" cx="${f(x)}" cy="${f(y)}" r="${f(r + 2)}" fill="none" stroke="${TONE.flesh}" stroke-width="1"/>`);
    if (node.bait) parts.push(`<circle class="bait" cx="${f(x)}" cy="${f(y)}" r="${f(r + 3)}" fill="none" stroke="${TONE.amber}" stroke-width="1" stroke-dasharray="2 2"/>`);
    if (opts.labels) parts.push(`<text class="label" x="${f(x + r + 2)}" y="${f(y - r)}" font-size="8" font-family="monospace" fill="${INK.paper3}">${id}</text>`);
  }
  parts.push("</svg>");
  return parts.join("");
}
