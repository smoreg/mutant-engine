/**
 * A part of the tables put on a body by hand: the editor's drag. A part is a
 * kind of ORGANS, SEGMENT_KINDS, COVERS or MEMBRANES (`organ:eye`,
 * `segment:arm`, `cover:fur`, `membrane:wing`), and it goes on through one of
 * the growth operations, never around them: a limb is a SPROUT, an ending a
 * REBIRTH of the ending already there, an organ an ORGAN at a mount, a cover a
 * COVER, a membrane a MEMBRANE, a tumour a GROWTH. The places are the
 * operation's own candidates as a placed mutation sees them (`mutationTargets`
 * with no spread and no needs), and it lands through `applyMutationAt`, so the
 * flesh rule and the skeleton's ceiling hold as for any mutation. Where a part
 * cannot go, `attachWhy` says why in words. Pure functions over data.
 */
import { MUTATIONS } from "./content/mutations.js";
import { type Body, cloneBody, isBrainKind, nodeIds, type Organ, organ, type OrganKind, segmentIds, selfRef, type SegmentKind, type CoverId, type MembraneKind } from "./graph.js";
import { LIMITS, type Payload, sameTarget, type Target, type Weighted } from "./grow.js";
import { cavitySlots, freeSideSlots, growthSlots, isFlank, sideSlots } from "./flank.js";
import { membranesOn } from "./membrane.js";
import { adjacency } from "./metrics.js";
import { applyMutationAt, ceilingOf, type Mutation, type MutationContext, type MutationResult, mutationTargets } from "./mutation.js";
import { capacity, cavityLoad, COVERS, type Family, HEAD_SLOTS, hasTag, isChrome, mass, MEMBRANES, organMass, ORGANS, SEGMENT_KINDS, segmentMass, segmentMassOf } from "./parts.js";

/** How a part goes on: the operation and, for an organ, the mount. */
export type AttachHow = "limb" | "tumour" | "end" | "head" | "cavity" | "growth" | "cover" | "membrane";
export const ATTACH_HOWS: readonly AttachHow[] = ["limb", "tumour", "end", "head", "cavity", "growth", "cover", "membrane"];

export interface AttachChoice {
  how: AttachHow;
  target: Target;
  weight: number;
}

/** The words of the editor's refusals; the pages print them as they are. */
export const ATTACH_WHY = {
  unknown: "такой части нет в таблицах",
  flank: "бок — связь бокового узла с корпусом, сам по себе не прирастает",
  noPlace: "на этом теле нет ни одного места для этой части",
  meat: "не хватает мяса под потолком скелета",
  limits: "тело упёрлось в предел узлов или сегментов",
  heads: "голов уже предельное число",
  nodeOnly: "эта часть садится на узел, а не на сегмент",
  segmentOnly: "эта часть садится на сегмент, а не на узел",
  nodeFull: "у узла заняты все места",
  nodeSmall: "узел меньше, чем обхват конечности",
  noSide: "у сегмента этого вида нет боковых мест",
  sideFull: "боковые места сегмента заняты",
  penisTip: "на кончике члена ничего не растёт",
  noEnding: "на узле нет окончания: окончание перерождает то, что уже на конце",
  selfHead: "это окончание держит твой мозг",
  chrome: "хром не мутирует",
  sameEnding: "на конце уже такое окончание",
  noHead: "на узле нет головы",
  headHasKind: "в голове уже столько органов этого вида, сколько она держит",
  brainThere: "мозг уже есть: второй в одной голове или полости не держится",
  psionicNoBrain: "псионика работает умом головы, а в этой голове нет мозга",
  noCavity: "у сегмента нет полости",
  cavityFull: "полость сегмента полна",
  growthFull: "на поверхности сегмента нет свободного места",
  markTwice: "эта метка уже на сегменте",
  sameCover: "сегмент уже в этом покрове",
  coverFrozen: "покров сегмента не мутирует",
  noSpan: "перепонка натягивается на согнутую конечность из 2–6 сегментов одного вида или на цикл",
  hasMembrane: "на этом месте уже есть перепонка",
  membranes: "перепонок уже предельное число",
  elsewhere: "модель не ставит эту часть сюда",
} as const;

// ---------------------------------------------------------------- the parts

let parts: string[] | null = null;

