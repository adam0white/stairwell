/** Actual building encounters and their authored consequences. HF owns the
 * messages, personal norm understanding, belief revision and social response. */
import type { StepResult } from '@adam0white/human-framework';
import { KAPICI, RESIDENTS, type Rid } from './building-cast.ts';
import { claimWords, nameOf } from './building-words.ts';
import {
  applyBuildingEvents,
  type BuildingEvent,
  buildingEngine,
  buildingFloor,
  buildingObservation,
} from './hf-game.ts';
import { beliefProbability, currentBeliefs, currentBody, currentTies } from './hf-readings.ts';
import {
  type BuildingWorld,
  buildingDay,
  buildingPeopleTogether,
  sayBuilding,
  stampBuilding,
} from './hf-world.ts';
import { RELAY_POLICY } from './month.ts';
import { hashUnit } from './rng.ts';

type Claim = Extract<StepResult['events'][number]['data'], { kind: 'claim-told' }>['claim'];
const ORDINARY_CLAIMS: Record<Rid, number> = { hacer: 3, sevim: 2, burak: 2, derya: 2, tarik: 2 };
// Receiving-world scene budgets match canonical old public conversations. They
// intentionally do not reproduce the old kernel's trait-based cap calculation.
const resident = (world: BuildingWorld, id: Rid) => {
  const found = world.residents.find((resident) => resident.id === id);
  if (!found) throw Error('This encounter has no resident in the building.');
  return found;
};
const affection = (world: BuildingWorld, person: Rid, other: string) =>
  currentTies(buildingEngine(world), person).find((tie) => tie.otherId === other)?.affection ?? 0;
