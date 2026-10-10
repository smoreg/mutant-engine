/**
 * The body assembled from drawn sprites (step L): every segment is its root
 * cap, as many middles as its length asks for, and its end cap, each in the
 * nearest of eight directions; endings, heads and organ spots sit on their
 * nodes; a cover is a tile laid over the base tone; a shadow lies under the
 * feet and one contour of a pixel closes the whole silhouette. The frame is
 * at the sprites' own scale (24 px per layout unit); `fitFrame` shrinks it
 * into a 32 / 64 / 96 px tile. Pure arithmetic over pixel indices: nothing
 * here knows a page.
 *
 * Layers, first to last: shadow, membranes, joints, limbs that hang behind
 * (growths, stalks, tails, tentacles), arms and legs, torsos and necks, then
 * endings, heads, marks. Organs inside a torso show through it: they are
 * drawn under the ribs of the chest.
 */
import { hasTag, isBrainKind, nodeIds, ORGAN_SIZES, ORGANS, segmentIds, sizeOf, sizeSpec, spriteScaleOf, torsoNodes, type Body, type CoverId, type Organ, type OrganKind, type OrganSize, type Segment, type SegmentKind } from "@mutant-engine/core";
import { layout, segmentHalfWidth, type Layout, type LengthScale, type Point } from "./layout.js";
import { poseOf, rig, type Pose, type Rig } from "./rig.js";
import { PALETTE, RAMPS, VISUALS, paletteIndex, rampOf, stampFor, type PaletteEntry, type Ramp, type Stamp } from "./stamps.js";
import { DIR_VECTORS, ENDING_SPRITES, EYE_KINDS, HEAD_SPRITES, SEGMENT_SPRITES, TILES, cardinalOf, dirFor, dirOf, endingSprite, headKindOf, headViewOf, limbKindOf, scaleMask, segmentSprite, S, type Dir, type HeadSprite, type HeadView, type LimbKind, type Mask, type Piece } from "./sprites.js";
import { JOINTS } from "./sprites/limbs.js";

export interface Sheet {
  w: number;
  h: number;
  /** w x h palette indices, row-major; 0 is empty. */
  cells: Uint8Array;
}

export interface PixelFrame extends Sheet {
  palette: readonly PaletteEntry[];
  /** Pixels per layout unit. */
  ppu: number;
  ox: number;
  oy: number;
  /** The box of everything drawn, when known. */
  box?: Box;
}

export interface PixelOptions {
  /** Side of the square tile the native frame is fitted into; absent for the frame at the sprites' own scale. */
  px?: number;
  layout?: Layout;
  /** Length scale when no layout is given; `sqrt` by default: a tile of a grown body. */
  scale?: LengthScale;
  seed?: number;
  /** The moment, seconds; 0 by default. */
  t?: number;
  /** A pose computed earlier for the same body and layout. */
  pose?: Pose;
  /** The shadow under the feet; on by default. */
  shadow?: boolean;
  /** Halos, tremor and wander marks; on by default. */
  marks?: boolean;
  /** Organs inside a segment drawn through its wall, as an x-ray; off by default: a body is seen from outside. */
  insides?: boolean;
}

/** Pixels per layout unit at the sprites' own scale. */
export const PPU = 24;
/** Room around the layout's box for what overhangs a node: a head, a hand, the rig's swing. */
const MARGIN = 30;
/**
 * Pixels a head slides back down the part it hangs from, so that only a
 * finger's width of neck shows (decision 141). The node itself does not move:
 * the graph, the reach and every distance stay what the model says.
 */
const HEAD_SINK = 7;

const OUTLINE = paletteIndex("outline");
const SHADOW = paletteIndex("shadow");
const WHITE = paletteIndex("white");
const AMBER = paletteIndex("amber");
const FLESH = paletteIndex("flesh");
const BIO = paletteIndex("bio");
const BILE = paletteIndex("bile");
const BONE = paletteIndex("bone");
const CHROME_DARK = paletteIndex("chromeDark");

/** Where the lamp stands, as the sprites' turning assumes: top left. */
const LAMP_DIR = { x: -0.6, y: -0.8 };

function isFlesh(v: number): boolean {
  return v !== 0 && v !== SHADOW;
}

// ---------------------------------------------------------------- blitting

interface BlitOptions {
  /** The cover tile laid over base pixels, in frame coordinates. */
  tile?: Mask;
  /** Contour pixels are drawn in this index wherever they land (an organ seen through a wall). */
  outlineAs?: number;
  /** Only pixels of these roles are drawn. */
  only?: string;
  mirror?: boolean;
  /** Skips a pixel: the middle of a segment is cut where its length ends. */
  clip?: (x: number, y: number) => boolean;
}

function roleIndex(ch: string, ramp: Ramp): number {
  switch (ch) {
    case "1":
      return ramp.dark;
    case "2":
    case ",":
      return ramp.base;
    case "3":
      return ramp.light;
    case "w":
      return WHITE;
    case "k":
      return OUTLINE;
    case "f":
      return FLESH;
    case "y":
      return AMBER;
    case "g":
      return BIO;
    case "b":
      return BILE;
    case "n":
      return BONE;
    default:
      return 0;
  }
}

/**
 * Draws a mask with its top-left corner at (x0, y0). A contour pixel is the
 * outline where it lands on nothing and the part's dark tone where it lands
 * on flesh, so parts keep a border between them and the silhouette gets one
 * black line. Base pixels take the cover tile.
 */
function blit(c: Sheet, m: Mask, x0: number, y0: number, ramp: Ramp, o: BlitOptions = {}): void {
  const tile = o.tile;
  const only = o.only;
  const mirror = o.mirror === true;
  const clip = o.clip;
  const outlineAs = o.outlineAs;
  const cells = c.cells;
  const cw = c.w;
  const dark = ramp.dark;
  const base = ramp.base;
  const light = ramp.light;
  const yEnd = Math.min(m.h, c.h - 1 - y0);
  const xEnd = Math.min(m.w, c.w - 1 - x0);
  for (let j = Math.max(0, 1 - y0); j < yEnd; j++) {
    const row = m.rows[j]!;
    const y = y0 + j;
    const tileRow = tile === undefined ? undefined : tile.rows[((y % tile.h) + tile.h) % tile.h]!;
    const rowBase = y * cw;
    for (let i = Math.max(0, 1 - x0); i < xEnd; i++) {
      const ch = row[mirror ? m.w - 1 - i : i]!;
      if (ch === ".") continue;
      if (only !== undefined && !only.includes(ch)) continue;
      const x = x0 + i;
      if (clip !== undefined && clip(x, y)) continue;
      const k = rowBase + x;
      if (ch === "#") {
        const under = cells[k]!;
        cells[k] = outlineAs ?? (under !== 0 && under !== SHADOW && under !== OUTLINE ? dark : OUTLINE);
        continue;
      }
      let v: number;
      if (ch === "2" || ch === ",") {
        v = base;
        if (tileRow !== undefined) {
          const t = tileRow[((x % tile!.w) + tile!.w) % tile!.w]!;
          if (t !== ".") v = t === "1" ? dark : t === "3" ? light : roleIndex(t, ramp);
        }
      } else if (ch === "1") v = dark;
      else if (ch === "3") v = light;
      else v = roleIndex(ch, ramp);
      cells[k] = v;
    }
  }
}

function blitPiece(c: Sheet, p: Piece, at: Point, ramp: Ramp, o: BlitOptions = {}): void {
  blit(c, p.mask, Math.round(at.x) - p.anchor.x, Math.round(at.y) - p.anchor.y, ramp, o);
}

/**
 * A piece turned by a small angle about its anchor, sampled back pixel by
 * pixel (nearest neighbour): what is left between the true angle of a part and
 * the nearest direction it is drawn in, so the caps line up with the middle.
 */
