# Historical Stairwell

This private workspace preserves source329919a and its exact HF3.0.0/client0.4.15/kit0.5.17 dependencies. The current app uses published HF4.6.0. It does not import these actors or expose a legacy Person facade.

The package exports only finite JSON source verification/replay and the unmounted aligned-visit prototype. `src/sim/game.ts`, `cast-life.ts`, `one-cast.ts`, `people.ts`, `month.ts`, `rng.ts` and `stories.ts` match329919a byte for byte. `aligned-visit.ts` has the documented artifact boundary change. The finite2.21/2.23 native readers live in the package entry point.

Historical simulation tests remain default Vitest tests here. Their imports resolve this workspace's exact historical dependencies. Browser test originals are retained under `test/browser-reference` as source references. They do not run automatically or launch an isolated browser. Current file/save controls exercise native complete checkpoints and explicit old-save refusal. The actual current UI journey requires the shared existing Chrome profile and its browser lease.

These readers preserve old evidence. They do not make an incomplete old passport a retained-memory transfer and do not grant ownership from a file.

The historical UI test dependency `local-persona.ts` is also retained byte for byte from329919a. Its own workspace resolves the original SDK; it is not imported by the current app.
