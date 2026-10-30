import { loadIndexedDirect, UnreadableNativeSaveError } from './native-storage.ts';

const scope = self as DedicatedWorkerGlobalScope;
scope.onmessage = async () => {
  try {
    scope.postMessage({ ok: true, value: await loadIndexedDirect() });
  } catch (error) {
    scope.postMessage({
      ok: false,
      unreadable: error instanceof UnreadableNativeSaveError,
      value: error instanceof UnreadableNativeSaveError ? error.raw : undefined,
      error: error instanceof Error ? error.message : 'Native save could not be read.',
    });
  }
};
