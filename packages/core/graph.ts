/**
 * The body as a graph: nodes are assembly points (joints, forks, endings),
 * segments are the parts between them. Everything here is plain data plus
 * the primitive mutators that keep ids and `version` honest.
 *
 * Ids are shared by nodes, segments and membranes and only ever grow; a
 * removed id is never handed out again. Every traversal elsewhere goes by
 * ascending id, never by insertion order.
 */
import { endsHpBonus, type OrganSize } from "./sizes.js";

/** `flank` is no part of its own: the zero-length, massless link of a side node to the segment it sits on (flank.ts). */
export type SegmentKind = "arm" | "leg" | "tentacle" | "torso" | "neck" | "tail" | "stalk" | "growth" | "gullet" | "flank" | "penis";

export type CoverId = "skin" | "chitin" | "scales" | "slime" | "suckers" | "fur" | "bark" | "plates" | "chrome" | "feathers" | "stone" | "dragonScales";

/** Organ kinds. The first block is body-graph.md §2; the rest is what the catalog (step C) grows. Stats by kind live in parts.ts. */
export type OrganKind =
  // endings
  | "hand"
  | "pincer"
  | "claw"
  | "hook"
  | "sucker"
  | "mouth"
  | "sting"
  | "foot"
  | "hoof"
  | "pseudopod"
  | "snout"
  | "eye"
  | "head"
  | "drill"
  | "root"
  | "flower"
  // inside a head
  | "brain"
  | "jaw"
  | "ear"
  | "nose"
  // cavity
  | "heart"
  | "lungs"
  | "stomach"
  | "gut"
  | "gland"
  | "womb"
  // growths
  | "spines"
  | "skinGland"
  | "bladder"
  | "photophores"
  // chrome: the tag carrier; the implants themselves are chrome.md's
  | "implant"
  // heads
  | "smallBrain"
  | "ganglion"
  | "gutBrain"
  | "greatBrain"
  | "nerveCord"
  | "slowBrain"
  | "fleshMemory"
  | "coldMind"
  | "mirrorLobes"
  | "weakNeck"
  | "sharedBlood"
  | "echoChamber"
  | "bloodlust"
  | "nerveShunt"
  | "twoFaces"
  | "cortexFolds"
  // senses
  | "heatEye"
  | "echo"
  | "deepSense"
  | "electroSense"
  | "magnetSense"
  | "whiskers"
  | "earCluster"
  | "noPain"
  | "sixthSense"
  | "innerEye"
  | "facetEye"
  | "scentOrgan"
  | "lightSkin"
  // jaws
  | "fangs"
  | "crusherJaw"
  | "proboscis"
  | "mandibles"
  | "radula"
  | "acidStomach"
  | "fermentSac"
  | "crop"
  | "enzymeGland"
  | "glutton"
  | "abyssLiver"
  | "throatTeeth"
  | "eternalHunger"
  // covers
  | "shootingSpines"
  | "chromatophores"
  | "rottingSkin"
  | "mirrorLayer"
  | "pores"
  | "moult"
  | "fallingFlesh"
  // glands
  | "venomGland"
  | "acidGland"
  | "acidBlood"
  | "fireGland"
  | "cryoGland"
  | "sporeGland"
  | "webGland"
  | "pheromoneGland"
  | "inkSac"
  | "siphon"
  | "electricOrgan"
  | "gasSac"
  | "pusGland"
  | "tarGland"
  | "panaceaGland"
  // movement
  | "fins"
  | "spiderThread"
  | "booster"
  | "foldingSkeleton"
  // internals
  | "gillCluster"
  | "doubleBreath"
  | "closedSystem"
  | "filters"
  | "baroChamber"
  | "coldBlood"
  | "heatGen"
  | "spongyTissue"
  | "marrow"
  | "bloodReserve"
  | "toxicFlesh"
  | "tastyFlesh"
  | "ironVeins"
  | "airSacs"
  | "tracheae"
  | "anaerobicGlands"
  // reproduction
  | "ovipositor"
  | "quickClutch"
  | "bud"
  | "broodPouch"
  | "parthenogenesis"
  | "liveBirth"
  | "parasiticClutch"
  | "motherBond"
  | "cannibalWomb"
  | "decoyEgg"
  | "immortalLine"
  | "swarmWomb"
  | "sterility"
  // psionics
  | "willPush"
  | "mindSting"
  | "terror"
  | "domination"
  | "mindReading"
  | "farSight"
  | "telekinesis"
  | "psiFold"
  | "willShield"
  | "mindHeal"
  | "damping"
  | "deepCall"
  | "quietMind"
  | "schism"
  // plant
  | "photoSkin"
  | "chloroplasts"
  | "sporeSacs"
  | "tendrils"
  | "bloom"
  | "nectary"
  | "seed"
  | "mycelium"
  | "lichen"
  | "treeRings"
  | "resin"
  | "phototropism"
  // parasites
  | "tapeworm"
  | "brainWorm"
  | "boneLodger"
  | "nest"
  | "cordyceps"
  | "leechGland"
  | "alienNerve"
  | "larvae"
  | "symbioticEye"
  | "secondSoul"
  | "sporeMycelium"
  | "eggInBody"
  | "cancerColony"
  // space
  | "warpFold"
  | "anchor"
  | "pocket"
  | "stepThrough"
  | "rift"
  | "placeEcho"
  | "mirror"
  | "loop"
  | "mismatch"
  | "deepCord"
  | "alienGeometry"
  | "tremble"
  // regulators
  | "catalogOrgan"
  | "selection"
  | "mirrorGland"
  | "culling"
  | "willVaccine"
  | "abyssPocket"
  | "familyBias"
  | "stabilizer"
  | "anchorTissue"
  | "smelter"
  | "transfusion"
  | "burnout"
  | "tailoring"
  | "tumourConductor"
  | "remission"
  | "metastasis"
  | "cancerGarden"
  // defects
  | "blindness"
  | "deafness"
  | "brittleBones"
  | "muteness"
  | "insatiable"
  | "tremor"
  | "photophobia"
  | "rot"
  | "hydrophobia"
  | "asymmetry"
  | "overweight"
  | "seizures"
  | "paranoia"
  | "phantomLimb"
  | "abyssCall"
  | "silentTrunk"
  | "asthma"
  // explosive
  | "flammableBlood"
  | "gasCavities"
  | "unstableGlands"
  | "detonatingSpores"
  | "powderBone"
  | "bombEgg"
  | "methaneStomach"
  | "thermiteFlesh"
  | "charge"
  | "selfIgnition"
  | "cryoCapillaries"
  | "blisterSkin"
  // self-eating
  | "runawayGrowth"
  | "autoimmunity"
  | "innerTeeth"
  | "crystallization"
  | "overheat"
  | "inwardSpines"
  | "nerveOvergrowth"
  | "cancerMetabolism"
  | "sprouting"
  | "selfDisassembly"
  | "reverseMetabolism"
  | "escapingOrgan"
  | "generosity"
  // chrome-breaking
  | "neuroplasia"
  | "boneWave"
  | "magneticBlood"
  | "electricInstability"
  | "rejection"
  | "acidLymph"
  | "meatMemory"
  | "jamming"
  | "bodyTeeth"
  | "nerveStorm"
  // limbs
  | "hydra";

