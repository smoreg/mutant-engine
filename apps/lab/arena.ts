/**
 * The arena tab without its page: two slots and what stands in them, the
 * state of the tab as it goes into the hash, and a fight kept on the tape of
 * `tape.ts` - one word of the left fighter per turn, the right one by the
 * temper that ships - so a link replays the fight roll for roll. The strike
 * mode runs through the wound simulator (`damage.ts`) with the model's
 * `strikeAt`. Nothing here counts a rule of its own. No DOM.
 */
import {
  BEASTS,
  DEATH_RU,
  FOES,
  LabRng,
  autoFight,
  bodyFromText,
  fixtureBody,
  foeBody,
  human,
  int,
  movePolicy,
  openTape,
  playMove,
  type BattleEvent,
  type Body,
  type Fighter,
  type Move,
  type Tape,
} from "@mutant-engine/core";
import { ARENA_RU, blowWord } from "./arena-words.js";
import { eventLines } from "./damage.js";
import { fromBase64Url, toBase64Url } from "./hash.js";

export { ARENA_RU, attackWord, blowWord, strikeWord } from "./arena-words.js";

/** What stands in a slot: the lab's mutant, a human, a foe, a beast of the bestiary, a body typed as text. */
export type Slot = { k: "lab" } | { k: "human" } | { k: "foe"; id: string } | { k: "beast"; id: string } | { k: "text"; text: string };

export type ArenaMode = "fight" | "strike";
export type SideKey = "l" | "r";

export interface ArenaState {
  mode: ArenaMode;
  seed: number;
  /** Cells between the two; 1 is adjacent. */
  distance: number;
  /** Fight on when a side falls, until it dies. */
  toDeath: boolean;
  left: Slot;
  right: Slot;
  /** The left fighter's tape: what was said, turn by turn. */
  moves: Move[];
  /** Who strikes in the strike mode; the other one is the target. */
  attacker: SideKey;
  /** The strike picked, by its key in `strikes()` of the attacker. */
  strike?: string;
  /** The part of the target picked. */
  part?: number;
}

export function initialArena(foe?: string): ArenaState {
  const right: Slot = foe !== undefined && FOES.some((f) => f.id === foe) ? { k: "foe", id: foe } : { k: "foe", id: FOES[0]!.id };
  return { mode: "fight", seed: 1, distance: 1, toDeath: false, left: { k: "lab" }, right, moves: [], attacker: "l" };
}

/** Everything a slot can hold, in the order the picker lists it. */
export const SLOT_CHOICES: readonly { slot: Slot; label: string; group: string }[] = [
  { slot: { k: "lab" }, label: ARENA_RU.slot.lab, group: ARENA_RU.slot.other },
  { slot: { k: "human" }, label: ARENA_RU.slot.human, group: ARENA_RU.slot.other },
  { slot: { k: "text", text: "" }, label: ARENA_RU.slot.text, group: ARENA_RU.slot.other },
  ...FOES.map((f) => ({ slot: { k: "foe", id: f.id } as Slot, label: f.ru, group: ARENA_RU.slot.foes })),
  ...BEASTS.map((b) => ({ slot: { k: "beast", id: b.id } as Slot, label: b.ru, group: ARENA_RU.slot.beasts })),
];

export function slotKey(s: Slot): string {
  switch (s.k) {
    case "lab":
      return "lab";
    case "human":
      return "h";
    case "foe":
      return `f.${s.id}`;
    case "beast":
      return `z.${s.id}`;
    case "text":
      return "t";
  }
}

export function slotLabel(s: Slot): string {
  return SLOT_CHOICES.find((c) => slotKey(c.slot) === slotKey(s))?.label ?? slotKey(s);
}

/** The body in a slot; a text that does not parse stands a human in, with the reason. */
export function slotBody(s: Slot, lab: Body): { body: Body; error: string | null } {
  switch (s.k) {
    case "lab":
      return { body: lab, error: null };
    case "human":
      return { body: human(), error: null };
    case "foe":
      return { body: foeBody(FOES.find((f) => f.id === s.id) ?? FOES[0]!), error: null };
    case "beast": {
      const b = BEASTS.find((x) => x.id === s.id);
      return { body: b === undefined ? human() : fixtureBody(b), error: null };
    }
    case "text":
      try {
        return { body: bodyFromText(s.text), error: null };
      } catch (e) {
        return { body: human(), error: e instanceof Error ? e.message : String(e) };
      }
  }
}

