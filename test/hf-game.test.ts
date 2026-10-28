/** Native operations under migration: these controls prove actual HF ownership
 * and task timing, not the unwired whole-game or shelf journey. */
import { replay } from '@adam0white/human-framework';
import { expect, test } from 'vitest';
import { currentDeparture } from '../src/sim/hf-cast.ts';
import {
  actBuilding,
  advanceBuildingMinute,
  buildingEngine,
  buildingFreeOffers,
  buildingIngress,
  buildingTravelMinutes,
  chooseBuilding,
  goBuilding,
  openBuilding,
  restoreBuilding,
  startBuildingWork,
} from '../src/sim/hf-game.ts';
import { currentSourceTrust } from '../src/sim/hf-readings.ts';
import { admitted } from '../src/sim/hf-run.ts';

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
  const recovered = restoreBuilding(JSON.parse(JSON.stringify(checkpoint)));
  const end = world.minute + task.work;
  while (world.minute < end - 1) {
    advanceBuildingMinute(world);
    advanceBuildingMinute(recovered);
  }
  expect(world.tasks.find((entry) => entry.id === task.id)?.done).toBeUndefined();
  expect(world.k.money).toBe(0);
  advanceBuildingMinute(world);
  advanceBuildingMinute(recovered);
  expect(world.tasks.find((entry) => entry.id === task.id)?.done).toBe(end);
  // The actual resident schedule leaves this generated job unattended; no tip is invented.
  expect(world.k.money).toBe(0);
  expect(world.reports[0]?.done).toBe(1);
  expect(world.reports[0]?.tips).toBe(world.k.money);
  expect(buildingEngine(recovered).checkpoint()).toEqual(engine.checkpoint());
  expect(admitted(replay(engine.checkpoint().archive)).fullHash).toBe(
    engine.checkpoint().archive.hashes.full,
  );
  const settled = engine.checkpoint();
  expect(startBuildingWork(world, task.id)).toBe(false);
  expect(engine.checkpoint()).toEqual(settled);
  const money = world.k.money;
  for (let i = 0; i < 20; i++) advanceBuildingMinute(world);
  expect(world.k.money).toBe(money);
  expect(world.reports[0]?.done).toBe(1);
  expect(engine.active.some((activity) => activity.person === 'kapici')).toBe(false);
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
  const recovered = restoreBuilding(JSON.parse(JSON.stringify(checkpoint)));
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

test('opening-to-job walking preserves route demand and arrival work, including active JSON recovery', () => {
  const world = openBuilding(7);
  const job = world.tasks.find((task) => task.kind === 'job' && task.work && !task.pickup);
  if (!job?.work) throw Error('Missing actual generated job');
  while (world.minute < job.from) advanceBuildingMinute(world);
  const from = world.k.at,
    start = world.minute;
  const duration = buildingTravelMinutes(world, from, job.place);
  expect(goBuilding(world, job.place)).toBe(true);
  expect(world.k.at).toBe(from);
  expect(world.k.walk).toEqual({ from, to: job.place, at0: start, at1: start + duration });
  const walk = buildingEngine(world).active.find((activity) => activity.person === 'kapici');
  expect(walk?.offer.durationMs).toBe(duration * 60000);
  expect(walk?.offer.demands.effort).toBe(job.place === 'landing:0' ? 0.35 : 0.85);
  const recovered = restoreBuilding(JSON.parse(JSON.stringify(buildingEngine(world).checkpoint())));
  for (let i = 0; i < duration + job.work; i++) {
    advanceBuildingMinute(world);
    advanceBuildingMinute(recovered);
    if (i < duration - 1) expect(world.k.at).toBe(from);
  }
  expect(world.k.at).toBe(job.place);
  expect(world.tasks.find((task) => task.id === job.id)?.done).toBe(start + duration + job.work);
  // The actual resident schedule leaves this generated job unattended; no tip is invented.
  expect(world.k.money).toBe(0);
  expect(buildingEngine(world).checkpoint()).toEqual(buildingEngine(recovered).checkpoint());
  expect(admitted(replay(buildingEngine(world).checkpoint().archive)).fullHash).toBe(
    buildingEngine(world).checkpoint().archive.hashes.full,
  );
});

test('going to the same place does not auto-start work that appeared after arrival', () => {
  const world = openBuilding(7, 'stairwell@16');
  const job = world.tasks.find((task) => task.kind === 'job' && task.work && !task.pickup);
  if (!job?.work) throw Error('Missing actual generated job');
  expect(goBuilding(world, job.place)).toBe(true);
  while (world.k.walk) advanceBuildingMinute(world);
  while (world.minute < job.from) advanceBuildingMinute(world);
  expect(goBuilding(world, job.place)).toBe(false);
  expect(world.k.busyTask).toBeNull();
  expect(startBuildingWork(world, job.id)).toBe(true);
});

