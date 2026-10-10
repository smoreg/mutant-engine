import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FAMILIES, HUMAN_IDS, NEED_KINDS, SWAMP_MUTANT_TEXT, bodyHash, brains, drawWeighted, flankHost, sameTarget, segmentIds, validate, type Body } from "@mutant-engine/core";
import { MUTATIONS, SOURCES, startBody, LabRng, diffBodies, initialState, run, type Command, type Source, type LabState, type Run } from "@mutant-engine/core";
import { decode, encode, type View } from "../hash.js";
import { histogram, needsSummary, shareAt, statsFor } from "../stats.js";

const LAB = join(import.meta.dirname, "..", "..", "..", "apps", "lab");

// ---------------------------------------------------------------- random tapes

/** Whether a command can be appended to a body: a cut needs a segment, a separation a foreign brain. */
function randomCommand(rng: LabRng, body: Body): Command {
  const roll = rng.next();
  const sources = SOURCES.map((s) => s.id).filter((s) => s !== "id");
  if (roll < 0.45) {
    const source = sources[Math.floor(rng.next() * sources.length)]!;
    const cmd: Command = { t: "mutate", source, n: 1 + Math.floor(rng.next() * 3) };
    if (source === "vaccine") cmd.family = FAMILIES[Math.floor(rng.next() * FAMILIES.length)]!;
    return cmd;
  }
  if (roll < 0.55) return { t: "mutate", source: "id", id: MUTATIONS[Math.floor(rng.next() * MUTATIONS.length)]!.id, n: 1 };
  if (roll < 0.7) return { t: "tick", n: 1 + Math.floor(rng.next() * 40) };
  const foreign = brains(body).filter((b) => !b.self);
  if (roll < 0.8 && foreign.length > 0) {
    const b = foreign[Math.floor(rng.next() * foreign.length)]!;
    return { t: "sway", brain: b.key, sway: Math.floor(rng.next() * 11) };
  }
  if (roll < 0.86 && foreign.length > 0) return { t: "separate", brain: foreign[Math.floor(rng.next() * foreign.length)]!.key };
  const segs = segmentIds(body);
  if (segs.length === 0) return { t: "tick", n: 3 };
  const segment = segs[Math.floor(rng.next() * segs.length)]!;
  return { t: "cut", segment, end: rng.next() < 0.5 ? "a" : "b" };
}

/** A state of 4..8 commands grown one at a time, each chosen against the body it lands on. */
function randomTape(seed: number, spread = seed % 2 === 0): { state: LabState; run: Run } {
  const rng = new LabRng(`tape-${seed}`);
  const state: LabState = { seed, start: seed % 3 === 0 ? { kind: "swamp" } : { kind: "human" }, commands: [], spread };
  let r = run(state);
  const count = 4 + Math.floor(rng.next() * 5);
  for (let i = 0; i < count; i++) {
    state.commands.push(randomCommand(rng, r.body));
    r = run(state, { resume: r });
  }
  return { state, run: r };
}

function hashes(r: Run): string[] {
  return r.steps.map((s) => s.hash);
}

// ---------------------------------------------------------------- tests first

