/**
 * The bestiary's shelves as data: the living gallery's hundred mutants,
 * grown on demand in the browser, and the start that opens any body in the
 * lab as its fixture. The mythic beasts are `packages/core/beasts.ts`; the
 * creatures from the store come from the studio's server. No DOM here.
 */
import { bodyToText, type Body, type Start } from "@mutant-engine/core";
import { growMutant, livingSourceSpec, livingSpecs, type Mutant, type MutantSpec } from "./living/grow.js";

export interface LivingCard {
  index: number;
  spec: MutantSpec;
  sourceRu: string;
  /** Grown on the first call and kept: a hundred bodies are not grown until a card is on screen. */
  mutant: () => Mutant;
  body: () => Body;
}

export function livingShelf(): LivingCard[] {
  return livingSpecs().map((spec, index) => {
    let grown: Mutant | null = null;
    const mutant = (): Mutant => (grown ??= growMutant(spec));
    return { index, spec, sourceRu: livingSourceSpec(spec.source).ru, mutant, body: () => mutant().body };
  });
}

/** Any body as a start of the lab: its fixture text, which replays to the same hash. */
export function textStart(body: Body): Start {
  return { kind: "text", text: bodyToText(body) };
}
