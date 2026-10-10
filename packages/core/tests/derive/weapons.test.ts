/**
 * Weapon organs (strike.md §1.6, §1.8). The test is written on the cause, not
 * on the dragon: every organ the tables call a weapon - tagged `weapon`, or
 * carrying a die of its own - has to give a body either a strike or an
 * addition to one. A new gland in parts.ts fails here until someone says what
 * it does, and a fixture of the bestiary can be redrawn without rotting it.
 */
import { describe, expect, it } from "vitest";
import { ORGANS, WEAPONS, bodyFromText, derive, hasTag, strikes, type Attack, type Body, type OrganKind, fixtureBody, beastById } from "../../index.js";

const KINDS = Object.keys(ORGANS) as OrganKind[];

/** Organs the tables call weapons: the tag, or a die in the row. */
const WEAPON_KINDS = KINDS.filter((k) => hasTag(k, "weapon") || (ORGANS[k].attack ?? "") !== "");

/**
 * Glands of the family that are no weapon, each with what it does instead.
 * They stay silent on purpose: a cloud, a net, a curtain and a cure are effects
 * the damage track has no place for. A new gland has to join a list or the tag.
 */
const UTILITY_GLANDS: Partial<Record<OrganKind, string>> = {
  gland: "безымянная железа: полость и обмен, без эффекта",
  skinGland: "выводит наружу то, что тело уже умеет",
  acidBlood: "отвечает ранившему, а не бьёт",
  sporeGland: "облако спор — галлюцинация, а не рана (mind.md)",
  webGland: "сеть держит, а не ранит",
  pheromoneGland: "твари принимают за своего",
  inkSac: "завеса",
  gasSac: "облако, которое расползается само",
  pusGland: "течёт сама, шумит и оставляет след",
  tarGland: "цель прилипает и стоит",
  panaceaGland: "снимает болезнь и яд",
};

/**
 * A body that carries one organ where its row lets it sit: a head with a jaw
 * (a mouth for a gland to go out through), a torso with a cavity, an arm with
 * growths and a tip to hang an ending on.
 */
function bodyWith(kind: OrganKind): Body {
  const ru = ORGANS[kind].ru;
  const mounts = ORGANS[kind].mounts;
  // The head already holds a jaw; a second one is over the places of body-graph.md §3.
  const head = mounts.includes("head") && kind !== "jaw" ? `, ${ru}` : "";
  const end = mounts.includes("end") ? ru : "коготь";
  const cavity = mounts.includes("cavity") ? `, ${ru}` : "";
  // A growth goes on the arm, not on the torso: spines add to the blows of the chain they sit on.
  const growth = mounts.includes("growth") && !mounts.includes("cavity") && !mounts.includes("end") ? ` [${ru}]` : "";
  return bodyFromText(`
голова[2] {голова(мозг*, глаз, челюсть${head})}
грудь[3]
таз[3]
кисть[1] {${end}}
голова -шея:1/1 кожа- грудь
грудь -корпус:2/3 кожа {сердце, лёгкие, желудок${cavity}}- таз
грудь -рука:2/1 кожа${growth}- кисть
`);
}

function says(list: readonly Attack[], kind: OrganKind): { strike: boolean; addition: boolean } {
  return { strike: list.some((a) => a.kind === kind), addition: list.some((a) => a.extras.some((e) => e.from === kind)) };
}

describe("every weapon organ says something", () => {
  it("a strike of its own or an addition to another, on a body that carries it", () => {
    const silent: string[] = [];
    for (const kind of WEAPON_KINDS) {
      const heard = says(derive(bodyWith(kind)).attacks, kind);
      if (!heard.strike && !heard.addition) silent.push(`${kind} (${ORGANS[kind].ru})`);
    }
    expect(silent, "органы-оружие, которые не дают ни удара, ни добавки").toEqual([]);
    // Endings carry the list: it must not be an empty set that passes by itself.
    expect(WEAPON_KINDS.length).toBeGreaterThan(15);
    expect(WEAPON_KINDS.filter((k) => hasTag(k, "weapon"))).toHaveLength(8);
  });

  it("every gland of the family is either a weapon or named as no weapon", () => {
    const undecided = KINDS.filter((k) => ORGANS[k].family === "glands" && !WEAPON_KINDS.includes(k) && UTILITY_GLANDS[k] === undefined);
    expect(undecided, "железа без решения: оружие (тег weapon + строка в WEAPONS) или строка в UTILITY_GLANDS").toEqual([]);
    for (const k of Object.keys(UTILITY_GLANDS) as OrganKind[]) expect(WEAPONS[k], `${k} и оружие, и не оружие`).toBeUndefined();
  });
});

