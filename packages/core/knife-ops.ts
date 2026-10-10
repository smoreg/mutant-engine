/**
 * The operating room as data: the body laid out as parts a player names -
 * the head, the torso, the arms, the legs - what can be done to each part,
 * and what every operation does before it is done: what leaves, the mass,
 * whether it leaves a wound, how the numbers a player reads move (better or
 * worse), and in plain words what the body stops being able to do. The lab
 * draws it and the game's operating room serves it (docs/surgery.md).
 * No DOM here.
 */
import { parentSegment } from "./capability.js";
import { cut, cutPreview } from "./cut.js";
import { derive, type Derived, summarize, type SummaryValue } from "./derive.js";
import { type Body, cloneBody, type End, nodeIds, type Organ, segmentIds, type SegmentKind, sortedIds } from "./graph.js";
import { hangingPart } from "./grow.js";
import { type CutCommand, encodeCommand, type ExciseCommand, type ReshapeCommand, stripArgs, type UnmutateCommand } from "./history.js";
import { coverReach, fusions, reshape, type Reshape, type Reshaped } from "./knife.js";
import { hasKind } from "./metrics.js";
import { COVERS, hasTag, isFlesh, MEMBRANES, ORGANS, SEGMENT_KINDS } from "./parts.js";
import { strip } from "./strip.js";
import { FATE_RU } from "./words.js";

// ---------------------------------------------------------------- the parts

type PartGroup = "head" | "torso" | "arms" | "legs" | "tails" | "growths";

export const PART_GROUPS: readonly { id: PartGroup; ru: string; kinds: readonly SegmentKind[] }[] = [
  { id: "head", ru: "голова и шея", kinds: ["neck"] },
  { id: "torso", ru: "туловище", kinds: ["torso", "gullet"] },
  { id: "arms", ru: "руки", kinds: ["arm"] },
  { id: "legs", ru: "ноги", kinds: ["leg"] },
  { id: "tails", ru: "щупальца, хвосты, стебли", kinds: ["tentacle", "tail", "stalk"] },
  { id: "growths", ru: "наросты", kinds: ["growth"] },
];

/** Where an organ sits on a part: at its tip, inside it, on its surface. */
type Mount = "end" | "cavity" | "growth";

interface PartOrgan {
  organ: Organ;
  ru: string;
  mount: Mount;
  /** Inside another organ of the part (an eye in a head): the outer one's name. */
  inside?: string;
  /** The command that takes it out cleanly. */
  excise: ExciseCommand;
}

export interface Part {
  /** Null for the core: the node your brain is at, which no cut takes off. */
  segment: number | null;
  group: PartGroup;
  /** What a player reads: `рука 2 с клешнёй`. */
  ru: string;
  /** The node away from your brain: the tip of the part. */
  tip: number;
  /** The node towards your brain: where the part is attached. */
  base: number;
  organs: PartOrgan[];
  /** The mutation step that grew it, when the lab knows one. */
  origin: number | undefined;
}

function groupOf(kind: SegmentKind): PartGroup {
  return PART_GROUPS.find((g) => g.kinds.includes(kind))?.id ?? "growths";
}

/** The node of a segment away from your brain; for a segment whose ends are equally far, its `b`. */
function tipOf(body: Body, segId: number): number {
  const s = body.segments[segId]!;
  return parentSegment(body, s.a) === segId ? s.a : s.b;
}

/** The body as parts, grouped the way a player looks at it; within a group by id. */
export function anatomy(body: Body): Part[] {
  const byKind = new Map<SegmentKind, number>();
  const out: Part[] = [];
  for (const id of segmentIds(body)) {
    const s = body.segments[id]!;
    const tip = tipOf(body, id);
    const base = tip === s.a ? s.b : s.a;
    const n = (byKind.get(s.kind) ?? 0) + 1;
    byKind.set(s.kind, n);
    const organs: PartOrgan[] = [];
    // A node's endings belong to the part that leads to it; the node of your brain has none.
    if (parentSegment(body, tip) === id) organs.push(...organsOf(body.nodes[tip]!.ends, "end", tip));
    organs.push(...organsOf(s.cavity, "cavity", id), ...organsOf(s.growths, "growth", id));
    const tipEnd = organs.find((o) => o.mount === "end" && o.inside === undefined);
    const ru = `${SEGMENT_KINDS[s.kind].ru} ${n}${tipEnd === undefined ? "" : ` · ${tipEnd.ru}`}`;
    out.push({ segment: id, group: groupOf(s.kind), ru, tip, base, organs, origin: s.origin });
  }
  // The node of your brain: its endings (a human's head) belong to no part and no cut takes them off.
  for (const id of nodeIds(body)) {
    if (parentSegment(body, id) !== null) continue;
    const organs = organsOf(body.nodes[id]!.ends, "end", id);
    if (organs.length === 0) continue;
    const head = body.nodes[id]!.ends.some((o) => o.kind === "head");
    out.push({ segment: null, group: head ? "head" : "torso", ru: head ? "голова" : "середина тела", tip: id, base: id, organs, origin: undefined });
  }
  const order = new Map(PART_GROUPS.map((g, i) => [g.id, i]));
  return out.sort((x, y) => order.get(x.group)! - order.get(y.group)! || (x.segment ?? -1) - (y.segment ?? -1));
}

