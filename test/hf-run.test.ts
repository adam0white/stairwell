/** Protocol controls for the new building boundary. These do not claim the old
 * live game.ts has been ported; the ordinary game-action proof follows wiring.
 */
import { createPerson, createRun, exportRun, replay, restoreRun, step } from '@adam0white/human-framework';
import { expect, test } from 'vitest';
import { buildingOffer, buildingSpec, OPENING, openingPerson } from '../src/sim/hf-authoring.ts';
import {
  admitted,
  type BuildingCheckpoint,
  type BuildingResolver,
  BuildingRun,
  HF_MINUTE,
} from '../src/sim/hf-run.ts';

type World = { completed: number; money: number; deliveries: number; blocked: boolean };
const empty = (): World => ({ completed: 0, money: 0, deliveries: 0, blocked: false });
function decode(value: unknown): World {
  if (
    !value ||
    typeof value !== 'object' ||
    Object.keys(value).sort().join(',') !== 'blocked,completed,deliveries,money'
  )
    throw Error('Invalid world');
  const v = value as World;
  if (
    !Number.isSafeInteger(v.completed) ||
    v.completed < 0 ||
    !Number.isSafeInteger(v.money) ||
    !Number.isSafeInteger(v.deliveries) ||
    typeof v.blocked !== 'boolean'
  )
    throw Error('Invalid world');
  return structuredClone(v);
}
const resolver: BuildingResolver<World> = {
  action(world, request, active) {
    if (request.stage === 'start')
      return { disposition: world.blocked || world.completed ? 'rejected' : 'accepted', observations: [] };
    const status = request.stage === 'interrupt' ? 'interrupted' : 'completed';
    if (status === 'completed') {
      world.completed++;
      if (active.offer.actionId === 'work') world.money += 2;
    }
    return {
      disposition: status,
      observations: [],
      outcome: {
        activityId: active.id,
        offerId: active.offer.id,
        actionId: active.offer.actionId,
        start: active.start,
        end: request.boundaryAt,
        status,
        evidenceId: `outcome:${request.id}`,
        summary: 'The building recorded actual work.',
        actual: {
          exposures: [],
          observedProgress: [],
          material: status === 'completed' && active.offer.actionId === 'work' ? 2 : 0,
        },
        fulfills: [],
        advances: [],
      },
    };
  },
  communication(world, request) {
    world.deliveries++;
    const items = request.items.map((item) => item.id);
    return {
      emittedItemIds: items,
      received: request.recipients.map((recipient) => ({
        recipient,
        evidenceId: `heard:${request.id}:${recipient}`,
        attention: 1,
        itemIds: items,
      })),
    };
  },
};
function session(action = 'work') {
  const run = BuildingRun.open(buildingSpec(42), [openingPerson('kapici')], empty());
  const offer = buildingOffer('kapici', 'caretaker', action, 5, {
    demands: { effort: action === 'work' ? 0.5 : 0, focus: 0, mode: 'awake', requires: {} },
  });
  const inputs = [
    {
      id: 'offers',
      at: OPENING,
      source: { type: 'host' as const, id: 'stairwell' },
      kind: 'offers.received' as const,
      payload: { person: 'kapici', revision: 1, offers: [offer] },
    },
    {
      id: 'choose',
      at: OPENING,
      source: { type: 'host' as const, id: 'stairwell' },
      kind: 'decision.requested' as const,
      payload: {
        person: 'kapici',
        reason: 'The caretaker is at an available ordinary job.',
        treatment: 'ordinary' as const,
        offerRevision: 1,
      },
    },
  ];
  return { run, inputs };
}
const clone = <W>(checkpoint: BuildingCheckpoint<W>): unknown => JSON.parse(JSON.stringify(checkpoint));