describe("a strike of the body and an addition to a blow are two things", () => {
  it("a venom gland gives no strike of its own; it makes the bite of its component venomous", () => {
    const b = bodyWith("venomGland");
    expect(says(derive(b).attacks, "venomGland")).toEqual({ strike: false, addition: true });
    const bite = strikes(b).find((s) => s.kind === "head")!;
    expect(bite.venom).toBe(true);
    expect(bite.extras.map((e) => e.kind)).toEqual(["venom"]);
    // The claw of the same body is no more venomous for it: venom rides a mouth (§1.6).
    expect(strikes(b).find((s) => s.kind === "claw")!.venom).toBe(false);
  });

  it("a fire gland gives a strike of its own, with its own reach, time, price and burn", () => {
    const b = bodyWith("fireGland");
    expect(says(derive(b).attacks, "fireGland")).toEqual({ strike: true, addition: false });
    const fire = strikes(b).find((s) => s.kind === "fireGland")!;
    expect(fire).toMatchObject({ dice: "2d6", reach: 3, time: 150, cost: 30, burn: true, index: null, chain: [], segment: null });
    // It goes out of the mouth, not out of the torso it sits in: the blow belongs to the head's node.
    expect(fire.node).toBe(strikes(b).find((s) => s.kind === "head")!.node);
    // Nothing else of the body catches fire from it.
    for (const s of strikes(b)) expect(s.burn, s.key).toBe(s.kind === "fireGland");
  });

  it("an acid gland does both: a spit of its own and a caustic bite", () => {
    const b = bodyWith("acidGland");
    expect(says(derive(b).attacks, "acidGland")).toEqual({ strike: true, addition: true });
    expect(strikes(b).find((s) => s.kind === "head")!.extras).toEqual([{ kind: "acid", bonus: 1, dice: "", burn: true, from: "acidGland" }]);
  });

  it("spines add to the blows of the chain they sit on, and to no other", () => {
    const b = bodyWith("spines");
    const claw = derive(b).attacks.find((a) => a.kind === "claw")!;
    expect(claw.extras.map((e) => e.kind)).toEqual(["spikes"]);
    // The jaw hangs off the neck, not off the spiked arm: its chain never runs over them.
    expect(derive(b).attacks.find((a) => a.kind === "jaw")!.extras).toEqual([]);
  });

  it("a gland with no mouth in its component breathes nothing", () => {
    const mute = bodyFromText(`
голова[2] {голова(мозг*, глаз)}
грудь[3]
таз[3]
голова -шея:1/1 кожа- грудь
грудь -корпус:2/3 кожа {сердце, лёгкие, огневая железа}- таз
`);
    expect(derive(mute).attacks.some((a) => a.kind === "fireGland")).toBe(false);
    // A discharge asks for no mouth: it leaves the flesh that holds it.
    const shock = bodyFromText(`
голова[2] {голова(мозг*, глаз)}
грудь[3]
таз[3]
голова -шея:1/1 кожа- грудь
грудь -корпус:2/3 кожа {сердце, лёгкие, электрический орган}- таз
`);
    expect(derive(shock).attacks.find((a) => a.kind === "electricOrgan")).toMatchObject({ dice: "1d8", reach: 2 });
  });
});

describe("the dragon breathes fire", () => {
  it("its fire gland is a blow of the bestiary's own dragon, and the volley takes it", () => {
    const dragon = fixtureBody(beastById("dragon")!);
    const fire = strikes(dragon).filter((s) => s.kind === "fireGland");
    expect(fire).toHaveLength(1);
    expect(fire[0]).toMatchObject({ dice: "2d6", type: "pierce", reach: 3, burn: true, cost: 30 });
    // The fire is the one blow of the body: it costs reserve, where a limb costs none.
    // How many limbs the dragon swings is the bestiary's business and moves with its fixture.
    const all = strikes(dragon);
    expect(all.filter((s) => s.cost > 0)).toEqual(fire);
    expect(all.length).toBeGreaterThan(fire.length);
  });
});
