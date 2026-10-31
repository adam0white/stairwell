/** Native building operations under migration. The ordinary UI is switched only
 * after all world scenes use this shared Run and the complete replay gates pass.
 */

import {
  type Input as EngineInput,
  type Offer,
  type Payloads,
  type PerceptData,
  type PersonAuthoring,
  validatePortablePerson,
} from '@adam0white/human-framework';
import { canonicalPersona, type LifePreparation } from '@adam0white/lab-client';
import { KAPICI, RESIDENTS, RIDS, type Rid } from './building-cast.ts';
import { JOB_THANKS, LATE_LINES, THANKS } from './building-copy.ts';
import { assertPlainBuildingData, decodeBuildingInput, decodeBuildingWorld } from './building-decode.ts';
import type { NewInput, Place, Task } from './building-types.ts';
import { buildingOffer, buildingSpec, emptyPortableOpening, OPENING, openingPerson } from './hf-authoring.ts';
import { checkBuildingPortable } from './hf-cast.ts';
import { endBuildingDay, waterOffBuilding } from './hf-day.ts';
import { meetingBuilding } from './hf-meeting.ts';
import {
  mischiefActionObservations,
  misdeliverBuilding,
  prankBuilding,
  sceneEffectsBuilding,
} from './hf-mischief.ts';
import {
  monthEvents,
  monthVisitOffers,
  promiseDues,
  resolveMonthAction,
  validateMonthVisits,
} from './hf-month.ts';
import {
  arrangeRepaymentBuilding,
  entrustBuilding,
  helpStoryBuilding,
  inviteSeatBuilding,
  meetingSeatsBuilding,
  resolveMeetingSeatAction,
  settleMeetingSeatsBuilding,
  validateMeetingSeatsBuilding,
} from './hf-month-player.ts';
import {
  askWordBuilding,
  caretakerScene,
  knockBuilding,
  replyBuilding,
  sitBuilding,
} from './hf-player-actions.ts';
import { askNewsBuilding, inventBuilding, tellBuilding } from './hf-player-speech.ts';
import { beliefProbability, currentAgenda, currentBody, currentTies } from './hf-readings.ts';
import { decideResidentBuilding } from './hf-residents.ts';
import { atMinute, type BuildingResolver, BuildingRun, HF_MINUTE } from './hf-run.ts';
import { talkResidentsBuilding } from './hf-speech.ts';
import {
  boilerFoundBuilding,
  ringEveningBuilding,
  storyEventsBuilding,
  tarikEnvelopeBuilding,
} from './hf-stories.ts';
import {
  type BuildingEdition,
  type BuildingWorld,
  buildingPeopleTogether,
  openingWorld,
  planDay,
  reportBuilding,
  sayBuilding,
} from './hf-world.ts';
import { PRIVATE_WORK } from './month.ts';
import { applyHostLife, validateNativeLifeInputs, validateNativeLifeOpening } from './native-cast-life.ts';
import { DRAW, hashUnit } from './rng.ts';

const engines = new WeakMap<BuildingWorld, BuildingRun<BuildingWorld>>();
export function buildingEngine(world: BuildingWorld): BuildingRun<BuildingWorld> {
  const engine = engines.get(world);
  if (!engine) throw Error('This building needs its complete HF archive. Keep the source notebook.');
  return engine;
}
export function restoreBuilding(checkpoint: unknown): BuildingWorld {
  const engine = BuildingRun.restore(checkpoint, decodeBuildingWorld);
  const world = engine.world,
    archive = engine.checkpoint().archive;
  const expected = buildingSpec(world.seed, world.version);
  expected.world.hostState = { format: 'stairwell-hf-world/1', receipts: 0, active: [] };
  if (
    engine.now !== mappedTime(world) ||
    canonicalPersona(archive.initial.spec) !== canonicalPersona(expected) ||
    archive.initial.people.length !== RIDS.length + 1 ||
    canonicalPersona(archive.initial.people.map((person) => person.id).sort()) !==
      canonicalPersona([...RIDS, KAPICI].sort())
  )
    throw Error('This building clock or authored opening does not match its HF archive. Keep the file.');
  validateNativeLifeOpening(world.nativeLife ?? [], archive.initial.people);
  const expectedPeople = archive.initial.people.map((person) => {
    const template = openingPerson(person.id as Parameters<typeof openingPerson>[0]);
    if (person.portable)
      checkBuildingPortable(
        {
          person: validatePortablePerson(person.portable.person),
          mapping: structuredClone(person.portable.mapping),
        },
        person.id,
        OPENING,
      );
    return person.portable
      ? {
          ...emptyPortableOpening(template),
          portable: {
            person: validatePortablePerson(person.portable.person),
            mapping: structuredClone(person.portable.mapping),
          },
        }
      : template;
  });
  // This detached public construction canonicalizes the retained birth/sex and
  // validates the complete portable input. Fresh fiction cannot be replaced by
  // an arbitrary same-id actor in an otherwise valid HF archive.
  const canonicalOpening = BuildingRun.open(
    buildingSpec(world.seed, world.version),
    expectedPeople,
    openingWorld(world.seed, world.version as BuildingEdition),
  );
  if (
    canonicalPersona(canonicalOpening.checkpoint().archive.initial.people) !==
    canonicalPersona(archive.initial.people)
  )
    throw Error(
      'This character opening does not match its recorded fresh or retained source. Keep the file.',
    );
  validateMonthVisits(world, engine);
  validateMeetingSeatsBuilding(world, engine);
  engines.set(world, engine);
  return world;
}
function input<K extends keyof Payloads>(
  world: BuildingWorld,
  at: number,
  kind: K,
  payload: Payloads[K],
): EngineInput {
  return {
    id: `stairwell:${world.protocol.sequence++}`,
    at,
    source: { type: 'host', id: 'stairwell' },
    kind,
    payload,
  } as EngineInput;
}
export type BuildingEvent = { [K in keyof Payloads]: { kind: K; payload: Payloads[K] } }[keyof Payloads];
export function buildingObservation(
  world: BuildingWorld,
  person: string,
  data: Pick<PerceptData, 'kind' | 'channel' | 'summary'> & Partial<PerceptData>,
): BuildingEvent {
  const id = `stairwell:observation:${world.protocol.evidence++}`;
  return {
    kind: 'observation.received',
    payload: {
      person,
      evidenceId: id,
      percepts: [
        {
          id,
          occurredAt: buildingEngine(world).now,
          claims: [],
          norms: [],
          advice: [],
          consequences: [],
          withdrawConsequences: [],
          witnesses: [],
          reports: [],
          provenance: [id],
          salience: 0.6,
          ...data,
        },
      ],
    },
  };
}
function mappedTime(world: BuildingWorld, minute = world.minute): number {
  if (
    !Number.isSafeInteger(world.protocol.phase) ||
    world.protocol.phase < 0 ||
    world.protocol.phase >= HF_MINUTE
  )
    throw Error('This notebook has an invalid millisecond input phase. Keep the source file.');
  return atMinute(minute) + world.protocol.phase;
}
export function applyBuildingEvents(world: BuildingWorld, events: readonly BuildingEvent[]) {
  if (!events.length) throw Error('An authored ingress batch must contain an actual event.');
  if (world.protocol.phase + 1 >= HF_MINUTE)
    throw Error(
      'This notebook has used its millisecond input positions. Keep the file; no time has been changed.',
    );
  // One millisecond position per authored BATCH, never per actor, member
  // input, reading or HF resolution. Logical minute budgets stay unchanged.
  world.protocol.phase++;
  const at = mappedTime(world),
    engine = buildingEngine(world);
  if (at <= engine.now) throw Error('The recorded building clock cannot submit this batch in the past.');
  const inputs = events.map((event) => input(world, at, event.kind, event.payload));
  const logicalMinute = world.minute;
  const result = engine.advance(at, resolver(engine), inputs);
  world.minute = logicalMinute;
  world.protocol.ingresses.push({
    phase: world.protocol.phase,
    minute: world.minute,
    inputIds: inputs.map((input) => input.id),
  });
  return result;
}
/** Host-authored interruption through the existing owner input, within the
 * enclosing world transaction. No actor field is patched. */
