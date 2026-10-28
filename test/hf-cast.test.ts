import { DEFAULT_NORMS, replay } from '@adam0white/human-framework';
import { admitPortablePerson, createPersona } from '@adam0white/lab-client';
import { expect, test } from 'vitest';
import { KAPICI, RIDS } from '../src/sim/building-cast.ts';
import {
  buildingOffer,
  buildingSpec,
  emptyPortableOpening,
  OPENING,
  openingPerson,
} from '../src/sim/hf-authoring.ts';
import { currentDeparture, retainedOpening } from '../src/sim/hf-cast.ts';
import { buildingEngine, openBuilding, restoreBuilding } from '../src/sim/hf-game.ts';
import { admitted, type BuildingResolver, BuildingRun, HF_MINUTE } from '../src/sim/hf-run.ts';
import { openingWorld } from '../src/sim/hf-world.ts';

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

test('a current native sourced owed worship and pending duty continue through the actual opening mapping', async () => {
  const person = openingPerson('hacer');
  const norm = DEFAULT_NORMS.find((candidate) => candidate.id === 'salah');
  if (!norm) throw Error('Missing reviewed sourced norm');
  person.state.heldNorms = [
    ...person.state.heldNorms,
    {
      normId: norm.id,
      standing: 'obligatory',
      conviction: 0.9,
      provenance: structuredClone(norm.provenance),
    },
  ];
  person.state.agenda.owed = [
    {
      ofId: 'missed-prayer',
      normId: 'salah',
      kind: 'worship',
      actions: ['pray-qada'],
      reason: 'missed',
      at: OPENING - HF_MINUTE,
      label: 'My missed prayer',
    },
  ];
  person.state.agenda.commitments = [
    {
      id: 'personal-prayer',
      kind: 'worship',
      actions: ['pray-home'],
      from: OPENING + 60 * HF_MINUTE,
      until: OPENING + 80 * HF_MINUTE,
      importance: 0.9,
      normId: 'salah',
      label: 'My own understanding of this duty',
    },
  ];
  const source = BuildingRun.open(buildingSpec(7), [person], { deliveries: 0 });
  source.advance(OPENING + 10 * HF_MINUTE, resolver);
  const departure = currentDeparture(source, 'hacer', []);
  const parent = await createPersona({
    format: 'hf-persona/1',
    castId: 'hf.cast.hacer.voice',
    castRevision: '1',
    branchId: 'duty-control',
    parentRevision: null,
    source: {
      game: 'stairwell',
      engine: departure.transfer.portable.source.engine,
      build: 'public-current-duty-control',
      rules: '14',
    },
    transfer: departure.transfer,
    limitations: [],
  });
  const arrival = retainedOpening(parent, OPENING, openingPerson('hacer'));
  const target = buildingEngine(openBuilding(19, 'stairwell@14', [arrival]));
  const continued = currentDeparture(target, 'hacer', []).transfer.portable;
  expect(continued.retained.agenda.owed).toEqual(
    departure.transfer.portable.retained.agenda.owed.map((owed) => ({
      ...owed,
      at: owed.at - 10 * HF_MINUTE,
    })),
  );
  expect(continued.retained.agenda.commitments).toEqual(
    departure.transfer.portable.retained.agenda.commitments.map((duty) => ({
      ...duty,
      from: duty.from - 10 * HF_MINUTE,
      until: duty.until - 10 * HF_MINUTE,
    })),
  );
  expect(continued.retained.heldNorms).toEqual(departure.transfer.portable.retained.heldNorms);
  expect(continued.retained.calendar.norms).toEqual(departure.transfer.portable.retained.calendar.norms);
  expect(continued.retained.agenda.owed).toHaveLength(1);
  const recovered = buildingEngine(restoreBuilding(JSON.parse(JSON.stringify(target.checkpoint()))));
  expect(currentDeparture(recovered, 'hacer', []).transfer.portable).toEqual(continued);
  expect(admitted(replay(target.checkpoint().archive)).fullHash).toBe(
    target.checkpoint().archive.hashes.full,
  );
  const foreignSpec = buildingSpec(27);
  const day = foreignSpec.definitions.calendar.days[0];
  if (!day) throw Error('Missing calendar day');
  day.windows = [{ commitmentId: 'personal-prayer', from: OPENING, until: OPENING + HF_MINUTE }];
  const foreign = currentDeparture(
    BuildingRun.open(foreignSpec, [person], { deliveries: 0 }),
    'hacer',
    [],
  ).transfer;
  const incompatible = await createPersona({
    format: parent.format,
    castId: parent.castId,
    castRevision: parent.castRevision,
    branchId: 'foreign-window',
    parentRevision: null,
    source: parent.source,
    transfer: foreign,
    limitations: [],
  });
  expect(() => retainedOpening(incompatible, OPENING, openingPerson('hacer'))).toThrow(
    /calendar windows.*Keep the file/,
  );
  const bypass = admitPortablePerson(
    incompatible,
    'stairwell',
    emptyPortableOpening(openingPerson('hacer')),
    { offsetMs: 0, references: [] },
  );
  expect(() => openBuilding(27, 'stairwell@14', [bypass])).toThrow(/calendar windows.*Keep the file/);
  const publicBypass = BuildingRun.open(
    buildingSpec(27),
    [...RIDS, KAPICI].map((id) =>
      id === 'hacer' ? bypass : openingPerson(id as Parameters<typeof openingPerson>[0]),
    ),
    openingWorld(27, 'stairwell@14'),
  );
  expect(() => restoreBuilding(publicBypass.checkpoint())).toThrow(/calendar windows.*Keep the file/);
  const badMapping = structuredClone(arrival);
  if (!badMapping.portable) throw Error('Missing actual portable admission');
  badMapping.portable.mapping.offsetMs++;
  expect(() => openBuilding(27, 'stairwell@14', [badMapping])).toThrow(/clock mapping.*Keep the file/);
  expect(source.checkpoint()).toEqual(departure.source);
});

test('the same authored parcel-privacy understanding survives week to month without relabelling its source', async () => {
  const person = openingPerson('hacer');
  const sourceSpec = buildingSpec(7, 'stairwell@14');
  const privacy = sourceSpec.definitions.norms.find((norm) => norm.id === 'privacy');
  if (!privacy) throw Error('Missing authored privacy rule');
  person.state.heldNorms = [
    ...person.state.heldNorms,
    {
      normId: 'privacy',
      standing: 'disliked',
      conviction: 0.4,
      provenance: structuredClone(privacy.provenance),
    },
  ];
  const source = BuildingRun.open(sourceSpec, [person], {});
  const departure = currentDeparture(source, 'hacer', []);
  const parent = await createPersona({
    format: 'hf-persona/1',
    castId: departure.transfer.portable.castId,
    castRevision: departure.transfer.portable.castRevision,
    branchId: 'privacy-cross-edition',
    parentRevision: null,
    source: {
      game: 'stairwell',
      build: 'public-control',
      engine: departure.transfer.portable.source.engine,
      rules: '14',
    },
    transfer: departure.transfer,
    limitations: [],
  });
  const arrival = retainedOpening(parent, OPENING, openingPerson('hacer'));
  const target = BuildingRun.open(buildingSpec(7, 'stairwell@15'), [arrival], {});
  const continued = currentDeparture(target, 'hacer', []).transfer.portable;
  expect(continued.retained.heldNorms.find((norm) => norm.normId === 'privacy')?.provenance).toEqual(
    privacy.provenance,
  );
});