function blitTurned(c: Sheet, p: Piece, at: Point, angle: number, ramp: Ramp, o: BlitOptions = {}): void {
  if (Math.abs(angle) < 1e-3) {
    blitPiece(c, p, at, ramp, o);
    return;
  }
  const m = p.mask;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const ax = Math.round(at.x);
  const ay = Math.round(at.y);
  // The mask's corners turned about the anchor bound the pixels to visit.
  let bx0 = Infinity;
  let by0 = Infinity;
  let bx1 = -Infinity;
  let by1 = -Infinity;
  for (const [u, v] of [[0, 0], [m.w, 0], [0, m.h], [m.w, m.h]] as const) {
    const du = u - p.anchor.x;
    const dv = v - p.anchor.y;
    const tx = du * cos - dv * sin;
    const ty = du * sin + dv * cos;
    bx0 = Math.min(bx0, tx);
    by0 = Math.min(by0, ty);
    bx1 = Math.max(bx1, tx);
    by1 = Math.max(by1, ty);
  }
  const tile = o.tile;
  for (let y = Math.max(1, ay + Math.floor(by0) - 1); y <= Math.min(c.h - 2, ay + Math.ceil(by1) + 1); y++) {
    for (let x = Math.max(1, ax + Math.floor(bx0) - 1); x <= Math.min(c.w - 2, ax + Math.ceil(bx1) + 1); x++) {
      const dx = x + 0.5 - ax;
      const dy = y + 0.5 - ay;
      const i = Math.floor(p.anchor.x + dx * cos + dy * sin);
      const j = Math.floor(p.anchor.y - dx * sin + dy * cos);
      if (i < 0 || j < 0 || i >= m.w || j >= m.h) continue;
      const ch = m.rows[j]![i]!;
      if (ch === ".") continue;
      if (o.only !== undefined && !o.only.includes(ch)) continue;
      const k = y * c.w + x;
      if (ch === "#") {
        // Sampled back, a contour pixel may land beside the flesh it bordered: on nothing it is left to the
        // silhouette's own contour, on another part it is the border between them.
        const under = c.cells[k]!;
        if (under !== 0 && under !== SHADOW && under !== OUTLINE) c.cells[k] = ramp.dark;
        continue;
      }
      let v: number;
      if (ch === "2" || ch === ",") {
        v = ramp.base;
        if (tile !== undefined) {
          const t = tile.rows[((y % tile.h) + tile.h) % tile.h]![((x % tile.w) + tile.w) % tile.w]!;
          if (t !== ".") v = t === "1" ? ramp.dark : t === "3" ? ramp.light : roleIndex(t, ramp);
        }
      } else if (ch === "1") v = ramp.dark;
      else if (ch === "3") v = ramp.light;
      else v = roleIndex(ch, ramp);
      c.cells[k] = v;
    }
  }
}

/** Limbs whose diagonal caps were put together by a script and never drawn by hand (step L): a ball, not a cap. */
const DRAFT_DIAGONALS = new Set<LimbKind>(["armThick", "legThick", "tentacleThick", "torso", "belly"]);

/**
 * How wide a part is at its far end, as a share of its drawn width: a growth
 * is a horn and not a tube, so it narrows along its length and its end cap is
 * the point it narrows to (decision 202). Everything else keeps one width.
 */
const TAPERS: Partial<Record<LimbKind, number>> = { growth: 0.38 };

/** A vector turned by an angle (screen frame, y down: positive is clockwise). */
function turnBy(v: Point, angle: number): Point {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
}

function roundPoint(p: Point): Point {
  return { x: Math.round(p.x), y: Math.round(p.y) };
}

/** What is left between an angle and a drawn direction, in (-pi, pi]. */
function residual(angle: number, d: Dir): number {
  const drawn = Math.atan2(DIR_VECTORS[d]!.y, DIR_VECTORS[d]!.x);
  let r = angle - drawn;
  while (r > Math.PI) r -= 2 * Math.PI;
  while (r <= -Math.PI) r += 2 * Math.PI;
  return r;
}

/** Where a stamp's mask pixel lands after `rot` quarter turns clockwise. */
function turned(i: number, j: number, size: number, rot: number): [number, number] {
  switch (rot & 3) {
    case 0:
      return [i, j];
    case 1:
      return [size - 1 - j, i];
    case 2:
      return [size - 1 - i, size - 1 - j];
    default:
      return [j, size - 1 - i];
  }
}

/** Blits a stamp of the atlas with its top-left corner at (x0, y0), turned by quarter turns, left for right when `mirror`. */
function blitStamp(c: Sheet, st: Stamp, x0: number, y0: number, rot: number, ramp: Ramp, outlineAs?: number, mirror = false): void {
  const n = st.size;
  for (let j = 0; j < n; j++) {
    const row = st.rows[j]!;
    for (let i = 0; i < n; i++) {
      const ch = row[mirror ? n - 1 - i : i]!;
      if (ch === ".") continue;
      const [u, w] = turned(i, j, n, rot);
      const x = x0 + u;
      const y = y0 + w;
      if (x < 1 || y < 1 || x >= c.w - 1 || y >= c.h - 1) continue;
      const k = y * c.w + x;
      if (ch === "#") c.cells[k] = outlineAs ?? (isFlesh(c.cells[k]!) && c.cells[k] !== OUTLINE ? ramp.dark : OUTLINE);
      else c.cells[k] = roleIndex(ch, ramp);
    }
  }
}

/** Quarter turns that point a stamp drawn upward along `angle` (screen frame, y down). */
function quarterTurns(angle: number): number {
  const q = Math.round(angle / (Math.PI / 2));
  return (((q + 1) % 4) + 4) % 4;
}

/** A stamp standing on the point, pointing along `angle`: its base (bottom centre when upright) sits there. */
function stampAt(c: Sheet, st: Stamp, ax: number, ay: number, angle: number, ramp: Ramp): void {
  const n = st.size;
  const rot = quarterTurns(angle);
  const [bx, by] = turned(Math.floor(n / 2), n - 1, n, rot);
  blitStamp(c, st, Math.round(ax - bx), Math.round(ay - by), rot, ramp);
}

function stampCentred(c: Sheet, st: Stamp, cx: number, cy: number, ramp: Ramp, outlineAs?: number): void {
  blitStamp(c, st, Math.round(cx - st.size / 2), Math.round(cy - st.size / 2), 0, ramp, outlineAs);
}

function put(c: Sheet, x: number, y: number, v: number): void {
  if (x < 1 || y < 1 || x >= c.w - 1 || y >= c.h - 1) return;
  c.cells[y * c.w + x] = v;
}

function ellipse(c: Sheet, cx: number, cy: number, rx: number, ry: number, v: number): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const fx = (x + 0.5 - cx) / rx;
      const fy = (y + 0.5 - cy) / ry;
      if (fx * fx + fy * fy <= 1 && x >= 1 && y >= 1 && x < c.w - 1 && y < c.h - 1 && c.cells[y * c.w + x] === 0) c.cells[y * c.w + x] = v;
    }
  }
}

/** Fills a polygon with a checker of two tones: a membrane the light comes through. */
function polygon(c: Sheet, poly: Point[], a: number, b: number, phase: number): void {
  if (poly.length < 3) return;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of poly) {
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y);
  }
  for (let y = Math.max(1, Math.floor(y0)); y <= Math.min(c.h - 2, Math.ceil(y1)); y++) {
    const yc = y + 0.5;
    const xs: number[] = [];
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const p = poly[i]!;
      const q = poly[j]!;
      if (p.y > yc !== q.y > yc) xs.push(p.x + ((yc - p.y) * (q.x - p.x)) / (q.y - p.y));
    }
    xs.sort((u, v) => u - v);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.ceil(xs[k]! - 0.5); x <= Math.floor(xs[k + 1]! - 0.5); x++) put(c, x, y, (x + y + phase) % 2 === 0 ? a : b);
    }
  }
}

// ---------------------------------------------------------------- segments

function cumulative(pts: Point[]): number[] {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y));
  return cum;
}

/** Point and unit tangent at an arc length of a polyline. */
function along(pts: Point[], cum: number[], s: number): { p: Point; u: Point } {
  const total = cum[cum.length - 1]!;
  const want = Math.max(0, Math.min(total, s));
  for (let i = 1; i < pts.length; i++) {
    if (want <= cum[i]! || i === pts.length - 1) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const len = cum[i]! - cum[i - 1]!;
      const k = len < 1e-9 ? 0 : Math.min(1, (want - cum[i - 1]!) / len);
      const ux = len < 1e-9 ? 0 : (b.x - a.x) / len;
      const uy = len < 1e-9 ? 1 : (b.y - a.y) / len;
      return { p: { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }, u: { x: ux, y: uy } };
    }
  }
  return { p: pts[0]!, u: { x: 0, y: 1 } };
}

function dirOfVector(u: Point, limb?: LimbKind): Dir {
  return dirFor(limb === undefined ? undefined : SEGMENT_SPRITES[limb], Math.atan2(u.y, u.x));
}

