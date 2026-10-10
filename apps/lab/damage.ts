/**
 * The wound simulator of the lab (docs/damage.md): a list of commands over the
 * body of the lab's current step - blows, turns, rest, food, bandages, a
 * fight with an enemy - replayed from a seed, with every step keeping the
 * body and the harm after it. The texts of the events are here too. No DOM.
 */
import {
  HEAL_COST,
  KNIT_TAX,
  ORGANS,
  bandage,
  catchChill,
  cauterize,
  cloneBody,
  feed,
  infect,
  newHarm,
  strike,
  elapse,
  type Blow,
  type Body,
  type Harm,
  type HarmEvent,
  type Profile,
  DEATH_RU,
  EXTRA_RU,
  FATE_RU,
  LabRng,
  STATE_RU,
  brainLabel,
  elementName,
  organsRu,
  strikeAt,
  turnsRu,
} from "@mutant-engine/core";
import { ARENA_RU, blowWord } from "./arena-words.js";

export type EnemyId = "rat" | "scavenger" | "goblin" | "beast" | "hunter";

interface Enemy {
  id: EnemyId;
  ru: string;
  dice: string;
  profile: Profile;
  dirty: boolean;
  /** Turns between its blows. */
  every: number;
  note: string;
}

export const ENEMIES: readonly Enemy[] = [
  { id: "rat", ru: "крыса", dice: "1d3", profile: "low", dirty: true, every: 1, note: "мелочь: бьёт снизу, грязными зубами" },
  { id: "scavenger", ru: "падальщик", dice: "1d6", profile: "wound", dirty: true, every: 1, note: "бьёт в раненое, грязно" },
  { id: "goblin", ru: "гоблин", dice: "1d6+1", profile: "aimed", dirty: false, every: 1, note: "целится в голову с твоим мозгом" },
  { id: "beast", ru: "тварь", dice: "2d6", profile: "random", dirty: true, every: 2, note: "тяжёлый удар наугад раз в два хода" },
  { id: "hunter", ru: "охотник", dice: "3d6", profile: "aimed", dirty: false, every: 3, note: "редкий прицельный удар клинком" },
];

export const PROFILE_RU: Record<Profile, string> = {
  random: "наугад (по открытости)",
  wound: "в рану (раненое ×3)",
  low: "снизу (до 2 от опор)",
  aimed: "прицельно (в твой мозг)",
  at: "в выбранную часть",
};

export type DamageCommand =
  | { t: "hit"; dice: string; profile: Profile; at?: number; dirty?: boolean; burn?: boolean }
  | { t: "wait"; n: number; rest?: boolean; knit?: boolean }
  | { t: "eat"; n: number }
  | { t: "bandage"; id: number }
  | { t: "burn"; id: number }
  | { t: "infect"; id: number }
  | { t: "chill" }
  | { t: "fight"; enemy: EnemyId; turns: number }
  /** One strike of the arena's attacker, by its key, at one part (`strikeAt` of the model). */
  | { t: "strike"; key: string; at: number };

export interface DamageState {
  seed: number;
  /** The body burns its upkeep every turn. */
  hunger: boolean;
  commands: DamageCommand[];
}

export interface DamageStep {
  index: number;
  /** -1 for the start. */
  command: number;
  title: string;
  events: HarmEvent[];
  body: Body;
  harm: Harm;
  /** The body before the step: names of what left are read there. */
  before: Body;
}

export interface DamageRun {
  state: DamageState;
  steps: DamageStep[];
}

export function initialDamage(): DamageState {
  return { seed: 1, hunger: false, commands: [] };
}

// ---------------------------------------------------------------- dice

/** `2d6+1`, `1d3`, `8`: null when it does not read. */
export function parseDice(text: string): { n: number; sides: number; plus: number } | null {
  const t = text.replace(/\s+/g, "").toLowerCase().replace("к", "d");
  const flat = /^(\d+)$/.exec(t);
  if (flat !== null) return { n: 0, sides: 0, plus: Number(flat[1]) };
  const m = /^(\d*)d(\d+)([+-]\d+)?$/.exec(t);
  if (m === null) return null;
  return { n: m[1] === "" ? 1 : Number(m[1]), sides: Number(m[2]), plus: m[3] === undefined ? 0 : Number(m[3]) };
}

export function roll(text: string, rng: { next(): number }): number {
  const d = parseDice(text) ?? { n: 0, sides: 0, plus: 1 };
  let sum = d.plus;
  for (let i = 0; i < d.n; i++) sum += 1 + Math.floor(rng.next() * d.sides);
  return Math.max(0, sum);
}

