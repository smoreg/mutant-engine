/**
 * What the catalog lacks for the bestiary, as data: every addition is one
 * of three kinds - a new operation (the graph cannot do it), a new part in
 * the tables (no such ending, cover, organ), or a row the catalog is missing
 * or aims too narrowly (the operation exists, nothing draws it there). Every
 * addition names the beasts it opens; a beast's deficit is the additions it
 * needs (`NEEDS`). Held to atlas-pravki.txt: one action per row, place decides
 * the picture, no "second" or "extra", nothing of the plant family.
 */
export type AdditionKind = "op" | "part" | "row";

export interface Addition {
  id: string;
  kind: AdditionKind;
  ru: string;
  /** What exactly: the operation, the table entry, the row and its target rule. */
  what: string;
  /** Why it stays within the owner's rules. */
  why: string;
  /** Rows of the catalog it costs (a widened rule is one row rewritten). */
  rows: number;
}

export const ADDITIONS: readonly Addition[] = [
  // ---- operations the graph does not have
  {
    id: "op.resorb",
    kind: "op",
    ru: "РАССАСЫВАНИЕ",
    what: "новая операция: висячая конечность (сегмент, его дальний узел, окончания и наросты) или невитальный орган исчезает, масса уходит из мяса — обратное ОТРОСТКУ. Бездна уже делает это на потолке (вытеснение), каталогу операции нет. Строки: «конечность рассасывается» (рука, нога, щупальце, хвост, стебель), «орган рассасывается» (глаз, ухо, кисть…).",
    why: "одно действие, место решает; без «второго» и «лишнего». Змея и медуза без неё не собираются: ПОГЛОЩЕНИЕ оставляет кисть и стопу окончаниями на корпусе, а обхват 6 запирает четвёртую конечность.",
    rows: 2,
  },
  {
    id: "op.kind",
    kind: "op",
    ru: "ПЕРЕРОЖДЕНИЕ РЕБРА",
    what: "новая операция: сегмент не-корпус меняет вид на месте — рука/нога → щупальце, → хвост, → шея (когда на конце голова). Сейчас вид меняют только БЕСФОРМЕННОСТЬ (всё тело разом) и заражение вида (случайно, рядом со щупальцем). Строки: «→ щупальце», «→ хвост», «→ шея».",
    why: "по правкам атласа руки и ноги — одно ребро, так что после шага K остаются щупальце, хвост, шея и стебель; «ребро становится другим ребром» — ровно «действие + место».",
    rows: 3,
  },
  {
    id: "op.wingChain",
    kind: "op",
    ru: "ПЕРЕПОНКА НА ЦЕПОЧКЕ",
    what: "новая операция: перепонка натягивается вдоль конечности с двумя и более суставами, цикл не нужен (правки атласа 6.9); кончик конечности остаётся свободным. Строка: «крыло на конечности». Требует, чтобы `Membrane` держала путь, а не только цикл, и площадь считалась по нему.",
    why: "прямо из заметки владельца. Открывает дракона с двумя крыльями и свободными лапами, богомола с крыльями и хватательными ногами, летучую мышь с кистями на крыльях; сейчас КРЫЛЬЯ съедают две конечности узла с наименьшими id.",
    rows: 1,
  },
  // ---- parts the tables do not have
  {
    id: "part.horn",
    kind: "part",
    ru: "окончание «рог»",
    what: "новое окончание: рог — удар 1d6, хват 0, опора 0, масса 2; строка ОТРОСТОК «стебель 1/1 + рог» (как глаз на стебле), семейство покровов или конечностей.",
    why: "«шипы» — нарост, наросты не бьют; минотавр, жук-рогач и дракон остаются без рогов. Место решает: рог на тазу — тоже рог.",
    rows: 1,
  },
  {
    id: "part.beak",
    kind: "part",
    ru: "челюсть «клюв»",
    what: "новый орган в голову: клюв — 1d4, ест, дробит семена и панцири; строка ОРГАН в голову, семейство челюстей.",
    why: "«рты растут случайно в разных местах, разница в челюстях» — клюв и есть другая челюсть. Гарпия, василиск, осьминог.",
    rows: 1,
  },
  {
    id: "part.eyeSlots",
    kind: "part",
    ru: "мест для глаз в голове: 8",
    what: "таблица `HEAD_SLOTS`: глаз 4 → 8. Не строка, одно число.",
    why: "«глаза, уши, носы занимают мало места — их может быть много». Паук и скорпион держат восемь глаз только на суставах ног.",
    rows: 0,
  },
  // ---- rows: the operation exists, nothing draws it there
  {
    id: "row.stretchAll",
    kind: "row",
    ru: "ВЫТЯЖЕНИЕ любого ребра",
    what: "одна строка ВЫТЯЖЕНИЕ с целью «рука, нога, щупальце, хвост, шея» вместо трёх (longArm, longNeck, springLegs — прыжковые ноги остаются мутацией ребра для прыжка).",
    why: "«длинный хвост» и «длинное щупальце» отдельными строками не выносятся — значит, одна строка на все рёбра. Змея, скорпион, василиск, осьминог, дракон.",
    rows: 1,
  },
  {
    id: "row.joint",
    kind: "row",
    ru: "СУСТАВ без окончания",
    what: "строка СУСТАВ с пустым грузом на любой сегмент длины ≥ 2, включая корпус и хвост. Операция есть (её использует КРЫЛЬЯ), строки нет; все три строки с суставом сейчас несут глаз, пасть или голову и бьют только по руке, ноге и щупальцу.",
    why: "сустав на корпусе — это членик: сколопендра из одной строки на членик вместо семи; сустав на хвосте — сегментированный хвост скорпиона; сустав на ноге без глаза — паучья лапа.",
    rows: 1,
  },
  {
    id: "row.thicken",
    kind: "row",
    ru: "УТОЛЩЕНИЕ — «ребро в корпус»",
    what: "строка УТОЛЩЕНИЕ с пустым грузом: рука, нога, щупальце или хвост становится корпусом с полостью. Операция есть, её использует только ПОЧКОВАНИЕ (и приносит мозг в брюхе и почку).",
    why: "«любое ребро может вырасти в корпус» — правки атласа §3. Второй корпус кентавра, сфинкса, брюшко муравьиной королевы и паука сейчас идут через нарост + МЯСНОЙ НАРОСТ, который утаскивает ноги на новый узел.",
    rows: 1,
  },
  {
    id: "row.mouthAny",
    kind: "row",
    ru: "пасть на любом окончании",
    what: "строка mouthTip: цель «кисть, стопа, ложноножка» → все окончания без головы (присоска, коготь, крюк, клешня, копыто, жало).",
    why: "«рты растут случайно в разных местах — одна мутация». Змеи горгоны из щупалец в один шаг вместо ложноножка → пасть; рот медузы.",
    rows: 1,
  },
  {
    id: "row.stingRebirth",
    kind: "row",
    ru: "ПЕРЕРОЖДЕНИЕ в жало",
    what: "строка ПЕРЕРОЖДЕНИЕ «жало» на любом окончании без головы; сейчас жало — только ОТРОСТОК хвоста 1/1.",
    why: "«присоски и жала — на чём угодно» (правки §2). Медуза со стрекалами на щупальцах, жало на конце длинного хвоста скорпиона.",
    rows: 1,
  },
  {
    id: "row.gillsAnywhere",
    kind: "row",
    ru: "жаберная гроздь на любом сегменте",
    what: "строка gillCluster: цель «шея» → любой сегмент. Жабры-перепонка требуют цикла, гроздь — шею; у краба и осьминога с вросшей головой шеи нет.",
    why: "«жаберный лист = жабры», одна мутация, место решает.",
    rows: 1,
  },
  {
    id: "row.hydraMark",
    kind: "row",
    ru: "метка «гидра» на существующей конечности",
    what: "строка ОРГАН-нарост «гидра» на руку, ногу, щупальце, шею. Метка есть в таблицах, но садится только с новой рукой (hydraArm).",
    why: "то же действие без «новой руки»: отрастает то, что отрубили, где бы оно ни росло. Гидра: шеи отрастают вдвое.",
    rows: 1,
  },
  {
    id: "row.stoneCover",
    kind: "row",
    ru: "ПОКРОВ «камень»",
    what: "строка ПОКРОВ с покровом «камень»: защита 4, масса вдвое, не тянется, хват −1. Покров в таблицах есть (`COVERS.stone`), строки каталога нет — как у хрома, только хром приходит имплантом, а камень не приходит ничем.",
    why: "окаменение — не имплант и не болезнь, а покров: то же действие, что чешуя и хитин, другой материал. Горгулья без него не отрастает ни из чего, а взгляд горгоны обращает в камень только в тексте.",
    rows: 1,
  },
  {
    id: "row.forkHead",
    kind: "row",
    ru: "ВЕТВЛЕНИЕ головы",
    what: "строка forking: цель «кисть, клешня, коготь» → и «голова» (чужая, не твоя): голова раздваивается на две на коротких шеях.",
    why: "«на одной голове не вырастет тридцать голов, вырастет две» — ровно ВЕТВЛЕНИЕ с пределом голов 6. Гидра из двух ветвлений вместо четырёх перерождений кистей.",
    rows: 1,
  },
];

