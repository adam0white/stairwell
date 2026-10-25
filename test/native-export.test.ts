/** Real host export from ordinary inputs. The transport is local; no shelf or recording post leaves this test. */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { snapshot } from '@adam0white/human-framework';
import {
  acceptPersona,
  canonicalPersona,
  type PersonaEnvelope,
  validatePersona,
} from '@adam0white/lab-client';
import { expect, it, vi } from 'vitest';
import { act, newGame, personOf, replay, step } from '../src/sim/game.ts';

const transport = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@adam0white/lab-client', async (original) => ({
  ...(await original<object>()),
  personaChannel: () => ({ enabled: true, ready: Promise.resolve(true), request: transport.request }),
  watchPersonaCheckpoint: () => () => {},
}));
vi.mock('../src/ui/lab.ts', () => ({
  lab: {
    build: () => ({ c: 'native-source-fixture' }),
    setPersonaRecording: () => {},
    allowPersonaRecording: () => {},
  },
}));

import { castReceipts, checkpointContinuity, installContinuity } from '../src/ui/cast-continuity.ts';

it('exports Hacer at an actual legal pause with edition9, exact replay, original RNG and no building debt', async () => {
  const state = newGame(7);
  act(state, { kind: 'cast-pause', who: 'hacer' });
  while (state.phase === 'day' && state.castPauses?.hacer !== 'paused') step(state);
  expect(state.castPauses?.hacer).toBe('paused');
  expect(personOf(state, 'hacer').activity).toBeNull();
  const reconstructed = replay(state.seed, state.inputs, state.minute, state.version);
  expect(reconstructed).toEqual(state);
  let shelf = { heads: {} as Record<string, string>, revisions: [] as PersonaEnvelope[] };
  transport.request.mockImplementation(async (request) => {
    if (request.action !== 'put') throw new Error(`Unexpected transport action: ${request.action}`);
    expect(request.authored).toBe(true);
    shelf = acceptPersona(shelf, request.envelope);
    return {};
  });
  installContinuity(
    () => state,
    () => {},
  );
  await checkpointContinuity();
  const receipts = castReceipts(state);
  const envelope = receipts.owned['hf.cast.hacer.voice'];
  expect(envelope).toBeDefined();
  if (!envelope) throw new Error('The real host exporter did not produce an accepted Hacer checkpoint.');
  await validatePersona(envelope);
  expect(envelope.source).toEqual({
    game: 'stairwell',
    rules: '9',
    engine: '2.23.0',
    build: 'native-source-fixture',
  });
  expect(envelope.transfer.hostObligations).toEqual([]);
  const raw = snapshot(personOf(reconstructed, 'hacer'));
  expect(receipts.sources.hacer).toEqual(raw);
  expect(envelope.transfer.checkpoint).toMatchObject({
    sourceMinute: raw.now,
    rng: raw.rng,
    sha256: createHash('sha256').update(canonicalPersona(raw)).digest('hex'),
  });
  expect(shelf.heads[envelope.castId]).toBe(envelope.revision);
  const directory = process.env.STAIRWELL_FIXTURE_DIR;
  if (directory) {
    mkdirSync(directory, { recursive: true });
    for (const [name, value] of Object.entries({
      'native-hacer-passport': envelope,
      'native-hacer-raw': raw,
      'native-notebook': {
        game: state.version,
        seed: state.seed,
        inputs: state.inputs,
        minute: state.minute,
      },
      'native-state': state,
    }))
      writeFileSync(join(directory, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`);
  }
});
