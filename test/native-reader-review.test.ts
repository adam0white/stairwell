/** R3 review controls: real owner dispatcher, installed SDK and unchanged peer catalog. */
import { acceptPersonaBatch, type PersonaRequest } from '@adam0white/lab-client';
import { expect, test } from 'vitest';
import { openBuilding } from '../src/sim/hf-game.ts';
import type { BuildingWorld } from '../src/sim/hf-world.ts';
import { ALLOCATION, NATIVE_CAST_AUTHORITY, type NativeCastChapter } from '../src/sim/native-cast-life.ts';
import {
  createNativeContinuity,
  type NativeGameAccess,
  type NativeRecovery,
} from '../src/ui/native-cast-continuity.ts';
import { exportNativeFile } from '../src/ui/native-file.ts';
import { nativeNotebook } from '../src/ui/native-notebook.ts';
import { createNativeOwnerDispatcher, type OwnerView } from '../src/ui/native-owner-core.ts';

const chapter: NativeCastChapter = {
  version: 'stairwell-cast/3',
  denials: [],
  inputs: [],
  arrivals: [],
  claims: [],
  expectedHeads: Object.fromEntries(ALLOCATION.map((p) => [p.castId, null])),
};

test('validating a restored native/file chapter never reconstructs missing receipt authority', async () => {
  const world = openBuilding(7);
  const legacy = { owned: {}, sources: {}, authored: true, fileOrigin: false, chapter };
  const valid = { ...legacy, authority: NATIVE_CAST_AUTHORITY, denials: [] };
  const allocated = ALLOCATION[0];
  if (!allocated) throw Error('The actual Stairwell allocation is missing.');
  const denial = {
    castId: allocated.castId,
    revision: 'a'.repeat(64),
    reason: 'Hacer: synthetic refused history stays on the shelf.',
  };
  const denied = {
    ...valid,
    denials: [denial],
    chapter: {
      ...chapter,
      denials: [denial],
      expectedHeads: { ...chapter.expectedHeads, [denial.castId]: denial.revision },
    },
  };
  for (const receipts of [legacy, valid, denied]) {
    for (const input of [
      { kind: 'notebook' as const, input: nativeNotebook(world, receipts) },
      { kind: 'file' as const, input: JSON.stringify(exportNativeFile(world, {}, receipts)) },
    ]) {
      const worker = createNativeOwnerDispatcher();
      await worker(input);
      const refusal =
        receipts === legacy
          ? /no current character authority/i
          : receipts === denied
            ? denial.reason
            : /read-only until/i;
      expect(() => worker({ kind: 'person', id: 'hacer' })).toThrow(refusal);
      await worker({ kind: 'chapter', value: receipts.chapter });
      expect(() => worker({ kind: 'person', id: 'hacer' })).toThrow(refusal);
      if (receipts === denied) {
        await expect(worker({ kind: 'chapter', value: chapter })).rejects.toThrow(/refusals differ/);
        expect(() => worker({ kind: 'person', id: 'hacer' })).toThrow(denial.reason);
      }
    }
  }
});

