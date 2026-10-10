/**
 * The pixel picture of a body: stamps for every organ kind, a ramp for every
 * cover, frames of the human and of random bodies fitted into 96 and 128 px
 * tiles. What the tileset asks of a creature - 1 px outline, three tones,
 * light from the top left, a shadow under the feet - is checked where it can
 * be counted; the sprites themselves are checked in sprites.test.ts.
 */
import { describe, expect, it } from "vitest";
import { COVERS, ORGANS, human, swampMutant, type CoverId, type OrganKind, MUTATIONS } from "@mutant-engine/core";
import {
  layout,
  paintFrame,
  type Canvas2D,
  frameRgba,
  frameSvg,
  framesDiffer,
  renderPixels,
  type PixelFrame,
  pose,
  PALETTE,
  RAMPS,
  STAMPS,
  VISUALS,
  hiddenVisuals,
  mutationVisual,
  stampFor,
  type Stamp,
} from "../index.js";
import { population } from "../../core/tests/gen.js";

const OUTLINE = PALETTE.findIndex((p) => p.name === "outline");

function filled(f: PixelFrame): number {
  let n = 0;
  for (const c of f.cells) if (c !== 0) n += 1;
  return n;
}

function count(f: PixelFrame, index: number): number {
  let n = 0;
  for (const c of f.cells) if (c === index) n += 1;
  return n;
}

describe("stamps", () => {
  it("are well-formed: 8, 12 or 16 square, one char per pixel, only known roles", () => {
    const roles = new Set(".#123wkfygb");
    let n = 0;
    for (const [name, variants] of Object.entries(STAMPS)) {
      expect(variants.length, name).toBeGreaterThan(0);
      for (const s of variants as Stamp[]) {
        expect([8, 12, 16], `${name} size ${s.size}`).toContain(s.size);
        expect(s.rows, `${name} ${s.size} rows`).toHaveLength(s.size);
        for (const row of s.rows) {
          expect(row, `${name} ${s.size} row width`).toHaveLength(s.size);
          for (const ch of row) expect(roles.has(ch), `${name}: role ${ch}`).toBe(true);
        }
        n += 1;
      }
    }
    expect(n).toBeGreaterThan(60);
    expect(stampFor("eye", 8).size).toBe(8);
    expect(stampFor("eye", 12).size).toBe(12);
    expect(stampFor("eye", 16).size).toBe(16);
    expect(stampFor("eye", 10).size).toBe(8);
  });

  it("every organ kind and every cover has a visual record; the hidden ones are few and each says why", () => {
    for (const kind of Object.keys(ORGANS) as OrganKind[]) {
      const v = VISUALS[kind];
      expect(v, kind).toBeDefined();
      if (v.hidden !== undefined) expect(v.hidden.length, kind).toBeGreaterThan(5);
      else expect(STAMPS[v.stamp], `${kind}: stamp ${v.stamp}`).toBeDefined();
    }
    const hidden = hiddenVisuals();
    expect(hidden.length).toBeLessThanOrEqual(6);
    for (const h of hidden) expect(h.reason.length).toBeGreaterThan(5);
    for (const c of Object.keys(COVERS) as CoverId[]) expect(RAMPS[c], c).toBeDefined();
  });

  it("every mutation of the catalog is either structural or the visual of its organ", () => {
    let structural = 0;
    let organ = 0;
    let hidden = 0;
    for (const m of MUTATIONS) {
      const v = mutationVisual(m);
      if (v.kind === "structural") structural += 1;
      else if (v.kind === "organ") organ += 1;
      else hidden += 1;
    }
    expect(structural + organ + hidden).toBe(MUTATIONS.length);
    expect(structural).toBeGreaterThan(40);
    expect(organ).toBeGreaterThan(180);
    expect(hidden).toBeLessThanOrEqual(6);
  });

  it("the palette is small and every ramp points into it", () => {
    expect(PALETTE.length).toBeLessThanOrEqual(36);
    expect(PALETTE[0]!.name).toBe("empty");
    expect(OUTLINE).toBeGreaterThan(0);
    for (const [name, r] of Object.entries(RAMPS)) {
      for (const i of [r.dark, r.base, r.light]) expect(i, `${name}`).toBeLessThan(PALETTE.length);
    }
  });
});

