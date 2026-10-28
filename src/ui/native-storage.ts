import { type NativeNotebook, readNativeNotebook } from './native-notebook.ts';
import { fileMode } from './session-route.ts';

export interface NativeStore {
  get(): Promise<unknown>;
  put(value: NativeNotebook): Promise<void>;
  clear(): Promise<void>;
}

export class LegacyNativeSaveError extends Error {
  constructor() {
    super('An old save exists and cannot be opened by this game version. Keep the old save.');
    this.name = 'LegacyNativeSaveError';
  }
}

/** A successful read found a record this version cannot open. Keep the original
 * value separate from validated notebooks so recovery never invents a run. */
export class UnreadableNativeSaveError extends Error {
  readonly raw: unknown;
  constructor(raw: unknown, cause: unknown) {
    super('The saved notebook cannot be opened by this version. Keep the original notebook.', { cause });
    this.name = 'UnreadableNativeSaveError';
    this.raw = raw;
  }
}

export function createNativeStorage(options: {
  store: () => NativeStore;
  fileMode: () => boolean;
  legacy: () => string | null;
}) {
  return {
    async loadNativeSaved(): Promise<NativeNotebook | null> {
      if (options.fileMode()) return null;
      const value = await options.store().get();
      if (value === undefined) {
        if (options.legacy() !== null) throw new LegacyNativeSaveError();
        return null;
      }
      try {
        return readNativeNotebook(value);
      } catch (cause) {
        throw new UnreadableNativeSaveError(value, cause);
      }
    },
    async saveNativeSaved(notebook: NativeNotebook): Promise<void> {
      if (options.fileMode()) throw new Error('Saved-file play cannot write the normal save.');
      const valid = readNativeNotebook(notebook);
      await options.store().put(valid);
    },
    async clearNativeSaved(): Promise<void> {
      if (options.fileMode()) throw new Error('Saved-file play cannot clear the normal save.');
      await options.store().clear();
    },
  };
}

const DB = 'stairwell-native-notebook';
const STORE = 'notebook';
const KEY = 'current';
let connection: Promise<IDBDatabase> | undefined;
function open(): Promise<IDBDatabase> {
  if (!connection) {
    connection = new Promise<IDBDatabase>((resolve, reject) => {
      let failed = false;
      const request = indexedDB.open(DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onerror = () => {
        failed = true;
        reject(request.error);
      };
      request.onblocked = () => {
        failed = true;
        reject(new Error('Native save database is blocked.'));
      };
      request.onsuccess = () => {
        const db = request.result;
        if (failed) {
          db.close();
          return;
        }
        db.onversionchange = () => {
          db.close();
          connection = undefined;
        };
        resolve(db);
      };
    }).catch((error: unknown) => {
      connection = undefined;
      throw error;
    });
  }
  return connection as Promise<IDBDatabase>;
}
async function operation<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(tx.error ?? request.error ?? new Error('Native save transaction aborted.'));
    tx.onerror = () => reject(tx.error ?? request.error ?? new Error('Native save transaction failed.'));
  });
}
const indexedStore: NativeStore = {
  get: () => operation('readonly', (store) => store.get(KEY)),
  put: async (value) => {
    await operation('readwrite', (store) => store.put(value, KEY));
  },
  clear: async () => {
    await operation('readwrite', (store) => store.delete(KEY));
  },
};
const normal = createNativeStorage({
  store: () => indexedStore,
  fileMode: () => fileMode === 'file',
  legacy: () => localStorage.getItem('stairwell:notebook'),
});
export const { loadNativeSaved, saveNativeSaved, clearNativeSaved } = normal;
