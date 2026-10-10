/**
 * The «Урон» tab: the wound simulator over the body of the lab's current
 * step. Left - blows, time, food, hands on, a fight, and the tape of what
 * happened; centre - the body with its wounds painted on it; right - what the
 * body is now: alive or not, conscious or not, blood, reserve, the pain of
 * every brain, sicknesses, the parts and the organs. The page owns no rules:
 * `damage.ts` replays commands through the model.
 */
import {
  HEAL_COST,
  KNIT_PACE,
  KNIT_TAX,
  aimChance,
  bleedOf,
  bloodLevel,
  bloodMax,
  bloodReach,
  bodyHash,
  elementState,
  mass,
  mindState,
  nodeIds,
  organSlots,
  segmentIds,
  totalBleed,
  upkeep,
  type Body,
  type Profile,
  BLOOD_RU,
  DEATH_RU,
  PAIN_RU,
  STATE_RU,
  brainLabel,
  turnsRu,
  elementName,
  organRu,
} from "@mutant-engine/core";
import { type Layout, type TerritoryOverlay, bodyTints, INK, TONE, sceneSvg, woundSpriteSvg } from "@mutant-engine/view";
import {
  ENEMIES,
  PROFILE_RU,
  decodeDamage,
  encodeDamage,
  eventLines,
  initialDamage,
  parseDice,
  simulate,
  type DamageCommand,
  type DamageRun,
  type DamageState,
  type DamageStep,
  type EnemyId,
  type SimulateOptions,
} from "./damage.js";

/** The moment the sprite is posed at, as on the lab's own sprite view. */
const SPRITE_T = 0.4;

type DamageView = "graph" | "sprite";

interface DamageHost {
  /** The body the wounds are dealt to - the arena's target - and a word on where it comes from. */
  base(): { body: Body; label: string };
  /** Who strikes it with a named strike, and from how far; the run's `strike` commands need it. */
  sim(): SimulateOptions;
  layout(body: Body): Layout;
  territories(body: Body): TerritoryOverlay[];
  /** The encoded state for the hash, or undefined when there is nothing to keep. */
  save(encoded: string | undefined): void;
  /** The page drew itself: whoever shows the same step around it draws too. */
  drawn(): void;
}

const page = {
  host: null as DamageHost | null,
  state: initialDamage(),
  run: null as DamageRun | null,
  baseHash: "",
  step: null as number | null,
  sel: null as number | null,
  dice: "1d6",
  profile: "random" as Profile,
  dirty: false,
  burn: false,
  enemy: "goblin" as EnemyId,
  fightTurns: 30,
  showAll: false,
  view: "graph" as DamageView,
};

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`no #${id}`);
  return el;
}

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function host(): DamageHost {
  if (page.host === null) throw new Error("damage page not bound");
  return page.host;
}

function lastIndex(): number {
  return (page.run?.steps.length ?? 1) - 1;
}

function current(): DamageStep {
  const run = page.run!;
  const i = page.step === null ? lastIndex() : Math.max(0, Math.min(lastIndex(), page.step));
  return run.steps[i]!;
}

// ---------------------------------------------------------------- state

/** The target and the attacker: a change of either replays the tape. */
function keyOf(): string {
  const sim = host().sim();
  return `${bodyHash(host().base().body)}|${sim.attacker === undefined ? "-" : bodyHash(sim.attacker)}|${sim.distance ?? 1}`;
}

function recompute(): void {
  const base = host().base().body;
  page.baseHash = keyOf();
  page.run = simulate(base, page.state, host().sim());
  if (page.step !== null && page.step >= lastIndex()) page.step = null;
}

function save(): void {
  const empty = page.state.commands.length === 0 && page.state.seed === 1 && !page.state.hunger;
  host().save(empty ? undefined : encodeDamage(page.state));
}

export function pushDamage(...cmds: DamageCommand[]): void {
  push(...cmds);
}