/**
 * The order parts are painted in: the wide under the narrow, so that a big
 * part never swallows a small one standing on it (decision 200). Girth times
 * what growths swell it by is how wide a part is drawn, so it decides; a flank
 * is a side node's link with no flesh of its own and lies under everything;
 * the kind settles a tie, so a tail still goes behind a leg of its own width.
 * Endings, organ spots and heads are painted after every segment, in their own
 * passes, so they stay above all of this.
 */
const KIND_ORDER: Record<SegmentKind, number> = { flank: 0, torso: 1, gullet: 2, neck: 3, growth: 4, penis: 5, stalk: 6, tail: 7, tentacle: 8, leg: 9, arm: 10 };

function swellOf(seg: Segment): number {
  let swell = 1;
  for (const o of seg.growths) swell *= VISUALS[o.kind].swell ?? 1;
  return swell;
}

/** Under every girth a body can reach, so a flank is painted before anything else. */
const UNDER_ALL = -1e6;

function paintRank(seg: Segment): number {
  if (seg.kind === "flank") return UNDER_ALL;
  return -100 * seg.girth * swellOf(seg) + KIND_ORDER[seg.kind];
}

interface SegmentDraw {
  kind: SegmentKind;
  girth: number;
  cover: CoverId;
  ramp: Ramp;
  /** Root first, in frame pixels. */
  pts: Point[];
  swell: number;
}

/**
 * The middle of a segment swept along its axis at the axis's true angle: every
 * pixel near the axis takes the pixel of the S drawing at the same distance
 * across the axis and along it, so the part stays one tube at any angle
 * instead of a staircase of pieces turned to the nearest of eight directions.
 * The drawing is mirrored across the axis when the lamp falls on its other side.
 */
function sweepMiddle(c: Sheet, mid: Piece, axis: Point[], ramp: Ramp, tile: Mask | undefined, box: Box, taper?: number): void {
  const m = mid.mask;
  const period = Math.max(1, Math.round(Math.hypot(mid.advance.x, mid.advance.y)));
  const half = Math.max(mid.anchor.x, m.w - mid.anchor.x) + 1;
  // A tapered part reads its drawing from further out across the axis the further along it is, so the tube becomes a cone.
  let swept = 0;
  // The columns the drawing uses at all: read from a stretched coordinate, the edge columns - the
  // contour - would be stepped over on most rows, and a cap lapping over the ragged edge left behind
  // closes a pocket that no later pass can fill.
  let ink0 = 0;
  let ink1 = m.w - 1;
  if (taper !== undefined) {
    for (let i = 0; i + 1 < axis.length; i++) swept += Math.hypot(axis[i + 1]!.x - axis[i]!.x, axis[i + 1]!.y - axis[i]!.y);
    ink0 = m.w;
    ink1 = -1;
    for (const r of m.rows)
      for (let i = 0; i < m.w; i++)
        if (r[i] !== ".") {
          ink0 = Math.min(ink0, i);
          ink1 = Math.max(ink1, i);
        }
  }
  let run = 0;
  for (let i = 0; i + 1 < axis.length; i++) {
    const a = axis[i]!;
    const b = axis[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-9) continue;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    // Across the axis, the S drawing's +x side: right of the way down.
    const ex = uy;
    const ey = -ux;
    const flip = ex * LAMP_DIR.x + ey * LAMP_DIR.y > 0;
    // An inner corner of the axis reaches past its ends, so the outer side of a bend has no wedge missing.
    const tLow = i === 0 ? 0 : -half;
    const tHigh = i + 2 === axis.length ? len + 0.5 : len + half;
    const x0 = Math.max(1, Math.floor(Math.min(a.x + ux * tLow, b.x + ux * (tHigh - len)) - half));
    const x1 = Math.min(c.w - 2, Math.ceil(Math.max(a.x + ux * tLow, b.x + ux * (tHigh - len)) + half));
    const y0 = Math.max(1, Math.floor(Math.min(a.y + uy * tLow, b.y + uy * (tHigh - len)) - half));
    const y1 = Math.min(c.h - 2, Math.ceil(Math.max(a.y + uy * tLow, b.y + uy * (tHigh - len)) + half));
    for (let y = y0; y <= y1; y++) {
      const py = y + 0.5 - a.y;
      const tileRow = tile === undefined ? undefined : tile.rows[((y % tile.h) + tile.h) % tile.h]!;
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5 - a.x;
        const t = px * ux + py * uy;
        if (t < tLow || t >= tHigh) continue;
        const d = px * ex + py * ey;
        let col: number;
        if (taper === undefined) col = Math.floor(mid.anchor.x + (flip ? -d : d));
        else {
          const wide = 1 + (taper - 1) * Math.min(1, Math.max(0, (run + t) / Math.max(1, swept)));
          const u = mid.anchor.x + (flip ? -d : d) / wide;
          if (u < ink0 - 0.5 || u > ink1 + 0.5) continue;
          col = Math.min(ink1, Math.max(ink0, Math.round(u)));
        }
        if (col < 0 || col >= m.w) continue;
        const row = m.rows[(((Math.floor(run + t) % period) + period) % period) % m.h]!;
        const ch = row[flip ? m.w - 1 - col : col]!;
        if (ch === ".") continue;
        const k = y * c.w + x;
        if (ch === "#") {
          // The contour on nothing is the silhouette's; on another part it is the border between them.
          const under = c.cells[k]!;
          if (under !== 0 && under !== SHADOW && under !== OUTLINE) c.cells[k] = ramp.dark;
          continue;
        }
        let v: number;
        if (ch === "2" || ch === ",") {
          v = ramp.base;
          if (tileRow !== undefined) {
            const tc = tileRow[((x % tile!.w) + tile!.w) % tile!.w]!;
            if (tc !== ".") v = tc === "1" ? ramp.dark : tc === "3" ? ramp.light : roleIndex(tc, ramp);
          }
        } else if (ch === "1") v = flip ? ramp.light : ramp.dark;
        else if (ch === "3") v = flip ? ramp.dark : ramp.light;
        else v = roleIndex(ch, ramp);
        c.cells[k] = v;
      }
    }
    box.x0 = Math.min(box.x0, x0);
    box.y0 = Math.min(box.y0, y0);
    box.x1 = Math.max(box.x1, x1 + 1);
    box.y1 = Math.max(box.y1, y1 + 1);
    run += len;
  }
}

/**
 * Draws one segment: the root cap at its first point along the first
 * tangent, middles every `advance` along the polyline (the last one cut at
 * the length), the end cap so that its far joint lands on the last point.
 */