export function interruptBuildingPerson(world: BuildingWorld, person: string, reason: string): void {
  const active = buildingEngine(world).active.find((activity) => activity.person === person);
  if (active)
    applyBuildingEvents(world, [
      { kind: 'activity.interrupted', payload: { person, activityId: active.id, reason } },
    ]);
}
export function buildingIngress(world: BuildingWorld, events: readonly BuildingEvent[]) {
  return buildingTransaction(world, (candidate) => applyBuildingEvents(candidate, events));
}
function resolver(engine: BuildingRun<BuildingWorld>): BuildingResolver<BuildingWorld> {
  return {
    action(world, request, activity) {
      world.minute = Math.floor(request.boundaryAt / HF_MINUTE);
      const seatsReply = resolveMeetingSeatAction(world, request, activity, engine);
      if (seatsReply) return seatsReply;
      const monthReply = resolveMonthAction(world, request, activity, engine);
      if (monthReply) return monthReply;
      if (request.stage === 'start') return { disposition: 'accepted', observations: [] };
      const status = request.stage === 'finish' ? 'completed' : 'interrupted';
      const minute = Math.floor(request.boundaryAt / HF_MINUTE);
      if (world.pendingReply?.caretakerId === activity.id) world.pendingReply.caretakerStatus = status;
      if (world.pendingReply?.residentId === activity.id) world.pendingReply.residentStatus = status;
      const actual: NonNullable<ReturnType<BuildingResolver<BuildingWorld>['action']>['outcome']>['actual'] =
        {
          exposures: [],
          observedProgress: [],
          material: 0,
        };
      if (status === 'completed') {
        if (activity.offer.actionId === 'eat')
          actual.consumed =
            activity.offer.id.startsWith('night-meal:') || activity.offer.id === 'sunday-meal'
              ? { food: 0.6, water: 0.6 }
              : { food: 0.5, water: 0.45 };
        if (activity.offer.actionId === 'rest' && activity.offer.id !== 'sunday-rest')
          actual.consumed = { water: activity.person === KAPICI ? 0.1 : 0.08 };
        if (
          activity.offer.actionId === 'visit' ||
          (activity.offer.actionId === 'sit' && activity.offer.id === 'step')
        )
          actual.psychological = { belonging: 0.12 };
        if (activity.person === KAPICI && activity.offer.id.startsWith('scene:') && world.k.walk) {
          if (world.k.walk.from !== world.k.walk.to)
            throw Error('The accepted scene does not match its host interval.');
          world.k.walk = null;
        }
        if (activity.person === KAPICI && activity.offer.actionId === 'walk' && world.k.walk) {
          world.k.at = world.k.walk.to;
          world.k.walk = null;
          world.protocol.arrivals.push({ at: minute, place: world.k.at });
        }
        if (activity.person === KAPICI && activity.offer.id.startsWith('job:')) {
          const task = world.tasks.find((task) => activity.offer.id === `job:${task.id}`);
          if (!task || world.k.busyTask !== task.id || task.done !== undefined)
            throw Error('The completed work does not match the building job.');
          world.protocol.finishedTasks.push({ task: task.id, at: minute, hook: false });
          world.k.busyTask = null;
        }
      }
      // Availability and consequences are the host's actual evidence. Expected
      // advertisements are never copied into the outcome as completed needs.
      void engine;
      const observations: PerceptData[] =
        activity.offer.id === 'derya-night-work' && status === 'completed'
          ? [
              {
                id: `night-work:${request.id}`,
                occurredAt: request.boundaryAt,
                channel: 'saw',
                kind: 'night-work',
                actorId: 'derya',
                summary: 'I finished the night shift and came home to flat 5.',
                salience: 1,
                valence: 0.1,
                claims: [],
                norms: [],
                advice: [],
                consequences: [],
                withdrawConsequences: [],
                witnesses: [],
                reports: [],
                provenance: [`outcome:${request.id}`],
              },
            ]
          : [];
      observations.push(...mischiefActionObservations(world, request, activity));
      return {
        disposition: status,
        observations: observations.length ? [{ person: activity.person, percepts: observations }] : [],
        outcome: {
          activityId: activity.id,
          offerId: activity.offer.id,
          actionId: activity.offer.actionId,
          ...(activity.offer.target === undefined ? {} : { target: activity.offer.target }),
          start: activity.start,
          end: request.boundaryAt,
          status,
          evidenceId: `outcome:${request.id}`,
          summary: activity.offer.label,
          actual,
          fulfills: status === 'completed' ? activity.offer.fulfills : [],
          advances: status === 'completed' ? activity.offer.advances : [],
        },
      };
    },
    communication(world, request) {
      world.minute = Math.floor(request.boundaryAt / HF_MINUTE);
      const speaker = currentBody(engine, request.speaker).state;
      const itemIds = speaker.alive && !speaker.asleep ? request.items.map((item) => item.id) : [];
      return {
        emittedItemIds: itemIds,
        received: request.recipients
          .filter((recipient) => {
            const body = currentBody(engine, recipient).state;
            return body.alive && !body.asleep && buildingPeopleTogether(world, request.speaker, recipient);
          })
          .map((recipient) => ({
            recipient,
            evidenceId: `heard:${request.id}:${recipient}`,
            attention: 1,
            itemIds,
          })),
      };
    },
  };
}

export function buildingTransaction<T>(world: BuildingWorld, operation: (candidate: BuildingWorld) => T): T {
  const engine = buildingEngine(world);
  return engine.transaction((candidate) => {
    const staged = candidate.world;
    engines.set(staged, candidate);
    try {
      return operation(staged);
    } finally {
      if (staged !== world) engines.delete(staged);
    }
  });
}

