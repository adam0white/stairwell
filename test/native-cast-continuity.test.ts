/** Public SDK reducers simulate transport mechanics; these are not live ACKs. */
import {
  acceptPersona,
  acceptPersonaBatch,
  createPersona,
  initialPersonaLife,
  type PersonaEnvelope,
  type PersonaRequest,
  type PersonaShelfState,
  preparePersonaLife,
} from '@adam0white/lab-client';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { PORTABLE_READERS } from '../node_modules/@adam0white/lab-client/dist/portable-readers.js';

// Exercise the historical ownership controls with a simulated future registry.
// The last five tests use the actual released empty registry instead.
beforeEach((context) => {
  const registry = PORTABLE_READERS as Record<string, { client: string; perPersonSkips: boolean }>;
  for (const key of Object.keys(registry)) delete registry[key];
  if (!/uncertified|empty shelf|worker refuses/.test(context.task.name))
    for (const key of ['voice', 'days', 'well', 'warren', 'valley', 'stairwell', 'commonstead'])
      registry[key] = { client: '0.5.5', perPersonSkips: true };
});
afterEach(() => {
  for (const key of Object.keys(PORTABLE_READERS)) delete (PORTABLE_READERS as Record<string, unknown>)[key];
});

import type { Rid } from '../src/sim/building-cast.ts';
import { buildingSpec, openingPerson } from '../src/sim/hf-authoring.ts';
import { currentDeparture } from '../src/sim/hf-cast.ts';
import { advanceBuildingMinute, buildingEngine, restoreBuilding } from '../src/sim/hf-game.ts';
import { replayBuilding } from '../src/sim/hf-replay.ts';
import { BuildingRun } from '../src/sim/hf-run.ts';
import type { BuildingWorld } from '../src/sim/hf-world.ts';
import { ALLOCATION } from '../src/sim/native-cast-life.ts';
import {
  AdmissionFailure,
  createNativeContinuity,
  type NativeRecovery,
} from '../src/ui/native-cast-continuity.ts';
import { type NativeNotebook, nativeNotebook, restoreNativeNotebook } from '../src/ui/native-notebook.ts';
import { createNativeOwnerDispatcher } from '../src/ui/native-owner-core.ts';

