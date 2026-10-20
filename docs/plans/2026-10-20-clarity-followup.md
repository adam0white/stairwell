# Clarity follow-up: F-232

Spec: the three fixes in the coordinator's 2026-10-20 brief and
`human-framework/scratch/followups/brief-common.md`.

Done: the three UI changes pass tests, render at 360×690 with touch and
1280×800, ship on main, and the live release identifies the clean commit.
The coordinator accepts this round; the owner accepts game feel separately.

Keep the simulation, game edition, existing exports and exact HF 2.8.0 pin.
Use the current main checkout specified by the coordinator.

1. Capture the existing phone and desktop opening. Add an old-export fixture
   with full-state replay and continuation hashes before touching playback.
2. Add failing playback tests. Slow the first Monday bread window at the UI
   clock only, including walking. Show one effective rate and its reason.
   Restore the chosen speed when the bread is delivered or its window ends.
   Conversation and notebook inspection keep moving at their existing slow rate.
3. Add failing browser tests for complete task labels and deadlines, a labelled
   all-orders sheet, and a readable resident destination list with 44px targets.
   Keep the immediate task on the main screen; use the labelled sheets for the
   full lists. Do not rely on the miniature building to select a resident.
4. Reproduce the six-minute Derya wake window. Add a failing coordinate-tap test.
   Keep the selected person's conversation after departure, explain departure,
   disable unavailable actions, and require Close before showing destinations.
   Anchor the action row below a scrolling speech region. Preserve its DOM
   buttons through automatic updates so neither text nor new messages retarget
   an in-flight tap.
5. Run check, inspect phone/desktop renders, and get two independent reviews.
   Fix verified findings. Commit with the required trailer, push main, deploy,
   verify release.json and take a live phone screenshot. Record evidence in
   the requested follow-up report. No new simulation work is deferred.