function acknowledgeFoundWork(world: BuildingWorld): void {
  for (const work of world.pendingWork) {
    const resident = world.residents.find((person) => person.id === work.who);
    if (resident?.where === 'home') work.found = true;
    if (
      work.found &&
      buildingPeopleTogether(world, KAPICI, work.who) &&
      !currentBody(buildingEngine(world), work.who).state.asleep
    ) {
      sayBuilding(world, work.who, `I noticed the work you did: ${work.label}. Thank you.`, 'voice');
      world.pendingWork = world.pendingWork.filter((item) => item !== work);
    }
  }
}

export function completeBuildingTask(
  world: BuildingWorld,
  task: Task,
  hook: boolean,
  at = world.minute,
): void {
  if (task.done !== undefined) return;
  const late = at > task.by,
    report = reportBuilding(world);
  task.done = at;
  task.hook = hook;
  if (world.month && task.storyFor && !late) {
    world.month.helped[task.storyFor] = true;
    sayBuilding(world, 'narrator', PRIVATE_WORK[task.storyFor].outcome, 'event');
    if (!world.stamps.some((stamp) => stamp.id === `private_${task.storyFor}`))
      world.stamps.push({ id: `private_${task.storyFor}`, day: Math.floor(at / 1440) + 1 });
  }
  if (task.kind === 'bins') {
    sayBuilding(
      world,
      'narrator',
      late
        ? 'The truck comes at 20:45. It had already gone, so the bins stayed on the pavement all night.'
        : 'The bins were out before the truck.',
      'journal',
    );
    applyBuildingEvents(
      world,
      world.residents
        .filter((resident) => world.castPauses?.[resident.id] !== 'paused')
        .map((resident) => ({
          kind: 'social.received',
          payload: {
            person: resident.id,
            evidenceId: `bins:${task.id}:${resident.id}`,
            other: KAPICI,
            event: { kind: late ? 'harm' : 'help', byMe: false, magnitude: 0.06 },
          },
        })),
    );
    return;
  }
  if (world.castPauses?.[task.for] === 'paused') {
    if (late) report.late++;
    else report.done++;
    sayBuilding(
      world,
      'narrator',
      `${RESIDENTS[task.for].name}’s chapter is paused. You left the delivery at the door. Nobody answered.`,
      'journal',
    );
    return;
  }
  const events: BuildingEvent[] = [
    {
      kind: 'social.received',
      payload: {
        person: task.for,
        evidenceId: `help:${task.id}`,
        other: KAPICI,
        event: { kind: 'help', byMe: false, magnitude: late ? 0.04 : 0.14 },
      },
    },
  ];
  if (
    (!late && beliefProbability(buildingEngine(world), task.for, 'kapici:reliable') < 0.8) ||
    (late && at > task.by + 45)
  )
    events.push(
      buildingObservation(world, task.for, {
        channel: 'saw',
        kind: 'fact',
        summary: 'kapici:reliable',
        claims: [
          {
            prop: 'kapici:reliable',
            value: !late,
            confidence: late ? 0.6 : 0.62,
          },
        ],
      }),
    );
  applyBuildingEvents(world, events);
  if (hook) {
    if (late) report.late++;
    else report.done++;
    sayBuilding(
      world,
      'narrator',
      `You hung ${RESIDENTS[task.for].name}’s ${task.kind === 'bread' ? 'bread' : 'bag'} on the door handle.`,
      'journal',
    );
    return;
  }
  const resident = world.residents.find((resident) => resident.id === task.for);
  const present = resident?.where === 'home' || (world.k.at === 'step' && resident?.where === 'step');
  if (!present) {
    if (task.kind === 'job')
      world.pendingWork.push({ who: task.for, task: task.id, label: task.label, found: false });
    if (late) report.late++;
    else report.done++;
    sayBuilding(
      world,
      'narrator',
      `${RESIDENTS[task.for].name} had gone out. ${task.for === 'burak' || task.for === 'tarik' ? 'He' : 'She'} will find the work done on coming home.`,
      'journal',
    );
    return;
  }
  const affection =
    currentTies(buildingEngine(world), task.for).find((tie) => tie.otherId === KAPICI)?.affection ?? 0;
  const give: Record<Rid, number> = { hacer: 1, sevim: 0.6, burak: 1.3, derya: 1, tarik: 0.3 };
  const base = task.kind === 'bread' ? 5 : task.kind === 'parcel' ? 10 : 20;
  const tip = Math.round((base * give[task.for] * (late ? 0.4 : 1) * (0.7 + affection)) / 5) * 5;
  if (tip > 0) {
    world.k.money += tip;
    report.tips += tip;
  }
  const pool = late ? LATE_LINES[task.for] : task.kind === 'job' ? JOB_THANKS[task.for] : THANKS[task.for];
  const line = pool[Math.floor(hashUnit(world.seed, DRAW.tip, at, task.id) * pool.length)] ?? '';
  sayBuilding(world, task.for, tip > 0 ? `${line} (₺${tip})` : line, 'voice');
  if (task.for === 'tarik' && !late && hashUnit(world.seed, DRAW.tip, at) < 0.5)
    report.treats.push('a lemon candy from Mr Tarık');
  if (late) report.late++;
  else report.done++;
}
function settledTasks(world: BuildingWorld): void {
  const finished = world.protocol.finishedTasks.splice(0);
  for (const receipt of finished) {
    const task = world.tasks.find((task) => task.id === receipt.task);
    if (!task || task.done !== undefined)
      throw Error('This completed task already settled or has no building record.');
    completeBuildingTask(world, task, receipt.hook, receipt.at);
    if (task.label.startsWith('look at the boiler')) boilerFoundBuilding(world);
    restCaretaker(world, 10);
  }
}

export function chooseBuilding(
  world: BuildingWorld,
  person: string,
  offers: readonly Offer[],
  reason: string,
  suggestion?: Extract<Payloads['suggestion.received']['received'], { kind: 'ordinary' }>['suggestion'],
) {
  const revision = (world.protocol.offers[person] ?? 0) + 1;
  world.protocol.offers[person] = revision;
  const result = applyBuildingEvents(world, [
    ...(suggestion
      ? [
          {
            kind: 'suggestion.received' as const,
            payload: { person, received: { kind: 'ordinary' as const, suggestion } },
          },
        ]
      : []),
    { kind: 'offers.received', payload: { person, revision, offers } },
    {
      kind: 'decision.requested',
      payload: { person, offerRevision: revision, reason, treatment: 'ordinary' },
    },
  ]);
  const event = result.events.find((event) => event.person === person && event.data.kind === 'decision');
  if (event?.data.kind !== 'decision') throw Error('HF did not provide the resident decision.');
  if (suggestion) {
    // HF records both the verdict and wording at the decision boundary. The
    // game displays that reading; it never selects or paraphrases a verdict.
    const reply = buildingEngine(world)
      .inspect({
        perspective: { kind: 'person', observer: person },
        people: [person],
        select: ['events'],
      })
      .events.find(
        (entry) =>
          'access' in entry &&
          entry.data.kind === 'suggestion-resolved' &&
          entry.data.adviceId === suggestion.adviceId,
      );
    const text = reply?.narration.map((line) => line.text).join(' ');
    if (text) sayBuilding(world, person, text, 'voice');
  }
  // These were the options at this actual host choice, not standing offers to
  // repeat the same job forever. Withdrawing the book leaves accepted work and
  // its original binding intact; the next host choice authors its own new book.
  const withdrawn = revision + 1;
  world.protocol.offers[person] = withdrawn;
  applyBuildingEvents(world, [
    { kind: 'offers.received', payload: { person, revision: withdrawn, offers: [] } },
  ]);
  return event.data.decision;
}

