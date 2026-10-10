/**
 * The one page (issue #1): the lab, the mutator and the bestiary over one
 * state in one hash; a mutation placed by hand; nodes dragged by hand.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  bodyHash,
  human,
  validate,
  type Target,
  mutationById,
  features,
  fixtureBody,
  similarity,
  BEASTS,
  placeTargets,
  startBody,
  type Command,
  type PlaceCommand,
  run,
  type LabState,
} from "@mutant-engine/core";
import { layout, pinAt, pinLayout, prunePins } from "@mutant-engine/view";
import { decode, encode, type View } from "../hash.js";
import { describeStep } from "../mutator/model.js";

function state(start: LabState["start"], commands: Command[] = [], seed = 7): LabState {
  return { seed, start, commands, spread: true };
}

function roundTrip(s: LabState, view: View = {}): { state: LabState; view: View } {
  return decode(`#${encode(s, view)}`);
}

describe("one state for the three tools", () => {
  it("a beast opens as a start: its fixture replays to the same body through the hash", () => {
    for (const b of BEASTS) {
      const s = state({ kind: "beast", id: b.id });
      const back = roundTrip(s, { tab: "zoo", shelf: "myth", beast: b.id });
      expect(back.state).toEqual(s);
      expect(back.view).toEqual({ tab: "zoo", shelf: "myth", beast: b.id });
      expect(run(back.state).body).toEqual(run(s).body);
      expect(bodyHash(run(s).body)).toBe(bodyHash(fixtureBody(b)));
    }
  });

  it("the lab's commands and the mutator's cards read the same run: a placed step is a landed card", () => {
    const id = "extraArm";
    const targets = placeTargets(human(), id).slice(0, 3);
    const r = run(state({ kind: "human" }, [...targets.map((w): PlaceCommand => ({ t: "place", id, target: w.target })), { t: "mutate", source: "abyss", n: 3 }, { t: "tick", n: 5 }]));
    const cards = r.steps.map(describeStep);
    const placed = r.steps.filter((st) => st.event.kind === "place");
    expect(placed.length).toBe(targets.length);
    for (const st of placed) {
      const card = describeStep(st);
      expect(card.outcome).toBe("landed");
      expect(card.name).not.toBeNull();
      expect(card.where).not.toBeNull();
    }
    expect(cards.filter((c) => c.outcome === "other").length).toBe(1);
  });

  it("unknown beasts and broken place commands are dropped by the decoder", () => {
    const { state: s } = decode("#s=3&b=z.nope&sp=1&c=p.extraArm.q9;p.notARow.n1;p.extraArm;m.abyss.1");
    expect(s.start).toEqual({ kind: "human" });
    expect(s.commands).toEqual([{ t: "mutate", source: "abyss", n: 1 }]);
  });
});

describe("a mutation placed by hand", () => {
  it("the chosen row lands at the chosen place", () => {
    const body = human();
    for (const id of ["extraArm", "extraEye", "tail", "hornPlates"]) {
      if (mutationById(id) === undefined) continue;
      const list = placeTargets(body, id);
      expect(list.length, id).toBeGreaterThan(0);
      const target = list[list.length - 1]!.target;
      const r = run(state({ kind: "human" }, [{ t: "place", id, target }]));
      const e = r.steps[1]!.event;
      expect(e.kind).toBe("place");
      if (e.kind !== "place") continue;
      expect(e.rejected).toBeNull();
      expect(e.result?.mutation.id).toBe(id);
      expect(e.result?.target).toEqual(target);
      expect(validate(r.body)).toEqual([]);
    }
  });

  it("every place on the human is a valid target, and the body does not change when it is refused", () => {
    const id = "extraArm";
    const body = human();
    for (const w of placeTargets(body, id)) {
      const r = run(state({ kind: "human" }, [{ t: "place", id, target: w.target }]));
      expect(r.steps[1]!.event.kind === "place" && r.steps[1]!.event.rejected === null).toBe(true);
    }
  });

  it("a target that is not a place of the row is refused with a reason, and the body stays as it was", () => {
    const bad: PlaceCommand[] = [
      { t: "place", id: "extraArm", target: { node: 9999 } },
      { t: "place", id: "extraArm", target: { cycle: [1, 2, 3] } },
      { t: "place", id: "noSuchRow", target: { node: 0 } },
    ];
    for (const cmd of bad) {
      const r = run(state({ kind: "human" }, [cmd]));
      const e = r.steps[1]!.event;
      expect(e.kind).toBe("place");
      if (e.kind !== "place") continue;
      expect(e.result).toBeNull();
      expect(e.rejected, JSON.stringify(cmd)).toMatch(/\S/);
      expect(r.steps[1]!.hash).toBe(r.steps[0]!.hash);
    }
  });

  it("the random draw stays beside it: a placed step does not touch the rng", () => {
    const place: PlaceCommand = { t: "place", id: "extraArm", target: placeTargets(human(), "extraArm")[0]!.target };
    const a = run(state({ kind: "human" }, [place, { t: "mutate", source: "abyss", n: 1 }]));
    const b = run(state({ kind: "human" }, [{ t: "mutate", source: "abyss", n: 1 }]));
    expect(a.steps[1]!.rng).toEqual(a.steps[0]!.rng);
    const ea = a.steps[2]!.event;
    const eb = b.steps[1]!.event;
    expect(ea.kind === "mutate" && eb.kind === "mutate" && ea.defect === eb.defect).toBe(true);
  });

  it("places round-trip through the hash for every kind of target", () => {
    const targets: Target[] = [{ node: 3 }, { segment: 12 }, { ending: { node: 4, index: 1 } }, { pair: [2, 9] }, { cycle: [5, 6, 7] }];
    const s = state({ kind: "human" }, targets.map((target) => ({ t: "place", id: "extraArm", target })));
    expect(roundTrip(s).state).toEqual(s);
  });
});

describe("dragging a node", () => {
  it("a body without pins lays out exactly as before", () => {
    const body = startBody({ kind: "swamp" });
    const l = layout(body);
    expect(pinLayout(l, {}, body)).toBe(l);
    expect(pinLayout(l, { 99999: { x: 1, y: 1 } }, body)).toEqual(layout(body));
  });

  it("the dragged node stands where it was dropped, its segments stay attached and the rest does not move", () => {
    const body = human();
    const l = layout(body);
    // Every node in turn, not just the last: a limb hangs off its polyline's end, a torso is a cap short of it.
    for (const node of l.nodes) {
      const pins = pinAt({}, l, node.id, { x: node.x + 1.5, y: node.y - 0.5 });
      const p = pinLayout(l, pins, body);
      const moved = p.nodes.find((n) => n.id === node.id)!;
      expect(moved.x).toBeCloseTo(node.x + 1.5);
      expect(moved.y).toBeCloseTo(node.y - 0.5);
      for (const s of p.segments) {
        const seg = body.segments[s.id]!;
        // A torso's spine is pulled in by half a width at each end and its round cap puts the body back
        // (decision 221): the node is not the last point of the polyline, it is on the outline the cap
        // draws around it. Every other kind ends on its node exactly.
        const off = seg.kind === "torso" ? s.width / 2 : 0;
        for (const [end, i] of [["a", 0], ["b", s.points.length - 1]] as const) {
          const at = p.nodes.find((n) => n.id === seg[end])!;
          const gap = Math.hypot(s.points[i]!.x - at.x, s.points[i]!.y - at.y);
          expect(gap, `segment ${s.id} at ${end}`).toBeLessThanOrEqual(off + 1e-9);
        }
      }
      for (const n of p.nodes) if (n.id !== node.id) expect(n).toEqual(l.nodes.find((m) => m.id === n.id));
    }
    expect(Object.keys(body.nodes).length).toBe(Object.keys(human().nodes).length);
  });

  it("a pin survives the next mutation and lives in the hash", () => {
    const s = state({ kind: "human" }, [{ t: "mutate", source: "abyss", n: 2 }]);
    const r0 = run(s);
    const l0 = layout(r0.body);
    const id = l0.nodes[1]!.id;
    const pins = pinAt({}, l0, id, { x: l0.nodes[1]!.x + 2, y: l0.nodes[1]!.y });
    const view: View = { pins };
    const next: LabState = { ...s, commands: [...s.commands, { t: "mutate", source: "abyss", n: 1 }] };
    const back = roundTrip(next, view);
    expect(back.view.pins).toEqual(pins);
    const r1 = run(back.state);
    const l1 = layout(r1.body);
    const p1 = pinLayout(l1, back.view.pins!, r1.body);
    const was = l1.nodes.find((n) => n.id === id)!;
    const now = p1.nodes.find((n) => n.id === id)!;
    expect(now.x - was.x).toBeCloseTo(2);
    expect(now.y - was.y).toBeCloseTo(0);
  });

  it("a pin of a node that is gone does nothing and is pruned; the body keeps every element", () => {
    const body = human();
    const pins = { 99999: { x: 1, y: 1 }, [layout(body).nodes[0]!.id]: { x: 0.25, y: 0 } };
    const pruned = prunePins(pins, body);
    expect(Object.keys(pruned).map(Number)).toEqual([layout(body).nodes[0]!.id]);
    expect(validate(body)).toEqual([]);
  });
});

describe("the bestiary on main", () => {
  it("the similarity of every fixture is what it was on check/beasts", () => {
    const branch = JSON.parse(readFileSync(join(import.meta.dirname, "beasts", "branch-scores.json"), "utf8")) as Record<string, number>;
    expect(Object.keys(branch).sort()).toEqual(BEASTS.map((b) => b.id).sort());
    for (const b of BEASTS) expect(similarity(b.want, features(fixtureBody(b))).score, `${b.id} fixture`).toBeCloseTo(branch[b.id]!, 9);
  });
});