// ---------------------------------------------------------------- the hash

function encodeSlot(s: Slot): string {
  return s.k === "text" ? `t.${toBase64Url(s.text)}` : slotKey(s);
}

function decodeSlot(text: string): Slot | null {
  if (text === "lab") return { k: "lab" };
  if (text === "h") return { k: "human" };
  const dot = text.indexOf(".");
  const head = text.slice(0, dot);
  const rest = text.slice(dot + 1);
  if (head === "f" && FOES.some((f) => f.id === rest)) return { k: "foe", id: rest };
  if (head === "z" && BEASTS.some((b) => b.id === rest)) return { k: "beast", id: rest };
  if (head === "t") {
    const t = fromBase64Url(rest);
    if (t !== null) return { k: "text", text: t };
  }
  return null;
}

const MOVE_CHAR: Record<string, Move> = { s: { k: "strike", target: "R" }, w: { k: "wait" }, a: { k: "auto" } };

function encodeMoves(moves: readonly Move[]): string {
  return moves.map((m) => (m.k === "auto" ? "a" : m.k === "wait" ? "w" : "s")).join("");
}

/** The tape by its letters; whatever follows «до конца» is never said, so it is dropped. */
function decodeMoves(text: string): Move[] {
  const out: Move[] = [];
  for (const ch of text) {
    const m = MOVE_CHAR[ch];
    if (m === undefined) return [];
    out.push({ ...m });
    if (m.k === "auto") break;
  }
  return out;
}

/** The arena as a hash field; undefined for the initial arena, which is not written. */
export function encodeArena(a: ArenaState): string | undefined {
  const d = initialArena();
  const parts: string[] = [];
  if (a.mode !== d.mode) parts.push("m.s");
  if (a.seed !== d.seed) parts.push(`sd.${a.seed}`);
  if (a.distance !== d.distance) parts.push(`d.${a.distance}`);
  if (a.toDeath) parts.push("x.1");
  if (encodeSlot(a.left) !== encodeSlot(d.left)) parts.push(`l.${encodeSlot(a.left)}`);
  if (encodeSlot(a.right) !== encodeSlot(d.right)) parts.push(`r.${encodeSlot(a.right)}`);
  if (a.moves.length > 0) parts.push(`mv.${encodeMoves(a.moves)}`);
  if (a.attacker !== d.attacker) parts.push(`a.${a.attacker}`);
  if (a.strike !== undefined) parts.push(`k.${a.strike}`);
  if (a.part !== undefined) parts.push(`p.${a.part}`);
  return parts.length === 0 ? undefined : parts.join("~");
}

/** The arena from its hash field; `foe` is the strike tab's foe of old links, standing on the right. */
export function decodeArena(text: string | undefined, foe?: string): ArenaState {
  const a = initialArena(foe);
  for (const piece of (text ?? "").split("~")) {
    const dot = piece.indexOf(".");
    if (dot <= 0) continue;
    const key = piece.slice(0, dot);
    const v = piece.slice(dot + 1);
    switch (key) {
      case "m":
        if (v === "s") a.mode = "strike";
        break;
      case "sd": {
        const n = int(v);
        if (n !== null) a.seed = n;
        break;
      }
      case "d": {
        const n = int(v);
        if (n !== null && n >= 1 && n <= 3) a.distance = n;
        break;
      }
      case "x":
        a.toDeath = v === "1";
        break;
      case "l":
      case "r": {
        const s = decodeSlot(v);
        if (s !== null) a[key === "l" ? "left" : "right"] = s;
        break;
      }
      case "mv":
        a.moves = decodeMoves(v);
        break;
      case "a":
        if (v === "l" || v === "r") a.attacker = v;
        break;
      case "k":
        if (/^[\w.]+$/.test(v)) a.strike = v;
        break;
      case "p": {
        const n = int(v);
        if (n !== null && n >= 0) a.part = n;
        break;
      }
    }
  }
  return a;
}

// ---------------------------------------------------------------- the fight

/** A fight standing still between two words: the tape, the dice it is played with, the bodies it started from. */
export interface Fight {
  tape: Tape;
  rng: LabRng;
  /** The tape's words: the array the left fighter's policy reads. */
  moves: Move[];
  /** The bodies before the first blow, by fighter id: what fell off is named on them. */
  start: Record<string, Body>;
}

