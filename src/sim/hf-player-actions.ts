/** Authored face-to-face scenes. Every decision, duty and activity goes through HF. */
import type { Offer } from '@adam0white/human-framework';
import { KAPICI, type Rid } from './building-cast.ts';
import { SIT_LINES } from './building-copy.ts';
import { nameOf } from './building-words.ts';
import { buildingOffer } from './hf-authoring.ts';
import {
  applyBuildingEvents,
  buildingEngine,
  buildingObservation,
  chooseBuilding,
  deliverBuilding,
  interruptBuildingPerson,
} from './hf-game.ts';
import { currentBody, currentTies } from './hf-readings.ts';
import { atMinute, HF_MINUTE } from './hf-run.ts';
import { storySittingBuilding } from './hf-stories.ts';
import { type BuildingWorld, buildingDay, buildingPeopleTogether, sayBuilding } from './hf-world.ts';
import { PRIVATE_LINES, STORY_LINES } from './stories.ts';

function resident(world: BuildingWorld, id: Rid) {
  const found = world.residents.find((resident) => resident.id === id);
  if (!found) throw Error('The authored resident is missing.');
  return found;
}
export function canSpeakBuilding(world: BuildingWorld, id: Rid): boolean {
  if (
    buildingPeopleTogether(world, KAPICI, id) &&
    !currentBody(buildingEngine(world), KAPICI).state.asleep &&
    !currentBody(buildingEngine(world), id).state.asleep
  )
    return true;
  sayBuilding(world, 'narrator', `${nameOf(id)} is not here. You need to meet face to face.`, 'journal');
  return false;
}
export function caretakerScene(
  world: BuildingWorld,
  id: string,
  action: string,
  minutes: number,
  effort: number,
): boolean {
  interruptBuildingPerson(world, KAPICI, 'The caretaker starts the authored face-to-face scene.');
  const offer = buildingOffer(KAPICI, `scene:${id}`, action, minutes, {
    demands: { effort, focus: 0, mode: 'awake', requires: {} },
  });
  const choice = chooseBuilding(world, KAPICI, [offer], 'The caretaker attempts the authored scene.');
  if (choice.chosenAffordanceId !== offer.id) return false;
  world.k.walk = { from: world.k.at, to: world.k.at, at0: world.minute, at1: world.minute + minutes };
  return true;
}
export function sitBuilding(world: BuildingWorld, who: Rid, topic?: 'boundaries'): void {
  if (!canSpeakBuilding(world, who)) return;
  const person = resident(world, who);
  if (person.sitDay === buildingDay(world)) {
    sayBuilding(world, who, 'Another time. You have work, and so do I.', 'voice');
    return;
  }
  if (!caretakerScene(world, `sit:${who}`, 'rest', 10, 0.02)) return;
  person.sitDay = buildingDay(world);
  const boundaries =
    'Work boundaries and training? I want to choose what I tell you. Nursing does not make me available to the whole building.';
  const line =
    who === 'derya' && topic === 'boundaries'
      ? world.said.some((entry) => entry.who === who && entry.text === boundaries)
        ? undefined
        : boundaries
      : SIT_LINES[who][person.sits];
  if (line) sayBuilding(world, who, line, 'voice');
  else sayBuilding(world, 'narrator', `You sit quietly with ${nameOf(who)}.`, 'journal');
  person.sits++;
  applyBuildingEvents(world, [
    {
      kind: 'social.received',
      payload: {
        person: who,
        other: KAPICI,
        evidenceId: `stairwell:sitting:${world.protocol.evidence++}`,
        event: { kind: 'chat', byMe: false, magnitude: 0.3 },
      },
    },
  ]);
  storySittingBuilding(world, who, topic);
}
export function canReplyBuilding(world: BuildingWorld, who: Rid): boolean {
  const sit = [...world.inputs].reverse().find((input) => input.kind === 'sit' || input.kind === 'reply');
  const line =
    sit?.kind === 'sit'
      ? [...world.said]
          .reverse()
          .find(
            (entry) =>
              entry.at === sit.at &&
              ((entry.who === who && entry.kind === 'voice') ||
                (entry.who === 'narrator' && entry.text === `You sit quietly with ${nameOf(who)}.`)),
          )
      : undefined;
  const authored =
    line?.who === who &&
    [
      ...SIT_LINES[who],
      ...Object.values(PRIVATE_LINES),
      ...Object.values(STORY_LINES),
      'Work boundaries and training? I want to choose what I tell you. Nursing does not make me available to the whole building.',
    ].includes(line.text);
  return (
    !!authored &&
    !world.pendingReply &&
    sit?.kind === 'sit' &&
    sit.who === who &&
    world.minute - sit.at <= 30 &&
    buildingPeopleTogether(world, KAPICI, who) &&
    !world.k.walk &&
    world.k.busyTask === null
  );
}
export function replyBuilding(world: BuildingWorld, who: Rid, reply: 'thank' | 'listen'): void {
  if (!canReplyBuilding(world, who) || !canSpeakBuilding(world, who)) return;
  if (!caretakerScene(world, `reply:${who}`, 'talk', 2, 0.02)) return;
  sayBuilding(world, KAPICI, reply === 'thank' ? 'Thank you for telling me.' : 'I am listening.', 'voice');
  interruptBuildingPerson(world, who, 'The resident considers a reply.');
  const choice = chooseBuilding(
    world,
    who,
    [
      buildingOffer(who, 'reply-continue', 'talk', 2, {
        label: 'respond',
        target: KAPICI,
        expected: { needs: { belonging: 0.04 }, followedBy: [], provenance: [] },
      }),
      buildingOffer(who, 'reply-stop', 'wait', 2, {
        label: 'leave the subject',
        expected: { needs: { autonomy: 0.1 }, followedBy: [], provenance: [] },
      }),
    ],
    'The resident chooses whether to continue.',
  );
  const caretaker = buildingEngine(world).active.find(
    (activity) => activity.person === KAPICI && activity.offer.id === `scene:reply:${who}`,
  );
  const listener = buildingEngine(world).active.find(
    (activity) => activity.person === who && activity.offer.id === choice.chosenAffordanceId,
  );
  // The interrupted routine no longer owns the resident's next boundary.
  // A rejected offer leaves the next ordinary decision available.
  resident(world, who).until = listener
    ? Math.ceil((listener.start + listener.offer.durationMs - world.protocol.phase) / HF_MINUTE)
    : world.minute + 1;
  if (caretaker && listener)
    world.pendingReply = {
      who,
      accepted: choice.chosenAffordanceId === 'reply-continue',
      caretakerId: caretaker.id,
      residentId: listener.id,
      caretakerStatus: null,
      residentStatus: null,
    };
}

