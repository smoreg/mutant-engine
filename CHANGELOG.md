# Changelog

## Unreleased

- Fix source-only workspace resolution in tests, examples and the lab; verify before building in CI.
- Reject invalid RNG ranges, dice and weights; never select zero-weight mutations or targets.
- Validate studio overrides and storage input before mutation or persistence.
- Decode HTTP UTF-8 once, limit request bodies and reject foreign-origin writes.
- Document the audit and the combat mechanics not yet implemented.

## 0.1.0

First public release. The API is wide and not yet stable; expect breaking changes before 1.0.

- `@mutant-engine/core`: bodies as multigraphs (nodes, segments, membranes, cavities) with a text format and a stable hash; growth operations; a mutation catalog with ceilings, displacement and spreading themes; needs that pull mutations; diet; injuries, bleeding, pain, breathing and acid; surgery (cut, excise, separate) with proven remedies (`diagnose`, `treatments`); turn-based combat with grips, bites and escapes; a bestiary of hand-drawn creatures at real sizes; a seeded generator (`LabRng`).
- `@mutant-engine/view`: one layout for graph and sprite, SVG silhouettes, pixel sprites at 32/64/96 px, a dependency-free indexed PNG encoder, wound tints.
- `apps/lab`: the studio used to build all of it — generator, lab, arena, bestiary, mutation editor, parts gallery, drag-and-drop body editor.

- Public module entries for body, mutations, combat, surgery, life, catalog, RNG and labels; `SeededRng` alias; per-call EN/RU labels.
- External tarball consumer test, NodeNext declarations check, integration guide and release archives.
- Updated development tools to patched versions; platform-independent example and cleanup scripts.
