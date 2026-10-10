/**
 * No beast carries a paradox of its stats (the owner's requirement): every
 * number `derive` reads off a creature of the bestiary or of the foes has the
 * organ it comes from, and every organ that should give a number gives it.
 * Each rule is a property over the whole table, not a case: a beast drawn
 * tomorrow is held to it without anyone writing a line here.
 */
import { describe, expect, it } from "vitest";
import {
  BEASTS,
  CRAWL_SPEED,
  FLIGHT_AREA,
  FOES,
  MEMBRANES,
  ORGANS,
  WING_LOAD,
  brains,
  controlCap,
  controlLoad,
  derive,
  fixtureBody,
  foeBody,
  hasTag,
  mass,
  organs,
  parseDice,
  segmentIds,
  sortedIds,
  strikes,
  summarize,
  type Body,
  type Organ,
  type OrganKind,
} from "../index.js";

interface Subject {
  id: string;
  body: () => Body;
}

const SUBJECTS: Subject[] = [
  ...FOES.map((f): Subject => ({ id: `foe:${f.id}`, body: () => foeBody(f) })),
  ...BEASTS.map((b): Subject => ({ id: b.id, body: () => fixtureBody(b) })),
];

/** Every organ of the body, head contents included, as a flat list of kinds. */
function kinds(body: Body): OrganKind[] {
  return [...organs(body)].map((o) => o.kind);
}

function count(body: Body, of: ReadonlySet<OrganKind>): number {
  return kinds(body).filter((k) => of.has(k)).length;
}

const EYES = new Set<OrganKind>(["eye", "facetEye"]);
const EARS = new Set<OrganKind>(["ear", "earCluster"]);
const NOSES = new Set<OrganKind>(["nose", "scentOrgan", "snout"]);

/** Heads of the body. */
function heads(body: Body): Organ[] {
  return [...organs(body)].filter((o) => o.kind === "head");
}

/** A head content that chews: the jaw, and every jaw of the family that sits in a head (fangs, mandibles...). */
function chews(o: Organ): boolean {
  return ORGANS[o.kind].flags?.includes("eat") === true || (ORGANS[o.kind].family === "jaws" && ORGANS[o.kind].mounts.includes("head"));
}

