# The Stairwell

You are the building’s caretaker at Lale Apartmanı, a seven-flat block with five occupied flats in Istanbul. Rıza left you his notebook. Deliver bread, shopping and parcels, do small jobs, and take down the bins through Saturday. On Sunday, residents vote on your tea money, the extra pay for your work.

[Play The Stairwell](https://stairwell.adamwhite.work).

## How to play

- Tap an order, a resident’s name or a place on the building to preview a trip. Choose **Go** to walk there. You pick up and deliver items automatically on arrival. You cannot turn back during a walk.
- Ask residents for news. Choose **Tell…** to repeat a story and say whether you are certain. You can also sit together or make up stories. Residents remember what you do and say. From Thursday, you can ask for support for your Sunday raise.
- Read the notebook and orders during play. **Clock speed** offers Automatic, Slow, Steady and Fast. Reading and conversation pause time in the default week and slow it in the optional month; waiting orders slow it. The Game menu pauses play and offers Resume, Feedback, Full screen, All games, Recording and New game with confirmation.
- Your notebook saves in this browser’s local storage. **Continue** restores the saved week or month. New game replaces it after confirmation. The caretaker’s week does not advance while the game is closed.

The new-game option **Play four weeks, ending with a vote on whether you stay.** starts
unchecked. It selects the optional month, including private work, a storm, Sunday seating,
sealed-parcel custody and private dues payments. Invitations need the people’s agreement;
parcel handovers need an actual trip and both people’s consent. Dues payments transfer
actual cash before reporting payment. Four weeks end with a vote on renewing your work.

## Recording, files and continuing people

Feedback offers **I'm stopping** and **I'm confused**. Choosing or clearing one sends
nothing and leaves your edited note intact. **Submit** includes the selected words,
optional verdict and current note.

Recording links recorded play across games on this device. The menu has one Recording switch. Feedback can include the available run when Recording is on or you choose Share; otherwise it sends the note, answer and optional name.

File controls are public. The Game menu and ending offer **Download this run**. Feedback offers **Keep a copy of this run**. On the title page, **Other ways to begin → Play a saved file** opens the isolated `/file/` page. File play never replaces the local notebook or changes shared people. Its complete download preserves source bytes, replay state and provenance. Cancel or an invalid file keeps the current file run available. Native downloads contain the edition, seed, timed inputs, minute and pinned continuity data; they omit the derived `state` summary. **Other ways to begin** also exposes eligible morning returns and accepted local recovery copies. All menu diagnostics live in one closed **Debug** item beside **Lab privacy**.

Default-week notebooks use `stairwell@9`; the optional month uses `stairwell@11`. Intermediate whole-game edition10 and older unsupported notebooks are refused with a start-fresh message. Current files replay under their recorded supported edition; importing a file does not grant ownership of a continuing person. Local continuation and cross-game admission retain their separate ownership and exact-parent checks. Finite actor admission supports source edition8/engine2.21.0 and editions9–11/engine2.23.0, subject to its other guards. Actor admission of an edition10 calendar is distinct from replaying an edition10 game. Other hosts need actual edition11 receiving evidence before claiming support. The current Hearsay garden does not provide a Derya return route. See [HF3 adoption](docs/hf3-adoption.md) and [cast adoption](docs/cast-adoption.md) for the bounded contracts and historical evidence.

## Framework and development

[Human Framework](https://github.com/adam0white/human-framework) supplies the simulated people: their beliefs, trust, relationships, memory and decisions. Stairwell supplies the building, errands, schedules, stories and consequences. Source pins `@adam0white/human-framework` exactly to `3.0.0` (engine `2.23.0`), with immutable lab client `0.4.11` and kit `0.5.12` artifacts. App version `0.1.0`, notebook editions9/11 and engine version are separate identifiers. The package requires TypeScript 7 or later; this repository uses `7.0.2`.

Use shared Node 26.12.0 (`.node-version` and `.nvmrc`) with `/opt/homebrew/bin` first on PATH and pnpm 12.14.0. Install with `pnpm install --frozen-lockfile`. `npm run dev` starts development. `npm run check:lane` runs lint, typecheck and tests. Wrap the full lane once with HF’s `scripts/suite-lock.ts`; Stairwell does not acquire that lock itself. `npm run measure` runs headless policies. `npm run deploy` checks, builds and deploys; follow [AGENTS.md](AGENTS.md) for delivery gates.

Design and open work: [docs/design.md](docs/design.md). HF requests: [docs/hf-requests.md](docs/hf-requests.md). Historical playtests: [docs/playtests/](docs/playtests/). Technical delivery does not establish owner acceptance. Owner review remains 2026-11-03.

MIT licence.

Dependency changes use pnpm and the committed `pnpm-lock.yaml`. The npm lock was imported with exact dependency versions preserved. Do not regenerate an npm lock or install a separate runtime per worktree. The pnpm policy uses strict engines/peers, no hoisting, hardlinks, a 24-hour third-party release delay and a scoped exemption for owned `@adam0white/*` packages.
