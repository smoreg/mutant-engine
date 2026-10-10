/**
 * The tables of body-graph.md §3 in numbers, and the arithmetic that reads them:
 * what a segment weighs, what an organ weighs, eats and asks in channels, how
 * much a cavity holds, what an ending grips and stands on, what a cover adds.
 * A capability is read from three rows - ending, segment kind, cover - and
 * the combinations come out by themselves (capability.ts).
 *
 * An organ instance carries only its kind, instability and (for a head) its
 * contents; mass, upkeep, control, family and the rest come from ORGANS by kind.
 * The catalog of mutations (src/content) only names kinds from this table.
 */
import type { Body, CoverId, MembraneKind, Mount, Organ, OrganKind, Segment, SegmentKind } from "./graph.js";
import { cavitySlots, limbCounts, tier } from "./flank.js";
import { organSizeSpec } from "./sizes.js";
import { HUMAN_TORSO_GIRTH, sectionGirth } from "./graph.js";

// The section a segment is measured at lives with the segment's hp in graph.ts (decision 1283); mass reads it from there.
export { HUMAN_TORSO_GIRTH, sectionGirth };

/**
 * The size step of an organ is a dimension of this table, not a kind of its
 * own: `sizes.ts` holds the full `kind x step` record and the arithmetic that
 * reads it, and everything below goes through it.
 */
export * from "./sizes.js";

/** The eighteen families of mutations.md, in its order. */
export type Family =
  | "limbs"
  | "heads"
  | "senses"
  | "jaws"
  | "covers"
  | "glands"
  | "movement"
  | "internals"
  | "reproduction"
  | "psionics"
  | "plant"
  | "parasites"
  | "space"
  | "regulators"
  | "defects"
  | "explosive"
  | "selfEating"
  | "chromeBreaking";

export const FAMILIES: readonly Family[] = [
  "limbs",
  "heads",
  "senses",
  "jaws",
  "covers",
  "glands",
  "movement",
  "internals",
  "reproduction",
  "psionics",
  "plant",
  "parasites",
  "space",
  "regulators",
  "defects",
  "explosive",
  "selfEating",
  "chromeBreaking",
];

/** Flags any of the three parts may raise; the body has a capability when any part of any ending raises it. */
export type CapFlag = "climb" | "swim" | "reach" | "eat" | "edge" | "wallCeiling" | "noClimb" | "squeeze" | "smell" | "noDrop";

interface SegmentKindSpec {
  ru: string;
  /** Mass per unit of length at the human's section of the kind (`sectionGirth`). */
  massPer: number;
  /** Upkeep per unit of length at the human's section: limbs eat, torsos and necks do not. Flesh past the section eats on top (`segmentUpkeep`). */
  upkeepPer: number;
  /** Added to the grip of an ending on this segment. */
  grip: number;
  /** Added to the stand of an ending on this segment. */
  stand: number;
  flags: CapFlag[];
  /** A strike the segment makes by itself from its far node: a tail lashes back. */
  attack?: string;
  /** How many of the kind the human has: those are no theme of the body (spread.ts). */
  baseline?: number;
  /** A strike's pain in the segment, times the plain one: the penis hurts. */
  pain?: number;
  /** The longest the kind grows: the penis has three sizes. */
  maxLength?: number;
  /** The segment strikes (`attack`) only from this length on. */
  attackFrom?: number;
}

export const SEGMENT_KINDS: Record<SegmentKind, SegmentKindSpec> = {
  arm: { ru: "рука", massPer: 3, upkeepPer: 1, grip: 0, stand: -1, flags: [], baseline: 2 },
  leg: { ru: "нога", massPer: 3.5, upkeepPer: 1, grip: -1, stand: 1, flags: [], baseline: 2 },
  tentacle: { ru: "щупальце", massPer: 2, upkeepPer: 1, grip: -1, stand: -1, flags: ["noDrop"] },
  torso: { ru: "корпус", massPer: 6.5, upkeepPer: 0, grip: 0, stand: 0, flags: [], baseline: 1 },
  neck: { ru: "шея", massPer: 3, upkeepPer: 0, grip: 0, stand: 0, flags: [], baseline: 1 },
  tail: { ru: "хвост", massPer: 3, upkeepPer: 1, grip: -1, stand: 0, flags: [], attack: "1d6" },
  stalk: { ru: "стебель", massPer: 1, upkeepPer: 0, grip: 0, stand: 0, flags: [] },
  growth: { ru: "нарост", massPer: 4, upkeepPer: 0, grip: 0, stand: 0, flags: [] },
  /** A thin trunk without a cavity that leads a mouth to the torso with the stomach (step J). */
  gullet: { ru: "пищевод", massPer: 2, upkeepPer: 0, grip: 0, stand: 0, flags: [] },
  /** A side node's link to its host (flank.ts): no mass, no length, never a mutation of its own. */
  flank: { ru: "бок", massPer: 0, upkeepPer: 0, grip: 0, stand: 0, flags: [], baseline: Infinity },
  /** A small limb with no joint at its tip, three sizes by length; it hurts, and the biggest strikes. */
  penis: { ru: "член", massPer: 1, upkeepPer: 0, grip: 0, stand: 0, flags: [], baseline: 1, attack: "1d4", pain: 3, maxLength: 3, attackFrom: 3 },
};

/** A tentacle of this length reaches two cells. */
export const TENTACLE_REACH_LENGTH = 4;

/** The skeleton's ceiling on mass, body.md §3: a human's 160. The only ceiling a mutation's own flesh meets; bloated flesh raises it (`skeletonCeiling`). */
export const SKELETON_CEILING = 160;
/** The human's mass: MEAT 101, the penis weighing 1 (decision 118). */
export const HUMAN_MASS = 101;
/** Skeleton the ceiling gains per unit of mass past the human's section, on any segment with a skeleton (decision 1260). */
export const CEILING_PER_FLESH = 2;
/** What a unit of flesh past the human's section burns a turn: the human's own rate, 20 over 101 (decision 1260). */
export const UPKEEP_PER_FLESH = 0.2;
/** What a unit of a membrane's area burns a turn: a sheet of living skin eats (finding S-breath-03, decision 1260). */
export const UPKEEP_PER_AREA = 0.25;
/** What a unit of a membrane's area weighs: a sheet of skin as heavy as a stalk of that length (finding R2-body-03, decision 1292). */
export const MASS_PER_AREA = 1;

/**
 * The numbers of the spread (body-graph.md §11): how hard a family pulls a
 * target toward its organs, how hard the body's theme pulls the draw, what a
 * regulator leaves of both, how often a cover creeps, the chance a stretched
 * or reborn neighbour of a tentacle turns into one, and how a tumour presses.
 */
