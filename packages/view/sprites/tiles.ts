/**
 * Cover tiles: eight by eight, laid over the base tone of a segment in the
 * coordinates of the frame, so a pattern runs across joints without a seam.
 * `.` leaves the tone; the roles are the segment's ramp. Skin is bare; a
 * glowing tile is for a segment with photophores or light-sensitive skin.
 */
import { mask, type Mask } from "./mask.js";

export const TILES: Record<"skin" | "chitin" | "scales" | "slime" | "suckers" | "fur" | "bark" | "plates" | "chrome" | "feathers" | "stone" | "dragonScales" | "glow", Mask> = {
  skin: mask("........", "........", "........", "........", "........", "........", "........", "........"),
  // Plates with a dark seam and a light rim.
  chitin: mask("11111111", "3.......", "........", "........", "........", "........", "........", "........"),
  // Scallops in two staggered rows.
  scales: mask("1...1...", ".3...3..", "........", "........", "..1...1.", "...3...3", "........", "........"),
  dragonScales: mask("1...1...", ".3...3..", "........", "........", "..1...1.", "...3...3", "........", "........"),
  // Glossy: sparse highlights and a drip.
  slime: mask("..3.....", ".33.....", "........", "......1.", "........", "3.......", "........", ".....3..",),
  // Discs down the surface.
  suckers: mask("........", ".111....", ".1w1....", ".111....", "........", ".....111", ".....1w1", ".....111"),
  // Short strokes across the grain.
  fur: mask(".1......", "..1...1.", ".......1", "...1....", "....1...", "1.......", ".1....1.", ".......1"),
  // Grain along the length.
  bark: mask("1...1...", "1...1...", "1...1...", "....1...", "1.......", "1...1...", "1...1...", "1...1...",),
  // A grid of bone plates with a highlight in each.
  plates: mask("11111111", "1......1", "1.3....1", "1......1", "1......1", "1......1", "1......1", "1......1"),
  // Metal: a specular stripe and a dark band.
  chrome: mask("........", "........", "........", "3.3.3.3.", "33333333", "........", "1.1.1.1.", "........"),
  // --- lab/beasts: covers
  // Layered quills: chevrons with a lit vane, in two staggered rows.
  feathers: mask("1..1....", ".11.....", ".33.....", "........", "....1..1", ".....11.", ".....33.", "........"),
  // Masonry: seams across, the courses offset, a lit edge under each seam.
  stone: mask("11111111", "3.1....1", "..1....1", "..1....1", "11111111", "3....1..", ".....1..", ".....1.."),
  // Lit dots.
  glow: mask("........", "...w....", "..www...", "...w....", "........", "w.......", "........", ".....w.."),
};
