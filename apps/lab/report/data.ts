/**
 * The numbers of the atlas of mutations, every one computed from the model
 * and its tables, none written by hand: the catalog row by row (payload,
 * target rule, prices, the share of a first strike's draw, a sample landing
 * on the human with the shift of the derived numbers, landing shares on the
 * human and on a body of twenty abyss strikes), the sources of the first
 * floor, the populations of the lab's statistics at 10 / 30 / 60 strikes
 * with the spread on and off, and the problems those populations show.
 *
 * Pure: no DOM, no files. The page is html.ts, the entry is build.ts. The
 * lab's replay, sources and statistics are reused, not copied: a sample here
 * is `measure` of apps/lab/stats.ts on the body of `run` of packages/core/history.ts.
 */
import {
  COVERS,
  ENDING_AFFINITY,
  FAMILIES,
  FLESH_MEMORY_TURNS,
  LIMITS,
  MEMBRANES,
  MEMBRANE_MAX,
  MEMBRANE_MIN,
  ORGANS,
  RESERVE_PER_MASS,
  SEGMENT_KINDS,
  SKELETON_CEILING,
  SPREAD,
  WANDER_TURNS,
  applyMutation,
  bodyHash,
  capacity,
  cavityLoad,
  cloneBody,
  closure,
  derive,
  diffDerived,
  human,
  mass,
  hasPlace,
  mutationTargets,
  nodeIds,
  organMass,
  organUpkeep,
  segmentIds,
  segmentMassOf,
  sortedIds,
  targets,
  territories,
  type Body,
  type DerivedChange,
  type Family,
  type MembraneKind,
  type Mutation,
  type MutationContext,
  type MutationOp,
  type Op,
  type Organ,
  type OrganKind,
  type TargetRule,
  MUTATION_TEXT,
  MUTATIONS,
  SOURCES,
  type Event,
  type Source,
  type SourceSpec,
  LabRng,
  run,
  OP_RU,
  targetName,
} from "@mutant-engine/core";
import { silhouetteSvg } from "@mutant-engine/view";
import { abyssSummary, grow, measure, shareAt, type AbyssSummary, type Sample } from "../stats.js";

// ---------------------------------------------------------------- options

export interface ReportOptions {
  /** Seeds of every population cell. */
  seeds: number;
  /** Strike counts of the populations, ascending; one replay per seed gives them all. */
  strikes: number[];
  /** Seeds behind the landing share on the human. */
  humanSeeds: number;
  /** Seeds behind the landing share on the typical body, and how many strikes make it typical. */
  typicalSeeds: number;
  typicalStrikes: number;
  /** Silhouettes of typical bodies at the middle strike count. */
  thumbnails: number;
}

const DEFAULT_OPTIONS: ReportOptions = { seeds: 200, strikes: [10, 30, 60], humanSeeds: 200, typicalSeeds: 200, typicalStrikes: 20, thumbnails: 12 };

/** The lab's abyss (body-graph.md, decision 84): the source the whole atlas is measured by. */
const SOURCE: Source = "abyss";
const ABYSS: MutationContext = { source: "abyss" };
/** A body counts as at the ceiling above this mass (the H tests' `full`). */
const FULL_MASS = SKELETON_CEILING - 4;

const COMPOSITES: ReadonlySet<string> = new Set(["wings", "twin", "budding", "amorphous", "lose"]);

function isComposite(op: MutationOp): op is Exclude<MutationOp, Op> {
  return COMPOSITES.has(op);
}

// ---------------------------------------------------------------- the model in numbers (section 1)

interface ModelFacts {
  ceiling: number;
  reservePerMass: number;
  affinity: number;
  wanderTurns: number;
  fleshMemoryTurns: number;
  membraneCycle: [number, number];
  limits: typeof LIMITS;
  spread: typeof SPREAD;
  /** Rows of the catalog per operation, in OP_RU order. */
  opRows: { op: MutationOp; ru: string; rows: number }[];
  /** Kinds that think and what each gives. */
  brains: { kind: OrganKind; ru: string; channels: number; mass: number }[];
  organKinds: number;
  covers: { id: string; ru: string; massFactor: number; defense: number; stretches: boolean; mutates: boolean }[];
  membranes: { id: MembraneKind; ru: string; family: Family }[];
  families: number;
  rows: number;
}

function modelFacts(): ModelFacts {
  const perOp = new Map<MutationOp, number>();
  for (const m of MUTATIONS) perOp.set(m.op, (perOp.get(m.op) ?? 0) + 1);
  const brains: ModelFacts["brains"] = [];
  for (const kind of Object.keys(ORGANS) as OrganKind[]) {
    const spec = ORGANS[kind];
    if (spec.tags?.includes("brain")) brains.push({ kind, ru: spec.ru, channels: spec.channels ?? 0, mass: spec.mass });
  }
  return {
    ceiling: SKELETON_CEILING,
    reservePerMass: RESERVE_PER_MASS,
    affinity: ENDING_AFFINITY,
    wanderTurns: WANDER_TURNS,
    fleshMemoryTurns: FLESH_MEMORY_TURNS,
    membraneCycle: [MEMBRANE_MIN, MEMBRANE_MAX],
    limits: LIMITS,
    spread: SPREAD,
    opRows: (Object.keys(OP_RU) as MutationOp[]).map((op) => ({ op, ru: OP_RU[op], rows: perOp.get(op) ?? 0 })),
    brains,
    organKinds: Object.keys(ORGANS).length,
    covers: (Object.keys(COVERS) as (keyof typeof COVERS)[]).map((id) => ({ id, ru: COVERS[id].ru, massFactor: COVERS[id].massFactor, defense: COVERS[id].defense, stretches: COVERS[id].stretches, mutates: COVERS[id].mutates })),
    membranes: (Object.keys(MEMBRANES) as MembraneKind[]).map((id) => ({ id, ru: MEMBRANES[id].ru, family: MEMBRANES[id].family })),
    families: FAMILIES.length,
    rows: MUTATIONS.length,
  };
}