/** The step shown: the target's body and wounds as they stand. */
export function damageNow(): DamageStep | null {
  return page.run === null ? null : current();
}

/** The part picked on the target, if it is still there. */
export function damageSel(): number | null {
  const step = damageNow();
  if (step === null || page.sel === null) return page.sel;
  return step.body.nodes[page.sel] !== undefined || step.body.segments[page.sel] !== undefined ? page.sel : null;
}

export function setDamageSel(id: number | null): void {
  page.sel = id;
  render();
}

/** The last command of the tape, as it was said. */
export function lastDamage(): DamageCommand | undefined {
  return page.state.commands[page.state.commands.length - 1];
}

function push(...cmds: DamageCommand[]): void {
  if (page.step !== null && page.step < lastIndex()) {
    // A command in the past forks the tape: what came after it goes.
    page.state.commands = page.state.commands.slice(0, current().command + 1);
  }
  page.state.commands.push(...cmds);
  page.step = null;
  recompute();
  save();
  render();
}

// ---------------------------------------------------------------- left: controls and tape

function controlsHtml(): string {
  const base = host().base();
  const body = current().body;
  const profiles = (Object.keys(PROFILE_RU) as Profile[]).filter((p) => p !== "at");
  const sel = page.sel !== null && (body.nodes[page.sel] !== undefined || body.segments[page.sel] !== undefined) ? page.sel : null;
  const enemies = ENEMIES.map((e) => `<option value="${e.id}"${e.id === page.enemy ? " selected" : ""}>${esc(e.ru)} · ${e.dice} · ${esc(e.note)}</option>`).join("");
  return `
<h3>Раны цели</h3>
<div class="faint small">Тело — ${esc(base.label)}; масса ${Math.round(mass(base.body))}. Правила — docs/damage.md.</div>
<div class="row"><label>сид <input type="number" class="seed" id="dmg-seed" value="${page.state.seed}"></label>
<label class="chk small" title="каждый ход запас обмена платит за тело; пустой запас — заживления нет"><input type="checkbox" id="dmg-hunger"${page.state.hunger ? " checked" : ""}> обмен тратится</label></div>
<div class="cap">удар</div>
<div class="row"><label>урон <input type="text" id="dmg-dice" value="${esc(page.dice)}" style="width:70px" title="1d6, 2d6+1, 8"></label>
<select id="dmg-profile">${profiles.map((p) => `<option value="${p}"${p === page.profile ? " selected" : ""}>${esc(PROFILE_RU[p])}</option>`).join("")}</select></div>
<div class="row"><label class="chk small"><input type="checkbox" id="dmg-dirty"${page.dirty ? " checked" : ""}> грязный</label><label class="chk small"><input type="checkbox" id="dmg-burn"${page.burn ? " checked" : ""}> ожог</label>
<button class="btn primary" data-act="hit">Ударить</button><button class="btn" data-act="hit5">×5</button></div>
<div class="faint small">прицел попадает с шансом ${Math.round(aimChance(body) * 100)} % · клик по телу — выбрать часть</div>
<div class="sel-box">${
    sel === null
      ? `<span class="faint">часть не выбрана</span>`
      : `<b>${esc(elementName(body, sel))}</b><div class="row"><button class="btn small" data-act="at">удар сюда</button><button class="btn small" data-act="bandage">перевязать</button><button class="btn small" data-act="burnw">прижечь</button><button class="btn small" data-act="infect">нагноение</button></div>`
  }</div>
<div class="cap">время и еда</div>
<div class="row"><button class="btn small" data-act="w1">1 ход</button><button class="btn small" data-act="w10">10</button><button class="btn small" data-act="w50">50</button><button class="btn small" data-act="r50">покой 50</button><button class="btn small" data-act="r200">покой 200</button></div>
<div class="row"><button class="btn small" data-act="eat">поесть +300</button><button class="btn small" data-act="eat1000">поесть +1000</button><button class="btn small" data-act="chill">подхватить озноб</button></div>
<div class="cap" title="обмен тратится на скорость: ×${KNIT_PACE} к заживлению, ×${KNIT_TAX} к цене каждой единицы">бросить обмен на заживление</div>
<div class="row"><button class="btn primary" data-act="knit10">залечить 10</button><button class="btn" data-act="knit50">50</button><button class="btn" data-act="knitAll" title="покоем и рывком, пока есть запас или пока не зажило — до 500 ходов">до упора</button></div>
<div class="faint small">рывок: ${KNIT_PACE}× скорость, ${KNIT_TAX}× цена. Запас ${Math.round(current().harm.reserve)}: хватит примерно на ${Math.floor(current().harm.reserve / (HEAL_COST * KNIT_TAX))} прочности</div>
<div class="cap">бой</div>
<div class="row"><select id="dmg-enemy">${enemies}</select></div>
<div class="row"><label>ходов <input type="number" id="dmg-turns" value="${page.fightTurns}" style="width:64px"></label><button class="btn primary" data-act="fight">В бой</button><button class="btn" data-act="fightDeath" title="до смерти или 2000 ходов">до смерти</button></div>
<div class="row"><button class="btn small" data-act="undo"${page.state.commands.length === 0 ? " disabled" : ""}>отменить последнее</button><button class="btn small" data-act="reset"${page.state.commands.length === 0 ? " disabled" : ""}>сбросить всё</button></div>`;
}

