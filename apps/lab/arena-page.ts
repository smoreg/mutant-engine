/**
 * The arena tab: two slots, a fighter in each - the lab's mutant, a human, a
 * foe, a beast, a body typed as text - drawn with their wounds beside what
 * they are made of. Two modes over them. The fight: «Ход» is one turn of
 * both through the tape of `tape.ts`, «До конца» hands it to the temper, and
 * the tape of the fight goes into the hash. The strike: one named strike of
 * the attacker at one named part of the target, its chance and expected
 * damage shown before and the wound after, thrown through `strikeAt` of the
 * model inside the wound simulator (`damage-page.ts`), with its time, food,
 * hands and fights. The page owns no rule. DOM.
 */
import "./arena.css";
import {
  BLOOD_RU,
  DEATH_RU,
  PAIN_RU,
  STATE_RU,
  aimStrike,
  bleedOf,
  bloodLevel,
  bloodMax,
  bodyHash,
  bodyToText,
  brainName,
  brains,
  controlCap,
  controlLoad,
  derive,
  eatTarget,
  elementName,
  elementState,
  excessChannels,
  fmt,
  grabs,
  killTarget,
  mindState,
  newHarm,
  nodeIds,
  planStrike,
  seizedReach,
  segmentIds,
  slipPool,
  strikes,
  totalBleed,
  turnsRu,
  type Body,
  type Harm,
  type LabState,
  type Strike,
  type Volley,
} from "@mutant-engine/core";
import { bodyTints, layout, woundSpriteSvg, type Layout, type TerritoryOverlay } from "@mutant-engine/view";
import {
  ARENA_RU,
  SLOT_CHOICES,
  battleLines,
  blowWord,
  decodeArena,
  encodeArena,
  fightAll,
  fightStep,
  fighterOf,
  openFight,
  slotBody,
  slotKey,
  slotLabel,
  type ArenaState,
  type Fight,
  type SideKey,
  type Slot,
} from "./arena.js";
import { damageNow, damageSel, initDamage, lastDamage, pushDamage, setDamageSel, showDamage } from "./damage-page.js";
import { textStart } from "./zoo.js";

interface ArenaHost {
  /** The body of the lab's current step: the «мутант лаборатории» slot. */
  labBody(): Body;
  labSeed(): number;
  territories(body: Body): TerritoryOverlay[];
  /** The arena field and the old strike tab's foe, as the hash has them. */
  arena(): string | undefined;
  foe(): string | undefined;
  save(arena: string | undefined): void;
  /** The wound simulator's field of the hash: the strike mode's tape. */
  damage(): string | undefined;
  saveDamage(encoded: string | undefined): void;
  openInLab(state: LabState): void;
}

/** The moment the sprite is posed at, as on the lab's own sprite view. */
const SPRITE_T = 0.4;

const page = {
  host: null as ArenaHost | null,
  a: decodeArena(undefined),
  /** The field the state was read from: a hash that changed under the page is read again. */
  read: "" as string,
  fight: null as Fight | null,
  fightKey: "",
  /** The part of a link is being put back on the target: what the wound page draws meanwhile is not a pick. */
  restoring: false,
};

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`no #${id}`);
  return el;
}

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function r2(x: number): string {
  return fmt(Math.round(x * 100) / 100);
}

function host(): ArenaHost {
  if (page.host === null) throw new Error("arena page not bound");
  return page.host;
}

function slotOf(side: SideKey): Slot {
  return side === "l" ? page.a.left : page.a.right;
}

function bodyOf(side: SideKey): { body: Body; error: string | null } {
  return slotBody(slotOf(side), host().labBody());
}

function other(side: SideKey): SideKey {
  return side === "l" ? "r" : "l";
}

function save(): void {
  const encoded = encodeArena(page.a);
  host().save(encoded);
  // The page wrote this field itself: reading it back is not a new state.
  page.read = `${encoded ?? ""}|${host().foe() ?? ""}`;
}

function layoutOf(body: Body): Layout {
  return layout(body, { scale: "linear" });
}

// ---------------------------------------------------------------- the fight

function fightKeyOf(): string {
  const a = page.a;
  return [a.seed, a.distance, a.toDeath, bodyHash(bodyOf("l").body), bodyHash(bodyOf("r").body)].join("|");
}

