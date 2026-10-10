/**
 * A body after many mutations, what is wrong with it, and which cuts help:
 * every remedy is tried on a copy first and offered only if it does.
 *
 *   npx vite-node examples/03-diagnose.ts [seed]
 */
import { applyMutation, diagnose, drawMutation, human, MUTATIONS, treatments, LabRng } from "@mutant-engine/core";

const rng = new LabRng(Number(process.argv[2] ?? 3));
const body = human();
for (let i = 0; i < 30; i++) {
  const m = drawMutation(MUTATIONS, rng, { body });
  if (m !== null) applyMutation(body, m, rng);
}

const problems = diagnose(body);
if (problems.length === 0) console.log("nothing wrong");
for (const p of problems) console.log(`${p.severity.toFixed(2)}  ${p.text.en}${p.cause === null ? "" : `  (because of: ${p.cause})`}`);

for (const t of treatments(body)) {
  for (const r of t.remedies) console.log(`  ${t.problem.id}: ${r.op.verb} ${r.op.what} -> ${r.cures ? "cures" : `eases by ${r.gain.toFixed(2)}`}`);
}