/** The fight of the arena's two slots, with its tape replayed onto it: the same state is the same fight. */
export function openFight(a: ArenaState, left: Body, right: Body): Fight {
  const moves = a.moves.map((m) => ({ ...m }));
  const rng = new LabRng(`arena:${a.seed}`);
  const tape = openTape(
    {
      fighters: [
        { id: "L", side: "L", body: left, policy: movePolicy(moves) },
        { id: "R", side: "R", body: right },
      ],
      options: { distance: a.distance, toDeath: a.toDeath },
    },
    "L",
    moves,
    rng,
  );
  return { tape, rng, moves, start: { L: left, R: right } };
}

/** «Ход»: the left fighter strikes the right one, and the fight runs until it is his turn again. */
export function fightStep(f: Fight): BattleEvent[] {
  return playMove(f.tape, { k: "strike", target: "R" }, f.rng);
}

/** «До конца»: the temper plays the left fighter to the end. */
export function fightAll(f: Fight): BattleEvent[] {
  return autoFight(f.tape, f.rng);
}

export function fighterOf(f: Fight, id: string): Fighter | undefined {
  return f.tape.battle.fighters.find((x) => x.id === id);
}

/** `левый`, `правый`, `левый: кусок 1`. */
export function fighterName(id: string): string {
  const [side, piece] = id.split("/");
  const name = ARENA_RU.side[side ?? ""] ?? id;
  return piece === undefined ? name : `${name}: ${ARENA_RU.piece} ${piece}`;
}

/** The fight in words, event by event: who struck whom with what, where it landed, what came off, who fell. */
export function battleLines(log: readonly BattleEvent[], f: Fight): { text: string; cls: string }[] {
  const out: { text: string; cls: string }[] = [];
  for (const e of log) {
    switch (e.k) {
      case "turn":
        out.push({ text: `— ${ARENA_RU.turnN} ${e.turn} —`, cls: "faint turn" });
        break;
      case "act": {
        const blows = e.blows.map((b) => `${blowWord(b)}${b.hit ? "" : ` (${ARENA_RU.misses})`}`).join(", ");
        out.push({ text: `${fighterName(e.who)} → ${fighterName(e.target)}: ${blows} — ${ARENA_RU.hits} ${e.hits} ${ARENA_RU.of} ${e.strikes}, ${e.damage} ${ARENA_RU.damage}`, cls: e.hits > 0 ? "" : "faint" });
        break;
      }
      case "wait":
        out.push({ text: `${fighterName(e.who)} ${ARENA_RU.wait}`, cls: "faint" });
        break;
      case "squeeze":
        out.push({ text: `${fighterName(e.who)} → ${fighterName(e.target)}: ${ARENA_RU.squeezes} ×${e.keys.length} — ${e.damage} ${ARENA_RU.damage}`, cls: e.damage > 0 ? "" : "faint" });
        break;
      case "release":
        out.push({ text: `${fighterName(e.who)} ${ARENA_RU.releases} ×${e.keys.length}`, cls: "faint" });
        break;
      case "harm": {
        const who = fighterOf(f, e.who);
        if (who === undefined) break;
        const before = f.start[e.who] ?? who.body;
        const lines = eventLines({ index: 0, command: -1, title: "", events: e.events, body: who.body, harm: who.harm, before });
        for (const l of lines) out.push({ text: `${fighterName(e.who)}: ${l.text}`, cls: l.cls });
        break;
      }
      case "shed":
        out.push({ text: `${fighterName(e.who)} ${ARENA_RU.shed}: ${fighterName(e.born)}`, cls: "c-bile" });
        break;
      case "severed":
        out.push({ text: `${fighterName(e.who)}: ${ARENA_RU.severed} — ${fighterName(e.born)}`, cls: "c-bile" });
        break;
      case "down":
        out.push({ text: `${fighterName(e.who)} ${ARENA_RU.down}`, cls: "c-bile" });
        break;
      case "up":
        out.push({ text: `${fighterName(e.who)} ${ARENA_RU.up}`, cls: "c-ok" });
        break;
      case "out":
        out.push({ text: e.how === "dead" ? `${fighterName(e.who)} ${ARENA_RU.dead}: ${DEATH_RU[e.cause!]}` : `${fighterName(e.who)}: ${ARENA_RU.expired}`, cls: "c-flesh" });
        break;
      case "end":
        out.push({ text: `${ARENA_RU.end[e.reason]}${e.winner === null ? "" : ` — ${ARENA_RU.winner} ${fighterName(e.winner)}`}`, cls: "c-ok" });
        break;
    }
  }
  return out;
}
