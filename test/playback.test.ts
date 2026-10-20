import { describe, expect, it } from 'vitest';
import { act, newGame, openTasks } from '../src/sim/game.ts';
import { playback } from '../src/ui/playback.ts';

describe('playback rate', () => {
  it('slows the first bread run at the highest chosen speed, including travel', () => {
    const state = newGame(11);
    expect(playback(state, 12, false, false)).toEqual({ rate: 0.3, reason: 'First bread run' });
    act(state, { kind: 'go', to: 'bakery' });
    expect(state.k.walk).toBeTruthy();
    expect(playback(state, 12, false, false)).toEqual({ rate: 0.3, reason: 'First bread run' });
  });

  it('keeps the first run slow until the last pending bread task resolves', () => {
    const state = newGame(11);
    const bread = openTasks(state).filter((task) => task.kind === 'bread');
    expect(bread.length).toBeGreaterThan(1);
    for (const task of bread.slice(0, -1)) task.done = state.minute;
    expect(playback(state, 12, true, true)).toEqual({ rate: 0.3, reason: 'First bread run' });
    const last = bread.at(-1);
    if (!last) throw new Error('Missing final bread task');
    last.done = state.minute;
    expect(playback(state, 12, false, false)).toEqual({ rate: 12, reason: '' });
  });

  it('restores the chosen speed after the final first-morning deadline', () => {
    const state = newGame(11);
    state.minute = Math.max(
      ...openTasks(state)
        .filter((task) => task.kind === 'bread')
        .map((task) => task.by),
    );
    expect(playback(state, 12, false, false)).toEqual({ rate: 0.3, reason: 'First bread run' });
    state.minute = 541;
    expect(openTasks(state).some((task) => task.kind === 'bread')).toBe(true);
    expect(playback(state, 12, false, false)).toEqual({ rate: 12, reason: '' });
  });

  it('uses the chosen rate on later days until a conversation starts', () => {
    const state = newGame(11);
    state.minute += 1440;
    expect(playback(state, 12, false, false)).toEqual({ rate: 12, reason: '' });
    expect(playback(state, 12, true, true)).toEqual({ rate: 0.6, reason: 'Conversation' });
    expect(playback(state, 12, false, false)).toEqual({ rate: 12, reason: '' });
  });

  it('keeps inspection moving and restores the chosen rate when it closes', () => {
    const state = newGame(11);
    state.minute += 1440;
    expect(playback(state, 12, false, true)).toEqual({ rate: 0.6, reason: 'Reading' });
    expect(playback(state, 12, false, false)).toEqual({ rate: 12, reason: '' });
  });

  it('never accelerates a slower chosen rate', () => {
    const state = newGame(11);
    expect(playback(state, 0.1, false, false).rate).toBe(0.1);
    state.minute += 1440;
    expect(playback(state, 0.1, true, false).rate).toBe(0.1);
    expect(playback(state, 0.1, false, true).rate).toBe(0.1);
  });

  it('does not mutate simulation state', () => {
    const state = newGame(11);
    const before = JSON.stringify(state);
    playback(state, 12, true, true);
    playback(state, 0.1, false, false);
    expect(JSON.stringify(state)).toBe(before);
  });
});
