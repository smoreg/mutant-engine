/**
 * The pixel picture of a posed body: the sprites of compose.ts assembled at
 * their own scale, or fitted into a square tile of `px` when one is asked
 * for; and the ways out of the frame - RGBA bytes for an ImageData, crisp
 * rects for a static svg, a comparison of two frames. Nothing here draws on
 * anything.
 */
import type { Body } from "@mutant-engine/core";
import { PALETTE } from "./stamps.js";
import { composeBody, fitFrame, type PixelFrame, type PixelOptions } from "./compose.js";

export type { PixelFrame, PixelOptions } from "./compose.js";

/** The body drawn: at the sprites' scale, or into a `px` square when `px` is given. */
export function renderPixels(body: Body, opts: PixelOptions = {}): PixelFrame {
  const native = composeBody(body, opts);
  return opts.px === undefined ? native : fitFrame(native, opts.px);
}

/** Whether two frames of one size differ in any pixel. */
export function framesDiffer(a: PixelFrame, b: PixelFrame): boolean {
  if (a.w !== b.w || a.h !== b.h) return true;
  for (let i = 0; i < a.cells.length; i++) if (a.cells[i] !== b.cells[i]) return true;
  return false;
}

function rgbaOf(color: string): [number, number, number, number] {
  const hex = color.slice(1);
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const a = hex.length >= 8 ? parseInt(hex.slice(6, 8), 16) : 255;
  return [r, g, b, a];
}

const RGBA = PALETTE.map((p) => rgbaOf(p.color));

/** The frame as RGBA bytes, row-major, for an ImageData of the same size. */
export function frameRgba(f: PixelFrame, out?: Uint8ClampedArray): Uint8ClampedArray {
  const buf = out ?? new Uint8ClampedArray(f.w * f.h * 4);
  for (let i = 0; i < f.cells.length; i++) {
    const [r, g, b, a] = RGBA[f.cells[i]!]!;
    buf[i * 4] = r;
    buf[i * 4 + 1] = g;
    buf[i * 4 + 2] = b;
    buf[i * 4 + 3] = a;
  }
  return buf;
}

/** The frame as crisp rects, one per run of equal pixels in a row, `cell` screen pixels each. */
export function frameSvg(f: PixelFrame, cell = 3): string {
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${f.w * cell}" height="${f.h * cell}" viewBox="0 0 ${f.w} ${f.h}" shape-rendering="crispEdges" class="pixels">`];
  for (let y = 0; y < f.h; y++) {
    let x = 0;
    while (x < f.w) {
      const v = f.cells[y * f.w + x]!;
      let run = 1;
      while (x + run < f.w && f.cells[y * f.w + x + run] === v) run += 1;
      if (v !== 0) {
        const color = PALETTE[v]!.color;
        const opaque = color.length === 7 ? color : color.slice(0, 7);
        const alpha = color.length === 9 ? ` fill-opacity="${(parseInt(color.slice(7, 9), 16) / 255).toFixed(2)}"` : "";
        parts.push(`<rect x="${x}" y="${y}" width="${run}" height="1" fill="${opaque}"${alpha}/>`);
      }
      x += run;
    }
  }
  parts.push("</svg>");
  return parts.join("");
}