function tapeHtml(): string {
  const run = page.run!;
  const on = current().index;
  const rows = run.steps.map((s) => {
    const lines = eventLines(s);
    const dead = s.harm.dead !== null && (s.index === 0 || run.steps[s.index - 1]!.harm.dead === null);
    const shown = s.index === on ? lines : lines.slice(0, 3);
    const more = lines.length - shown.length;
    return `<div class="dstep${s.index === on ? " on" : ""}${dead ? " dead" : ""}" data-dstep="${s.index}"><div class="n mono">${s.index}</div><div><div class="main">${esc(s.title)} <span class="faint mono">· ход ${s.harm.turn}</span></div>${shown.map((l) => `<div class="ev ${l.cls}">${esc(l.text)}</div>`).join("")}${more > 0 ? `<div class="ev faint">…ещё ${more}</div>` : ""}</div></div>`;
  });
  return `<div class="cap">лента</div>${rows.reverse().join("")}`;
}

// ---------------------------------------------------------------- centre: the body

function canvasHtml(): string {
  const step = current();
  const body = step.body;
  const room = Math.max(240, ($("dmg-canvas").clientWidth || 700) - 24);
  const size = Math.min(760, room);
  const { tints, bleeding, rings } = bodyTints(body, step.harm, page.sel);
  const views = ([
    ["graph", "граф"],
    ["sprite", "спрайт"],
  ] as const)
    .map(([v, ru]) => `<button class="btn small${page.view === v ? " primary" : ""}" data-dview="${v}">${ru}</button>`)
    .join("");
  const svg =
    page.view === "sprite"
      ? woundSpriteSvg({ body, layout: host().layout(body), seed: page.state.seed, t: SPRITE_T, size, tints, bleeding, rings, hit: true })
      : sceneSvg({ body, layout: host().layout(body), size, territories: host().territories(body), tints, bleeding, rings, hit: true, hitTitle: "клик — выбрать часть" });
  const legend = [
    [TONE.bile, "ранен"],
    [TONE.flesh, "сломан: не работает, кровь дальше не идёт"],
    [INK.paper3, "разрушен"],
    [TONE.chrome, "отрезано от крови: не ест, не бьёт, не чувствует"],
    [TONE.bio, "нагноение"],
  ]
    .map(([c, t]) => `<span class="lg"><i style="background:${c}"></i>${esc(t!)}</span>`)
    .join("");
  const dead = step.harm.dead !== null ? `<div class="dead-banner">СМЕРТЬ · ${esc(DEATH_RU[step.harm.dead])} · ход ${step.harm.turn}</div>` : "";
  return `${dead}<div class="row dmg-views">${views}<span class="faint small">раны и состояния — на обоих видах</span></div><figure class="fig main">${svg}</figure><div class="legend">${legend}<span class="lg"><i class="drop"></i>кровотечение</span></div>`;
}