function drawSegment(c: Sheet, s: SegmentDraw): { rootDir: Dir; endDir: Dir; root: Piece; rootTurn: number } {
  const limb = limbKindOf(s.kind, s.girth, s.swell);
  const cum = cumulative(s.pts);
  const total = cum[cum.length - 1]!;
  const tile = TILES[s.cover];
  const first = along(s.pts, cum, 0.01);
  const last = along(s.pts, cum, total - 0.01);
  const rootDir = dirOfVector(first.u, limb);
  const endDir = dirOfVector(last.u, limb);
  // The caps turn the rest of the way from their nearest drawing to the part's true angle, as the middle is
  // swept at it. Where the diagonal drawing is only a draft, the straight one is turned instead, unless the part
  // lies exactly on the diagonal.
  const rootAngle = Math.atan2(first.u.y, first.u.x);
  const endAngle = Math.atan2(last.u.y, last.u.x);
  const straight = (angle: number, d: Dir): boolean => DRAFT_DIAGONALS.has(limb) && Math.abs(residual(angle, d)) > 1e-6;
  const rootDraw = straight(rootAngle, rootDir) ? cardinalOf(rootAngle) : rootDir;
  const endDraw = straight(endAngle, endDir) ? cardinalOf(endAngle) : endDir;
  const root = segmentSprite(limb, rootDraw).root;
  const end = segmentSprite(limb, endDraw).end;
  const rootTurn = residual(rootAngle, rootDraw);
  const endTurn = residual(endAngle, endDraw);
  const rootAdv = roundPoint(turnBy(root.advance, rootTurn));
  const endAdv = roundPoint(turnBy(end.advance, endTurn));
  const rootLen = Math.hypot(root.advance.x, root.advance.y);
  const endLen = Math.hypot(end.advance.x, end.advance.y);
  const A = s.pts[0]!;
  const B = s.pts[s.pts.length - 1]!;
  const endAt = { x: B.x - endAdv.x, y: B.y - endAdv.y };
  // Where the caps join the middles: the root's open row and the end cap's first row.
  const rootJoin = { x: Math.round(A.x) + rootAdv.x, y: Math.round(A.y) + rootAdv.y };
  const endJoin = { x: Math.round(endAt.x), y: Math.round(endAt.y) };
  const box: Box = { x0: Math.round(A.x) - root.anchor.x, y0: Math.round(A.y) - root.anchor.y, x1: 0, y1: 0 };
  box.x1 = box.x0 + root.mask.w;
  box.y1 = box.y0 + root.mask.h;
  const ex0 = endJoin.x - end.anchor.x;
  const ey0 = endJoin.y - end.anchor.y;
  box.x0 = Math.min(box.x0, ex0);
  box.y0 = Math.min(box.y0, ey0);
  box.x1 = Math.max(box.x1, ex0 + end.mask.w);
  box.y1 = Math.max(box.y1, ey0 + end.mask.h);
  // A cap turned by up to half a direction reaches a little past its unturned box.
  box.x0 -= 4;
  box.y0 -= 4;
  box.x1 += 4;
  box.y1 += 4;
  blitTurned(c, root, A, rootTurn, s.ramp, { tile });
  const span = Math.max(0, total - rootLen - endLen);
  if (span > 0) {
    // The chain between the caps' joining rows, its ends nudged onto them, so that a segment off the eight
    // directions still meets both caps: the axis of the middle, one point a pixel.
    const from = along(s.pts, cum, rootLen).p;
    const to = along(s.pts, cum, total - endLen).p;
    const shiftFrom = { x: rootJoin.x - from.x, y: rootJoin.y - from.y };
    const shiftTo = { x: endJoin.x - to.x, y: endJoin.y - to.y };
    // The shift goes linearly along the arc, so the axis stays a polyline with a corner where the pose has one.
    const cuts = [rootLen];
    for (let i = 1; i + 1 < s.pts.length; i++) if (cum[i]! > rootLen && cum[i]! < total - endLen) cuts.push(cum[i]!);
    cuts.push(total - endLen);
    const axis: Point[] = cuts.map((at) => {
      const f = (at - rootLen) / span;
      const here = along(s.pts, cum, at).p;
      return { x: here.x + shiftFrom.x + (shiftTo.x - shiftFrom.x) * f, y: here.y + shiftFrom.y + (shiftTo.y - shiftFrom.y) * f };
    });
    sweepMiddle(c, segmentSprite(limb, S).mid, axis, s.ramp, tile, box, TAPERS[limb]);
  }
  blitTurned(c, end, endAt, endTurn, s.ramp, { tile });
  sealPinholes(c, box, s.ramp.base);
  return { rootDir, endDir, root, rootTurn };
}

/** An empty pixel with flesh on all four sides inside the box is a seam between pieces: it takes the base tone. */
function sealPinholes(c: Sheet, box: Box, v: number): void {
  const { w, h, cells } = c;
  for (let y = Math.max(1, box.y0); y < Math.min(h - 1, box.y1); y++) {
    for (let x = Math.max(1, box.x0); x < Math.min(w - 1, box.x1); x++) {
      const k = y * w + x;
      if (cells[k] !== 0) continue;
      if (isFlesh(cells[k - 1]!) && isFlesh(cells[k + 1]!) && isFlesh(cells[k - w]!) && isFlesh(cells[k + w]!)) cells[k] = v;
    }
  }
}

/** The pixels of one segment alone, for tests and the sprite sheet: root at `a`, far node at `b`, both in the sheet. */
export function segmentPixels(kind: SegmentKind, girth: number, cover: CoverId, dir: Dir, lengthPx: number, ending?: OrganKind, angle?: number, endingSize: OrganSize = "normal"): Sheet & { a: Point; b: Point } {
  const v = angle === undefined ? DIR_VECTORS[dir]! : { x: Math.cos(angle), y: Math.sin(angle) };
  const size = lengthPx + 120;
  const c: Sheet = { w: size, h: size, cells: new Uint8Array(size * size) };
  const a = { x: size / 2 - (v.x * lengthPx) / 2, y: size / 2 - (v.y * lengthPx) / 2 };
  const b = { x: a.x + v.x * lengthPx, y: a.y + v.y * lengthPx };
  const draw: SegmentDraw = { kind, girth, cover, ramp: RAMPS[cover], pts: [a, b], swell: 1 };
  drawSegment(c, draw);
  if (ending !== undefined) blitPiece(c, endingSprite(ending, dirFor(ENDING_SPRITES[ending], Math.atan2(v.y, v.x)), sizeSpec(ending, endingSize)?.sprite ?? 1), b, RAMPS[rampOf(ending, cover)]);
  closeSilhouette(c);
  return { ...c, a: { x: Math.round(a.x), y: Math.round(a.y) }, b: { x: Math.round(b.x), y: Math.round(b.y) } };
}

// ---------------------------------------------------------------- organs and heads

/** Contents a head draws in its own way rather than as a spot around it. */
const FACE = new Set<OrganKind>(["brain", "smallBrain", "jaw", "eye", "ear", "nose", "fangs", "crusherJaw", "proboscis", "mandibles", "radula", "blindness"]);
const MOUTHS = new Set<OrganKind>(["jaw", "fangs", "crusherJaw", "proboscis", "mandibles", "radula"]);
const SLIT_COVERS = new Set<CoverId>(["scales", "chitin", "plates", "bark"]);
const MAD_KINDS = new Set<OrganKind>(["paranoia", "abyssCall", "nerveStorm", "bloodlust", "terror", "deepCall", "schism"]);

type Pupil = "round" | "slit" | "pin";

/**
 * The line a closed mouth draws for the step of the jaw behind it (decision
 * 140, widened by decision 201): odd, so that it sits on the column the slot
 * names and not half a pixel off it, and far enough apart from step to step
 * that the difference survives the shrink into a 32 px tile.
 */
const JAW_WIDTH: Record<OrganSize, { front: number; profile: number }> = {
  small: { front: 3, profile: 2 },
  normal: { front: 7, profile: 4 },
  huge: { front: 11, profile: 6 },
};

/**
 * How much bigger a head is drawn than the atlas drew it, for the brain it
 * holds (decision 205). Brain is counted in the channels its organs carry -
 * that is what the model means by more brain - and only what sits in the head
 * counts, so a gut brain swells the belly's picture and not the face. A head
 * never shrinks: a small brain keeps the drawn head, a big one outgrows it.
 */
function headGrowth(contents: readonly Organ[]): number {
  // The channels an organ carries are what it gives the mind (`mindPower` in mind.ts reads the same
  // number), so folds of cortex count as brain here exactly as they do there.
  let channels = 0;
  for (const o of contents) channels += ORGANS[o.kind].channels ?? 0;
  // A human brain is ten channels and draws the head the atlas holds; two folds of cortex over it are one step.
  return channels >= 22 ? 1.5 : channels >= 15 ? 1.25 : 1;
}

/**
 * Masks redrawn at a scale, kept for the life of the module: a head grown for
 * its brain and a mouth stamp grown for its step are the same handful of
 * pictures every frame, and building them again each time costs more than
 * drawing them.
 */
const scaled = new Map<Mask | string, Map<number, Mask>>();

function atScale(key: Mask | string, k: number, build: () => Mask): Mask {
  let by = scaled.get(key);
  if (by === undefined) {
    by = new Map();
    scaled.set(key, by);
  }
  let out = by.get(k);
  if (out === undefined) {
    out = scaleMask(build(), k);
    by.set(k, out);
  }
  return out;
}

/** The mouth organ of a head that carries the biggest size step, or none when the head holds no sized mouth. */
function biggestMouth(contents: readonly Organ[]): Organ | undefined {
  let best: Organ | undefined;
  for (const o of contents) {
    if (!MOUTHS.has(o.kind) || sizeSpec(o.kind, "normal") === undefined) continue;
    if (best === undefined || ORGAN_SIZES.indexOf(sizeOf(o)) > ORGAN_SIZES.indexOf(sizeOf(best))) best = o;
  }
  return best;
}

/** The pupil of an eye: a slit under a hard cover, a pinpoint in a head that is losing it, round otherwise. */
function pupilOf(cover: CoverId, contents: readonly Organ[]): Pupil {
  if (contents.some((o) => MAD_KINDS.has(o.kind) || ORGANS[o.kind].family === "psionics")) return "pin";
  if (SLIT_COVERS.has(cover)) return "slit";
  return "round";
}

