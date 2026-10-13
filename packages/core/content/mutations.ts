/**
 * The catalog of mutations: eighteen families of mutations.md as rows of data
 * over the operations of body-graph.md §8. Every row is an operation, a
 * payload, a target rule, a family, a chance and tags; not one function per
 * mutation. A new mutation of a known kind is a row here; a new kind of
 * effect is a case in packages/core/mutation.ts.
 *
 * `checkMutations` catches what eyes miss: a forgotten translation, a row
 * without a description, a duplicate id, an organ kind the tables do not
 * know, a family under six, an organ kind that does not say whether the
 * knife can take it out.
 */
import { organ, sizedOrgan, type CoverId, type MembraneKind, type Organ, type OrganKind } from "../graph.js";
import type { Payload } from "../grow.js";
import { payloadProblems, type Mutation, type MutationTag, type TargetRule } from "../mutation.js";
import { FAMILIES, ORGANS, type Family } from "../parts.js";
import type { OrganSize, SizedOrganKind } from "../sizes.js";
import { MUTATION_ABOUT, MUTATION_TEXT } from "./i18n.js";
import { applyOverride } from "./override.js";
import { MUTATION_OVERRIDES } from "./overrides.js";

type Row = Omit<Mutation, "i18n">;

const KNOWN_OPS = new Set<string>([
  "sprout",
  "joint",
  "branch",
  "rebirth",
  "thicken",
  "thin",
  "stretch",
  "enlarge",
  "fusion",
  "growth",
  "necrosis",
  "membrane",
  "double",
  "migrate",
  "organ",
  "resize",
  "cover",
  "bloat",
  "engulf",
  "sink",
  "split",
  "merge",
  "flesh",
  "shift",
  "wings",
  "twin",
  "budding",
  "amorphous",
  "lose",
]);
const KNOWN_TAGS = new Set<string>(["defect", "psychic", "sleeping", "key", "psionic", "tidal"]);

const finish = (row: Row): Mutation => ({ ...row, i18n: `mutation.${row.id}` }) as Mutation;

/** An organ takes a mount. */
const place = (id: string, family: Family, kind: OrganKind, mount: "cavity" | "head" | "growth", chance: number, tags: MutationTag[] = [], target: TargetRule = {}): Mutation =>
  finish({ id, family, op: "organ", payload: { organ: organ(kind), mount }, target, chance, tags });
const cav = (id: string, family: Family, kind: OrganKind, chance: number, tags?: MutationTag[]): Mutation => place(id, family, kind, "cavity", chance, tags);
const inHead = (id: string, family: Family, kind: OrganKind, chance: number, tags?: MutationTag[]): Mutation => place(id, family, kind, "head", chance, tags);
const growth = (id: string, family: Family, kind: OrganKind, chance: number, tags: MutationTag[] = [], target: TargetRule = {}): Mutation =>
  place(id, family, kind, "growth", chance, tags, target);

const sprout = (id: string, family: Family, payload: Payload<"sprout">, chance: number, target: TargetRule = {}, tags: MutationTag[] = []): Mutation =>
  finish({ id, family, op: "sprout", payload, target, chance, tags });
const rebirth = (id: string, family: Family, ending: Organ, endings: OrganKind[], chance: number, tags: MutationTag[] = []): Mutation =>
  finish({ id, family, op: "rebirth", payload: { ending }, target: { endings }, chance, tags });
const joint = (id: string, family: Family, ending: Organ | null, kinds: Payload<"sprout">["kind"][], chance: number, target: TargetRule = {}): Mutation =>
  finish({ id, family, op: "joint", payload: { ending }, target: { ...target, kinds }, chance, tags: [] });
const cover = (id: string, family: Family, c: CoverId, chance: number, target: TargetRule = {}): Mutation =>
  finish({ id, family, op: "cover", payload: { cover: c }, target, chance, tags: [] });
const membrane = (id: string, family: Family, kind: MembraneKind, chance: number): Mutation =>
  finish({ id, family, op: "membrane", payload: { kind }, target: {}, chance, tags: [] });
const stretch = (id: string, family: Family, kinds: Payload<"sprout">["kind"][], chance: number): Mutation =>
  finish({ id, family, op: "stretch", payload: { delta: 1 }, target: { kinds }, chance, tags: [] });
/** An operation over the torso (step I): the plan of the body comes apart. */
type PlanOp = "bloat" | "engulf" | "sink" | "split" | "merge" | "flesh" | "shift";
const plan = (id: string, family: Family, op: PlanOp, chance: number, tags: MutationTag[] = [], target: TargetRule = {}): Mutation =>
  finish({ id, family, op, payload: {}, target, chance, tags } as Row);

