/**
 * The words of the parts tab: its buttons and headings, and the Russian for
 * the fields, tags, flags and mounts of the model's tables. The names of the
 * parts themselves are the tables' own `ru`; a field the tables grow without
 * a word here fails the tab's test, and shows its id on the page meanwhile.
 */
import type { PartTable } from "./parts.js";

export const PARTS_TEXT = {
  search: "поиск по имени или id",
  all: "все",
  table: "таблица",
  family: "семейство",
  tag: "теги",
  substance: "плоть / свойство",
  noFamily: "без семейства",
  shown: "показано",
  of: "из",
  reset: "сбросить фильтр",
  empty: "Ничего не нашлось: ослабьте фильтр.",
  pick: "Карточка части: нажмите на любую в галерее.",
  close: "закрыть",
  noSprite: "нет спрайта",
  drawnAs: "рисуется как",
  sprite: "спрайт",
  carrier: "человек с этой частью",
  carrierHad: "у человека уже есть",
  noCarrier: "на человека не садится: ни одна строка каталога не растит её на нём",
  viaRow: "через строку",
  delta: "что меняет в derive",
  noDelta: "derive не меняется",
  rows: "какие мутации растят",
  noRows: "ни одна строка каталога не растит её на человеке",
  knife: "нож",
  noKnife: "ножу нечего взять",
  traitKnife: "свойство: вырезать нечего, уходит только с частью",
  fields: "из таблицы",
  hp: "прочность",
  openLab: "в лабу",
} as const;

export const TABLE_RU: Record<PartTable, string> = {
  endings: "окончания",
  organs: "органы",
  segments: "сегменты",
  covers: "покровы",
  membranes: "перепонки",
};

export const SUBSTANCE_RU: Record<string, string> = { flesh: "плоть", trait: "свойство" };

export const SPRITE_RU: Record<string, string> = {
  ending: "окончание",
  head: "голова",
  spot: "орган-пятно",
  limb: "конечность",
  torso: "торс",
  tile: "плитка покрова",
  none: "нет",
};

/** Every field of ORGANS, SEGMENT_KINDS, COVERS and MEMBRANES, and the ones the tab computes. */
export const FIELD_RU: Record<string, string> = {
  substance: "вещество",
  mounts: "крепится",
  mass: "масса",
  upkeep: "обмен",
  control: "каналы (просит)",
  channels: "каналы (даёт)",
  family: "семейство",
  baseline: "у человека",
  tags: "теги",
  grip: "хват",
  stand: "опора",
  dig: "копание",
  attack: "удар",
  flags: "флаги",
  breath: "дыхание",
  air: "воздух",
  water: "вода",
  tank: "бак",
  massPer: "масса на длину при сечении человека",
  upkeepPer: "обмен на длину",
  pain: "боль ×",
  maxLength: "длина до",
  attackFrom: "бьёт с длины",
  massFactor: "масса ×",
  stretches: "растягивается",
  mutates: "мутирует",
  defense: "защита",
  guard: "защита по типу удара",
  blunt: "дробящий",
  cut: "режущий",
  pierce: "колющий",
  bite: "укус",
  hp: "прочность",
  hpNode: "hp узла размера 1 с ней",
  hpSegment: "hp сегмента 1 × 1",
};

export const TAG_RU: Record<string, string> = {
  brain: "мозг",
  chrome: "хром",
  mark: "метка",
  memory: "память",
  digests: "переваривает",
  defect: "дефект",
  psychic: "психика",
  sleeping: "спящая",
  eggs: "яйца",
  damps: "гасит расползание",
  psionic: "псионика",
  weapon: "оружие",
  trunk: "ведёт весь корпус",
};

export const FLAG_RU: Record<string, string> = {
  climb: "лазает",
  swim: "плавает",
  reach: "дотягивается",
  eat: "ест",
  edge: "держит край",
  wallCeiling: "стены и потолок",
  noClimb: "не лазает",
  squeeze: "протискивается",
  smell: "нюх",
  noDrop: "не роняет",
};

export const MOUNT_RU: Record<string, string> = { end: "на конце", cavity: "в полости", growth: "на поверхности", head: "в голове" };

export const YES_NO = { yes: "да", no: "нет" } as const;
