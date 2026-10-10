/**
 * The lab's own interface: the graph drawn with human proportions, a click on
 * a part that opens its card and touches nothing, the list of places that is
 * never empty when the counter is not zero.
 */
import { describe, expect, it } from "vitest";
import { bodyHash, bodyToText, human, validate, CATALOG, placeTargets, startBody, mutationAbout } from "@mutant-engine/core";
import { layout, relaxLayout, type Layout, GRAPH_LOOK, graphLook, sceneSvg } from "@mutant-engine/view";
import { decode, encode } from "../hash.js";
import { partInfoHtml, placeHtml } from "../panels.js";

function look(body = human()): { body: ReturnType<typeof human>; base: Layout; out: Layout } {
  const base = relaxLayout(body, layout(body, { scale: "linear" }));
  return { body, base, out: graphLook(body, base) };
}

function spanOf(l: Layout, ids: number[]): number {
  const ys = l.nodes.filter((n) => ids.includes(n.id)).map((n) => n.y);
  return ys.length === 0 ? 0 : Math.max(...ys) - Math.min(...ys);
}

describe("the graph reads as a body", () => {
  it("a head is drawn as a head: its node is wider than the model's collision radius", () => {
    const { body, base, out } = look();
    const heads = Object.entries(body.nodes)
      .filter(([, n]) => n.ends.some((e) => e.kind === "head"))
      .map(([id]) => Number(id));
    expect(heads.length).toBeGreaterThan(0);
    for (const id of heads) {
      const was = base.nodes.find((n) => n.id === id)!;
      const now = out.nodes.find((n) => n.id === id)!;
      expect(now.r).toBeCloseTo(was.r * GRAPH_LOOK.head, 9);
    }
    // Every other node keeps its radius.
    for (const n of out.nodes) if (!heads.includes(n.id)) expect(n.r).toBeCloseTo(base.nodes.find((m) => m.id === n.id)!.r, 9);
  });

  it("legs are longer than the torso", () => {
    const { body, out } = look();
    const torso = Object.entries(body.segments).find(([, s]) => s.kind === "torso")![1];
    const torsoSpan = spanOf(out, [torso.a, torso.b]);
    // From the hip the legs hang down: the lowest node of the picture against the hip.
    const hip = out.nodes.find((n) => n.id === torso.b)!;
    const lowest = Math.max(...out.nodes.map((n) => n.y));
    expect(lowest - hip.y).toBeGreaterThan(torsoSpan);
  });

  it("it is only the picture: the body, the layout it is given and the drawing are all left alone", () => {
    const body = human();
    const before = bodyHash(body);
    const text = bodyToText(body);
    const base = relaxLayout(body, layout(body, { scale: "linear" }));
    const snapshot = JSON.stringify(base);
    const out = graphLook(body, base);
    expect(JSON.stringify(base)).toBe(snapshot);
    expect(bodyHash(body)).toBe(before);
    expect(bodyToText(body)).toBe(text);
    expect(validate(body)).toEqual([]);
    expect(out.nodes).toHaveLength(base.nodes.length);
    expect(out.segments).toHaveLength(base.segments.length);
    // Deterministic: the same layout gives the same picture.
    expect(JSON.stringify(graphLook(body, base))).toBe(JSON.stringify(out));
  });

  it("every start lays out without a broken number", () => {
    for (const start of [{ kind: "human" } as const, { kind: "swamp" } as const]) {
      const body = startBody(start);
      const out = graphLook(body, relaxLayout(body, layout(body, { scale: "linear" })));
      for (const n of out.nodes) expect(Number.isFinite(n.x) && Number.isFinite(n.y) && n.r > 0, `node ${n.id}`).toBe(true);
      for (const s of out.segments) for (const p of s.points) expect(Number.isFinite(p.x) && Number.isFinite(p.y), `segment ${s.id}`).toBe(true);
      for (const v of [out.bbox.x0, out.bbox.y0, out.bbox.x1, out.bbox.y1]) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("organ stamps are drawn smaller than the silhouette gives them, and do not spill over the torso", () => {
    const { body, out } = look();
    const svg = sceneSvg({ body, layout: out, size: 640 });
    const stamps = [...svg.matchAll(/<g class="organ [^"]*" transform="translate\([^)]*\) scale\(([\d.]+)\)"/g)];
    expect(stamps.length).toBeGreaterThan(0);
    for (const m of stamps) expect(Number(m[1])).toBeLessThan(1);
  });
});

describe("a click on a part opens its card", () => {
  it("the card names the part, its organs and its numbers, and reads the body without writing to it", () => {
    const body = human();
    const before = bodyHash(body);
    const torso = Number(Object.entries(body.segments).find(([, s]) => s.kind === "torso")![0]);
    const card = partInfoHtml(body, { segment: torso });
    expect(card).toContain("сердце");
    expect(card).toContain("покров");
    expect(card).toContain("прочность");
    expect(card).toContain("в операционную");
    expect(card).toContain(`data-info-room="${torso}"`);
    const head = partInfoHtml(body, { node: 1 });
    expect(head).toContain("окончания");
    expect(bodyHash(body)).toBe(before);
    expect(validate(body)).toEqual([]);
  });

  it("a part the body does not have has no card", () => {
    expect(partInfoHtml(human(), { segment: 9999 })).toBe("");
    expect(partInfoHtml(human(), { node: 9999 })).toBe("");
  });

  it("the card lives in the hash, and the hash no longer carries a cut to preview", () => {
    for (const view of [{ info: { node: 3 } }, { info: { segment: 12 } }] as const) {
      const back = decode(`#${encode(decode("").state, view)}`);
      expect(back.view).toEqual(view);
    }
    expect(encode(decode("").state, { info: { segment: 12 } })).toContain("i=s12");
  });

  // "the lab cuts nothing on a click" was removed here: it grepped `main.ts`'s
  // source for `openPart`/`t: "cut"` instead of exercising behavior. `main.ts`
  // exports nothing to call (it is a page script bound to `document`), and
  // this task cannot touch `apps/lab` to make it testable without a DOM.
});

describe("the places of a row", () => {
  it("the list is as long as the counter says, for every row that has a place on the human", () => {
    const body = human();
    let checked = 0;
    for (const m of CATALOG) {
      const places = placeTargets(body, m.id);
      const html = placeHtml(m.id, body);
      if (places.length === 0) {
        expect(html).toContain("ни одного места");
        continue;
      }
      checked += 1;
      const buttons = [...html.matchAll(/data-place="(\d+)"/g)].map((x) => Number(x[1]));
      expect(buttons, m.id).toEqual(places.map((_, i) => i));
      expect(html, m.id).toContain(`· ${places.length}`);
    }
    expect(checked).toBeGreaterThan(50);
  });

  it("every line names the part in the words a player reads", () => {
    const body = human();
    const html = placeHtml("extraArm", body);
    expect(html).toContain("голова");
    expect(html).toContain("кисть");
    expect(html).not.toMatch(/undefined|\[object/);
  });

  it("the line about a row is optional: the picker says nothing while the catalog carries no table", () => {
    for (const id of ["extraArm", "noSuchRow"]) expect(typeof mutationAbout(id), id).toBe("string");
    expect(mutationAbout("noSuchRow")).toBe("");
  });

  // "the page keeps the list of places foldable" was removed here: it grepped
  // `main.ts` and `lab.css` for literal strings (`hand.places`, a CSS
  // `max-height` rule) instead of measuring layout, which jsdom cannot do
  // without a real browser and is out of scope for this task.
});
