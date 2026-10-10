/**
 * A pixel frame as one PNG, so a page draws a sprite as one image and not as
 * a rect per run of pixels (a mutated body was ten thousand DOM nodes). Pure
 * bytes and nothing drawn on: the same string is built in a browser, in a
 * worker and in node.
 *
 * The PNG is indexed (one byte a pixel, the frame's own palette with its
 * alpha) and deflated with the fixed Huffman code and back-references to the
 * pixel on the left and the pixel above - a sprite is long runs and rows that
 * repeat, which is all this needs to be small.
 */

/** What a PNG needs of a frame: its size, its palette indices and its palette. */
export interface IndexedPixels {
  w: number;
  h: number;
  cells: Uint8Array;
  palette: readonly { color: string }[];
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array, from: number, to: number): number {
  let c = 0xffffffff;
  for (let i = from; i < to; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]!) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** Bits written least significant first, as deflate packs them. */
class Bits {
  private buf: number[] = [];
  private acc = 0;
  private n = 0;
  put(value: number, count: number): void {
    for (let i = 0; i < count; i++) {
      this.acc |= ((value >>> i) & 1) << this.n;
      if (++this.n === 8) this.flush();
    }
  }
  /** A Huffman code goes most significant bit first. */
  code(value: number, count: number): void {
    for (let i = count - 1; i >= 0; i--) this.put((value >>> i) & 1, 1);
  }
  private flush(): void {
    this.buf.push(this.acc);
    this.acc = 0;
    this.n = 0;
  }
  bytes(): number[] {
    if (this.n > 0) this.flush();
    return this.buf;
  }
}

const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];

function symbol(out: Bits, s: number): void {
  if (s < 144) out.code(0x30 + s, 8);
  else if (s < 256) out.code(0x190 + s - 144, 9);
  else if (s < 280) out.code(s - 256, 7);
  else out.code(0xc0 + s - 280, 8);
}

function lastBelow(table: number[], v: number): number {
  let i = 0;
  while (i + 1 < table.length && table[i + 1]! <= v) i++;
  return i;
}

/** Raw deflate, one fixed-Huffman block; matches only at distance 1 and `stride`. */
function deflate(data: Uint8Array, stride: number): number[] {
  const out = new Bits();
  out.put(1, 1);
  out.put(1, 2);
  let i = 0;
  while (i < data.length) {
    let best = 0;
    let dist = 0;
    for (const d of stride > 1 ? [1, stride] : [1]) {
      if (i < d) continue;
      let n = 0;
      while (n < 258 && i + n < data.length && data[i + n] === data[i + n - d]) n++;
      if (n > best) {
        best = n;
        dist = d;
      }
    }
    if (best < 3) {
      symbol(out, data[i]!);
      i++;
      continue;
    }
    const li = lastBelow(LEN_BASE, best);
    symbol(out, 257 + li);
    out.put(best - LEN_BASE[li]!, LEN_EXTRA[li]!);
    const di = lastBelow(DIST_BASE, dist);
    out.code(di, 5);
    out.put(dist - DIST_BASE[di]!, DIST_EXTRA[di]!);
    i += best;
  }
  symbol(out, 256);
  return out.bytes();
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    s += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + (b === undefined ? "=" : B64[(n >> 6) & 63]!) + (c === undefined ? "=" : B64[n & 63]!);
  }
  return s;
}

function hexByte(color: string, at: number): number {
  return parseInt(color.slice(at, at + 2), 16);
}

/** The region `x0, y0, w, h` of a frame as PNG bytes. */
export function framePng(f: IndexedPixels, x0 = 0, y0 = 0, w = f.w, h = f.h): Uint8Array {
  const chunks: number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const chunk = (type: string, body: ArrayLike<number>): void => {
    const len = body.length;
    const bytes = new Uint8Array(len + 4);
    for (let i = 0; i < 4; i++) bytes[i] = type.charCodeAt(i);
    for (let i = 0; i < len; i++) bytes[4 + i] = body[i]!;
    chunks.push((len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255);
    for (const b of bytes) chunks.push(b);
    const c = crc32(bytes, 0, bytes.length);
    chunks.push((c >>> 24) & 255, (c >>> 16) & 255, (c >>> 8) & 255, c & 255);
  };
  const be = (n: number): number[] => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  chunk("IHDR", [...be(w), ...be(h), 8, 3, 0, 0, 0]);
  const plte: number[] = [];
  const trns: number[] = [];
  for (const p of f.palette) {
    plte.push(hexByte(p.color, 1), hexByte(p.color, 3), hexByte(p.color, 5));
    trns.push(p.color.length >= 9 ? hexByte(p.color, 7) : 255);
  }
  chunk("PLTE", plte);
  chunk("tRNS", trns);
  // Every row starts with filter 0, then its palette indices; outside the frame is index 0.
  const stride = w + 1;
  const raw = new Uint8Array(stride * h);
  for (let y = 0; y < h; y++) {
    const fy = y0 + y;
    if (fy < 0 || fy >= f.h) continue;
    for (let x = 0; x < w; x++) {
      const fx = x0 + x;
      if (fx >= 0 && fx < f.w) raw[y * stride + 1 + x] = f.cells[fy * f.w + fx]!;
    }
  }
  const z = [0x78, 0x01].concat(deflate(raw, stride), be(adler32(raw)));
  chunk("IDAT", z);
  chunk("IEND", []);
  return Uint8Array.from(chunks);
}

/** The region as a `data:image/png` URL. */
export function framePngUrl(f: IndexedPixels, x0 = 0, y0 = 0, w = f.w, h = f.h): string {
  return `data:image/png;base64,${base64(framePng(f, x0, y0, w, h))}`;
}

/**
 * The region as an svg of one crisp `<image>`, in the frame's own pixel units
 * (the viewBox is the region), `cell` screen pixels a pixel.
 */
export function pixelImageSvg(f: IndexedPixels, cell: number, cls: string, x0 = 0, y0 = 0, w = f.w, h = f.h): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w * cell}" height="${h * cell}" viewBox="${x0} ${y0} ${w} ${h}" class="${cls}">` +
    `<image x="${x0}" y="${y0}" width="${w}" height="${h}" preserveAspectRatio="none" image-rendering="optimizeSpeed" style="image-rendering:-webkit-optimize-contrast;image-rendering:pixelated" href="${framePngUrl(f, x0, y0, w, h)}"/>` +
    `</svg>`
  );
}
