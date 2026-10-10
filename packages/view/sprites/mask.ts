/**
 * The record of one drawn mask and of one piece of a part, and nothing that
 * reads them: the data files import this leaf, the atlas imports the data.
 */
import type { Point } from "../layout.js";

export interface Mask {
  w: number;
  h: number;
  rows: string[];
}

/** A mask from its rows; the width is the first row's. */
export function mask(...rows: string[]): Mask {
  return { w: rows[0]?.length ?? 0, h: rows.length, rows };
}

/** Roles a mask may use; see sprites.ts. */
export const ROLES = ".#123,wkfygbn";

/** One drawn piece: where it hangs from and where the next piece (or the far node) goes, in mask pixels. */
export interface Piece {
  mask: Mask;
  anchor: Point;
  advance: Point;
  /** Which side of the part, as it points, the lamp lights in this drawing: the light role `3` sits there. */
  lit: "left" | "right";
  /** The way the piece extends from the row it joins the previous piece on: down as drawn, turned with the mask. */
  edge: Point;
}

export interface SegmentSprite {
  root: Piece;
  mid: Piece;
  end: Piece;
}

/** The drawings of a part: down, and down-right when drawn by hand. */
export interface Drawn<T> {
  s: T;
  se?: T;
}

export const piece = (rows: string[], anchor: [number, number], advance: [number, number], lit: "left" | "right" = "right"): Piece => ({
  mask: mask(...rows),
  anchor: { x: anchor[0], y: anchor[1] },
  advance: { x: advance[0], y: advance[1] },
  lit,
  edge: { x: 0, y: 1 },
});

/** A part pointing down: root anchored at its joint, middle a band of rows, end whose far node is `far` from its start. */
export const partS = (root: string[], rootAnchor: [number, number], mid: string[], end: string[], far: [number, number]): SegmentSprite => ({
  root: piece(root, rootAnchor, [0, root.length - rootAnchor[1]]),
  mid: piece(mid, [Math.floor((mid[0]?.length ?? 16) / 2), 0], [0, mid.length]),
  end: piece(end, [Math.floor((end[0]?.length ?? 16) / 2), 0], far),
});

/** A part pointing down-right: pieces drawn as diagonal bands, the middle advancing by (d, d). */
export const partSE = (root: string[], rootAnchor: [number, number], rootAdvance: [number, number], mid: string[], midAdvance: number, end: string[], endAnchor: [number, number], far: [number, number]): SegmentSprite => ({
  root: piece(root, rootAnchor, rootAdvance, "left"),
  // The middle hangs from the centre of its first row; the end from the same point of its own.
  mid: piece(mid, [endAnchor[0], 0], [midAdvance, midAdvance], "left"),
  end: piece(end, endAnchor, far, "left"),
});

export type HeadKind = "human" | "long" | "skull" | "eyeless" | "mandibles";
export type HeadView = "front" | "profile" | "back";

export interface HeadSprite {
  mask: Mask;
  /** The centre of the mask sits on the node; the slots are offsets from the top-left corner. */
  eyes: Point[];
  mouth?: Point;
  nose?: Point;
  ears: Point[];
  brain: Point;
  /** Slots around the head for organs shown outside it, top first. */
  around: Point[];
}
