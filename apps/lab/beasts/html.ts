/**
 * The bestiary check as one html fragment - every beast a form, measured
 * against the shape it wants: `<title>`, `<style>`, the
 * markup - no doctype, no head, no outside links, system fonts, the dark
 * tokens of design/_ds.css. Strings only; nothing here touches files or
 * the DOM.
 */
import { COVERS, type CoverId, SHAPE_KEYS, SHAPE_RU, tolerance, traitsOf, type Anatomy, type Shape } from "@mutant-engine/core";
import { KIND_RU, opens, type Addition, type AdditionKind } from "./additions.js";
import type { BeastReport, BeastsData } from "./build.js";
import { type RandomBeast } from "./measure.js";

export const TITLE = "Бестиарий mutant-engine";

export function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const pct = (x: number, digits = 1): string => `${(x * 100).toFixed(digits)} %`;
const num = (x: number): string => (Number.isInteger(x) ? String(x) : x.toFixed(1));

const ANATOMY_RU: Record<keyof Anatomy, string> = {
  torsos: "корпуса",
  limbs: "конечности",
  endings: "окончания",
  heads: "головы и глаза",
  cover: "покров",
  membranes: "перепонки",
  breath: "дышит",
  eats: "ест",
  attack: "атакует",
  moves: "двигается",
};

const KIND_ORDER: AdditionKind[] = ["op", "part", "row"];

// ---------------------------------------------------------------- style

export const STYLE = `
:root{--ink-0:#0b0a09;--ink-1:#14110e;--ink-2:#1c1814;--ink-3:#28221c;--line:#3b3127;--line-soft:#261f19;
--paper:#e9dec9;--paper-2:#b4a890;--paper-3:#938775;--amber:#cf9550;--flesh:#c4493b;--flesh-soft:#4a211b;--bile:#d3a947;--ok:#8bab6c;
--chrome:#7fa8ba;--bio:#5fd4b1;--fam-head:#b58ad0;
--f-serif:Georgia,"Times New Roman",serif;--f-sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--f-mono:ui-monospace,Menlo,Consolas,monospace}
.beasts{font:400 15px/1.5 var(--f-sans);color:var(--paper);background:var(--ink-0);padding:32px clamp(16px,4vw,56px) 80px;margin:0}
.beasts *{box-sizing:border-box}
.beasts h1{font:700 34px/1.15 var(--f-serif);margin:0 0 8px}
.beasts h2{font:700 24px/1.2 var(--f-serif);margin:48px 0 12px;padding-top:24px;border-top:1px solid var(--line)}
.beasts h3{font:700 17px/1.25 var(--f-serif);margin:20px 0 8px}
.beasts .cap{font:600 12px/1 var(--f-sans);letter-spacing:.18em;text-transform:uppercase;color:var(--paper-3);margin:0 0 6px}
.beasts .lead{color:var(--paper-2);max-width:72ch;margin:0 0 8px}
.beasts .dim{color:var(--paper-2)} .beasts .faint{color:var(--paper-3)}
.beasts .mono{font-family:var(--f-mono);font-variant-numeric:tabular-nums}
.beasts .c-ok{color:var(--ok)} .beasts .c-bile{color:var(--bile)} .beasts .c-flesh{color:var(--flesh)} .beasts .c-bio{color:var(--bio)} .beasts .c-amber{color:var(--amber)} .beasts .c-head{color:var(--fam-head)}
.beasts table{border-collapse:collapse;width:100%;font-size:14px}
.beasts th,.beasts td{padding:6px 10px;border-bottom:1px solid var(--line-soft);vertical-align:top;text-align:left}
.beasts th{font-weight:600;color:var(--paper-3);font-size:12px;letter-spacing:.06em;text-transform:uppercase}
.beasts td.n,.beasts th.n{text-align:right;font-family:var(--f-mono);font-variant-numeric:tabular-nums;white-space:nowrap}
.beasts .scroll{overflow-x:auto}
.beasts .verdict{display:inline-block;padding:1px 8px;border-radius:10px;font-size:12px;font-weight:600}
.beasts .v-yes{background:#22301a;color:var(--ok)} .beasts .v-almost{background:#3a2e12;color:var(--bile)} .beasts .v-no{background:var(--flesh-soft);color:#e7a194}
.beasts .tag{display:inline-block;padding:1px 8px;border-radius:10px;font-size:12px;background:var(--ink-3);color:var(--paper-2);margin:2px 4px 2px 0;white-space:nowrap}
.beasts .tag.op{background:#3a1f33;color:#e6a3cf} .beasts .tag.part{background:#1f2f37;color:var(--chrome)} .beasts .tag.row{background:#3a2e12;color:var(--bile)}
.beasts article.beast{margin-top:40px;padding-top:24px;border-top:1px solid var(--line)}
.beasts article.beast h2{border:0;margin:0 0 4px;padding:0}
.beasts .figures{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px;margin:16px 0;max-width:640px}
.beasts figure{margin:0;background:var(--ink-1);border:1px solid var(--line);border-radius:6px;padding:12px}
.beasts figure svg{display:block;width:100%;height:auto;max-height:340px}
.beasts figcaption{font-size:13px;color:var(--paper-2);margin-top:8px}
.beasts figcaption b{color:var(--paper);font-weight:600}
.beasts .cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:24px;align-items:start}
.beasts dl{margin:0;display:grid;grid-template-columns:max-content 1fr;gap:4px 14px;font-size:14px}
.beasts dt{color:var(--paper-3)} .beasts dd{margin:0}
.beasts ul.plain{margin:0;padding-left:20px;font-size:14px}
.beasts .spark{display:block;width:100%;height:56px;background:var(--ink-1);border:1px solid var(--line);border-radius:4px}
.beasts .legend{font-size:12px;color:var(--paper-3)}
.beasts .legend i{display:inline-block;width:10px;height:3px;vertical-align:middle;margin:0 4px 0 8px}
.beasts .method{background:var(--ink-1);border-left:2px solid var(--line);padding:12px 16px;font-size:14px;color:var(--paper-2);max-width:90ch}
.beasts .toc{display:flex;flex-wrap:wrap;gap:6px 14px;margin:12px 0 0;font-size:14px}
.beasts a{color:var(--amber);text-decoration:none} .beasts a:hover{text-decoration:underline}
.beasts .mark{font-family:var(--f-mono)}
`;