export const SPREAD = {
  /** weight of a target x= 1 + kFamily x sum over organs of the family of 1 / (1 + d). */
  kFamily: 1.5,
  /** weight of a row x= (1 + kTheme x family share) x (1 + kTheme x features of the kind already there)... */
  kTheme: 3,
  /** ...but never more than this on one row: the theme has a ceiling (step H; 4 erased the theme, 25 let a formless body pull tentacles at 15 %). */
  themeCap: 20,
  /** What a regulator (culling) or meditation leaves of kFamily, kTheme and the contagion. */
  damping: 1 / 3,
  /** A cover takes one neighbouring skin segment this often. */
  coverTurns: 30,
  /** Periods a cover already on the segment costs the front that wants it, over its own armour (decision 321): fur gives way in 2, chitin in 4, stone in 6. */
  coverResist: 2,
  /** Per adjacent tentacle: the chance a stretched or reborn limb becomes a tentacle. */
  contagion: 0.15,
  /** Instability a tumour adds to the organs next to it... */
  pressure: 5,
  /** ...this often. */
  pressureTurns: 50,
} as const;

/** The four types of blow a cover tells apart; a squeeze meets half the blunt guard (damage.ts `coverAgainst`). */
export type GuardType = "blunt" | "cut" | "pierce" | "bite";

interface CoverSpec {
  ru: string;
  massFactor: number;
  /** Chitin does not stretch: the segment under it cannot thicken. */
  stretches: boolean;
  /** Chrome neither mutates nor fuses. */
  mutates: boolean;
  /**
   * What the cover takes off a blow of each type (decision 1262): a hard shell
   * turns an edge, a point and a tooth better than it spreads a club; fur and
   * skin hold nothing; chrome holds best against all of them.
   */
  guard: Record<GuardType, number>;
  /** The cover's best guard: how hard it is, for what reads one number (the creep of a cover, the armour of the lab). */
  defense: number;
  grip: number;
  flags: CapFlag[];
}

/** A guard by type, blunt · cut · pierce · bite. */
function guard(blunt: number, cut: number, pierce: number, bite: number): Pick<CoverSpec, "guard" | "defense"> {
  return { guard: { blunt, cut, pierce, bite }, defense: Math.max(blunt, cut, pierce, bite) };
}

export const COVERS: Record<CoverId, CoverSpec> = {
  skin: { ru: "кожа", massFactor: 1, stretches: true, mutates: true, ...guard(0, 0, 0, 0), grip: 0, flags: [] },
  chitin: { ru: "хитин", massFactor: 1, stretches: false, mutates: true, ...guard(1, 2, 2, 2), grip: 0, flags: [] },
  // Scales no longer swim (decision 1239): swimming is a fin or a fin sheet, not a skin.
  scales: { ru: "чешуя", massFactor: 1, stretches: true, mutates: true, ...guard(1, 2, 2, 2), grip: 0, flags: [] },
  slime: { ru: "слизь", massFactor: 1, stretches: true, mutates: true, ...guard(0, 0, 0, 0), grip: -1, flags: [] },
  suckers: { ru: "присоски", massFactor: 1, stretches: true, mutates: true, ...guard(0, 0, 0, 0), grip: 1, flags: ["climb", "wallCeiling"] },
  fur: { ru: "шерсть", massFactor: 1, stretches: true, mutates: true, ...guard(0, 0, 0, 0), grip: 0, flags: [] },
  // Wood gives the same to every blow.
  bark: { ru: "кора", massFactor: 1, stretches: true, mutates: true, ...guard(1, 1, 1, 1), grip: 0, flags: [] },
  plates: { ru: "костяные пластины", massFactor: 1.3, stretches: true, mutates: true, ...guard(2, 3, 3, 3), grip: -1, flags: [] },
  // Iron: the best guard against every blow there is (decision 1262).
  // Iron over a dragon's scale too (decision 1286): 4 against a blunt blow, where the dragon holds 3.
  chrome: { ru: "хром", massFactor: 1, stretches: false, mutates: false, ...guard(4, 5, 5, 5), grip: 0, flags: [] },
  // --- lab/beasts: covers
  // Feathers are hollow: the lightest cover there is, and no armour at all.
  feathers: { ru: "перья", massFactor: 0.8, stretches: true, mutates: true, ...guard(0, 0, 0, 0), grip: 0, flags: [] },
  // Living stone: the heaviest cover and the hardest after iron, and nothing under it stretches or grips; a club cracks it.
  stone: { ru: "камень", massFactor: 2, stretches: false, mutates: true, ...guard(2, 4, 4, 4), grip: -1, flags: [] },
  // A dragon's scale (decision 1286): plates the size of a palm; no fist, foot or tooth of a man gets through one.
  dragonScales: { ru: "драконья чешуя", massFactor: 1, stretches: true, mutates: true, ...guard(3, 3, 3, 3), grip: 0, flags: [] },
};

/** What an organ or a membrane breathes per turn and what it holds (breath.md §1); density of the layer's air is the game's. */
export interface BreathSpec {
  air: number;
  water: number;
  tank: number;
}

interface MembraneSpec {
  ru: string;
  family: Family;
  flags?: CapFlag[];
  breath?: BreathSpec;
}

export const MEMBRANES: Record<MembraneKind, MembraneSpec> = {
  wing: { ru: "крыло", family: "movement" },
  sail: { ru: "парус", family: "movement" },
  fin: { ru: "плавательная", family: "movement", flags: ["swim"] },
  gill: { ru: "жаберный лист", family: "internals", breath: { air: 0, water: 2, tank: 0 } },
  hood: { ru: "капюшон", family: "covers" },
  net: { ru: "ловчая сеть", family: "glands" },
};

/**
 * brain - the kind thinks (self, territories, handover); chrome - iron: does
 * not mutate; mark - a growth of mass 0 that only tells the rules something;
 * memory - the body regrows what it loses; digests - a stomach for `eat`;
 * eggs - the organ lays an egg (brood.md), unless sterility says otherwise;
 * damps - a regulator: the spread pulls a third as hard while it is in the body;
 * psionic - the organ works the mind: it weighs double on the mental load (step J);
 * weapon - the organ strikes by itself or feeds another strike; its row is
 *   `WEAPONS` in derive/attacks.ts (strike.md §1.6, §1.8). An ending with a die
 *   of its own needs no tag: the die is the mark.
 */
type OrganTag = "brain" | "chrome" | "mark" | "memory" | "digests" | "defect" | "psychic" | "sleeping" | "eggs" | "damps" | "psionic" | "weapon" | "trunk";

/**
 * What the knife finds when it goes in for the organ (decision 1225): `flesh` is
 * a thing it takes out - an organ, a gland, a growth, iron; `trait` is a
 * property or an absence the row is only written as an organ to carry -
 * deafness, cold blood, a way of breeding, a psionic power, a space anomaly -
 * and there is nothing to cut. The part it sits on still comes off.
 */
export type Substance = "flesh" | "trait";

