/**
 * The abyss alone: seeds of strikes measured after every strike against every
 * beast (`randomAssembly`). The shape of a body and the beasts themselves are
 * the model's (`packages/core/beasts.ts`, `beasts-measure.ts`); the page and the
 * tests read the results.
 */
import { BEASTS, LabRng, applyMutation, coverTick, drawMutation, features, human, similarity, traitsOf, type Beast, type Body, type Rng, type Shape, MUTATIONS } from "@mutant-engine/core";

// ---------------------------------------------------------------- the abyss alone

/** The abyss of the first layer as the lab draws it: this share of the strikes are defects. */
const ABYSS_DEFECTS = 0.15;

/** One strike of the abyss on the body, drawing exactly as the lab's `mutate` does: the same seed gives the lab's body. */
export function abyssStrike(body: Body, rng: Rng): void {
  const defect = rng.next() < ABYSS_DEFECTS;
  const m = drawMutation(MUTATIONS, rng, { spread: true, decay: true, body, defect });
  if (m !== null) applyMutation(body, m, rng, { spread: true, source: "abyss" });
}

export interface RandomOptions {
  seeds: number;
  strikes: number;
  /** Turns between strikes, during which a cover creeps (one segment per 30); blood, tumours and wandering eyes are not run. Default 30. */
  turnsPerStrike?: number;
}

export interface RandomBeast {
  id: string;
  /** Share of the seeds within tolerance after strike k (index k-1). */
  strict: number[];
  /** Share of the seeds with three quarters of the traits after strike k. */
  loose: number[];
  peakStrict: { strikes: number; share: number };
  peakLoose: { strikes: number; share: number };
  /** Share of the seeds that were within tolerance after some strike. */
  everStrict: number;
  everLoose: number;
  /** Mean over seeds of the best share of traits along the strikes. */
  meanBest: number;
  /** Traits most often missing at the strike of the loose peak, with the share of seeds missing them there. */
  offAtPeak: { key: keyof Shape; share: number }[];
}

interface RandomResult {
  options: RandomOptions;
  ms: number;
  beasts: RandomBeast[];
}

function peak(shares: number[]): { strikes: number; share: number } {
  let best = 0;
  let at = 0;
  shares.forEach((s, i) => {
    if (s > best) {
      best = s;
      at = i + 1;
    }
  });
  return { strikes: at, share: best };
}

/** Seeds 1..N of the abyss from the human, every beast measured after every strike. */
export function randomAssembly(beasts: readonly Beast[] = BEASTS, opts: RandomOptions = { seeds: 2000, strikes: 60 }): RandomResult {
  const t0 = performance.now();
  const turns = opts.turnsPerStrike ?? 30;
  const strictHits = beasts.map(() => new Array<number>(opts.strikes).fill(0));
  const looseHits = beasts.map(() => new Array<number>(opts.strikes).fill(0));
  const everStrict = beasts.map(() => 0);
  const everLoose = beasts.map(() => 0);
  const bestSum = beasts.map(() => 0);
  const offCounts = beasts.map(() => Array.from({ length: opts.strikes }, () => new Map<keyof Shape, number>()));
  const traits = beasts.map((b) => traitsOf(b.want));
  for (let seed = 1; seed <= opts.seeds; seed++) {
    const body = human();
    const rng = new LabRng(seed);
    const best = beasts.map(() => 0);
    const wasStrict = beasts.map(() => false);
    const wasLoose = beasts.map(() => false);
    for (let k = 0; k < opts.strikes; k++) {
      abyssStrike(body, rng);
      if (body.fronts !== undefined && body.fronts.length > 0) for (let t = 0; t < turns; t++) coverTick(body);
      const f = features(body);
      beasts.forEach((b, i) => {
        const s = similarity(b.want, f);
        if (s.strict) {
          strictHits[i]![k]! += 1;
          wasStrict[i] = true;
        }
        if (s.loose) {
          looseHits[i]![k]! += 1;
          wasLoose[i] = true;
        }
        if (s.score > best[i]!) best[i] = s.score;
        const counts = offCounts[i]![k]!;
        for (const key of s.off) if (traits[i]!.includes(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
      });
    }
    beasts.forEach((_, i) => {
      bestSum[i]! += best[i]!;
      if (wasStrict[i]) everStrict[i]! += 1;
      if (wasLoose[i]) everLoose[i]! += 1;
    });
  }
  const n = Math.max(1, opts.seeds);
  const out = beasts.map((b, i): RandomBeast => {
    const strict = strictHits[i]!.map((h) => h / n);
    const loose = looseHits[i]!.map((h) => h / n);
    const peakLoose = peak(loose);
    const at = Math.max(0, (peakLoose.strikes || opts.strikes) - 1);
    const offAtPeak = [...(offCounts[i]![at] ?? new Map<keyof Shape, number>()).entries()]
      .map(([key, c]) => ({ key, share: c / n }))
      .sort((x, y) => y.share - x.share)
      .slice(0, 4);
    return { id: b.id, strict, loose, peakStrict: peak(strict), peakLoose, everStrict: everStrict[i]! / n, everLoose: everLoose[i]! / n, meanBest: bestSum[i]! / n, offAtPeak };
  });
  return { options: opts, ms: performance.now() - t0, beasts: out };
}
