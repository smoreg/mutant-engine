/**
 * The mutation editor's side on the server (#4): an edit set is checked the
 * way the catalog is checked (`checkMutations`, every edited row applied to a
 * human) and, when sound, written as `packages/core/content/overrides.ts`. The file is
 * text a reviewer reads: rows by id, sorted, one JSON object. No DOM; the
 * writing itself is the caller's, so the tests use a temporary path.
 */
import {
  applyMutation,
  human,
  type Body,
  BASE_MUTATION_TEXT,
  type Text,
  BASE_MUTATIONS,
  checkMutations,
  applyOverride,
  applyTextOverride,
  pruneOverride,
  type MutationOverride,
  LabRng,
} from "@mutant-engine/core";

export type Overrides = Record<string, MutationOverride>;

const HEAD = `/**
 * Edits of the catalog accepted in the studio's mutation editor (#4): per row
 * id, what differs from \`mutations.ts\` - a row switched off, its chance, its
 * tags, its target rule, its text. Written by \`npm run studio\`, read by
 * \`mutations.ts\` and \`i18n.ts\`; edit by hand only as the editor would.
 */
import type { MutationOverride } from "./override.js";

export const MUTATION_OVERRIDES: Readonly<Record<string, MutationOverride>> = `;

/** Only what differs from the row, rows by id: the same edits always make the same file. */
export function normalize(o: Overrides): Overrides {
  const out: Overrides = {};
  for (const id of Object.keys(o).sort()) {
    const base = BASE_MUTATIONS.find((m) => m.id === id);
    if (base === undefined) {
      out[id] = o[id]!;
      continue;
    }
    const p = pruneOverride(base, BASE_MUTATION_TEXT[base.i18n], o[id]!);
    if (p !== undefined) out[id] = p;
  }
  return out;
}

export function overridesSource(o: Overrides): string {
  return `${HEAD}${JSON.stringify(normalize(o), null, 2)};\n`;
}

/** The edits back out of the file's text; null when it is not the editor's file. */
export function parseOverridesSource(text: string): Overrides | null {
  const at = text.indexOf("MUTATION_OVERRIDES: Readonly<Record<string, MutationOverride>> = ");
  if (at < 0) return null;
  const json = text.slice(text.indexOf("=", at) + 1).trim().replace(/;\s*$/, "");
  try {
    return JSON.parse(json) as Overrides;
  } catch {
    return null;
  }
}

/** What is wrong with an edit set: an unknown row, a catalog that no longer checks, a row that throws on a human. */
export function overrideProblems(o: Overrides): string[] {
  const problems: string[] = [];
  for (const id of Object.keys(o)) if (!BASE_MUTATIONS.some((m) => m.id === id)) problems.push(`${id}: no such row in the catalog`);
  for (const [id, e] of Object.entries(o)) {
    if (e.chance !== undefined && !(Number.isFinite(e.chance) && e.chance > 0)) problems.push(`${id}: chance ${String(e.chance)} is not above 0`);
    if (e.target !== undefined && (typeof e.target !== "object" || e.target === null || Array.isArray(e.target))) problems.push(`${id}: the target rule is not an object`);
    if (e.ru !== undefined && e.ru.trim() === "") problems.push(`${id}: empty ru`);
    if (e.en !== undefined && e.en.trim() === "") problems.push(`${id}: empty en`);
  }
  if (problems.length > 0) return problems;
  const catalog = BASE_MUTATIONS.map((m) => applyOverride(m, o[m.id]));
  const text: Record<string, Text> = Object.fromEntries(Object.entries(BASE_MUTATION_TEXT).map(([k, t]) => [k, applyTextOverride(t, o[k.replace(/^mutation\./, "")])]));
  problems.push(...checkMutations(catalog, text));
  for (const m of catalog) {
    if (o[m.id] === undefined) continue;
    try {
      const b: Body = human(1000);
      applyMutation(b, m, new LabRng(`edit-${m.id}`), { spread: true });
    } catch (e) {
      problems.push(`${m.id}: breaks on a human: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return problems;
}

interface OverridesAnswer {
  status: number;
  json: unknown;
}

/** `/api/overrides`: GET the accepted edits, PUT a new set - checked, then written by `write`. */
export function overridesRoute(method: string, body: unknown, current: () => Overrides, write: (text: string) => void): OverridesAnswer {
  if (method === "GET") return { status: 200, json: { overrides: current() } };
  if (method !== "PUT") return { status: 405, json: { error: "GET or PUT" } };
  const o = (body as { overrides?: unknown } | undefined)?.overrides;
  if (typeof o !== "object" || o === null || Array.isArray(o)) return { status: 400, json: { problems: ["no overrides object"] } };
  const problems = overrideProblems(o as Overrides);
  if (problems.length > 0) return { status: 400, json: { problems } };
  const text = overridesSource(o as Overrides);
  write(text);
  return { status: 200, json: { overrides: normalize(o as Overrides) } };
}
