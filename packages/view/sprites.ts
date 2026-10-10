/**
 * The drawn parts of the body (step L): masks as rows of characters, one
 * source of truth for the large view and for the 32 / 64 / 96 px tile.
 *
 * A segment is three pieces - a root cap at its node, a middle that repeats
 * along the length, an end cap at the far node - so that only the middle
 * stretches and the shape never swims. Every piece is drawn by hand pointing
 * down (S) and, for the limbs that matter, down-right (SE); the other six
 * directions are exact quarter turns of those two, made once when the module
 * loads, with the lit side swapped where the lamp (top left) would fall on the
 * other side. While a frame is drawn, the middle of a segment is swept along
 * the pose at its true angle and the caps are turned the rest of the way from
 * their nearest drawing (compose.ts), so a limb off the eight directions stays
 * one straight part.
 *
 * Roles in a mask: `.` nothing, `#` contour, `1` dark, `2` base, `3` light of
 * the part's ramp, `,` base at an open joint (the next piece continues there),
 * `w` white, `k` black, `f` flesh, `y` amber, `g` bio, `b` bile, `n` bone.
 */
import { isBrainKind, sizeOf, type CoverId, type Organ, type OrganKind, type SegmentKind } from "@mutant-engine/core";
import type { Point } from "./layout.js";
import { ROLES, type Drawn, type HeadKind, type HeadSprite, type HeadView, type Mask, type Piece, type SegmentSprite } from "./sprites/mask.js";
import { STAMPS } from "./stamps.js";
import { ENDINGS } from "./sprites/endings.js";
import { HEADS } from "./sprites/heads.js";
import { LIMBS } from "./sprites/limbs.js";
import { TILES } from "./sprites/tiles.js";
import { TORSOS } from "./sprites/torsos.js";

export { ROLES, mask, type Drawn, type HeadKind, type HeadSprite, type HeadView, type Mask, type Piece, type SegmentSprite } from "./sprites/mask.js";

/** Directions, clockwise from up: N, NE, E, SE, S, SW, W, NW. */
export type Dir = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const DIRS: readonly Dir[] = [0, 1, 2, 3, 4, 5, 6, 7];
export const DIR_VECTORS: readonly Point[] = DIRS.map((d) => ({ x: Math.sin((d * Math.PI) / 4), y: -Math.cos((d * Math.PI) / 4) }));

/** The nearest of the eight directions to an angle in the screen frame (0 right, y down). */
export function dirOf(angle: number): Dir {
  const k = Math.round((angle + Math.PI / 2) / (Math.PI / 4));
  return (((k % 8) + 8) % 8) as Dir;
}

/** The nearest of the four cardinal directions to an angle. */
export function cardinalOf(angle: number): Dir {
  const k = Math.round((angle + Math.PI / 2) / (Math.PI / 2));
  return (((k * 2) % 8 + 8) % 8) as Dir;
}

/** The direction a drawn part takes for an angle: one of eight with a diagonal drawing, one of four without. */
export function dirFor(drawn: Drawn<unknown> | undefined, angle: number): Dir {
  return drawn?.se === undefined ? cardinalOf(angle) : dirOf(angle);
}

export const S: Dir = 4;
export const SE: Dir = 3;

/** Every limb sprite kind; a segment kind and girth pick one (`limbKindOf`). */
export type LimbKind = "arm" | "armThick" | "leg" | "legThick" | "tentacle" | "tentacleThick" | "tail" | "stalk" | "neck" | "growth" | "torso" | "belly";

export const SEGMENT_SPRITES: Partial<Record<LimbKind, Drawn<SegmentSprite>>> = { ...LIMBS, ...TORSOS };

export const ENDING_SPRITES: Partial<Record<OrganKind, Drawn<Piece>>> = ENDINGS;

export const HEAD_SPRITES: Record<HeadKind, Record<HeadView, HeadSprite>> = HEADS;

export { TILES };

export const SPRITE_SIZES = {
  limbWidth: 16,
  limbHeight: 32,
  torso: [32, 40] as const,
  belly: [48, 56] as const,
  head: 24,
  ending: 16,
  tile: 8,
} as const;

// ---------------------------------------------------------------- turning

/** The mask turned a quarter turn clockwise: pixel (x, y) lands at (h - 1 - y, x). */
function turnMask(m: Mask, quarters: number): Mask {
  let out = m;
  for (let q = 0; q < (((quarters % 4) + 4) % 4); q++) {
    const rows: string[] = [];
    for (let y = 0; y < out.w; y++) {
      let line = "";
      for (let x = 0; x < out.h; x++) line += out.rows[out.h - 1 - x]![y]!;
      rows.push(line);
    }
    out = { w: out.h, h: out.w, rows };
  }
  return out;
}


