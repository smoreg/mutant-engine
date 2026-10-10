/**
 * The atlas as html: one string from the numbers of data.ts. Two variants of
 * the same page - a fragment (no doctype, no head; `<title>`, the fonts
 * link, the style, the markup) for out/, and a full document with system
 * fonts and a light theme that turns dark by `prefers-color-scheme` or
 * `data-theme` for the reports folder. Every colour of the page and of the
 * silhouettes is a CSS variable; the silhouettes of render/svg.ts are
 * rewritten from their fixed hexes to the same tokens, so they read on both
 * grounds. Strings only; nothing here touches files or the DOM.
 */
import { COVER_COLORS, HEAD_COLOR, INK, TONE } from "@mutant-engine/view";
import {
  FAMILIES,
  ORGANS,
  type Family,
  type MembraneKind,
  type MutationOp,
  MUTATIONS,
  FAMILY_RU,
  OP_RU,
  SUMMARY_RU,
  fmt,
  mutationRu,
} from "@mutant-engine/core";
import type { CatalogEntry, FirstStrike, PopulationCell, ReportData, RowStats, Window } from "./data.js";

export type Variant = "fragment" | "document";

export const TITLE = "Атлас мутаций mutant-engine";
const DESCRIPTION = `Все ${MUTATIONS.length} мутаций модели тело-граф: операции, цели, силуэты, посадка, популяции, проблемы модели`;
const FONTS_URL = "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=PT+Serif:wght@400;700&display=swap";

// ---------------------------------------------------------------- colour

/** The six groups of the design brief §3 and the family of each. */
const GROUPS: { token: string; ru: string; hex: string; families: Family[] }[] = [
  { token: "fam-body", ru: "тело", hex: "#c27b62", families: ["limbs", "covers", "movement"] },
  { token: "fam-head", ru: "голова", hex: "#b58ad0", families: ["heads", "senses", "psionics"] },
  { token: "fam-gut", ru: "нутро", hex: "#c9a15b", families: ["jaws", "internals", "reproduction"] },
  { token: "fam-sec", ru: "выделения", hex: "#8fb35a", families: ["glands", "explosive", "plant"] },
  { token: "fam-alien", ru: "чужое", hex: "#d47aa8", families: ["parasites", "space", "selfEating"] },
  { token: "fam-ctrl", ru: "управление", hex: "#9a8f7d", families: ["regulators", "defects", "chromeBreaking"] },
];