export function additionById(id: string): Addition {
  const a = ADDITIONS.find((x) => x.id === id);
  if (a === undefined) throw new Error(`unknown addition ${id}`);
  return a;
}

/** What each beast needs from the list: read off the fixtures. Order: the most important first. */
export const NEEDS: Record<string, string[]> = {
  centaur: ["row.thicken"],
  spider: ["part.eyeSlots", "row.thicken", "row.joint"],
  dragon: ["part.horn", "op.wingChain", "row.stretchAll", "row.thicken"],
  hydra: ["op.kind", "row.hydraMark", "row.forkHead", "row.thicken"],
  gorgon: ["row.mouthAny", "op.kind"],
  minotaur: ["part.horn", "row.thicken"],
  harpy: [],
  sphinx: ["row.thicken"],
  cerberus: ["op.kind", "row.thicken"],
  scorpion: ["row.stretchAll", "row.joint", "row.stingRebirth", "part.eyeSlots", "row.thicken"],
  octopus: ["op.kind", "row.gillsAnywhere", "part.beak", "row.stretchAll"],
  centipede: ["row.joint"],
  bat: ["op.wingChain"],
  mantis: ["op.wingChain", "row.joint", "row.thicken"],
  crab: ["row.gillsAnywhere", "op.resorb", "row.thicken"],
  snake: ["op.resorb", "row.stretchAll"],
  beetle: ["part.horn"],
  jellyfish: ["op.resorb", "row.stingRebirth", "row.mouthAny"],
  antQueen: ["row.thicken"],
  basilisk: ["part.beak", "row.stretchAll", "op.wingChain"],
  griffin: ["part.beak"],
  gargoyle: ["row.stoneCover", "part.horn", "row.thicken"],
};

/** The beasts an addition opens, in the order of the bestiary. */
export function opens(additionId: string, order: readonly string[]): string[] {
  return order.filter((beast) => (NEEDS[beast] ?? []).includes(additionId));
}

export const KIND_RU: Record<AdditionKind, string> = { op: "нужна операция", part: "нет в таблицах parts", row: "есть, но не выпадает" };
