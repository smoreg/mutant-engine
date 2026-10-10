/**
 * A stable fingerprint of a body: FNV-1a over a canonical serialisation that
 * walks nodes, segments and membranes by ascending id. Two bodies with the
 * same ids and the same state hash the same however they were built.
 * `version` is a cache key and stays out of the hash.
 */
import type { Body, BodyNode, Membrane, Organ, Segment } from "./graph.js";
import { selfRef, sortedIds } from "./graph.js";
import { SIZE_MARKS, sizeOf } from "./sizes.js";
import { flankPlace, samePlace, workedPlace } from "./flank.js";

function organText(o: Organ): string {
  const inner = o.contents ? `(${o.contents.map(organText).join(",")})` : "";
  const sway = o.sway ? `!${o.sway}` : "";
  const wander = o.wander ? `~${o.wander}` : "";
  return `${o.kind}${SIZE_MARKS[sizeOf(o)]}@${o.instability}${sway}${wander}${inner}`;
}

function nodeText(n: BodyNode): string {
  // What a fusion brought is written only when there is one, so every body without it hashes as it did.
  const fused = n.fused === undefined ? "" : `:J${n.fused.map((g) => g.join(",")).join(";")}`;
  return `N${n.id}:${n.size}:${n.hp}/${n.hpMax}:${n.wound}:${n.ischemia}:${n.bait ? 1 : 0}${fused}[${n.ends.map(organText).join(",")}]`;
}

function segmentText(s: Segment, body?: Body): string {
  // A flank's place goes in only when it is not the one its node gives it, so every body drawn before places were data hashes as it did.
  const place = body === undefined || s.kind !== "flank" ? undefined : flankPlace(body, s.id);
  const own = place !== undefined && !samePlace(place, workedPlace(body!, s.id)) ? `:P${place.host}/${place.t}/${place.side}` : "";
  return `S${s.id}${own}:${s.a}-${s.b}:${s.kind}:${s.length}/${s.girth}:${s.cover}:${s.hp}/${s.hpMax}:${s.bleed}:${s.pain}:${s.breakPlane ? 1 : 0}:${s.wound}:${s.ischemia}{${s.cavity.map(organText).join(",")}}[${s.growths.map(organText).join(",")}]`;
}

function membraneText(m: Membrane): string {
  return `M${m.id}:${m.kind}:${m.cycle.join(",")}:${m.area}`;
}

/** `self` as the brain it resolves to, so that `{node: 1}` and `{node: 1, end: 0}` are one state. */
function selfText(body: Body): string {
  const ref = selfRef(body);
  if (ref === undefined) return "node" in body.self ? `n${body.self.node}` : `s${body.self.segment}`;
  return "node" in ref ? `n${ref.node}.${ref.end}` : `s${ref.segment}.${ref.slot}`;
}

function serializeBody(body: Body): string {
  const out: string[] = [];
  out.push(`meat=${body.meat};self=${selfText(body)};next=${body.nextId}`);
  for (const id of sortedIds(body.nodes)) out.push(nodeText(body.nodes[id]!));
  for (const id of sortedIds(body.segments)) out.push(segmentText(body.segments[id]!, body));
  for (const id of sortedIds(body.membranes)) out.push(membraneText(body.membranes[id]!));
  // Parts on their way back are state too: two bodies that differ only in what regrows are not one body.
  for (const r of body.regrowth ?? []) {
    const part = [...r.part.nodes.map(nodeText), ...r.part.segments.map((s) => segmentText(s)), ...r.part.membranes.map(membraneText)];
    out.push(`R${r.at}:${r.turns}:${r.copies}{${part.join("|")}}`);
  }
  // So are the covers on the move and the tumours' clock: they decide what the body looks like in thirty turns.
  for (const f of body.fronts ?? []) out.push(`F${f.cover}:${f.turns}`);
  if (body.pressure !== undefined) out.push(`P${body.pressure}`);
  // What the body ate pulls its next mutation: written only when there is some, so every other body hashes as it did.
  for (const k of Object.keys(body.eaten ?? {}).sort()) out.push(`E${k}:${body.eaten![k as keyof typeof body.eaten]}`);
  return out.join("\n");
}

function fnv1a32(s: string, offset: number): number {
  let h = offset >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 16 hex digits: two independent FNV-1a 32-bit runs over the serialisation. */
export function bodyHash(body: Body): string {
  const text = serializeBody(body);
  const a = fnv1a32(text, 0x811c9dc5);
  const b = fnv1a32(text, 0x50c5d1f);
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}
