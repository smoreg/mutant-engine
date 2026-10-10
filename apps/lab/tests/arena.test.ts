/**
 * The arena tab: two fighters from the bestiary, the foes, a human, the lab's
 * mutant or a body typed as text; a fight by the tape of `tape.ts` turn by
 * turn or to the end, or one named strike at one named part. Everything is in
 * the hash, and a link replays the same fight. The old strike and wound tabs
 * open here.
 */
import { describe, expect, it } from "vitest";
import {
  beastById,
  bodyHash,
  bodyToText,
  fixtureBody,
  foeBody,
  foeById,
  human,
  initialState,
  newHarm,
  strikeAt,
  LabRng,
} from "@mutant-engine/core";
import {
  ARENA_RU,
  SLOT_CHOICES,
  battleLines,
  decodeArena,
  encodeArena,
  fightAll,
  fightStep,
  fighterOf,
  initialArena,
  openFight,
  slotBody,
  strikeWord,
  type ArenaState,
} from "../arena.js";
import { simulate } from "../damage.js";
import { TABS, decode, encode } from "../hash.js";

const wolf = { k: "beast", id: "wolf" } as const;

function fightOf(a: ArenaState, lab = human()) {
  return openFight(a, slotBody(a.left, lab).body, slotBody(a.right, lab).body);
}

function logOf(a: ArenaState): string {
  return JSON.stringify(fightOf(a).tape.battle.log);
}

describe("the slots", () => {
  it("every choice is a sound body: the human, every foe, every beast, the lab's mutant, a body as text", () => {
    const lab = fixtureBody(beastById("cat")!);
    expect(SLOT_CHOICES.some((c) => c.slot.k === "lab")).toBe(true);
    expect(SLOT_CHOICES.filter((c) => c.slot.k === "foe").length).toBeGreaterThan(0);
    expect(SLOT_CHOICES.filter((c) => c.slot.k === "beast").length).toBeGreaterThan(20);
    for (const c of SLOT_CHOICES) expect(slotBody(c.slot, lab).body.nodes, c.label).toBeDefined();
    expect(bodyHash(slotBody({ k: "lab" }, lab).body)).toBe(bodyHash(lab));
    expect(bodyHash(slotBody(wolf, lab).body)).toBe(bodyHash(fixtureBody(beastById("wolf")!)));
    expect(bodyHash(slotBody({ k: "foe", id: "troll" }, lab).body)).toBe(bodyHash(foeBody(foeById("troll"))));
    const text = bodyToText(fixtureBody(beastById("dragon")!));
    expect(bodyHash(slotBody({ k: "text", text }, lab).body)).toBe(bodyHash(fixtureBody(beastById("dragon")!)));
  });

  it("a body text that does not parse stands a human in and says why", () => {
    const r = slotBody({ k: "text", text: "not a body" }, human());
    expect(r.error).not.toBeNull();
    expect(bodyHash(r.body)).toBe(bodyHash(human()));
  });
});

describe("the hash", () => {
  it("the arena state rides whole in the hash: fighters, mode, seed, distance, the tape, the strike and the part", () => {
    const a: ArenaState = {
      ...initialArena(),
      mode: "strike",
      seed: 42,
      distance: 2,
      toDeath: true,
      left: { k: "text", text: bodyToText(human()) },
      right: wolf,
      moves: [{ k: "strike", target: "R" }, { k: "strike", target: "R" }, { k: "auto" }],
      attacker: "r",
      strike: "1.0",
      part: 12,
    };
    const back = decode(`#${encode(initialState(), { tab: "arena", arena: encodeArena(a) })}`);
    expect(back.view.tab).toBe("arena");
    expect(decodeArena(back.view.arena)).toEqual(a);
  });

  it("the initial arena writes nothing, and a broken field falls back to its default", () => {
    expect(encodeArena(initialArena())).toBeUndefined();
    const d = decodeArena("m.x~sd.zz~l.z.nobody~r.f.troll~mv.s?s");
    expect(d.mode).toBe("fight");
    expect(d.seed).toBe(1);
    expect(d.left).toEqual(initialArena().left);
    expect(d.right).toEqual({ k: "foe", id: "troll" });
  });

  it("the old tabs open the arena: the strike tab as a fight with its foe, the wound tab as the strike mode on the lab's mutant", () => {
    expect(TABS).toContain("arena");
    expect(TABS).not.toContain("strike");
    expect(TABS).not.toContain("damage");
    const strike = decode("#s=1&b=h&sp=1&tab=strike&foe=troll");
    expect(strike.view.tab).toBe("arena");
    const s = decodeArena(strike.view.arena, strike.view.foe);
    expect(s.mode).toBe("fight");
    expect(s.left).toEqual({ k: "lab" });
    expect(s.right).toEqual({ k: "foe", id: "troll" });
    const damage = decode("#s=1&b=h&sp=1&tab=damage&dmg=eyJzIjozLCJoIjowLCJjIjpbXX0");
    expect(damage.view.tab).toBe("arena");
    expect(damage.view.damage).toBe("eyJzIjozLCJoIjowLCJjIjpbXX0");
    const d = decodeArena(damage.view.arena, damage.view.foe);
    expect(d.mode).toBe("strike");
    // The wound tab struck the lab's mutant: the target is the left slot, the attacker the right.
    expect(d.attacker).toBe("r");
    expect(d.left).toEqual({ k: "lab" });
  });
});