async function sourcePerson(id: Rid) {
  const departure = currentDeparture(BuildingRun.open(buildingSpec(31), [openingPerson(id)], {}), id, []);
  const portable = departure.transfer.portable;
  return createPersona({
    format: 'hf-persona/1',
    castId: portable.castId,
    castRevision: portable.castRevision,
    branchId: 'mechanism-source',
    parentRevision: null,
    source: { game: 'stairwell', build: 'mechanism-control', engine: portable.source.engine, rules: '14' },
    transfer: { ...departure.transfer, life: initialPersonaLife(portable.castId, 'mechanism-source', 0) },
    limitations: [],
  });
}
async function fixture(file = false) {
  const parent = await sourcePerson('hacer');
  let state: PersonaShelfState = { heads: { [parent.castId]: parent.revision }, revisions: [parent] };
  let current: BuildingWorld | undefined;
  const requests: PersonaRequest[] = [],
    records = new Map<string, NativeRecovery>();
  let counter = 0;
  let beforeWrite: (() => Promise<void>) | undefined;
  let loseReply = false,
    failStorage = false;
  const shelf = {
    enabled: true,
    ready: Promise.resolve(true),
    setEnabled() {},
    async request<T>(request: PersonaRequest): Promise<T> {
      requests.push(structuredClone(request));
      let reply: unknown;
      if (request.action === 'prepareBatch')
        reply = {
          expectedHeads: Object.fromEntries(
            (request.castIds ?? []).map((castId) => [castId, state.heads[castId] ?? null]),
          ),
          inputs: (request.castIds ?? []).flatMap((castId) => {
            const head = state.revisions.find((p) => p.revision === state.heads[castId]);
            return head ? [preparePersonaLife(head, 12 * 3600000)] : [];
          }),
          blocked: [],
        };
      else if (request.action === 'get')
        reply =
          state.revisions.find(
            (p) =>
              p.castId === request.castId &&
              p.revision === (request.revision ?? state.heads[request.castId ?? '']),
          ) ?? null;
      else if (request.action === 'putBatch') {
        await beforeWrite?.();
        state = acceptPersonaBatch(state, request.envelopes ?? [], request.expectedHeads);
        if (loseReply) throw Error('Simulated lost reply after commit');
        reply = request.envelopes;
      } else if (request.action === 'put') {
        await beforeWrite?.();
        if (!request.envelope) throw Error('Missing envelope');
        state = acceptPersona(state, request.envelope, request.fork);
        if (loseReply) throw Error('Simulated lost reply after commit');
        reply = request.envelope;
      } else throw Error(`Unexpected transport request ${request.action}`);
      return reply as T;
    },
  };
  const deps = {
    restoreNotebook: undefined as ((notebook: NativeNotebook) => Promise<BuildingWorld>) | undefined,
    current: () => current,
    save() {},
    build: () => 'mechanism-control',
    recording() {},
    shelf,
    file,
    now: () => 12 * 3600000,
    uuid: () => `mechanism-${++counter}`,
    recoveries: {
      async list() {
        return structuredClone([...records.values()]);
      },
      async put(record: NativeRecovery) {
        if (failStorage) throw Error('Storage failed');
        if (!records.has(record.key) && records.size >= 8) throw Error('Eight recovery chapters are saved.');
        records.set(record.key, structuredClone(record));
      },
      async remove(key: string) {
        records.delete(key);
      },
    },
  };
  return {
    controller: createNativeContinuity(deps),
    deps,
    requests,
    records,
    parent,
    setCurrent: (value: BuildingWorld) => {
      current = value;
    },
    setBeforeWrite: (callback: () => Promise<void>) => {
      beforeWrite = callback;
    },
    loseReply: () => {
      loseReply = true;
    },
    failStorage: () => {
      failStorage = true;
    },
    replace: (head: PersonaEnvelope) => {
      state = { heads: { [head.castId]: head.revision }, revisions: [...state.revisions, head] };
    },
    add: (head: PersonaEnvelope) => {
      state = {
        heads: { ...state.heads, [head.castId]: head.revision },
        revisions: [...state.revisions, head],
      };
    },
    currentHead: (castId: string) => state.revisions.find((p) => p.revision === state.heads[castId]),
    head: () => state.revisions.find((p) => p.revision === state.heads[parent.castId]),
    clear: () => {
      state = { heads: {}, revisions: [] };
    },
  };
}

test('only an exact acknowledged batch installs ownership; full local recovery and file provenance stay distinct', async () => {
  const f = await fixture();
  const world = await f.controller.arrive(7);
  f.setCurrent(world);
  const receipts = f.controller.castReceipts(world);
  expect(receipts.owned[f.parent.castId]?.revision).toBe(f.head()?.revision);
  expect(f.requests.filter((q) => q.action === 'putBatch')).toHaveLength(1);
  expect(await f.controller.acceptedCastRecoveries()).toHaveLength(1);
  expect(buildingEngine(replayBuilding(buildingEngine(world).checkpoint())).checkpoint()).toEqual(
    buildingEngine(world).checkpoint(),
  );
  const notebook = nativeNotebook(world, receipts);
  const local = restoreNativeNotebook(JSON.parse(JSON.stringify(notebook)));
  const resumed = createNativeContinuity(f.deps);
  resumed.restoreCastReceipts(local.world, local.castReceipts);
  expect(resumed.castReceipts(local.world).owned).toEqual({});
  await resumed.validateContinuity(local.world);
  expect(resumed.castReceipts(local.world).owned).toEqual(receipts.owned);
  const imported = restoreNativeNotebook(JSON.parse(JSON.stringify(notebook)));
  const count = f.requests.length;
  const file = createNativeContinuity({ ...f.deps, file: true });
  file.restoreCastReceipts(imported.world, imported.castReceipts, true);
  await file.validateContinuity(imported.world);
  expect(file.castReceipts(imported.world).owned).toEqual({});
  expect(file.castReceipts(imported.world).chapter).toEqual(receipts.chapter);
  await expect(file.arrive(7)).rejects.toThrow(/Saved-file/);
  await expect(file.forkPerson('hacer')).rejects.toThrow(/Saved-file/);
  expect(f.requests).toHaveLength(count);
});

