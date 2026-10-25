/** Mechanism fixtures use explicitly authored source snapshots, never browser-journey evidence. */

import {
  acceptPersonaBatch,
  createPersona,
  initialPersonaLife,
  type LifePreparation,
  type PersonaEnvelope,
  type PersonaRequest,
  preparePersonaLife,
} from '@adam0white/lab-client';
import { beforeEach, expect, it, vi } from 'vitest';
import { sourceTransfer } from '../src/sim/cast-life.ts';
import { act, faceToFace, GAME_VERSION, type GameState, personOf, replay, step } from '../src/sim/game.ts';
import { makeResident } from '../src/sim/people.ts';

const mocks = vi.hoisted(() => ({
  allowed: false,
  puts: [] as unknown[],
  batch: [] as unknown[],
  handler: undefined as ((q: unknown) => Promise<unknown>) | undefined,
}));
vi.mock('@adam0white/lab-client', async (original) => ({
  ...(await original<object>()),
  personaChannel: () => ({
    ready: Promise.resolve(true),
    enabled: true,
    setEnabled: () => {},
    request: (q: unknown) => mocks.handler!(q),
  }),
  watchPersonaCheckpoint: () => () => {},
}));
vi.mock('../src/ui/lab.ts', () => ({
  lab: {
    build: () => ({ c: 'test' }),
    setPersonaRecording: () => {
      mocks.allowed = false;
    },
    allowPersonaRecording: (yes: boolean) => {
      mocks.allowed = yes;
    },
  },
}));

import {
  acceptedCastRecoveries,
  arrive,
  castReceipts,
  checkpointContinuity,
  chooseContinuityRecording,
  gateContinuity,
  installContinuity,
  invalidateContinuity,
  restoreCastReceipts,
  validateContinuity,
} from '../src/ui/cast-continuity.ts';

