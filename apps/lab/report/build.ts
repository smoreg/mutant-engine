/**
 * Builds the atlas of mutations: every number computed from the model and
 * its tables (data.ts), laid out as one page (html.ts).
 *
 *   npm run report                 -> out/mutations-report.html
 *                                     a fragment: <title>, the fonts link, <style>, the markup
 *   npm run report:reports         -> out/mutation-atlas.html
 *                                     a full document, system fonts, light theme with a dark state
 *   npm run report -- --seeds=20   -> a quick build on fewer seeds
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { reportData, type ReportData, type ReportOptions } from "./data.js";
import { renderReport, type Variant } from "./html.js";

interface ReportBuild {
  path: string;
  bytes: number;
  ms: number;
  data: ReportData;
}

const REPORTS_PATH = resolve("out", "mutation-atlas.html");

type BuildOptions = Partial<ReportOptions> & {
  variant?: Variant;
  /** Numbers computed earlier, to write a second variant without counting twice. */
  data?: ReportData;
};

export function buildReport(outPath: string, opts: BuildOptions = {}): ReportBuild {
  const t0 = performance.now();
  const { variant = "fragment", data: given, ...rest } = opts;
  const data = given ?? reportData(rest);
  const html = renderReport(data, variant);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html, "utf8");
  return { path: outPath, bytes: Buffer.byteLength(html), ms: performance.now() - t0, data };
}

if (process.env.VITEST === undefined) {
  const args = process.argv.slice(2);
  const reports = args.includes("--reports");
  const seedsArg = args.find((a) => a.startsWith("--seeds="));
  const opts: BuildOptions = { variant: reports ? "document" : "fragment" };
  if (seedsArg !== undefined) {
    const seeds = Number(seedsArg.slice("--seeds=".length));
    if (Number.isInteger(seeds) && seeds > 0) Object.assign(opts, { seeds, humanSeeds: seeds, typicalSeeds: seeds, thumbnails: Math.min(12, seeds) });
  }
  const out = reports ? REPORTS_PATH : resolve("out/mutations-report.html");
  const r = buildReport(out, opts);
  const p = r.data.problems;
  console.log(`${r.path}: ${(r.bytes / 1024).toFixed(0)} KB in ${(r.ms / 1000).toFixed(1)} s`);
  console.log(`  rows ${r.data.entries.length}, never on the human ${p.neverOnHuman.length}, orphans ${p.orphans.length}, never drawn ${p.neverDrawn.length}, never landed ${p.neverLanded.length}`);
}
