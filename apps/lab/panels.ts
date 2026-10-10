/**
 * Markup the studio's tabs share over a body: the catalog as a select, a
 * mythic beast against the body in the lab, the places of a row placed by
 * hand, the card of one part of the body. Strings only, no DOM: the pages put
 * them in and wire the clicks by their data attributes.
 */
import {
  COVERS,
  FAMILIES,
  MEMBRANES,
  ORGANS,
  SEGMENT_KINDS,
  derive,
  elementState,
  type ElementState,
  organMass,
  segmentMass,
  type Body,
  type Family,
  type Organ,
  type Target,
  MUTATIONS,
  SHAPE_KEYS,
  SHAPE_RU,
  features,
  similarity,
  tolerance,
  traitsOf,
  beastById,
  placeTargets,
  FAMILY_RU,
  elementName,
  fmt,
  targetName,
  mutationRu,
} from "@mutant-engine/core";
import { ADDITIONS, KIND_RU, NEEDS, additionById } from "./beasts/additions.js";
import { attackWord } from "./arena-words.js";

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** The catalog grouped by family, for a select. */
export function catalogOptions(): string {
  const byFamily = new Map<Family, string[]>();
  for (const m of MUTATIONS) {
    const list = byFamily.get(m.family) ?? [];
    list.push(`<option value="${m.id}">${esc(mutationRu(m.id))} · ${m.id}</option>`);
    byFamily.set(m.family, list);
  }
  return FAMILIES.map((f) => `<optgroup label="${esc(FAMILY_RU[f])}">${(byFamily.get(f) ?? []).join("")}</optgroup>`).join("");
}

// ---------------------------------------------------------------- the bestiary

/** The beast looked at against the body on the screen: how much of it is there, key by key. */
export function beastHtml(id: string | undefined, body: Body): string {
  const beast = id === undefined ? undefined : beastById(id);
  if (beast === undefined) return `<p class="faint">Выбери тварь: её форму можно открыть в лаборатории. Сходство считается с телом, которое сейчас в лаборатории.</p>`;
  const have = features(body);
  const sim = similarity(beast.want, have);
  const traits = new Set(traitsOf(beast.want));
  const rows = SHAPE_KEYS.map((k) => {
    const off = sim.off.includes(k);
    return `<tr class="${off ? "off" : ""}"><td>${traits.has(k) ? "◆" : "·"} ${esc(SHAPE_RU[k])}</td><td class="r" title="допуск ±${tolerance(beast.want[k])}">${beast.want[k]}</td><td class="r">${have[k]}</td></tr>`;
  });
  const cover = sim.off.includes("cover");
  rows.push(`<tr class="${cover ? "off" : ""}"><td>◆ ${esc(SHAPE_RU.cover)}</td><td class="r">${esc(COVERS[beast.want.cover].ru)}</td><td class="r">${esc(COVERS[have.cover].ru)}</td></tr>`);
  const needs = (NEEDS[beast.id] ?? []).map(additionById);
  const verdict = sim.strict ? `<span class="c-ok">это ${esc(beast.ru)}</span>` : sim.loose ? `<span class="c-bile">похоже</span>` : `<span class="c-flesh">не похоже</span>`;
  return `
<h2>${esc(beast.ru)}</h2>
<div class="row"><button class="btn primary" data-open="fixture" title="тело, нарисованное руками">в лабу формой</button></div>
<p><span class="faint">с телом в лаборатории:</span> <span class="score">сходство ${fmt(Math.round(sim.score * 100) / 100)}</span> · черт ${sim.traits.hit} из ${sim.traits.total} · ${verdict}</p>
<table class="shape"><tbody><tr><td class="faint">черта</td><td class="r faint">нужно</td><td class="r faint">есть</td></tr>${rows.join("")}</tbody></table>
${beast.unexpressible.length === 0 ? "" : `<div class="cap">чего не сказать таблицами</div><ul class="notes">${beast.unexpressible.map((u) => `<li>${esc(u)}</li>`).join("")}</ul>`}
${needs.length === 0 ? "" : `<div class="cap">добавки, которые её открывают</div><ul class="notes">${needs.map((a) => `<li><b>${esc(a.ru)}</b> <span class="faint">· ${esc(KIND_RU[a.kind])}</span></li>`).join("")}</ul>`}
<p class="faint">Всего добавок к каталогу: ${ADDITIONS.length}. Полный отчёт с бездной на 2000 сидах — <span class="mono">npm run beasts</span>.</p>`;
}

