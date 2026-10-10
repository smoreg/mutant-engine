/**
 * The wounds as paint: the state of every element of a body as colours a
 * picture can wear. Taken out of the lab's wound simulator (`apps/lab/damage.ts`)
 * so the lab and the colosseum draw the same wounds through one renderer.
 */
import { bleedOf, bloodReach, elementState, nodeIds, segmentIds, type Body, type Harm, type Ids } from "@mutant-engine/core";
import { INK, TONE } from "./svg.js";
import type { Tint } from "./scene.js";

/** What a wounded body looks like: halos under its parts, drops on what bleeds, rings over what is picked. */
interface WoundPaint {
  tints: Tint[];
  bleeding: number[];
  rings: { ids: Ids; color: string }[];
}

function idsOf(list: number[], body: Body): Ids {
  return { nodes: list.filter((id) => body.nodes[id] !== undefined), segments: list.filter((id) => body.segments[id] !== undefined), membranes: [] };
}

/**
 * The state of every element of a body as colours a picture can wear: hurt,
 * broken, crushed, cut off the blood, bleeding, rotting, and the one element
 * picked.
 *
 * It is the wound tab's paint, taken out of that page and made a function of
 * its arguments (decision 571), because the colosseum's fighter sheet draws
 * the same wounds on the same silhouette and a second page cannot call into
 * the first one's singleton.
 */
export function bodyTints(body: Body, harm: Harm, selected: number | null = null): WoundPaint {
  const hurt: number[] = [];
  const broken: number[] = [];
  const crushed: number[] = [];
  const starving: number[] = [];
  const bleeding: number[] = [];
  const rotten: number[] = [];
  // A part off the blood is grey from the blow that cut it, not ten turns later.
  const live = bloodReach(body);
  for (const id of [...nodeIds(body), ...segmentIds(body)]) {
    const el = (body.nodes[id] ?? body.segments[id])!;
    const st = elementState(el.hp, el.hpMax);
    if (st === "hurt") hurt.push(id);
    else if (st === "broken") broken.push(id);
    else if (st === "destroyed") crushed.push(id);
    if (el.ischemia > 0 || !live.has(id)) starving.push(id);
    if (bleedOf(body, harm, id) > 0) bleeding.push(id);
    if (harm.infection[id] !== undefined) rotten.push(id);
  }
  const rings: { ids: Ids; color: string }[] = [{ ids: idsOf(rotten, body), color: TONE.bio }];
  if (selected !== null) rings.push({ ids: idsOf([selected], body), color: TONE.amber });
  return {
    tints: [
      { ids: idsOf(starving, body), color: TONE.chrome, cls: "starving" },
      { ids: idsOf(hurt, body), color: TONE.bile, cls: "hurt" },
      { ids: idsOf(broken, body), color: TONE.flesh, cls: "broken" },
      { ids: idsOf(crushed, body), color: INK.paper3, cls: "crushed" },
    ],
    bleeding,
    rings,
  };
}
