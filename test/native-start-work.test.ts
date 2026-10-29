/** Actual player commands, public owner receipts, complete JSON/replay recovery. */
import { expect, test } from 'vitest';
import {
  actBuilding,
  advanceBuildingMinute,
  buildingEngine,
  buildingTravelMinutes,
  openBuilding,
  restoreBuilding,
} from '../src/sim/hf-game.ts';
import { replayBuilding } from '../src/sim/hf-replay.ts';
import { canStartWork } from '../src/sim/hf-view.ts';

test('Start work begins an available job after an actual early walk and wait, with exact recovery', () => {
  const world = openBuilding(740488, 'stairwell@16');
  const task = world.tasks.find(
    (entry) =>
      entry.kind === 'job' &&
      entry.work &&
      !entry.pickup &&
      entry.from > world.minute + buildingTravelMinutes(world, world.k.at, entry.place) + 15,
  );
  if (!task?.work) throw Error('Missing ordinary job with an actual early arrival');
  actBuilding(world, { kind: 'go', to: task.place });
  expect(world.k.walk?.to).toBe(task.place);
  while (world.k.walk) advanceBuildingMinute(world);
  expect(world.k.at).toBe(task.place);
  expect(world.minute).toBeLessThan(task.from);
  expect(world.k.busyTask).toBeNull();
  expect(canStartWork(world, task)).toBe(false);
  actBuilding(world, { kind: 'start-work', task: task.id });
  expect(world.k.busyTask).toBeNull();
  while (world.minute < task.from) advanceBuildingMinute(world);
  expect(canStartWork(world, task)).toBe(true);
  const start = world.minute;
  actBuilding(world, { kind: 'start-work', task: task.id });
  expect(world.k.busyTask).toBe(task.id);
  expect(world.k.busyUntil).toBe(start + task.work);
  const activity = buildingEngine(world).active.find((entry) => entry.person === 'kapici');
  expect(activity?.offer.id).toBe(`job:${task.id}`);
  expect(activity?.offer.durationMs).toBe(task.work * 60000);
  expect(activity?.offer.demands).toMatchObject({ effort: 0.5, focus: 0, mode: 'awake' });
  const active = buildingEngine(world).checkpoint();
  const recovered = restoreBuilding(JSON.parse(JSON.stringify(active)));
  expect(buildingEngine(replayBuilding(active)).checkpoint()).toEqual(active);
  for (let i = 1; i < task.work; i++) {
    advanceBuildingMinute(world);
    advanceBuildingMinute(recovered);
  }
  expect(task.done).toBeUndefined();
  advanceBuildingMinute(world);
  advanceBuildingMinute(recovered);
  expect(task.done).toBe(start + task.work);
  expect(world.k.busyTask).toBeNull();
  expect(buildingEngine(recovered).checkpoint()).toEqual(buildingEngine(world).checkpoint());
  expect(buildingEngine(replayBuilding(buildingEngine(world).checkpoint())).checkpoint()).toEqual(
    buildingEngine(world).checkpoint(),
  );
}, 120000);

test('an unavailable Start work command leaves the job and owner unchanged', () => {
  const world = openBuilding(740488);
  const task = world.tasks.find((entry) => entry.kind === 'job' && entry.work && !entry.pickup);
  if (!task) throw Error('Missing ordinary job');
  const before = buildingEngine(world).checkpoint();
  actBuilding(world, { kind: 'start-work', task: task.id });
  expect(world.k.busyTask).toBeNull();
  expect(task.done).toBeUndefined();
  expect(buildingEngine(world).checkpoint().archive).toEqual(before.archive);
});
