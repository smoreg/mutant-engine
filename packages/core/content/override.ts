/**
 * What an edit of a catalog row may change, and how it lands on the row: a
 * row switched off is never drawn by any source (it can still be placed by
 * hand), a chance, tags, a target rule and the text replace the row's own.
 * The operation and the payload stay code: a new kind of effect is a case in
 * the model, not an edit. Pure data, no DOM.
 */
import type { Mutation, MutationTag, TargetRule } from "../mutation.js";
import type { Text } from "./i18n.js";

export interface MutationOverride {
  /** Switched off: no source draws it, the generator and the bots never meet it. */
  disabled?: boolean;
  chance?: number;
  tags?: MutationTag[];
  target?: TargetRule;
  ru?: string;
  en?: string;
}

export function applyOverride(m: Mutation, o: MutationOverride | undefined): Mutation {
  if (o === undefined) return m;
  const out: Mutation = { ...m };
  if (o.chance !== undefined) out.chance = o.chance;
  if (o.tags !== undefined) out.tags = [...o.tags];
  if (o.target !== undefined) out.target = structuredClone(o.target);
  return out;
}

export function applyTextOverride(text: Text, o: MutationOverride | undefined): Text {
  if (o === undefined || (o.ru === undefined && o.en === undefined)) return text;
  return { ru: o.ru ?? text.ru, en: o.en ?? text.en };
}

/** An edit that changes nothing is no edit: the fields equal to the row's own go, and an empty edit goes. */
export function pruneOverride(base: Mutation, text: Text | undefined, o: MutationOverride): MutationOverride | undefined {
  const out: MutationOverride = {};
  if (o.disabled === true) out.disabled = true;
  if (o.chance !== undefined && o.chance !== base.chance) out.chance = o.chance;
  if (o.tags !== undefined && JSON.stringify([...o.tags].sort()) !== JSON.stringify([...base.tags].sort())) out.tags = [...o.tags];
  if (o.target !== undefined && JSON.stringify(o.target) !== JSON.stringify(base.target)) out.target = o.target;
  if (o.ru !== undefined && o.ru !== text?.ru) out.ru = o.ru;
  if (o.en !== undefined && o.en !== text?.en) out.en = o.en;
  return Object.keys(out).length === 0 ? undefined : out;
}
