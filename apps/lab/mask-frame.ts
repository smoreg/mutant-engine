/**
 * A drawn mask as a small pixel frame: the roles of a mask resolved in a
 * ramp and the palette. The sprite sheet and the parts tab draw with it.
 */
import { PALETTE, type Mask, type PixelFrame, type Ramp, type Sheet } from "@mutant-engine/view";

const OUTLINE = PALETTE.findIndex((p) => p.name === "outline");
const WHITE = PALETTE.findIndex((p) => p.name === "white");
const FLESH = PALETTE.findIndex((p) => p.name === "flesh");
const AMBER = PALETTE.findIndex((p) => p.name === "amber");
const BIO = PALETTE.findIndex((p) => p.name === "bio");
const BILE = PALETTE.findIndex((p) => p.name === "bile");
const BONE = PALETTE.findIndex((p) => p.name === "bone");

function role(ch: string, ramp: Ramp): number {
  switch (ch) {
    case "#":
    case "k":
      return OUTLINE;
    case "1":
      return ramp.dark;
    case "2":
    case ",":
      return ramp.base;
    case "3":
      return ramp.light;
    case "w":
      return WHITE;
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

export function frameOf(s: Sheet): PixelFrame {
  return { ...s, palette: PALETTE, ppu: 24, ox: 0, oy: 0 };
}

/** A mask as a small frame with one pixel of room around it. */
export function maskFrame(m: Mask, ramp: Ramp): PixelFrame {
  const w = m.w + 2;
  const h = m.h + 2;
  const cells = new Uint8Array(w * h);
  m.rows.forEach((r, y) => [...r].forEach((ch, x) => (cells[(y + 1) * w + x + 1] = role(ch, ramp))));
  return frameOf({ w, h, cells });
}

/** An 8 x 8 cover tile repeated over a 24 x 24 patch of the segment's base tone. */
export function tilePatch(m: Mask): Mask {
  return { w: 24, h: 24, rows: Array.from({ length: 24 }, (_, y) => Array.from({ length: 24 }, (_, x) => (m.rows[y % 8]![x % 8] === "." ? "2" : m.rows[y % 8]![x % 8])).join("")) };
}
