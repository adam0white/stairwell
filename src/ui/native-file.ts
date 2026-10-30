import type { BuildingWorld } from '../sim/hf-world.ts';
import { type NativeFileNotebook, nativeFileNotebook, restoreNativeNotebook } from './native-notebook.ts';

// The actual 4.6 month checkpoint is 59,573,010 bytes. Its notebook and two
// complete source proofs require at least 178,719,030 bytes before metadata.
// Its three full copies also contain at least 10,180,293 JSON values.
// Keep finite limits with headroom; the complete file must pass the codec.
export const NATIVE_FILE_MAX_BYTES = 256 * 1024 * 1024;
export const NATIVE_FILE_MAX_NODES = 16_000_000;
export const NATIVE_FILE_MAX_DEPTH = 64;
const invalid = (): never => {
  throw new Error('This file cannot be opened by this game version. Start fresh. Keep the file.');
};
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

type Limits = { bytes: number; nodes: number; depth: number };
const DEFAULT_LIMITS: Limits = {
  bytes: NATIVE_FILE_MAX_BYTES,
  nodes: NATIVE_FILE_MAX_NODES,
  depth: NATIVE_FILE_MAX_DEPTH,
};

function* children(value: Record<string, unknown> | unknown[]): Generator<unknown> {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return invalid();
      yield descriptor.value;
    }
    for (const key in value) {
      if (!Object.hasOwn(value, key) || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) invalid();
    }
  } else {
    for (const key in value) {
      if (!Object.hasOwn(value, key)) continue;
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') invalid();
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor)) return invalid();
      yield descriptor.value;
    }
  }
}

function checkStructure(value: unknown, limits: Limits): void {
  const stack: Iterator<unknown>[] = [[value][Symbol.iterator]()];
  let count = 0;
  while (stack.length) {
    const iterator = stack[stack.length - 1];
    if (!iterator) break;
    const next = iterator.next();
    if (next.done) {
      stack.pop();
      continue;
    }
    const v = next.value;
    if (++count > limits.nodes || stack.length - 1 > limits.depth) invalid();
    if (typeof v === 'number' && (!Number.isFinite(v) || Object.is(v, -0))) invalid();
    if (v === null || typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number') continue;
    if (typeof v !== 'object') invalid();
    const prototype = Object.getPrototypeOf(v);
    if (
      Array.isArray(v) ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null
    )
      invalid();
    if (Object.getOwnPropertySymbols(v).length) invalid();
    stack.push(children(v as Record<string, unknown>));
  }
}
function checkBytes(text: string, limits: Limits): void {
  if (text.length > limits.bytes || new TextEncoder().encode(text).byteLength > limits.bytes) invalid();
}

export function readNativeFileText(
  text: string,
  limits: Limits = DEFAULT_LIMITS,
): { world: BuildingWorld; provenance: unknown } {
  checkBytes(text, limits);
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    return invalid();
  }
  checkStructure(input, limits);
  let notebook: unknown = input;
  let provenance: unknown = {};
  if (object(input) && input.format === 'stairwell-file/4') {
    if (Object.keys(input).sort().join(',') !== 'format,notebook,provenance') return invalid();
    notebook = input.notebook;
    if (!object(input.provenance)) return invalid();
    provenance = input.provenance;
  }
  const embeddedReceipts = object(notebook) && Object.hasOwn(notebook, 'castReceipts');
  if (embeddedReceipts) {
    if (!object(provenance) || Object.hasOwn(provenance, 'nativeCast')) return invalid();
  }
  // This validates and detaches the envelope once, then performs full replay.
  // A preliminary read would retain another copy of every source proof.
  const restored = restoreNativeNotebook(notebook);
  if (Object.hasOwn(restored, 'castReceipts'))
    provenance = { ...(provenance as Record<string, unknown>), nativeCast: restored.castReceipts };
  if (object(provenance) && Object.hasOwn(provenance, 'nativeCast')) {
    if (!object(provenance.nativeCast)) return invalid();
    provenance = { ...provenance, nativeCast: { ...provenance.nativeCast, owned: {}, fileOrigin: true } };
  }
  return { world: restored.world, provenance };
}

export function exportNativeFile(
  world: BuildingWorld,
  provenance: unknown,
  receipts: unknown,
  limits: Limits = DEFAULT_LIMITS,
): NativeFileNotebook {
  if (!object(provenance) || !object(receipts)) return invalid();
  checkStructure(provenance, limits);
  checkStructure(receipts, limits);
  const flat = { ...provenance, nativeCast: { ...receipts, owned: {}, fileOrigin: true } };
  checkStructure(flat, limits);
  const file = nativeFileNotebook(world, flat);
  checkStructure(file, limits);
  checkBytes(JSON.stringify(file), limits);
  return file;
}
