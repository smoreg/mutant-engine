/**
 * The typical problems of mutants (decision 1323): every body of the sources
 * fights fifteen volleys of its own and rests three days fed, then `treatments`
 * reads it with its wounds. The table says how often each problem comes up,
 * how grave it is on average, how often a single cut of the operating room
 * eases or cures it, what it follows from and which cut comes first.
 *
 *   npm run sanity:problems -- random:100:1 abyss:100:1 abyss:60:500:40 spring:100:1000
 */
import { LabRng as Rng } from "../rng.js";
import { elapse, exert, liveTurn, newHarm, treatments, volleyEffort, type Body } from "../index.js";

/** A fight: fifteen turns of the body's own volley at a man. */
const FIGHT = 15;
/** Three days of the yard's rest, fed to the full. */
const REST = 72;

export interface ProblemRow {
  problem: string;
  bodies: number;
  severity: number;
  eased: number;
  cured: number;
  stones: number;
  causes: Map<string, number>;
  cuts: Map<string, number>;
  example: string;
}

/** The body after a fight and a fed rest, with its record of wounds. */
export function lived(body: Body, seed = 7): ReturnType<typeof newHarm> {
  const harm = newHarm(body);
  const rng = new Rng(seed);
  const vol = volleyEffort(body);
  for (let t = 0; t < FIGHT; t++) {
    exert(harm, vol);
    elapse(body, rng, { harm });
  }
  for (let t = 0; t < REST; t++) liveTurn({ body, harm }, rng, { food: Number.MAX_SAFE_INTEGER, rest: true });
  return harm;
}

export function problemTable(bodies: readonly { id: string; body: () => Body }[]): { rows: ProblemRow[]; total: number; dead: number } {
  const rows = new Map<string, ProblemRow>();
  let dead = 0;
  for (const b of bodies) {
    const body = b.body();
    const harm = lived(body);
    if (harm.dead !== null) {
      dead += 1;
      continue;
    }
    for (const { problem: p, remedies } of treatments(body, harm)) {
      const r = rows.get(p.id) ?? { problem: p.id, bodies: 0, severity: 0, eased: 0, cured: 0, stones: 0, causes: new Map(), cuts: new Map(), example: b.id };
      r.bodies += 1;
      r.severity += p.severity;
      if (remedies.length > 0) r.eased += 1;
      if (remedies.some((x) => x.cures)) r.cured += 1;
      if (p.rows.length > 0) r.stones += 1;
      if (p.cause !== null) r.causes.set(p.cause, (r.causes.get(p.cause) ?? 0) + 1);
      const top = remedies[0];
      if (top !== undefined) {
        const k = `${top.op.verb}: ${top.op.what.replace(/\d+/g, "").replace(/\s+/g, " ").trim()}`;
        r.cuts.set(k, (r.cuts.get(k) ?? 0) + 1);
      }
      rows.set(p.id, r);
    }
  }
  return { rows: [...rows.values()].sort((a, b) => b.bodies - a.bodies), total: bodies.length, dead };
}

function top(m: Map<string, number>, n = 3): string {
  return [...m]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => `${k} ×${v}`)
    .join("; ");
}

export function problemsTsv(t: { rows: ProblemRow[]; total: number }): string {
  const head = ["problem", "bodies", "share", "mean severity", "eased by one cut", "cured by one cut", "stone rows", "follows from", "first cut", "example"];
  return [head.join("\t"), ...t.rows.map((r) => [r.problem, r.bodies, (r.bodies / t.total).toFixed(2), (r.severity / r.bodies).toFixed(2), r.eased, r.cured, r.stones, top(r.causes), top(r.cuts), r.example].join("\t"))].join("\n");
}
