# Rolling log scroll fix, 2026-10-20

Review finding on `69c3055`: replacing a full log's DOM preserved numeric scroll position while removing entries above the reader.

Done means anchoring the entry being read by `Said.n` and restoring its viewport offset, falling back to the oldest surviving entry when that entry is removed, and continuing to follow arrivals at the newest end. Delivery requires a DOM regression test, passing `npm run check`, a signed commit pushed on the current branch, and deployment through the repo script with live `/release.json` matching that commit and `dirty: false`. The owner accepts feel separately.

Read the owner's [verbatim notes](owner-2026-10-20.md), README and design. No HANDOFF file exists. Replayed private run `r-9m8bdyfbac` headlessly: 93 inputs, minute 1260, night phase, matching saved reports. Imported its inputs through minute 1254 through the browser replay input to inspect the last conversation. The private replay remains outside this repo and unmodified.

Before the fix, adding one simulation entry to the full log at 360×780 kept `scrollTop` at 180px but shifted the entry being read by 41.1875px. After the fix, the same `Said.n` retained its viewport offset within 0.1875px (browser scroll rounding).

The renderer captures the first visible entry before changing layout or replacing DOM. Each entry carries its existing `Said.n` in a DOM attribute. The renderer restores that entry's viewport offset, or scrolls to the oldest survivor if it was removed. Newest-end following remains automatic. This also covers full day-view replacement.

DOM regressions use a public seeded notebook and real simulation arrivals. They cover phone and desktop, single and batched arrivals, incremental and full renders, entry identity, removal fallback and newest-end following. They exposed the original shift and fallback failure. Independent review caught test geometry changing before fonts loaded and cumulative scroll rounding in repeated full-render assertions; the tests now wait for fonts and exercise batches with one render. `npm run check` passes all 22 tests.

No new deferrals. Existing story expansion remains in [Deferred](../design.md#deferred), target 2026-11-03. No UI counters, simulation rules, RNG, dependencies or HF version changed.