let parents: PersonaEnvelope[];
let prepared: LifePreparation[];
let state = { heads: {} as Record<string, string>, revisions: [] as PersonaEnvelope[] };
let current: GameState | undefined;
async function parent(id: 'hacer' | 'burak', fitness: number) {
  const p = makeResident(id, 31, 600);
  p.body.fitness = fitness;
  const { transfer } = await sourceTransfer(p, []);
  const castId = id === 'hacer' ? 'hf.cast.hacer.voice' : 'hf.cast.burak.stairwell';
  return createPersona({
    format: 'hf-persona/1',
    castId,
    castRevision: '1',
    branchId: `source-${id}`,
    parentRevision: null,
    source: { game: 'stairwell', build: 'test', engine: '2.21.0', rules: '8' },
    transfer: { ...transfer, life: initialPersonaLife(castId, `source-${id}`, 0) },
    limitations: [],
  });
}
beforeEach(async () => {
  parents = await Promise.all([parent('hacer', 0.43), parent('burak', 0.57)]);
  prepared = parents.map((p) => preparePersonaLife(p, 12 * 60 * 60 * 1000));
  state = { heads: Object.fromEntries(parents.map((p) => [p.castId, p.revision])), revisions: parents };
  current = undefined;
  mocks.allowed = false;
  mocks.puts = [];
  mocks.batch = [];
  mocks.handler = async (raw) => {
    const q = raw as PersonaRequest;
    if (q.action === 'prepareBatch')
      return {
        expectedHeads: Object.fromEntries(q.castIds!.map((id) => [id, state.heads[id] ?? null])),
        inputs: prepared,
        blocked: [],
      };
    if (q.action === 'putBatch') {
      mocks.batch.push(q);
      state = acceptPersonaBatch(state, q.envelopes!, q.expectedHeads);
      return {};
    }
    if (q.action === 'put') {
      mocks.puts.push(q);
      state = acceptPersonaBatch(state, [q.envelope!]);
      return {};
    }
    if (q.action === 'recordingBatch')
      return {
        sameEpoch: q.allowRecording ?? false,
        revisions: (q.envelopes ?? []).map((p) => p.revision),
        recordingEpoch: 'opaque-test-epoch',
      };
    throw new Error(`Unexpected latest-head read: ${q.action}`);
  };
  installContinuity(
    () => current,
    () => {},
  );
  invalidateContinuity();
});
it('claims both known people together and replays their full actual admitted state without shelf reads', async () => {
  current = await arrive(7);
  expect(mocks.batch).toHaveLength(1);
  expect(current.castChapter?.inputs).toHaveLength(2);
  expect(personOf(current, 'hacer').body.fitness).toBe(0.43);
  for (const actor of [...current.people, current.kapici]) expect(actor.lexicon?.plainEnglish).toBe(true);
  expect(personOf(current, 'burak').body.fitness).toBe(0.57);
  expect(
    replay(current.seed, current.inputs, current.minute, GAME_VERSION, undefined, current.castChapter),
  ).toEqual(current);
  // Loading pinned admitted state must not reset an explicit saved narration choice.
  const chapter = current.castChapter;
  if (!chapter) throw new Error('Expected an admitted cast chapter');
  const pinned = structuredClone(chapter);
  const hacer = pinned.initial.hacer;
  if (!hacer) throw new Error('Expected pinned Hacer');
  hacer.lexicon = { plainEnglish: false };
  const loaded = replay(current.seed, current.inputs, current.minute, GAME_VERSION, undefined, pinned);
  expect(personOf(loaded, 'hacer').lexicon?.plainEnglish).toBe(false);
  await validateContinuity(loaded);
  await gateContinuity(current);
  expect(mocks.allowed).toBe(true);
  await chooseContinuityRecording(true);
  expect(mocks.allowed).toBe(true);
});
it('refuses the entire startup before CAS when one source has an unsupported semantic dialect', async () => {
  const { revision: _, ...body } = parents[1]!;
  const bad = await createPersona({ ...body, source: { ...body.source, game: 'unknown' } });
  prepared[1] = preparePersonaLife(bad, 12 * 60 * 60 * 1000);
  await expect(arrive(7)).rejects.toThrow(/source role or character format is unsupported/);
  expect(mocks.batch).toHaveLength(0);
});
it('restores only local accepted heads, refuses stale CAS and keeps imported receipt histories gated', async () => {
  current = await arrive(7);
  act(current, { kind: 'cast-pause', who: 'hacer' });
  while (current.castPauses?.hacer !== 'paused' && current.minute < 1200) step(current);
  expect(current.castPauses?.hacer).toBe('paused');
  await checkpointContinuity();
  const receipt = castReceipts(current);
  const last = receipt.owned['hf.cast.hacer.voice']!;
  expect(last.parentRevision).toBe(
    current.castChapter!.claims.find((p) => p.castId === last.castId)!.revision,
  );
  const restored = replay(
    current.seed,
    current.inputs,
    current.minute,
    GAME_VERSION,
    undefined,
    current.castChapter,
  );
  restoreCastReceipts(restored, receipt);
  await validateContinuity(restored);
  current = restored;
  await checkpointContinuity();
  expect((mocks.puts.at(-1) as PersonaRequest).envelope?.revision).toBe(last.revision);
  expect(castReceipts(current).owned['hf.cast.burak.stairwell']).toBeDefined();
  const imported = replay(
    current.seed,
    current.inputs,
    current.minute,
    GAME_VERSION,
    undefined,
    current.castChapter,
  );
  restoreCastReceipts(imported, receipt, true);
  await validateContinuity(imported);
  current = imported;
  await gateContinuity(imported, true);
  expect(castReceipts(imported).fileOrigin).toBe(true);
  expect(Object.keys(castReceipts(imported).owned)).toHaveLength(0);
  await expect(chooseContinuityRecording(true)).resolves.toBeUndefined();
  expect(mocks.allowed).toBe(true);
  // Competing current head closes the owned branch; an old living checkpoint must not revive it.
  current = restored;
  const { closePersonaBranch } = await import('@adam0white/lab-client');
  const terminal = await closePersonaBranch(
    last,
    { game: 'stairwell', build: 'test', engine: '2.21.0', rules: '8' },
    personOf(restored, 'hacer').now,
  );
  state = acceptPersonaBatch(state, [terminal]);
  await checkpointContinuity();
  expect(state.heads[last.castId]).toBe(terminal.revision);
  expect(castReceipts(restored).owned[last.castId]?.revision).toBe(last.revision);
});