export function openBuilding(
  seed: number,
  edition: BuildingEdition = 'stairwell@14',
  arrivals: readonly PersonAuthoring[] = [],
  lifeInputs: readonly LifePreparation[] = [],
): BuildingWorld {
  if (new Set(arrivals.map((person) => person.id)).size !== arrivals.length)
    throw Error('Two arrivals cannot occupy the same resident role.');
  for (const person of arrivals) {
    if (!person.portable || !RIDS.includes(person.id as Rid))
      throw Error('This arrival needs its retained character source. Keep the file.');
    checkBuildingPortable(person.portable, person.id, OPENING);
    const expected = {
      ...emptyPortableOpening(openingPerson(person.id as Rid)),
      portable: structuredClone(person.portable),
    };
    if (canonicalPersona(expected) !== canonicalPersona(person))
      throw Error('This arrival does not match the receiving opening and retained source. Keep the file.');
  }
  const pinnedLife = validateNativeLifeInputs(lifeInputs);
  validateNativeLifeOpening(pinnedLife, arrivals);
  const world = openingWorld(seed, edition);
  if (pinnedLife.length) world.nativeLife = pinnedLife;
  applyHostLife(world, pinnedLife);
  const people = [...RIDS, KAPICI].map(
    (id) =>
      arrivals.find((person) => person.id === id) ?? openingPerson(id as Parameters<typeof openingPerson>[0]),
  );
  if (arrivals.some((person) => !RIDS.includes(person.id as (typeof RIDS)[number])))
    throw Error('This arrival has no allocated resident role.');
  const engine = BuildingRun.open(buildingSpec(seed, edition), people, world);
  engines.set(engine.world, engine);
  chooseBuilding(
    engine.world,
    'derya',
    [
      buildingOffer('derya', 'derya-night-work', 'work', 60, {
        label: 'Finish the night shift',
        demands: { effort: 0.05, focus: 0, mode: 'awake', requires: {} },
      }),
    ],
    'Derya is completing the authored night shift.',
  );
  if (engine.now !== OPENING + engine.world.protocol.phase)
    throw Error('The opening has an inconsistent ingress clock.');
  return engine.world;
}

export function advanceBuildingMinute(world: BuildingWorld): void {
  if (world.phase !== 'day') return;
  const next = world.minute + 1;
  const month = world.month;
  const monthlyBoundary =
    !!month &&
    ((Math.floor(next / 1440) === 8 && [960, 1000].includes(next % 1440)) ||
      (!month.pensionReceived && next >= 11 * 1440 + 540) ||
      (month.invoiceDueAt !== undefined &&
        !month.supplierLate &&
        month.supplierBalance > 0 &&
        next > month.invoiceDueAt + 540) ||
      (month.repaymentAt !== undefined &&
        month.duesBalance > 0 &&
        month.missedPaymentAt !== month.repaymentAt &&
        next > month.repaymentAt + 540));
  const scriptedBoundary =
    next % 1440 === 1260 ||
    next === 2 * 1440 + 600 ||
    next === 5 * 1440 + 1110 ||
    (world.stories?.fund.agreed === true &&
      !world.stories.fund.repaired &&
      world.stories.fund.repairAt === next) ||
    (!!world.stories?.feud.hacerPassed &&
      !!world.stories.feud.sevimPassed &&
      !world.stories.feud.reconciled &&
      next % 1440 >= 1020 &&
      Math.floor(next / 1440) % 7 === 5);
  const engine = buildingEngine(world),
    until = mappedTime(world, world.minute + 1);
  const composite =
    scriptedBoundary ||
    monthlyBoundary ||
    world.protocol.paperMixups.some((effect) => effect.at <= next) ||
    world.protocol.wrongParcels.some((record) => record.done === undefined && record.forwardAt <= next) ||
    (!world.k.walk &&
      world.k.busyTask === null &&
      world.tasks.some(
        (task) =>
          task.done === undefined &&
          task.carried &&
          ((world.k.at === `door:${task.for}` &&
            world.residents.find((resident) => resident.id === task.for)?.where === 'home') ||
            (world.k.at === 'step' &&
              world.residents.find((resident) => resident.id === task.for)?.where === 'step')),
      )) ||
    engine.pendingRequests.length > 0 ||
    world.residents.some((resident) => resident.until <= world.minute + 1) ||
    engine.active.some((activity) => activity.start + activity.offer.durationMs <= until);
  const advance = (candidate: BuildingWorld) => {
    const engine = buildingEngine(candidate);
    engine.advance(mappedTime(candidate, candidate.minute + 1), resolver(engine));
    candidate.minute = next;
    sceneEffectsBuilding(candidate);
    if (candidate.minute === 2 * 1440 + 600) waterOffBuilding(candidate);
    settledTasks(candidate);
    settledArrivals(candidate);
    monthEvents(candidate);
    settleMeetingSeatsBuilding(candidate);
    // Deliver the completed exchange before the resident starts a new routine.
    if (
      candidate.pendingReply &&
      candidate.pendingReply.caretakerStatus &&
      candidate.pendingReply.residentStatus
    ) {
      const reply = candidate.pendingReply;
      candidate.pendingReply = null;
      if (
        reply.caretakerStatus === 'completed' &&
        reply.residentStatus === 'completed' &&
        buildingPeopleTogether(candidate, KAPICI, reply.who)
      )
        sayBuilding(
          candidate,
          reply.who,
          reply.accepted ? 'I am glad you listened.' : 'I would rather leave it there.',
          'voice',
        );
    }
    for (const id of RIDS)
      for (const encounter of decideResidentBuilding(candidate, id))
        talkResidentsBuilding(candidate, encounter.a, encounter.b, encounter.where, encounter.maxClaims);
    if (!candidate.k.walk && candidate.k.busyTask === null) {
      if (candidate.k.at.startsWith('door:')) deliverBuilding(candidate, candidate.k.at);
      if (candidate.k.at === 'step')
        for (const task of candidate.tasks) {
          if (
            task.done === undefined &&
            task.carried &&
            task.kind !== 'bins' &&
            candidate.residents.find((resident) => resident.id === task.for)?.where === 'step'
          )
            completeBuildingTask(candidate, task, false);
        }
    }
    acknowledgeFoundWork(candidate);
    storyEventsBuilding(candidate);
    if (candidate.minute === 5 * 1440 + 1110 && !candidate.ring.asked) ringEveningBuilding(candidate);
    if (candidate.minute % 1440 === 1260) endBuildingDay(candidate);
  };
  // A quiet owner step is already atomic. A reached action boundary can cause
  // composite host consequences and later inputs, so it retains rollback.
  if (composite) buildingTransaction(world, advance);
  else advance(world);
}

