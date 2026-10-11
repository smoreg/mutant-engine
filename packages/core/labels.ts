/** Optional display helpers. Mechanics use ids and never select a language. */
import { MUTATION_ABOUT, MUTATION_TEXT } from "./content/i18n.js";
import { COVERS, ORGANS, SEGMENT_KINDS } from "./parts.js";
import type { CoverId, OrganKind, SegmentKind } from "./graph.js";

export type Locale = "en" | "ru";

/** Unknown ids remain visible instead of silently disappearing from a UI. */
export function mutationLabel(id: string, locale: Locale = "en"): string {
  return MUTATION_TEXT[`mutation.${id}`]?.[locale] ?? id;
}

export function mutationDescription(id: string, locale: Locale = "en"): string {
  return MUTATION_ABOUT[`mutation.${id}`]?.[locale] ?? "";
}

/** English part names follow the public identifiers; games may supply their own terminology. */
function englishId(id: string): string {
  return id.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

export function organKindLabel(kind: OrganKind, locale: Locale = "en"): string {
  return locale === "ru" ? ORGANS[kind].ru : englishId(kind);
}
export function segmentLabel(kind: SegmentKind, locale: Locale = "en"): string {
  return locale === "ru" ? SEGMENT_KINDS[kind].ru : englishId(kind);
}
export function coverLabel(kind: CoverId, locale: Locale = "en"): string {
  return locale === "ru" ? COVERS[kind].ru : englishId(kind);
}