/** Every part of the tables, in table order: organs, segments, covers, membranes. */
export function attachParts(): string[] {
  if (parts !== null) return parts;
  parts = [
    ...Object.keys(ORGANS).map((k) => `organ:${k}`),
    ...Object.keys(SEGMENT_KINDS).map((k) => `segment:${k}`),
    ...Object.keys(COVERS).map((k) => `cover:${k}`),
    ...Object.keys(MEMBRANES).map((k) => `membrane:${k}`),
  ];
  return parts;
}

export const ATTACH_PARTS: readonly string[] = attachParts();

type Parsed = { source: "organ"; kind: OrganKind } | { source: "segment"; kind: SegmentKind } | { source: "cover"; kind: CoverId } | { source: "membrane"; kind: MembraneKind };

function parse(part: string): Parsed | null {
  const i = part.indexOf(":");
  const source = part.slice(0, i);
  const kind = part.slice(i + 1);
  if (source === "organ" && kind in ORGANS) return { source, kind: kind as OrganKind };
  if (source === "segment" && kind in SEGMENT_KINDS) return { source, kind: kind as SegmentKind };
  if (source === "cover" && kind in COVERS) return { source, kind: kind as CoverId };
  if (source === "membrane" && kind in MEMBRANES) return { source, kind: kind as MembraneKind };
  return null;
}

export function isAttachPart(part: string): boolean {
  return parse(part) !== null;
}

/** The part's name from its table: `глаз`, `рука`, `шерсть`, `крыло`. */
export function attachRu(part: string): string {
  const p = parse(part);
  if (p === null) return part;
  if (p.source === "organ") return ORGANS[p.kind].ru;
  if (p.source === "segment") return SEGMENT_KINDS[p.kind].ru;
  if (p.source === "cover") return COVERS[p.kind].ru;
  return MEMBRANES[p.kind].ru;
}

/** The ways a part goes on, in the order a drop prefers them: into a head before over an ending, a cavity before a surface. */
export function attachHows(part: string): AttachHow[] {
  const p = parse(part);
  if (p === null) return [];
  switch (p.source) {
    case "organ": {
      const mounts = ORGANS[p.kind].mounts;
      return (["head", "cavity", "growth", "end"] as const).filter((m) => mounts.includes(m));
    }
    case "segment":
      return p.kind === "flank" ? [] : [p.kind === "growth" ? "tumour" : "limb"];
    case "cover":
      return ["cover"];
    case "membrane":
      return ["membrane"];
  }
}

/** The organ as it goes on: a head comes empty and takes its eyes by hand. */
function freshOrgan(kind: OrganKind): Organ {
  return kind === "head" ? organ("head", []) : organ(kind);
}

/**
 * The limb a sprout grows: the first row of the catalog that sprouts this
 * kind with nothing extra (no growths, no break plane, no bait) - an arm with
 * a hand, a tentacle with a sucker, a neck with a head; a kind no row sprouts
 * comes bare, one unit long and thin, in skin.
 */
export function limbOf(kind: SegmentKind): Payload<"sprout"> {
  const rows = MUTATIONS.filter((m): m is Extract<Mutation, { op: "sprout" }> => m.op === "sprout" && m.payload.kind === kind);
  const plain = rows.find((m) => (m.payload.growths ?? []).length === 0 && m.payload.breakPlane !== true && m.payload.bait !== true) ?? rows[0];
  if (plain === undefined) return { kind, length: 1, girth: 1, cover: "skin", ending: null };
  const p = plain.payload;
  return { kind, length: p.length, girth: p.girth, cover: p.cover, ending: p.ending === null ? null : structuredClone(p.ending) };
}

function familyOf(p: Parsed): Family {
  if (p.source === "organ") return ORGANS[p.kind].family ?? "internals";
  if (p.source === "membrane") return MEMBRANES[p.kind].family;
  return p.source === "cover" ? "covers" : "limbs";
}

/** The part and the way as a row of the catalog would be: no rule on the target, no chance, no tags. */
export function attachMutation(part: string, how: AttachHow): Mutation | null {
  const p = parse(part);
  if (p === null || !attachHows(part).includes(how)) return null;
  const base = { id: `attach.${part}`, family: familyOf(p), target: {}, chance: 0, tags: [], i18n: `attach.${part}` };
  switch (how) {
    case "limb":
      return { ...base, op: "sprout", payload: limbOf(p.kind as SegmentKind) };
    case "tumour":
      return { ...base, op: "growth", payload: {} };
    case "end":
      return { ...base, op: "rebirth", payload: { ending: freshOrgan(p.kind as OrganKind) } };
    case "head":
    case "cavity":
    case "growth":
      return { ...base, op: "organ", payload: { organ: freshOrgan(p.kind as OrganKind), mount: how } };
    case "cover":
      return { ...base, op: "cover", payload: { cover: p.kind as CoverId } };
    case "membrane":
      return { ...base, op: "membrane", payload: { kind: p.kind as MembraneKind } };
  }
}