// ---------------------------------------------------------------- the catalog in words

export function organRu(o: Organ): string {
  const ru = ORGANS[o.kind].ru;
  return o.contents !== undefined && o.contents.length > 0 ? `${ru}(${o.contents.map(organRu).join(", ")})` : ru;
}

const MOUNT_RU = { cavity: "в полость корпуса", head: "в голову", growth: "на поверхность сегмента" } as const;

/** The payload of a row in Russian: what grows, what changes. */
function payloadRu(m: Mutation): string {
  switch (m.op) {
    case "sprout": {
      const p = m.payload;
      const parts = [`${SEGMENT_KINDS[p.kind].ru} ${p.length}/${p.girth} ${COVERS[p.cover].ru}`];
      parts.push(p.ending === null ? "без окончания" : `→ ${organRu(p.ending)}`);
      if (p.growths !== undefined && p.growths.length > 0) parts.push(`[${p.growths.map(organRu).join(", ")}]`);
      if (p.breakPlane === true) parts.push("с плоскостью разлома");
      if (p.bait === true) parts.push("узел-приманка");
      return parts.join(" ");
    }
    case "joint":
      return m.payload.ending === null ? "новый узел посередине, без окончания" : `новый узел посередине с окончанием ${organRu(m.payload.ending)}`;
    case "branch":
      return `две ветви ${SEGMENT_KINDS[m.payload.kind].ru} ${m.payload.length}/${m.payload.girth} ${COVERS[m.payload.cover].ru}, окончание в обеих`;
    case "rebirth":
      return `окончание → ${organRu(m.payload.ending)}`;
    case "resize":
      return `${ORGANS[m.payload.kind].ru}: ступень «${m.payload.size}»`;
    case "thicken":
      return "обхват +1, открывается полость";
    case "thin":
      return "обхват −1";
    case "stretch":
      return m.payload.delta > 0 ? "длина +1" : "длина −1";
    case "enlarge":
      return "размер узла +1";
    case "fusion":
      return "два узла в один, окончания гибнут";
    case "growth":
      return "нарост 1/1";
    case "necrosis":
      return "часть без крови отпадает";
    case "membrane":
      return `перепонка «${MEMBRANES[m.payload.kind].ru}» на согнутой конечности или на цикле`;
    case "double":
      return "копия висячей части на тот же узел";
    case "migrate":
      return `окончание блуждает: шаг за ${WANDER_TURNS} ходов`;
    case "organ":
      return `${organRu(m.payload.organ)} ${MOUNT_RU[m.payload.mount]}`;
    case "cover":
      return `покров «${COVERS[m.payload.cover].ru}» на один сегмент, дальше ползёт`;
    case "wings":
      return `СУСТАВ ×2 (ВЫТЯЖЕНИЕ, если конечность короче 2) + СРАЩЕНИЕ кончиков + перепонка «${MEMBRANES[m.payload.kind].ru}»`;
    case "twin":
      return `корпус 2/2 кожа с головой (${ORGANS[m.payload.brain].ru}, глаз, челюсть)${m.payload.arms > 0 ? `, РАЗРАСТАНИЕ узла, руки с кистями ×${m.payload.arms}` : ""}`;
    case "budding":
      return `УТОЛЩЕНИЕ + сердце и ${ORGANS[m.payload.brain].ru} в полость + метка «почка»`;
    case "amorphous":
      return "все конечности → щупальца, все окончания кроме голов → ложноножки";
    case "lose":
      return `из головы уходят: ${m.payload.kinds.map((k) => ORGANS[k].ru).join(", ")}`;
    case "bloat":
      return "обхват корпуса +1 до 6, потом длина +1 до 6; кожа трескается";
    case "engulf":
      return "висячая конечность уходит в корпус: обхват +1, окончание в узле корпуса";
    case "sink":
      return "сегмент под головой короче на 1; при длине 1 голова сливается с другим концом";
    case "split":
      return "корпус расщепляется на два параллельных, полость делится";
    case "merge":
      return "два корпуса у узла становятся одним: сумма длин, больший обхват";
    case "flesh":
      return "нарост растёт в корпус обхвата 2 и тянет к себе висячие конечности";
    case "shift":
      return "конечность переезжает на другой конец корпуса";
  }
}

