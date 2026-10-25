import { createPerson, projectPersona } from '@adam0white/human-framework';
import { acceptPersona, createPersona } from '@adam0white/lab-client';
import { beforeEach, expect, it, vi } from 'vitest';
import { act, type GameState, newGame, personOf, step } from '../src/sim/game.ts';

const events = vi.hoisted(() => {
  const target = new EventTarget();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: target });
  return target;
});
const fake = vi.hoisted(() => ({
  enabled: true,
  ready: Promise.resolve(true),
  request: vi.fn(),
  setEnabled: vi.fn(),
}));
const recording = vi.hoisted(() => ({
  setPersonaRecording: vi.fn(),
  allowPersonaRecording: vi.fn(),
  build: () => ({ c: 'test' }),
  milestone: vi.fn(),
  personaRecordingAllowed: false,
  telemetryOn: true,
}));
vi.mock('@adam0white/lab-client', async (original) => ({
  ...(await original<object>()),
  personaChannel: () => fake,
  watchPersonaCheckpoint: () => () => {},
}));
vi.mock('../src/ui/lab.ts', () => ({ lab: recording }));
vi.mock('@adam0white/lab-kit', () => ({ personaControls: () => ({}) }));

import {
  checkpointContinuity,
  chooseContinuityRecording,
  gateContinuity,
  installContinuity,
  invalidateContinuity,
} from '../src/ui/continuity.ts';
import { reduceLocalPersona } from '../src/ui/local-persona.ts';

function reply(req: { envelope?: { branchId: string; revision: string } }, sameEpoch: boolean) {
  return {
    sameEpoch,
    branchId: req.envelope?.branchId,
    revision: req.envelope?.revision,
    recordingEpoch: 'epoch',
  };
}
async function pinned(scope: 'shared' | 'file' = 'shared'): Promise<GameState> {
  const person = createPerson({
    id: 'derya',
    name: 'Derya',
    seed: 1,
    now: 420,
    bornAt: -44 * 365 * 1440,
    sex: 'female',
  });
  const projection = projectPersona(person, { version: 'test/1', skills: {} });
  const head = await createPersona({
    format: 'hf-persona/1',
    castId: 'hf.cast.derya.stairwell',
    castRevision: '2',
    branchId: 'branch',
    parentRevision: null,
    source: { game: 'stairwell', build: 'test', engine: person.engine, rules: '7' },
    transfer: { person: projection },
    limitations: projection.limitations,
  });
  const game = newGame(2);
  game.oneCast = { rows: [], head, scope };
  return game;
}
beforeEach(() => {
  invalidateContinuity();
  vi.clearAllMocks();
  recording.personaRecordingAllowed = false;
  fake.ready = Promise.resolve(true);
  fake.request.mockImplementation(async (req) => reply(req, true));
});

it('rejects retained non-head file retries and preserves current-head idempotency', async () => {
  const game = await pinned();
  const first = game.oneCast!.head!;
  const { revision, ...body } = first;
  const second = await createPersona({
    ...body,
    parentRevision: revision,
    transfer: { ...body.transfer, claimId: 'second' },
  });
  const state = acceptPersona(acceptPersona({ revisions: [], heads: {} }, first), second);
  expect(() => reduceLocalPersona(state, first)).toThrow(/conflict/i);
  expect(reduceLocalPersona(state, second).heads[first.castId]).toBe(second.revision);
});

