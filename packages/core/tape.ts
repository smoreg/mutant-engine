/**
 * A fight a player plays by hand, and the tape it is kept on. The battle is
 * `battle.ts` and every rule of it stays there: whose turn it is, what may be
 * struck, what comes off a body and when it is over. This holds the handle and
 * the tape: one word of the player per turn of his fighter, written so it
 * survives a link, and a fight replays from `(setup, rng, tape)` bit for bit
 * (decisions 711-714).
 */
import { battleView, newBattle, nextTurn, stepBattle, type Battle, type BattleEvent, type BattleSetup, type Fighter } from "./battle.js";
import { newHarm, type Harm, type Profile } from "./damage.js";
import type { Body } from "./graph.js";
import { defaultPolicy, type Action, type FighterId, type Policy, type View } from "./policy.js";
import type { Rng } from "./rng.js";

/**
 * A body and the wounds it walks in with: what a fight takes and what it
 * gives back, every number it went in with plus what the fight did to it.
 */
export interface Entrant {
  body: Body;
  harm: Harm;
}

/** A body that has never been hurt. */
export function entrant(body: Body): Entrant {
  return { body, harm: newHarm(body) };
}

/**
 * One word of the player to his fighter, for one turn of his. It is `Action`
 * of `policy.ts` written so it survives a link: a target by the id the fight
 * gives it, a head by the key `brains()` keys it with, and nothing that is an
 * object graph.
 */
export type Move =
  | { k: "strike"; target: FighterId; profile?: Profile; aim?: number }
  | { k: "shed"; key: string }
  | { k: "wait" }
  /** From here the temper plays: «до конца», said once and never taken back. */
  | { k: "auto" };

/** The tape has run out, or it ended on the word that hands the fight over. */
export function played(moves: readonly Move[]): boolean {
  return moves[moves.length - 1]?.k === "auto";
}

/**
 * The player as a policy: the tape, word by word, and the temper for
 * everything it does not say. A word the fight cannot honour - a head already
 * gone, a target already out - falls through to the temper rather than wasting
 * the turn, because a replay must not be able to end differently from the
 * fight it replays.
 */
export function movePolicy(moves: readonly Move[], fallback: Policy = defaultPolicy): Policy {
  let at = 0;
  return (view) => {
    const move = moves[at++];
    if (move === undefined || move.k === "auto") return fallback(view);
    if (move.k === "wait") return { k: "wait" };
    if (move.k === "shed") {
      const head = view.shed.find((s) => s.key === move.key);
      return head === undefined ? fallback(view) : { k: "shed", brain: head.brain };
    }
    if (!view.foes.some((f) => f.id === move.target)) return fallback(view);
    const act: Action = { k: "strike", target: move.target };
    if (move.profile !== undefined) act.profile = move.profile;
    if (move.aim !== undefined) act.aim = move.aim;
    return act;
  };
}

/** A fight standing still, waiting for a word. */
export interface Tape {
  battle: Battle;
  /** The player's fighter, by its id in the battle. */
  me: FighterId;
  /** The player's tape. It grows as he plays, and it is what goes into the link. */
  moves: Move[];
  /** Whose action comes next; null when the fight is over. */
  next: FighterId | null;
  /** Words of the tape already spoken: past this the fight is waiting for him. */
  said: number;
  /** Where in `battle.log` everything since he was last asked begins. */
  seen: number;
}

function mine(t: Tape): Fighter | undefined {
  return t.battle.fighters.find((f) => f.id === t.me);
}

/**
 * His word is wanted right now: it is his fighter's turn and his fighter can
 * take it. A fighter out cold is asked nothing - `stepBattle` does not ask a
 * policy that cannot act either, and the two have to agree word for word or a
 * replay reads the tape off by one.
 */
export function waiting(t: Tape): boolean {
  if (t.next !== t.me) return false;
  const me = mine(t);
  return me !== undefined && me.out === null && me.conscious;
}

/** Everything that happened since the player was last asked for a word. */
export function since(t: Tape): BattleEvent[] {
  return t.battle.log.slice(t.seen);
}

/** What he is looking at on his turn: his side, theirs, and the heads he could cut loose. */
export function tapeView(t: Tape): View | null {
  return battleView(t.battle, t.me);
}

/** Turns the handle until his word is wanted, or the fight is over. */
function advance(t: Tape, rng: Rng): void {
  for (;;) {
    t.next = nextTurn(t.battle, rng);
    if (t.next === null) return;
    if (waiting(t)) {
      const word = t.moves[t.said];
      if (word === undefined && !played(t.moves)) return;
      // The mark moves to his own blow, so what he is shown next is that blow
      // and everything it brought down on him. «До конца» does not move it:
      // from there he is shown the whole of what he handed over.
      if (word !== undefined && word.k !== "auto") t.seen = t.battle.log.length;
      t.said += 1;
    }
    stepBattle(t.battle, rng);
  }
}

/**
 * The fight as the player walks into it, with whatever of it he has already
 * played replayed onto it. `moves` is read by reference: the policy of his
 * fighter in `setup` has to be `movePolicy` over this very array, so it hears
 * the word that was just said.
 */
export function openTape(setup: BattleSetup, me: FighterId, moves: Move[], rng: Rng): Tape {
  const t: Tape = { battle: newBattle(setup), me, moves, next: null, said: 0, seen: 0 };
  advance(t, rng);
  return t;
}

/**
 * One word of the player, and then the fight until it wants another. The word
 * goes onto the tape first: the tape is what the policy of his fighter reads,
 * and what a replay reads.
 */
export function playMove(t: Tape, move: Move, rng: Rng): BattleEvent[] {
  if (!waiting(t)) return [];
  const from = t.battle.log.length;
  t.moves.push(move);
  advance(t, rng);
  return t.battle.log.slice(from);
}

/**
 * «До конца»: he stops deciding and the temper finishes the fight for him. It
 * is one more word on the tape and not a second way of fighting.
 */
export function autoFight(t: Tape, rng: Rng): BattleEvent[] {
  const from = t.battle.log.length;
  if (!played(t.moves)) t.moves.push({ k: "auto" });
  advance(t, rng);
  return t.battle.log.slice(from);
}
