import { describe, expect, it } from "vitest";
import { bodyHash, organs, validate, type Body, MUTATIONS, stripPreview, type Command, initialState, run, type LabState } from "../index.js";
import { decode, encode } from "../../../apps/lab/hash.js";

function state(commands: Command[], seed = 7): LabState {
  return { ...initialState(), seed, commands };
}

/** Every origin the body carries, on elements and organs. */
function origins(b: Body): number[] {
  return [...Object.values(b.nodes), ...Object.values(b.segments), ...Object.values(b.membranes), ...organs(b)].map((x) => x.origin!);
}

describe("unmutate", () => {
  it("human + 10 mutations, take the fifth: what it grew is gone, the rest stays, no id comes back", () => {
    let tried = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const before = run(state([{ t: "mutate", source: "abyss", n: 10 }], seed));
      if (!origins(before.body).includes(5)) continue;
      tried += 1;
      const after = run(state([{ t: "mutate", source: "abyss", n: 10 }, { t: "unmutate", step: 5 }], seed));
      const e = after.steps[after.steps.length - 1]!.event;
      if (e.kind !== "strip" || e.result === null) throw new Error("no strip");
      expect(origins(after.body)).not.toContain(5);
      expect(validate(after.body)).toEqual([]);
      // Organs taken off elements that stay are all the fifth's.
      const own = [...e.result.nodes.flatMap((n) => n.ends), ...e.result.segments.flatMap((s) => [...s.cavity, ...s.growths])];
      for (const o of e.result.organs) if (!own.includes(o)) expect(o.origin).toBe(5);
      expect(after.body.nextId).toBe(before.body.nextId);
    }
    expect(tried).toBeGreaterThan(10);
  });

  it("every catalog row grown on a human and taken back leaves a sound body", () => {
    const bad: string[] = [];
    for (const m of MUTATIONS) {
      const r = run(state([{ t: "mutate", source: "id", id: m.id, n: 1 }, { t: "unmutate", step: 1 }]), { light: true });
      const errors = validate(r.body);
      if (errors.length > 0) bad.push(`${m.id}: ${errors.join("; ")}`);
    }
    expect(bad).toEqual([]);
  });
});

describe("removal commands", () => {
  const commands: Command[] = [
    { t: "mutate", source: "abyss", n: 6 },
    { t: "excise", at: "end", id: 4, slot: 0 },
    { t: "excise", at: "limb", id: 13, slot: 0 },
    { t: "unmutate", step: 3 },
    { t: "excise", at: "cavity", id: 9, slot: 1 },
  ];

  it("go through the hash and back, and the replay gives the same body", () => {
    const s = state(commands);
    const back = decode(encode(s)).state;
    expect(back.commands).toEqual(commands);
    expect(bodyHash(run(back).body)).toBe(bodyHash(run(s).body));
    expect(bodyHash(run(back, { light: true }).body)).toBe(bodyHash(run(s).body));
  });

  it("undo is the replay without the last one", () => {
    const full = run(state(commands));
    const undone = run(state(commands.slice(0, -1)));
    expect(full.steps[full.steps.length - 2]!.hash).toBe(bodyHash(undone.body));
  });

  it("the last heart shows as vital before it is cut", () => {
    const b = run(state([])).body;
    const hash = bodyHash(b);
    expect(stripPreview(b, { t: "excise", at: "cavity", id: 9, slot: 0 })!.vital.map((o) => o.kind)).toEqual(["heart"]);
    expect(bodyHash(b)).toBe(hash);
  });
});
