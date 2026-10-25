import { FRAMEWORK_VERSION, restore, snapshot } from '@adam0white/human-framework';
import { expect, it } from 'vitest';
import { claimWords, newGame, readOf, replay } from '../src/sim/game.ts';

it('writes plain opening and alternate claim text at the source and replays it exactly', () => {
  const state = newGame(7);
  const opening = state.said.map((x) => x.text).join(' ');
  expect(opening).toContain('Deliver the bread first.');
  expect(opening).toContain('Lale Apartmanı');
  expect(opening).toContain('Mr Burak');
  expect(opening).toContain('10:00 to 12:00');
  expect(claimWords('burak:sweet:derya', false)).toBe('Burak does not have romantic feelings for Derya.');
  expect(readOf(state, 'hacer').warmth).toMatch(/^They .+\.$/);
  expect(replay(7, [], state.minute)).toEqual(state);
});

it('pins plain HF narration for every fresh actor and refuses the old seed-only notebook', () => {
  expect(FRAMEWORK_VERSION).toBe('2.21.0');
  const state = newGame(7);
  for (const person of [...state.people, state.kapici]) {
    expect(person.engine).toBe('2.21.0');
    expect(person.lexicon?.plainEnglish).toBe(true);
    expect(restore(snapshot(person)).lexicon).toEqual(person.lexicon);
  }
  expect(() => replay(7, [], 420, 'stairwell@7')).toThrow(/Start fresh/);
  expect(replay(7, state.inputs, state.minute, state.version)).toEqual(state);
});
