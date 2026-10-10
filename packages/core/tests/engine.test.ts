/**
 * The combat engine is one engine, and this is its watchman (decision 427).
 *
 * Three files own it and nothing else may do their work: `strike.ts` builds a
 * volley, `damage.ts` wounds a body, `battle.ts` turns the queue of a fight.
 * The rule was written in `CLAUDE.md` and it did not hold, because nobody
 * reads a document at the moment when writing a second loop is the shorter
 * path. So the rule greps the sources instead, the way `purity.test.ts` greps
 * for `Math.random`: every sign of hand-made engine work outside its owner is
 * named here, with the file it belongs to.
 *
 * Adding a file to `allowed` is how a second engine gets in. That is the
 * point: it cannot happen quietly - it is a line in a test, in a diff, with a
 * reason beside it. Removing the sign instead of adding the file is the fix
 * nine times in ten: `planStrike` plans the volley, `landVolley` lands it,
 * `stepBattle` turns the queue, and `FighterSpec.harm` carries the wounds in.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const SCANNED = ["packages", "apps"];

const STRIKE = "packages/core/strike.ts";
const DAMAGE = "packages/core/damage.ts";
const BATTLE = "packages/core/battle.ts";

interface Rule {
  /** What the file would be doing if it matched. */
  what: string;
  /** The one file whose job it is. */
  owner: string;
  /** Signs of the work, as they read in the source. */
  signs: { re: RegExp; ru: string }[];
  /** Files that do it anyway, each with why. */
  allowed: Record<string, string>;
}

const RULES: Rule[] = [
  {
    what: "wounds a body by hand",
    owner: DAMAGE,
    signs: [
      { re: /\b\w*[Hh]arm\.(blood|reserve|dead|organs|nodeBleed|infection|chill|doses|healCarry|bloodCarry|painCarry)\s*[-+*/]?=[^=]/, ru: "пишет в запись ран" },
      { re: /\.hp\s*-=/, ru: "сам снимает прочность с элемента" },
    ],
    // The stone pays through `spend` of the track now (`landMutation` of stone.ts): no exception left.
    allowed: {},
  },
  {
    what: "builds a volley by hand",
    owner: STRIKE,
    signs: [
      { re: /\bvolley\s*\(/, ru: "собирает залп сам вместо planStrike" },
      { re: /\b(hitChance|expectedOver|freeStrikes|extraBonus|strikeForce|strikeTime)\s*\(/, ru: "считает попадание, силу или время удара сам" },
      { re: /\b(STRIKE|DODGE)\.\w/, ru: "читает константы удара" },
      { re: /\b(MUSCLE|END_ACCURACY|KIND_ACCURACY|COVER_ACCURACY|HIT_TYPES|HEAD_BITES)\b/, ru: "читает таблицы удара" },
    ],
    allowed: {},
  },
  {
    what: "turns a queue of fighters by hand",
    owner: BATTLE,
    signs: [
      { re: /\.clock\s*[-+]?=[^=]/, ru: "двигает часы бойца" },
      { re: /\bBATTLE\.(turnEnergy|waitTime|maxActs)\b/, ru: "читает цену хода" },
      { re: /\.(conscious|severed)\s*=[^=]/, ru: "ставит состояние бойца" },
    ],
    allowed: {},
  },
  {
    what: "runs a fight: lands blows and turns the body's clock in one file",
    owner: BATTLE,
    signs: [{ re: /\b(landVolley|rollVolley)\s*\(/, ru: "бросает залп" }],
    // Only counted when the same file also runs body turns: that pair is a fight.
    allowed: {
      "apps/lab/gauntlet.ts": "гонка на выбывание - бои через stepBattle, ходы только между ними",
    },
  },
];

/** A file both lands blows and runs turns of the damage track: it is a fight. */
const RUNS_TURNS = /\b(harmTurn|turn)\s*\(\s*\w+\s*,\s*\w*[Hh]arm/;

function sources(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const at = join(dir, e.name);
      // A package keeps its tests beside it; they are not the code the rules watch.
      if (e.isDirectory()) {
        if (e.name !== "tests" && e.name !== "dist" && e.name !== "node_modules") walk(at);
      } else if (e.name.endsWith(".ts")) out.push(relative(ROOT, at).split(sep).join("/"));
    }
  };
  for (const d of SCANNED) walk(join(ROOT, d));
  return out.sort();
}

/** The file with its comments stripped: a rule talked about is not a rule written. */
function code(path: string): string {
  return readFileSync(join(ROOT, path), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("the combat engine is one engine (decision 427)", () => {
  const files = sources();

  it("has something to look at", () => {
    expect(files.length).toBeGreaterThan(20);
    for (const f of [STRIKE, DAMAGE, BATTLE]) expect(files, `${f} is not scanned`).toContain(f);
  });

  it("bites: the shortest second engine anyone would write trips every rule", () => {
    // Exactly the file the next agent writes when the engine looks like too many calls.
    const forged = `
      const plan = volley(strikes(me), { armor: derive(foe).armor.mean });
      for (const roll of rollVolley(plan, rng)) {
        if (rng.next() < hitChance(roll.planned.accuracy)) el.hp -= roll.amount;
        harm.blood -= 1;
      }
      actor.clock += BATTLE.turnEnergy;
      turn(foe, foeHarm, {}, rng);
    `;
    expect(RUNS_TURNS.test(forged)).toBe(true);
    for (const rule of RULES) {
      expect(rule.signs.some((s) => s.re.test(forged)), `${rule.what}: the forgery slipped past`).toBe(true);
    }
  });

  it("every sign it looks for is a sign its owner shows: no rule watches nothing", () => {
    for (const rule of RULES) {
      const text = code(rule.owner);
      for (const sign of rule.signs) {
        expect(sign.re.test(text), `${rule.owner} no longer matches ${sign.re} (${sign.ru}) - the rule went blind`).toBe(true);
      }
    }
  });

  for (const rule of RULES) {
    it(`nothing outside ${rule.owner} ${rule.what}`, () => {
      const guilty: string[] = [];
      for (const file of files) {
        if (file === rule.owner || rule.allowed[file] !== undefined) continue;
        const text = code(file);
        if (rule.what.startsWith("runs a fight") && !RUNS_TURNS.test(text)) continue;
        for (const sign of rule.signs) {
          if (sign.re.test(text)) guilty.push(`${file}: ${sign.ru} (${sign.re.source})`);
        }
      }
      expect(guilty, `это работа ${rule.owner}. Либо звать planStrike / landVolley / stepBattle / splitHarm, либо вписать файл в allowed с причиной`).toEqual([]);
    });
  }

  it("the list of exceptions is short, and every one of them still exists", () => {
    const all = RULES.flatMap((r) => Object.entries(r.allowed));
    expect(all.length, "больше шести исключений - это уже не исключения").toBeLessThanOrEqual(6);
    for (const [file, why] of all) {
      expect(files, `${file} is in allowed but not in the tree`).toContain(file);
      expect(why.length, `${file} has no reason beside it`).toBeGreaterThan(10);
    }
  });
});
