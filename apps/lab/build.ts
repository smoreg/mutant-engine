/**
 * Builds the lab into one file, so out/lab.html opens with a double click,
 * without a server and without a single outside link.
 *
 *   npm run lab            -> out/lab.html
 *
 * The building itself is `bundle.ts`, which the colosseum calls too.
 */
import { resolve } from "node:path";
import { buildPage, type PageBuild } from "./bundle.js";

type LabBuild = PageBuild;

export async function buildLab(outPath: string): Promise<LabBuild> {
  return buildPage({ root: import.meta.dirname, name: "lab", outPath });
}

if (process.env.VITEST === undefined) {
  const result = await buildLab(resolve("out/lab.html"));
  console.log(`${result.path}: ${(result.bytes / 1024).toFixed(0)} KB in ${result.ms.toFixed(0)} ms`);
}
