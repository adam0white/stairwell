import { restoreRun } from '@adam0white/human-framework';
import { expect, test } from 'vitest';
import { actBuilding, buildingEngine, openBuilding } from '../src/sim/hf-game.ts';
import { admitted } from '../src/sim/hf-run.ts';
import { nativeNotebook } from '../src/ui/native-notebook.ts';
import { readNativeReaderRequest } from '../src/ui/native-reader-core.ts';

test('worker core verifies a real ordinary-input prefix and preserves complete notebook', () => {
  const world = openBuilding(7, 'stairwell@16');
  actBuilding(world, { kind: 'go', to: 'bakery' });
  const notebook = nativeNotebook(world, {
    authored: false,
    fileOrigin: false,
    owned: {},
    sources: { original: 'retained' },
  });
  expect(readNativeReaderRequest({ id: 1, kind: 'notebook', input: notebook })).toEqual({
    id: 1,
    kind: 'notebook',
    ok: true,
    value: notebook,
  });
  expect(buildingEngine(world).checkpoint()).toEqual(notebook.engine);
});

test('worker core refuses forged host state even when its HF archive restores', () => {
  const world = openBuilding(7, 'stairwell@16');
  actBuilding(world, { kind: 'go', to: 'bakery' });
  const notebook = nativeNotebook(world);
  notebook.seed = notebook.engine.world.seed = 8;
  expect(() => admitted(restoreRun(notebook.engine.archive))).not.toThrow();
  expect(readNativeReaderRequest({ id: 2, kind: 'notebook', input: notebook })).toMatchObject({
    id: 2,
    kind: 'notebook',
    ok: false,
    error: expect.stringMatching(/Keep the file/),
  });
});

test('worker file codec preserves source and archive while stripping embedded ownership', () => {
  const world = openBuilding(7, 'stairwell@16');
  actBuilding(world, { kind: 'go', to: 'bakery' });
  const notebook = nativeNotebook(world, {
    authored: false,
    fileOrigin: false,
    owned: { hacer: 'claim' },
    sources: { full: ['history'] },
  });
  const response = readNativeReaderRequest({ id: 3, kind: 'file', input: JSON.stringify(notebook) });
  expect(response).toMatchObject({ id: 3, kind: 'file', ok: true });
  if (!response.ok || response.kind !== 'file') throw Error('Expected verified file');
  expect(response.value.notebook).toEqual(nativeNotebook(world));
  expect(response.value.provenance).toEqual({
    nativeCast: { authored: false, owned: {}, fileOrigin: true, sources: { full: ['history'] } },
  });
  expect(response.value.notebook.engine.archive).toEqual(notebook.engine.archive);
});
