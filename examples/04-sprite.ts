/**
 * Draw a body to a PNG and an SVG file. The sprite and the graph share one
 * layout, so a part attaches in the same place in both.
 *
 *   npx vite-node examples/04-sprite.ts [beast] -> out/<beast>.png, out/<beast>.svg
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { BEASTS, bodyFromText } from "@mutant-engine/core";
import { framePng, renderPixels, silhouetteSvg } from "@mutant-engine/view";

const id = process.argv[2] ?? "centaur";
const beast = BEASTS.find((b) => b.id === id);
if (beast === undefined) throw new Error(`unknown beast ${id}`);
const body = bodyFromText(beast.fixture);

mkdirSync("out", { recursive: true });
writeFileSync(`out/${id}.png`, framePng(renderPixels(body, { px: 96 })));
writeFileSync(`out/${id}.svg`, silhouetteSvg(body));
console.log(`out/${id}.png, out/${id}.svg`);
