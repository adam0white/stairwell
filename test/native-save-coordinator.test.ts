import { expect, test } from 'vitest';
import { openBuilding } from '../src/sim/hf-game.ts';
import { type NativeNotebook, nativeNotebook } from '../src/ui/native-notebook.ts';
import { createNativeSaveCoordinator } from '../src/ui/native-save-coordinator.ts';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture() {
  let world: { value: number } | undefined = { value: 1 };
  let enabled = true;
  let readFailure = false;
  const base = nativeNotebook(openBuilding(7));
  const writes: NativeNotebook[] = [],
    operations: string[] = [];
  let snapshots = 0;
  let beforeWrite: (() => Promise<void>) | undefined;
  let failure: Error | undefined;
  const coordinator = createNativeSaveCoordinator({
    current: () => {
      if (readFailure) throw Error('Current failed');
      return world;
    },
    enabled: () => enabled,
    snapshot(value) {
      snapshots++;
      return structuredClone({ ...base, castReceipts: { value: value.value } });
    },
    async save(notebook) {
      operations.push('save');
      writes.push(structuredClone(notebook));
      await beforeWrite?.();
      if (failure) throw failure;
    },
    async clear() {
      operations.push('clear');
      if (failure) throw failure;
    },
  });
  return {
    coordinator,
    writes,
    operations,
    base,
    snapshots: () => snapshots,
    update(value: number) {
      if (!world) throw Error('No world');
      world.value = value;
    },
    replace(value: number) {
      world = { value };
    },
    failCurrent() {
      readFailure = true;
    },
    recoverCurrent() {
      readFailure = false;
    },
    disable() {
      enabled = false;
    },
    beforeWrite(callback: () => Promise<void>) {
      beforeWrite = callback;
    },
    fail() {
      failure = Error('Quota failed');
    },
    recover() {
      failure = undefined;
    },
  };
}

test('bursts share one pending save and capture the complete latest notebook only at its write boundary', async () => {
  const f = fixture(),
    first = f.coordinator.requestSave();
  f.update(9);
  const second = f.coordinator.requestSave();
  expect(second).toBe(first);
  expect(f.snapshots()).toBe(0);
  expect(await first).toMatchObject({ kind: 'saved', current: true });
  await f.coordinator.flush();
  expect(f.snapshots()).toBe(1);
  expect(f.writes).toEqual([{ ...f.base, castReceipts: { value: 9 } }]);
});

test('an in-flight save is followed by one latest pending save and cannot overtake it', async () => {
  const f = fixture(),
    gate = deferred();
  let calls = 0;
  f.beforeWrite(async () => {
    if (++calls === 1) await gate.promise;
  });
  const first = f.coordinator.requestSave();
  await Promise.resolve();
  f.update(2);
  const second = f.coordinator.requestSave();
  f.update(3);
  const third = f.coordinator.requestSave();
  expect(second).toBe(third);
  expect(f.writes).toHaveLength(1);
  gate.resolve();
  expect(await first).toMatchObject({ kind: 'saved', current: false });
  expect(await third).toMatchObject({ kind: 'saved', current: true });
  expect(f.writes.map((value) => value.castReceipts)).toEqual([{ value: 1 }, { value: 3 }]);
});

test('invalidation cancels pending work before export and never saves a replacement world implicitly', async () => {
  const f = fixture(),
    pending = f.coordinator.requestSave();
  f.coordinator.invalidate();
  f.replace(2);
  expect(await pending).toEqual({ kind: 'cancelled' });
  await f.coordinator.flush();
  expect(f.snapshots()).toBe(0);
  expect(f.writes).toEqual([]);
});

test('late storage completion is reported honestly after identity invalidation', async () => {
  const f = fixture(),
    gate = deferred();
  f.beforeWrite(() => gate.promise);
  const pending = f.coordinator.requestSave();
  await Promise.resolve();
  f.coordinator.invalidate();
  f.replace(2);
  gate.resolve();
  expect(await pending).toMatchObject({ kind: 'saved', current: false });
  expect(f.writes).toHaveLength(1);
  expect(f.writes[0]?.castReceipts).toEqual({ value: 1 });
});

