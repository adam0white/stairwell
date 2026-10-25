import { describe, expect, it } from 'vitest';
import { act, newGame, personOf, replay, step } from '../src/sim/game.ts';
import { createDeryaCheckpoint } from '../src/sim/one-cast.ts';

describe('Derya first morning boundary', () => {
  it('requires played night-work completion and explicit departure, then replays it exactly', async () => {
    const s = newGame(7);
    await expect(
      createDeryaCheckpoint(s, { build: 'test', branchId: 'derya-test', parentRevision: null }),
    ).rejects.toThrow(/finish her shift and leave/);
    act(s, { kind: 'one-cast-depart' });
    expect(s.oneCast?.departure).toBeUndefined();
    while (s.minute < 480) step(s);
    expect(s.oneCast?.departure?.at).toBe(480);
    expect(personOf(s, 'derya').activity).toBeNull();
    const envelope = await createDeryaCheckpoint(s, {
      build: 'test',
      branchId: 'derya-test',
      parentRevision: null,
    });
    expect(envelope.transfer.history).toEqual([
      expect.objectContaining({ kind: 'night-work', disclosed: true }),
    ]);
    expect(replay(s.seed, s.inputs, s.minute, s.version)).toEqual(s);
  });
});

import { projectPersona, snapshot } from '@adam0white/human-framework';
import { createPersona } from '@adam0white/lab-client';
import {
  applyDeryaReturn,
  checkpointPerson,
  prepareDeryaReturn,
  validateDeryaContinuity,
} from '../src/sim/one-cast.ts';

async function boundary() {
  const s = newGame(7);
  while (s.minute < 480) step(s);
  act(s, { kind: 'one-cast-depart' });
  if (!s.oneCast) throw new Error('missing source');
  s.oneCast.head = await createDeryaCheckpoint(s, {
    build: 'test',
    branchId: 'derya-control',
    parentRevision: null,
  });
  return s;
}
/** Adapter negative/control fixture, not a played Hearsay receipt. */
async function returnControl(
  s: ReturnType<typeof newGame>,
  mutate?: (p: ReturnType<typeof snapshot>) => void,
) {
  const p = snapshot(personOf(s, 'derya'));
  if (mutate) mutate(p);
  // Synthetic legacy-dialect control, not an actual HF3→Hearsay journey.
  p.engine = '2.21.0';
  const person = projectPersona(p, { version: 'hearsay-stairwell/1', skills: {} });
  const source = s.oneCast?.head;
  if (!source) throw new Error('missing source head');
  return createPersona({
    format: 'hf-persona/1',
    castId: source.castId,
    castRevision: '2',
    branchId: source.branchId,
    parentRevision: source.revision,
    source: { game: 'hearsay', build: 'test', engine: p.engine, rules: '4' },
    transfer: {
      person,
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
}
describe('Derya pinned return controls', () => {
  it('replays from local departure prefix with approved fitness drift and rejects clinical changes', async () => {
    const s = await boundary();
    const e = await returnControl(s, (p) => {
      p.body.fitness -= 0.001;
    });
    const a = await prepareDeryaReturn(e, s, { build: 'test' });
    const returned = applyDeryaReturn(s, a);
    expect(personOf(returned, 'derya').body.fitness).toBe(personOf(s, 'derya').body.fitness - 0.001);
    await validateDeryaContinuity(returned);
    step(returned);
    expect(replay(s.seed, returned.inputs, returned.minute, s.version, a)).toEqual({
      ...returned,
      oneCast: { ...returned.oneCast, head: e },
    });
    const bad = await returnControl(s, (p) => {
      p.body.health = 0.9;
    });
    await expect(prepareDeryaReturn(bad, s, { build: 'test' })).rejects.toThrow(/health or sleep pattern/);
  });
  it('refuses missing local prefix and mismatched source receipt', async () => {
    const s = await boundary();
    const e = await returnControl(s);
    await expect(prepareDeryaReturn(e, newGame(7), { build: 'test' })).rejects.toThrow(/saved departure/);
    const { revision, ...body } = e;
    const bad = await createPersona({
      ...body,
      transfer: {
        ...body.transfer,
        admission: { ...(body.transfer.admission as object), sourceRevision: '0'.repeat(64) },
      },
    });
    await expect(prepareDeryaReturn(bad, s, { build: 'test' })).rejects.toThrow(/saved departure/);
  });
  it('never drops an active source goal to allow projection', async () => {
    const s = await boundary();
    personOf(s, 'derya').agenda.goals.push({
      id: 'unresolved',
      label: 'make-friend',
      status: 'active',
      progress: 0,
      createdAt: 480,
      weight: 1,
    } as never);
    await expect(
      createDeryaCheckpoint(s, { build: 'test', branchId: 'blocked', parentRevision: null }),
    ).rejects.toThrow(/active goal/);
  });
});

it('keeps the source receipt pinned while ordinary week inputs continue', async () => {
  const s = await boundary();
  if (!s.oneCast) throw new Error('missing continuity');
  s.oneCast.lastCheckpoint = snapshot(personOf(s, 'derya'));
  s.oneCast.sourcePrefix = {
    seed: s.seed,
    inputs: structuredClone(s.inputs),
    minute: s.minute,
    edition: s.version,
  };
  while (s.minute < 600) step(s);
  act(s, { kind: 'go', to: 'bakery' });
  await validateDeryaContinuity(s);
});

it('rejects malformed received measurement rows without changing the loaded run', async () => {
  const s = await boundary();
  if (!s.oneCast) throw new Error('missing continuity');
  s.oneCast.rows.push({
    v: 1,
    probe: 'derya',
    arm: 'continuing',
    scope: 'shared',
    castId: 'other-person',
    branchId: 'branch',
    revision: 'x',
    parentRevision: null,
    stage: 'checkpoint',
    outcome: 'accepted',
  });
  await expect(validateDeryaContinuity(s)).rejects.toThrow(/journey record/);
});

it('admits the unchanged source-bound return contract from Hearsay rules 4 or 5 only', async () => {
  const s = await boundary();
  const original = await returnControl(s);
  const { revision: _revision, ...body } = original;
  const expected = await prepareDeryaReturn(original, s, { build: 'test' });
  for (const rules of ['4', '5']) {
    const envelope = await createPersona({ ...body, source: { ...body.source, rules } });
    const admitted = await prepareDeryaReturn(envelope, s, { build: 'test' });
    expect(admitted.prefix.sourceHead.revision).toBe(s.oneCast?.head?.revision);
    expect(admitted.person).toEqual(expected.person);
  }
  const future = await createPersona({ ...body, source: { ...body.source, rules: '8' } });
  await expect(prepareDeryaReturn(future, s, { build: 'test' })).rejects.toThrow(
    /unsupported game or version/,
  );
});
