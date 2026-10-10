/**
 * Шаг L, размеры органов (решение 140). Тест обходит все виды из
 * `SIZED_ORGANS` и все три ступени и требует от каждой клетки таблицы
 * полного заполнения: спрайт, масса, название, честная монотонность и
 * проход через каждый расчёт - массу тела, hp узла, кубик удара, обмен,
 * хват, площадь для попадания и бюджеты.
 *
 * Забыть клетку нельзя: `ORGAN_SIZE_TABLE` типизирована как полная запись
 * (без `Partial`), так что вид без трёх строк не компилируется, а строка,
 * заполненная не теми числами, падает здесь.
 */
import { describe, expect, it } from "vitest";
import {
  ORGANS,
  ORGAN_SIZES,
  ORGAN_SIZE_TABLE,
  SIZED_ORGANS,
  capabilities,
  controlLoad,
  derive,
  human,
  mass,
  nodeHpMax,
  organ,
  organAttack,
  organMass,
  organUpkeep,
  organs,
  organSizeName,
  sizeSpec,
  sizedOrgan,
  specOf,
  upkeep,
  type OrganSize,
  type OrganSizeSpec,
  type SizedOrganKind,
  MUTATIONS,
} from "@mutant-engine/core";
import { HUMAN_IDS } from "../../core/human.js";
import { bodyToText, bodyFromText } from "../../core/text.js";
import { bodyHash } from "../../core/hash.js";
import { ENDING_SPRITES, endingSprite, framesDiffer, renderPixels, silhouetteSvg } from "../index.js";

/** Каждое число клетки, которому положено расти от малого к огромному. */
const NUMBERS: readonly [string, (r: OrganSizeSpec) => number][] = [
  ["mass", (r) => r.mass],
  ["upkeep", (r) => r.upkeep],
  ["control", (r) => r.control],
  ["hp", (r) => r.hp],
  ["bulk", (r) => r.bulk],
  ["sprite", (r) => r.sprite],
  ["dice", (r) => dieMean(r.attack)],
];

const dieMean = (dice: string): number => {
  if (dice === "") return 0;
  const m = /(\d+)d(\d+)/.exec(dice);
  expect(m, `"${dice}" is no die`).not.toBeNull();
  return (Number(m![1]) * (Number(m![2]) + 1)) / 2;
};

/** A human whose left hand is the organ under test. */
function withHand(o: ReturnType<typeof organ>) {
  const b = human(400);
  b.nodes[HUMAN_IDS.handL]!.ends = [o];
  return b;
}

