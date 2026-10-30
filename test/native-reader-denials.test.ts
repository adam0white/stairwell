import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
/** Actual Hacer/Sevim allocation, synthetic transport, unchanged released SDK gates. */
import {
  acceptPersonaBatch,
  canonicalPersona,
  createPersona,
  initialPersonaLife,
  type PersonaEnvelope,
  type PersonaRequest,
  type PersonaShelfState,
  portablePersonOwner,
  preparePersonaLife,
  validatePersona,
  validatePortablePerson,
} from '@adam0white/lab-client';
import { expect, test } from 'vitest';
import { buildingSpec, openingPerson } from '../src/sim/hf-authoring.ts';
import { currentDeparture } from '../src/sim/hf-cast.ts';
import { actBuilding, advanceBuildingMinute, buildingEngine } from '../src/sim/hf-game.ts';
import { replayBuilding } from '../src/sim/hf-replay.ts';
import { BuildingRun } from '../src/sim/hf-run.ts';
import type { BuildingWorld } from '../src/sim/hf-world.ts';
import { ALLOCATION } from '../src/sim/native-cast-life.ts';
import { createNativeContinuity, type NativeRecovery } from '../src/ui/native-cast-continuity.ts';
import { exportNativeFile, readNativeFileText } from '../src/ui/native-file.ts';
import { nativeNotebook, restoreNativeNotebook } from '../src/ui/native-notebook.ts';
import { createNativeOwnerDispatcher } from '../src/ui/native-owner-core.ts';

async function source(id: 'hacer' | 'sevim') {
  const projected = currentDeparture(BuildingRun.open(buildingSpec(31), [openingPerson(id)], {}), id, []);
  const portable = projected.transfer.portable;
  return createPersona({
    format: 'hf-persona/1',
    castId: portable.castId,
    castRevision: portable.castRevision,
    branchId: `synthetic-reader-${id}`,
    parentRevision: null,
    source: {
      game: 'stairwell',
      build: 'synthetic-opening-not-played',
      engine: portable.source.engine,
      rules: '14',
    },
    transfer: {
      ...projected.transfer,
      life: initialPersonaLife(portable.castId, `synthetic-reader-${id}`, 0),
    },
    limitations: [],
  });
}
async function fixture(parents: PersonaEnvelope[]) {
  let state: PersonaShelfState = {
    heads: Object.fromEntries(parents.map((p) => [p.castId, p.revision])),
    revisions: structuredClone(parents),
  };
  let current: BuildingWorld | undefined;
  const requests: PersonaRequest[] = [],
    records = new Map<string, NativeRecovery>();
  let conflict = false;
  const options = {
    current: () => current,
    save() {},
    recording() {},
    build: () => 'synthetic-reader-r2',
    shelf: {
      enabled: true,
      ready: Promise.resolve(true),
      setEnabled() {},
      async request<T>(q: PersonaRequest): Promise<T> {
        requests.push(structuredClone(q));
        if (q.action === 'prepareBatch')
          return {
            expectedHeads: Object.fromEntries((q.castIds ?? []).map((id) => [id, state.heads[id] ?? null])),
            inputs: (q.castIds ?? []).flatMap((id) => {
              const p = state.revisions.find((p) => p.revision === state.heads[id]);
              return p ? [preparePersonaLife(p, 0)] : [];
            }),
            blocked: [],
          } as T;
        if (q.action === 'putBatch') {
          if (conflict)
            state = { ...state, heads: { ...state.heads, [ALLOCATION[0]!.castId]: 'f'.repeat(64) } };
          state = acceptPersonaBatch(state, q.envelopes ?? [], q.expectedHeads);
          return q.envelopes as T;
        }
        if (q.action === 'get')
          return (state.revisions.find((p) => p.revision === state.heads[q.castId ?? '']) ?? null) as T;
        throw Error(`Unexpected shelf write ${q.action}`);
      },
    },
    recoveries: {
      async list() {
        return [...records.values()];
      },
      async put(r: NativeRecovery) {
        records.set(r.key, structuredClone(r));
      },
      async remove(key: string) {
        records.delete(key);
      },
    },
  };
  return {
    controller: createNativeContinuity(options),
    options,
    requests,
    records,
    state: () => state,
    current: (w: BuildingWorld) => {
      current = w;
    },
    conflict: () => {
      conflict = true;
    },
  };
}