const DEFAULT_TARGET_RU: Record<MutationOp, string> = {
  sprout: "узел со свободным местом",
  joint: "сегмент длины ≥ 2",
  branch: "окончание в узле с двумя свободными местами",
  rebirth: "любое окончание",
  resize: "орган того же вида, стоящий другой ступенью",
  thicken: "конечность без хитина и хрома",
  thin: "корпус обхвата ≥ 2",
  stretch: "сегмент длины < 6",
  enlarge: "узел, у которого места кончились",
  fusion: "пара узлов рядом",
  growth: "узел со свободным местом",
  necrosis: "элемент без крови",
  membrane: `простой цикл из ${MEMBRANE_MIN}–${MEMBRANE_MAX} сегментов без перепонки`,
  double: "мост без твоего мозга за ним",
  migrate: "окончание, кроме твоей головы",
  organ: "крепление по виду",
  cover: "сегмент без этого покрова",
  wings: "узел с двумя конечностями до голых кончиков",
  twin: "узел со свободным местом",
  budding: "конечность, чья полость после утолщения вместит сердце и мозг",
  amorphous: "твой узел",
  lose: "голова, в которой есть что терять",
  bloat: "корпус, чей покров тянется, обхвата < 6 или длины < 6",
  engulf: "висячая конечность у узла с корпусом обхвата < 6, где есть место окончанию",
  sink: "сегмент не-корпус, один конец которого держит голову не в корпусе",
  split: "корпус обхвата ≥ 2 со свободным местом на обоих концах",
  merge: "узел с двумя корпусами к разным узлам, сумма длин ≤ 6",
  flesh: "нарост с листовым дальним узлом у узла с корпусом",
  shift: "конечность у узла с корпусом, чей другой конец имеет свободный слот",
};

function organTargetRu(m: Mutation): string {
  if (m.op !== "organ") return DEFAULT_TARGET_RU[m.op];
  switch (m.payload.mount) {
    case "cavity":
      return "корпус с местом в полости";
    case "head":
      return "голова с местом под этот орган";
    case "growth":
      return "любой мутирующий сегмент";
  }
}

/** The target rule in Russian: the operation's default narrowed by every field of the rule. */
function ruleRu(m: Mutation): string {
  const r: TargetRule = m.target;
  const parts: string[] = [];
  if (r.kinds !== undefined) parts.push(`вид: ${r.kinds.map((k) => SEGMENT_KINDS[k].ru).join(" · ")}`);
  if (r.minSize !== undefined) parts.push(`узел размера ≥ ${r.minSize}`);
  if (r.endings !== undefined) parts.push(`окончание: ${r.endings.map((e) => ORGANS[e].ru).join(" · ")}`);
  if (r.toHead === true) parts.push("сегмент к голове");
  if (r.digests === true) parts.push("полость переваривает");
  if (r.keepsCavity === true) parts.push("полость не выдавливается");
  return parts.length === 0 ? organTargetRu(m) : `${organTargetRu(m)}; ${parts.join(", ")}`;
}

export interface Price {
  mass: number | null;
  upkeep: number | null;
  control: number | null;
  /** Channels the row gives (brains, parasites). */
  channels: number;
  /** Why a price is null, or what it depends on. */
  note: string | null;
}

function organPrice(o: Organ): { mass: number; upkeep: number; control: number; channels: number } {
  let control = ORGANS[o.kind].control;
  let channels = ORGANS[o.kind].channels ?? 0;
  for (const c of o.contents ?? []) {
    control += organPrice(c).control;
    channels += organPrice(c).channels;
  }
  return { mass: organMass(o), upkeep: organUpkeep(o), control, channels };
}

function limbPrice(kind: keyof typeof SEGMENT_KINDS, length: number, girth: number, cover: keyof typeof COVERS, organsOn: Organ[]): Price {
  let mass = segmentMassOf(kind, length, girth, cover);
  let upkeep = SEGMENT_KINDS[kind].upkeepPer * length;
  let control = 0;
  let channels = 0;
  for (const o of organsOn) {
    const p = organPrice(o);
    mass += p.mass;
    upkeep += p.upkeep;
    control += p.control;
    channels += p.channels;
  }
  return { mass, upkeep, control, channels, note: null };
}

/** М·О·К of a row from the tables: what the row brings by itself; null where the target decides. */
export function priceOf(m: Mutation): Price {
  const byOrgan = (o: Organ, note: string | null = null): Price => ({ ...organPrice(o), note });
  switch (m.op) {
    case "sprout":
      return limbPrice(m.payload.kind, m.payload.length, m.payload.girth, m.payload.cover, [...(m.payload.ending === null ? [] : [m.payload.ending]), ...(m.payload.growths ?? [])]);
    case "organ":
      return byOrgan(m.payload.organ);
    case "joint":
      return m.payload.ending === null ? { mass: 0, upkeep: 0, control: 0, channels: 0, note: null } : byOrgan(m.payload.ending);
    case "rebirth":
      return byOrgan(m.payload.ending, "вместо прежнего окончания");
    case "branch": {
      const seg = limbPrice(m.payload.kind, m.payload.length, m.payload.girth, m.payload.cover, []);
      return { mass: 2 * seg.mass!, upkeep: 2 * seg.upkeep!, control: 0, channels: 0, note: "плюс копия окончания" };
    }
    case "twin": {
      const head = organPrice({ kind: "head", instability: 0, contents: [{ kind: m.payload.brain, instability: 0 }, { kind: "eye", instability: 0 }, { kind: "jaw", instability: 0 }] });
      const torso = limbPrice("torso", 2, 2, "skin", []);
      const arm = limbPrice("arm", 1, 1, "skin", [{ kind: "hand", instability: 0 }]);
      return {
        mass: torso.mass! + head.mass + m.payload.arms * arm.mass!,
        upkeep: torso.upkeep! + head.upkeep + m.payload.arms * arm.upkeep!,
        control: head.control + m.payload.arms * arm.control!,
        channels: head.channels,
        note: null,
      };
    }
    case "budding": {
      const heart = organPrice({ kind: "heart", instability: 0 });
      const brain = organPrice({ kind: m.payload.brain, instability: 0 });
      return { mass: heart.mass + brain.mass, upkeep: heart.upkeep + brain.upkeep, control: heart.control + brain.control, channels: brain.channels, note: "плюс утолщение сегмента" };
    }
    case "cover":
      return { mass: null, upkeep: 0, control: 0, channels: 0, note: COVERS[m.payload.cover].massFactor === 1 ? "масса сегмента без изменений" : `масса сегмента ×${COVERS[m.payload.cover].massFactor}` };
    case "membrane":
    case "wings":
      return { mass: 0, upkeep: 0, control: 0, channels: 0, note: "перепонка не весит" };
    case "stretch":
      return { mass: null, upkeep: null, control: 0, channels: 0, note: "по сегменту: масса и обмен за единицу длины его вида" };
    case "enlarge":
    case "migrate":
      return { mass: 0, upkeep: 0, control: 0, channels: 0, note: null };
    case "fusion":
      return { mass: null, upkeep: null, control: null, channels: 0, note: "окончания обоих узлов уходят" };
    case "amorphous":
      return { mass: null, upkeep: null, control: null, channels: 0, note: "перестройка: масса не растёт" };
    case "lose":
      return { mass: null, upkeep: null, control: null, channels: 0, note: "утрата: органы уходят, масса падает" };
    default:
      return { mass: null, upkeep: null, control: null, channels: 0, note: "по цели" };
  }
}

