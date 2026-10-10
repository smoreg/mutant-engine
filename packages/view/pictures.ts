/**
 * One creature as a picture, the same way on every tab: the pixel sprite
 * (`composeBody`), the sprite of its limbs (`spritePlan`) or the graph
 * (`sceneSvg`). The generator's cards, the bestiary's shelves and the lab's
 * sprite view draw through here. DOM, so only the pages import it.
 */
import { composeBody } from "./compose.js";
import { frameRgba } from "./pixel.js";
import { layout, type Box, type Layout } from "./layout.js";
import { spritePlan } from "./sprite.js";
import { territories, type Body } from "@mutant-engine/core";
import { sceneSvg, spriteSvg } from "./scene.js";
import { TONE } from "./svg.js";

/** How a card shows its creature. */
export type Look = "sprite" | "limbs" | "graph";
export const LOOKS: readonly Look[] = ["sprite", "limbs", "graph"];

export const TERRITORY_COLORS = [TONE.head, TONE.alien, TONE.sec, TONE.gut, TONE.ctrl, TONE.chrome];

export const LOOK_RU: Record<Look, string> = { sprite: "спрайт", limbs: "спрайт конечностей", graph: "граф" };

export function foreignOverlays(body: Body): { list: ReturnType<typeof territories>; overlays: { nodes: number[]; color: string }[] } {
  const list = territories(body).filter((t) => !t.brain.self);
  return { list, overlays: list.map((t, i) => ({ nodes: t.nodes, color: TERRITORY_COLORS[i % TERRITORY_COLORS.length]! })) };
}

/** The creature's pixel frame into a square canvas: cropped to the silhouette, by whole pixels when it fits. */
export function drawSprite(target: HTMLCanvasElement, body: Body, seed: number, l: Layout = layout(body, { scale: "sqrt" })): void {
  const frame = composeBody(body, { layout: l, seed, t: 0.4 });
  const off = document.createElement("canvas");
  off.width = frame.w;
  off.height = frame.h;
  const offCtx = off.getContext("2d")!;
  const image = offCtx.createImageData(frame.w, frame.h);
  frameRgba(frame, image.data);
  offCtx.putImageData(image, 0, 0);
  const v: Box = frame.box ?? { x0: 0, y0: 0, x1: frame.w - 1, y1: frame.h - 1 };
  const bw = v.x1 - v.x0 + 1;
  const bh = v.y1 - v.y0 + 1;
  const px = target.width;
  const room = px - 8;
  const cell = Math.max(bw, bh) > room ? room / Math.max(bw, bh) : Math.max(1, Math.floor(room / Math.max(bw, bh)));
  const dw = Math.round(bw * cell);
  const dh = Math.round(bh * cell);
  const ctx = target.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#0b0a09";
  ctx.fillRect(0, 0, px, target.height);
  ctx.drawImage(off, v.x0, v.y0, bw, bh, Math.floor((px - dw) / 2), Math.floor((target.height - dh) / 2), dw, dh);
}

/** The picture of a card, `size` screen pixels square. */
export function pictureEl(body: Body, look: Look, seed: number, size: number): HTMLElement {
  const box = document.createElement("div");
  box.className = `pic look-${look}`;
  if (look === "sprite") {
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    drawSprite(c, body, seed);
    box.append(c);
  } else if (look === "limbs") {
    const px = 64;
    box.innerHTML = spriteSvg(spritePlan(body, px, { layout: layout(body, { scale: "sqrt" }) }), Math.max(1, Math.floor(size / px)));
  } else {
    box.innerHTML = sceneSvg({ body, layout: layout(body, { scale: "sqrt" }), size, territories: foreignOverlays(body).overlays });
  }
  return box;
}

/** Draws cards only when they come on screen: a batch of hundreds stays quick. */
export function lazyPictures(): (el: HTMLElement, draw: () => HTMLElement) => void {
  const pending = new Map<Element, () => HTMLElement>();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const draw = pending.get(e.target);
        if (draw === undefined) continue;
        pending.delete(e.target);
        observer.unobserve(e.target);
        e.target.replaceChildren(draw());
      }
    },
    { rootMargin: "200px" },
  );
  return (el, draw) => {
    pending.set(el, draw);
    observer.observe(el);
  };
}
