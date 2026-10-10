/**
 * The editor tab without the page: the palette is the parts tab's list of the
 * model's tables, a drag lights only the places the model gives, a drop is a
 * command of the model that replays from the #hash into the same body, a
 * drop elsewhere changes nothing, undo is the body before, and the knife
 * takes back what was put on.
 */
import { describe, expect, it } from "vitest";
import { ATTACH_PARTS, bodyHash, human, run, validate, type Command, type LabState } from "@mutant-engine/core";
import { decode, encode } from "../hash.js";
import { partEntries } from "../parts.js";
import { attachCommand, choicesAt, dropPlan, editStats, historyRows, paletteEntries, removalsAt, trashOp } from "../edit.js";

function state(commands: Command[], start: LabState["start"] = { kind: "human" }): LabState {
  return { seed: 5, start, commands, spread: true };
}

describe("the palette", () => {
  it("is the parts tab's list: every kind of every table, and each is a part the model attaches", () => {
    const ids = paletteEntries({}).map((e) => e.id);
    expect(ids).toEqual(partEntries().map((e) => e.id));
    expect([...ids].sort()).toEqual([...ATTACH_PARTS].sort());
  });

  it("filters by category and by name", () => {
    expect(paletteEntries({ table: "covers" }).every((e) => e.table === "covers")).toBe(true);
    expect(paletteEntries({ q: "глаз" }).some((e) => e.id === "organ:eye")).toBe(true);
    expect(paletteEntries({ table: "membranes", q: "крыло" }).map((e) => e.id)).toEqual(["membrane:wing"]);
  });
});

describe("a drag over a human", () => {
  const body = human();

  it("lights only elements with a place: an arm on nodes and side places, an eye on the head, fur on segments", () => {
    const arm = dropPlan(body, "segment:arm");
    expect(arm.choices.length).toBeGreaterThan(0);
    for (const id of [...arm.lit.nodes, ...arm.lit.segments]) expect(choicesAt(arm, id).length).toBeGreaterThan(0);
    const eye = dropPlan(body, "organ:eye");
    expect(eye.lit.nodes).toContain(1);
    const fur = dropPlan(body, "cover:fur");
    expect(fur.lit.nodes).toEqual([]);
    expect(fur.lit.segments.length).toBeGreaterThan(0);
    const wing = dropPlan(body, "membrane:wing");
    expect(wing.lit.segments.length).toBeGreaterThan(0);
  });

  it("a drop on a lit element is a command whose body is sound and comes back from the hash", () => {
    for (const part of ["segment:arm", "organ:eye", "organ:heart", "cover:fur", "membrane:wing", "organ:claw", "segment:tail"]) {
      const plan = dropPlan(body, part);
      const id = [...plan.lit.nodes, ...plan.lit.segments][0]!;
      const cmd = attachCommand(part, choicesAt(plan, id)[0]!);
      const s = state([cmd]);
      const r = run(s);
      expect(validate(r.body), part).toEqual([]);
      expect(bodyHash(r.body), part).not.toBe(bodyHash(body));
      const back = decode(`#${encode(s, { tab: "edit" })}`);
      expect(back.view.tab).toBe("edit");
      expect(bodyHash(run(back.state).body), part).toBe(bodyHash(r.body));
    }
  });

  it("an element that is not lit has no choice there", () => {
    const fur = dropPlan(body, "cover:fur");
    expect(choicesAt(fur, 1)).toEqual([]);
  });

  it("undo is the replay without the last command: the hash before", () => {
    const arm = dropPlan(body, "segment:arm");
    const c1 = attachCommand("segment:arm", arm.choices[0]!);
    const one = run(state([c1]));
    const eye = dropPlan(one.body, "organ:eye");
    const c2 = attachCommand("organ:eye", eye.choices[0]!);
    const two = run(state([c1, c2]));
    expect(bodyHash(two.body)).not.toBe(bodyHash(one.body));
    expect(bodyHash(run(state(two.state.commands.slice(0, -1))).body)).toBe(bodyHash(one.body));
  });
});

describe("taking a part off", () => {
  it("the knife lists what it takes from the element, and the trash takes the whole part", () => {
    const body = human();
    const plan = dropPlan(body, "segment:tail");
    const cmd = attachCommand("segment:tail", plan.choices[0]!);
    const r = run(state([cmd]));
    const grown = r.steps[1]!.added.segments.find((id) => r.body.segments[id]!.kind === "tail")!;
    const ops = removalsAt(r.body, { segment: grown });
    expect(ops.length).toBeGreaterThan(0);
    const trash = trashOp(r.body, { segment: grown })!;
    expect(trash.kind).toBe("remove");
    const after = run(state([cmd, trash.command]));
    expect(validate(after.body)).toEqual([]);
    expect(Object.values(after.body.segments).some((s) => s.kind === "tail")).toBe(false);
  });

  it("the brain you think with is not on the list", () => {
    const body = human();
    const ops = removalsAt(body, { node: 1 });
    expect(ops.some((o) => /мозг/.test(o.what))).toBe(false);
  });
});

describe("the side of the tab", () => {
  it("shows the numbers, the budgets and a sound body", () => {
    const s = editStats(human());
    expect(s.errors).toEqual([]);
    expect(s.summary.length).toBeGreaterThan(5);
    expect(s.budgets.length).toBeGreaterThanOrEqual(4);
  });

  it("names every command of the history, a refused one as refused", () => {
    const r = run(state([{ t: "attach", part: "cover:fur", how: "cover", target: { node: 1 } }, { t: "mutate", source: "abyss", n: 1 }]));
    const rows = historyRows(r);
    expect(rows.length).toBe(2);
    expect(rows[0]!.rejected).toBe(true);
    expect(rows[1]!.rejected).toBe(false);
  });

  it("the tab's view round-trips through the hash", () => {
    const s = state([]);
    const view = { tab: "edit" as const, edit: { look: "sprite" as const, table: "organs" as const, q: "глаз" } };
    expect(decode(`#${encode(s, view)}`).view).toEqual(view);
  });
});