// ---------------------------------------------------------------- draws of a source on the human

function catalogFor(spec: SourceSpec): Mutation[] {
  return MUTATIONS.filter((m) => !spec.never.includes(m.family));
}

/** The share of the source's draws on the human (no theme) that this row takes: the defect roll, then `chance` within its class. */
export function drawShare(m: Mutation, spec: SourceSpec = SOURCES[0]!): number {
  if (spec.never.includes(m.family)) return 0;
  const rows = catalogFor(spec);
  const defect = m.tags.includes("defect");
  let sum = 0;
  for (const r of rows) if (r.tags.includes("defect") === defect) sum += r.chance;
  if (spec.defects === null) return m.chance / rows.reduce((s, r) => s + r.chance, 0);
  const cls = defect ? spec.defects : 1 - spec.defects;
  return sum > 0 ? (cls * m.chance) / sum : 0;
}

interface SourceRow {
  spec: SourceSpec;
  /** Share of the draws per family on the human; null for a source that asks for a family. */
  families: Record<Family, number> | null;
  /** Families a family source cannot serve on its defect roll: no defect row there. */
  empty: Family[];
  /** Rows the source can ever draw. */
  rows: number;
}

export function sourceRows(): SourceRow[] {
  return SOURCES.filter((s) => s.id !== "id").map((spec) => {
    const rows = catalogFor(spec);
    const families = Object.fromEntries(FAMILIES.map((f) => [f, 0])) as Record<Family, number>;
    for (const m of rows) families[m.family] += drawShare(m, spec);
    const empty = spec.family ? FAMILIES.filter((f) => !rows.some((m) => m.family === f && m.tags.includes("defect"))) : [];
    return { spec, families: spec.family ? null : families, empty, rows: rows.length };
  });
}

// ---------------------------------------------------------------- why a row does not land

function endingKinds(body: Body): Set<OrganKind> {
  const out = new Set<OrganKind>();
  for (const id of nodeIds(body)) for (const e of body.nodes[id]!.ends) out.add(e.kind);
  return out;
}

function ruleMiss(body: Body, m: Mutation): string {
  const r = m.target;
  const missing: string[] = [];
  if (r.endings !== undefined) {
    const have = endingKinds(body);
    const absent = r.endings.filter((e) => !have.has(e));
    if (absent.length === r.endings.length) missing.push(`в теле нет окончаний вида ${r.endings.map((e) => ORGANS[e].ru).join(" / ")}`);
    else missing.push(`окончания вида ${r.endings.map((e) => ORGANS[e].ru).join(" / ")} есть, но не там, где операция может встать`);
  }
  if (r.kinds !== undefined) {
    const have = new Set(segmentIds(body).map((id) => body.segments[id]!.kind));
    if (!r.kinds.some((k) => have.has(k))) missing.push(`в теле нет сегментов вида ${r.kinds.map((k) => SEGMENT_KINDS[k].ru).join(" / ")}`);
    else missing.push(`сегменты вида ${r.kinds.map((k) => SEGMENT_KINDS[k].ru).join(" / ")} есть, но не проходят по остальным условиям`);
  }
  if (r.minSize !== undefined && missing.length === 0) missing.push(`нет узла размера ≥ ${r.minSize} со свободным местом`);
  return missing.length === 0 ? "ни одно место операции не проходит правило" : missing.join("; ");
}