interface OrganSpec {
  ru: string;
  substance: Substance;
  mounts: Mount[];
  mass: number;
  upkeep: number;
  /** Channels the organ asks for. */
  control: number;
  /** Channels the organ gives (brains, and a few parasites). */
  channels?: number;
  /** The family it counts toward (the theme of the spread); absent for containers and the human's own parts. */
  family?: Family;
  /** How many of the kind the human already has: those do not count toward the family. */
  baseline?: number;
  tags?: OrganTag[];
  /** Endings only, body-graph.md §3. */
  grip?: number;
  stand?: number;
  dig?: number;
  /** Endings, and the jaws inside a head: what the organ strikes with. */
  attack?: string;
  flags?: CapFlag[];
  /** A breathing organ: its intake by medium and the tank it adds (breath.md §1). */
  breath?: BreathSpec;
}

type Extra = Partial<Pick<OrganSpec, "channels" | "baseline" | "tags" | "grip" | "stand" | "dig" | "attack" | "flags" | "breath">>;
/** A row before it says what the knife finds: every row of ORGANS goes through `flesh` or `trait`, and the type will not take one that does not. */
type Unmarked = Omit<OrganSpec, "substance">;

function spec(ru: string, mounts: Mount[], mass: number, upkeep: number, control: number, family?: Family, extra: Extra = {}): Unmarked {
  const out: Unmarked = { ru, mounts, mass, upkeep, control };
  if (family !== undefined) out.family = family;
  return Object.assign(out, extra);
}

const end = (ru: string, mass: number, upkeep: number, control: number, grip: number, stand: number, dig: number, attack: string, flags: CapFlag[], family?: Family, extra: Extra = {}) =>
  spec(ru, ["end"], mass, upkeep, control, family, { grip, stand, dig, attack, flags, ...extra });
const cav = (ru: string, mass: number, upkeep: number, control: number, family: Family, extra: Extra = {}) => spec(ru, ["cavity"], mass, upkeep, control, family, extra);
const inHead = (ru: string, mass: number, upkeep: number, control: number, family: Family, extra: Extra = {}) => spec(ru, ["head"], mass, upkeep, control, family, extra);
const growth = (ru: string, mass: number, upkeep: number, control: number, family: Family, extra: Extra = {}) => spec(ru, ["growth"], mass, upkeep, control, family, extra);
const mark = (ru: string, family: Family, extra: Extra = {}) => growth(ru, 0, 0, 0, family, { ...extra, tags: ["mark", ...(extra.tags ?? [])] });
const flesh = (s: Unmarked): OrganSpec => ({ ...s, substance: "flesh" });
const trait = (s: Unmarked): OrganSpec => ({ ...s, substance: "trait" });

