import { createPersona, initialPersonaLife, preparePersonaLife } from '@adam0white/lab-client';
import { expect, it } from 'vitest';
import { admitCast } from '../src/sim/cast-life.ts';
import { makeResident } from '../src/sim/people.ts';

it('refuses a biography-only head rather than resetting it to a fresh Person', async () => {
  const parent = await createPersona({
    format: 'hf-persona/1',
    castId: 'hf.cast.hacer.voice',
    castRevision: '1',
    branchId: 'cast-control',
    parentRevision: null,
    source: { game: 'voice', build: 'test', engine: '2.17.0', rules: 'voice-4' },
    transfer: {
      castPassport: 'authored-cast/1',
      life: initialPersonaLife('hf.cast.hacer.voice', 'cast-control', 0),
    },
    limitations: [],
  });
  const input = preparePersonaLife(parent, 12 * 60 * 60 * 1000);
  const opening = makeResident('hacer', 7, 380);
  expect(() => admitCast(input, opening)).toThrow(/actual|Biography|passport/);
  const corrupted = structuredClone(input);
  corrupted.life.assignment = 999;
  expect(() => admitCast(corrupted, opening)).toThrow();
});

import { canonicalPersona } from '@adam0white/lab-client';
import { sourceTransfer } from '../src/sim/cast-life.ts';

it('carries actual acquired fitness, temperament and RNG through a declared native passport, not a fresh profile', async () => {
  const actual = makeResident('hacer', 19, 600);
  actual.body.fitness = 0.43;
  actual.traits.openness = 0.72;
  const captured = await sourceTransfer(actual, []);
  const parent = await createPersona({
    format: 'hf-persona/1',
    castId: 'hf.cast.hacer.voice',
    castRevision: '1',
    branchId: 'actual-control',
    parentRevision: null,
    source: { game: 'stairwell', build: 'test', engine: '2.17.0', rules: '7' },
    transfer: { ...captured.transfer, life: initialPersonaLife('hf.cast.hacer.voice', 'actual-control', 0) },
    limitations: captured.transfer.person.person.limitations,
  });
  const input = preparePersonaLife(parent, 12 * 60 * 60 * 1000);
  const admitted = admitCast(input, makeResident('hacer', 7, 380));
  expect(admitted.body.fitness).toBe(0.43);
  expect(admitted.traits.openness).toBe(0.72);
  expect(canonicalPersona(admitted.rng)).toBe(canonicalPersona(actual.rng));
  const wrong = structuredClone(input);
  wrong.parent.transfer.sourceRole = 'derya';
  expect(() => admitCast(wrong, makeResident('hacer', 7, 380))).toThrow(/source role/);
});

it('refuses a native passport whose host edition has a different meaning', async () => {
  const actual = makeResident('hacer', 19, 600);
  const { transfer } = await sourceTransfer(actual, []);
  const parent = await createPersona({
    format: 'hf-persona/1',
    castId: 'hf.cast.hacer.voice',
    castRevision: '1',
    branchId: 'old-native-control',
    parentRevision: null,
    source: { game: 'stairwell', build: 'test', engine: '2.17.0', rules: '6' },
    transfer: { ...transfer, life: initialPersonaLife('hf.cast.hacer.voice', 'old-native-control', 0) },
    limitations: [],
  });
  expect(() => admitCast(preparePersonaLife(parent, 100000), makeResident('hacer', 7, 380))).toThrow(
    /source role|edition/,
  );
});

it('does not erase source-world financial obligations in a new opening', async () => {
  const p = makeResident('burak', 19, 600);
  const { transfer } = await sourceTransfer(p, ['Building ledger has no implemented handover.']);
  const parent = await createPersona({
    format: 'hf-persona/1',
    castId: 'hf.cast.burak.stairwell',
    castRevision: '1',
    branchId: 'account-control',
    parentRevision: null,
    source: { game: 'stairwell', build: 'test', engine: '2.17.0', rules: '7' },
    transfer: { ...transfer, life: initialPersonaLife('hf.cast.burak.stairwell', 'account-control', 0) },
    limitations: [],
  });
  expect(() => admitCast(preparePersonaLife(parent, 100000), makeResident('burak', 7, 380))).toThrow(
    /account or dues/,
  );
});
