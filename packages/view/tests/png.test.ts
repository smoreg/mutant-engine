import { crc32, inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { human } from "@mutant-engine/core";
import { framePng, framePngUrl, renderPixels } from "../index.js";

/** The PNG's chunks by type, each checked against its CRC by zlib's own crc32. */
function chunks(png: Uint8Array): Map<string, Uint8Array[]> {
  const out = new Map<string, Uint8Array[]>();
  let at = 8;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  while (at < png.length) {
    const len = view.getUint32(at);
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    expect(view.getUint32(at + 8 + len), type).toBe(crc32(png.subarray(at + 4, at + 8 + len)));
    const list = out.get(type) ?? [];
    list.push(png.subarray(at + 8, at + 8 + len));
    out.set(type, list);
    at += 12 + len;
  }
  return out;
}

describe("a pixel frame as one PNG", () => {
  it("decodes back to the frame's own pixels, region and all", () => {
    const f = renderPixels(human(), { seed: 3, t: 0.4 });
    const x0 = 5;
    const y0 = 7;
    const w = f.w - 9;
    const h = f.h - 11;
    const png = framePng(f, x0, y0, w, h);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const c = chunks(png);
    const ihdr = new DataView(c.get("IHDR")![0]!.buffer, c.get("IHDR")![0]!.byteOffset);
    expect([ihdr.getUint32(0), ihdr.getUint32(4)]).toEqual([w, h]);
    expect(c.get("PLTE")![0]!.length).toBe(f.palette.length * 3);
    const raw = inflateSync(Buffer.concat(c.get("IDAT")!));
    expect(raw.length).toBe((w + 1) * h);
    for (let y = 0; y < h; y++) {
      expect(raw[y * (w + 1)]).toBe(0);
      for (let x = 0; x < w; x++) expect(raw[y * (w + 1) + 1 + x]).toBe(f.cells[(y + y0) * f.w + x + x0]);
    }
  });

  it("is far smaller than the frame's bytes and is a data URL", () => {
    const f = renderPixels(human(), { seed: 1, t: 0.4 });
    expect(framePng(f).length).toBeLessThan(f.w * f.h / 4);
    expect(framePngUrl(f)).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/);
  });
});
