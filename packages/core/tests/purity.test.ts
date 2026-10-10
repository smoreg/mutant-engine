/**
 * The watchman of the model (`CLAUDE.md`, "Как устроен код"): nothing under
 * `packages/core` may name `Game`, `document`, `window`, `Math.random`, `Date.now`
 * or `Audio`. Where it may import from is `tests/boundaries.test.ts`.
 *
 * It walked one level for years, so it read the 32 files at the top of
 * `packages/core` and never opened `derive/` (eleven files) or `render/` (eight,
 * plus six under `sprites/`) - twenty-five files, half the model, that no rule
 * touched (decision 540). The walk is recursive now, and what it reads is
 * pinned below by name: a watchman that will not say out loud what it read
 * will one day stop reading.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { segmentHalfWidth } from "@mutant-engine/view";
import { segmentIds, type Segment } from "../graph.js";
import { human } from "../human.js";

const SRC = join(import.meta.dirname, "..", "..", "..", "packages", "core");
const FORBIDDEN = [/\bGame\b/, /\bdocument\b/, /\bwindow\b/, /Math\.random/, /Date\.now/, /\bAudio\b/];

/** Every `.ts` under `packages/core`, subdirectories and all, relative to it. */
function sources(dir = SRC, prefix = ""): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory() && (e.name === "tests" || e.name === "bench")) continue;
    if (e.isDirectory()) out.push(...sources(join(dir, e.name), `${prefix}${e.name}/`));
    else if (e.name.endsWith(".ts")) out.push(prefix + e.name);
  }
  return out;
}

describe("packages/core stays a pure model", () => {
  it("reads the whole model, subdirectories and all", () => {
    const files = sources();
    expect(files.length, "a one-level walk finds 32 of 57").toBeGreaterThan(50);
    expect(files.some((f) => f.startsWith("derive/")), "derive is read").toBe(true);
    expect(files.some((f) => f.startsWith("content/")), "content is read").toBe(true);
  });

  it("bites: the shortest impure file anyone would write trips every word", () => {
    const forged = `class Game {} document.body; window.x; Math.random(); Date.now(); new Audio();`;
    for (const re of FORBIDDEN) expect(forged, `${re} looks at nothing`).toMatch(re);
  });

  it("has no Game, document, window, Math.random, Date.now", () => {
    for (const f of sources()) {
      const text = readFileSync(join(SRC, f), "utf8");
      for (const re of FORBIDDEN) expect(text, `${f} matches ${re}`).not.toMatch(re);
    }
  });
});

/**
 * How wide a segment is was written twice: `segmentHalfWidth` in `layout.ts`,
 * which adds to a torso past girth 4, and a flat `22 : 14` in
 * `render/compose.ts`, which does not. At girth 6 the two said 1.12 and 0.92
 * units, and the picture put growths and the organs showing through the wall
 * where a girth-4 belly ends instead of where this one does (decision 673).
 */
describe("a segment has one width", () => {
  const torso = (girth: number): Segment => {
    const body = human();
    const seg = segmentIds(body)
      .map((id) => body.segments[id]!)
      .find((s) => s.kind === "torso")!;
    seg.girth = girth;
    return seg;
  };

  it("grows past girth 4, where the second copy stopped", () => {
    expect(segmentHalfWidth(torso(4))).toBeCloseTo(22 / 24, 6);
    expect(segmentHalfWidth(torso(5))).toBeGreaterThan(segmentHalfWidth(torso(4)));
    expect(segmentHalfWidth(torso(6))).toBeGreaterThan(segmentHalfWidth(torso(5)));
  });

  // "is written down in layout.ts and nowhere else" was removed here: it
  // grepped every file under packages/core for a hardcoded `girth >= 4 ? 22 : 14`
  // pattern, source text rather than behavior. `render/compose.ts` now calls
  // `segmentHalfWidth` itself (`import { ..., segmentHalfWidth, ... } from
  // "../layout.js"`), so the duplicate-formula bug the test guarded against
  // (decision 673) is prevented structurally by that import, not by a grep.
});
