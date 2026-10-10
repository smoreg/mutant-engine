/**
 * A part of the tables put on a body by hand (the editor): every kind of
 * ORGANS, SEGMENT_KINDS, COVERS and MEMBRANES has a place on a human or a
 * reason why not; an attach lands only where the model lists it, leaves a
 * sound body, replays from its text into the same body, and a refused one
 * changes nothing and says why.
 */
import { describe, expect, it } from "vitest";
import {
  ATTACH_PARTS,
  attachChoices,
  attachRefusal,
  attachWhy,
  bodyHash,
  choiceElements,
  decodeCommand,
  encodeCommand,
  human,
  nodeIds,
  run,
  segmentIds,
  validate,
  type AttachCommand,
  type Command,
  type LabState,
} from "../index.js";

function state(commands: Command[], start: LabState["start"] = { kind: "human" }): LabState {
  return { seed: 3, start, commands, spread: true };
}

const HUMAN_HASH = bodyHash(human());

describe("every part of the tables on a human", () => {
  it("has at least one place, or a refusal in words", () => {
    const body = human();
    for (const part of ATTACH_PARTS) {
      const choices = attachChoices(body, part);
      if (choices.length > 0) continue;
      const why = attachRefusal(body, part);
      expect(why, part).not.toBeNull();
      expect(why!.length, part).toBeGreaterThan(3);
    }
  });

  it("the tables are read whole: organs, segments, covers and membranes are all there", () => {
    for (const p of ["organ:eye", "organ:head", "organ:brain", "segment:arm", "segment:tail", "cover:fur", "membrane:wing"]) expect(ATTACH_PARTS).toContain(p);
  });

  it("the common drags land: an arm on a free place, an eye into the head, fur on a segment, a wing on a bent limb", () => {
    const body = human();
    expect(attachChoices(body, "segment:arm").some((c) => c.how === "limb")).toBe(true);
    expect(attachChoices(body, "organ:eye").some((c) => c.how === "head" && "ending" in c.target && c.target.ending.node === 1)).toBe(true);
    expect(attachChoices(body, "cover:fur").some((c) => c.how === "cover")).toBe(true);
    expect(attachChoices(body, "membrane:wing").some((c) => c.how === "membrane")).toBe(true);
  });
});

describe("an attach as a command", () => {
  it("every choice on a human gives a valid body, and the command replays from its text into the same body", () => {
    const body = human();
    for (const part of ATTACH_PARTS) {
      const choices = attachChoices(body, part);
      // The first and the last place of every part: both ends of its list.
      for (const c of [choices[0], choices[choices.length - 1]]) {
        if (c === undefined) continue;
        const cmd: AttachCommand = { t: "attach", part, how: c.how, target: c.target };
        const r = run(state([cmd]));
        const ev = r.steps[1]!.event;
        expect(ev.kind, part).toBe("attach");
        if (ev.kind === "attach") expect(ev.rejected, `${part} ${JSON.stringify(c)}`).toBeNull();
        expect(validate(r.body), `${part} ${JSON.stringify(c)}`).toEqual([]);
        expect(bodyHash(r.body), part).not.toBe(HUMAN_HASH);
        const back = decodeCommand(encodeCommand(cmd));
        expect(back, part).toEqual(cmd);
        expect(bodyHash(run(state([back!])).body)).toBe(bodyHash(r.body));
      }
    }
  });

  it("a place the model does not list is refused with a reason, and the body does not change", () => {
    const body = human();
    let refused = 0;
    for (const part of ATTACH_PARTS) {
      const choices = attachChoices(body, part);
      const taken = new Set<number>();
      for (const c of choices) for (const id of choiceElements(body, c)) taken.add(id);
      const free = [...nodeIds(body).map((id) => ({ node: id })), ...segmentIds(body).map((id) => ({ segment: id }))].filter((e) => !taken.has("node" in e ? e.node : e.segment));
      for (const el of free.slice(0, 3)) {
        const why = attachWhy(body, part, el);
        expect(why, `${part} ${JSON.stringify(el)}`).not.toBeNull();
        const how = choices[0]?.how ?? (part.startsWith("segment:") ? "limb" : part.startsWith("cover:") ? "cover" : part.startsWith("membrane:") ? "membrane" : "head");
        const target = "node" in el ? { node: el.node } : { segment: el.segment };
        const r = run(state([{ t: "attach", part, how, target }]));
        const ev = r.steps[1]!.event;
        if (ev.kind === "attach") {
          expect(ev.rejected, `${part} ${JSON.stringify(el)}`).not.toBeNull();
          refused += 1;
        }
        expect(bodyHash(r.body)).toBe(HUMAN_HASH);
      }
    }
    expect(refused).toBeGreaterThan(20);
  });

  it("a place that is listed says nothing against it", () => {
    const body = human();
    for (const part of ["segment:arm", "organ:eye", "cover:fur", "membrane:wing"]) {
      const c = attachChoices(body, part)[0]!;
      const el = choiceElements(body, c)[0]!;
      const isNode = body.nodes[el] !== undefined;
      expect(attachWhy(body, part, isNode ? { node: el } : { segment: el }), part).toBeNull();
    }
  });

  it("an undo is the replay without the last command: the body's hash is the one before", () => {
    const body = human();
    const arm = attachChoices(body, "segment:arm")[0]!;
    const first: AttachCommand = { t: "attach", part: "segment:arm", how: arm.how, target: arm.target };
    const one = run(state([first]));
    const eye = attachChoices(one.body, "organ:eye")[0]!;
    const two = run(state([first, { t: "attach", part: "organ:eye", how: eye.how, target: eye.target }]));
    expect(bodyHash(two.body)).not.toBe(bodyHash(one.body));
    expect(bodyHash(run(state([first])).body)).toBe(bodyHash(one.body));
    expect(bodyHash(run(state([])).body)).toBe(HUMAN_HASH);
  });

  it("broken attach commands are dropped by the decoder", () => {
    expect(decodeCommand("a.organ-nope.head.e1-0")).toBeNull();
    expect(decodeCommand("a.organ-eye.cover.e1-0")).toBeNull();
    expect(decodeCommand("a.segment-arm.limb")).toBeNull();
    expect(decodeCommand("a.segment-arm.limb.n2")).toEqual({ t: "attach", part: "segment:arm", how: "limb", target: { node: 2 } });
  });

  it("a beast takes parts too", () => {
    const r = run(state([], { kind: "beast", id: "centaur" }));
    const body = r.body;
    const fur = attachChoices(body, "cover:fur");
    if (fur.length === 0) return;
    const after = run(state([{ t: "attach", part: "cover:fur", how: fur[0]!.how, target: fur[0]!.target }], { kind: "beast", id: "centaur" }));
    expect(validate(after.body)).toEqual([]);
  });
});
