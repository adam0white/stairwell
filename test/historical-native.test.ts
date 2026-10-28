import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { canonicalPersona } from '@adam0white/lab-client';
import { replayLegacyNotebook, verifyLegacyRaw } from '@stairwell/native-replay-history';
import { expect, test } from 'vitest';

test('the finite 2.21 raw source is verified by its actual native reader without upgrading it', () => {
  const native = createRequire(new URL('../historical/stairwell/package.json', import.meta.url))(
    '@stairwell/hf-221',
  );
  const raw = native.snapshot(
    native.createPerson({
      id: 'hacer',
      name: 'Hacer',
      seed: 7,
      now: 420,
      bornAt: -30_000_000,
      sex: 'female',
    }),
  );
  expect(raw.engine).toBe('2.21.0');
  expect(verifyLegacyRaw(raw)).toEqual(raw);
});

test('frozen native source replays the independently pinned real month prefix and restores its raw actor exactly', () => {
  const result = replayLegacyNotebook({
    game: 'stairwell@11',
    seed: 7,
    inputs: [{ kind: 'cast-pause', who: 'derya', at: 420 }],
    minute: 930,
    oneCast: { rows: [] },
  });
  expect(result.source).toBe('329919ad6308a5cda3596e7bf30729a08f81d463');
  expect(createHash('sha256').update(canonicalPersona(result.world)).digest('hex')).toBe(
    '0a7dafcdd09ed4f1a15b373af8204683411a178513af2e994c413426b9f65d68',
  );
  const world = result.world as { people: { id: string }[] };
  const derya = world.people.find((p) => p.id === 'derya');
  expect(derya).toBeDefined();
  expect(verifyLegacyRaw(derya)).toEqual(derya);
  expect(() => verifyLegacyRaw({ ...derya, engine: '4.4.0' })).toThrow();
  expect(() =>
    replayLegacyNotebook({ game: 'stairwell@11', seed: 7, inputs: [], minute: 420, castChapter: {} }),
  ).toThrow(/admission recipe/);
});