test('allocated unsupported/v1 and occupied histories stay on the shelf with persistent individual denials', async () => {
  const hacer = await source('hacer'),
    sevim = await source('sevim');
  const { revision: _h, ...h } = hacer,
    { revision: _s, ...s } = sevim;
  const unsupported = await createPersona({
    ...h,
    transfer: {
      ...h.transfer,
      castPassport: 'hf-portable-person/999',
      portable: { ...(h.transfer.portable as object), version: 999 },
    },
  });
  const portable = structuredClone(h.transfer.portable) as Record<string, unknown>;
  delete portable.retained;
  portable.version = 1;
  validatePortablePerson(portable);
  const v1 = await createPersona({
    ...h,
    transfer: { ...h.transfer, castPassport: 'hf-portable-person/1', portable },
  });
  const occupied = await createPersona({
    ...s,
    transfer: { ...s.transfer, portableClaim: { game: 'commonstead' } },
  });
  expect(portablePersonOwner(occupied)).toBe('commonstead');
  const evidence: unknown[] = [];
  const sha = (value: unknown) => createHash('sha256').update(canonicalPersona(value)).digest('hex');
  for (const parents of [
    [unsupported, occupied],
    [v1, occupied],
  ]) {
    for (const parent of parents) await validatePersona(parent);
    const f = await fixture(parents),
      before = canonicalPersona(f.state());
    const world = await f.controller.arrive(7);
    f.current(world);
    const allocation = f.requests.find((q) => q.action === 'prepareBatch')?.castIds;
    expect(allocation).toEqual(ALLOCATION.map((p) => p.castId));
    for (const parent of parents) expect(allocation).toContain(parent.castId);
    const receipts = f.controller.castReceipts(world);
    expect(receipts.denials).toHaveLength(2);
    expect(receipts.denials?.map((d) => d.castId).sort()).toEqual(parents.map((p) => p.castId).sort());
    for (const denial of receipts.denials ?? [])
      expect(denial.reason).toContain(denial.castId === hacer.castId ? 'Hacer' : 'Sevim');
    expect(receipts.owned).toEqual({});
    expect(receipts.sources).toEqual({});
    expect(receipts.chapter?.inputs).toEqual([]);
    expect(
      buildingEngine(world)
        .checkpoint()
        .archive.initial.people.every((p) => !p.portable),
    ).toBe(true);
    expect(canonicalPersona(f.state())).toBe(before);
    expect(f.requests.find((q) => q.action === 'putBatch')?.expectedHeads).toEqual(f.state().heads);
    actBuilding(world, { kind: 'go', to: 'step' });
    advanceBuildingMinute(world);
    const notebook = nativeNotebook(world, receipts),
      checkpoint = buildingEngine(world).checkpoint();
    expect(buildingEngine(replayBuilding(checkpoint)).checkpoint()).toEqual(checkpoint);
    const cold = restoreNativeNotebook(JSON.parse(JSON.stringify(notebook)));
    const resumed = createNativeContinuity(f.options);
    resumed.restoreCastReceipts(cold.world, cold.castReceipts);
    await resumed.validateContinuity(cold.world);
    expect(resumed.castReceipts(cold.world).denials).toEqual(receipts.denials);
    const exported = JSON.stringify(exportNativeFile(world, {}, receipts));
    const imported = readNativeFileText(exported);
    expect(buildingEngine(imported.world).checkpoint()).toEqual(checkpoint);
    const worker = createNativeOwnerDispatcher();
    worker({ kind: 'notebook', input: notebook });
    const fileWorker = createNativeOwnerDispatcher();
    fileWorker({ kind: 'file', input: exported });
    const writesBefore = f.requests.length,
      recordsBefore = f.records.size;
    for (const id of ['hacer', 'sevim'] as const) {
      const reason = receipts.denials?.find(
        (d) => d.castId === (id === 'hacer' ? hacer.castId : sevim.castId),
      )?.reason;
      expect(() => worker({ kind: 'person', id })).toThrow(reason);
      expect(() => fileWorker({ kind: 'person', id })).toThrow(reason);
      await expect(f.controller.forkPerson(id)).rejects.toThrow(reason);
    }
    // A synthetic ending boundary tests the common publication guard before living/dead projection.
    world.phase = 'end';
    const publication = await f.controller.checkpointContinuity();
    expect(publication.ok).toBe(false);
    if (!publication.ok) expect(publication.failures.map((f) => f.name).sort()).toEqual(['Hacer', 'Sevim']);
    expect(f.requests.length).toBe(writesBefore);
    expect(f.records.size).toBe(recordsBefore);
    expect(canonicalPersona(f.state())).toBe(before);
    expect(exported).not.toContain(JSON.stringify(parents[0]));
    expect(exported).not.toContain(JSON.stringify(parents[1]));
    const malformed = structuredClone(receipts);
    delete malformed.denials;
    expect(() => createNativeContinuity(f.options).restoreCastReceipts(cold.world, malformed)).toThrow();
    const overlap = structuredClone(receipts);
    overlap.owned[parents[0]!.castId] = parents[0]!;
    expect(() => createNativeContinuity(f.options).restoreCastReceipts(cold.world, overlap)).toThrow(
      /refused/,
    );
    const conflict = await fixture(parents);
    conflict.conflict();
    await expect(conflict.controller.arrive(7)).rejects.toThrow(/changed|conflict|parent/i);
    expect(conflict.state().revisions).toEqual(parents);
    expect([...conflict.records.values()].every((r) => !r.accepted)).toBe(true);
    evidence.push({
      fixtures: parents.map((parent) => ({
        castId: parent.castId,
        revision: parent.revision,
        sha256: sha(parent),
      })),
      actualRequestedAllocation: allocation,
      denials: receipts.denials,
      completeShelfBefore: sha(JSON.parse(before)),
      completeShelfAfter: sha(f.state()),
      expectedHeads: f.requests.find((q) => q.action === 'putBatch')?.expectedHeads,
      requestedClaims: f.requests.find((q) => q.action === 'putBatch')?.envelopes,
      fullCheckpointSHA256: sha(checkpoint),
      fullHFHash: checkpoint.archive.hashes.full,
      exportedBytes: Buffer.byteLength(exported),
      completeExportSHA256: createHash('sha256').update(exported).digest('hex'),
      usefulInput: notebook.inputs,
      nativeColdRestore: true,
      fileReplay: true,
      outerReplay: true,
      persistedWorkerAndFileDenials: true,
      publicationAndForksDeniedBeforeTransport: true,
      originalsUnchanged: true,
      conflictDeniedWithoutPartialClaims: true,
    });
  }
  if (process.env.STAIRWELL_READER_PROOF)
    writeFileSync(
      process.env.STAIRWELL_READER_PROOF,
      JSON.stringify(
        {
          at: new Date().toISOString(),
          transport:
            'isolated synthetic identity transport with unchanged real published SDK, public HF and gates',
          evidence,
          browser: 'NOT RUN; root owns permission/lease',
          certification: false,
        },
        null,
        2,
      ),
    );
});