/** A placed part is an experiment, as a placed mutation is: no spread, no needs. */
const CTX: MutationContext = { spread: false, needs: false };

/** The places of one way: the operation's own, less an ending reborn as what it already is. */
export function attachTargets(body: Body, part: string, how: AttachHow): Weighted[] {
  const m = attachMutation(part, how);
  if (m === null) return [];
  const list = mutationTargets(cloneBody(body), m, CTX);
  if (m.op !== "rebirth") return list;
  const kind = m.payload.ending.kind;
  return list.filter((w) => !("ending" in w.target && body.nodes[w.target.ending.node]?.ends[w.target.ending.index]?.kind === kind));
}

/** Every place the part has on the body, by way, in the order of `attachHows`. */
export function attachChoices(body: Body, part: string): AttachChoice[] {
  const out: AttachChoice[] = [];
  for (const how of attachHows(part)) for (const w of attachTargets(body, part, how)) out.push({ how, target: w.target, weight: w.weight });
  return out;
}

/** The nodes and segments a choice sits on: a node, the node of an ending, a segment, the segments of a span. */
export function choiceElements(body: Body, c: { target: Target }): number[] {
  const t = c.target;
  if ("node" in t) return [t.node];
  if ("ending" in t) return [t.ending.node];
  if ("segment" in t) return [t.segment];
  if ("pair" in t) return [...t.pair];
  void body;
  return [...t.cycle];
}

// ---------------------------------------------------------------- why not

/** Mass the part brings as it goes on through the way. */
function massOf(body: Body, part: string, how: AttachHow, segId?: number): number {
  const m = attachMutation(part, how);
  if (m === null) return 0;
  switch (m.op) {
    case "sprout":
      return segmentMassOf(m.payload.kind, m.payload.length, m.payload.girth, m.payload.cover) + (m.payload.ending === null ? 0 : organMass(m.payload.ending));
    case "growth":
      return segmentMassOf("growth", 1, 1, "skin");
    case "organ":
    case "rebirth":
      return organMass(m.op === "organ" ? m.payload.organ : m.payload.ending);
    case "cover": {
      const s = segId === undefined ? undefined : body.segments[segId];
      return s === undefined ? 0 : segmentMassOf(s.kind, s.length, s.girth, m.payload.cover) - segmentMass(s);
    }
    default:
      return 0;
  }
}

/** Why the part has no place on the body at all; null when it has one. */
export function attachRefusal(body: Body, part: string): string | null {
  const p = parse(part);
  if (p === null) return ATTACH_WHY.unknown;
  if (p.source === "segment" && p.kind === "flank") return ATTACH_WHY.flank;
  if (attachChoices(body, part).length > 0) return null;
  const room = ceilingOf(body) - mass(body);
  const hows = attachHows(part);
  if (hows.every((h) => massOf(body, part, h) > room + 1e-9)) return ATTACH_WHY.meat;
  if ((hows.includes("limb") || hows.includes("tumour")) && (nodeIds(body).length >= LIMITS.nodes || segmentIds(body).length >= LIMITS.segments)) return ATTACH_WHY.limits;
  if (hows.includes("membrane") && Object.keys(body.membranes).length >= LIMITS.membranes) return ATTACH_WHY.membranes;
  // What the elements say most often, the element kind aside: every head holds its nose already.
  const said = new Map<string, number>();
  const els: ({ node: number } | { segment: number })[] = [...nodeIds(body).map((node) => ({ node })), ...segmentIds(body).map((segment) => ({ segment }))];
  for (const el of els) {
    for (const how of hows) {
      const why = whyHow(body, part, how, el);
      if (why === null || why === ATTACH_WHY.nodeOnly || why === ATTACH_WHY.segmentOnly || why === ATTACH_WHY.flank) continue;
      said.set(why, (said.get(why) ?? 0) + 1);
    }
  }
  let best: string = ATTACH_WHY.noPlace;
  let n = 0;
  // An element that has no such place at all (no head, no cavity) says less than one that has it taken.
  const absent = new Set<string>([ATTACH_WHY.noHead, ATTACH_WHY.noCavity, ATTACH_WHY.noSide, ATTACH_WHY.noEnding, ATTACH_WHY.noSpan]);
  for (const [why, k] of said) {
    const score = absent.has(why) ? k : k + 10_000;
    if (score > n) [best, n] = [why, score];
  }
  return best;
}

