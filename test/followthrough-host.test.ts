import { expect, test } from 'vitest';
import {
  actBuilding,
  advanceBuildingMinute,
  buildingTravelMinutes,
  openBuilding,
} from '../src/sim/hf-game.ts';
import { canStartWork } from '../src/sim/hf-view.ts';

test.each(['stairwell@14', 'stairwell@15'] as const)(
  'ordinary work starts at the current location in %s',
  (edition) => {
    const world = openBuilding(740488, edition);
    const task = world.tasks.find(
      (entry) =>
        entry.kind === 'job' &&
        entry.work &&
        !entry.pickup &&
        entry.from > world.minute + buildingTravelMinutes(world, world.k.at, entry.place) + 15,
    );
    if (!task?.work) throw Error('Missing early arrival job');
    actBuilding(world, { kind: 'go', to: task.place });
    while (world.k.walk) advanceBuildingMinute(world);
    while (world.minute < task.from) advanceBuildingMinute(world);
    expect(canStartWork(world, task)).toBe(true);
    actBuilding(world, { kind: 'start-work', task: task.id });
    expect(world.k.busyTask).toBe(task.id);
    expect(world.k.busyUntil).toBe(world.minute + task.work);
    const recipient = world.residents.find((person) => person.id === task.for)!;
    recipient.where = 'work'; // Synthetic absence; the work itself runs through HF.
    for (let i = 0; i < task.work; i++) advanceBuildingMinute(world);
    expect(task.done).toBeDefined();
    expect(world.pendingWork.some((entry) => entry.task === task.id)).toBe(true);
  },
  120000,
);

test('same-place parcel delivery does not claim nothing happened', () => {
  const world = openBuilding(740488, 'stairwell@14');
  const task = world.tasks.find((entry) => entry.kind === 'parcel');
  if (!task) throw Error('Missing parcel');
  world.k.at = task.place;
  task.carried = true;
  const resident = world.residents.find((entry) => entry.id === task.for);
  if (!resident) throw Error('Missing recipient');
  resident.where = 'home';
  actBuilding(world, { kind: 'go', to: task.place });
  expect(world.tasks.find((entry) => entry.id === task.id)?.done).toBeDefined();
  expect(world.said.at(-1)?.text).not.toContain('nothing to pick up or deliver');
});

test('a resident acknowledges completed work at the next face-to-face encounter', async () => {
  const { completeBuildingTask } = await import('../src/sim/hf-game.ts');
  const world = openBuilding(740488);
  const task = world.tasks.find((entry) => entry.kind === 'job' && entry.for === 'hacer');
  if (!task) throw Error('Missing Hacer job');
  const hacer = world.residents.find((entry) => entry.id === 'hacer')!;
  world.k.at = task.place;
  hacer.where = 'work';
  completeBuildingTask(world, task, false);
  expect(world.said.some((line) => line.who === 'hacer' && line.text.includes('noticed the work'))).toBe(
    false,
  );
  hacer.where = 'home';
  actBuilding(world, { kind: 'news', who: 'hacer' });
  expect(world.said.some((line) => line.who === 'hacer' && line.text.includes('noticed the work'))).toBe(
    true,
  );
});

test('a personal reply takes time and lets the resident choose whether to continue', async () => {
  const { buildingEngine } = await import('../src/sim/hf-game.ts');
  const world = openBuilding(7);
  world.k.at = 'door:hacer';
  actBuilding(world, { kind: 'sit', who: 'hacer' });
  for (let i = 0; i < 10; i++) advanceBuildingMinute(world);
  const before = world.minute;
  actBuilding(world, { kind: 'reply', who: 'hacer', reply: 'thank' } as never);
  expect(world.said.some((line) => line.who === 'kapici' && line.text === 'Thank you for telling me.')).toBe(
    true,
  );
  expect(world.k.walk?.at1).toBe(before + 2);
  expect(
    buildingEngine(world).active.some(
      (activity) => activity.person === 'kapici' && activity.offer.durationMs === 120000,
    ),
  ).toBe(true);
  for (let i = 0; i < 2; i++) advanceBuildingMinute(world);
  expect(
    world.said.some(
      (line) =>
        line.who === 'hacer' &&
        (line.text === 'I am glad you listened.' || line.text === 'I would rather leave it there.'),
    ),
  ).toBe(true);
});