/** A part a body can eat and remember the taste of: an organ, a limb, a cover, a membrane. The four sets share no name. */
export type Eatable = OrganKind | SegmentKind | CoverId | MembraneKind;

/** Where an organ instance may sit: an ending of a node, a torso cavity, a segment surface, inside a head. */
export type Mount = "end" | "cavity" | "growth" | "head";

export type MembraneKind = "wing" | "sail" | "fin" | "gill" | "hood" | "net";

/**
 * Kinds that think: every rule about brains (self, territories, handover,
 * blood death) reads this set, and parts.ts gives each its channels. Kept
 * here, not in parts.ts, so that graph.ts imports nothing.
 */
export const BRAIN_KINDS: ReadonlySet<OrganKind> = new Set<OrganKind>(["brain", "smallBrain", "ganglion", "gutBrain", "greatBrain", "nerveCord", "slowBrain"]);

export function isBrainKind(kind: OrganKind): boolean {
  return BRAIN_KINDS.has(kind);
}

/**
 * Where a brain is: a node (inside a head ending) or a torso segment (in its
 * cavity). The optional index names the ending or the cavity slot when the
 * element holds more than one brain; without it the first brain there is meant.
 */
export type Place = { node: number; end?: number } | { segment: number; slot?: number };

/** One exact brain: the ending of a node that holds its head, or the cavity slot of a segment. */
export type BrainRef = { node: number; end: number } | { segment: number; slot: number };

export type End = "a" | "b";

export interface Organ {
  kind: OrganKind;
  /** 0..100; at 100 the organ turns into a tumour (plague.md). */
  instability: number;
  /** The size step of a kind that has one (sizes.ts); absent means normal. */
  size?: OrganSize;
  /** Only a head has contents: brain, eyes, jaw, ears, nose. */
  contents?: Organ[];
  /** Only a brain: its influence 0..10 (mind.md); absent means 0. The game moves it, the model reads it. */
  sway?: number;
  /** Only an ending that wanders (MIGRATION): turns left until it crawls to a neighbouring node, 1..40. Absent: it stays. */
  wander?: number;
  /** The lab step that made it; never in the hash or the text. */
  origin?: number;
}

