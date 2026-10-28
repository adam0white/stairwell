import { expect, test } from 'vitest';
import { actBuilding, openBuilding } from '../src/sim/hf-game.ts';
import { canWait, playback } from '../src/ui/playback.ts';

test('native pacing preserves the slow order clock and brisk actual travel', () => {
  const world = openBuilding(11);
  expect(playback(world, false, false).rate).toBe(0.6);
  expect(canWait(world, false, false)).toBe(false);
  actBuilding(world, { kind: 'go', to: 'bakery' });
  expect(playback(world, false, false).rate).toBe(6);
  expect(playback(world, false, true).rate).toBe(0);
  expect(playback(world, true, false).rate).toBe(0);
});
test('native month reading keeps its authored slow clock', () => {
  const world = openBuilding(11, 'stairwell@15');
  expect(playback(world, false, true)).toEqual({ rate: 0.6, reason: 'You are reading. Time moves slowly.' });
  expect(playback(world, true, false)).toEqual({ rate: 0.6, reason: 'You are talking. Time moves slowly.' });
});