export function buildingWordOffers(person: string): Offer[] {
  return [
    buildingOffer(person, 'promise_word', 'help', 2, {
      label: 'promise a word for the caretaker',
      target: KAPICI,
      tags: ['help'],
      expected: { needs: { belonging: 0.04 }, followedBy: [], provenance: [] },
    }),
    buildingOffer(person, 'demur', 'wait', 2, {
      label: 'make no promise',
      expected: { needs: { autonomy: 0.1 }, followedBy: [], provenance: [] },
    }),
  ];
}
export function askWordBuilding(world: BuildingWorld, who: Rid): void {
  if (!canSpeakBuilding(world, who)) return;
  const person = resident(world, who);
  if (person.word) {
    sayBuilding(
      world,
      who,
      person.word === 'yes' ? 'I said I would. Don’t ask twice.' : 'I told you already.',
      'voice',
    );
    return;
  }
  const day = buildingDay(world),
    weekday = world.month ? ((day - 1) % 7) + 1 : day;
  if (weekday < 4) {
    sayBuilding(world, who, 'Ask me from Thursday. We’ll see then.', 'voice');
    return;
  }
  interruptBuildingPerson(world, who, 'The resident considers the caretaker’s direct request.');
  const decision = chooseBuilding(
    world,
    who,
    buildingWordOffers(who),
    'The resident weighs the caretaker’s request for a word at the meeting.',
    {
      voiceId: KAPICI,
      affordanceId: 'promise_word',
      strength: 0.5,
      adviceId: `stairwell:word:${world.protocol.evidence++}`,
    },
  );
  person.until = world.minute + 2;
  if (decision.chosenAffordanceId !== 'promise_word') {
    person.word = 'no';
    return;
  }
  person.word = 'yes';
  const affection =
    currentTies(buildingEngine(world), who).find((tie) => tie.otherId === KAPICI)?.affection ?? 0;
  const sunday = world.month ? Math.ceil(day / 7) * 7 : 7;
  applyBuildingEvents(world, [
    {
      kind: 'agenda.requested',
      payload: {
        person: who,
        request: {
          type: 'commit',
          commitment: {
            id: `stairwell:word-duty:${world.protocol.evidence++}`,
            kind: 'promise',
            toId: KAPICI,
            label: 'my word for the caretaker',
            actions: ['help'],
            targetId: KAPICI,
            from: atMinute((sunday - 1) * 1440 + 630),
            until: atMinute((sunday - 1) * 1440 + 720),
            importance: 0.04 + 0.2 * Math.max(0, affection),
            normId: 'keep-promise',
          },
        },
      },
    },
  ]);
}

