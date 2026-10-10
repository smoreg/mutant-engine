/**
 * The command line of the sanity stand: `npm run sanity:<probe|duels|report|expect> -- ...`.
 * The tools themselves are pure modules beside it; this file only reads arguments and files.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { crowd, matrix, share } from "./duels.js";
import { EXPECT, check, line } from "./expect.js";
import { probe, toTsv } from "./probe.js";
import { problemTable, problemsTsv } from "./problems.js";
import { fold, parse, summary, toTsv as findingsTsv } from "./sanity.js";
import { resolve } from "./source.js";

const OUT = "out/sanity";
/** Flags that take no value. */
const BOOL = new Set(["json", "threshold"]);

function args(argv: readonly string[]): { pos: string[]; flag: Map<string, string> } {
  const pos: string[] = [];
  const flag = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--") continue;
    if (a.startsWith("--")) {
      const next = argv[i + 1];
      if (!BOOL.has(a.slice(2)) && next !== undefined && !next.startsWith("--")) flag.set(a.slice(2), next), (i += 1);
      else flag.set(a.slice(2), "");
    } else pos.push(a);
  }
  return { pos, flag };
}

/** `--seeds 5..40` or `--seeds 5`: the first seed and how many. */
function seedRange(s: string | undefined, n: number): { first: number; seeds: number } {
  if (s === undefined || s === "") return { first: 1, seeds: n };
  const [a, b] = s.split("..");
  const first = Number(a);
  return { first, seeds: b === undefined || b === "" ? n : Number(b) - first + 1 };
}

const [cmd, ...rest] = process.argv.slice(2).filter((a) => a !== "--");
const { pos, flag } = args(rest);

switch (cmd) {
  case "probe": {
    if (pos.length === 0) throw new Error("usage: sanity:probe -- <source>... [--json]");
    const rows = pos.flatMap((src) => resolve(src).map((c) => probe(c.id, c.body())));
    console.log(flag.has("json") ? JSON.stringify(rows, null, 1) : toTsv(rows));
    break;
  }
  case "duels": {
    const range = seedRange(flag.get("seeds"), Number(flag.get("n") ?? 200));
    if (flag.has("matrix")) {
      console.log(matrix(flag.get("matrix")!.split(","), range));
      break;
    }
    const [a, b] = pos;
    if (a === undefined || b === undefined) throw new Error("usage: sanity:duels -- <A> <B> [--n 200] [--seeds 1..] [--threshold] | --matrix a,b,c");
    if (flag.has("threshold")) {
      const t = crowd(a, b, { seeds: flag.has("n") ? range.seeds : 30, first: range.first });
      console.log(`${a} to beat one ${b}: ${t.count ?? (t.blunt ? "never (no damage)" : "more than the cap")}\tprobes ${t.probes.map((p) => `${p.m}:${p.share.toFixed(2)}`).join(" ")}`);
      break;
    }
    const s = share(a, b, { ...range, n: Number(flag.get("na") ?? 1), m: Number(flag.get("mb") ?? 1) });
    console.log(["a", "b", "n", "m", "seeds", "first", "winsA", "winsB", "none", "share", "turns"].join("\t"));
    console.log([s.a, s.b, s.n, s.m, s.seeds, s.first, s.winsA, s.winsB, s.none, s.share.toFixed(3), s.turns].join("\t"));
    break;
  }
  case "report": {
    const files = (() => {
      try {
        return readdirSync(OUT).filter((f) => f.endsWith(".tsv") && f !== "summary.tsv");
      } catch {
        return [];
      }
    })();
    const rows = fold(files.flatMap((f) => parse(readFileSync(join(OUT, f), "utf8"))));
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, "summary.tsv"), findingsTsv(rows));
    console.log(summary(rows));
    console.log(`${files.length} files → ${OUT}/summary.tsv`);
    break;
  }
  case "problems": {
    if (pos.length === 0) throw new Error("usage: sanity:problems -- <source>...");
    const t = problemTable(pos.flatMap((src) => resolve(src).map((c) => ({ id: c.id, body: c.body }))));
    const tsv = problemsTsv(t);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, "problems.tsv"), tsv + "\n");
    console.log(tsv);
    console.log(`${t.total} bodies, ${t.dead} dead in the fight or the rest → ${OUT}/problems.tsv`);
    break;
  }
  case "expect": {
    const seeds = Number(flag.get("n") ?? 100);
    const verdicts = EXPECT.map((e) => check(e, seeds));
    for (const v of verdicts) console.log(line(v));
    const red = verdicts.filter((v) => !v.ok);
    const findings = red.map((v) =>
      [v.e.id, "бои", `${v.e.n}×${v.e.a} vs ${v.e.m}×${v.e.b}`, "share", v.got.share.toFixed(2), `${v.e.min}..${v.e.max}`, "high", v.e.rule, ""].join("\t"),
    );
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, "fights.tsv"), findings.map((f) => `${f}\n`).join(""));
    console.log(`green ${verdicts.length - red.length}, red ${red.length} → ${OUT}/fights.tsv`);
    break;
  }
  default:
    throw new Error("usage: cli.ts <probe|duels|report|expect> ...");
}