function opMiss(body: Body, m: Mutation): string {
  switch (m.op) {
    case "membrane":
      return `нет ни согнутой конечности из 2–${MEMBRANE_MAX} рёбер, ни простого цикла из ${MEMBRANE_MIN}–${MEMBRANE_MAX} сегментов: замкнутость ${closure(body)}`;
    case "branch":
      return "ВЕТВЛЕНИЮ нужны два свободных места у узла окончания, а у кистей и стоп человека по одному";
    case "organ": {
      const p = m.payload;
      if (p.mount === "cavity") {
        let best = -Infinity;
        for (const id of segmentIds(body)) {
          const s = body.segments[id]!;
          if (s.kind === "torso") best = Math.max(best, capacity(s) - cavityLoad(s));
        }
        return `в полости нет места: орган весит ${organMass(p.organ)}, свободно не больше ${Number.isFinite(best) ? best : 0}`;
      }
      if (p.mount === "head") return `нет головы с местом под «${ORGANS[p.organ.kind].ru}»`;
      return "нет мутирующего сегмента без такой метки";
    }
    case "rebirth":
      return "нет окончания, которое можно переродить";
    case "migrate":
      return "нет окончания, которое может блуждать: твоя голова не блуждает";
    case "joint":
      return "нет сегмента длины ≥ 2 с мутирующим покровом";
    case "fusion":
      return "нет пары узлов рядом со свободным местом";
    case "enlarge":
      return "нет узла, у которого места кончились";
    case "wings":
      return "нет узла с двумя конечностями до голых кончиков";
    case "twin":
      return "нет узла со свободным местом или пределы §8";
    case "budding":
      return "нет конечности, чья полость после утолщения вместит сердце и мозг";
    default:
      return `операция ${OP_RU[m.op]} не находит цели`;
  }
}

/** Why the row does not land on the body: no place by the operation, the rule sifting every place, or the ceiling. */
function whyNot(body: Body, m: Mutation): string {
  const probe = cloneBody(body);
  const free = mutationTargets(probe, m, { spread: false, ceiling: Infinity }).length;
  if (free > 0) return `места есть (${free}), но потолок скелета ${SKELETON_CEILING} не пускает массу и вытеснять нечего`;
  if (isComposite(m.op)) return opMiss(probe, m);
  probe.meat = SKELETON_CEILING;
  const raw = targets(probe, m.op, m.payload as never).length;
  if (raw === 0) return opMiss(probe, m);
  return `правило цели отсеивает все ${raw} мест операции: ${ruleMiss(probe, m)}`;
}

// ---------------------------------------------------------------- the catalog measured

interface Landing {
  seeds: number;
  landed: number;
  tumours: number;
  lost: number;
  /** Seeds where the row had no place even without a ceiling. */
  noTarget: number;
}

interface SampleLanding {
  landed: boolean;
  fallback: boolean;
  svg: string | null;
  target: string | null;
  diff: DerivedChange[];
  reason: string | null;
}

export interface CatalogEntry {
  m: Mutation;
  ru: string;
  en: string;
  op: string;
  payload: string;
  rule: string;
  price: Price;
  defect: boolean;
  /** Share of the abyss's draws on the human. */
  drawShare: number;
  human: Landing;
  typical: Landing;
  sample: SampleLanding;
}

function emptyLanding(seeds: number): Landing {
  return { seeds, landed: 0, tumours: 0, lost: 0, noTarget: 0 };
}

function count(into: Landing, r: ReturnType<typeof applyMutation>, noTarget: boolean): void {
  if (noTarget) into.noTarget += 1;
  if (r === null) into.lost += 1;
  else if (r.fallback) into.tumours += 1;
  else into.landed += 1;
}

function sampleOn(m: Mutation, humanDerived: ReturnType<typeof derive>, size: number): SampleLanding {
  const b = human();
  const r = applyMutation(b, m, new LabRng(`atlas-${m.id}`), ABYSS);
  if (r !== null && !r.fallback) {
    return { landed: true, fallback: false, svg: silhouetteSvg(b, { size, territories: territories(b).filter((t) => !t.brain.self) }), target: targetName(b, r.target), diff: diffDerived(humanDerived, derive(b)), reason: null };
  }
  return { landed: false, fallback: r !== null, svg: null, target: null, diff: [], reason: whyNot(human(), m) };
}

/** Every row measured: on the human and on the typical bodies handed in. */
function catalogEntries(typical: readonly Body[], humanSeeds: number, size = 150): CatalogEntry[] {
  const humanDerived = derive(human());
  return MUTATIONS.map((m) => {
    const h = emptyLanding(humanSeeds);
    for (let seed = 1; seed <= humanSeeds; seed++) {
      const b = human();
      const noTarget = !hasPlace(b, m, ABYSS);
      count(h, applyMutation(b, m, new LabRng(`atlas-human-${m.id}-${seed}`), ABYSS), noTarget);
    }
    const t = emptyLanding(typical.length);
    typical.forEach((body, i) => {
      const b = cloneBody(body);
      const noTarget = !hasPlace(b, m, ABYSS);
      count(t, applyMutation(b, m, new LabRng(`atlas-typical-${m.id}-${i + 1}`), ABYSS), noTarget);
    });
    const text = MUTATION_TEXT[m.i18n]!;
    return {
      m,
      ru: text.ru,
      en: text.en,
      op: OP_RU[m.op],
      payload: payloadRu(m),
      rule: ruleRu(m),
      price: priceOf(m),
      defect: m.tags.includes("defect"),
      drawShare: drawShare(m),
      human: h,
      typical: t,
      sample: sampleOn(m, humanDerived, size),
    };
  });
}

