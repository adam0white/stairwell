/** Native building operations under migration. The ordinary UI is switched only
 * after all world scenes use this shared Run and the complete replay gates pass.
 */
import type { Input as EngineInput, Offer, Payloads, PersonAuthoring } from '@stairwell/hf4';
import { KAPICI, RIDS } from './building-cast.ts';
import { buildingOffer, buildingSpec, OPENING, openingPerson } from './hf-authoring.ts';
import { currentBody } from './hf-readings.ts';
import { atMinute, type BuildingResolver, BuildingRun, HF_MINUTE } from './hf-run.ts';
import { type BuildingEdition, type BuildingWorld, openingWorld } from './hf-world.ts';

const engines = new WeakMap<BuildingWorld, BuildingRun<BuildingWorld>>();
export function buildingEngine(world: BuildingWorld): BuildingRun<BuildingWorld> {
  const engine = engines.get(world);
  if (!engine) throw Error('This building needs its complete HF archive. Keep the source notebook.');
  return engine;
}
export function restoreBuilding(
  checkpoint: unknown,
  decodeWorld: (input: unknown) => BuildingWorld,
): BuildingWorld {
  const engine = BuildingRun.restore(checkpoint, decodeWorld);
  engines.set(engine.world, engine);
  return engine.world;
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
type BuildingEvent = { [K in keyof Payloads]: { kind: K; payload: Payloads[K] } }[keyof Payloads];
function mappedTime(world: BuildingWorld, minute = world.minute): number {
  if (
    !Number.isSafeInteger(world.protocol.phase) ||
    world.protocol.phase < 0 ||
    world.protocol.phase >= HF_MINUTE
  )
    throw Error('This notebook has an invalid millisecond input phase. Keep the source file.');
  return atMinute(minute) + world.protocol.phase;
}
function submit(world: BuildingWorld, events: readonly BuildingEvent[]) {
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
  const result = engine.advance(at, resolver(engine), inputs);
  world.protocol.ingresses.push({
    phase: world.protocol.phase,
    minute: world.minute,
    inputIds: inputs.map((input) => input.id),
  });
  return result;
}
export function buildingIngress(world: BuildingWorld, events: readonly BuildingEvent[]) {
  return buildingTransaction(world, (candidate) => submit(candidate, events));
}
function resolver(engine: BuildingRun<BuildingWorld>): BuildingResolver<BuildingWorld> {
  return {
    action(world, request, activity) {
      if (request.stage === 'start') return { disposition: 'accepted', observations: [] };
      const status = request.stage === 'finish' ? 'completed' : 'interrupted';
      const minute = Math.floor(request.boundaryAt / HF_MINUTE);
      const actual: NonNullable<ReturnType<BuildingResolver<BuildingWorld>['action']>['outcome']>['actual'] =
        {
          exposures: [],
          observedProgress: [],
          material: 0,
        };
      if (status === 'completed') {
        if (activity.offer.actionId === 'eat') actual.consumed = { food: 0.5, water: 0.45 };
        if (activity.offer.actionId === 'rest')
          actual.consumed = { water: activity.person === KAPICI ? 0.1 : 0.08 };
        if (
          activity.offer.actionId === 'visit' ||
          (activity.offer.actionId === 'sit' && activity.offer.id === 'step')
        )
          actual.psychological = { belonging: 0.12 };
        if (activity.person === KAPICI && activity.offer.actionId === 'walk' && world.k.walk) {
          world.k.at = world.k.walk.to;
          world.k.walk = null;
        }
        if (activity.person === KAPICI && activity.offer.id.startsWith('job:')) {
          const task = world.tasks.find((task) => activity.offer.id === `job:${task.id}`);
          if (!task || world.k.busyTask !== task.id || task.done !== undefined)
            throw Error('The completed work does not match the building job.');
          task.done = minute;
          world.k.busyTask = null;
        }
      }
      // Availability and consequences are the host's actual evidence. Expected
      // advertisements are never copied into the outcome as completed needs.
      void engine;
      return {
        disposition: status,
        observations: [],
        outcome: {
          activityId: activity.id,
          offerId: activity.offer.id,
          actionId: activity.offer.actionId,
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
    communication(_world, request) {
      const itemIds = request.items.map((item) => item.id);
      return {
        emittedItemIds: itemIds,
        received: request.recipients.map((recipient) => ({
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

export function chooseBuilding(
  world: BuildingWorld,
  person: string,
  offers: readonly Offer[],
  reason: string,
) {
  const revision = (world.protocol.offers[person] ?? 0) + 1;
  world.protocol.offers[person] = revision;
  const result = submit(world, [
    { kind: 'offers.received', payload: { person, revision, offers } },
    {
      kind: 'decision.requested',
      payload: { person, offerRevision: revision, reason, treatment: 'ordinary' },
    },
  ]);
  const event = result.events.find((event) => event.person === person && event.data.kind === 'decision');
  if (event?.data.kind !== 'decision') throw Error('HF did not provide the resident decision.');
  return event.data.decision;
}

export function openBuilding(
  seed: number,
  edition: BuildingEdition = 'stairwell@14',
  arrivals: readonly PersonAuthoring[] = [],
): BuildingWorld {
  if (new Set(arrivals.map((person) => person.id)).size !== arrivals.length)
    throw Error('Two arrivals cannot occupy the same resident role.');
  const world = openingWorld(seed, edition);
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
  const engine = buildingEngine(world);
  engine.advance(mappedTime(world, world.minute + 1), resolver(engine));
  world.minute++;
}

export function startBuildingWork(world: BuildingWorld, taskId: number): boolean {
  return buildingTransaction(world, (candidate) => beginBuildingWork(candidate, taskId));
}
function beginBuildingWork(world: BuildingWorld, taskId: number): boolean {
  const task = world.tasks.find((task) => task.id === taskId);
  if (
    !task?.work ||
    world.version !== 'stairwell@16' ||
    task.done !== undefined ||
    task.from > world.minute ||
    world.phase !== 'day' ||
    world.k.at !== task.place ||
    world.k.walk ||
    world.k.busyTask !== null ||
    world.k.busyUntil > world.minute ||
    task.kind !== 'job' ||
    task.pickup ||
    task.storyFor ||
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
    submit(world, [
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
        demands: { effort: 0.5, focus: 0, mode: 'awake', requires: {} },
      }),
    ],
    'The caretaker is at the available ordinary job.',
  );
  if (choice.chosenAffordanceId !== `job:${task.id}`) return false;
  world.k.busyTask = task.id;
  world.k.busyUntil = world.minute + task.work;
  return true;
}
