/**
 * Bodies with several brains for the property tests of step B: a population
 * body gets 1..6 brains by rebirth of endings into heads with a brain, by a
 * brain pushed into a head that had none, or by a brain in a torso cavity,
 * each with a random sway. Plus the named fixtures of body-graph.md §7.
 */
import { LabRng as Rng } from "../rng.js";
import {
  apply,
  bodyFromText,
  brainOrgan,
  brains,
  capacity,
  cavityLoad,
  nodeIds,
  organ,
  segmentIds,
  selfRef,
  targets,
  touch,
  type Body,
} from "../index.js";
import { randomBody } from "./gen.js";

/** A population body (same seed, same ops as `population`) with `1 + seed % 6` brains where the body allows. */
export function brainyBody(seed: number): Body {
  const body = randomBody(seed, 10 + (seed % 30));
  const rng = new Rng(`heads-${seed}`);
  const want = 1 + (seed % 6);
  for (let tries = 0; brains(body).length < want && tries < 60; tries++) {
    const sway = rng.int(0, 10);
    if (rng.next() < 0.15) {
      const torsos = segmentIds(body).filter((id) => {
        const s = body.segments[id]!;
        return s.kind === "torso" && cavityLoad(s) + 2 <= capacity(s);
      });
      if (torsos.length > 0) {
        body.segments[rng.pick(torsos)]!.cavity.push(brainOrgan(sway));
        touch(body);
        continue;
      }
    }
    const me = selfRef(body);
    const ends: { node: number; index: number }[] = [];
    for (const id of nodeIds(body)) {
      body.nodes[id]!.ends.forEach((_, index) => {
        if (me !== undefined && "node" in me && me.node === id && me.end === index) return;
        ends.push({ node: id, index });
      });
    }
    if (ends.length === 0) break;
    const e = rng.pick(ends);
    const ending = body.nodes[e.node]!.ends[e.index]!;
    if (ending.kind === "head") {
      ending.contents ??= [];
      if (!ending.contents.some((o) => o.kind === "brain")) {
        ending.contents.push(brainOrgan(sway));
        touch(body);
      }
      continue;
    }
    const payload = { ending: organ("head", [brainOrgan(sway), organ("eye")]) };
    const listed = targets(body, "rebirth", payload).some(
      (w) => "ending" in w.target && w.target.ending.node === e.node && w.target.ending.index === e.index,
    );
    if (listed) apply(body, "rebirth", payload, { ending: e });
  }
  return body;
}

/** 500 bodies with 1..6 brains. */
export function brainyPopulation(count = 500): Body[] {
  const out: Body[] = [];
  for (let seed = 1; seed <= count; seed++) out.push(brainyBody(seed));
  return out;
}

/**
 * The mutant from the Swamp, body-graph.md §7: a mouth on the left elbow, the
 * right hand reborn into a head on an arm thickened into a torso, a tentacle
 * from that head grown into the pelvis. Ids: nodes 1..8, segments 9..16.
 */
export const SWAMP = {
  head1: 1,
  chest: 2,
  pelvis: 3,
  elbow: 4,
  hand: 5,
  head2: 6,
  footL: 7,
  footR: 8,
  neck: 9,
  torso: 10,
  upperArm: 11,
  forearm: 12,
  torso2: 13,
  tentacle: 14,
  legL: 15,
  legR: 16,
} as const;

export function swampMutant(sway: number): Body {
  return bodyFromText(`
    голова1[2] {голова(мозг*, глаз, глаз, челюсть, ухо, нос)}
    грудь[3]
    таз[3]
    локоть[1]  {пасть}
    кисть[1]   {кисть}
    плечо2[2]  {голова(мозг${sway > 0 ? `!${sway}` : ""}, глаз)}
    стопа.л[1] {стопа}
    стопа.п[1] {стопа}

    голова1 -шея:1/1 кожа-                               грудь
    грудь   -корпус:2/3 кожа {сердце, лёгкие, желудок}-  таз
    грудь   -рука:1/1 кожа-                              локоть
    локоть  -рука:1/1 кожа-                              кисть
    грудь   -корпус:3/2 хитин {лёгкие, кишка}-           плечо2
    плечо2  -щупальце:3/1 присоски-                      таз
    таз     -нога:2/1 кожа-                              стопа.л
    таз     -нога:2/1 кожа-                              стопа.п
  `);
}

export const SWAMP_HEAD2 = { node: SWAMP.head2, end: 0 } as const;

/**
 * A chain: you - chest - pelvis - head A (sway 2) - head B (sway 5). Head A
 * owns the pelvis and itself, head B owns only itself: separating A also
 * drops B, which loses its path to you. Ids: nodes 1..5, segments 6..9.
 */
export function chain(): Body {
  return bodyFromText(`
    голова[2] {голова(мозг*)}
    грудь[3]
    таз[3]
    узелА[1] {голова(мозг!2)}
    узелБ[1] {голова(мозг!5)}
    голова -шея:1/1 кожа- грудь
    грудь -корпус:2/3 кожа {сердце}- таз
    таз -нога:2/1 кожа- узелА
    узелА -нога:2/1 кожа- узелБ
  `);
}

export const CHAIN = { head: 1, chest: 2, pelvis: 3, headA: 4, headB: 5, neck: 6, torso: 7, legA: 8, legB: 9 } as const;
