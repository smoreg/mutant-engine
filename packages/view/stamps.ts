/**
 * The pixel atlas of the body: a small palette from the design tokens, ramps
 * of three tones per material, hand-drawn stamps of organs as rows of
 * characters (8, 12 and 16 px, pointing up, the limb coming from below), and
 * a visual record for every organ kind - which stamp, where it goes, how
 * many, in what ramp. A mutation is either structural (the graph changes
 * shape) or the visual of the organ it grows; a kind with nothing to show
 * says so with a reason, and there are very few of those.
 *
 * Roles in a mask: `.` nothing, `#` outline, `1` dark, `2` base, `3` light
 * of the ramp, `w` white, `k` pupil, `f` flesh, `y` amber, `g` bio, `b` bile.
 */
import { ORGANS, type CoverId, type Family, type Mutation, type MutationOp, type OrganKind } from "@mutant-engine/core";

export interface PaletteEntry {
  name: string;
  /** `#rrggbb` or `#rrggbbaa`. */
  color: string;
}

/** Index 0 is empty; every other index names one colour. Small on purpose: a body uses five to twelve of these. */
export const PALETTE: readonly PaletteEntry[] = [
  { name: "empty", color: "#00000000" },
  { name: "outline", color: "#0b0a09" },
  { name: "shade", color: "#3b2a20" },
  { name: "skin", color: "#c4a07e" },
  { name: "skinLight", color: "#e2c5a2" },
  { name: "chitin", color: "#8c6a3f" },
  { name: "chitinLight", color: "#b58b55" },
  { name: "scales", color: "#6d8f86" },
  { name: "scalesLight", color: "#9bbcb0" },
  { name: "dragonScales", color: "#3f5f57" },
  { name: "slime", color: "#6fae7f" },
  { name: "slimeLight", color: "#a6dcaa" },
  { name: "suckers", color: "#a8636d" },
  { name: "suckersLight", color: "#cf8f96" },
  { name: "fur", color: "#9c805a" },
  { name: "bark", color: "#6b5238" },
  { name: "plates", color: "#a49d8c" },
  { name: "chrome", color: "#7fa8ba" },
  { name: "chromeLight", color: "#cfe3ec" },
  { name: "chromeDark", color: "#2e4a57" },
  { name: "white", color: "#e9dec9" },
  { name: "bone", color: "#b4a890" },
  { name: "flesh", color: "#c4493b" },
  { name: "fleshLight", color: "#e0705a" },
  { name: "amber", color: "#cf9550" },
  { name: "bile", color: "#d3a947" },
  { name: "bio", color: "#5fd4b1" },
  { name: "body", color: "#c27b62" },
  { name: "head", color: "#b58ad0" },
  { name: "gut", color: "#c9a15b" },
  { name: "sec", color: "#8fb35a" },
  { name: "alien", color: "#d47aa8" },
  { name: "ctrl", color: "#9a8f7d" },
  { name: "shadow", color: "#0000006b" },
  // --- lab/beasts: covers
  { name: "feathers", color: "#8a5535" },
  { name: "stone", color: "#78736c" },
];

const P: Record<string, number> = {};
PALETTE.forEach((p, i) => (P[p.name] = i));

export function paletteIndex(name: string): number {
  const i = P[name];
  if (i === undefined) throw new Error(`palette: no colour ${name}`);
  return i;
}

export interface Ramp {
  dark: number;
  base: number;
  light: number;
}

type RampName = CoverId | "flesh" | "bone" | "body" | "head" | "gut" | "sec" | "alien" | "ctrl" | "bio" | "bile" | "amber";

const ramp = (dark: string, base: string, light: string): Ramp => ({ dark: P[dark]!, base: P[base]!, light: P[light]! });

/** Three tones per material: the covers, and the colours of the families and the marks. */
export const RAMPS: Record<RampName, Ramp> = {
  skin: ramp("shade", "skin", "skinLight"),
  chitin: ramp("shade", "chitin", "chitinLight"),
  scales: ramp("shade", "scales", "scalesLight"),
  dragonScales: ramp("shade", "dragonScales", "scales"),
  slime: ramp("shade", "slime", "slimeLight"),
  suckers: ramp("shade", "suckers", "suckersLight"),
  fur: ramp("shade", "fur", "skinLight"),
  bark: ramp("shade", "bark", "chitin"),
  plates: ramp("shade", "plates", "white"),
  chrome: ramp("chromeDark", "chrome", "chromeLight"),
  // --- lab/beasts: covers
  feathers: ramp("shade", "feathers", "amber"),
  stone: ramp("chromeDark", "stone", "plates"),
  flesh: ramp("shade", "flesh", "fleshLight"),
  bone: ramp("shade", "bone", "white"),
  body: ramp("shade", "body", "fleshLight"),
  head: ramp("shade", "head", "alien"),
  gut: ramp("shade", "gut", "bile"),
  sec: ramp("shade", "sec", "bio"),
  alien: ramp("shade", "alien", "suckersLight"),
  ctrl: ramp("shade", "ctrl", "bone"),
  bio: ramp("chromeDark", "bio", "white"),
  bile: ramp("shade", "bile", "white"),
  amber: ramp("shade", "amber", "bile"),
};

/** The ramp a family's organs are painted in. */
const FAMILY_RAMP: Record<Family, RampName> = {
  limbs: "body",
  heads: "head",
  senses: "head",
  jaws: "gut",
  covers: "body",
  glands: "sec",
  movement: "body",
  internals: "gut",
  reproduction: "sec",
  psionics: "head",
  plant: "sec",
  parasites: "alien",
  space: "alien",
  regulators: "ctrl",
  defects: "ctrl",
  explosive: "bile",
  selfEating: "alien",
  chromeBreaking: "chrome",
};

// ---------------------------------------------------------------- stamps

export interface Stamp {
  size: 8 | 12 | 16;
  rows: string[];
}

const s8 = (...rows: string[]): Stamp => ({ size: 8, rows });
const s12 = (...rows: string[]): Stamp => ({ size: 12, rows });
const s16 = (...rows: string[]): Stamp => ({ size: 16, rows });