/** A node's free slots as the growth operations count them: a flank takes none at its host's end. */
function freeSlots(body: Body, id: number): number {
  let n = 0;
  for (const sid of adjacency(body).get(id) ?? []) {
    const s = body.segments[sid]!;
    if (!(isFlank(s) && s.a === id)) n += 1;
  }
  return 2 * body.nodes[id]!.size - n;
}

function penisTip(body: Body, id: number): boolean {
  return Object.values(body.segments).some((s) => s.kind === "penis" && (s.a === id || s.b === id) && (adjacency(body).get(id) ?? []).length === 1);
}

function selfEnding(body: Body, id: number): number {
  const ref = selfRef(body);
  return ref !== undefined && "node" in ref && ref.node === id ? ref.end : -1;
}

/** Why one way does not take this node or segment; null when it has nothing against it that the editor knows. */
function whyHow(body: Body, part: string, how: AttachHow, el: { node: number } | { segment: number }): string | null {
  const p = parse(part)!;
  const room = ceilingOf(body) - mass(body);
  const node = "node" in el ? body.nodes[el.node] : undefined;
  const seg = "segment" in el ? body.segments[el.segment] : undefined;
  if (seg !== undefined && isFlank(seg)) return ATTACH_WHY.flank;
  const heavy = massOf(body, part, how, seg?.id) > room + 1e-9;
  switch (how) {
    case "limb":
    case "tumour": {
      if (nodeIds(body).length >= LIMITS.nodes || segmentIds(body).length >= LIMITS.segments) return ATTACH_WHY.limits;
      if (heavy) return ATTACH_WHY.meat;
      const limb = how === "limb" ? limbOf(p.kind as SegmentKind) : null;
      if (limb?.ending?.kind === "head" && Object.values(body.nodes).flatMap((n) => n.ends).filter((e) => e.kind === "head").length >= LIMITS.heads) return ATTACH_WHY.heads;
      if (node !== undefined) {
        if (penisTip(body, node.id)) return ATTACH_WHY.penisTip;
        if (freeSlots(body, node.id) < 1) return ATTACH_WHY.nodeFull;
        if (limb !== null && limb.girth > node.size) return ATTACH_WHY.nodeSmall;
        return null;
      }
      if (seg === undefined || how === "tumour") return ATTACH_WHY.nodeOnly;
      if (sideSlots(seg) === 0) return ATTACH_WHY.noSide;
      if (freeSideSlots(body, seg.id) < 1) return ATTACH_WHY.sideFull;
      if (limb !== null && limb.girth > (seg.kind === "torso" ? 2 : 1)) return ATTACH_WHY.nodeSmall;
      return null;
    }
    case "end": {
      if (node === undefined) return ATTACH_WHY.nodeOnly;
      if (node.ends.length === 0) return ATTACH_WHY.noEnding;
      if (penisTip(body, node.id)) return ATTACH_WHY.penisTip;
      const self = selfEnding(body, node.id);
      const others = node.ends.filter((e, i) => i !== self);
      if (others.length === 0) return ATTACH_WHY.selfHead;
      if (others.every((e) => isChrome(e))) return ATTACH_WHY.chrome;
      if (others.every((e) => e.kind === p.kind)) return ATTACH_WHY.sameEnding;
      if (heavy) return ATTACH_WHY.meat;
      return null;
    }
    case "head": {
      if (node === undefined) return ATTACH_WHY.nodeOnly;
      const heads = node.ends.filter((e) => e.kind === "head" && !isChrome(e));
      if (heads.length === 0) return ATTACH_WHY.noHead;
      const kind = p.kind as OrganKind;
      const cap = HEAD_SLOTS[kind];
      const inside = (e: Organ): Organ[] => e.contents ?? [];
      if (isBrainKind(kind) && heads.every((e) => inside(e).some((c) => isBrainKind(c.kind)))) return ATTACH_WHY.brainThere;
      if (hasTag(kind, "psionic") && heads.every((e) => !inside(e).some((c) => isBrainKind(c.kind)))) return ATTACH_WHY.psionicNoBrain;
      if (cap !== undefined && heads.every((e) => inside(e).filter((c) => c.kind === kind).length >= cap)) return ATTACH_WHY.headHasKind;
      if (heavy) return ATTACH_WHY.meat;
      return null;
    }
    case "cavity": {
      if (seg === undefined) return ATTACH_WHY.segmentOnly;
      if (cavitySlots(seg) === 0) return ATTACH_WHY.noCavity;
      if (!COVERS[seg.cover].mutates) return ATTACH_WHY.coverFrozen;
      const kind = p.kind as OrganKind;
      if (isBrainKind(kind) && seg.cavity.some((o) => isBrainKind(o.kind))) return ATTACH_WHY.brainThere;
      if (seg.cavity.length >= cavitySlots(seg) || cavityLoad(seg) + organMass(organ(kind)) > capacity(seg) + 1e-9) return ATTACH_WHY.cavityFull;
      if (heavy) return ATTACH_WHY.meat;
      return null;
    }
    case "growth": {
      if (seg === undefined) return ATTACH_WHY.segmentOnly;
      if (!COVERS[seg.cover].mutates) return ATTACH_WHY.coverFrozen;
      if (seg.growths.length >= growthSlots(seg)) return ATTACH_WHY.growthFull;
      if (hasTag(p.kind as OrganKind, "mark") && seg.growths.some((g) => g.kind === p.kind)) return ATTACH_WHY.markTwice;
      if (heavy) return ATTACH_WHY.meat;
      return null;
    }
    case "cover": {
      if (seg === undefined) return ATTACH_WHY.segmentOnly;
      if (seg.cover === p.kind) return ATTACH_WHY.sameCover;
      if (!COVERS[seg.cover].mutates) return ATTACH_WHY.coverFrozen;
      if (heavy) return ATTACH_WHY.meat;
      return null;
    }
    case "membrane": {
      if (seg === undefined) return ATTACH_WHY.segmentOnly;
      if (Object.keys(body.membranes).length >= LIMITS.membranes) return ATTACH_WHY.membranes;
      if (membranesOn(body, seg.id).length > 0) return ATTACH_WHY.hasMembrane;
      return ATTACH_WHY.noSpan;
    }
  }
}