export const ORGANS: Record<OrganKind, OrganSpec> = {
  // ---- endings (§3): grip, stand, dig, attack, flags
  hand: flesh(end("кисть", 2, 0, 2, 2, 0, 0, "1d3", [], "limbs", { baseline: 2 })),
  pincer: flesh(end("клешня", 3, 0, 2, 1, 0, 0, "1d8", ["noDrop"], "limbs")),
  claw: flesh(end("коготь", 1, 0, 1, 1, 1, 2, "1d6", ["climb"], "limbs")),
  hook: flesh(end("крюк", 1, 0, 1, 1, 0, 1, "1d4", ["edge"], "limbs")),
  sucker: flesh(end("присоска", 1, 0, 1, 1, 0, 0, "", ["climb", "wallCeiling"], "limbs")),
  mouth: flesh(end("пасть", 2, 0, 1, 0, 0, 0, "1d6", ["eat"], "jaws")),
  sting: flesh(end("жало", 1, 0, 1, 0, 0, 0, "1d4", [], "glands")),
  foot: flesh(end("стопа", 2, 0, 1, 0, 2, 0, "1d2", [], "limbs", { baseline: 2 })),
  hoof: flesh(end("копыто", 3, 0, 1, 0, 3, 0, "1d4", ["noClimb"], "limbs")),
  pseudopod: flesh(end("ложноножка", 1, 0, 1, 1, 1, 0, "", ["squeeze"], "limbs")),
  snout: flesh(end("рыло", 2, 0, 1, 0, 0, 1, "1d3", ["smell"], "movement")),
  eye: flesh(spec("глаз", ["end", "head"], 1, 0.5, 1, "senses", { baseline: 2, grip: 0, stand: 0, dig: 0, attack: "", flags: [] })),
  head: flesh(spec("голова", ["end"], 8, 0, 0)),
  drill: flesh(end("бур", 30, 8, 3, 0, 0, 3, "1d8", [], "movement")),
  root: flesh(end("корень", 12, 1, 1, 0, 2, 0, "", ["noClimb"], "plant")),
  flower: flesh(end("хищный цветок", 6, 3, 2, 0, 0, 0, "1d4", ["eat"], "plant")),
  // ---- inside a head
  brain: flesh(spec("мозг", ["head", "cavity"], 2, 3, 0, "heads", { channels: 10, baseline: 1, tags: ["brain"] })),
  // A jaw grows on the flesh as well as in a head: a head holds one (`HEAD_SLOTS`), so a body whose heads all
  // chew had nowhere to put another (decision 322). The ear opened the same way with decision 162.
  jaw: flesh(spec("челюсть", ["head", "growth"], 0, 1, 1, "jaws", { baseline: 1, attack: "1d3", flags: ["eat"] })),
  // An ear also grows straight on the flesh: a body that hears nothing grows one where it can (step K).
  ear: flesh(spec("ухо", ["head", "growth"], 0, 0.5, 0, "senses", { baseline: 2 })),
  nose: flesh(inHead("нос", 0, 1, 0, "senses", { baseline: 1 })),
  // ---- cavity
  heart: flesh(cav("сердце", 4, 2, 0, "internals", { baseline: 1 })),
  lungs: flesh(cav("лёгкие", 4, 2, 1, "internals", { baseline: 1, breath: { air: 3, water: 0, tank: 5 } })),
  stomach: flesh(cav("желудок", 4, 1, 0, "jaws", { baseline: 1, tags: ["digests"] })),
  gut: flesh(cav("кишка", 2, 1, 0, "jaws")),
  gland: flesh(cav("железа", 1, 2, 0, "glands")),
  womb: flesh(cav("матка", 3, 1, 0, "reproduction", { tags: ["eggs"] })),
  // ---- growths
  spines: flesh(growth("шипы", 1, 0, 0, "covers", { tags: ["weapon"] })),
  skinGland: flesh(growth("кожная железа", 1, 1, 0, "glands")),
  bladder: flesh(growth("газовый пузырь", 1, 0, 0, "internals")),
  photophores: flesh(growth("фотофоры", 0, 0.5, 0, "covers")),
  // ---- chrome
  implant: flesh(spec("имплант", ["end", "cavity", "head", "growth"], 2, 0, 0, undefined, { tags: ["chrome"], grip: 2, stand: 2, dig: 0, attack: "1d4", flags: [] })),
  // ---- heads
  smallBrain: flesh(inHead("малый мозг", 2, 2, 0, "heads", { channels: 6, tags: ["brain"] })),
  ganglion: flesh(cav("спинной узел", 6, 2, 0, "heads", { channels: 3, tags: ["brain"] })),
  gutBrain: flesh(cav("мозг в брюхе", 8, 3, 0, "heads", { channels: 4, tags: ["brain"] })),
  // The wide end of the brain ladder (decisions 617-619): capacity is a kind, not a pile of ganglia. A great brain
  // takes a head, where the psionic organs live and where channels are what pays for them; a nerve cord runs the
  // flesh and never sees a head, so it buys channels and nothing psychic; a slow brain buys resistance instead of
  // channels - it carries the `damps` tag, so the spread pulls a third as hard while it is in the body.
  greatBrain: flesh(spec("большой мозг", ["head", "cavity"], 6, 6, 0, "heads", { channels: 16, tags: ["brain"] })),
  nerveCord: flesh(cav("нервный ствол", 10, 4, 0, "heads", { channels: 20, tags: ["brain", "trunk"] })),
  slowBrain: flesh(spec("медленный мозг", ["head", "cavity"], 10, 1, 0, "heads", { channels: 8, tags: ["brain", "damps"] })),
  fleshMemory: trait(cav("память плоти", 5, 2, 1, "heads", { tags: ["memory"] })),
  coldMind: trait(inHead("холодный рассудок", 2, 1, 0, "heads")),
  mirrorLobes: flesh(inHead("зеркальные доли", 3, 2, 0, "heads")),
  weakNeck: trait(mark("слабая шея", "heads", { tags: ["defect"] })),
  sharedBlood: trait(growth("общая кровь", 2, 1, 0, "heads")),
  echoChamber: flesh(inHead("эхо-камера", 3, 1, 1, "heads")),
  bloodlust: trait(inHead("жажда крови", 4, 1, 1, "heads", { tags: ["psychic"] })),
  nerveShunt: flesh(cav("нервный шунт", 4, 1, 0, "heads")),
  twoFaces: flesh(inHead("два лица", 1, 1, 0, "heads")),
  cortexFolds: flesh(inHead("складки коры", 1, 1, 0, "heads", { channels: 3 })),
  // ---- senses
  heatEye: trait(inHead("тепловое зрение", 2, 1, 1, "senses")),
  echo: trait(inHead("эхолокация", 3, 1, 2, "senses")),
  deepSense: trait(cav("глубинное чутьё", 4, 1, 2, "senses")),
  electroSense: trait(growth("электрорецепция", 3, 2, 2, "senses")),
  magnetSense: trait(inHead("магниточувство", 1, 0, 1, "senses")),
  whiskers: flesh(inHead("вибрисы", 1, 0, 0, "senses")),
  earCluster: flesh(inHead("ушная гроздь", 2, 0, 1, "senses")),
  noPain: trait(cav("отсутствие боли", 0, 0, 0, "senses")),
  sixthSense: trait(cav("шестое чувство", 3, 2, 3, "senses")),
  innerEye: flesh(inHead("глаз внутрь", 2, 2, 2, "senses")),
  facetEye: flesh(inHead("фасеточный глаз", 3, 1, 2, "senses")),
  scentOrgan: flesh(inHead("обонятельный орган", 2, 1, 1, "senses")),
  lightSkin: flesh(growth("светочувствительная кожа", 1, 0, 0, "senses")),
  // ---- jaws
  fangs: flesh(inHead("хищные челюсти", 4, 1, 1, "jaws")),
  crusherJaw: flesh(inHead("дробящие челюсти", 6, 1, 1, "jaws")),
  proboscis: flesh(inHead("хоботок", 3, 1, 1, "jaws")),
  mandibles: flesh(inHead("жвалы", 5, 2, 2, "jaws")),
  radula: flesh(inHead("радула", 2, 1, 1, "jaws")),
  acidStomach: flesh(cav("кислотный желудок", 9, 3, 1, "jaws", { tags: ["digests"] })),
  fermentSac: flesh(cav("бродильный мешок", 7, 2, 0, "jaws", { tags: ["digests"] })),
  crop: flesh(cav("зоб", 5, 1, 0, "jaws")),
  enzymeGland: flesh(cav("ферментная железа", 3, 2, 1, "jaws")),
  glutton: trait(cav("обжора", 12, 5, 1, "jaws", { tags: ["digests"] })),
  abyssLiver: flesh(cav("печень бездны", 6, 2, 1, "jaws")),
  throatTeeth: flesh(growth("зубы в горле", 2, 0, 0, "jaws")),
  eternalHunger: trait(cav("вечный голод", 5, -2, 0, "jaws", { tags: ["psychic", "digests"] })),
  // ---- covers
  shootingSpines: flesh(growth("стреляющие шипы", 10, 2, 1, "covers", { tags: ["weapon"] })),
  chromatophores: flesh(growth("хроматофоры", 4, 2, 1, "covers")),
  rottingSkin: flesh(growth("гниющий покров", 2, 1, 0, "covers", { tags: ["defect"] })),
  mirrorLayer: flesh(growth("зеркальный слой", 8, 3, 1, "covers")),
  pores: trait(growth("поры", 1, 1, 0, "covers", { breath: { air: 1, water: 0, tank: 0 } })),
  moult: trait(growth("линька", 3, 1, 0, "covers")),
  fallingFlesh: trait(growth("разваливающаяся плоть", 2, 0, 0, "covers", { tags: ["defect"] })),
  // ---- glands
  venomGland: flesh(cav("ядовитая железа", 4, 2, 1, "glands", { tags: ["weapon"] })),
  acidGland: flesh(cav("кислотная железа", 5, 3, 1, "glands", { tags: ["weapon"] })),
  acidBlood: trait(cav("кислотная кровь", 3, 1, 0, "glands")),
  fireGland: flesh(cav("огневая железа", 6, 4, 2, "glands", { tags: ["weapon"] })),
  cryoGland: flesh(cav("криожелеза", 6, 4, 2, "glands", { tags: ["weapon"] })),
  sporeGland: flesh(cav("споровая железа", 4, 3, 1, "glands")),
  webGland: flesh(cav("паутинные железы", 5, 2, 2, "glands")),
  pheromoneGland: flesh(cav("феромонная железа", 3, 2, 1, "glands")),
  inkSac: flesh(cav("чернильный мешок", 3, 1, 0, "glands")),
  electricOrgan: flesh(cav("электрический орган", 7, 5, 2, "glands", { tags: ["weapon"] })),
  gasSac: flesh(cav("газовый мешок", 6, 3, 1, "glands")),
  pusGland: flesh(cav("железа гноя", 3, 2, 0, "glands", { tags: ["defect"] })),
  tarGland: flesh(cav("смоляная железа", 4, 2, 1, "glands")),
  panaceaGland: flesh(cav("железа панацеи", 8, 4, 3, "glands")),
  // ---- movement
  fins: flesh(growth("плавники", 8, 1, 1, "movement", { flags: ["swim"] })),
  // The mantle's jet (decision 1316): it pushes the water of the part it sits in, as a fin pushes by the part it grows on.
  siphon: flesh(cav("сифон", 2, 1, 1, "movement", { flags: ["swim"] })),
  spiderThread: trait(growth("паутинный ход", 6, 2, 2, "movement", { flags: ["climb"] })),
  booster: flesh(cav("ускоритель", 5, 3, 1, "movement")),
  foldingSkeleton: trait(cav("складной скелет", 10, 2, 2, "movement")),
  // ---- internals
  gillCluster: flesh(growth("жаберная гроздь", 6, 2, 1, "internals", { breath: { air: 0, water: 2, tank: 0 } })),
  doubleBreath: trait(cav("двойное дыхание", 8, 3, 1, "internals", { breath: { air: 3, water: 2, tank: 5 } })),
  closedSystem: trait(cav("закрытая система", 10, 2, 1, "internals")),
  filters: flesh(cav("фильтры", 3, 1, 0, "internals")),
  baroChamber: flesh(cav("барокамера", 7, 2, 0, "internals")),
  coldBlood: trait(cav("холоднокровность", 2, -2, 0, "internals")),
  heatGen: flesh(cav("теплогенератор", 5, 4, 0, "internals")),
  spongyTissue: flesh(growth("губчатая ткань", 8, 1, 0, "internals")),
  marrow: flesh(cav("костный мозг", 4, 2, 0, "internals")),
  bloodReserve: trait(cav("кровяной резерв", 6, 2, 0, "internals")),
  toxicFlesh: trait(growth("ядовитая плоть", 2, 0, 0, "internals")),
  tastyFlesh: trait(growth("вкусная плоть", 2, 0, 0, "internals", { tags: ["defect"] })),
  ironVeins: flesh(growth("железные жилы", 12, 1, 0, "internals")),
  airSacs: flesh(cav("воздушные мешки", 4, 1, 0, "internals")),
  tracheae: flesh(growth("трахеи", 6, 1, 1, "internals", { breath: { air: 1, water: 0, tank: 0 } })),
  anaerobicGlands: flesh(cav("анаэробные железы", 5, 3, 1, "internals")),
  // ---- reproduction
  ovipositor: flesh(cav("яйцеклад", 8, 2, 1, "reproduction", { tags: ["eggs"] })),
  quickClutch: trait(cav("скорая кладка", 5, 2, 1, "reproduction", { tags: ["eggs"] })),
  bud: flesh(mark("почка", "reproduction")),
  broodPouch: flesh(growth("выводковая сумка", 9, 3, 1, "reproduction")),
  parthenogenesis: trait(cav("партеногенез", 7, 3, 1, "reproduction")),
  liveBirth: trait(cav("живорождение", 11, 4, 2, "reproduction")),
  parasiticClutch: trait(cav("паразитическая кладка", 6, 3, 2, "reproduction")),
  motherBond: trait(cav("материнская связь", 4, 2, 1, "reproduction")),
  cannibalWomb: flesh(cav("каннибальская матка", 6, 3, 1, "reproduction")),
  decoyEgg: flesh(cav("яйцо-приманка", 4, 2, 0, "reproduction")),
  immortalLine: trait(cav("бессмертная линия", 12, 5, 3, "reproduction", { tags: ["eggs"] })),
  swarmWomb: flesh(cav("роевая матка", 20, 6, 4, "reproduction")),
  sterility: trait(cav("стерильность", 3, 0, 0, "reproduction", { tags: ["defect"] })),
  // ---- psionics: pay in channels
  willPush: trait(inHead("толчок воли", 3, 0, 3, "psionics", { tags: ["psionic"] })),
  mindSting: trait(inHead("укол разума", 2, 0, 2, "psionics", { tags: ["psionic"] })),
  terror: trait(inHead("ужас", 3, 0, 3, "psionics", { tags: ["psionic"] })),
  domination: trait(inHead("подчинение", 5, 0, 5, "psionics", { tags: ["psionic"] })),
  mindReading: trait(inHead("чтение", 2, 0, 2, "psionics", { tags: ["psionic"] })),
  farSight: trait(inHead("дальновидение", 3, 0, 3, "psionics", { tags: ["psionic"] })),
  telekinesis: trait(inHead("телекинез", 4, 0, 4, "psionics", { tags: ["psionic"] })),
  psiFold: trait(inHead("складка разума", 5, 0, 5, "psionics", { tags: ["psionic"] })),
  willShield: trait(inHead("щит воли", 3, 0, 3, "psionics", { tags: ["psionic"] })),
  mindHeal: trait(inHead("исцеление разумом", 4, 0, 4, "psionics", { tags: ["psionic"] })),
  damping: trait(inHead("гашение", 3, 0, 3, "psionics", { tags: ["psionic"] })),
  deepCall: trait(inHead("глубинный зов", 6, 0, 6, "psionics", { tags: ["psionic"] })),
  quietMind: trait(inHead("тихий разум", 2, 1, 0, "psionics", { tags: ["psionic"] })),
  schism: trait(inHead("раскол", 2, 0, 0, "psionics", { tags: ["defect", "psionic"] })),
  // ---- plant
  photoSkin: flesh(growth("фотосинтетическая кожа", 6, -3, 0, "plant")),
  chloroplasts: flesh(cav("хлоропластовые доли", 4, -1, 0, "plant")),
  sporeSacs: flesh(growth("споровые мешки", 5, 2, 1, "plant")),
  tendrils: flesh(growth("усики", 4, 1, 1, "plant")),
  bloom: trait(inHead("цветение", 3, 2, 1, "plant")),
  nectary: flesh(growth("нектарник", 3, 2, 0, "plant")),
  seed: flesh(cav("семя", 2, 0, 0, "plant")),
  mycelium: flesh(cav("грибница", 7, 1, 1, "plant", { tags: ["digests"] })),
  lichen: flesh(growth("лишайник", 4, 0, 0, "plant")),
  treeRings: trait(growth("древесные кольца", 8, 0, 0, "plant")),
  resin: flesh(cav("галлюциногенная смола", 4, 2, 1, "plant")),
  phototropism: trait(cav("фототропизм", 1, 1, 1, "plant", { tags: ["defect"] })),
  // ---- parasites: their own will; channels for free
  tapeworm: flesh(cav("ленточный симбионт", 4, 3, 0, "parasites")),
  brainWorm: flesh(inHead("мозговой червь", 2, 1, 0, "parasites", { channels: 2 })),
  boneLodger: flesh(growth("костный жилец", 6, 1, 0, "parasites")),
  nest: flesh(cav("гнездо", 5, 2, 1, "parasites")),
  cordyceps: flesh(inHead("кордицепс", 3, 2, 1, "parasites")),
  leechGland: flesh(growth("пиявка-железа", 3, 2, 0, "parasites")),
  alienNerve: flesh(mark("чужой нерв", "parasites")),
  larvae: flesh(growth("личинки под кожей", 2, 1, 0, "parasites")),
  symbioticEye: flesh(inHead("симбиотический глаз", 2, 1, 0, "parasites", { channels: 1 })),
  secondSoul: trait(inHead("вторая душа", 0, 0, 0, "parasites", { channels: 8 })),
  sporeMycelium: flesh(growth("споровый мицелий", 6, 2, 1, "parasites")),
  eggInBody: flesh(cav("яйцо в теле", 4, 2, 0, "parasites")),
  cancerColony: flesh(growth("раковая колония", 8, 4, 0, "parasites")),
  // ---- space
  warpFold: trait(growth("складка", 4, 3, 2, "space")),
  anchor: trait(growth("якорь", 6, 2, 1, "space")),
  pocket: trait(cav("карман", 5, 2, 1, "space")),
  stepThrough: trait(growth("шаг сквозь", 5, 3, 3, "space")),
  rift: trait(growth("разрыв", 8, 5, 3, "space")),
  placeEcho: trait(inHead("эхо места", 3, 2, 2, "space")),
  mirror: trait(growth("зеркало", 7, 4, 2, "space")),
  loop: trait(cav("петля", 6, 4, 3, "space")),
  mismatch: trait(growth("несовпадение", 2, 2, 0, "space", { tags: ["defect"] })),
  deepCord: trait(cav("глубинная пуповина", 9, 4, 2, "space")),
  alienGeometry: trait(growth("чуждая геометрия", 10, 5, 4, "space")),
  tremble: trait(growth("дрожь", 2, 2, 1, "space", { tags: ["defect"] })),
  // ---- regulators
  catalogOrgan: trait(inHead("каталог", 3, 2, 2, "regulators")),
  selection: trait(cav("отбор", 6, 3, 2, "regulators")),
  mirrorGland: flesh(cav("зеркальная железа", 5, 3, 2, "regulators")),
  culling: trait(cav("выбраковка", 4, 2, 1, "regulators", { tags: ["damps"] })),
  willVaccine: trait(inHead("прививка воли", 4, 3, 3, "regulators")),
  abyssPocket: trait(cav("бездна в кармане", 9, 5, 3, "regulators")),
  familyBias: trait(cav("семейный уклон", 5, 2, 1, "regulators")),
  stabilizer: trait(cav("стабилизатор", 4, 2, 1, "regulators")),
  anchorTissue: flesh(cav("якорная ткань", 4, 2, 1, "regulators")),
  smelter: trait(cav("плавильня", 5, 3, 1, "regulators")),
  transfusion: trait(cav("перелив", 4, 2, 1, "regulators")),
  burnout: trait(cav("выгорание", 3, 2, 0, "regulators")),
  tailoring: trait(growth("раскрой", 5, 2, 2, "regulators")),
  tumourConductor: trait(inHead("дирижёр опухолей", 5, 3, 2, "regulators")),
  remission: trait(cav("ремиссия", 6, 3, 1, "regulators")),
  metastasis: trait(cav("метастаз", 3, 2, 1, "regulators")),
  cancerGarden: trait(growth("раковый сад", 8, 4, 2, "regulators")),
  // ---- defects: mutations.md gives no numbers; since step I a defect weighs what it sits on - the eyes, the ears, the
  // brain, the stomach, the lungs, the skin of a segment - so it takes room at the ceiling like any other flesh
  blindness: trait(inHead("слепота", 2, 0, 0, "defects", { tags: ["defect"] })),
  deafness: trait(inHead("глухота", 1, 0, 0, "defects", { tags: ["defect"] })),
  brittleBones: trait(growth("хрупкие кости", 2, 0, 0, "defects", { tags: ["defect"] })),
  muteness: trait(inHead("немота", 1, 0, 0, "defects", { tags: ["defect"] })),
  insatiable: trait(cav("ненасытная утроба", 4, 0, 0, "defects", { tags: ["defect", "digests"] })),
  tremor: trait(growth("тремор", 2, 0, 0, "defects", { tags: ["defect"] })),
  photophobia: trait(growth("светобоязнь", 1, 0, 0, "defects", { tags: ["defect", "sleeping"] })),
  rot: trait(growth("гниль", 2, 0, 0, "defects", { tags: ["defect"] })),
  hydrophobia: trait(cav("водобоязнь", 2, 0, 0, "defects", { tags: ["defect"] })),
  asymmetry: trait(growth("асимметрия", 2, 0, 0, "defects", { tags: ["defect"] })),
  overweight: trait(growth("лишний вес", 30, 0, 0, "defects", { tags: ["defect"] })),
  seizures: trait(growth("судороги", 2, 0, 0, "defects", { tags: ["defect", "sleeping"] })),
  paranoia: trait(inHead("паранойя", 2, 0, 0, "defects", { tags: ["defect", "sleeping"] })),
  phantomLimb: trait(growth("фантомная конечность", 2, 0, 1, "defects", { tags: ["defect", "sleeping"] })),
  abyssCall: trait(inHead("зов бездны", 2, 0, 0, "defects", { tags: ["defect", "sleeping"] })),
  silentTrunk: trait(inHead("молчащий ствол", 2, 0, 0, "defects", { tags: ["defect"] })),
  asthma: trait(cav("астма", 4, 0, 0, "defects", { tags: ["defect"] })),
  // ---- explosive
  flammableBlood: trait(cav("горючая кровь", 3, 1, 0, "explosive")),
  gasCavities: trait(growth("газовые полости", 4, 1, 0, "explosive")),
  unstableGlands: flesh(cav("нестабильные железы", 6, 3, 1, "explosive")),
  detonatingSpores: flesh(growth("детонирующие споры", 4, 2, 1, "explosive")),
  powderBone: flesh(growth("пороховая кость", 8, 0, 0, "explosive")),
  bombEgg: flesh(cav("взрывное яйцо", 5, 2, 1, "explosive")),
  methaneStomach: flesh(cav("метановый желудок", 7, 2, 0, "explosive", { tags: ["digests"] })),
  thermiteFlesh: trait(growth("термитная плоть", 10, 1, 0, "explosive")),
  charge: flesh(growth("заряд", 9, 3, 2, "explosive")),
  selfIgnition: trait(growth("самовоспламенение", 2, 0, 0, "explosive", { tags: ["defect"] })),
  cryoCapillaries: trait(cav("криокапилляры", 5, 3, 1, "explosive")),
  blisterSkin: flesh(growth("пузырчатая кожа", 6, 2, 1, "explosive")),
  // ---- self-eating
  runawayGrowth: trait(growth("неудержимый рост", 0, 2, 0, "selfEating")),
  autoimmunity: trait(cav("автоиммунитет", 3, 2, 0, "selfEating")),
  innerTeeth: flesh(cav("внутренние зубы", 5, 1, 0, "selfEating")),
  crystallization: trait(growth("кристаллизация", 8, 0, 0, "selfEating")),
  overheat: trait(cav("перегрев", 5, 4, 0, "selfEating")),
  inwardSpines: flesh(growth("шипы внутрь", 6, 0, 0, "selfEating")),
  nerveOvergrowth: trait(inHead("разрастание нервов", 2, 2, 0, "selfEating")),
  cancerMetabolism: trait(cav("раковый метаболизм", 4, -3, 0, "selfEating")),
  sprouting: trait(growth("прорастание", 6, -1, 1, "selfEating")),
  selfDisassembly: trait(growth("саморазбор", 4, 1, 0, "selfEating")),
  reverseMetabolism: trait(cav("обратный обмен", 3, 2, 0, "selfEating")),
  escapingOrgan: flesh(cav("сбегающий орган", 5, 2, 1, "selfEating")),
  generosity: trait(growth("щедрость", 0, 3, 0, "selfEating")),
  // ---- chrome-breaking
  neuroplasia: trait(inHead("нейроплазия", 3, 2, 0, "chromeBreaking", { channels: 2 })),
  boneWave: trait(growth("костная волна", 6, 1, 0, "chromeBreaking")),
  magneticBlood: trait(cav("магнитная кровь", 4, 2, 0, "chromeBreaking")),
  electricInstability: trait(cav("электрическая нестабильность", 5, 3, 1, "chromeBreaking")),
  rejection: trait(cav("отторжение", 3, 1, 0, "chromeBreaking")),
  acidLymph: trait(cav("кислотная лимфа", 4, 2, 0, "chromeBreaking")),
  meatMemory: trait(growth("мясная память", 5, 2, 0, "chromeBreaking", { tags: ["memory"] })),
  jamming: trait(inHead("глушение", 3, 2, 1, "chromeBreaking")),
  bodyTeeth: flesh(growth("зубы по всему телу", 7, 1, 0, "chromeBreaking", { tags: ["weapon"] })),
  nerveStorm: trait(inHead("нервный шторм", 2, 3, 2, "chromeBreaking")),
  // ---- limbs
  hydra: trait(mark("гидра", "limbs")),
};