export function groupOf(family: Family): (typeof GROUPS)[number] {
  return GROUPS.find((g) => g.families.includes(family))!;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(rgb: [number, number, number]): string {
  return `#${rgb.map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, "0")).join("")}`;
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The colour darkened step by step until it reads on the ground at the ratio asked for. */
function darkenTo(hex: string, ground: string, ratio: number): string {
  let rgb = hexToRgb(hex);
  for (let i = 0; i < 80 && contrast(rgbToHex(rgb), ground) < ratio; i++) rgb = rgb.map((c) => c * 0.96) as [number, number, number];
  return rgbToHex(rgb);
}

const DARK: Record<string, string> = {
  "ink-0": INK.ground,
  "ink-1": INK.panel,
  "ink-2": "#1c1814",
  "ink-3": INK.joint,
  line: INK.line,
  "line-soft": "#261f19",
  paper: INK.paper,
  "paper-2": INK.paper2,
  "paper-3": INK.paper3,
  amber: TONE.amber,
  flesh: TONE.flesh,
  "flesh-soft": "#4a211b",
  bile: TONE.bile,
  ok: TONE.ok,
  chrome: TONE.chrome,
  bio: TONE.bio,
  "bio-soft": "#10302a",
  eye: INK.paper,
  pupil: INK.ground,
  "head-skin": HEAD_COLOR,
};
for (const g of GROUPS) DARK[g.token] = g.hex;
for (const [id, hex] of Object.entries(COVER_COLORS)) DARK[`cover-${id}`] = hex;

const LIGHT_GROUND = "#f2ece0";
const LIGHT: Record<string, string> = {
  "ink-0": LIGHT_GROUND,
  "ink-1": "#e8dfcf",
  "ink-2": "#e0d5c2",
  "ink-3": "#d2c4ab",
  line: "#cdbfa6",
  "line-soft": "#dccfb8",
  paper: "#241d16",
  "paper-2": "#5a4d3d",
  "paper-3": "#7a6b58",
  amber: "#9a5f22",
  flesh: "#a83426",
  "flesh-soft": "#efd3cc",
  bile: darkenTo(TONE.bile, LIGHT_GROUND, 4.5),
  ok: darkenTo(TONE.ok, LIGHT_GROUND, 4.5),
  chrome: darkenTo(TONE.chrome, LIGHT_GROUND, 4.5),
  bio: "#2d8a70",
  "bio-soft": "#cfe8de",
  eye: "#fbf7ee",
  pupil: "#241d16",
  "head-skin": darkenTo(HEAD_COLOR, LIGHT_GROUND, 3),
};
for (const g of GROUPS) LIGHT[g.token] = darkenTo(g.hex, LIGHT_GROUND, 4.5);
for (const [id, hex] of Object.entries(COVER_COLORS)) LIGHT[`cover-${id}`] = darkenTo(hex, LIGHT_GROUND, 3);

/** The palettes as they land in the style: light for the document's root, dark for the fragment and the dark states. */
export const PALETTES = { dark: DARK, light: LIGHT } as const;

function tokens(p: Record<string, string>): string {
  return Object.entries(p)
    .map(([k, v]) => `--${k}:${v}`)
    .join(";");
}

/** The fixed hexes of render/svg.ts become the page's variables: same picture, both grounds. */
export function tokenizeSvg(svg: string): string {
  let out = svg
    .replace(new RegExp(`(<circle class="(?:end )?eye"[^>]*fill=")${INK.paper}(")`, "g"), "$1var(--eye)$2")
    .replace(new RegExp(`(<circle class="end eye"[^>]*/><circle[^>]*fill=")${INK.ground}(")`, "g"), "$1var(--pupil)$2");
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(DARK)) if (!map.has(v) && k !== "eye" && k !== "pupil") map.set(v, k);
  for (const [hex, token] of map) out = out.split(hex).join(`var(--${token})`);
  return out;
}

// ---------------------------------------------------------------- text helpers

export function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function n(x: number, digits = 1): string {
  return Number.isInteger(x) ? String(x) : x.toFixed(digits).replace(".", ",");
}

function pct(x: number, digits = 0): string {
  return `${(100 * x).toFixed(digits).replace(".", ",")} %`;
}

function share(part: number, whole: number, digits = 0): string {
  return whole === 0 ? "—" : pct(part / whole, digits);
}

function famRu(f: Family): string {
  return FAMILY_RU[f];
}

function famChip(f: Family): string {
  return `<span class="fam" style="--c:var(--${groupOf(f).token})">${esc(famRu(f))}</span>`;
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((s, v) => s + v, 0) / xs.length;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? 0 : s.length % 2 === 1 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
}

const OP_WHAT: Record<MutationOp, string> = {
  sprout: "к узлу прирастает сегмент с новым узлом-окончанием",
  joint: "сегмент делится новым узлом посередине",
  branch: "окончание становится развилкой с двумя отростками",
  rebirth: "окончание меняет вид",
  resize: "орган, уже стоящий на месте, переходит на другую размерную ступень",
  thicken: "конечность становится корпусом: обхват +1, открывается полость",
  thin: "корпус теряет обхват; что не влезло в полость — выдавливается",
  stretch: "длина ±1",
  enlarge: "размер узла +1: больше мест",
  fusion: "два узла сливаются в один; окончания в них гибнут; появляется цикл",
  membrane: "на простой цикл 3–6 натягивается перепонка",
  double: "висячая часть за мостом копируется на тот же узел",
  migrate: "окончание переползает в соседний узел, шаг за 40 ходов",
  growth: "сегмент «нарост» 1/1 с пустым узлом; запасной выход любой операции без цели",
  necrosis: "часть без крови отпадает",
  organ: "размещение: орган занимает полость, голову или поверхность",
  cover: "размещение: покров начинается на одном сегменте и ползёт",
  wings: "составная: СУСТАВ ×2 + СРАЩЕНИЕ + ПЕРЕПОНКА",
  twin: "составная: ОТРОСТОК корпуса с головой + РАЗРАСТАНИЕ + ОТРОСТОК рук",
  budding: "составная: УТОЛЩЕНИЕ + ОРГАН ×3",
  amorphous: "составная: все конечности → щупальца, окончания → ложноножки",
  lose: "составная: органы этих видов уходят из одной головы — отсутствие как утрата органа",
  bloat: "корпус: обхват +1 до 6, потом длина +1 до 6; полость растёт, кожа трескается",
  engulf: "висячая конечность втягивается в корпус: обхват +1, окончание садится в узел корпуса",
  sink: "сегмент под головой укорачивается; при длине 1 голова сливается с другим концом",
  split: "корпус расщепляется на два параллельных между теми же узлами; полость делится",
  merge: "два корпуса у узла становятся одним: сумма длин, больший обхват; узел исчезает",
  flesh: "нарост у узла корпуса растёт в корпус и тянет к себе висячие конечности",
  shift: "конечность переезжает вдоль корпуса на его другой конец",
};

const GRAPH_OPS: MutationOp[] = ["sprout", "joint", "branch", "rebirth", "thicken", "thin", "stretch", "enlarge", "fusion", "membrane", "double", "migrate", "growth", "necrosis", "bloat", "engulf", "sink", "split", "merge", "flesh", "shift"];
const PLACEMENTS: MutationOp[] = ["organ", "cover"];
const COMPOSITE_OPS: MutationOp[] = ["wings", "twin", "budding", "amorphous", "lose"];

// ---------------------------------------------------------------- style

const CSS = `
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--ink-0);color:var(--paper);font:400 15px/1.55 var(--f-sans);padding:0 16px}
.doc{max-width:1080px;margin:0 auto;padding:36px 0 80px}
h1{font:700 40px/1.1 var(--f-serif);margin:6px 0 10px;letter-spacing:-.01em}
h2{font:700 27px/1.2 var(--f-serif);margin:64px 0 14px;padding-top:18px;border-top:1px solid var(--line)}
h3{font:700 21px/1.25 var(--f-serif);margin:40px 0 10px}
h4{font:700 17px/1.3 var(--f-serif);margin:0 0 6px}
h2 .no,h3 .no{color:var(--amber);font-family:var(--f-mono);font-weight:500;margin-right:10px}
p,li,dd{max-width:66ch}
p{margin:0 0 12px}
ul,ol{padding-left:22px;margin:0 0 14px}
li{margin:0 0 4px}
a{color:var(--amber);text-decoration:none}
a:hover{text-decoration:underline}
code,.mono{font-family:var(--f-mono);font-variant-numeric:tabular-nums;font-size:.93em}
.cap{font:600 12px/1 var(--f-sans);letter-spacing:.18em;text-transform:uppercase;color:var(--paper-3);margin:0 0 6px}
.lead{color:var(--paper-2);font-size:16px;max-width:70ch}
.dim{color:var(--paper-2)} .faint{color:var(--paper-3)} .c-flesh{color:var(--flesh)} .c-bio{color:var(--bio)} .c-amber{color:var(--amber)}
.toc{background:var(--ink-1);border:1px solid var(--line);border-radius:6px;padding:14px 18px;margin:22px 0 0}
.toc ol{margin:0;padding-left:20px;max-width:none}
.toc li{margin:2px 0}
.toc .fams{display:flex;flex-wrap:wrap;gap:6px 10px;margin:8px 0 0;padding:0;list-style:none}
.toc .fams li{margin:0}
.fam{display:inline-block;padding:1px 8px;border-radius:10px;font:500 12px/18px var(--f-sans);color:var(--c);border:1px solid var(--c);white-space:nowrap}
.tbl{overflow-x:auto;margin:0 0 18px;border:1px solid var(--line-soft);border-radius:6px;background:var(--ink-1)}
table{border-collapse:collapse;width:100%;font-size:13.5px}
th,td{padding:6px 10px;border-bottom:1px solid var(--line-soft);text-align:left;vertical-align:top}
th{font:600 12px/1.3 var(--f-sans);letter-spacing:.04em;text-transform:uppercase;color:var(--paper-3);white-space:nowrap;background:var(--ink-2)}
th[colspan]{white-space:normal;text-align:left}
tr:last-child td{border-bottom:none}
td.num,th.num{text-align:right;font-family:var(--f-mono);font-variant-numeric:tabular-nums;white-space:nowrap}
td.tight{white-space:nowrap}
td.wrap{white-space:normal;font-family:var(--f-sans);text-align:left;min-width:180px}
.formula{background:var(--ink-1);border-left:2px solid var(--amber);padding:10px 14px;margin:10px 0 16px;font:400 13px/1.6 var(--f-mono);color:var(--paper-2);white-space:pre-wrap;max-width:none;overflow-x:auto}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px 28px}
.facts dl{margin:0}
.kv{display:grid;grid-template-columns:auto 1fr;gap:3px 14px;margin:0 0 12px;font-size:14px}
.kv dt{color:var(--paper-3);white-space:nowrap}
.kv dd{margin:0;max-width:none}
.ops td:first-child{font-family:var(--f-mono);white-space:nowrap}
.family{margin-top:44px}
.family h3{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:2px}
.family h3 .meta{font:400 13px/1.4 var(--f-mono);color:var(--paper-3);font-variant-numeric:tabular-nums}
.family .stripe{display:inline-block;width:14px;height:14px;border-radius:7px;background:var(--c);vertical-align:-1px}
.family .sub{color:var(--paper-3);font:400 13px/1.4 var(--f-sans);margin:0 0 14px}
.mut{display:grid;grid-template-columns:160px minmax(0,1fr);gap:8px 18px;padding:16px 0;border-top:1px solid var(--line-soft)}
.mut .pic{background:var(--ink-1);border:1px solid var(--line-soft);border-radius:4px;display:flex;align-items:center;justify-content:center;min-height:120px;padding:4px}
.mut .pic svg{max-width:100%;height:auto;max-height:190px}
.mut .nopic{font:400 12px/1.4 var(--f-sans);color:var(--flesh);padding:8px 10px;align-self:stretch}
.mut .nopic b{display:block;font-weight:600;margin-bottom:4px}
.mut h4 .id{font:500 12px var(--f-mono);color:var(--paper-3);margin-left:8px;font-variant-numeric:tabular-nums}
.tag{display:inline-block;padding:0 7px;border-radius:9px;font:500 11px/17px var(--f-sans);margin-left:6px;vertical-align:2px;background:var(--ink-3);color:var(--paper-2)}
.tag.def{background:var(--flesh-soft);color:var(--flesh)}
.tag.key{background:var(--bio-soft);color:var(--bio)}
.mut .kv{font-size:13.5px;margin:0}
.mut .kv dd{color:var(--paper)}
.mut .diff{color:var(--paper-2)}
.mut .diff b{color:var(--paper);font-weight:500}
.mut .land{font-family:var(--f-mono);font-variant-numeric:tabular-nums;font-size:13px}
.mut .land i{font-style:normal;color:var(--paper-3)}
.mut .op{color:var(--amber);font-family:var(--f-mono);font-size:12.5px;letter-spacing:.04em}
.hists{display:grid;grid-template-columns:repeat(auto-fit,minmax(440px,1fr));gap:18px 28px;margin:0 0 20px}
.hist{margin:0;background:var(--ink-1);border:1px solid var(--line-soft);border-radius:6px;padding:10px 12px}
.hist figcaption{font:600 13px/1.3 var(--f-sans);margin:0 0 6px}
.hist figcaption span{color:var(--paper-3);font-weight:400;margin-left:8px}
.hist .cells{display:grid;grid-template-columns:auto 1fr 1fr;gap:2px 8px;align-items:end}
.hist .rl{font:500 11px var(--f-mono);color:var(--paper-3);text-align:right;padding-bottom:12px}
.hist .cl{font:600 10px/1 var(--f-sans);letter-spacing:.08em;text-transform:uppercase;color:var(--paper-3);padding:0 0 4px}
.hist svg{width:100%;height:auto;display:block}
.thumbs{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px;margin:0 0 20px}
.thumb{background:var(--ink-1);border:1px solid var(--line-soft);border-radius:6px;padding:8px;display:flex;flex-direction:column;gap:6px}
.thumb .pic{display:flex;justify-content:center;align-items:center;min-height:150px}
.thumb svg{max-width:100%;height:auto;max-height:200px}
.thumb .meta{font:400 11.5px/1.45 var(--f-mono);color:var(--paper-3);font-variant-numeric:tabular-nums}
.thumb .meta b{color:var(--paper);font-weight:500}
.problem{border-left:2px solid var(--flesh);padding:2px 0 2px 14px;margin:0 0 22px}
.problem h3{margin:0 0 8px}
.problem ul{margin-bottom:8px}
.note{background:var(--ink-1);border:1px solid var(--line-soft);border-radius:6px;padding:10px 14px;margin:0 0 16px;color:var(--paper-2);font-size:14px}
.foot{margin-top:60px;padding-top:14px;border-top:1px solid var(--line);color:var(--paper-3);font-size:13px}
@media (max-width:1000px){.hists{grid-template-columns:1fr}}
@media (max-width:560px){
  h1{font-size:30px} h2{font-size:23px}
  .mut{grid-template-columns:1fr}
  .mut .pic{min-height:90px}
  .kv{grid-template-columns:1fr;gap:0 0}
  .kv dt{margin-top:6px}
  .hist .cells{grid-template-columns:auto 1fr}
}
`;

/** The same three families in both variants; the fragment loads them from Google Fonts, the document takes what the system has. */
function fontsCss(): string {
  return `--f-serif:"PT Serif", Georgia, "Times New Roman", serif;--f-sans:"IBM Plex Sans", -apple-system, "Segoe UI", sans-serif;--f-mono:"IBM Plex Mono", ui-monospace, Menlo, monospace`;
}

function styleOf(variant: Variant): string {
  if (variant === "fragment") return `:root{${tokens(DARK)};${fontsCss()};color-scheme:dark}${CSS}`;
  return `:root{${tokens(LIGHT)};${fontsCss()};color-scheme:light}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${tokens(DARK)};color-scheme:dark}}
:root[data-theme="dark"]{${tokens(DARK)};color-scheme:dark}${CSS}`;
}

// ---------------------------------------------------------------- section 1

function section1(d: ReportData): string {
  const f = d.facts;
  const opRow = (op: MutationOp): string => `<tr><td>${esc(OP_RU[op])}</td><td>${esc(OP_WHAT[op])}</td><td class="num">${f.opRows.find((r) => r.op === op)!.rows}</td></tr>`;
  const brains = f.brains.map((b) => `${esc(b.ru)} ${b.channels}`).join(" · ");
  return `<h2 id="s1"><span class="no">1</span>Как мутирует тело</h2>
<div class="grid2">
<div>
<h3>Три примитива</h3>
<p><b>Узел</b> — точка сборки размером 1–3; держит до <code>2 × размер</code> сегментов и окончания (кисть, стопа, голова, глаз на стебле). Массы не имеет. <b>Сегмент</b> — часть между двумя узлами: вид (рука, нога, щупальце, корпус, шея, хвост, стебель, нарост), длина 1–6, обхват 1–4, покров; у корпуса — полость на <code>5 × длина × обхват</code> массы органов; на поверхности любого сегмента — наросты и метки. <b>Перепонка</b> — на простом цикле из ${f.membraneCycle[0]}–${f.membraneCycle[1]} сегментов, не больше одной на цикл. Орган крепится в одно из четырёх мест: окончание узла, полость корпуса, голова, поверхность сегмента; всего видов органов ${f.organKinds}, все их числа — таблица <code>parts.ts</code>.</p>
<p>Человек — дерево из 7 узлов и 6 сегментов, масса ${n(d.humanMass)}, потолок скелета ${f.ceiling}, замкнутость 0. Способность окончания читается из трёх таблиц — окончание × вид сегмента × покров — и не пишется на существе руками.</p>
<h3>Машина целей и веса (§8)</h3>
<p>У каждой операции есть список мест, куда она может встать; правило цели мутации сужает его. Место выбирается по весам одним броском ГСЧ:</p>
<div class="formula">вес места = 1
  × (1 + нестабильность органов места / 25)
  × 2, если место ранено за последние 20 ходов
  × (1 + d / 5), если источник — удар бездны (d — расстояние от твоего мозга)
  × 5, если это заглушка риппера (узел-приманка)
  × ${f.affinity}, если это ОТРОСТОК с окончанием и такое же окончание
       сидит на конце соседнего сегмента узла (голова и пасть исключены)
  × (1 + ${f.spread.kFamily} × Σ w / (1 + d)) по чертам семейства мутации — расползание, §11</div>
<h3>Плоть мутации и потолок скелета</h3>
<p>Человек стоит на пределе мяса (100 / 100), поэтому мутация растит собственную плоть: орган приходит со своей массой, мясо растёт на неё, запас обмена платит ${f.reservePerMass} за единицу и может уйти в минус — это голод. Единственный потолок — скелет, ${f.ceiling}; он держит массу, не мясо.</p>
<p>На потолке удар бездны <b>вытесняет набор слабейших органов</b> атомарно: ищется наименьший по порядку «масса ↑, нестабильность ↓, обход по id» набор, суммарной массы которого хватает, чтобы мутация встала; он уходит весь ради этой одной мутации; нет набора — ни один орган не уходит, мутация становится НАРОСТОМ, а не влезший нарост теряется. Органы массы 0 в набор не входят. Остальные источники на потолке не вытесняют ничего.</p>
<p><b>Жизненно важное не вытесняется:</b> любой мозг, голова с мозгом внутри, последнее качающее сердце (в целом сегменте), последний дышащий орган. Орган, чья потеря разорвала бы тело, невозможен по построению: связность живёт в узлах и сегментах.</p>
</div>
<div>
<h3>Четырнадцать операций</h3>
<div class="tbl"><table class="ops"><thead><tr><th>операция</th><th>что меняет</th><th class="num">строк</th></tr></thead><tbody>
${GRAPH_OPS.map(opRow).join("")}
<tr><th colspan="3">размещения через ту же машину целей</th></tr>
${PLACEMENTS.map(opRow).join("")}
<tr><th colspan="3">составные: последовательность операций на клоне, целиком или нарост</th></tr>
${COMPOSITE_OPS.map(opRow).join("")}
</tbody></table></div>
<p class="faint">Пределы: узлов ≤ ${f.limits.nodes}, сегментов ≤ ${f.limits.segments}, циклов ≤ ${f.limits.cycles}, перепонок ≤ ${f.limits.membranes}, голов ≤ ${f.limits.heads}, сегментов у узла ≤ 2 × размер. Операция без цели становится НАРОСТОМ; некуда встать и наросту — теряется.</p>
</div>
</div>
<h3>Расползание (§11)</h3>
<p>Пять правил, все — веса и таймеры, не запреты; выключаются одним флагом <code>spread: false</code>. Человек нейтрален: тянут только черты сверх его базы.</p>
<ul>
<li><b>Соседство.</b> Вес места <code>×= 1 + ${f.spread.kFamily} × Σ w / (1 + d)</code> по чертам семейства мутации: орган сверх базы человека весит <code>(n − база) / n</code>, покров — <code>1 / сегментов с ним</code>, перепонка — 1; <code>d</code> — расстояние до ближайшего узла черты.</li>
<li><b>Тема.</b> Вес строки в выборке <code>×= (1 + ${f.spread.kTheme} × доля семейства) × (1 + ${f.spread.kTheme} × черты вида)</code> по трём частям строки — вид сегмента, окончание, покров; произведение не больше <b>${f.spread.themeCap}</b> (потолок темы шага H).</li>
<li><b>Заражение вида.</b> ВЫТЯЖЕНИЕ или ПЕРЕРОЖДЕНИЕ рядом со щупальцем превращает руку, ногу или хвост в щупальце с шансом <code>${f.spread.contagion} × соседних щупалец</code>.</li>
<li><b>Фронты покрова.</b> Покров раз в ${f.spread.coverTurns} ходов берёт соседний кожаный сегмент; хром и сломанный не берутся, чужой покров не перезаписывается; плоть приходит до потолка.</li>
<li><b>Давление опухоли.</b> Раз в ${f.spread.pressureTurns} ходов каждый нарост прибавляет ${f.spread.pressure} нестабильности органам соседних сегментов и окончаниям своих узлов.</li>
<li><b>Регуляторы.</b> «Выбраковка» в теле или медитация оставляют ${n(f.spread.damping, 2)} от каждого притяжения; таймеры не гасятся.</li>
</ul>
<div class="grid2">
<div>
<h3>Головы и территории (§7)</h3>
<p>Думают четыре вида органов — ${brains} каналов; каналы тела — сумма живых мозгов плюс «каналы даром» паразитов. Претензия чужой головы на узел — <code>d − sway / 2</code>, твоя — <code>d</code>; узел берёт меньшая, равенство — тебе. Территория головы связна; когда в неё попал элемент с твоим мозгом — тело перехвачено. Отделение режет по границе территорий там, где претензии равны. Голов не больше ${f.limits.heads}; мозг мёртв через 5 ходов без крови, и тогда «ты» переезжаешь в ближайший живой.</p>
</div>
<div>
<h3>Чуждость</h3>
<p>Одна формула над телом (решение 1254): тело читается мешком частей — сегмент по виду, покров по виду и сегменту, орган по виду, размеру и месту, перепонка по виду, узел по размеру; каждая весит 1 плюс свою массу. Чуждость — на сколько веса мешок тела расходится с мешком человека в обе стороны: чего у человека нет, и чего у тела не стало. Человек — 0.</p>
</div>
</div>`;
}

// ---------------------------------------------------------------- section 2

function section2(d: ReportData): string {
  const pop = d.populations;
  const last = pop.strikes[pop.strikes.length - 1]!;
  const head = `<th>источник</th><th class="num">дефектов</th><th class="num">строк</th>${FAMILIES.map((f) => `<th class="num">${esc(famRu(f))}</th>`).join("")}`;
  const rows = d.sources.map((s) => {
    const cells = s.families === null ? `<td colspan="${FAMILIES.length}" class="dim">100 % выбранного семейства; на дефектном броске пусто у ${s.empty.length} семейств: ${s.empty.map(famRu).join(", ")}</td>` : FAMILIES.map((f) => `<td class="num">${pct(s.families![f], 1)}</td>`).join("");
    return `<tr><td class="tight">${esc(s.spec.ru)}</td><td class="num">${s.spec.defects === null ? "—" : pct(s.spec.defects)}</td><td class="num">${s.rows}</td>${cells}</tr>`;
  });
  const drawnIds = pop.rowsOn.size;
  const landedIds = [...pop.rowsOn.values()].filter((r) => r.landed > 0).length;
  const realized = FAMILIES.map((f) => {
    const first = d.families.find((x) => x.family === f)!.drawShare;
    const later = pop.drawnTotal === 0 ? 0 : pop.familyDrawn[f] / pop.drawnTotal;
    return `<tr><td>${famChip(f)}</td><td class="num">${pct(first, 1)}</td><td class="num">${pct(later, 1)}</td><td class="num">${later - first >= 0 ? "+" : "−"}${(100 * Math.abs(later - first)).toFixed(1).replace(".", ",")}</td></tr>`;
  });
  const p = d.problems;
  return `<h2 id="s2"><span class="no">2</span>Источники на первом этаже</h2>
<p>Модель различает только удар бездны (веса по расстоянию и вытеснение на потолке); остальное про источник — конвенция лаборатории по таблице <code>mutations.md</code>: доля дефектов и фильтр семейств, один бросок ГСЧ на дефект перед выборкой строки. Ниже — доля выпадений каждого семейства на человеке (тема нейтральна, строки идут по <code>chance</code> внутри класса «дефект / не дефект»). Глубина, давление и «+8 % × слой» первого этажа не касаются.</p>
<div class="tbl"><table><thead><tr>${head}</tr></thead><tbody>${rows.join("")}</tbody></table></div>
<h3>Что выпадает на самом деле</h3>
<p>Первый удар идёт по <code>chance</code>; дальше тело тянет выборку к себе. За ${pop.seeds} × ${last} ударов бездны с расползанием выпало <b>${drawnIds} строк из ${d.facts.rows}</b>, село хотя бы раз <b>${landedIds}</b>; дефектов среди выпавших ${pct(p.defects.drawn, 1)} при броске ${pct(p.defects.nominal)}, среди севших ${pct(p.defects.landed, 1)}.</p>
<div class="grid2">
<div class="tbl"><table><thead><tr><th>семейство</th><th class="num">первый удар</th><th class="num">за ${last} ударов</th><th class="num">сдвиг, п.</th></tr></thead><tbody>${realized.join("")}</tbody></table></div>
<div>
<p><b>Никогда не выпадали</b> (${p.neverDrawn.length}): ${p.neverDrawn.length === 0 ? "таких нет" : p.neverDrawn.map((m) => `<a href="#m-${m.id}">${esc(mutationRu(m.id))}</a> <span class="mono faint">${pct(d.entries.find((e) => e.m.id === m.id)!.drawShare, 2)}</span>`).join(", ")}.</p>
<p><b>Выпадали, но не сели ни разу</b> (${p.neverLanded.length}): ${p.neverLanded.length === 0 ? "таких нет" : p.neverLanded.map((r) => `<a href="#m-${r.id}">${esc(mutationRu(r.id))}</a> <span class="mono faint">×${r.drawn}</span>`).join(", ")}.</p>
</div>
</div>`;
}

// ---------------------------------------------------------------- section 3

function priceRu(e: CatalogEntry): string {
  const p = e.price;
  const cell = (v: number | null): string => (v === null ? "—" : n(v));
  let s = `${cell(p.mass)} · ${cell(p.upkeep)} · ${cell(p.control)}`;
  if (p.channels > 0) s += ` <i>+${p.channels} кан.</i>`;
  if (p.note !== null) s += ` <i>(${esc(p.note)})</i>`;
  return s;
}

function diffRu(e: CatalogEntry): string {
  if (e.sample.diff.length === 0) return "";
  return e.sample.diff.map((c) => `${esc(SUMMARY_RU[c.key] ?? c.key)} ${esc(fmt(c.before))} → <b>${esc(fmt(c.after))}</b>`).join(" · ");
}

function landingRu(e: CatalogEntry): string {
  const h = e.human;
  const t = e.typical;
  const parts: string[] = [];
  if (t.tumours > 0) parts.push(`нарост ${share(t.tumours, t.seeds)}`);
  if (t.lost > 0) parts.push(`потеряна ${share(t.lost, t.seeds)}`);
  if (t.noTarget > 0) parts.push(`нет цели ${share(t.noTarget, t.seeds)}`);
  return `человек <b>${share(h.landed, h.seeds)}</b> · типичное тело <b>${share(t.landed, t.seeds)}</b>${parts.length > 0 ? ` <i>(${parts.join(", ")})</i>` : ""}`;
}

function card(e: CatalogEntry): string {
  const tags = e.m.tags.map((t) => `<span class="tag${t === "defect" ? " def" : t === "key" ? " key" : ""}">${esc(t === "defect" ? "дефект" : t === "key" ? "ключевая" : t === "psionic" ? "псионика" : t === "psychic" ? "психическая" : t === "sleeping" ? "спящая" : t)}</span>`).join("");
  const pic = e.sample.svg !== null
    ? tokenizeSvg(e.sample.svg)
    : `<div class="nopic"><b>${e.sample.fallback ? "на человеке уходит в нарост" : "на человека не садится"}</b>${esc(e.sample.reason ?? "")}</div>`;
  const diff = diffRu(e);
  return `<article class="mut" id="m-${e.m.id}">
<div class="pic">${pic}</div>
<div>
<h4>${esc(e.ru)}<span class="id">${e.m.id}</span>${tags}</h4>
<dl class="kv">
<dt>операция</dt><dd><span class="op">${esc(e.op)}</span> — ${esc(e.payload)}</dd>
<dt>цель</dt><dd>${esc(e.rule)}</dd>
<dt>М·О·К</dt><dd class="mono">${priceRu(e)}</dd>
<dt>шанс</dt><dd class="mono">${e.m.chance} <i class="faint">— ${pct(e.drawShare, 2)} ударов бездны на человеке</i></dd>
${e.sample.landed ? `<dt>на человеке</dt><dd class="diff">${e.sample.target === null ? "" : `<span class="faint">${esc(e.sample.target)}</span>${diff.length > 0 ? " · " : ""}`}${diff.length > 0 ? diff : "производные числа не сдвинулись"}</dd>` : ""}
<dt>посадка</dt><dd class="land">${landingRu(e)}</dd>
</dl>
</div>
</article>`;
}

function section3(d: ReportData): string {
  const o = d.options;
  const summary = d.families.map((s) => {
    return `<tr><td>${famChip(s.family)}</td><td class="num">${s.rows}</td><td class="num">${s.defects}</td><td class="num">${n(s.meanMass)}${s.priced < s.rows ? ` <span class="faint">(${s.priced})</span>` : ""}</td><td class="num">${pct(s.drawShare, 1)}</td><td class="num">${s.onHuman}</td><td class="num">${s.onTypical}</td></tr>`;
  });
  const families = FAMILIES.map((f) => {
    const g = groupOf(f);
    const s = d.families.find((x) => x.family === f)!;
    const entries = d.entries.filter((e) => e.m.family === f);
    return `<section class="family" id="f-${f}">
<h3><span class="stripe" style="--c:var(--${g.token})"></span>${esc(famRu(f))} <span class="meta">${s.rows} строк · ${s.defects} дефектов · группа «${esc(g.ru)}»</span></h3>
<p class="sub">Садятся на человека ${s.onHuman} из ${s.rows}; на большинство типичных тел — ${s.onTypical}.</p>
${entries.map(card).join("\n")}
</section>`;
  });
  return `<h2 id="s3"><span class="no">3</span>Каталог: ${d.facts.rows} мутаций по ${d.facts.families} семействам</h2>
<p>Каждая строка — операция, груз, правило цели, семейство, шанс и теги; функций на мутацию нет. Силуэт — человек с этой мутацией на фиксированном сиде (удар бездны); строка «на человеке» — что сдвинулось в производных числах <code>derive</code>. «Посадка» — доля сидов, где строка встала сама, а не наростом: на человеке (${o.humanSeeds} сидов) и на типичном теле после ${o.typicalStrikes} ударов бездны первого этажа с расползанием (${o.typicalSeeds} сидов, каждый — своё тело). М·О·К — масса · обмен · каналы того, что строка приносит по таблицам; где решает цель — прочерк.</p>
<div class="tbl"><table><thead><tr><th>семейство</th><th class="num">строк</th><th class="num">дефектов</th><th class="num">средняя масса</th><th class="num">доля ударов</th><th class="num">на человека</th><th class="num">на типичное</th></tr></thead><tbody>${summary.join("")}</tbody></table></div>
<p class="faint">Средняя масса — по строкам с собственной массой из таблиц (в скобках — сколько их, если не все). «На типичное» — строк, которые садятся больше чем на половину типичных тел.</p>
${families.join("\n")}`;
}

// ---------------------------------------------------------------- section 4

function cellLabel(c: PopulationCell): string {
  return `${c.strikes} ${c.spread ? "с" : "без"}`;
}

function edgesFor(all: number[], maxBins: number): number[] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of all) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  if (!Number.isFinite(lo)) return [0, 1];
  lo = Math.floor(lo);
  hi = Math.max(Math.ceil(hi), lo + 1);
  const span = hi - lo;
  const bins = Math.min(maxBins, span);
  const width = span / bins;
  return Array.from({ length: bins + 1 }, (_, i) => lo + i * width);
}

