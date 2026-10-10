/**
 * Perception: from which nodes the body looks and with what, how many ears
 * and noses it has, whether it can speak. An eye on a stalk sees from its
 * own node; blindness in a head silences that head's eyes, deafness its ears,
 * muteness its speech.
 *
 * A sense organ works only where a living brain reaches it (decision 1270):
 * within `SENSE_REACH` of one, the same reach the needs measure (needs.ts,
 * step K). A head with no brain of its own sees for the brain beside it, and
 * an eye on a foot, beyond every brain, is flesh. An organ grown on the flesh
 * (a segment's growths or cavity) senses like one in a head (decision 1271):
 * the ear on the body hears, as its row promises.
 */
import type { Organ } from "../graph.js";
import { nodeIds, segmentIds } from "../graph.js";
import { brains } from "../brains.js";
import { distances } from "../metrics.js";
import { running, type Ctx } from "./context.js";

/**
 * How far a brain reaches for an eye, an ear or a mouth (step K): half a human
 * - head, neck, half the trunk - so the brain in the belly still sees with the
 * head's eyes, and a head grown on a hand does not.
 */
export const SENSE_REACH = 3;
const EPS = 1e-9;

export interface Viewpoint {
  node: number;
  eyes: number;
  heat: boolean;
}

export interface Senses {
  viewpoints: Viewpoint[];
  sight: boolean;
  heat: boolean;
  echo: boolean;
  deep: boolean;
  /** Electroreception: the body feels the living around it without eyes (decision 1272). */
  electro: boolean;
  /** Light-sensing skin: the body sees light without eyes (decision 1272). */
  light: boolean;
  hearing: number;
  /** Where the body hears: a node, or a segment with its two ends; what the hearing need reads (needs.ts). */
  hearingAt: number[];
  smell: number;
  speak: boolean;
}

export const EYE_KINDS: ReadonlySet<Organ["kind"]> = new Set<Organ["kind"]>(["eye", "facetEye"]);
export const EAR_KINDS: ReadonlySet<Organ["kind"]> = new Set<Organ["kind"]>(["ear", "earCluster"]);
const NOSES = new Set<Organ["kind"]>(["nose", "scentOrgan"]);

/** Elements a living brain reaches: a node within `SENSE_REACH`, a segment with an end within it. */
export function sensedElements(ctx: Ctx): Set<number> {
  const { body } = ctx;
  const rows = brains(body)
    .filter((b) => b.alive)
    .map((b) => distances(body, b.place));
  const near = (n: number): boolean => rows.some((d) => (d[n] ?? Infinity) <= SENSE_REACH + EPS);
  const out = new Set<number>();
  for (const id of nodeIds(body)) if (running(ctx, id) && near(id)) out.add(id);
  for (const id of segmentIds(body)) {
    const s = body.segments[id]!;
    if (running(ctx, id) && (near(s.a) || near(s.b))) out.add(id);
  }
  return out;
}

interface Tally {
  eyes: number;
  heat: boolean;
  echo: boolean;
  deep: boolean;
  electro: boolean;
  light: boolean;
  hearing: number;
  smell: number;
  speak: boolean;
}

/** What one set of organs adds; `head` carries the head's own defects, flesh has none. */
function tally(t: Tally, list: readonly Organ[]): void {
  const blind = list.some((c) => c.kind === "blindness");
  const deaf = list.some((c) => c.kind === "deafness");
  const mute = list.some((c) => c.kind === "muteness");
  for (const c of list) {
    if (EYE_KINDS.has(c.kind) && !blind) t.eyes += 1;
    if (c.kind === "heatEye" && !blind) t.heat = true;
    if (EAR_KINDS.has(c.kind) && !deaf) t.hearing += 1;
    if (NOSES.has(c.kind)) t.smell += 1;
    if (c.kind === "echo") t.echo = true;
    if (c.kind === "deepSense") t.deep = true;
    if (c.kind === "electroSense") t.electro = true;
    if (c.kind === "lightSkin") t.light = true;
    if ((c.kind === "jaw" || c.kind === "twoFaces") && !mute) t.speak = true;
  }
}

function empty(): Tally {
  return { eyes: 0, heat: false, echo: false, deep: false, electro: false, light: false, hearing: 0, smell: 0, speak: false };
}

export function senses(ctx: Ctx): Senses {
  const { body } = ctx;
  const sensed = sensedElements(ctx);
  const viewpoints: Viewpoint[] = [];
  const all = empty();
  const hearingAt = new Set<number>();
  const merge = (t: Tally): void => {
    all.echo ||= t.echo;
    all.deep ||= t.deep;
    all.electro ||= t.electro;
    all.light ||= t.light;
    all.hearing += t.hearing;
    all.smell += t.smell;
    all.speak ||= t.speak;
  };
  for (const id of nodeIds(body)) {
    if (!sensed.has(id)) continue;
    const t = empty();
    for (const e of body.nodes[id]!.ends) {
      if (e.kind === "eye") t.eyes += 1;
      if (e.kind === "snout") t.smell += 1;
      if (e.contents !== undefined) tally(t, e.contents);
    }
    merge(t);
    if (t.hearing > 0) hearingAt.add(id);
    if (t.eyes > 0 || t.heat) viewpoints.push({ node: id, eyes: t.eyes, heat: t.heat });
  }
  for (const id of segmentIds(body)) {
    if (!sensed.has(id)) continue;
    const s = body.segments[id]!;
    const t = empty();
    tally(t, [...s.cavity, ...s.growths]);
    merge(t);
    if (t.hearing > 0) hearingAt.add(id).add(s.a).add(s.b);
  }
  return {
    viewpoints,
    sight: viewpoints.some((v) => v.eyes > 0),
    heat: viewpoints.some((v) => v.heat),
    echo: all.echo,
    deep: all.deep,
    electro: all.electro,
    light: all.light,
    hearing: all.hearing,
    hearingAt: [...hearingAt].sort((x, y) => x - y),
    smell: all.smell,
    speak: all.speak,
  };
}
