/**
 * Separation, body-graph.md §6-7 and mind.md: a foreign brain leaves with its
 * territory. Every border segment is cut where the two claims meet: the piece
 * on the leaving side is `(claim(h, their end) + length - claim(owner, other
 * end)) / 2` short of the whole, rounded to the nearer integer, halves to the
 * side that stays. A cavity goes with the longer piece, on a tie with the side
 * that stays - unless a brain that owns one of the ends sits in it: the cavity
 * follows that brain (you, the leaving one, or the owner of the other end).
 *
 * After the cuts the body is its components: yours stays; the territory
 * becomes a body of its own with that brain as self; anything else that lost
 * its path to you leaves too, as in a plain cut. The preview is the same
 * computation on a clone.
 */
import type { Body, BodyNode, BrainRef, End, Membrane, Organ, Segment } from "./graph.js";
import { brainRefsIn, cloneBody, makeNode, makeSegment, newBody, otherEnd, refreshSegmentHp, sameRef, selfRef, setSelf, sortedIds, touch } from "./graph.js";
import { fateOf, type CutResult, type Fate } from "./cut.js";
import { fitCavity } from "./grow.js";
import { tearMembranes } from "./membrane.js";
import { components, heartsIn, type Part } from "./metrics.js";
import { mass } from "./parts.js";
import { claimOf, ownership, seizerOf, territoriesOf } from "./territory.js";

interface Separated {
  part: Part;
  fate: Fate;
  /** A body of its own when the part has a brain; null for meat and for a heart without a brain. */
  body: Body | null;
  /** Turns it lives on the blood it carried: `20 + mass / 2` when it has a brain and no heart. */
  lifetime: number | null;
  /** Wound faces of this part that bleed (it has a working heart): pieces of border segments and cut nodes. */
  bleeding: number[];
  /** Organs squeezed out of a cavity that no longer fit its piece. */
  evicted: Organ[];
}

export interface Separation {
  /** What stays with you, stumps included. */
  yours: Part;
  /** The territory, as a body with the separating brain as its self. */
  leaves: Separated;
  /** Other components that lost their path to you. */
  others: Separated[];
  /** Segments cut, ascending. */
  border: number[];
  /** Wound faces on your side that bleed. */
  bleeding: number[];
  /** 50 for the first border segment and 10 for each one beyond. */
  pain: number;
  /** Organs squeezed out of your pieces. */
  evicted: Organ[];
}

/** A brain without a heart lives on the blood it carried: 20 + mass / 2 turns. */
export function lifetimeWithoutHeart(m: number): number {
  return Math.floor(20 + m / 2);
}

/**
 * Elements that left a body, as a body of their own: enough for a layout, a
 * silhouette and a clock. A segment whose node stayed behind gets a stump, the
 * same fresh node of size 1 with a wound that a cut leaves on your side. The
 * pieces are copies; `nodes` and `segments` are left as they were.
 */
function bodyOfParts(nodes: readonly BodyNode[], segments: readonly Segment[]): Body {
  const b = newBody();
  let max = 0;
  for (const n of nodes) {
    b.nodes[n.id] = structuredClone(n);
    max = Math.max(max, n.id);
  }
  for (const s of segments) {
    b.segments[s.id] = structuredClone(s);
    max = Math.max(max, s.id);
  }
  b.nextId = max + 1;
  for (const id of sortedIds(b.segments)) {
    const s = b.segments[id]!;
    for (const end of ["a", "b"] as const) {
      if (b.nodes[s[end]] !== undefined) continue;
      const stump = makeNode(b.nextId++, 1, { wound: 20 });
      b.nodes[stump.id] = stump;
      s[end] = stump.id;
    }
  }
  b.self = { node: nodes[0]?.id ?? 0 };
  b.meat = mass(b);
  return b;
}

/** One part a cut took off: its body, what it is, and the turns it has on the blood it carried. */
interface CutOff {
  body: Body;
  fate: Fate;
  /** `lifetimeWithoutHeart` for a brain that left without a heart, as a separated part has it; null otherwise. */
  lifetime: number | null;
}

/** Every part a cut took off, as a body of its own, in the order of `others` (decision 1232). */
export function cutOffBodies(result: CutResult): CutOff[] {
  const out: CutOff[] = [];
  for (const { part, fate } of result.others) {
    const nodes = result.removed.nodes.filter((n) => part.nodes.includes(n.id));
    const segments = result.removed.segments.filter((s) => part.segments.includes(s.id));
    if (nodes.length === 0) continue;
    const body = bodyOfParts(nodes, segments);
    out.push({ body, fate, lifetime: fate === "brainOnly" ? lifetimeWithoutHeart(mass(body)) : null });
  }
  return out;
}

/** What a separation would do, without doing it. */
export function separatePreview(body: Body, ref: BrainRef): Separation | null {
  return separate(cloneBody(body), ref);
}

const byId = (x: number, y: number): number => x - y;

function firstBrainIn(body: Body, part: Part): BrainRef | undefined {
  for (const id of [...part.nodes, ...part.segments].sort(byId)) {
    const ref = brainRefsIn(body, id)[0];
    if (ref !== undefined) return ref;
  }
  return undefined;
}

/**
 * Cuts the brain's territory off along its border. Null when there is nothing
 * to cut: the brain is you, dead, has no territory, or has swallowed yours.
 */
