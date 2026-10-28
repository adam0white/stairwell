/** Authored building scenes. Call inside the enclosing building transaction. */
import { FACTS, KAPICI, RIDS, type Rid } from './building-cast.ts';
import { applyBuildingEvents, type BuildingEvent, buildingEngine, buildingObservation } from './hf-game.ts';
import { currentTies } from './hf-readings.ts';
import { type BuildingWorld, buildingDay, sayBuilding, stampBuilding } from './hf-world.ts';
import { PRIVATE_FACTS, PRIVATE_LINES, STORY_FACTS, STORY_LINES } from './stories.ts';

const dayStart = (day: number) => (day - 1) * 1440;
const weekday = (w: BuildingWorld) => (w.month ? ((buildingDay(w) - 1) % 7) + 1 : buildingDay(w));
const resident = (w: BuildingWorld, who: Rid) => {
  const r = w.residents.find((entry) => entry.id === who);
  if (!r) throw Error('Missing building resident.');
  return r;
};
export function trustedStoryListenerBuilding(w: BuildingWorld, who: Rid): boolean {
  const tie = currentTies(buildingEngine(w), who).find((item) => item.otherId === KAPICI);
  return !!tie && tie.trust >= 0.58 && tie.affection >= 0.12;
}
/** This is an authored disclosure by the resident, not a generated conversation. */
export function storyClueBuilding(w: BuildingWorld, who: Rid, prop: string, words: string): void {
  if (w.secrets[prop] !== undefined) return;
  applyBuildingEvents(w, [
    buildingObservation(w, KAPICI, {
      channel: 'told',
      kind: 'fact',
      actorId: who,
      targetId: KAPICI,
      salience: 0.9,
      summary: words,
      claims: [{ prop, value: true, confidence: 0.95 }],
    }),
  ]);
  w.secrets[prop] = buildingDay(w);
  sayBuilding(w, who, words, 'voice');
  sayBuilding(w, 'narrator', 'You added a new line to the notebook.', 'event');
}
export function storySittingBuilding(w: BuildingWorld, who: Rid, topic?: 'boundaries'): void {
  if (!w.stories || resident(w, who).sits < 3 || !trustedStoryListenerBuilding(w, who)) return;
  if (who === 'hacer' || who === 'sevim') storyClueBuilding(w, who, STORY_FACTS[who], STORY_LINES[who]);
  if (who !== 'derya' || topic === 'boundaries')
    storyClueBuilding(w, who, PRIVATE_FACTS[who], PRIVATE_LINES[who]);
  if (who === 'tarik') storyClueBuilding(w, who, STORY_FACTS.instalments, STORY_LINES.instalments);
  if (who === 'burak' && w.boilerBroken && !w.stories.fund.bookRead) {
    w.stories.fund.bookRead = true;
    storyClueBuilding(w, who, STORY_FACTS.book, STORY_LINES.book);
  }
}
type Deliver = (
  world: BuildingWorld,
  who: Rid,
  prop: string,
  value: boolean,
  confidence: number,
  lie: boolean,
) => void;
export function storyTellBuilding(
  w: BuildingWorld,
  who: Rid,
  prop: string,
  value: boolean,
  deliver?: Deliver,
): boolean {
  if (
    !w.stories ||
    !Object.values(STORY_FACTS).some((fact) => fact === prop) ||
    !value ||
    w.secrets[prop] === undefined
  )
    return false;
  const f = w.stories.feud;
  const accepted =
    (who === 'sevim' && prop === STORY_FACTS.hacer) ||
    (who === 'hacer' && prop === STORY_FACTS.sevim) ||
    (who === 'burak' && prop === STORY_FACTS.instalments);
  if (!accepted) return false;
  if (!deliver) throw Error('Story testimony requires the player delivery callback.');
  if (who === 'sevim') f.hacerPassed = true;
  else if (who === 'hacer') f.sevimPassed = true;
  else w.stories.fund.consentPassed = true;
  deliver(w, who, prop, true, 0.95, false);
  sayBuilding(
    w,
    who,
    who === 'burak'
      ? 'He asked you to tell me? Ask me about the fund again. I’ll have the book ready.'
      : 'That is not how I remember it. Let me think. Perhaps we should speak ourselves.',
    'voice',
  );
  return true;
}
export function storyNewsBuilding(
  w: BuildingWorld,
  who: Rid,
  promiseDues?: (world: BuildingWorld) => void,
): boolean {
  const fund = w.stories?.fund;
  if (who !== 'burak' || !fund || !w.boilerBroken || !trustedStoryListenerBuilding(w, who)) return false;
  if (resident(w, who).sits >= 2 && !fund.bookRead) {
    fund.bookRead = true;
    storyClueBuilding(w, who, STORY_FACTS.book, STORY_LINES.book);
    return true;
  }
  if (!fund.bookRead || !fund.consentPassed || fund.agreed) return false;
  const day = buildingDay(w),
    tod = w.minute - dayStart(day);
  if (!w.month && (day > 6 || (day === 6 && tod > 18 * 60))) return false;
  if (w.month && !promiseDues) throw Error('Monthly agreement requires the dues commitment callback.');
  fund.agreed = true;
  if (w.month) w.month.repaymentAt = dayStart(Math.max(12, day + ((5 - weekday(w) + 7) % 7 || 7))) + 10 * 60;
  fund.repairAt = w.month
    ? dayStart(day + 1) + 10 * 60
    : day < 6
      ? dayStart(day + 1) + 10 * 60
      : dayStart(6) + 19 * 60;
  if (w.month) {
    w.month.supplierBalance = 600;
    w.month.invoiceDueAt = w.month.repaymentAt;
    promiseDues!(w);
  }
  sayBuilding(w, who, STORY_LINES.agreement, 'voice');
  return true;
}
export function storyEventsBuilding(w: BuildingWorld): void {
  if (!w.stories) return;
  const { feud, fund } = w.stories;
  if (
    w.castPauses?.hacer !== 'paused' &&
    w.castPauses?.sevim !== 'paused' &&
    !feud.reconciled &&
    feud.hacerPassed &&
    feud.sevimPassed &&
    weekday(w) === 6 &&
    w.minute - dayStart(buildingDay(w)) >= 17 * 60
  ) {
    const events: BuildingEvent[] = (
      [
        ['hacer', 'sevim'],
        ['sevim', 'hacer'],
      ] as const
    ).map(([person, other]) => ({
      kind: 'social.received',
      payload: {
        person,
        other,
        evidenceId: `stairwell:story-tea:${w.protocol.evidence++}`,
        event: { kind: 'gift', byMe: false, magnitude: 0.8 },
      },
    }));
    applyBuildingEvents(w, events);
    feud.reconciled = true;
    sayBuilding(w, 'narrator', STORY_LINES.tea, 'event');
    stampBuilding(w, 'two_cups');
  }
  if (fund.agreed && !fund.repaired && fund.repairAt !== null && w.minute >= fund.repairAt) {
    fund.repaired = true;
    w.boilerBroken = false;
    sayBuilding(w, 'narrator', STORY_LINES.repair, 'event');
    stampBuilding(w, 'warm_stairs');
  }
}
export function boilerFoundBuilding(w: BuildingWorld): void {
  w.boilerBroken = true;
  sayBuilding(
    w,
    'narrator',
    'The boiler’s pump has broken. A new one is ₺2,400. Mr Burak looked pale.',
    'event',
  );
  const events: BuildingEvent[] = [
    buildingObservation(w, KAPICI, {
      channel: 'told',
      kind: 'fact',
      actorId: 'burak',
      targetId: KAPICI,
      salience: 0.8,
      summary: 'the fund is thin',
      claims: [{ prop: FACTS.fund, value: true, confidence: 0.9 }],
    }),
  ];
  for (const id of RIDS)
    if (id !== 'burak' && w.castPauses?.[id] !== 'paused')
      events.push(
        buildingObservation(w, id, {
          channel: 'saw',
          kind: 'fact',
          summary: 'the building fund is short',
          claims: [{ prop: FACTS.fund, value: true, confidence: 0.6 }],
        }),
      );
  if (w.castPauses?.hacer !== 'paused')
    events.push(
      buildingObservation(w, 'hacer', {
        channel: 'saw',
        kind: 'fact',
        salience: 0.5,
        summary: 'no hot water again',
        claims: [{ prop: 'burak:dishonest', value: true, confidence: 0.62 }],
      }),
    );
  applyBuildingEvents(w, events);
  w.secrets[FACTS.fund] ??= buildingDay(w);
  sayBuilding(
    w,
    'burak',
    'The fund has too little money. Some flats are behind on their payments. I won’t say who.',
    'voice',
  );
}
export function tarikEnvelopeBuilding(w: BuildingWorld): void {
  w.tarik.envelope = true;
  applyBuildingEvents(w, [
    buildingObservation(w, KAPICI, {
      channel: 'saw',
      kind: 'fact',
      salience: 0.9,
      summary: 'Tarık’s envelope for the dues',
      claims: [{ prop: FACTS.dues, value: true, confidence: 0.95 }],
    }),
  ]);
  w.secrets[FACTS.dues] ??= buildingDay(w);
  sayBuilding(
    w,
    'tarik',
    'Take this down to Burak for me. It is part of my building payments. Don’t say anything to anyone, my child. My pension is late again.',
    'voice',
  );
  stampBuilding(w, 'envelope');
}
export function ringEveningBuilding(w: BuildingWorld): void {
  w.ring.asked = true;
  const discovered = w.secrets[PRIVATE_FACTS.burak] !== undefined;
  w.ring.answer = discovered ? 'yes' : 'not yet';
  if (discovered) {
    sayBuilding(
      w,
      'burak',
      'The little ferry moves when you pull this tab. Hold the harbour fold for me? I would rather show one person than announce it to the building.',
      'voice',
    );
    stampBuilding(w, 'paper_ferry');
  } else
    sayBuilding(
      w,
      'narrator',
      'Burak spent Saturday evening at his own table. You did not learn what he was making.',
      'event',
    );
}
