import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HUMAN_IDS, LIMITS, SWAMP_IDS, apply, human, nodeIds, organ, swampMutant, targets, territories, type Body } from "@mutant-engine/core";
import { layout, silhouetteSvg } from "../index.js";
import { population } from "../../core/tests/gen.js";

const TAG_RE = /^<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[A-Za-z_][\w:.-]*="[^"<]*")*)\s*(\/?)>$/;
const TEXT_RE = /^(?:[^<&]|&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)*$/;

/** Throws when the string is not one well-formed XML element: balanced tags, quoted attributes, escaped text. */
function assertWellFormed(xml: string): void {
  const stack: string[] = [];
  let roots = 0;
  let i = 0;
  while (i < xml.length) {
    if (xml[i] === "<") {
      const close = xml.indexOf(">", i);
      if (close < 0) throw new Error(`unterminated tag at ${i}`);
      const tag = xml.slice(i, close + 1);
      const m = TAG_RE.exec(tag);
      if (!m) throw new Error(`bad tag ${tag.slice(0, 80)}`);
      const [, closing, name, , selfClosing] = m;
      if (closing) {
        const open = stack.pop();
        if (open !== name) throw new Error(`</${name}> closes <${open}>`);
      } else if (!selfClosing) {
        if (stack.length === 0) roots += 1;
        stack.push(name!);
      } else if (stack.length === 0) roots += 1;
      i = close + 1;
    } else {
      const next = xml.indexOf("<", i);
      const text = xml.slice(i, next < 0 ? xml.length : next);
      if (!TEXT_RE.test(text)) throw new Error(`bad text ${text.slice(0, 80)}`);
      if (stack.length === 0 && text.trim().length > 0) throw new Error(`text outside the root: ${text.slice(0, 40)}`);
      i = next < 0 ? xml.length : next;
    }
  }
  if (stack.length > 0) throw new Error(`unclosed <${stack[stack.length - 1]}>`);
  if (roots !== 1) throw new Error(`${roots} roots`);
}

function fortyNodes(): Body {
  const b = human(100_000);
  const arm = { kind: "arm", length: 2, girth: 1, cover: "skin", ending: organ("hand") } as const;
  while (nodeIds(b).length < LIMITS.nodes) {
    const t = targets(b, "sprout", arm);
    apply(b, "sprout", arm, t[t.length - 1]!.target);
  }
  return b;
}

describe("silhouette svg", () => {
  it("the checker itself tells well-formed from broken", () => {
    assertWellFormed(`<svg xmlns="http://www.w3.org/2000/svg"><g><circle r="1"/></g><text>a &amp; b</text></svg>`);
    expect(() => assertWellFormed(`<svg><g></svg>`)).toThrow();
    expect(() => assertWellFormed(`<svg><text>a & b</text></svg>`)).toThrow();
    expect(() => assertWellFormed(`<svg width=3></svg>`)).toThrow();
    expect(() => assertWellFormed(`<svg/><svg/>`)).toThrow();
  });

  it("is well-formed on the human, the mutant and 200 random bodies", () => {
    for (const b of [human(), swampMutant(), ...population(200)]) {
      const svg = silhouetteSvg(b);
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
      assertWellFormed(svg);
    }
  });

  it("takes at most 30 KB for a body of 40 nodes", () => {
    const b = fortyNodes();
    expect(nodeIds(b)).toHaveLength(40);
    const svg = silhouetteSvg(b, { labels: true, bridges: true, cavities: true });
    expect(Buffer.byteLength(svg, "utf8")).toBeLessThanOrEqual(30 * 1024);
    assertWellFormed(svg);
  });

  it("draws every node, marks your brain, and honours the options", () => {
    const h = human();
    const plain = silhouetteSvg(h);
    expect(plain.match(/<circle /g)!.length).toBeGreaterThanOrEqual(nodeIds(h).length);
    expect(plain).toContain('class="self"');
    expect(plain).toContain('class="plane"');
    expect(plain).toContain('class="cavity"');
    expect(plain).not.toContain(`>${HUMAN_IDS.handL}<`);

    const bare = silhouetteSvg(h, { bridges: false, cavities: false });
    expect(bare).not.toContain('class="plane"');
    expect(bare).not.toContain('class="cavity"');

    const labelled = silhouetteSvg(h, { labels: true });
    expect(labelled).toContain(`>${HUMAN_IDS.handL}<`);
    assertWellFormed(labelled);

    const sized = silhouetteSvg(h, { size: 96 });
    expect(sized).toMatch(/width="96"/);
    expect(silhouetteSvg(h, { size: 320 })).toMatch(/width="320"/);
  });

  it("underlays territories with the colour of their head", () => {
    const m = swampMutant();
    const svg = silhouetteSvg(m, {
      territories: [{ nodes: [SWAMP_IDS.shoulder2, SWAMP_IDS.pelvis, SWAMP_IDS.footL, SWAMP_IDS.footR], color: "#123456" }],
    });
    expect(svg).toContain("#123456");
    expect(svg).toContain('class="territory"');
    assertWellFormed(svg);
    expect(silhouetteSvg(m)).not.toContain('class="territory"');

    // The territories of step B fit the overlay as they are; the second head with sway 4 takes the legs.
    const swayed = swampMutant();
    swayed.nodes[SWAMP_IDS.shoulder2]!.ends[0]!.contents!.find((c) => c.kind === "brain")!.sway = 4;
    const foreign = territories(swayed).filter((t) => !t.brain.self);
    expect(foreign).toHaveLength(1);
    expect(foreign[0]!.nodes).toContain(SWAMP_IDS.footL);
    const withB = silhouetteSvg(swayed, { territories: foreign });
    expect(withB.match(/class="territory"/g)).toHaveLength(1);
    assertWellFormed(withB);
  });

  it("accepts a precomputed layout and renders the same picture", () => {
    const b = swampMutant();
    expect(silhouetteSvg(b, { layout: layout(b) })).toBe(silhouetteSvg(b));
  });

  it("membranes are filled polygons", () => {
    expect(silhouetteSvg(swampMutant())).toContain('class="membrane"');
    expect(silhouetteSvg(human())).not.toContain('class="membrane"');
  });
});

describe("visual model stays pure", () => {
  const FORBIDDEN = [/\bGame\b/, /\bdocument\b/, /\bwindow\b/, /Math\.random/, /Date\.now/, /\bAudio\b/, /\bcanvas\b/i];
  const LAB_BORN = ["index.ts", "pins.ts", "scene.ts", "pictures.ts", "wounds.ts", "silhouette.ts"];
  const files = [
    join(import.meta.dirname, "..", "..", "..", "packages", "core", "mutant.ts"),
    // The renderer that left the model; the lab's scenes, pins, cards and wounds that joined it in `packages/view` draw into the page.
    ...readdirSync(join(import.meta.dirname, "..", "..", "..", "packages", "view"))
      .filter((f) => f.endsWith(".ts") && !LAB_BORN.includes(f))
      .map((f) => join(import.meta.dirname, "..", "..", "..", "packages", "view", f)),
  ];

  it("has no DOM, Game, randomness or clock", () => {
    expect(files.length).toBeGreaterThanOrEqual(4);
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      for (const re of FORBIDDEN) expect(text, `${f} matches ${re}`).not.toMatch(re);
    }
  });

  it("imports only relative paths and the core package", () => {
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      for (const m of text.matchAll(/from\s+"([^"]+)"/g)) expect(m[1], `${f} imports ${m[1]}`).toMatch(/^(\.\.?\/|@mutant-engine\/core$)/);
    }
  });
});