test('cold recovery rejects inconsistent host offer bindings in an otherwise valid public HF archive', () => {
  for (const mismatch of ['none', 'offer', 'revision', 'duplicate'] as const) {
    const raw = admitted(createRun(buildingSpec(42)));
    admitted(createPerson(raw, openingPerson('kapici')));
    const { inputs } = session();
    const pending = admitted(step(raw, { until: OPENING, inputs }));
    if (pending.boundary.type !== 'world-required') throw Error('Missing public request');
    const request = pending.boundary.requests[0];
    if (request?.kind !== 'action') throw Error('Missing public action');
    const book = inputs.find((input) => input.kind === 'offers.received');
    const offered = book?.payload.offers[0];
    if (!offered) throw Error('Missing actual offered work');
    const binding = {
      id: request.activityId,
      person: request.person,
      start: request.boundaryAt,
      offerRevision: mismatch === 'revision' ? 999 : request.offerRevision,
      offer: mismatch === 'offer' ? { ...offered, actionId: 'rest' } : offered,
    };
    admitted(
      step(raw, {
        until: OPENING,
        inputs: [
          {
            id: `receipt:${request.id}`,
            at: OPENING,
            source: { type: 'host', id: 'stairwell' },
            kind: 'action.resolved',
            payload: {
              requestId: request.id,
              requestHash: request.requestHash,
              person: request.person,
              activityId: request.activityId,
              stage: 'start',
              worldRevision: request.worldRevision,
              disposition: 'accepted',
              observations: [],
              worldChange: {
                expectedRevision: 0,
                revision: 1,
                put: [],
                remove: [],
                hostState: JSON.parse(
                  JSON.stringify({
                    format: 'stairwell-hf-world/1',
                    receipts: 1,
                    active: mismatch === 'duplicate' ? [binding, binding] : [binding],
                  }),
                ),
              },
            },
          },
        ],
      }),
    );
    const archive = exportRun(raw);
    expect(restoreRun(JSON.parse(JSON.stringify(archive))).ok).toBe(true);
    const checkpoint = { format: 'stairwell-engine/1', world: empty(), archive };
    if (mismatch === 'none') expect(() => BuildingRun.restore(checkpoint, decode)).not.toThrow();
    else expect(() => BuildingRun.restore(checkpoint, decode)).toThrow();
  }
});

test('a rejected outer game action restores earlier accepted HF inputs and every staged host effect', () => {
  const { run, inputs } = session();
  const before = run.checkpoint(),
    host = run.world;
  let acceptedFirstBoundary = false;
  expect(() =>
    run.transaction((candidate) => {
      candidate.world.money = 999;
      candidate.advance(OPENING + 1, resolver, inputs);
      acceptedFirstBoundary = candidate.active.length === 1;
      candidate.advance(OPENING + 5 * HF_MINUTE, {
        ...resolver,
        action() {
          return { disposition: 'accepted', observations: [] };
        },
      });
    }),
  ).toThrow();
  expect(acceptedFirstBoundary).toBe(true);
  expect(run.checkpoint()).toEqual(before);
  expect(host).toEqual(empty());
  run.advance(OPENING + 5 * HF_MINUTE, resolver, inputs);
  expect(run.world.money).toBe(2);
});

test('real public start/finish replies restore pending and active work with exact HF replay and a rest control', () => {
  const { run, inputs } = session();
  const pending = run.ingest(OPENING, inputs);
  expect(pending.boundary.type).toBe('world-required');
  expect(run.world).toEqual(empty());
  const pendingRestored = BuildingRun.restore(clone(run.checkpoint()), decode);
  run.advance(OPENING + 1, resolver, [], pending);
  pendingRestored.advance(OPENING + 1, resolver);
  expect(pendingRestored.checkpoint()).toEqual(run.checkpoint());
  expect(run.active).toHaveLength(1);
  expect(run.world.money).toBe(0);
  const active = BuildingRun.restore(clone(run.checkpoint()), decode);
  run.advance(OPENING + 5 * HF_MINUTE, resolver);
  active.advance(OPENING + 5 * HF_MINUTE, resolver);
  expect(active.checkpoint()).toEqual(run.checkpoint());
  expect(run.world).toMatchObject({ money: 2, completed: 1 });
  const archive = run.checkpoint().archive;
  expect(admitted(replay(archive)).fullHash).toBe(archive.hashes.full);
  const rest = session('rest');
  rest.run.advance(OPENING + 5 * HF_MINUTE, resolver, rest.inputs);
  expect(rest.run.world).toMatchObject({ money: 0, completed: 1 });
  const body = (r: typeof run) =>
    r.inspect({ perspective: { kind: 'host' }, people: ['kapici'], select: ['body'] }).people[0];
  expect(body(run)).not.toEqual(body(rest.run));
});

test('an invalid reply does not publish staged money or host activity and can be retried', () => {
  const { run, inputs } = session();
  const pending = run.ingest(OPENING, inputs),
    before = run.checkpoint();
  const invalid: BuildingResolver<World> = {
    ...resolver,
    action(world) {
      world.money = 999;
      return { disposition: 'completed', observations: [] };
    },
  };
  expect(() => run.advance(OPENING + HF_MINUTE, invalid, [], pending)).toThrow();
  expect(run.checkpoint()).toEqual(before);
  run.advance(OPENING + 5 * HF_MINUTE, resolver, [], pending);
  expect(run.world.money).toBe(2);
});

