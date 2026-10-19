# HF-character playtesters, 2026-10-19

Build: commit `4b2e041` (stairwell@2, HF 2.8.0). The working tree also had an uncommitted `docs/design.md` edit that did not come from this run and does not touch the sim. Players: the HF playtester personas from `human-framework/packages/playtester` (four base, three edge-pushers, the returner). Each persona plays through HF's own loop. Once a real minute it decides whether to play on, look away or stop, and every 3 real seconds it picks one input. The adapter is `scripts/hf-playtest/adapter.ts` and the runner is `scripts/hf-playtest/run.ts`. Time runs at the UI's default speed, 3 game minutes per real second and 0.6 while someone is in front of you. Every valence and promise in the adapter is a playtesting premise; none is a measurement of real players.

## Commands

```fish
export PATH=/opt/homebrew/bin:$PATH
cd /Users/abdul/code/stairwell
node scripts/hf-playtest/run.ts run seeds=3 personas=all out=/private/tmp/claude-504/-Users-abdul-code-human-framework/675a9839-8299-4863-91be-017a92a76ff0/scratchpad/stairwell-cohort.json
node scripts/hf-playtest/run.ts session persona=commuter seed=1
node scripts/hf-playtest/run.ts session persona=mischief seed=1
for p in unwinder completionist restless exploiter rulesLawyer; node scripts/hf-playtest/run.ts session persona=$p seed=1 | head -1; end
```

`packages/human/dist` was already built in the HF checkout, and no HF file was changed. The cohort JSON went to the session scratchpad and is not kept in this repository. The full cohort takes about 6 seconds.

## Cohort output (seeds 1-3, all personas)

```
stairwell-2 stairwell-2, seeds 1,2,3
  commuter       6.33 min, ended {"quit":0,"agenda":3,"game-over":0,"time-limit":0}, outcomes {"none":3}, bored 0/3, frustrated 0/3, rewards 0.33, quit at {}
  unwinder      19.67 min, ended {"quit":3,"agenda":0,"game-over":0,"time-limit":0}, outcomes {"none":3}, bored 0/3, frustrated 3/3, rewards 3, quit at {"Wed":3}
  completionist    21 min, ended {"quit":3,"agenda":0,"game-over":0,"time-limit":0}, outcomes {"none":3}, bored 0/3, frustrated 3/3, rewards 4, quit at {"Wed":3}
  restless         16 min, ended {"quit":3,"agenda":0,"game-over":0,"time-limit":0}, outcomes {"none":3}, bored 0/3, frustrated 3/3, rewards 2.67, quit at {"Wed":2,"Tue":1}
  mischief         14 min, ended {"quit":3,"agenda":0,"game-over":0,"time-limit":0}, outcomes {"none":3}, bored 0/3, frustrated 3/3, rewards 0 (rose to 121), quit at {"Tue":3}
  exploiter     12.33 min, ended {"quit":3,"agenda":0,"game-over":0,"time-limit":0}, outcomes {"none":3}, bored 0/3, frustrated 3/3, rewards 0.67, quit at {"Tue":3}
  rulesLawyer       7 min, ended {"quit":3,"agenda":0,"game-over":0,"time-limit":0}, outcomes {"none":3}, bored 0/3, frustrated 3/3, rewards 0, quit at {"Mon":3}
  returner        8.7 min, ended {"quit":0,"agenda":10,"game-over":0,"time-limit":0}, outcomes {"none":10}, bored 0/10, frustrated 6/10, rewards 2.8, quit at {}, came back 7/8
  bored at {}
  frustrated by ["LATE: a loaf and the paper","event: Tarık told Nermin what you had been saying about them.","event: Tarık told Sevim what you had been saying about them."]
  edge mischief-answered invent [fun to keep]: the game answers it: provocation is already part of play (7 inputs (invent:nermin:sport, invent:tarik:sport, invent:sevim:sport, …), 240 tries, answered 100%)
  edge mischief-answered prank [fun to keep]: the game answers it: provocation is already part of play (2 inputs (prank:gate:sport, prank:swap:sport), 85 tries, answered 100%)
  edge mischief-answered tell [fun to keep]: the game answers it: provocation is already part of play (14 inputs (contradict:elif:sport, contradict:nermin:sport, flipflop:nermin:sport, …), 369 tries, answered 100%)
  edge mischief-answered misdeliver [fun to keep]: the game answers it: provocation is already part of play (2 inputs (misdeliver:elif:sport, misdeliver:nermin:sport), 8 tries, answered 100%)
  edge mischief-answered knock [fun to keep]: the game answers it: provocation is already part of play (1 input (knock:derya:sport), 3 tries, answered 100%)
```

## Session trace: commuter, seed 1