// ---------------------------------------------------------------- a mutation by hand

/** `узел`, `сегмент`, `окончание`, `пара узлов`, `цикл`: what kind of place a target is. */
function placeKind(t: Target): string {
  if ("node" in t) return "узел";
  if ("segment" in t) return "сегмент";
  if ("ending" in t) return "окончание";
  if ("pair" in t) return "пара узлов";
  return "цикл";
}

/**
 * Every place the row has on this body, one line each: what kind of place it
 * is, the part in the words a player reads, and the weight. The index in
 * `data-place` is the index in `placeTargets(body, id)`, which is what the
 * page places by.
 */
export function placeHtml(id: string, body: Body): string {
  const list = placeTargets(body, id);
  if (list.length === 0) return `<p class="c-flesh">У строки нет ни одного места на этом теле.</p>`;
  const rows = list.map(
    (w, i) =>
      `<button type="button" class="item" data-place="${i}" title="поставить сюда"><span><i class="kind">${esc(placeKind(w.target))}</i> ${esc(targetName(body, w.target))}</span><small>вес ${fmt(Math.round(w.weight * 100) / 100)}</small></button>`,
  );
  return `<div class="cap">мест · ${list.length}</div><div class="list places-list">${rows.join("")}</div>`;
}

// ---------------------------------------------------------------- the card of a part

/** A node or a segment of the body: what the lab opens a card over. */
export type PartRef = { node: number } | { segment: number };

export function partId(ref: PartRef): number {
  return "node" in ref ? ref.node : ref.segment;
}

/** The state of an element in the words a player reads (`elementState`). */
const STATE_RU: Record<ElementState, string> = { whole: "цела", hurt: "ранена", broken: "сломана", destroyed: "уничтожена" };

function line(k: string, v: string): string {
  return `<div class="kv"><span class="k">${esc(k)}</span><span class="v">${v}</span></div>`;
}

function organLine(o: Organ): string {
  const inside = (o.contents ?? []).map((c) => ORGANS[c.kind].ru).join(", ");
  return `${esc(ORGANS[o.kind].ru)}${inside === "" ? "" : ` <span class="faint">(${esc(inside)})</span>`}`;
}

/** What the part gives the body, read from `derive`: support, grip, breath, senses, its share of a blow. */
function givesLines(body: Body, ref: PartRef): string[] {
  const d = derive(body);
  const id = partId(ref);
  const node = "node" in ref ? ref.node : null;
  const out: string[] = [];
  for (const st of d.speed.stands) {
    if (st.node !== id && st.segment !== id) continue;
    out.push(line("опора", `${esc(ORGANS[st.kind].ru)} ×${fmt(st.level)}${st.onRing ? " · ○" : ""}`));
  }
  for (const g of d.grips.list) {
    if (g.node !== id && g.segment !== id) continue;
    out.push(line("хват", `${esc(ORGANS[g.kind].ru)} · ${g.level >= 2 ? "точный" : "грубый"}`));
  }
  for (const b of d.breath.organs) {
    if (b.at !== id) continue;
    const name = b.kind in ORGANS ? ORGANS[b.kind as keyof typeof ORGANS].ru : (MEMBRANES[b.kind as keyof typeof MEMBRANES]?.ru ?? String(b.kind));
    out.push(line("дыхание", `${esc(name)} · ${fmt(b.air)} / ${fmt(b.water)}`));
  }
  if (node !== null) {
    for (const v of d.senses.viewpoints) {
      if (v.node !== node) continue;
      out.push(line("чувства", `глаза ${v.eyes}${v.heat ? ` · тепловое зрение` : ""}`));
    }
  }
  const share = d.exposure.parts.find((p) => p.id === id);
  if (share !== undefined && share.share > 0) out.push(line("открытость удару", `${(100 * share.share).toFixed(1)} %`));
  const starving = d.blood.starving.find((x) => x.id === id);
  // The counter is the turns it has been starving: a part cut off from a heart this very turn is at zero.
  if (starving !== undefined) out.push(line("без крови", `<span class="c-flesh">${starving.ischemia > 0 ? `ишемия ${starving.ischemia}` : "да"}</span>`));
  return out;
}

