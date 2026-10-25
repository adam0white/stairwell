# The Stairwell

You are the building’s caretaker at Lale Apartmanı, a seven-flat block with five occupied flats in Istanbul. Rıza left you his notebook. Deliver bread, shopping and parcels, do small jobs, and take down the bins through Saturday. On Sunday, residents vote on your tea money, the extra pay for your work.

[Play The Stairwell](https://stairwell.adamwhite.work).

## How to play

- Tap an order, a resident’s name or a place on the building to preview a trip. Choose **Go** to walk there. You pick up and deliver items automatically on arrival. You cannot turn back during a walk.
- Ask residents for news. Choose **Tell…** to repeat a story and say whether you are certain. You can also sit together or make up stories. Residents remember what you do and say. From Thursday, you can ask for support for your Sunday raise.
- Read the notebook and orders during play. **Clock speed** offers Automatic, Slow, Steady and Fast. Reading and conversation pause time; waiting orders slow it. The Game menu pauses play and offers Resume, Feedback, Full screen, All games, Recording and New game with confirmation.
- Your notebook saves in this browser’s local storage. **Continue** restores the saved week. New game replaces it after confirmation. The caretaker’s week does not advance while the game is closed.

## Recording, files and continuing people

Recording links recorded play across games on this device. The menu has one Recording switch. Feedback can include the available run when Recording is on or you choose Share; otherwise it sends the note, answer and optional name.

File controls require `?lab=1`. In **Feedback**, **Keep a copy of this run** downloads `stairwell-playtest.json`. The ending also offers **Download this run**. On the title page, **Lab tools → Load a playtest run** imports a file. The download contains the edition, seed, timed inputs, minute and continuity data, including pinned admitted state; it omits the derived `state` summary. It is not an ordinary Game menu export.

Current notebooks use edition `stairwell@9`. Older notebooks are refused with a start-fresh message. Current files replay under the current edition; importing a file does not grant ownership of a continuing person. Local continuation and cross-game admission retain their separate ownership and exact-parent checks. Native source admission supports only the exact edition8/engine2.21.0 and edition9/engine2.23.0 pairs, subject to its other guards. The current Hearsay garden does not provide a Derya return route. See [HF3 adoption](docs/hf3-adoption.md) and [cast adoption](docs/cast-adoption.md) for the bounded contracts and historical evidence.

## Framework and development

[Human Framework](https://github.com/adam0white/human-framework) supplies the simulated people: their beliefs, trust, relationships, memory and decisions. Stairwell supplies the building, errands, schedules, stories and consequences. Source pins `@adam0white/human-framework` exactly to `3.0.0` (engine `2.23.0`), with immutable lab client `0.4.10` and kit `0.5.11` artifacts. App version `0.1.0`, notebook edition9 and engine version are separate identifiers. The package requires TypeScript 7 or later; this repository uses `7.0.2`.

Use Node 24 or later with `/opt/homebrew/bin` first on PATH. `npm run dev` starts development. `npm run check:lane` runs lint, typecheck and tests. Wrap the full lane once with HF’s `scripts/suite-lock.ts`; Stairwell does not acquire that lock itself. `npm run measure` runs headless policies. `npm run deploy` checks, builds and deploys; follow [AGENTS.md](AGENTS.md) for delivery gates.

Design and open work: [docs/design.md](docs/design.md). HF requests: [docs/hf-requests.md](docs/hf-requests.md). Historical playtests: [docs/playtests/](docs/playtests/). Technical delivery does not establish owner acceptance. Owner review remains 2026-11-03.

MIT licence.
