# How the model works

This is the short English map of the model. The full reasoning, with every
decision numbered, is the Russian design log in [docs/ru/body-graph.md](ru/body-graph.md);
comments in the code cite those numbers.

## The body is a graph

A `Body` is a multigraph:

- **nodes** — joints and tips. A node can carry **endings**: organs at the tip (a hand, a jaw, an eye).
- **segments** — the edges: limbs, necks, tails and torsos. A segment has a kind, a length, a girth,
  a **cover** (skin, scales, plates, fur...), **growths** on its surface and, for torsos, a **cavity**
  holding organs (lungs, heart, gut, a brain).
- **membranes** — sheets stretched between segments (wings, webbing, sails).
- Torso tiers (limb → small → human → bull → elephant → whale) decide where flank places sit and how much
  a body weighs. Shoulders and hips hang on zero-length "flank" edges, so a big torso has room for many
  limbs that never collapse into one point.

Ids only grow and every change bumps `version`; caches key on it. `bodyToText` / `bodyFromText` round-trip
exactly, and `bodyHash` (FNV-1a) names a body — fixtures and snapshots are built on both.

## Growth and mutation

Mutations are **data**: rows in `content/mutations.ts` with a family, a target, an operation and a weight,
plus their RU·EN text in `content/i18n.ts`. Applying one runs **growth operations** on the graph
(add a limb, add an organ, change a cover, stretch a membrane...). On top of that:

- a **ceiling**: the skeleton carries only so much flesh; a mutation past it displaces something or fails;
- **spreading**: covers and themes creep over neighbouring segments with time;
- **needs**: what the body lacks (air, food, grip) pulls the next mutation toward it;
- **diet**: eaten parts temporarily raise the odds of growing the same parts;
- **alienness**: one general distance of the body from the human baseline — no per-family thresholds.

All randomness is an `Rng` (`{ next(): number }`) passed in. `LabRng` is a seeded sfc32 with
`int/pick/chance/weighted/shuffle/fork`; its state is four words you can save and resume.

## Derived stats

`derive(body)` computes everything a game asks, from the graph alone:

- **mass** by cross-section of every segment (length × girth²), plus membranes;
- **speed** = stride × burden: what pushes the body (legs, tentacles, a crawling belly) against what it carries;
  climbing, digging and swimming by the same rule — thrust against weight, no per-creature constants;
- **grips**, precise grips and **reach** from limbs and their endings;
- **senses** only count where a brain reaches them through the graph;
- **control**: brains give channels, parts cost load; a brain's distance tax counts from the nearest living
  brain, and a nerve cord steers its torso chain;
- **breathing**: lungs, tracheae and gills give intake; brains, hearts and mass ask a base; effort spends
  a tank and raises acid.

## Life: one clock

Time passes through one function: bleeding and clotting, healing, hunger and its reserve, covers
spreading, pain decaying, acid clearing, suffocation. A game calls it with the minutes that passed.

Pain is relative to the body, burns from acid and wounds, and taxes control: a body in enough pain
stops obeying itself.

## Surgery

`anatomy(body)` names the parts; `operationsFor(body, part)` lists what the knife can do to one
(remove the whole part, excise an organ, cut a segment, strip a mutation). Cuts leave wounds and
stumps. A part with its own brain can be separated into a creature of its own.

`diagnose(body, harm?)` lists the body's problems with a severity (the weight of a need times the
share of it unmet), the numbers behind it, the culprit parts and the cause chain
(out of control ← pain ← acid ← not enough air). `treatments()` tries every operation on a copy and
offers only those that lower the problem without making the whole body worse.

## Combat

`runBattle(setup, rng)` is turn-based and deterministic per seed. Strikes come from the body's parts:
force grows with the mass behind a blow, swing time with the limb's length (a pendulum, not mass).
Covers hold by blow type; a blow a cover holds entirely does nothing. Hit points live per section.
Grips squeeze each body turn; a holding bite needs jaws heavier than a human's; a held body tears
loose by its heaviest pull against the mass that holds it. How many fighters can reach one target is
set by the target's size. Policies (`aimPolicy(AIMS.*)`) choose targets.

## View

`@mutant-engine/view` lays a body out once and draws it two ways from that one layout — a graph
diagram and a pixel sprite — so a limb attaches at the same place in both. `renderPixels` gives an
indexed frame; `framePng` encodes it without a DOM; `silhouetteSvg` and the wound tints are plain strings.

## The lab

`apps/lab` is the tool the model was built with: a batch generator, a step-by-step lab with history,
an arena for two creatures or one exact blow, the bestiary, a mutation table editor, a gallery of
every part, and a drag-and-drop body editor. `npm run studio` serves it with a SQLite store;
`npm run lab` builds it into one offline HTML file.