function playerHtml(): string {
  const i = current().index;
  const n = lastIndex();
  return `<button class="btn icon" data-dnav="-1"${i === 0 ? " disabled" : ""}>◀</button><input type="range" class="scrub" id="dmg-scrub" min="0" max="${n}" value="${i}"><button class="btn icon" data-dnav="1"${i === n ? " disabled" : ""}>▶</button><span class="where mono">${i} / ${n}</span>`;
}

// ---------------------------------------------------------------- right: the state of the body

function bar(value: number, max: number, color: string): string {
  const w = max > 0 ? Math.max(0, Math.min(100, (100 * value) / max)) : 0;
  return `<div class="bar"><i style="width:${w.toFixed(1)}%;background:${color}"></i></div>`;
}

function statusHtml(): string {
  const step = current();
  const { body, harm } = step;
  const mind = mindState(body, harm);
  const bmax = bloodMax(body);
  const level = bloodLevel(body, harm);
  const bleed = totalBleed(body, harm);
  // What the blood no longer reaches is dead weight: it eats nothing and holds no blood.
  const live = bloodReach(body);
  const up = upkeep(body, live);
  const deadWeight = Math.round(mass(body) - bmax);
  const out: string[] = [];

  // Alive, conscious, who drives.
  let head: string;
  if (harm.dead !== null) head = `<div class="verdict dead">МЁРТВ — ${esc(DEATH_RU[harm.dead])}</div>`;
  else if (mind.conscious) head = `<div class="verdict ok">ЖИВ · в сознании</div>`;
  else {
    const driver = mind.driver === "reflex" ? "рефлексы: тело отползает от угрозы" : mind.driver === "nobody" || mind.driver === null ? "никто: тело лежит" : `ведёт ${brainLabel(body, mind.driver)}`;
    head = `<div class="verdict out">ЖИВ · БЕЗ СОЗНАНИЯ</div><div class="faint small">${esc(driver)}</div>`;
  }
  out.push(
    `${head}<div class="faint small mono">ход ${harm.turn} · масса ${Math.round(mass(body))}${deadWeight > 0 ? ` · живой ${Math.round(bmax)}` : ""}</div>${
      deadWeight > 0 ? `<div class="small c-flesh">отделено от крови: ${deadWeight} массы — не ест, не держит кровь, не бьёт и не чувствует</div>` : ""
    }`,
  );

  // Blood.
  const left = bleed > 0 ? ` · при таком кровотечении ≈ ${Math.ceil(harm.blood / bleed)} ${turnsRu(Math.ceil(harm.blood / bleed))} до смерти` : "";
  out.push(`<div class="cap">кровь</div><div class="kv"><b class="mono">${Math.max(0, Math.round(harm.blood))} / ${Math.round(bmax)}</b> <span class="${level === "fine" ? "c-ok" : "c-flesh"}">${BLOOD_RU[level]}</span></div>${bar(harm.blood, bmax, TONE.flesh)}<div class="small ${bleed > 0 ? "c-flesh" : "faint"}">теряет ${bleed} в ход${esc(left)}</div>`);

  // Reserve.
  out.push(`<div class="cap">запас обмена</div><div class="kv"><b class="mono">${Math.round(harm.reserve)}</b> <span class="faint">расход тела ${up.toFixed(1)}/ход${page.state.hunger ? "" : " (не тратится)"}</span></div>${harm.reserve <= 0 ? `<div class="small c-bile">пусто: заживления нет</div>` : ""}`);

  // Mind and pain.
  const brains = mind.brains
    .map((b) => {
      const tag = [b.brain.self ? "ты" : "", !b.brain.alive ? "мёртв" : "", b.hurt ? "повреждён" : "", PAIN_RU[b.level]].filter((x) => x !== "").join(" · ");
      const color = b.level === "out" ? INK.paper3 : b.pain >= 60 ? TONE.flesh : b.pain >= 30 ? TONE.bile : TONE.ok;
      return `<div class="brain${b.brain.self ? " me" : ""}"><div class="kv"><span>${esc(brainLabel(body, b.key))}</span> <span class="faint small">${esc(tag)}</span></div><div class="row tight">боль <b class="mono">${Math.round(b.pain)}</b>${bar(b.pain, 100, color)}<span class="mono small" title="каналы: по виду × целостность × кровь, после боли">${b.power.toFixed(1)} / ${b.base.toFixed(1)}</span></div></div>`;
    })
    .join("");
  out.push(`<div class="cap">разум и боль</div><div class="kv">каналы <b class="mono">${mind.power.toFixed(1)}</b> против нагрузки <b class="mono">${mind.load.toFixed(1)}</b>${mind.loose > 0 ? ` <span class="c-flesh">· вне контроля ${mind.loose}</span>` : ""}</div>${brains || `<div class="faint">мозгов нет</div>`}`);

  // Sickness.
  const sick: string[] = [];
  if (harm.chill !== null) sick.push(`<div>озноб: <b>${["знобит", "лихорадка", "жар"][harm.chill.stage - 1]}</b> <span class="faint small">ход ${harm.chill.turns}</span></div>`);
  for (const [id, s] of Object.entries(harm.infection)) sick.push(`<div class="c-bio">нагноение: ${esc(elementName(body, Number(id)))} — <b>${["краснота", "гной", "гангрена"][s.stage - 1]}</b> <span class="faint small">ход ${s.turns}</span></div>`);
  if (sick.length > 0) out.push(`<div class="cap">болезни</div>${sick.join("")}`);

  // Organs.
  const slots = organSlots(body);
  const hurtOrgans = slots.filter((s) => step.harm.organs[s.key]?.hurt === true);
  const lost = lostOrgans();
  if (hurtOrgans.length + lost.length > 0) {
    out.push(
      `<div class="cap">органы</div>${hurtOrgans.map((s) => `<div class="c-bile">${esc(organRu(s.organ.kind))} (${esc(elementName(body, s.element))}) — повреждён, вполсилы</div>`).join("")}${lost.length > 0 ? `<div class="c-flesh">потеряно: ${esc(lost.join(", "))}</div>` : ""}`,
    );
  }

  // Parts.
  const rows: string[] = [];
  for (const id of [...nodeIds(body), ...segmentIds(body)].sort((a, b) => a - b)) {
    const el = (body.nodes[id] ?? body.segments[id])!;
    const st = elementState(el.hp, el.hpMax);
    const bl = bleedOf(body, harm, id);
    const inf = harm.infection[id];
    const dry = !live.has(id);
    const interesting = st !== "whole" || bl > 0 || el.ischemia > 0 || inf !== undefined || dry;
    if (!interesting && !page.showAll) continue;
    if (body.nodes[id] !== undefined && body.nodes[id]!.ends.length === 0 && !interesting) continue;
    const notes = [bl > 0 ? `кровь ${bl}` : "", dry ? `отрезано от крови${el.ischemia > 0 ? `, ${el.ischemia} ${turnsRu(el.ischemia)}` : ""}` : "", inf !== undefined ? ["краснота", "гной", "гангрена"][inf.stage - 1]! : ""]
      .filter((x) => x !== "")
      .join(" · ");
    rows.push(`<tr class="st-${st}${page.sel === id ? " on" : ""}" data-pick="${id}"><td>${esc(elementName(body, id))}</td><td>${STATE_RU[st]}</td><td class="r mono">${el.hp}/${el.hpMax}</td><td class="small">${esc(notes)}</td></tr>`);
  }
  out.push(
    `<div class="cap">части тела <label class="chk small"><input type="checkbox" id="dmg-all"${page.showAll ? " checked" : ""}> все</label></div>${
      rows.length === 0 ? `<div class="faint">всё цело</div>` : `<table class="cands parts"><thead><tr><th>часть</th><th>сост.</th><th class="r">hp</th><th></th></tr></thead><tbody>${rows.join("")}</tbody></table>`
    }<div class="faint small">hp в игре скрыт: игрок видит состояние, боль и кровь</div>`,
  );
  return out.join("");
}

