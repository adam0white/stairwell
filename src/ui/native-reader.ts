import type { NativeNotebook } from './native-notebook.ts';
import type { NativeReaderFile, NativeReaderRequest, NativeReaderResponse } from './native-reader-core.ts';

/** Only this UI reader owns replay workers. Importing it creates no browser services. */
export type NativeReaderWorker = Pick<
  Worker,
  'addEventListener' | 'removeEventListener' | 'postMessage' | 'terminate'
>;
type Options = { createWorker?: () => NativeReaderWorker };
const abortError = () => new DOMException('Notebook reading was cancelled.', 'AbortError');

export function createNativeReader(options: Options = {}) {
  let disposed = false;
  let sequence = 0;
  let active: { cancel: () => void } | undefined;
  const createWorker =
    options.createWorker ??
    (() => new Worker(new URL('./native-reader.worker.ts', import.meta.url), { type: 'module' }));

  function read(
    kind: NativeReaderRequest['kind'],
    input: unknown,
    signal?: AbortSignal,
  ): Promise<NativeNotebook | NativeReaderFile> {
    if (disposed) return Promise.reject(new Error('The notebook reader has been disposed.'));
    if (signal?.aborted) return Promise.reject(abortError());
    active?.cancel();
    return new Promise((resolve, reject) => {
      let worker: NativeReaderWorker;
      try {
        worker = createWorker();
      } catch (error) {
        reject(error);
        return;
      }
      const id = ++sequence;
      let settled = false;
      const job = { cancel: () => finish(abortError()) };
      function finish(error?: unknown, value?: NativeNotebook | NativeReaderFile) {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', job.cancel);
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
        worker.removeEventListener('messageerror', onMessageError);
        worker.terminate();
        if (active === job) active = undefined;
        if (error !== undefined) reject(error);
        else resolve(value!);
      }
      function onMessage(event: MessageEvent<NativeReaderResponse>) {
        const result = event.data;
        if (!result || result.id !== id || result.kind !== kind) return;
        if (signal?.aborted || disposed || active !== job) {
          finish(abortError());
          return;
        }
        if (result.ok === true) finish(undefined, result.value);
        else
          finish(
            new Error(
              typeof result.error === 'string'
                ? result.error
                : 'Notebook verification failed. Keep the file.',
            ),
          );
      }
      function onError(event: ErrorEvent) {
        finish(new Error(event.message || 'The notebook verification worker failed. Keep the file.'));
      }
      function onMessageError() {
        finish(new Error('The notebook verification result could not be read. Keep the file.'));
      }
      active = job;
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
      worker.addEventListener('messageerror', onMessageError);
      signal?.addEventListener('abort', job.cancel, { once: true });
      if (signal?.aborted) {
        job.cancel();
        return;
      }
      try {
        worker.postMessage({ id, kind, input });
      } catch (error) {
        finish(error);
      }
    });
  }
  return {
    readNotebook: (input: unknown, signal?: AbortSignal) =>
      read('notebook', input, signal) as Promise<NativeNotebook>,
    readFile: (text: string, signal?: AbortSignal) => read('file', text, signal) as Promise<NativeReaderFile>,
    cancel: () => active?.cancel(),
    dispose: () => {
      disposed = true;
      active?.cancel();
    },
  };
}