/** A snapshot of a part that grows back: hydra and flesh memory (body-graph.md §8). */
export interface PartSnapshot {
  nodes: BodyNode[];
  segments: Segment[];
  membranes: Membrane[];
}

export interface Regrowth {
  /** The node the part grows back from. */
  at: number;
  /** Turns left. */
  turns: number;
  copies: number;
  part: PartSnapshot;
}

export interface BodyNode {
  id: number;
  size: 1 | 2 | 3;
  ends: Organ[];
  hp: number;
  hpMax: number;
  /** Turns left during which the place counts as freshly wounded (growth lands here twice as often). */
  wound: number;
  /** Turns without a path to a working heart. */
  ischemia: number;
  /** A ripper's stub: an empty node that draws the next abyss strike. */
  bait: boolean;
  /**
   * A node two nodes were fused into (FUSION): for every fusion, earliest
   * first, the ids of the segments that came from the node it swallowed. The
   * knife parts the last one again (`unfuse`, decision 1228). Absent: never
   * fused. In the hash and in the text.
   */
  fused?: number[][];
  /** The lab step that made it; never in the hash or the text. */
  origin?: number;
}

export interface Segment {
  id: number;
  a: number;
  b: number;
  kind: SegmentKind;
  /** 1..6; a flank is 0. */
  length: number;
  /** 1..4 */
  girth: number;
  cover: CoverId;
  /** Organs inside: a torso's by mass, a limb's one organ (flank.ts). */
  cavity: Organ[];
  /** Organs on the surface that take no ending slot. */
  growths: Organ[];
  hp: number;
  hpMax: number;
  bleed: number;
  pain: number;
  /** Can be cast off by autotomy while it is a bridge. Grown segments never have one. */
  breakPlane: boolean;
  wound: number;
  ischemia: number;
  /** The lab step that made it; never in the hash or the text. */
  origin?: number;
  /** A flank's side node on its host: which segment, how far along it from the flank's end, which side (flank.ts, decision 1258). */
  place?: FlankPlace;
}

/**
 * Where a side node sits: the segment it hangs on (touching the flank's `a`),
 * the fraction of the host's length from that end, 0..0.5, and the side, -1
 * left or 1 right, of the host as read from its first end `a`: a body's left
 * is its left at both of its ends.
 */
export interface FlankPlace {
  host: number;
  t: number;
  side: -1 | 1;
}

export interface Membrane {
  id: number;
  kind: MembraneKind;
  cycle: number[];
  area: number;
  /** The lab step that made it; never in the hash or the text. */
  origin?: number;
}

/** A cover on the move (body-graph.md §11): every 30 turns it takes one neighbouring skin segment. Fronts are kept in order of arrival. */
export interface CoverFront {
  cover: CoverId;
  /** Turns until the next step, 1..30. */
  turns: number;
}

export interface Body {
  nodes: Record<number, BodyNode>;
  segments: Record<number, Segment>;
  membranes: Record<number, Membrane>;
  self: Place;
  /** Flesh available: the sum of all masses never exceeds it. */
  meat: number;
  nextId: number;
  /** Grows with every change of the graph; cache key, never part of the hash. */
  version: number;
  /** Parts on their way back (flesh memory). Absent or empty: nothing pending. In the hash and in the text (decision 980). */
  regrowth?: Regrowth[];
  /** Covers creeping over the body, earliest first. Absent or empty: none. In the hash and in the text (decision 980). */
  fronts?: CoverFront[];
  /** Turns until the tumours press on their neighbours next, 1..50; absent while the body has no tumour. In the hash and in the text (decision 980). */
  pressure?: number;
  /** What the body ate and still tastes, part by part, fading with time (diet.ts, decision 1253). Absent: nothing. In the hash and in the text. */
  eaten?: Partial<Record<Eatable, number>>;
}

export function organ(kind: OrganKind, contents?: Organ[]): Organ {
  return contents === undefined ? { kind, instability: 0 } : { kind, instability: 0, contents };
}

/** An organ at a size step; the normal step is written as no step at all, so old bodies stay themselves. */
export function sizedOrgan(kind: OrganKind, size: OrganSize, contents?: Organ[]): Organ {
  const o = organ(kind, contents);
  if (size !== "normal") o.size = size;
  return o;
}