describe("L · размерные ступени органов: таблица заполнена целиком", () => {
  it("у каждого вида ровно три ступени, и все они - виды из ORGANS", () => {
    expect(SIZED_ORGANS.length).toBeGreaterThan(0);
    expect(new Set(SIZED_ORGANS).size).toBe(SIZED_ORGANS.length);
    expect(Object.keys(ORGAN_SIZE_TABLE).sort()).toEqual([...SIZED_ORGANS].sort());
    for (const kind of SIZED_ORGANS) {
      expect(ORGANS[kind], `${kind} is no organ`).toBeDefined();
      expect(Object.keys(ORGAN_SIZE_TABLE[kind]).sort()).toEqual([...ORGAN_SIZES].sort());
    }
  });

  it("обычная ступень - это ровно строка ORGANS: тело из обычных органов не изменилось", () => {
    for (const kind of SIZED_ORGANS) {
      const base = ORGANS[kind];
      const row = ORGAN_SIZE_TABLE[kind].normal;
      expect(row.mass, `${kind} mass`).toBe(base.mass);
      expect(row.upkeep, `${kind} upkeep`).toBe(base.upkeep);
      expect(row.control, `${kind} control`).toBe(base.control);
      expect(row.grip, `${kind} grip`).toBe(base.grip ?? 0);
      expect(row.stand, `${kind} stand`).toBe(base.stand ?? 0);
      expect(row.dig, `${kind} dig`).toBe(base.dig ?? 0);
      expect(row.attack, `${kind} attack`).toBe(base.attack ?? "");
      expect(row.hp, `${kind} hp`).toBe(0);
      expect(row.bulk, `${kind} bulk`).toBe(0);
      expect(row.sprite, `${kind} sprite`).toBe(1);
    }
  });

  it("каждая клетка: есть спрайт, масса, название", () => {
    for (const kind of SIZED_ORGANS) {
      for (const size of ORGAN_SIZES) {
        const row = sizeSpec(kind, size)!;
        expect(row, `${kind}/${size}`).toBeDefined();
        // Название: своё у каждой ступени, рядом с ORGANS[kind].ru.
        expect(row.ru.length, `нет названия для ${kind}/${size}`).toBeGreaterThan(0);
        expect(organSizeName(sizedOrgan(kind, size)), `${kind}/${size}`).toBe(row.ru);
        // Масса и расход - числа, масса неотрицательна.
        expect(Number.isFinite(row.mass) && row.mass >= 0, `${kind}/${size} mass`).toBe(true);
        expect(Number.isFinite(row.upkeep) && row.upkeep >= 0, `${kind}/${size} upkeep`).toBe(true);
        expect(row.control, `${kind}/${size} control`).toBeGreaterThan(0);
        // Спрайт: масштаб положителен, и у видов со спрайтом штамп реально рисуется в этом размере.
        expect(row.sprite, `${kind}/${size} sprite scale`).toBeGreaterThan(0);
        if (ENDING_SPRITES[kind] !== undefined) {
          const piece = endingSprite(kind, 4, row.sprite);
          expect(piece.mask.w, `${kind}/${size} sprite width`).toBeGreaterThan(0);
          expect(piece.mask.h, `${kind}/${size} sprite height`).toBeGreaterThan(0);
          expect(piece.mask.rows.length).toBe(piece.mask.h);
          for (const r of piece.mask.rows) expect(r.length).toBe(piece.mask.w);
          expect(piece.anchor.x).toBeLessThan(piece.mask.w);
          expect(piece.anchor.y).toBeLessThan(piece.mask.h);
        }
      }
    }
  });

  it("масса, урон, спрайт и площадь растут от малого к огромному, не падая по дороге", () => {
    for (const kind of SIZED_ORGANS) {
      const [small, normal, huge] = ORGAN_SIZES.map((s) => ORGAN_SIZE_TABLE[kind][s]!);
      for (const [name, of] of NUMBERS) {
        expect(of(small!), `${kind} ${name}: small > normal`).toBeLessThanOrEqual(of(normal!));
        expect(of(normal!), `${kind} ${name}: normal > huge`).toBeLessThanOrEqual(of(huge!));
      }
      // И хоть чем-то огромный обязан отличаться от малого: масса и спрайт растут строго.
      expect(huge!.mass, `${kind}: huge weighs no more than small`).toBeGreaterThan(small!.mass);
      expect(huge!.sprite, `${kind}: huge draws no bigger than small`).toBeGreaterThan(small!.sprite);
      if (normal!.attack !== "") expect(dieMean(huge!.attack), `${kind}: huge hits no harder than small`).toBeGreaterThan(dieMean(small!.attack));
    }
  });
});