// --- lab/sprites ---
/** An organ at a size step (packages/core/sizes.ts); the step is data on the instance, not a kind of its own. */
const sized = (kind: SizedOrganKind, size: OrganSize): Organ => sizedOrgan(kind, size);
/**
 * A jaw a step bigger or smaller. It is a RESIZE, not an ORGAN: a head holds
 * one jaw (`HEAD_SLOTS`), so a row that tried to put a second one in had
 * nowhere to land on a body that already has a mouth - which is every body
 * (decision 164). The step goes to the jaw that is already there.
 */
const stepSize = (id: string, family: Family, kind: SizedOrganKind, size: OrganSize, chance: number): Mutation =>
  finish({ id, family, op: "resize", payload: { kind, size }, target: {}, chance, tags: [] });
// --- end lab/sprites ---

const LIMBS: readonly Payload<"sprout">["kind"][] = ["arm", "leg", "tentacle"];
const head = (brain: OrganKind, ...rest: OrganKind[]): Organ => organ("head", [organ(brain), ...rest.map((k) => organ(k))]);

/** The catalog as written here, before the editor's edits (overrides.ts). */
export const BASE_MUTATIONS: readonly Mutation[] = [
  // ---- 1 · limbs
  sprout("extraArm", "limbs", { kind: "arm", length: 2, girth: 1, cover: "skin", ending: organ("hand") }, 10),
  sprout("hydraArm", "limbs", { kind: "arm", length: 2, girth: 1, cover: "skin", ending: organ("hand"), growths: [organ("hydra")] }, 4),
  sprout("tentacle", "limbs", { kind: "tentacle", length: 3, girth: 1, cover: "suckers", ending: organ("sucker") }, 8),
  sprout("pseudopodLimb", "limbs", { kind: "tentacle", length: 2, girth: 1, cover: "slime", ending: organ("pseudopod") }, 6),
  rebirth("pincerHand", "limbs", organ("pincer"), ["hand"], 6),
  rebirth("hookHand", "limbs", organ("hook"), ["hand", "foot"], 4),
  rebirth("suckerTip", "limbs", organ("sucker"), ["hand", "foot"], 4),
  rebirth("handAgain", "limbs", organ("hand"), ["pincer", "claw", "hook", "sucker", "pseudopod"], 2),
  sprout("extraLeg", "limbs", { kind: "leg", length: 2, girth: 1, cover: "skin", ending: organ("foot") }, 8, { minSize: 2 }),
  rebirth("hoof", "limbs", organ("hoof"), ["foot"], 5),
  rebirth("clawFoot", "limbs", organ("claw"), ["foot", "hand"], 5),
  finish({ id: "forking", family: "limbs", op: "branch", payload: { kind: "arm", length: 1, girth: 1, cover: "skin" }, target: { endings: ["hand", "pincer", "claw"] }, chance: 3, tags: [] }),
  finish({ id: "fusedArms", family: "limbs", op: "fusion", payload: {}, target: { endings: ["hand"] }, chance: 2, tags: [] }),
  sprout("graspingTail", "limbs", { kind: "tail", length: 2, girth: 1, cover: "skin", ending: organ("hook") }, 4),
  sprout("whipTail", "limbs", { kind: "tail", length: 3, girth: 1, cover: "skin", ending: null }, 4),
  sprout("castoffTail", "limbs", { kind: "tail", length: 2, girth: 1, cover: "skin", ending: null, breakPlane: true }, 3),
  finish({ id: "shoulderGirdle", family: "limbs", op: "enlarge", payload: {}, target: {}, chance: 3, tags: [] }),
  stretch("longArm", "limbs", ["arm"], 4),
  // A penis has three sizes and grows into them one step at a time (decision 161); nothing ever grows on its tip.
  stretch("penisGrowth", "reproduction", ["penis"], 3),
  sprout("extraPenis", "reproduction", { kind: "penis", length: 1, girth: 1, cover: "skin", ending: null }, 2, { minSize: 2 }),
  // Not the forehead: a penis out of place grows wherever there is room (decision 160).
  sprout("penisElsewhere", "reproduction", { kind: "penis", length: 1, girth: 1, cover: "skin", ending: null }, 2, {}, ["defect"]),
  // ---- 2 · heads and brain
  sprout("secondHead", "heads", { kind: "neck", length: 1, girth: 1, cover: "skin", ending: head("smallBrain", "eye", "jaw", "ear") }, 6, { minSize: 2 }),
  // A head anywhere (decision 160): the place is the target rule's, never the id's. Two rows, not one per limb.
  sprout("headAnywhere", "heads", { kind: "growth", length: 1, girth: 1, cover: "skin", ending: head("smallBrain", "eye", "jaw", "ear") }, 3),
  rebirth("headInstead", "heads", head("smallBrain", "eye", "jaw", "ear"), ["hand", "foot", "pincer", "claw", "hook", "sucker", "pseudopod", "snout"], 2, ["defect"]),
  cav("ganglion", "heads", "ganglion", 5),
  cav("gutBrain", "heads", "gutBrain", 4),
  // The wide end of the brain ladder (decisions 617-619): capacity as a kind, so that a mind grows instead of being
  // stacked out of ganglia. All three take a cavity: a head holds one brain and every head the body grows comes with
  // one of its own, so a row that only mounted in a head would wait for a head that lost its brain (reach.test.ts).
  cav("greatBrain", "heads", "greatBrain", 2),
  cav("nerveCord", "heads", "nerveCord", 2),
  cav("slowBrain", "heads", "slowBrain", 2),
  cav("fleshMemory", "heads", "fleshMemory", 4),
  growth("weakNeck", "heads", "weakNeck", 3, ["defect"], { kinds: ["neck"], toHead: true }),
  stretch("longNeck", "heads", ["neck"], 4),
  inHead("coldMind", "heads", "coldMind", 4),
  inHead("mirrorLobes", "heads", "mirrorLobes", 3),
  inHead("echoChamber", "heads", "echoChamber", 3),
  // Not the neck: the rule asks for the segment that carries a head, and since decision 160 a head grows on a growth too.
  growth("sharedBlood", "heads", "sharedBlood", 3, [], { toHead: true }),
  inHead("bloodlust", "heads", "bloodlust", 2, ["psychic", "key"]),
  cav("nerveShunt", "heads", "nerveShunt", 3),
  inHead("twoFaces", "heads", "twoFaces", 2),
  finish({ id: "crawlingHead", family: "heads", op: "migrate", payload: {}, target: { endings: ["head"] }, chance: 1, tags: [] }),
  plan("sunkenHead", "heads", "sink", 4),
  // Channels without a brain (step J): the mind's need pulls it when the load outgrows the brains.
  inHead("cortexFolds", "heads", "cortexFolds", 3),
  // ---- 3 · senses
  inHead("extraEye", "senses", "eye", 8),
  // An ear where there is none: in a head, or on the body itself. The needs of sight and hearing pull both (step K, decision 162).
  inHead("ear", "senses", "ear", 6),
  growth("earOnBody", "senses", "ear", 3),
  sprout("stalkEye", "senses", { kind: "stalk", length: 2, girth: 1, cover: "skin", ending: organ("eye") }, 6),
  joint("eyeOnJoint", "senses", organ("eye"), [...LIMBS], 4),
  finish({ id: "wanderingEye", family: "senses", op: "migrate", payload: {}, target: { endings: ["eye"] }, chance: 2, tags: [] }),
  inHead("heatEye", "senses", "heatEye", 5),
  inHead("echo", "senses", "echo", 5),
  cav("deepSense", "senses", "deepSense", 4),
  growth("electroSense", "senses", "electroSense", 3),
  inHead("magnetSense", "senses", "magnetSense", 4),
  inHead("whiskers", "senses", "whiskers", 4),
  inHead("earCluster", "senses", "earCluster", 3),
  cav("noPain", "senses", "noPain", 2, ["defect"]),
  cav("sixthSense", "senses", "sixthSense", 3),
  inHead("innerEye", "senses", "innerEye", 2),
  inHead("facetEye", "senses", "facetEye", 3),
  inHead("scentOrgan", "senses", "scentOrgan", 4),
  growth("lightSkin", "senses", "lightSkin", 3),
  // ---- 4 · jaws and digestion
  // A jaw in a head that has none: a head that cannot eat wants one (step K, decision 162).
  inHead("jawInHead", "jaws", "jaw", 5),
  inHead("fangs", "jaws", "fangs", 6),
  inHead("crusherJaw", "jaws", "crusherJaw", 4),
  inHead("proboscis", "jaws", "proboscis", 3),
  inHead("mandibles", "jaws", "mandibles", 4),
  inHead("radula", "jaws", "radula", 3),
  cav("secondStomach", "jaws", "stomach", 5),
  cav("acidStomach", "jaws", "acidStomach", 4),
  cav("fermentSac", "jaws", "fermentSac", 4),
  cav("crop", "jaws", "crop", 4),
  cav("enzymeGland", "jaws", "enzymeGland", 4),
  cav("glutton", "jaws", "glutton", 2),
  cav("abyssLiver", "jaws", "abyssLiver", 3),
  joint("mouthOnLimb", "jaws", organ("mouth"), [...LIMBS], 4),
  rebirth("mouthTip", "jaws", organ("mouth"), ["hand", "foot", "pseudopod"], 3),
  growth("throatTeeth", "jaws", "throatTeeth", 3, [], { kinds: ["neck", "gullet"] }),
  cav("eternalHunger", "jaws", "eternalHunger", 2, ["psychic", "key"]),
  // Step J: a gullet leads a mouth to the trunk that digests; a second mouth opens on the trunk or the neck.
  sprout("gullet", "jaws", { kind: "gullet", length: 2, girth: 1, cover: "skin", ending: organ("mouth") }, 3, { digests: true }),
  joint("secondMouth", "jaws", organ("mouth"), ["torso", "neck"], 3, { keepsCavity: true }),
  // ---- 5 · covers
  cover("chitin", "covers", "chitin", 8),
  cover("scales", "covers", "scales", 6),
  cover("dragonScales", "covers", "dragonScales", 1),
  cover("slime", "covers", "slime", 5),
  cover("suckers", "covers", "suckers", 5),
  cover("fur", "covers", "fur", 5),
  cover("bark", "covers", "bark", 3),
  cover("plates", "covers", "plates", 3),
  growth("spines", "covers", "spines", 6),
  growth("shootingSpines", "covers", "shootingSpines", 3),
  growth("glowSkin", "covers", "photophores", 4),
  growth("chromatophores", "covers", "chromatophores", 3),
  growth("rottingSkin", "covers", "rottingSkin", 2, ["defect"]),
  growth("mirrorLayer", "covers", "mirrorLayer", 2),
  growth("pores", "covers", "pores", 3),
  growth("moult", "covers", "moult", 3),
  growth("fallingFlesh", "covers", "fallingFlesh", 2, ["defect"]),
  membrane("hood", "covers", "hood", 1),
  // ---- 6 · glands
  cav("venomGland", "glands", "venomGland", 6),
  cav("acidGland", "glands", "acidGland", 5),
  cav("acidBlood", "glands", "acidBlood", 4),
  cav("fireGland", "glands", "fireGland", 3),
  cav("cryoGland", "glands", "cryoGland", 3),
  cav("sporeGland", "glands", "sporeGland", 4),
  cav("webGland", "glands", "webGland", 4),
  cav("pheromoneGland", "glands", "pheromoneGland", 3),
  cav("inkSac", "glands", "inkSac", 3),
  cav("electricOrgan", "glands", "electricOrgan", 2),
  cav("gasSac", "glands", "gasSac", 3),
  cav("pusGland", "glands", "pusGland", 2, ["defect"]),
  cav("tarGland", "glands", "tarGland", 3),
  cav("panaceaGland", "glands", "panaceaGland", 1),
  growth("skinGland", "glands", "skinGland", 4),
  sprout("sting", "glands", { kind: "tail", length: 1, girth: 1, cover: "skin", ending: organ("sting") }, 3),
  membrane("net", "glands", "net", 1),
  // ---- 7 · movement
  finish({ id: "wings", family: "movement", op: "wings", payload: { kind: "wing" }, target: {}, chance: 4, tags: [] }),
  membrane("sail", "movement", "sail", 2),
  membrane("fin", "movement", "fin", 2),
  rebirth("drill", "movement", organ("drill"), ["hand", "pincer"], 2),
  rebirth("diggingClaws", "movement", organ("claw"), ["hand"], 4),
  rebirth("snout", "movement", organ("snout"), ["hand", "foot"], 3),
  growth("fins", "movement", "fins", 4),
  growth("spiderThread", "movement", "spiderThread", 3),
  cover("suckerPads", "movement", "suckers", 4, { kinds: ["leg"] }),
  cav("booster", "movement", "booster", 3),
  cav("foldingSkeleton", "movement", "foldingSkeleton", 3),
  stretch("springLegs", "movement", ["leg"], 4),
  finish({ id: "amorphous", family: "movement", op: "amorphous", payload: {}, target: {}, chance: 1, tags: [] }),
  // The plan of the limbs moves along the trunk (step I); kept out of the limbs family so that its draw stays as step D measured it.
  plan("armsFromPelvis", "movement", "shift", 4, [], { kinds: ["arm"] }),
  plan("legsFromChest", "movement", "shift", 3, [], { kinds: ["leg"] }),
  // ---- 8 · internals and breath
  membrane("gill", "internals", "gill", 2),
  // Gills are breath, not a neck: the place is the target rule's, and every segment that still mutates will do.
  growth("gillCluster", "internals", "gillCluster", 4),
  cav("doubleBreath", "internals", "doubleBreath", 3),
  cav("closedSystem", "internals", "closedSystem", 2),
  cav("filters", "internals", "filters", 4),
  cav("baroChamber", "internals", "baroChamber", 3),
  cav("secondHeart", "internals", "heart", 4),
  cav("coldBlood", "internals", "coldBlood", 3),
  cav("heatGen", "internals", "heatGen", 3),
  growth("spongyTissue", "internals", "spongyTissue", 3),
  cav("marrow", "internals", "marrow", 3),
  cav("bloodReserve", "internals", "bloodReserve", 4),
  growth("toxicFlesh", "internals", "toxicFlesh", 3),
  growth("tastyFlesh", "internals", "tastyFlesh", 2, ["defect"]),
  growth("ironVeins", "internals", "ironVeins", 2),
  cav("extraLungs", "internals", "lungs", 3),
  cav("airSacs", "internals", "airSacs", 3),
  growth("tracheae", "internals", "tracheae", 2),
  cav("anaerobicGlands", "internals", "anaerobicGlands", 2),
  growth("gasBladder", "internals", "bladder", 2),
  plan("bloatedBelly", "internals", "bloat", 5),
  plan("twinCavity", "internals", "split", 3),
  plan("fusedTrunks", "internals", "merge", 3),
  plan("armFromBelly", "internals", "engulf", 3, [], { kinds: ["arm", "tentacle"] }),
  // ---- 9 · reproduction
  cav("ovipositor", "reproduction", "ovipositor", 5),
  cav("quickClutch", "reproduction", "quickClutch", 3),
  finish({ id: "budding", family: "reproduction", op: "budding", payload: { brain: "gutBrain" }, target: {}, chance: 3, tags: [] }),
  growth("broodPouch", "reproduction", "broodPouch", 3),
  cav("parthenogenesis", "reproduction", "parthenogenesis", 3),
  cav("liveBirth", "reproduction", "liveBirth", 2),
  cav("parasiticClutch", "reproduction", "parasiticClutch", 2),
  cav("motherBond", "reproduction", "motherBond", 3),
  cav("cannibalWomb", "reproduction", "cannibalWomb", 2),
  cav("decoyEgg", "reproduction", "decoyEgg", 3),
  cav("immortalLine", "reproduction", "immortalLine", 1),
  cav("swarmWomb", "reproduction", "swarmWomb", 1),
  cav("sterility", "reproduction", "sterility", 2, ["defect"]),
  cav("womb", "reproduction", "womb", 4),
  plan("doubleTrunk", "reproduction", "split", 3),
  // ---- 10 · psionics
  inHead("willPush", "psionics", "willPush", 5, ["psionic"]),
  inHead("mindSting", "psionics", "mindSting", 4, ["psionic"]),
  inHead("terror", "psionics", "terror", 3, ["psionic"]),
  inHead("domination", "psionics", "domination", 2, ["psionic"]),
  inHead("mindReading", "psionics", "mindReading", 4, ["psionic"]),
  inHead("farSight", "psionics", "farSight", 3, ["psionic"]),
  inHead("telekinesis", "psionics", "telekinesis", 3, ["psionic"]),
  inHead("psiFold", "psionics", "psiFold", 2, ["psionic"]),
  inHead("willShield", "psionics", "willShield", 3, ["psionic"]),
  inHead("mindHeal", "psionics", "mindHeal", 2, ["psionic"]),
  inHead("damping", "psionics", "damping", 3, ["psionic"]),
  inHead("deepCall", "psionics", "deepCall", 1, ["psionic"]),
  inHead("quietMind", "psionics", "quietMind", 3, ["psionic"]),
  inHead("schism", "psionics", "schism", 2, ["psionic", "defect"]),
  // ---- 11 · plant
  growth("photoSkin", "plant", "photoSkin", 5),
  cav("chloroplasts", "plant", "chloroplasts", 4),
  rebirth("roots", "plant", organ("root"), ["foot"], 3),
  cover("woodFlesh", "plant", "bark", 4),
  growth("sporeSacs", "plant", "sporeSacs", 3),
  growth("tendrils", "plant", "tendrils", 4),
  inHead("bloom", "plant", "bloom", 3),
  growth("nectary", "plant", "nectary", 3),
  cav("seed", "plant", "seed", 3),
  cav("mycelium", "plant", "mycelium", 3),
  growth("lichen", "plant", "lichen", 3),
  sprout("carnivorousFlower", "plant", { kind: "stalk", length: 1, girth: 1, cover: "bark", ending: organ("flower") }, 2),
  growth("treeRings", "plant", "treeRings", 3),
  cav("resin", "plant", "resin", 2),
  cav("phototropism", "plant", "phototropism", 2, ["defect"]),
  // ---- 12 · parasites
  cav("tapeworm", "parasites", "tapeworm", 4),
  inHead("brainWorm", "parasites", "brainWorm", 3),
  growth("boneLodger", "parasites", "boneLodger", 3),
  finish({ id: "parasiticTwin", family: "parasites", op: "twin", payload: { brain: "smallBrain", arms: 2 }, target: {}, chance: 2, tags: [] }),
  cav("nest", "parasites", "nest", 3),
  inHead("cordyceps", "parasites", "cordyceps", 2),
  growth("leechGland", "parasites", "leechGland", 3),
  sprout("alienArm", "parasites", { kind: "arm", length: 2, girth: 1, cover: "skin", ending: organ("hand"), growths: [organ("alienNerve")] }, 3),
  growth("larvae", "parasites", "larvae", 3),
  inHead("symbioticEye", "parasites", "symbioticEye", 3),
  inHead("secondSoul", "parasites", "secondSoul", 1),
  growth("sporeMycelium", "parasites", "sporeMycelium", 3),
  cav("eggInBody", "parasites", "eggInBody", 3),
  growth("cancerColony", "parasites", "cancerColony", 2),
  plan("meatTrunk", "parasites", "flesh", 3),
  // ---- 13 · space
  growth("warpFold", "space", "warpFold", 3),
  growth("anchor", "space", "anchor", 3),
  cav("pocket", "space", "pocket", 3),
  growth("stepThrough", "space", "stepThrough", 2),
  growth("rift", "space", "rift", 2),
  inHead("placeEcho", "space", "placeEcho", 3),
  growth("mirror", "space", "mirror", 2),
  cav("loop", "space", "loop", 1),
  growth("mismatch", "space", "mismatch", 2, ["defect"]),
  cav("deepCord", "space", "deepCord", 2),
  growth("alienGeometry", "space", "alienGeometry", 1),
  growth("tremble", "space", "tremble", 2, ["defect"]),
  plan("splitBody", "space", "split", 2),
  plan("misplacedLimb", "space", "shift", 2),
  // ---- 14 · regulators
  inHead("catalogOrgan", "regulators", "catalogOrgan", 3),
  cav("selection", "regulators", "selection", 3),
  cav("mirrorGland", "regulators", "mirrorGland", 3),
  cav("culling", "regulators", "culling", 3),
  sprout("baitNode", "regulators", { kind: "growth", length: 1, girth: 1, cover: "skin", ending: null, bait: true }, 3),
  inHead("willVaccine", "regulators", "willVaccine", 2),
  cav("abyssPocket", "regulators", "abyssPocket", 1),
  cav("familyBias", "regulators", "familyBias", 3),
  cav("stabilizer", "regulators", "stabilizer", 3),
  cav("anchorTissue", "regulators", "anchorTissue", 3),
  cav("smelter", "regulators", "smelter", 2),
  cav("transfusion", "regulators", "transfusion", 2),
  cav("burnout", "regulators", "burnout", 2),
  growth("tailoring", "regulators", "tailoring", 2, [], { kinds: ["arm"] }),
  inHead("tumourConductor", "regulators", "tumourConductor", 2),
  cav("remission", "regulators", "remission", 2),
  cav("metastasis", "regulators", "metastasis", 2),
  growth("cancerGarden", "regulators", "cancerGarden", 1),
  plan("tumourTrunk", "regulators", "flesh", 2),
  // ---- 15 · defects: every one has another side; five of them sleep until the third stage of alienness
  // An absence is the organ gone (decision 1250): blindness takes the eyes of a head, deafness its ears; a new eye or ear cures it.
  finish({ id: "blindness", family: "defects", op: "lose", payload: { kinds: ["eye", "facetEye", "heatEye"] }, target: {}, chance: 3, tags: ["defect"] }),
  finish({ id: "deafness", family: "defects", op: "lose", payload: { kinds: ["ear", "earCluster"] }, target: {}, chance: 3, tags: ["defect"] }),
  growth("brittleBones", "defects", "brittleBones", 3, ["defect"]),
  inHead("muteness", "defects", "muteness", 3, ["defect"]),
  cav("insatiable", "defects", "insatiable", 2, ["defect"]),
  growth("tremor", "defects", "tremor", 3, ["defect"], { kinds: ["arm", "leg", "tentacle", "tail"] }),
  growth("photophobia", "defects", "photophobia", 2, ["defect", "sleeping"]),
  growth("rot", "defects", "rot", 3, ["defect"]),
  cav("hydrophobia", "defects", "hydrophobia", 2, ["defect"]),
  growth("asymmetry", "defects", "asymmetry", 2, ["defect"]),
  growth("overweight", "defects", "overweight", 2, ["defect"]),
  growth("seizures", "defects", "seizures", 2, ["defect", "sleeping"]),
  inHead("paranoia", "defects", "paranoia", 2, ["defect", "sleeping"]),
  rebirth("pincersForHands", "defects", organ("pincer"), ["hand"], 2, ["defect"]),
  finish({ id: "fusedLegs", family: "defects", op: "fusion", payload: {}, target: { endings: ["foot"] }, chance: 2, tags: ["defect"] }),
  growth("phantomLimb", "defects", "phantomLimb", 2, ["defect", "sleeping"]),
  inHead("abyssCall", "defects", "abyssCall", 2, ["defect", "sleeping"]),
  inHead("silentTrunk", "defects", "silentTrunk", 2, ["defect"]),
  cav("asthma", "defects", "asthma", 2, ["defect"]),
  plan("dropsy", "defects", "bloat", 3, ["defect"]),
  plan("sunkenLeg", "defects", "engulf", 2, ["defect"], { kinds: ["leg"] }),
  plan("necklessness", "defects", "sink", 3, ["defect"]),
  plan("fusedTorsos", "defects", "merge", 2, ["defect"]),
  plan("driftingFork", "defects", "shift", 3, ["defect"]),
  // ---- 16 · explosive
  cav("flammableBlood", "explosive", "flammableBlood", 4),
  growth("gasCavities", "explosive", "gasCavities", 4, [], { kinds: ["arm", "leg", "tentacle", "tail"] }),
  cav("unstableGlands", "explosive", "unstableGlands", 3),
  growth("detonatingSpores", "explosive", "detonatingSpores", 3),
  growth("powderBone", "explosive", "powderBone", 3),
  cav("bombEgg", "explosive", "bombEgg", 2),
  cav("methaneStomach", "explosive", "methaneStomach", 3),
  growth("thermiteFlesh", "explosive", "thermiteFlesh", 2),
  sprout("capsule", "explosive", { kind: "tail", length: 1, girth: 1, cover: "skin", ending: null, growths: [organ("charge")], breakPlane: true }, 2),
  growth("selfIgnition", "explosive", "selfIgnition", 2, ["defect"]),
  cav("cryoCapillaries", "explosive", "cryoCapillaries", 3),
  growth("blisterSkin", "explosive", "blisterSkin", 3),
  plan("gasBloat", "explosive", "bloat", 3),
  // ---- 17 · self-eating
  growth("runawayGrowth", "selfEating", "runawayGrowth", 3),
  cav("autoimmunity", "selfEating", "autoimmunity", 3),
  cav("innerTeeth", "selfEating", "innerTeeth", 3),
  finish({ id: "devouringTwin", family: "selfEating", op: "twin", payload: { brain: "smallBrain", arms: 0 }, target: {}, chance: 2, tags: [] }),
  growth("crystallization", "selfEating", "crystallization", 2),
  cav("overheat", "selfEating", "overheat", 3),
  growth("inwardSpines", "selfEating", "inwardSpines", 3),
  inHead("nerveOvergrowth", "selfEating", "nerveOvergrowth", 3),
  cav("cancerMetabolism", "selfEating", "cancerMetabolism", 3),
  growth("sprouting", "selfEating", "sprouting", 3),
  growth("selfDisassembly", "selfEating", "selfDisassembly", 2),
  cav("reverseMetabolism", "selfEating", "reverseMetabolism", 2),
  cav("escapingOrgan", "selfEating", "escapingOrgan", 2),
  growth("generosity", "selfEating", "generosity", 2),
  plan("swellingFlesh", "selfEating", "bloat", 3),
  plan("limbSwallowed", "selfEating", "engulf", 4),
  plan("headIntoChest", "selfEating", "sink", 2),
  plan("oneFlesh", "selfEating", "merge", 3),
  plan("runawayFlesh", "selfEating", "flesh", 3),
  // ---- 18 · chrome-breaking
  inHead("neuroplasia", "chromeBreaking", "neuroplasia", 3),
  growth("boneWave", "chromeBreaking", "boneWave", 3),
  cav("magneticBlood", "chromeBreaking", "magneticBlood", 3),
  cav("electricInstability", "chromeBreaking", "electricInstability", 3),
  cav("rejection", "chromeBreaking", "rejection", 3),
  cav("acidLymph", "chromeBreaking", "acidLymph", 3),
  growth("meatMemory", "chromeBreaking", "meatMemory", 3),
  inHead("jamming", "chromeBreaking", "jamming", 2),
  growth("bodyTeeth", "chromeBreaking", "bodyTeeth", 2),
  inHead("nerveStorm", "chromeBreaking", "nerveStorm", 2),
  // ---- lab/sprites: sizes
  // The same kinds, a step bigger or smaller (packages/core/sizes.ts): the size is a column of the
  // organ table, so one row here is the whole mutation - mass, die, grip, hp, area and sprite follow.
  // The limbs family carries the theme of the body (spread.test.ts measures it): every row added here
  // waters the draw down, so only the pincer - the owner's own example - takes a pair. The other seven
  // kinds have their numbers, their names and their sprites; a row apiece is one line, and belongs with
  // whoever owns the catalog.
  rebirth("hugePincer", "limbs", sized("pincer", "huge"), ["hand", "pincer", "claw", "hook"], 3),
  rebirth("smallPincer", "limbs", sized("pincer", "small"), ["hand", "pincer"], 2),
  rebirth("hugeMouth", "jaws", sized("mouth", "huge"), ["hand", "foot", "mouth", "pseudopod"], 3),
  rebirth("smallMouth", "jaws", sized("mouth", "small"), ["hand", "foot", "mouth"], 2),
  stepSize("hugeJaw", "jaws", "jaw", "huge", 3),
  stepSize("smallJaw", "jaws", "jaw", "small", 2),
  // ---- lab/beasts: covers
  cover("feathers", "covers", "feathers", 5),
  // ---- audit/mutations: the kinds the table knew and the catalog never grew (decision 322)
  // A jaw is not a thing of the head alone: a head holds one (`HEAD_SLOTS`), so on every body whose heads
  // already chew - the human's and all twenty-two beasts' - `jawInHead` had nowhere to land. The ear went
  // the same way with decision 162; the jaw follows it onto the flesh.
  growth("jawOnBody", "jaws", "jaw", 4),
  // The plain gut and the plain gland of the table of §3: every other organ of those rows - the heart, the
  // lungs, the stomach, the womb - has a row, and these two had none.
  cav("longGut", "jaws", "gut", 4),
  cav("extraGland", "glands", "gland", 4),
];

