/**
 * Two creatures of the bestiary on one patch of sand, a hundred times over:
 * how often the left one wins. Bodies come from text fixtures; the fight is
 * turn-based and deterministic per seed.
 *
 *   npx vite-node examples/02-fight.ts [left] [right]
 */
import { AIMS, BEASTS, aimPolicy, bodyFromText, runBattle, LabRng, type Body } from "@mutant-engine/core";

const [leftId = "bear", rightId = "wolf"] = process.argv.slice(2);
function beast(id: string): Body {
  const b = BEASTS.find((x) => x.id === id);
  if (b === undefined) throw new Error(`unknown beast ${id}; try one of: ${BEASTS.map((x) => x.id).join(", ")}`);
  return bodyFromText(b.fixture);
}

const policy = aimPolicy(AIMS.brute);
let wins = 0;
const seeds = 100;
for (let seed = 1; seed <= seeds; seed++) {
  const r = runBattle(
    {
      fighters: [
        { id: "left", side: "left", body: beast(leftId), policy },
        { id: "right", side: "right", body: beast(rightId), policy },
      ],
    },
    new LabRng(seed),
  );
  if (r.winner === "left") wins++;
}
console.log(`${leftId} beats ${rightId} in ${wins} of ${seeds} fights`);
