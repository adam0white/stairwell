import { describe, expect, it } from 'vitest';
import { playWeek } from '../scripts/policy.ts';
import { GAME_VERSION } from '../src/sim/game.ts';
import { isSaved } from '../src/ui/save.ts';

const notebook = (inputs: unknown = [], minute: unknown = 440) => ({
  game: GAME_VERSION,
  seed: 7,
  inputs,
  minute,
});

describe('saved notebook validation', () => {
  it('accepts each supported rules edition and rejects unknown editions', () => {
    expect(isSaved({ ...notebook(), game: 'stairwell@3' })).toBe(false);
    expect(isSaved({ ...notebook(), game: 'stairwell@4' })).toBe(false);
    expect(isSaved({ ...notebook(), game: 'stairwell@5' })).toBe(false);
    expect(isSaved({ ...notebook(), game: 'stairwell@9' })).toBe(true);
  });
  it('accepts exported weeks and notebooks without a saved minute', () => {
    for (const policy of ['quiet', 'honest', 'gossip', 'liar'] as const) {
      const state = playWeek(11, policy);
      const exported = { game: GAME_VERSION, seed: state.seed, inputs: state.inputs, minute: state.minute };
      expect(isSaved(JSON.parse(JSON.stringify(exported)))).toBe(true);
      expect(isSaved({ ...exported, minute: undefined })).toBe(true);
    }
    expect(isSaved({ ...notebook(), seed: 7.5 })).toBe(true);
  });

  it('accepts all supported input shapes, including equal timestamps', () => {
    expect(
      isSaved(
        notebook([
          { kind: 'go', to: 'door:hacer', at: 420 },
          { kind: 'go', to: 'landing:4', at: 420 },
          { kind: 'news', who: 'hacer', at: 421 },
          { kind: 'tell', who: 'sevim', prop: 'kapici:kind', value: false, sure: true, at: 421 },
          { kind: 'invent', who: 'burak', about: 'hacer', trait: 'kind', at: 422 },
          { kind: 'word', who: 'burak', at: 423 },
          { kind: 'sit', who: 'derya', at: 424 },
          { kind: 'misdeliver', who: 'tarik', task: 3, at: 425 },
          { kind: 'knock', who: 'hacer', at: 426 },
          { kind: 'prank', what: 'swap', at: 427 },
          { kind: 'prank', what: 'gate', at: 428 },
          { kind: 'next', at: 440 },
        ]),
      ),
    ).toBe(true);
  });

  it.each([
    null,
    [],
    {},
    { ...notebook(), game: 'stairwell@0' },
    { ...notebook(), seed: '7' },
    { ...notebook(), seed: Number.NaN },
    { ...notebook(), seed: Number.POSITIVE_INFINITY },
    notebook(null),
    notebook({}),
    notebook([], null),
    notebook([], '440'),
    notebook([], 419),
    notebook([], 440.5),
    notebook([], Number.POSITIVE_INFINITY),
  ])('rejects malformed notebook fields: %j', (value) => {
    expect(isSaved(value)).toBe(false);
  });

  it.each([
    null,
    [],
    {},
    { kind: 'bogus', at: 420 },
    { kind: 'go', at: 420 },
    { kind: 'go', to: 'door:unknown', at: 420 },
    { kind: 'go', to: 'landing:NaN', at: 420 },
    { kind: 'go', to: {}, at: 420 },
    { kind: 'news', at: 420 },
    { kind: 'news', who: 'unknown', at: 420 },
    { kind: 'tell', who: 'hacer', prop: 'kapici:kind', value: true, at: 420 },
    { kind: 'tell', who: 'hacer', prop: 4, value: true, sure: false, at: 420 },
    { kind: 'tell', who: 'hacer', prop: 'kapici:kind', value: 'false', sure: false, at: 420 },
    { kind: 'invent', who: 'hacer', about: 'unknown', trait: 'kind', at: 420 },
    { kind: 'invent', who: 'hacer', about: 'sevim', at: 420 },
    { kind: 'word', at: 420 },
    { kind: 'sit', at: 420 },
    { kind: 'knock', at: 420 },
    { kind: 'misdeliver', who: 'hacer', task: 1.5, at: 420 },
    { kind: 'misdeliver', who: 'hacer', task: Number.NaN, at: 420 },
    { kind: 'prank', what: 'unknown', at: 420 },
  ])('rejects malformed input fields: %j', (input) => {
    expect(isSaved(notebook([input]))).toBe(false);
  });

  it.each([undefined, null, '420', 419, 420.5, Number.NaN, Number.POSITIVE_INFINITY, 441])(
    'rejects invalid or future input timestamp %j',
    (at) => {
      expect(isSaved(notebook([{ kind: 'next', at }]))).toBe(false);
    },
  );

  it('rejects inputs whose timestamps go backwards', () => {
    expect(
      isSaved(
        notebook([
          { kind: 'next', at: 430 },
          { kind: 'next', at: 420 },
        ]),
      ),
    ).toBe(false);
  });
});
