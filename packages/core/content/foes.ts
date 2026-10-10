/**
 * Who a body meets: the first floor's people and what lives with them, drawn
 * as fixtures the way the bestiary draws its beasts, and below them the lines
 * - who comes after whom when a body walks a place.
 *
 * These rows started in `tools/lab/foes.ts`, because the strike tab was the
 * only thing that hit them. The game above the model walks down a line of
 * them (raids.md §2, decision 440), and `src/` cannot import `tools/`, so the
 * table belongs in the model, beside the bestiary - the same move the sources
 * made in decision 382. Pure data, no DOM.
 *
 * Gear is not in the graph yet (gear.md is deferred), so their armor is their
 * covers: the troll's is bark and bone plates, the orc has girth.
 */
import type { Body } from "../graph.js";
import { HUMAN_TEXT } from "../human.js";
import { bodyFromText } from "../text.js";

export interface Foe {
  id: string;
  ru: string;
  glyph: string;
  /** One line for the card. */
  about: string;
  text: string;
}

/**
 * Below the human, and the first thing anybody meets. The measurement of
 * raids.md §2 said the naked human takes one meeting in half the seeds and two
 * in none of them - and the first place on the board stood a human on him, so
 * the first walk of a run was a coin toss against his own equal (decision 730).
 * This is the body under that: a starved thing on four legs, girth 1 all over,
 * a jaw instead of fangs and nothing but fur over it.
 *
 * It is small and broken rather than dialled down: the weakness is the graph -
 * a third of the meat, a torso of girth 2 that holds a third of the blood, and
 * a bite of `1d3` from a mouth the size of a hand.
 */
const SCAVENGER_TEXT = `# узлы: имя[размер] {окончания}; * — твой мозг
голова[1] {голова(мозг*, глаз, глаз, челюсть, ухо, ухо, нос)}
грудь[2]
таз[2]
лапа.пл[1] {стопа}
лапа.пп[1] {стопа}
лапа.зл[1] {стопа}
лапа.зп[1] {стопа}
бедро.грудь.л1[2]
бедро.грудь.п1[2]
бедро.таз.л1[2]
бедро.таз.п1[2]

# сегменты: узел -вид:длина/обхват покров {полость}- узел
голова -шея:1/1 шерсть-                              грудь
грудь  -корпус:2/2 шерсть {сердце, лёгкие, желудок}- таз
грудь ~бок:0/1 шерсть~ бедро.грудь.л1
бедро.грудь.л1  -нога:1/1 шерсть-                             лапа.пл
грудь ~бок:0/1 шерсть~ бедро.грудь.п1
бедро.грудь.п1  -нога:1/1 шерсть-                             лапа.пп
таз ~бок:0/1 шерсть~ бедро.таз.л1
бедро.таз.л1    -нога:1/1 шерсть-                             лапа.зл
таз ~бок:0/1 шерсть~ бедро.таз.п1
бедро.таз.п1    -нога:1/1 шерсть-                             лапа.зп
`;

const ORC_TEXT = `# узлы: имя[размер] {окончания}; * — твой мозг
голова[2] {голова(мозг*, глаз, глаз, хищные челюсти, ухо, ухо, нос)}
грудь[3]
таз[3]
кисть.л[1] {кисть}
кисть.п[1] {кисть}
стопа.л[1] {стопа}
стопа.п[1] {стопа}
плечо.грудь.л1[2]
плечо.грудь.п1[2]
бедро.таз.л1[2]
бедро.таз.п1[2]

# сегменты: узел -вид:длина/обхват покров {полость}- узел
голова  -шея:1/2 кожа-                               грудь
грудь   -корпус:2/4 кожа {сердце, лёгкие, желудок}-  таз
грудь ~бок:0/1 кожа~ плечо.грудь.л1
плечо.грудь.л1   -рука:2/2 кожа-                              кисть.л
грудь ~бок:0/1 кожа~ плечо.грудь.п1
плечо.грудь.п1   -рука:2/2 кожа-                              кисть.п
таз ~бок:0/1 кожа~ бедро.таз.л1
бедро.таз.л1     -нога:2/2 кожа-                              стопа.л
таз ~бок:0/1 кожа~ бедро.таз.п1
бедро.таз.п1     -нога:2/2 кожа-                              стопа.п
`;