export function startBuildingWork(world: BuildingWorld, taskId: number): boolean {
  return buildingTransaction(world, (candidate) => beginBuildingWork(candidate, taskId));
}
export function startPrivateBuildingWork(world: BuildingWorld, taskId: number): boolean {
  const task = world.tasks.find((task) => task.id === taskId);
  const who = task?.storyFor;
  if (!task || !who || task.label !== PRIVATE_WORK[who].label || task.work !== PRIVATE_WORK[who].minutes)
    throw Error('This private work has no matching authored request.');
  const consent = buildingEngine(world).active.find((activity) => activity.person === who);
  if (
    !consent ||
    consent.offer.id !== 'private_help' ||
    consent.offer.actionId !== 'help' ||
    consent.offer.target !== KAPICI ||
    consent.offer.durationMs !== task.work * HF_MINUTE
  )
    throw Error('The resident has not actually accepted this private help.');
  return beginBuildingWork(world, taskId, true);
}
function beginBuildingWork(world: BuildingWorld, taskId: number, privateTask = false): boolean {
  const task = world.tasks.find((task) => task.id === taskId);
  if (
    !task?.work ||
    task.done !== undefined ||
    task.from > world.minute ||
    world.phase !== 'day' ||
    world.k.at !== task.place ||
    world.k.walk ||
    world.k.busyTask !== null ||
    world.k.busyUntil > world.minute ||
    task.kind !== 'job' ||
    task.pickup ||
    !!task.storyFor !== privateTask ||
    task.custody ||
    task.carried ||
    task.wrongDoor ||
    !Number.isInteger(task.work) ||
    task.work <= 0 ||
    Math.floor(task.from / 1440) !== Math.floor(world.minute / 1440) ||
    !currentBody(buildingEngine(world), KAPICI).state.alive
  )
    return false;
  const engine = buildingEngine(world);
  const active = engine.active.find((activity) => activity.person === KAPICI);
  if (active)
    applyBuildingEvents(world, [
      {
        kind: 'activity.interrupted',
        payload: {
          person: KAPICI,
          activityId: active.id,
          reason: 'The caretaker starts the available job.',
        },
      },
    ]);
  const choice = chooseBuilding(
    world,
    KAPICI,
    [
      buildingOffer(KAPICI, `job:${task.id}`, 'work', task.work, {
        label: task.label,
        demands: { effort: privateTask ? 0.3 : 0.5, focus: 0, mode: 'awake', requires: {} },
      }),
    ],
    'The caretaker is at the available ordinary job.',
  );
  if (choice.chosenAffordanceId !== `job:${task.id}`) return false;
  world.k.busyTask = task.id;
  world.k.busyUntil = world.minute + task.work;
  return true;
}

const outsideBuilding = (place: Place) => place === 'bakery' || place === 'shop';
export function buildingFloor(place: Place): number {
  if (place === 'roof') return 5;
  if (place.startsWith('door:')) return RESIDENTS[place.slice(5) as Rid].floor;
  if (place.startsWith('landing:')) return Number(place.slice(8));
  return 0;
}
function buildingRain(world: BuildingWorld): boolean {
  return (
    !!world.month &&
    Math.floor(world.minute / 1440) + 1 === 9 &&
    world.minute % 1440 >= 960 &&
    world.minute % 1440 < 1000
  );
}
/** The existing authored route cost reads current capacity through public inspect. */
export function buildingTravelMinutes(world: BuildingWorld, from: Place, to: Place): number {
  if (from === to) return 0;
  const body = currentBody(buildingEngine(world), KAPICI).readout;
  const load = world.tasks.filter((task) => task.carried && task.done === undefined).length;
  const climb =
    Math.round(((0.8 + 0.08 * Math.min(8, load)) / Math.max(0.35, body.capacity) + 0.9 * body.fatigue) * 10) /
    10;
  const floors = buildingFloor(to) - buildingFloor(from);
  let minutes = Math.max(0, floors) * climb + Math.max(0, -floors) * 0.5 + 0.5;
  if (outsideBuilding(from)) minutes += from === 'bakery' ? 6 : 4;
  if (outsideBuilding(to)) minutes += to === 'bakery' ? 6 : 4;
  if (outsideBuilding(from) && outsideBuilding(to)) minutes -= 3;
  if (buildingRain(world) && (outsideBuilding(from) || outsideBuilding(to))) minutes += 6;
  return Math.max(1, Math.round(minutes));
}
function interruptCaretaker(world: BuildingWorld, reason: string): void {
  const active = buildingEngine(world).active.find((activity) => activity.person === KAPICI);
  if (active)
    applyBuildingEvents(world, [
      {
        kind: 'activity.interrupted',
        payload: {
          person: KAPICI,
          activityId: active.id,
          reason,
        },
      },
    ]);
}
function pickupBuilding(world: BuildingWorld, place: Place): void {
  for (const task of world.tasks) {
    if (
      task.done !== undefined ||
      task.carried ||
      task.custody ||
      // A parcel left with a neighbour is no longer in the room to collect.
      task.wrongDoor ||
      task.pickup !== place ||
      task.from > world.minute
    )
      continue;
    task.carried = true;
    if (task.label2) {
      applyBuildingEvents(world, [
        buildingObservation(world, KAPICI, {
          channel: 'saw',
          kind: 'label',
          salience: 0.8,
          summary: task.label2.text,
          claims: [{ prop: task.label2.prop, value: true, confidence: 0.85 }],
        }),
      ]);
      if (world.secrets[task.label2.prop] === undefined)
        world.secrets[task.label2.prop] = Math.floor(world.minute / 1440) + 1;
      sayBuilding(world, 'narrator', task.label2.text, 'event');
      sayBuilding(
        world,
        'riza',
        'These are paper supplies. The label tells you what arrived. It does not tell you what he is making. Let him choose whether to show you.',
        'margin',
      );
    }
  }
}
export function deliverBuilding(world: BuildingWorld, place: Place): void {
  const id = place.startsWith('door:') ? (place.slice(5) as Rid) : null;
  for (const task of world.tasks) {
    if (task.done !== undefined || !task.carried || task.place !== place) continue;
    if (task.kind === 'bins') {
      if (place === 'step') completeBuildingTask(world, task, false);
      continue;
    }
    if (!id) continue;
    const home = world.residents.find((resident) => resident.id === id)?.where === 'home';
    if (!home && (task.kind === 'parcel' || task.kind === 'job')) continue;
    completeBuildingTask(world, task, !home);
  }
}
function settledArrivals(world: BuildingWorld): void {
  for (const arrival of world.protocol.arrivals.splice(0)) {
    if (arrival.place !== world.k.at || world.k.walk)
      throw Error('The accepted walk does not match the building arrival.');
    pickupBuilding(world, arrival.place);
    deliverBuilding(world, arrival.place);
    const job = world.tasks.find(
      (task) =>
        task.done === undefined &&
        task.kind === 'job' &&
        task.place === arrival.place &&
        task.from <= world.minute &&
        !task.pickup,
    );
    if (job?.work && beginBuildingWork(world, job.id)) continue;
    restCaretaker(world, 15);
    if (
      world.k.at === 'door:tarik' &&
      !world.tarik.envelope &&
      Math.floor(world.minute / 1440) === 4 &&
      (currentTies(buildingEngine(world), 'tarik').find((tie) => tie.otherId === KAPICI)?.affection ?? 0) >
        0.2
    )
      tarikEnvelopeBuilding(world);
  }
}
export function goBuilding(world: BuildingWorld, to: Place): boolean {
  return buildingTransaction(world, (candidate) => beginBuildingWalk(candidate, to));
}
function beginBuildingWalk(candidate: BuildingWorld, to: Place): boolean {
  if (candidate.phase !== 'day' || candidate.k.walk || candidate.k.busyTask !== null) return false;
  const duration = buildingTravelMinutes(candidate, candidate.k.at, to);
  if (!duration) {
    const before = candidate.tasks.map((task) => `${task.id}:${!!task.carried}:${task.done ?? ''}`).join('|');
    pickupBuilding(candidate, to);
    deliverBuilding(candidate, to);
    if (candidate.tasks.map((task) => `${task.id}:${!!task.carried}:${task.done ?? ''}`).join('|') === before)
      sayBuilding(
        candidate,
        'narrator',
        'You are already here. There is nothing to pick up or deliver just now.',
        'journal',
      );
    return false; // Staying here does not start a job that appeared later.
  }
  const from = candidate.k.at;
  const effort =
    buildingFloor(to) > buildingFloor(from)
      ? 0.85
      : buildingRain(candidate) && (outsideBuilding(from) || outsideBuilding(to))
        ? 0.55
        : 0.35;
  interruptCaretaker(candidate, 'The caretaker leaves for the authored route.');
  const choice = chooseBuilding(
    candidate,
    KAPICI,
    [
      buildingOffer(KAPICI, 'walk', 'walk', duration, {
        demands: { effort, focus: 0, mode: 'awake', requires: {} },
      }),
    ],
    'The caretaker walks the actual building route.',
  );
  if (choice.chosenAffordanceId !== 'walk') return false;
  candidate.k.walk = { from, to, at0: candidate.minute, at1: candidate.minute + duration };
  return true;
}