/**
 * Every feature of a face - an eye, an ear, a mouth stamp - is a square of
 * `size` whose top left corner sits this far from its slot, so that all of
 * them are measured the same way (decision 201). A square of an even side has
 * no middle pixel: it straddles the two columns left of the slot and right of
 * it, which puts its middle at `slot - 0.5`. A pair that must read symmetric
 * about the column `a` therefore takes slots that add up to `2a + 1`, and a
 * feature alone on the face takes the slot `a` itself.
 */
function featureAt(p: Point, size: number): Point {
  return { x: p.x - size / 2, y: p.y - size / 2 };
}

/** An eye: the white, then the pupil where the gaze puts it; a line while it blinks; all white when blind. */
function drawEye(c: Sheet, at: Point, size: 8 | 12, pupil: Pupil, blink: boolean, blind: boolean, gaze: Point, ramp: Ramp): void {
  const x0 = Math.round(at.x);
  const y0 = Math.round(at.y);
  if (blink && !blind) {
    const w = size === 12 ? 6 : 4;
    for (let i = 0; i < w; i++) put(c, x0 + Math.round(size / 2) - Math.round(w / 2) + i, y0 + Math.round(size / 2) - 1, OUTLINE);
    return;
  }
  blitStamp(c, stampFor("eyeWhite", size), x0, y0, 0, ramp);
  if (blind) return;
  const reach = size === 12 ? 2 : 1;
  const px = x0 + Math.round(size / 2) - 1 + Math.round(gaze.x * reach);
  const py = y0 + Math.round(size / 2) - 1 + Math.round(gaze.y * reach);
  switch (pupil) {
    case "round":
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) put(c, px + i, py + j, OUTLINE);
      break;
    case "slit":
      for (let j = -1; j <= 1; j++) put(c, px, py + j, OUTLINE);
      break;
    case "pin":
      put(c, px, py, OUTLINE);
      break;
  }
}

/** An eye's square on a head's mask: its top-left corner in the mask's own unmirrored pixels, and its side. */
export interface EyeBox {
  x: number;
  y: number;
  size: 8 | 12;
}

/**
 * Where the eyes of a head go, inside its mask (decision 1257). The sprite's
 * own eye slots take the first ones; every eye beyond them - a spider's eight,
 * a mantis's four - takes the place on the face farthest from what is already
 * drawn there (the eyes set before it, the ears, the mouth and the nose), a
 * smaller eye when a big one no longer fits clear, and when the face is full
 * it shares the roomiest place rather than leave the head. Eyes used to go
 * round the outside of the head, and a spider wore its eyes on its body. The
 * back of a head shows none.
 */
function eyeBoxes(sprite: HeadSprite, view: HeadView, mask: Mask, grow: number, spot: 8 | 12, count: number, ears: number): EyeBox[] {
  if (view === "back" || count === 0) return [];
  // The same few faces every frame: worked out once.
  const key = `${view}:${grow}:${spot}:${count}:${ears}`;
  let byMask = EYE_BOXES.get(mask);
  if (byMask === undefined) {
    byMask = new Map();
    EYE_BOXES.set(mask, byMask);
  }
  const hit = byMask.get(key);
  if (hit !== undefined) return hit;
  const out = placeEyes(sprite, mask, grow, spot, count, ears);
  byMask.set(key, out);
  return out;
}

const EYE_BOXES = new WeakMap<Mask, Map<string, EyeBox[]>>();

function placeEyes(sprite: HeadSprite, mask: Mask, grow: number, spot: 8 | 12, count: number, ears: number): EyeBox[] {
  const box = (p: Point, size: 8 | 12): EyeBox => ({ x: Math.round(p.x * grow) - size / 2, y: Math.round(p.y * grow) - size / 2, size });
  const used: EyeBox[] = [];
  for (let i = 0; i < Math.min(ears, sprite.ears.length); i++) used.push(box(sprite.ears[i]!, spot));
  if (sprite.mouth !== undefined) used.push(box(sprite.mouth, spot));
  if (sprite.nose !== undefined) used.push(box(sprite.nose, 8));
  const opaque = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < mask.w && y < mask.h && mask.rows[y]![x] !== ".";
  const fits = (x: number, y: number, size: number): boolean => {
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) if (!opaque(x + i, y + j)) return false;
    return true;
  };
  // A slot of the face's own that a grown head pushes past its edge moves in to the nearest place that holds the eye whole.
  const within = (b: EyeBox): EyeBox => {
    if (fits(b.x, b.y, b.size)) return b;
    for (const size of b.size === 12 ? ([12, 8] as const) : ([8] as const)) {
      let best: { b: EyeBox; d: number } | undefined;
      for (let y = 0; y + size <= mask.h; y++) {
        for (let x = 0; x + size <= mask.w; x++) {
          if (!fits(x, y, size)) continue;
          const d = Math.hypot(x + size / 2 - (b.x + b.size / 2), y + size / 2 - (b.y + b.size / 2));
          if (best === undefined || d < best.d) best = { b: { x, y, size }, d };
        }
      }
      if (best !== undefined) return best.b;
    }
    return b;
  };
  const out: EyeBox[] = [];
  for (let i = 0; i < Math.min(count, sprite.eyes.length); i++) out.push(within(box(sprite.eyes[i]!, spot)));
  // How far a square stands from everything on the face, in pixels between the nearest edges: below 0 it overlaps.
  const gap = (b: EyeBox): number => {
    let best = Infinity;
    for (const o of used) best = Math.min(best, Math.max(o.x - (b.x + b.size), b.x - (o.x + o.size), o.y - (b.y + b.size), b.y - (o.y + o.size)));
    for (const o of out) best = Math.min(best, Math.max(o.x - (b.x + b.size), b.x - (o.x + o.size), o.y - (b.y + b.size), b.y - (o.y + o.size)));
    return best;
  };
  for (let i = out.length; i < count; i++) {
    let pick: EyeBox | undefined;
    for (const size of spot === 12 ? ([12, 8] as const) : ([8] as const)) {
      let best: { b: EyeBox; g: number } | undefined;
      for (let y = 0; y + size <= mask.h; y++) {
        for (let x = 0; x + size <= mask.w; x++) {
          if (!fits(x, y, size)) continue;
          const b: EyeBox = { x, y, size };
          const g = gap(b);
          if (best === undefined || g > best.g) best = { b, g };
        }
      }
      if (best !== undefined && (best.g >= 0 || size === 8)) {
        pick = best.b;
        break;
      }
    }
    // A mask too small for a single eye: the eye sits on its middle.
    out.push(pick ?? { x: Math.round(mask.w / 2) - 4, y: Math.round(mask.h / 2) - 4, size: 8 });
  }
  return out;
}

/** The eyes of a head as a frame draws it from the direction: its mask as drawn, whether it is mirrored, and every eye's square on it. */
export function headEyes(head: Organ, dir: Dir): { mask: Mask; mirror: boolean; eyes: EyeBox[] } {
  const contents = head.contents ?? [];
  const { view, mirror } = headViewOf(dir);
  const sprite = HEAD_SPRITES[headKindOf(contents)][view];
  const grow = headGrowth(contents);
  const mask = grow === 1 ? sprite.mask : atScale(sprite.mask, grow, () => sprite.mask);
  const spot: 8 | 12 = grow >= 1.5 ? 12 : 8;
  const eyes = contents.filter((o) => EYE_KINDS.has(o.kind)).length;
  const ears = contents.filter((o) => o.kind === "ear").length;
  return { mask, mirror, eyes: eyeBoxes(sprite, view, mask, grow, spot, eyes, ears) };
}

interface HeadDraw {
  at: Point;
  dir: Dir;
  head: Organ;
  ramp: Ramp;
  cover: CoverId;
  self: boolean;
  blink: number;
  gaze: Point;
  dead: boolean;
}