test('known absence is an explicit empty opening and resumes without inferred refusals', async () => {
  const f = await fixture([]),
    world = await f.controller.arrive(9);
  f.current(world);
  const receipts = f.controller.castReceipts(world);
  expect(receipts.denials).toEqual([]);
  expect(receipts.chapter?.expectedHeads).toEqual(
    Object.fromEntries(ALLOCATION.map((p) => [p.castId, null])),
  );
  const cold = restoreNativeNotebook(nativeNotebook(world, receipts));
  const resumed = createNativeContinuity(f.options);
  resumed.restoreCastReceipts(cold.world, cold.castReceipts);
  await resumed.validateContinuity(cold.world);
  expect(resumed.castReceipts(cold.world)).toEqual(receipts);
  expect(f.requests.filter((q) => q.action === 'putBatch')).toHaveLength(1);
  expect(f.requests.find((q) => q.action === 'putBatch')?.expectedHeads).toEqual(
    receipts.chapter?.expectedHeads,
  );
  const parent = await source('hacer');
  const { revision: _revision, ...body } = parent;
  const unsupported = await createPersona({
    ...body,
    transfer: {
      ...body.transfer,
      castPassport: 'hf-portable-person/999',
      portable: { ...(body.transfer.portable as object), version: 999 },
    },
  });
  const mixed = await fixture([unsupported]),
    mixedWorld = await mixed.controller.arrive(10);
  const mixedReceipts = mixed.controller.castReceipts(mixedWorld);
  expect(mixedReceipts.denials?.map((d) => d.castId)).toEqual([parent.castId]);
  expect(mixed.requests.find((q) => q.action === 'putBatch')?.expectedHeads).toEqual(
    Object.fromEntries(
      ALLOCATION.map((p) => [p.castId, p.castId === parent.castId ? unsupported.revision : null]),
    ),
  );
});

test('prepare transport and parent-integrity failures remain fatal before admission or recovery', async () => {
  const parent = await source('hacer');
  const corrupt = structuredClone(parent);
  corrupt.source.build = 'checksum-tampered';
  const invalid = await fixture([corrupt]);
  await expect(invalid.controller.arrive(7)).rejects.toThrow(/checksum|revision|digest/i);
  expect(invalid.requests.some((q) => q.action === 'putBatch')).toBe(false);
  expect(invalid.records.size).toBe(0);
  const transport = await fixture([]);
  transport.options.shelf.request = async () => {
    throw Error('Exact synthetic transport failure');
  };
  await expect(transport.controller.arrive(7)).rejects.toThrow('Exact synthetic transport failure');
  expect(transport.records.size).toBe(0);
});
