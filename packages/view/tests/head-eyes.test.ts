/**
 * A head's eyes are drawn on the head (decision 1257): the owner saw a
 * spider's eight eyes as white rings across its body, because the eyes beyond
 * a face's own slots went round the outside of the head.
 */
import { describe, expect, it } from "vitest";
import { BEASTS, FOES, fixtureBody, foeBody, nodeIds, type Body, type Organ } from "@mutant-engine/core";
import { EYE_KINDS, headEyes, type Dir } from "../index.js";

const SUBJECTS: { id: string; body: Body }[] = [
  ...FOES.map((f) => ({ id: `foe:${f.id}`, body: foeBody(f) })),
  ...BEASTS.map((b) => ({ id: b.id, body: fixtureBody(b) })),
];

function headsOf(body: Body): Organ[] {
  return nodeIds(body).flatMap((id) => body.nodes[id]!.ends.filter((o) => o.kind === "head"));
}

describe("the eyes of a head", () => {
  it("lie inside the head's own mask, for every beast and every foe, from every direction", () => {
    const bad: string[] = [];
    for (const s of SUBJECTS) {
      for (const head of headsOf(s.body)) {
        for (let d = 0; d < 8; d++) {
          const { mask, eyes } = headEyes(head, d as Dir);
          for (const e of eyes) {
            let out = 0;
            for (let j = 0; j < e.size; j++) {
              for (let i = 0; i < e.size; i++) {
                const x = e.x + i;
                const y = e.y + j;
                if (x < 0 || y < 0 || x >= mask.w || y >= mask.h || mask.rows[y]![x] === ".") out += 1;
              }
            }
            if (out > 0) bad.push(`${s.id}, dir ${d}: an eye at ${e.x},${e.y} has ${out} pixels off the head`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("are all drawn from the front: the spider shows its eight", () => {
    const spider = SUBJECTS.find((s) => s.id === "spider")!;
    const [head] = headsOf(spider.body);
    const eyes = head!.contents!.filter((o) => EYE_KINDS.has(o.kind)).length;
    expect(eyes).toBe(8);
    expect(headEyes(head!, 0).eyes).toHaveLength(8);
  });
});
