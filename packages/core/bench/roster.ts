/**
 * Who the bench puts on the sand: the three yardstick foes of the first floor
 * (`packages/core/content/foes.ts`) and the twenty-two hand-drawn beasts of the bestiary
 * (`packages/core/beasts.ts`). Nothing is drawn here - a combatant is a name and
 * a way to build the body the other tools already keep, so a fix to a fixture
 * shows up in the next measurement without a line changing in `packages/core/bench`.
 */
import { bodyFromText, type Body, BEASTS } from "../index.js";
import { FOES, foeBody } from "../index.js";

export type Kind = "foe" | "beast";

export interface Combatant {
  id: string;
  ru: string;
  kind: Kind;
  /** A fresh body every call: the bench never hands the same object to two fights. */
  body: () => Body;
}

/** The three the bestiary is measured against: the human and what lives with him. */
export const YARDSTICK: readonly string[] = ["human", "orc", "troll"];

export const ROSTER: readonly Combatant[] = [
  ...FOES.map((f): Combatant => ({ id: f.id, ru: f.ru, kind: "foe", body: () => foeBody(f) })),
  ...BEASTS.map((b): Combatant => ({ id: b.id, ru: b.ru, kind: "beast", body: () => bodyFromText(b.fixture) })),
];

export function combatant(id: string): Combatant {
  const one = ROSTER.find((c) => c.id === id);
  if (one === undefined) throw new Error(`unknown combatant: ${id}`);
  return one;
}

export const BEAST_IDS: readonly string[] = ROSTER.filter((c) => c.kind === "beast").map((c) => c.id);
