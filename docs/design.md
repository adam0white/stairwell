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

| Craving (psych consult, 1 to 5) | A | B | C |
|---|---|---|---|
| Autonomy | 5 | 3 | 4 |
| Competence | 3 | 4 | 4 |
| Relatedness | 5 | 3 | 3 |
| Ethical variable reward | 5 | 3 | 4 |
| Curiosity gap | 5 | 4 | 3 |
| Story to finish | 5 | 3 | 3 |
| Mischief as benign violation | 5 | 3 | 3 |

## Cravings map

| Craving | Mechanic that serves it | HF faculty |
|---|---|---|
| Autonomy | Route and order of errands; at each door, keep, pass on, make it certain, or make something up; pranks; asking favours that a resident may refuse | `predict`/`decide` with the kapıcı as a voice; the player's words as `told` percepts |
| Competence | Batch errands to spare your knees; learn who passes things on, who trusts you, who meets whom on the stairs; your word gets heavier as true things you said are confirmed | body and fatigue store; `memory.sourceTrust` moved by `confirm` |
| Relatedness | The same seven households every day; they remember what you did for them and what you said; small kindnesses (Tarık's shopping) are noticed | relationships, `socialEvent`, reputation beliefs about the kapıcı |
| Variable reward, ethical | Tips, börek and votes vary with trust, timing and what someone wanted to hear; every one has a cause written in the notebook; no login reward, no random bonus | relationships and beliefs; host tips from them |
| Curiosity gap | Who is the man at Derya's at night? What is in the jeweller's parcel? Rıza's margin notes hint at what you have not seen | resident beliefs, told to you through `converse` |
| Mastery curve | Day 1: few requests and your word weighs nothing. By Friday: routes, trust and who-talks-to-whom | source trust starts low for a stranger |
| Collection and completion | The notebook's secrets page (Rıza filled the first entries, so it starts partly filled); stamps for kind and naughty deeds | the kapıcı's own beliefs are the notebook |
| A story to finish | Three arcs through the week (the ring, the boiler fund, the late visitor) and the Sunday vote | arcs are host events; outcomes are residents' own decisions |
| One more day | Each night page ends on one open question (the next day's first knock, a half-heard line) | host |
| Low-friction sessions | One day is about four minutes; the notebook saves at every page; nothing happens while you are away | seed and input log |
| Daily return without dark patterns | The building waits for you; no streaks, no decay for absence, the vote counts days played, not calendar days | host rule |
| Mischief as play | Gossip, stretching a story, making one up, misdelivering a parcel, swapping newspapers, letting the stray cat in | `converse` (backbiting tag, deceit), source trust, `confirm` |
| Social comparison | A spoiler-free share line of your week (tips, secrets found, times caught, the vote) | host |

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

| Style | Tin (₺) | Treats | Times caught | Hands on Sunday (of 7) |
|---|---|---|---|---|
| Quiet: errands only | 244 | 3.3 | 0 | 0.5 |
| Honest: errands, news, true things passed on | 692 | 4.0 | 2 | 6.5 |
| Gossip: everything passed on "for certain" | 528 | 4.0 | 3 | 6.7 |
| Liar: makes things up at every door | 432 | 7.3 | 14 | 0.8 |

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

## The people (HF 2.10.0, pinned exactly)
- **Nermin Hanım**, flat 1, 72, widow, watches the door. Talks. Old feud with Sevim.
- **Sevim Hanım**, flat 2, 69, retired teacher. Feud with Nermin.
- **Burak**, flat 3, 31, accountant, quiet, honest. Sweet on Elif.
- **Hüseyin Bey**, flat 4, 63, the building manager. Careful with money, holds his tongue.
- **Derya**, flat 5, 44, night nurse; asleep in the mornings. A man comes to her door late.
- **Elif**, flat 6, 27, illustrator, new in the building; nobody's word on her yet.
- **Tarık Bey**, flat 7, 81, retired ferry captain, top floor. His son is in Germany. Friday prayer is a quiet line in the journal.

## Concepts not chosen
- **B. Lost Property**, a ferry-terminal window where claimants describe what they lost and some lie. Rejected: a judgement puzzle at a window; one-off claimants give little relatedness; keeping things reads as theft.
- **C. The Hostel**, a summer backpackers' hostel. Rejected: guests leave in a few nights, so lies never come back and memory and trust go unused; "I already run a booking desk" (wildcard).

## Deferred
- Hidden resident backstories that progress with real outcomes, including hidden achievements and unlockable story paths and events (owner run `r-9m8bdyfbac`, [verbatim note](playtests/owner-2026-10-20.md); target: 2026-11-03). Not implemented in the log layout change.
- Weeks 2 to 4 and the final vote on whether you stay (target: after round 2 of playtests).
- The rainstorm under the awning (wildcard; target: week 2 build).
- Seating at the Sunday meeting (target: week 2 build).
- The other arcs (Tarık's dues, Nermin and Sevim's feud history) as full arcs (target: week 2 build).
- A way for the kapıcı to help the boiler fund: ask for the book, put the question to the flats (round 1 story seeker, round 2 wildcard; target: week 2 build).
- Leaving a parcel with a neighbour on purpose, as a kindness rather than mischief (round 2 wildcard; target: week 2 build).
- Telling the player why a bins run missed the truck before it happens (round 2 casual; target: week 2 build).
- The harness returner persona came back 0/3 on iteration 2 against 7/8 before; not yet traced (target: next build).
- Lab telemetry through `@adam0white/lab-client` (milestones: each night page and the Sunday vote; quit points: the title page and mid-day). Blocked: the package is not on npm as of 2026-10-19. Target: the first build after it is published.


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
stalls and missed conversations or late orders. Speed controls are removed.
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
