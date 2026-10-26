import { expect, test, vi } from 'vitest';
import { act, newGame, replay, step } from '../src/sim/game.ts';
import { isSaved } from '../src/ui/save.ts';

const transport = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@adam0white/lab-client', async (original) => ({
  ...(await original<object>()),
  personaChannel: () => ({ enabled: true, ready: Promise.resolve(true), request: transport.request }),
  watchPersonaCheckpoint: () => () => {},
}));
vi.mock('../src/ui/lab.ts', () => ({
  lab: {
    build: () => ({ c: 'work-control' }),
    setPersonaRecording: () => {},
    allowPersonaRecording: () => {},
  },
}));

import { arrive, checkpointContinuity, installContinuity } from '../src/ui/cast-continuity.ts';

test('seed740488 explicit work starts at the same place with exact old replay', async () => {
  for (const edition of ['stairwell@9', 'stairwell@11', 'stairwell@13']) {
    const s = newGame(740488, edition);
    const job = s.tasks.find((t) => t.kind === 'job' && t.work && !t.pickup)!;
    if (edition === 'stairwell@13') {
      act(s, { kind: 'start-work', task: job.id });
      expect(s.k.busyTask).toBeNull();
      const before = JSON.stringify(s);
      expect(() => act(s, { kind: 'start-work', task: job.id, extra: true } as never)).toThrow();
      expect(() => act(s, { kind: 'unknown' } as never)).toThrow();
      expect(JSON.stringify(s)).toBe(before);
    }
    act(s, { kind: 'go', to: job.place });
    if (edition === 'stairwell@13') {
      act(s, { kind: 'start-work', task: job.id });
      expect(s.k.busyTask).toBeNull();
    }
    while (s.k.walk) step(s);
    const beforeEarly = JSON.stringify(s);
    if (edition === 'stairwell@13') {
      act(s, { kind: 'start-work', task: job.id });
      expect(s.k.busyTask).toBeNull();
    } else {
      expect(() => act(s, { kind: 'start-work', task: job.id })).toThrow();
      expect(JSON.stringify(s)).toBe(beforeEarly);
    }
    while (s.minute < job.from) step(s);
    act(s, { kind: 'go', to: job.place });
    expect(s.k.busyTask).toBeNull();
    if (edition === 'stairwell@13') {
      const money = s.k.money;
      const start = s.minute;
      act(s, { kind: 'start-work', task: job.id });
      expect(s.k.busyTask).toBe(job.id);
      expect(job.done).toBeUndefined();
      expect(s.kapici.activity?.action).toBe('work');
      expect(s.kapici.activity?.effort).toBe(0.5);
      expect(s.k.busyUntil).toBe(start + job.work!);
      act(s, { kind: 'start-work', task: job.id });
      expect(s.k.busyUntil).toBe(start + job.work!);
      for (let i = 1; i < job.work!; i++) step(s);
      expect(job.done).toBeUndefined();
      step(s);
      expect(job.done).toBe(start + job.work!);
      expect(s.k.money - money).toBe(15);
      act(s, { kind: 'start-work', task: job.id });
      expect(s.k.busyTask).toBeNull();
      expect(() => act(s, { kind: 'start-work', task: -1 })).toThrow();
    } else {
      act(s, { kind: 'go', to: 'step' });
      while (s.k.walk) step(s);
      act(s, { kind: 'go', to: job.place });
      while (s.k.walk) step(s);
      while (s.k.busyTask !== null) step(s);
    }
    expect(JSON.stringify(replay(s.seed, s.inputs, s.minute, edition))).toBe(JSON.stringify(s));
    const native = { game: edition, seed: s.seed, inputs: s.inputs, minute: s.minute, oneCast: s.oneCast };
    expect(isSaved(native)).toBe(true);
    expect(
      isSaved({ ...native, game: 'stairwell@9', inputs: [{ at: 420, kind: 'start-work', task: job.id }] }),
    ).toBe(false);
    expect(() =>
      replay(s.seed, [{ at: 420, kind: 'start-work', task: job.id }], 420, 'stairwell@11'),
    ).toThrow();
    expect(isSaved({ ...native, game: 'stairwell@14' })).toBe(false);
    expect(isSaved({ ...native, game: 'stairwell@13', castChapter: {} })).toBe(false);
    if (edition === 'stairwell@13') {
      while (s.phase === 'day') step(s);
      act(s, { kind: 'start-work', task: job.id });
      expect(s.k.busyTask).toBeNull();
    }
  }
  await expect(arrive(740488, false, 'stairwell@13')).rejects.toThrow('Character transfer');
  const fresh = await arrive(740488, true, 'stairwell@13');
  act(fresh, { kind: 'cast-pause', who: 'hacer' });
  while (fresh.phase === 'day' && fresh.castPauses?.hacer !== 'paused') step(fresh);
  installContinuity(
    () => fresh,
    () => {},
  );
  await checkpointContinuity();
  expect(transport.request).not.toHaveBeenCalled();
});