describe("lab state: a replay from a seed", () => {
  it("replay is deterministic: 200 random tapes run twice give equal hashes at every step", () => {
    let steps = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const { state } = randomTape(seed);
      const a = run(state);
      const b = run(state);
      expect(hashes(a)).toEqual(hashes(b));
      expect(bodyHash(a.body)).toBe(bodyHash(b.body));
      expect(validate(a.body), `seed ${seed}`).toEqual([]);
      steps += a.steps.length;
    }
    expect(steps).toBeGreaterThan(1000);
  });

  it("an incremental run resumed from an older one equals a run from scratch", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { state, run: incremental } = randomTape(seed);
      const whole = run(state);
      expect(hashes(incremental)).toEqual(hashes(whole));
      expect(incremental.steps.map((s) => s.command)).toEqual(whole.steps.map((s) => s.command));
      expect(incremental.steps.map((s) => s.derived)).toEqual(whole.steps.map((s) => s.derived));
    }
  });

  it("undo is replay: the run without the last command is the prefix of the run with it", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { state } = randomTape(seed);
      const whole = run(state);
      const shorter = run({ ...state, commands: state.commands.slice(0, -1) });
      const last = state.commands.length - 1;
      const prefix = whole.steps.filter((s) => s.command < last);
      expect(hashes(shorter)).toEqual(prefix.map((s) => s.hash));
      expect(bodyHash(shorter.body)).toBe(prefix[prefix.length - 1]!.hash);
      expect(shorter.body).toEqual(prefix[prefix.length - 1]!.body);
    }
  });

  it("every step records its command and the step numbers run 0..n", () => {
    const { state, run: r } = randomTape(7);
    expect(r.steps[0]!.command).toBe(-1);
    expect(r.steps[0]!.event.kind).toBe("start");
    r.steps.forEach((s, i) => expect(s.index).toBe(i));
    const seen = new Set(r.steps.map((s) => s.command));
    for (let i = 0; i < state.commands.length; i++) expect(seen.has(i), `command ${i} left no step`).toBe(true);
    const mutate = state.commands.map((c, i) => ({ c, i })).filter(({ c }) => c.t === "mutate");
    for (const { c, i } of mutate) expect(r.steps.filter((s) => s.command === i)).toHaveLength((c as { n: number }).n);
  });
});

describe("step diff", () => {
  it("added, removed and changed elements match a direct comparison of the bodies (500 steps)", () => {
    const strip = (b: Body, id: number): unknown => {
      const n = b.nodes[id];
      if (n !== undefined) return { size: n.size, ends: n.ends, bait: n.bait };
      const s = b.segments[id];
      if (s !== undefined) return { a: s.a, b: s.b, kind: s.kind, length: s.length, girth: s.girth, cover: s.cover, cavity: s.cavity, growths: s.growths, breakPlane: s.breakPlane };
      const m = b.membranes[id]!;
      return { kind: m.kind, cycle: m.cycle, area: m.area };
    };
    const ids = (b: Body): { nodes: number[]; segments: number[]; membranes: number[] } => ({
      nodes: Object.keys(b.nodes).map(Number).sort((x, y) => x - y),
      segments: Object.keys(b.segments).map(Number).sort((x, y) => x - y),
      membranes: Object.keys(b.membranes).map(Number).sort((x, y) => x - y),
    });
    let checked = 0;
    for (let seed = 1; checked < 500; seed++) {
      const { run: r } = randomTape(seed);
      for (const step of r.steps) {
        if (step.before === null) continue;
        const before = ids(step.before);
        const after = ids(step.body);
        for (const kind of ["nodes", "segments", "membranes"] as const) {
          const was = new Set(before[kind]);
          const now = new Set(after[kind]);
          const added = after[kind].filter((id) => !was.has(id));
          const removed = before[kind].filter((id) => !now.has(id));
          const changed = after[kind].filter((id) => was.has(id) && JSON.stringify(strip(step.before!, id)) !== JSON.stringify(strip(step.body, id)));
          expect(step.added[kind], `seed ${seed} step ${step.index} added ${kind}`).toEqual(added);
          expect(step.removed[kind], `seed ${seed} step ${step.index} removed ${kind}`).toEqual(removed);
          expect(step.changed[kind], `seed ${seed} step ${step.index} changed ${kind}`).toEqual(changed);
        }
        const direct = diffBodies(step.before, step.body);
        expect(direct).toEqual({ added: step.added, removed: step.removed, changed: step.changed });
        checked += 1;
      }
    }
  });

  it("the start step adds nothing and a repeated body diffs to nothing", () => {
    const r = run(initialState());
    expect(r.steps).toHaveLength(1);
    expect(r.steps[0]!.added).toEqual({ nodes: [], segments: [], membranes: [] });
    expect(r.steps[0]!.derived).toEqual([]);
    const b = startBody({ kind: "swamp" });
    expect(diffBodies(b, b)).toEqual({ added: { nodes: [], segments: [], membranes: [] }, removed: { nodes: [], segments: [], membranes: [] }, changed: { nodes: [], segments: [], membranes: [] } });
  });
});

