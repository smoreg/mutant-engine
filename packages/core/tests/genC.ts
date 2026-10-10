/**
 * Random bodies for the property tests of step C: the population of step A
 * plus the operations C adds - membranes on cycles, doubling of hanging
 * parts, wandering endings, organs into cavities and heads, covers. Step A's
 * `population` stays untouched so its tests keep seeing the same bodies.
 */
import { LabRng as Rng } from "../rng.js";
import { grow, human, organ, type Body, type CoverId, type MembraneKind, type OrganKind } from "../index.js";
import { randomOp, type OpChoice } from "./gen.js";

const MEMBRANE_KINDS: MembraneKind[] = ["wing", "sail", "fin", "gill", "hood", "net"];
const COVERS: CoverId[] = ["chitin", "scales", "slime", "suckers", "fur", "bark", "plates"];
const CAVITY_ORGANS: OrganKind[] = ["heart", "lungs", "stomach", "gut", "gland", "womb", "venomGland", "ganglion", "gutBrain"];
const HEAD_ORGANS: OrganKind[] = ["eye", "ear", "heatEye", "echo"];
const GROWTHS: OrganKind[] = ["spines", "skinGland", "bladder", "photophores", "hydra"];

export function randomOpC(rng: Rng): OpChoice {
  const roll = rng.next();
  if (roll < 0.05) return { op: "membrane", payload: { kind: rng.pick(MEMBRANE_KINDS) } };
  if (roll < 0.09) return { op: "double", payload: {} };
  if (roll < 0.12) return { op: "migrate", payload: {} };
  if (roll < 0.2) {
    const m = rng.next();
    if (m < 0.5) return { op: "organ", payload: { organ: organ(rng.pick(CAVITY_ORGANS)), mount: "cavity" } };
    if (m < 0.75) return { op: "organ", payload: { organ: organ(rng.pick(HEAD_ORGANS)), mount: "head" } };
    return { op: "organ", payload: { organ: organ(rng.pick(GROWTHS)), mount: "growth" } };
  }
  if (roll < 0.25) return { op: "cover", payload: { cover: rng.pick(COVERS) } };
  return randomOp(rng);
}

function randomBodyC(seed: number, ops: number, meat = 100_000): Body {
  const rng = new Rng(`c-${seed}`);
  const body = human(meat);
  for (let i = 0; i < ops; i++) {
    const c = randomOpC(rng);
    grow(body, c.op, c.payload, rng);
  }
  return body;
}

/** 500 bodies grown with the C operations too, 10..39 operations each. */
export function populationC(count = 500): Body[] {
  const out: Body[] = [];
  for (let seed = 1; seed <= count; seed++) out.push(randomBodyC(seed, 10 + (seed % 30)));
  return out;
}
