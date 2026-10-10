/**
 * Common sense of swimming (docs/tasks/sanity, package q3, decision 1303): the
 * measure one fin pushes was taken on the octopus, and a swimmer of the
 * bestiary does not sink because its flesh was reweighed after it.
 */
import { describe, expect, it } from "vitest";
import { BEASTS, capabilities, derive, fixtureBody, weight } from "../index.js";

const beast = (id: string) => fixtureBody(BEASTS.find((b) => b.id === id)!);

describe("the fin pushes what it was measured on", () => {
  it("q3-3: the octopus swims on its siphon (decision 1316), the jellyfish on its own", () => {
    for (const id of ["octopus", "jellyfish"]) {
      const b = beast(id);
      expect(derive(b).locomotion.swim, `${id} weighs ${weight(b)}`).toBe(true);
    }
  });

  it("q3-3: the octopus's tentacles do not row - suckers hold, they do not push water", () => {
    const b = beast("octopus");
    const rows = capabilities(b).endings.filter((c) => c.swim);
    expect(rows).toEqual([]);
  });
});