```
commuter: agenda after 5 min at Mon 15:04 (commitment:c1)
  5:00 Mon 15:04 stopped: had to stop (commitment:c1)
  rewarded 1x; final {"chapter":"Mon","openLoop":0.4,"loops":[]}
```

## Session trace: mischief, seed 1

```
mischief: quit after 15 min at Tue 14:14 (emotion:distress:rest)
  0:12 Mon 07:22 answered: they rose to it: huseyin: That’s their business, not mine.
  0:15 Mon 07:24 answered: they rose to it: journal: You swapped Nermin’s and Sevim’s newspapers. Each has the other’s crossword.
  0:18 Mon 07:26 answered: they rose to it: huseyin: That’s their business, not mine.
  0:24 Mon 07:30 answered: they rose to it: huseyin: Let’s not talk about people.
  0:33 Mon 07:37 answered: they rose to it: nermin: Tarık? No. Not Tarık.
  1:00 Mon 08:51 answered: they rose to it: journal: You left the courtyard gate on the latch.
  1:24 Mon 09:36 answered: they rose to it: tarik: That’s nice to hear.
  1:36 Mon 09:58 answered: they rose to it: tarik: Is that so.
  1:42 Mon 10:02 answered: they rose to it: nermin: That’s nice to hear.
  1:57 Mon 10:25 answered: they rose to it: journal: You left the courtyard gate on the latch.
  2:21 Mon 11:16 answered: they rose to it: tarik: That’s nice to hear.
  2:24 Mon 11:18 answered: they rose to it: nermin: Is that so.
  rewarded 0x; final {"chapter":"Tue","openLoop":0.4,"loops":["a parcel","a parcel","a small, heavy parcel"]}
```

The session command prints only the first 12 moments that are not rewards, as the playtester's own CLI does.

## Seed-1 endings of the other quitting personas (first line of each session)

```
unwinder: quit after 20 min at Wed 15:30 (emotion:distress:rest)
completionist: quit after 21 min at Wed 17:43 (emotion:distress:rest)
restless: quit after 19 min at Wed 16:19 (emotion:distress:rest)
exploiter: quit after 12 min at Tue 16:08 (emotion:distress:rest)
rulesLawyer: quit after 7 min at Mon 16:07 (emotion:distress:rest)
```

## Reading

- **Nobody reached Sunday.** Every session ended between Monday and Wednesday, so the meeting, the hands and the `outcome` field were never exercised (outcomes `none` throughout).
- **Quit points.** All three sessions each of the unwinder and the completionist quit on Wednesday. The restless player quit on Wednesday twice and on Tuesday once. The mischief-maker and the exploiter quit on Tuesday, and the rules-lawyer on Monday. In the seed-1 traces every one of these stops is `emotion:distress:rest`.
- **Boredom: none.** No session was bored (`bored at {}`). The commuter and the returner stopped only for their agenda (getting off the bus). The commuter averaged 6.33 minutes and earned 0.33 rewards a session.
- **Frustration** came from two things on screen. The first was late bread ("LATE: a loaf and the paper" leads the list). The second was gossip coming back ("Tarık told Nermin what you had been saying about them"). Selin's round-1 report on the earlier build `83e081d` (stairwell@1) described the same bread deadlines, already late at the bakery.
- **The returner** came back on 7 of 8 possible evenings, but 6 of its 10 sittings were frustrated.
- **Edges labelled "fun to keep":** five mischief-answered edges, all answered 100%:
  - invent (240 tries)
  - the pranks (85)
  - the two kinds of opposite tells, `contradict` across residents and `flipflop` to the same resident, grouped as "tell" (369)
  - misdelivery (8)
  - ringing Derya's bell while she sleeps (3 tries, the minimum for the report)

  No edge was labelled "close". There were no dominant strategies, degenerate loops or silent inputs.
- **The mischief-maker** relished answered provocations (121 a session) but had 0 rewards, and quit on Tuesday from distress. Its trace shows the residents rising to its provocations, for example "Tarık? No. Not Tarık." and "That’s their business, not mine."
- **Adapter artefact: the 100% answer rates and the absence of silent inputs.** Every line the sim says while an input is applied counts as that input's answer, and the sim says a line for every edge input. The adapter also shows an arrival event after every walk. So "answered" shows that the game always replies on screen. It does not show that the reply is specific. Reading `deliverClaim` (source, not measured) shows that telling the same resident both sides gets only the ordinary reply lines. Only two residents comparing notes is caught.
- **Adapter artefact: gossip coming back.** Plain `tell` offers every item the kapıcı is sure of or has heard, at a flat promise (0.3 sure, 0.2 heard). It does not separate a notice ("the water is off on Wednesday") from gossip about a neighbour. So base personas pass gossip on freely, and the "word got back" frustration rests partly on that premise.
- **Adapter artefact: reward size.** Rewards per session (0 to 4) depend on the adapter's premise that a tip reads as 0.2 + ₺/50, which puts only tips of ₺15 and up over the playtester's reward line of 0.45. A promised word (0.55), a good night page (up to 0.5) and a new notebook secret (0.45) also reach the line. Treats (0.35) and gossip from "Anything new?" (0.35) do not.
- **Not modelled.** The adapter does not model the UI's faster speeds (6× and 12×), or closing a resident's panel to restore speed. A persona at the step with company runs at 0.6 the whole time. So a persona's day can take more real minutes than a player's who closes the panel. That would move quit points earlier in the week.