it('keeps paused residents outside actual conversation actions', async () => {
  current = await arrive(7);
  act(current, { kind: 'cast-pause', who: 'hacer' });
  while (current.castPauses?.hacer !== 'paused' && current.minute < 1200) step(current);
  current.k.at = 'door:hacer';
  current.k.walk = null;
  expect(faceToFace(current)).not.toContain('hacer');
  const before = current.residents.find((r) => r.id === 'hacer')!.sits;
  act(current, { kind: 'sit', who: 'hacer' });
  expect(current.residents.find((r) => r.id === 'hacer')!.sits).toBe(before);
});
it('retains a late accepted source receipt and raw capture without changing a replacement generation', async () => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
  });
  try {
    current = await arrive(7);
    act(current, { kind: 'cast-pause', who: 'hacer' });
    while (current.castPauses?.hacer !== 'paused' && current.minute < 1200) step(current);
    const prior = castReceipts(current).owned['hf.cast.hacer.voice']!.revision;
    const handler = mocks.handler!;
    mocks.handler = async (q) => {
      const result = await handler(q);
      if ((q as PersonaRequest).action === 'put') invalidateContinuity();
      return result;
    };
    await checkpointContinuity();
    expect(castReceipts(current).owned['hf.cast.hacer.voice']!.revision).toBe(prior);
    const recovery = acceptedCastRecoveries().find(
      (r) =>
        (r.notebook as { castReceipts: { owned: Record<string, PersonaEnvelope> } }).castReceipts.owned[
          'hf.cast.hacer.voice'
        ]?.revision === state.heads['hf.cast.hacer.voice'],
    );
    expect(recovery).toBeDefined();
    expect(
      (recovery!.notebook as { castReceipts: { sources: { hacer: unknown } } }).castReceipts.sources.hacer,
    ).toBeDefined();
  } finally {
    vi.unstubAllGlobals();
  }
});

it('keeps the paused source Person unchanged across later days and observed building events', async () => {
  current = await arrive(7);
  act(current, { kind: 'cast-pause', who: 'hacer' });
  while (current.castPauses?.hacer !== 'paused' && current.minute < 1200) step(current);
  const paused = JSON.stringify(personOf(current, 'hacer'));
  for (let guard = 0; guard < 6000 && current.minute < 6 * 1440; guard++) {
    if (current.phase === 'night') act(current, { kind: 'next' });
    else step(current);
  }
  current.k.at = 'door:hacer';
  current.k.walk = null;
  expect(faceToFace(current)).not.toContain('hacer');
  expect(JSON.stringify(personOf(current, 'hacer'))).toBe(paused);
});

it('keeps the current receipts after an accepted startup reply becomes uncertain', async () => {
  current = await arrive(7);
  const previous = JSON.stringify(current);
  const receipts = castReceipts(current);
  const handler = mocks.handler!;
  mocks.handler = async (q) => {
    const result = await handler(q);
    if ((q as PersonaRequest).action === 'putBatch') throw new Error('Reply lost after acceptance');
    return result;
  };
  const attempted = arrive(8);
  await expect(attempted).rejects.toThrow('Reply lost after acceptance');
  await expect(attempted).rejects.toMatchObject({ submitted: true, accepted: false });
  expect(mocks.batch).toHaveLength(2);
  expect(JSON.stringify(current)).toBe(previous);
  expect(castReceipts(current)).toEqual(receipts);
});
