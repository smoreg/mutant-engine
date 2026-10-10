/**
 * The starting body: a human from the surface, body-graph.md §2 with the
 * numbers of body.md §8. MEAT 100, UPKEEP 20, CONTROL 10 of 10, BULK 3,
 * cavity 30. No cycles: a tree, the plain case of a graph. The chest holds
 * the neck and the torso; shoulders and hips are side nodes of the torso
 * (flank.ts), four of the four its girth allows: shoulders big joints (3),
 * hips medium (2), the neck node and the pelvis small (1). Arms and legs bend
 * at elbows and knees; the penis hangs from the pelvis, a small limb with no
 * joint at its tip. MEAT 101: the penis weighs 1.
 */
import type { Body } from "./graph.js";
import { bodyFromText } from "./text.js";

export const HUMAN_TEXT = `мясо 101
следующий 32

# узлы: id[размер] {окончания}; * — твой мозг
1[2] {голова(мозг*, глаз, глаз, челюсть, ухо, ухо, нос)}
2[1]
3[1]
4[1] {кисть}
5[1] {кисть}
6[1] {стопа}
7[1] {стопа}
14[3]
15[3]
16[2]
17[2]
22[1]
23[1]
24[1]
25[1]
26[1]

# сегменты: id: узел -вид:длина/обхват покров {полость} [наросты]- узел
8: 1 -шея:1/1 кожа- 2
9: 2 -корпус:2/3 кожа {сердце, лёгкие, желудок}- 3
10: 14 -рука:1/1 кожа- 22
11: 15 -рука:1/1 кожа- 23
12: 16 -нога:1/1 кожа- 24
13: 17 -нога:1/1 кожа- 25
18: 2 ~бок:0/1 кожа~ 14
19: 2 ~бок:0/1 кожа~ 15
20: 3 ~бок:0/1 кожа~ 16
21: 3 ~бок:0/1 кожа~ 17
27: 22 -рука:1/1 кожа- 4
28: 23 -рука:1/1 кожа- 5
29: 24 -нога:1/1 кожа- 6
30: 25 -нога:1/1 кожа- 7
31: 3 -член:1/1 кожа- 26
`;

/** Ids fixed by the fixture above. */
export const HUMAN_IDS = {
  head: 1,
  chest: 2,
  pelvis: 3,
  handL: 4,
  handR: 5,
  footL: 6,
  footR: 7,
  neck: 8,
  torso: 9,
  armL: 10,
  armR: 11,
  legL: 12,
  legR: 13,
  shoulderL: 14,
  shoulderR: 15,
  hipL: 16,
  hipR: 17,
  flankShoulderL: 18,
  flankShoulderR: 19,
  flankHipL: 20,
  flankHipR: 21,
  elbowL: 22,
  elbowR: 23,
  kneeL: 24,
  kneeR: 25,
  penisTip: 26,
  forearmL: 27,
  forearmR: 28,
  shinL: 29,
  shinR: 30,
  penis: 31,
} as const;

/** A fresh human. `meat` above 101 leaves room to grow; the human itself is exactly full. */
export function human(meat = 101): Body {
  const body = bodyFromText(HUMAN_TEXT);
  body.meat = meat;
  return body;
}
