import { replay } from '@adam0white/human-framework';
import { expect, test } from 'vitest';
import { advanceBuildingMinute, buildingEngine, openBuilding, restoreBuilding } from '../src/sim/hf-game.ts';
import { admitted } from '../src/sim/hf-run.ts';

test('the real closing boundary applies missed work once and preserves the night checkpoint', () => {
  const world = openBuilding(7);
  while (world.minute < 1260) advanceBuildingMinute(world);
  expect(world.phase).toBe('night');
  expect(world.reports[0]?.missed).toBeGreaterThan(0);
  expect(world.tasks.every((task) => task.done !== undefined)).toBe(true);
  const checkpoint = buildingEngine(world).checkpoint();
  advanceBuildingMinute(world);
  expect(buildingEngine(world).checkpoint()).toEqual(checkpoint);
  expect(buildingEngine(restoreBuilding(JSON.parse(JSON.stringify(checkpoint)))).checkpoint()).toEqual(
    checkpoint,
  );
  expect(admitted(replay(checkpoint.archive)).fullHash).toBe(checkpoint.archive.hashes.full);
}, 60000);