const TROLL_TEXT = `# узлы: имя[размер] {окончания}; * — твой мозг
голова[2] {голова(мозг*, глаз, глаз, дробящие челюсти, ухо, ухо, нос)}
грудь[3]
таз[3]
коготь.л[1] {коготь}
коготь.п[1] {коготь}
стопа.л[1] {стопа}
стопа.п[1] {стопа}
плечо.грудь.л1[2]
плечо.грудь.п1[2]
бедро.таз.л1[2]
бедро.таз.п1[2]

# сегменты: узел -вид:длина/обхват покров {полость}- узел
голова  -шея:1/2 кора-                                        грудь
грудь   -корпус:3/4 костяные пластины {сердце, лёгкие, желудок}- таз
грудь ~бок:0/1 кора~ плечо.грудь.л1
плечо.грудь.л1   -рука:3/2 кора-                                       коготь.л
грудь ~бок:0/1 кора~ плечо.грудь.п1
плечо.грудь.п1   -рука:3/2 кора-                                       коготь.п
таз ~бок:0/1 кора~ бедро.таз.л1
бедро.таз.л1     -нога:3/2 кора-                                       стопа.л
таз ~бок:0/1 кора~ бедро.таз.п1
бедро.таз.п1     -нога:3/2 кора-                                       стопа.п
`;

/**
 * The people of the surface in their sizes (decision 1284): the warrior is
 * the human with the arms of work - forearm and shoulder of girth 2; the fat
 * man carries a torso of girth 5 and thick thighs; the child is the human on a
 * torso half as long and small hands and feet; the goblin is a thin human
 * with a torso of girth 2, fangs and small claws for hands. The model draws no
 * limb thinner than girth 1 or shorter than 1, so the child and the goblin
 * weigh four fifths of a man and not a third: the size is in the torso.
 */
const WARRIOR_TEXT = `# узлы: имя[размер] {окончания}; * — твой мозг
голова[2] {голова(мозг*, глаз, глаз, челюсть, ухо, ухо, нос)}
грудь[1]
таз[1]
плечо.л[3]
плечо.п[3]
бедро.л[2]
бедро.п[2]
локоть.л[1]
локоть.п[1]
колено.л[1]
колено.п[1]
кисть.л[1] {кисть}
кисть.п[1] {кисть}
стопа.л[1] {стопа}
стопа.п[1] {стопа}
пах[1]

# сегменты: узел -вид:длина/обхват покров {полость}- узел
голова -шея:1/2 кожа- грудь
грудь -корпус:2/3 кожа {сердце, лёгкие, желудок}- таз
грудь ~бок:0/1 кожа~ плечо.л
грудь ~бок:0/1 кожа~ плечо.п
таз ~бок:0/1 кожа~ бедро.л
таз ~бок:0/1 кожа~ бедро.п
плечо.л -рука:1/2 кожа- локоть.л
локоть.л -рука:1/2 кожа- кисть.л
плечо.п -рука:1/2 кожа- локоть.п
локоть.п -рука:1/2 кожа- кисть.п
бедро.л -нога:1/1 кожа- колено.л
колено.л -нога:1/1 кожа- стопа.л
бедро.п -нога:1/1 кожа- колено.п
колено.п -нога:1/1 кожа- стопа.п
таз -член:1/1 кожа- пах
`;

const FAT_TEXT = `# узлы: имя[размер] {окончания}; * — твой мозг
голова[2] {голова(мозг*, глаз, глаз, челюсть, ухо, ухо, нос)}
грудь[1]
таз[1]
плечо.л[3]
плечо.п[3]
бедро.л[2]
бедро.п[2]
локоть.л[1]
локоть.п[1]
колено.л[1]
колено.п[1]
кисть.л[1] {кисть}
кисть.п[1] {кисть}
стопа.л[1] {стопа}
стопа.п[1] {стопа}
пах[1]

# сегменты: узел -вид:длина/обхват покров {полость}- узел
голова -шея:1/1 кожа- грудь
грудь -корпус:2/5 кожа {сердце, лёгкие, желудок}- таз
грудь ~бок:0/1 кожа~ плечо.л
грудь ~бок:0/1 кожа~ плечо.п
таз ~бок:0/1 кожа~ бедро.л
таз ~бок:0/1 кожа~ бедро.п
плечо.л -рука:1/1 кожа- локоть.л
локоть.л -рука:1/1 кожа- кисть.л
плечо.п -рука:1/1 кожа- локоть.п
локоть.п -рука:1/1 кожа- кисть.п
бедро.л -нога:1/2 кожа- колено.л
колено.л -нога:1/1 кожа- стопа.л
бедро.п -нога:1/2 кожа- колено.п
колено.п -нога:1/1 кожа- стопа.п
таз -член:1/1 кожа- пах
`;