describe("spread toggle", () => {
  it("replays the same commands: step count, commands and sources match, only targets and mutations differ", () => {
    let differ = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const state: LabState = { seed, start: { kind: "human" }, commands: [{ t: "mutate", source: "abyss", n: 12 }, { t: "tick", n: 5 }], spread: true };
      const on = run(state);
      const off = run({ ...state, spread: false });
      expect(off.steps).toHaveLength(on.steps.length);
      for (let i = 0; i < on.steps.length; i++) {
        const a = on.steps[i]!;
        const b = off.steps[i]!;
        expect(b.command).toBe(a.command);
        expect(b.event.kind).toBe(a.event.kind);
        if (a.event.kind === "mutate" && b.event.kind === "mutate") {
          expect(b.event.source).toBe(a.event.source);
          if (a.event.mutation?.id !== b.event.mutation?.id || JSON.stringify(a.event.target) !== JSON.stringify(b.event.target)) differ += 1;
        }
      }
    }
    expect(differ).toBeGreaterThan(40);
  });
});

describe("candidates", () => {
  it("carry weights: the recorded roll over the recorded candidates picks the recorded target", () => {
    let checked = 0;
    let pulled = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const state: LabState = { seed, start: seed % 2 === 0 ? { kind: "swamp" } : { kind: "human" }, commands: [{ t: "mutate", source: "abyss", n: 15 }, { t: "mutate", source: "spring", n: 5 }], spread: seed % 3 !== 0 };
      for (const step of run(state).steps) {
        if (step.event.kind !== "mutate" || step.event.target === null) continue;
        const e = step.event;
        const target = step.event.target;
        expect(e.candidates.length).toBeGreaterThan(0);
        expect(e.roll).not.toBeNull();
        let total = 0;
        for (const c of e.candidates) {
          expect(c.weight).toBeGreaterThan(0);
          total += c.weight;
        }
        expect(total).toBeGreaterThan(0);
        const replayed = drawWeighted(e.candidates, { next: () => e.roll! })!;
        expect(sameTarget(replayed, target), `seed ${seed} step ${step.index} ${e.mutation?.id}`).toBe(true);
        expect(e.candidates.some((c) => sameTarget(c.target, target))).toBe(true);
        if (e.base !== null) {
          expect(e.base).toHaveLength(e.candidates.length);
          e.base.forEach((b, i) => {
            expect(sameTarget(b.target, e.candidates[i]!.target)).toBe(true);
            expect(e.candidates[i]!.weight).toBeGreaterThanOrEqual(b.weight - 1e-9);
            if (e.candidates[i]!.weight > b.weight + 1e-9) pulled += 1;
          });
        }
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(500);
    expect(pulled).toBeGreaterThan(50);
  });

  it("a mutation by id lands where the catalog row says, with its draw recorded", () => {
    const r = run({ seed: 3, start: { kind: "human" }, commands: [{ t: "mutate", source: "id", id: "extraArm", n: 1 }], spread: true });
    const e = r.steps[1]!.event;
    expect(e.kind).toBe("mutate");
    if (e.kind !== "mutate") return;
    expect(e.mutation?.id).toBe("extraArm");
    expect(e.result?.op).toBe("sprout");
    // The human's chest and pelvis are full and so are the torso's four side slots: on this seed the arm sprouts
    // from a new side node of the right upper arm at the shoulder - a flank, the side node and the arm.
    const step = r.steps[1]!;
    expect(step.added.nodes).toHaveLength(2);
    const kinds = step.added.segments.map((id) => step.body.segments[id]!.kind);
    expect([...kinds].sort()).toEqual(["arm", "flank"]);
    const flank = step.body.segments[step.added.segments[kinds.indexOf("flank")]!]!;
    const arm = step.body.segments[step.added.segments[kinds.indexOf("arm")]!]!;
    expect(flank.a).toBe(HUMAN_IDS.shoulderR);
    expect(flankHost(step.body, flank.id)).toBe(HUMAN_IDS.armR);
    expect(arm.a).toBe(flank.b);
    expect(r.steps[1]!.derived.some((d) => d.key === "mass")).toBe(true);
  });
});

describe("hash", () => {
  it("round-trips 200 states with their views", () => {
    const views: View[] = [
      {},
      { step: 3, view: "sprite" },
      { step: 0, view: "s96", info: { segment: 9 }, compare: true },
      { tab: "gen", gen: { count: 50, mutations: 20, source: "abyss", spread: true, first: 1 }, look: "graph" },
      { tab: "gen", gen: { count: 10, mutations: 5, source: "vaccine", family: "limbs", spread: false, first: 300 }, view: "s96" },
      { tab: "zoo", shelf: "living", beast: "centaur" },
      { room: true, part: "12", view: "sprite" },
      { room: true, part: "c1" },
      { hand: true, row: "extraArm", view: "s96" },
      { step: 12, info: { node: 14 }, brain: "n6.0" },
    ];
    for (let seed = 1; seed <= 200; seed++) {
      const { state } = randomTape(seed);
      if (seed % 10 === 0) state.start = { kind: "text", text: SWAMP_MUTANT_TEXT };
      const view = views[seed % views.length]!;
      const h = encode(state, view);
      expect(h).not.toMatch(/[#\s]/);
      const back = decode(h);
      expect(back.state).toEqual(state);
      expect(back.view).toEqual(view);
      expect(decode(`#${h}`).state).toEqual(state);
    }
  });

  it("an empty or broken hash decodes to the initial state", () => {
    expect(decode("").state).toEqual(initialState());
    expect(decode("#").state).toEqual(initialState());
    expect(decode("garbage=1&c=zzz").state).toEqual(initialState());
  });
});

describe("statistics", () => {
  it("are pure: 100 seeds x 30 mutations twice give the same numbers", () => {
    const params = { seeds: 100, mutations: 30, source: "abyss" as Source };
    const a = statsFor(params, true);
    const b = statsFor(params, true);
    expect(a).toEqual(b);
    expect(a).toHaveLength(100);
    expect(histogram(a.map((s) => s.nodes), 8)).toEqual(histogram(b.map((s) => s.nodes), 8));
    expect(shareAt(a, 3)).toEqual(shareAt(b, 3));
    const off = statsFor(params, false);
    expect(off).toHaveLength(100);
    expect(a.map((s) => s.hash)).not.toEqual(off.map((s) => s.hash));
    for (const s of a) {
      expect(s.nodes).toBeGreaterThan(0);
      expect(s.mass).toBeGreaterThan(0);
      expect(s.heads).toBeGreaterThanOrEqual(1);
    }
  }, 120_000);

  it("count the abyss: lost strikes, tumours, organs evicted by kind, vitals, the alienness, the leader", () => {
    const params = { seeds: 40, mutations: 30, source: "abyss" as Source };
    const samples = statsFor(params, true);
    let evicted = 0;
    let lost = 0;
    for (const s of samples) {
      expect(s.lost + s.tumours).toBeLessThanOrEqual(params.mutations);
      let byKind = 0;
      for (const n of Object.values(s.displacedKinds)) byKind += n ?? 0;
      expect(byKind).toBe(s.displaced);
      expect(s.vitals).toEqual({ noHeart: false, noBrain: false, noBreath: false });
      expect(s.alien).toBeGreaterThan(0);
      expect(s.lead).toBeGreaterThanOrEqual(0);
      expect(s.lead).toBeLessThanOrEqual(1);
      evicted += s.displaced;
      lost += s.lost;
    }
    expect(evicted).toBeGreaterThan(20);
    expect(lost / (params.seeds * params.mutations)).toBeLessThan(0.1);
    // Other sources never evict.
    for (const s of statsFor({ seeds: 10, mutations: 20, source: "meat" }, true)) expect(s.displaced).toBe(0);
  }, 120_000);

  it("count the needs (step J): strengths, brains and hearts, who eats, the overload of the mind, territories that would survive", () => {
    const params = { seeds: 30, mutations: 30, source: "abyss" as Source };
    const samples = statsFor(params, true);
    let territories = 0;
    for (const s of samples) {
      for (const v of Object.values(s.needs)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      expect(s.brains).toBeGreaterThanOrEqual(1);
      expect(s.hearts).toBeGreaterThanOrEqual(1);
      // One brain per cavity; a limb holds a cavity too now (flank.ts), so the torsos alone are no bound.
      expect(s.gutBrains).toBeLessThanOrEqual(s.segments);
      expect(s.survival.survived).toBeLessThanOrEqual(s.survival.territories);
      expect(typeof s.eats).toBe("boolean");
      expect(Number.isFinite(s.overload)).toBe(true);
      territories += s.survival.territories;
    }
    expect(territories).toBeGreaterThan(0);
    const n = needsSummary(samples);
    expect(n.cannotEat).toBeLessThanOrEqual(0.2);
    expect(n.survive).toBeGreaterThanOrEqual(0);
    expect(n.survive).toBeLessThanOrEqual(1);
    for (const k of NEED_KINDS) expect(n.strength[k]).toBeGreaterThanOrEqual(0);
    // A mutate event says which need pushed the row and by how much.
    // A limb holds one organ now, so the second heart lands in the torso on some seeds and in a limb on others.
    const hearts = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => run({ seed, start: { kind: "human" }, commands: [{ t: "mutate", source: "id", id: "secondHeart", n: 1 }], spread: true }).steps[1]!);
    let torso = 0;
    let limb = 0;
    for (const step of hearts) {
      const e = step.event;
      expect(e.kind).toBe("mutate");
      if (e.kind !== "mutate") continue;
      expect(e.needs.map((x) => x.kind)).toEqual(["heart"]);
      expect(e.needs[0]!.draw).toBeGreaterThan(1);
      const t = e.result?.target;
      const kind = t !== undefined && "segment" in t ? step.body.segments[t.segment]!.kind : undefined;
      if (kind === "torso") {
        // The human's only torso already holds a heart: no place for the next one.
        torso += 1;
        expect(e.needs[0]!.place).toBeLessThan(1);
        expect(e.needs[0]!.place).toBeGreaterThan(0);
      } else {
        // A limb neither lacks a heart nor holds one: its place is left as it is.
        limb += 1;
        expect(e.needs[0]!.place).toBe(1);
      }
    }
    expect(torso).toBeGreaterThan(0);
    expect(limb).toBeGreaterThan(0);
  }, 120_000);

  it("a light run keeps its events: one per atom, none of the bookkeeping", () => {
    const state: LabState = { seed: 5, start: { kind: "human" }, commands: [{ t: "mutate", source: "abyss", n: 12 }, { t: "tick", n: 3 }, { t: "mutate", source: "spring", n: 2 }], spread: true };
    const light = run(state, { light: true });
    const full = run(state);
    expect(light.steps).toEqual([]);
    expect(light.events).toHaveLength(15);
    expect(light.events.map((e) => e.kind)).toEqual(full.steps.slice(1).map((s) => s.event.kind));
    expect(full.events).toHaveLength(15);
    expect(bodyHash(light.body)).toBe(bodyHash(full.body));
  });

  it("a sample equals the lab run of the same seed and commands", () => {
    const params = { seeds: 3, mutations: 10, source: "meat" as Source };
    const samples = statsFor(params, true);
    for (const s of samples) {
      const r = run({ seed: s.seed, start: { kind: "human" }, commands: [{ t: "mutate", source: "meat", n: 10 }], spread: true });
      expect(bodyHash(r.body)).toBe(s.hash);
    }
  });

  it("histogram covers every value once", () => {
    const h = histogram([1, 2, 2, 3, 10], 3);
    expect(h.counts.reduce((a, b) => a + b, 0)).toBe(5);
    expect(h.edges).toHaveLength(4);
    expect(histogram([], 4).counts).toEqual([0, 0, 0, 0]);
    expect(histogram([5, 5, 5], 4).counts.reduce((a, b) => a + b, 0)).toBe(3);
  });
});

describe("the lab page", () => {
  // "builds one self-contained file..." and "50 abyss strikes replay..." moved to apps/lab/bench/lab.test.ts (D.2).

  it("keeps the DOM out of state, commands, hash and stats", () => {
    const pure = ["hash.ts", "stats.ts", "../../packages/view/pins.ts", "panels.ts", "batch.ts", "zoo.ts"];
    for (const f of pure) {
      const text = readFileSync(join(LAB, f), "utf8");
      for (const re of [/\bdocument\b/, /\bwindow\b/, /Math\.random/, /Date\.now/, /\bnavigator\b/, /\blocation\b/]) expect(text, `${f} matches ${re}`).not.toMatch(re);
    }
    expect(readFileSync(join(LAB, "main.ts"), "utf8")).toMatch(/\bdocument\b/);
  });
});
