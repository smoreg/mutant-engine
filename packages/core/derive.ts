/**
 * Everything the rules and the screen read about a body, computed from the
 * graph and the tables by one pure function. Not one number is written on
 * the creature by hand: derive(body) reads segments, endings, covers,
 * cavities and membranes and returns the whole table. Cached per body by
 * `version` and `nextId`; a clone has its own cache.
 */
import type { Body } from "./graph.js";
import { brains } from "./brains.js";
import { bulk as bulkOf, controlCap, controlLoad, upkeep } from "./budgets.js";
import { closure, livingMass } from "./metrics.js";
import { FAMILIES, SEGMENT_KINDS, familyCounts, type Family } from "./parts.js";
import { limbCounts } from "./flank.js";
import { mass, organs, skeletonCeiling, weight } from "./parts.js";
import { alienness } from "./derive/alien.js";
import { attacks, type Attack } from "./derive/attacks.js";
import { blood, eat, type Blood, type Eat } from "./derive/blood.js";
import { breath, type Breath } from "./derive/breath.js";
import { footprintOf, passage, type Footprint, type Passage } from "./derive/bulk.js";
import { buildContext } from "./derive/context.js";
import { armor, exposure, type Armor, type Exposure } from "./derive/exposure.js";
import { gearMatches, type GearMatch } from "./derive/gear.js";
import { grips, type Grips } from "./derive/grip.js";
import { locomotion, type Locomotion } from "./derive/locomotion.js";
import { senses, type Senses } from "./derive/senses.js";
import { speed, type Speed } from "./derive/speed.js";

export * from "./derive/alien.js";
export * from "./derive/attacks.js";
export * from "./derive/blood.js";
export * from "./derive/breath.js";
export * from "./derive/bulk.js";
export type { Chain } from "./derive/context.js";
export * from "./derive/exposure.js";
export * from "./derive/gear.js";
export * from "./derive/grip.js";
export * from "./derive/locomotion.js";
export * from "./derive/senses.js";
export * from "./derive/speed.js";

interface Budgets {
  mass: number;
  /** What the stands and the wings carry: the mass and the membranes (decision 1292). */
  weight: number;
  /** Mass the blood still reaches: what the body eats for and holds blood in. */
  living: number;
  meat: number;
  /** The ceiling on mass: the skeleton's, raised by bloated flesh (parts.ts, step I). */
  ceiling: number;
  upkeep: number;
  control: { load: number; cap: number };
  /** How far the body is from the human, one formula (`alienness`, decision 1254). */
  alien: number;
  /**
   * Parts of each family the body actually carries: `familyCounts` plus the limbs,
   * necks and tails themselves, which a bare limb has without any organ on it.
   * This is what a reader counts on the picture; `familyCounts` counts organs
   * alone (decision 127).
   */
  parts: Record<Family, number>;
}

/** The family a segment of this kind belongs to; a torso, a flank, a gullet and a lump belong to none. */
const SEGMENT_FAMILY: Partial<Record<keyof typeof SEGMENT_KINDS, Family>> = {
  arm: "limbs",
  leg: "limbs",
  tentacle: "limbs",
  stalk: "limbs",
  tail: "limbs",
  neck: "heads",
  penis: "reproduction",
};

/**
 * What is on the body by family: the organs `familyCounts` counts, plus every
 * limb, neck and tail of its own beyond the human's (a bent limb is one, by
 * `limbCounts`). A creature on eight bare legs reads eight, not zero.
 */
export function partCounts(body: Body): Record<Family, number> {
  const counts = familyCounts(body);
  const out = Object.fromEntries(FAMILIES.map((f) => [f, counts[f]])) as Record<Family, number>;
  for (const [kind, n] of limbCounts(body)) {
    const family = SEGMENT_FAMILY[kind];
    if (family === undefined) continue;
    out[family] += Math.max(0, n - (SEGMENT_KINDS[kind].baseline ?? 0));
  }
  return out;
}

export interface Derived {
  attacks: Attack[];
  speed: Speed;
  grips: Grips;
  locomotion: Locomotion;
  bulk: number;
  footprint: Footprint;
  passage: Passage;
  exposure: Exposure;
  armor: Armor;
  senses: Senses;
  breath: Breath;
  budgets: Budgets;
  blood: Blood;
  eat: Eat;
  gear: GearMatch[];
}

