/** Native operations under migration: these controls prove actual HF ownership
 * and task timing, not the unwired whole-game or shelf journey. */
import { replay } from '@stairwell/hf4';
import { expect, test } from 'vitest';
import {
  advanceBuildingMinute,
  buildingEngine,
  buildingIngress,
  openBuilding,
  restoreBuilding,
  startBuildingWork,
} from '../src/sim/hf-game.ts';
import { currentSourceTrust } from '../src/sim/hf-readings.ts';
import { admitted } from '../src/sim/hf-run.ts';
import type { BuildingWorld } from '../src/sim/hf-world.ts';

test('a real generated ordinary job uses a shared native Run and settles only after actual work, with exact active recovery', () => {
  const world = openBuilding(7, 'stairwell@16');
  const engine = buildingEngine(world);
  expect(Object.keys(engine.checkpoint().archive.current.people)).toHaveLength(6);
  expect(engine.active.find((activity) => activity.person === 'derya')?.offer.id).toBe('derya-night-work');
  const task = world.tasks.find((task) => task.kind === 'job' && task.work && !task.pickup);
  if (!task?.work) throw Error('Missing ordinary authored source job');
  while (world.minute < task.from) advanceBuildingMinute(world);
  world.k.at = task.place; // Host-position premise; player travel wiring is a separate gate.
  expect(startBuildingWork(world, task.id)).toBe(true);
  const active = engine.active.find((activity) => activity.person === 'kapici');
  expect(active?.offer.demands).toMatchObject({ effort: 0.5, focus: 0, mode: 'awake' });
  const checkpoint = engine.checkpoint();
  const recovered = restoreBuilding(JSON.parse(JSON.stringify(checkpoint)), (input) =>
    structuredClone(input as BuildingWorld),
  );
  const end = world.minute + task.work;
  while (world.minute < end - 1) {
    advanceBuildingMinute(world);
    advanceBuildingMinute(recovered);
  }
  expect(world.tasks.find((entry) => entry.id === task.id)?.done).toBeUndefined();
  advanceBuildingMinute(world);
  advanceBuildingMinute(recovered);
  expect(world.tasks.find((entry) => entry.id === task.id)?.done).toBe(end);
  expect(buildingEngine(recovered).checkpoint()).toEqual(engine.checkpoint());
  expect(admitted(replay(engine.checkpoint().archive)).fullHash).toBe(
    engine.checkpoint().archive.hashes.full,
  );
  expect(startBuildingWork(world, task.id)).toBe(false);
});

test('manual Start work keeps its separate option and rejects before host mutation in the default week', () => {
  const world = openBuilding(7);
  const task = world.tasks.find((task) => task.kind === 'job' && task.work && !task.pickup);
  if (!task) throw Error('Missing ordinary source job');
  const before = buildingEngine(world).checkpoint();
  expect(startBuildingWork(world, task.id)).toBe(false);
  expect(buildingEngine(world).checkpoint()).toEqual(before);
});

test('same-scene testimony followups use one recorded phase per batch and survive JSON recovery; rejection preserves clock and phase', () => {
  const world = openBuilding(7);
  const initialPhase = world.protocol.phase,
    minute = world.minute;
  buildingIngress(
    world,
    ['hacer', 'sevim'].map((person) => ({
      kind: 'testimony.received' as const,
      payload: {
        person,
        evidenceId: `told:${person}`,
        teller: 'kapici',
        claims: [
          {
            prop: 'notice:water',
            value: true,
            confidence: 0.9,
            sourceId: 'kapici',
            evidenceId: `claim:${person}`,
            provenance: [`told:${person}`],
          },
        ],
      },
    })),
  );
  expect(world.protocol.phase).toBe(initialPhase + 1);
  expect(world.protocol.ingresses.at(-1)?.inputIds).toHaveLength(2);
  const checkpoint = buildingEngine(world).checkpoint();
  const recovered = restoreBuilding(JSON.parse(JSON.stringify(checkpoint)), (input) =>
    structuredClone(input as BuildingWorld),
  );
  const beforeTrust = currentSourceTrust(buildingEngine(world), 'hacer').kapici;
  const response = [
    {
      kind: 'social.received' as const,
      payload: {
        person: 'hacer',
        evidenceId: 'actual-comparison',
        other: 'kapici',
        event: { kind: 'insult' as const, byMe: false, magnitude: 0.4 },
        sourceTrustResponse: {
          sourceId: 'kapici',
          multiplier: 0.8,
          basis: { author: 'stairwell', ruleId: 'word-gets-back', edition: '14' },
        },
      },
    },
  ];
  buildingIngress(world, response);
  buildingIngress(recovered, response);
  expect(world.minute).toBe(minute);
  expect(world.protocol.phase).toBe(initialPhase + 2);
  expect(currentSourceTrust(buildingEngine(world), 'hacer').kapici).toBeCloseTo((beforeTrust ?? 0) * 0.8);
  expect(buildingEngine(recovered).checkpoint()).toEqual(buildingEngine(world).checkpoint());
  const before = buildingEngine(world).checkpoint();
  currentSourceTrust(buildingEngine(world), 'hacer');
  expect(world.protocol.phase).toBe(initialPhase + 2);
  const event = response[0];
  if (!event) throw Error('Missing authored comparison fixture');
  expect(() =>
    buildingIngress(world, [
      { ...event, payload: { ...event.payload, evidenceId: 'bad-person', person: 'absent' } },
    ]),
  ).toThrow();
  expect(buildingEngine(world).checkpoint()).toEqual(before);
  expect(admitted(replay(before.archive)).fullHash).toBe(before.archive.hashes.full);
  world.protocol.phase = 59_999; // Exercise the explicit domain limit without 60k artificial events.
  const bounded = buildingEngine(world).checkpoint();
  expect(() => buildingIngress(world, response)).toThrow(/millisecond input positions/);
  expect(buildingEngine(world).checkpoint()).toEqual(bounded);
});