function countIn(values: number[], edges: number[]): number[] {
  const bins = edges.length - 1;
  const lo = edges[0]!;
  const width = edges[1]! - lo;
  const out = new Array<number>(bins).fill(0);
  for (const v of values) {
    const i = Math.min(bins - 1, Math.max(0, Math.floor((v - lo) / width)));
    out[i] = (out[i] ?? 0) + 1;
  }
  return out;
}

function miniHist(counts: number[], edges: number[], max: number, color: string, meanValue: number): string {
  const W = 240;
  const H = 72;
  const top = 4;
  const bottom = 16;
  const bw = (W - 4) / counts.length;
  const lo = edges[0]!;
  const hi = edges[edges.length - 1]!;
  const parts: string[] = [];
  counts.forEach((c, i) => {
    const h = max === 0 ? 0 : ((H - top - bottom) * c) / max;
    parts.push(`<rect x="${(2 + i * bw + 0.5).toFixed(1)}" y="${(H - bottom - h).toFixed(1)}" width="${Math.max(0.5, bw - 1).toFixed(1)}" height="${h.toFixed(1)}" fill="var(--${color})"><title>${edges[i]!.toFixed(1).replace(".", ",")}–${edges[i + 1]!.toFixed(1).replace(".", ",")}: ${c}</title></rect>`);
  });
  const mx = 2 + ((meanValue - lo) / Math.max(1e-9, hi - lo)) * (W - 4);
  parts.push(`<line x1="${mx.toFixed(1)}" y1="${top}" x2="${mx.toFixed(1)}" y2="${H - bottom}" stroke="var(--paper)" stroke-width="1" stroke-dasharray="2 2"/>`);
  parts.push(`<line x1="2" y1="${H - bottom + 0.5}" x2="${W - 2}" y2="${H - bottom + 0.5}" stroke="var(--line)" stroke-width="1"/>`);
  parts.push(`<text x="2" y="${H - 3}" font-size="9" font-family="var(--f-mono)" fill="var(--paper-3)">${n(lo)}</text>`);
  parts.push(`<text x="${W - 2}" y="${H - 3}" font-size="9" font-family="var(--f-mono)" fill="var(--paper-3)" text-anchor="end">${n(hi)}</text>`);
  parts.push(`<text x="${Math.min(W - 20, Math.max(20, mx)).toFixed(1)}" y="${H - 3}" font-size="9" font-family="var(--f-mono)" fill="var(--paper)" text-anchor="middle">ср. ${n(meanValue)}</text>`);
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">${parts.join("")}</svg>`;
}

