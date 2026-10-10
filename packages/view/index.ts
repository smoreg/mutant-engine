/**
 * Public entry of the renderer: layout, SVG and pixel pictures of a body, the
 * lab's scenes and the wounded silhouette. It reads the model through
 * `@mutant-engine/core` only; the model never imports it.
 */
export * from "./layout.js";
export * from "./svg.js";
export * from "./sprite.js";
export * from "./compose.js";
export * from "./pixel.js";
export * from "./png.js";
export * from "./paint.js";
export * from "./rig.js";
export * from "./stamps.js";
export * from "./sprites.js";
export * from "./pins.js";
export * from "./scene.js";
export * from "./pictures.js";
export * from "./wounds.js";
export * from "./silhouette.js";
/** Two names meet twice; the entry keeps the ones the model's entry used to give. */
export type { Box } from "./layout.js";
export type { PaletteEntry } from "./sprite.js";
