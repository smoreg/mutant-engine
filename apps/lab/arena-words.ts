/**
 * The words of the arena tab: its buttons, its captions, its lines about a
 * fight; and what a blow is called. One table, so the page carries no literal
 * of its own. No DOM.
 */
import { ORGANS, SEGMENT_KINDS, strikes, type Attack, type Body, type HitType, type Strike } from "@mutant-engine/core";

export const ARENA_RU = {
  tab: "Арена",
  mode: { fight: "бой", strike: "удар" },
  side: { L: "левый", R: "правый" } as Record<string, string>,
  piece: "кусок",
  slot: { lab: "мутант лаборатории", human: "человек", text: "тело текстом", foes: "противники", beasts: "бестиарий", other: "свои" },
  seed: "сид",
  distance: "дистанция",
  toDeath: "до смерти",
  turn: "Ход",
  toEnd: "До конца",
  again: "Заново",
  toLab: "в лабу",
  textApply: "Поставить",
  textError: "тело не читается, стоит человек",
  strikes: "удары",
  grabs: "захваты",
  parts: "части",
  blood: "кровь",
  mass: "масса",
  armor: "броня",
  speed: "скорость",
  noStrikes: "Ни одного удара: у тела нет окончания с атакой.",
  selfStrike: "удар по себе",
  plan: "план залпа",
  log: "лента боя",
  logEmpty: "Бой ещё не начался: «Ход» — один ход обоих, «До конца» — пока кто-то не упадёт.",
  gone: "отпало элементов",
  turnN: "ход",
  played: "твоих ходов сыграно",
  hits: "попал",
  of: "из",
  damage: "урона",
  misses: "мимо",
  wait: "ждёт",
  squeezes: "сжимает захватом",
  releases: "отпускает захват",
  shed: "сбрасывает голову",
  severed: "отделился живой кусок",
  down: "падает без сознания",
  up: "приходит в себя",
  dead: "мёртв",
  expired: "кусок истёк кровью",
  end: { beaten: "победа", empty: "пусто: не устоял никто", limit: "свисток: бой ни к чему не идёт" },
  winner: "победил",
  strike: {
    attacker: "бьёт",
    target: "цель",
    weapon: "чем",
    part: "куда",
    pickPart: "клик по части на рисунке или в списке",
    noPart: "часть не выбрана",
    chance: "шанс",
    expected: "ожидаемо",
    cover: "защита части",
    noReach: "не достаёт",
    throw: "Ударить",
    again: "Повтор",
    hit: "попал",
    miss: "мимо",
    last: "последний удар",
    wounds: "раны: время, еда, руки, условный бой",
    flip: "поменять местами",
  },
  type: { blunt: "дробящий", cut: "режущий", pierce: "колющий", bite: "укус", squeeze: "сжатие" } as Record<HitType, string>,
  bareLimb: "голая конечность",
  head: "голова",
} as const;

/**
 * What a blow is called: an organ of the tables by its own name (`ORGANS.ru`),
 * a segment that strikes by its own (`SEGMENT_KINDS.ru`: a tail, a penis), and
 * a bare limb - which is no part at all, only the absence of one on a tip.
 * Written for any kind, so a new one shows a name and not a crash.
 */
export function attackWord(kind: Attack["kind"]): string {
  const organ: { ru: string } | undefined = (ORGANS as Record<string, { ru: string }>)[kind];
  if (organ !== undefined) return organ.ru;
  const segment: { ru: string } | undefined = (SEGMENT_KINDS as Record<string, { ru: string }>)[kind];
  if (segment !== undefined) return segment.ru;
  return kind === "stump" ? ARENA_RU.bareLimb : kind;
}

/** A blow by its kind and, for a head, the jaws it bites with. */
export function blowWord(s: Pick<Strike, "kind" | "bite">): string {
  if (s.kind === "head" && s.bite !== null) return `${ARENA_RU.head} (${ORGANS[s.bite].ru})`;
  return attackWord(s.kind);
}

/** The strike of a body by its key; the key itself when the body has no such strike. */
export function strikeWord(body: Body, key: string): string {
  const s = strikes(body).find((x) => x.key === key);
  return s === undefined ? key : blowWord(s);
}
