import { expect, it } from 'vitest';
import { newGame, replay } from '../src/sim/game.ts';
import { displayText, residentRead } from '../src/ui/prose.ts';

it('projects prose without mutating the saved simulation or replay', () => {
  const state = newGame(7);
  const before = JSON.stringify(state);
  const opening = state.said.map((x) => displayText(x.text)).join(' ');
  expect(opening).toContain('Deliver the bread first.');
  expect(opening).toContain('Lale Apartmanı');
  expect(opening).toContain('Burak Bey');
  expect(opening).toContain('10:00 to 12:00');
  expect(JSON.stringify(state)).toBe(before);
  expect(replay(7, [], state.minute).said).toEqual(state.said);
});

it('keeps uncertainty and cultural words in alternate dialogue', () => {
  expect(displayText('Thanks, abi. Really. (₺5)')).toBe('Thanks, abi. I mean it. (₺5)');
  expect(displayText('Old news, evladım.')).toBe('That is old news, evladım.');
  expect(displayText('The same man at flat 5 again, late. He carried a bag this time.')).toBe(
    'The same man came to flat 5 late again. He carried a bag this time.',
  );
  expect(displayText('Hacer pressed a slice of börek on you.')).toBe('Hacer gave you a slice of börek.');
  expect(displayText('Burak is not sweet on Derya.')).toBe(
    'Burak does not have romantic feelings for Derya.',
  );
  expect(residentRead({ warmth: 'cool', word: 'not sure of you' })).toEqual({
    warmth: 'They seem distant.',
    word: 'They are not sure they can trust you.',
  });
});

it('explains alternate thanks, night margins and uncertain vote forecasts literally', () => {
  expect(displayText('Thank you. Exactly right, for once.')).toBe(
    'Thank you. You got it exactly right, for once.',
  );
  expect(displayText('Good. Now I can breathe.')).toBe('Good. I do not have to worry about that job now.');
  expect(
    displayText('Burak is careful, not crooked. The building forgets the difference when it is cold.'),
  ).toBe('Burak is careful, not dishonest. When the building is cold, people forget the difference.');
  expect(
    displayText(
      'Count the hands before you sleep. Hacer: likely. Sevim: maybe. Four hands raise the tea money.',
    ),
  ).toBe(
    'Think about the vote before you sleep. Hacer will probably vote for your raise. Sevim may vote for your raise. Four votes will raise the tea money.',
  );
});