describe("the bestiary has no paradoxes of stats", () => {
  it("covers every foe and every beast, the dog and the cat among them", () => {
    expect(SUBJECTS.length).toBe(FOES.length + BEASTS.length);
    for (const id of ["dog", "cat"]) expect(SUBJECTS.some((s) => s.id === id), id).toBe(true);
  });

  it("every number is finite and none is negative", () => {
    for (const s of SUBJECTS) {
      const d = derive(s.body());
      for (const [key, v] of Object.entries(summarize(d))) {
        if (typeof v !== "number") continue;
        expect(Number.isFinite(v), `${s.id}.${key} = ${v}`).toBe(true);
        expect(v, `${s.id}.${key}`).toBeGreaterThanOrEqual(0);
      }
      expect(d.budgets.mass, s.id).toBeGreaterThan(0);
      expect(d.breath.tank.total, s.id).toBeGreaterThan(0);
    }
  });

  it("a sense has its organ: sight has eyes, hearing ears, smell a nose, echo, heat and depth their own", () => {
    for (const s of SUBJECTS) {
      const body = s.body();
      const d = derive(body).senses;
      const eyes = d.viewpoints.reduce((n, v) => n + v.eyes, 0);
      expect(eyes, `${s.id}: глаз в обзоре больше, чем глаз в теле`).toBeLessThanOrEqual(count(body, EYES));
      expect(d.sight, `${s.id}: зрение без глаз`).toBe(eyes > 0);
      expect(d.hearing, `${s.id}: слух без ушей`).toBeLessThanOrEqual(count(body, EARS));
      expect(d.smell, `${s.id}: нюх без носа`).toBeLessThanOrEqual(count(body, NOSES));
      if (d.echo) expect(kinds(body), `${s.id}: эхолокация без органа`).toContain("echo");
      if (d.heat) expect(kinds(body), `${s.id}: тепловое зрение без органа`).toContain("heatEye");
      if (d.deep) expect(kinds(body), `${s.id}: глубинное чутьё без органа`).toContain("deepSense");
    }
  });

  it("a sense organ is heard: a body with ears hears, with a nose smells, with eyes sees", () => {
    for (const s of SUBJECTS) {
      const body = s.body();
      const d = derive(body).senses;
      if (count(body, EARS) > 0) expect(d.hearing, `${s.id}: уши есть, слуха нет`).toBeGreaterThan(0);
      if (count(body, NOSES) > 0) expect(d.smell, `${s.id}: нос есть, нюха нет`).toBeGreaterThan(0);
      if (count(body, EYES) > 0) expect(d.sight, `${s.id}: глаза есть, зрения нет`).toBe(true);
    }
  });

  it("speech has a jaw to speak with and air to speak on", () => {
    for (const s of SUBJECTS) {
      const d = derive(s.body());
      if (!d.senses.speak) continue;
      const k = kinds(s.body());
      expect(k.includes("jaw") || k.includes("twoFaces"), `${s.id}: речь без челюсти`).toBe(true);
      expect(d.breath.intake.air, `${s.id}: речь без воздуха`).toBeGreaterThan(0);
    }
  });

  it("speed stands on something: no stand and no crawl, no speed; every stand is an ending that stands", () => {
    for (const s of SUBJECTS) {
      const body = s.body();
      const sp = derive(body).speed;
      expect(sp.value > 0, `${s.id}: скорость ${sp.value} при ${sp.stands.length} опорах`).toBe(sp.stands.length > 0 || sp.crawl);
      if (sp.stands.length > 0) expect(sp.crawl, `${s.id}: ходит и ползёт разом`).toBe(false);
      expect(sp.support > 0, s.id).toBe(sp.stands.length > 0);
      for (const st of sp.stands) expect(ORGANS[st.kind].stand ?? 0, `${s.id}: опора на ${st.kind}`).toBeGreaterThan(0);
    }
  });

  it("every creature gets somewhere: it walks, crawls, swims or flies (decision 1238)", () => {
    for (const s of SUBJECTS) {
      const d = derive(s.body());
      expect(d.speed.value > 0 || d.locomotion.swim || d.locomotion.fly, `${s.id}: не двигается ничем`).toBe(true);
      // Speed without a stand is a crawl, and a crawl is a body built for it: a long belly or tentacles in suckers.
      if (d.speed.stands.length === 0 && d.speed.value > 0) expect(d.speed.crawl, `${s.id}: скорость без опор и без ползания`).toBe(true);
      // A longer belly crawls faster (decision 1261): the plain crawl under the load is the least of it (decision 1290).
      if (d.speed.crawl) expect(d.speed.value, s.id).toBeGreaterThanOrEqual(Math.round(CRAWL_SPEED * d.speed.burden));
    }
    for (const id of ["snake", "octopus"]) {
      const d = derive(fixtureBody(BEASTS.find((b) => b.id === id)!));
      expect(d.speed.crawl, `${id} ползёт`).toBe(true);
      expect(d.speed.value, id).toBeGreaterThan(0);
    }
    const jelly = derive(fixtureBody(BEASTS.find((b) => b.id === "jellyfish")!));
    expect(jelly.speed.value, "медуза на суше не ползёт").toBe(0);
    expect(jelly.locomotion.swim, "медуза плавает").toBe(true);
  });

  it("swimming is a fin, a fin sheet or a swimming part, never a cover: scaled legs do not swim (decision 1239)", () => {
    for (const s of SUBJECTS) {
      const body = s.body();
      if (!derive(body).locomotion.swim) continue;
      const growth = segmentIds(body).some((id) => body.segments[id]!.growths.some((g) => ORGANS[g.kind].flags?.includes("swim")));
      const sheet = sortedIds(body.membranes).some((id) => MEMBRANES[body.membranes[id]!.kind].flags?.includes("swim"));
      const ending = [...organs(body)].some((o) => ORGANS[o.kind].flags?.includes("swim"));
      expect(growth || sheet || ending, `${s.id}: плавает без плавника`).toBe(true);
    }
    for (const id of ["harpy", "basilisk", "dragon", "gorgon"]) expect(derive(fixtureBody(BEASTS.find((b) => b.id === id)!)).locomotion.swim, `${id} не плавает`).toBe(false);
  });

  it("a wet body breathes no air through its skin: pores under slime take water (decision 1240)", () => {
    for (const s of SUBJECTS) {
      const body = s.body();
      for (const o of derive(body).breath.organs) {
        if (o.kind !== "pores") continue;
        const wet = body.segments[o.at]!.cover === "slime";
        expect(o.air, `${s.id}: поры под ${body.segments[o.at]!.cover} дышат воздухом`).toBe(wet ? 0 : 1);
        expect(o.water, s.id).toBe(wet ? 1 : 0);
      }
    }
    const jelly = derive(fixtureBody(BEASTS.find((b) => b.id === "jellyfish")!)).breath;
    expect(jelly.intake.air, "медуза не дышит воздухом").toBe(0);
    expect(jelly.media).toEqual(["water"]);
  });

  it("a grip is an ending that holds: no grip out of a jaw, a foot or a bare stump", () => {
    for (const s of SUBJECTS) {
      const g = derive(s.body()).grips;
      expect(g.total, s.id).toBe(g.list.length);
      for (const x of g.list) expect(ORGANS[x.kind].grip ?? 0, `${s.id}: хват у ${x.kind}`).toBeGreaterThan(0);
    }
  });

  it("flight has wings that carry the body: area over the threshold and over the weight", () => {
    for (const s of SUBJECTS) {
      const body = s.body();
      const loco = derive(body).locomotion;
      const area = loco.wings.reduce((a, w) => a + w.area, 0);
      if (!loco.fly) continue;
      expect(loco.wings.length, `${s.id}: летает без крыльев`).toBeGreaterThan(0);
      expect(area, `${s.id}: крыльев ${area}`).toBeGreaterThanOrEqual(FLIGHT_AREA);
      expect(area * WING_LOAD, `${s.id}: крылья ${area} не держат массу ${mass(body)}`).toBeGreaterThanOrEqual(mass(body));
    }
  });

  it("every creature breathes, and every medium it breathes has the organ that takes it", () => {
    for (const s of SUBJECTS) {
      const b = derive(s.body()).breath;
      expect(b.media.length, `${s.id}: не дышит ничем`).toBeGreaterThan(0);
      const air = b.organs.reduce((n, o) => n + o.air, 0);
      const water = b.organs.reduce((n, o) => n + o.water, 0);
      expect(b.intake.air, s.id).toBe(air);
      expect(b.intake.water, s.id).toBe(water);
      for (const o of b.organs) {
        const spec = (ORGANS as Record<string, { breath?: unknown }>)[o.kind]?.breath ?? (MEMBRANES as Record<string, { breath?: unknown }>)[o.kind]?.breath;
        expect(spec, `${s.id}: дышит ${o.kind}, у которого нет строки дыхания`).toBeDefined();
      }
    }
  });

  it("a body eats exactly when it has something to chew with and something to digest in", () => {
    for (const s of SUBJECTS) {
      const body = s.body();
      const endsEat = [...organs(body)].some((o) => ORGANS[o.kind].flags?.includes("eat") === true && ORGANS[o.kind].mounts.includes("end"));
      const headChews = heads(body).some((h) => (h.contents ?? []).some(chews));
      const digests = kinds(body).some((k) => hasTag(k, "digests"));
      expect(derive(body).eat.can, `${s.id}: жевать ${endsEat || headChews}, переваривать ${digests}`).toBe((endsEat || headChews) && digests);
    }
  });

  it("the mind has a brain: channels come from a brain, and no beast asks more of them than it has", () => {
    for (const s of SUBJECTS) {
      const body = s.body();
      expect(brains(body).length, `${s.id}: без мозга`).toBeGreaterThan(0);
      expect(controlCap(body), s.id).toBeGreaterThan(0);
      expect(controlLoad(body), `${s.id}: нагрузка выше каналов`).toBeLessThanOrEqual(controlCap(body));
      // A psionic organ sits in a head that thinks: a head without a brain has no mind to push with.
      for (const h of heads(body)) {
        if (!(h.contents ?? []).some((c) => hasTag(c.kind, "psionic"))) continue;
        expect((h.contents ?? []).some((c) => hasTag(c.kind, "brain")), `${s.id}: псионика в голове без мозга`).toBe(true);
      }
    }
  });

  it("every blow the fight throws is a blow derive lists: a head that bites has its bite in the table", () => {
    for (const s of SUBJECTS) {
      const body = s.body();
      const table = derive(body).attacks;
      for (const st of strikes(body)) {
        if (st.kind !== "head") continue;
        const a = table.find((x) => x.node === st.node && x.index === st.index);
        expect(a, `${s.id}: укус головы ${st.node} (${st.bite}) не в таблице атак`).toBeDefined();
        expect(a!.dice, `${s.id}: укус ${st.bite} в бою ${st.dice}, в таблице ${a!.dice}`).toBe(st.dice);
      }
    }
  });

  it("every attack has a die that parses and a reach of one to three cells", () => {
    for (const s of SUBJECTS) {
      for (const a of derive(s.body()).attacks) {
        expect(() => parseDice(a.dice), `${s.id}: ${a.kind} ${a.dice}`).not.toThrow();
        expect(a.reach, `${s.id}: ${a.kind}`).toBeGreaterThanOrEqual(1);
        expect(a.reach, `${s.id}: ${a.kind}`).toBeLessThanOrEqual(3);
        expect(a.mass, `${s.id}: ${a.kind}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("a heart pumps: every creature has blood, and delivery is two per working heart", () => {
    for (const s of SUBJECTS) {
      const body = s.body();
      const d = derive(body);
      expect(d.blood.hearts.length, `${s.id}: без сердца`).toBeGreaterThan(0);
      let hearts = 0;
      for (const sid of d.blood.hearts) for (const o of body.segments[sid]!.cavity) if (o.kind === "heart") hearts += 1;
      expect(d.breath.delivery, s.id).toBe(2 * hearts);
    }
  });

  it("an egg has a womb, a dig has a digger, a climb has a hold", () => {
    for (const s of SUBJECTS) {
      const body = s.body();
      const d = derive(body);
      if (d.locomotion.layEgg) expect(kinds(body).some((k) => hasTag(k, "eggs")), `${s.id}: кладка без матки`).toBe(true);
      if (d.locomotion.dig > 0) expect([...organs(body)].some((o) => (ORGANS[o.kind].dig ?? 0) > 0), `${s.id}: копает без копателя`).toBe(true);
      if (d.locomotion.climb) {
        const growthClimbs = segmentIds(body).some((id) => body.segments[id]!.growths.some((g) => ORGANS[g.kind].flags?.includes("climb")));
        const holds = [...organs(body)].some((o) => ORGANS[o.kind].flags?.includes("climb")) || segmentIds(body).some((id) => body.segments[id]!.cover === "suckers");
        expect(holds || growthClimbs, `${s.id}: лазает без когтя`).toBe(true);
      }
      if (sortedIds(body.membranes).length === 0) expect(d.locomotion.fly, `${s.id}: полёт без перепонок`).toBe(false);
    }
  });

  it("two different beasts never read the same: no two creatures share every stat", () => {
    const seen = new Map<string, string>();
    for (const s of SUBJECTS) {
      const key = JSON.stringify(summarize(derive(s.body())));
      expect(seen.get(key), `${s.id} читается так же, как ${seen.get(key)}`).toBeUndefined();
      seen.set(key, s.id);
    }
  });
});

describe("the dog and the cat, and their kin", () => {
  const body = (id: string): Body => fixtureBody(BEASTS.find((b) => b.id === id)!);

  it("four legs on claws, a tail, fur, one head with fangs; sizes in the order of life", () => {
    for (const id of ["dog", "cat", "wolf", "lion"]) {
      const b = body(id);
      const d = derive(b);
      expect(d.speed.stands.map((s) => s.kind), id).toEqual(["claw", "claw", "claw", "claw"]);
      expect(heads(b), id).toHaveLength(1);
      expect(heads(b)[0]!.contents!.map((c) => c.kind), id).toContain("fangs");
      expect(d.eat.can, id).toBe(true);
      // Climbing holds the body's mass (decision 1277): the small cats and dogs hang on four
      // claws, the lion is too heavy for them, as a real one mostly is.
      expect(d.locomotion.climb, `${id} climbs on its claws`).toBe(id !== "lion");
    }
    const human = derive(foeBody(FOES[0]!)).budgets.mass;
    const m = (id: string): number => mass(body(id));
    expect(m("cat")).toBeLessThan(m("dog"));
    expect(m("dog")).toBeLessThan(m("wolf"));
    expect(m("dog")).toBeLessThan(human);
    expect(m("lion")).toBeGreaterThan(1.5 * human);
  });

  it("the dog and the wolf smell better than a human; the cat has whiskers", () => {
    const human = derive(foeBody(FOES[0]!)).senses.smell;
    expect(derive(body("dog")).senses.smell).toBeGreaterThan(human);
    expect(derive(body("wolf")).senses.smell).toBeGreaterThan(human);
    expect(kinds(body("cat"))).toContain("whiskers");
    expect(kinds(body("lion"))).toContain("whiskers");
  });

  it("what the model cannot say is said in words: the cat's night sight and hidden claws", () => {
    const cat = BEASTS.find((b) => b.id === "cat")!;
    expect(cat.unexpressible.some((u) => u.includes("ночное зрение"))).toBe(true);
    expect(cat.unexpressible.some((u) => u.includes("втяжные"))).toBe(true);
  });
});