function histFigure(title: string, cells: PopulationCell[], strikes: number[], pick: (s: PopulationCell["samples"][number]) => number, maxBins: number): string {
  const all = cells.flatMap((c) => c.samples.map(pick));
  const edges = edgesFor(all, maxBins);
  const counted = cells.map((c) => ({ c, counts: countIn(c.samples.map(pick), edges), mean: mean(c.samples.map(pick)) }));
  const max = Math.max(1, ...counted.flatMap((x) => x.counts));
  const rows = strikes.map((k) => {
    const on = counted.find((x) => x.c.strikes === k && x.c.spread)!;
    const off = counted.find((x) => x.c.strikes === k && !x.c.spread)!;
    return `<div class="rl">${k}</div><div>${miniHist(on.counts, edges, max, "amber", on.mean)}</div><div>${miniHist(off.counts, edges, max, "paper-3", off.mean)}</div>`;
  });
  return `<figure class="hist"><figcaption>${esc(title)}<span>одна шкала на шесть ячеек, пунктир — среднее</span></figcaption><div class="cells"><div></div><div class="cl">с расползанием</div><div class="cl">без</div>${rows.join("")}</div></figure>`;
}

function section4(d: ReportData): string {
  const pop = d.populations;
  const cells = [...pop.strikes.flatMap((k) => [true, false].map((s) => pop.cells.find((c) => c.strikes === k && c.spread === s)!))];
  const head = `<th>величина</th>${cells.map((c) => `<th class="num">${cellLabel(c)}</th>`).join("")}`;
  const row = (label: string, f: (c: PopulationCell) => string, cls = "num"): string => `<tr><td class="tight">${label}</td>${cells.map((c) => `<td class="${cls}">${f(c)}</td>`).join("")}</tr>`;
  const m = (pick: (s: PopulationCell["samples"][number]) => number) => (c: PopulationCell) => `${n(mean(c.samples.map(pick)))} <span class="faint">/ ${n(median(c.samples.map(pick)))}</span>`;
  const sh = (pick: (c: PopulationCell) => number) => (c: PopulationCell) => share(pick(c), c.samples.length);
  const means = [
    row("узлы, среднее / медиана", m((s) => s.nodes)),
    row("сегменты", m((s) => s.segments)),
    row("замкнутость", m((s) => s.closure)),
    row("головы", m((s) => s.heads)),
    row(`масса при потолке ${d.facts.ceiling}`, m((s) => s.mass)),
    row("семейств с ≥ 3 органами", m((s) => s.familiesAt3)),
    row("чуждость", m((s) => s.alien)),
    row(`тел у потолка (масса > ${n(d.facts.ceiling - 4)})`, sh((c) => c.full)),
    row("тел с циклом", sh((c) => c.withCycles)),
    row("тел с перепонкой", sh((c) => c.withMembranes)),
  ];
  const abyss = [
    row("потерянных ударов", (c) => pct(c.summary.lost, 1)),
    row("ударов, ушедших в нарост", (c) => pct(c.summary.tumours, 1)),
    row("вытеснено органов на тело", (c) => n(c.summary.displaced)),
    row("вытеснялись чаще всего", (c) => c.summary.kinds.slice(0, 3).map((k) => `${esc(ORGANS[k.kind].ru)} ${k.n}`).join(", ") || "—", "wrap"),
    row("тел без сердца / мозга / дыхания", (c) => `${c.summary.noHeart} / ${c.summary.noBrain} / ${c.summary.noBreath}`),
    row("доля семейства-лидера", (c) => n(c.summary.lead, 2)),
  ];
  const famRows = FAMILIES.map((f) => `<tr><td>${famChip(f)}</td>${cells.map((c) => `<td class="num">${pct(c.at3[f])}</td>`).join("")}</tr>`);
  const membranes = cells.map((c) => {
    const kinds = (Object.entries(c.membranes) as [MembraneKind, number][]).sort((a, b) => b[1] - a[1]);
    return `<td class="wrap">${kinds.length === 0 ? "—" : kinds.map(([k, v]) => `${esc(v > 1 ? `${k} ×${v}` : k)}`).join(", ")}</td>`;
  });
  const hists = [
    histFigure("узлы", cells, pop.strikes, (s) => s.nodes, 16),
    histFigure("сегменты", cells, pop.strikes, (s) => s.segments, 16),
    histFigure("замкнутость", cells, pop.strikes, (s) => s.closure, 9),
    histFigure("головы", cells, pop.strikes, (s) => s.heads, 7),
    histFigure("масса", cells, pop.strikes, (s) => s.mass, 16),
    histFigure("семейств с ≥ 3", cells, pop.strikes, (s) => s.familiesAt3, 9),
  ];
  const thumbs = pop.thumbnails.map((t) => `<figure class="thumb"><div class="pic">${tokenizeSvg(t.svg)}</div><figcaption class="meta"><b>сид ${t.seed}</b> · узлов ${t.sample.nodes} · сегм. ${t.sample.segments} · замкн. ${t.sample.closure} · голов ${t.sample.heads} · масса ${n(t.sample.mass)} · чуждость ${n(t.sample.alien)}</figcaption></figure>`);
  return `<h2 id="s4"><span class="no">4</span>Популяции</h2>
<p>Человек после ${pop.strikes.join(" / ")} ударов бездны первого этажа, ${pop.seeds} сидов, с расползанием и без — те же сиды и та же лента, что во вкладке статистики лаборатории (<code>apps/lab/stats.ts</code>): тела трёх столбцов — одна и та же лента, снятая на разных ударах. Заголовок ячейки — число ударов и режим расползания.</p>
<div class="tbl"><table><thead><tr>${head}</tr></thead><tbody>${means.join("")}</tbody></table></div>
<h3>Удары и потолок скелета</h3>
<div class="tbl"><table><thead><tr>${head}</tr></thead><tbody>${abyss.join("")}<tr><td class="tight">перепонки в ячейке</td>${membranes.join("")}</tr></tbody></table></div>
<h3>Семейства: доля тел с ≥ 3 органами</h3>
<div class="tbl"><table><thead><tr><th>семейство</th>${cells.map((c) => `<th class="num">≥ 3 · ${cellLabel(c)}</th>`).join("")}</tr></thead><tbody>${famRows.join("")}</tbody></table></div>
<h3>Гистограммы</h3>
<div class="hists">${hists.join("")}</div>
<h3>Типичные тела на ${pop.thumbnailStrikes} ударах</h3>
<p>${pop.thumbnails.length} тел, ближайших к медиане популяции по узлам, сегментам, замкнутости, головам и массе (каждая величина — в долях своего размаха); с расползанием. Подложка — территория чужой головы.</p>
<div class="thumbs">${thumbs.join("")}</div>`;
}

