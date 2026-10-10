/**
 * What the catalog can actually reach. Three claims of the owner, each closed
 * by the rule behind it rather than by the row that showed it (audit/mutations,
 * decisions 320-323):
 *
 * 1. No row carries its place in itself. The place is the target rule's
 *    (decision 160), so a field of `TargetRule` no row asks for is a place
 *    hiding in the type, a row whose rule fits no body at all is a place
 *    written into the row, and a row whose text names a place its rule does not
 *    hold it to is the same place written in prose (decision 324).
 * 2. Every part the model knows can grow: every kind of organ, of segment, of
 *    cover and of membrane is grown by some row, but for the short list below,
 *    which says why each one does not. Measured on every reference body, not on
 *    the human alone: a family with no place on a whole body is what the owner
 *    sees as a column of "nowhere" (decision 325).
 * 3. Covers take each other. No cover locks a segment, and a front takes a
 *    segment another cover already holds.
 *
 * The bodies are the reference set: the human, the twenty-two beasts of the
 * bestiary and eight mutants of forty abyss strikes. Places are counted with
 * the ceiling lifted - a fixture heavier than its own skeleton refuses every
 * row that brings mass, and that is the fixture's weight, not the row's rule.
 */
import { describe, expect, it } from "vitest";
import { LabRng as Rng } from "../../rng.js";
import {
  COVERS,
  HEAD_SLOTS,
  MEMBRANES,
  ORGANS,
  SEGMENT_KINDS,
  SPREAD,
  TARGET_RULE_FIELDS,
  apply,
  applyMutation,
  bodyFromText,
  coverTick,
  drawMutation,
  human,
  mutationTargets,
  segmentIds,
  startCoverFront,
  targets,
  validate,
  type Body,
  type CoverId,
  type MembraneKind,
  type Organ,
  type OrganKind,
  type SegmentKind,
  type TargetRule,
  CATALOG,
  MUTATIONS,
  MUTATION_ABOUT,
  MUTATION_TEXT,
  BEASTS,
} from "../../index.js";

/** Places are counted as if the skeleton were no object: the rule is what is under test, not the fixture's mass. */
const NO_CEILING = { spread: false, ceiling: 100_000 } as const;

function mutant(seed: number, strikes: number): Body {
  const b = human();
  const rng = new Rng(seed);
  for (let i = 0; i < strikes; i++) {
    const m = drawMutation(MUTATIONS, rng, { spread: true, decay: true, body: b, defect: rng.next() < 0.15 });
    if (m !== null) applyMutation(b, m, rng, { spread: true, source: "abyss" });
  }
  return b;
}

let cached: { name: string; body: Body }[] | null = null;

function bodies(): { name: string; body: Body }[] {
  if (cached === null) {
    cached = [{ name: "human", body: human() }];
    for (const b of BEASTS) cached.push({ name: b.id, body: bodyFromText(b.fixture) });
    for (let seed = 1; seed <= 8; seed++) cached.push({ name: `mutant-${seed}`, body: mutant(seed, 40) });
  }
  return cached;
}

/**
 * Where the texts of the catalog are allowed to say a row lands, and the
 * segment kinds each phrase means. A row that names a place must be held to it
 * by its rule, by the segment it grows itself or by `minSize` - otherwise the
 * place lives in the prose, which is the same defect decision 160 took out of
 * "a penis on the forehead", only written where the type check cannot see it.
 */
const PLACE_WORDS: Record<string, SegmentKind[]> = {
  "на шее": ["neck"],
  "в шее": ["neck"],
  "на шею": ["neck"],
  "на корпусе": ["torso"],
  "в корпусе": ["torso"],
  "на груди": ["torso"],
  "из груди": ["torso"],
  "в грудь": ["torso"],
  "на животе": ["torso"],
  "из живота": ["torso"],
  "в живот": ["torso"],
  "на стебле": ["stalk"],
  "на хвосте": ["tail"],
  "на щупальце": ["tentacle"],
  "на руке": ["arm"],
  "на ноге": ["leg"],
  "на члене": ["penis"],
  "на наросте": ["growth"],
};

/**
 * Rows whose text names a place although no rule holds them there, and why
 * that is not a place written into the row. All of them are operations over
 * the plan of the body (§8): what such an operation takes is its target, and
 * where the part ends up the graph decides - the text names what happens to a
 * human because a human is what the player starts as.
 */
