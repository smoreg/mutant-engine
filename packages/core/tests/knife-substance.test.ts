/**
 * The knife cuts flesh: an organ, a part, a segment, a growth. A mutation that
 * is a property or an absence - deafness, blindness, a way of breeding, a
 * psionic power - has nothing to take out, and the operating room does not
 * offer to (decision 1225). The rule is a column of the organ table
 * (`substance`), not a list on the screen.
 */
import { LabRng as Rng } from "../rng.js";
import { describe, expect, it } from "vitest";
import {
  HUMAN_IDS,
  ORGANS,
  addMembrane,
  apply,
  applyMutation,
  bodyHash,
  bodyToText,
  human,
  isFlesh,
  mass,
  organs,
  validate,
  type Body,
  type OrganKind,
  MUTATIONS,
  decodeCommand,
  run,
  type LabState,
  anatomy,
  operationsFor,
  outcomeOf,
  type Operation,
  type Part,
} from "../index.js";

/** The rows that put one organ into the body, with the kind they put. */
const ORGAN_ROWS = MUTATIONS.filter((m) => m.op === "organ").map((m) => ({ m, kind: (m.payload as { organ: { kind: OrganKind } }).organ.kind }));

function count(body: Body, kind: OrganKind): number {
  let n = 0;
  for (const o of organs(body)) if (o.kind === kind) n++;
  return n;
}

/** A human with the row applied, on the first seed where it lands. */
function grown(id: string, kind: OrganKind): Body | null {
  for (let i = 0; i < 8; i++) {
    const b = human();
    const before = count(b, kind);
    const m = ORGAN_ROWS.find((r) => r.m.id === id)!.m;
    if (applyMutation(b, m, new Rng(`${id}-${i}`)) !== null && count(b, kind) > before) return b;
  }
  return null;
}

/** Every operation of the room that takes out one organ of this kind: the organ picked by its excise command. */
function organOps(body: Body, kind: OrganKind): Operation[] {
  const out: Operation[] = [];
  for (const part of anatomy(body)) {
    const ops = operationsFor(body, part);
    for (const po of part.organs) {
      if (po.organ.kind !== kind) continue;
      const code = JSON.stringify(po.excise);
      out.push(...ops.filter((o) => (o.kind === "excise" || o.kind === "trim") && JSON.stringify(o.command) === code));
    }
  }
  return out;
}

describe("the knife cuts flesh, not properties", () => {
  it("every organ kind says whether it is flesh or a trait", () => {
    for (const [kind, spec] of Object.entries(ORGANS)) expect(["flesh", "trait"], kind).toContain(spec.substance);
    expect(isFlesh("deafness")).toBe(false);
    expect(isFlesh("eye")).toBe(true);
  });

  it("muteness in a head: no `вырезать: немота из головы` (deafness is the ears gone since decision 1250)", () => {
    const body = grown("muteness", "muteness");
    expect(body).not.toBeNull();
    const names = anatomy(body!).flatMap((p) => operationsFor(body!, p).map((o) => `${o.verb}: ${o.what}`));
    expect(names.filter((n) => n.includes("немота"))).toEqual([]);
    // The head itself is flesh and still comes off, mute or not: the knife only lost the line it could not do.
    expect(names.some((n) => n.startsWith("вырезать: глаз"))).toBe(true);
  });

  const traits = ORGAN_ROWS.filter((r) => !isFlesh(r.kind));
  it("the trait rows are the properties, muteness among them; blindness and deafness take organs out and are no rows of an organ (decision 1250)", () => {
    const ids = traits.map((r) => r.m.id);
    for (const id of ["muteness", "noPain", "sterility", "paranoia", "telekinesis", "coldBlood"]) expect(ids).toContain(id);
    for (const id of ["blindness", "deafness"]) expect(ids).not.toContain(id);
  });

  for (const { m, kind } of traits) {
    it(`${m.id}: nothing to cut out`, () => {
      const body = grown(m.id, kind);
      if (body === null) return;
      expect(organOps(body, kind)).toEqual([]);
    });
  }

  for (const { m, kind } of ORGAN_ROWS.filter((r) => isFlesh(r.kind))) {
    it(`${m.id}: offered, and the flesh leaves`, () => {
      const body = grown(m.id, kind);
      if (body === null) return;
      const ops = organOps(body, kind);
      expect(ops.length, m.id).toBeGreaterThan(0);
      const after = outcomeOf(body, ops[0]!).after;
      expect(count(after, kind)).toBe(count(body, kind) - 1);
    });
  }
});

describe("the three cuts that take no organ: a membrane, a cover, a fusion (decisions 1226-1228)", () => {
  /** A human with a wing on the left arm, plates on the right leg and the hands fused. */
  function patchwork(): Body {
    const b = human();
    addMembrane(b, [HUMAN_IDS.armL, HUMAN_IDS.forearmL], "wing");
    b.segments[HUMAN_IDS.legR]!.cover = "plates";
    b.meat = Math.max(b.meat, mass(b));
    apply(b, "fusion", {}, { pair: [HUMAN_IDS.handL, HUMAN_IDS.handR] });
    return b;
  }

  function opsOfKind(body: Body, kind: Operation["kind"]): { part: Part; op: Operation }[] {
    return anatomy(body).flatMap((part) => operationsFor(body, part).filter((o) => o.kind === kind).map((op) => ({ part, op })));
  }

  it("each is offered once, on the part it is done to, with its own verb", () => {
    const b = patchwork();
    const wing = opsOfKind(b, "membrane");
    expect(wing).toHaveLength(1);
    expect(wing[0]!.op.verb).toBe("срезать перепонку");
    expect(wing[0]!.op.what).toBe("крыло");
    expect(wing[0]!.part.segment).toBe(HUMAN_IDS.armL);
    const cover = opsOfKind(b, "uncover");
    expect(cover).toHaveLength(1);
    expect(cover[0]!.op.verb).toBe("снять покров");
    expect(cover[0]!.op.what).toBe("костяные пластины");
    expect(cover[0]!.part.segment).toBe(HUMAN_IDS.legR);
    const fusion = opsOfKind(b, "unfuse");
    expect(fusion).toHaveLength(1);
    expect(fusion[0]!.op.verb).toBe("разъединить срастание");
    const plain = human();
    expect(opsOfKind(plain, "membrane").length + opsOfKind(plain, "uncover").length + opsOfKind(plain, "unfuse").length).toBe(0);
  });

  it("the preview is what the lab then does, and says what leaves", () => {
    const b = patchwork();
    const state: LabState = { seed: 1, start: { kind: "text", text: bodyToText(b) }, commands: [], spread: false };
    const r = run(state);
    for (const kind of ["membrane", "uncover", "unfuse"] as const) {
      const { op } = opsOfKind(r.body, kind)[0]!;
      expect(decodeCommand(op.code)).toEqual(op.command);
      const out = outcomeOf(r.body, op);
      const done = run({ ...state, commands: [op.command] }).body;
      expect(bodyHash(done), kind).toBe(bodyHash(out.after));
      expect(validate(out.after), kind).toEqual([]);
      expect(out.empty, kind).toBe(false);
    }
    expect(outcomeOf(r.body, opsOfKind(r.body, "membrane")[0]!.op).gone).toEqual(["крыло"]);
    expect(outcomeOf(r.body, opsOfKind(r.body, "uncover")[0]!.op).gone).toEqual(["костяные пластины"]);
    const unfuse = outcomeOf(r.body, opsOfKind(r.body, "unfuse")[0]!.op);
    expect(unfuse.wound).toBe(true);
    expect(unfuse.gone).toEqual(["срастание"]);
  });
});
