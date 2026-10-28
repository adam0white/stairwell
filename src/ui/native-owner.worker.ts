import { createNativeOwnerDispatcher, type OwnerOperation } from './native-owner-core.ts';

const dispatch = createNativeOwnerDispatcher();
const scope = self as DedicatedWorkerGlobalScope;
let pending = Promise.resolve();
scope.addEventListener('message', (event: MessageEvent<{ id: number; operation: OwnerOperation }>) => {
  const { id, operation } = event.data;
  pending = pending.then(async () => {
    try {
      const value = await dispatch(operation);
      scope.postMessage({ id, ok: true, revision: dispatch.revision(), value });
    } catch (error) {
      scope.postMessage({
        id,
        ok: false,
        revision: dispatch.revision(),
        error: error instanceof Error ? error.message : 'Game operation failed.',
      });
    }
  });
});