/**
 * Why the part does not go onto this node or segment; null when one of its
 * places sits there. The first way that could take such an element speaks.
 */
export function attachWhy(body: Body, part: string, el: { node: number } | { segment: number }): string | null {
  const p = parse(part);
  if (p === null) return ATTACH_WHY.unknown;
  if (p.source === "segment" && p.kind === "flank") return ATTACH_WHY.flank;
  const id = "node" in el ? el.node : el.segment;
  if (attachChoices(body, part).some((c) => choiceElements(body, c).includes(id))) return null;
  const hows = attachHows(part);
  let first: string | null = null;
  for (const how of hows) {
    const why = whyHow(body, part, how, el);
    if (why === null) return ATTACH_WHY.elsewhere;
    // A way that takes only the other kind of element is the last thing to say.
    if (why === ATTACH_WHY.nodeOnly || why === ATTACH_WHY.segmentOnly) {
      first ??= why;
      continue;
    }
    return why;
  }
  return first ?? ATTACH_WHY.elsewhere;
}

// ---------------------------------------------------------------- the operation

export interface Attached {
  result: MutationResult | null;
  /** Why it was refused, in words; null when it landed. */
  rejected: string | null;
  /** The places of the way before it landed. */
  candidates: Weighted[];
}

/** Puts the part on at the place, in place; a place the model does not list is refused and nothing changes. */
export function attachPart(body: Body, part: string, how: AttachHow, target: Target): Attached {
  const m = attachMutation(part, how);
  if (m === null) return { result: null, rejected: ATTACH_WHY.unknown, candidates: [] };
  const candidates = attachTargets(body, part, how);
  const hit = candidates.find((w) => sameTarget(w.target, target));
  if (hit === undefined) {
    const el = "node" in target ? { node: target.node } : "ending" in target ? { node: target.ending.node } : "segment" in target ? { segment: target.segment } : null;
    const why = el === null ? null : attachWhy(body, part, el);
    return { result: null, rejected: why ?? attachRefusal(body, part) ?? ATTACH_WHY.elsewhere, candidates };
  }
  try {
    return { result: applyMutationAt(body, m, hit.target, CTX), rejected: null, candidates };
  } catch (e) {
    return { result: null, rejected: e instanceof Error ? e.message : String(e), candidates };
  }
}
