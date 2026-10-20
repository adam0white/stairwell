# Owner log layout follow-up, 2026-10-20

Request: [owner run `r-9m8bdyfbac`](owner-2026-10-20.md). Done for this change means more vertical log space at 360×780, 412×891 and 1440×900 CSS pixels, visible main controls, regression tests, and a clean deployed release matching the pushed commit. The owner accepts feel separately.

Reproduced the private replay through the headless simulation: 93 inputs, minute 1260, night phase, matching saved reports. Imported the same notebook through the browser's replay file input, stopping at minute 1254 to inspect its last conversation. The replay itself remains outside this repo and is not committed. No HANDOFF file existed when this task started; README and design.md supplied the repo context.

The original log rendered only four entries and occupied about 97px in this conversation. Its CSS capped height at 118px. Extra viewport height went to the action sheet.

The log now receives spare height and retains forty recent entries for scrolling. The action sheet takes its content height, with bounded scrolling for long notebooks and conversations. The building scales down slightly on shorter screens. Following the newest entry survives opening a taller panel; scrolling back keeps the reader's position.

Browser screenshots, with fonts loaded and the game clock held still:

| Viewport | Log height | Screenshot |
| --- | --- | --- |
| 360×780 | 206px | [Phone](log-layout-2026-10-20/360x780.png) |
| 412×891 | 360px | [Tall phone](log-layout-2026-10-20/412x891.png) |
| 1440×900 | 369px | [Desktop](log-layout-2026-10-20/1440x900.png) |

The speed buttons, notebook button, building, task board and main conversation actions fit at every size. Browser regression tests exercise a separate public seeded notebook with a full task board, scrolling history, and a long notebook panel. They check log height, control hit testing, bottom following, reading earlier entries, and access to notebook export. The original layout failed the height assertions at all three sizes. CI installs Chromium before running `npm run check`.

Two independent reviews caught a missing check for controls clipped by their scroll container and a bottom-following issue when panel height changed. Both are covered by the tests and corrected.

Hidden backstories with real outcomes, hidden achievements and unlockable story paths/events are recorded in [Deferred](../design.md#deferred) for 2026-11-03. No story mechanics, simulation rules, randomness or HF version changed.
