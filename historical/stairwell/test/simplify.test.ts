import { FRAMEWORK_VERSION, restore, snapshot } from '@adam0white/human-framework';
import { expect, it } from 'vitest';
import { act, claimWords, newGame, readOf, replay, step, wordHint } from '../src/sim/game.ts';

it('writes plain opening and alternate claim text at the source and replays it exactly', () => {
  const state = newGame(7);
  const opening = state.said.map((x) => x.text).join(' ');
  expect(opening).toContain('Deliver the bread first.');
  expect(opening).toContain('Lale Apartmanı');
  expect(opening).toContain('Mr Burak');
  expect(opening).toContain('10:00 to 12:00');
  expect(claimWords('burak:sweet:derya', false)).toBe('Burak does not have romantic feelings for Derya.');
  expect(readOf(state, 'hacer').warmth).toMatch(/^Hacer .+\.$/);
  expect(readOf(state, 'hacer').word).not.toMatch(/\b(they|their|them)\b/i);
  expect(wordHint(state, 'burak')).toBe('Ask from Thursday at 07:00, face to face.');
  expect(opening).toContain('Lale Apartmanı, the Lale apartment building');
  expect(replay(7, [], state.minute)).toEqual(state);
});

it('pins plain HF narration for every fresh actor and refuses the old seed-only notebook', () => {
  expect(FRAMEWORK_VERSION).toBe('3.0.0');
  const state = newGame(7);
  for (const person of [...state.people, state.kapici]) {
    expect(person.engine).toBe('2.23.0');
    expect(person.lexicon?.plainEnglish).toBe(true);
    expect(restore(snapshot(person)).lexicon).toEqual(person.lexicon);
  }
  expect(() => replay(7, [], 420, 'stairwell@8')).toThrow(/Start fresh/);
  expect(replay(7, state.inputs, state.minute, state.version)).toEqual(state);
});

it('writes missed deliveries and every job as complete sentences without singular they', () => {
  const state = newGame(7);
  while (state.phase === 'day') step(state);
  const missed = state.said.filter((x) => x.text.startsWith('You did not ')).map((x) => x.text);
  expect(missed.length).toBeGreaterThan(5);
  expect(missed.join(' ')).not.toMatch(/this task for|today:|\b(they|their|them|themselves)\b/i);
  expect(missed.join(' ')).toContain('You did not deliver');
});

it('does not call an already collected bag uncollected', () => {
  const state = newGame(4);
  const bag = state.tasks.find((t) => t.label === 'pick up her pharmacy bag');
  if (!bag) throw new Error('Expected pharmacy errand in seed 4');
  while (state.minute < bag.from) step(state);
  act(state, { kind: 'go', to: 'shop' });
  while (state.k.walk) step(state);
  expect(bag.carried).toBe(true);
  while (state.phase === 'day') step(state);
  expect(state.said.some((x) => x.text.startsWith('You did not deliver Derya’s pharmacy bag today.'))).toBe(
    true,
  );
  expect(state.said.some((x) => x.text.startsWith('You did not pick up Derya'))).toBe(false);
});

it('states Thursday as the first day to ask for Sunday support', () => {
  const state = newGame(7);
  expect(wordHint(state, 'hacer')).toBe('Ask from Thursday at 07:00, face to face.');
  while (state.minute < 3 * 1440 + 420) {
    if (state.phase === 'day') step(state);
    else act(state, { kind: 'next' });
  }
  expect(wordHint(state, 'hacer')).toMatch(/^Hacer /);
});