/** The organs of a list, each followed by what is inside it (an eye in a head), with the command that takes each out. */
function organsOf(list: readonly Organ[], mount: Mount, id: number): PartOrgan[] {
  const out: PartOrgan[] = [];
  list.forEach((o, slot) => {
    const at = mount;
    out.push({ organ: o, ru: ORGANS[o.kind].ru, mount, excise: { t: "excise", at, id, slot } });
    (o.contents ?? []).forEach((c, sub) => out.push({ organ: c, ru: ORGANS[c.kind].ru, mount, inside: ORGANS[o.kind].ru, excise: { t: "excise", at, id, slot, sub } }));
  });
  return out;
}

// ---------------------------------------------------------------- operations

export type OperationKind = "excise" | "trim" | "remove" | "amputate" | "unmutate" | "membrane" | "uncover" | "unfuse";

export interface Operation {
  kind: OperationKind;
  /** The button: `вырезать`, `срезать`, `снять часть`, `отрезать`, `снять мутацию`. */
  verb: string;
  /** What it is done to: `стопа`, `рука 2 · кисть`. */
  what: string;
  command: ExciseCommand | UnmutateCommand | CutCommand | ReshapeCommand;
  /** The command as the #hash writes it: the page's button carries it. */
  code: string;
}

const VERB: Record<OperationKind, string> = {
  excise: "вырезать",
  trim: "срезать",
  remove: "снять часть целиком",
  amputate: "отрезать",
  unmutate: "снять мутацию",
  membrane: "срезать перепонку",
  uncover: "снять покров",
  unfuse: "разъединить срастание",
};

/** The three cuts that take no organ as the lab's history names them. */
export const RESHAPE_VERB: Record<Reshape["t"], string> = { membrane: "срезана перепонка", cover: "снят покров", unfuse: "разъединено срастание" };

/** What one of the three took, in words: the membranes, the covers, the fusion. */
export function reshapeGone(r: Reshaped): string[] {
  const names = [...r.membranes.map((m) => MEMBRANES[m.kind].ru), ...r.covers.map((c) => COVERS[c.cover].ru), ...(r.split === null ? [] : ["срастание"])];
  return tally(names);
}

/**
 * Two of the three cuts of §12 that take no organ, on the part they are done
 * to (decisions 1226-1227): a membrane on the first segment it hangs on, a
 * cover on its segment. Both are clean and go before the part itself.
 */
function reshapesFor(body: Body, part: Part): Operation[] {
  if (part.segment === null) return [];
  const seg = part.segment;
  const out: Operation[] = [];
  for (const id of sortedIds(body.membranes)) {
    const m = body.membranes[id]!;
    if (m.cycle[0] === seg) out.push(op("membrane", MEMBRANES[m.kind].ru, { t: "reshape", r: { t: "membrane", membrane: id } }));
  }
  const reach = coverReach(body, seg);
  if (reach.length > 0) {
    const ru = COVERS[body.segments[seg]!.cover].ru;
    out.push(op("uncover", reach.length > 1 ? `${ru} · весь, с фронтом` : ru, { t: "reshape", r: { t: "cover", segment: seg } }));
  }
  return out;
}

/** A fusion parted, on the segment that leaves the fused node (decision 1228): a cut through a node, so it goes after the cut at the base. */
function unfusesFor(body: Body, part: Part): Operation[] {
  if (part.segment === null) return [];
  return fusions(body)
    .filter((f) => f.segments[0] === part.segment)
    .map((f) => op("unfuse", `${part.ru} · срастание`, { t: "reshape", r: { t: "unfuse", node: f.node } }));
}

function op(kind: OperationKind, what: string, command: Operation["command"]): Operation {
  return { kind, verb: VERB[kind], what, command, code: encodeCommand(command) };
}

/** `глаз из головы`, `шип`: an organ as the operation names it. */
export function organLabel(o: PartOrgan): string {
  if (o.inside === undefined) return o.ru;
  return o.inside === ORGANS.head.ru ? `${o.ru} из головы` : `${o.ru} · внутри: ${o.inside}`;
}