// ---------------------------------------------------------------- pieces

function verdictTag(v: BeastReport["verdict"]): string {
  const cls = v === "да" ? "v-yes" : v === "почти" ? "v-almost" : "v-no";
  return `<span class="verdict ${cls}">${v}</span>`;
}

function needTags(needs: readonly Addition[]): string {
  return needs.map((a) => `<a class="tag ${a.kind}" href="#a-${a.id}">${esc(a.ru)}</a>`).join("");
}

function coverRu(c: CoverId): string {
  return COVERS[c].ru;
}

function shapeCell(want: number, have: number): string {
  const ok = Math.abs(have - want) <= tolerance(want);
  const cls = have === want ? "" : ok ? "c-bile" : "c-flesh";
  return `<td class="n ${cls}">${have}</td>`;
}

function shapeTable(b: BeastReport): string {
  const traits = new Set<keyof Shape>(traitsOf(b.beast.want));
  const rows = SHAPE_KEYS.filter((k) => traits.has(k) || b.fixture.features[k] !== 0)
    .map((k) => `<tr><td>${SHAPE_RU[k]}${traits.has(k) ? ' <span class="faint">·</span>' : ""}</td><td class="n">${b.beast.want[k]}</td>${shapeCell(b.beast.want[k], b.fixture.features[k])}</tr>`)
    .join("");
  const wantCover = b.beast.want.cover;
  const fxShare = b.fixture.features.covers[wantCover] ?? 0;
  const coverRow = `<tr><td>покров ${traits.has("cover") ? '<span class="faint">·</span>' : ""}</td><td>${coverRu(wantCover)}</td><td class="n ${fxShare >= 0.5 ? "" : "c-flesh"}">${pct(fxShare, 0)}</td></tr>`;
  return `<table><thead><tr><th>черта</th><th class="n">нужно</th><th class="n">форма</th></tr></thead><tbody>${rows}${coverRow}</tbody></table>
<p class="faint" style="font-size:12px;margin:6px 0 0">· — черта, которой тварь отличается от человека; допуск на счёт — 1 или четверть; покров — доля сегментов, не ниже половины.</p>`;
}