/** Organs gone by now, from the events of every step so far. */
function lostOrgans(): string[] {
  const run = page.run!;
  const upto = current().index;
  const out: string[] = [];
  for (const s of run.steps.slice(1, upto + 1)) {
    for (const e of s.events) {
      if (e.k === "organ" && e.result === "destroyed") out.push(organRu(e.kind));
      if (e.k === "crushed") out.push(...e.lost.filter((k) => k !== "head").map(organRu));
      if (e.k === "torn") for (const p of e.pieces) out.push(...p.organs.filter((k) => k !== "head").map(organRu));
    }
  }
  const counts = new Map<string, number>();
  for (const x of out) counts.set(x, (counts.get(x) ?? 0) + 1);
  return [...counts].map(([k, n]) => (n > 1 ? `${k} ×${n}` : k));
}

// ---------------------------------------------------------------- render and events

export function render(): void {
  if (page.run === null) return;
  $("dmg-controls").innerHTML = controlsHtml();
  $("dmg-tape").innerHTML = tapeHtml();
  $("dmg-player").innerHTML = playerHtml();
  $("dmg-canvas").innerHTML = canvasHtml();
  $("dmg-status").innerHTML = statusHtml();
  host().drawn();
}

function readInputs(): void {
  const dice = ($("dmg-dice") as HTMLInputElement | null)?.value;
  if (dice !== undefined && parseDice(dice) !== null) page.dice = dice.trim();
  page.dirty = ($("dmg-dirty") as HTMLInputElement | null)?.checked ?? page.dirty;
  page.burn = ($("dmg-burn") as HTMLInputElement | null)?.checked ?? page.burn;
  const turns = Number(($("dmg-turns") as HTMLInputElement | null)?.value);
  if (Number.isInteger(turns) && turns > 0) page.fightTurns = Math.min(5000, turns);
}