const CHILD_TEXT = `# узлы: имя[размер] {окончания}; * — твой мозг
голова[2] {голова(мозг*, глаз, глаз, челюсть, ухо, ухо, нос)}
грудь[1]
таз[1]
плечо.л[1]
плечо.п[1]
бедро.л[1]
бедро.п[1]
локоть.л[1]
локоть.п[1]
колено.л[1]
колено.п[1]
кисть.л[1] {кисть<}
кисть.п[1] {кисть<}
стопа.л[1] {стопа<}
стопа.п[1] {стопа<}

# сегменты: узел -вид:длина/обхват покров {полость}- узел
голова -шея:1/1 кожа- грудь
грудь -корпус:1/3 кожа {сердце, лёгкие, желудок}- таз
грудь ~бок:0/1 кожа~ плечо.л
грудь ~бок:0/1 кожа~ плечо.п
таз ~бок:0/1 кожа~ бедро.л
таз ~бок:0/1 кожа~ бедро.п
плечо.л -рука:1/1 кожа- локоть.л
локоть.л -рука:1/1 кожа- кисть.л
плечо.п -рука:1/1 кожа- локоть.п
локоть.п -рука:1/1 кожа- кисть.п
бедро.л -нога:1/1 кожа- колено.л
колено.л -нога:1/1 кожа- стопа.л
бедро.п -нога:1/1 кожа- колено.п
колено.п -нога:1/1 кожа- стопа.п
`;

const GOBLIN_TEXT = `# узлы: имя[размер] {окончания}; * — твой мозг
голова[2] {голова(мозг*, глаз, глаз, хищные челюсти, челюсть, ухо, ухо, нос)}
грудь[1]
таз[1]
плечо.л[2]
плечо.п[2]
бедро.л[2]
бедро.п[2]
локоть.л[1]
локоть.п[1]
колено.л[1]
колено.п[1]
кисть.л[1] {коготь<}
кисть.п[1] {коготь<}
стопа.л[1] {стопа}
стопа.п[1] {стопа}
пах[1]

# сегменты: узел -вид:длина/обхват покров {полость}- узел
голова -шея:1/1 кожа- грудь
грудь -корпус:2/2 кожа {сердце, лёгкие, желудок}- таз
грудь ~бок:0/1 кожа~ плечо.л
грудь ~бок:0/1 кожа~ плечо.п
таз ~бок:0/1 кожа~ бедро.л
таз ~бок:0/1 кожа~ бедро.п
плечо.л -рука:1/1 кожа- локоть.л
локоть.л -рука:1/1 кожа- кисть.л
плечо.п -рука:1/1 кожа- локоть.п
локоть.п -рука:1/1 кожа- кисть.п
бедро.л -нога:1/1 кожа- колено.л
колено.л -нога:1/1 кожа- стопа.л
бедро.п -нога:1/1 кожа- колено.п
колено.п -нога:1/1 кожа- стопа.п
таз -член:1/1 кожа- пах
`;

/**
 * The human stays row zero and the troll stays row two: `foeById` falls back to
 * the first row, half the repository reads `FOES[2]` as the troll, and the
 * order of this list is a catalog and not a ladder. Who comes first in a walk
 * is the line, below.
 */
export const FOES: readonly Foe[] = [
  { id: "human", ru: "человек", glyph: "@", about: "с поверхности: кожа, кулаки 1d3, мясо 100. Мерка всего остального", text: HUMAN_TEXT },
  { id: "orc", ru: "орк", glyph: "o", about: "человек вдвое толще: руки и ноги обхвата 2, корпус 4, клыки 1d8. Держит удар массой, а не бронёй", text: ORC_TEXT },
  { id: "troll", ru: "тролль", glyph: "T", about: "длинные руки в коре с когтями, корпус в костяных пластинах, дробящие челюсти 2d4. Кулаком не пробить", text: TROLL_TEXT },
  { id: "scavenger", ru: "падальщик", glyph: "r", about: "мелкий и битый: четыре лапы, челюсть 1d3, мясо втрое меньше человеческого. Всё, что ниже мерки", text: SCAVENGER_TEXT },
  { id: "warrior", ru: "воин", glyph: "@", about: "человек с руками работы: плечо и предплечье обхвата 2, кулак тяжелее. Тот же человек, сильнее бьёт", text: WARRIOR_TEXT },
  { id: "fat", ru: "толстяк", glyph: "@", about: "корпус обхвата 5 и толстые бёдра: почти вдвое тяжелее человека, медленнее, держит удар мясом", text: FAT_TEXT },
  { id: "child", ru: "ребёнок", glyph: "@", about: "корпус вдвое короче, малые кисти и стопы: слабее и медленнее взрослого", text: CHILD_TEXT },
  { id: "goblin", ru: "гоблин", glyph: "g", about: "тощий человечек: корпус обхвата 2, клыки 1d8 и коготки вместо кистей. Легче человека, кусается как волк", text: GOBLIN_TEXT },
];

export function foeById(id: string | undefined): Foe {
  return FOES.find((f) => f.id === id) ?? FOES[0]!;
}