// ---------------------------------------------------------------- the run

function blowOf(cmd: Extract<DamageCommand, { t: "hit" }>, rng: LabRng): Blow {
  const blow: Blow = { damage: roll(cmd.dice, rng), profile: cmd.profile };
  if (cmd.at !== undefined) blow.aim = cmd.at;
  if (cmd.dirty === true) blow.dirty = true;
  if (cmd.burn === true) blow.burn = true;
  return blow;
}

function commandTitle(body: Body, cmd: DamageCommand): string {
  switch (cmd.t) {
    case "hit":
      return `удар ${cmd.dice} ${cmd.profile === "at" && cmd.at !== undefined ? `по: ${elementName(body, cmd.at)}` : PROFILE_RU[cmd.profile]}${cmd.dirty === true ? " · грязный" : ""}${cmd.burn === true ? " · ожог" : ""}`;
    case "wait":
      if (cmd.knit === true) return `заживление рывком: до ${cmd.n} ${turnsRu(cmd.n)}, пока есть запас`;
      return `${cmd.rest === true ? "покой" : "ждать"} ${cmd.n} ${turnsRu(cmd.n)}`;
    case "eat":
      return `поесть +${cmd.n} запаса`;
    case "bandage":
      return `перевязать ${elementName(body, cmd.id)}`;
    case "burn":
      return `прижечь ${elementName(body, cmd.id)}`;
    case "infect":
      return `заразить нагноением: ${elementName(body, cmd.id)}`;
    case "chill":
      return "подхватить озноб";
    case "fight": {
      const e = ENEMIES.find((x) => x.id === cmd.enemy)!;
      return `бой: ${e.ru} ${e.dice}, ${cmd.turns} ${turnsRu(cmd.turns)}`;
    }
    case "strike":
      return `${ARENA_RU.strike.attacker}: ${cmd.key} → ${body.nodes[cmd.at] !== undefined || body.segments[cmd.at] !== undefined ? elementName(body, cmd.at) : cmd.at}`;
  }
}

/** Who strikes in the run: the arena's other fighter, and how far it stands. */
export interface SimulateOptions {
  attacker?: Body;
  distance?: number;
}

export function simulate(base: Body, state: DamageState, sim: SimulateOptions = {}): DamageRun {
  const body = cloneBody(base);
  const harm = newHarm(body);
  const rng = new LabRng(`damage:${state.seed}`);
  const opts = { upkeep: state.hunger };
  const steps: DamageStep[] = [{ index: 0, command: -1, title: "цель до первого удара", events: [], body: cloneBody(body), harm: structuredClone(harm), before: cloneBody(body) }];
  state.commands.forEach((cmd, c) => {
    const before = cloneBody(body);
    let title = commandTitle(body, cmd);
    const events: HarmEvent[] = [];
    switch (cmd.t) {
      case "hit":
        events.push(...strike(body, harm, blowOf(cmd, rng), rng));
        break;
      case "wait": {
        const knit = cmd.knit === true;
        for (let i = 0; i < cmd.n && harm.dead === null; i++) {
          // A knitting body stops the moment its reserve cannot pay for another point.
          if (knit && harm.reserve < HEAL_COST * KNIT_TAX) break;
          events.push(...elapse(body, rng, { harm, ...opts, rest: cmd.rest === true, knit }).events);
        }
        break;
      }
      case "eat":
        events.push(...feed(harm, cmd.n));
        break;
      case "bandage":
        events.push(...bandage(body, harm, cmd.id));
        break;
      case "burn":
        events.push(...cauterize(body, harm, cmd.id));
        break;
      case "infect":
        events.push(...infect(harm, cmd.id));
        break;
      case "chill":
        events.push(...catchChill(harm));
        break;
      case "strike": {
        if (sim.attacker === undefined) break;
        const part = body.nodes[cmd.at] !== undefined || body.segments[cmd.at] !== undefined ? elementName(body, cmd.at) : String(cmd.at);
        const r = strikeAt(sim.attacker, cmd.key, body, harm, cmd.at, rng, sim.distance ?? 1);
        if (r === null) break;
        events.push(...r.landed.events);
        const said = !r.preview.reach ? ARENA_RU.strike.noReach : r.landed.hits > 0 ? ARENA_RU.strike.hit : ARENA_RU.strike.miss;
        title = `${blowWord(r.preview.strike)} → ${part}: ${said} (${ARENA_RU.strike.chance} ${Math.round(r.preview.chance * 100)} %)`;
        break;
      }
      case "fight": {
        const e = ENEMIES.find((x) => x.id === cmd.enemy)!;
        for (let i = 0; i < cmd.turns && harm.dead === null; i++) {
          if (i % e.every === 0) events.push(...strike(body, harm, { damage: roll(e.dice, rng), profile: e.profile, dirty: e.dirty }, rng));
          if (harm.dead === null) events.push(...elapse(body, rng, { harm, ...opts }).events);
        }
        break;
      }
    }
    steps.push({ index: steps.length, command: c, title, events, body: cloneBody(body), harm: structuredClone(harm), before });
  });
  return { state, steps };
}

