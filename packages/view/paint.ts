/**
 * Showing a pixel frame: on a 2D context as runs of rects scaled by a whole
 * number without smoothing (the context is handed in - nothing here knows
 * a page), or as a static svg of rects for a page built ahead of time.
 */
import { PALETTE } from "./stamps.js";
import type { PixelFrame } from "./pixel.js";

/** The part of CanvasRenderingContext2D the painter uses; a recorder in a test fits as well. */
export interface Canvas2D {
  fillStyle: string;
  fillRect(x: number, y: number, w: number, h: number): void;
}

/**
 * Paints the frame with `cell` screen pixels per frame pixel, one rect per
 * run of equal pixels in a row. With `ground` the frame is first filled
 * with that colour.
 */
export function paintFrame(ctx: Canvas2D, f: PixelFrame, cell = 3, ground?: string): void {
  if (ground !== undefined) {
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, f.w * cell, f.h * cell);
  }
  for (let y = 0; y < f.h; y++) {
    let x = 0;
    while (x < f.w) {
      const v = f.cells[y * f.w + x]!;
      let run = 1;
      while (x + run < f.w && f.cells[y * f.w + x + run] === v) run += 1;
      if (v !== 0) {
        const color = PALETTE[v]!.color;
        ctx.fillStyle = color.length === 9 ? `rgba(${parseInt(color.slice(1, 3), 16)},${parseInt(color.slice(3, 5), 16)},${parseInt(color.slice(5, 7), 16)},${(parseInt(color.slice(7, 9), 16) / 255).toFixed(2)})` : color;
        ctx.fillRect(x * cell, y * cell, run * cell, cell);
      }
      x += run;
    }
  }
}