test('a queued clear cannot erase a replacement world implicitly', async () => {
  const f = fixture(),
    gate = deferred();
  let calls = 0;
  f.beforeWrite(async () => {
    if (++calls === 1) await gate.promise;
  });
  const first = f.coordinator.requestSave();
  await Promise.resolve();
  const dropped = f.coordinator.requestSave();
  const cleared = f.coordinator.clearSaved();
  f.replace(2);
  const newest = f.coordinator.requestSave();
  expect(await dropped).toEqual({ kind: 'cancelled' });
  gate.resolve();
  expect(await first).toMatchObject({ kind: 'saved', current: false });
  // Clear was requested for the prior world; replacing it before submission cancels it.
  expect(await cleared).toEqual({ kind: 'cancelled' });
  expect(await newest).toMatchObject({ kind: 'saved', current: true });
  expect(f.operations).toEqual(['save', 'save']);
  const finalClear = f.coordinator.clearSaved();
  expect(await finalClear).toEqual({ kind: 'cleared', current: true });
  expect(f.operations).toEqual(['save', 'save', 'clear']);
});

test('storage errors reject requests and flush; a later explicit request can recover', async () => {
  const f = fixture();
  f.fail();
  const pending = f.coordinator.requestSave();
  await expect(pending).rejects.toThrow('Quota failed');
  await expect(f.coordinator.flush()).rejects.toThrow(/save operations failed/);
  f.recover();
  expect(await f.coordinator.requestSave()).toMatchObject({ kind: 'saved', current: true });
  await f.coordinator.flush();
});

test('disabled file play performs no snapshot or storage operation', async () => {
  const f = fixture();
  f.disable();
  expect(await f.coordinator.requestSave()).toEqual({ kind: 'cancelled' });
  expect(await f.coordinator.clearSaved()).toEqual({ kind: 'cancelled' });
  await f.coordinator.flush();
  expect(f.snapshots()).toBe(0);
  expect(f.operations).toEqual([]);
});

test('clear waits for an in-flight write and precedes the next same-world save', async () => {
  const f = fixture(),
    gate = deferred();
  let calls = 0;
  f.beforeWrite(async () => {
    if (++calls === 1) await gate.promise;
  });
  const first = f.coordinator.requestSave();
  await Promise.resolve();
  const cleared = f.coordinator.clearSaved();
  f.update(4);
  const next = f.coordinator.requestSave();
  expect(f.operations).toEqual(['save']);
  gate.resolve();
  expect(await first).toMatchObject({ kind: 'saved', current: false });
  expect(await cleared).toEqual({ kind: 'cleared', current: false });
  expect(await next).toMatchObject({ kind: 'saved', current: true });
  expect(f.operations).toEqual(['save', 'clear', 'save']);
  expect(f.writes[1]?.castReceipts).toEqual({ value: 4 });
});

test('throwing current validation rejects the request and flush, then a later save recovers', async () => {
  const f = fixture();
  const request = f.coordinator.requestSave();
  f.failCurrent();
  await expect(request).rejects.toThrow('Current failed');
  await expect(f.coordinator.flush()).rejects.toThrow(/save operations failed/);
  expect(f.writes).toEqual([]);
  f.recoverCurrent();
  expect(await f.coordinator.requestSave()).toMatchObject({ kind: 'saved', current: true });
  await f.coordinator.flush();
}, 250);

test('a failure to check identity after storage completed reports that completion', async () => {
  const f = fixture();
  f.beforeWrite(async () => {
    f.failCurrent();
  });
  await expect(f.coordinator.requestSave()).rejects.toMatchObject({
    message: 'Current failed',
    completed: 'saved',
  });
  expect(f.writes).toHaveLength(1);
  f.recoverCurrent();
  f.beforeWrite(async () => {});
  expect(await f.coordinator.requestSave()).toMatchObject({
    kind: 'saved',
    current: true,
    notebook: f.writes[1],
  });
});

test('invalidating an awaited owner snapshot prevents its stale IndexedDB submission', async () => {
  const gate = deferred();
  const notebook = nativeNotebook(openBuilding(7));
  let current = { id: 1 };
  const writes: NativeNotebook[] = [];
  const coordinator = createNativeSaveCoordinator({
    current: () => current,
    snapshot: async () => {
      await gate.promise;
      return notebook;
    },
    save: async (value) => {
      writes.push(value);
    },
    clear: async () => {},
  });
  const pending = coordinator.requestSave();
  await Promise.resolve();
  current = { id: 2 };
  coordinator.invalidate();
  gate.resolve();
  await expect(pending).resolves.toEqual({ kind: 'cancelled' });
  await coordinator.flush();
  expect(writes).toEqual([]);
});