describe("pixel frame", () => {
  it("of the human is 96 x 96, deterministic, outlined, shadowed, inside the frame", () => {
    const b = human();
    const a = renderPixels(b, { px: 96, seed: 1, t: 0 });
    const c = renderPixels(b, { px: 96, seed: 1, t: 0 });
    expect(a.w).toBe(96);
    expect(a.h).toBe(96);
    expect(a.cells).toEqual(c.cells);
    expect(filled(a)).toBeGreaterThan(600);
    expect(count(a, OUTLINE)).toBeGreaterThan(80);
    // Every filled pixel next to an empty one is outline: the silhouette is closed.
    let open = 0;
    for (let y = 0; y < a.h; y++) {
      for (let x = 0; x < a.w; x++) {
        const v = a.cells[y * a.w + x]!;
        if (v === 0 || v === OUTLINE || PALETTE[v]!.name === "shadow") continue;
        const near = [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
        ];
        for (const [nx, ny] of near) {
          if (nx! < 0 || ny! < 0 || nx! >= a.w || ny! >= a.h) continue;
          const u = a.cells[ny! * a.w + nx!]!;
          if (u === 0 || PALETTE[u]!.name === "shadow") open += 1;
        }
      }
    }
    expect(open).toBe(0);
    expect(count(a, PALETTE.findIndex((p) => p.name === "shadow"))).toBeGreaterThan(10);
    // The border row and column stay empty: nothing is clipped.
    for (let i = 0; i < a.w; i++) {
      expect(a.cells[i]).toBe(0);
      expect(a.cells[(a.h - 1) * a.w + i]).toBe(0);
      expect(a.cells[i * a.w]).toBe(0);
      expect(a.cells[i * a.w + a.w - 1]).toBe(0);
    }
  });

  it("uses at most 14 colours on the human and shows its eyes, skin light and shade", () => {
    const f = renderPixels(human(), { px: 96, seed: 1, t: 0 });
    const used = new Set<number>();
    for (const c of f.cells) if (c !== 0) used.add(c);
    expect(used.size).toBeLessThanOrEqual(14);
    const name = (n: string) => PALETTE.findIndex((p) => p.name === n);
    expect(used.has(name("white"))).toBe(true);
    expect(used.has(RAMPS.skin.light)).toBe(true);
    expect(used.has(RAMPS.skin.base)).toBe(true);
    expect(used.has(RAMPS.skin.dark)).toBe(true);
    // Your brain is amber on the x-ray only: from outside a head is a head.
    expect(used.has(name("amber"))).toBe(false);
    const xray = renderPixels(human(), { px: 96, seed: 1, t: 0, insides: true });
    expect(xray.cells.includes(name("amber"))).toBe(true);
  });

  // Every mutation changing the picture is checked in sprites.test.ts.

  it("renders 200 random bodies and the swamp mutant at 96 and 128 without leaving the frame or the palette", () => {
    for (const [i, b] of [...population(200), swampMutant()].entries()) {
      for (const px of [96, 128] as const) {
        const f = renderPixels(b, { px, seed: i, t: 0.5 });
        expect(f.w).toBe(px);
        expect(filled(f), `body ${i} at ${px}`).toBeGreaterThan(100);
        for (const c of f.cells) expect(c).toBeLessThan(PALETTE.length);
      }
    }
  });

  it("moves: two frames of the swamp mutant half a second apart differ", () => {
    const b = swampMutant();
    const l = layout(b, { scale: "sqrt" });
    const a = renderPixels(b, { px: 96, seed: 3, layout: l, pose: pose(b, l, 0, 3) });
    const c = renderPixels(b, { px: 96, seed: 3, layout: l, pose: pose(b, l, 0.5, 3) });
    expect(framesDiffer(a, c)).toBe(true);
  });

  it("paints into a 2D context as runs of rects and into an svg of rects, and into rgba", () => {
    const f = renderPixels(human(), { px: 96, seed: 1, t: 0 });
    const rects: number[][] = [];
    const ctx: Canvas2D = {
      fillStyle: "",
      fillRect: (x, y, w, h) => {
        rects.push([x, y, w, h]);
      },
    };
    paintFrame(ctx, f, 3);
    expect(rects.length).toBeGreaterThan(200);
    for (const [x, y, w, h] of rects) {
      expect(Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(w) && Number.isInteger(h)).toBe(true);
      expect(h).toBe(3);
      expect(x! + w!).toBeLessThanOrEqual(96 * 3);
    }
    const svg = frameSvg(f, 3);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg).toContain("#0b0a09");
    expect(svg.length).toBeLessThan(120_000);
    const rgba = frameRgba(f);
    expect(rgba).toHaveLength(96 * 96 * 4);
    expect(rgba[3]).toBe(0);
    let opaque = 0;
    for (let i = 3; i < rgba.length; i += 4) if (rgba[i]! > 0) opaque += 1;
    expect(opaque).toBe(filled(f));
  });

  // "a body of many parts still renders in under 8 ms a frame on average" moved to packages/view/bench/pixel.test.ts (D.2).
});