function hit(extra: Partial<Extract<DamageCommand, { t: "hit" }>> = {}): DamageCommand {
  const cmd: Extract<DamageCommand, { t: "hit" }> = { t: "hit", dice: page.dice, profile: page.profile, ...extra };
  if (page.dirty) cmd.dirty = true;
  if (page.burn) cmd.burn = true;
  return cmd;
}

function act(name: string): void {
  readInputs();
  const sel = page.sel;
  switch (name) {
    case "hit":
      return push(hit());
    case "hit5":
      return push(hit(), hit(), hit(), hit(), hit());
    case "at":
      if (sel !== null) push(hit({ profile: "at", at: sel }));
      return;
    case "bandage":
      if (sel !== null) push({ t: "bandage", id: sel });
      return;
    case "burnw":
      if (sel !== null) push({ t: "burn", id: sel });
      return;
    case "infect":
      if (sel !== null) push({ t: "infect", id: sel });
      return;
    case "w1":
      return push({ t: "wait", n: 1 });
    case "w10":
      return push({ t: "wait", n: 10 });
    case "w50":
      return push({ t: "wait", n: 50 });
    case "r50":
      return push({ t: "wait", n: 50, rest: true });
    case "r200":
      return push({ t: "wait", n: 200, rest: true });
    case "eat":
      return push({ t: "eat", n: 300 });
    case "eat1000":
      return push({ t: "eat", n: 1000 });
    case "knit10":
      return push({ t: "wait", n: 10, rest: true, knit: true });
    case "knit50":
      return push({ t: "wait", n: 50, rest: true, knit: true });
    case "knitAll":
      return push({ t: "wait", n: 500, rest: true, knit: true });
    case "chill":
      return push({ t: "chill" });
    case "fight":
      return push({ t: "fight", enemy: page.enemy, turns: page.fightTurns });
    case "fightDeath":
      return push({ t: "fight", enemy: page.enemy, turns: 2000 });
    case "undo":
      page.state.commands.pop();
      page.step = null;
      recompute();
      save();
      render();
      return;
    case "reset":
      page.state.commands = [];
      page.step = null;
      recompute();
      save();
      render();
      return;
  }
}