export function foeBody(foe: Foe): Body {
  return bodyFromText(foe.text);
}

// ---------------------------------------------------------------- lines of foes

/**
 * A line is who the body meets, in order, weakest first: data, so the
 * generator's gauntlet, the places of the game above and the tests all measure
 * the same ladder. Repeats are the point - the same foe twice in a row asks
 * whether the body healed.
 *
 * Two kinds of line live here and they are not the same thing, and since
 * decision 912 they are not even read the same way.
 *
 * The first three - `floor1`, `crowd`, `orcs` - are **measuring sticks**,
 * eight to twelve long, walked in the written order, weakest first: the lab
 * needs the same ladder twice or it is measuring nothing, and decision 448
 * belongs to them entire.
 *
 * The five after them are the **places** of raids.md §3, and they are read as
 * a **bag**: who lives there, and the walk draws which of them turns up at
 * each encounter (decision 912). The owner asked for it in one sentence -
 * «... добавить хоть какую то случайность разные враги» - and the old
 * rule made a place one fixed procession that a manager learned once and never
 * had to read again. What he knows now is the bag and the number of
 * encounters, which is a harder and more honest thing to know; what he no
 * longer knows is who stands third. The draw is off the walk's own generator,
 * so a seed and an order still give the same trip bit for bit.
 *
 * A place's bag is therefore longer than its day: repeats inside it are
 * weights and not a procession - two scavengers against one human is a dump
 * that turns up a human a third of the time.
 */
export interface FoeLine {
  id: string;
  ru: string;
  /** One line for the picker. */
  about: string;
  /** Ids of `FOES`: the order they come in for a measuring stick, the bag they are drawn from for a place. */
  foes: readonly string[];
}

export const FOE_LINES: readonly FoeLine[] = [
  {
    id: "floor1",
    ru: "первый этаж",
    about: "люди, орки, тролли по нарастающей — девять встреч",
    foes: ["human", "human", "orc", "human", "orc", "troll", "orc", "troll", "troll"],
  },
  {
    id: "crowd",
    ru: "толпа людей",
    about: "двенадцать человек подряд: мера выносливости, а не силы удара",
    foes: ["human", "human", "human", "human", "human", "human", "human", "human", "human", "human", "human", "human"],
  },
  {
    id: "orcs",
    ru: "орки",
    about: "восемь орков: мера силы удара, орочью массу кулаком не промять",
    foes: ["orc", "orc", "orc", "orc", "orc", "orc", "orc", "orc"],
  },
  { id: "dump", ru: "свалка", about: "падальщики, изредка человек: то, что ниже мерки, и первое, что встречает голый человек", foes: ["scavenger", "scavenger", "scavenger", "human"] },
  { id: "nests", ru: "гнездовья", about: "орки, с ними падальщики и люди: орочью массу кулаком не промять", foes: ["orc", "orc", "human", "scavenger"] },
  { id: "spring", ru: "родник под городом", about: "люди и орки, изредка тролль: тролль у родника и есть цена камня", foes: ["human", "human", "orc", "troll"] },
  { id: "ruins", ru: "руины риппера", about: "тролли и орки: держит тролль, орк не держит", foes: ["troll", "troll", "orc", "orc"] },
  {
    id: "pit",
    ru: "провал, устье Бездны",
    // raids.md §3 asks for троль · троль · паук · сколопендра; the spider and
    // the centipede are in the bestiary and no bag can name them yet
    // (decisions 449, 461). Trolls hold the weight of the place - four
    // encounters in a row is nobody's in the starting three - and the two
    // beasts drop in here when the debt is paid.
    about: "четыре встречи подряд, почти все тролли: не для стартовой тройки. Паук и сколопендра — долг решения 449",
    foes: ["troll", "troll", "troll", "orc"],
  },
];

export function lineById(id: string | undefined): FoeLine {
  return FOE_LINES.find((l) => l.id === id) ?? FOE_LINES[0]!;
}

/**
 * The line as bodies, one fresh fixture per name: what the walk of
 * a walk down the line takes. It is a function and not a table because a
 * body is mutable and a fixture handed out twice would be the same wounded
 * thing the second time.
 *
 * A name nothing answers to is not a silent gap: `foeById` falls back to the
 * human, so the tests check the names, not the walk (invariant "the line names
 * nobody the list does not hold").
 */
export function lineBodies(line: FoeLine): Body[] {
  return line.foes.map((id) => foeBody(foeById(id)));
}

/** Names the list has no body for. Empty is the invariant; anything else is a broken line. */
export function unknownFoes(line: FoeLine): string[] {
  const known = new Set(FOES.map((f) => f.id));
  return line.foes.filter((id) => !known.has(id));
}