/** A brain with the given sway; sway 0 is written as no sway at all. */
export function brainOrgan(sway = 0): Organ {
  return sway === 0 ? organ("brain") : { kind: "brain", instability: 0, sway };
}

export function swayOf(o: Organ): number {
  return o.sway ?? 0;
}

/** Six per size of the node, plus what a big ending stiffens it by and a small one softens it by (sizes.ts); never below one. */
export function nodeHpMax(size: number, ends: readonly Organ[] = []): number {
  return Math.max(1, 6 * size + endsHpBonus(ends));
}

/** The human's torso is girth 3: flesh beyond that is what bloating adds, and it eats and holds. */
export const HUMAN_TORSO_GIRTH = 3;

/** The girth a kind's flesh is written at: the human's torso is girth 3, every other kind is written at girth 1. */
export function sectionGirth(kind: SegmentKind): number {
  return kind === "torso" ? HUMAN_TORSO_GIRTH : 1;
}

/**
 * A segment holds as much as it weighs (decision 1283): four hp per unit of
 * length at the kind's section, and a girth twice that is a section four times
 * as big - the same square that `segmentMassOf` weighs it by (decision 1260).
 * The human holds exactly what he held; a thick leg is stronger, not only heavier.
 */
export function segmentHpMax(length: number, girth: number, kind: SegmentKind): number {
  return Math.round((4 * length * girth * girth) / sectionGirth(kind)) + 4;
}

export function newBody(meat = 0): Body {
  return { nodes: {}, segments: {}, membranes: {}, self: { node: 0 }, meat, nextId: 1, version: 0 };
}

export function touch(body: Body): void {
  body.version += 1;
}

export function cloneBody(body: Body): Body {
  return structuredClone(body);
}

export function sortedIds(rec: Record<number, unknown>): number[] {
  return Object.keys(rec)
    .map(Number)
    .sort((x, y) => x - y);
}

export function nodeIds(body: Body): number[] {
  return sortedIds(body.nodes);
}

export function segmentIds(body: Body): number[] {
  return sortedIds(body.segments);
}

/** Segments touching a node, by ascending id. A segment joining a node to itself never exists. */
export function segmentsAt(body: Body, nodeId: number): number[] {
  const out: number[] = [];
  for (const id of segmentIds(body)) {
    const s = body.segments[id]!;
    if (s.a === nodeId || s.b === nodeId) out.push(id);
  }
  return out;
}

export function otherEnd(seg: Segment, nodeId: number): number {
  return seg.a === nodeId ? seg.b : seg.a;
}

export interface NodeSpec {
  ends?: Organ[];
  bait?: boolean;
  fused?: number[][];
  hp?: number;
  wound?: number;
  ischemia?: number;
}

export function makeNode(id: number, size: 1 | 2 | 3, spec: NodeSpec = {}): BodyNode {
  const ends = spec.ends ?? [];
  const hpMax = nodeHpMax(size, ends);
  const node: BodyNode = {
    id,
    size,
    ends,
    hp: spec.hp ?? hpMax,
    hpMax,
    wound: spec.wound ?? 0,
    ischemia: spec.ischemia ?? 0,
    bait: spec.bait ?? false,
  };
  if (spec.fused !== undefined && spec.fused.length > 0) node.fused = spec.fused.map((g) => [...g]);
  return node;
}

export interface SegmentSpec {
  kind: SegmentKind;
  length: number;
  girth: number;
  cover?: CoverId;
  cavity?: Organ[];
  growths?: Organ[];
  breakPlane?: boolean;
  hp?: number;
  bleed?: number;
  pain?: number;
  wound?: number;
  ischemia?: number;
}

export function makeSegment(id: number, a: number, b: number, spec: SegmentSpec): Segment {
  const hpMax = segmentHpMax(spec.length, spec.girth, spec.kind);
  return {
    id,
    a,
    b,
    kind: spec.kind,
    length: spec.length,
    girth: spec.girth,
    cover: spec.cover ?? "skin",
    cavity: spec.cavity ?? [],
    growths: spec.growths ?? [],
    hp: spec.hp ?? hpMax,
    hpMax,
    bleed: spec.bleed ?? 0,
    pain: spec.pain ?? 0,
    breakPlane: spec.breakPlane ?? true,
    wound: spec.wound ?? 0,
    ischemia: spec.ischemia ?? 0,
  };
}

export function addNode(body: Body, size: 1 | 2 | 3, spec: NodeSpec = {}): number {
  const id = body.nextId++;
  body.nodes[id] = makeNode(id, size, spec);
  touch(body);
  return id;
}

