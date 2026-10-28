import { readNativeFileText } from './native-file.ts';
import {
  type NativeNotebook,
  nativeNotebook,
  readNativeNotebook,
  restoreNativeNotebook,
} from './native-notebook.ts';

export type NativeReaderRequest =
  | { id: number; kind: 'notebook'; input: unknown }
  | { id: number; kind: 'file'; input: string };
export type NativeReaderFile = { notebook: NativeNotebook; provenance: unknown };
export type NativeReaderResponse =
  | { id: number; kind: 'notebook'; ok: true; value: NativeNotebook }
  | { id: number; kind: 'file'; ok: true; value: NativeReaderFile }
  | { id: number; kind: NativeReaderRequest['kind']; ok: false; error: string };

/** Runs only in the worker in the UI route. Both codecs perform complete outer replay. */
export function readNativeReaderRequest(request: NativeReaderRequest): NativeReaderResponse {
  try {
    if (request.kind === 'file') {
      const { world, provenance } = readNativeFileText(request.input);
      return {
        id: request.id,
        kind: request.kind,
        ok: true,
        value: { notebook: nativeNotebook(world), provenance },
      };
    }
    const notebook = readNativeNotebook(request.input);
    restoreNativeNotebook(notebook);
    return { id: request.id, kind: request.kind, ok: true, value: notebook };
  } catch (error) {
    return {
      id: request.id,
      kind: request.kind,
      ok: false,
      error: error instanceof Error ? error.message : 'This notebook could not be verified. Keep the file.',
    };
  }
}