test('Derya completes the real opening shift before her exact scheduled sleep, with full prefix recovery', () => {
  const world = openBuilding(7);
  while (world.minute < 479) advanceBuildingMinute(world);
  expect(buildingEngine(world).active.find((activity) => activity.person === 'derya')?.offer.id).toBe(
    'derya-night-work',
  );
  advanceBuildingMinute(world);
  const engine = buildingEngine(world);
  const active = engine.active.find((activity) => activity.person === 'derya');
  expect(world.minute).toBe(480);
  expect(active?.offer.id).toBe('derya-day-sleep');
  expect(active?.offer.durationMs).toBe(450 * 60000);
  expect(active?.offer.demands.mode).toBe('sleep');
  expect(world.residents.find((resident) => resident.id === 'derya')?.until).toBe(930);
  const checkpoint = engine.checkpoint();
  expect(() => currentDeparture(engine, 'derya', [])).toThrow();
  expect(engine.checkpoint()).toEqual(checkpoint);
  const restored = restoreBuilding(JSON.parse(JSON.stringify(checkpoint)));
  while (world.minute < 930) {
    advanceBuildingMinute(world);
    advanceBuildingMinute(restored);
  }
  expect(engine.active.find((activity) => activity.person === 'derya')?.offer.demands.mode).toBe('awake');
  const stopDerya = (candidate: typeof world) => {
    const active = buildingEngine(candidate).active.find((activity) => activity.person === 'derya');
    if (!active) throw Error('Missing actual continuing free-time activity');
    buildingIngress(candidate, [
      {
        kind: 'activity.interrupted',
        payload: {
          person: 'derya',
          activityId: active.id,
          reason: 'Bounded projection control pauses new free-time work.',
        },
      },
    ]);
  };
  stopDerya(world);
  stopDerya(restored);
  expect(buildingEngine(restored).checkpoint()).toEqual(engine.checkpoint());
  // The actual completed sleep receipt lets the body owner end voluntary sleep.
  // The host has not patched sleep state or authored a pretend waking event.
  expect(
    currentDeparture(engine, 'derya', []).transfer.portable.retained.memory.episodes.some(
      (episode) => episode.action === 'sleep',
    ),
  ).toBe(true);
  const choice = chooseBuilding(
    world,
    'derya',
    buildingFreeOffers(world, 'derya'),
    'Derya’s scheduled sleep has ended.',
  );
  const restoredChoice = chooseBuilding(
    restored,
    'derya',
    buildingFreeOffers(restored, 'derya'),
    'Derya’s scheduled sleep has ended.',
  );
  expect(restoredChoice).toEqual(choice);
  const waking = engine.active.find((activity) => activity.person === 'derya');
  expect(waking?.offer.demands.mode).toBe('awake');
  if (!waking) throw Error('Derya did not take an actual free-time choice');
  const end = world.minute + waking.offer.durationMs / 60000;
  while (world.minute < end) {
    advanceBuildingMinute(world);
    advanceBuildingMinute(restored);
  }
  expect(buildingEngine(restored).checkpoint()).toEqual(engine.checkpoint());
  stopDerya(world);
  stopDerya(restored);
  const portable = currentDeparture(engine, 'derya', []).transfer.portable;
  expect(portable.retained.memory.episodes.some((episode) => episode.action === 'work')).toBe(true);
  expect(portable.retained.memory.episodes.some((episode) => episode.action === 'sleep')).toBe(true);
  expect(admitted(replay(engine.checkpoint().archive)).fullHash).toBe(
    engine.checkpoint().archive.hashes.full,
  );
});

test('the external command route records accepted actions once and rolls back rejected batches with the complete log', () => {
  const world = openBuilding(7, 'stairwell@16');
  actBuilding(world, { kind: 'go', to: 'roof' });
  expect(world.inputs).toEqual([{ kind: 'go', to: 'roof', at: 420 }]);
  expect(world.applied).toBe(1);
  expect(world.k.walk?.to).toBe('roof');
  const before = buildingEngine(world).checkpoint();
  expect(() => actBuilding(world, { kind: 'cast-pause', who: 'hacer' })).toThrow();
  expect(buildingEngine(world).checkpoint()).toEqual(before);
  const historicalOnly = { kind: 'one-cast-depart' } as const;
  expect(() => actBuilding(world, historicalOnly)).toThrow();
  expect(buildingEngine(world).checkpoint()).toEqual(before);
  const full = openBuilding(7, 'stairwell@16');
  full.protocol.phase = 59_999; // Domain-bound refusal, no 60k artificial events.
  const bounded = buildingEngine(full).checkpoint();
  expect(() => actBuilding(full, { kind: 'go', to: 'roof' })).toThrow(/millisecond input positions/);
  expect(buildingEngine(full).checkpoint()).toEqual(bounded);
});
