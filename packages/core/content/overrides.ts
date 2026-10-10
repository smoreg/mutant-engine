/**
 * Edits of the catalog accepted in the studio's mutation editor (#4): per row
 * id, what differs from `mutations.ts` - a row switched off, its chance, its
 * tags, its target rule, its text. Written by `npm run studio`, read by
 * `mutations.ts` and `i18n.ts`; edit by hand only as the editor would.
 */
import type { MutationOverride } from "./override.js";

export const MUTATION_OVERRIDES: Readonly<Record<string, MutationOverride>> = {};