const evidence = (world: BuildingWorld, kind: string) => `stairwell:${kind}:${world.protocol.evidence++}`;
const pick = (world: BuildingWorld, lines: readonly string[]) => {
  const line =
    lines[Math.floor(hashUnit(world.seed, world.minute, lines.length, world.lineNo) * lines.length)];
  if (line === undefined) throw Error('The authored conversation has no line.');
  return line;
};
function selfObservation(
  world: BuildingWorld,
  person: Rid,
  prop: string,
  value: boolean,
  confidence: number,
): BuildingEvent {
  return buildingObservation(world, person, {
    channel: 'saw',
    kind: 'fact',
    summary: prop,
    claims: [{ prop, value, confidence }],
  });
}
function response(
  world: BuildingWorld,
  person: Rid,
  kind: 'insult' | 'conflict',
  magnitude: number,
  rule: string,
  multiplier?: number,
): BuildingEvent {
  return {
    kind: 'social.received',
    payload: {
      person,
      other: KAPICI,
      evidenceId: evidence(world, rule),
      event: { kind, byMe: false, magnitude },
      ...(multiplier === undefined
        ? {}
        : {
            sourceTrustResponse: {
              sourceId: KAPICI,
              multiplier,
              basis: {
                author: 'stairwell',
                ruleId: rule,
                edition: world.version.split('@')[1] ?? world.version,
              },
            },
          }),
    },
  };
}
function wordGetsBack(
  world: BuildingWorld,
  subject: Rid,
  from: Rid,
  prop: string,
  value: boolean,
  lie: boolean,
): void {
  resident(world, subject).grudges.push({ prop, from, at: world.minute, lie });
  const events = [
    response(world, subject, 'insult', lie ? 0.4 : 0.25, 'word-gets-back', lie ? 0.8 : undefined),
  ];
  if (lie) events.push(selfObservation(world, subject, 'kapici:dishonest', true, 0.75));
  applyBuildingEvents(world, events);
  sayBuilding(
    world,
    'narrator',
    `${nameOf(from)} repeated your comments about ${nameOf(subject)} to ${subject === 'burak' || subject === 'tarik' ? 'him' : 'her'}.`,
    'event',
  );
  stampBuilding(world, 'word_back');
  void value;
}
function doubtCaretaker(world: BuildingWorld, who: Rid, from: Rid, prop: string, value: boolean): void {
  applyBuildingEvents(world, [
    selfObservation(world, who, 'kapici:dishonest', true, 0.68),
    response(world, who, 'conflict', 0, 'known-false-story', 0.85),
  ]);
  resident(world, who).caught.push(world.minute);
  sayBuilding(
    world,
    'narrator',
    `${nameOf(from)} told ${nameOf(who)} what you had said: “${claimWords(prop, value)}” ${nameOf(who)} knows better.`,
    'event',
  );
}
function catchCaretaker(world: BuildingWorld, a: Rid, b: Rid): void {
  const events: BuildingEvent[] = [];
  for (const id of [a, b]) {
    events.push(
      buildingObservation(world, id, {
        channel: 'saw',
        kind: 'deceit',
        actorId: KAPICI,
        salience: 0.9,
        valence: -0.4,
        summary: 'the caretaker told us two different stories',
        claims: [{ prop: 'kapici:dishonest', value: true, confidence: 0.85 }],
      }),
    );
    if (!world.month) events.push(response(world, id, 'conflict', 0, 'compared-stories', 0.75));
    resident(world, id).caught.push(world.minute);
  }
  applyBuildingEvents(world, events);
  stampBuilding(world, 'caught');
  sayBuilding(
    world,
    'narrator',
    `${nameOf(a)} and ${nameOf(b)} compared notes. They noticed that you told them different stories.`,
    'event',
  );
  sayBuilding(
    world,
    'riza',
    'They always compare what you told them. Tell them the same thing or tell them nothing.',
    'margin',
  );
}
// This is the finite authored accusation vocabulary used by the building's
// word-gets-back scene, not HF's reputation weights or a judgement about truth.
const ACCUSATIONS = new Set(['stingy', 'nosy', 'cruel', 'lazy', 'dishonest', 'unreliable', 'owes']);
const COMPLIMENTS = new Set(['generous', 'kind', 'hardworking', 'honest', 'reliable']);
function unfavourableStory(prop: string, value: boolean): boolean {
  const trait = prop.split(':')[1] ?? '';
  return ACCUSATIONS.has(trait) ? value : COMPLIMENTS.has(trait) ? !value : false;
}
function nearTalk(world: BuildingWorld, where: string, a: Rid): boolean {
  if (world.k.walk || currentBody(buildingEngine(world), KAPICI).state.asleep) return false;
  const at = world.k.at;
  if (where === 'step') return ['step', 'room', 'landing:0', 'door:hacer'].includes(at);
  if (where === 'the stairs') {
    const span = resident(world, a).stairsFloors;
    return at !== 'bakery' && at !== 'shop' && buildingFloor(at) >= span[0] && buildingFloor(at) <= span[1];
  }
  const host = world.residents.find((resident) => `flat ${RESIDENTS[resident.id].flat}` === where);
  return (
    !!host &&
    buildingFloor(at) === RESIDENTS[host.id].floor &&
    (at.startsWith('door:') || at.startsWith('landing:'))
  );
}
/** Called within the enclosing world transaction, after actual co-location.
 * A returned claim exists only after an emitted item was actually received. */
