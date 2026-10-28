import { createPersona, initialPersonaLife } from '@adam0white/lab-client';
import { replayLegacyNotebook } from '@stairwell/native-replay-history';
import { expect, test } from 'vitest';
import { sourceTransfer } from '../src/sim/cast-life.ts';
import { verifyLegacySource } from '../src/sim/legacy-source.ts';

test('source digest and an independently replayed native prefix verify omitted memories without a reset', async () => {
  const notebook = {
    game: 'stairwell@11',
    seed: 7,
    inputs: [{ kind: 'cast-pause', who: 'derya', at: 420 }],
    minute: 930,
    oneCast: { rows: [] },
  };
  const world = replayLegacyNotebook(notebook).world as { people: { id: string }[] };
  const raw = world.people.find((person) => person.id === 'derya');
  if (!raw) throw Error('Missing native source fixture');
  const captured = await sourceTransfer(raw as Parameters<typeof sourceTransfer>[0], []);
  const parent = await createPersona({
    format: 'hf-persona/1',
    castId: 'hf.cast.derya.stairwell',
    castRevision: '2',
    branchId: 'raw-source-control',
    parentRevision: null,
    source: { game: 'stairwell', build: '329919a', engine: '2.23.0', rules: '11' },
    transfer: {
      ...captured.transfer,
      life: initialPersonaLife('hf.cast.derya.stairwell', 'raw-source-control', 0),
    },
    limitations: captured.transfer.person.person.limitations,
  });
  const result = await verifyLegacySource(parent, raw, notebook);
  expect(result.raw).toEqual(raw);
  expect(result.notebook).toBe('verified-unowned-native-prefix');
  expect((await verifyLegacySource(parent, raw)).notebook).toBe('not-supplied');
  await expect(verifyLegacySource(parent, undefined)).rejects.toThrow();
  await expect(verifyLegacySource(parent, { ...raw, engine: '2.21.0' })).rejects.toThrow();
  const wrongDigest = structuredClone(parent);
  (wrongDigest.transfer.checkpoint as { sha256: string }).sha256 = '0'.repeat(64);
  await expect(verifyLegacySource(wrongDigest, raw)).rejects.toThrow(/matching source archive/);
  await expect(verifyLegacySource(parent, raw, { ...notebook, seed: 8 })).rejects.toThrow();
  const unsupported = structuredClone(parent);
  unsupported.source.rules = '12';
  await expect(verifyLegacySource(unsupported, raw)).rejects.toThrow();
});