describe("L · размер честно проходит через расчёты", () => {
  it("specOf отдаёт строку ступени, и ни одна не просачивается как обычная", () => {
    for (const kind of SIZED_ORGANS) {
      for (const size of ORGAN_SIZES) {
        const o = sizedOrgan(kind, size);
        const row = sizeSpec(kind, size)!;
        const spec = specOf(o);
        expect(spec.mass, `${kind}/${size}`).toBe(row.mass);
        expect(spec.upkeep, `${kind}/${size}`).toBe(row.upkeep);
        expect(spec.control, `${kind}/${size}`).toBe(row.control);
        expect(organMass(o), `${kind}/${size}`).toBe(row.mass);
        expect(organUpkeep(o), `${kind}/${size}`).toBe(row.upkeep);
        expect(organAttack(o), `${kind}/${size}`).toBe(row.attack);
        // Вид без хвата не обзаводится им от ступени.
        if (ORGANS[kind].grip === undefined) expect(spec.grip).toBeUndefined();
        else expect(spec.grip).toBe(row.grip);
      }
    }
  });

  it("масса тела, hp узла, обмен, хват, площадь и бюджеты видят ступень", () => {
    for (const kind of SIZED_ORGANS) {
      if (!ORGANS[kind].mounts.includes("end")) continue;
      const bodies = ORGAN_SIZES.map((size) => withHand(sizedOrgan(kind, size)));
      const [small, normal, big] = bodies as [ReturnType<typeof human>, ReturnType<typeof human>, ReturnType<typeof human>];
      const row = (i: number) => ORGAN_SIZE_TABLE[kind][ORGAN_SIZES[i]!]!;

      // Масса тела.
      expect(mass(small), `${kind}: body mass`).toBeLessThanOrEqual(mass(normal));
      expect(mass(normal), `${kind}: body mass`).toBeLessThanOrEqual(mass(big));
      expect(mass(big) - mass(normal)).toBeCloseTo(row(2).mass - row(1).mass);

      // Hp узла, на котором сидит орган.
      const hp = (b: typeof small) => nodeHpMax(b.nodes[HUMAN_IDS.handL]!.size, b.nodes[HUMAN_IDS.handL]!.ends);
      expect(hp(small), `${kind}: node hp`).toBeLessThanOrEqual(hp(normal));
      expect(hp(normal), `${kind}: node hp`).toBeLessThanOrEqual(hp(big));

      // Обмен и бюджеты.
      expect(upkeep(small), `${kind}: upkeep`).toBeLessThanOrEqual(upkeep(big));
      expect(controlLoad(small), `${kind}: control`).toBeLessThanOrEqual(controlLoad(big));

      // Площадь для попадания: у узла с огромным органом доля блуждающего удара не меньше.
      const share = (b: typeof small) => derive(b).exposure.parts.find((p) => p.kind === "node" && p.id === HUMAN_IDS.handL)!.share;
      expect(share(normal), `${kind}: exposure`).toBeLessThanOrEqual(share(big));

      // Хват и опора: то, что сказала таблица, а не строка ORGANS.
      const cap = (b: typeof small) => capabilities(b).endings.find((c) => c.node === HUMAN_IDS.handL)!;
      if (ORGANS[kind].grip !== undefined) expect(cap(big).grip, `${kind}: grip`).toBeGreaterThanOrEqual(cap(small).grip);
      if (ORGANS[kind].stand !== undefined) expect(cap(big).stand, `${kind}: stand`).toBeGreaterThanOrEqual(cap(small).stand);

      // Кубик удара доходит до выкладки атак.
      if (row(2).attack !== "") {
        const dice = (b: typeof small) => derive(b).attacks.find((a) => a.node === HUMAN_IDS.handL)!.dice;
        expect(dieMean(dice(big)), `${kind}: attack die`).toBeGreaterThan(dieMean(dice(small)));
      }
    }
  });

  it("ступень переживает запись в текст и меняет хэш тела", () => {
    for (const kind of SIZED_ORGANS) {
      if (!ORGANS[kind].mounts.includes("end")) continue;
      for (const size of ORGAN_SIZES) {
        const b = withHand(sizedOrgan(kind, size));
        const back = bodyFromText(bodyToText(b));
        expect(back.nodes[HUMAN_IDS.handL]!.ends[0]!.size, `${kind}/${size} round-trip`).toBe(size === "normal" ? undefined : size);
      }
      const normal = withHand(sizedOrgan(kind, "normal"));
      const huge = withHand(sizedOrgan(kind, "huge"));
      expect(bodyHash(huge), `${kind}: the hash misses the size`).not.toBe(bodyHash(normal));
    }
  });

  it("огромный орган рисуется - и в спрайте, и в графе - крупнее обычного", () => {
    for (const kind of SIZED_ORGANS) {
      if (ENDING_SPRITES[kind] === undefined) continue;
      const pixels = (size: OrganSize) => {
        const f = renderPixels(withHand(sizedOrgan(kind, size)), { seed: 1, t: 0 });
        let n = 0;
        for (const v of f.cells) if (v !== 0) n += 1;
        return n;
      };
      expect(pixels("huge"), `${kind}: the sprite does not grow`).toBeGreaterThan(pixels("normal"));
      expect(pixels("normal"), `${kind}: the sprite does not shrink`).toBeGreaterThan(pixels("small"));
      const svgOf = (size: OrganSize) => silhouetteSvg(withHand(sizedOrgan(kind, size)), { organStamps: true }).length;
      expect(svgOf("huge"), `${kind}: the graph does not grow`).toBeGreaterThan(svgOf("normal"));
    }
  });

  /**
   * Ступень органа внутри головы видна снаружи, без рентгена: челюсть рисуется
   * линией рта по ширине ступени, а огромная вдобавок вытягивает всё лицо
   * (`headKindOf`). Три ступени задумывались как то, что видно: «малая» без
   * внешнего следа — половина работы, и `sprites.test.ts` ловит её как
   * «мутация не меняет картинку».
   */
  it("ступень органа в голове видна снаружи: все три кадра разные", () => {
    for (const kind of SIZED_ORGANS) {
      if (!ORGANS[kind].mounts.includes("head")) continue;
      const frames = ORGAN_SIZES.map((size) => {
        const b = human(400);
        const head = b.nodes[HUMAN_IDS.head]!.ends.find((e) => e.kind === "head")!;
        const inside = head.contents!.find((o) => o.kind === kind);
        expect(inside, `у человека нет органа ${kind} в голове`).toBeDefined();
        if (size !== "normal") inside!.size = size;
        // Рентген выключен: кадр снаружи, как его видит игрок.
        return renderPixels(b, { seed: 1, t: 0, insides: false });
      });
      for (let i = 0; i < frames.length; i++) {
        for (let j = i + 1; j < frames.length; j++) {
          expect(framesDiffer(frames[i]!, frames[j]!), `${kind}: ${ORGAN_SIZES[i]} и ${ORGAN_SIZES[j]} рисуются одинаково`).toBe(true);
        }
      }
    }
  });

  it("у каждой ступени, что каталог умеет выращивать, есть строка и название", () => {
    const grown = new Map<string, Set<OrganSize>>();
    for (const m of MUTATIONS) {
      const payload = m.payload as { ending?: { kind: string; size?: OrganSize }; organ?: { kind: string; size?: OrganSize } };
      for (const o of [payload.ending, payload.organ]) {
        if (o === undefined || o === null) continue;
        if (!(SIZED_ORGANS as readonly string[]).includes(o.kind)) continue;
        const set = grown.get(o.kind) ?? new Set<OrganSize>();
        set.add(o.size ?? "normal");
        grown.set(o.kind, set);
      }
    }
    // Клешня - та, с которой всё началось: обе ступени должны выпадать.
    expect([...(grown.get("pincer") ?? [])].sort()).toContain("huge");
    expect([...(grown.get("pincer") ?? [])].sort()).toContain("small");
    for (const [kind, sizes] of grown) {
      for (const size of sizes) expect(sizeSpec(kind as SizedOrganKind, size)!.ru.length, `${kind}/${size}`).toBeGreaterThan(0);
    }
  });

  it("каждый вид со ступенями встречается в каталоге хотя бы одной строкой", () => {
    const kinds = new Set<string>();
    for (const m of MUTATIONS) {
      const payload = m.payload as { ending?: { kind: string }; organ?: { kind: string } };
      for (const o of [payload.ending, payload.organ]) if (o !== undefined && o !== null) kinds.add(o.kind);
      for (const k of (m.target.endings ?? []) as string[]) kinds.add(k);
    }
    for (const kind of SIZED_ORGANS) expect(kinds.has(kind), `${kind} не встречается ни в одной строке каталога`).toBe(true);
  });

  it("ни один орган стартового человека не носит ступень: человек остаётся собой", () => {
    for (const o of organs(human())) expect(o.size, `${o.kind}`).toBeUndefined();
  });
});