interface FamilySummary {
  family: Family;
  rows: number;
  defects: number;
  /** Mean of the rows' own mass where the tables give one. */
  meanMass: number;
  priced: number;
  /** Sum of `chance` of the family's rows, and its share of the abyss's draws on the human. */
  chance: number;
  drawShare: number;
  /** Rows that land on the human; rows that land on more than half of the typical bodies. */
  onHuman: number;
  onTypical: number;
}

function familySummaries(entries: readonly CatalogEntry[]): FamilySummary[] {
  return FAMILIES.map((family) => {
    const rows = entries.filter((e) => e.m.family === family);
    const priced = rows.filter((e) => e.price.mass !== null);
    return {
      family,
      rows: rows.length,
      defects: rows.filter((e) => e.defect).length,
      meanMass: priced.length === 0 ? 0 : priced.reduce((s, e) => s + e.price.mass!, 0) / priced.length,
      priced: priced.length,
      chance: rows.reduce((s, e) => s + e.m.chance, 0),
      drawShare: rows.reduce((s, e) => s + e.drawShare, 0),
      onHuman: rows.filter((e) => e.human.landed > 0).length,
      onTypical: rows.filter((e) => e.typical.landed * 2 > e.typical.seeds).length,
    };
  });
}

// ---------------------------------------------------------------- populations (section 4)

export interface RowStats {
  id: string;
  drawn: number;
  landed: number;
  tumours: number;
  lost: number;
}

interface Trajectory {
  seed: number;
  spread: boolean;
  /** Mass after every strike. */
  masses: number[];
  /** Strike numbers (1-based) of the first time each thing happened; null when it never did. */
  firstFull: number | null;
  firstDisplaced: number | null;
  firstTumour: number | null;
  firstLost: number | null;
}

export interface PopulationCell {
  strikes: number;
  spread: boolean;
  samples: Sample[];
  summary: AbyssSummary;
  /** Share of bodies with three or more organs of the family. */
  at3: Record<Family, number>;
  /** Bodies with a cycle; bodies with a membrane; membranes by kind over the whole cell. */
  withCycles: number;
  withMembranes: number;
  membranes: Partial<Record<MembraneKind, number>>;
  /** Bodies at the ceiling. */
  full: number;
}

export interface Window {
  from: number;
  to: number;
  strikes: number;
  lost: number;
  tumours: number;
  displaced: number;
}

interface Populations {
  seeds: number;
  strikes: number[];
  cells: PopulationCell[];
  trajectories: Trajectory[];
  /** Per row over the longest run, the spread on and off. */
  rowsOn: Map<string, RowStats>;
  rowsOff: Map<string, RowStats>;
  /** Draws per family and defect draws over the longest run, the spread on. */
  familyDrawn: Record<Family, number>;
  defectDrawn: number;
  defectLanded: number;
  landedTotal: number;
  drawnTotal: number;
  windowsOn: Window[];
  windowsOff: Window[];
  /** Limbs turned into tentacles by contagion, the spread on. */
  infected: number;
  thumbnails: { seed: number; svg: string; sample: Sample }[];
  /** Strike count of the thumbnails. */
  thumbnailStrikes: number;
}

function cellOf(strikes: number, spread: boolean, samples: Sample[], bodies: Body[]): PopulationCell {
  const membranes: Partial<Record<MembraneKind, number>> = {};
  let withMembranes = 0;
  for (const b of bodies) {
    const ids = sortedIds(b.membranes);
    if (ids.length > 0) withMembranes += 1;
    for (const id of ids) {
      const kind = b.membranes[id]!.kind;
      membranes[kind] = (membranes[kind] ?? 0) + 1;
    }
  }
  return {
    strikes,
    spread,
    samples,
    summary: abyssSummary(samples, strikes),
    at3: shareAt(samples, 3),
    withCycles: samples.filter((s) => s.closure > 0).length,
    withMembranes,
    membranes,
    full: samples.filter((s) => s.mass > FULL_MASS).length,
  };
}

function rowStat(map: Map<string, RowStats>, id: string): RowStats {
  let r = map.get(id);
  if (r === undefined) {
    r = { id, drawn: 0, landed: 0, tumours: 0, lost: 0 };
    map.set(id, r);
  }
  return r;
}

function windowsOf(strikes: number[]): Window[] {
  const out: Window[] = [];
  let from = 1;
  for (const to of strikes) {
    out.push({ from, to, strikes: 0, lost: 0, tumours: 0, displaced: 0 });
    from = to + 1;
  }
  return out;
}

/** Nearest bodies to the population's median by nodes, segments, closure, heads and mass, each scaled by its range. */
export function typicalSeeds(samples: readonly Sample[], count: number): number[] {
  const keys = ["nodes", "segments", "closure", "heads", "mass"] as const;
  const median = (xs: number[]): number => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length === 0 ? 0 : s.length % 2 === 1 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
  };
  const scale = keys.map((k) => {
    const xs = samples.map((s) => s[k]);
    const med = median(xs);
    const range = Math.max(1e-9, Math.max(...xs) - Math.min(...xs));
    return { k, med, range };
  });
  return samples
    .map((s) => ({ seed: s.seed, d: scale.reduce((sum, { k, med, range }) => sum + ((s[k] - med) / range) ** 2, 0) }))
    .sort((a, b) => a.d - b.d || a.seed - b.seed)
    .slice(0, count)
    .map((x) => x.seed);
}