describe("the fight", () => {
  it("a fight replays from the link: the same seed and the same tape are the same events", () => {
    const a: ArenaState = { ...initialArena(), left: { k: "human" }, right: wolf, seed: 7 };
    const f = fightOf(a);
    for (let i = 0; i < 4; i++) fightStep(f);
    const played: ArenaState = { ...a, moves: [...f.moves] };
    const back = decodeArena(encodeArena(played));
    expect(logOf(back)).toBe(JSON.stringify(f.tape.battle.log));
    fightAll(f);
    const whole = decodeArena(encodeArena({ ...a, moves: [...f.moves] }));
    expect(logOf(whole)).toBe(JSON.stringify(f.tape.battle.log));
    expect(f.tape.battle.result).not.toBeNull();
  });

  it("another seed is another fight", () => {
    const a: ArenaState = { ...initialArena(), left: { k: "human" }, right: wolf, moves: [{ k: "auto" }] };
    const logs = new Set([1, 2, 3, 4].map((seed) => logOf({ ...a, seed })));
    expect(logs.size).toBeGreaterThan(1);
  });

  it("one turn is one word of the left fighter and the answer of the right one", () => {
    const f = fightOf({ ...initialArena(), left: { k: "human" }, right: wolf });
    const events = fightStep(f);
    expect(f.moves.length).toBe(1);
    expect(events.some((e) => e.k === "act" && e.who === "L")).toBe(true);
    expect(events.some((e) => e.k === "act" && e.who === "R")).toBe(true);
  });

  it("to the end: someone is down or dead, and the log says in words who struck what with what", () => {
    const f = fightOf({ ...initialArena(), left: { k: "human" }, right: wolf, seed: 3 });
    fightAll(f);
    const r = f.tape.battle.result!;
    expect(r).not.toBeNull();
    const lines = battleLines(f.tape.battle.log, f).map((l) => l.text);
    const text = lines.join("\n");
    expect(text).toContain(ARENA_RU.side.L);
    expect(text).toContain(ARENA_RU.side.R);
    // A wolf bites with its fangs; its blows are named, the parts they found are named.
    expect(text).toMatch(/хищные челюсти/);
    expect(lines.some((l) => /урона/.test(l))).toBe(true);
    expect(lines[lines.length - 1]).toMatch(new RegExp(`${ARENA_RU.end.beaten}|${ARENA_RU.end.empty}|${ARENA_RU.end.limit}`));
    const loser = r.fighters.find((x) => x.side !== r.winner && !x.severed);
    if (r.winner !== null) expect(text).toMatch(loser!.state === "dead" ? ARENA_RU.dead : ARENA_RU.down);
  });

  it("to the death: the fight does not stop when a side falls", () => {
    const f = fightOf({ ...initialArena(), left: { k: "human" }, right: { k: "human" }, seed: 2, toDeath: true });
    fightAll(f);
    const r = f.tape.battle.result!;
    if (r.reason === "beaten") expect(r.fighters.some((x) => x.state === "dead" && !x.severed)).toBe(true);
  });

  it("the fighters as they stand: the left and the right by id, the bodies the battle keeps", () => {
    const f = fightOf({ ...initialArena(), left: { k: "human" }, right: wolf });
    expect(fighterOf(f, "L")!.side).toBe("L");
    expect(fighterOf(f, "R")!.side).toBe("R");
  });
});

describe("the strike mode", () => {
  const FIRE = "1.o23.2";
  const dragon = () => fixtureBody(beastById("dragon")!);

  it("a named strike at a named part goes through the damage run and lands there or misses with the chance shown", () => {
    let hits = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const run = simulate(human(), { seed, hunger: false, commands: [{ t: "strike", key: FIRE, at: 1 }] }, { attacker: dragon() });
      const step = run.steps[1]!;
      expect(step.title).toContain(strikeWord(dragon(), FIRE));
      const ev = step.events.filter((e) => e.k === "hit");
      for (const e of ev) if (e.k === "hit") expect(e.id).toBe(1);
      if (ev.length > 0) hits += 1;
      expect(step.title).toMatch(ev.length > 0 ? ARENA_RU.strike.hit : ARENA_RU.strike.miss);
    }
    expect(hits).toBeGreaterThan(0);
  });

  it("the run's blow is the model's blow: the same seed, the same body", () => {
    const run = simulate(human(), { seed: 5, hunger: false, commands: [{ t: "strike", key: FIRE, at: 1 }] }, { attacker: dragon() });
    const body = human();
    const harm = newHarm(body);
    strikeAt(dragon(), FIRE, body, harm, 1, new LabRng("damage:5"));
    expect(bodyHash(run.steps[1]!.body)).toBe(bodyHash(body));
  });

  it("without an attacker a strike command is a step that does nothing", () => {
    const run = simulate(human(), { seed: 1, hunger: false, commands: [{ t: "strike", key: FIRE, at: 1 }] });
    expect(run.steps[1]!.events).toEqual([]);
  });
});
