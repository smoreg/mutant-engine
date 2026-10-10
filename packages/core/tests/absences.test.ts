/**
 * An absence is the organ gone, not an organ that says so (the owner:
 * «свойства вроде слепоты — никак не лечатся? новые мутации и удаление глаз —
 * это ж слепота»). Blindness takes the eyes out of a head and deafness the ears;
 * the sense is read off the organs, as derive always read it, so a new eye
 * grown by the catalog gives the sight back and the knife that takes the eyes
 * makes the same blindness (decision 1250).
 */
import { describe, expect, it } from "vitest";
import {
  applyMutationAt,
  anatomy,
  derive,
  human,
  mutationById,
  mutationTargets,
  operationsFor,
  organs,
  outcomeOf,
  type Body,
  type Operation,
  type OrganKind,
} from "../index.js";

function grow(body: Body, id: string): boolean {
  const m = mutationById(id)!;
  const list = mutationTargets(body, m);
  if (list.length === 0) return false;
  applyMutationAt(body, m, list[0]!.target);
  return true;
}

function kinds(body: Body): OrganKind[] {
  return [...organs(body)].map((o) => o.kind);
}

/** The knife takes out one organ of the kind, if the room offers it. */
function excise(body: Body, kind: OrganKind): Body | null {
  for (const part of anatomy(body)) {
    const ops: Operation[] = operationsFor(body, part);
    for (const po of part.organs) {
      if (po.organ.kind !== kind) continue;
      const code = JSON.stringify(po.excise);
      const op = ops.find((o) => (o.kind === "excise" || o.kind === "trim") && JSON.stringify(o.command) === code);
      if (op !== undefined) return outcomeOf(body, op).after;
    }
  }
  return null;
}

const SIGHT: OrganKind[] = ["eye", "facetEye", "heatEye"];
const HEARING: OrganKind[] = ["ear", "earCluster"];

describe("blindness is the eyes gone", () => {
  it("the blindness row takes every eye out of the head: sight 0, and no organ called blindness", () => {
    const b = human();
    expect(derive(b).senses.sight).toBe(true);
    expect(grow(b, "blindness")).toBe(true);
    expect(kinds(b).filter((k) => SIGHT.includes(k))).toEqual([]);
    expect(kinds(b)).not.toContain("blindness");
    const d = derive(b).senses;
    expect(d.sight).toBe(false);
    expect(d.viewpoints).toEqual([]);
    // Nothing left to take: a blind body offers the row no head.
    expect(mutationTargets(b, mutationById("blindness")!)).toEqual([]);
  });

  it("a new eye grown by the catalog gives the sight back", () => {
    const b = human();
    grow(b, "blindness");
    const targets = mutationTargets(b, mutationById("extraEye")!);
    expect(targets.length, "the eye row finds the eyeless head").toBeGreaterThan(0);
    expect(grow(b, "extraEye")).toBe(true);
    expect(derive(b).senses.sight).toBe(true);
  });

  it("the knife that takes both eyes out makes the same blindness", () => {
    let b: Body | null = human();
    for (let i = 0; i < 2; i++) {
      b = excise(b!, "eye");
      expect(b, `глаз ${i + 1} не вырезается`).not.toBeNull();
    }
    expect(kinds(b!).filter((k) => SIGHT.includes(k))).toEqual([]);
    expect(derive(b!).senses.sight).toBe(false);
    expect(grow(b!, "extraEye")).toBe(true);
    expect(derive(b!).senses.sight).toBe(true);
  });
});

describe("deafness is the ears gone", () => {
  it("the deafness row takes the ears out: hearing 0, and no organ called deafness", () => {
    const b = human();
    expect(derive(b).senses.hearing).toBe(2);
    expect(grow(b, "deafness")).toBe(true);
    expect(kinds(b).filter((k) => HEARING.includes(k))).toEqual([]);
    expect(kinds(b)).not.toContain("deafness");
    expect(derive(b).senses.hearing).toBe(0);
    expect(mutationTargets(b, mutationById("deafness")!)).toEqual([]);
  });

  it("a new ear grown by the catalog gives the hearing back", () => {
    const b = human();
    grow(b, "deafness");
    expect(grow(b, "ear")).toBe(true);
    expect(derive(b).senses.hearing).toBeGreaterThan(0);
  });

  it("the knife that takes both ears out makes the same deafness", () => {
    let b: Body | null = human();
    for (let i = 0; i < 2; i++) {
      b = excise(b!, "ear");
      expect(b, `ухо ${i + 1} не вырезается`).not.toBeNull();
    }
    expect(derive(b!).senses.hearing).toBe(0);
    expect(grow(b!, "ear")).toBe(true);
    expect(derive(b!).senses.hearing).toBeGreaterThan(0);
  });
});

describe("what is not an absence of an organ", () => {
  it("no row of the catalog grows blindness or deafness as an organ any more", () => {
    for (const id of ["blindness", "deafness"]) expect(mutationById(id)!.op, id).toBe("lose");
  });

  it.todo("немота — отсутствие голоса, а органа голоса у модели нет: речь — это челюсть (решение 62), снять челюсть значит отнять и еду, и укус; немота остаётся свойством, пока не появится гортань");
  it.todo("аносмия — строки в каталоге нет; если нужна — строка `lose` носа и обонятельного органа (сдвинет все броски каталога)");
});
