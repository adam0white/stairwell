import { createPersona } from '@adam0white/lab-client';
import { replay } from '@stairwell/hf4';
import { expect, test } from 'vitest';
import { buildingOffer, buildingSpec, OPENING, openingPerson } from '../src/sim/hf-authoring.ts';
import { currentDeparture, retainedOpening } from '../src/sim/hf-cast.ts';
import { admitted, type BuildingResolver, BuildingRun, HF_MINUTE } from '../src/sim/hf-run.ts';

const resolver: BuildingResolver<{ deliveries: number }> = {
  action() {
    throw Error('This source control has no accepted action');
  },
  communication(world, request) {
    world.deliveries++;
    const itemIds = request.items.map((item) => item.id);
    return {
      emittedItemIds: itemIds,
      received: request.recipients.map((recipient) => ({
        recipient,
        evidenceId: `received:${request.id}:${recipient}`,
        attention: 1,
        itemIds,
      })),
    };
  },
};

test('actual current public communication continues in a mapped retained opening and reprojection', async () => {
  const source = BuildingRun.open(buildingSpec(7), [openingPerson('kapici'), openingPerson('hacer')], {
    deliveries: 0,
  });
  const input = {
    id: 'door-news',
    at: OPENING,
    source: { type: 'host' as const, id: 'stairwell' },
    kind: 'conversation.requested' as const,
    payload: {
      speaker: 'kapici',
      listener: 'hacer',
      topicIds: ['notice:water'],
      maxClaims: 1,
      temptations: [],
      loyalWarning: false,
    },
  };
  source.ingest(OPENING, [input]);
  expect(() => currentDeparture(source, 'hacer', [])).toThrow(/unfinished responsibilities/);
  source.advance(OPENING + 10 * HF_MINUTE, resolver);
  expect(source.world.deliveries).toBe(1);
  expect(() => currentDeparture(source, 'hacer', ['a parcel remains'])).toThrow(
    /unfinished responsibilities/,
  );
  const departed = currentDeparture(source, 'hacer', []);
  expect(
    departed.transfer.portable.retained.memory.beliefs.some((belief) => belief.prop === 'notice:water'),
  ).toBe(true);
  const parent = await createPersona({
    format: 'hf-persona/1',
    castId: 'hf.cast.hacer.voice',
    castRevision: '1',
    branchId: 'native4-control',
    parentRevision: null,
    source: {
      game: 'stairwell',
      engine: departed.transfer.portable.source.engine,
      build: 'fixture-public4',
      rules: '14',
    },
    transfer: departed.transfer,
    limitations: [],
  });
  const opening = retainedOpening(parent, OPENING, openingPerson('hacer'));
  const target = BuildingRun.open(buildingSpec(19), [openingPerson('kapici'), opening], { deliveries: 0 });
  const continued = currentDeparture(target, 'hacer', []).transfer.portable;
  const original = departed.transfer.portable;
  const offset = OPENING - original.retained.at;
  expect(continued.state).toEqual(original.state);
  expect(
    continued.retained.memory.beliefs.map((belief) => ({
      ...belief,
      updatedAt: belief.updatedAt - offset,
      ...(belief.provenance
        ? { provenance: { ...belief.provenance, at: belief.provenance.at - offset } }
        : {}),
    })),
  ).toEqual(original.retained.memory.beliefs);
  expect(continued.retained.memory.sourceTrust).toEqual(original.retained.memory.sourceTrust);
  expect(continued.retained.at - continued.retained.bornAt).toBe(
    original.retained.at - original.retained.bornAt,
  );
  expect(admitted(replay(target.checkpoint().archive)).fullHash).toBe(
    target.checkpoint().archive.hashes.full,
  );
  const rejected = structuredClone(parent);
  rejected.transfer.portableClaim = { game: 'stairwell' };
  expect(() => retainedOpening(rejected, OPENING, openingPerson('hacer'))).toThrow(/still belongs/);
});

test('current departure refuses a real unresolved action start without clearing it', () => {
  const source = BuildingRun.open(buildingSpec(7), [openingPerson('hacer')], { deliveries: 0 });
  source.ingest(OPENING, [
    {
      id: 'offers',
      at: OPENING,
      source: { type: 'host', id: 'stairwell' },
      kind: 'offers.received',
      payload: { person: 'hacer', revision: 1, offers: [buildingOffer('hacer', 'work', 'work', 10)] },
    },
    {
      id: 'choose',
      at: OPENING,
      source: { type: 'host', id: 'stairwell' },
      kind: 'decision.requested',
      payload: { person: 'hacer', offerRevision: 1, reason: 'Ordinary work', treatment: 'ordinary' },
    },
  ]);
  const before = source.checkpoint();
  expect(() => currentDeparture(source, 'hacer', [])).toThrow(/unfinished responsibilities/);
  expect(source.checkpoint()).toEqual(before);
});
