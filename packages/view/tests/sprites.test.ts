/**
 * Drawn sprites of the body (step L): every kind of segment, ending, head,
 * organ spot and cover has a mask; the masks are the sizes the task table
 * says and their contours close; a body composes out of them without holes
 * or dangling joints; a segment stretches only in its middle; a mutation
 * changes the frame; the frame is cheap and the atlas is small.
 */
import { describe, expect, it } from "vitest";
import {
  COVERS,
  ORGANS,
  SEGMENT_KINDS,
  MUTATIONS,
  applyMutation,
  human,
  swampMutant,
  type CoverId,
  type OrganKind,
  type SegmentKind,
  LabRng,
} from "@mutant-engine/core";
import {
  composeBody,
  fitFrame,
  segmentPixels,
  type Sheet,
  framesDiffer,
  renderPixels,
  type PixelFrame,
  PALETTE,
  STAMPS,
  VISUALS,
  mutationVisual,
  DIRS,
  ENDING_SPRITES,
  HEAD_SPRITES,
  SEGMENT_SPRITES,
  SPRITE_SIZES,
  TILES,
  atlasBytes,
  endingSprite,
  headKindOf,
  limbKindOf,
  maskProblems,
  segmentSprite,
  validateSprites,
  type HeadKind,
  type HeadView,
  type LimbKind,
  type Mask,
} from "../index.js";
import { population } from "../../core/tests/gen.js";

const OUTLINE = PALETTE.findIndex((p) => p.name === "outline");
const SHADOW = PALETTE.findIndex((p) => p.name === "shadow");

const ENDING_KINDS = (Object.keys(ORGANS) as OrganKind[]).filter((k) => ORGANS[k].mounts.includes("end") && k !== "head");
const HEAD_KINDS: HeadKind[] = ["human", "long", "skull", "eyeless", "mandibles"];
const VIEWS: HeadView[] = ["front", "profile", "back"];

function flesh(v: number): boolean {
  return v !== 0 && v !== SHADOW;
}

/** 4-connected components of the flesh pixels of a sheet. */
function components(s: Sheet): number {
  const seen = new Uint8Array(s.w * s.h);
  let n = 0;
  const stack: number[] = [];
  for (let i = 0; i < s.cells.length; i++) {
    if (seen[i] || !flesh(s.cells[i]!)) continue;
    n += 1;
    stack.push(i);
    seen[i] = 1;
    while (stack.length > 0) {
      const j = stack.pop()!;
      const x = j % s.w;
      const y = Math.floor(j / s.w);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx!;
        const ny = y + dy!;
        if (nx < 0 || ny < 0 || nx >= s.w || ny >= s.h) continue;
        const k = ny * s.w + nx;
        if (seen[k] || !flesh(s.cells[k]!)) continue;
        seen[k] = 1;
        stack.push(k);
      }
    }
  }
  return n;
}

/** Empty pixels not reachable from the border through empty pixels: holes inside the flesh. */
function holes(s: Sheet): number {
  const seen = new Uint8Array(s.w * s.h);
  const stack: number[] = [];
  const push = (k: number): void => {
    if (seen[k] || flesh(s.cells[k]!)) return;
    seen[k] = 1;
    stack.push(k);
  };
  for (let x = 0; x < s.w; x++) {
    push(x);
    push((s.h - 1) * s.w + x);
  }
  for (let y = 0; y < s.h; y++) {
    push(y * s.w);
    push(y * s.w + s.w - 1);
  }
  while (stack.length > 0) {
    const j = stack.pop()!;
    const x = j % s.w;
    const y = Math.floor(j / s.w);
    if (x > 0) push(j - 1);
    if (x < s.w - 1) push(j + 1);
    if (y > 0) push(j - s.w);
    if (y < s.h - 1) push(j + s.w);
  }
  let n = 0;
  for (let i = 0; i < s.cells.length; i++) if (!seen[i] && !flesh(s.cells[i]!)) n += 1;
  return n;
}

function filled(f: PixelFrame): number {
  let n = 0;
  for (const c of f.cells) if (flesh(c)) n += 1;
  return n;
}

