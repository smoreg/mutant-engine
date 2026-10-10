/** The sanity stand (docs/tasks/sanity/README.md, «Стенд»): probe, duels and the findings report. */
import { LabRng as Rng } from "../rng.js";
import { describe, expect, it } from "vitest";
import { derive } from "../index.js";
import { LEFT, runOne } from "../bench/bench.js";
import { share } from "../bench/duels.js";
import { flatten, probe, toTsv } from "../bench/probe.js";
import { fold, parse, summary } from "../bench/sanity.js";
import { one, resolve } from "../bench/source.js";

describe("probe", () => {
  it("gives one row per body with every field of derive, the same for the same seed", () => {
    const rows = () => ["human", "beast:wolf", "random:3:7", "row:forking:2", "abyss:2:5:4"].flatMap((s) => resolve(s).map((c) => probe(c.id, c.body())));
    const a = rows();
    expect(a).toHaveLength(1 + 1 + 3 + 1 + 2);
    expect(toTsv(a)).toBe(toTsv(rows()));
    const lines = toTsv(a).split("\n");
    expect(lines).toHaveLength(a.length + 1);
    const cols = lines[0]!.split("\t");
    for (const l of lines) expect(l.split("\t")).toHaveLength(cols.length);
    const wolf = one("beast:wolf").body();
    for (const key of Object.keys(flatten(derive(wolf), "", {}))) expect(cols, key).toContain(key);
    expect(cols).toEqual(expect.arrayContaining(["id", "hash", "graph", "strikes.list", "budgets.alien"]));
  });
});

describe("duels", () => {
  it("on one seed is the plain runBattle of the bench", () => {
    const s = share("beast:wolf", "human", { seeds: 1, first: 4 });
    const f = runOne([one("beast:wolf").body()], [one("human").body()], new Rng(4));
    expect(s.winsA).toBe(f.winner === LEFT ? 1 : 0);
  });
});

describe("report", () => {
  it("folds one (rule, stat) into one line with the worst severity and sorts high to low", () => {
    const text = [
      "id\tфасет\tтело\tстат\tесть\tожидалось\tтяжесть\tправило\tпредложение",
      "A1\tx\th\treach\t1\t≥2\tlow\tдлина растит досягаемость\t",
      "A2\tx\th\treach\t1\t≥2\thigh\tдлина растит досягаемость\t",
      "B1\tx\th\tspeed\t0\t>0\tmid\tчем толкается, то и движет\t",
      "C1\tx\th\treach\t0\t1\tlow\tдругое правило\t",
      "",
    ].join("\n");
    const rows = fold(parse(text));
    expect(rows.map((r) => [r.id, r.тяжесть, r.n])).toEqual([
      ["A2", "high", 2],
      ["B1", "mid", 1],
      ["C1", "low", 1],
    ]);
    expect(rows[0]!.ids).toBe("A1,A2");
    expect(summary(rows, 40).split("\n").length).toBeLessThanOrEqual(40);
  });
});