/** The fight as the state says: rebuilt from the tape when the fighters or the dice changed. */
function fight(): Fight {
  const key = fightKeyOf();
  if (page.fight === null || page.fightKey !== key) {
    page.fight = openFight(page.a, bodyOf("l").body, bodyOf("r").body);
    page.fightKey = key;
  }
  return page.fight;
}

// ---------------------------------------------------------------- what stands in a slot

interface Standing {
  body: Body;
  harm: Harm;
  /** The body before the first blow: ghosts of what fell are counted on it. */
  start: Body;
  /** This side is hit in the strike mode, and its parts can be picked. */
  target: boolean;
}

function standing(side: SideKey): Standing {
  const start = bodyOf(side).body;
  if (page.a.mode === "fight") {
    const f = fighterOf(fight(), side === "l" ? "L" : "R");
    return { body: f?.body ?? start, harm: f?.harm ?? newHarm(start), start, target: false };
  }
  if (side !== page.a.attacker) {
    const now = damageNow();
    if (now !== null) return { body: now.body, harm: now.harm, start, target: true };
  }
  return { body: start, harm: newHarm(start), start, target: false };
}

function pickerHtml(side: SideKey): string {
  const at = slotKey(slotOf(side));
  const groups = new Map<string, string[]>();
  for (const c of SLOT_CHOICES) {
    const key = slotKey(c.slot);
    const list = groups.get(c.group) ?? [];
    list.push(`<option value="${esc(key)}"${key === at ? " selected" : ""}>${esc(c.label)}</option>`);
    groups.set(c.group, list);
  }
  const opts = [...groups].map(([g, list]) => `<optgroup label="${esc(g)}">${list.join("")}</optgroup>`).join("");
  const slot = slotOf(side);
  const error = bodyOf(side).error;
  const text =
    slot.k !== "text"
      ? ""
      : `<textarea class="ar-text" data-text="${side}" rows="5" spellcheck="false">${esc(slot.text)}</textarea><div class="row"><button class="btn small" data-ar="text" data-side="${side}">${esc(ARENA_RU.textApply)}</button>${error === null ? "" : `<span class="small c-flesh">${esc(ARENA_RU.textError)}: ${esc(error)}</span>`}</div>`;
  return `<div class="row ar-pick"><b class="ar-side">${esc(ARENA_RU.side[side === "l" ? "L" : "R"]!)}</b><select data-slot="${side}">${opts}</select><button class="btn small" data-ar="lab" data-side="${side}">${esc(ARENA_RU.toLab)}</button></div>${text}`;
}

function hpBar(hp: number, max: number): string {
  const share = Math.max(0, Math.min(1, hp / max));
  const state = elementState(hp, max);
  const tone = state === "destroyed" ? "gone" : state === "broken" ? "down" : state === "hurt" ? "hurt" : "ok";
  return `<span class="st-bar"><span class="st-fill ${tone}" style="width:${Math.round(share * 100)}%"></span></span>`;
}

function verdictHtml(s: Standing): string {
  const { body, harm } = s;
  if (harm.dead !== null) return `<p class="st-status c-flesh">${esc(ARENA_RU.dead.toUpperCase())} — ${esc(DEATH_RU[harm.dead])}</p>`;
  const mind = mindState(body, harm);
  const level = bloodLevel(body, harm);
  const bleed = totalBleed(body, harm);
  const painful = [...new Set(mind.brains.map((b) => PAIN_RU[b.level]).filter((x) => x !== ""))];
  const words = [mind.conscious ? "в сознании" : PAIN_RU.out, `${ARENA_RU.blood} ${BLOOD_RU[level]}`, ...painful];
  const left = bleed > 0 ? ` · ≈ ${Math.ceil(harm.blood / bleed)} ${turnsRu(Math.ceil(harm.blood / bleed))}` : "";
  return `<p class="st-status ${mind.conscious ? "c-ok" : "c-bile"}">${esc(words.join(" · "))}</p><p class="faint small">${esc(ARENA_RU.blood)} ${Math.max(0, Math.round(harm.blood))} / ${Math.round(bloodMax(body))} · −${bleed}/${esc(ARENA_RU.turnN)}${esc(left)}</p>`;
}