describe("every kind has a sprite", () => {
  it("every segment kind maps to a limb sprite with root, middle and end in all eight directions", () => {
    for (const kind of Object.keys(SEGMENT_KINDS) as SegmentKind[]) {
      for (const girth of [1, 2, 4]) {
        const limb = limbKindOf(kind, girth);
        expect(SEGMENT_SPRITES[limb], `${kind} girth ${girth} -> ${limb}`).toBeDefined();
        for (const d of DIRS) {
          const s = segmentSprite(limb, d);
          expect(s.root.mask.rows.length, `${limb} dir ${d} root`).toBeGreaterThan(0);
          expect(s.mid.mask.rows.length, `${limb} dir ${d} mid`).toBeGreaterThan(0);
          expect(s.end.mask.rows.length, `${limb} dir ${d} end`).toBeGreaterThan(0);
          expect(Math.hypot(s.mid.advance.x, s.mid.advance.y), `${limb} dir ${d} advance`).toBeGreaterThan(0);
        }
      }
    }
    const kinds = Object.keys(SEGMENT_SPRITES) as LimbKind[];
    expect(kinds).toContain("arm");
    expect(kinds).toContain("armThick");
    expect(kinds).toContain("tentacle");
    expect(kinds).toContain("leg");
    expect(kinds).toContain("stalk");
    expect(kinds).toContain("tail");
    expect(kinds).toContain("torso");
    expect(kinds).toContain("belly");
  });

  it("every ending kind has a 16 px sprite in eight directions; the hand, the claw and the pincer are drawn on the diagonal by hand", () => {
    for (const kind of ENDING_KINDS) {
      expect(ENDING_SPRITES[kind], kind).toBeDefined();
      for (const d of DIRS) expect(endingSprite(kind, d).mask.rows.length, `${kind} dir ${d}`).toBe(SPRITE_SIZES.ending);
    }
    for (const kind of ["hand", "claw", "pincer", "foot", "hoof", "mouth", "sucker", "sting", "hook", "eye"] as const) expect(ENDING_SPRITES[kind]!.se, `${kind} diagonal`).toBeDefined();
  });

  it("every head kind has a face, a profile and the back of the head, with slots for eyes, mouth, nose, ears and brain", () => {
    for (const kind of HEAD_KINDS) {
      for (const view of VIEWS) {
        const h = HEAD_SPRITES[kind][view];
        expect(h.mask.w, `${kind} ${view}`).toBe(SPRITE_SIZES.head);
        expect(h.mask.h, `${kind} ${view}`).toBe(SPRITE_SIZES.head);
        if (view !== "back") {
          expect(h.eyes.length, `${kind} ${view} eyes`).toBeGreaterThanOrEqual(kind === "eyeless" ? 0 : 1);
          expect(h.mouth, `${kind} ${view} mouth`).toBeDefined();
        }
        expect(h.brain, `${kind} ${view} brain`).toBeDefined();
      }
    }
    expect(headKindOf([{ kind: "brain", instability: 0 }, { kind: "eye", instability: 0 }, { kind: "jaw", instability: 0 }])).toBe("human");
    expect(headKindOf([{ kind: "brain", instability: 0 }, { kind: "eye", instability: 0 }, { kind: "mandibles", instability: 0 }])).toBe("mandibles");
    expect(headKindOf([{ kind: "brain", instability: 0 }, { kind: "eye", instability: 0 }, { kind: "fangs", instability: 0 }])).toBe("long");
    expect(headKindOf([{ kind: "brain", instability: 0 }, { kind: "jaw", instability: 0 }])).toBe("eyeless");
    expect(headKindOf([{ kind: "eye", instability: 0 }, { kind: "jaw", instability: 0 }])).toBe("skull");
  });

  it("every organ with a visual has a spot; the named ones are drawn at 12 px; every cover has a tile", () => {
    for (const kind of Object.keys(ORGANS) as OrganKind[]) {
      const v = VISUALS[kind];
      if (v.hidden !== undefined) continue;
      expect(STAMPS[v.stamp], `${kind}: ${v.stamp}`).toBeDefined();
    }
    for (const name of ["eyeWhite", "ear", "nose", "mouth", "gland", "bubble", "tumour", "lump", "gill", "heart", "lungs", "stomach"]) {
      expect(STAMPS[name], name).toBeDefined();
      expect(STAMPS[name]!.some((s) => s.size === 12), `${name} at 12`).toBe(true);
    }
    for (const c of Object.keys(COVERS) as CoverId[]) {
      expect(TILES[c], c).toBeDefined();
      expect(TILES[c]!.w).toBe(SPRITE_SIZES.tile);
      expect(TILES[c]!.h).toBe(SPRITE_SIZES.tile);
    }
    expect(TILES.glow).toBeDefined();
  });
});

