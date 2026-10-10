import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FAMILIES, bodyHash, human, mass, skeletonCeiling, MUTATIONS } from "@mutant-engine/core";
import { grow, sampleSeed } from "../../stats.js";
import { buildReport } from "../../report/build.js";
import { drawShare, reportData, type ReportData } from "../../report/data.js";
import { PALETTES, contrast, renderReport, tokenizeSvg } from "../../report/html.js";

const SEEDS = 12;
const OPTS = { seeds: SEEDS, humanSeeds: SEEDS, typicalSeeds: SEEDS, thumbnails: 6 };

let cached: ReportData | null = null;
function data(): ReportData {
  cached ??= reportData(OPTS);
  return cached;
}

describe("the atlas of mutations", () => {
  it("builds: every mutation of the catalog in 18 families, a fragment with the fonts link and nothing else outside", () => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-"));
    try {
      const out = join(dir, "mutations-report.html");
      const t0 = performance.now();
      const r = buildReport(out, { ...OPTS, data: data() });
      const ms = performance.now() - t0;
      const html = readFileSync(out, "utf8");
      expect(r.bytes).toBe(statSync(out).size);
      expect(html.startsWith("<title>Атлас мутаций mutant-engine</title>")).toBe(true);
      expect(html).not.toContain("<!doctype");
      expect(html).not.toMatch(/<(html|head|body)[\s>]/);
      expect(html.match(/<article class="mut"/g)).toHaveLength(MUTATIONS.length);
      expect(html.match(/<section class="family"/g)).toHaveLength(18);
      expect(html.match(/<h2 /g)).toHaveLength(6);
      for (const m of MUTATIONS) expect(html, m.id).toContain(`id="m-${m.id}"`);
      for (const f of FAMILIES) expect(html, f).toContain(`id="f-${f}"`);
      // The only outside reference is the fonts stylesheet; svg namespaces are not links.
      const links = html.match(/https?:\/\/[^"'\s)]+/g) ?? [];
      const outside = links.filter((l) => !l.startsWith("https://fonts.googleapis.com/") && !l.startsWith("http://www.w3.org/2000/svg"));
      expect(outside).toEqual([]);
      expect(html).toMatch(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\//);
      expect(html).toContain("background:var(--ink-0)");
      expect(html).toContain("--ink-0:#0b0a09");
      expect(html).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
      expect(html.length).toBeLessThanOrEqual(4 * 1024 * 1024);
      console.log(`atlas: ${(r.bytes / 1024).toFixed(0)} KB, render ${ms.toFixed(0)} ms, numbers ${(data().ms / 1000).toFixed(1)} s`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("population numbers are the lab's statistics on the same seeds", () => {
    const d = data();
    expect(d.populations.strikes).toEqual([10, 30, 60]);
    expect(d.populations.cells).toHaveLength(6);
    for (const cell of d.populations.cells) {
      expect(cell.samples).toHaveLength(SEEDS);
      for (const s of cell.samples) {
        expect(s).toEqual(sampleSeed({ seeds: SEEDS, mutations: cell.strikes, source: "abyss" }, cell.spread, s.seed));
        expect(s.vitals).toEqual({ noHeart: false, noBrain: false, noBreath: false });
      }
    }
    // The typical bodies of the catalog are the population's bodies at twenty strikes.
    const twenty = grow({ seeds: SEEDS, mutations: 20, source: "abyss" }, true, 3);
    // Since step I the ceiling is the body's own: the skeleton's plus what its bloated flesh holds.
    expect(mass(twenty)).toBeLessThanOrEqual(skeletonCeiling(twenty) + 1e-9);
    expect(d.options.typicalStrikes).toBe(20);
    for (const t of d.populations.thumbnails) expect(bodyHash(grow({ seeds: SEEDS, mutations: 30, source: "abyss" }, true, t.seed))).toBe(t.sample.hash);
    // A trajectory ends at the sample's mass.
    for (const t of d.populations.trajectories) {
      expect(t.masses).toHaveLength(60);
      const last = d.populations.cells.find((c) => c.strikes === 60 && c.spread === t.spread)!.samples.find((s) => s.seed === t.seed)!;
      expect(t.masses[59]).toBeCloseTo(last.mass, 2);
    }
  });

  it("catalog rows: every row measured, draw shares sum to one, the human numbers hold", () => {
    const d = data();
    expect(d.entries).toHaveLength(MUTATIONS.length);
    expect(d.families).toHaveLength(18);
    let total = 0;
    for (const e of d.entries) {
      total += e.drawShare;
      expect(e.human.landed + e.human.tumours + e.human.lost).toBe(SEEDS);
      expect(e.typical.landed + e.typical.tumours + e.typical.lost).toBe(SEEDS);
      expect(e.ru.length).toBeGreaterThan(0);
      expect(e.payload.length).toBeGreaterThan(0);
      expect(e.rule.length).toBeGreaterThan(0);
      if (e.sample.landed) expect(e.sample.svg).toContain("<svg");
      else expect(e.sample.reason?.length ?? 0).toBeGreaterThan(0);
    }
    expect(total).toBeCloseTo(1, 6);
    expect(d.families.reduce((s, f) => s + f.rows, 0)).toBe(MUTATIONS.length);
    // Decision 55: ten rows never land on the human directly; step I adds the merges of two torsos and the tumours that grow into one (the human has one torso and no tumour);
    // step J lets a fork without room and a hand with nothing to rebirth grow their ending instead (orphan rows), so they land.
    // The human's joints (decision 118) add seven: every limb segment is of length 1 now, too short for a bud's heart and
    // gut brain (budding) - a JOINT with an ending takes the elbow or the knee instead; no limb hangs, the elbow and the knee carry
    // the rest of it (ENGULF: armFromBelly, limbSwallowed, sunkenLeg); the chest and the pelvis are small and full, so a
    // SPLIT has no free place for the twin (twinCavity, doubleTrunk, splitBody).
    // Step K adds two: `jawInHead` and `ear` are the rows a head without a mouth or without hearing pulls (decision 162), and the
    // human's head has its jaw and both its ears - a head holds one jaw and two ears (`HEAD_SLOTS`), so these rows wait for a head
    // that has none. An ear on the flesh (`earOnBody`) needs no head and lands, and since decision 322 so does a jaw (`jawOnBody`).
    // The size steps of the jaw are no longer here: they are a RESIZE of the jaw already in place, not a second jaw (decision 164).
    // The audit takes five away: `hood`, `net`, `sail`, `fin` and `gill` asked for a simple cycle, which no human and no grown body
    // has; since decision 320 a membrane hangs on one bent limb as a wing does, and the human's arms and legs are bent.
    expect(d.problems.neverOnHuman.map((e) => e.m.id).sort()).toEqual([
      "armFromBelly",
      "budding",
      "crawlingHead",
      "doubleTrunk",
      "ear",
      "fusedTorsos",
      "fusedTrunks",
      "jawInHead",
      "limbSwallowed",
      "meatTrunk",
      "oneFlesh",
      "runawayFlesh",
      "splitBody",
      "sunkenLeg",
      "swarmWomb",
      "tumourTrunk",
      "twinCavity",
      "wanderingEye",
    ]);
    expect(d.humanMass).toBe(mass(human()));
    expect(drawShare(MUTATIONS.find((m) => m.id === "extraArm")!)).toBeGreaterThan(0);
  });

  it("the document variant: doctype, meta tags, system fonts, three theme states, tokens on the silhouettes", () => {
    const html = renderReport(data(), "document");
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain(`<meta name="description" content="Все ${MUTATIONS.length} мутаций модели тело-граф`);
    expect(html).toContain('<meta name="html-report" content="group mutant-engine; tags мутации, тело-граф">');
    expect(html).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
    expect(html).toContain('"PT Serif", Georgia, "Times New Roman", serif');
    expect(html).toContain("--ink-0:#f2ece0");
    expect(html).toMatch(/@media \(prefers-color-scheme: dark\)\{:root:not\(\[data-theme="light"\]\)\{--ink-0:#0b0a09/);
    expect(html).toMatch(/:root\[data-theme="dark"\]\{--ink-0:#0b0a09/);
    expect(html.match(/<h2 /g)).toHaveLength(6);
    expect(html.match(/<h3[\s>]/g)!.length).toBeGreaterThanOrEqual(18);
    // No fixed colour survives in the silhouettes: every fill and stroke is a variable.
    const svgs = html.match(/<svg[^>]*class="silhouette"[\s\S]*?<\/svg>/g) ?? [];
    expect(svgs.length).toBeGreaterThan(200);
    for (const svg of svgs) expect(svg).not.toMatch(/(fill|stroke)="#/);
    for (const g of ["fam-body", "fam-head", "fam-gut", "fam-sec", "fam-alien", "fam-ctrl"]) {
      expect(contrast(PALETTES.light[g]!, PALETTES.light["ink-0"]!)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(PALETTES.dark[g]!, PALETTES.dark["ink-0"]!)).toBeGreaterThanOrEqual(4.5);
    }
    expect(tokenizeSvg('<circle class="end eye" cx="1" cy="1" r="1" fill="#e9dec9"/><circle cx="1" cy="1" r="0.4" fill="#0b0a09"/>')).toBe('<circle class="end eye" cx="1" cy="1" r="1" fill="var(--eye)"/><circle cx="1" cy="1" r="0.4" fill="var(--pupil)"/>');
  });
});