function partsTable(s: Standing, sel: number | null): string {
  const { body, harm } = s;
  const rows: string[] = [];
  for (const id of [...nodeIds(body), ...segmentIds(body)].sort((x, y) => x - y)) {
    const el = body.nodes[id] ?? body.segments[id]!;
    const node = body.nodes[id];
    const hurt = el.hp < el.hpMax;
    // A bare joint that nothing hit is not worth a row; a target lists every part it can be struck in.
    if (node !== undefined && node.ends.length === 0 && !hurt && !s.target) continue;
    const marks: string[] = [];
    const bleed = bleedOf(body, harm, id);
    if (hurt) marks.push(STATE_RU[elementState(el.hp, el.hpMax)]);
    if (bleed > 0) marks.push(`кровит ${bleed}`);
    if (harm.infection[id] !== undefined) marks.push("нагноение");
    rows.push(
      `<tr class="${hurt ? "hit" : ""}${sel === id ? " on" : ""}"${s.target ? ` data-part="${id}"` : ""}><td>${esc(elementName(body, id))}</td><td>${hpBar(el.hp, el.hpMax)}</td><td class="r mono">${el.hp}/${el.hpMax}</td><td class="faint">${esc(marks.join(", "))}</td></tr>`,
    );
  }
  const gone = [...nodeIds(s.start), ...segmentIds(s.start)].filter((id) => body.nodes[id] === undefined && body.segments[id] === undefined);
  return `<table class="st-table parts"><tbody>${rows.join("")}</tbody></table>${gone.length === 0 ? "" : `<p class="c-flesh small">${esc(ARENA_RU.gone)}: ${gone.length}</p>`}`;
}