function strikeLines(body: Body, ref: PartRef): string[] {
  const id = partId(ref);
  return derive(body)
    .attacks.filter((a) => a.node === id || a.segment === id)
    .map((a) => {
      return line(attackWord(a.kind), `${a.dice} · досягаемость ${a.reach} · масса ${fmt(Math.round(a.mass * 10) / 10)}`);
    });
}

/**
 * The card of one part: what it is, what is on it, how whole it is, what it
 * gives the body and what it strikes with. It reads the body and writes
 * nothing: opening a card is not a move and never touches the graph.
 */
export function partInfoHtml(body: Body, ref: PartRef): string {
  const id = partId(ref);
  const seg = "segment" in ref ? body.segments[ref.segment] : undefined;
  const node = "node" in ref ? body.nodes[ref.node] : undefined;
  if (seg === undefined && node === undefined) return "";
  const what: string[] = [];
  const organs: string[] = [];
  let mass = 0;
  let hp = 0;
  let hpMax = 0;
  let wound = 0;
  let bleed = 0;
  if (seg !== undefined) {
    what.push(line("сегмент", `${esc(SEGMENT_KINDS[seg.kind].ru)} <span class="mono faint">#${id}</span> · ${seg.a}–${seg.b}`));
    what.push(line("длина · обхват", `${fmt(seg.length)} · ${fmt(seg.girth)}`));
    what.push(line("покров", esc(COVERS[seg.cover].ru)));
    for (const o of seg.cavity) mass += organMass(o);
    for (const o of seg.growths) mass += organMass(o);
    mass += segmentMass(seg);
    hp = seg.hp;
    hpMax = seg.hpMax;
    wound = seg.wound;
    bleed = seg.bleed;
    organs.push(line("внутри", seg.cavity.length === 0 ? `<span class="faint">нет</span>` : seg.cavity.map(organLine).join(", ")));
    organs.push(line("снаружи", seg.growths.length === 0 ? `<span class="faint">нет</span>` : seg.growths.map(organLine).join(", ")));
  } else if (node !== undefined) {
    what.push(line("узел", `<span class="mono faint">#${id}</span>`));
    what.push(line("размер", fmt(node.size)));
    for (const o of node.ends) mass += organMass(o);
    hp = node.hp;
    hpMax = node.hpMax;
    wound = node.wound;
    organs.push(line("окончания", node.ends.length === 0 ? `<span class="faint">нет</span>` : node.ends.map(organLine).join(", ")));
  }
  what.push(line("масса", fmt(Math.round(mass * 10) / 10)));
  const state = elementState(hp, hpMax);
  what.push(line("прочность", `<span class="mono">${hp}/${hpMax}</span> · <span class="${state === "whole" ? "c-ok" : state === "hurt" ? "c-bile" : "c-flesh"}">${STATE_RU[state]}</span>`));
  if (wound > 0) what.push(line("свежая рана", `<span class="c-bile">${wound}</span>`));
  if (bleed > 0) what.push(line("кровотечение", `<span class="c-flesh">${fmt(bleed)}</span>`));
  const gives = givesLines(body, ref);
  const strikes = strikeLines(body, ref);
  return `
<h2>${esc(elementName(body, id))}</h2>
<div class="sec">${what.join("")}</div>
<div class="cap">органы</div><div class="sec">${organs.join("")}</div>
<div class="cap">что даёт телу</div><div class="sec">${gives.join("") || `<p class="faint small">ничего не даёт</p>`}</div>
<div class="cap">чем бьёт</div><div class="sec">${strikes.join("") || `<p class="faint small">нечем бить</p>`}</div>
<div class="row"><button type="button" class="btn primary" data-info-room="${id}">в операционную</button><button type="button" class="btn" data-info-close="1">закрыть</button></div>
<p class="faint small">Esc или клик мимо — закрыть. Резать и вырезать можно только в операционной.</p>`;
}
