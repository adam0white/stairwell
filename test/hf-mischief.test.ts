import { expect, test } from 'vitest';
import type { Task } from '../src/sim/building-types.ts';
import {
  actBuilding,
  advanceBuildingMinute,
  buildingEngine,
  openBuilding,
  restoreBuilding,
} from '../src/sim/hf-game.ts';
import { beliefProbability } from '../src/sim/hf-readings.ts';

test('swapped papers cause observations only at their real scheduled reading time and survive JSON', () => {
  const world = openBuilding(7);
  for (const task of world.tasks)
    if (task.kind === 'bread' && ['hacer', 'sevim'].includes(task.for)) task.carried = true; // Actual carried-paper host premise.
  actBuilding(world, { kind: 'prank', what: 'swap' });
  expect(world.protocol.paperMixups).toHaveLength(2);
  const before = beliefProbability(buildingEngine(world), 'hacer', 'sevim:nosy');
  const restored = restoreBuilding(JSON.parse(JSON.stringify(buildingEngine(world).checkpoint())));
  for (let i = 0; i < 59; i++) {
    advanceBuildingMinute(world);
    advanceBuildingMinute(restored);
  }
  expect(beliefProbability(buildingEngine(world), 'hacer', 'sevim:nosy')).toBe(before);
  advanceBuildingMinute(world);
  advanceBuildingMinute(restored);
  expect(beliefProbability(buildingEngine(world), 'hacer', 'sevim:nosy')).toBeGreaterThan(before);
  expect(world.protocol.paperMixups).toHaveLength(0);
  expect(buildingEngine(restored).checkpoint()).toEqual(buildingEngine(world).checkpoint());
});

test('misdelivery records a real peek or wait and forwards only at the scheduled later world receipt', () => {
  const world = openBuilding(7);
  const task: Task = {
    id: world.nextTask++,
    kind: 'parcel' as const,
    for: 'burak' as const,
    label: 'sealed paper supplies',
    place: 'door:burak' as const,
    from: world.minute,
    by: world.minute + 120,
    carried: true,
    label2: { prop: 'burak:parcel', text: 'The label names paper supplies.' },
  };
  world.tasks.push(task); // Explicit sealed-parcel host premise, no actor state mutation.
  world.k.at = 'door:hacer';
  const before = beliefProbability(buildingEngine(world), 'hacer', 'burak:parcel');
  actBuilding(world, { kind: 'misdeliver', who: 'hacer', task: task.id });
  const record = world.protocol.wrongParcels[0];
  if (!record) throw Error('Missing accepted actual parcel activity');
  expect(buildingEngine(world).active.some((activity) => activity.id === record.activityId)).toBe(true);
  expect(task.done).toBeUndefined();
  expect(beliefProbability(buildingEngine(world), 'hacer', 'burak:parcel')).toBe(before);
  const restored = restoreBuilding(JSON.parse(JSON.stringify(buildingEngine(world).checkpoint())));
  for (let i = 0; i < 59; i++) {
    advanceBuildingMinute(world);
    advanceBuildingMinute(restored);
  }
  expect(world.tasks.find((item) => item.id === task.id)?.done).toBeUndefined();
  const after = beliefProbability(buildingEngine(world), 'hacer', 'burak:parcel');
  expect(after > before).toBe(record.choice === 'peek');
  advanceBuildingMinute(world);
  advanceBuildingMinute(restored);
  expect(world.tasks.find((item) => item.id === task.id)?.done).toBe(480);
  expect(buildingEngine(restored).checkpoint()).toEqual(buildingEngine(world).checkpoint());
});
