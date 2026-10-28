import { readFileSync } from 'node:fs';
import { DEFAULT_NORMS, replay } from '@adam0white/human-framework';
import { createPersona, initialPersonaLife, preparePersonaLife } from '@adam0white/lab-client';
import { expect, test } from 'vitest';
import type { Rid } from '../src/sim/building-cast.ts';
import { buildingSpec, OPENING, openingPerson } from '../src/sim/hf-authoring.ts';
import { currentDeparture } from '../src/sim/hf-cast.ts';
import { admitted, BuildingRun } from '../src/sim/hf-run.ts';
import { admitNativeCast } from '../src/sim/native-cast-life.ts';

async function source(id: Rid = 'hacer') {
  const person = openingPerson(id);
  const norm = DEFAULT_NORMS.find((n) => n.id === 'salah');
  if (!norm) throw Error('Missing sourced norm');
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
    ...person.state.agenda.owed,
    {
      ofId: 'source-duty',
      normId: norm.id,
      kind: 'worship',
      actions: ['pray-qada'],
      reason: 'missed',
      at: OPENING - 60000,
      label: 'My remembered duty',
    },
  ];
  const run = BuildingRun.open(buildingSpec(31), [person], {});
  const projected = currentDeparture(run, id, []);
  const portable = projected.transfer.portable;
  return createPersona({
    format: 'hf-persona/1',
    castId: portable.castId,
    castRevision: portable.castRevision,
    branchId: `native-source-${id}`,
    parentRevision: null,
    source: { game: 'stairwell', build: 'mechanism-control', engine: portable.source.engine, rules: '14' },
    transfer: { ...projected.transfer, life: initialPersonaLife(portable.castId, `native-source-${id}`, 0) },
    limitations: [],
  });
}

test('a pinned modern source retains owed duties, sourced understanding and history through public admission', async () => {
  const parent = await source();
  const prepared = preparePersonaLife(parent, 12 * 3600000);
  const before = structuredClone(prepared);
  const arrival = await admitNativeCast(prepared);
  const target = BuildingRun.open(buildingSpec(7), [arrival], {});
  const continued = currentDeparture(target, 'hacer', []).transfer.portable;
  expect(continued.retained.agenda.owed).toHaveLength(1);
  expect(continued.retained.heldNorms).toEqual(
    (parent.transfer.portable as typeof continued).retained.heldNorms,
  );
  expect(continued.retained.memory.beliefs).toEqual(
    (parent.transfer.portable as typeof continued).retained.memory.beliefs,
  );
  expect(admitted(replay(target.checkpoint().archive)).fullHash).toBe(
    target.checkpoint().archive.hashes.full,
  );
  expect(prepared).toEqual(before);
});

test('altered source digest, pinned life, work option, or opening night duty refuse', async () => {
  const parent = await source();
  const prepared = preparePersonaLife(parent, 12 * 3600000);
  const altered = structuredClone(prepared);
  altered.parent.source.build = 'changed';
  await expect(admitNativeCast(altered)).rejects.toThrow();
  const alteredLife = structuredClone(prepared);
  alteredLife.life.assignment = (alteredLife.life.assignment + 1) % 3;
  await expect(admitNativeCast(alteredLife)).rejects.toThrow();
  await expect(admitNativeCast(prepared, 'stairwell@16')).rejects.toThrow();
  for (const role of ['derya', 'burak', 'tarik'] as const)
    await expect(admitNativeCast(preparePersonaLife(await source(role), 0))).rejects.toThrow();
});

test('summary-only legacy histories refuse rather than become fresh people', async () => {
  const parent = await source();
  const { revision: _revision, ...body } = parent;
  const legacy = await createPersona({
    ...body,
    transfer: { castPassport: 'stairwell-cast/1', life: parent.transfer.life },
  });
  await expect(admitNativeCast(preparePersonaLife(legacy, 0))).rejects.toThrow(/Keep the file/);
});

// Genuine departures from the seed-11, edition-15, 28-day public run.
// Keep the source records unchanged: short opening controls never reached the
// retained state that the SDK's older transitive validator rejected.
test('actual HF4.6 month departures pass the SDK and retained opening', async () => {
  const parents = JSON.parse(
    readFileSync(new URL('./fixtures/hf46-played-month-departures.json', import.meta.url), 'utf8'),
  );
  for (const parent of Object.values(parents)) {
    const prepared = preparePersonaLife(parent as Parameters<typeof preparePersonaLife>[0], 24 * 3600000);
    const before = structuredClone(prepared);
    const arrival = await admitNativeCast(prepared);
    expect(arrival.portable).toBeDefined();
    expect(prepared).toEqual(before);
  }
});
