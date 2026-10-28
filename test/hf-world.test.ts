import { expect, test } from 'vitest';
import { newGame } from '../src/sim/game.ts';
import { openingWorld } from '../src/sim/hf-world.ts';

test('new native openings retain the existing week/month/work material premises and generated task difficulty', () => {
  for (const seed of [1, 7, 91])
    for (const [source, target] of [
      ['stairwell@9', 'stairwell@14'],
      ['stairwell@11', 'stairwell@15'],
      ['stairwell@13', 'stairwell@16'],
    ] as const) {
      const original = newGame(seed, source);
      const current = openingWorld(seed, target);
      expect(current.tasks).toEqual(original.tasks);
      expect(current.residents).toEqual(original.residents);
      expect(current.k).toEqual(original.k);
      expect(current.month).toEqual(original.month);
      expect(current.jobsUsed).toEqual(original.jobsUsed);
      expect(current.stories).toEqual(original.stories);
    }
});