async function fixture() {
  const dispatch = createNativeOwnerDispatcher();
  let current: BuildingWorld | undefined;
  let hook: ((at: 'chapter' | 'capture' | 'recovery' | 'submitted') => void) | undefined;
  const requests: PersonaRequest[] = [],
    records: NativeRecovery[] = [];
  const game: NativeGameAccess = {
    open: async (...args) => ((await dispatch({ kind: 'open', args })) as OwnerView).world,
    reopen: async (_world, ...args) => ((await dispatch({ kind: 'open', args })) as OwnerView).world,
    checkpoint: async () =>
      (await dispatch({ kind: 'checkpoint' })) as Awaited<ReturnType<NativeGameAccess['checkpoint']>>,
    person: async (_world, id) =>
      (await dispatch({ kind: 'person', id })) as Awaited<ReturnType<NativeGameAccess['person']>>,
    notebook: async (_world, receipts) => {
      const captured = (await dispatch({ kind: 'snapshot', receipts })) as Awaited<
        ReturnType<NativeGameAccess['notebook']>
      >;
      hook?.('capture');
      return captured;
    },
    discard() {},
    admit: async (_world, input, edition) =>
      (await dispatch({ kind: 'admit', input, edition })) as Awaited<ReturnType<NativeGameAccess['admit']>>,
    chapter: async (_world, value) => {
      const checked = (await dispatch({ kind: 'chapter', value })) as Awaited<
        ReturnType<NativeGameAccess['chapter']>
      >;
      hook?.('chapter');
      return checked;
    },
  };
  const controller = createNativeContinuity({
    game,
    current: () => current,
    save() {},
    recording() {},
    build: () => 'synthetic-r3',
    shelf: {
      enabled: true,
      ready: Promise.resolve(true),
      setEnabled() {},
      async request<T>(q: PersonaRequest): Promise<T> {
        requests.push(structuredClone(q));
        if (q.action === 'prepareBatch')
          return {
            expectedHeads: Object.fromEntries((q.castIds ?? []).map((id) => [id, null])),
            inputs: [],
            blocked: [],
          } as T;
        if (q.action === 'putBatch') {
          acceptPersonaBatch({ heads: {}, revisions: [] }, q.envelopes ?? [], q.expectedHeads);
          hook?.('submitted');
          return q.envelopes as T;
        }
        throw Error(`Unexpected request ${q.action}`);
      },
    },
    recoveries: {
      async list() {
        return structuredClone(records);
      },
      async put(record) {
        records.push(structuredClone(record));
        if (!record.accepted) hook?.('recovery');
      },
      async remove() {},
    },
  });
  return {
    controller,
    requests,
    records,
    setHook: (value: typeof hook) => {
      hook = value;
    },
    setCurrent: (world: BuildingWorld) => {
      current = world;
    },
  };
}

test('admission invalidated during chapter validation or notebook capture writes no pre-CAS recovery', async () => {
  for (const boundary of ['chapter', 'capture'] as const) {
    const f = await fixture();
    f.setHook((at) => {
      if (at === boundary) f.controller.invalidateContinuity();
    });
    await expect(f.controller.arrive(7)).rejects.toThrow(/changed/i);
    expect(f.records).toHaveLength(0);
    expect(f.requests.filter((q) => q.action === 'putBatch')).toEqual([]);
    f.setHook(undefined);
    const next = await f.controller.arrive(8);
    f.setCurrent(next);
    expect(f.controller.castReceipts(next).denials).toEqual([]);
  }
});

test('an already-submitted late CAS keeps its exact accepted recovery after invalidation', async () => {
  const f = await fixture();
  f.setHook((at) => {
    if (at === 'submitted') f.controller.invalidateContinuity();
  });
  await expect(f.controller.arrive(7)).rejects.toMatchObject({ submitted: true, accepted: true });
  expect(f.requests.filter((q) => q.action === 'putBatch')).toHaveLength(1);
  expect(f.records.map((r) => r.accepted)).toEqual([false, true]);
  expect(f.records[1]?.expectedHeads).toEqual(Object.fromEntries(ALLOCATION.map((p) => [p.castId, null])));
});

test('nested recovery continuation invalidation prevents a later CAS submission', async () => {
  const f = await fixture();
  const order: string[] = [];
  f.setHook((at) => {
    if (at === 'submitted') order.push('submitted');
    if (at === 'recovery') {
      order.push('recovery');
      queueMicrotask(() =>
        queueMicrotask(() => {
          order.push('invalidated');
          f.controller.invalidateContinuity();
        }),
      );
    }
  });
  await expect(f.controller.arrive(7)).rejects.toMatchObject({ submitted: false, accepted: false });
  expect(order).toEqual(['recovery', 'invalidated']);
  expect(f.requests.filter((q) => q.action === 'putBatch')).toHaveLength(0);
  expect(f.records.map((record) => record.accepted)).toEqual([false]);
});
