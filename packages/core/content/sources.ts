/**
 * Where a mutation comes from, as data: the sources table of
 * docs/mutations.md. A source is a share of defects and a filter over
 * families, and nothing else - only the abyss changes the model's own weights.
 *
 * These rows started in `tools/lab/commands.ts`, because the lab was the only
 * thing that drew from them. The game draws from them too, and `src/`
 * cannot import `tools/`, so the table moved here and the lab reads it back
 * (decision 382). Pure data, no DOM.
 */
import type { Family } from "../parts.js";

/**
 * The six sources. `id` is a row of the catalog named by hand rather than
 * drawn: it rolls nothing and filters nothing.
 */
export type Source = "abyss" | "meat" | "tumour" | "spring" | "vaccine" | "id";

export interface SourceSpec {
  id: Source;
  ru: string;
  en: string;
  /** Share of defects among the draws; null for a mutation named by id. */
  defects: number | null;
  /** Families the source never gives. */
  never: Family[];
  /** The source asks for a family. */
  family: boolean;
  /** The plan decays with the load (step I): the abyss, the tumour and the meat; the spring and the graft are by hand. */
  decay: boolean;
  /** The source heals (step J): the needs of the body pull x 1.5 harder - the spring and the graft. */
  heal: boolean;
}

/** The sources of mutations.md as the lab reads them: a share of defects (the abyss of the first layer 15 %, step I), families barred, a family asked for. */
export const SOURCES: readonly SourceSpec[] = [
  { id: "abyss", ru: "удар бездны", en: "a blow of the abyss", defects: 0.15, never: [], family: false, decay: true, heal: false },
  { id: "meat", ru: "мясо твари", en: "the meat of a beast", defects: 0.15, never: [], family: false, decay: true, heal: false },
  { id: "tumour", ru: "созревшая опухоль", en: "a ripened tumour", defects: 0.3, never: [], family: false, decay: true, heal: false },
  { id: "spring", ru: "родник", en: "the spring", defects: 0, never: ["defects", "parasites"], family: false, decay: false, heal: true },
  { id: "vaccine", ru: "прививка риппера", en: "a ripper's graft", defects: 0.1, never: [], family: true, decay: false, heal: true },
  { id: "id", ru: "мутация по id", en: "a mutation by id", defects: null, never: [], family: false, decay: false, heal: false },
];

export function sourceSpec(id: Source): SourceSpec {
  return SOURCES.find((s) => s.id === id) ?? SOURCES[0]!;
}
