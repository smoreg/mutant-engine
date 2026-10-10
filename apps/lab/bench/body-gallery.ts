/**
 * A gallery of bodies to look at with your own eyes: the human, the mutant
 * from the Swamp and random bodies grown from the human by 5..40 operations,
 * each with its silhouette, its 32 px sprite, its numbers and its text
 * fixture. One self-contained html file, no external resources, the dark
 * palette of design/_ds.css.
 *
 *   npm run gallery            -> out/body-gallery.html
 *   npm run gallery -- 120     -> 120 bodies
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { blocks, drawnLength, layout, polylineLength, silhouetteSvg, spritePlan, type Layout, type SpritePlan } from "@mutant-engine/view";
import {
  SWAMP_IDS,
  setSway,
  bodyToText,
  bridges,
  closure,
  controlCap,
  controlLoad,
  human,
  humanoid,
  mass,
  nodeIds,
  segmentIds,
  swampMutant,
  territories,
  upkeep,
  type Body,
} from "@mutant-engine/core";
import { randomBody } from "../../../packages/core/tests/gen.js";

interface GalleryEntry {
  title: string;
  seed: number | null;
  ops: number;
  body: Body;
}

interface GalleryCard extends GalleryEntry {
  layout: Layout;
  reasons: string[];
}

interface GalleryResult {
  bodies: number;
  ms: number;
  path: string;
  unreadable: { title: string; reasons: string[] }[];
}

/** The mutant of §7 with the second head at the given sway: at 4 its territory takes the pelvis and the legs. */
function swampMutantWithSway(sway: number): Body {
  const b = swampMutant();
  setSway(b, { node: SWAMP_IDS.shoulder2, end: 0 }, sway);
  return b;
}

/** Operations a gallery seed is grown by: 5..40, spread over the seeds. */
export function galleryOps(seed: number): number {
  return 5 + ((seed - 1) * 7) % 36;
}

/** The human, the mutant, then random bodies with 5..40 operations spread over the seeds. */
function galleryBodies(count = 60): GalleryEntry[] {
  const out: GalleryEntry[] = [
    { title: "человек", seed: null, ops: 0, body: human() },
    { title: "мутант из Топи", seed: null, ops: 0, body: swampMutantWithSway(4) },
  ];
  for (let seed = 1; out.length < count; seed++) {
    const ops = galleryOps(seed);
    out.push({ title: `сид ${seed}`, seed, ops, body: randomBody(seed, ops) });
  }
  return out;
}

/** Segments drawn outside a tenth of their length on the layout's scale. */
export function offByTenth(body: Body, l: Layout): number {
  let off = 0;
  for (const s of l.segments) {
    const want = drawnLength(body.segments[s.id]!.length, l.scale);
    const got = polylineLength(s.points);
    if (got < 0.9 * want - 1e-9 || got > 1.1 * want + 1e-9) off += 1;
  }
  return off;
}

/** What the layout itself knows is wrong with a picture. */
export function flag(body: Body, l: Layout): string[] {
  const reasons: string[] = [];
  const c = closure(body);
  if (l.crossings > c) reasons.push(`пересечений ${l.crossings} при замкнутости ${c}`);
  if (l.collisions > 0) reasons.push(`заторов ${l.collisions}`);
  const off = offByTenth(body, l);
  if (off > 0) reasons.push(`сегментов вне ±10 % длины: ${off}`);
  return reasons;
}

/** The larger side of the picture in drawn units: what the sidebar's 220 px have to hold. */
export function frameOf(l: Layout): number {
  return Math.max(l.bbox.x1 - l.bbox.x0, l.bbox.y1 - l.bbox.y0);
}

/** The complaints of step E as numbers: what E2 measures a picture by, old or new. */
interface Legibility {
  collisions: number;
  crossingsOver: number;
  offByTenth: number;
  frame: number;
  nodes: number;
  /** Cycle blocks whose centroid sits above the node they hang from. */
  ringsAbove: number;
  /** Nodes of cycle blocks above your head. */
  ringNodesAboveHead: number;
  /** Your head's distance from the middle of the frame, as a share of its width. */
  headOffset: number;
  score: number;
}

