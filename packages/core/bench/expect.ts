/**
 * What common sense expects of a fight, as rows of data (docs/tasks/sanity/README.md,
 * step 6). A red row is a finding of severity `high`, not a failure of the stand.
 * Sides are source strings of `source.ts`; a beast the bestiary lacks is replaced
 * by the nearest one, and the row says so (none is since decision 1285: the rat
 * and the bear are drawn).
 */
import { share, type Share } from "./duels.js";

export interface Expectation {
  id: string;
  /** `n` of A against `m` of B. */
  a: string;
  n: number;
  b: string;
  m: number;
  /** The share of the seeds A has to win, inclusive. */
  min: number;
  max: number;
  rule: string;
}

export const EXPECT: readonly Expectation[] = [
  { id: "E-dragon-20", a: "dragon", n: 1, b: "human", m: 20, min: 0.5, max: 1, rule: "дракон бьёт ≥ 20 людей" },
  { id: "E-dragon-2", a: "human", n: 2, b: "dragon", m: 1, min: 0, max: 0.05, rule: "двое людей не забивают дракона" },
  { id: "E-rat", a: "rat", n: 1, b: "human", m: 1, min: 0, max: 0.3, rule: "крыса проигрывает человеку" },
  // A naked unarmed man loses to a wolf: fangs and four claws against fists of 1d3 (decision 1264).
  { id: "E-wolf", a: "wolf", n: 1, b: "human", m: 1, min: 0.7, max: 1, rule: "волк бьёт голого человека" },
  // With the whole table of content/gear.ts on - braces (a fist of 1d6) and boots - the man is the wolf's equal.
  { id: "E-wolf-armed", a: "wolf", n: 1, b: "human+brace+shod", m: 1, min: 0.3, max: 0.7, rule: "человек с оружием ≈ волк" },
  { id: "E-wolves-5", a: "wolf", n: 5, b: "bear", m: 1, min: 0.5, max: 1, rule: "стая из 5 волков бьёт медведя" },
  // The model draws no body smaller than half a man (length and girth >= 1): the rat is half a man, and two
  // halves are a man. A true rat needs fractions of a unit in the graph - the owner's task (decision 1299).
  { id: "E-rats-2", a: "rat", n: 2, b: "human", m: 1, min: 0, max: 0.5, rule: "2 крысы не валят человека надёжно (крыса — полчеловека)" },
  // Armoured is the whole body in plates (`human+plates`); the catalog's row `plates` covers one torso.
  { id: "E-rats-plated", a: "human+plates", n: 1, b: "rat", m: 3, min: 0.7, max: 1, rule: "бронированный человек держит 3 крыс" },
  { id: "E-troll-goblins", a: "troll", n: 1, b: "goblin", m: 3, min: 0.5, max: 1, rule: "тролль бьёт 3 гоблинов" },
  // The crab, the mantis and the scorpion of the bestiary are giants: the bear's mass (the model draws nothing below
  // half a man), in plates, with pincers and a second brain. The giant crab beats the bear - the owner meant it
  // (decision 1318); the giant bear, a torso tier above the bear, tears the crab apart and out of its pincers (1319).
  { id: "E-crab-bear", a: "crab", n: 1, b: "bear", m: 1, min: 0.7, max: 1, rule: "гигантский краб бьёт медведя" },
  { id: "E-gbear-crab", a: "giantBear", n: 1, b: "crab", m: 1, min: 0.8, max: 1, rule: "гигантский медведь бьёт гигантского краба" },
  { id: "E-troll-scorpion", a: "troll", n: 1, b: "scorpion", m: 1, min: 0.2, max: 0.8, rule: "тролль ≈ гигантский скорпион" },
  // Three men's mass on eight arms: it holds and bites, and the man tears loose of a single arm (decision 1313).
  { id: "E-octopus", a: "octopus", n: 1, b: "human", m: 1, min: 0.3, max: 0.95, rule: "осьминог бьёт человека" },
];

export interface Verdict {
  e: Expectation;
  got: Share;
  ok: boolean;
}

export function check(e: Expectation, seeds = 100): Verdict {
  const got = share(e.a, e.b, { n: e.n, m: e.m, seeds });
  return { e, got, ok: got.share >= e.min && got.share <= e.max };
}

export function line(v: Verdict): string {
  const { e, got } = v;
  return `${v.ok ? "GREEN" : "RED  "} ${e.id.padEnd(12)} ${e.n}×${e.a} vs ${e.m}×${e.b}: ${got.share.toFixed(2)} (want ${e.min}..${e.max}; A ${got.winsA} B ${got.winsB} none ${got.none}, turns ${got.turns})  ${e.rule}`;
}