export function talkResidentsBuilding(
  world: BuildingWorld,
  a: Rid,
  b: Rid,
  where: string,
  maxClaims?: number,
): void {
  if (!buildingPeopleTogether(world, a, b)) throw Error('These residents cannot hear each other here.');
  if (
    world.talks.some(
      (talk) =>
        world.minute - talk.at < 120 && ((talk.a === a && talk.b === b) || (talk.a === b && talk.b === a)),
    )
  )
    return;
  const near = nearTalk(world, where, a);
  if (affection(world, a, b) < -0.25 && affection(world, b, a) < -0.25) {
    if (near || where === 'step')
      sayBuilding(
        world,
        'narrator',
        `${nameOf(a)} and ${nameOf(b)} were at ${where === 'step' ? 'the step' : where}. They did not speak.`,
        'journal',
      );
    world.talks.push({ at: world.minute, a, b, where, props: [], overheard: near });
    return;
  }
  const props: string[] = [],
    heard: string[] = [];
  let receivedSpeech = false;
  const received: { from: Rid; to: Rid; prop: string; value: boolean; originAt: number; lie: boolean }[] = [];
  for (const [speaker, listener] of [
    [a, b],
    [b, a],
  ] as const) {
    const result = applyBuildingEvents(world, [
      {
        kind: 'conversation.requested',
        payload: {
          speaker,
          listener,
          topicIds: [],
          maxClaims: maxClaims ?? ORDINARY_CLAIMS[speaker],
          temptations: [],
          loyalWarning: !!world.month,
          ...(world.month ? { confidentMin: RELAY_POLICY[speaker] } : {}),
        },
      },
    ]);
    receivedSpeech ||= result.events.some(
      (event) =>
        event.data.kind === 'communication-settled' &&
        event.data.received.some((receipt) => receipt.recipient === listener && receipt.itemIds.length > 0),
    );
    const delivered = result.events.flatMap((event) =>
      event.data.kind === 'claim-told' && event.data.speaker === speaker && event.data.listener === listener
        ? [{ claim: event.data.claim as Claim, request: event.data.deliveryRequestId }]
        : [],
    );
    for (const { claim, request } of delivered) {
      props.push(claim.prop);
      if (world.month) {
        const previous = world.month.testimony.findLast(
          (item) => item.to === speaker && item.prop === claim.prop && item.value === claim.value,
        );
        const retained = currentBeliefs(buildingEngine(world), speaker)
          .find((belief) => belief.prop === claim.prop)
          ?.sources.some((source) => source.id === previous?.from && source.value === claim.value);
        const caretaker = retained && !claim.deceit ? previous?.caretaker : undefined;
        if (caretaker)
          received.push({
            from: speaker,
            to: listener,
            prop: claim.prop,
            value: claim.value,
            originAt: caretaker.at,
            lie: caretaker.lie,
          });
        world.month.testimony.push({
          from: speaker,
          to: listener,
          prop: claim.prop,
          value: claim.value,
          at: world.minute,
          ...(caretaker ? { caretaker } : {}),
        });
        if (
          claim.about === listener &&
          caretaker &&
          !resident(world, listener).grudges.some(
            (grudge) => grudge.prop === claim.prop && grudge.from === speaker,
          )
        )
          wordGetsBack(world, listener, speaker, claim.prop, claim.value, caretaker.lie);
      }
      if (!(claim.prop === 'notice:water' && world.minute >= 2 * 1440 + 600))
        heard.push(`${nameOf(speaker)}: ${claimWords(claim.prop, claim.value)}`);
      if (near)
        applyBuildingEvents(world, [
          buildingObservation(world, KAPICI, {
            channel: 'heard',
            kind: 'claim',
            actorId: speaker,
            targetId: KAPICI,
            salience: 0.7,
            summary: claimWords(claim.prop, claim.value),
            provenance: [request],
            claims: [
              {
                prop: claim.prop,
                value: claim.value,
                confidence: claim.confidence,
                ...(claim.origin === undefined ? {} : { origin: claim.origin }),
                ...(claim.lineage === undefined ? {} : { lineage: claim.lineage }),
              },
            ],
          }),
        ]);
    }
  }
  if (!receivedSpeech) {
    world.talks.push({ at: world.minute, a, b, where, props: [], overheard: near });
    if (world.talks.length > 300) world.talks.splice(0, world.talks.length - 300);
    if (near)
      sayBuilding(
        world,
        'narrator',
        `${nameOf(a)} and ${nameOf(b)} did not exchange an audible message.`,
        'journal',
      );
    return;
  }
  for (const [speaker, listener] of [
    [a, b],
    [b, a],
  ] as const)
    for (const told of resident(world, speaker).told) {
      if (!props.includes(told.prop) || world.month) continue;
      const belief = beliefProbability(buildingEngine(world), listener, told.prop);
      if (
        (told.value ? 1 - belief : belief) >= 0.75 &&
        !resident(world, listener).caught.some((minute) => world.minute - minute < 600)
      )
        doubtCaretaker(world, listener, speaker, told.prop, told.value);
    }
  if (world.month)
    for (const receipt of received) {
      const belief = beliefProbability(buildingEngine(world), receipt.to, receipt.prop);
      const key = `${receipt.to}:${receipt.prop}:${receipt.value}:${receipt.originAt}`;
      if ((receipt.value ? 1 - belief : belief) >= 0.75 && !world.month.accusations.includes(key)) {
        world.month.accusations.push(key);
        doubtCaretaker(world, receipt.to, receipt.from, receipt.prop, receipt.value);
      }
    }
  if (!world.month)
    for (const [speaker, subject] of [
      [a, b],
      [b, a],
    ] as const) {
      if (affection(world, speaker, subject) <= 0.2) continue;
      for (const told of resident(world, speaker).told) {
        if (
          !props.includes(told.prop) ||
          !told.prop.startsWith(`${subject}:`) ||
          resident(world, subject).grudges.some((grudge) => grudge.prop === told.prop) ||
          !unfavourableStory(told.prop, told.value)
        )
          continue;
        wordGetsBack(world, subject, speaker, told.prop, told.value, told.lie);
      }
    }
  const talk = { at: world.minute, a, b, where, props, overheard: near, caught: false };
  world.talks.push(talk);
  if (world.talks.length > 300) world.talks.splice(0, world.talks.length - 300);
  const spoken = new Set(props);
  const caught = resident(world, a).told.some(
    (x) =>
      spoken.has(x.prop) && resident(world, b).told.some((y) => y.prop === x.prop && y.value !== x.value),
  );
  let comparisonNew = !world.month;
  if (caught && world.month && received.length) {
    const result = applyBuildingEvents(
      world,
      received.map((receipt) => ({
        kind: 'contradiction.received',
        payload: {
          person: receipt.to,
          sourceId: KAPICI,
          prop: receipt.prop,
          value: receipt.value,
          reporterId: receipt.from,
          evidenceId: evidence(world, 'compared-accounts'),
        },
      })),
    );
    comparisonNew = result.events.some(
      (event) => event.data.kind === 'contradiction-checked' && event.data.disposition === 'applied',
    );
  }
  if (caught && comparisonNew) {
    talk.caught = true;
    catchCaretaker(world, a, b);
  }
  const place = where === 'step' ? 'on the step' : where === 'the stairs' ? 'on the stairs' : `in ${where}`;
  if (near) {
    const dayStart = (buildingDay(world) - 1) * 1440;
    const old = new Set(
      world.said.filter((line) => line.kind === 'heard' && line.at >= dayStart).map((line) => line.text),
    );
    const fresh = heard.filter((line) => !old.has(line));
    const opener = `${nameOf(a)} and ${nameOf(b)} were talking ${place}. You could hear them.`;
    if (!fresh.length && world.said.some((line) => line.at >= dayStart && line.text === opener)) return;
    sayBuilding(world, 'narrator', opener, 'journal');
    for (const line of fresh.slice(0, 4)) sayBuilding(world, 'narrator', line, 'heard');
    if (!fresh.length)
      sayBuilding(
        world,
        'narrator',
        heard.length
          ? pick(world, ['You have already heard these stories today.', 'They repeated the same stories.'])
          : 'You could not make out a claim.',
        'heard',
      );
  } else if (where !== 'the stairs' || props.length)
    sayBuilding(
      world,
      'narrator',
      `${nameOf(a)} and ${nameOf(b)} talked ${place}${props.length ? ' for a while' : ''}.`,
      'journal',
    );
}