function bind(): void {
  const root = $("ar-wounds");
  root.addEventListener("click", (e) => {
    const t = e.target as Element;
    const btn = t.closest<HTMLElement>("[data-act]");
    if (btn !== null) return act(btn.dataset.act!);
    const view = t.closest<HTMLElement>("[data-dview]");
    if (view !== null) {
      page.view = view.dataset.dview as DamageView;
      return render();
    }
    const nav = t.closest<HTMLElement>("[data-dnav]");
    if (nav !== null) {
      page.step = Math.max(0, Math.min(lastIndex(), current().index + Number(nav.dataset.dnav)));
      if (page.step === lastIndex()) page.step = null;
      return render();
    }
    const row = t.closest<HTMLElement>("[data-dstep]");
    if (row !== null) {
      const i = Number(row.dataset.dstep);
      page.step = i === lastIndex() ? null : i;
      return render();
    }
    const pickRow = t.closest<HTMLElement>("[data-pick]");
    if (pickRow !== null) {
      const id = Number(pickRow.dataset.pick);
      page.sel = page.sel === id ? null : id;
      return render();
    }
    const part = t.closest<SVGElement>("#dmg-canvas [data-seg], #dmg-canvas [data-node]");
    if (part !== null) {
      const id = Number(part.dataset.seg ?? part.dataset.node);
      page.sel = page.sel === id ? null : id;
      return render();
    }
  });
  root.addEventListener("change", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.id === "dmg-seed") {
      const v = Number(t.value);
      if (Number.isInteger(v)) page.state.seed = v;
    } else if (t.id === "dmg-hunger") page.state.hunger = t.checked;
    else if (t.id === "dmg-profile") {
      page.profile = t.value as Profile;
      return;
    } else if (t.id === "dmg-enemy") {
      page.enemy = t.value as EnemyId;
      return;
    } else if (t.id === "dmg-all") {
      page.showAll = t.checked;
      return render();
    } else if (t.id === "dmg-dice" || t.id === "dmg-dirty" || t.id === "dmg-burn" || t.id === "dmg-turns") {
      readInputs();
      return;
    } else return;
    recompute();
    save();
    render();
  });
  root.addEventListener("input", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.id !== "dmg-scrub") return;
    const i = Number(t.value);
    page.step = i === lastIndex() ? null : i;
    $("dmg-tape").innerHTML = tapeHtml();
    $("dmg-canvas").innerHTML = canvasHtml();
    $("dmg-status").innerHTML = statusHtml();
    t.parentElement!.querySelector(".where")!.textContent = `${i} / ${lastIndex()}`;
    host().drawn();
  });
}

/** Binds the page once; `encoded` is the state from the hash. */
export function initDamage(h: DamageHost, encoded: string | undefined): void {
  const first = page.host === null;
  page.host = h;
  page.state = decodeDamage(encoded);
  page.run = null;
  page.step = null;
  if (first) bind();
}

/** The strike mode opened: replay over the target if it or its attacker changed. */
export function showDamage(): void {
  if (page.run === null || keyOf() !== page.baseHash) {
    page.sel = null;
    recompute();
  }
  render();
}

export type { DamageState };