/** Places inside a head: brain 1, eyes 2-4, jaw 1, ears 2, nose 1. Other kinds are not capped. */
export const HEAD_SLOTS: Partial<Record<OrganKind, number>> = { brain: 1, eye: 4, jaw: 1, ear: 2, nose: 1 };

/** Whether the knife has something to take out when it goes in for an organ of this kind (`Substance`). */
export function isFlesh(kind: OrganKind): boolean {
  return ORGANS[kind].substance === "flesh";
}

export function hasTag(kind: OrganKind, tag: OrganTag): boolean {
  return ORGANS[kind].tags?.includes(tag) ?? false;
}

/**
 * A head chews with any jaw it holds (decision 1235): the jaw of the tables, and
 * every jaw of the family that sits in a head - fangs, a crusher, mandibles, a
 * radula, a proboscis. Their bite is the head's in the fight (strike.ts
 * `HEAD_BITES`), so their mouth is the head's at the table too: an orc with fangs
 * and a spider with chelicerae eat. The `eat` flag stays on the jaw alone: the
 * abyss keeps the last organ that eats (`isVital`), and that is the jaw.
 */
export function chewsInHead(kind: OrganKind): boolean {
  const spec = ORGANS[kind];
  return spec.flags?.includes("eat") === true || (spec.family === "jaws" && spec.mounts.includes("head"));
}

