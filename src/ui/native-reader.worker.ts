import { type NativeReaderRequest, readNativeReaderRequest } from './native-reader-core.ts';

const scope = self as DedicatedWorkerGlobalScope;
scope.addEventListener('message', (event: MessageEvent<NativeReaderRequest>) => {
  scope.postMessage(readNativeReaderRequest(event.data));
});