test('a two-person communication boundary restores and records actual received items once', () => {
  const run = BuildingRun.open(buildingSpec(7), [openingPerson('kapici'), openingPerson('hacer')], empty());
  const pending = run.ingest(OPENING, [
    {
      id: 'conversation',
      at: OPENING,
      source: { type: 'host', id: 'stairwell' },
      kind: 'conversation.requested',
      payload: {
        speaker: 'kapici',
        listener: 'hacer',
        topicIds: ['notice:water'],
        maxClaims: 1,
        temptations: [],
        loyalWarning: false,
      },
    },
  ]);
  expect(pending.boundary.type).toBe('world-required');
  const restored = BuildingRun.restore(clone(run.checkpoint()), decode);
  const heldHostWorld = run.world;
  run.advance(OPENING, resolver, [], pending);
  restored.advance(OPENING, resolver);
  expect(restored.checkpoint()).toEqual(run.checkpoint());
  expect(run.world.deliveries).toBe(1);
  expect(heldHostWorld.deliveries).toBe(1);
  const read = run.inspect({
    perspective: { kind: 'person', observer: 'hacer' },
    people: ['hacer'],
    select: ['beliefs'],
  });
  const person = read.people[0];
  if (person?.kind !== 'self') throw Error('Missing self reading');
  const beliefs = person.parts.find((p) => p.select === 'beliefs');
  expect(beliefs?.select === 'beliefs' && beliefs.value.some((b) => b.prop === 'notice:water')).toBe(true);
});

test('successful action transactions retain public recovery material without exporting a new archive', () => {
  const { run, inputs } = session();
  let exports = 0;
  const checkpoint = run.checkpoint.bind(run);
  run.checkpoint = () => {
    exports++;
    return checkpoint();
  };
  run.transaction((candidate) => candidate.advance(OPENING + 1, resolver, inputs));
  expect(exports).toBe(0);
  expect(run.active).toHaveLength(1);
});

for (const state of ['fresh', 'pending', 'active'] as const)
  test(`journal rollback restores ${state} recovery and excludes accepted failed-action suffix`, () => {
    let { run, inputs } = session();
    if (state === 'pending') run.ingest(OPENING, inputs);
    if (state === 'active') run.advance(OPENING + 1, resolver, inputs);
    if (state !== 'fresh') run = BuildingRun.restore(clone(run.checkpoint()), decode);
    const control = BuildingRun.restore(clone(run.checkpoint()), decode);
    // Leave an accepted prefix after the last export. Recovery must replay it,
    // including empty requests that stop at a pending owner boundary.
    for (const at of [OPENING + 1, OPENING + 2]) {
      run.ingest(at);
      control.ingest(at);
    }
    const before = control.checkpoint();
    expect(() =>
      run.transaction((candidate) => {
        if (state === 'fresh')
          candidate.advance(
            OPENING + 3,
            resolver,
            inputs.map((input) => ({ ...input, at: OPENING + 3 })),
          );
        else candidate.advance(OPENING + 2, resolver);
        candidate.world.money = 999;
        candidate.checkpoint(); // Must not replace the pre-action recovery base.
        candidate.ingest(OPENING + 3);
        candidate.ingest(OPENING - 1); // Rejected input batch must not enter the journal.
      }),
    ).toThrow();
    expect(run.checkpoint()).toEqual(before);
    expect(() => run.transaction((candidate) => candidate.transaction(() => {}))).toThrow(/nest/);
    expect(run.checkpoint()).toEqual(before);
    const until = OPENING + 6 * HF_MINUTE;
    run.advance(until, resolver);
    control.advance(until, resolver);
    expect(run.checkpoint()).toEqual(control.checkpoint());
    expect(admitted(replay(run.checkpoint().archive)).fullHash).toBe(run.checkpoint().archive.hashes.full);
  });

test('cold recovery reconstructs the original accepted start after the public diagnostic window expires', () => {
  const { run, inputs } = session();
  run.advance(OPENING + 1, resolver, inputs);
  const original = run.active[0];
  if (!original) throw Error('Missing active work');
  for (let revision = 2; revision < 82; revision++) {
    run.ingest(OPENING + revision, [
      {
        id: `later-offers:${revision}`,
        at: OPENING + revision,
        source: { type: 'host', id: 'stairwell' },
        kind: 'offers.received',
        payload: { person: 'kapici', revision, offers: [] },
      },
    ]);
  }
  const checkpoint = run.checkpoint();
  expect(
    checkpoint.archive.current.events.some(
      (e) => e.data.kind === 'action-requested' && e.data.request.activityId === original.id,
    ),
  ).toBe(false);
  const restored = BuildingRun.restore(clone(checkpoint), decode);
  expect(restored.active).toEqual(run.active);
  expect(restored.coldActionReceipt(original.id, original.person)?.offer).toEqual(original.offer);
  run.advance(OPENING + 5 * HF_MINUTE, resolver);
  restored.advance(OPENING + 5 * HF_MINUTE, resolver);
  expect(restored.checkpoint()).toEqual(run.checkpoint());
  const ended = BuildingRun.restore(clone(run.checkpoint()), decode);
  expect(ended.coldActionReceipt(original.id, original.person)?.outcome?.status).toBe('completed');
});
