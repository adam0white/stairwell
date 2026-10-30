import type { BuildingWorld } from '../sim/hf-world.ts';
import type { NativeFileNotebook, NativeJournalSnapshot, NativeNotebook } from './native-notebook.ts';
import type { OwnerOperation, OwnerPerson, OwnerView } from './native-owner-core.ts';
import type { NativeReaderWorker } from './native-reader.ts';
import { installNativeProjection } from './native-reads.ts';

/** One transport and stable UI identity per actual worker-owned game. Requests
 * serialize through response validation, so reads bind to an accepted revision. */
export function createNativeOwner(
  createWorker: () => NativeReaderWorker = () =>
    new Worker(new URL('./native-owner.worker.ts', import.meta.url), {
      type: 'module',
    }),
) {
  const worker = createWorker();
  let disposed = false,
    promoted = false,
    sequence = 0,
    revision = 0;
  let world: BuildingWorld | undefined;
  let discarded: unknown = new DOMException('The game was discarded.', 'AbortError');
  let tail: Promise<unknown> = Promise.resolve();
  type Job = {
    operation: OwnerOperation;
    expected: number;
    resolve(value: unknown): void;
    reject(error: unknown): void;
  };
  const pending = new Map<number, Job>();
  const malformed = () =>
    dispose(new Error('The game worker returned an invalid response. Keep the last complete notebook.'));
  const message = (event: MessageEvent) => {
    if (disposed) return;
    const data = event.data;
    if (!data || typeof data !== 'object' || !Number.isSafeInteger(data.id)) {
      malformed();
      return;
    }
    const job = pending.get(data.id);
    if (!job) return;
    if (typeof data.ok !== 'boolean' || !Number.isSafeInteger(data.revision) || data.revision < 0) {
      malformed();
      return;
    }
    pending.delete(data.id);
    if (!data.ok) {
      if (data.revision !== job.expected) {
        const error = new Error('A rejected game operation changed revision.');
        job.reject(error);
        dispose(error);
        return;
      }
      if (typeof data.error !== 'string') {
        job.reject(new Error('Invalid worker error.'));
        malformed();
        return;
      }
      job.reject(new Error(data.error));
      return;
    }
    try {
      const opening = ['open', 'notebook', 'file'].includes(job.operation.kind);
      const mutation = opening || ['act', 'step', 'wait'].includes(job.operation.kind);
      if (data.revision !== job.expected + (mutation ? 1 : 0)) throw Error('Stale game worker revision.');
      const hasView = mutation || job.operation.kind === 'project';
      if (hasView) {
        const value = data.value as OwnerView;
        if (!value || value.revision !== data.revision || !value.world || !value.projection)
          throw Error('Invalid game view.');
        revision = value.revision;
        world ??= value.world;
        if (world !== value.world) {
          for (const key of Object.keys(world)) delete (world as unknown as Record<string, unknown>)[key];
          Object.assign(world, value.world);
        }
        installNativeProjection(world, value.projection);
        job.resolve({ ...value, world });
      } else job.resolve(data.value);
    } catch (error) {
      job.reject(error);
      dispose(error);
    }
  };
  const error = (event: ErrorEvent) => dispose(new Error(event.message || 'The game worker failed.'));
  const unreadable = () => dispose(new Error('The game worker response could not be read.'));
  worker.addEventListener('message', message);
  worker.addEventListener('error', error);
  worker.addEventListener('messageerror', unreadable);
  function dispose(reason: unknown = new DOMException('The game was discarded.', 'AbortError')) {
    if (disposed) return;
    disposed = true;
    discarded = reason;
    worker.removeEventListener('message', message);
    worker.removeEventListener('error', error);
    worker.removeEventListener('messageerror', unreadable);
    worker.terminate();
    for (const job of pending.values()) job.reject(reason);
    pending.clear();
  }
  function request<T>(operation: OwnerOperation): Promise<T> {
    const result = tail.then(() => {
      if (disposed) throw discarded;
      if (promoted && ['open', 'notebook', 'file'].includes(operation.kind))
        throw Error('An active game cannot be replaced inside its owner.');
      const id = ++sequence;
      return new Promise<T>((resolve, reject) => {
        pending.set(id, {
          operation,
          expected: revision,
          resolve: (value) => resolve(value as T),
          reject,
        });
        try {
          worker.postMessage({
            id,
            operation: { ...operation, expectedRevision: revision },
          });
        } catch (error) {
          pending.delete(id);
          reject(error);
        }
      });
    });
    tail = result.catch(() => {});
    return result;
  }
  return {
    update: (operation: OwnerOperation) => request<OwnerView>(operation),
    request,
    dispose,
    promote() {
      if (disposed) throw Error('A discarded game cannot become active.');
      promoted = true;
    },
    get disposed() {
      return disposed;
    },
    get revision() {
      return revision;
    },
    snapshot: (receipts?: unknown) => request<NativeNotebook>({ kind: 'snapshot', receipts }),
    journal: (receipts?: unknown) => request<NativeJournalSnapshot>({ kind: 'journal', receipts }),
    commitJournal: (token: number) => request<void>({ kind: 'journal-commit', token }),
    export: (provenance: unknown, receipts: unknown) =>
      request<NativeFileNotebook>({ kind: 'export', provenance, receipts }),
    person: (id: import('../sim/building-cast.ts').Rid) => request<OwnerPerson>({ kind: 'person', id }),
  };
}
export type NativeOwner = ReturnType<typeof createNativeOwner>;
const owners = new WeakMap<BuildingWorld, NativeOwner>();
export function bindNativeOwner(world: BuildingWorld, owner: NativeOwner) {
  owners.set(world, owner);
}
export function nativeOwner(world: BuildingWorld): NativeOwner {
  const owner = owners.get(world);
  if (!owner) throw Error('This game has no worker owner.');
  return owner;
}
