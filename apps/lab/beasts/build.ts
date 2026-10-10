/**
 * Builds the bestiary check: twenty beasts, each a form drawn by hand as a
 * fixture and measured against the shape wanted; the abyss alone on N seeds;
 * the deficit and the additions that close it (additions.ts). One page,
 * out/beasts.html.
 *
 *   npm run beasts                       -> out/beasts.html (2000 seeds x 100 strikes)
 *   npm run beasts -- --seeds=200 --strikes=60
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  derive,
  summarize,
  type Body,
  type SummaryValue,
  features,
  fixtureBody,
  similarity,
  type Features,
  type Similarity,
  BEASTS,
  type Beast,
} from "@mutant-engine/core";
import { silhouetteSvg } from "@mutant-engine/view";
import { ADDITIONS, NEEDS, additionById, type Addition } from "./additions.js";
import { randomAssembly, type RandomBeast, type RandomOptions } from "./measure.js";
import { renderBeasts } from "./html.js";

interface BodyReport {
  svg: string;
  features: Features;
  similarity: Similarity;
  summary: Record<string, SummaryValue>;
  mass: number;
  ceiling: number;
  nodes: number;
  segments: number;
}

export interface BeastReport {
  beast: Beast;
  fixture: BodyReport;
  /** "да" - every trait and count of the form within tolerance; "почти" - one key off; "нет" otherwise. */
  verdict: "да" | "почти" | "нет";
  needs: Addition[];
  random: RandomBeast;
}

export interface BeastsData {
  beasts: BeastReport[];
  additions: readonly Addition[];
  options: RandomOptions;
  /** Milliseconds: the abyss runs, and everything. */
  ms: { random: number; total: number };
}

const SVG_SIZE = 250;

function bodyReport(body: Body, beast: Beast): BodyReport {
  const d = derive(body);
  const f = features(body);
  return {
    svg: silhouetteSvg(body, { size: SVG_SIZE }),
    features: f,
    similarity: similarity(beast.want, f),
    summary: summarize(d),
    mass: Math.round(d.budgets.mass * 10) / 10,
    ceiling: d.budgets.ceiling,
    nodes: Object.keys(body.nodes).length,
    segments: Object.keys(body.segments).length,
  };
}

function verdictOf(sim: Similarity): BeastReport["verdict"] {
  if (sim.strict) return "да";
  if (sim.off.length <= 1) return "почти";
  return "нет";
}

const DEFAULT_RANDOM: RandomOptions = { seeds: 2000, strikes: 100 };

export function beastsData(opts: Partial<RandomOptions> = {}): BeastsData {
  const t0 = performance.now();
  const options: RandomOptions = { ...DEFAULT_RANDOM, ...opts };
  const random = randomAssembly(BEASTS, options);
  const beasts = BEASTS.map((beast, i): BeastReport => {
    const fx = bodyReport(fixtureBody(beast), beast);
    return {
      beast,
      fixture: fx,
      verdict: verdictOf(fx.similarity),
      needs: (NEEDS[beast.id] ?? []).map(additionById),
      random: random.beasts[i]!,
    };
  });
  return { beasts, additions: ADDITIONS, options, ms: { random: random.ms, total: performance.now() - t0 } };
}

interface BeastsBuild {
  path: string;
  bytes: number;
  data: BeastsData;
}

export function buildBeasts(outPath: string, opts: Partial<RandomOptions> & { data?: BeastsData } = {}): BeastsBuild {
  const { data: given, ...rest } = opts;
  const data = given ?? beastsData(rest);
  const html = renderBeasts(data);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html, "utf8");
  return { path: outPath, bytes: Buffer.byteLength(html), data };
}

if (process.env.VITEST === undefined) {
  const args = process.argv.slice(2);
  const num = (name: string): number | undefined => {
    const a = args.find((x) => x.startsWith(`--${name}=`));
    if (a === undefined) return undefined;
    const n = Number(a.slice(name.length + 3));
    return Number.isInteger(n) && n > 0 ? n : undefined;
  };
  const opts: Partial<RandomOptions> = {};
  const seeds = num("seeds");
  const strikes = num("strikes");
  if (seeds !== undefined) opts.seeds = seeds;
  if (strikes !== undefined) opts.strikes = strikes;
  const r = buildBeasts(resolve("out/beasts.html"), opts);
  console.log(`${r.path}: ${(r.bytes / 1024).toFixed(0)} KB; abyss ${(r.data.ms.random / 1000).toFixed(1)} s, all ${(r.data.ms.total / 1000).toFixed(1)} s`);
  for (const b of r.data.beasts) {
    const rd = b.random;
    console.log(
      `  ${b.beast.ru.padEnd(22)} ${b.verdict.padEnd(5)} сходство ${b.fixture.similarity.score.toFixed(2)} [${b.fixture.similarity.off.join(",")}] | случай: ¾ черт ${(rd.peakLoose.share * 100).toFixed(1)}% @${rd.peakLoose.strikes} (когда-либо ${(rd.everLoose * 100).toFixed(1)}%), целиком ${(rd.everStrict * 100).toFixed(2)}%`,
    );
  }
}