/** Every stamp by name, one or more sizes each. Drawn pointing up: an ending's limb arrives from below. */
export const STAMPS: Record<string, Stamp[]> = {
  hand: [
    s8("..#.#...", ".#2#2#..", "#3#3#2#.", "#3232#2#", "#32222#.", "#32221#.", ".#221#..", "..###..."),
    s12(
      "....#..#....",
      "...#2##2#...",
      ".#.#3##3#.#.",
      "#2##3##3##2#",
      "#3#2222222#.",
      "#3322222222#",
      "#3322222221#",
      "#33222222#1#",
      ".#3222221#..",
      ".#3222211#..",
      "..#222111#..",
      "...######...",
    ),
  ],
  pincer: [
    s8("#......#", "#3#..#3#", "#32#.#2#", "#32#.#2#", ".#32#2#.", ".#3221#.", "..#221#.", "...###.."),
    s12(
      "##.......##.",
      "#3#.....#2#.",
      "#33#...#22#.",
      "#33#...#22#.",
      "#332#.#221#.",
      ".#32#.#21#..",
      ".#332#221#..",
      "..#32221#...",
      "..#322211#..",
      "...#22211#..",
      "...#2221#...",
      "....####....",
    ),
  ],
  claw: [
    s8("#..#..#.", "#3.#3.#3", "#3.#3.#3", ".#3#3#3.", ".#32223#", "..#2221#", "..#221#.", "...###.."),
    s12(
      "#....#....#.",
      "#3...#3...#3",
      "#3...#3...#3",
      "#3...#3...#3",
      ".#3..#3..#3.",
      ".#32.#32.#3.",
      "..#3##3##3..",
      "..#3222223#.",
      "...#222221#.",
      "...#222211#.",
      "....#2211#..",
      ".....####...",
    ),
  ],
  hook: [s8("...##...", "..#33#..", ".#3#.#..", ".#3#....", ".#32#...", "..#22#..", "..#221#.", "...###..")],
  sucker: [s8("..####..", ".#3333#.", "#3#22#3#", "#3#11#3#", "#32222#.", ".#2221#.", "..#22#..", "...##...")],
  mouth: [
    s8("..####..", ".#3ff3#.", "#3fwfwf#", "#kfkfkf#", "#fwfwff#", ".#ffff#.", "..#22#..", "...##..."),
    s12(
      "...######...",
      "..#333333#..",
      ".#3ffffff3#.",
      "#3fwfkfwfkf#",
      "#ffkfwfkfwf#",
      "#fkkkkkkkkf#",
      "#ffwfkfwfkf#",
      "#3fkfwfkfwf#",
      ".#ffffffff#.",
      "..#222222#..",
      "...#2221#...",
      "....####....",
    ),
  ],
  sting: [s8("...#....", "..#3#...", "..#3#...", ".#32#...", ".#32#...", ".#221#..", "#22221#.", "######..")],
  foot: [s8("........", "........", "..####..", ".#3333#.", "#322222#", "#2222211", "#1111111", "########")],
  hoof: [s8("........", "..####..", ".#3222#.", ".#3222#.", "#332221#", "#322221#", "#111111#", ".######.")],
  pseudopod: [s8("...##...", "..#33#..", ".#3322#.", "#332222#", "#322221#", "#322211#", ".#2221#.", "..####..")],
  snout: [s8("..####..", ".#3333#.", "#3k32k3#", "#332223#", "#322222#", ".#2221#.", "..#22#..", "...##...")],
  eye: [
    s8("..####..", ".#wwww#.", "#wwkkww#", "#wkkkkw#", "#wwkkww#", ".#wwww#.", "..####..", "........"),
    s12(
      "....####....",
      "..##wwww##..",
      ".#wwwwwwww#.",
      "#wwww22wwww#",
      "#www2kk2www#",
      "#www2kk2www#",
      "#wwww22wwww#",
      ".#wwwwwwww#.",
      "..##wwww##..",
      "....####....",
      "............",
      "............",
    ),
  ],
  eyeWhite: [
    s8("..####..", ".#wwww#.", "#wwwwww#", "#wwwwww#", "#wwwwww#", ".#wwww#.", "..####..", "........"),
    s12(
      "....####....",
      "..##wwww##..",
      ".#wwwwwwww#.",
      "#wwwwwwwwww#",
      "#wwwwwwwwww#",
      "#wwwwwwwwww#",
      "#wwwwwwwwww#",
      ".#wwwwwwww#.",
      "..##wwww##..",
      "....####....",
      "............",
      "............",
    ),
  ],
  brain: [
    s8("........", "..####..", ".#3232#.", "#323232#", "#232323#", ".#3232#.", "..####..", "........"),
    // Two hemispheres and their folds, for the scheme where a brain must read at a glance.
    s12(
      "...##.##....",
      ".##33#33##..",
      "#3323#3223#.",
      "#3232#2321#.",
      "#2321#3212#.",
      "#3212#2121#.",
      ".#211#121#..",
      "..##1#11##..",
      "....###.....",
      "............",
      "............",
      "............",
    ),
  ],
  tumour: [
    s8("..####..", ".#3322#.", "#33f222#", "#32ff21#", "#3f2221#", "#22f211#", ".#2211#.", "..####.."),
    s12(
      "....####....",
      "..##3322##..",
      ".#33322222#.",
      "#333f222222#",
      "#33ff2222f1#",
      "#32f22222f1#",
      "#322222ff21#",
      "#3222f2f221#",
      "#22222f2211#",
      ".#22222211#.",
      "..#222211#..",
      "...######...",
    ),
  ],
  eyeShut: [s8("........", "........", "#......#", ".######.", "........", "........", "........", "........")],
  eyeBlind: [s8("..####..", ".#wwww#.", "#wwwwww#", "#wwwwww#", "#wwwwww#", ".#wwww#.", "..####..", "........")],
  headRound: [
    s8(".######.", "#333322#", "#332222#", "#322222#", "#322221#", "#222211#", ".#2211#.", "..####.."),
    s12(
      "...######...",
      ".##333322##.",
      "#3333322221#",
      "#3332222221#",
      "#3322222221#",
      "#3222222221#",
      "#2222222211#",
      "#2222222111#",
      ".#22222111#.",
      ".#22221111#.",
      "..##2211##..",
      "....####....",
    ),
    s16(
      ".....######.....",
      "...##33333322##.",
      "..#33333322222#.",
      ".#333333222222##",
      "#33333322222221#",
      "#33333222222221#",
      "#33322222222221#",
      "#33222222222221#",
      "#32222222222221#",
      "#22222222222211#",
      "#22222222222111#",
      ".#222222221111#.",
      ".#222222111111#.",
      "..#2222111111#..",
      "...##221111##...",
      ".....######.....",
    ),
  ],
  headLong: [
    s12(
      "....####....",
      "..##3333##..",
      ".#33333322#.",
      "#3333322221#",
      "#3332222221#",
      "#3322222221#",
      "#3222222211#",
      "#2222222111#",
      "#2222221111#",
      ".#22221111#.",
      "..#221111#..",
      "...######...",
    ),
    s16(
      "......####......",
      "....##333322##..",
      "...#33333322221#",
      "..#333333222221#",
      ".#3333332222221#",
      "#33333322222221#",
      "#33333222222221#",
      "#33332222222221#",
      "#33322222222221#",
      "#33222222222211#",
      "#32222222222111#",
      "#22222222221111#",
      ".#222222221111#.",
      "..#2222221111#..",
      "...##2211111#...",
      ".....######.....",
    ),
  ],
  headSmall: [s8("..####..", ".#3332#.", "#332222#", "#322221#", "#222211#", ".#2211#.", "..####..", "........")],
  brainDot: [s8("........", "........", "...##...", "..#33#..", "..#32#..", "...##...", "........", "........")],
  jaw: [s8("........", "........", "........", "########", "#w#w#w#w", "########", "........", "........")],
  ear: [
    s8("........", "..##....", ".#33#...", "#3222#..", "#2221#..", ".#221#..", "..###...", "........"),
    s12(
      "....#####...",
      "..##33222##.",
      ".#33322221#.",
      "#333#22221#.",
      "#33#.#2221#.",
      "#33#.#2221#.",
      "#32#..#221#.",
      "#22#..#221#.",
      ".#2#..#21#..",
      ".#22##221#..",
      "..#222211#..",
      "...######...",
    ),
  ],
  nose: [
    s8("........", "........", "...##...", "..#22#..", ".#2112#.", ".#k22k#.", "..####..", "........"),
    s12(
      "............",
      "............",
      "....#33#....",
      "....#32#....",
      "...#3222#...",
      "...#3222#...",
      "..#332221#..",
      ".#33222221#.",
      "#3k22222k21#",
      "#3222222221#",
      ".#22222221#.",
      "..########..",
    ),
  ],
  drill: [s8("...##...", "..#33#..", "..#31#..", ".#3221#.", ".#2121#.", "#322121#", "#212121#", ".######.")],
  root: [s8("...##...", "..#22#..", ".#2222#.", "#22#22#.", "#2#.#2#.", "#2#..#2#", "#2#..#2#", "##....##")],
  flower: [s8(".#....#.", "#3#..#3#", "#33##33#", ".#3ff3#.", "#3fkkf3#", "#33ff33#", ".#3223#.", "..####..")],
  heart: [
    s8(".##..##.", "#33##23#", "#322222#", "#322222#", ".#2221#.", "..#21#..", "...##...", "........"),
    s12(
      "..###..###..",
      ".#333##223#.",
      "#3333322222#",
      "#3332222221#",
      "#3222222221#",
      "#2222222221#",
      ".#22222221#.",
      "..#2222211#.",
      "...#22211#..",
      "....#211#...",
      ".....##.....",
      "............",
    ),
  ],
  lungs: [
    s8("...##...", "..#22#..", ".#3#2#2#", "#33#2#22", "#32#1#22", "#32#.#21", "#22#.#11", ".##..##."),
    s12(
      ".....#1#....",
      ".....#1#....",
      "....##1##...",
      ".#33#111#22#",
      "#333#1#2221#",
      "#333#1#2221#",
      "#332###2211#",
      "#332#.#2211#",
      "#322#.#2211#",
      ".#22#.#211#.",
      ".#22#.#211#.",
      "..##...###..",
    ),
  ],
  stomach: [
    s8("....##..", "...#33#.", "..#3322#", ".#33222#", "#332222#", "#322221#", "#222211#", ".######."),
    s12(
      "............",
      "......###...",
      "....##3222#.",
      "...#3322221#",
      "..#33222221#",
      ".#332222221#",
      "#3322222221#",
      "#3222222211#",
      "#2222222211#",
      ".#22222211#.",
      "..#222211#..",
      "...######...",
    ),
  ],
  coil: [s8("..####..", ".#3333#.", "#32###2#", "#3#.#.2#", "#32###2#", "#222222#", ".#2221#.", "..####..")],
  gland: [
    s8("........", "...#....", "..#3#...", ".#332#..", "#33222#.", "#32222#.", ".#221#..", "..###..."),
    s12(
      ".....#3#....",
      ".....#2#....",
      "....#322#...",
      "...#33222#..",
      "..#3322221#.",
      ".#333222221#",
      "#3332222221#",
      "#3322222211#",
      "#3222222211#",
      ".#32222211#.",
      "..#222211#..",
      "...######...",
    ),
  ],
  womb: [s8("..####..", ".#3333#.", "#33w222#", "#3www22#", "#32w222#", ".#2221#.", "..#21#..", "...##...")],
  egg: [s8("...##...", "..#33#..", ".#3322#.", ".#3222#.", "#322221#", "#222211#", ".#2211#.", "..####..")],
  bulge: [s8("........", "........", "..####..", ".#3332#.", "#332222#", "#322221#", "#222211#", "........")],
  maw: [s8("########", "#wkwkwkw", "#kkkkkkk", "#fkkkkkf", "#kkkkkkk", "#wkwkwkw", "########", "........")],
  spike: [s8("...#....", "...#3...", "..#3#...", "..#32#..", ".#3221#.", ".#2221#.", "#222111#", "########")],
  glow: [s8("........", "..####..", ".#w333#.", "#ww3322#", "#w33222#", "#332221#", ".#2221#.", "..####..")],
  bubble: [
    s8("..####..", ".#3ww3#.", "#3w3222#", "#332222#", "#322222#", "#222221#", ".#2211#.", "..####.."),
    s12(
      "....####....",
      "..##3ww3##..",
      ".#33www3222#",
      "#3ww3222221#",
      "#3w33222221#",
      "#3332222221#",
      "#3322222221#",
      "#3222222211#",
      ".#32222211#.",
      ".#22222211#.",
      "..#222211#..",
      "...######...",
    ),
  ],
  gill: [
    s8("........", "#.#.#.#.", "#f#f#f#.", "#f#f#f#.", "#f#f#f#.", "#f#f#f#.", "#.#.#.#.", "........"),
    s12(
      "............",
      ".####.####..",
      "#f11f#f11f#.",
      "#f11f#f11f#.",
      "#ff1f#ff1f#.",
      "#ff1f#ff1f#.",
      "#fff#.#fff#.",
      "#fff#.#fff#.",
      ".#ff#.#ff#..",
      ".#f#...#f#..",
      "..#.....#...",
      "............",
    ),
  ],
  fin: [s8(".......#", "......#3", ".....#33", "....#332", "...#3322", "..#22222", ".#222111", "########")],
  crack: [s8("#.......", ".#......", "..#.....", "..#.#...", "...#....", "...#.#..", "....#...", ".....#..")],
  rot: [s8("........", ".#1.#1..", "#111#11#", ".#1.#1#.", "..#1111.", ".#11#1..", "..#..#..", "........")],
  lump: [
    s8("........", "...##...", "..#33#..", ".#3222#.", "#322221#", "#222211#", ".#2211#.", "..####.."),
    s12(
      "............",
      "............",
      "....####....",
      "..##3322##..",
      ".#33322221#.",
      "#3332222221#",
      "#3322222211#",
      "#3222222211#",
      "#2222222211#",
      ".#22222211#.",
      "..#222211#..",
      "...######...",
    ),
  ],
  larva: [s8("........", "........", "...###..", "..#332#.", ".#3k22#.", "#3222#..", "#221#...", ".###....")],
  worm: [s8("..###...", ".#322#..", "#3#.#2#.", "#2#..#2#", "##...#2#", "....#22#", "...#221#", "...###..")],
  fungus: [s8("..####..", ".#3333#.", "#332222#", "#222221#", ".##22##.", "..#22#..", "..#21#..", "..####..")],
  leaf: [s8("......#.", ".....#3#", "....#33#", "..##332#", ".#3322#.", "#3222#..", "#221#...", "###.....")],
  tendril: [s8("...##...", "..#22#..", ".#2#.##.", ".#2#....", "#2#.....", "#2#.....", ".#2#....", "..##....")],
  moss: [s8("........", ".#..#...", "#3#3#.#.", "#2#2#3#.", ".#2#2#..", "#2222#..", ".####...", "........")],
  vein: [s8("......#.", ".....#2#", "....#2#.", "...#2#..", "..#2#...", ".#2#....", "#2#.....", ".#......")],
  spark: [s8("...w....", ".w.w.w..", "..www...", "wwwbwww.", "..www...", ".w.w.w..", "...w....", "........")],
  glitch: [s8("#2#2....", "..#2#2..", "2#2#....", "....#2#2", ".#2#2...", "#2#2....", "...#2#2.", "........")],
  shiver: [s8("........", ".#.#.#..", "#.#.#.#.", "........", "........", ".#.#.#..", "#.#.#.#.", "........")],
  flake: [s8("........", "........", "........", "...#....", ".#.....#", "...#.#..", "#....#..", "..#.....")],
  ghost: [s8("..#.#...", ".w.w.w..", "#.w.w.#.", ".w.w.w..", ".#.w.#..", "..w.w...", ".#.w.#..", "..#.#...")],
  stubs: [s8("........", "........", "........", "##....##", "#3#..#3#", "#22##22#", "#222222#", "########")],
  bud: [s8("........", "...##...", "..#33#..", "..#32#..", "...#2#..", "...#2#..", "..#22#..", "..####..")],
  scar: [s8("........", "..#.....", "..##.#..", "...##...", "..#.##..", ".....#..", "........", "........")],
  aura: [
    s12(
      "....2..2....",
      "..2......2..",
      ".2........2.",
      "............",
      "2..........2",
      "............",
      "............",
      "2..........2",
      "............",
      ".2........2.",
      "..2......2..",
      "....2..2....",
    ),
  ],
  antenna: [s8("#......#", ".#....#.", "..#..#..", "..#..#..", "..#..#..", "...##...", "...##...", "........")],
  fang: [s8("........", "........", "........", "#......#", "#w....w#", ".#w..w#.", "..#..#..", "........")],
  mandible: [s8("#......#", "#3#..#2#", "#3#..#2#", ".#3#.#2#", "..#3#2#.", "...#2#..", "...#2#..", "....#...")],
  proboscis: [s8("....#...", "...#2#..", "..#22#..", "..#2#...", ".#22#...", ".#2#....", ".#2#....", "..#.....")],
  psi: [
    s8("...##...", "..#33#..", ".#3223#.", "#32ww23#", "#32ww23#", ".#3223#.", "..#22#..", "...##..."),
    // The trident of the mind: what a psionic organ is on the scheme.
    s12(
      "#..#.##.#..#",
      "#3.#3##3#.3#",
      "#3.#3223#.3#",
      "#2##3223##2#",
      ".#2#2ww2#2#.",
      "..#22ww22#..",
      "...#2222#...",
      "....#22#....",
      "....#21#....",
      "...##21##...",
      "...#1111#...",
      "....####....",
    ),
  ],
  crown: [s8("#..##..#", "#3#33#3#", "#332223#", "#322222#", "#222221#", "#222211#", "########", "........")],
  shield: [s8("########", "#333222#", "#332222#", "#322221#", ".#2221#.", ".#2211#.", "..#21#..", "...##...")],
  fold: [s8("........", "#3#..#3#", "#33##32#", "#322222#", "#3#22#2#", "#2#..#1#", "##....##", "........")],
  rift: [s8("...#....", "..#k#...", ".#kkk#..", ".#kgk#..", ".#kkk#..", "..#k#...", "...#....", "........")],
  node: [s8("...##...", ".##33##.", "#3#32#2#", "#332222#", "#3#22#2#", ".##21##.", "...##...", "........")],
  bolt: [s8("....#3#.", "...#33#.", "..#33#..", ".#3333#.", "..#33#..", "..#3#...", ".#3#....", "#3#.....")],
  // A row of teeth, the same left and right of its middle: a mouth drawn on the axis of a face must sit on it (decision 201).
  teeth: [s8("........", "........", "########", "#w#ww#w#", "#w#ww#w#", "#w#ww#w#", "########", "........")],
  drop: [s8("...#....", "..#3#...", "..#3#...", ".#332#..", ".#322#..", "#32222#.", "#22221#.", ".####...")],
  web: [s8("#..#..#.", ".#.#.#..", "..###...", "###.###.", "..###...", ".#.#.#..", "#..#..#.", "........")],
  fire: [s8("...#....", "..#3#...", "..#3#.#.", ".#33#3#.", ".#3223#.", "#322222#", "#f2222f#", ".######.")],
  ice: [s8("...#....", ".#.3.#..", "..#3#...", "#3#3#3#.", "..#3#...", ".#.3.#..", "...#....", "........")],
  spores: [s8("........", "#3#.....", "#2#.#3#.", ".#..#2#.", "...#3#..", "#3##2#..", "#2#.#...", "........")],
  anchor: [s8("...##...", "..#33#..", "...##...", "#..#2..#", "#2.#2.2#", "#22#222#", ".#2222#.", "..####..")],
  mirror: [s8("########", "#w3w3w3#", "#3w3w3w#", "#w3w3w3#", "#3w3w3w#", "#w3w3w3#", "########", "........")],
  crystal: [s8("...#....", "..#3#...", "..#33#..", ".#3332#.", ".#3322#.", "#332222#", "#222221#", ".######.")],
  bone: [s8("##....##", "#33####3", "#3222223", "##2222##", "..#22#..", "##2222##", "#322223#", "##....##")],
  pores: [s8("........", ".#..#...", "#1##1#..", ".#..#..#", "...#..#1", "..#1##.#", "...#....", "........")],
  blister: [s8("........", "..####..", ".#3ww3#.", "#33w223#", "#332223#", ".#2222#.", "..####..", "........")],
  pouch: [s8("........", ".######.", "#333222#", "#3#2#22#", "#322222#", "#222221#", ".#2211#.", "..####..")],
  stitch: [s8("........", "#.#.#.#.", "########", "#.#.#.#.", "........", "........", "........", "........")],
  magnet: [s8("#w#..#w#", "#3#..#2#", "#3#..#2#", "#3####2#", "#332222#", ".#3222#.", "..####..", "........")],
  wave: [s8("........", ".##..##.", "#22##22#", "#..##..#", "........", ".##..##.", "#22##22#", "........")],
  implant: [s8("..####..", ".#3ww3#.", "#33kk22#", "#3kkkk2#", "#3kkkk2#", "#22kk21#", ".#2221#.", "..####..")],
  face: [s8("..####..", ".#3222#.", "#3w22w2#", "#322222#", "#3#ff#2#", "#22ff21#", ".#2211#.", "..####..")],
  split: [s8("...#....", "...#....", "...#....", "...#....", "...#....", "...#....", "...#....", "...#....")],
  facet: [s8("..####..", ".#k3k3#.", "#3k3k3k#", "#k3k3k3#", "#3k3k3k#", ".#k3k3#.", "..####..", "........")],
  eyeHeat: [s8("..####..", ".#ffff#.", "#ffbbff#", "#fbwwbf#", "#ffbbff#", ".#ffff#.", "..####..", "........")],
  runaway: [s8("..####..", ".#3222#.", "#3k222k#", "#322222#", ".#2221#.", "..#.#...", ".#..#...", ".#...#..")],
  nest: [s8("........", "..####..", ".#w3w3#.", "#3w3w32#", "#2222222", "#1221221", ".######.", "........")],
};