test('waiting with a parcel for an absent recipient uses the chosen clock speed', async () => {
  const { playback } = await import('../src/ui/playback.ts');
  const world = openBuilding(740488);
  const parcel = world.tasks.find((task) => task.kind === 'parcel')!;
  parcel.carried = true;
  parcel.from = world.minute;
  world.k.at = parcel.place;
  world.residents.find((person) => person.id === parcel.for)!.where = 'work';
  expect(playback(world, false, false, 3)).toEqual({
    rate: 3,
    reason: 'You are waiting with a parcel. Time follows your chosen speed.',
  });
});

test('a quiet break is an ordinary timed activity without repeating a resident story', async () => {
  const { buildingEngine } = await import('../src/sim/hf-game.ts');
  const world = openBuilding(7);
  const voiceCount = world.said.filter((line) => line.kind === 'voice').length;
  actBuilding(world, { kind: 'rest' } as never);
  expect(world.k.walk?.at1).toBe(world.minute + 10);
  expect(
    buildingEngine(world).active.some(
      (activity) => activity.person === 'kapici' && activity.offer.actionId === 'rest',
    ),
  ).toBe(true);
  expect(world.said.filter((line) => line.kind === 'voice')).toHaveLength(voiceCount);
});

test('exhausted sitting stories do not cycle back to the first line', () => {
  const world = openBuilding(7);
  world.k.at = 'door:hacer';
  world.residents.find((person) => person.id === 'hacer')!.sits = 3;
  actBuilding(world, { kind: 'sit', who: 'hacer' });
  expect(world.said.some((line) => line.text.includes('I used to work behind a shop counter'))).toBe(false);
});

test('a reply interrupted before completion produces no resident answer', async () => {
  const { interruptBuildingPerson } = await import('../src/sim/hf-game.ts');
  const world = openBuilding(7);
  world.k.at = 'door:hacer';
  actBuilding(world, { kind: 'sit', who: 'hacer' });
  for (let i = 0; i < 10; i++) advanceBuildingMinute(world);
  actBuilding(world, { kind: 'reply', who: 'hacer', reply: 'thank' });
  interruptBuildingPerson(world, 'hacer', 'The resident leaves the conversation.');
  for (let i = 0; i < 3; i++) advanceBuildingMinute(world);
  expect(
    world.said.some(
      (line) => line.text === 'I am glad you listened.' || line.text === 'I would rather leave it there.',
    ),
  ).toBe(false);
});

test('an exhausted sitting can still reveal a confidence after trust rises', async () => {
  const { applyBuildingEvents, buildingTransaction } = await import('../src/sim/hf-game.ts');
  const { trustedStoryListenerBuilding } = await import('../src/sim/hf-stories.ts');
  const { PRIVATE_FACTS } = await import('../src/sim/stories.ts');
  const world = openBuilding(7);
  world.k.at = 'door:hacer';
  world.residents.find((person) => person.id === 'hacer')!.sits = 3;
  for (let i = 0; i < 30 && !trustedStoryListenerBuilding(world, 'hacer'); i++) {
    buildingTransaction(world, (candidate) =>
      applyBuildingEvents(candidate, [
        {
          kind: 'social.received',
          payload: {
            person: 'hacer',
            other: 'kapici',
            evidenceId: `trust-test:${i}`,
            event: { kind: 'gift', byMe: false, magnitude: 1 },
          },
        },
      ]),
    );
  }
  expect(trustedStoryListenerBuilding(world, 'hacer')).toBe(true);
  expect(world.secrets[PRIVATE_FACTS.hacer]).toBeUndefined();
  actBuilding(world, { kind: 'sit', who: 'hacer' });
  expect(world.k.walk?.at1).toBe(world.minute + 10);
  expect(world.secrets[PRIVATE_FACTS.hacer]).toBeDefined();
});

test('a refused sitting does not offer a personal reply', async () => {
  const { canReplyBuilding } = await import('../src/sim/hf-player-actions.ts');
  const world = openBuilding(7);
  world.k.at = 'door:hacer';
  world.residents.find((person) => person.id === 'hacer')!.sitDay = 1;
  actBuilding(world, { kind: 'sit', who: 'hacer' });
  expect(canReplyBuilding(world, 'hacer')).toBe(false);
});