function turnPoint(p: Point, w: number, h: number, quarters: number): Point {
  let out = { x: p.x, y: p.y };
  let cw = w;
  let ch = h;
  for (let q = 0; q < (((quarters % 4) + 4) % 4); q++) {
    out = { x: ch - 1 - out.y, y: out.x };
    [cw, ch] = [ch, cw];
  }
  return out;
}

function turnVector(v: Point, quarters: number): Point {
  let out = { x: v.x, y: v.y };
  for (let q = 0; q < (((quarters % 4) + 4) % 4); q++) out = { x: -out.y, y: out.x };
  return out;
}

const SWAP: Record<string, string> = { "1": "3", "3": "1" };

/** Light and dark exchanged: the lamp fell on the other side after the turn. */
function swapLight(m: Mask): Mask {
  return { w: m.w, h: m.h, rows: m.rows.map((r) => r.replace(/[13]/g, (c) => SWAP[c]!)) };
}

const LAMP = { x: -0.6, y: -0.8 };

/** Whether the lamp lights the given side of a part pointing in `d`. */
function litSide(d: Dir, side: "left" | "right"): boolean {
  const v = DIR_VECTORS[d]!;
  const n = side === "left" ? { x: v.y, y: -v.x } : { x: -v.y, y: v.x };
  return n.x * LAMP.x + n.y * LAMP.y >= 0;
}

function turnPiece(p: Piece, from: Dir, to: Dir): Piece {
  const quarters = (((to - from) / 2) % 4 + 4) % 4;
  let m = turnMask(p.mask, quarters);
  if (litSide(from, p.lit) !== litSide(to, p.lit)) m = swapLight(m);
  return { mask: m, anchor: turnPoint(p.anchor, p.mask.w, p.mask.h, quarters), advance: turnVector(p.advance, quarters), lit: p.lit, edge: turnVector(p.edge, quarters) };
}

function turnSegment(s: SegmentSprite, from: Dir, to: Dir): SegmentSprite {
  return { root: turnPiece(s.root, from, to), mid: turnPiece(s.mid, from, to), end: turnPiece(s.end, from, to) };
}

/** All eight directions of a drawn part: the cardinal ones from the S drawing, the diagonals from the SE drawing when there is one, else from the nearest cardinal. */
function eight<T>(d: Drawn<T>, turn: (t: T, from: Dir, to: Dir) => T): T[] {
  const out: T[] = [];
  for (const dir of DIRS) {
    if (dir % 2 === 0) out.push(turn(d.s, S, dir));
    else if (d.se !== undefined) out.push(turn(d.se, SE, dir));
    else out.push(turn(d.s, S, ((dir + 1) % 8) as Dir));
  }
  return out;
}

/**
 * A mask redrawn `k` times across, nearest pixel: the honest enlargement of a
 * stamp. A whole factor keeps every drawn pixel a square block, and 0.75
 * drops one pixel in four - a small hand reads as the same hand, smaller.
 */
export function scaleMask(m: Mask, k: number): Mask {
  if (k === 1) return m;
  const w = Math.max(1, Math.round(m.w * k));
  const h = Math.max(1, Math.round(m.h * k));
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    const src = m.rows[Math.min(m.h - 1, Math.floor((y + 0.5) / k))]!;
    let line = "";
    for (let x = 0; x < w; x++) line += src[Math.min(m.w - 1, Math.floor((x + 0.5) / k))]!;
    rows.push(line);
  }
  return { w, h, rows };
}

/** A piece redrawn `k` times across: the mask, where it hangs and where the next piece goes all grow together. */
function scalePiece(p: Piece, k: number): Piece {
  if (k === 1) return p;
  const m = scaleMask(p.mask, k);
  return {
    mask: m,
    anchor: { x: Math.min(m.w - 1, Math.round(p.anchor.x * k)), y: Math.min(m.h - 1, Math.round(p.anchor.y * k)) },
    advance: { x: Math.round(p.advance.x * k), y: Math.round(p.advance.y * k) },
    lit: p.lit,
    edge: p.edge,
  };
}

const segmentCache = new Map<LimbKind, SegmentSprite[]>();
const endingCache = new Map<OrganKind, Piece[]>();
/** Endings redrawn at a size step, by `kind|scale`: built once, kept for the life of the module. */
const sizedEndingCache = new Map<string, Piece[]>();

/** The sprite of a limb kind pointing in `d`, turned once and kept. */
export function segmentSprite(kind: LimbKind, d: Dir): SegmentSprite {
  let all = segmentCache.get(kind);
  if (all === undefined) {
    const drawn = SEGMENT_SPRITES[kind];
    if (drawn === undefined) throw new Error(`sprites: no limb ${kind}`);
    all = eight(drawn, turnSegment);
    segmentCache.set(kind, all);
  }
  return all[d]!;
}