/** Every row with the editor's accepted edits on top, the switched-off ones among them. */
export const CATALOG: readonly Mutation[] = BASE_MUTATIONS.map((m) => applyOverride(m, MUTATION_OVERRIDES[m.id]));

/** Rows switched off in the editor: no source draws them. */
export function isDisabled(id: string): boolean {
  return MUTATION_OVERRIDES[id]?.disabled === true;
}

/** What the sources draw from: the catalog without the rows switched off (decision 116). */
export const MUTATIONS: readonly Mutation[] = CATALOG.filter((m) => !isDisabled(m.id));

/** A row by id, switched off or not: a row switched off can still be placed by hand. */
export function mutationById(id: string): Mutation | undefined {
  return CATALOG.find((m) => m.id === id);
}

/** Every organ kind a row names anywhere in its payload: the organ it places, the ending it grows, what a head holds, a brain by kind. */
function organKindsOf(payload: unknown, organs: Readonly<Record<string, unknown>>, out = new Set<string>()): Set<string> {
  if (typeof payload === "string") {
    if (Object.hasOwn(organs, payload)) out.add(payload);
  } else if (Array.isArray(payload)) {
    for (const x of payload) organKindsOf(x, organs, out);
  } else if (payload !== null && typeof payload === "object") {
    for (const x of Object.values(payload)) organKindsOf(x, organs, out);
  }
  return out;
}