function compute(body: Body): Derived {
  const ctx = buildContext(body);
  const sp = speed(ctx);
  const gr = grips(ctx);
  const loco = locomotion(ctx, sp.ring);
  const bulk = bulkOf(body);
  let alien = false;
  let coldBlood = false;
  for (const o of organs(body)) {
    if (o.kind === "alienGeometry") alien = true;
    if (o.kind === "coldBlood") coldBlood = true;
  }
  const exp = exposure(body);
  const bl = blood(ctx);
  const m = mass(body);
  const live = livingMass(body, ctx.live);
  const livingBrains = brains(body).filter((b) => b.alive).length;
  let heartOrgans = 0;
  for (const sid of bl.hearts) for (const o of body.segments[sid]!.cavity) if (o.kind === "heart") heartOrgans += 1;
  const br = breath(ctx, sp, gr, loco, { mass: live, bulk, brains: livingBrains, hearts: heartOrgans, coldBlood });
  // A voice is air through a jaw: a body that breathes only water has the jaw and nothing to speak on (decision 1234).
  const se = senses(ctx);
  if (br.intake.air <= 0) se.speak = false;
  return {
    attacks: attacks(ctx),
    speed: sp,
    grips: gr,
    locomotion: loco,
    bulk,
    footprint: footprintOf(bulk),
    passage: passage(bulk, loco.squeeze, alien, closure(body)),
    exposure: exp,
    armor: armor(ctx, exp),
    senses: se,
    breath: br,
    budgets: {
      mass: m,
      weight: weight(body),
      living: live,
      meat: body.meat,
      ceiling: skeletonCeiling(body),
      upkeep: upkeep(body, ctx.live),
      control: { load: controlLoad(body, ctx.live), cap: controlCap(body) },
      alien: alienness(body),
      parts: partCounts(body),
    },
    blood: bl,
    eat: eat(ctx),
    gear: gearMatches(body),
  };
}

const cache = new WeakMap<Body, { version: number; nextId: number; derived: Derived }>();

/** The derived table of the body; the same object until the body changes. Do not write into it. */
export function derive(body: Body): Derived {
  const hit = cache.get(body);
  if (hit !== undefined && hit.version === body.version && hit.nextId === body.nextId) return hit.derived;
  const derived = compute(body);
  cache.set(body, { version: body.version, nextId: body.nextId, derived });
  return derived;
}

// ---------------------------------------------------------------- what changed

export type SummaryValue = number | boolean | string;

/**
 * The headline quantities in one flat record, for a caption or a diff. Keys
 * are stable names the gallery translates; fractions are rounded to hundredths.
 */
export function summarize(d: Derived): Record<string, SummaryValue> {
  const round = (x: number) => Math.round(x * 100) / 100;
  return {
    attacks: d.attacks.length,
    reach: d.attacks.reduce((r, a) => Math.max(r, a.reach), 0),
    speed: d.speed.value,
    support: round(d.speed.support),
    ring: d.speed.ring,
    grips: d.grips.total,
    precise: d.grips.precise,
    dig: d.locomotion.dig,
    climb: d.locomotion.climb,
    swim: d.locomotion.swim,
    fly: d.locomotion.fly,
    edge: d.locomotion.edge,
    falls: d.locomotion.falls,
    squeeze: d.locomotion.squeeze,
    layEgg: d.locomotion.layEgg,
    bulk: d.bulk,
    footprint: d.footprint,
    passage: d.passage.free,
    cycles: d.passage.cycles,
    exposure: d.exposure.total,
    armor: round(d.armor.mean),
    viewpoints: d.senses.viewpoints.length,
    eyes: d.senses.viewpoints.reduce((n, v) => n + v.eyes, 0),
    heat: d.senses.heat,
    echo: d.senses.echo,
    deep: d.senses.deep,
    hearing: d.senses.hearing,
    smell: d.senses.smell,
    speak: d.senses.speak,
    air: d.breath.intake.air,
    water: d.breath.intake.water,
    tank: round(d.breath.tank.total),
    base: round(d.breath.base),
    delivery: d.breath.delivery,
    media: d.breath.media.join("+"),
    mass: round(d.budgets.mass),
    upkeep: round(d.budgets.upkeep),
    load: d.budgets.control.load,
    channels: d.budgets.control.cap,
    alien: d.budgets.alien,
    hearts: d.blood.hearts.length,
    starving: d.blood.starving.length,
    eats: d.eat.can,
    mouths: d.eat.mouths.length,
    gear: d.gear.length,
  };
}

export interface DerivedChange {
  key: string;
  before: SummaryValue;
  after: SummaryValue;
}

/** What a step of growth moved: every summary quantity that differs, in summary order. */
export function diffDerived(before: Derived, after: Derived): DerivedChange[] {
  const x = summarize(before);
  const y = summarize(after);
  const out: DerivedChange[] = [];
  for (const key of Object.keys(x)) {
    const b = x[key]!;
    const a = y[key]!;
    if (a !== b) out.push({ key, before: b, after: a });
  }
  return out;
}
