import { expect, test } from 'vitest';
import {
  actBuilding,
  advanceBuildingMinute,
  buildingEngine,
  openBuilding,
  restoreBuilding,
} from '../src/sim/hf-game.ts';
import { replayBuilding } from '../src/sim/hf-replay.ts';

test('a page turn completes real chronological night activities and resumes the next morning', () => {
  const world = openBuilding(7);
  while (world.phase === 'day') advanceBuildingMinute(world);
  const night = buildingEngine(world).checkpoint();
  actBuilding(world, { kind: 'next' });
  expect(world.minute).toBe(1440 + 420);
  expect(world.phase).toBe('day');
  expect(world.inputs).toEqual([{ kind: 'next', at: 1260 }]);
  expect(buildingEngine(world).active.find((activity) => activity.person === 'derya')?.offer.id).toBe(
    'derya-night-work',
  );
  const checkpoint = buildingEngine(world).checkpoint();
  expect(buildingEngine(restoreBuilding(JSON.parse(JSON.stringify(checkpoint)))).checkpoint()).toEqual(
    checkpoint,
  );
  expect(buildingEngine(replayBuilding(checkpoint)).checkpoint()).toEqual(checkpoint);
  expect(night.world.minute).toBe(1260);
}, 120000);
