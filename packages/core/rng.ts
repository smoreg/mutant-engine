/** The only thing the body model needs from a random source. `game.rng` satisfies it. */
export interface Rng {
  /** [0, 1) */
  next(): number;
}

/*
 * The model's own seeded generator: sfc32 over four words, seeded from a number
 * (splitmix32) or a string (cyrb128), the same construction the engine uses,
 * kept here so nothing that plays a mutant carries engine code. `state` is four
 * uint32 words: a step can save it and a later run can resume from it.
 */

export type RngWords = [number, number, number, number];

function splitmix32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    t = t ^ (t >>> 15);
    return t >>> 0;
  };
}

function cyrb128(str: string): RngWords {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

export function seedWords(seed: number | string): RngWords {
  if (typeof seed === "string") return cyrb128(seed);
  const next = splitmix32(seed);
  return [next(), next(), next(), next()];
}

function rotl(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k));
}

export class LabRng implements Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number | string | RngWords) {
    const s = Array.isArray(seed) ? seed : seedWords(seed);
    this.a = s[0];
    this.b = s[1];
    this.c = s[2];
    this.d = s[3];
  }

  get state(): RngWords {
    return [this.a >>> 0, this.b >>> 0, this.c >>> 0, this.d >>> 0];
  }

  set state(s: RngWords) {
    this.a = s[0];
    this.b = s[1];
    this.c = s[2];
    this.d = s[3];
  }

  /** [0, 1) */
  next(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = rotl(this.c, 21);
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  /** [lo, hi] inclusive */
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  /** true with probability p */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** One die: 1..sides. */
  die(sides: number): number {
    return this.int(1, sides);
  }

  /** n dice of `sides`, e.g. roll(2, 6) == 2d6 */
  roll(n: number, sides: number): number {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += this.die(sides);
    return sum;
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error("LabRng.pick: empty array");
    return arr[this.int(0, arr.length - 1)]!;
  }

  /** Fisher-Yates, in place, returns the same array. */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const a = arr[i]!;
      arr[i] = arr[j]!;
      arr[j] = a;
    }
    return arr;
  }

  /** Weighted pick: {orc: 3, troll: 1} -> "orc" 75% of the time. */
  weighted<K extends string>(table: Record<K, number>): K {
    const keys = Object.keys(table) as K[];
    let total = 0;
    for (const k of keys) total += table[k];
    let r = this.next() * total;
    for (const k of keys) {
      r -= table[k];
      if (r <= 0) return k;
    }
    return keys[keys.length - 1]!;
  }

  /** An independent stream: the salt touches every state word, and twelve warm-up draws are thrown away. */
  fork(salt: number): LabRng {
    const [s0, s1, s2, s3] = this.state;
    const [k0, k1, k2, k3] = seedWords(salt);
    const r = new LabRng([s0 ^ k0, s1 ^ k1, s2 ^ k2, s3 ^ k3]);
    for (let i = 0; i < 12; i++) r.next();
    return r;
  }
}

/** An rng that writes every value it hands out into `tape`; the lab reads the draws back from there. */
export function recording(base: Rng, tape: number[]): Rng {
  return {
    next: () => {
      const v = base.next();
      tape.push(v);
      return v;
    },
  };
}