export function populations(opts: ReportOptions, size = 200): Populations {
  const strikes = [...opts.strikes].sort((a, b) => a - b);
  const last = strikes[strikes.length - 1]!;
  const cells: PopulationCell[] = [];
  const trajectories: Trajectory[] = [];
  const rowsOn = new Map<string, RowStats>();
  const rowsOff = new Map<string, RowStats>();
  const familyDrawn = Object.fromEntries(FAMILIES.map((f) => [f, 0])) as Record<Family, number>;
  let defectDrawn = 0;
  let defectLanded = 0;
  let landedTotal = 0;
  let drawnTotal = 0;
  let infected = 0;
  const windowsOn = windowsOf(strikes);
  const windowsOff = windowsOf(strikes);
  let thumbnails: Populations["thumbnails"] = [];
  const thumbnailStrikes = strikes[Math.floor((strikes.length - 1) / 2)]!;
  for (const spread of [true, false]) {
    const perStrike = new Map<number, { samples: Sample[]; bodies: Body[] }>(strikes.map((k) => [k, { samples: [], bodies: [] }]));
    const rows = spread ? rowsOn : rowsOff;
    const windows = spread ? windowsOn : windowsOff;
    for (let seed = 1; seed <= opts.seeds; seed++) {
      const r = run({ seed, start: { kind: "human" }, commands: [{ t: "mutate", source: SOURCE, n: last }], spread });
      for (const k of strikes) {
        const cell = perStrike.get(k)!;
        const body = r.steps[k]!.body;
        cell.samples.push(measure(seed, body, r.events.slice(0, k)));
        cell.bodies.push(body);
      }
      const t: Trajectory = { seed, spread, masses: [], firstFull: null, firstDisplaced: null, firstTumour: null, firstLost: null };
      r.steps.slice(1).forEach((step, i) => {
        const n = i + 1;
        const m = mass(step.body);
        t.masses.push(m);
        if (t.firstFull === null && m > FULL_MASS) t.firstFull = n;
        const e: Event = step.event;
        if (e.kind !== "mutate" || e.mutation === null) return;
        const w = windows.find((x) => n >= x.from && n <= x.to)!;
        w.strikes += 1;
        const row = rowStat(rows, e.mutation.id);
        row.drawn += 1;
        if (spread) {
          drawnTotal += 1;
          familyDrawn[e.mutation.family] += 1;
          if (e.mutation.tags.includes("defect")) defectDrawn += 1;
        }
        if (e.result === null) {
          row.lost += 1;
          w.lost += 1;
          if (t.firstLost === null) t.firstLost = n;
        } else if (e.result.fallback) {
          row.tumours += 1;
          w.tumours += 1;
          if (t.firstTumour === null) t.firstTumour = n;
        } else {
          row.landed += 1;
          if (spread) {
            landedTotal += 1;
            if (e.mutation.tags.includes("defect")) defectLanded += 1;
            if (e.result.infected !== null) infected += 1;
          }
          if (e.result.displaced.length > 0) {
            w.displaced += e.result.displaced.length;
            if (t.firstDisplaced === null) t.firstDisplaced = n;
          }
        }
      });
      trajectories.push(t);
    }
    for (const k of strikes) {
      const { samples, bodies } = perStrike.get(k)!;
      cells.push(cellOf(k, spread, samples, bodies));
    }
    if (spread) {
      const mid = perStrike.get(thumbnailStrikes)!;
      thumbnails = typicalSeeds(mid.samples, opts.thumbnails).map((seed) => {
        const body = grow({ seeds: opts.seeds, mutations: thumbnailStrikes, source: SOURCE }, true, seed);
        const sample = mid.samples.find((s) => s.seed === seed)!;
        if (bodyHash(body) !== sample.hash) throw new Error(`thumbnail seed ${seed}: the grown body differs from the replay`);
        return { seed, svg: silhouetteSvg(body, { size, territories: territories(body).filter((t) => !t.brain.self) }), sample };
      });
    }
  }
  return { seeds: opts.seeds, strikes, cells, trajectories, rowsOn, rowsOff, familyDrawn, defectDrawn, defectLanded, landedTotal, drawnTotal, windowsOn, windowsOff, infected, thumbnails, thumbnailStrikes };
}

// ---------------------------------------------------------------- problems (section 5)

export interface FirstStrike {
  /** Bodies where it happened at all. */
  bodies: number;
  mean: number;
  median: number;
  /** Share of bodies where it happened by each strike count of the populations. */
  by: { strikes: number; share: number }[];
}

export interface Problems {
  neverOnHuman: CatalogEntry[];
  /** Rows aimed at an ending (rebirth, branch, fusion, migration) that land on the human but find no such ending on a tenth or more of the typical bodies. */
  orphans: { entry: CatalogEntry; share: number }[];
  /** Organ rows for a cavity with no room in any cavity on a tenth or more of the typical bodies. */
  noCavity: { entry: CatalogEntry; share: number }[];
  /** Other rows with no place at all on a tenth or more of the typical bodies. */
  noPlace: { entry: CatalogEntry; share: number }[];
  /** Rows lost or turned to tumours on the typical bodies while a place existed without a ceiling: no set of organs pays for them. */
  noRoom: { entry: CatalogEntry; share: number }[];
  ceiling: { full: FirstStrike; displaced: FirstStrike; tumour: FirstStrike; lost: FirstStrike };
  frequent: RowStats[];
  neverLanded: RowStats[];
  neverDrawn: Mutation[];
  /** The rows that make cycles, and how they fared. */
  cycleRows: RowStats[];
  membraneRows: RowStats[];
  evictedKinds: { kind: OrganKind; n: number }[];
  /** Drawn defects share against the source's roll, landed defect share. */
  defects: { nominal: number; drawn: number; landed: number };
}