// ---------------------------------------------------------------- the hash

export function encodeDamage(s: DamageState): string {
  const json = JSON.stringify({ s: s.seed, h: s.hunger ? 1 : 0, c: s.commands });
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeDamage(text: string | undefined): DamageState {
  const out = initialDamage();
  if (text === undefined || text === "") return out;
  try {
    const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const raw = JSON.parse(new TextDecoder().decode(bytes)) as { s?: unknown; h?: unknown; c?: unknown };
    if (typeof raw.s === "number" && Number.isInteger(raw.s)) out.seed = raw.s;
    out.hunger = raw.h === 1;
    if (Array.isArray(raw.c)) out.commands = raw.c.filter((c): c is DamageCommand => typeof c === "object" && c !== null && typeof (c as { t?: unknown }).t === "string");
  } catch {
    return initialDamage();
  }
  return out;
}

// ---------------------------------------------------------------- texts

function kindRu(kind: keyof typeof ORGANS): string {
  return ORGANS[kind].ru;
}

/** One line per event, named on the body where it happened; `cls` colours it. */
export function eventLines(step: DamageStep): { text: string; cls: string }[] {
  const out: { text: string; cls: string }[] = [];
  const name = (id: number): string => (step.body.nodes[id] !== undefined || step.body.segments[id] !== undefined ? elementName(step.body, id) : elementName(step.before, id));
  const brain = (key: string): string => brainLabel(step.body, key, step.before);
  let bled = 0;
  let healedHp = 0;
  let healedBlood = 0;
  let twitches = 0;
  let starving = 0;
  let flails = 0;
  let healSpent = 0;
  let knitted = false;
  for (const e of step.events) {
    switch (e.k) {
      case "miss":
        out.push({ text: `прицел мимо: удар ушёл в случайное (метил: ${name(e.aim)})`, cls: "faint" });
        break;
      case "membrane":
        out.push({ text: `перепонка ${e.id} ловит удар: −${e.lost} площади${e.torn ? ", разорвана" : ""}`, cls: "c-bile" });
        break;
      case "hit": {
        const pain = e.pain.map((p) => `${brain(p.key)} +${p.amount}`).join(", ");
        const change = e.before === e.after ? STATE_RU[e.after] : `${STATE_RU[e.before]} → ${STATE_RU[e.after]}`;
        out.push({
          text: `${name(e.id)}: ${e.damage} урона${e.defense > 0 ? ` (${e.raw} − защита ${e.defense})` : ""}, ${change}${e.bleed > 0 ? `, кровотечение +${e.bleed}/ход` : ""}${pain === "" ? "" : `; боль: ${pain}`}`,
          cls: e.after === "hurt" || e.after === "whole" ? "" : "c-flesh",
        });
        break;
      }
      case "organ":
        out.push({ text: `${kindRu(e.kind)} (${name(e.where)}): ${e.result === "hurt" ? "повреждён, работает вполсилы" : "разрушен"}`, cls: "c-flesh" });
        break;
      case "infected":
        out.push({ text: `грязь в ране: нагноение — ${name(e.id)}`, cls: "c-bio" });
        break;
      case "owed":
        out.push({ text: `${EXTRA_RU[e.kind]} в крови: скажется через ${e.turns} ${turnsRu(e.turns)} (${name(e.id)})`, cls: "c-bio" });
        break;
      case "dose":
        out.push({ text: `${EXTRA_RU[e.kind]}: −${e.amount} мимо покрова — ${name(e.id)}; боль ${e.pain.map((p) => `+${p.amount}`).join(", ") || "—"}`, cls: "c-bio" });
        break;
      case "torn": {
        const lost = e.pieces.map((p) => `${organsRu(p.organs.map((k) => ({ kind: k, instability: 0 })))}${p.organs.length === 0 ? "мясо" : ""} (${p.fate === "meat" ? "мясо на полу" : (FATE_RU[p.fate] ?? p.fate)})`).join("; ");
        out.push({ text: `ОТРЫВ: ${name(e.segment)}; культя — ${name(e.stump)}, кровит +${e.bleed}/ход. Ушло: ${lost}`, cls: "c-flesh" });
        break;
      }
      case "vanished":
        out.push({ text: `сегмент ${e.segment} в цикле разорван — ничего не отпало`, cls: "c-flesh" });
        break;
      case "crushed":
        out.push({ text: `УЗЕЛ РАЗДАВЛЕН: ${e.node}; погибли ${organsRu(e.lost.map((k) => ({ kind: k, instability: 0 }))) || "—"}; кровь +${e.bleed}/ход, дальше кровь не идёт`, cls: "c-flesh" });
        break;
      case "handover":
        out.push({ text: `ПЕРЕХВАТ: твой мозг погиб, управление переходит — ${brain(e.to)}`, cls: "c-bile" });
        break;
      case "death":
        out.push({ text: `СМЕРТЬ: ${DEATH_RU[e.cause]}`, cls: "c-flesh" });
        break;
      case "bled":
        bled += e.amount;
        break;
      case "clot":
        out.push({ text: `кровь свернулась: ${name(e.id)}`, cls: "faint" });
        break;
      case "blackout":
        out.push({ text: `${brain(e.key)} теряет сознание на ${e.turns} ${turnsRu(e.turns)} (${e.why === "pain" ? "боль" : "кровопотеря"})`, cls: "c-bile" });
        break;
      case "wake":
        out.push({ text: `${brain(e.key)} приходит в себя`, cls: "" });
        break;
      case "twitch":
        twitches += 1;
        if (twitches <= 3) out.push({ text: `судорога: ${kindRu(e.organ)} (${name(e.where)}) дёргается сам (${brain(e.key)})`, cls: "c-bile" });
        break;
      case "flail":
        flails += 1;
        break;
      case "necrosis":
        out.push({ text: `некроз, органы отмерли: ${e.ids.map(name).join(", ")}`, cls: "c-flesh" });
        break;
      case "fallen":
        out.push({ text: `отвалилось без крови: ${e.ids.map(name).join(", ")}`, cls: "c-flesh" });
        break;
      case "brainDead":
        out.push({ text: `мозг умер без крови: ${e.key}`, cls: "c-flesh" });
        break;
      case "fester":
        out.push({ text: `нагноение, ${name(e.id)}: ${e.stage === 2 ? "гной" : e.stage === 3 ? "ГАНГРЕНА — часть не пропускает кровь" : "краснота"}`, cls: "c-bio" });
        break;
      case "spread":
        out.push({ text: `гной ползёт: ${name(e.from)} → ${name(e.to)}`, cls: "c-bio" });
        break;
      case "cured":
        out.push({ text: e.id === null ? "озноб прошёл" : `нагноение прошло: ${name(e.id)}`, cls: "c-ok" });
        break;
      case "chill":
        out.push({ text: `озноб: ${e.stage === 1 ? "знобит" : e.stage === 2 ? "лихорадка" : "жар"}`, cls: "c-bio" });
        break;
      case "healed":
        healedHp += e.hp;
        healedBlood += e.blood;
        healSpent += e.spent;
        if (e.knit) knitted = true;
        break;
      case "mended":
        out.push({ text: `${kindRu(e.kind)} зажил`, cls: "c-ok" });
        break;
      case "starving":
        starving += 1;
        break;
      case "bandaged":
        out.push({ text: `перевязка: ${name(e.id)}, −${e.bleed} кровотечения`, cls: "c-ok" });
        break;
      case "cauterized":
        out.push({ text: `прижжено: ${name(e.id)}; боль ${e.pain.map((p) => `+${p.amount}`).join(", ") || "—"}`, cls: "c-bile" });
        break;
      case "ate":
        out.push({ text: `запас обмена +${e.amount}`, cls: "c-ok" });
        break;
    }
  }
  if (twitches > 3) out.push({ text: `…ещё судорог: ${twitches - 3}`, cls: "c-bile" });
  if (flails > 0) out.push({ text: `тело без сознания бьётся: ${flails} ${turnsRu(flails)} органы территорий дёргаются все разом`, cls: "c-bile" });
  if (bled > 0) out.push({ text: `потеряно крови: ${bled}`, cls: "c-flesh" });
  if (healedHp + healedBlood > 0) {
    out.push({ text: `${knitted ? "заживление рывком" : "заживление"}: +${healedHp} прочности, +${healedBlood} крови; обмен −${Math.round(healSpent)}`, cls: "c-ok" });
  }
  if (starving > 0) out.push({ text: `запас пуст ${starving} ${turnsRu(starving)}: заживления нет`, cls: "c-bile" });
  return out;
}