describe("masks are valid", () => {
  it("every mask is rectangular, in the roles, the size of its table row, and its contour closes except where the next part joins", () => {
    const problems = validateSprites();
    expect(problems, problems.join("\n")).toEqual([]);
  });

  it("limbs are 16 wide and 32 tall over the three parts; torsos 32 x 40 and 48 x 56; heads 24; endings 16; tiles 8", () => {
    for (const kind of ["arm", "leg", "tentacle", "tail", "stalk"] as LimbKind[]) {
      const s = SEGMENT_SPRITES[kind]!.s;
      expect(s.root.mask.w, kind).toBe(SPRITE_SIZES.limbWidth);
      expect(s.mid.mask.w, kind).toBe(SPRITE_SIZES.limbWidth);
      expect(s.end.mask.w, kind).toBe(SPRITE_SIZES.limbWidth);
      expect(s.root.mask.h + s.mid.mask.h + s.end.mask.h, kind).toBe(SPRITE_SIZES.limbHeight);
    }
    const torso = SEGMENT_SPRITES.torso!.s;
    expect(torso.root.mask.w).toBe(SPRITE_SIZES.torso[0]);
    expect(torso.root.mask.h + torso.mid.mask.h + torso.end.mask.h).toBe(SPRITE_SIZES.torso[1]);
    const belly = SEGMENT_SPRITES.belly!.s;
    expect(belly.root.mask.w).toBe(SPRITE_SIZES.belly[0]);
    expect(belly.root.mask.h + belly.mid.mask.h + belly.end.mask.h).toBe(SPRITE_SIZES.belly[1]);
    for (const kind of ENDING_KINDS) {
      expect(ENDING_SPRITES[kind]!.s.mask.w, kind).toBe(SPRITE_SIZES.ending);
      expect(ENDING_SPRITES[kind]!.s.mask.h, kind).toBe(SPRITE_SIZES.ending);
    }
  });

  it("maskProblems catches a ragged row, a stray role and an open contour", () => {
    const ragged: Mask = { w: 4, h: 2, rows: ["####", "###"] };
    expect(maskProblems("ragged", ragged, []).length).toBeGreaterThan(0);
    const stray: Mask = { w: 4, h: 2, rows: ["####", "#x##"] };
    expect(maskProblems("stray", stray, []).length).toBeGreaterThan(0);
    const open: Mask = { w: 4, h: 3, rows: ["####", "#22.", "####"] };
    expect(maskProblems("open", open, []).length).toBeGreaterThan(0);
    const closed: Mask = { w: 4, h: 3, rows: ["####", "#22#", "####"] };
    expect(maskProblems("closed", closed, [])).toEqual([]);
    const joins: Mask = { w: 4, h: 3, rows: ["#22#", "#22#", "####"] };
    expect(maskProblems("joins", joins, ["top"])).toEqual([]);
    expect(maskProblems("joins", joins, []).length).toBeGreaterThan(0);
  });

  it("the eight directions of a part are the drawn masks turned exactly: the same number of pixels of each role, light on the lit side", () => {
    for (const kind of Object.keys(SEGMENT_SPRITES) as LimbKind[]) {
      const count = (m: Mask): number => m.rows.join("").replace(/\./g, "").length;
      const s = segmentSprite(kind, 4);
      for (const d of DIRS) {
        const t = segmentSprite(kind, d);
        const drawnOnDiagonal = SEGMENT_SPRITES[kind]!.se !== undefined && d % 2 === 1;
        if (drawnOnDiagonal) continue;
        expect(count(t.root.mask), `${kind} dir ${d} root`).toBe(count(s.root.mask));
        expect(count(t.mid.mask), `${kind} dir ${d} mid`).toBe(count(s.mid.mask));
        expect(count(t.end.mask), `${kind} dir ${d} end`).toBe(count(s.end.mask));
      }
    }
  });
});

