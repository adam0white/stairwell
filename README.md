# The Stairwell

You are the new kapıcı (live-in caretaker) of Lale Apartmanı, a seven-flat block in Istanbul. Bread, bins, parcels and five flights of stairs. The residents tell you things, and you decide what to pass on. On Sunday they vote on your tea money.

Play: https://stairwell.adamwhite.work

Built on [Human Framework](https://github.com/adam0white/human-framework) (`@adam0white/human-framework`, pinned exactly): every resident is an HF person whose beliefs spread on the stairs, weighted by how far they trust whoever told them.

- `npm run dev`, `npm run check` (lint, typecheck, tests), `npm run measure` (headless policies over many seeds), `npm run deploy`.
- Design and the cravings map: [docs/design.md](docs/design.md). Requests to HF: [docs/hf-requests.md](docs/hf-requests.md). Playtests: [docs/playtests/](docs/playtests/).
- The save is the seed plus the input log. The Game menu exports a playtest file that replays the run exactly.
- Browser layout tests run with `npm run check`; install their browser once with `npx playwright install chromium`.

MIT licence.
