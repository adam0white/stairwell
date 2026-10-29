import { expect, test } from 'vitest';
import { actBuilding, buildingEngine, openBuilding } from '../src/sim/hf-game.ts';
import { exportNativeFile, readNativeFileText } from '../src/ui/native-file.ts';
import { nativeNotebook } from '../src/ui/native-notebook.ts';

test('complete command replay round trips with detached flat provenance and no ownership', () => {
  const world = openBuilding(7, 'stairwell@16');
  actBuilding(world, { kind: 'go', to: 'bakery' });
  const before = buildingEngine(world).checkpoint();
  const provenance = {
    opaque: { text: 'source' },
    nativeCast: { owned: { x: 1 }, fileOrigin: false, sources: { x: 'proof' } },
  };
  const receipts = structuredClone(provenance.nativeCast);
  const saved = exportNativeFile(world, provenance, receipts);
  const loaded = readNativeFileText(JSON.stringify(saved));
  expect(buildingEngine(loaded.world).checkpoint()).toEqual(before);
  expect(loaded.provenance).toEqual({
    opaque: { text: 'source' },
    nativeCast: { owned: {}, fileOrigin: true, sources: { x: 'proof' } },
  });
  expect(provenance.nativeCast.owned).toEqual({ x: 1 });
  expect(receipts.owned).toEqual({ x: 1 });
  const fromNotebook = readNativeFileText(JSON.stringify(nativeNotebook(world, receipts)));
  expect(buildingEngine(fromNotebook.world).checkpoint()).toEqual(before);
  expect(fromNotebook.provenance).toEqual({
    nativeCast: { owned: {}, fileOrigin: true, sources: { x: 'proof' } },
  });
  const again = exportNativeFile(
    loaded.world,
    loaded.provenance,
    (loaded.provenance as typeof provenance).nativeCast,
  );
  expect(again).toEqual(saved);
});

test('refuses old, unsafe, oversized, deep, conflicting and tampered files', () => {
  const notebook = nativeNotebook(openBuilding(7));
  const altered = structuredClone(notebook);
  altered.seed = altered.engine.world.seed = 8;
  const conflict = {
    format: 'stairwell-file/4',
    notebook: { ...notebook, castReceipts: { sources: { a: 1 } } },
    provenance: { nativeCast: { sources: { b: 2 } } },
  };
  for (const text of [
    JSON.stringify(altered),
    JSON.stringify(conflict),
    '{"game":"stairwell@11"}',
    '{"__proto__":{}}',
    `${'['.repeat(66)}0${']'.repeat(66)}`,
  ])
    expect(() => readNativeFileText(text)).toThrow(/keep the file/i);
  expect(() => readNativeFileText(' '.repeat(101), { bytes: 100, nodes: 10, depth: 64 })).toThrow(
    /keep the file/i,
  );
  expect(() => exportNativeFile(openBuilding(7), 'opaque', {})).toThrow(/keep the file/i);
});

test('refuses primitive provenance and exported files beyond the same limits as import', () => {
  const world = openBuilding(7);
  const file = { format: 'stairwell-file/4', notebook: nativeNotebook(world), provenance: 'opaque' };
  expect(() => readNativeFileText(JSON.stringify(file))).toThrow(/keep the file/i);
  expect(() => exportNativeFile(world, {}, {}, { bytes: 100, nodes: 8_000_000, depth: 64 })).toThrow(
    /keep the file/i,
  );
  expect(() => exportNativeFile(world, {}, {}, { bytes: 128 * 1024 * 1024, nodes: 10, depth: 64 })).toThrow(
    /keep the file/i,
  );
  expect(() =>
    readNativeFileText(JSON.stringify(file), { bytes: 128 * 1024 * 1024, nodes: 10, depth: 64 }),
  ).toThrow(/keep the file/i);
});

test('refuses provenance that JSON would silently discard or alter', () => {
  const world = openBuilding(7);
  for (const provenance of [
    { opaque: new Map() },
    { opaque: undefined },
    { opaque: new Date() },
    { opaque: () => 1 },
  ])
    expect(() => exportNativeFile(world, provenance, {})).toThrow(/keep the file/i);
});

test('older host checkpoints refuse with the entire original file preserved', () => {
  const notebook = nativeNotebook(openBuilding(7));
  const original = notebook as unknown as { engine: { world: Record<string, unknown> } };
  delete original.engine.world.pendingWork;
  delete original.engine.world.pendingReply;
  const text = JSON.stringify(notebook);
  expect(() => readNativeFileText(text)).toThrow(/keep the file/i);
  expect(JSON.stringify(notebook)).toBe(text);
});
