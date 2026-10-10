/**
 * Russian words of the body: operations, families, sources, the summary keys
 * of `derive`, how a target or an element is named, the states and deaths of
 * a harmed body. Pure tables and pure functions over the body; the pages, the
 * game above and the online server read them, the rules never do.
 */
import { MUTATION_ABOUT, MUTATION_TEXT } from "./content/i18n.js";
import type { ExtraKind } from "./derive/attacks.js";
import type { Body, Eatable, Organ } from "./graph.js";
import type { Target } from "./grow.js";
import type { MutationOp } from "./mutation.js";
import type { NeedKind } from "./needs.js";
import { COVERS, MEMBRANES, ORGANS, SEGMENT_KINDS, type Family } from "./parts.js";

export const OP_RU: Record<MutationOp, string> = {
  sprout: "ОТРОСТОК",
  joint: "СУСТАВ",
  branch: "ВЕТВЛЕНИЕ",
  rebirth: "ПЕРЕРОЖДЕНИЕ",
  resize: "РАЗМЕР",
  thicken: "УТОЛЩЕНИЕ",
  thin: "ИСТОНЧЕНИЕ",
  stretch: "ВЫТЯЖЕНИЕ",
  enlarge: "РАЗРАСТАНИЕ",
  fusion: "СРАЩЕНИЕ",
  growth: "НАРОСТ",
  necrosis: "ОТМИРАНИЕ",
  membrane: "ПЕРЕПОНКА",
  double: "УДВОЕНИЕ",
  migrate: "МИГРАЦИЯ",
  organ: "ОРГАН",
  cover: "ПОКРОВ",
  bloat: "РАЗДУВАНИЕ",
  engulf: "ПОГЛОЩЕНИЕ",
  sink: "ВРАСТАНИЕ ГОЛОВЫ",
  split: "ДЕЛЕНИЕ КОРПУСА",
  merge: "СЛИЯНИЕ КОРПУСОВ",
  flesh: "МЯСНОЙ НАРОСТ",
  shift: "СМЕЩЕНИЕ ПЛАНА",
  wings: "КРЫЛЬЯ",
  twin: "БЛИЗНЕЦ",
  budding: "ПОЧКОВАНИЕ",
  amorphous: "БЕСФОРМЕННОСТЬ",
  lose: "УТРАТА",
};

export const FAMILY_RU: Record<Family, string> = {
  limbs: "конечности",
  heads: "головы",
  senses: "чувства",
  jaws: "челюсти",
  covers: "покровы",
  glands: "железы",
  movement: "движение",
  internals: "внутренности",
  reproduction: "размножение",
  psionics: "псионика",
  plant: "растительное",
  parasites: "паразиты",
  space: "пространство",
  regulators: "регуляторы",
  defects: "дефекты",
  explosive: "взрывное",
  selfEating: "самопожирание",
  chromeBreaking: "ломающее хром",
};

/** The headline quantities of `summarize`, in its order. */
export const SUMMARY_RU: Record<string, string> = {
  attacks: "атаки",
  reach: "досягаемость",
  speed: "скорость",
  support: "опора",
  ring: "кольцо",
  grips: "хваты",
  precise: "точные хваты",
  dig: "копание",
  climb: "лазание",
  swim: "плавание",
  fly: "полёт",
  edge: "держит край",
  falls: "падает в яму",
  squeeze: "протискивание",
  layEgg: "кладка",
  bulk: "габарит",
  footprint: "след",
  passage: "проход",
  cycles: "циклы",
  exposure: "открытость",
  armor: "защита",
  viewpoints: "точки обзора",
  eyes: "глаза",
  heat: "тепловое зрение",
  echo: "эхолокация",
  deep: "глубинное чутьё",
  hearing: "слух",
  smell: "нюх",
  speak: "речь",
  air: "приток воздуха",
  water: "приток воды",
  tank: "бак",
  base: "расход в покое",
  delivery: "доставка",
  media: "среда",
  mass: "масса",
  upkeep: "обмен",
  load: "нагрузка на каналы",
  channels: "каналы",
  alien: "чуждость",
  hearts: "сердца",
  starving: "без крови",
  eats: "ест",
  mouths: "рты",
  gear: "снаряжение",
};