/**
 * The sprite of an ending pointing in `d`, at `scale` times its drawn size
 * (`spriteScaleOf` of the organ, 1 by default). Turned and scaled once, kept.
 */
export function endingSprite(kind: OrganKind, d: Dir, scale = 1): Piece {
  let all = endingCache.get(kind);
  if (all === undefined) {
    const drawn = ENDING_SPRITES[kind];
    if (drawn === undefined) throw new Error(`sprites: no ending ${kind}`);
    all = eight(drawn, turnPiece);
    endingCache.set(kind, all);
  }
  if (scale === 1) return all[d]!;
  const key = `${kind}|${scale}`;
  let sized = sizedEndingCache.get(key);
  if (sized === undefined) {
    sized = all.map((p) => scalePiece(p, scale));
    sizedEndingCache.set(key, sized);
  }
  return sized[d]!;
}

// ---------------------------------------------------------------- choosing

/** Which limb sprite a segment of a kind and girth is drawn with; `swell` is what growths on it add. */
export function limbKindOf(kind: SegmentKind, girth: number, swell = 1): LimbKind {
  const thick = girth * swell >= 2;
  switch (kind) {
    case "arm":
      return thick ? "armThick" : "arm";
    case "leg":
      return thick ? "legThick" : "leg";
    case "tentacle":
      return thick ? "tentacleThick" : "tentacle";
    case "tail":
      return "tail";
    case "stalk":
    case "penis":
      return "stalk";
    case "neck":
    case "gullet":
    case "flank":
      return "neck";
    case "growth":
      return "growth";
    case "torso":
      return girth * swell >= 4 ? "belly" : "torso";
  }
}

const LONG_JAWS = new Set<OrganKind>(["fangs", "crusherJaw", "proboscis", "radula"]);

/** Eyes a head shows, whatever their kind: a spider's facet eyes look out as plainly as a human's. */
export const EYE_KINDS: ReadonlySet<OrganKind> = new Set<OrganKind>(["eye", "facetEye", "heatEye"]);

/** The head drawing for what a head holds: no brain is a skull, jaws stretch it, mandibles are their own, no eyes is eyeless. */
export function headKindOf(contents: readonly Organ[]): HeadKind {
  const has = (k: OrganKind): boolean => contents.some((o) => o.kind === k);
  const brain = contents.some((o) => isBrainKind(o.kind));
  if (!brain) return "skull";
  if (has("mandibles")) return "mandibles";
  // A jaw grown huge stretches the face as a predator's jaws do (sizes.ts).
  if (contents.some((o) => LONG_JAWS.has(o.kind) || (o.kind === "jaw" && sizeOf(o) === "huge"))) return "long";
  if (!contents.some((o) => EYE_KINDS.has(o.kind)) && !has("blindness")) return "eyeless";
  return "human";
}

/** How a head shows for the direction its neck points: a face, a profile to either side, the back when it hangs down. */
export function headViewOf(d: Dir): { view: HeadView; mirror: boolean } {
  switch (d) {
    case 2:
    case 3:
      return { view: "profile", mirror: false };
    case 5:
    case 6:
      return { view: "profile", mirror: true };
    case 4:
      return { view: "back", mirror: false };
    default:
      return { view: "front", mirror: false };
  }
}

// ---------------------------------------------------------------- validation

type Edge = "top" | "bottom" | "left" | "right";

/**
 * What is wrong with a mask: ragged rows, a role outside the set, a fill
 * pixel against nothing where no joint is declared. `open` names the edges
 * of the mask where the previous or the next piece continues.
 */
export function maskProblems(name: string, m: Mask, open: readonly Edge[]): string[] {
  const out: string[] = [];
  if (m.rows.length !== m.h) out.push(`${name}: ${m.rows.length} rows for height ${m.h}`);
  m.rows.forEach((r, y) => {
    if (r.length !== m.w) out.push(`${name}: row ${y} is ${r.length} wide, not ${m.w}`);
    for (const ch of r) if (!ROLES.includes(ch)) out.push(`${name}: role ${JSON.stringify(ch)} in row ${y}`);
  });
  if (out.length > 0) return out;
  const at = (x: number, y: number): string => {
    if (y < 0) return open.includes("top") ? "," : ".";
    if (y >= m.h) return open.includes("bottom") ? "," : ".";
    if (x < 0) return open.includes("left") ? "," : ".";
    if (x >= m.w) return open.includes("right") ? "," : ".";
    return m.rows[y]![x]!;
  };
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      const ch = at(x, y);
      if (ch === "." || ch === "#" || ch === ",") continue;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        if (at(x + dx, y + dy) === ".") {
          out.push(`${name}: fill ${ch} at (${x}, ${y}) is open to nothing`);
          break;
        }
      }
    }
  }
  return out;
}