export function separate(body: Body, ref: BrainRef): Separation | null {
  const own = ownership(body);
  const h = own.brains.findIndex((b) => sameRef(b.ref, ref));
  if (h < 0 || h === own.self || own.self < 0) return null;
  if (seizerOf(body, own) === h) return null;
  const terr = territoriesOf(body, own)[h]!;
  if (terr.nodes.length === 0) return null;

  const meatBefore = body.meat;
  const massBefore = mass(body);
  const me = selfRef(body)!;
  const inside = new Set(terr.nodes);
  let leaving: BrainRef = own.brains[h]!.ref;
  const cutNodes: number[] = [];
  const faces = new Set<number>();
  const theirPieces: number[] = [];
  const evictedMine: Organ[] = [];

  const stump = (): number => {
    const n = makeNode(body.nextId++, 1, { wound: 20 });
    body.nodes[n.id] = n;
    return n.id;
  };

  for (const sid of terr.border) {
    const s = body.segments[sid]!;
    const their = inside.has(s.a) ? s.a : s.b;
    const mine = otherEnd(s, their);
    const theirEnd: End = s.a === their ? "a" : "b";
    const mineEnd: End = theirEnd === "a" ? "b" : "a";
    const owner = own.owner.get(mine)!;
    const L = s.length;
    const t = (claimOf(own, h, their) + L - claimOf(own, owner, mine)) / 2;
    let mineLen = Math.min(L, Math.max(0, Math.round(t)));
    // A brain in the cavity that owns an end of the segment keeps the cavity on its side: you, or the owner of the other end.
    const ownerRef = own.brains[owner]!.ref;
    const holdsMine = ("segment" in me && me.segment === sid) || ("segment" in ownerRef && ownerRef.segment === sid);
    const holdsLeaving = "segment" in leaving && leaving.segment === sid;
    let cavityTheirs: boolean;
    if (holdsMine) {
      cavityTheirs = false;
      mineLen = Math.max(mineLen, 1);
    } else if (holdsLeaving) {
      cavityTheirs = true;
      mineLen = Math.min(mineLen, L - 1);
    } else cavityTheirs = L - mineLen > mineLen;

    if (mineLen === 0) {
      s[mineEnd] = stump();
      cutNodes.push(mine);
      faces.add(sid).add(mine);
    } else if (mineLen === L) {
      s[theirEnd] = stump();
      cutNodes.push(their);
      faces.add(sid).add(their);
    } else {
      const stumpMine = stump();
      const stumpTheirs = stump();
      const spec = { kind: s.kind, length: L - mineLen, girth: s.girth, cover: s.cover, cavity: cavityTheirs ? s.cavity : [], breakPlane: false };
      const piece =
        theirEnd === "b" ? makeSegment(body.nextId++, stumpTheirs, their, spec) : makeSegment(body.nextId++, their, stumpTheirs, spec);
      body.segments[piece.id] = piece;
      s[theirEnd] = stumpMine;
      s.length = mineLen;
      refreshSegmentHp(s);
      faces.add(sid).add(piece.id);
      if (cavityTheirs) {
        s.cavity = [];
        theirPieces.push(piece.id);
        if (holdsLeaving) leaving = { segment: piece.id, slot: (leaving as { slot: number }).slot };
      } else evictedMine.push(...fitCavity(body, s));
    }
  }
  for (const n of cutNodes) body.nodes[n]!.wound = 20;
  // A membrane on the border is torn; one whose cycle lies whole in a part goes with that part.
  tearMembranes(body);

  const parts = components(body);
  const myNode = "node" in me ? me.node : body.segments[me.segment]!.a;
  const leavingNode = "node" in leaving ? leaving.node : body.segments[leaving.segment]!.a;
  const yoursIdx = parts.findIndex((p) => p.nodes.includes(myNode));
  const leavesIdx = parts.findIndex((p) => p.nodes.includes(leavingNode));
  const facesOf = (part: Part): number[] => [...part.nodes, ...part.segments].filter((id) => faces.has(id)).sort(byId);

  const detach = (part: Part, self: BrainRef | undefined): Separated => {
    const fate = fateOf(body, part);
    const bleedingHere = heartsIn(body, part) ? facesOf(part) : [];
    const nodes: Record<number, BodyNode> = {};
    const segments: Record<number, Segment> = {};
    const membranes: Record<number, Membrane> = {};
    for (const id of part.nodes) {
      nodes[id] = body.nodes[id]!;
      delete body.nodes[id];
    }
    for (const id of part.segments) {
      segments[id] = body.segments[id]!;
      delete body.segments[id];
    }
    for (const id of sortedIds(body.membranes)) {
      const m = body.membranes[id]!;
      if (m.cycle.every((s) => segments[s] !== undefined)) {
        membranes[id] = m;
        delete body.membranes[id];
      }
    }
    if (self === undefined) return { part, fate, body: null, lifetime: null, bleeding: bleedingHere, evicted: [] };
    const own: Body = { nodes, segments, membranes, self: { node: 0 }, meat: 0, nextId: body.nextId, version: 0 };
    setSelf(own, self);
    const evicted: Organ[] = [];
    for (const id of theirPieces) if (segments[id] !== undefined) evicted.push(...fitCavity(own, segments[id]!));
    own.meat = mass(own);
    return {
      part,
      fate,
      body: own,
      lifetime: fate === "brainOnly" ? lifetimeWithoutHeart(own.meat) : null,
      bleeding: heartsIn(own, part) ? facesOf(part) : [],
      evicted,
    };
  };

  const leaves = detach(parts[leavesIdx]!, leaving);
  const others: Separated[] = [];
  parts.forEach((part, i) => {
    if (i === yoursIdx || i === leavesIdx) return;
    others.push(detach(part, firstBrainIn(body, part)));
  });
  const yours = parts[yoursIdx]!;
  const bleeding = heartsIn(body, yours) ? facesOf(yours) : [];
  body.meat = meatBefore - (massBefore - mass(body));
  touch(body);
  return {
    yours,
    leaves,
    others,
    border: terr.border,
    bleeding,
    pain: 50 + 10 * (terr.border.length - 1),
    evicted: evictedMine,
  };
}