/** The sole external command route. The complete accepted command log is part
 * of the same transaction as HF inputs and all material/story consequences. */
export function actBuilding(world: BuildingWorld, requested: NewInput): void {
  assertPlainBuildingData(requested);
  const command = decodeBuildingInput({ ...requested, at: world.minute });
  if (
    command.kind !== 'go' &&
    command.kind !== 'start-work' &&
    command.kind !== 'rest' &&
    command.kind !== 'next' &&
    command.kind !== 'news' &&
    command.kind !== 'reply' &&
    command.kind !== 'tell' &&
    command.kind !== 'invent' &&
    command.kind !== 'sit' &&
    command.kind !== 'word' &&
    command.kind !== 'knock' &&
    command.kind !== 'prank' &&
    command.kind !== 'misdeliver' &&
    command.kind !== 'entrust' &&
    command.kind !== 'repayment' &&
    command.kind !== 'help-story' &&
    command.kind !== 'seat'
  )
    throw Error('This native command has not been ported yet. The current notebook has not changed.');
  buildingTransaction(world, (candidate) => {
    acknowledgeFoundWork(candidate);
    if (command.kind === 'reply') replyBuilding(candidate, command.who, command.reply);
    candidate.inputs.push(command);
    candidate.applied++;
    if (command.kind === 'go') beginBuildingWalk(candidate, command.to);
    else if (command.kind === 'start-work') beginBuildingWork(candidate, command.task);
    else if (
      command.kind === 'rest' &&
      candidate.phase === 'day' &&
      !candidate.k.walk &&
      candidate.k.busyTask === null &&
      candidate.k.busyUntil <= candidate.minute
    )
      caretakerScene(candidate, 'quiet-break', 'rest', 10, 0.02);
    else if (command.kind === 'entrust') entrustBuilding(candidate, command.who, command.task);
    else if (command.kind === 'repayment') arrangeRepaymentBuilding(candidate);
    else if (command.kind === 'help-story') helpStoryBuilding(candidate, command.who);
    else if (command.kind === 'seat') inviteSeatBuilding(candidate, command.who, command.beside);
    else if (command.kind === 'prank') prankBuilding(candidate, command.what);
    else if (command.kind === 'misdeliver') misdeliverBuilding(candidate, command.who, command.task);
    else if (command.kind === 'knock') knockBuilding(candidate, command.who);
    else if (command.kind === 'sit') sitBuilding(candidate, command.who, command.topic);
    else if (command.kind === 'word') askWordBuilding(candidate, command.who);
    else if (command.kind === 'reply') {
      /* handled before recording */
    } else if (command.kind === 'news') askNewsBuilding(candidate, command.who, promiseDues);
    else if (command.kind === 'tell')
      tellBuilding(candidate, command.who, command.prop, command.value, command.sure);
    else if (command.kind === 'invent') inventBuilding(candidate, command.who, command.about, command.trait);
    else turnBuildingPage(candidate);
  });
}

/** The old morning routine used retrospective clock changes. The native host
 * offers the same20minute meals and550minute sleep in chronological order:
 *21:00 meal,21:20 sleep,06:30 meal, then07:00 opening. Real outcomes stay in HF.
 * Derya's accepted overnight work remains active throughout this interval. */