## Rerun on iteration 2 (stairwell@3, same command, 2026-10-19)

Changes between runs: residents who are out no longer thank or tip; things are handed over on the step; a "sit a minute" verb; reads show "thinks you lie"; withdrawn words give a cause; missed errands say so; tellables skip what the listener told you or already heard from you.

```
  commuter         18 min, ended {"quit":0,"agenda":3,"game-over":0,"time-limit":0}, outcomes {"none":3}, bored 0/3, frustrated 0/3, rewards 1, quit at {}
  unwinder      20.33 min, ended {"quit":3,"agenda":0,"game-over":0,"time-limit":0}, outcomes {"none":3}, bored 0/3, frustrated 0/3, rewards 2.33, quit at {"Wed":3}
  completionist 36.63 min, ended {"quit":1,"agenda":0,"game-over":2,"time-limit":0}, outcomes {"win":2,"none":1}, bored 0/3, frustrated 0/3, rewards 7.33, quit at {"Wed":1}
  restless      12.67 min, ended {"quit":3,"agenda":0,"game-over":0,"time-limit":0}, outcomes {"none":3}, bored 1/3, frustrated 0/3, rewards 1, quit at {"Mon":1,"Tue night":1,"Wed":1}
  mischief      19.67 min, ended {"quit":0,"agenda":3,"game-over":0,"time-limit":0}, outcomes {"none":3}, bored 0/3, frustrated 0/3, rewards 0 (rose to 165.67), quit at {}
  exploiter        17 min, ended {"quit":3,"agenda":0,"game-over":0,"time-limit":0}, outcomes {"none":3}, bored 0/3, frustrated 3/3, rewards 0.33, quit at {"Tue":2,"Wed":1}
  rulesLawyer    6.33 min, ended {"quit":3,"agenda":0,"game-over":0,"time-limit":0}, outcomes {"none":3}, bored 0/3, frustrated 3/3, rewards 0.33, quit at {"Mon":3}
  returner      13.33 min, ended {"quit":1,"agenda":2,"game-over":0,"time-limit":0}, outcomes {"none":3}, bored 0/3, frustrated 0/3, rewards 1.33, quit at {"Mon":1}, came back 0/3
  bored at {"Mon":1}
  frustrated by ["Derya: polite; thinks you lie; event: Nermin told Elif what you had been saying about them","event: Derya told Elif what you had said: “Tarık is not so kind.” Elif knows better.; even","event: Elif and Nermin compared notes. Your two stories met.; event: Sevim and Elif compar"]
  edge mischief-answered invent [fun to keep]: the game answers it: provocation is already part of play (7 inputs (invent:elif:sport, invent:nermin:sport, invent:tarik:sport, …), 270 tries, answered 100%)
  edge mischief-answered prank [fun to keep]: the game answers it: provocation is already part of play (2 inputs (prank:gate:sport, prank:swap:sport), 102 tries, answered 100%)
  edge mischief-answered tell [fun to keep]: the game answers it: provocation is already part of play (13 inputs (flipflop:elif:sport, contradict:sevim:sport, contradict:elif:sport, …), 487 tries, answered 100%)
  edge mischief-answered misdeliver [fun to keep]: the game answers it: provocation is already part of play (4 inputs (misdeliver:nermin:sport, misdeliver:elif:sport, misdeliver:huseyin:sport, …), 16 tries, answered 100%)
  edge mischief-answered knock [fun to keep]: the game answers it: provocation is already part of play (1 input (knock:derya:sport), 3 tries, answered 100%)
```

Reading, from the output only:

- Frustration fell from 3/3 to 0/3 for the unwinder, completionist, restless and mischief personas. The exploiter and rules-lawyer remain 3/3 frustrated.
- The completionist reached the Sunday meeting in 2 of 3 seeds and won both (the first build: no persona reached Sunday).
- The commuter played longer (18 min against 6.3) with no frustration.
- The returner fell from 7/8 returns to 0/3. Its sessions ended by agenda (2) or a Monday quit (1). I have not traced why; it is an open item for the next build.
- Frustration now comes from being caught (two stories meeting, a lie coming back), which is the intended price of the edge.