export function legibility(body: Body, l: Layout): Legibility {
  const at = new Map(l.nodes.map((n) => [n.id, n]));
  const index = new Map(l.order.map((id, i) => [id, i]));
  const root = at.get(l.order[0]!);
  let ringsAbove = 0;
  let ringNodesAboveHead = 0;
  for (const block of blocks(body)) {
    if (block.length < 2) continue;
    const ns = new Set<number>();
    for (const id of block) {
      ns.add(body.segments[id]!.a);
      ns.add(body.segments[id]!.b);
    }
    const ids = [...ns].filter((id) => at.has(id));
    if (ids.length === 0) continue;
    const entry = ids.reduce((best, id) => ((index.get(id) ?? Infinity) < (index.get(best) ?? Infinity) ? id : best));
    const cy = ids.reduce((sum, id) => sum + at.get(id)!.y, 0) / ids.length;
    if (cy < at.get(entry)!.y - 1e-9) ringsAbove += 1;
    if (root !== undefined) for (const id of ids) if (at.get(id)!.y < root.y - 1e-9) ringNodesAboveHead += 1;
  }
  const width = l.bbox.x1 - l.bbox.x0;
  const headOffset = root === undefined || width < 1e-9 ? 0 : Math.abs(root.x - (l.bbox.x0 + l.bbox.x1) / 2) / width;
  const out: Legibility = {
    collisions: l.collisions,
    crossingsOver: Math.max(0, l.crossings - closure(body)),
    offByTenth: offByTenth(body, l),
    frame: frameOf(l),
    nodes: nodeIds(body).length,
    ringsAbove,
    ringNodesAboveHead,
    headOffset,
    score: 0,
  };
  out.score =
    3 * out.collisions +
    2 * out.crossingsOver +
    out.offByTenth +
    Math.max(0, out.frame - 12) +
    (out.nodes >= 25 ? 2 : 0) +
    2 * out.ringsAbove +
    out.ringNodesAboveHead +
    (out.headOffset > 0.25 ? 2 : 0);
  return out;
}

function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The sprite as crisp rects, one per run of equal pixels in a row. */
export function spriteSvg(plan: SpritePlan, cell = 3): string {
  const size = plan.px * cell;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${plan.px} ${plan.px}" shape-rendering="crispEdges" class="sprite">`];
  for (let y = 0; y < plan.px; y++) {
    let x = 0;
    while (x < plan.px) {
      const v = plan.cells[y * plan.px + x]!;
      let run = 1;
      while (x + run < plan.px && plan.cells[y * plan.px + x + run] === v) run += 1;
      if (v !== 0) parts.push(`<rect x="${x}" y="${y}" width="${run}" height="1" fill="${plan.palette[v]!.color}"/>`);
      x += run;
    }
  }
  parts.push("</svg>");
  return parts.join("");
}

function card(c: GalleryCard, index: number): string {
  const b = c.body;
  const membranes = Object.values(b.membranes).map((m) => `перепонка ${m.id}: ${m.kind} на цикле ${m.cycle.join("–")}, площадь ${m.area}`);
  const text = bodyToText(b) + (membranes.length > 0 ? `\n${membranes.join("\n")}\n` : "");
  const flagged = c.reasons.length > 0;
  const sub = c.seed === null ? "фикстура §2 / §7" : `${c.ops} операций`;
  const metrics = [
    ["узлы", `${nodeIds(b).length}`],
    ["сегменты", `${segmentIds(b).length}`],
    ["масса", `${mass(b)} / ${b.meat >= 1000 ? "∞" : b.meat}`],
    ["обмен", `${upkeep(b)}`],
    ["контроль", `${controlLoad(b)} / ${controlCap(b)}`],
    ["замкнутость", `${closure(b)}`],
    ["мосты", `${bridges(b).length}`],
    ["пересечения", `${c.layout.crossings}`],
    ["мозги", `${territories(b).length}`],
    ["человечность", `${humanoid(b).toFixed(2)}`],
  ];
  return `<article class="card${flagged ? " flagged" : ""}" id="b${index}">
<header><span class="n">${index + 1}</span><h2>${escape(c.title)}</h2><span class="sub">${escape(sub)}</span>${flagged ? `<span class="tag">!</span>` : ""}</header>
<div class="pic">${silhouetteSvg(b, { size: 220, layout: c.layout, territories: territories(b).filter((t) => !t.brain.self) })}<div class="tile">${spriteSvg(spritePlan(b, 32, { layout: c.layout }))}</div></div>
<dl class="metrics">${metrics.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
${flagged ? `<p class="why">${c.reasons.map(escape).join(" · ")}</p>` : ""}
<details><summary>фикстура</summary><pre>${escape(text)}</pre></details>
</article>`;
}