/** The largest stamp not above `size`; an 8 doubles into a 16 when nothing larger is drawn. */
export function stampFor(name: string, size: number): Stamp {
  const list = STAMPS[name];
  if (list === undefined) throw new Error(`stamps: no stamp ${name}`);
  let best: Stamp | undefined;
  for (const s of list) if (s.size <= size && (best === undefined || s.size > best.size)) best = s;
  for (const s of list) if (s.size * 2 <= size && (best === undefined || s.size * 2 > best.size)) best = doubled(s);
  return best ?? list.reduce((a, b) => (a.size < b.size ? a : b));
}

const doubledCache = new Map<Stamp, Stamp>();

function doubled(s: Stamp): Stamp {
  const hit = doubledCache.get(s);
  if (hit !== undefined) return hit;
  const rows: string[] = [];
  for (const row of s.rows) {
    let line = "";
    for (const ch of row) line += ch + ch;
    rows.push(line, line);
  }
  const out: Stamp = { size: (s.size * 2) as 8 | 12 | 16, rows };
  doubledCache.set(s, out);
  return out;
}

// ---------------------------------------------------------------- visual records

/** Where the stamp goes: the tip of a limb, on or around a head, on a torso as if seen through, along a segment, as a halo behind the node. */
export type Placement = "tip" | "head" | "inside" | "along" | "aura";