/** Problems of the table: a forgotten column, a duplicate, a kind the body does not know, a missing description, a family under six. Empty means sound. */
export function checkMutations(
  catalog: readonly Mutation[] = CATALOG,
  text: Record<string, { ru: string; en: string }> = MUTATION_TEXT,
  about: Record<string, { ru: string; en: string }> = MUTATION_ABOUT,
  organs: typeof ORGANS = ORGANS,
): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const perFamily = new Map<Family, number>();
  const used = new Set<string>();
  for (const m of catalog) {
    if (ids.has(m.id)) problems.push(`duplicate mutation id ${m.id}`);
    ids.add(m.id);
    if (!FAMILIES.includes(m.family)) problems.push(`${m.id}: unknown family ${String(m.family)}`);
    perFamily.set(m.family, (perFamily.get(m.family) ?? 0) + 1);
    if (!KNOWN_OPS.has(m.op)) problems.push(`${m.id}: unknown operation ${String(m.op)}`);
    if (m.payload === undefined || typeof m.payload !== "object") problems.push(`${m.id}: no payload`);
    else problems.push(...payloadProblems(m));
    if (m.target === undefined || typeof m.target !== "object") problems.push(`${m.id}: no target rule`);
    // The knife takes out only flesh (decision 1225): a kind that does not say which it is would be offered by guess.
    for (const kind of organKindsOf(m.payload, organs)) {
      const substance = (organs as Record<string, { substance?: unknown }>)[kind]!.substance;
      if (substance !== "flesh" && substance !== "trait") problems.push(`${m.id}: organ ${kind} has no substance (flesh or trait)`);
    }
    if (!(Number.isFinite(m.chance) && m.chance > 0)) problems.push(`${m.id}: chance ${m.chance} is not finite and above 0`);
    for (const t of m.tags ?? []) if (!KNOWN_TAGS.has(t)) problems.push(`${m.id}: unknown tag ${String(t)}`);
    const entry = text[m.i18n];
    if (entry === undefined) problems.push(`${m.id}: no text for key ${m.i18n}`);
    else {
      if (!entry.ru) problems.push(`${m.i18n}: no ru`);
      if (!entry.en) problems.push(`${m.i18n}: no en`);
    }
    // Every row says what it does, in both languages: the studio shows it where the mutation is chosen (decision 163).
    const says = about[m.i18n];
    if (says === undefined) problems.push(`${m.id}: no description for key ${m.i18n}`);
    else {
      if (!says.ru) problems.push(`${m.i18n}: no ru description`);
      if (!says.en) problems.push(`${m.i18n}: no en description`);
    }
    used.add(m.i18n);
  }
  for (const key of Object.keys(text)) if (!used.has(key)) problems.push(`orphan text ${key}`);
  for (const key of Object.keys(about)) if (!used.has(key)) problems.push(`orphan description ${key}`);
  for (const f of FAMILIES) {
    const n = perFamily.get(f) ?? 0;
    if (n < 6) problems.push(`family ${f} has ${n} mutations, < 6`);
  }
  return problems;
}