export function addSegment(body: Body, a: number, b: number, spec: SegmentSpec): number {
  if (body.nodes[a] === undefined) throw new Error(`addSegment: node ${a} does not exist`);
  if (body.nodes[b] === undefined) throw new Error(`addSegment: node ${b} does not exist`);
  if (a === b) throw new Error(`addSegment: a segment cannot join node ${a} to itself`);
  const id = body.nextId++;
  body.segments[id] = makeSegment(id, a, b, spec);
  touch(body);
  return id;
}

export function removeSegment(body: Body, id: number): void {
  if (body.segments[id] === undefined) throw new Error(`removeSegment: segment ${id} does not exist`);
  delete body.segments[id];
  touch(body);
}

function isBrainHead(o: Organ): boolean {
  return o.kind === "head" && o.contents !== undefined && o.contents.some((c) => isBrainKind(c.kind));
}

/**
 * Brains an element holds, as refs in list order: for a node every head
 * ending with a brain inside, for a segment every brain in its cavity.
 */
export function brainRefsIn(body: Body, elementId: number): BrainRef[] {
  const out: BrainRef[] = [];
  const node = body.nodes[elementId];
  if (node !== undefined) {
    node.ends.forEach((e, end) => {
      if (isBrainHead(e)) out.push({ node: elementId, end });
    });
    return out;
  }
  const seg = body.segments[elementId];
  if (seg !== undefined) {
    seg.cavity.forEach((o, slot) => {
      if (isBrainKind(o.kind)) out.push({ segment: elementId, slot });
    });
  }
  return out;
}

/** The head ending a node ref points at, when it is a head with a brain. */
export function headAt(body: Body, ref: BrainRef): Organ | undefined {
  if (!("node" in ref)) return undefined;
  const e = body.nodes[ref.node]?.ends[ref.end];
  return e !== undefined && isBrainHead(e) ? e : undefined;
}

/** The brain organ a ref points at, or undefined when nothing of the kind sits there. */
export function brainAt(body: Body, ref: BrainRef): Organ | undefined {
  if ("node" in ref) return headAt(body, ref)?.contents?.find((c) => isBrainKind(c.kind));
  const o = body.segments[ref.segment]?.cavity[ref.slot];
  return o !== undefined && isBrainKind(o.kind) ? o : undefined;
}

export function sameRef(x: BrainRef, y: BrainRef): boolean {
  if ("node" in x) return "node" in y && x.node === y.node && x.end === y.end;
  return "segment" in y && x.segment === y.segment && x.slot === y.slot;
}

/** The exact brain a place means: its index, or the first brain of the element. */
export function resolvePlace(body: Body, place: Place): BrainRef | undefined {
  if ("node" in place) {
    if (place.end !== undefined) {
      const ref = { node: place.node, end: place.end };
      return brainAt(body, ref) === undefined ? undefined : ref;
    }
    return brainRefsIn(body, place.node)[0];
  }
  if (place.slot !== undefined) {
    const ref = { segment: place.segment, slot: place.slot };
    return brainAt(body, ref) === undefined ? undefined : ref;
  }
  return brainRefsIn(body, place.segment)[0];
}

/** The player's brain as an exact ref; undefined when `self` points at nothing of the kind. */
export function selfRef(body: Body): BrainRef | undefined {
  return resolvePlace(body, body.self);
}

/**
 * One spelling per meaning: the index is dropped when it names the first
 * brain of the element, kept otherwise. A place that resolves to no brain is
 * returned as it is.
 */
export function canonicalPlace(body: Body, place: Place): Place {
  const ref = resolvePlace(body, place);
  if (ref === undefined) return place;
  const first = brainRefsIn(body, "node" in ref ? ref.node : ref.segment)[0];
  if (first !== undefined && sameRef(first, ref)) return "node" in ref ? { node: ref.node } : { segment: ref.segment };
  return ref;
}

export function setSelf(body: Body, place: Place): void {
  body.self = canonicalPlace(body, place);
  touch(body);
}

/** Id of the node or segment that holds the player's brain. */
export function selfElement(body: Body): number {
  return "node" in body.self ? body.self.node : body.self.segment;
}

/** Recomputes hpMax after a size, length or girth change, keeping the damage taken. */
export function refreshNodeHp(node: BodyNode): void {
  const max = nodeHpMax(node.size, node.ends);
  node.hp += max - node.hpMax;
  node.hpMax = max;
}

export function refreshSegmentHp(seg: Segment): void {
  const max = segmentHpMax(seg.length, seg.girth, seg.kind);
  seg.hp += max - seg.hpMax;
  seg.hpMax = max;
}
