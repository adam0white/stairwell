import { describe, expect, it } from 'vitest';
import { act, newGame, openTasks, step } from '../src/sim/game.ts';
import { canWait, playback, untilSomethingHappens } from '../src/ui/playback.ts';

describe('automatic pacing', () => {
  it('protects every day’s orders and keeps travel brisk', () => {
    const s = newGame(11);
    expect(playback(s, false, false).rate).toBe(0.6);
    act(s, { kind: 'go', to: 'bakery' });
    expect(playback(s, false, false).rate).toBe(6);
    expect(canWait(s, false, false)).toBe(false);
    s.minute += 1440;
    s.k.walk = null;
    for (const task of openTasks(s)) task.by = s.minute + 30;
    expect(playback(s, false, false).rate).toBe(0.6);
  });

  it('holds conversations and reading, including while travelling', () => {
    const s = newGame(11);
    act(s, { kind: 'go', to: 'bakery' });
    const before = JSON.stringify(s);
    expect(playback(s, true, false).rate).toBe(0);
    expect(playback(s, false, true).rate).toBe(0);
    expect(JSON.stringify(s)).toBe(before);
    expect(canWait(s, true, false)).toBe(false);
  });

  it('offers one bounded advance in an empty stretch and stops on the first event', () => {
    const s = newGame(11);
    for (const task of openTasks(s)) task.done = s.minute;
    expect(canWait(s, false, false)).toBe(true);
    const copy = structuredClone(s);
    const line = s.lineNo;
    const tasks = openTasks(s)
      .map((t) => t.id)
      .join(',');
    const advanced = untilSomethingHappens(s);
    expect(advanced).toBeGreaterThan(0);
    expect(advanced).toBeLessThanOrEqual(840);
    // A literal minute walk reaches the same first event and complete state.
    let n = 0;
    do {
      step(copy);
      n++;
    } while (
      copy.phase === 'day' &&
      copy.lineNo === line &&
      openTasks(copy)
        .map((t) => t.id)
        .join(',') === tasks &&
      n < advanced
    );
    expect(n).toBe(advanced);
    expect(s).toEqual(copy);
  });

  it('does not offer waiting over a current order or inspection', () => {
    const s = newGame(11);
    expect(canWait(s, false, false)).toBe(false);
    s.minute = Math.max(...openTasks(s).map((task) => task.by)) + 1;
    expect(playback(s, false, false).rate).toBe(0.6);
    expect(canWait(s, false, false)).toBe(false);
    for (const task of openTasks(s)) task.done = s.minute;
    expect(canWait(s, false, true)).toBe(false);
    expect(playback(s, false, false).rate).toBe(6);
  });
});