/** Iron in the flesh: an ending or organ that does not mutate. */
export function isChrome(o: Organ): boolean {
  return hasTag(o.kind, "chrome");
}

export function segmentMass(seg: Segment): number {
  return segmentMassOf(seg.kind, seg.length, seg.girth, seg.cover);
}

/**
 * Flesh weighs by its section (decision 1260): `massPer` is the mass of a unit
 * of length at the human's girth of the kind, and a girth twice that is a
 * section four times as big. The human weighs what he did; a torso of the
 * bull's tier weighs (4/3)^2 of his per length, not 4/3.
 */
export function segmentMassOf(kind: SegmentKind, length: number, girth: number, cover: CoverId): number {
  return (SEGMENT_KINDS[kind].massPer * length * girth * girth * COVERS[cover].massFactor) / sectionGirth(kind);
}

/** Mass of the segment past the human's section of its kind, without the cover: what thickening added. */
export function fleshBeyondSection(seg: Segment): number {
  const g = sectionGirth(seg.kind);
  return Math.max(0, (SEGMENT_KINDS[seg.kind].massPer * seg.length * (seg.girth * seg.girth - g * g)) / g);
}

/** Limbs eat per length; flesh past the human's section eats at the human's rate on top, a torso's and a limb's alike (decision 1260). */
export function segmentUpkeep(seg: Segment): number {
  return SEGMENT_KINDS[seg.kind].upkeepPer * seg.length + UPKEEP_PER_FLESH * fleshBeyondSection(seg);
}

