# Integrate the engine in a game

The simulation owns body mechanics, not your game loop. It does not require the
lab, a renderer, a map, a web server, React, an ECS or a database. A game chooses
when to mutate, advance time, feed a creature, operate or start a battle.

## Install from the release

Download **both** package tarballs from the GitHub release, then install them together:

```sh
npm install ./mutant-engine-core-0.1.0.tgz ./mutant-engine-view-0.1.0.tgz
```

For simulation alone, install only the core tarball. The packages are ESM with
TypeScript declarations. Node 22.13+ is required for development; the simulation
and view also bundle for browsers. GitHub publication does not imply npm registry
publication. No private dependency or neighbouring repository is required.

## Public entry points

| Import | Purpose |
|---|---|
| `@mutant-engine/core/body` | Graph construction, human fixture, serialization, validation, stats |
| `@mutant-engine/core/mutations` | Grow, mutate, needs, diet, spread |
| `@mutant-engine/core/combat` | Battle, policies, strikes, wounds, manual combat |
| `@mutant-engine/core/surgery` | Cuts, operations, diagnosis and proposed treatments |
| `@mutant-engine/core/life` | Time, food and hunger |
| `@mutant-engine/core/catalog` | Starter mutation rows and creatures |
| `@mutant-engine/core/rng` | `SeededRng` and the minimal `Rng` interface |
| `@mutant-engine/core/labels` | Optional English/Russian labels |
| `@mutant-engine/view` | Optional sprite, SVG and PNG output |

The root core entry remains available for compatibility. Only listed package
entries are supported; do not import `dist/` or internal source paths. These are
organizational boundaries, not promises of separate runtime chunks.

## Your own mutation selection

```ts
import { human, derive } from '@mutant-engine/core/body';
import { applyMutation, drawMutation } from '@mutant-engine/core/mutations';
import { MUTATIONS } from '@mutant-engine/core/catalog';
import { SeededRng } from '@mutant-engine/core/rng';

const body = human();
const rng = new SeededRng('my-game:creature-42');
// A per-game selection: do not mutate the shared starter catalog in place.
const rows = MUTATIONS.filter(row => row.family === 'limbs');
const row = drawMutation(rows, rng, { body });
if (row) applyMutation(body, row, rng);
const stats = derive(body);
```

You may supply your own rows using the exported `Mutation` type and existing
operations/organ kinds. **0.1 does not provide a plug-in registry for arbitrary
new organ kinds.** Those require changing core tables and the derived rules;
new artwork also requires view changes. The starter rules include a human
baseline, biological assumptions and balance constants. This is a reusable
creature engine, not a configurable simulator of every possible biology.

## Time and saves

Create a wound record with `newHarm(body)` from the combat entry and call
`elapse(body, rng, { harm, rest: true })` from the life entry **once per simulation
turn**. A turn is not a millisecond or an automatic real-time timer. With no
`harm` record, the function does not perform the full healing/food lifecycle.
Battle already advances its own turns; do not advance them a second time in the
host loop. The host decides what one simulation turn means for its game.

Mutators update their input body. Use `cloneBody` when previewing a change. Use
public mutation functions rather than editing graph fields behind versioned
caches. Save `bodyToText(body)`, the separate harm record, and `rng.state`; restore
with `bodyFromText(text)` and `new SeededRng(savedState)`. Also save your game's
state and a format/engine version. Body text alone does **not** save a running
battle. Cross-version replay and save compatibility are not guaranteed in 0.1.

## Language and rendering

Mechanics use ids and numbers. `mutationLabel(id, 'en')` and
`mutationDescription(id, 'en')` read English catalog text; `'ru'` selects Russian.
`organKindLabel`, `segmentLabel` and `coverLabel` provide optional labels. English
part labels are derived from identifiers. Games can replace them with their own
localization tables. Legacy surgery prose and the development lab remain Russian;
use structured operation data for a game's own interface.

Rendering is optional. The view consumes the same body as the simulation. It
returns frames, strings or bytes; the host chooses Canvas, an image, an engine
texture, a file or a response. No UI framework is required.

## Compatibility check

`npm run test:package` builds and packs both packages, installs them in a new
external directory, runs a deterministic creature through serialization, diagnosis
and rendering, checks the installed declarations using TypeScript NodeNext, and executes a browser bundle without Node globals or DOM.
CI runs this in addition to source tests. This catches workspace-only imports and
missing published files that source tests cannot detect.

## Invalid random weights

Random selection requires finite, nonnegative weights. `SeededRng.weighted`
throws `RangeError` for an empty distribution, zero total, overflow or invalid
weights. `drawWeighted` and `drawMutation` return `null` without consuming RNG
when the total is zero; invalid weights throw `RangeError`. Catalog rows require
a finite positive `chance`. Integer ranges and dice counts must be safe integers;
invalid arguments are rejected before the generator advances.
