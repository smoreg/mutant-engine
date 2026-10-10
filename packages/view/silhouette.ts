/**
 * A fighter drawn with his wounds on him.
 *
 * «Тело всегда читаемо» is a rule of both games, and a colosseum that lists
 * a broken arm in a table while the silhouette next to it stands untouched
 * breaks it. The paint is the wound tab's own — `bodyTints` of
 * `wounds.ts` — and the two pictures that wear it are `sceneSvg`
 * and `woundSpriteSvg` of `scene.ts`; all three used to be private
 * to that tab and are functions of their arguments now (decision 571).
 *
 * Strings only, no DOM: `main.ts` puts them in. The hit areas carry
 * `data-node` / `data-seg`, so a click on the body opens the card of the
 * part clicked — the same card the list of parts opens, over the same
 * record, for no day.
 */
import { layout, type Layout } from "./layout.js";
import { spritePlan } from "./sprite.js";
import { territories, type Body, type Harm } from "@mutant-engine/core";
import { bodyTints } from "./wounds.js";
import { sceneSvg, spriteSvg, woundSpriteSvg } from "./scene.js";
import { TONE } from "./svg.js";
import type { Look } from "./pictures.js";

/** The moment a body is posed at, as on every other page of this repository. */
const SPRITE_T = 0.4;

/** Foreign heads keep their colour over the body: whose limb is whose is half of what a manager reads. */
const FOREIGN = [TONE.head, TONE.alien, TONE.sec, TONE.gut, TONE.ctrl, TONE.chrome];

interface Wounded {
  body: Body;
  harm: Harm;
  look: Look;
  seed: number;
  /** Width in pixels. */
  size: number;
  /** The element ringed: the part on the table, or the one whose card is open. */
  selected?: number | null;
  /** Transparent hit areas with data-seg / data-node, for the page's clicks. */
  hit?: boolean;
  /** The body's `sqrt` layout when the caller keeps one: laying a mutated body out is most of the picture's cost. */
  layout?: Layout;
}

export function woundedSvg(w: Wounded): string {
  const { body } = w;
  const l = w.layout ?? layout(body, { scale: "sqrt" });
  const paint = bodyTints(body, w.harm, w.selected ?? null);
  if (w.look === "graph") {
    const foreign = territories(body).filter((t) => !t.brain.self);
    return sceneSvg({
      body,
      layout: l,
      size: w.size,
      territories: foreign.map((t, i) => ({ nodes: t.nodes, color: FOREIGN[i % FOREIGN.length]! })),
      tints: paint.tints,
      bleeding: paint.bleeding,
      rings: paint.rings,
      hit: w.hit === true,
      hitTitle: "клик — карточка части, без траты дня",
    });
  }
  if (w.look === "limbs") {
    // The limb sprite is a plan of cells and has nowhere to put a wound: it draws the body and nothing else.
    const px = 64;
    return spriteSvg(spritePlan(body, px, { layout: l }), Math.max(1, Math.floor(w.size / px)));
  }
  return woundSpriteSvg({ body, layout: l, seed: w.seed, t: SPRITE_T, size: w.size, tints: paint.tints, bleeding: paint.bleeding, rings: paint.rings, hit: w.hit === true });
}
