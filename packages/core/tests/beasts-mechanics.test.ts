/**
 * One body per mechanic, grown the way the game grows it - a row of the
 * catalog through `applyMutationAt` - so the test walks the real path and not
 * a hand-drawn shortcut: wings, psionics, fire. Each checks that the ability
 * appears, that it means something against the body that carries it, and what
 * it does in a fight. Where the model has no mechanic yet, `it.todo` says what
 * is missing instead of inventing it.
 */
import { describe, expect, it } from "vitest";
import {
  FLIGHT_AREA,
  HUMAN_TEXT,
  LabRng,
  WING_LOAD,
  applyMutationAt,
  beastById,
  bodyFromText,
  brains,
  breathCost,
  derive,
  fixtureBody,
  hasTag,
  human,
  mass,
  mentalLoad,
  mutationById,
  mutationTargets,
  newHarm,
  organs,
  planStrike,
  runBattle,
  strikes,
  type Body,
} from "../index.js";

/** Grows the catalog row on the first target it offers; false when it offers none. */
function grow(body: Body, id: string): boolean {
  const m = mutationById(id);
  if (m === undefined) throw new Error(`no row ${id}`);
  const list = mutationTargets(body, m);
  if (list.length === 0) return false;
  applyMutationAt(body, m, list[0]!.target);
  return true;
}

function wingArea(body: Body): number {
  return derive(body).locomotion.wings.reduce((a, w) => a + w.area, 0);
}

// ---------------------------------------------------------------- wings

describe("wings: flight is skin in the air against the weight of the body", () => {
  it("one pair on human arms is too little skin; two pairs carry a human", () => {
    const b = human();
    expect(grow(b, "wings")).toBe(true);
    expect(wingArea(b)).toBeLessThan(FLIGHT_AREA);
    expect(derive(b).locomotion.fly).toBe(false);
    expect(derive(b).locomotion.falls).toBe(true);
    expect(grow(b, "wings")).toBe(true);
    expect(wingArea(b)).toBeGreaterThanOrEqual(FLIGHT_AREA);
    expect(wingArea(b) * WING_LOAD).toBeGreaterThanOrEqual(mass(b));
    const d = derive(b);
    expect(d.locomotion.fly).toBe(true);
    expect(d.locomotion.falls).toBe(false);
    // Flying works the wings: it costs more air than a step.
    expect(d.breath.muscles.wings).toBeGreaterThan(0);
    expect(breathCost(d, "fly")).toBeGreaterThan(breathCost(d, "step"));
  });

  it("the same two pairs do not lift a heavy body: a spider of 254 on 12 of skin stays on the ground", () => {
    const light = human();
    grow(light, "wings");
    grow(light, "wings");
    const heavy = fixtureBody(beastById("spider")!);
    expect(grow(heavy, "wings")).toBe(true);
    expect(grow(heavy, "wings")).toBe(true);
    expect(wingArea(heavy)).toBe(wingArea(light));
    expect(mass(heavy)).toBeGreaterThan(wingArea(heavy) * WING_LOAD);
    expect(derive(light).locomotion.fly).toBe(true);
    expect(derive(heavy).locomotion.fly).toBe(false);
  });

  it("every winged beast of the bestiary is light enough for its wings", () => {
    for (const id of ["dragon", "gargoyle", "griffin", "harpy", "basilisk", "bat", "sphinx", "mantis"]) {
      const b = fixtureBody(beastById(id)!);
      expect(derive(b).locomotion.fly, id).toBe(true);
      expect(wingArea(b) * WING_LOAD, id).toBeGreaterThanOrEqual(mass(b));
    }
  });

  it.todo("в бою летящего не достаёт ползучий: у боя нет высоты и позиции — дистанция одна на весь бой (battle.md «Позиция»), полёт в бою не читается никем");
  it.todo("взмах крыла — удар (мутации, отложено: «взмах: сбить с ног соседа»): у перепонки нет строки удара в WEAPONS и в HIT_TYPES");
});

// ---------------------------------------------------------------- psionics

