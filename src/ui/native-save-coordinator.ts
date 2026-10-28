import type { NativeNotebook } from './native-notebook.ts';

export type NativeSaveResult =
  | { kind: 'saved'; current: boolean; notebook: NativeNotebook }
  | { kind: 'cleared'; current: boolean }
  | { kind: 'cancelled' };

export class NativeSaveFailure extends Error {
  constructor(
    cause: unknown,
    readonly completed?: 'saved' | 'cleared',
  ) {
    super(cause instanceof Error ? cause.message : 'The native save could not be checked.', { cause });
    this.name = 'NativeSaveFailure';
  }
}

/** The caller chooses save boundaries. This helper starts no timer and exports
 * only when a queued write starts. A completed stale write is still a write;
 * newer saves and clears always follow it on the same serialized queue. */
export function createNativeSaveCoordinator<World>(options: {
  current(): World | undefined;
  enabled?(): boolean;
  snapshot(world: World): NativeNotebook | Promise<NativeNotebook>;
  save(notebook: NativeNotebook): Promise<void>;
  clear(): Promise<void>;
}) {
  type Job = {
    kind: 'save' | 'clear';
    world: World | undefined;
    generation: number;
    request: number;
    promise: Promise<NativeSaveResult>;
    resolve(result: NativeSaveResult): void;
    reject(error: unknown): void;
  };
  let generation = 0,
    request = 0,
    running = false;
  let drain: Promise<void> = Promise.resolve();
  const queue: Job[] = [];
  const enabled = () => options.enabled?.() ?? true;
  const valid = (job: Job) => enabled() && job.generation === generation && options.current() === job.world;
  function schedule() {
    if (running) return;
    running = true;
    let resolve!: () => void, reject!: (error: unknown) => void;
    drain = new Promise<void>((done, fail) => {
      resolve = done;
      reject = fail;
    });
    // Callers still receive the original rejection through request/flush. Avoid
    // an unhandled background promise when the caller only awaits its request.
    void drain.catch(() => {});
    queueMicrotask(async () => {
      const errors: unknown[] = [];
      while (queue.length) {
        const job = queue.shift();
        if (!job) break;
        const capturedRequest = job.request;
        let completed: 'saved' | 'cleared' | undefined;
        try {
          if (!valid(job)) {
            job.resolve({ kind: 'cancelled' });
            continue;
          }
          if (job.kind === 'clear') {
            await options.clear();
            completed = 'cleared';
            job.resolve({ kind: 'cleared', current: valid(job) && request === capturedRequest });
          } else {
            if (job.world === undefined) {
              job.resolve({ kind: 'cancelled' });
              continue;
            }
            const snapshot = options.snapshot(job.world);
            const notebook = snapshot instanceof Promise ? await snapshot : snapshot;
            // An injected snapshot may invalidate the view. Do not submit it.
            if (!valid(job)) {
              job.resolve({ kind: 'cancelled' });
              continue;
            }
            await options.save(notebook);
            completed = 'saved';
            job.resolve({ kind: 'saved', current: valid(job) && request === capturedRequest, notebook });
          }
        } catch (error) {
          const failure = new NativeSaveFailure(error, completed);
          errors.push(failure);
          job.reject(failure);
        }
      }
      running = false;
      if (errors.length) reject(new AggregateError(errors, 'Native save operations failed.'));
      else resolve();
    });
  }
  function enqueue(kind: Job['kind']): Promise<NativeSaveResult> {
    if (!enabled()) return Promise.resolve({ kind: 'cancelled' });
    const world = options.current();
    if (kind === 'save' && world === undefined) return Promise.resolve({ kind: 'cancelled' });
    const next = ++request,
      tail = queue.at(-1);
    if (tail && tail.kind === kind && tail.world === world && tail.generation === generation) {
      tail.request = next;
      return tail.promise;
    }
    let resolve!: Job['resolve'], reject!: Job['reject'];
    const promise = new Promise<NativeSaveResult>((done, fail) => {
      resolve = done;
      reject = fail;
    });
    void promise.catch(() => {});
    queue.push({ kind, world, generation, request: next, promise, resolve, reject });
    schedule();
    return promise;
  }
  function invalidate() {
    generation++;
    request++;
    for (const job of queue.splice(0)) job.resolve({ kind: 'cancelled' });
  }
  function requestJob(kind: Job['kind']) {
    try {
      return enqueue(kind);
    } catch (cause) {
      const rejected = Promise.reject<NativeSaveResult>(new NativeSaveFailure(cause));
      void rejected.catch(() => {});
      return rejected;
    }
  }
  return {
    requestSave: () => requestJob('save'),
    invalidate,
    clearSaved() {
      invalidate();
      return requestJob('clear');
    },
    /** Waits the current drain, and rejects if any operation in it failed. */
    flush: () => drain,
  };
}