function firstStrike(values: (number | null)[], strikes: number[]): FirstStrike {
  const hit = values.filter((v): v is number => v !== null).sort((a, b) => a - b);
  const n = values.length;
  return {
    bodies: hit.length,
    mean: hit.length === 0 ? 0 : hit.reduce((s, v) => s + v, 0) / hit.length,
    median: hit.length === 0 ? 0 : hit[Math.floor((hit.length - 1) / 2)]!,
    by: strikes.map((k) => ({ strikes: k, share: n === 0 ? 0 : hit.filter((v) => v <= k).length / n })),
  };
}

function problemsOf(entries: readonly CatalogEntry[], pop: Populations): Problems {
  const on = pop.trajectories.filter((t) => t.spread);
  const last = pop.cells.find((c) => c.strikes === pop.strikes[pop.strikes.length - 1] && c.spread)!;
  const rows = [...pop.rowsOn.values()];
  const byId = (id: string): RowStats => pop.rowsOn.get(id) ?? { id, drawn: 0, landed: 0, tumours: 0, lost: 0 };
  const byShare = (a: { entry: CatalogEntry; share: number }, b: { entry: CatalogEntry; share: number }): number => b.share - a.share || a.entry.m.id.localeCompare(b.entry.m.id);
  const noTarget = entries.filter((e) => e.typical.noTarget * 10 >= e.typical.seeds).map((e) => ({ entry: e, share: e.typical.noTarget / e.typical.seeds }));
  const aimed = (e: CatalogEntry): boolean => e.m.target.endings !== undefined || e.m.op === "rebirth" || e.m.op === "branch" || e.m.op === "migrate" || e.m.op === "fusion";
  const orphans = noTarget.filter((x) => x.entry.human.landed > 0 && aimed(x.entry)).sort(byShare);
  const noCavity = noTarget.filter((x) => x.entry.m.op === "organ" && x.entry.m.payload.mount === "cavity").sort(byShare);
  const noPlace = noTarget.filter((x) => !orphans.includes(x) && !noCavity.includes(x)).sort(byShare);
  const noRoom = entries
    .map((e) => ({ entry: e, share: Math.max(0, e.typical.lost + e.typical.tumours - e.typical.noTarget) / e.typical.seeds }))
    .filter((x) => x.share >= 0.1)
    .sort((a, b) => b.share - a.share || a.entry.m.id.localeCompare(b.entry.m.id));
  return {
    neverOnHuman: entries.filter((e) => e.human.landed === 0),
    orphans,
    noCavity,
    noPlace,
    noRoom,
    ceiling: {
      full: firstStrike(on.map((t) => t.firstFull), pop.strikes),
      displaced: firstStrike(on.map((t) => t.firstDisplaced), pop.strikes),
      tumour: firstStrike(on.map((t) => t.firstTumour), pop.strikes),
      lost: firstStrike(on.map((t) => t.firstLost), pop.strikes),
    },
    frequent: [...rows].sort((a, b) => b.landed - a.landed || a.id.localeCompare(b.id)).slice(0, 12),
    neverLanded: rows.filter((r) => r.landed === 0).sort((a, b) => b.drawn - a.drawn || a.id.localeCompare(b.id)),
    neverDrawn: MUTATIONS.filter((m) => !pop.rowsOn.has(m.id)),
    cycleRows: MUTATIONS.filter((m) => m.op === "fusion" || m.op === "wings").map((m) => byId(m.id)),
    membraneRows: MUTATIONS.filter((m) => m.op === "membrane" || m.op === "wings").map((m) => byId(m.id)),
    evictedKinds: last.summary.kinds.slice(0, 8),
    defects: { nominal: SOURCES[0]!.defects ?? 0, drawn: pop.drawnTotal === 0 ? 0 : pop.defectDrawn / pop.drawnTotal, landed: pop.landedTotal === 0 ? 0 : pop.defectLanded / pop.landedTotal },
  };
}

// ---------------------------------------------------------------- everything

export interface ReportData {
  options: ReportOptions;
  facts: ModelFacts;
  sources: SourceRow[];
  entries: CatalogEntry[];
  families: FamilySummary[];
  populations: Populations;
  problems: Problems;
  /** The human's derived numbers, for the caption of the sample silhouettes. */
  humanMass: number;
  ms: number;
}

/** Every number of the atlas, in one pass. */
export function reportData(partial: Partial<ReportOptions> = {}): ReportData {
  const t0 = performance.now();
  const options: ReportOptions = { ...DEFAULT_OPTIONS, ...partial };
  const typical: Body[] = [];
  for (let seed = 1; seed <= options.typicalSeeds; seed++) typical.push(grow({ seeds: options.typicalSeeds, mutations: options.typicalStrikes, source: SOURCE }, true, seed));
  const entries = catalogEntries(typical, options.humanSeeds);
  const pop = populations(options);
  return {
    options,
    facts: modelFacts(),
    sources: sourceRows(),
    entries,
    families: familySummaries(entries),
    populations: pop,
    problems: problemsOf(entries, pop),
    humanMass: mass(human()),
    ms: performance.now() - t0,
  };
}
