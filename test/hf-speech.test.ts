import { expect, test } from 'vitest';
import {
  advanceBuildingMinute,
  buildingEngine,
  buildingTransaction,
  openBuilding,
} from '../src/sim/hf-game.ts';
import { talkResidentsBuilding } from '../src/sim/hf-speech.ts';

function resident(world: ReturnType<typeof openBuilding>, id: string) {
  const found = world.residents.find((person) => person.id === id);
  if (!found) throw Error('Missing authored resident');
  return found;
}

test('an encounter cannot narrate speech from residents who did not receive it', () => {
  const world = openBuilding(7);
  while (world.minute < 480) advanceBuildingMinute(world);
  // Host geometry premise only: Derya remains in her actual HF-owned sleep.
  resident(world, 'hacer').where = 'visit:derya';
  resident(world, 'derya').where = 'home';
  world.k.at = 'door:derya';
  const lines = world.said.length;
  buildingTransaction(world, (candidate) => talkResidentsBuilding(candidate, 'hacer', 'derya', 'flat 5'));
  expect(
    world.said
      .slice(lines)
      .some((line) => /weather|grandchildren|tomatoes|football|were talking/.test(line.text)),
  ).toBe(false);
  expect(world.talks.at(-1)?.props).toEqual([]);
  expect(() => buildingEngine(world).checkpoint()).not.toThrow();
});

test('unshared geometry refuses before a conversation input is admitted', () => {
  const world = openBuilding(7);
  resident(world, 'hacer').where = 'shop';
  resident(world, 'sevim').where = 'home';
  const before = buildingEngine(world).checkpoint();
  expect(() =>
    buildingTransaction(world, (candidate) => talkResidentsBuilding(candidate, 'hacer', 'sevim', 'step')),
  ).toThrow(/hear each other/);
  expect(buildingEngine(world).checkpoint()).toEqual(before);
});