function strikesTable(body: Body, list: readonly Strike[]): string {
  if (list.length === 0) return `<p class="faint">${esc(ARENA_RU.noStrikes)}</p>`;
  const rows = list.map(
    (s) =>
      `<tr><td>${esc(blowWord(s))} <span class="faint">· ${s.node}</span></td><td class="mono">${s.dice}${s.force > 0 ? `+${s.force}` : ""}</td><td>${esc(ARENA_RU.type[s.type])}</td><td class="r">${s.time}</td><td class="r">${s.accuracy >= 0 ? "+" : ""}${s.accuracy}</td><td class="r">${s.reach}</td><td>${esc(groupRu(body, s.group))}</td></tr>`,
  );
  return `<table class="st-table"><thead><tr><th>чем</th><th>кубик</th><th>тип</th><th class="r" title="энергии на удар, ход 100">время</th><th class="r">точн.</th><th class="r" title="клеток">дос.</th><th>ведёт</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

function groupRu(body: Body, group: number): string {
  const b = brains(body)[group];
  if (b === undefined) return "—";
  return b.self ? "ты" : `голова ${group + 1}`;
}

/** What the body would strike of itself: its foreign heads, its slips (strike.md). */
function selfHtml(body: Body, list: readonly Strike[]): string {
  const parts: string[] = [];
  const load = controlLoad(body);
  const cap = controlCap(body);
  const over = Math.max(0, load - cap);
  parts.push(
    over > 0
      ? `<p>Каналы ${load} / ${cap}: <b class="c-flesh">каждый ход срываются ${over}</b>. Сорвавшаяся рука или пасть бьёт врага в досягаемости (вес 2) или свою плоть в складке (вес 1).</p>`
      : `<p class="faint">Каналы ${load} / ${cap}: срывов нет; избыток ${r2(excessChannels(body))} даёт ${1 + Math.floor(excessChannels(body) / 5)} свободных удара твоему мозгу.</p>`,
  );
  const heads = brains(body)
    .map((b, group) => ({ b, group }))
    .filter(({ b }) => !b.self && b.alive);
  if (heads.length === 0) parts.push(`<p class="faint">Чужих голов нет: перехватывать ход некому.</p>`);
  for (const { b, group } of heads) {
    const reach = seizedReach(body, group, list);
    const title = `<div class="st-head"><b>голова ${group + 1}</b> <span class="faint">· ${esc(brainName(body, b.key))} · sway ${b.sway}</span></div>`;
    if (reach.length === 0) {
      parts.push(`${title}<p class="faint">В её территории нечем бить: перехватив ход, она смотрит.</p>`);
      continue;
    }
    const rows = reach.map((r) => {
      const kill = killTarget(body, r);
      const eat = eatTarget(body, r);
      const what = r.elements.length === 0 ? `<span class="faint">до тебя не достаёт</span>` : `достаёт ${r.elements.length}${r.brain ? ` · <b class="c-flesh">твой мозг</b>` : ""}`;
      const aim = kill === null ? "" : `<br><span class="faint">УБИТЬ →</span> ${esc(elementName(body, kill))}${eat === null ? "" : `<br><span class="faint">ЖРАТЬ →</span> ${esc(elementName(body, eat))}`}`;
      return `<li>${esc(blowWord(r.strike))} <span class="mono">${r.strike.dice}${r.strike.force > 0 ? `+${r.strike.force}` : ""}</span> — ${what}${aim}</li>`;
    });
    parts.push(`${title}<ul class="notes">${rows.join("")}</ul>`);
  }
  const limb = list.find((s) => s.mine && s.chain.length > 0);
  if (limb !== undefined) {
    const pool = slipPool(body, limb, 1);
    const mine = pool.filter((p) => p.enemy === null).length;
    parts.push(`<p class="faint">Сорвись ${esc(blowWord(limb))} ${limb.node} при одном враге рядом: ⅔ удара во врага, ⅓ — в одну из ${mine} частей тебя по открытости.</p>`);
  }
  return parts.join("");
}

function cardHtml(side: SideKey): string {
  const s = standing(side);
  const start = s.start;
  const d = derive(start);
  const list = strikes(start);
  const gr = grabs(start);
  const sel = s.target ? damageSel() : null;
  const { tints, bleeding, rings } = bodyTints(s.body, s.harm, sel);
  const room = Math.max(200, Math.min(300, ($(`ar-${side}`).clientWidth || 320) - 24));
  const svg = woundSpriteSvg({ body: s.body, layout: layoutOf(s.body), seed: host().labSeed(), t: SPRITE_T, size: room, tints, bleeding, rings, hit: s.target });
  const role = page.a.mode === "strike" ? (s.target ? ARENA_RU.strike.target : ARENA_RU.strike.attacker) : "";
  return `
${pickerHtml(side)}
${role === "" ? "" : `<div class="cap">${esc(role)}</div>`}
<figure class="ar-pic${s.target ? " pick" : ""}" data-pic="${side}">${svg}</figure>
${verdictHtml(s)}
<p class="faint small">${esc(ARENA_RU.mass)} ${r2(d.budgets.mass)} · ${esc(ARENA_RU.armor)} ${r2(d.armor.mean)} · ${esc(ARENA_RU.speed)} ${d.speed.value}</p>
<details class="ar-more" open><summary class="cap">${esc(ARENA_RU.strikes)} · ${list.length}</summary>${strikesTable(start, list)}${
    gr.length === 0 ? "" : `<p class="faint small">${esc(ARENA_RU.grabs)}: ${gr.map((g) => `${esc(blowWord(g))} ${g.node} 1d2${g.force > 0 ? `+${g.force}` : ""}`).join(", ")}; броня цели вдвое меньше.</p>`
  }</details>
<details class="ar-more"${s.target ? " open" : ""}><summary class="cap">${esc(ARENA_RU.parts)}</summary>${partsTable(s, sel)}</details>
<details class="ar-more"><summary class="cap">${esc(ARENA_RU.selfStrike)}</summary>${selfHtml(start, list)}</details>`;
}

// ---------------------------------------------------------------- the bar

function barHtml(): string {
  const a = page.a;
  const modes = (["fight", "strike"] as const).map((m) => `<button type="button" class="${a.mode === m ? "on" : ""}" data-ar="mode" data-mode="${m}">${esc(ARENA_RU.mode[m])}</button>`).join("");
  const dist = [1, 2, 3].map((n) => `<button type="button" class="${a.distance === n ? "on" : ""}" data-ar="dist" data-dist="${n}">${n}</button>`).join("");
  const fightBits =
    a.mode === "fight"
      ? `<label class="small">${esc(ARENA_RU.seed)} <input id="ar-seed" class="st-seed" type="number" min="1" value="${a.seed}"></label>
<label class="chk small"><input type="checkbox" id="ar-death"${a.toDeath ? " checked" : ""}> ${esc(ARENA_RU.toDeath)}</label>
<button class="btn primary" data-ar="turn">${esc(ARENA_RU.turn)}</button><button class="btn" data-ar="end">${esc(ARENA_RU.toEnd)}</button><button class="btn" data-ar="again">${esc(ARENA_RU.again)}</button>`
      : `<button class="btn small" data-ar="flip">${esc(ARENA_RU.strike.flip)}</button>`;
  return `<span class="seg ar-seg">${modes}</span><span class="faint small">${esc(ARENA_RU.distance)}</span><span class="seg ar-seg">${dist}</span>${fightBits}`;
}

// ---------------------------------------------------------------- the middle: the fight

function volleyHtml(me: Body, v: Volley): string {
  if (v.planned.length === 0) return `<p class="c-flesh small">Ни один удар не достаёт на ${page.a.distance}.</p>`;
  const rows = v.planned.map(
    (p) => `<tr><td>${esc(blowWord(p.strike))} ${p.strike.node}</td><td class="r">${p.accuracy >= 0 ? "+" : ""}${p.accuracy}</td><td class="r">${Math.round(p.chance * 100)} %</td><td class="r">${r2(p.expected)}</td></tr>`,
  );
  const groups = v.groups.map((g) => `${esc(groupRu(me, g.group))}: ${g.taken} из свободных ${g.free}${g.penalty > 0 ? `, штраф −${g.penalty}` : ""}`).join("; ");
  return `<p class="small"><b>${r2(v.rate)}</b> урона за 100 энергии · залп ${v.planned.length} за ${v.time}</p><p class="faint small">${groups}</p><table class="st-table"><thead><tr><th>удар</th><th class="r">точн.</th><th class="r">шанс</th><th class="r">E</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

function fightHtml(): string {
  const f = fight();
  const b = f.tape.battle;
  const L = standing("l");
  const R = standing("r");
  const lines = battleLines(b.log, f);
  const result =
    b.result === null
      ? `<p class="small">${esc(ARENA_RU.turnN)} ${b.turn} · ${esc(ARENA_RU.played)} ${f.moves.length}</p>`
      : `<p class="st-status c-ok">${esc(lines[lines.length - 1]?.text ?? "")}</p>`;
  // The newest turn on top, and inside a turn the events in the order they happened.
  const blocks: (typeof lines)[] = [[]];
  for (const l of lines.slice(-600)) {
    if (l.cls.includes("turn")) blocks.push([]);
    blocks[blocks.length - 1]!.push(l);
  }
  const log =
    lines.length === 0
      ? `<p class="faint">${esc(ARENA_RU.logEmpty)}</p>`
      : `<ul class="st-log ar-log">${blocks
          .reverse()
          .flat()
          .map((l) => `<li class="${l.cls}">${esc(l.text)}</li>`)
          .join("")}</ul>`;
  return `${result}
<details class="ar-more"><summary class="cap">${esc(ARENA_RU.plan)}</summary>
<div class="ar-plans"><div><div class="faint small">${esc(ARENA_RU.side.L!)} → ${esc(ARENA_RU.side.R!)}</div>${volleyHtml(L.body, planStrike(L.body, R.body, page.a.distance))}</div>
<div><div class="faint small">${esc(ARENA_RU.side.R!)} → ${esc(ARENA_RU.side.L!)}</div>${volleyHtml(R.body, planStrike(R.body, L.body, page.a.distance))}</div></div></details>
<div class="cap">${esc(ARENA_RU.log)}</div>${log}`;
}

// ---------------------------------------------------------------- the middle: the strike

function strikeHtml(): string {
  const a = page.a;
  const me = bodyOf(a.attacker).body;
  const list = strikes(me);
  const key = list.some((s) => s.key === a.strike) ? a.strike! : list[0]?.key;
  const now = damageNow();
  const part = damageSel();
  const opts = list.map((s) => `<option value="${esc(s.key)}"${s.key === key ? " selected" : ""}>${esc(blowWord(s))} · ${s.node} · ${s.dice} ${esc(ARENA_RU.type[s.type])}</option>`).join("");
  const parts =
    now === null
      ? ""
      : [...nodeIds(now.body), ...segmentIds(now.body)]
          .sort((x, y) => x - y)
          .map((id) => `<option value="${id}"${id === part ? " selected" : ""}>${esc(elementName(now.body, id))}</option>`)
          .join("");
  const preview = key === undefined || part === null || now === null ? null : aimStrike(me, key, now.body, now.harm, part, a.distance);
  const previewHtml =
    preview === null
      ? `<p class="faint small">${esc(part === null ? ARENA_RU.strike.pickPart : ARENA_RU.noStrikes)}</p>`
      : !preview.reach
        ? `<p class="c-flesh">${esc(ARENA_RU.strike.noReach)} (${preview.strike.reach} &lt; ${a.distance})</p>`
        : `<p class="ar-odds"><b>${Math.round(preview.chance * 100)} %</b> ${esc(ARENA_RU.strike.chance)} · <b>${r2(preview.expected)}</b> ${esc(ARENA_RU.strike.expected)} · ${esc(ARENA_RU.strike.cover)} ${preview.defense}</p>`;
  const last = lastDamage();
  const shown = now !== null && last?.t === "strike" && now.command === (now.index - 1) ? now : null;
  const result = shown === null ? "" : `<div class="cap">${esc(ARENA_RU.strike.last)}</div><div class="small"><b>${esc(shown.title)}</b></div>`;
  const dead = now?.harm.dead != null;
  return `
<div class="row"><label class="small">${esc(ARENA_RU.strike.weapon)} <select id="ar-strike">${opts}</select></label></div>
<div class="row"><label class="small">${esc(ARENA_RU.strike.part)} <select id="ar-part"><option value="">${esc(ARENA_RU.strike.noPart)}</option>${parts}</select></label></div>
${previewHtml}
<div class="row"><button class="btn primary" data-ar="throw"${preview === null || !preview.reach || dead ? " disabled" : ""}>${esc(ARENA_RU.strike.throw)}</button><button class="btn" data-ar="repeat"${last?.t !== "strike" || dead ? " disabled" : ""}>${esc(ARENA_RU.strike.again)}</button></div>
${result}`;
}

// ---------------------------------------------------------------- render

function render(): void {
  $("ar-bar").innerHTML = barHtml();
  $("ar-l").innerHTML = cardHtml("l");
  $("ar-r").innerHTML = cardHtml("r");
  const strike = page.a.mode === "strike";
  $("ar-fight").hidden = strike;
  $("ar-strike-box").hidden = !strike;
  $("ar-wounds").hidden = !strike;
  if (strike) $("ar-strike-box").innerHTML = strikeHtml();
  else $("ar-fight").innerHTML = fightHtml();
}

/** The wound simulator drew itself: the target's card and the strike's preview read the same step. */
function drawn(): void {
  if (page.a.mode !== "strike") return;
  const sel = damageSel() ?? undefined;
  if (!page.restoring && sel !== page.a.part) {
    if (sel === undefined) delete page.a.part;
    else page.a.part = sel;
    save();
  }
  $("ar-l").innerHTML = cardHtml("l");
  $("ar-r").innerHTML = cardHtml("r");
  $("ar-strike-box").innerHTML = strikeHtml();
}

function changed(): void {
  save();
  render();
  if (page.a.mode === "strike") showDamage();
}

function setSlot(side: SideKey, key: string): void {
  const choice = SLOT_CHOICES.find((c) => slotKey(c.slot) === key);
  if (choice === undefined) return;
  // A body as text starts from whatever stood in the slot, so there is something to edit.
  const slot: Slot = choice.slot.k === "text" ? { k: "text", text: bodyToText(bodyOf(side).body) } : choice.slot;
  if (side === "l") page.a.left = slot;
  else page.a.right = slot;
  page.a.moves = [];
  delete page.a.strike;
  delete page.a.part;
  setDamageSel(null);
}

function act(el: HTMLElement): void {
  const a = page.a;
  const side = el.dataset.side as SideKey | undefined;
  switch (el.dataset.ar) {
    case "mode":
      a.mode = el.dataset.mode === "strike" ? "strike" : "fight";
      save();
      render();
      if (a.mode === "strike") restorePart();
      return;
    case "dist":
      a.distance = Number(el.dataset.dist);
      a.moves = [];
      return changed();
    case "turn":
      fightStep(fight());
      a.moves = [...fight().moves];
      return changed();
    case "end":
      fightAll(fight());
      a.moves = [...fight().moves];
      return changed();
    case "again":
      a.moves = [];
      page.fight = null;
      return changed();
    case "flip":
      a.attacker = other(a.attacker);
      delete a.strike;
      delete a.part;
      setDamageSel(null);
      return changed();
    case "throw": {
      const key = ($("ar-strike") as HTMLSelectElement).value;
      const part = damageSel();
      if (key === "" || part === null) return;
      a.strike = key;
      save();
      pushDamage({ t: "strike", key, at: part });
      return;
    }
    case "repeat": {
      const last = lastDamage();
      if (last?.t === "strike") pushDamage({ ...last });
      return;
    }
    case "text": {
      if (side === undefined) return;
      const text = (document.querySelector(`[data-text="${side}"]`) as HTMLTextAreaElement | null)?.value ?? "";
      if (side === "l") a.left = { k: "text", text };
      else a.right = { k: "text", text };
      a.moves = [];
      return changed();
    }
    case "lab":
      if (side === undefined) return;
      host().openInLab({ seed: host().labSeed(), start: textStart(bodyOf(side).body), commands: [], spread: true });
      return;
  }
}

function bind(): void {
  const root = $("page-arena");
  root.addEventListener("click", (e) => {
    const t = e.target as Element;
    const btn = t.closest<HTMLElement>("[data-ar]");
    if (btn !== null) return act(btn);
    // A part of the target, on its card's picture or in its list of parts.
    const row = t.closest<HTMLElement>("[data-part]");
    const hit = t.closest<SVGElement>(".ar-pic.pick [data-seg], .ar-pic.pick [data-node]");
    const id = row !== null ? Number(row.dataset.part) : hit !== null ? Number(hit.dataset.seg ?? hit.dataset.node) : null;
    if (id !== null && page.a.mode === "strike") setDamageSel(damageSel() === id ? null : id);
  });
  root.addEventListener("change", (e) => {
    const t = e.target as HTMLInputElement;
    const slot = t.dataset.slot as SideKey | undefined;
    if (slot !== undefined) {
      setSlot(slot, t.value);
      return changed();
    }
    if (t.id === "ar-seed") {
      page.a.seed = Math.max(1, Math.floor(Number(t.value) || 1));
      page.a.moves = [];
      return changed();
    }
    if (t.id === "ar-death") {
      page.a.toDeath = t.checked;
      page.a.moves = [];
      return changed();
    }
    if (t.id === "ar-strike") {
      page.a.strike = t.value;
      save();
      $("ar-strike-box").innerHTML = strikeHtml();
      return;
    }
    if (t.id === "ar-part") setDamageSel(t.value === "" ? null : Number(t.value));
  });
}

/** The wound simulator over the strike mode's target, struck by its attacker. */
const woundsHost = {
  base: () => {
    const side = other(page.a.attacker);
    return { body: bodyOf(side).body, label: `${ARENA_RU.side[side === "l" ? "L" : "R"]}: ${slotLabel(slotOf(side))}` };
  },
  sim: () => ({ attacker: bodyOf(page.a.attacker).body, distance: page.a.distance }),
  layout: layoutOf,
  territories: (body: Body) => host().territories(body),
  save: (encoded: string | undefined) => host().saveDamage(encoded),
  drawn,
};

/** Binds the page once. */
export function buildArena(h: ArenaHost): void {
  page.host = h;
  bind();
  initDamage(woundsHost, h.damage());
}

/** The tab opened, or the hash under it changed: read the state again, and draw. */
export function showArena(): void {
  const field = `${host().arena() ?? ""}|${host().foe() ?? ""}`;
  if (field !== page.read) {
    page.a = decodeArena(host().arena(), host().foe());
    page.read = field;
    page.fight = null;
  }
  render();
  if (page.a.mode === "strike") restorePart();
}

/** The strike mode shown with the part the state names picked on the target. */
function restorePart(): void {
  page.restoring = true;
  try {
    showDamage();
    if (page.a.part !== undefined && damageSel() !== page.a.part) setDamageSel(page.a.part);
  } finally {
    page.restoring = false;
  }
}

/** A new hash: the wound simulator's tape is read again from it. */
export function resetArena(): void {
  page.read = "";
  initDamage(woundsHost, host().damage());
}
