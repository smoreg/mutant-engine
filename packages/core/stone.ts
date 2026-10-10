/**
 * A mutation landed on a kept body and paid for out of its reserve: the rows a
 * source draws from, the draw itself, and the flesh it brings paid down to
 * empty. What grows is drawn and landed by `mutation.ts` out of the catalog
 * the caller hands in, and the price is `MutationResult.reserve`, spent through
 * `spend` of the damage track and never written into the record by hand
 * (decisions 528, 915). A mutation that finds no room at all is lost: that is
 * the abyss of docs/body-graph.md, not a refusal.
 */
import type { SourceSpec } from "./content/sources.js";
import { spend, stable as carryHarm } from "./damage.js";
import type { Kept } from "./keep.js";
import { applyMutation, drawMutation, type DrawOptions, type Mutation, type MutationContext, type MutationResult } from "./mutation.js";
import type { Body } from "./graph.js";
import type { Rng } from "./rng.js";

/** The rows a source draws from: the families it never gives are out, and a named row is the only one left. */
export function sourceRows(spec: SourceSpec, catalog: readonly Mutation[], row: string | null): readonly Mutation[] {
  if (row !== null) return catalog.filter((m) => m.id === row);
  return spec.never.length === 0 ? catalog : catalog.filter((m) => !spec.never.includes(m.family));
}

export interface Landed {
  /** Null when nothing found room. */
  result: MutationResult | null;
  /** Reserve the new flesh actually cost, which is never more than there was. */
  paid: number;
  /**
   * What the flesh was worth and the reserve could not pay (decision 915). It
   * is a number to show and not a debt to collect: the body is empty and the
   * next evening finds it hungry, which is the whole of the price.
   */
  owed: number;
}

/**
 * Lands one drawn row on the body, wounds following the flesh, and pays for it
 * down to empty and never into debt (decision 915).
 */
export function landMutation(k: Kept, m: Mutation, rng: Rng, ctx?: MutationContext): Landed {
  const result = carryHarm(k.body, k.harm, () => applyMutation(k.body, m, rng, ctx));
  const price = result?.reserve ?? 0;
  const paid = Math.min(price, Math.max(0, k.harm.reserve));
  spend(k.harm, price);
  return { result, paid, owed: price - paid };
}

/**
 * How a source draws, read off `SourceSpec` and nothing else: the families it
 * never gives are filtered out of the catalog, the share of defects is rolled
 * here, `decay` and `heal` are passed through. The same convention the lab uses
 * (`history.ts`), because there is only one sources table.
 */
function drawFrom(spec: SourceSpec, body: Body, catalog: readonly Mutation[], rng: Rng): Mutation | null {
  const rows = spec.never.length === 0 ? catalog : catalog.filter((m) => !spec.never.includes(m.family));
  if (rows.length === 0) return null;
  const opts: DrawOptions = { body, decay: spec.decay, heal: spec.heal };
  if (spec.defects !== null) opts.defect = spec.defects > 0 && rng.next() < spec.defects;
  return drawMutation(rows, rng, opts);
}

/**
 * A source's mutation lands: drawn over the body, planted through
 * `applyMutation` inside `carryHarm` so the wounds follow the flesh, and paid
 * for out of the reserve. The id of the row that grew, or null when nothing
 * was drawn or nothing found room.
 */
export function plantFrom(k: Kept, spec: SourceSpec, catalog: readonly Mutation[], rng: Rng): string | null {
  const m = drawFrom(spec, k.body, catalog, rng);
  if (m === null) return null;
  const result = carryHarm(k.body, k.harm, () => applyMutation(k.body, m, rng, {}));
  if (result === null) return null;
  spend(k.harm, result.reserve);
  return m.id;
}
