import { LabRng as Rng } from "../../core/rng.js";
import { describe, expect, it } from "vitest";
import { bodyHash, human, newHarm, strike, type Harm } from "@mutant-engine/core";
import { bodyTints, woundedSvg } from "../index.js";

/**
 * «Тело всегда читаемо»: a broken arm is on the silhouette and not only in a
 * list beside it (decision 571). The paint and both pictures come from the
 * studio's wound tab, which is why this checks that a hurt body draws
 * something a whole one does not.
 */
describe("the fighter is drawn with his wounds", () => {
  function beaten(): { body: ReturnType<typeof human>; harm: Harm } {
    const body = human();
    const harm = newHarm(body);
    const rng = new Rng(4);
    for (let i = 0; i < 12; i++) strike(body, harm, { damage: 9, profile: "random", dirty: true }, rng);
    return { body, harm };
  }

  it("the sprite of a hurt body carries marks the sprite of a whole one does not", () => {
    const whole = human();
    const { body, harm } = beaten();
    const clean = woundedSvg({ body: whole, harm: newHarm(whole), look: "sprite", seed: 1, size: 220 });
    const hurt = woundedSvg({ body, harm, look: "sprite", seed: 1, size: 220 });
    expect(clean).toContain("<svg");
    expect(hurt).toContain("<svg");
    expect((hurt.match(/<circle/g) ?? []).length).toBeGreaterThan((clean.match(/<circle/g) ?? []).length);
  });

  it("the graph of a hurt body paints it too, and both pictures open the card of a part", () => {
    const { body, harm } = beaten();
    for (const look of ["sprite", "graph"] as const) {
      const svg = woundedSvg({ body, harm, look, seed: 1, size: 220, hit: true });
      expect(svg, look).toMatch(/data-(node|seg)="\d+"/);
    }
    const whole = human();
    const clean = woundedSvg({ body: whole, harm: newHarm(whole), look: "graph", seed: 1, size: 220 });
    const painted = woundedSvg({ body, harm, look: "graph", seed: 1, size: 220 });
    // A whole body wears no halo; a beaten one wears at least one, and a bleeding one drips.
    expect(clean).not.toMatch(/class="(hurt|broken|crushed)"/);
    expect(painted).toMatch(/class="(hurt|broken|crushed)"/);
    expect(painted).toContain(`class="bleeding"`);
  });

  it("the paint is a function of its arguments and never touches the body", () => {
    const { body, harm } = beaten();
    const before = bodyHash(body);
    const a = bodyTints(body, harm, null);
    const b = bodyTints(body, harm, null);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(bodyTints(body, harm, 1).rings.length).toBeGreaterThan(a.rings.length);
    expect(bodyHash(body)).toBe(before);
  });
});