/** The needs of the body (step J), in `NEED_KINDS` order. */
export const NEED_RU: Record<NeedKind, string> = {
  mind: "разум",
  heart: "сердце",
  mouth: "пасть",
  stomach: "желудок",
  breath: "дыхание",
  sight: "зрение",
  hearing: "слух",
  support: "опора",
  cavity: "полость",
};

/** The parts behind a need's strength, as the panel names them. */
export const NEED_PART_RU: Record<string, string> = {
  power: "сила мозгов",
  load: "нагрузка",
  over: "перегрузка",
  heavyWithout: "тяжёлых частей без этого",
  hearts: "сердец",
  heartlessTorsos: "корпусов без сердца",
  heartlessTerritories: "территорий без сердца",
  heavyBridges: "тяжёлых частей без сердца",
  mouths: "кормящих ртов",
  stomachs: "желудков",
  territoriesWithout: "территорий без этого",
  organs: "дышащих органов",
  breathlessTorsos: "корпусов без дыхания",
  support: "опора",
  target: "нужна",
  mass: "масса",
  eyes: "мест, откуда видно",
  ears: "мест, где слышно",
  brains: "живых мозгов",
  blindBrains: "мозгов без глаза рядом",
  deafBrains: "мозгов без уха рядом",
  mouthlessBrains: "мозгов без рта рядом",
  kinds: "видов органов полости",
  misses: "не влезают никуда",
  free: "свободно в лучшей полости",
};

export const GEAR_RU: Record<string, string> = {
  glove: "перчатка",
  boot: "сапог",
  helmet: "шлем",
  vest: "бронежилет",
  backpack: "рюкзак",
  belt: "ремень",
  holster: "кобура",
};

export const FATE_RU: Record<string, string> = {
  creature: "тварь: мозг и сердце",
  brainOnly: "только мозг: живёт на своей крови",
  heartOnly: "только сердце: мясо, которое качает",
  meat: "мясо",
};

export function mutationRu(id: string): string {
  return MUTATION_TEXT[`mutation.${id}`]?.ru ?? id;
}

/** One line about what a row of the catalog does, for the places it is chosen in; empty for a row without one. */
export function mutationAbout(id: string): string {
  return MUTATION_ABOUT[`mutation.${id}`]?.ru ?? "";
}

export function organRu(kind: keyof typeof ORGANS): string {
  return ORGANS[kind].ru;
}

/** `глаз ×2, кисть, стопа` - a set of organs in one line, grouped by kind in the order they were chosen. */
export function organsRu(list: readonly Organ[]): string {
  const counts = new Map<Organ["kind"], number>();
  for (const o of list) counts.set(o.kind, (counts.get(o.kind) ?? 0) + 1);
  return [...counts].map(([kind, n]) => (n > 1 ? `${ORGANS[kind].ru} ×${n}` : ORGANS[kind].ru)).join(", ");
}

/** A part a body can eat, by its name in whichever table it lives: `глаз`, `щупальце`, `хитин`, `крыло`. */
export function eatableRu(k: Eatable): string {
  const tables = [ORGANS, SEGMENT_KINDS, COVERS, MEMBRANES] as Record<string, { ru: string }>[];
  for (const t of tables) if (t[k] !== undefined) return t[k]!.ru;
  return k;
}

/** `глаз ×3, кисть ×0,5` - what the body still tastes (decision 1253), the most first; empty when nothing. */
export function eatenRu(body: Body): string {
  const e = body.eaten ?? {};
  return (Object.keys(e) as Eatable[])
    .sort((x, y) => e[y]! - e[x]! || (x < y ? -1 : 1))
    .map((k) => `${eatableRu(k)} ×${String(Math.round(e[k]! * 10) / 10).replace(".", ",")}`)
    .join(", ");
}

/** `узел 3`, `узел 6 (голова)`, `узел 4 (кисть)`. */
export function nodeName(body: Body, id: number): string {
  const n = body.nodes[id];
  if (n === undefined) return `узел ${id}`;
  const ends = n.ends.map((e) => ORGANS[e.kind].ru);
  return ends.length === 0 ? `узел ${id}` : `узел ${id} (${ends.join(", ")})`;
}