function mediaRu(media: string): string {
  if (media === "") return '<span class="c-flesh">ничем</span>';
  return media
    .split("+")
    .map((m) => (m === "air" ? "воздух" : m === "water" ? "вода" : m))
    .join(" и ");
}

function derivedLine(r: BeastReport["fixture"]): string {
  const s = r.summary;
  const flags = [s.fly ? "летает" : "", s.swim ? "плавает" : "", s.climb ? "лазает" : "", s.eats ? "ест" : "не ест"].filter((x) => x.length > 0).join(", ");
  // Mass against the ceiling and load against the channels: the two ways a beast is broken on its first turn and the card used to hide both (decisions 240, 242).
  const load = Number(s.load);
  const cap = Number(s.channels);
  const channels = `<span class="${load > cap ? "c-flesh" : ""}">каналы ${num(load)} / ${cap}</span>`;
  return `масса <b>${num(r.mass)}</b> / потолок ${r.ceiling} · ${channels} · габарит ${s.bulk} · узлов ${r.nodes}, сегментов ${r.segments}<br>скорость <b>${s.speed}</b> (опора ${s.support}) · атак ${s.attacks}, досягаемость ${s.reach} · хватов ${s.grips} · ${flags} · дышит: ${mediaRu(String(s.media))} (воздух ${s.air}, вода ${s.water}) · сердец ${s.hearts} · точек обзора ${s.viewpoints}, глаз ${s.eyes}`;
}