function turnBuildingPage(world: BuildingWorld): void {
  if (world.phase === 'sunday') {
    if (!world.month || Math.floor(world.minute / 1440) + 1 === 28) {
      world.phase = 'end';
      return;
    }
    const day = Math.floor(world.minute / 1440) + 1;
    const engine = buildingEngine(world);
    world.k.at = 'room';
    world.k.walk = null;
    world.k.busyTask = null;
    // Sunday remains off duty. Residents still choose their actual free time;
    // the caretaker has the original noon/evening meals and thirty-minute rest.
    // This page turn already owns the complete outer action transaction.
    while (world.minute < (day - 1) * 1440 + 1260) {
      const target = world.minute + 1;
      engine.advance(mappedTime(world, target), resolver(engine));
      world.minute = target;
      sceneEffectsBuilding(world);
      monthEvents(world);
      settleMeetingSeatsBuilding(world);
      for (const id of RIDS)
        for (const encounter of decideResidentBuilding(world, id))
          talkResidentsBuilding(world, encounter.a, encounter.b, encounter.where, encounter.maxClaims);
      const meal = world.minute % 1440 === 720 || world.minute % 1440 === 1080;
      if (meal)
        interruptBuildingPerson(
          world,
          KAPICI,
          'The caretaker pauses off-duty rest for the actual Sunday meal.',
        );
      if (!engine.active.some((activity) => activity.person === KAPICI))
        chooseBuilding(
          world,
          KAPICI,
          [
            meal
              ? buildingOffer(KAPICI, 'sunday-meal', 'eat', 20, {
                  label: 'Eat at home on Sunday',
                  expected: { needs: { food: 0.6, water: 0.5 }, followedBy: [], provenance: [] },
                })
              : buildingOffer(KAPICI, 'sunday-rest', 'rest', 30, {
                  label: 'Rest at home on Sunday',
                  expected: { needs: { rest: 0.3 }, followedBy: [], provenance: [] },
                }),
          ],
          'The caretaker spends Sunday off duty at home.',
        );
      storyEventsBuilding(world);
    }
    world.phase = 'night';
    turnBuildingPage(world);
    for (const resident of world.residents) {
      resident.word = null;
      delete resident.vote;
    }
    world.month.seats = {};
    return;
  }
  if (world.phase !== 'night') return;
  const day = Math.floor(world.minute / 1440) + 1;
  const engine = buildingEngine(world);
  const interruptions: BuildingEvent[] = engine.active.flatMap((activity) =>
    activity.person === 'derya' && activity.offer.id === 'derya-night-work'
      ? []
      : [
          {
            kind: 'activity.interrupted' as const,
            payload: {
              person: activity.person,
              activityId: activity.id,
              reason: 'The daytime building closes; this unfinished activity ends for the night.',
            },
          },
        ],
  );
  if (interruptions.length) applyBuildingEvents(world, interruptions);
  world.k.walk = null;
  world.k.busyTask = null;
  world.k.busyUntil = world.minute;
  const offDuty = [...RIDS, KAPICI].filter(
    (person) => !engine.active.some((activity) => activity.person === person),
  );
  const meal = (label: string) => {
    for (const person of offDuty)
      chooseBuilding(
        world,
        person,
        [
          buildingOffer(person, `night-meal:${label}`, 'eat', 20, {
            label: 'Eat the authored evening or morning meal',
            expected: { needs: { food: 0.6, water: 0.6 }, followedBy: [], provenance: [] },
          }),
        ],
        'The household has its ordinary meal.',
      );
  };
  const advanceUntil = (until: number) => {
    while (world.minute < until) {
      // The public owner resolves its own intermediate boundaries. Stop only
      // at authored host effects or activity ends; no private physics is skipped.
      const boundaries = [
        until,
        ...engine.active.map((activity) =>
          Math.ceil((activity.start + activity.offer.durationMs - world.protocol.phase) / HF_MINUTE),
        ),
        ...world.protocol.paperMixups.map((effect) => effect.at),
        ...world.protocol.wrongParcels
          .filter((record) => record.done === undefined)
          .map((record) => record.forwardAt),
      ];
      if (day >= 2 && day <= 4) boundaries.push((day - 1) * 1440 + 1410);
      if (
        world.stories?.fund.repairAt !== null &&
        world.stories?.fund.repairAt !== undefined &&
        !world.stories.fund.repaired
      )
        boundaries.push(world.stories.fund.repairAt);
      if (
        world.month?.invoiceDueAt !== undefined &&
        !world.month.supplierLate &&
        world.month.supplierBalance > 0
      )
        boundaries.push(world.month.invoiceDueAt + 541);
      if (
        world.month?.repaymentAt !== undefined &&
        world.month.missedPaymentAt !== world.month.repaymentAt &&
        world.month.duesBalance > 0
      )
        boundaries.push(world.month.repaymentAt + 541);
      const nextMinute = Math.min(...boundaries.filter((minute) => minute > world.minute));
      if (!Number.isSafeInteger(nextMinute) || nextMinute > until)
        throw Error('The closed building has no valid next authored boundary.');
      engine.advance(mappedTime(world, nextMinute), resolver(engine));
      world.minute = nextMinute;
      sceneEffectsBuilding(world);
      monthEvents(world);
      settleMeetingSeatsBuilding(world);
      storyEventsBuilding(world);
      if (world.minute % 1440 === 1410 && day >= 2 && day <= 4) {
        const waking = [KAPICI, 'hacer'].map((person) => ({
          person,
          sleep: engine.active.find(
            (activity) => activity.person === person && activity.offer.actionId === 'sleep',
          ),
        }));
        for (const { person, sleep } of waking)
          if (sleep)
            interruptBuildingPerson(
              world,
              person,
              'The actual late doorbell wakes the window observer briefly.',
            );
        const awake = waking.filter(
          ({ person }) =>
            !currentBody(engine, person).state.asleep && currentBody(engine, person).state.alive,
        );
        const events = awake.map(({ person }) =>
          buildingObservation(world, person, {
            channel: 'saw',
            kind: 'fact',
            salience: 0.8,
            summary: 'a man at Derya’s door',
            claims: [{ prop: 'derya:visitor', value: true, confidence: 0.9 }],
          }),
        );
        if (events.length) applyBuildingEvents(world, events);
        if (awake.some(({ person }) => person === KAPICI)) {
          world.secrets['derya:visitor'] ??= day;
          sayBuilding(
            world,
            'narrator',
            day === 2
              ? 'Near midnight a man rang flat 5. Derya let him in, and looked down the stairs before she shut the door.'
              : day === 3
                ? 'The same man came to flat 5 late again. He carried a bag this time. The curtain on the landing moved.'
                : 'The man came to flat 5 again after eleven. You heard him laugh on the landing, and Derya say “shh”.',
            'event',
          );
        }
        for (const { person, sleep } of waking)
          if (sleep) {
            const durationMs = sleep.start + sleep.offer.durationMs - (engine.now + 1);
            if (durationMs > 0)
              chooseBuilding(
                world,
                person,
                [
                  buildingOffer(person, 'night-sleep', 'sleep', durationMs / HF_MINUTE, {
                    label: 'Return to the interrupted night of sleep',
                    durationMs,
                    demands: { effort: 0.05, focus: 0, mode: 'sleep', requires: {} },
                    expected: { needs: { sleep: 0.8, rest: 0.5 }, followedBy: [], provenance: [] },
                  }),
                ],
                'The observer returns to the remaining night of sleep.',
              );
          }
      }
    }
  };
  meal('evening');
  advanceUntil(day * 1440 - 160);
  for (const person of offDuty) {
    if (engine.active.some((activity) => activity.person === person))
      throw Error('The actual evening meal has not ended. Keep the notebook.');
    chooseBuilding(
      world,
      person,
      [
        buildingOffer(person, 'night-sleep', 'sleep', 550, {
          label: 'Sleep through the night',
          demands: { effort: 0.05, focus: 0, mode: 'sleep', requires: {} },
          expected: { needs: { sleep: 0.8, rest: 0.5 }, followedBy: [], provenance: [] },
        }),
      ],
      'The household has its ordinary night of sleep.',
    );
  }
  advanceUntil(day * 1440 + 390);
  meal('morning');
  advanceUntil(day * 1440 + 420);
  world.phase = 'day';
  world.k.at = 'room';
  world.k.busyUntil = world.minute;
  for (const resident of world.residents) {
    resident.where = engine.active.some(
      (activity) => activity.person === resident.id && activity.offer.id === 'derya-night-work',
    )
      ? 'work'
      : 'home';
    resident.until =
      resident.id === 'derya' && resident.where === 'work'
        ? day * 1440 + 480
        : world.minute + 15 + ((RIDS.indexOf(resident.id) * 11 + (day + 1) * 5) % 40);
    resident.stairsUntil = 0;
  }
  if ((day + 1) % 7 === 0) {
    advanceUntil(day * 1440 + 660);
    meetingBuilding(world, advanceUntil, { start: meetingSeatsBuilding, settle: settleMeetingSeatsBuilding });
    return;
  }
  planDay(world, day + 1);
  const openingLines: Record<number, string> = {
    2: 'It is Tuesday. A courier is due before noon.',
    3: 'It is Wednesday. The radiators are cold this morning.',
    4: 'It is Thursday. Somebody has been talking on the step about flat 5.',
    5: 'It is Friday. Mr Tarık walks slowly downstairs for Friday prayer at 12:30.',
    6: 'It is Saturday. Burak is home all day and has ironed a shirt.',
  };
  sayBuilding(
    world,
    'narrator',
    openingLines[day + 1] ?? 'The bakery opens at seven. The building still needs its daily work.',
    'journal',
  );
}

