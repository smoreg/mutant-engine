/**
 * Grow a human, throw a dozen random mutations at it from a seed, and read what
 * the body can do now. Same seed, same creature: everything random goes through
 * the generator you hand in.
 *
 *   npx vite-node examples/01-mutate.ts [seed]
 */
import { applyMutation, bodyHash, derive, drawMutation, human, MUTATIONS, mutationLabel, summarize, LabRng } from "@mutant-engine/core";

const seed = Number(process.argv[2] ?? 7);
const rng = new LabRng(seed);
const body = human();
const before = summarize(derive(body));

for (let i = 0; i < 12; i++) {
  const m = drawMutation(MUTATIONS, rng, { body });
  if (m === null) continue;
  const landed = applyMutation(body, m, rng);
  console.log(`${landed === null ? "  missed" : "  landed"}  ${m.id} (${mutationLabel(m.id)})`);
}

const after = summarize(derive(body));
console.log(`\nseed ${seed} -> body ${bodyHash(body)}`);
for (const k of Object.keys(after)) {
  if (JSON.stringify(after[k]) !== JSON.stringify(before[k])) console.log(`  ${k}: ${JSON.stringify(before[k])} -> ${JSON.stringify(after[k])}`);
}