it('keeps accepted source prefix immutable when a later checkpoint conflicts', async () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, v: string) => values.set(k, v),
    },
  });
  const game = newGame(7);
  while (game.minute < 480) step(game);
  act(game, { kind: 'one-cast-depart' });
  installContinuity(
    () => game,
    () => {},
  );
  await gateContinuity(game);
  fake.request.mockImplementation(async (req) => (req.action === 'put' ? req.envelope : reply(req, true)));
  await checkpointContinuity();
  const original = game.oneCast?.head;
  expect(original).toBeDefined();
  const key = `stairwell-one-cast-prefix:${original?.branchId}:${original?.revision}`;
  const saved = values.get(key);
  expect(saved).toBeTruthy();
  // A narrow conflict control changes only the proposed checkpoint, never the stored accepted prefix.
  personOf(game, 'derya').body.fitness -= 0.001;
  fake.request.mockImplementation(async (req) => {
    if (req.action === 'put') throw new Error('Persona conflict');
    return reply(req, true);
  });
  await checkpointContinuity();
  expect(values.get(key)).toBe(saved);
  expect(values.get(`stairwell-one-cast-active:${original?.branchId}`)).toBe(original?.revision);
  expect(game.oneCast?.head?.revision).toBe(original?.revision);
});
async function returnArrivalFixture() {
  const { createDeryaCheckpoint, checkpointPerson } = await import('../src/sim/one-cast.ts');
  const prefix = newGame(7);
  while (prefix.minute < 480) step(prefix);
  act(prefix, { kind: 'one-cast-depart' });
  const source = await createDeryaCheckpoint(prefix, {
    build: 'test',
    branchId: 'arrival-control',
    parentRevision: null,
  });
  prefix.oneCast!.head = source;
  prefix.oneCast!.scope = 'shared';
  prefix.oneCast!.lastCheckpoint = structuredClone(personOf(prefix, 'derya'));
  const p = personOf(prefix, 'derya');
  const projection = projectPersona(p, { version: 'hearsay-stairwell/1', skills: {} });
  const envelope = await createPersona({
    format: 'hf-persona/1',
    castId: source.castId,
    castRevision: '2',
    branchId: source.branchId,
    parentRevision: source.revision,
    source: { game: 'hearsay', build: 'test', engine: p.engine, rules: '4' },
    transfer: {
      person: projection,
      history: [],
      checkpoint: await checkpointPerson(p),
      admission: {
        adapter: 'hearsay-one-cast/1',
        mapping: 'hearsay-stairwell/1',
        openingMinute: p.now,
        sourceRevision: source.revision,
        sourceCheckpointDigest: (source.transfer.checkpoint as { checkpointDigest: string }).checkpointDigest,
      },
    },
    limitations: [],
  });
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, v: string) => values.set(k, v),
      removeItem: (k: string) => values.delete(k),
    },
  });
  values.set(`stairwell-one-cast-prefix:${source.branchId}:${source.revision}`, JSON.stringify(prefix));
  return { prefix, envelope, values };
}
it('cancels a replaced arrival before it consumes any admission claim', async () => {
  const { arrive } = await import('../src/ui/continuity.ts');
  const { envelope } = await returnArrivalFixture();
  let finish!: (v: unknown) => void;
  let sent!: () => void;
  const started = new Promise<void>((r) => {
    sent = r;
  });
  fake.request.mockImplementation((req) => {
    if (req.action === 'get') {
      sent();
      return new Promise((r) => {
        finish = r;
      });
    }
    return Promise.resolve(req.envelope);
  });
  const arrival = arrive(9);
  await started;
  invalidateContinuity();
  finish(envelope);
  await expect(arrival).rejects.toThrow(/cancelled/);
  expect(fake.request.mock.calls.some(([req]) => req.action === 'put')).toBe(false);
});
it('retains a late accepted arrival with full pins for explicit recovery without gating replacement', async () => {
  const { arrive } = await import('../src/ui/continuity.ts');
  const { envelope, values } = await returnArrivalFixture();
  let finish!: (v: unknown) => void;
  let sent!: () => void;
  const started = new Promise<void>((r) => {
    sent = r;
  });
  let accepted: typeof envelope | undefined;
  fake.request.mockImplementation((req) => {
    if (req.action === 'get') return Promise.resolve(envelope);
    if (req.action === 'put') {
      accepted = req.envelope;
      sent();
      return new Promise((r) => {
        finish = r;
      });
    }
    return Promise.resolve(reply(req, true));
  });
  const arrival = arrive(9);
  await started;
  invalidateContinuity();
  recording.setPersonaRecording.mockClear();
  finish(accepted);
  await expect(arrival).rejects.toThrow(/saved for recovery/);
  const raw = values.get(`stairwell-one-cast-recovery:${accepted?.revision}`);
  expect(raw).toBeTruthy();
  const recovery = JSON.parse(raw!);
  expect(recovery.game.oneCast.head.revision).toBe(accepted?.revision);
  expect(recovery.game.oneCast.admission.envelope.revision).toBe(envelope.revision);
  expect(recording.setPersonaRecording).not.toHaveBeenCalled();
});
it('verifies an unchanged checkpoint through strict CAS and rejects an inactive retained head', async () => {
  const { prefix } = await returnArrivalFixture();
  installContinuity(
    () => prefix,
    () => {},
  );
  await gateContinuity(prefix);
  fake.request.mockImplementation(async (req) => {
    if (req.action === 'put') throw new Error('Persona conflict: retained non-head');
    return reply(req, true);
  });
  await checkpointContinuity();
  expect(fake.request).toHaveBeenCalledWith({ action: 'put', envelope: prefix.oneCast?.head });
  expect(recording.milestone).toHaveBeenLastCalledWith('one cast bridgefail');
});
it('saves an explicit source fork with its own replay-valid checkpoint and prefix', async () => {
  const { continuityPanel, validateContinuity } = await import('../src/ui/continuity.ts');
  const { prefix } = await returnArrivalFixture();
  const prior = prefix.oneCast!.head!;
  installContinuity(
    () => prefix,
    () => {},
  );
  await gateContinuity(prefix);
  fake.request.mockImplementation(async (req) => {
    if (req.action === 'put') throw new Error('Persona conflict');
    return reply(req, true);
  });
  await checkpointContinuity();
  type ElementControl = {
    textContent: string;
    children: ElementControl[];
    append: (...nodes: ElementControl[]) => void;
    onclick?: () => void;
  };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => ({
        textContent: '',
        children: [],
        append(this: { children: ElementControl[] }, ...nodes: ElementControl[]) {
          this.children.push(...nodes);
        },
      }),
    },
  });
  const panel = continuityPanel() as unknown as ElementControl;
  const button = panel.children.find(
    (e) => e.textContent === 'Create a separate copy of this continued game',
  );
  expect(button).toBeDefined();
  let saved = false;
  installContinuity(
    () => prefix,
    () => {
      saved = true;
    },
  );
  fake.request.mockImplementation(async (req) => (req.action === 'put' ? req.envelope : reply(req, true)));
  button!.onclick!();
  await vi.waitFor(() => expect(saved).toBe(true), { timeout: 1000, interval: 5 });
  expect(prefix.oneCast?.head?.branchId).not.toBe(prior.branchId);
  expect(prefix.oneCast?.lastCheckpoint).toEqual(personOf(prefix, 'derya'));
  expect(prefix.oneCast?.sourcePrefix?.inputs).toEqual(prefix.inputs);
  await expect(validateContinuity(prefix)).resolves.toBeUndefined();
});
it('retains every accepted normal arrival until successful begin explicitly acknowledges its exact head', async () => {
  const { arrive, acknowledgeContinuity } = await import('../src/ui/continuity.ts');
  const { envelope, values } = await returnArrivalFixture();
  fake.request.mockImplementation(async (req) =>
    req.action === 'get' ? envelope : req.action === 'put' ? req.envelope : reply(req, true),
  );
  const game = await arrive(9);
  const revision = game.oneCast!.head!.revision;
  const raw = values.get(`stairwell-one-cast-recovery:${revision}`);
  expect(raw).toBeTruthy();
  expect(JSON.parse(raw!).accepted).toBe(true);
  expect(JSON.parse(values.get('stairwell-one-cast-recoveries')!)).toContain(revision);
  acknowledgeContinuity(newGame(4));
  expect(values.has(`stairwell-one-cast-recovery:${revision}`)).toBe(true);
  acknowledgeContinuity(game);
  expect(values.has(`stairwell-one-cast-recovery:${revision}`)).toBe(false);
  expect(JSON.parse(values.get('stairwell-one-cast-recoveries')!)).not.toContain(revision);
});

