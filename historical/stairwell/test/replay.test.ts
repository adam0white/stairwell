import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { playWeek } from '../scripts/policy.ts';
import { act, canReplay, GAME_VERSION, replay, step } from '../src/sim/game.ts';
import { isSaved } from '../src/ui/save.ts';

describe('canonical edition replay', () => {
  it('refuses engine-2.21 edition 8 rather than silently replaying it with HF3', () => {
    expect(canReplay('stairwell@8')).toBe(false);
    expect(() => replay(7, [], 420, 'stairwell@8')).toThrow(/Start fresh/);
  });
  it('refuses the frozen old-cast notebook instead of silently replacing its people', () => {
    const fixture = JSON.parse(
      readFileSync(new URL('./fixtures/stairwell-v3-notebook.json', import.meta.url), 'utf8'),
    );
    expect(isSaved(fixture.notebook)).toBe(false);
    expect(canReplay(fixture.notebook.game)).toBe(false);
    expect(() =>
      replay(fixture.notebook.seed, fixture.notebook.inputs, fixture.notebook.minute, fixture.notebook.game),
    ).toThrow(/Start fresh/);
  });
  it('round-trips complete current state including RNG and continues identically', () => {
    const original = playWeek(11, 'honest');
    const file = JSON.parse(
      JSON.stringify({
        game: GAME_VERSION,
        seed: original.seed,
        inputs: original.inputs,
        minute: original.minute,
      }),
    );
    expect(isSaved(file)).toBe(true);
    expect(replay(file.seed, file.inputs, file.minute, file.game)).toEqual(original);
    const midway = replay(
      file.seed,
      file.inputs.filter((i: { at: number }) => i.at <= 1200),
      1200,
      file.game,
    );
    const restored = replay(midway.seed, midway.inputs, midway.minute, midway.version);
    while (midway.phase === 'day') step(midway);
    while (restored.phase === 'day') step(restored);
    act(midway, { kind: 'next' });
    act(restored, { kind: 'next' });
    expect(restored).toEqual(midway);
  });
});