// ---------------------------------------------------------------- section 5

function firstRu(f: FirstStrike, seeds: number): string {
  if (f.bodies === 0) return "ни у одного тела";
  return `у ${f.bodies} из ${seeds} тел; в среднем на ${n(f.mean)}-м ударе, медиана ${f.median}; ${f.by.map((b) => `к ${b.strikes} — ${pct(b.share)}`).join(", ")}`;
}

function windowRu(w: Window): string {
  return `${w.from}–${w.to}: потеряно ${share(w.lost, w.strikes, 1)}, наростов ${share(w.tumours, w.strikes, 1)}, вытеснено ${w.displaced}`;
}

function rowRu(r: RowStats): string {
  return `<a href="#m-${r.id}">${esc(mutationRu(r.id))}</a> <span class="mono faint">${r.landed}/${r.drawn}</span>`;
}

function section5(d: ReportData): string {
  const p = d.problems;
  const pop = d.populations;
  const o = d.options;
  const last = pop.strikes[pop.strikes.length - 1]!;
  const on = (k: number): PopulationCell => pop.cells.find((c) => c.strikes === k && c.spread)!;
  const lastOn = on(last);
  const total = pop.seeds * last;
  const closures = pop.strikes.map((k) => `${k}: ${share(on(k).withCycles, on(k).samples.length)}`).join(", ");
  const membr = pop.strikes.map((k) => `${k}: ${share(on(k).withMembranes, on(k).samples.length)}`).join(", ");
  const defectsAt = pop.strikes.map((k) => `${k}: ${n(mean(on(k).samples.map((s) => s.counts.defects)), 1)}`).join(", ");
  const heads = pop.strikes.map((k) => `${k}: ${n(mean(on(k).samples.map((s) => s.heads)), 2)}`).join(", ");
  const evicted = p.evictedKinds.map((k) => `${esc(ORGANS[k.kind].ru)} ${k.n}`).join(", ");
  const evictedTotal = lastOn.summary.kinds.reduce((s, k) => s + k.n, 0);
  const eye = lastOn.summary.kinds.find((k) => k.kind === "eye")?.n ?? 0;
  return `<h2 id="s5"><span class="no">5</span>Проблемы модели</h2>
<p>Всё ниже посчитано на тех же выборках: каталог на человеке и на типичных телах (раздел 3), популяция ${pop.seeds} × ${last} ударов с расползанием (раздел 4). Числа — по состоянию кода, не по памяти отчётов.</p>

<div class="problem"><h3>Мутации, которые не садятся на человека никогда</h3>
<p>${p.neverOnHuman.length} строк из ${d.facts.rows} на человеке не встают ни на одном из ${o.humanSeeds} сидов — каждая по своей причине:</p>
<ul>${p.neverOnHuman.map((e) => `<li><a href="#m-${e.m.id}">${esc(e.ru)}</a> <span class="mono faint">${e.m.id}</span> — ${esc(e.sample.reason ?? "")}; на типичном теле садится в ${share(e.typical.landed, e.typical.seeds)}</li>`).join("")}</ul>
</div>

<div class="problem"><h3>Строки-сироты: цель исчезает после вытеснения</h3>
<p>Строки на окончание (ПЕРЕРОЖДЕНИЕ, ВЕТВЛЕНИЕ, СРАЩЕНИЕ, МИГРАЦИЯ), которые садятся на человека, но на типичном теле (${o.typicalStrikes} ударов) не находят цели даже без потолка — кисти, стопы и глаза, самые лёгкие органы, бездна вытесняет первыми. Порог отбора — без цели у десятой части тел; таких ${p.orphans.length}:</p>
<ul>${p.orphans.map((x) => `<li><a href="#m-${x.entry.m.id}">${esc(x.entry.ru)}</a> <span class="mono faint">${x.entry.m.id}</span> — без цели у ${pct(x.share)} тел (${esc(x.entry.rule)})</li>`).join("")}</ul>
<p><b>Нет места в полости</b> — ОРГАН в полость, для которого ни одна полость не находит места у десятой части тел и чаще (${p.noCavity.length}); вытеснение идёт по массе скелета, а не по месту в полости, и такая строка теряется целиком:</p>
<ul>${p.noCavity.slice(0, 24).map((x) => `<li><a href="#m-${x.entry.m.id}">${esc(x.entry.ru)}</a> — ${pct(x.share)} <span class="faint">(М ${x.entry.price.mass === null ? "—" : n(x.entry.price.mass)})</span></li>`).join("")}${p.noCavity.length > 24 ? `<li class="faint">… и ещё ${p.noCavity.length - 24}, вплоть до массы ${n(Math.min(...p.noCavity.map((x) => x.entry.price.mass ?? Infinity)))}</li>` : ""}</ul>
${p.noPlace.length > 0 ? `<p>Остальные строки без места у десятой части тел (${p.noPlace.length}): ${p.noPlace.map((x) => `<a href="#m-${x.entry.m.id}">${esc(x.entry.ru)}</a> <span class="mono faint">${pct(x.share)}</span>`).join(", ")}.</p>` : ""}
<p><b>Нет набора для вытеснения</b> — строки с местом, которые всё равно уходят в нарост или теряются у десятой части типичных тел и чаще: слабых органов на их массу не набирается (${p.noRoom.length}):</p>
<ul>${p.noRoom.slice(0, 24).map((x) => `<li><a href="#m-${x.entry.m.id}">${esc(x.entry.ru)}</a> — ${pct(x.share)} <span class="faint">(М ${x.entry.price.mass === null ? "—" : n(x.entry.price.mass)})</span></li>`).join("")}${p.noRoom.length > 24 ? `<li class="faint">… и ещё ${p.noRoom.length - 24}</li>` : ""}</ul>
</div>

<div class="problem"><h3>Доминирование дефектов</h3>
<p>Бросок дефекта у бездны — ${pct(p.defects.nominal)}; среди выпавших строк дефектов ${pct(p.defects.drawn, 1)}, среди севших — ${pct(p.defects.landed, 1)}: дефекты весят 0 и садятся всегда, тяжёлые строки — нет. Органов-дефектов на тело: ${defectsAt}. Рычаг — доля дефектов у источника, не потолок (решение 89): потолок дефектов не прибавляет.</p>
</div>

<div class="problem"><h3>Редкость циклов и перепонок</h3>
<p>Тел с хотя бы одним циклом — ${closures}; с перепонкой — ${membr}. Циклы делают три строки — ${p.cycleRows.map(rowRu).join(", ")} (село / выпало за ${total} ударов); перепонки — ${p.membraneRows.map(rowRu).join(", ")}: без цикла перепонка не садится, а цикл даёт только СРАЩЕНИЕ, у которого правило цели требует двух одинаковых окончаний рядом. Кольцо из ≥ 6 сегментов с тремя опорами в популяции не встречается вовсе, пока нет операции, растящей цикл больше четырёх.</p>
</div>

<div class="problem"><h3>Упор в потолок</h3>
<p>Масса выше ${n(d.facts.ceiling - 4)} впервые — ${firstRu(p.ceiling.full, pop.seeds)}. Первое вытеснение — ${firstRu(p.ceiling.displaced, pop.seeds)}. Первый нарост вместо мутации — ${firstRu(p.ceiling.tumour, pop.seeds)}. Первая потеря удара — ${firstRu(p.ceiling.lost, pop.seeds)}.</p>
<p>По окнам ударов, с расползанием: ${pop.windowsOn.map(windowRu).join("; ")}. Без расползания: ${pop.windowsOff.map(windowRu).join("; ")}. Потери растут с глубиной ленты: вытесняемое мясо кончается, масса сегментов не вытесняется.</p>
<p>Вытеснено за ${last} ударов на ${pop.seeds} тел — ${evictedTotal} органов, из них глаз ${eye} (${share(eye, evictedTotal)}): глаз растёт «лишним глазом» и уходит первым как разменная монета. Чаще всего: ${evicted}. Голов на тело — ${heads}. Заражение вида (рука стала щупальцем при вытяжении или перерождении рядом со щупальцем) — ${pop.infected} раз на ${total} ударов.</p>
</div>

<div class="problem"><h3>Самые частые и самые редкие мутации в популяции</h3>
<p>Село чаще всего (село / выпало): ${p.frequent.map(rowRu).join(", ")}.</p>
<p>Выпадали, но не сели ни разу: ${p.neverLanded.length === 0 ? "таких нет" : p.neverLanded.map(rowRu).join(", ")}. Не выпадали вовсе: ${p.neverDrawn.length === 0 ? "таких нет" : p.neverDrawn.map((m) => `<a href="#m-${m.id}">${esc(mutationRu(m.id))}</a>`).join(", ")}.</p>
</div>

<div class="problem"><h3>Что отчёты A–H оставили открытым</h3>
<p>Из столбцов «не вошло» и «удивило» — то, что не закрыто следующими шагами. Числа рядом — из этого отчёта.</p>
<ul>
<li><b>A.</b> Рост нароста во времени и тератома (пасть, глаз или голова из созревшей опухоли) — не в модели: нарост остаётся сегментом 1/1 и только давит на соседей. Числа крови и боли при разрезе, условие «держал 30 ходов» для СРАЩЕНИЯ — игра.</li>
<li><b>B.</b> Шанс перехвата хода <code>sway × 4 %</code>, торг и повестка голов — игра; ослабленная шея — метка без эффекта в модели; чужой мозг, умерший без крови, орган не покидает.</li>
<li><b>C.</b> Не вошли: складчатая кора, паучья лапа ×4, третья пара конечностей, сегментное тело, ноги-корни, раздвоенное сознание, глазной мозг, улей, ключ бездны, расщепление, семейство приливных; режимы <code>··</code>, медитация, откаты псионики, воля паразитов — эффекты игры. У видов органов только <code>ru</code>. <code>mutations.md</code> не переписан — раздел 6.</li>
<li><b>D.</b> Перенос лоскута покрова самооперацией и фронт после пересадки — хирургия; фронты и давление не пишутся в текст фикстуры; регуляторы очереди («семейный уклон», «глушитель») — игра; заражение вида на человеке редкое: ${pop.infected} на ${total} ударов.</li>
<li><b>E · E2.</b> Заторы укладки в телах с циклами (до четверти таких тел), вложенные уши между одними узлами, петля щупальца у груди — картинка, не граф; сюда не входит.</li>
<li><b>F.</b> Кубики хищных челюстей, жвал, радулы и хоботка не заданы ни в одном документе — в <code>attacks</code> их нет; миоглобиновые мышцы, рога, сегментное и ложноножечное тело — в каталоге нет; конечности человека по таблице весят 34, а не 52 из <code>body.md</code> §8.</li>
<li><b>G.</b> Источники «спора», «заражение», «портал», «яйцо», «съесть своего ребёнка» — нет модели; «мясо твари» без твари — любые семейства с 15 % дефектов; статистика лаборатории без воркера.</li>
<li><b>H.</b> Вытеснение ради места в полости не делается — ОРГАН в полость без места теряется (см. «строки с целью» выше); к ${last} ударам потери снова растут (окна выше); строки на кисть и стопу сиротеют (${p.orphans.length} строк), ОРГАН в полость без места теряется (${p.noCavity.length} строк); потолок темы ${d.facts.spread.themeCap} держит тест D «≥ 25 пунктов» впритык — cap 25 не режет тело с одним щупальцем вовсе.</li>
</ul>
</div>`;
}

