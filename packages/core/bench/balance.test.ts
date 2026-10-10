/**
 * Guards against a degenerate balance, not a snapshot of it. Every number the
 * bestiary fights with will move - the fixtures are being redrawn, the glands
 * have no strike yet, the size steps are being reset - so nothing here asserts
 * a threshold or a win share against a constant. What is asserted are the
 * properties a fight has to keep whatever the numbers become:
 *
 *   - a beast of the bestiary is at least a match for one bare human;
 *   - a fight of two bodies ends by itself, it does not run into the turn cap;
 *   - a beast does not die with nothing of the enemy ever landing on it - that
 *     is a body killing itself, not losing a fight;
 *   - a crowd beats what one of the same cannot.
 *
 * The numbers behind them are in `docs/bestiary-balance.md`, measured with
 * `packages/core/bench`. Few seeds on purpose: this is a guard, not the measurement.
 */
import { LabRng as Rng } from "../rng.js";
import { describe, expect, it } from "vitest";
import { LEFT, RIGHT, duel, runOne, wall } from "./bench.js";
import { BEAST_IDS, combatant } from "./roster.js";

const makeRng = (seed: number): Rng => new Rng(seed);
const SEEDS = 9;

/**
 * Beasts that lose to one human today, with the reason each is known to lose
 * for. The list is allowed to shrink and never to grow: a name that appears
 * here without a line in `docs/bestiary-balance.md` is the bug this file is
 * for. `octopus` is eight tentacles whose whole point is the grab, and the
 * grab is not in the code at all (`docs/colosseum/arena.md` §11, point 16).
 * `rat` is meant to lose: it is half a human at most (sanity row E-rat).
 */
const LOSES_TO_A_HUMAN: readonly string[] = ["octopus", "rat"];

describe("a beast of the bestiary against one human", () => {
  it("nobody outside the known-broken list loses to a bare human", () => {
    const weak: { id: string; share: number }[] = [];
    for (const id of BEAST_IDS) {
      const w = duel(id, "human", makeRng, { seeds: SEEDS });
      const share = (w.wins[LEFT] ?? 0) / w.seeds;
      if (share <= 0.5) weak.push({ id, share });
    }
    expect(weak.filter((x) => !LOSES_TO_A_HUMAN.includes(x.id))).toEqual([]);
  });

  it("every beast lands blows on a human: none of them is a body that cannot strike", () => {
    for (const id of BEAST_IDS) {
      const w = duel(id, "human", makeRng, { seeds: SEEDS });
      expect(`${id} lands: ${(w.landed[LEFT] ?? 0) > 0 && (w.damage[LEFT] ?? 0) > 0}`).toBe(`${id} lands: true`);
    }
  });
});

describe("a fight ends by itself", () => {
  it("a beast against the three of the first floor never runs into the turn cap", () => {
    for (const id of BEAST_IDS) {
      for (const foe of ["human", "orc", "troll"]) {
        const w = duel(id, foe, makeRng, { seeds: SEEDS });
        expect(`${id} vs ${foe}: limit ${w.reasons.limit}`).toBe(`${id} vs ${foe}: limit 0`);
        expect(w.turns.max).toBeLessThan(200);
      }
    }
  });

  it("a beast against a beast never runs into the turn cap either", () => {
    // Every beast against the one after it: the whole matrix is the bench's
    // job, a ring through all of them is enough to catch a pair that stalls.
    for (let i = 0; i < BEAST_IDS.length; i++) {
      const left = BEAST_IDS[i]!;
      const right = BEAST_IDS[(i + 1) % BEAST_IDS.length]!;
      const w = duel(left, right, makeRng, { seeds: 5 });
      expect(`${left} vs ${right}: limit ${w.reasons.limit}`).toBe(`${left} vs ${right}: limit 0`);
    }
  });
});

describe("a body does not kill itself", () => {
  it("no beast dies against a human with nothing of the human landing on it", () => {
    for (const id of BEAST_IDS) {
      for (const seed of [1, 2, 3, 4, 5]) {
        const f = runOne([combatant(id).body()], [combatant("human").body()], makeRng(seed));
        expect(`${id}#${seed}: ${f.selfKilled.join(",")}`).toBe(`${id}#${seed}: `);
      }
    }
  });

  it("a beast alone on the sand against nobody it can beat does not fall over", () => {
    // One beast on each side of the same kind: whatever happens, the fight is
    // decided by blows, not by a body coming apart on its own.
    for (const id of BEAST_IDS) {
      const w = duel(id, id, makeRng, { seeds: 5 });
      expect(`${id}: self-kills ${w.selfKills}`).toBe(`${id}: self-kills 0`);
    }
  });
});

describe("a crowd is worth something", () => {
  it("a crowd never does worse than one, and deals at least as much", () => {
    // Landing blows is not winning: eight humans scratch a dragon and still
    // lose to it (sanity row E-dragon-20 wants twenty of them to lose).
    for (const id of ["dragon", "hydra", "gargoyle", "troll", "crab"]) {
      const one = wall(id, "human", 1, 1, makeRng, { seeds: 5 });
      const many = wall(id, "human", 1, 8, makeRng, { seeds: 5 });
      expect(`${id}: crowd not worse ${(one.wins[RIGHT] ?? 0) <= (many.wins[RIGHT] ?? 0)}`).toBe(`${id}: crowd not worse true`);
      const more = (one.damage[RIGHT] ?? 0) <= (many.damage[RIGHT] ?? 0);
      expect(`${id}: crowd deals more ${more}`).toBe(`${id}: crowd deals more true`);
    }
  });
});