export function knockBuilding(world: BuildingWorld, who: Rid): void {
  if (world.k.at !== `door:${who}` || world.k.walk) return;
  const person = resident(world, who);
  if (person.where !== 'asleep') {
    sayBuilding(
      world,
      'narrator',
      person.where === 'home' ? `${nameOf(who)} is already at the door.` : 'Nobody answers.',
      'journal',
    );
    return;
  }
  interruptBuildingPerson(world, who, 'The actual doorbell interrupts the resident’s sleep.');
  if (currentBody(buildingEngine(world), who).state.asleep)
    throw Error('The actual doorbell has not ended this sleep. The notebook has not changed.');
  world.knocks++;
  applyBuildingEvents(world, [
    {
      kind: 'social.received',
      payload: {
        person: who,
        other: KAPICI,
        evidenceId: `stairwell:doorbell:${world.protocol.evidence++}`,
        event: { kind: 'insult', byMe: false, magnitude: Math.min(1, 0.2 + 0.15 * world.knocks) },
      },
    },
  ]);
  person.where = 'home';
  person.doing = 'answering the door';
  person.until = world.minute + 6;
  if (world.knocks === 1) {
    sayBuilding(world, who, 'I’ve been on shift all night. What is it?', 'voice');
    sayBuilding(
      world,
      'riza',
      'Derya sleeps until three. Leave her bread on the hook. Never ring the bell.',
      'margin',
    );
  } else if (world.knocks === 2) {
    sayBuilding(world, who, 'Again? Do you know what time I got in?', 'voice');
    sayBuilding(
      world,
      'narrator',
      'Across the landing, Burak’s door opened an inch and closed again.',
      'event',
    );
    applyBuildingEvents(world, [
      buildingObservation(world, 'burak', {
        channel: 'saw',
        kind: 'fact',
        summary: 'the caretaker rang the sleeping resident again',
        claims: [{ prop: 'kapici:kind', value: false, confidence: 0.65 }],
      }),
    ]);
  } else {
    sayBuilding(world, who, 'That’s it. I’m telling Mr Burak.', 'voice');
    applyBuildingEvents(
      world,
      ['burak', 'hacer'].map((person) =>
        buildingObservation(world, person, {
          channel: 'heard',
          kind: 'fact',
          actorId: who,
          summary: 'the caretaker repeatedly disturbed the night worker',
          claims: [{ prop: 'kapici:kind', value: false, confidence: 0.7 }],
        }),
      ),
    );
  }
  deliverBuilding(world, world.k.at);
}