function drawHead(c: Sheet, h: HeadDraw, marks: boolean, insides: boolean): void {
  const contents = h.head.contents ?? [];
  const kind = h.dead ? "skull" : headKindOf(contents);
  const { view, mirror } = headViewOf(h.dir);
  const sprite: HeadSprite = HEAD_SPRITES[kind][view];
  // The head is as big as the brain in it (decision 205), and every slot and every feature grows with it.
  const grow = headGrowth(contents);
  const mask = grow === 1 ? sprite.mask : atScale(sprite.mask, grow, () => sprite.mask);
  const spot: 8 | 12 = grow >= 1.5 ? 12 : 8;
  const x0 = Math.round(h.at.x) - Math.round(mask.w / 2);
  const y0 = Math.round(h.at.y) - Math.round(mask.h / 2);
  // The mirror of a slot: a feature's box spans [p - size/2, p + size/2), so the mask's own mirror (i -> w - 1 - i) carries the slot to w - p.
  const slot = (p: Point): Point => {
    const at = Math.round(p.x * grow);
    return { x: x0 + (mirror ? mask.w - at : at), y: y0 + Math.round(p.y * grow) };
  };
  blit(c, mask, x0, y0, h.ramp, { mirror, tile: TILES[h.cover] });
  const pupil = pupilOf(h.cover, contents);
  const blind = contents.some((o) => o.kind === "blindness");
  // Ears first: an ear hangs at the edge of the head, and where the two still meet the eye is the one that must stay readable (decision 201).
  const ears = contents.filter((o) => o.kind === "ear").length;
  for (let i = 0; i < Math.min(ears, sprite.ears.length); i++) {
    const p = slot(sprite.ears[i]!);
    // The drawn ear has its back on the left, so the one on the right side of the face is its mirror.
    const at = featureAt(p, spot);
    blitStamp(c, stampFor("ear", spot), at.x, at.y, 0, h.ramp, undefined, p.x > x0 + mask.w / 2);
  }
  const eyes = contents.filter((o) => EYE_KINDS.has(o.kind)).length;
  for (const e of eyeBoxes(sprite, view, mask, grow, spot, eyes, ears)) {
    drawEye(c, { x: x0 + (mirror ? mask.w - e.x - e.size : e.x), y: y0 + e.y }, e.size, pupil, h.blink > 0.5, blind, h.gaze, h.ramp);
  }
  if (kind !== "skull" && view !== "back") {
    const mouth = contents.find((o) => MOUTHS.has(o.kind));
    // The step a face bites at is the biggest step any jaw of the head carries, whatever kind of mouth
    // is drawn over it (decision 206): a dragon's head holds fangs and a huge jaw, and the fangs are
    // what the face shows, so without this the step would be invisible on every predator.
    const sized = biggestMouth(contents);
    const step = sized === undefined ? "normal" : sizeOf(sized);
    if (mouth !== undefined && sprite.mouth !== undefined) {
      const p = slot(sprite.mouth);
      if (mouth.kind === "jaw") {
        // A closed mouth: a dark line with a lower lip, as wide as the jaw's size step (decision 140).
        // A huge jaw stretches the whole face as well (`headKindOf`); a small one only draws a smaller mouth.
        // An odd width sits on the slot's own column, which is the axis of the face (decision 201).
        const w = Math.max(2, Math.round(JAW_WIDTH[step][view === "profile" ? "profile" : "front"] * grow));
        for (let i = 0; i < w; i++) put(c, p.x - (w >> 1) + i, p.y, h.ramp.dark);
        put(c, p.x - (w >> 1) + 1, p.y + 1, h.ramp.light);
      } else {
        const name = VISUALS[mouth.kind].stamp;
        const drawn = atScale(name, (sized === undefined ? 1 : spriteScaleOf(sized)) * grow, () => {
          const st = stampFor(name, 8);
          return { w: st.size, h: st.size, rows: st.rows };
        });
        const at = featureAt(p, drawn.w);
        blit(c, drawn, Math.round(at.x), Math.round(at.y), RAMPS[rampOf(mouth.kind, h.cover)]);
      }
    }
    if (sprite.nose !== undefined && contents.some((o) => o.kind === "nose")) {
      const p = slot(sprite.nose);
      put(c, p.x, p.y, h.ramp.dark);
      put(c, p.x - 1, p.y, h.ramp.dark);
      put(c, p.x, p.y - 1, h.ramp.light);
    }
  }
  // On the x-ray the brain shows through the skull: amber when it is you, violet otherwise.
  if (insides && contents.some((o) => isBrainKind(o.kind))) {
    const p = slot(sprite.brain);
    const ramp: Ramp = h.self ? { dark: AMBER, base: AMBER, light: BILE } : RAMPS.head;
    blitStamp(c, stampFor("brain", spot), featureAt(p, spot).x, featureAt(p, spot).y, 0, ramp, h.ramp.dark);
  }
  // Everything else inside the head shows around it, each at its own slot.
  let k = 0;
  let ring = 0;
  for (const o of contents) {
    if (FACE.has(o.kind)) continue;
    const vis = VISUALS[o.kind];
    if (vis.hidden !== undefined) continue;
    if (vis.stamp === "aura") {
      if (!marks) continue;
      const rr = 14 + 2 * ring;
      ring += 1;
      const ramp = RAMPS[rampOf(o.kind, h.cover)];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + ring * 0.3;
        put(c, Math.round(h.at.x + Math.cos(a) * rr), Math.round(h.at.y + Math.sin(a) * rr), i % 2 === 0 ? ramp.base : ramp.light);
      }
      continue;
    }
    // An organ inside the head is seen on the x-ray only; an aura above is seen from outside.
    if (!insides) continue;
    const n = vis.count ?? 1;
    for (let j = 0; j < n; j++) {
      const a = sprite.around[k % sprite.around.length]!;
      k += 1;
      const p = slot(a);
      const angle = Math.atan2(p.y - h.at.y, p.x - h.at.x);
      stampAt(c, stampFor(vis.stamp, 8), p.x - Math.cos(angle) * 3, p.y - Math.sin(angle) * 3, angle, RAMPS[rampOf(o.kind, h.cover)]);
    }
  }
}

/** Cavity organs of a torso in anatomical order: the heart first, lungs next, the stomach, then the rest as they come. */
function cavityOrder(organs: Organ[]): Organ[] {
  const rank = (o: Organ): number => (o.kind === "heart" || o.kind === "bloodReserve" ? 0 : o.kind === "lungs" || o.kind === "doubleBreath" || o.kind === "airSacs" ? 1 : o.kind === "stomach" || o.kind === "acidStomach" || o.kind === "methaneStomach" ? 2 : 3);
  return [...organs].sort((a, b) => rank(a) - rank(b));
}

// ---------------------------------------------------------------- the frame

function coverAtNode(body: Body, sids: readonly number[], id: number, parentSeg: number | undefined): CoverId {
  if (parentSeg !== undefined) return body.segments[parentSeg]!.cover;
  const s = sids.find((sid) => body.segments[sid]!.a === id || body.segments[sid]!.b === id);
  return s === undefined ? "skin" : body.segments[s]!.cover;
}

