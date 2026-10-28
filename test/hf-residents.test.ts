import { expect, test } from 'vitest';
import { advanceBuildingMinute, buildingEngine, openBuilding, restoreBuilding } from '../src/sim/hf-game.ts';

test('ordinary resident timetable starts real owned activities and replays an active JSON continuation', () => {
  const world = openBuilding(7);
  while (world.minute < 450) advanceBuildingMinute(world);
  expect(buildingEngine(world).active.some((activity) => activity.person === 'hacer')).toBe(true);
  expect(buildingEngine(world).active.some((activity) => activity.person === 'sevim')).toBe(true);
  const restored = restoreBuilding(JSON.parse(JSON.stringify(buildingEngine(world).checkpoint())));
  for (let i = 0; i < 70; i++) {
    advanceBuildingMinute(world);
    advanceBuildingMinute(restored);
  }
  expect(buildingEngine(restored).checkpoint()).toEqual(buildingEngine(world).checkpoint());
});