/** `корпус 9 (2–3)`, `рука 10 хитин (2–4)`. */
export function segmentName(body: Body, id: number): string {
  const s = body.segments[id];
  if (s === undefined) return `сегмент ${id}`;
  const cover = s.cover === "skin" ? "" : ` ${COVERS[s.cover].ru}`;
  return `${SEGMENT_KINDS[s.kind].ru} ${id}${cover} (${s.a}–${s.b})`;
}

function membraneName(body: Body, id: number): string {
  const m = body.membranes[id];
  return m === undefined ? `перепонка ${id}` : `${MEMBRANES[m.kind].ru} ${id} на [${m.cycle.join(", ")}]`;
}

export function elementName(body: Body, id: number): string {
  if (body.nodes[id] !== undefined) return nodeName(body, id);
  if (body.segments[id] !== undefined) return segmentName(body, id);
  return membraneName(body, id);
}

export function targetName(body: Body, t: Target): string {
  if ("node" in t) return nodeName(body, t.node);
  if ("segment" in t) return segmentName(body, t.segment);
  if ("ending" in t) {
    const e = body.nodes[t.ending.node]?.ends[t.ending.index];
    return `${e === undefined ? "окончание" : ORGANS[e.kind].ru} ${t.ending.index} у узла ${t.ending.node}`;
  }
  if ("pair" in t) return `пара узлов ${t.pair[0]} и ${t.pair[1]}`;
  return `цикл [${t.cycle.join(", ")}]`;
}

/** `n6.0` → `голова у узла 6`, `s13.1` → `мозг в корпусе 13`. */
export function brainName(body: Body, key: string): string {
  const m = /^([ns])(\d+)\.(\d+)$/.exec(key);
  if (m === null) return key;
  const id = Number(m[2]);
  if (m[1] === "n") {
    const kind = body.nodes[id]?.ends[Number(m[3])]?.contents?.find((c) => ORGANS[c.kind].tags?.includes("brain"))?.kind;
    return `${kind === undefined ? "мозг" : ORGANS[kind].ru} в голове у узла ${id}`;
  }
  const kind = body.segments[id]?.cavity[Number(m[3])]?.kind;
  return `${kind === undefined ? "мозг" : ORGANS[kind].ru} в полости ${SEGMENT_KINDS[body.segments[id]?.kind ?? "torso"].ru} ${id}`;
}

export function fmt(v: number | boolean | string): string {
  if (typeof v === "boolean") return v ? "да" : "нет";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, "").replace(".", ",");
  return v;
}

export const STATE_RU = { whole: "цел", hurt: "ранен", broken: "сломан", destroyed: "разрушен" } as const;
export const DEATH_RU = { blood: "кровопотеря", brain: "не осталось живого мозга", mass: "истощение: масса 0" } as const;
export const PAIN_RU = { calm: "", tremor: "тремор", spasm: "судорога", out: "без сознания" } as const;
export const BLOOD_RU = { fine: "в норме", weak: "слабость", grave: "тяжёлая потеря", faint: "обморочная", none: "нет крови" } as const;
/** What an addition of strike.md §1.6 owes past the cover. */
export const EXTRA_RU: Record<ExtraKind, string> = { venom: "яд", acid: "кислота", shock: "разряд", spikes: "шипы" };

/** An organ key of the model (`n1.0.0`, `s9.c1`) as the brain it holds, read on the body or, when gone, on the one before. */
export function brainLabel(body: Body, key: string, before?: Body): string {
  const n = /^n(\d+)\.(\d+)/.exec(key);
  const c = /^s(\d+)\.c(\d+)$/.exec(key);
  const short = n !== null ? `n${n[1]}.${n[2]}` : c !== null ? `s${c[1]}.${c[2]}` : key;
  const id = Number((n ?? c)?.[1] ?? NaN);
  const on = before !== undefined && body.nodes[id] === undefined && body.segments[id] === undefined ? before : body;
  return brainName(on, short);
}

export function turnsRu(n: number): string {
  const d = n % 10;
  const h = n % 100;
  if (d === 1 && h !== 11) return "ход";
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return "хода";
  return "ходов";
}