/**
 * What can be done to a part, gentlest first: each organ on it taken out
 * cleanly, the whole part taken off cleanly when it hangs free, the part cut
 * off at its base with a wound, and the mutation that grew it taken back.
 * Only flesh is taken out: a trait - deafness, cold blood, a psionic power -
 * sits on the part as an organ of the table and has nothing for the knife
 * (`Substance`, decision 1225); it goes only with the part it sits on.
 */
export function operationsFor(body: Body, part: Part, originName?: (step: number) => string | null): Operation[] {
  const out: Operation[] = [];
  for (const o of part.organs) {
    if (!isFlesh(o.organ.kind)) continue;
    // The brain you think with, and the head it sits in, are not an operation: that is death.
    if (part.segment === null && (hasTag(o.organ.kind, "brain") || (o.organ.kind === "head" && hasKind(o.organ.contents ?? [], "brain")))) continue;
    out.push(op(o.mount === "growth" ? "trim" : "excise", organLabel(o), o.excise));
  }
  // Twins get numbers: `глаз 1`, `глаз 2`.
  const seen = new Map<string, number>();
  for (const o of out) seen.set(o.what, (seen.get(o.what) ?? 0) + 1);
  const next = new Map<string, number>();
  for (const o of out) {
    if ((seen.get(o.what) ?? 0) < 2) continue;
    const k = (next.get(o.what) ?? 0) + 1;
    next.set(o.what, k);
    o.what = o.what.replace(/^(\S+)/, `$1 ${k}`);
  }
  if (part.segment === null) return out;
  out.push(...reshapesFor(body, part));
  if (hangingPart(body, part.segment) !== null) out.push(op("remove", part.ru, { t: "excise", at: "limb", id: part.segment, slot: 0 }));
  const end: End = body.segments[part.segment]!.a === part.base ? "a" : "b";
  out.push(op("amputate", `${part.ru} у основания`, { t: "cut", segment: part.segment, end }));
  out.push(...unfusesFor(body, part));
  if (part.origin !== undefined && part.origin > 0 && originName !== undefined) {
    const name = originName(part.origin);
    if (name !== null) out.push(op("unmutate", `${name} (шаг ${part.origin})`, { t: "unmutate", step: part.origin }));
  }
  return out;
}

// ---------------------------------------------------------------- outcomes

export type Better = "up" | "down";

/** The numbers a player reads after an operation, grouped, with which way is better. */
const PLAYER_STATS: readonly { key: string; ru: string; group: string; better: Better }[] = [
  { key: "speed", ru: "скорость", group: "движение", better: "up" },
  { key: "grips", ru: "хваты", group: "движение", better: "up" },
  { key: "precise", ru: "точные хваты", group: "движение", better: "up" },
  { key: "climb", ru: "лазание", group: "движение", better: "up" },
  { key: "swim", ru: "плавание", group: "движение", better: "up" },
  { key: "fly", ru: "полёт", group: "движение", better: "up" },
  { key: "dig", ru: "копание", group: "движение", better: "up" },
  { key: "attacks", ru: "атаки", group: "бой", better: "up" },
  { key: "reach", ru: "досягаемость", group: "бой", better: "up" },
  { key: "armor", ru: "защита", group: "бой", better: "up" },
  { key: "exposure", ru: "открытость удару", group: "бой", better: "down" },
  { key: "eyes", ru: "глаза", group: "чувства", better: "up" },
  { key: "viewpoints", ru: "точки обзора", group: "чувства", better: "up" },
  { key: "hearing", ru: "слух", group: "чувства", better: "up" },
  { key: "smell", ru: "нюх", group: "чувства", better: "up" },
  { key: "heat", ru: "тепловое зрение", group: "чувства", better: "up" },
  { key: "speak", ru: "речь", group: "чувства", better: "up" },
  { key: "hearts", ru: "сердца", group: "жизнь", better: "up" },
  { key: "tank", ru: "запас дыхания", group: "жизнь", better: "up" },
  { key: "eats", ru: "может есть", group: "жизнь", better: "up" },
  { key: "mouths", ru: "рты", group: "жизнь", better: "up" },
  { key: "starving", ru: "частей без крови", group: "жизнь", better: "down" },
  { key: "upkeep", ru: "обмен", group: "жизнь", better: "down" },
  { key: "load", ru: "нагрузка на разум", group: "жизнь", better: "down" },
];

interface StatDelta {
  key: string;
  ru: string;
  group: string;
  before: SummaryValue;
  after: SummaryValue;
  /** Better, worse, or neither (a value that is not a number). */
  verdict: "better" | "worse" | "same";
}

function asNumber(v: SummaryValue): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  return null;
}