test('a lost reply remains unconfirmed until exact current heads are reconciled, without another write', async () => {
  const f = await fixture();
  f.loseReply();
  let failure: unknown;
  try {
    await f.controller.arrive(7);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(AdmissionFailure);
  const state = failure as AdmissionFailure;
  expect(state.submitted).toBe(true);
  expect(state.accepted).toBe(false);
  expect(await f.controller.acceptedCastRecoveries()).toEqual([]);
  if (!state.recoveryKey) throw Error('Missing staged recovery');
  expect(await f.controller.reconcileRecovery(state.recoveryKey)).toBe(true);
  const resumed = await f.controller.resumeRecovery(state.recoveryKey);
  expect(f.controller.castReceipts(resumed).owned[f.parent.castId]?.revision).toBe(f.head()?.revision);
  expect(f.requests.filter((q) => q.action === 'putBatch')).toHaveLength(1);
});

test('both recovery routes await the injected complete reader and retain exact ownership checks', async () => {
  const f = await fixture();
  f.loseReply();
  await expect(f.controller.arrive(7)).rejects.toBeInstanceOf(AdmissionFailure);
  const record = [...f.records.values()][0];
  if (!record) throw Error('Missing recovery');
  const seen: NativeNotebook[] = [];
  f.deps.restoreNotebook = async (notebook) => {
    await Promise.resolve();
    expect(f.controller.recoveryPending()).toBe(true);
    seen.push(structuredClone(notebook));
    return replayBuilding(notebook.engine);
  };
  expect(await f.controller.reconcileRecovery(record.key)).toBe(true);
  const world = await f.controller.resumeRecovery(record.key);
  expect(f.controller.recoveryPending()).toBe(false);
  expect(seen).toHaveLength(2);
  expect(seen[0]).toEqual(record.notebook);
  expect(buildingEngine(world).checkpoint()).toEqual(record.notebook.engine);
  expect(f.controller.castReceipts(world).owned).toEqual(
    (record.notebook.castReceipts as ReturnType<typeof f.controller.castReceipts>).owned,
  );
  expect(f.requests.filter((request) => request.action === 'putBatch')).toHaveLength(1);
});

test('reader cancellation keeps recovery unconfirmed and leaves the current world unchanged', async () => {
  const f = await fixture();
  f.loseReply();
  await expect(f.controller.arrive(7)).rejects.toBeInstanceOf(AdmissionFailure);
  const record = [...f.records.values()][0];
  if (!record) throw Error('Missing recovery');
  f.deps.restoreNotebook = async () => {
    throw new DOMException('Cancelled', 'AbortError');
  };
  await expect(f.controller.reconcileRecovery(record.key)).rejects.toMatchObject({ name: 'AbortError' });
  expect(f.records.get(record.key)?.accepted).toBe(false);
  expect(f.requests.filter((request) => request.action === 'putBatch')).toHaveLength(1);
});

test('a stale awaited recovery cannot acquire ownership or promote acceptance', async () => {
  const f = await fixture();
  f.loseReply();
  await expect(f.controller.arrive(7)).rejects.toBeInstanceOf(AdmissionFailure);
  const record = [...f.records.values()][0];
  if (!record) throw Error('Missing recovery');
  f.deps.restoreNotebook = async (notebook) => {
    await Promise.resolve();
    f.controller.invalidateContinuity();
    return replayBuilding(notebook.engine);
  };
  await expect(f.controller.reconcileRecovery(record.key)).rejects.toThrow(/changed|cancel/i);
  expect(f.records.get(record.key)?.accepted).toBe(false);
});

test('an injected reader must return the entire exact recovery checkpoint', async () => {
  const f = await fixture();
  const opening = await f.controller.arrive(7);
  const record = [...f.records.values()][0];
  if (!record) throw Error('Missing recovery');
  f.setCurrent(opening);
  f.deps.restoreNotebook = async (notebook) => {
    const world = replayBuilding(notebook.engine);
    advanceBuildingMinute(world);
    return world;
  };
  await expect(f.controller.resumeRecovery(record.key)).rejects.toThrow(/checkpoint|notebook|match/i);
  expect(buildingEngine(opening).checkpoint()).toEqual(record.notebook.engine);
});

test('pre-submission storage failure writes no shelf state; stale generation after ACK retains recovery only', async () => {
  const failed = await fixture();
  failed.failStorage();
  await expect(failed.controller.arrive(7)).rejects.toMatchObject({ submitted: false, accepted: false });
  expect(failed.requests.some((q) => q.action === 'putBatch')).toBe(false);
  expect(failed.head()?.revision).toBe(failed.parent.revision);
  const late = await fixture();
  late.setBeforeWrite(async () => {
    late.controller.invalidateContinuity();
  });
  await expect(late.controller.arrive(7)).rejects.toMatchObject({ submitted: true, accepted: true });
  expect(await late.controller.acceptedCastRecoveries()).toHaveLength(1);
});

test('raced source heads refuse without a replacement or silent retry', async () => {
  const f = await fixture();
  const { revision: _revision, ...body } = f.parent;
  const alternate = await createPersona({ ...body, branchId: 'explicit-alternative' });
  f.setBeforeWrite(async () => {
    f.replace(alternate);
  });
  await expect(f.controller.arrive(7)).rejects.toMatchObject({ submitted: true, accepted: false });
  expect(f.head()?.revision).toBe(alternate.revision);
  expect(f.requests.filter((q) => q.action === 'putBatch')).toHaveLength(1);
  expect(await f.controller.acceptedCastRecoveries()).toEqual([]);
});

test('changed source clocks and an unrelated receiving claim cannot establish local ownership', async () => {
  const f = await fixture();
  const world = await f.controller.arrive(7);
  const notebook = nativeNotebook(world, f.controller.castReceipts(world));
  for (const change of ['clock', 'claim'] as const) {
    const saved = structuredClone(notebook.castReceipts) as ReturnType<typeof f.controller.castReceipts>;
    if (!saved.chapter?.inputs[0] || !saved.chapter.claims[0]) throw Error('Missing retained source recipe');
    if (change === 'clock') saved.chapter.inputs[0].clockMs += 3600000;
    else saved.chapter.claims[0] = f.parent;
    const loaded = restoreNativeNotebook(JSON.parse(JSON.stringify(notebook))).world;
    const controller = createNativeContinuity(f.deps);
    controller.restoreCastReceipts(loaded, saved);
    const count = f.requests.length;
    await expect(controller.validateContinuity(loaded)).rejects.toThrow();
    expect(controller.castReceipts(loaded).owned).toEqual({});
    expect(f.requests).toHaveLength(count);
  }
});

test('an empty forged recovery parent map cannot be promoted to accepted', async () => {
  const f = await fixture();
  f.loseReply();
  await expect(f.controller.arrive(7)).rejects.toBeInstanceOf(AdmissionFailure);
  const staged = [...f.records.values()][0];
  if (!staged) throw Error('Missing staged recovery');
  staged.expectedHeads = {};
  f.records.set(staged.key, staged);
  await expect(f.controller.reconcileRecovery(staged.key)).rejects.toThrow();
  expect(f.records.get(staged.key)?.accepted).toBe(false);
});

test('an authored ending boundary publishes eligible idle people once and recovery binds complete source digests', async () => {
  const f = await fixture();
  const world = await f.controller.arrive(7);
  f.setCurrent(world);
  // Host-boundary premise only. Full played endings are the game owner's control.
  world.phase = 'end';
  expect(await f.controller.checkpointContinuity()).toEqual({ ok: true });
  const published = f.requests.filter((request) => request.action === 'put');
  expect(published.map((request) => request.envelope?.castId)).toEqual([
    'hf.cast.hacer.voice',
    'hf.cast.sevim.stairwell',
  ]);
  expect(await f.controller.checkpointContinuity()).toEqual({ ok: true });
  expect(f.requests.filter((request) => request.action === 'put')).toHaveLength(2);
  const notebook = nativeNotebook(world, f.controller.castReceipts(world));
  const restored = {
    world: restoreBuilding(JSON.parse(JSON.stringify(notebook.engine))),
    castReceipts: notebook.castReceipts,
  };
  const controller = createNativeContinuity(f.deps);
  controller.restoreCastReceipts(restored.world, restored.castReceipts);
  await controller.validateContinuity(restored.world);
  // Same-engine accepted save from before authority metadata: retain it, refuse honestly.
  const olderReceipts = structuredClone(notebook.castReceipts) as ReturnType<typeof controller.castReceipts>;
  delete olderReceipts.authority;
  delete olderReceipts.denials;
  const older = restoreBuilding(JSON.parse(JSON.stringify(notebook.engine)));
  const olderController = createNativeContinuity(f.deps);
  olderController.restoreCastReceipts(older, olderReceipts);
  await expect(olderController.validateContinuity(older)).rejects.toThrow(
    'This saved game began before an update and cannot continue. Download it if you want to keep it, then start a new game.',
  );
  const head = f.head();
  if (!head) throw Error('Missing actual accepted source');
  const { revision: _revision, ...body } = head;
  const wrongProof = await createPersona({
    ...body,
    transfer: {
      ...head.transfer,
      checkpoint: { ...(head.transfer.checkpoint as object), sha256: '0'.repeat(64) },
    },
  });
  f.replace(wrongProof);
  const receipts = structuredClone(notebook.castReceipts) as ReturnType<typeof controller.castReceipts>;
  receipts.owned[wrongProof.castId] = wrongProof;
  const bad = restoreBuilding(JSON.parse(JSON.stringify(notebook.engine)));
  controller.restoreCastReceipts(bad, receipts);
  await expect(controller.validateContinuity(bad)).rejects.toThrow(/source digest/);
});

test('generation changes after an accepted departure stop the batch and report that acceptance', async () => {
  const f = await fixture();
  const world = await f.controller.arrive(7);
  f.setCurrent(world);
  world.phase = 'end'; // Mechanism premise, not a played ending.
  f.deps.save = () => f.controller.invalidateContinuity();
  const result = await f.controller.checkpointContinuity();
  expect(result.ok).toBe(false);
  if (result.ok) throw Error('Expected interrupted publication result');
  expect(result.cancelled).toBe(true);
  expect(result.accepted).toHaveLength(1);
  expect(f.requests.filter((q) => q.action === 'put')).toHaveLength(1);
});

test('repeated unconfirmed departure attempts preserve one recovery and never resubmit', async () => {
  const f = await fixture();
  const world = await f.controller.arrive(7);
  f.setCurrent(world);
  world.phase = 'end'; // Mechanism premise, not a played ending.
  f.loseReply();
  for (let i = 0; i < 10; i++) expect((await f.controller.checkpointContinuity()).ok).toBe(false);
  expect(f.requests.filter((q) => q.action === 'put')).toHaveLength(2);
  expect(f.records.size).toBe(3);
});

test('a full recovery store refuses the next shelf write and keeps the accepted earlier save', async () => {
  const f = await fixture();
  const world = await f.controller.arrive(7);
  f.setCurrent(world);
  const seed = [...f.records.values()][0];
  if (!seed) throw Error('Missing recovery');
  for (let i = 0; i < 6; i++) f.records.set(`older:${i}`, { ...structuredClone(seed), key: `older:${i}` });
  world.phase = 'end'; // Mechanism premise, not a played ending.
  const result = await f.controller.checkpointContinuity();
  expect(result.ok).toBe(false);
  if (result.ok) throw Error('Expected capacity refusal');
  expect(result.accepted).toHaveLength(1);
  expect(result.failures[0]?.error).toMatch(/Eight recovery/);
  expect(f.records.size).toBe(8);
  expect(f.requests.filter((q) => q.action === 'put')).toHaveLength(1);
});

test('unrelated account-bound shelf histories do not block the explicitly eligible receiving cast', async () => {
  const f = await fixture();
  const burak = await sourcePerson('burak');
  f.add(burak);
  const world = await f.controller.arrive(7);
  f.setCurrent(world);
  expect(f.controller.castReceipts(world).chapter?.inputs.map((input) => input.parent.castId)).toEqual([
    f.parent.castId,
  ]);
  const request = f.requests.find((q) => q.action === 'prepareBatch');
  expect(request?.castIds).toEqual(ALLOCATION.map((person) => person.castId));
  expect(request?.castIds).toHaveLength(2);
  const write = f.requests.find((q) => q.action === 'putBatch');
  expect(Object.keys(write?.expectedHeads ?? {}).sort()).toEqual(
    ALLOCATION.map((person) => person.castId).sort(),
  );
  expect(f.currentHead(burak.castId)).toEqual(burak);
});

test('uncertified shared heads keep their source while an unowned local role begins', async () => {
  const f = await fixture();
  const before = structuredClone(f.head());
  const world = await f.controller.arrive(7);
  const receipts = f.controller.castReceipts(world);
  expect(receipts.denials?.map((denial) => denial.castId)).toEqual([f.parent.castId]);
  expect(receipts.owned).toEqual({});
  expect(receipts.sources).toEqual({});
  expect(f.head()).toEqual(before);
  expect(f.requests.find((request) => request.action === 'putBatch')?.expectedHeads?.[f.parent.castId]).toBe(
    before?.revision,
  );
  expect(f.requests.find((request) => request.action === 'putBatch')?.envelopes).toEqual([]);
});

test('uncertified shared people refuse an explicit fork before writing recovery or shelf', async () => {
  const f = await fixture();
  const world = await f.controller.arrive(7, true);
  f.setCurrent(world);
  world.phase = 'end';
  const before = structuredClone(f.head());
  await expect(f.controller.forkPerson('hacer')).rejects.toThrow(/read-only/i);
  expect(f.head()).toEqual(before);
  expect(f.requests).toEqual([]);
  expect(f.records.size).toBe(0);
});

test('an empty shelf can start a native chapter while peers are uncertified', async () => {
  const f = await fixture();
  f.clear();
  const world = await f.controller.arrive(7);
  expect(world).toBeDefined();
  expect(f.requests.filter((request) => request.action === 'putBatch')).toHaveLength(1);
});

test('the worker refuses a shared projection for an uncertified person', () => {
  const dispatch = createNativeOwnerDispatcher({ project: () => ({}) as never });
  dispatch({ kind: 'open', args: [7] });
  expect(() => dispatch({ kind: 'person', id: 'hacer' })).toThrow(/read-only/i);
});

test('automatic publication refuses uncertified people without recovery or shelf writes', async () => {
  const f = await fixture();
  const world = await f.controller.arrive(7, true);
  f.setCurrent(world);
  world.phase = 'end';
  const before = structuredClone(f.head());
  const result = await f.controller.checkpointContinuity();
  expect(result.ok).toBe(false);
  expect(f.head()).toEqual(before);
  expect(f.requests).toEqual([]);
  expect(f.records.size).toBe(0);
});
