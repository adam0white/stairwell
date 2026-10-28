import { replay } from '@adam0white/human-framework';
import { createPersona, initialPersonaLife, lifeAdmission, preparePersonaLife } from '@adam0white/lab-client';
import { expect, test } from 'vitest';
import { buildingSpec, OPENING, openingPerson } from '../src/sim/hf-authoring.ts';
import { currentDeparture, retainedOpening } from '../src/sim/hf-cast.ts';
import { actBuilding, advanceBuildingMinute, buildingEngine, openBuilding } from '../src/sim/hf-game.ts';
import { replayBuilding } from '../src/sim/hf-replay.ts';
import { admitted, BuildingRun } from '../src/sim/hf-run.ts';

test('complete outer replay reconstructs actual ordered routes and an active JSON continuation', () => {
  const world = openBuilding(7, 'stairwell@16');
  actBuilding(world, { kind: 'go', to: 'roof' });
  while (world.k.walk) advanceBuildingMinute(world);
  actBuilding(world, { kind: 'go', to: 'room' });
  advanceBuildingMinute(world);
  expect(world.k.walk).not.toBeNull();
  expect(world.inputs).toHaveLength(2);
  const checkpoint = buildingEngine(world).checkpoint();
  const rebuilt = replayBuilding(JSON.parse(JSON.stringify(checkpoint)));
  expect(buildingEngine(rebuilt).checkpoint()).toEqual(checkpoint);
  while (world.k.walk) {
    advanceBuildingMinute(world);
    advanceBuildingMinute(rebuilt);
  }
  expect(buildingEngine(rebuilt).checkpoint()).toEqual(buildingEngine(world).checkpoint());
  const archive = buildingEngine(rebuilt).checkpoint().archive;
  expect(admitted(replay(archive)).fullHash).toBe(archive.hashes.full);
});

test('retained opening authoring is reconstructed without substituting fresh people', async () => {
  const source = BuildingRun.open(buildingSpec(19), [openingPerson('hacer')], {});
  const departure = currentDeparture(source, 'hacer', []);
  const parent = await createPersona({
    format: 'hf-persona/1',
    castId: 'hf.cast.hacer.voice',
    castRevision: '1',
    branchId: 'outer-replay-control',
    parentRevision: null,
    source: {
      game: 'stairwell',
      engine: departure.transfer.portable.source.engine,
      build: 'public-control',
      rules: '14',
    },
    transfer: {
      ...departure.transfer,
      life: initialPersonaLife('hf.cast.hacer.voice', 'outer-replay-control', 0),
    },
    limitations: [],
  });
  const arrival = retainedOpening(parent, OPENING, openingPerson('hacer'));
  const life = preparePersonaLife(parent, 12 * 3600000);
  const world = openBuilding(7, 'stairwell@14', [arrival], [life]);
  expect(world.nativeLife).toEqual([life]);
  expect(world.lifeNotes?.hacer).toBe(lifeAdmission(life, 'stairwell').line);
  expect(world.residents.find((resident) => resident.id === 'hacer')?.until).toBe(480);
  const invalidLife = structuredClone(life);
  invalidLife.clockMs++;
  expect(() => openBuilding(7, 'stairwell@14', [arrival], [invalidLife])).toThrow();
  actBuilding(world, { kind: 'go', to: 'landing:0' });
  advanceBuildingMinute(world);
  const checkpoint = buildingEngine(world).checkpoint();
  expect(checkpoint.archive.initial.people.find((person) => person.id === 'hacer')?.portable).toBeDefined();
  const rebuilt = replayBuilding(JSON.parse(JSON.stringify(checkpoint)));
  expect(buildingEngine(rebuilt).checkpoint()).toEqual(checkpoint);
});

test('valid HF recovery cannot conceal changed host consequences or a missing outer action', () => {
  const world = openBuilding(7);
  actBuilding(world, { kind: 'go', to: 'roof' });
  advanceBuildingMinute(world);
  const checkpoint = buildingEngine(world).checkpoint();
  const changedHost = structuredClone(checkpoint);
  changedHost.world.k.money++;
  expect(() => replayBuilding(changedHost)).toThrow(/Keep the file/);
  const missingAction = structuredClone(checkpoint);
  missingAction.world.inputs = [];
  missingAction.world.applied = 0;
  expect(() => replayBuilding(missingAction)).toThrow(/Keep the file/);
  expect(buildingEngine(world).checkpoint()).toEqual(checkpoint);
});

test('an unsupported recorded command refuses without changing the source checkpoint', () => {
  const checkpoint = buildingEngine(openBuilding(7)).checkpoint();
  checkpoint.world.inputs.push({ kind: 'cast-pause', who: 'hacer', at: checkpoint.world.minute });
  checkpoint.world.applied++;
  const before = structuredClone(checkpoint);
  expect(() => replayBuilding(checkpoint)).toThrow(/Keep the file/);
  expect(checkpoint).toEqual(before);
});
