/**
 * Where the sanity stand takes its bodies from, one string per source
 * (docs/tasks/sanity/README.md, «Стенд»):
 *
 *   beast:<id> | foe:<id> | <id>   a fixture of the roster
 *   human                          the bare human
 *   human+<gear>[+<gear>...]       a human with the gear on every slot it fits (content/gear.ts);
 *                                  a cover id in place of a gear clads every segment in it (COVERS)
 *   row:<mutationId>[:<seed>]      one catalog row landed on a human
 *   random:<N>:<seed>              N humans grown by random operations (tests/gen.ts)
 *   abyss:<N>:<seed>[:<strikes>]   N humans after catalog strikes of the abyss
 *   spring:<N>:<seed>[:<stones>]   N humans after stones of the spring, fed after each (the colosseum's murky stone);
 *                                  without a count, 5..44 stones by seed
 *   text:<file>                    a body in the text format
 *
 * Every entry builds a fresh body on each call, the same one for the same
 * string: the stand is a pure function of its seeds.
 */
import { readFileSync } from "node:fs";
import { LabRng as Rng } from "../rng.js";
import { applyMutation, bodyFromText, COVERS, drawMutation, gearItem, human, feed, landMutation, mutationById, MUTATIONS, newHarm, rationOf, segmentIds, sourceRows, sourceSpec, touch, wearGear, type Body, type CoverId, type DrawOptions, type Kept, type Wearer } from "../index.js";
import { randomBody } from "../tests/gen.js";
import { combatant, type Combatant } from "./roster.js";

function int(s: string | undefined, fallback: number, what: string): number {
  if (s === undefined || s === "") return fallback;
  const n = Number(s);
  if (!Number.isInteger(n)) throw new Error(`${what}: not an integer: ${s}`);
  return n;
}

function entry(id: string, body: () => Body): Combatant {
  return { id, ru: id, kind: "beast", body };
}

/** One catalog row on a human; the row that finds no place leaves the human as is. */
export function rowBody(id: string, seed: number): Body {
  const m = mutationById(id);
  if (m === undefined) throw new Error(`unknown mutation: ${id}`);
  const body = human();
  applyMutation(body, m, new Rng(seed));
  return body;
}

/** A human after `strikes` draws of the abyss, as `bench/grotesque.test.ts` strikes. */
export function abyssBody(seed: number, strikes: number): Body {
  const rng = new Rng(seed);
  const body = human();
  for (let i = 0; i < strikes; i++) {
    const m = drawMutation(MUTATIONS, rng, { body, defect: rng.next() < 0.15, decay: true });
    if (m !== null) applyMutation(body, m, rng, { source: "abyss" });
  }
  return body;
}

/** A human after `stones` stones of the spring, the reserve filled after each: what the colosseum feeds its fighters. */
export function springBody(seed: number, stones: number): Body {
  const spec = sourceSpec("spring");
  const rng = new Rng(seed);
  const body = human();
  const k: Kept = { body, harm: newHarm(body) };
  for (let i = 0; i < stones; i++) {
    const opts: DrawOptions = { body, decay: spec.decay, heal: spec.heal };
    if (spec.defects !== null) opts.defect = spec.defects > 0 && rng.next() < spec.defects;
    const m = drawMutation(sourceRows(spec, MUTATIONS, null), rng, opts);
    if (m !== null) landMutation(k, m, rng);
    feed(k.harm, rationOf(k));
  }
  return body;
}

/**
 * A human with every item of the list on every slot it fits: the model's own
 * gear, worn the way the game wears it. A cover id clads the whole body in it:
 * the armoured man of common sense, where the catalog's row covers one torso.
 */
export function armedHuman(items: readonly string[]): Body {
  const w: Wearer = { body: human() };
  for (const id of items) {
    if (id in COVERS) {
      for (const sid of segmentIds(w.body)) w.body.segments[sid]!.cover = id as CoverId;
      touch(w.body);
      continue;
    }
    const item = gearItem(id);
    if (item === undefined) throw new Error(`unknown gear: ${id}`);
    while (wearGear(w, item)) continue;
  }
  return w.body;
}

export function resolve(source: string): Combatant[] {
  if (source.startsWith("human+")) {
    const items = source.slice("human+".length).split("+");
    return [entry(source, () => armedHuman(items))];
  }
  const [head, ...rest] = source.split(":");
  switch (head) {
    case "human":
      return [entry("human", () => human())];
    case "beast":
    case "foe":
      return [combatant(rest.join(":"))];
    case "row": {
      const [id, seed] = rest;
      const s = int(seed, 1, source);
      return [entry(`row:${id}:${s}`, () => rowBody(id!, s))];
    }
    case "random":
    case "abyss": {
      const n = int(rest[0], 1, source);
      const seed = int(rest[1], 1, source);
      const strikes = int(rest[2], 12, source);
      return Array.from({ length: n }, (_, i) => {
        const s = seed + i;
        return head === "random"
          ? entry(`random:${s}`, () => randomBody(s, 10 + (s % 30)))
          : entry(`abyss:${s}:${strikes}`, () => abyssBody(s, strikes));
      });
    }
    case "spring": {
      const n = int(rest[0], 1, source);
      const seed = int(rest[1], 1, source);
      return Array.from({ length: n }, (_, i) => {
        const s = seed + i;
        const stones = int(rest[2], 5 + (s % 40), source);
        return entry(`spring:${s}:${stones}`, () => springBody(s, stones));
      });
    }
    case "text": {
      const file = rest.join(":");
      const text = readFileSync(file, "utf8");
      return [entry(`text:${file}`, () => bodyFromText(text))];
    }
    default:
      return [combatant(source)];
  }
}

/** A source that has to be one body: a duel side. */
export function one(source: string): Combatant {
  const list = resolve(source);
  if (list.length !== 1) throw new Error(`${source}: ${list.length} bodies, a side takes one`);
  return list[0]!;
}