describe("body composes", () => {
  it("500 random bodies and the swamp mutant compose without holes in any part, every segment one piece, every body one piece", () => {
    const bodies = [...population(500), swampMutant(), human()];
    let segments = 0;
    for (const [i, b] of bodies.entries()) {
      const f = composeBody(b, { seed: i, t: 0.3, marks: false, shadow: false });
      expect(f.w, `body ${i} width`).toBeGreaterThan(16);
      expect(components(f), `body ${i} is in pieces`).toBe(1);
      let outside = 0;
      for (const c of f.cells) if (c >= PALETTE.length) outside += 1;
      expect(outside, `body ${i} leaves the palette`).toBe(0);
      // The border stays empty: nothing is clipped.
      for (let x = 0; x < f.w; x++) {
        expect(f.cells[x], `body ${i} top row`).toBe(0);
        expect(f.cells[(f.h - 1) * f.w + x], `body ${i} bottom row`).toBe(0);
      }
      for (let y = 0; y < f.h; y++) {
        expect(f.cells[y * f.w], `body ${i} left column`).toBe(0);
        expect(f.cells[y * f.w + f.w - 1], `body ${i} right column`).toBe(0);
      }
      segments += Object.keys(b.segments).length;
    }
    expect(segments).toBeGreaterThan(3000);
  });

  it("a segment of any kind, girth and cover, in any direction, at lengths 1 to 6, is one piece without holes and starts and ends at its nodes", () => {
    for (const kind of Object.keys(SEGMENT_KINDS) as SegmentKind[]) {
      for (const girth of [1, 3, 5]) {
        for (const cover of ["skin", "chitin", "chrome"] as CoverId[]) {
          for (const d of DIRS) {
            for (const len of [1, 2, 6]) {
              const s = segmentPixels(kind, girth, cover, d, len * 24);
              const label = `${kind} girth ${girth} ${cover} dir ${d} length ${len}`;
              expect(components(s), `${label}: pieces`).toBe(1);
              expect(holes(s), `${label}: holes`).toBe(0);
              // Both nodes are on flesh or on the outline.
              const at = (p: { x: number; y: number }): number => s.cells[Math.round(p.y) * s.w + Math.round(p.x)] ?? 0;
              expect(at(s.a) !== 0, `${label}: root node uncovered`).toBe(true);
              expect(at(s.b) !== 0, `${label}: far node uncovered`).toBe(true);
            }
          }
        }
      }
    }
  });

  it("an ending sits on its limb: the hand of the human touches the arm, in every direction", () => {
    for (const d of DIRS) {
      const s = segmentPixels("arm", 1, "skin", d, 40, "hand");
      expect(components(s), `dir ${d}`).toBe(1);
      // Between two fingers a pocket of a few pixels is the gap, not a hole in the flesh.
      expect(holes(s), `dir ${d}`).toBeLessThanOrEqual(6);
    }
  });
});

describe("mutation changes the frame", () => {
  it("every mutation of the catalog changes the picture of the human (the hidden ones excepted); an organ inside, the x-ray of it", () => {
    const before = renderPixels(human(), { px: 96, seed: 1, t: 0 });
    const xray = renderPixels(human(), { px: 96, seed: 1, t: 0, insides: true });
    let changed = 0;
    let skipped = 0;
    for (const m of MUTATIONS) {
      if (mutationVisual(m).kind === "hidden") {
        skipped += 1;
        continue;
      }
      const b = human();
      const r = applyMutation(b, m, new LabRng(7), { spread: true, source: "abyss" });
      expect(r, m.id).not.toBeNull();
      const after = renderPixels(b, { px: 96, seed: 1, t: 0 });
      // A body is seen from outside: an organ that grew inside a cavity shows only on the x-ray.
      const inside = m.op === "organ" && ["cavity", "head"].includes((m.payload as { mount?: string }).mount ?? "");
      if (inside && !framesDiffer(before, after)) expect(framesDiffer(xray, renderPixels(b, { px: 96, seed: 1, t: 0, insides: true })), `${m.id} (${r!.op}) leaves the x-ray as it was`).toBe(true);
      else expect(framesDiffer(before, after), `${m.id} (${r!.op}) leaves the picture as it was`).toBe(true);
      changed += 1;
    }
    expect(changed + skipped).toBe(MUTATIONS.length);
    expect(skipped).toBeLessThanOrEqual(6);
  });
});

describe("a limb off the eight directions", () => {
  it("is one straight tube at any angle: its width across the axis barely changes along it, no staircase of pieces", () => {
    const flesh = (v: number): boolean => v !== 0 && v !== SHADOW;
    for (const kind of ["leg", "arm", "tentacle", "tail"] as SegmentKind[]) {
      for (const girth of [1, 2]) {
        for (let deg = 0; deg < 360; deg += 7) {
          const angle = (deg * Math.PI) / 180;
          const s = segmentPixels(kind, girth, "skin", 4, 120, undefined, angle);
          const ux = Math.cos(angle);
          const uy = Math.sin(angle);
          const widths: number[] = [];
          // Cross-sections through the middle half of the segment, away from the caps.
          for (let f = 0.3; f <= 0.7; f += 0.02) {
            const cx = s.a.x + (s.b.x - s.a.x) * f;
            const cy = s.a.y + (s.b.y - s.a.y) * f;
            let w = 0;
            for (let d = -20; d <= 20; d += 0.25) {
              const x = Math.floor(cx - uy * d);
              const y = Math.floor(cy + ux * d);
              if (flesh(s.cells[y * s.w + x] ?? 0)) w += 0.25;
            }
            widths.push(w);
          }
          const spread = Math.max(...widths) - Math.min(...widths);
          expect(spread, `${kind} girth ${girth} at ${deg}°: widths ${widths.map((w) => w.toFixed(1)).join(" ")}`).toBeLessThanOrEqual(3);
        }
      }
    }
  });
});

