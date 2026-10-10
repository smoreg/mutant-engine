/**
 * The text fixture is an exact circle: `bodyFromText(bodyToText(b))` hashes
 * as `b` for every body the game makes - fresh, wounded, dead with its brain
 * destroyed, mutated, grown, a beast, a part on its way back. The online
 * server ships bodies to the client this way (docs/colosseum/online.md §3.1,
 * invariant 4 of §7), so a lost field is a client that draws another body.
 * Bodies that only exist after a day of the colosseum are in
 * `apps/colosseum/tests/rules/text-roundtrip.test.ts`.
 */
import { LabRng as Rng } from "../rng.js";
import { describe, expect, it } from "vitest";
import {
  HUMAN_IDS,
  applyMutation,
  applyMutationAt,
  bodyFromText,
  bodyHash,
  bodyToText,
  coverTick,
  contagionTick,
  cut,
  drawMutation,
  human,
  landVolley,
  newHarm,
  regrowAfterCut,
  strikes,
  tick,
  volley,
  type Body,
  MUTATIONS,
  fixtureBody,
  BEASTS,
  beastById,
} from "../index.js";

function circle(body: Body, what: string): void {
  const text = bodyToText(body);
  const back = bodyFromText(text);
  expect(bodyHash(back), what).toBe(bodyHash(body));
  expect(bodyToText(back), what).toBe(text);
}

function mutated(seed: number, hits: number): Body {
  const rng = new Rng(seed);
  const body = human();
  for (let i = 0; i < hits; i++) {
    const m = drawMutation(MUTATIONS, rng, { spread: true, body });
    if (m !== null) applyMutation(body, m, rng, { spread: true });
    if (i % 3 === 0) {
      tick(body);
      coverTick(body);
      contagionTick(body);
    }
  }
  return body;
}

describe("text round-trip by hash", () => {
  it("a fresh human", () => circle(human(), "human"));

  it("a wounded human: blows of beasts landed", () => {
    for (const id of ["dragon", ...BEASTS.slice(0, 6).map((b) => b.id)]) {
      const beast = beastById(id);
      if (beast === undefined) continue;
      const target = human();
      const list = strikes(fixtureBody(beast));
      if (list.length === 0) continue;
      for (let seed = 1; seed <= 3; seed++) landVolley(volley(list, { armor: 0 }), target, newHarm(target), new Rng(seed));
      circle(target, `wounded by ${id}`);
    }
  });

  it("bodies after random mutations", () => {
    for (const seed of [1, 2, 3, 5, 8, 13, 21, 34]) circle(mutated(seed, 40), `seed ${seed}`);
  });

  it("every beast of the bestiary", () => {
    for (const b of BEASTS) circle(fixtureBody(b), b.id);
  });

  it("a part on its way back: flesh memory after a cut", () => {
    const b = human();
    applyMutationAt(b, MUTATIONS.find((m) => m.id === "fleshMemory")!, { segment: HUMAN_IDS.torso });
    const c = cut(b, HUMAN_IDS.armL, "a");
    regrowAfterCut(b, c);
    expect(b.regrowth).toHaveLength(1);
    circle(b, "flesh memory");
  });

  it("tumour pressure is kept", () => {
    const b = human();
    b.pressure = 17;
    circle(b, "pressure");
  });
});