/** Available free-time choices authored by the building, scored only by HF. */
export function buildingFreeOffers(world: BuildingWorld, id: Rid): Offer[] {
  const time = world.minute % 1440;
  const expected = (needs: Offer['expected']['needs'], material?: number): Offer['expected'] => ({
    needs,
    followedBy: [],
    provenance: [],
    ...(material === undefined ? {} : { material }),
  });
  const offers = [
    buildingOffer(id, 'home', 'rest', 40, {
      label: 'stay in',
      expected: expected({ leisure: 0.12, rest: 0.15 }),
    }),
    buildingOffer(id, 'meal', 'eat', 30, {
      label: 'eat something',
      expected: expected({ food: 0.5, water: 0.4 }),
    }),
  ];
  if (time >= 570 && time <= 1170) {
    const others = world.residents
      .filter((resident) => resident.where === 'step' && resident.id !== id)
      .map((resident) => resident.id);
    offers.push(
      buildingOffer(id, 'step', 'sit', 35, {
        label: 'sit on the front step',
        tags: others.length ? ['social'] : [],
        participants: others,
        expected: expected({ belonging: others.length ? 0.22 : 0.08, leisure: 0.18 }),
      }),
    );
  }
  if (time >= 510 && time <= 1170)
    offers.push(
      buildingOffer(id, 'shop', 'shop', 30, {
        label: 'go to the corner shop',
        demands: { effort: 0.25, focus: 0, mode: 'awake', requires: {} },
        expected: expected({ leisure: 0.08, food: 0.05 }, -0.05),
      }),
    );
  if (time >= 600 && time <= 1200)
    for (const other of world.residents) {
      if (other.id === id || other.where !== 'home') continue;
      offers.push(
        buildingOffer(id, `visit:${other.id}`, 'visit', 30, {
          label: `call on ${RESIDENTS[other.id].name}`,
          tags: ['social'],
          participants: [other.id],
          target: other.id,
          expected: expected({ belonging: 0.25, leisure: 0.12 }),
        }),
      );
    }
  if ((id === 'hacer' || id === 'burak') && time >= 960 && time <= 1200)
    offers.push(
      buildingOffer(id, 'roof', 'sit', 30, {
        label: 'go up to the roof',
        expected: expected({ leisure: 0.2 }),
      }),
    );
  // The old roof beauty:.15 advertisement never entered the known-need score;
  // leisure:.2 also remained its main aim. Public old3 paired controls retain
  // exact historical metadata separately (g3g4-roof-control/receipt.json).
  if (buildingRain(world))
    offers.push(
      buildingOffer(id, 'shelter', 'sit', 1000 - time, {
        label: 'wait under the shop awning',
        participants: world.residents
          .filter((resident) => resident.where === 'step' && resident.id !== id)
          .map((resident) => resident.id),
        expected: expected({ rest: 0.3, belonging: 0.15 }),
      }),
    );
  const at = mappedTime(world) + 1;
  const personalActions = new Set([
    'eat',
    'drink',
    'sleep',
    'rest',
    'tea',
    'pray',
    'pray-home',
    'pray-qada',
    'pray-eid',
  ]);
  for (const duty of currentAgenda(buildingEngine(world), id).commitments) {
    if (duty.status !== 'pending' || duty.kind === 'abstain' || duty.from > at || duty.until <= at) continue;
    const action = duty.actions.find((action) => personalActions.has(action));
    if (!action) continue;
    offers.push(
      buildingOffer(
        id,
        `calendar:${duty.id}`,
        action,
        Math.min(10 * HF_MINUTE, duty.until - at) / HF_MINUTE,
        {
          label: duty.label ?? 'keep a quiet personal duty',
          tags: action.startsWith('pray') ? ['worship'] : [],
          ...(duty.targetId === undefined ? {} : { target: duty.targetId }),
          norms: duty.normId === undefined ? [] : [{ normId: duty.normId, relation: 'fulfills' }],
          expected: expected({ meaning: 0.2 }),
          fulfills: [duty.id],
        },
      ),
    );
  }
  // Make-up debts remain owed until the person schedules and actually fulfils
  // them through the agenda owner. This book never erases or invents a duty.
  // Monthly visits use the same accepted activity and host scene receipts.
  return [...offers, ...monthVisitOffers(world, id)];
}

function restCaretaker(world: BuildingWorld, minutes: number): void {
  chooseBuilding(
    world,
    KAPICI,
    [
      buildingOffer(KAPICI, 'rest', 'rest', minutes, {
        demands: { effort: 0.05, focus: 0, mode: 'awake', requires: {} },
        expected: { needs: { rest: 0.3 }, followedBy: [], provenance: [] },
      }),
    ],
    'The caretaker rests between the authored errands.',
  );
}