it('gates a played notebook file before its first portable head exists', async () => {
  const game = newGame(7);
  Object.assign(game.oneCast!, { originScope: 'file', recordingFileKey: 'file-history' });
  await gateContinuity(game, true);
  expect(recording.setPersonaRecording).toHaveBeenLastCalledWith(null);
  expect(recording.allowPersonaRecording).toHaveBeenLastCalledWith(true);
  expect(fake.request).not.toHaveBeenCalled();
});

it('automatic linkage does not call the shelf permission service', async () => {
  await gateContinuity(await pinned(), true);
  fake.request.mockRejectedValue(new Error('permission service unavailable'));
  await chooseContinuityRecording(true);
  expect(recording.allowPersonaRecording).toHaveBeenLastCalledWith(true);
  expect(fake.request).not.toHaveBeenCalled();
});

it('does not cancel a pending arrival for a compatibility recording choice', async () => {
  const { arrive } = await import('../src/ui/continuity.ts');
  const { envelope } = await returnArrivalFixture();
  let finish!: (v: unknown) => void;
  let sent!: () => void;
  const started = new Promise<void>((r) => {
    sent = r;
  });
  fake.request.mockImplementation((req) => {
    if (req.action === 'get') {
      sent();
      return new Promise((r) => {
        finish = r;
      });
    }
    return Promise.resolve(req.envelope);
  });
  const arrival = arrive(9);
  await started;
  await chooseContinuityRecording(false);
  finish(envelope);
  await expect(arrival).resolves.toBeDefined();
  expect(fake.request.mock.calls.some(([req]) => req.action === 'put')).toBe(true);
});