const PLACE_IN_TEXT: Record<string, string> = {
  legsFromChest: "SHIFT moves the leg to the far end of the torso it hangs on; on a human that end is the chest, on another body it is wherever the torso reaches",
  armFromBelly: "ENGULF sinks the limb into the torso that already carries it: the belly is the human's word for that torso, not a rule",
  headIntoChest: "SINK puts the head into the cavity of the segment that carries it, whichever segment that is",
  bloatedBelly: "BLOAT widens a cavity, and only a torso has one: the place is the operation's, and the operation has nowhere else to go",
};

describe("the place is the rule's, never the row's (decision 160)", () => {
  it("no field of the target rule goes unasked: a field no row uses is a place hiding in the type", () => {
    const asked = new Set<string>();
    for (const m of CATALOG) for (const k of Object.keys(m.target)) asked.add(k);
    // Every field the model reads is asked for by a row...
    for (const field of TARGET_RULE_FIELDS) expect(asked.has(field), `no row asks for target rule field "${field}"`).toBe(true);
    // ...and no row asks for a field the model does not read.
    for (const k of asked) expect(TARGET_RULE_FIELDS as readonly string[], `a row narrows by "${k}", which the list does not name`).toContain(k);
  });

  it("every row of the catalog has a place on some body: a rule that fits nothing is a place written into the row", () => {
    const dead = CATALOG.filter((m) => bodies().every(({ body }) => mutationTargets(body, m, NO_CEILING).length === 0));
    expect(dead.map((m) => m.id)).toEqual([]);
  });

  it("no row's text promises a place its rule does not hold it to", () => {
    const stuck: string[] = [];
    for (const m of CATALOG) {
      const text = `${MUTATION_TEXT[m.i18n]?.ru ?? ""} ${MUTATION_ABOUT[m.i18n]?.ru ?? ""}`;
      const said = Object.entries(PLACE_WORDS).filter(([phrase]) => text.includes(phrase));
      if (said.length === 0) continue;
      const allowed = new Set(said.flatMap(([, kinds]) => kinds));
      if (PLACE_IN_TEXT[m.id] !== undefined) continue;
      const kinds = m.target.kinds;
      const grows = m.op === "sprout" || m.op === "branch" ? (m.payload as { kind: SegmentKind }).kind : undefined;
      const held =
        (kinds !== undefined && kinds.length > 0 && kinds.every((k) => allowed.has(k))) ||
        (grows !== undefined && allowed.has(grows)) ||
        // `minSize` above 1 is the rule's own way of saying "a torso": only a torso is that big.
        ((m.target.minSize ?? 1) > 1 && allowed.has("torso"));
      if (!held) stuck.push(`${m.id}: the text says ${said.map(([p]) => `"${p}"`).join(", ")}, the rule says ${JSON.stringify(m.target)}`);
    }
    expect(stuck).toEqual([]);
  });

  it("every row excused from the check above still says a place, and says why it may", () => {
    for (const [id, why] of Object.entries(PLACE_IN_TEXT)) {
      const m = CATALOG.find((x) => x.id === id);
      expect(m, `${id} is excused and is not in the catalog`).toBeDefined();
      expect(why.length, id).toBeGreaterThan(20);
      const text = `${MUTATION_TEXT[m!.i18n]?.ru ?? ""} ${MUTATION_ABOUT[m!.i18n]?.ru ?? ""}`;
      const says = Object.keys(PLACE_WORDS).some((p) => text.includes(p));
      expect(says, `${id} is excused from naming a place and names none: drop the excuse`).toBe(true);
    }
  });

  it("a rule that names segment kinds finds its place on a body that has them", () => {
    for (const m of CATALOG) {
      const kinds = m.target.kinds;
      if (kinds === undefined) continue;
      const fitting = bodies().filter(({ body }) => segmentIds(body).some((id) => kinds.includes(body.segments[id]!.kind)));
      expect(fitting.length, `${m.id}: no reference body carries ${kinds.join(" / ")}`).toBeGreaterThan(0);
      const lands = fitting.some(({ body }) => mutationTargets(body, m, NO_CEILING).length > 0);
      expect(lands, `${m.id}: ${fitting.length} bodies carry ${kinds.join(" / ")} and the row lands on none`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------- every part can grow

/**
 * Kinds the catalog is not meant to grow, and why. A kind added to the tables
 * without a row fails the test below until it is either given one or named
 * here with its reason.
 */
const NEVER_GROWN: Record<string, string> = {
  // organs
  brain: "a head holds one brain (HEAD_SLOTS) and the human's is it; a grown head comes with a smallBrain (§8), a cavity with a ganglion or a gut brain",
  nose: "the human's face: mass 0, no flag, no need reads it - smell is the snout and the scent organ",
  implant: "chrome: iron comes from the ripper, not from the abyss (§8, 'a chrome segment takes neither')",
  blindness: "an absence is the organ gone (decision 1250): the blindness row takes the eyes out; the kind stays for bodies written before it",
  siphon: "the octopus's mantle jet (decision 1316): a beast's organ, the abyss grows fins instead",
  deafness: "an absence is the organ gone (decision 1250): the deafness row takes the ears out; the kind stays for bodies written before it",
  // segments
  flank: "a side node's link to its host (flank.ts), never a part of its own",
  // covers
  chrome: "the same iron: a cover the world puts on, not one the flesh grows",
  stone: "living stone is material of the world like chrome, not a mutation (decision 180)",
};

/**
 * Kinds a row grows but not on a bare human, and why. The jaw stood here until
 * decision 322: a head holds one (`HEAD_SLOTS`) and every head of every body
 * already had one, so the only jaw row waited for a head that could not chew.
 */
const NOT_ON_THE_HUMAN: Record<string, string> = {
  bud: "budding thickens a limb into a torso and puts a heart and a brain inside it: the human's limb segments are length 1 and hold neither",
  swarmWomb: "twenty units of mass in one cavity: the human's torso has no such room, and only a bloated one has",
};

/**
 * A body and a family that has no place on it at all, and the anatomy that
 * leaves it none. The owner's complaint has this shape - a whole family reading
 * "nowhere" in the lab - so the list is kept short and each entry says which
 * part of the body is missing, not which row is unlucky.
 */
const FAMILY_WITHOUT_A_BODY: Record<string, string> = {
  "jellyfish/psionics":
    "the jellyfish is the one reference body with no head at all - its brain lies in the dome's cavity - and every psionic organ mounts in a head (§8); the mind is there, the place for it is not. Measured on 83 bodies (human, 22 beasts, 60 mutants of 80 strikes): one headless body, one homeless family, 14 rows of 14. Left alone on purpose - a spare mount would change what `mount` means for every row of the catalog, for one body nobody plays (decision 671)",
};

/** Every kind any row of the catalog can put on a body, composites included, with the rows that put it there. */
function grown(): { organs: Map<string, string[]>; segments: Map<string, string[]>; covers: Map<string, string[]>; membranes: Map<string, string[]> } {
  const organs = new Map<string, string[]>();
  const segments = new Map<string, string[]>();
  const covers = new Map<string, string[]>();
  const membranes = new Map<string, string[]>();
  const add = (map: Map<string, string[]>, kind: string, id: string): void => {
    map.set(kind, [...(map.get(kind) ?? []), id]);
  };
  for (const m of CATALOG) {
    const organ = (o: Organ | null | undefined): void => {
      if (o === null || o === undefined) return;
      add(organs, o.kind, m.id);
      for (const c of o.contents ?? []) organ(c);
    };
    switch (m.op) {
      case "sprout":
        add(segments, m.payload.kind, m.id);
        add(covers, m.payload.cover, m.id);
        organ(m.payload.ending);
        for (const g of m.payload.growths ?? []) organ(g);
        break;
      case "branch":
        add(segments, m.payload.kind, m.id);
        add(covers, m.payload.cover, m.id);
        break;
      case "joint":
      case "rebirth":
        organ(m.payload.ending);
        break;
      case "organ":
        organ(m.payload.organ);
        break;
      case "cover":
        add(covers, m.payload.cover, m.id);
        break;
      case "membrane":
      case "wings":
        add(membranes, m.payload.kind, m.id);
        break;
      case "twin":
        add(segments, "torso", m.id);
        add(segments, "arm", m.id);
        organ({ kind: "head", instability: 0, contents: [{ kind: m.payload.brain, instability: 0 }, { kind: "eye", instability: 0 }, { kind: "jaw", instability: 0 }] });
        organ({ kind: "hand", instability: 0 });
        break;
      case "budding":
        add(segments, "torso", m.id);
        for (const kind of ["heart", m.payload.brain, "bud"] as OrganKind[]) organ({ kind, instability: 0 });
        break;
      case "amorphous":
        add(segments, "tentacle", m.id);
        organ({ kind: "pseudopod", instability: 0 });
        break;
      case "flesh":
      case "thicken":
        add(segments, "torso", m.id);
        break;
      case "growth":
        add(segments, "growth", m.id);
        break;
      default:
        break;
    }
  }
  // Every operation with nowhere to land falls back to a tumour, so a growth segment always grows.
  add(segments, "growth", "the tumour of §8");
  return { organs, segments, covers, membranes };
}

describe("every part the model knows can grow", () => {
  const reachable = grown();
  const missing = (all: string[], have: ReadonlyMap<string, string[]>): string[] => all.filter((k) => !have.has(k) && NEVER_GROWN[k] === undefined);

  it("every kind of organ is grown by a row, or is named in NEVER_GROWN with its reason", () => {
    expect(missing(Object.keys(ORGANS), reachable.organs)).toEqual([]);
  });

  it("every kind of segment, cover and membrane is grown by a row, or is named with its reason", () => {
    expect(missing(Object.keys(SEGMENT_KINDS), reachable.segments)).toEqual([]);
    expect(missing(Object.keys(COVERS), reachable.covers)).toEqual([]);
    expect(missing(Object.keys(MEMBRANES), reachable.membranes)).toEqual([]);
  });

  it("nothing is excused twice: every name in NEVER_GROWN is a kind the tables have, and no row grows it after all", () => {
    for (const [kind, why] of Object.entries(NEVER_GROWN)) {
      const known = kind in ORGANS || kind in SEGMENT_KINDS || kind in COVERS || kind in MEMBRANES;
      expect(known, `${kind} is excused but no table knows it`).toBe(true);
      expect(why.length, kind).toBeGreaterThan(20);
      const isGrown = reachable.organs.has(kind) || reachable.segments.has(kind) || reachable.covers.has(kind) || reachable.membranes.has(kind);
      expect(isGrown, `${kind} is excused from growing and a row grows it: drop the excuse`).toBe(false);
    }
  });

  it("a place with a cap is never the only place: an organ a head holds by count also grows somewhere else", () => {
    // `HEAD_SLOTS` caps how many of a kind one head holds, so a row that only mounts in a head dies on every body
    // whose heads are full - which is every body the game starts from. The ear was opened this way by decision 162
    // and the jaw by decision 322; a new capped kind must go the same way or be excused.
    for (const kind of Object.keys(HEAD_SLOTS)) {
      if (NEVER_GROWN[kind] !== undefined) continue;
      const elsewhere = CATALOG.filter((m) => {
        if (m.op === "organ") return m.payload.organ.kind === kind && m.payload.mount !== "head";
        if (m.op === "sprout") return m.payload.ending?.kind === kind || (m.payload.growths ?? []).some((g) => g.kind === kind);
        if (m.op === "joint" || m.op === "rebirth") return m.payload.ending?.kind === kind;
        return false;
      });
      expect(elsewhere.map((m) => m.id), `${kind} is capped at ${HEAD_SLOTS[kind as OrganKind]} per head and no row puts it anywhere but in a head`).not.toEqual([]);
    }
  });

  it("a part that grows at all grows on a bare human: a row waiting for a body nobody starts with is a part out of reach", () => {
    const b = human();
    const lands = (id: string): boolean => {
      const m = CATALOG.find((x) => x.id === id);
      return m !== undefined && mutationTargets(b, m, NO_CEILING).length > 0;
    };
    const stuck: string[] = [];
    for (const map of [reachable.organs, reachable.segments]) {
      for (const [kind, rows] of map) {
        if (NOT_ON_THE_HUMAN[kind] !== undefined) continue;
        if (!rows.some(lands)) stuck.push(`${kind} (rows: ${rows.join(", ")})`);
      }
    }
    expect(stuck).toEqual([]);
    for (const [kind, why] of Object.entries(NOT_ON_THE_HUMAN)) {
      expect(reachable.organs.has(kind) || reachable.segments.has(kind), `${kind} is excused from the human and no row grows it anywhere`).toBe(true);
      expect(why.length, kind).toBeGreaterThan(20);
    }
  });

  it("no family goes wholly homeless on a reference body: a column of 'nowhere' is what the owner sees (decision 325)", () => {
    // Measuring on one human proves nothing: a row lands on him and dies on the dragon, and the owner reads
    // a whole family of "nowhere" in the lab. The check is per body, and a family that has no place on one
    // of them must be named below with the anatomy that leaves it no place.
    const families = [...new Set(CATALOG.map((m) => m.family))];
    const dead: string[] = [];
    for (const { name, body } of bodies()) {
      for (const f of families) {
        const rows = CATALOG.filter((m) => m.family === f);
        if (rows.some((m) => mutationTargets(body, m, NO_CEILING).length > 0)) continue;
        dead.push(`${name}/${f} (${rows.length} rows)`);
      }
    }
    expect(dead.map((d) => d.split(" ")[0]).sort()).toEqual(Object.keys(FAMILY_WITHOUT_A_BODY).sort());
  });

  it("every family excused from a body is still excused for a reason, and is still homeless there", () => {
    for (const [key, why] of Object.entries(FAMILY_WITHOUT_A_BODY)) {
      const [name, family] = key.split("/");
      expect(why.length, key).toBeGreaterThan(20);
      const entry = bodies().find((b) => b.name === name);
      expect(entry, `${key}: no reference body called ${String(name)}`).toBeDefined();
      const rows = CATALOG.filter((m) => m.family === family);
      expect(rows.length, `${key}: no family called ${String(family)}`).toBeGreaterThan(0);
      const lands = rows.filter((m) => mutationTargets(entry!.body, m, NO_CEILING).length > 0);
      expect(lands.map((m) => m.id), `${key} is excused and ${lands.length} rows land: drop the excuse`).toEqual([]);
    }
  });

  it("every kind of membrane finds a place on a reference body: five of six used to need a cycle no grown body has (decision 320)", () => {
    for (const kind of Object.keys(MEMBRANES) as MembraneKind[]) {
      const rows = CATALOG.filter((m) => (m.op === "membrane" || m.op === "wings") && m.payload.kind === kind);
      expect(rows.length, `no row grows the membrane ${kind}`).toBeGreaterThan(0);
      const lands = bodies().some(({ body }) => rows.some((m) => mutationTargets(body, m, NO_CEILING).length > 0));
      expect(lands, `the membrane ${kind} has no place on any of the ${bodies().length} reference bodies`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------- covers take each other

/** Covers that grow on flesh: everything but the skin under them and the chrome that is not flesh at all. */
const LIVE_COVERS = (Object.keys(COVERS) as CoverId[]).filter((c) => c !== "skin" && c !== "chrome");

describe("covers take each other, none locks a segment (decision 321)", () => {
  it("only chrome refuses to mutate: no cover of flesh freezes what is under it", () => {
    for (const c of LIVE_COVERS) expect(COVERS[c].mutates, `${c} locks the segment it covers`).toBe(true);
    expect(COVERS.chrome.mutates).toBe(false);
  });

  it("a segment in one cover is a place for the row of any other", () => {
    for (const held of LIVE_COVERS) {
      const b = human(1000);
      const torso = segmentIds(b).find((id) => b.segments[id]!.kind === "torso")!;
      apply(b, "cover", { cover: held }, { segment: torso });
      for (const wanted of LIVE_COVERS) {
        if (wanted === held) continue;
        const places = targets(b, "cover", { cover: wanted }).map((w) => w.target);
        expect(places, `${held} -> ${wanted} is refused on the torso`).toContainEqual({ segment: torso });
      }
    }
  });

  it("a front takes a segment another cover holds, the harder that cover the longer it takes", () => {
    for (const held of LIVE_COVERS) {
      for (const wanted of LIVE_COVERS) {
        if (wanted === held) continue;
        const b = human(10_000);
        const ids = segmentIds(b).filter((id) => b.segments[id]!.kind !== "flank");
        for (const id of ids) b.segments[id]!.cover = held;
        b.segments[ids[0]!]!.cover = wanted;
        expect(startCoverFront(b, wanted)).toBe(true);
        // The price is periods of the front, by the armour of what it eats; well inside the ceiling on the wait.
        const periods = SPREAD.coverResist + COVERS[held].defense;
        let crept = false;
        for (let i = 0; i < SPREAD.coverTurns * (periods + 1) && !crept; i++) crept = coverTick(b).length > 0;
        expect(crept, `${wanted} never takes a segment of ${held}`).toBe(true);
        expect(segmentIds(b).filter((id) => b.segments[id]!.cover === wanted).length).toBeGreaterThan(1);
        expect(validate(b)).toEqual([]);
      }
    }
  });

  it("a body wholly in one cover is not the end of it: a second cover starts and goes on spreading", () => {
    const b = human(10_000);
    const ids = segmentIds(b).filter((id) => b.segments[id]!.kind !== "flank");
    for (const id of ids) b.segments[id]!.cover = "chitin";
    apply(b, "cover", { cover: "fur" }, { segment: ids[0]! });
    startCoverFront(b, "fur");
    for (let i = 0; i < SPREAD.coverTurns * 40; i++) coverTick(b);
    const fur = ids.filter((id) => b.segments[id]!.cover === "fur").length;
    expect(fur, "fur started on one segment of a chitin body and never moved").toBeGreaterThan(1);
    expect(validate(b)).toEqual([]);
  });
});

// The rule the fields above are read against; a compile-time check that the list names real keys.
const _fields: readonly (keyof TargetRule)[] = TARGET_RULE_FIELDS;
void _fields;
