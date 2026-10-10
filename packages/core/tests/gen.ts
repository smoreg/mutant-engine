/**
 * Random bodies for property tests: a human grown by random operations.
 * The op mix is arbitrary but fixed, so every test that says "500 random
 * bodies" sees the same population for the same seeds.
 */
import { LabRng as Rng } from "../rng.js";
import {
  apply,
  derive,
  grow,
  targets,
  human,
  organ,
  type Body,
  type CoverId,
  type Op,
  type OrganKind,
  type Payload,
  type SegmentKind,
} from "../index.js";

const LIMB_KINDS: SegmentKind[] = ["arm", "leg", "tentacle", "tail"];
const COVERS: CoverId[] = ["skin", "chitin", "scales", "slime", "suckers"];
const LIMB_ENDS: OrganKind[] = [
  "hand", "pincer", "claw", "hook", "sucker", "mouth", "sting", "foot", "hoof", "pseudopod", "snout",
];

/** The operations of step C weigh 0 here so the population of step A stays the same; genC.ts draws them. */
const OP_WEIGHTS: Record<Op, number> = {
  sprout: 5,
  joint: 2,
  branch: 1,
  rebirth: 2,
  thicken: 1,
  thin: 1,
  stretch: 2,
  enlarge: 2,
  fusion: 1,
  growth: 1,
  necrosis: 1,
  membrane: 0,
  double: 0,
  migrate: 0,
  organ: 0,
  resize: 0,
  cover: 0,
  bloat: 0,
  engulf: 0,
  sink: 0,
  split: 0,
  merge: 0,
  flesh: 0,
  shift: 0,
};

export type OpChoice = { [K in Op]: { op: K; payload: Payload<K> } }[Op];

function randomLimb(rng: Rng) {
  return {
    kind: rng.pick(LIMB_KINDS),
    length: rng.int(1, 4),
    girth: rng.int(1, 2),
    cover: rng.pick(COVERS),
  };
}

export function randomOp(rng: Rng): OpChoice {
  const op = rng.weighted(OP_WEIGHTS);
  switch (op) {
    case "sprout": {
      const roll = rng.next();
      if (roll < 0.15) {
        return { op, payload: { kind: "stalk", length: rng.int(1, 2), girth: 1, cover: "skin", ending: organ("eye") } };
      }
      if (roll < 0.25) {
        return {
          op,
          payload: { kind: "neck", length: 1, girth: 1, cover: "skin", ending: organ("head", [organ("eye"), organ("jaw")]) },
        };
      }
      return { op, payload: { ...randomLimb(rng), ending: organ(rng.pick(LIMB_ENDS)) } };
    }
    case "joint": {
      const roll = rng.next();
      const ending = roll < 0.3 ? organ("mouth") : roll < 0.5 ? organ("eye") : null;
      return { op, payload: { ending } };
    }
    case "branch":
      return { op, payload: { kind: rng.pick(["arm", "tentacle"] as const), length: rng.int(1, 2), girth: 1, cover: rng.pick(COVERS) } };
    case "rebirth": {
      const ending = rng.next() < 0.1 ? organ("head", [organ("eye"), organ("jaw")]) : organ(rng.pick(LIMB_ENDS));
      return { op, payload: { ending } };
    }
    case "stretch":
      return { op, payload: { delta: rng.next() < 0.6 ? 1 : -1 } };
    case "resize":
      return { op, payload: { kind: "hand", size: rng.next() < 0.5 ? "huge" : "small" } };
    case "thicken":
    case "thin":
    case "enlarge":
    case "fusion":
    case "growth":
    case "necrosis":
    case "double":
    case "migrate":
    case "bloat":
    case "engulf":
    case "sink":
    case "split":
    case "merge":
    case "flesh":
    case "shift":
      return { op, payload: {} };
    case "membrane":
      return { op, payload: { kind: "wing" } };
    case "organ":
      return { op, payload: { organ: organ("gland"), mount: "cavity" } };
    case "cover":
      return { op, payload: { cover: "chitin" } };
  }
}

/**
 * Human with plenty of meat, grown by `ops` random operations. No row of the
 * catalog leaves a body with nothing to breathe with, so a body the operations
 * stripped of every lung, gill and pore gets lungs in the first cavity with
 * room, or pores on the first segment that takes them (finding S-life-01).
 * Drawn after the operations and without the rng: the bodies that breathed
 * are the same bodies as before. `breathe: false` leaves them stripped: the
 * tests of a body that draws nothing take their bodies from there.
 */
export function randomBody(seed: number, ops: number, meat = 100_000, opts: { breathe?: boolean } = {}): Body {
  const rng = new Rng(seed);
  const body = human(meat);
  for (let i = 0; i < ops; i++) {
    const c = randomOp(rng);
    grow(body, c.op, c.payload, rng);
  }
  if (opts.breathe !== false && derive(body).breath.media.length === 0) {
    for (const payload of [{ organ: organ("lungs"), mount: "cavity" }, { organ: organ("pores"), mount: "growth" }] as const) {
      const at = targets(body, "organ", payload)[0];
      if (at === undefined) continue;
      apply(body, "organ", payload, at.target);
      break;
    }
  }
  return body;
}

/** The standard population: 500 bodies, 10..39 operations each. */
export function population(count = 500): Body[] {
  const bodies: Body[] = [];
  for (let seed = 1; seed <= count; seed++) bodies.push(randomBody(seed, 10 + (seed % 30)));
  return bodies;
}
