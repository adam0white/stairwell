> Current edition: see [canonical adoption](cast-adoption.md). The historical consults, measurements and earlier-edition receipts below retain their original cast and are not current cast evidence. Edition7 has five occupied flats.

# The Stairwell: design

**One line.** You are the new kapıcı (live-in caretaker) of Lale Apartmanı, a seven-flat block in Moda, Istanbul. Rıza Efendi, the old kapıcı, retired to his village and left you his notebook. The work is bread, bins, parcels and stairs. The residents also tell you things. On Sunday they vote on your tea money.

**Done for the first playable** (set 2026-10-19 by the coordinator's brief; the owner accepts feel separately): one week (six days and a Sunday meeting) with three resident arcs; residents as HF 2.8.0 people whose beliefs spread on the stairs; a notebook that is the save; a playtest export that replays; tests, a headless measure and `npm run check`; live at https://stairwell.adamwhite.work; at least four source-unread playtests and the HF-character harness, recorded verbatim, with two rounds of iteration.

## Psychology first (2026-10-19)

The owner's direction: start from "what players crave and what keeps them coming back for more". A research brief (sonnet, sourced; verified items marked in the brief) gave these anchors:

- **Self-determination theory** (Ryan, Rigby and Przybylski 2006): autonomy and competence predict enjoyment and return; relatedness is shown in multiplayer and only inferred for solo play, where characters who respond may supply it.
- **Ethical variable reward:** surprise that comes from the simulation, free of payment, scarcity or loss of access (Zagal, Björk and Lewis 2013 catalogue the dark versions: playing by appointment, grinding, punishing absence).
- **Curiosity gaps** (Loewenstein 1994): curiosity is strongest when you already know part of the answer. End a session on a specific open question. The Zeigarnik memory effect is weakly replicated; the Ovsiankina urge to resume is the safer claim.
- **Endowed progress** (Nunes and Drèze 2006): a collection that starts partly filled, for a stated reason, is completed more.
- **Benign violation** (McGraw and Warren 2010): a violation is funny when it is also safe: weak commitment to the norm, distance, or an alternative norm that makes it fine.
- Weakly supported, treated as hypotheses for playtests: "one more turn" from overlapping goals; Wordle's grid as the cause of sharing.

## How it was chosen

Three concepts were written (kept below) and sent with the engine summary and the owner's taste and nothing else to three consultants who did not read any source.

- **Game-design expert (Opus):** picked A. "You carry every belief from one door to the next, so the engine's main feature (belief spreading, trust and conscience) becomes the player's verb, not something that happens in the background." Delete B: "Papers, Please with softer rules … the opposite of open play." Biggest risk: the player cannot see why a story spread, so it feels random; the fix is the evening stairwell as a readable scene plus Rıza's margin notes. Price the edge three ways: exposure depends on who meets on the stairs, residents with firm consciences are dead ends, and a feud you start takes over the meeting. "Let one prank in ten turn out kindly."
- **Player-psychology expert (Sonnet):** picked A (scores in the table below). "The only concept where the engine's distinctive feature … is the main thing the player manipulates. The people also persist." Risks: streak pressure and slot-machine tips. Avoid with: no time passes while away, no login reward, every reward has a visible cause. Keep mischief benign: no prank with a serious victim ("a false illness or a false affair"), reversible by evening or the next day, the victim reacts in character, and honest service must be a viable winning strategy.
- **Wildcard (Haiku, a former Istanbul estate agent turned taxi dispatcher):** picked A ("my old life with the furniture moved"); would never open C ("I already run a booking desk"). Phone-down list: a score or a red number in the first two minutes, a lecture on time management, a loading tip. Naughtiest move: tell flat 5 the jeweller's parcel is a present for them and wait on the stairs. Wants Rıza's margin note to say "I did the same in 1994." Wild idea: a rainstorm that traps everyone under one awning.

**Pick: A, The Stairwell.** All three chose it independently. It is the one concept where HF's testimony, source trust, reputation and conscience are the player's verbs. The cast is fixed, so lies come back. It has the classic time-management shape the owner liked in The Pass (bread rush, stairs, colliding requests) with the twist that every errand is also a doorway.

| Craving (psych consult, 1 to 5) | A   | B   | C   |
| ------------------------------- | --- | --- | --- |
| Autonomy                        | 5   | 3   | 4   |
| Competence                      | 3   | 4   | 4   |
| Relatedness                     | 5   | 3   | 3   |
| Ethical variable reward         | 5   | 3   | 4   |
| Curiosity gap                   | 5   | 4   | 3   |
| Story to finish                 | 5   | 3   | 3   |
| Mischief as benign violation    | 5   | 3   | 3   |

## Cravings map

| Craving                            | Mechanic that serves it                                                                                                                                                   | HF faculty                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Autonomy                           | Route and order of errands; at each door, keep, pass on, make it certain, or make something up; pranks; asking favours that a resident may refuse                         | `predict`/`decide` with the kapıcı as a voice; the player's words as `told` percepts |
| Competence                         | Batch errands to spare your knees; learn who passes things on, who trusts you, who meets whom on the stairs; your word gets heavier as true things you said are confirmed | body and fatigue store; `memory.sourceTrust` moved by `confirm`                      |
| Relatedness                        | The same seven households every day; they remember what you did for them and what you said; small kindnesses (Tarık's shopping) are noticed                               | relationships, `socialEvent`, reputation beliefs about the kapıcı                    |
| Variable reward, ethical           | Tips, börek and votes vary with trust, timing and what someone wanted to hear; every one has a cause written in the notebook; no login reward, no random bonus            | relationships and beliefs; host tips from them                                       |
| Curiosity gap                      | Who is the man at Derya's at night? What is in the jeweller's parcel? Rıza's margin notes hint at what you have not seen                                                  | resident beliefs, told to you through `converse`                                     |
| Mastery curve                      | Day 1: few requests and your word weighs nothing. By Friday: routes, trust and who-talks-to-whom                                                                          | source trust starts low for a stranger                                               |
| Collection and completion          | The notebook's secrets page (Rıza filled the first entries, so it starts partly filled); stamps for kind and naughty deeds                                                | the kapıcı's own beliefs are the notebook                                            |
| A story to finish                  | Three arcs through the week (the ring, the boiler fund, the late visitor) and the Sunday vote                                                                             | arcs are host events; outcomes are residents' own decisions                          |
| One more day                       | Each night page ends on one open question (the next day's first knock, a half-heard line)                                                                                 | host                                                                                 |
| Low-friction sessions              | One day is about four minutes; the notebook saves at every page; nothing happens while you are away                                                                       | seed and input log                                                                   |
| Daily return without dark patterns | The building waits for you; no streaks, no decay for absence, the vote counts days played, not calendar days                                                              | host rule                                                                            |
| Mischief as play                   | Gossip, stretching a story, making one up, misdelivering a parcel, swapping newspapers, letting the stray cat in                                                          | `converse` (backbiting tag, deceit), source trust, `confirm`                         |
| Social comparison                  | A spoiler-free share line of your week (tips, secrets found, times caught, the vote)                                                                                      | host                                                                                 |

## The edge: a bit fun, slightly in our calculations

- Telling someone a story they want to hear (bad news about someone they dislike, good news about someone they like) pleases them: affection and sometimes a tip or börek. This is the reward.
- The price is natural. Residents compare notes on the stairs: if two people you told opposite things talk, both catch you, believe the kapıcı is dishonest, and your word weighs less with them; the belief then spreads like any other. When a truth comes out (the ring is given, the fund book is opened at the meeting), HF's `confirm` recalibrates every source that told it wrong, you included.
- Residents who hold "don't talk behind people's backs" firmly do not repeat your story (HF withholds backbiting by their own held norm). They are dead ends for a rumour, not traps.
- Nothing is lost for good: trust rebuilds as true things you said are confirmed. Exposure is never game over.
- Benign by construction: the player can make up only domestic traits (stingy, nosy, lazy, kind, generous, sweet on someone single). No illness, no affair, no debt, nothing about anyone's faith. Pranks resolve by the next day.
- Measured: `npm run measure` plays honest, gossip and liar policies over many seeds; the edge should pay a little more in the short run and cost something by Sunday.

## Core loop (as built, 2026-10-19)

- **The day (07:00 to 21:00).** The board lists the day's errands: bread from the bakery by about 08:00, newspapers, shopping, parcels, small jobs, bins at 20:00. You choose the order and the route. Stairs cost minutes, and the kapıcı's legs tire (HF body and fatigue store); a "legs" line on each errand comes from `bodyForecast` over the next errands.
- **Every errand is a door.** When a resident is face to face, the clock slows to 0.6 game minutes per second. You can ask for news, pass on anything in your notebook (as hearsay or "for certain"), make something up, or, from Thursday, ask for a word at Sunday's meeting.
- **Delivery.** Shopping can hang on the door handle. Parcels and jobs need someone home. Late errands get a late line and no tip.
- **The building talks without you.** Residents choose their own free time through HF: the step, the shop, a visit. Nermin on the ground floor is the hub. People who meet relay what they believe through `converse`; you overhear it if you are near.
- **Sit a minute.** Once a day with each resident: ten minutes off your legs and one of their stories, told in order through the week.
- **The night page.** It shows the day's jobs and tips, each resident's worded read of you (warmth and whether they take your word), and Rıza's margin note. It ends on an open question.
- **Sunday.** Each resident votes on your tea money with HF `decide`. A vote for you weighs gratitude for service and whether they believe you are honest and reliable. A promise given for a word can be withdrawn on the night before if the person now believes you are dishonest; the withdrawal is said in the journal. On Saturday night Rıza's margin note counts the likely hands.

## How exposure works

- **Caught by comparison.** If you told two people opposite things and they meet, both catch you. They believe the kapıcı is dishonest, and your word weighs less with them. That belief then spreads like any other.
- **Caught by the truth.** When a fact comes out (the ring is given, the fund book is opened), HF `confirm` lowers trust in every source that told it wrong, you included.
- **Witnessed pranks.** A witness to a prank comes to believe you are unreliable. Ringing a sleeping resident's bell escalates over three rings.
- **Dead ends.** Residents who firmly hold "don't talk behind people's backs" do not repeat a story.
- **Nothing is final.** Trust rebuilds as true things you said are confirmed.

## Measure (`npm run measure`, 6 seeds, 2026-10-19, iteration 2)

| Style                                        | Tin (₺) | Treats | Times caught | Hands on Sunday (of 7) |
| -------------------------------------------- | ------- | ------ | ------------ | ---------------------- |
| Quiet: errands only                          | 244     | 3.3    | 0            | 0.5                    |
| Honest: errands, news, true things passed on | 692     | 4.0    | 2            | 6.5                    |
| Gossip: everything passed on "for certain"   | 528     | 4.0    | 3            | 6.7                    |
| Liar: makes things up at every door          | 432     | 7.3    | 14           | 0.8                    |

**The edge in numbers.** Lying earns the most treats (7.3 against 4.0), because people like hearing what they want to hear. It is caught about 14 times a week and loses the vote. Gossip earns less money than honest service and about the same hands, because a kapıcı who tells everything is liked. This is the intended price: naughtiness pays in the short run and costs on Sunday, and honest service wins. Replay is exact for every style.

## Playtests

- Round 1 ([round-1](playtests/round-1-2026-10-19.md)): four testers. Fixed in commit 4b2e041: the clock slows while talking, people answer every verb, the journal no longer goes mute, the door handle, words from Thursday, Rıza counts the hands.
- Round 2 ([round-2](playtests/round-2-2026-10-19.md)): Murat (casual, phone) would come back "to find out who the man at Derya's door is"; Deniz (mischief) would come back "to find out what I broke", and the costs were "funny, and mostly fair, but only afterwards"; Hale (story) would come back and called the roof proposal the payoff of the week; Bayram (a retired kapıcı) would not, "not for the game", and wants the boiler fund. Fixed in iteration 2: reads show when someone thinks you lie, withdrawn words give their cause, the tea-money line says ₺300, missed errands say so, nobody thanks you from outside, things are handed over on the step, the talk panel stays with the person you chose, "sit a minute", fewer repeated overheard lines, the tell list skips what the listener told you.
- HF-character harness ([hf-characters](playtests/hf-characters-2026-10-19.md)): before and after iteration 2.

## Rules taken from the consults

1. Mid-errand in 20 seconds: the bread order is on the board at 07:00 and the first door opens within a minute. The story is three lines on the title page.
2. No numbers for people. Trust, mood and belief show as posture, words and Rıza's margin notes. Money is the one number (tips in ₺).
3. Every rumour's path is readable after the fact: the evening journal says who talked to whom and, if you were near, what was said.
4. Tactical slowdown, not pause: the clock slows while a door is open.
5. Honest service is a viable way to win the vote.
6. No time passes while the player is away; nothing decays for absence.

## The world (host side, `src/sim`)

- The building: ground floor (your room, flat 1, the front step), floors 1 to 4. Stairs cost minutes and effort; the kapıcı is an HF person with the opt-in fatigue store, so his legs carry the morning into the afternoon.
- The day: 07:00 to 21:00. Bread and newspapers in the morning, parcels and small jobs, the evening on the stairs, bins at 20:00. Requests are pre-rolled from the seed per day.
- Residents decide their own free time through HF (stay in, sit on the step, go to the shop, visit a neighbour). Two residents on the step, on the stairs at the same time, or visiting talk through `converse`.

## The people (canonical edition 7)

Five maintained residents: Hacer58, temporary entrance-side resident and retired shop assistant; Sevim69, widowed retired teacher; Burak31, single accountant and keeper of the building account; Derya44, single night nurse; Tarık81, widowed retired ferry captain. Flats4 and6 are unoccupied. See [the exhaustive census and playable discoveries](cast-adoption.md). Original identities and old romance/recipe history are retired, not transferred by renaming.

## Concepts not chosen

- **B. Lost Property**, a ferry-terminal window where claimants describe what they lost and some lie. Rejected: a judgement puzzle at a window; one-off claimants give little relatedness; keeping things reads as theft.
- **C. The Hostel**, a summer backpackers' hostel. Rejected: guests leave in a few nights, so lies never come back and memory and trust go unused; "I already run a booking desk" (wildcard).

## Current host follow-through and Deferred — 2026-10-29

Current native source uses HF4.8.1/client0.5.7/kit0.5.24. The historical edition/version receipts below retain their original scope. Delivery still requires signed source, one hosted review, exact green CI, a matching clean live release, complete replay and both viewport checks. Adam accepts feel separately. This task runs no player rounds.

| Ask and aliases           | Current source behavior                                                                                                                                                                                               | Literal remainder / checkpoint                                                                                                              |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| F1569 / GDI1259 / GDL0726 | Real completed jobs retain a pending acknowledgment when the resident is away. After returning, the resident acknowledges the work at a face-to-face encounter. A start does not complete a job.                      | Player response and feel review2026-11-03.                                                                                                  |
| F1570 / GDI1260 / GDL0727 | Sitting stories do not cycle. Later sittings still cost ten minutes and can earn the original trust-gated private disclosure. A quiet break offers ordinary timed HF rest.                                            | This is a bounded activity and repetition correction; richer evening play and the same-tester return remain unproved2026-11-03.             |
| F1571 / GDI1261 / GDL0728 | A same-place pickup/delivery compares carried and completed states separately. A completed parcel no longer also says nothing happened.                                                                               | Original tester cause is not inferred from this causal control; retest2026-11-03.                                                           |
| F1572 / GDI1265 / GDL0729 | Two visible replies follow a real authored sitting line. Both people spend actual time; the resident chooses whether to continue. Only completed HF activities and continued co-presence produce the authored answer. | No private motive, forced assent or promised broader dialogue; retest2026-11-03.                                                            |
| F1573 / GDI1266 / GDL0730 | Waiting at an absent parcel recipient follows the selected speed. The caretaker can leave, do real work, or take a timed quiet break without dropping the parcel.                                                     | No return time is promised. Player experience remains unproved2026-11-03.                                                                   |
| F1574 / GDI1267 / GDL0731 | Start work is available at the actual job location in week14/month15/work16. The real duration, effort and completion boundary remain.                                                                                | Same-tester retest2026-11-03.                                                                                                               |
| GDI1325                   | Isolated file play validates detached worker candidates; selection generations cancel stale results. Final file metadata and owner promotion commit together. Native saves remain separate.                           | Actual disposable browser receipts and their exact limits are recorded in the scratch report; no owner-profile/SW/recording-delivery claim. |
| Shared portable writes    | Public portableWriteBlockers runs at shared projection, publication, terminal and fork boundaries. Blocked incoming heads refuse without substitution. Original heads and source journals remain.                     | Published SDK reader certification, generic retirement/reentry and custody are shared-owner dependencies2026-10-29.                         |

The required pending-work/reply schema is initialized only for new native openings. Older incompatible saves refuse with their original bytes preserved; no migration or old month-proof relabeling occurs. Historical GDI069–080/446/577–582 implementation routes remain. GDI081/GDL0013 still lacks original raw return decisions; a public statement does not establish a private motive. GDI338/345/355/374/375/398/444/445/470/550 and GDL0075/0122/0137/0152 retain owner/player observation boundaries2026-11-03. Immutable SDK artifact adoption is current; npm distribution remains excluded under GDI649. Quiet feedback choices retain the existing submit-only behavior under GDI692/F491.

## Current month and Deferred reconciliation — 2026-10-25

The normal six-day week remains edition9. The unchecked “Play four weeks” choice starts edition11 on the same released HF3.0.0/engine2.23.0. It never extends or changes an existing edition9 notebook. The intermediate edition10 release is refused with Start fresh because its material-outcome rules changed; no stored edition10 run is silently reinterpreted. The month keeps daily bread, parcels, work, food, fatigue, gossip and four-vote difficulty. Sundays7,14 and21 offer another week; Sunday28 decides whether the caretaker stays. Technical delivery and Adam’s feel acceptance remain separate.

Edition11 owns bounded authored events, not a general planner. Tuesday in week2 has a forecast rainstorm from16:00 to16:40. Wet street crossings take longer and more effort. Residents may choose shelter under the shop awning through HF; their work and sleep still take precedence. Sunday seats need two separately accepted invitations. Sitting together permits a quiet conversation, not automatic reconciliation or a vote. Week3 private help requires the already-discovered confidence, trust, the resident’s HF assent and actual time at their door before19:00. The outcome remains private and does not settle a clinical or career dispute.

The month slows conversations and reading to0.6 minutes per second. The menu pauses. Edition9 retains its existing pacing and complete deterministic continuation. No new player round or owner acceptance is claimed.

| Source item                                                                                                                 | Current outcome or precise remaining dependency                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Owner / target                                            |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| GDI069–071, owner run r-9m8bdyfbac: hidden backstories, achievements and paths                                              | Existing five canonical confidences and boiler/notice/paper-model outcomes remain. Edition11 adds five consented private work outcomes and stamps after actual completion. Difficulty comes from discovery, trust, time and refusal; the UI does not reveal an undiscovered confidence. See sim/stories.ts, sim/month.ts and game.ts helpStory/complete.                                                                                                                                                                                                                                                                                                                                                                                         | Stairwell source; Adam feel review2026-11-03              |
| GDI072–073: weeks2–4 and stay vote                                                                                          | Opt-in four-week timetable, weekly meetings, reset weekly promises and final renewal decision through HF decide. Earlier results remain in month.meetings. Every night, including Saturday, resolves actual HF food, sleep and carried work before the next morning. Sunday morning runs before voting; its off-duty afternoon runs before Monday.                                                                                                                                                                                                                                                                                                                                                                                               | Stairwell                                                 |
| GDI074: rainstorm under the awning                                                                                          | Authored week2 forecast/storm, slower wet travel, shelter offers and ordinary resident conversations. Nobody is forced to shelter, leave work or reconcile.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Stairwell                                                 |
| GDI075: Sunday seating                                                                                                      | Ask each resident in person. Only reciprocal accepted invitations produce neighbouring chairs and a chat. Each resident votes separately.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Stairwell                                                 |
| GDI076–078: dues, feud and boiler help                                                                                      | Existing book→Tarık’s private repayment consent→engineer path was already playable. Canonical Hacer/Sevim notice reconciliation supersedes retired Nermin’s feud. Edition11 can finish these paths in later weeks. Tarık sets aside ₺600 from the authored week2 pension receipt and promises three weekly ₺200 payments. Dates make payments due. Each payment needs both residents free at home, HF assent, a timed trip and handover. The private ledger conserves cash; the supplier is paid only from collected funds. Missed dates, partial balances and an overdue supplier invoice remain visible outcomes. The caretaker can offer to arrange the private encounter. No player donation, continuity debt erasure or public debtor list. | Stairwell                                                 |
| GDI079: parcel left kindly                                                                                                  | Edition11 separates honest sealed custody from misdelivery. The neighbour decides; the caretaker spends time arranging it. A separate delivery choice needs actual availability and assent, then starts an HF activity with stair travel and handover time. Entrustment age gives no travel credit. A missed deadline leaves the parcel sealed with its custodian until the trip actually finishes. Refusal leaves the parcel carried. Late/missed costs remain. Only actual receipt earns the safe-parcel stamp.                                                                                                                                                                                                                                | Stairwell                                                 |
| GDI080: bins warning before missing the truck                                                                               | Orders show the actual route estimate, including slow legs and pickup→street travel, against the20:45 truck departure. This is a display projection; the deadline stays fixed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Stairwell                                                 |
| GDI081/F129.3: returner7/8→0/3                                                                                              | Historical harness8930521 confirms conditional recorded-evening denominators; the runner saved aggregate output, not the considered return utilities. Original raw return decisions were not located. Cause remains unknown; the old result is not a current-edition measurement. Retrieve original decisions or obtain a director-authorized retest; do not tune away gossip costs.                                                                                                                                                                                                                                                                                                                                                             | Director/playtest input2026-10-28                         |
| F477.3/GDI446: when Sunday support opens                                                                                    | Hint states Thursday07:00 and face-to-face. Month checks the weekday each week and dates promises to that Sunday.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Stairwell                                                 |
| GDI577–582: HF host adoption                                                                                                | Explicit edition11 options, receipt-bound contradiction penalties, complete direct and downstream testimony history and retained authored observations. See hf-requests.md. Default edition9 state/RNG and continuation remain exact.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Stairwell                                                 |
| GDI649: npm lab telemetry                                                                                                   | EXCLUDED by the owner’s current human-framework/AGENTS.md HF v3 clause: “The lab client and kit stay release artifacts.” The registry404 is an observation, not a release dependency. Immutable client0.4.11/kit0.5.12 are verified and adopted; existing day/meeting telemetry remains.                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Owner guardrail; no npm work scheduled                    |
| GDI338/345/355/374/375: pacing/UI retests; GDI398: cast; GDI444–445: Tell/notebook; GDI470: linkage; GDI550: manifest cache | Historical implemented delivery routes. Later owner speed restoration supersedes the remove-speed request. Current source keeps controls, local notebook and automatic linkage. The new month does not fabricate their owner retest.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Adam/playtest review2026-11-03                            |
| GDI501–503/533: menus, English, tablet and setting                                                                          | Current source preserves names, places, translated common nouns and existing simplify controls. Any new rendered source defect belongs to the active game writer; readiness is not inferred from these old rows.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | plain4/docsweb historical delivery; Adam review2026-11-03 |
| GDI557: HF3 adoption                                                                                                        | Current exact pins are HF3.0.0/engine2.23.0. HF3.1 availability does not authorize a silent actor-engine migration.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | v3 delivery history                                       |

Faith guardrail: human-framework/AGENTS.md Engineering rules says “Games keep faith gentle”; prayer and fasting are quiet parts of life, never the goal or central mechanic. There is no new faith mechanic, ruling, divine acceptance score or clinical authority. Friends’ playtests and Show HN remain paused; this worker runs no lab-panel round.


## DL-4 exceptions: daily conversations (2026-10-20)

News and sitting are intentional fiction rules: each resident gives one news conversation and one ten-minute sitting story per game day. They preserve the day's pacing and the ordered stories through the week. These are daily quotas, not checks for newly learned news or physical capability. The interface says “Already asked · ask tomorrow” and “Sat together today · return tomorrow”; each action returns on the next game day. Existing simulation rules and exported notebook replay remain unchanged.

## F-232 clarity follow-up (2026-10-20)

Monday's first bread window plays at 0.3 game minutes per real second, including
travel. This changes only UI playback. Each simulation step still advances one
minute. The selected speed returns when all first-morning bread has been
delivered or its final deadline has passed. Conversations and inspection continue
at 0.6 min/s outside that window. One clock-rate line shows the effective speed
and its reason. The simulation, save edition and HF 2.8.0 pin are unchanged.

The scene shows one complete current order. All orders opens the full readable
list; Residents opens named destinations with full-size targets. Those sheets
keep their controls when time advances. Newly arriving orders append below the
ones already being read. Resident selection retains the person's identity when
several people share a location.

The conversation stays with its selected resident after they leave or sleep.
The existing actions become unavailable and the panel explains the departure.
Closing the panel reveals routes. Speech and availability use a scrolling region
above a fixed action row. Tell choices retain their displayed payload and become
unavailable if the listener leaves.

Acceptance for this round: the coordinator reviews the three fixes, browser
renders at 360×690 touch and 1280×800, tests and old-export continuation evidence,
and a clean live release. The owner still accepts game feel separately.

## Building and journal layout (2026-10-20)

The owner's two runs ask for a larger building and more journal room. The day now
uses lab-kit 0.2.0's phone stage CSS and viewport observer. The clock, speed and
current order stay in a top strip. A desktop gives the building 58% of the width;
the journal and one action sheet sit beside it. A phone shows the current floor
at full width. “Enlarge building” shows all floors; “Back to journal” or Escape
returns to the same journal entry. Choosing a destination also returns to the
journal and action sheet. Opening orders, residents or the notebook exits the
enlarged view. Inspection slows playback rather than stopping the simulation.

Every destination in the enlarged 360×690 building has a separate target of at
least 44×44 CSS px. The selected floor's names remain readable in the compact
view. Longer answers have a labelled full reading; secondary choices scroll
within the sheet while Back stays visible. No simulation, save format, input
semantics or HF version changes accompany this layout. Browser regressions cover
360×690, 1280×800 and 1920×1080, including hidden-journal rollover and font reflow.
A public synthetic fixture follows the owner's documented 130-input mix and
freezes the complete replay state and continuation. Owner acceptance of the new
layout's feel remains separate from these builder checks.

## HF 2.10.0 upgrade (2026-10-20)

The dependency advances from 2.8.0 to 2.10.0. Source-trust setup and the existing
host penalties use `seedSourceTrust`; their values and timing are unchanged.
The game remains `stairwell@3`. Belief setup, contradictory-testimony rules and
the testimony ledger remain unchanged for replay compatibility. The new belief
setup API rejects the self-source markers used here. Contradiction evidence has
different eligibility and repeat rules. First-acquisition provenance cannot
replace the complete testimony ledger. Adoption details are in
[HF requests](hf-requests.md#delivery-and-adoption-2026-10-20).

Acceptance for this upgrade: the existing full check passes, frozen notebook
states and continuations match with only HF person engine stamps normalized,
GitHub CI passes, and the live game loads from a clean commit with HF 2.10.0.
Acceptance owner: the user. Game-feel acceptance remains separate.

## Automatic pacing (2026-10-21)

This direction supersedes the earlier speed-control and tactical-slowdown rules.
The owner's [verbatim playtest](playtests/owner-2026-10-21.md) reports alternating
stalls and missed conversations or late orders. Automatic remains the default; restored clock controls are described below.
Conversations and inspection hold time until closed. Orders run at 0.6 game
minutes per real second; travel, work and empty stretches run at 6. Automatic
stepping stops at newly arriving speech, people and orders and gives them reading
time before continuing. Background journal entries alone do not cause repeated
reading holds. When no order, conversation, inspection, travel or work needs the
player, one “Until something happens” button advances minute by minute to the
first new line, person, order or night page. The simulation, save edition and
input log remain unchanged.

The user accepts game feel. Delivery requires independent review, the full
check, frozen replay and continuation checks, private owner replay evidence at
360×690 touch, green CI, and a clean live release. Screenshots and private replay
artifacts stay outside the repository. A builder's passing checks do not close
the owner's pacing acceptance.

## Owner information and tally update (2026-10-21)

The title’s job background opens through a small information button and a native dismissible popover. Its prose is retained. The menu no longer has a tally preference. The Sunday ending always computes Rıza’s recorded-work tally, hidden until “See tally” is pressed. Automatic pacing, gameplay answer disclosures, simulation rules, saves and replay remain unchanged. Adam accepts feel.

Clock controls offer Automatic (the default), Slow, Steady and Fast. Selected rates apply to travel and empty stretches. Orders, conversation, inspection and new speech retain their existing protection. Until something happens remains guarded. These are page-session preferences; saves and replay inputs are unchanged.

## Hidden resident outcomes, rules edition 4 (2026-10-23)

Owner F-185/F-311 asks for backstories that are difficult to untangle and have real outcomes. Edition 4 adds authored clues for existing residents in `src/sim/stories.ts`. Repeated sitting and earned trust reveal the accounts behind Nermin and Sevim's quarrel and Tarık's private repayment offer. Carrying the relevant true accounts can unlock reconciliation and a boiler repair funded by the building, each recorded by a hidden stamp. The notebook lists a clue only after discovery. It lists a stamp only after the event. Chore deadlines, travel, gossip exposure and the Sunday vote rules keep their existing difficulty.

New notebooks use `stairwell@4`. Continue, file import, export, browser saves, morning rewind and the command-line front end retain each notebook's rules edition. `stairwell@3` keeps its exact state shape, authored lines and continuation; frozen state hashes remain unchanged. A legacy notebook does not acquire the new paths during continuation. Begin a new notebook to play edition 4.

Delivery for this sweep means signed changes on main, green CI, a clean live release containing them, and live Chromium checks at 360×690 and 1280×800. Adam accepts the experience separately. The external sweep report records route dispositions; this worker does not edit the shared feedback ledger or curated listing.

## Derya source and return, edition 5 (2026-10-23)

Derya remains the single 44-year-old night nurse at flat 5. Edition 5 runs her last hour of an ordinary shift through HF, with a received night-work fact. The player may request a rota pause before eight. The pause takes effect only when that actual shift finishes. Her morning sleep remains due. No private family fact or medical qualification is inferred from the occupation.

Continuity uses the shared opt-in browser shelf. It carries the approved HF projection, one bounded attended fact and SHA256 checkpoint stamps. The source notebook retains the full checkpoint and accepted input/world prefix. A receiving claim must advance the exact parent before loading. Competing continuations require an explicit fork. Recording needs its own selected-history permission when the recording identity changed or the history came from a file.

The return is a new chapter beginning at the locally saved source boundary. Replay pins the returned initial Person and both envelopes before simulating the suffix. Clinical health and circadian mismatch block admission. Only compatible approved fitness can be copied into the detached opening; no healing is claimed. Missing local source prefix or unsupported obligations/goals refuse continuation and leave fresh play available. Hearsay target dependencies and actual browser receipts are recorded in the scratch delivery report. Old-save work is waived; existing old loaders remain without additional compatibility machinery.

## Canonical edition 7 (2026-10-23)

The canonical adoption document supersedes earlier current-state claims about editions3–5, seven occupied households, old cast biographies, frozen-save compatibility, the engagement and the recipe feud. The original goal, errands, source trust, gossip exposure, fatigue, Sunday vote, dated boiler repair and private repayment permission remain. Current-version replay remains exact; old notebooks explicitly require Start fresh. The released whole-cast integration and its explicit supported/unsupported carry are documented in cast-adoption.md. Deployment/journey receipts remain in the coordinator report.


## Explicit ordinary work option — 2026-10-26

Remaining: parent ONE review, actual Chrome QA, normal source integration and permitted delivery. Adam accepts feel separately. This source does not close the six Maya asks.

The default remains week9. The original unchecked month option remains month11. A separate unchecked title option starts month13 without earlier character history. It uses month11 rules and adds a task-specific Start work button for an eligible ordinary job at your current place. The click starts the authored work interval and fatigue cost. Completion and any payment still require the ordinary worked-minute boundary. It does not walk, submit another input or complete the job on click.

Edition9/11 Go and journals stay unchanged. Edition12 remains the finite aligned-visit capsule over exact nested11. The new command refuses in old editions before recording; mixed and unknown input contracts refuse before replay installation. Private help retains its separate invitation and assent path.

Character admission and publication for edition13 are unsupported and refuse before shelf writes. Native run download and local replay remain available. No edition11 passport is fabricated. Adoption engineering remains OPEN for2026-10-27. F1571 parcel delivery is not proved to share the tap cause. F1569 completed-work acknowledgment, F1570/F1572 story/reply repetition and F1573 waiting remain separate engineering.

No upload under db491 hold through2026-10-27T19:45 or actual B handback. Future actual QA uses Recording/linking ON, no API quarantine, and a disclosed public SDK localhost option; unsupported agent attribution and historic recording limits remain explicit.


## Finite headless source return — Task3, 2026-10-26

Remaining: one parent-arranged independent source review and integration. Target: 2026-10-27.
Task4 trusted controller, ownership, publication/CAS and ordinary entry remain separate.
Actual db491 release hold persists. No owned journey, browser/player acceptance or deployment is claimed.

The opt-in `aligned-visit.ts` native chapter can return the original unsubmitted dirty51ec
capture from the immutable Garden Task2 artifact. It retains the original packet and pins.
It replays the complete external Garden input through the package public root, checks source
bindings, advances the paused nested11 world from930 to990 through sixty ordinary steps,
then installs the exact validated Garden closing raw. Only Derya's host pause and declared
presence fields change. All other world fields match independently replayed original legacy11
with the same prefix and oneCast. Default9, month11, work13 and departure-only12 stay inert
with respect to return; canReplay12 remains false. No UI or general save dispatcher exposes it.

This headless native file is not a Shelf transfer. Measured full chapter is326794 UTF8 bytes,
19535 value nodes, depth14; compact is192136 bytes,10948 nodes,depth14. Metadata alone is26454
bytes,1114 nodes,depth11. The full chapter exceeds the256KiB Persona transfer bound. The native
format keeps4MiB/depth64/60000-container/480000-token guards, checks plain finite JSON and unsafe
keys on direct and JSON paths, bounds metadata with unchanged SDK256KiB/depth24/20000-node
limits, and validates the finite Garden graph through the published module. Garden full and
compact are252548/165601 bytes. No SDK bound is raised and no resource is truncated.

The detached continuation reaches1170 through ordinary steps. At1170 Derya is still in the
meal interval begun at1141; the existing host waits for that interval before offering night
work. The control then reaches the ordinary work offer and HF begin without forcing assent,
editing a private clock/body, waiving duty or changing the returned990 world.

## R2 reader candidate and Deferred browser gate — 2026-10-30

The reader change committed and deployed at ecf6da8 admits supported people independently and pins named ID/revision/reason refusals for unsupported, occupied and peer-blocked Hacer/Sevim histories. Fresh local roles do not inherit refused histories. Original complete shelf records stay on the shelf. Every requested head, including refusal and absence, stays in the single atomic CAS. New explicit authority and denial metadata survives reload; denied actors cannot gain source, checkpoint, fork or terminal permission when the catalog changes. Earlier delivery receipts remain historical; deployment does not establish player acceptance.

Deferred only to the director's genuine browser access/permission input: leased existing Chrome public UI at360×690 and1280×800, visible separate refusal notices, pointer input, complete export and reload. CUA access is unavailable; isolated browser launches are forbidden and this worker launches no browser. Target2026-11-03. Headless code, real SDK gates, CAS, full replay and build remain this candidate's completed implementation scope; owner/player acceptance is separate.
