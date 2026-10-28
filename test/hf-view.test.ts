import { describe, expect, it } from 'vitest';
import type { Task } from '../src/sim/building-types.ts';
import {
  canReplay,
  canStartWork,
  clockOf,
  dayLabel,
  faceToFace,
  floorOf,
  openTasks,
  placeName,
} from '../src/sim/hf-view.ts';
import { openingWorld } from '../src/sim/hf-world.ts';

describe('native UI projections', () => {
  it('uses host geometry for encounters and names', () => {
    const world = openingWorld(1, 'stairwell@14');
    world.phase = 'day';
    world.k.at = 'door:hacer';
    world.residents.find((r) => r.id === 'hacer')!.where = 'home';
    expect(faceToFace(world)).toEqual(['hacer']);
    world.k.walk = { from: 'step', to: 'door:hacer', at0: 0, at1: 1 };
    expect(faceToFace(world)).toEqual([]);
    expect(floorOf('roof')).toBe(5);
    expect(placeName('landing:0')).toBe('the entrance');
    expect(clockOf(-1)).toBe('23:59');
    expect(dayLabel(world)).toBe('Monday');
    expect(canReplay('stairwell@13')).toBe(false);
    expect(canReplay('stairwell@16')).toBe(true);
  });
  it('separates visible tasks from eligible ordinary work', () => {
    const world = openingWorld(1, 'stairwell@16');
    world.phase = 'day';
    const job: Task = {
      id: 999,
      kind: 'job',
      for: 'hacer',
      label: 'work',
      place: world.k.at,
      work: 10,
      from: world.minute,
      by: world.minute + 60,
    };
    world.tasks = [job, { ...job, id: 1000, from: world.minute + 1 }];
    world.k.busyTask = null;
    world.k.busyUntil = world.minute;
    expect(openTasks(world)).toEqual([job]);
    expect(canStartWork(world, job)).toBe(true);
    expect(canStartWork(world, { ...job })).toBe(false);
    job.custody = 'hacer';
    expect(openTasks(world)).toEqual([job]);
    expect(canStartWork(world, job)).toBe(false);
    delete job.custody;
    world.version = 'stairwell@15';
    expect(canStartWork(world, job)).toBe(false);
  });
});