function statDeltas(before: Derived, after: Derived): StatDelta[] {
  const x = summarize(before);
  const y = summarize(after);
  const out: StatDelta[] = [];
  for (const s of PLAYER_STATS) {
    const b = x[s.key];
    const a = y[s.key];
    if (b === undefined || a === undefined || JSON.stringify(a) === JSON.stringify(b)) continue;
    const nb = asNumber(b);
    const na = asNumber(a);
    // A continuous number that barely moved is noise to a player: an eye out does not change the breath.
    if (typeof b === "number" && typeof a === "number" && !Number.isInteger(b + a) && Math.abs(a - b) < 0.03 * Math.max(Math.abs(a), Math.abs(b), 1)) continue;
    const verdict = nb === null || na === null ? "same" : (na > nb) === (s.better === "up") ? "better" : "worse";
    out.push({ key: s.key, ru: s.ru, group: s.group, before: b, after: a, verdict });
  }
  return out;
}

export interface Outcome {
  /** Nothing to take: the part or organ is already gone. */
  empty: boolean;
  /** What leaves, in words: organs and parts. */
  gone: string[];
  mass: number;
  /** A cut leaves a wound that bleeds; a clean removal does not. */
  wound: boolean;
  /** Parts that fall off and what becomes of them (a cut): `отпадёт: гниёт`. */
  falls: string[];
  stats: StatDelta[];
  /** What the body stops being able to do, in plain words; the gravest first. */
  warnings: string[];
  /** The body after the operation; never the one passed in. */
  after: Body;
}

/** The plain words for what an operation takes away for good. */
function warningsOf(before: Derived, after: Derived, vital: readonly Organ[]): string[] {
  const out: string[] = [];
  for (const o of vital) {
    const kind = o.kind === "head" ? "голова с мозгом" : ORGANS[o.kind].ru;
    out.push(`уходит жизненно важное: ${kind}`);
  }
  if (before.senses.sight && !after.senses.sight) out.push("ослепнет");
  if (before.speed.value > 0 && after.speed.value === 0) out.push("не сможет ходить");
  if (before.eat.can && !after.eat.can) out.push("не сможет есть");
  if (before.blood.hearts.length > 0 && after.blood.hearts.length === 0) out.push("не останется сердца");
  if (before.grips.total > 0 && after.grips.total === 0) out.push("нечем держать");
  if (before.attacks.length > 0 && after.attacks.length === 0) out.push("нечем бить");
  if (after.blood.starving.length > before.blood.starving.length) out.push(`без крови останется частей: ${after.blood.starving.length - before.blood.starving.length}`);
  return out;
}

/** What the operation does, found on a copy of the body. */
export function outcomeOf(body: Body, operation: Operation): Outcome {
  const probe = cloneBody(body);
  const before = derive(body);
  const cmd = operation.command;
  if (cmd.t === "cut") {
    const preview = cutPreview(body, cmd.segment, cmd.end);
    const result = cut(probe, cmd.segment, cmd.end);
    const after = derive(probe);
    const gone: string[] = [];
    for (const s of result.removed.segments) {
      gone.push(SEGMENT_KINDS[s.kind].ru);
      for (const o of [...s.cavity, ...s.growths]) gone.push(ORGANS[o.kind].ru);
    }
    for (const n of result.removed.nodes) for (const o of n.ends) gone.push(ORGANS[o.kind].ru);
    const mass = Math.round((before.budgets.mass - after.budgets.mass) * 10) / 10;
    const falls = preview.others.map((o) => `${FATE_RU[o.fate]?.split(":")[0] ?? o.fate}`);
    return { empty: false, gone: tally(gone), mass, wound: true, falls, stats: statDeltas(before, after), warnings: warningsOf(before, after, []), after: probe };
  }
  if (cmd.t === "reshape") {
    const r = reshape(probe, cmd.r);
    const after = derive(probe);
    const gone = reshapeGone(r);
    return { empty: gone.length === 0, gone, mass: Math.round(r.lost * 10) / 10, wound: cmd.r.t === "unfuse", falls: [], stats: statDeltas(before, after), warnings: warningsOf(before, after, []), after: probe };
  }
  const args = stripArgs(probe, cmd);
  if (args === null) return { empty: true, gone: [], mass: 0, wound: false, falls: [], stats: [], warnings: [], after: probe };
  const r = strip(probe, args.pick, args.elements);
  const after = derive(probe);
  const gone = [...r.segments.map((s) => SEGMENT_KINDS[s.kind].ru), ...r.organs.map((o) => ORGANS[o.kind].ru)];
  const empty = r.organs.length + r.nodes.length + r.segments.length + r.membranes.length === 0;
  return { empty, gone: tally(gone), mass: Math.round(r.lost * 10) / 10, wound: false, falls: [], stats: statDeltas(before, after), warnings: warningsOf(before, after, r.vital), after: probe };
}

/** `рука, кисть ×2` from a list of names. */
function tally(names: string[]): string[] {
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts].map(([n, k]) => (k > 1 ? `${n} ×${k}` : n));
}