describe("psionics: a head that thinks pays for it in channels", () => {
  it("a psionic row lands in the head with the brain and weighs on the mind: its control plus two", () => {
    const b = human();
    const before = mentalLoad(b);
    expect(grow(b, "terror")).toBe(true);
    const after = mentalLoad(b);
    expect(after.psionics - before.psionics).toBe(2);
    expect(after.control - before.control).toBe(3);
    const head = [...organs(b)].find((o) => o.kind === "head")!;
    expect(head.contents!.some((c) => c.kind === "terror")).toBe(true);
    expect(head.contents!.some((c) => hasTag(c.kind, "brain"))).toBe(true);
  });

  it("no mind, no psionics: a head without a brain takes no psionic row, and a body without a head none at all", () => {
    const headless = bodyFromText(`
голова[2] {голова(глаз, глаз, челюсть, ухо, ухо, нос)}
грудь[3]
таз[3]
стопа.л[1] {стопа}
стопа.п[1] {стопа}
голова -шея:1/1 кожа- грудь
грудь -корпус:2/3 кожа {нервный ствол*, сердце, лёгкие, желудок}- таз
таз -нога:2/1 кожа- стопа.л
таз -нога:2/1 кожа- стопа.п
`);
    expect(brains(headless).every((x) => x.head === null)).toBe(true);
    const jelly = fixtureBody(beastById("jellyfish")!);
    for (const id of ["willPush", "mindSting", "terror", "telekinesis", "willShield"]) {
      expect(mutationTargets(headless, mutationById(id)!), `${id} в голове без мозга`).toEqual([]);
      expect(mutationTargets(jelly, mutationById(id)!), `${id} у медузы`).toEqual([]);
      // The human's head thinks, so the same row has somewhere to go.
      expect(mutationTargets(human(), mutationById(id)!).length, id).toBeGreaterThan(0);
    }
  });

  it("psionics strikes nothing yet: the fight sees no blow of the mind (the effect is a todo below)", () => {
    const b = human();
    grow(b, "mindSting");
    grow(b, "willPush");
    expect(strikes(b).map((s) => s.kind)).toEqual(strikes(human()).map((s) => s.kind));
  });

  it.todo("укол разума бьёт без касания: 3d6 по цели, мимо брони, откат −4 канала на 3 хода (отложено/mutations.md §10) — в strikes/battle нет удара органа-псионики");
  it.todo("толчок воли: отбросить цель на 4 и 2d6, откат −5 каналов на 4 хода (mind.md «Псионика») — отбрасывать некуда: у боя нет позиции, отката по каналам в модели нет");
  it.todo("ужас: все в радиусе 4 бегут 6 ходов — у policy нет бегства, у боя нет радиуса");
  it.todo("щит воли поглощает 20 урона на 15 ходов — у Harm нет щита, damage.ts не знает поглощения");
  it.todo("телекинез: хват 2 на расстоянии 6 без рук — grips читает только окончания");
  it.todo("откат псионики: каналы уходят на N ходов вперёд (mind.md) — mindPower не знает времени, срыв органов от отката не считается");
});

// ---------------------------------------------------------------- fire

function fireHuman(): Body {
  const b = human();
  expect(grow(b, "fireGland")).toBe(true);
  return b;
}

describe("fire: a gland breathes through a mouth, far, and pays from the reserve", () => {
  it("the catalog's fire gland in a human gives a cone of 2d6 three cells out of the mouth, burning, at 30 of the reserve", () => {
    const b = fireHuman();
    const fire = derive(b).attacks.filter((a) => a.kind === "fireGland");
    expect(fire).toHaveLength(1);
    expect(fire[0]).toMatchObject({ dice: "2d6", reach: 3 });
    const st = strikes(b).find((s) => s.kind === "fireGland")!;
    expect(st).toMatchObject({ reach: 3, burn: true, cost: 30 });
    expect(st.node).toBe(strikes(b).find((s) => s.kind === "head")!.node);
    // A gland is flesh with a price: the load on the channels grows by its control.
    expect(mentalLoad(b).control).toBe(mentalLoad(human()).control + 2);
  });

  it("no mouth, no fire: the same row in a body whose head has no jaw breathes nothing", () => {
    const mute = bodyFromText(HUMAN_TEXT.replace("глаз, глаз, челюсть,", "глаз, глаз,"));
    expect(grow(mute, "fireGland")).toBe(true);
    expect([...organs(mute)].some((o) => o.kind === "fireGland")).toBe(true);
    expect(derive(mute).attacks.some((a) => a.kind === "fireGland")).toBe(false);
  });

  it("no reserve, no fire: the volley leaves the gland out when the reserve cannot pay", () => {
    const b = fireHuman();
    const far = planStrike(b, human(), 3, { reserve: 400 });
    expect(far.planned.map((p) => p.strike.kind)).toEqual(["fireGland"]);
    const dry = planStrike(b, human(), 3, { reserve: 0 });
    expect(dry.planned).toEqual([]);
  });

  it("in a fight at three cells the fire burns the plain human, who never reaches back; each breath empties the reserve", () => {
    const r = runBattle(
      {
        fighters: [
          { id: "fire", side: "a", body: fireHuman() },
          { id: "plain", side: "b", body: human() },
        ],
        options: { distance: 3, maxTurns: 20 },
      },
      new LabRng(7),
    );
    const fire = r.fighters.find((f) => f.id === "fire")!;
    const plain = r.fighters.find((f) => f.id === "plain")!;
    expect(fire.dealt).toBeGreaterThan(0);
    expect(plain.dealt).toBe(0);
    expect(fire.harm.reserve).toBeLessThan(newHarm(fireHuman()).reserve);
    expect((newHarm(fireHuman()).reserve - fire.harm.reserve) % 30).toBe(0);
  });

  it.todo("огонь поджигает: горение как состояние цели на несколько ходов (отложено/mutations.md: «поджигает газ») — burn сейчас только цена боли раны, а не пожар");
});