function pieceProblems(name: string, p: Piece, open: readonly Edge[]): string[] {
  const out = maskProblems(name, p.mask, open);
  if (p.anchor.x < 0 || p.anchor.y < 0 || p.anchor.x >= p.mask.w || p.anchor.y >= p.mask.h) out.push(`${name}: anchor (${p.anchor.x}, ${p.anchor.y}) outside the mask`);
  return out;
}

/** Every mask of the atlas checked: sizes, roles, closed contours except at declared joints. */
export function validateSprites(): string[] {
  const out: string[] = [];
  for (const [kind, drawn] of Object.entries(SEGMENT_SPRITES) as [LimbKind, Drawn<SegmentSprite>][]) {
    out.push(...pieceProblems(`${kind} s root`, drawn.s.root, ["bottom"]));
    out.push(...pieceProblems(`${kind} s mid`, drawn.s.mid, ["top", "bottom"]));
    out.push(...pieceProblems(`${kind} s end`, drawn.s.end, ["top"]));
    if (drawn.s.root.mask.w !== drawn.s.mid.mask.w || drawn.s.mid.mask.w !== drawn.s.end.mask.w) out.push(`${kind}: the three parts differ in width`);
    if (drawn.s.mid.advance.x !== 0 || drawn.s.mid.advance.y !== drawn.s.mid.mask.h) out.push(`${kind} s mid: advance must be the height of the unit`);
    if (drawn.se !== undefined) {
      // A diagonal band leaves its root cap through the bottom and right edges and runs on through horizontal cuts.
      out.push(...pieceProblems(`${kind} se root`, drawn.se.root, ["bottom", "right"]));
      out.push(...pieceProblems(`${kind} se mid`, drawn.se.mid, ["top", "bottom"]));
      out.push(...pieceProblems(`${kind} se end`, drawn.se.end, ["top"]));
      if (drawn.se.mid.advance.x !== drawn.se.mid.advance.y || drawn.se.mid.advance.x <= 0) out.push(`${kind} se mid: advance must be diagonal`);
    }
  }
  for (const [kind, drawn] of Object.entries(ENDING_SPRITES) as [OrganKind, Drawn<Piece>][]) {
    out.push(...pieceProblems(`${kind} s`, drawn.s, ["top"]));
    if (drawn.s.mask.w !== SPRITE_SIZES.ending || drawn.s.mask.h !== SPRITE_SIZES.ending) out.push(`${kind}: not ${SPRITE_SIZES.ending} square`);
    if (drawn.se !== undefined) out.push(...pieceProblems(`${kind} se`, drawn.se, ["top"]));
  }
  for (const [kind, views] of Object.entries(HEAD_SPRITES) as [HeadKind, Record<HeadView, HeadSprite>][]) {
    for (const [view, h] of Object.entries(views) as [HeadView, HeadSprite][]) {
      out.push(...maskProblems(`head ${kind} ${view}`, h.mask, []));
      if (h.mask.w !== SPRITE_SIZES.head || h.mask.h !== SPRITE_SIZES.head) out.push(`head ${kind} ${view}: not ${SPRITE_SIZES.head} square`);
    }
  }
  for (const [cover, t] of Object.entries(TILES)) {
    if (t.w !== SPRITE_SIZES.tile || t.h !== SPRITE_SIZES.tile) out.push(`tile ${cover}: not ${SPRITE_SIZES.tile} square`);
    t.rows.forEach((r, y) => {
      if (r.length !== t.w) out.push(`tile ${cover}: row ${y} ragged`);
      for (const ch of r) if (!ROLES.includes(ch)) out.push(`tile ${cover}: role ${ch}`);
    });
  }
  return out;
}

/** Bytes of every drawn mask: what the atlas weighs in a built page. */
export function atlasBytes(): number {
  let n = 0;
  const count = (m: Mask): void => {
    for (const r of m.rows) n += r.length + 3;
  };
  for (const drawn of Object.values(SEGMENT_SPRITES)) {
    for (const s of [drawn.s, drawn.se]) {
      if (s === undefined) continue;
      count(s.root.mask);
      count(s.mid.mask);
      count(s.end.mask);
    }
  }
  for (const drawn of Object.values(ENDING_SPRITES)) {
    count(drawn.s.mask);
    if (drawn.se !== undefined) count(drawn.se.mask);
  }
  for (const views of Object.values(HEAD_SPRITES)) for (const h of Object.values(views)) count(h.mask);
  for (const t of Object.values(TILES)) count(t);
  for (const list of Object.values(STAMPS)) for (const st of list) n += st.size * st.size + 3 * st.size;
  return n;
}

export type { CoverId };