interface Visual {
  stamp: string;
  place: Placement;
  /** How many stamps one organ instance puts; default 1. */
  count?: number;
  /** The ramp the stamp's 1/2/3 roles resolve in; default: the family's, the cover's for endings. */
  ramp?: RampName;
  /** The segment under a growth of this kind is drawn this much thicker (or thinner). */
  swell?: number;
  /** What the rig does besides: the segment shakes, the eyes dart. */
  anim?: "shake" | "eyes";
  /** Nothing to draw, and why. Only for a kind with truly no body. */
  hidden?: string;
}

const v = (stamp: string, place: Placement, extra: Omit<Visual, "stamp" | "place"> = {}): Visual => ({ stamp, place, ...extra });
const tip = (stamp: string, extra: Omit<Visual, "stamp" | "place"> = {}): Visual => v(stamp, "tip", extra);
const onHead = (stamp: string, extra: Omit<Visual, "stamp" | "place"> = {}): Visual => v(stamp, "head", extra);
const inside = (stamp: string, extra: Omit<Visual, "stamp" | "place"> = {}): Visual => v(stamp, "inside", extra);
const along = (stamp: string, extra: Omit<Visual, "stamp" | "place"> = {}): Visual => v(stamp, "along", extra);

export const VISUALS: Record<OrganKind, Visual> = {
  // endings
  hand: tip("hand"),
  pincer: tip("pincer"),
  claw: tip("claw"),
  hook: tip("hook"),
  sucker: tip("sucker", { ramp: "suckers" }),
  mouth: tip("mouth", { ramp: "flesh" }),
  sting: tip("sting", { ramp: "bone" }),
  foot: tip("foot"),
  hoof: tip("hoof", { ramp: "bone" }),
  pseudopod: tip("pseudopod", { ramp: "slime" }),
  snout: tip("snout"),
  eye: tip("eye"),
  head: onHead("headRound"),
  drill: tip("drill", { ramp: "chrome" }),
  root: tip("root", { ramp: "bark" }),
  flower: tip("flower", { ramp: "sec" }),
  // inside a head
  brain: onHead("brainDot", { ramp: "head" }),
  jaw: onHead("jaw"),
  ear: onHead("ear"),
  nose: onHead("nose"),
  // cavity
  heart: inside("heart", { ramp: "flesh" }),
  lungs: inside("lungs", { ramp: "bone" }),
  stomach: inside("stomach", { ramp: "gut" }),
  gut: inside("coil", { ramp: "gut" }),
  gland: inside("gland", { ramp: "sec" }),
  womb: inside("womb", { ramp: "alien" }),
  // growths
  spines: along("spike", { count: 3, ramp: "bone" }),
  skinGland: along("gland", { count: 2, ramp: "sec" }),
  bladder: along("bubble", { ramp: "bone" }),
  photophores: along("glow", { count: 3, ramp: "bio" }),
  // chrome
  implant: tip("implant", { ramp: "chrome" }),
  // heads
  smallBrain: onHead("brainDot", { ramp: "head" }),
  ganglion: inside("node", { ramp: "head" }),
  gutBrain: inside("brainDot", { ramp: "head", count: 2 }),
  // The wide end of the ladder: a great brain fills the head, a cord is a chain of nodes down the body, a slow brain
  // is one thick coil.
  greatBrain: onHead("brainDot", { ramp: "head", count: 3 }),
  nerveCord: inside("node", { ramp: "head", count: 3 }),
  slowBrain: onHead("coil", { ramp: "head" }),
  fleshMemory: inside("coil", { ramp: "head" }),
  coldMind: onHead("ice", { ramp: "chrome" }),
  mirrorLobes: onHead("bulge", { count: 2, ramp: "head" }),
  weakNeck: along("crack", { swell: 0.6 }),
  sharedBlood: along("vein", { ramp: "flesh" }),
  echoChamber: onHead("ear", { count: 2, ramp: "head" }),
  bloodlust: onHead("psi", { ramp: "flesh" }),
  nerveShunt: inside("bolt", { ramp: "head" }),
  twoFaces: onHead("face"),
  cortexFolds: onHead("bulge", { ramp: "head" }),
  // senses
  heatEye: onHead("eyeHeat"),
  echo: onHead("antenna", { ramp: "head" }),
  deepSense: inside("psi", { ramp: "head" }),
  electroSense: along("bolt", { ramp: "bile" }),
  magnetSense: onHead("antenna", { ramp: "chrome" }),
  whiskers: onHead("antenna", { count: 2 }),
  earCluster: onHead("ear", { count: 3 }),
  noPain: { stamp: "", place: "inside", hidden: "отсутствие боли — свойство нервов, у него нет тела" },
  sixthSense: inside("psi", { ramp: "head" }),
  innerEye: onHead("eyeShut", { ramp: "head" }),
  facetEye: onHead("facet", { ramp: "head" }),
  scentOrgan: onHead("nose", { ramp: "head" }),
  lightSkin: along("glow", { count: 2, ramp: "bone" }),
  // jaws
  fangs: onHead("fang"),
  crusherJaw: onHead("teeth", { ramp: "bone" }),
  proboscis: onHead("proboscis", { ramp: "gut" }),
  mandibles: onHead("mandible", { ramp: "chitin" }),
  radula: onHead("teeth", { ramp: "gut" }),
  acidStomach: inside("stomach", { ramp: "bile" }),
  fermentSac: inside("stomach", { ramp: "sec" }),
  crop: inside("bulge", { ramp: "gut" }),
  enzymeGland: inside("gland", { ramp: "gut" }),
  glutton: inside("maw"),
  abyssLiver: inside("bulge", { ramp: "alien" }),
  throatTeeth: along("teeth", { ramp: "bone" }),
  eternalHunger: inside("maw", { ramp: "alien" }),
  // covers
  shootingSpines: along("spike", { count: 4, ramp: "bone" }),
  chromatophores: along("blister", { count: 3, ramp: "alien" }),
  rottingSkin: along("rot", { count: 2 }),
  mirrorLayer: along("mirror", { count: 2, ramp: "chrome" }),
  pores: along("pores", { count: 2 }),
  moult: along("flake", { count: 2, ramp: "bone" }),
  fallingFlesh: along("flake", { count: 3, ramp: "flesh" }),
  // glands
  venomGland: inside("gland", { ramp: "sec" }),
  acidGland: inside("gland", { ramp: "bile" }),
  acidBlood: inside("drop", { ramp: "bile" }),
  fireGland: inside("fire", { ramp: "amber" }),
  cryoGland: inside("ice", { ramp: "chrome" }),
  sporeGland: inside("spores", { ramp: "sec" }),
  webGland: inside("web", { ramp: "bone" }),
  pheromoneGland: inside("drop", { ramp: "alien" }),
  inkSac: inside("drop", { ramp: "chrome" }),
  siphon: inside("bubble", { ramp: "chrome" }),
  electricOrgan: inside("bolt", { ramp: "bile" }),
  gasSac: inside("bubble", { ramp: "sec" }),
  pusGland: inside("drop", { ramp: "bile" }),
  tarGland: inside("drop", { ramp: "bark" }),
  panaceaGland: inside("gland", { ramp: "amber" }),
  // movement
  fins: along("fin", { count: 2, ramp: "scales" }),
  spiderThread: along("web", { ramp: "bone" }),
  booster: inside("fire", { ramp: "chrome" }),
  foldingSkeleton: inside("fold", { ramp: "bone" }),
  // internals
  gillCluster: along("gill", { ramp: "flesh" }),
  doubleBreath: inside("lungs", { ramp: "bio" }),
  closedSystem: inside("bulge", { ramp: "plates" }),
  filters: inside("gill", { ramp: "bone" }),
  baroChamber: inside("bulge", { ramp: "chrome" }),
  coldBlood: inside("ice", { ramp: "chrome" }),
  heatGen: inside("fire", { ramp: "amber" }),
  spongyTissue: along("pores", { count: 3, ramp: "gut" }),
  marrow: inside("bone", { ramp: "bone" }),
  bloodReserve: inside("heart", { ramp: "flesh", count: 2 }),
  toxicFlesh: along("blister", { count: 2, ramp: "sec" }),
  tastyFlesh: along("bulge", { count: 2, ramp: "flesh" }),
  ironVeins: along("vein", { count: 2, ramp: "chrome" }),
  airSacs: inside("bubble", { count: 2, ramp: "bone" }),
  tracheae: along("pores", { count: 3, ramp: "bone" }),
  anaerobicGlands: inside("gland", { ramp: "gut" }),
  // reproduction
  ovipositor: inside("egg", { ramp: "sec" }),
  quickClutch: inside("egg", { count: 2, ramp: "sec" }),
  bud: along("bud", { ramp: "sec" }),
  broodPouch: along("pouch", { ramp: "sec" }),
  parthenogenesis: inside("womb", { ramp: "sec" }),
  liveBirth: inside("womb", { ramp: "flesh" }),
  parasiticClutch: inside("egg", { count: 2, ramp: "alien" }),
  motherBond: inside("coil", { ramp: "alien" }),
  cannibalWomb: inside("maw", { ramp: "alien" }),
  decoyEgg: inside("egg", { ramp: "bone" }),
  immortalLine: inside("egg", { ramp: "amber" }),
  swarmWomb: inside("egg", { count: 3, ramp: "sec" }),
  sterility: { stamp: "", place: "inside", hidden: "стерильность — отсутствие, а не орган; ей нечего показать" },
  // psionics
  willPush: onHead("psi", { ramp: "head" }),
  mindSting: onHead("psi", { ramp: "alien" }),
  terror: onHead("psi", { ramp: "ctrl" }),
  domination: onHead("crown", { ramp: "head" }),
  mindReading: onHead("eye", { ramp: "head" }),
  farSight: onHead("eye", { ramp: "bio" }),
  telekinesis: onHead("aura", { ramp: "head" }),
  psiFold: onHead("fold", { ramp: "head" }),
  willShield: onHead("shield", { ramp: "head" }),
  mindHeal: onHead("psi", { ramp: "bio" }),
  damping: onHead("node", { ramp: "ctrl" }),
  deepCall: onHead("rift", { ramp: "chrome" }),
  quietMind: onHead("eyeShut", { ramp: "ctrl" }),
  schism: onHead("split", { ramp: "ctrl" }),
  // plant
  photoSkin: along("leaf", { count: 3, ramp: "sec" }),
  chloroplasts: inside("leaf", { ramp: "sec" }),
  sporeSacs: along("spores", { count: 2, ramp: "sec" }),
  tendrils: along("tendril", { count: 2, ramp: "sec" }),
  bloom: onHead("flower", { ramp: "sec" }),
  nectary: along("drop", { ramp: "bile" }),
  seed: inside("egg", { ramp: "bark" }),
  mycelium: inside("fungus", { ramp: "bone" }),
  lichen: along("moss", { count: 3, ramp: "sec" }),
  treeRings: along("wave", { count: 2, ramp: "bark" }),
  resin: inside("drop", { ramp: "amber" }),
  phototropism: inside("leaf", { ramp: "ctrl" }),
  // parasites
  tapeworm: inside("worm", { ramp: "alien" }),
  brainWorm: onHead("worm", { ramp: "alien" }),
  boneLodger: along("lump", { ramp: "bone" }),
  nest: inside("nest", { ramp: "alien" }),
  cordyceps: onHead("fungus", { ramp: "alien" }),
  leechGland: along("worm", { ramp: "flesh" }),
  alienNerve: along("vein", { ramp: "alien" }),
  larvae: along("larva", { count: 3, ramp: "alien" }),
  symbioticEye: onHead("eye", { ramp: "alien" }),
  secondSoul: onHead("aura", { ramp: "alien" }),
  sporeMycelium: along("fungus", { count: 2, ramp: "alien" }),
  eggInBody: inside("egg", { ramp: "alien" }),
  cancerColony: along("lump", { count: 3, ramp: "alien" }),
  // space
  warpFold: along("fold", { ramp: "alien" }),
  anchor: along("anchor", { ramp: "chrome" }),
  pocket: inside("fold", { ramp: "alien" }),
  stepThrough: along("rift", { ramp: "alien" }),
  rift: along("rift", { count: 2, ramp: "alien" }),
  placeEcho: onHead("rift", { ramp: "alien" }),
  mirror: along("mirror", { ramp: "chrome" }),
  loop: inside("coil", { ramp: "alien" }),
  mismatch: along("glitch", { ramp: "alien" }),
  deepCord: inside("coil", { ramp: "chrome" }),
  alienGeometry: along("glitch", { count: 3, ramp: "alien" }),
  tremble: along("shiver", { ramp: "alien", anim: "shake" }),
  // regulators
  catalogOrgan: onHead("node", { ramp: "ctrl" }),
  selection: inside("node", { ramp: "ctrl" }),
  mirrorGland: inside("mirror", { ramp: "chrome" }),
  culling: inside("node", { ramp: "flesh" }),
  willVaccine: onHead("shield", { ramp: "ctrl" }),
  abyssPocket: inside("rift", { ramp: "ctrl" }),
  familyBias: inside("node", { ramp: "gut" }),
  stabilizer: inside("anchor", { ramp: "ctrl" }),
  anchorTissue: inside("anchor", { ramp: "bone" }),
  smelter: inside("fire", { ramp: "chrome" }),
  transfusion: inside("drop", { ramp: "flesh" }),
  burnout: inside("spark", { ramp: "ctrl" }),
  tailoring: along("stitch", { count: 2, ramp: "bone" }),
  tumourConductor: onHead("node", { ramp: "alien" }),
  remission: inside("node", { ramp: "bio" }),
  metastasis: inside("lump", { ramp: "alien" }),
  cancerGarden: along("lump", { count: 2, ramp: "sec" }),
  // defects
  blindness: onHead("eyeBlind"),
  deafness: onHead("scar", { count: 2 }),
  brittleBones: along("crack", { count: 2, ramp: "bone" }),
  muteness: onHead("stitch", { ramp: "bone" }),
  insatiable: inside("maw", { ramp: "ctrl" }),
  tremor: along("shiver", { ramp: "ctrl", anim: "shake" }),
  photophobia: onHead("eyeShut", { ramp: "ctrl" }),
  rot: along("rot", { count: 2, ramp: "sec" }),
  hydrophobia: inside("drop", { ramp: "ctrl" }),
  asymmetry: along("lump", { swell: 1.25, ramp: "ctrl" }),
  overweight: along("fold", { swell: 1.5, count: 2 }),
  seizures: along("shiver", { count: 2, ramp: "ctrl", anim: "shake" }),
  paranoia: onHead("aura", { ramp: "ctrl", anim: "eyes" }),
  phantomLimb: along("ghost", { ramp: "bone" }),
  abyssCall: onHead("rift", { ramp: "ctrl", anim: "eyes" }),
  silentTrunk: onHead("scar", { ramp: "ctrl" }),
  asthma: inside("lungs", { ramp: "ctrl" }),
  // explosive
  flammableBlood: inside("fire", { ramp: "flesh" }),
  gasCavities: along("bubble", { count: 2, ramp: "bile" }),
  unstableGlands: inside("gland", { ramp: "bile" }),
  detonatingSpores: along("spores", { count: 2, ramp: "bile" }),
  powderBone: along("bone", { ramp: "bile" }),
  bombEgg: inside("egg", { ramp: "bile" }),
  methaneStomach: inside("stomach", { ramp: "bile" }),
  thermiteFlesh: along("spark", { count: 2, ramp: "bile" }),
  charge: along("bolt", { ramp: "bile" }),
  selfIgnition: along("spark", { ramp: "amber" }),
  cryoCapillaries: inside("ice", { ramp: "chrome" }),
  blisterSkin: along("blister", { count: 3, ramp: "bile" }),
  // self-eating
  runawayGrowth: along("lump", { count: 2, ramp: "alien", swell: 1.2 }),
  autoimmunity: inside("rot", { ramp: "flesh" }),
  innerTeeth: inside("teeth", { ramp: "bone" }),
  crystallization: along("crystal", { count: 2, ramp: "chrome" }),
  overheat: inside("fire", { ramp: "flesh" }),
  inwardSpines: along("spike", { count: 2, ramp: "alien" }),
  nerveOvergrowth: onHead("vein", { ramp: "alien" }),
  cancerMetabolism: inside("lump", { ramp: "alien" }),
  sprouting: along("bud", { count: 2, ramp: "sec" }),
  selfDisassembly: along("crack", { count: 2, ramp: "alien" }),
  reverseMetabolism: inside("coil", { ramp: "alien" }),
  escapingOrgan: inside("runaway", { ramp: "gut" }),
  generosity: along("drop", { count: 2, ramp: "flesh" }),
  // chrome-breaking
  neuroplasia: onHead("bolt", { ramp: "chrome" }),
  boneWave: along("wave", { count: 2, ramp: "bone" }),
  magneticBlood: inside("magnet", { ramp: "chrome" }),
  electricInstability: inside("bolt", { ramp: "chrome" }),
  rejection: inside("rot", { ramp: "chrome" }),
  acidLymph: inside("drop", { ramp: "chrome" }),
  meatMemory: along("coil", { ramp: "flesh" }),
  jamming: onHead("antenna", { ramp: "chrome" }),
  bodyTeeth: along("teeth", { count: 3, ramp: "bone" }),
  nerveStorm: onHead("bolt", { count: 2, ramp: "chrome", anim: "eyes" }),
  // limbs
  hydra: along("stubs", { ramp: "body" }),
};