describe("stretch keeps the shape", () => {
  it("a segment of length 1 and of length 6 differ only in the length of the middle: the same root cap and the same end cap", () => {
    for (const kind of Object.keys(SEGMENT_KINDS) as SegmentKind[]) {
      for (const d of DIRS) {
        // Long enough for the two caps not to overlap each other even on the diagonal of a torso.
        const short = segmentPixels(kind, 1, "skin", d, 64);
        const long = segmentPixels(kind, 1, "skin", d, 150);
        const limb = limbKindOf(kind, 1);
        const sp = segmentSprite(limb, d);
        const rootLen = Math.max(sp.root.mask.w, sp.root.mask.h);
        const endLen = Math.max(sp.end.mask.w, sp.end.mask.h);
        // Around the root node, the same pixels relative to it; around the far node, the same pixels relative to it.
        const same = (p: { x: number; y: number }, q: { x: number; y: number }, r: number): number => {
          let diff = 0;
          for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
              const u = short.cells[(Math.round(p.y) + dy) * short.w + Math.round(p.x) + dx] ?? 0;
              const v = long.cells[(Math.round(q.y) + dy) * long.w + Math.round(q.x) + dx] ?? 0;
              // The shape, not the tone: a contour over the middle is dark, over nothing black.
              if ((u !== 0) !== (v !== 0)) diff += 1;
            }
          }
          return diff;
        };
        // Two pixels of slack: where the last middle is cut, a seam pixel may or may not be sealed.
        expect(same(short.a, long.a, Math.floor(rootLen / 3)), `${kind} dir ${d}: root cap changed`).toBeLessThanOrEqual(2);
        expect(same(short.b, long.b, Math.floor(endLen / 3)), `${kind} dir ${d}: end cap changed`).toBeLessThanOrEqual(2);
        // The long one has more flesh, by the middle and nothing else.
        let ns = 0;
        let nl = 0;
        for (const c of short.cells) if (c !== 0) ns += 1;
        for (const c of long.cells) if (c !== 0) nl += 1;
        expect(nl, `${kind} dir ${d}`).toBeGreaterThan(ns);
      }
    }
  });
});

describe("sprite budget", () => {
  // "a 96 px frame ... in a millisecond on average" moved to packages/view/bench/sprites.test.ts (D.2).

  it("the atlas of masks is under 200 KB", () => {
    const bytes = atlasBytes();
    console.log(`sprite atlas: ${(bytes / 1024).toFixed(0)} KB`);
    expect(bytes).toBeLessThanOrEqual(200 * 1024);
    expect(bytes).toBeGreaterThan(20 * 1024);
  });

  it("fitFrame keeps the silhouette closed and the outline count when it shrinks a native frame into 96 and 32", () => {
    const f = composeBody(human(), { seed: 1, t: 0 });
    for (const px of [96, 32]) {
      const g = fitFrame(f, px);
      expect(g.w).toBe(px);
      expect(g.h).toBe(px);
      expect(filled(g)).toBeGreaterThan(px === 32 ? 60 : 400);
      let open = 0;
      for (let y = 0; y < g.h; y++) {
        for (let x = 0; x < g.w; x++) {
          const v = g.cells[y * g.w + x]!;
          if (!flesh(v) || v === OUTLINE) continue;
          for (const [nx, ny] of [
            [x - 1, y],
            [x + 1, y],
            [x, y - 1],
            [x, y + 1],
          ]) {
            if (nx! < 0 || ny! < 0 || nx! >= g.w || ny! >= g.h) continue;
            if (!flesh(g.cells[ny! * g.w + nx!]!)) open += 1;
          }
        }
      }
      expect(open, `${px}: open silhouette`).toBe(0);
    }
  });
});

describe("head drawing", () => {
  it("a head with any kind of brain is a face, not a skull", async () => {
    const { BRAIN_KINDS } = await import("@mutant-engine/core");
    const { headKindOf } = await import("../index.js");
    for (const kind of BRAIN_KINDS) expect(headKindOf([{ kind, instability: 0 }] as never)).not.toBe("skull");
    expect(headKindOf([])).toBe("skull");
  });
});
