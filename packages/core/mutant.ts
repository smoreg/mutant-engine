/**
 * The mutant from the Swamp, body-graph.md §7: a second head where the right
 * hand used to be, the right arm thickened into a torso, a tentacle grown into
 * the pelvis so the body closes into a cycle, a gill sheet on that cycle.
 * Written with ids fixed by the fixture order, like the human.
 */
import type { Body } from "./graph.js";
import { touch } from "./graph.js";
import { bodyFromText } from "./text.js";

export const SWAMP_MUTANT_TEXT = `мясо 220
следующий 18

# узлы: id[размер] {окончания}; * — твой мозг
1[2] {голова(мозг*, глаз, глаз, челюсть, ухо, нос)}
2[3]
3[3]
4[1] {пасть}
5[1] {кисть}
6[2] {голова(мозг, глаз)}
7[1] {стопа}
8[1] {стопа}

# сегменты: id: узел -вид:длина/обхват покров {полость} [наросты]- узел
9: 1 -шея:1/1 кожа- 2
10: 2 -корпус:2/3 кожа {сердце, лёгкие, желудок}- 3
11: 2 -рука:1/1 кожа- 4
12: 4 ~рука:1/1 кожа~ 5
13: 2 ~корпус:3/2 хитин {лёгкие, кишка}~ 6
14: 6 ~щупальце:3/1 присоски~ 3
15: 3 -нога:2/1 кожа- 7
16: 3 -нога:2/1 кожа- 8
`;

/** Ids fixed by the fixture above; 17 is the gill membrane. */
export const SWAMP_IDS = {
  head: 1,
  chest: 2,
  pelvis: 3,
  elbow: 4,
  hand: 5,
  shoulder2: 6,
  footL: 7,
  footR: 8,
  neck: 9,
  torso: 10,
  armUpper: 11,
  armLower: 12,
  torso2: 13,
  tentacle: 14,
  legL: 15,
  legR: 16,
  gill: 17,
} as const;

/** The mutant with its gill sheet on the cycle chest - shoulder2 - pelvis, area 8. */
export function swampMutant(): Body {
  const body = bodyFromText(SWAMP_MUTANT_TEXT);
  body.membranes[SWAMP_IDS.gill] = {
    id: SWAMP_IDS.gill,
    kind: "gill",
    cycle: [SWAMP_IDS.torso2, SWAMP_IDS.tentacle, SWAMP_IDS.torso],
    area: 8,
  };
  touch(body);
  return body;
}
