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

## The people (HF 2.8.0, pinned exactly)
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
- Weeks 2 to 4 and the final vote on whether you stay (target: after round 2 of playtests).
- The rainstorm under the awning (wildcard; target: week 2 build).
- Seating at the Sunday meeting (target: week 2 build).
- The other arcs (Tarık's dues, Nermin and Sevim's feud history) as full arcs (target: week 2 build).