/**
 * The spec of an organ instance: its kind's row, with the columns its size
 * step rewrites (sizes.ts). The single funnel - mass, upkeep, control, grip,
 * stand, dig and the die all read the step from here, so no rule can see a
 * huge pincer as a normal one. Grip, stand and dig are written only where the
 * kind has them: a jaw stays a jaw that grips nothing at any size.
 */
export function specOf(o: Organ): OrganSpec {
  const base = ORGANS[o.kind];
  const size = organSizeSpec(o);
  if (size === undefined) return base;
  const out: OrganSpec = { ...base, mass: size.mass, upkeep: size.upkeep, control: size.control };
  if (base.grip !== undefined) out.grip = size.grip;
  if (base.stand !== undefined) out.stand = size.stand;
  if (base.dig !== undefined) out.dig = size.dig;
  if (base.attack !== undefined) out.attack = size.attack;
  return out;
}

/** The die the organ strikes with at its size; "" when it does not strike. */
export function organAttack(o: Organ): string {
  return specOf(o).attack ?? "";
}

/** The channels the organ itself asks for at its size, without what it holds. */
export function organControl(o: Organ): number {
  return specOf(o).control;
}

/** A head weighs itself plus what it holds. */
export function organMass(o: Organ): number {
  let m = specOf(o).mass;
  if (o.contents) for (const c of o.contents) m += organMass(c);
  return m;
}

export function organUpkeep(o: Organ): number {
  let u = specOf(o).upkeep;
  if (o.contents) for (const c of o.contents) u += organUpkeep(c);
  return u;
}

/** Cavity capacity in mass units: 5 x length x girth for a torso and for a limb (which holds one organ, flank.ts), nothing elsewhere. */
export function capacity(seg: Segment): number {
  return cavitySlots(seg) > 0 ? 5 * seg.length * seg.girth : 0;
}

export function cavityLoad(seg: Segment): number {
  let m = 0;
  for (const o of seg.cavity) m += organMass(o);
  return m;
}

export function organsOfSegment(seg: Segment): Organ[] {
  return [...seg.cavity, ...seg.growths];
}

