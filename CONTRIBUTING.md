# Contributing

- `npm install`, then `npm test` and `npm run typecheck` must stay green. `npm run bench` runs the slow soak and balance measurements.
- The model stays pure: no DOM, no `Math.random`, no `Date.now` inside `packages/core` (a test enforces it). All randomness goes through an `Rng` (`{ next(): number }`) passed in.
- Content is data: a new mutation is a row in `packages/core/content/mutations.ts` plus its RU·EN text in `content/i18n.ts`; `checkMutations` and the content tests catch a missing half.
- A rule that changes behaviour comes with a property test over the bestiary and random mutants (`packages/core/tests/gen.ts`), not a single example.
- Code and comments are in English. The design log in `docs/ru/` is in Russian; decisions cited in comments by number live there.

Before a release, run `npm run test:package`: this installs the actual archives outside the workspace and checks Node, browser bundling and TypeScript consumers. Use Node 22.13 or newer. Do not publish from source-test results alone.
