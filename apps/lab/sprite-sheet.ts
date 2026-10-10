/**
 * The sheet of every drawn sprite and a few bodies made of them, as one
 * static page of crisp svg rects: every limb piece in its two drawings and
 * its eight directions, the torsos, the heads, the endings, the organ spots,
 * the cover tiles; then the human, the swamp mutant and three bodies after
 * thirty strikes of the abyss, at the sprites' own scale and as 96 px tiles.
 *
 *   npm run sheet   -> out/sprite-sheet.html
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  DIRS,
  ENDING_SPRITES,
  HEAD_SPRITES,
  RAMPS,
  SEGMENT_SPRITES,
  STAMPS,
  TILES,
  composeBody,
  endingSprite,
  fitFrame,
  frameSvg,
  layout,
  segmentPixels,
  type LimbKind,
} from "@mutant-engine/view";
import { ORGAN_SIZES, ORGAN_SIZE_TABLE, SIZED_ORGANS, human, swampMutant, type Body, type SegmentKind } from "@mutant-engine/core";
import { growMutant } from "./living/grow.js";
import { frameOf, maskFrame, tilePatch } from "./mask-frame.js";

function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function tile(label: string, svg: string): string {
  return `<figure><div class="pix">${svg}</div><figcaption>${escape(label)}</figcaption></figure>`;
}

function section(title: string, note: string, tiles: string[]): string {
  return `<section><h2>${escape(title)}</h2><p class="note">${escape(note)}</p><div class="row">${tiles.join("")}</div></section>`;
}

function sheetHtml(): string {
  const skin = RAMPS.skin;
  const parts: string[] = [];

  // Limbs: the two drawings and the eight directions of every kind, each part on its own.
  const limbTiles: string[] = [];
  for (const kind of Object.keys(SEGMENT_SPRITES) as LimbKind[]) {
    const drawn = SEGMENT_SPRITES[kind]!;
    for (const [label, s] of [
      ["S", drawn.s],
      ["SE", drawn.se],
    ] as const) {
      if (s === undefined) continue;
      limbTiles.push(tile(`${kind} ${label} root`, frameSvg(maskFrame(s.root.mask, skin), 3)), tile(`${kind} ${label} mid`, frameSvg(maskFrame(s.mid.mask, skin), 3)), tile(`${kind} ${label} end`, frameSvg(maskFrame(s.end.mask, skin), 3)));
    }
  }
  parts.push(section("Конечности и корпуса: рисунки", "Каждый вид сегмента — три части: корень с суставом, растяжимая середина, конец. Нарисованы вниз (S) и вниз-вправо (SE); свет слева сверху.", limbTiles));

  const dirTiles: string[] = [];
  const shown: { limb: LimbKind; kind: SegmentKind; girth: number; length: number }[] = [
    { limb: "arm", kind: "arm", girth: 1, length: 44 },
    { limb: "leg", kind: "leg", girth: 1, length: 44 },
    { limb: "tentacle", kind: "tentacle", girth: 1, length: 44 },
    { limb: "tail", kind: "tail", girth: 1, length: 44 },
    { limb: "stalk", kind: "stalk", girth: 1, length: 44 },
    { limb: "neck", kind: "neck", girth: 1, length: 44 },
    { limb: "armThick", kind: "arm", girth: 2, length: 44 },
    { limb: "torso", kind: "torso", girth: 3, length: 60 },
    { limb: "belly", kind: "torso", girth: 4, length: 70 },
  ];
  for (const { limb, kind, girth, length } of shown) {
    for (const d of DIRS) {
      const s = segmentPixels(kind, girth, "skin", d, length);
      dirTiles.push(tile(`${limb} ${["N", "NE", "E", "SE", "S", "SW", "W", "NW"][d]}`, frameSvg(fitFrame(frameOf(s), 96), 2)));
    }
  }
  parts.push(section("Восемь направлений", "Шесть остальных направлений — точные повороты двух рисунков; свет переносится на сторону, обращённую к лампе. Сегмент длины 44 px (корпус 60).", dirTiles));

  const headTiles: string[] = [];
  for (const [kind, views] of Object.entries(HEAD_SPRITES)) for (const [view, h] of Object.entries(views)) headTiles.push(tile(`${kind} ${view}`, frameSvg(maskFrame(h.mask, skin), 3)));
  parts.push(section("Головы 24 × 24", "Человеческая, вытянутая, черепная, безглазая, жвалы; фас, профиль (левый — зеркало), затылок. Глаза, рот, нос, уши и мозг — пятна на слотах головы.", headTiles));

  const endingTiles: string[] = [];
  for (const [kind, drawn] of Object.entries(ENDING_SPRITES)) {
    endingTiles.push(tile(`${kind} S`, frameSvg(maskFrame(drawn!.s.mask, skin), 3)));
    if (drawn!.se !== undefined) endingTiles.push(tile(`${kind} SE`, frameSvg(maskFrame(drawn!.se.mask, skin), 3)));
  }
  parts.push(section("Окончания 16 × 16", "Конечность приходит сверху (S) или из левого верхнего угла (SE).", endingTiles));

  // Размерные ступени (решение 140): один и тот же штамп, честно перерисованный ближайшим пикселем.
  const sizeTiles: string[] = [];
  for (const kind of SIZED_ORGANS) {
    if (ENDING_SPRITES[kind] === undefined) continue;
    for (const size of ORGAN_SIZES) {
      const row = ORGAN_SIZE_TABLE[kind][size];
      sizeTiles.push(tile(`${row.ru} · ${row.mass} · ${row.attack === "" ? "—" : row.attack}`, frameSvg(maskFrame(endingSprite(kind, 4, row.sprite).mask, skin), 3)));
    }
  }
  parts.push(
    section(
      "Размерные ступени окончаний",
      "Малая, обычная, огромная: тот же рисунок 16 × 16 в 0.75 / 1 / 1.5 своего размера. Под каждой — название ступени, масса и кубик из таблицы packages/core/sizes.ts.",
      sizeTiles,
    ),
  );

  const endingDirs: string[] = [];
  for (const kind of ["hand", "claw", "pincer", "foot", "mouth", "eye"] as const) for (const d of DIRS) endingDirs.push(tile(`${kind} ${["N", "NE", "E", "SE", "S", "SW", "W", "NW"][d]}`, frameSvg(maskFrame(endingSprite(kind, d).mask, skin), 3)));
  parts.push(section("Окончания по направлениям", "", endingDirs));

  const spotTiles: string[] = [];
  for (const [name, list] of Object.entries(STAMPS)) for (const st of list) spotTiles.push(tile(`${name} ${st.size}`, frameSvg(maskFrame({ w: st.size, h: st.size, rows: st.rows }, name === "heart" || name === "mouth" ? RAMPS.flesh : name === "lungs" ? RAMPS.bone : name === "stomach" ? RAMPS.gut : RAMPS.head), 3)));
  parts.push(section("Органы-пятна 8 и 12", "Глаз (белок; зрачок ставит кадр по взгляду — круглый, щель, точка), ухо, нос, рот с зубами, железа, пузырь, опухоль, нарост, жабра, сердце, лёгкие, желудок и остальные штампы атласа.", spotTiles));

  const tileTiles: string[] = [];
  for (const [cover, m] of Object.entries(TILES)) {
    tileTiles.push(tile(cover, frameSvg(maskFrame(tilePatch(m), RAMPS[cover as keyof typeof RAMPS] ?? RAMPS.bio), 3)));
  }
  parts.push(section("Покровы: плитки 8 × 8", "Плитка ложится поверх базового тона сегмента в координатах кадра, так что узор идёт через стыки без шва.", tileTiles));

  // Bodies.
  const bodies: { label: string; body: Body }[] = [
    { label: "человек", body: human() },
    { label: "мутант из Топи", body: swampMutant() },
    ...[1, 2, 3].map((seed) => {
      const m = growMutant({ seed, source: "abyss", count: 30 });
      return { label: `бездна ×30, сид ${seed}`, body: m.body };
    }),
  ];
  const bodyTiles: string[] = [];
  const tileTiles96: string[] = [];
  for (const { label, body } of bodies) {
    const l = layout(body, { scale: "sqrt" });
    const f = composeBody(body, { layout: l, seed: 1, t: 0.4 });
    bodyTiles.push(tile(`${label} · ${f.w}×${f.h}`, frameSvg(fitFrame(f, Math.max(f.w, f.h)), 2)));
    tileTiles96.push(tile(`${label} · 96`, frameSvg(fitFrame(f, 96), 3)), tile(`${label} · 64`, frameSvg(fitFrame(f, 64), 3)), tile(`${label} · 32`, frameSvg(fitFrame(f, 32), 3)));
  }
  parts.push(section("Тела в масштабе спрайтов", "Человек, мутант из Топи, три тела после тридцати ударов бездны; кадр ×2.", bodyTiles));
  parts.push(section("Те же тела тайлами 96 · 64 · 32", "Уменьшение ближайшим соседом; тонкая часть оставляет контур; силуэт замыкается заново. ×3.", tileTiles96));

  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>mutant-engine — лист спрайтов тела</title>
<style>
body{margin:0;background:#0b0a09;color:#e9dec9;font:14px/1.45 "IBM Plex Sans",system-ui,sans-serif;padding:20px 24px 60px}
h1{font:700 28px/1.15 "PT Serif",Georgia,serif;margin:0 0 6px}
h2{font:700 17px/1.2 "PT Serif",Georgia,serif;margin:22px 0 4px}
.note{color:#b4a890;margin:0 0 10px;max-width:900px}
.row{display:flex;flex-wrap:wrap;gap:10px 12px;align-items:flex-end}
figure{margin:0;display:flex;flex-direction:column;align-items:center;gap:3px}
.pix{background:#14110e;border:1px solid #261f19;line-height:0}
.pix svg{display:block;shape-rendering:crispEdges}
figcaption{font-size:11px;color:#938775;font-family:"IBM Plex Mono",ui-monospace,monospace;max-width:220px;text-align:center}
</style></head><body>
<h1>Лист спрайтов тела</h1>
<p class="note">Шаг L: каждая часть тела — нарисованная маска строками в коде, один источник правды для крупного вида и для тайла 32 / 64 / 96.</p>
${parts.join("\n")}
</body></html>`;
}

if (process.env.VITEST === undefined) {
  const out = resolve("out/sprite-sheet.html");
  mkdirSync(dirname(out), { recursive: true });
  const html = sheetHtml();
  writeFileSync(out, html, "utf8");
  console.log(`${out}: ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB`);
}
