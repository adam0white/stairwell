import type { RunJournalChunk, RunJournalHead, RunJournalOpening } from '@adam0white/human-framework';
import {
  type NativeJournalSnapshot,
  type NativeNotebook,
  notebookFromJournal,
  readNativeNotebook,
} from './native-notebook.ts';
import { fileMode } from './session-route.ts';

export interface NativeStore {
  get(): Promise<unknown>;
  put(value: NativeNotebook): Promise<void>;
  clear(): Promise<void>;
}

export class LegacyNativeSaveError extends Error {
  constructor() {
    super('An old save cannot be opened by this game version. Keep the old save and start fresh.');
    this.name = 'LegacyNativeSaveError';
  }
}

/** A successful read found a record this version cannot open. Keep the original
 * value separate from validated notebooks so recovery never invents a run. */
export class UnreadableNativeSaveError extends Error {
  readonly raw: unknown;
  constructor(raw: unknown, cause: unknown) {
    super(
      'The saved notebook cannot be opened by this version. Keep the original notebook and start fresh.',
      { cause },
    );
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
type JournalRecord = {
  format: 'stairwell-journal/1';
  opening: RunJournalOpening;
  head: RunJournalHead;
  world: NativeJournalSnapshot['world'];
  receipts?: unknown;
};
const chunkKey = (digest: string) => `journal:${digest}`;

export async function loadIndexedDirect(): Promise<unknown> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly'),
      store = tx.objectStore(STORE);
    const current = store.get(KEY),
      keys = store.getAllKeys(),
      values = store.getAll();
    tx.oncomplete = () => {
      const record = current.result as JournalRecord | undefined;
      if (!record || record.format !== 'stairwell-journal/1') {
        resolve(record);
        return;
      }
      const raw = {
        record,
        entries: keys.result.map((key, index) => [key, values.result[index]]),
      };
      try {
        const entries = new Map(raw.entries as [IDBValidKey, unknown][]);
        const chunks: RunJournalChunk[] = [];
        let digest = record.head.digest;
        while (digest !== record.opening.digest) {
          if (chunks.length > record.head.ordinal) throw Error('Invalid journal chain.');
          const chunk = entries.get(chunkKey(digest)) as RunJournalChunk | undefined;
          if (!chunk || chunk.digest !== digest) throw Error('Missing journal chunk.');
          chunks.push(chunk);
          digest = chunk.previous;
        }
        resolve(
          notebookFromJournal(record.world, record.receipts, {
            opening: record.opening,
            chunks: chunks.reverse(),
            head: record.head,
          }),
        );
      } catch (cause) {
        reject(new UnreadableNativeSaveError(raw, cause));
      }
    };
    tx.onabort = () => reject(tx.error ?? new Error('Native save transaction aborted.'));
    tx.onerror = () => reject(tx.error ?? new Error('Native save transaction failed.'));
  });
}

async function loadIndexed(): Promise<unknown> {
  if (typeof Worker === 'undefined') return loadIndexedDirect();
  const worker = new Worker(new URL('./native-storage.worker.ts', import.meta.url), { type: 'module' });
  return new Promise((resolve, reject) => {
    worker.onmessage = (
      event: MessageEvent<{
        ok: boolean;
        value?: unknown;
        unreadable?: boolean;
        error?: string;
      }>,
    ) => {
      worker.terminate();
      if (event.data.ok) resolve(event.data.value);
      else if (event.data.unreadable)
        reject(new UnreadableNativeSaveError(event.data.value, new Error(event.data.error)));
      else reject(new Error(event.data.error || 'Native save could not be read.'));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'Native save worker failed.'));
    };
    worker.onmessageerror = () => {
      worker.terminate();
      reject(new Error('Native save worker response could not be read.'));
    };
    worker.postMessage(null);
  });
}

/** The head, host snapshot, and newly appended chunk commit in one transaction. */
export async function saveNativeJournal(snapshot: NativeJournalSnapshot): Promise<void> {
  if (fileMode === 'file') throw new Error('Saved-file play cannot write the normal save.');
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite'),
      store = tx.objectStore(STORE);
    let failure: Error | undefined;
    const current = store.get(KEY);
    current.onsuccess = () => {
      const { opening, chunk, head } = snapshot.journal;
      const prior = current.result as JournalRecord | undefined;
      const base = opening
        ? {
            lineage: opening.digest,
            digest: opening.digest,
            ordinal: 0,
            at: opening.initial.spec.start,
          }
        : prior?.head;
      if (
        (!opening && prior?.format !== 'stairwell-journal/1') ||
        !base ||
        (chunk
          ? chunk.previous !== base.digest ||
            chunk.lineage !== base.lineage ||
            chunk.first !== base.ordinal + 1 ||
            head.digest !== chunk.digest ||
            head.ordinal !== chunk.last ||
            head.at !== chunk.at ||
            head.lineage !== chunk.lineage
          : JSON.stringify(head) !== JSON.stringify(base))
      ) {
        failure = new Error('The saved journal head changed before this save.');
        tx.abort();
        return;
      }
      if (opening) store.clear();
      if (chunk) store.put(chunk, chunkKey(chunk.digest));
      const record: JournalRecord = {
        format: 'stairwell-journal/1',
        opening: opening ?? prior!.opening,
        head,
        world: snapshot.world,
        ...(snapshot.receipts === undefined ? {} : { receipts: snapshot.receipts }),
      };
      store.put(record, KEY);
    };
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('Native journal transaction aborted.'));
    tx.onerror = () => reject(tx.error ?? new Error('Native journal transaction failed.'));
  });
}
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
  get: loadIndexed,
  put: async (value) => {
    await operation('readwrite', (store) => store.put(value, KEY));
  },
  clear: async () => {
    await operation('readwrite', (store) => store.clear());
  },
};
const normal = createNativeStorage({
  store: () => indexedStore,
  fileMode: () => fileMode === 'file',
  legacy: () => localStorage.getItem('stairwell:notebook'),
});
export const { loadNativeSaved, saveNativeSaved, clearNativeSaved } = normal;