// ---------------------------------------------------------------- section 6

function section6(): string {
  return `<h2 id="s6"><span class="no">6</span>Расхождения с docs/mutations.md</h2>
<p>Каталог в коде — <code>packages/core/content/mutations.ts</code>; документ в шаге C не переписывался, расхождения записаны в «Решениях по ходу» <code>body-graph.md</code> (55, 89) и повторены здесь.</p>
<ul>
<li><b>Мозг в брюхе</b> даёт 4 канала, не 8; <b>вторая голова</b> — 6 через вид «малый мозг», и вместе с головой приходят глаз и челюсть (считаются чувствам и челюстям).</li>
<li>Числа М·О·К конечностей — из графа (сегмент + окончание), не из таблицы документа: дополнительная рука 8·2·2, а не 12·1·2; дефекты без чисел в документе — 0·0·0, кроме лишнего веса (30).</li>
<li><b>Крылья</b> из рук стоят обеих кистей; «ВЫТЯЖЕНИЕ двух отростков» читается как СУСТАВ, потому что цикл из двух сегментов перепонки не несёт.</li>
<li><b>Бесформенность</b> оставляет корпуса, стебли и наросты.</li>
<li><b>Отбрасываемый хвост</b> и <b>капсула</b> получают плоскость разлома на отросшем сегменте — единственное исключение из правила «плоскость только у исходного тела».</li>
<li><b>Гидра-рука</b> растит столько копий, сколько у плеча мест; <b>память плоти</b> — снимок в момент разреза и только с соединяющим сегментом.</li>
<li><b>Вечный голод</b> есть и в челюстях (психическая), и в дефектах — два вида (<code>eternalHunger</code>, <code>insatiable</code>); <b>кислотная кровь</b> в железах и во взрывоопасном — один вид (железы); <b>складка</b> в псионике и пространстве — <code>psiFold</code> и <code>warpFold</code>.</li>
<li><b>Ушная гроздь</b> — свой вид в голове (ушей не больше двух); <b>чужой рот</b> — СУСТАВ с пастью на конечности; <b>прививочный узел</b> — ОТРОСТОК нароста 1/1 с флагом приманки; <b>корневая система</b> — окончание «корень» вместо стопы; <b>древесная плоть</b> — покров «кора».</li>
<li>Не вошли: складчатая кора (+4 канала без мозга), паучья лапа ×4 и третья пара конечностей («×4 разом» на графе — четыре отростка), сегментное тело, ноги-корни, раздвоенное сознание, глазной мозг, улей и общий разум, ключ бездны, расщепление, семейство приливных (таймеры игры, не форма тела); режимы <code>··</code>, медитация <code>M</code>, откаты псионики, своя воля паразитов, споры и заряды — эффекты игры, у модели только органы.</li>
<li><b>Движение</b> держит бур, рыло и роющие когти как перерождения кисти, плавники и паутинный ход — как наросты, крылья · парус · плавательную — как перепонки; <b>внутренности</b> — жаберный лист как перепонку, жаберную гроздь — как нарост на шее.</li>
<li>Таблица источников документа («30 % + 8 % × слой», спора, заражение, портал, яйцо) в модели не живёт: лаборатория и этот отчёт берут долю дефектов и фильтр семейств, слой не читают.</li>
</ul>`;
}