function sparkline(r: RandomBeast): string {
  const n = r.loose.length;
  if (n === 0) return "";
  const w = 300;
  const h = 56;
  const x = (i: number) => ((i + 0.5) / n) * w;
  const y = (v: number) => h - 3 - v * (h - 8);
  const path = (v: number[]) => v.map((s, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(s).toFixed(1)}`).join(" ");
  const grid = [0.25, 0.5, 0.75, 1].map((g) => `<line x1="0" x2="${w}" y1="${y(g).toFixed(1)}" y2="${y(g).toFixed(1)}" stroke="#261f19" stroke-width="1"/>`).join("");
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="доля сидов по ударам">${grid}<path d="${path(r.loose)}" fill="none" stroke="#d3a947" stroke-width="1.5"/><path d="${path(r.strict)}" fill="none" stroke="#5fd4b1" stroke-width="1.5"/></svg>`;
}

function randomBlock(b: BeastReport, strikes: number): string {
  const r = b.random;
  const missing = r.offAtPeak.length === 0 ? "—" : r.offAtPeak.map((o) => `${SHAPE_RU[o.key]} ${pct(o.share, 0)}`).join(", ");
  const traits = traitsOf(b.beast.want);
  return `<p class="dim" style="margin:0 0 6px">Черт, отличающих тварь от человека: ${traits.length} (${traits.map((k) => SHAPE_RU[k]).join(", ")}).</p>
<table><tbody>
<tr><td>три четверти черт</td><td class="n">${pct(r.peakLoose.share)}</td><td class="dim">пик на ударе ${r.peakLoose.strikes || "—"}; хотя бы раз за ${strikes} ударов — ${pct(r.everLoose)}</td></tr>
<tr><td>тело целиком в допуске</td><td class="n">${pct(r.peakStrict.share, 2)}</td><td class="dim">пик на ударе ${r.peakStrict.strikes || "—"}; хотя бы раз — ${pct(r.everStrict, 2)}</td></tr>
<tr><td>лучшая доля черт, в среднем</td><td class="n">${r.meanBest.toFixed(2)}</td><td class="dim">чего не хватает на пике: ${esc(missing)}</td></tr>
</tbody></table>
${sparkline(r)}
<p class="legend"><i style="background:#d3a947"></i>три четверти черт <i style="background:#5fd4b1"></i>целиком, по ударам 1…${strikes}</p>`;
}

function deficitList(b: BeastReport): string {
  const byKind = KIND_ORDER.map((k) => ({ k, list: b.needs.filter((a) => a.kind === k) })).filter((x) => x.list.length > 0);
  const groups = byKind.map((x) => `<li><span class="faint">${KIND_RU[x.k]}:</span> ${x.list.map((a) => `<a href="#a-${a.id}">${esc(a.ru)}</a>`).join(", ")}</li>`).join("");
  const words = b.beast.unexpressible.map((t) => `<li>${esc(t)}</li>`).join("");
  const off = b.fixture.similarity.off.map((k) => `<li class="c-bile">форма мимо по черте «${SHAPE_RU[k]}»: нужно ${k === "cover" ? coverRu(b.beast.want.cover) : b.beast.want[k]}, вышло ${k === "cover" ? pct(b.fixture.features.covers[b.beast.want.cover] ?? 0, 0) : b.fixture.features[k]}</li>`).join("");
  const all = groups + off + words;
  return all.length === 0 ? '<p class="c-ok">каталога хватает целиком</p>' : `<ul class="plain">${all}</ul>`;
}

function anatomyList(a: Anatomy): string {
  return `<dl>${(Object.keys(ANATOMY_RU) as (keyof Anatomy)[]).map((k) => `<dt>${ANATOMY_RU[k]}</dt><dd>${esc(a[k])}</dd>`).join("")}</dl>`;
}

function beastArticle(b: BeastReport, strikes: number): string {
  const sim = b.fixture.similarity;
  return `<article class="beast" id="b-${b.beast.id}">
<p class="cap">${esc(b.beast.id)}</p>
<h2>${esc(b.beast.ru)} ${verdictTag(b.verdict)}</h2>
<p class="dim" style="margin:0">Черт на месте ${sim.traits.hit} из ${sim.traits.total} · мимо: ${sim.off.length === 0 ? "ничего" : sim.off.map((k) => SHAPE_RU[k]).join(", ")} · случайная сборка на три четверти черт — ${pct(b.random.peakLoose.share)} на ударе ${b.random.peakLoose.strikes || "—"}</p>
<div class="figures">
<figure>${b.fixture.svg}<figcaption><b>Форма</b> — тварь, нарисованная фикстурой.<br>${derivedLine(b.fixture)}</figcaption></figure>
</div>
<div class="cols">
<div><h3>Анатомия</h3>${anatomyList(b.beast.anatomy)}</div>
<div><h3>Форма в числах</h3>${shapeTable(b)}</div>
</div>
<div class="cols">
<div><h3>Чего не хватает</h3>${deficitList(b)}</div>
<div><h3>Случайная сборка: удар бездны</h3>${randomBlock(b, strikes)}</div>
</div>
</article>`;
}

// ---------------------------------------------------------------- summary tables

function summaryTable(d: BeastsData): string {
  const rows = d.beasts
    .map((b) => {
      const r = b.random;
      return `<tr><td><a href="#b-${b.beast.id}">${esc(b.beast.ru)}</a></td><td>${verdictTag(b.verdict)}</td><td class="n">${b.fixture.similarity.traits.hit}/${b.fixture.similarity.traits.total}</td><td class="n">${b.fixture.nodes}/${b.fixture.segments}</td><td class="n">${pct(r.peakLoose.share)} <span class="faint">@${r.peakLoose.strikes || "—"}</span></td><td class="n">${pct(r.everLoose)}</td><td class="n">${pct(r.everStrict, 2)}</td><td>${needTags(b.needs)}</td></tr>`;
    })
    .join("");
  return `<div class="scroll"><table><thead><tr><th>тварь</th><th>форма</th><th class="n">черт</th><th class="n">узлов/сегм.</th><th class="n">случай: ¾ черт, пик</th><th class="n">¾ хоть раз</th><th class="n">целиком хоть раз</th><th>чего не хватает</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function deficitMatrix(d: BeastsData): string {
  const rows = d.beasts
    .map((b) => {
      const cell = (k: AdditionKind) => b.needs.filter((a) => a.kind === k).map((a) => `<a href="#a-${a.id}">${esc(a.ru)}</a>`).join("<br>") || '<span class="faint">—</span>';
      const off = b.fixture.similarity.off.map((k) => SHAPE_RU[k]).join(", ");
      const words = b.beast.unexpressible.length;
      return `<tr><td><a href="#b-${b.beast.id}">${esc(b.beast.ru)}</a></td><td>${cell("op")}</td><td>${cell("part")}</td><td>${cell("row")}</td><td class="dim">${off.length > 0 ? `мимо: ${off}` : "по форме сходится"}${words > 0 ? `; словами — ${words}` : ""}</td></tr>`;
    })
    .join("");
  return `<div class="scroll"><table><thead><tr><th>тварь</th><th>нужна операция</th><th>нет в таблицах parts</th><th>есть, но не выпадает</th><th>форма</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function additionsList(d: BeastsData): string {
  const order = d.beasts.map((b) => b.beast.id);
  const ruOf = new Map(d.beasts.map((b) => [b.beast.id, b.beast.ru]));
  const groups = KIND_ORDER.map((k) => {
    const list = d.additions.filter((a) => a.kind === k);
    const items = list
      .map(
        (a) => `<li id="a-${a.id}" style="margin:0 0 14px"><b>${esc(a.ru)}</b> <span class="faint mono">${a.rows > 0 ? `${a.rows} стр.` : "число"}</span><br>${esc(a.what)}<br><span class="dim">Почему в правилах: ${esc(a.why)}</span><br><span class="c-amber">Открывает:</span> ${opens(a.id, order)
          .map((id) => `<a href="#b-${id}">${esc(ruOf.get(id) ?? id)}</a>`)
          .join(", ")}</li>`,
      )
      .join("");
    return `<h3>${KIND_RU[k]} <span class="faint">(${list.length})</span></h3><ul class="plain" style="padding-left:18px">${items}</ul>`;
  });
  const rows = d.additions.reduce((n, a) => n + a.rows, 0);
  const ops = d.additions.filter((a) => a.kind === "op").length;
  return `<p class="lead">Всего: ${ops} новые операции, ${rows} строк каталога (новых или с расширенной целью), одно число в таблице. Ни одной строки со словами «второй» или «лишний», ни одного частного случая, растительное семейство не тронуто.</p>${groups.join("")}`;
}

// ---------------------------------------------------------------- the page

export function renderBeasts(d: BeastsData): string {
  const yes = d.beasts.filter((b) => b.verdict === "да").length;
  const almost = d.beasts.filter((b) => b.verdict === "почти").length;
  const no = d.beasts.length - yes - almost;
  const strikes = d.options.strikes;
  const bestRandom = [...d.beasts].sort((x, y) => y.random.peakLoose.share - x.random.peakLoose.share)[0]!;
  const strictAny = d.beasts.filter((b) => b.random.everStrict > 0).map((b) => `${b.beast.ru} ${pct(b.random.everStrict, 2)}`);
  const toc = d.beasts.map((b) => `<a href="#b-${b.beast.id}">${esc(b.beast.ru)}</a>`).join("");
  return `<title>${TITLE}</title>
<meta charset="utf-8">
<style>${STYLE}</style>
<main class="beasts">
<p class="cap">mutant-engine · тело-граф · проверка каталога</p>
<h1>Бестиарий: форма каждой твари и чего не хватает каталогу</h1>
<p class="lead">Двадцать существ мифа и зверей: каждое — форма, нарисованная фикстурой в словах модели и померенная против формы, которую хочет. Отдельно измерено, как часто удар бездны приходит к похожему телу сам — ${d.options.seeds} сидов по ${strikes} ударов.</p>
<p class="lead">По форме сходятся <b class="c-ok">${yes}</b> из ${d.beasts.length}, ещё <b class="c-bile">${almost}</b> — с одной чертой мимо, <b class="c-flesh">${no}</b> не сходятся. Сама по себе бездна ближе всего подходит к твари «${esc(bestRandom.beast.ru)}»: три четверти её черт у ${pct(bestRandom.random.peakLoose.share)} тел на ударе ${bestRandom.random.peakLoose.strikes}; тело целиком в допуске хоть раз за ${strikes} ударов ${strictAny.length === 0 ? "не получилось ни у одной твари" : `получилось у: ${strictAny.join(", ")}`}.</p>
<nav class="toc">${toc}<a href="#deficit">дефицит</a><a href="#additions">добавки</a><a href="#method">метод</a></nav>

<h2>Сводка</h2>
${summaryTable(d)}

<h2 id="deficit">Таблица дефицита</h2>
<p class="lead">Чего каталогу не хватает на каждую тварь, с точностью до строки или свойства. Три столбца — три вида нехватки: операции, которой нет у графа; вида, окончания, покрова или органа, которого нет в таблицах parts; строки, которая есть операцией, но не выпадает туда, куда нужно.</p>
${deficitMatrix(d)}

<h2 id="additions">Минимальный список добавок</h2>
${additionsList(d)}

${d.beasts.map((b) => beastArticle(b, strikes)).join("\n")}

<h2 id="method">Метод</h2>
<div class="method">
<p><b>Форма.</b> Тело читается в шестнадцать чисел: корпуса, конечности (кончики рук, ног и щупалец без головы на конце), хвосты, головы, глаза (в головах и на стеблях), окончания по видам — кисти, когти, копыта, клешни, присоски, стопы, пасти, жала, — крылья, жабры, и покров как доля сегментов. Тварь задана теми же числами; счёт сходится, если каждое число в допуске (1 или четверть от нужного) и нужный покров лежит хотя бы на половине сегментов. <b>Черты</b> твари — те числа, которыми она отличается от человека; доля черт в допуске — мера «насколько это она».</p>
<p><b>Тварь.</b> Тварь — не сборка на человеке, а собственный граф, написанный руками текстом фикстуры (<span class="mono">bodyFromText</span>). «Да» — все числа формы в допуске; «почти» — одно мимо; иначе «нет».</p>
<p><b>Случайно.</b> Человек, удар бездны первого слоя ровно как в лаборатории (15 % дефектов, расползание и распад плана включены, тот же ГСЧ — сид даёт тело лаборатории бит в бит), после каждого удара 30 ходов ползёт покров (кровь, опухоли и блуждающие глаза не считаются), после каждого удара тело меряется против всех двадцати тварей. Доля тел с тремя четвертями черт и доля тел целиком в допуске — по ударам; «хоть раз» — сид, у которого это случилось на каком-то ударе.</p>
<p><b>Правки атласа.</b> Добавки держатся правил владельца: одно действие — одна строка, место решает картину, без «второго» и «лишнего», растительное семейство не трогается. Где нехватка уйдёт сама с шагом K (руки и ноги — одно ребро), это сказано у твари.</p>
<p class="faint">Счёт бездны ${(d.ms.random / 1000).toFixed(1)} с, вся страница ${(d.ms.total / 1000).toFixed(1)} с.</p>
</div>
</main>
`;
}