/** Every organ of the body in id order: endings (with head contents), cavities, growths. */
export function* organs(body: Body): Generator<Organ> {
  for (const id of Object.keys(body.nodes).map(Number).sort((x, y) => x - y)) {
    for (const o of body.nodes[id]!.ends) {
      yield o;
      if (o.contents) yield* o.contents;
    }
  }
  for (const id of Object.keys(body.segments).map(Number).sort((x, y) => x - y)) {
    const s = body.segments[id]!;
    yield* s.cavity;
    yield* s.growths;
  }
}

/**
 * What the body weighs on its stands and its wings (decision 1292): its mass
 * and every membrane by its area. A sheet of skin needs no bone and no meat
 * room, so the skeleton's ceiling and the meat keep to `mass`; the load reads this.
 */
export function weight(body: Body): number {
  let m = mass(body);
  for (const mb of Object.values(body.membranes)) m += MASS_PER_AREA * mb.area;
  return m;
}

/** Total mass: segments (with cover factor) plus organs. A node is a point and weighs nothing. */
export function mass(body: Body): number {
  let m = 0;
  for (const s of Object.values(body.segments)) {
    m += segmentMass(s);
    for (const o of s.cavity) m += organMass(o);
    for (const o of s.growths) m += organMass(o);
  }
  for (const n of Object.values(body.nodes)) for (const o of n.ends) m += organMass(o);
  return m;
}

/** Torso girth beyond the human's one torso of 3, summed over every torso: what bloating and second torsos add. */
export function fleshBeyondHuman(body: Body): number {
  let girth = 0;
  for (const s of Object.values(body.segments)) if (s.kind === "torso") girth += s.girth;
  return Math.max(0, girth - HUMAN_TORSO_GIRTH);
}

/** The human's torso without its cover: length 2 at girth 3, what one human skeleton carries of trunk. */
const HUMAN_TORSO_FRAME = segmentMassOf("torso", 2, HUMAN_TORSO_GIRTH, "skin");

/**
 * Flesh the skeleton of this body carries beyond the human's (decision 1260):
 * every torso's flesh past the human's one torso - a second torso, a longer or
 * a thicker one - and, on every other segment with a bone (a neck, a limb, a
 * tail), the flesh past the human's section. The cover on that flesh is not
 * bone (decision 1287): a stone trunk weighs more, its skeleton does not. A tumour, a stalk and a
 * gullet have no bone. A limb of the human's girth is the human's skeleton,
 * so its length costs room, as before.
 */
export function carriedFlesh(body: Body): number {
  return carriedChange(body, [], []).after;
}

/** What a segment adds to the trunk (a torso) and to the limbs' carried flesh (any other segment with a bone). */
function carriedOf(s: Segment): { trunk: number; limbs: number } {
  // Bone is bone (decision 1287): the skeleton grows with the flesh, not with what the flesh wears.
  // Read with the cover, feathers on a thick trunk took more off the ceiling than off the mass.
  if (s.kind === "torso") return { trunk: segmentMassOf(s.kind, s.length, s.girth, "skin"), limbs: 0 };
  return { trunk: 0, limbs: tier(s) > 0 ? fleshBeyondSection(s) : 0 };
}

/**
 * `carriedFlesh` before and after an operation takes some segments away and
 * puts others in: an operation on torsos that lowers the ceiling (a split, a
 * merge) counts its room against the ceiling it leaves (decision 1260).
 */
export function carriedChange(body: Body, removed: readonly Segment[], added: readonly Segment[]): { before: number; after: number } {
  let trunk = 0;
  let limbs = 0;
  for (const s of Object.values(body.segments)) {
    const c = carriedOf(s);
    trunk += c.trunk;
    limbs += c.limbs;
  }
  const before = Math.max(0, trunk - HUMAN_TORSO_FRAME) + limbs;
  for (const s of removed) {
    const c = carriedOf(s);
    trunk -= c.trunk;
    limbs -= c.limbs;
  }
  for (const s of added) {
    const c = carriedOf(s);
    trunk += c.trunk;
    limbs += c.limbs;
  }
  return { before, after: Math.max(0, trunk - HUMAN_TORSO_FRAME) + limbs };
}

/** What an operation that swaps these segments costs the ceiling; 0 when it raises it (a rise is not counted as room ahead of time). */
export function ceilingLoss(body: Body, removed: readonly Segment[], added: readonly Segment[]): number {
  const c = carriedChange(body, removed, added);
  return CEILING_PER_FLESH * Math.max(0, c.before - c.after);
}

/**
 * The ceiling of this body: the skeleton's, plus `CEILING_PER_FLESH` per unit
 * of `carriedFlesh` (decision 1260, replaces step I's 20 per unit of torso
 * girth): the bone that grows with the flesh holds that flesh and half as much again.
 */
export function skeletonCeiling(body: Body, base = SKELETON_CEILING): number {
  return base + CEILING_PER_FLESH * carriedFlesh(body) + coverWeight(body);
}

/**
 * What the covers weigh past the skin they replace, all segments (decision
 * 1287): the skeleton carries a heavy cover once, as it weighs, and a light
 * one takes nothing off it - so no change of cover ever shrinks the room under
 * the ceiling.
 */
export function coverWeight(body: Body): number {
  let w = 0;
  for (const s of Object.values(body.segments)) w += Math.max(0, segmentMass(s) - segmentMassOf(s.kind, s.length, s.girth, "skin"));
  return w;
}

/** Organs of each family beyond the human's baseline; covers by kind, membranes by kind (the theme of the body, the decay of the plan). */
export function familyCounts(body: Body): Record<Family, number> {
  const counts = Object.fromEntries(FAMILIES.map((f) => [f, 0])) as Record<Family, number>;
  const perKind = new Map<OrganKind, number>();
  for (const o of organs(body)) perKind.set(o.kind, (perKind.get(o.kind) ?? 0) + 1);
  for (const [kind, n] of perKind) {
    const spec = ORGANS[kind];
    if (spec.family === undefined) continue;
    counts[spec.family] += Math.max(0, n - (spec.baseline ?? 0));
  }
  const covers = new Set<CoverId>();
  for (const s of Object.values(body.segments)) covers.add(s.cover);
  covers.delete("skin");
  counts.covers += covers.size;
  for (const m of Object.values(body.membranes)) counts[MEMBRANES[m.kind].family] += 1;
  return counts;
}

/**
 * How far the body is from the human, in mutations: organs beyond the baseline
 * (with covers and membranes, as `familyCounts`), segments of each kind beyond
 * the human's, torso girth beyond the human's. The plan decays with it (step I).
 */
export function mutationLoad(body: Body): number {
  let n = 0;
  for (const v of Object.values(familyCounts(body))) n += v;
  // A bent arm is one arm (flank.ts `limbCounts`).
  for (const [kind, count] of limbCounts(body)) n += Math.max(0, count - (SEGMENT_KINDS[kind].baseline ?? 0));
  return n + fleshBeyondHuman(body);
}
