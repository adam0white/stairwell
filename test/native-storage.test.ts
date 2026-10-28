import { expect, test } from 'vitest';
import { openBuilding } from '../src/sim/hf-game.ts';
import { nativeNotebook } from '../src/ui/native-notebook.ts';
import {
  createNativeStorage,
  type NativeStore,
  UnreadableNativeSaveError,
} from '../src/ui/native-storage.ts';

function memory() {
  let value: unknown;
  let writes = 0;
  const store: NativeStore = {
    async get() {
      return value;
    },
    async put(v) {
      writes++;
      value = structuredClone(v);
    },
    async clear() {
      value = undefined;
    },
  };
  return {
    store,
    writes: () => writes,
    set: (v: unknown) => {
      value = v;
    },
  };
}

test('retains a complete notebook larger than four megabytes', async () => {
  const m = memory();
  const storage = createNativeStorage({ store: () => m.store, fileMode: () => false, legacy: () => null });
  const notebook = nativeNotebook(openBuilding(7), { opaque: 'x'.repeat(4 * 1024 * 1024 + 1) });
  await storage.saveNativeSaved(notebook);
  expect(await storage.loadNativeSaved()).toEqual(notebook);
  await storage.clearNativeSaved();
  expect(await storage.loadNativeSaved()).toBeNull();
});

test('invalid saves never write and invalid stored data is rejected', async () => {
  const m = memory();
  const storage = createNativeStorage({ store: () => m.store, fileMode: () => false, legacy: () => null });
  await expect(storage.saveNativeSaved({} as never)).rejects.toThrow();
  expect(m.writes()).toBe(0);
  m.set({});
  await expect(storage.loadNativeSaved()).rejects.toThrow();
});

test('unreadable stored JSON retains the original value for an unopened download', async () => {
  const m = memory();
  const storage = createNativeStorage({ store: () => m.store, fileMode: () => false, legacy: () => null });
  for (const raw of [{ format: 'stairwell-notebook/99', state: { original: true } }, null, false, 0, '']) {
    m.set(raw);
    let failure: unknown;
    try {
      await storage.loadNativeSaved();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(UnreadableNativeSaveError);
    expect((failure as UnreadableNativeSaveError).raw).toBe(raw);
    expect(await m.store.get()).toBe(raw);
    expect(m.writes()).toBe(0);
  }
});

test('legacy values are refused without changing them', async () => {
  const m = memory();
  const legacy = 'old save';
  const storage = createNativeStorage({ store: () => m.store, fileMode: () => false, legacy: () => legacy });
  await expect(storage.loadNativeSaved()).rejects.toThrow(/old save/i);
  expect(legacy).toBe('old save');
  await storage.saveNativeSaved(nativeNotebook(openBuilding(7)));
  expect(await storage.loadNativeSaved()).not.toBeNull();
});

test('file mode accesses neither store nor legacy and refuses writes', async () => {
  const storage = createNativeStorage({
    store: () => {
      throw Error('store accessed');
    },
    fileMode: () => true,
    legacy: () => {
      throw Error('legacy accessed');
    },
  });
  expect(await storage.loadNativeSaved()).toBeNull();
  await expect(storage.saveNativeSaved(nativeNotebook(openBuilding(7)))).rejects.toThrow(/file/i);
  await expect(storage.clearNativeSaved()).rejects.toThrow(/file/i);
});

test('storage failures propagate', async () => {
  const fail = async () => {
    throw Error('quota or storage failure');
  };
  const storage = createNativeStorage({
    store: () => ({ get: fail, put: fail, clear: fail }),
    fileMode: () => false,
    legacy: () => null,
  });
  await expect(storage.loadNativeSaved()).rejects.toThrow(/storage failure/);
  await expect(storage.saveNativeSaved(nativeNotebook(openBuilding(7)))).rejects.toThrow(/storage failure/);
  await expect(storage.clearNativeSaved()).rejects.toThrow(/storage failure/);
});

test('module import and controller creation do not open a database', async () => {
  let opened = false;
  const original = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    get() {
      opened = true;
      throw Error('database accessed');
    },
  });
  try {
    const { vi } = await import('vitest');
    vi.resetModules();
    const module = await import('../src/ui/native-storage.ts');
    module.createNativeStorage({
      store: () => {
        throw Error('store accessed');
      },
      fileMode: () => false,
      legacy: () => null,
    });
    expect(opened).toBe(false);
  } finally {
    if (original) Object.defineProperty(globalThis, 'indexedDB', original);
    else Reflect.deleteProperty(globalThis, 'indexedDB');
  }
});

test('a blocked database open closes a connection that succeeds later', async () => {
  const { vi } = await import('vitest');
  vi.resetModules();
  let closed = false;
  const request: { result: { close: () => void }; onblocked: () => void; onsuccess: () => void } = {
    onblocked: () => {},
    onsuccess: () => {},
    result: {
      close: () => {
        closed = true;
      },
    },
  };
  const original = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: { open: () => request } });
  try {
    const { loadNativeSaved } = await import('../src/ui/native-storage.ts');
    const pending = loadNativeSaved();
    request.onblocked();
    await expect(pending).rejects.toThrow(/blocked/);
    request.onsuccess();
    expect(closed).toBe(true);
  } finally {
    if (original) Object.defineProperty(globalThis, 'indexedDB', original);
    else Reflect.deleteProperty(globalThis, 'indexedDB');
  }
});