const STYLE = `
:root{--ink-0:#0b0a09;--ink-1:#14110e;--ink-2:#1c1814;--ink-3:#28221c;--line:#3b3127;--line-soft:#261f19;--paper:#e9dec9;--paper-2:#b4a890;--paper-3:#938775;--amber:#cf9550;--flesh:#c4493b;--flesh-soft:#4a211b;--bile:#d3a947;--ok:#8bab6c;--chrome:#7fa8ba;--bio:#5fd4b1;--f-serif:'PT Serif',Georgia,serif;--f-sans:'IBM Plex Sans',system-ui,sans-serif;--f-mono:'IBM Plex Mono',ui-monospace,monospace}
*{box-sizing:border-box}
body{margin:0;background:var(--ink-0);color:var(--paper);font:400 14px/1.45 var(--f-sans);padding:24px 28px 60px}
h1{font:700 30px/1.15 var(--f-serif);margin:0 0 6px}
.lead{color:var(--paper-2);max-width:900px;margin:0 0 18px}
.lead b{color:var(--paper)}
.legend{display:flex;flex-wrap:wrap;gap:8px 18px;color:var(--paper-3);font-size:12px;margin:0 0 22px}
.legend i{display:inline-block;width:10px;height:10px;border-radius:5px;vertical-align:-1px;margin-right:6px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
.card{background:var(--ink-1);border:1px solid var(--line);border-radius:6px;padding:12px 14px;display:flex;flex-direction:column;gap:8px}
.card.flagged{border-color:var(--flesh)}
.card header{display:flex;align-items:baseline;gap:10px}
.card h2{font:700 17px/1.2 var(--f-serif);margin:0}
.card .n{font:500 12px var(--f-mono);color:var(--paper-3);min-width:22px}
.card .sub{color:var(--paper-3);font-size:12px;margin-left:auto}
.tag{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:9px;background:var(--flesh);color:var(--ink-0);font:700 11px var(--f-mono)}
.pic{position:relative;background:var(--ink-2);border:1px solid var(--line-soft);border-radius:4px;display:flex;justify-content:center;padding:6px;min-height:200px}
.pic svg.silhouette{max-width:100%;height:auto;max-height:280px}
.tile{position:absolute;right:6px;bottom:6px;background:var(--ink-0);border:1px solid var(--line);padding:2px;line-height:0}
.metrics{display:grid;grid-template-columns:auto 1fr auto 1fr;gap:2px 10px;margin:0;font-size:12px}
.metrics dt{color:var(--paper-3)}
.metrics dd{margin:0;font-family:var(--f-mono);font-variant-numeric:tabular-nums}
.why{margin:0;color:var(--flesh);font-size:12px}
details{font-size:12px;color:var(--paper-3)}
details pre{margin:6px 0 0;padding:8px 10px;background:var(--ink-0);border:1px solid var(--line-soft);border-radius:4px;color:var(--paper-2);font:400 11px/1.4 var(--f-mono);white-space:pre;overflow:auto}
summary{cursor:pointer}
.flags{margin:0 0 20px;padding:10px 14px;background:var(--ink-1);border:1px solid var(--line);border-radius:6px;font-size:13px}
.flags a{color:var(--amber);text-decoration:none}
`;

function galleryHtml(entries: GalleryEntry[]): { html: string; unreadable: { title: string; reasons: string[] }[] } {
  const cards: GalleryCard[] = entries.map((e) => {
    const l = layout(e.body);
    return { ...e, layout: l, reasons: flag(e.body, l) };
  });
  const unreadable = cards.filter((c) => c.reasons.length > 0).map((c) => ({ title: c.title, reasons: c.reasons }));
  const flagsHtml =
    unreadable.length === 0
      ? `<p class="flags">Укладка ни на одно тело не жалуется.</p>`
      : `<p class="flags">Укладка жалуется на ${unreadable.length} из ${cards.length}: ${cards
          .map((c, i) => (c.reasons.length > 0 ? `<a href="#b${i}">${i + 1}</a>` : ""))
          .filter((s) => s.length > 0)
          .join(", ")}. Остальные смотреть глазами.</p>`;
  const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>mutant-engine — галерея тел</title><style>${STYLE}</style></head>
<body>
<h1>Галерея тел</h1>
<p class="lead">${cards.length} тел: <b>человек</b>, <b>мутант из Топи</b> (§7) и случайные тела, выращенные из человека 5–40 операциями на сиде. Силуэт — <code>silhouetteSvg</code>, плитка в углу — <code>spritePlan</code> 32 px ×3. Красная рамка — укладка сама знает, что картинка не сошлась.</p>
<div class="legend"><span><i style="background:#cf9550"></i>твой мозг</span><span><i style="background:#b58ad0"></i>чужой мозг</span><span><i style="background:#d2a07e"></i>голова</span><span><i style="background:#b98b6e"></i>кожа</span><span><i style="background:#8c6a3f"></i>хитин</span><span><i style="background:#6d8f86"></i>чешуя</span><span><i style="background:#6fae7f"></i>слизь</span><span><i style="background:#a8636d"></i>присоски</span><span><i style="background:#7fa8ba"></i>хром</span><span><i style="background:#5fd4b1"></i>перепонка</span><span><i style="background:#c4493b"></i>сердце · пасть · рана</span><span>┄ плоскость разлома на мосту</span><span>подложка — территория чужого мозга (§7)</span></div>
${flagsHtml}
<section class="grid">
${cards.map(card).join("\n")}
</section>
</body></html>
`;
  return { html, unreadable };
}

export function buildGallery(outPath: string, count = 60): GalleryResult {
  const t0 = performance.now();
  const { html, unreadable } = galleryHtml(galleryBodies(count));
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html, "utf8");
  return { bodies: count, ms: performance.now() - t0, path: outPath, unreadable };
}

// vite-node drops the script from argv, so only the test runner marks an import that must not build.
if (process.env.VITEST === undefined) {
  const count = Number(process.argv[2]);
  const result = buildGallery(resolve("out/body-gallery.html"), Number.isInteger(count) && count > 0 ? count : 60);
  console.log(`${result.path}: ${result.bodies} bodies in ${result.ms.toFixed(0)} ms; flagged ${result.unreadable.length}`);
  for (const u of result.unreadable) console.log(`  ${u.title}: ${u.reasons.join("; ")}`);
}