/** The ramp a stamp of the organ is painted in: its own; a limb's ending takes the cover of its limb; anything else its family's. */
export function rampOf(kind: OrganKind, cover: CoverId): RampName {
  const vis = VISUALS[kind];
  if (vis.ramp !== undefined) return vis.ramp;
  if (vis.place === "tip") return cover;
  const family = ORGANS[kind].family;
  return family === undefined ? cover : FAMILY_RAMP[family];
}

export function hiddenVisuals(): { kind: OrganKind; reason: string }[] {
  const out: { kind: OrganKind; reason: string }[] = [];
  for (const [kind, vis] of Object.entries(VISUALS) as [OrganKind, Visual][]) if (vis.hidden !== undefined) out.push({ kind, reason: vis.hidden });
  return out;
}

type MutationVisual = { kind: "structural"; op: MutationOp } | { kind: "organ"; organ: OrganKind; visual: Visual } | { kind: "hidden"; organ: OrganKind; reason: string };

/** What a mutation of the catalog shows: the shape of the graph changes, or the organ it grows has a stamp, or nothing with a reason. */
export function mutationVisual(m: Mutation): MutationVisual {
  if (m.op !== "organ") return { kind: "structural", op: m.op };
  const organ = m.payload.organ.kind;
  const vis = VISUALS[organ];
  if (vis.hidden !== undefined) return { kind: "hidden", organ, reason: vis.hidden };
  return { kind: "organ", organ, visual: vis };
}
