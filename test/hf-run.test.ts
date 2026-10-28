/** Protocol controls for the new building boundary. These do not claim the old
 * live game.ts has been ported; the ordinary game-action proof follows wiring.
 */
import { replay } from '@stairwell/hf4';
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