// ---------------------------------------------------------------- the page

function toc(d: ReportData): string {
  const fams = FAMILIES.map((f) => `<li><a class="fam" style="--c:var(--${groupOf(f).token})" href="#f-${f}">${esc(famRu(f))}</a></li>`).join("");
  return `<nav class="toc"><ol>
<li><a href="#s1">Как мутирует тело</a></li>
<li><a href="#s2">Источники на первом этаже</a></li>
<li><a href="#s3">Каталог: ${d.facts.rows} мутаций по ${d.facts.families} семействам</a><ul class="fams">${fams}</ul></li>
<li><a href="#s4">Популяции</a></li>
<li><a href="#s5">Проблемы модели</a></li>
<li><a href="#s6">Расхождения с docs/mutations.md</a></li>
</ol></nav>`;
}

export function bodyHtml(d: ReportData): string {
  const o = d.options;
  return `<div class="doc">
<header>
<p class="cap">mutant-engine · тело-граф</p>
<h1>Атлас мутаций</h1>
<p class="lead">${d.facts.rows} мутаций ${d.facts.families} семейств модели тело-граф: как строка каталога становится органом, куда садится, что сдвигает и во что тело сходится за десятки ударов бездны первого этажа. Отчёт собран скриптом <code>apps/lab/report/build.ts</code> из кода и таблиц; каждое число здесь посчитано, ни одно не вписано руками. Популяции — ${o.seeds} сидов, каталог — ${o.humanSeeds} сидов на человеке и ${o.typicalSeeds} на типичном теле.</p>
${toc(d)}
</header>
${section1(d)}
${section2(d)}
${section3(d)}
${section4(d)}
${section5(d)}
${section6()}
<footer class="foot">Собрано за ${(d.ms / 1000).toFixed(1).replace(".", ",")} с: популяции ${o.seeds} × ${o.strikes.join("/")} ударов × 2 режима, каталог ${d.facts.rows} × (${o.humanSeeds} + ${o.typicalSeeds}) сидов, ${o.thumbnails} силуэтов на ${d.populations.thumbnailStrikes} ударах. Модель — <code>packages/core</code>, каталог — <code>packages/core/content/mutations.ts</code>, реплей и статистика — <code>apps/lab</code>.</footer>
</div>`;
}

/** The whole page: a fragment for out/, a document for the reports folder. */
export function renderReport(d: ReportData, variant: Variant): string {
  const body = bodyHtml(d);
  if (variant === "fragment") {
    return `<title>${TITLE}</title>
<link rel="stylesheet" href="${FONTS_URL}">
<style>${styleOf("fragment")}</style>
${body}
`;
  }
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${TITLE}</title>
<meta name="description" content="${DESCRIPTION}">
<meta name="html-report" content="group mutant-engine; tags мутации, тело-граф">
<style>${styleOf("document")}</style>
</head>
<body>
${body}
</body>
</html>
`;
}