function rampForSegment(seg: Segment): Ramp {
  if (seg.hp <= 0) return RAMPS.flesh;
  if (seg.ischemia >= 10) return RAMPS.ctrl;
  return RAMPS[seg.cover];
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Every empty pixel next to flesh becomes outline: one contour around the
 * whole silhouette. In place: an outline pixel is not flesh, so nothing
 * spreads. Returns the box of everything drawn, the shadow included.
 */
function closeSilhouette(c: Sheet): Box {
  const { w, h, cells } = c;
  const box: Box = { x0: w, y0: h, x1: -1, y1: -1 };
  for (let y = 1; y < h - 1; y++) {
    const row = y * w;
    for (let x = 1; x < w - 1; x++) {
      const v = cells[row + x]!;
      if (v === 0) continue;
      if (x < box.x0) box.x0 = x;
      if (x > box.x1) box.x1 = x;
      if (y < box.y0) box.y0 = y;
      if (y > box.y1) box.y1 = y;
      if (v === SHADOW || v === OUTLINE) continue;
      const l = cells[row + x - 1]!;
      if (l === 0 || l === SHADOW) cells[row + x - 1] = OUTLINE;
      const r = cells[row + x + 1]!;
      if (r === 0 || r === SHADOW) cells[row + x + 1] = OUTLINE;
      const u = cells[row - w + x]!;
      if (u === 0 || u === SHADOW) cells[row - w + x] = OUTLINE;
      const d = cells[row + w + x]!;
      if (d === 0 || d === SHADOW) cells[row + w + x] = OUTLINE;
    }
  }
  if (box.x1 >= 0) {
    box.x0 = Math.max(0, box.x0 - 1);
    box.y0 = Math.max(0, box.y0 - 1);
    box.x1 = Math.min(w - 1, box.x1 + 1);
    box.y1 = Math.min(h - 1, box.y1 + 1);
  }
  return box;
}

const rigCache = new WeakMap<Layout, { version: number; seed: number; rig: Rig }>();

function rigFor(body: Body, l: Layout, seed: number): Rig {
  const hit = rigCache.get(l);
  if (hit !== undefined && hit.version === body.version && hit.seed === seed) return hit.rig;
  const r = rig(body, l, seed);
  rigCache.set(l, { version: body.version, seed, rig: r });
  return r;
}

/** The size of the native frame of a layout: its box at the sprites' scale plus the room parts overhang by. */
function nativeSize(l: Layout): { w: number; h: number; ox: number; oy: number } {
  const bw = (l.bbox.x1 - l.bbox.x0) * PPU;
  const bh = (l.bbox.y1 - l.bbox.y0) * PPU;
  const slack = 0.1 * Math.max(bw, bh);
  const w = Math.ceil(bw + 2 * (MARGIN + slack));
  const h = Math.ceil(bh + 2 * (MARGIN + slack));
  return { w, h, ox: MARGIN + slack - l.bbox.x0 * PPU, oy: MARGIN + slack - l.bbox.y0 * PPU };
}

/** The body at the sprites' own scale, in a frame that fits its layout. */
export function composeBody(body: Body, opts: PixelOptions = {}): PixelFrame {
  const seed = opts.seed ?? 1;
  const t = opts.t ?? 0;
  const marks = opts.marks ?? true;
  const l = opts.layout ?? layout(body, { scale: opts.scale ?? "sqrt" });
  const p = opts.pose ?? poseOf(rigFor(body, l, seed), t);
  const { w, h, ox, oy } = nativeSize(l);
  const cells = new Uint8Array(w * h);
  const c: Sheet = { w, h, cells };
  const frame: PixelFrame = { w, h, cells, palette: PALETTE, ppu: PPU, ox, oy };
  if (l.nodes.length === 0) return frame;
  const X = (u: number): number => u * PPU + ox;
  const Y = (u: number): number => u * PPU + oy;
  const map = (q: Point): Point => ({ x: X(q.x), y: Y(q.y) });

  // Shadow under the lowest point of the pose.
  if (opts.shadow ?? true) {
    let bottom = -Infinity;
    let left = Infinity;
    let right = -Infinity;
    for (const n of Object.values(p.nodes)) {
      bottom = Math.max(bottom, n.y);
      left = Math.min(left, n.x);
      right = Math.max(right, n.x);
    }
    const cx = X((left + right) / 2);
    const rx = Math.max(10, 0.3 * (right - left) * PPU + 8);
    ellipse(c, cx, Y(bottom) + 12, rx, 3.5, SHADOW);
  }

  // Membranes: the light comes through a checker; the pattern ripples with time.
  const phase = Math.floor(t * 3) % 2;
  for (const m of p.membranes) polygon(c, m.polygon.map(map), BIO, CHROME_DARK, phase);

  const index = new Map<number, number>();
  l.order.forEach((id, i) => index.set(id, i));
  const rank = (id: number): number => index.get(id) ?? Infinity;
  const sids = segmentIds(body);
  const nids = nodeIds(body);
  const parents = new Map<number, number>();
  const degree = new Map<number, number>();
  for (const sid of sids) {
    const s = body.segments[sid]!;
    const ia = rank(s.a);
    const ib = rank(s.b);
    const far = ia <= ib ? s.b : s.a;
    if (!parents.has(far)) parents.set(far, sid);
    degree.set(s.a, (degree.get(s.a) ?? 0) + 1);
    degree.set(s.b, (degree.get(s.b) ?? 0) + 1);
  }
  const centroid = { x: 0, y: 0 };
  for (const n of l.nodes) {
    centroid.x += n.x / l.nodes.length;
    centroid.y += n.y / l.nodes.length;
  }

  // A torso's own nodes, its side nodes among them: the limbs come out of its wall, no knob there.
  const torsoEnds = new Set<number>(torsoNodes(body));

  // Segments, the wide under the narrow.
  const order = [...sids].sort((x, y) => paintRank(body.segments[x]!) - paintRank(body.segments[y]!) || x - y);
  const endDirs = new Map<number, Dir>();
  for (const sid of order) {
    const seg = body.segments[sid]!;
    // The pose swings a torso from node to node (decision 1259), and its sprite runs so: its caps are drawn inside
    // its ends, so the body spans node to node, as the graph's does with its round caps outside a shorter spine.
    const spine = p.segments[sid]!;
    const ia = rank(seg.a);
    const ib = rank(seg.b);
    const rootFirst = ia <= ib ? spine : [...spine].reverse();
    const pts = rootFirst.map(map);
    const swell = swellOf(seg);
    const ramp = rampForSegment(seg);
    const { endDir, root, rootTurn } = drawSegment(c, { kind: seg.kind, girth: seg.girth, cover: seg.cover, ramp, pts, swell });
    endDirs.set(sid, endDir);
    const cum = cumulative(pts);
    const total = cum[cum.length - 1]!;
    // Organs inside are not seen from outside; asked for, they show through the wall of the torso, under its ribs.
    const inside = opts.insides === true ? cavityOrder(seg.cavity.filter((o) => VISUALS[o.kind].hidden === undefined)) : [];
    if (inside.length > 0) {
      const size: 8 | 12 = seg.kind === "torso" && seg.girth >= 2 ? 12 : 8;
      const halfW = segmentHalfWidth(seg) * PPU * swell;
      inside.forEach((o, i) => {
        const vis = VISUALS[o.kind];
        const n = vis.count ?? 1;
        const f = inside.length === 1 ? 0.5 : 0.2 + (0.6 * i) / (inside.length - 1);
        const { p: q, u } = along(pts, cum, total * f);
        const side = i === 0 ? -0.45 : i === 1 ? 0.35 : i % 2 === 0 ? -0.3 : 0.3;
        const nx = -u.y;
        const ny = u.x;
        for (let k = 0; k < n; k++) {
          const off = (k - (n - 1) / 2) * size * 0.7;
          stampCentred(c, stampFor(vis.stamp, size), q.x + nx * (side * halfW + off), q.y + ny * (side * halfW + off), RAMPS[rampOf(o.kind, seg.cover)], ramp.dark);
        }
      });
      // The ribs come back over the organs: they are behind the chest wall.
      if (seg.kind === "torso") blitTurned(c, root, pts[0]!, rootTurn, ramp, { only: "1#" });
    }
    // Growths sit on the outer side of the segment, pointing away from the body.
    const visibleGrowths = seg.growths.filter((o) => VISUALS[o.kind].hidden === undefined);
    let slot = 0;
    const slots = visibleGrowths.reduce((n, o) => n + (VISUALS[o.kind].count ?? 1), 0);
    const halfWidth = segmentHalfWidth(seg) * PPU * swell;
    for (const o of visibleGrowths) {
      const vis = VISUALS[o.kind];
      if (vis.stamp === "shiver" && !marks) continue;
      const n = vis.count ?? 1;
      for (let k = 0; k < n; k++) {
        const f = (slot + 1) / (slots + 1);
        slot += 1;
        const { p: q, u } = along(pts, cum, total * f);
        const nx = -u.y;
        const ny = u.x;
        const cxp = X(centroid.x);
        const cyp = Y(centroid.y);
        const side = (q.x + nx - cxp) ** 2 + (q.y + ny - cyp) ** 2 >= (q.x - nx - cxp) ** 2 + (q.y - ny - cyp) ** 2 ? 1 : -1;
        const st = stampFor(vis.stamp, seg.kind === "torso" ? 12 : 8);
        stampAt(c, st, q.x + nx * side * (halfWidth - 1), q.y + ny * side * (halfWidth - 1), Math.atan2(ny * side, nx * side), RAMPS[rampOf(o.kind, seg.cover)]);
      }
    }
  }

  // Joints over the limbs that meet there: a knob by the node's size, none on a torso's own nodes, none under a head.
  for (const id of nids) {
    const node = body.nodes[id]!;
    if (torsoEnds.has(id) || node.ends.some((e) => e.kind === "head")) continue;
    if ((degree.get(id) ?? 0) < 2 && node.size < 2) continue;
    const q = p.nodes[id]!;
    const m = JOINTS[Math.min(2, Math.max(0, node.size - 1))]!;
    const cover = coverAtNode(body, sids, id, parents.get(id));
    blit(c, m, Math.round(X(q.x) - m.w / 2), Math.round(Y(q.y) - m.h / 2), node.hp <= 0 ? RAMPS.flesh : RAMPS[cover], { tile: TILES[cover] });
  }

  // Endings that are not heads: sprites pointing on from the node.
  const selfNode = "node" in body.self ? body.self.node : -1;
  // The way a part arrives at a node, in the pose: the direction anything standing on that node points.
  const arrival = (segId: number, id: number): number => {
    const spine = p.segments[segId]!;
    const seg = body.segments[segId]!;
    const towards = seg.b === id ? spine : [...spine].reverse();
    const a = towards[towards.length - 2] ?? towards[0]!;
    const b = towards[towards.length - 1]!;
    return Math.atan2(b.y - a.y, b.x - a.x);
  };
  const heads: { id: number; end: number; dir: Dir; sink: Point }[] = [];
  for (const id of nids) {
    const node = body.nodes[id]!;
    const q = p.nodes[id]!;
    const parentSeg = parents.get(id);
    let angle = -Math.PI / 2;
    if (parentSeg !== undefined) angle = arrival(parentSeg, id);
    // A head sits down on what carries it, so only a finger's width of neck shows (decision 141).
    // The root of the picture has no parent segment - your own head is one - so the sink follows
    // whatever segment does reach the node.
    const carrier = parentSeg ?? sids.find((sid) => body.segments[sid]!.a === id || body.segments[sid]!.b === id);
    const sink = carrier === undefined ? 0 : HEAD_SINK;
    const sinkAngle = parentSeg !== undefined ? angle : carrier === undefined ? angle : arrival(carrier, id);
    const dir = dirOf(angle);
    const cover = coverAtNode(body, sids, id, parentSeg);
    let k = 0;
    node.ends.forEach((e, end) => {
      if (e.kind === "head") {
        heads.push({ id, end, dir, sink: { x: -Math.cos(sinkAngle) * sink, y: -Math.sin(sinkAngle) * sink } });
        return;
      }
      const vis = VISUALS[e.kind];
      if (vis.hidden !== undefined) return;
      const turn = k === 0 ? 0 : k === 1 ? Math.PI / 2 : k === 2 ? -Math.PI / 2 : Math.PI;
      const d = dirFor(ENDING_SPRITES[e.kind], angle + turn);
      k += 1;
      const at = { x: X(q.x), y: Y(q.y) };
      const ramp = RAMPS[rampOf(e.kind, cover)];
      if (e.kind === "eye") {
        const eye = p.eyes[id];
        const piece = endingSprite("eye", d);
        blitPiece(c, piece, at, RAMPS[cover]);
        // The pupil at the eyeball's centre, a little beyond the node along the stalk.
        const v = DIR_VECTORS[d]!;
        const centre = { x: Math.round(at.x + v.x * 7), y: Math.round(at.y + v.y * 7) };
        if (eye !== undefined && eye.blink > 0.5) {
          for (let i = -2; i <= 2; i++) put(c, centre.x + Math.round(-v.y * i), centre.y + Math.round(v.x * i), OUTLINE);
        } else {
          const gaze = eye?.gaze ?? { x: 0, y: 0 };
          const px = centre.x + Math.round(gaze.x * 2);
          const py = centre.y + Math.round(gaze.y * 2);
          for (let j = -1; j <= 0; j++) for (let i = -1; i <= 0; i++) put(c, px + i, py + j, OUTLINE);
        }
      } else if (endingSpriteExists(e.kind)) {
        // A small or huge organ is the same drawing at its own scale (sizes.ts).
        blitPiece(c, endingSprite(e.kind, d, spriteScaleOf(e)), at, ramp, { tile: vis.place === "tip" && vis.ramp === undefined ? TILES[cover] : undefined });
      } else {
        const angle = Math.atan2(DIR_VECTORS[d]!.y, DIR_VECTORS[d]!.x);
        stampAt(c, stampFor(vis.stamp, Math.round(12 * spriteScaleOf(e))), at.x - Math.cos(angle) * 2, at.y - Math.sin(angle) * 2, angle, ramp);
      }
      if (e.wander !== undefined && marks) stampCentred(c, stampFor("shiver", 8), at.x, at.y + 8, RAMPS.ctrl);
    });
  }

  // Heads last, yours on top of the others.
  heads.sort((u, v) => Number(u.id === selfNode) - Number(v.id === selfNode) || u.id - v.id);
  for (const { id, end, dir, sink } of heads) {
    const node = body.nodes[id]!;
    const head = node.ends[end]!;
    const q = p.nodes[id]!;
    const eye = p.eyes[id] ?? { blink: 0, gaze: { x: 0, y: 0 } };
    const cover = coverAtNode(body, sids, id, parents.get(id));
    const self = id === selfNode && (head.contents?.some((o) => hasTag(o.kind, "brain")) ?? false);
    const at = { x: X(q.x) + (end > 0 ? 6 * end : 0) + sink.x, y: Y(q.y) - (end > 0 ? 4 : 0) + sink.y };
    drawHead(c, { at, dir, head, ramp: node.hp <= 0 ? RAMPS.flesh : RAMPS[cover], cover, self, blink: eye.blink, gaze: eye.gaze, dead: node.hp <= 0 }, marks, opts.insides === true);
    if (head.wander !== undefined && marks) stampCentred(c, stampFor("shiver", 8), at.x, at.y + 16, RAMPS.ctrl);
  }

  frame.box = closeSilhouette(c);
  return frame;
}

function endingSpriteExists(kind: OrganKind): boolean {
  try {
    endingSprite(kind, 4);
    return true;
  } catch {
    return false;
  }
}

/**
 * The native frame fitted into a square of `px`: trimmed to what is drawn,
 * shrunk by nearest pixel when it does not fit (a thin part that would
 * vanish leaves its outline), the silhouette closed again.
 */
export function fitFrame(f: PixelFrame, px: number): PixelFrame {
  let { x0, y0, x1, y1 } = f.box ?? { x0: f.w, y0: f.h, x1: -1, y1: -1 };
  if (f.box === undefined) {
    for (let y = 0; y < f.h; y++) {
      for (let x = 0; x < f.w; x++) {
        if (f.cells[y * f.w + x] === 0) continue;
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
  }
  const cells = new Uint8Array(px * px);
  const out: PixelFrame = { w: px, h: px, cells, palette: f.palette, ppu: f.ppu, ox: f.ox, oy: f.oy };
  if (x1 < 0) return out;
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  const room = px - 4;
  const s = Math.min(1, room / Math.max(cw, ch));
  const tw = Math.max(1, Math.round(cw * s));
  const th = Math.max(1, Math.round(ch * s));
  const ox = Math.floor((px - tw) / 2);
  const oy = Math.floor((px - th) / 2);
  out.ppu = f.ppu * s;
  out.ox = (f.ox - x0) * s + ox;
  out.oy = (f.oy - y0) * s + oy;
  for (let ty = 0; ty < th; ty++) {
    const sy0 = y0 + Math.floor((ty / th) * ch);
    const sy1 = y0 + Math.max(Math.floor((ty / th) * ch) + 1, Math.floor(((ty + 1) / th) * ch));
    for (let tx = 0; tx < tw; tx++) {
      const sx0 = x0 + Math.floor((tx / tw) * cw);
      const sx1 = x0 + Math.max(Math.floor((tx / tw) * cw) + 1, Math.floor(((tx + 1) / tw) * cw));
      const cx = Math.min(x1, Math.floor((sx0 + sx1) / 2));
      const cy = Math.min(y1, Math.floor((sy0 + sy1) / 2));
      let v = f.cells[cy * f.w + cx]!;
      if (!isFlesh(v)) {
        let any = false;
        let shadow = v === SHADOW;
        for (let sy = sy0; sy < sy1 && !any; sy++) {
          for (let sx = sx0; sx < sx1; sx++) {
            const u = f.cells[sy * f.w + sx]!;
            if (isFlesh(u)) {
              any = true;
              break;
            }
            if (u === SHADOW) shadow = true;
          }
        }
        if (any) v = OUTLINE;
        else if (shadow) v = SHADOW;
      }
      cells[(oy + ty) * px + ox + tx] = v;
    }
  }
  out.box = closeSilhouette(out);
  return out;
}
