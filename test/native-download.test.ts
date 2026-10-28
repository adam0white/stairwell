/** Blob encoding only. No browser, storage channel or feedback submission. */
import { afterEach, expect, test, vi } from 'vitest';
import { openBuilding } from '../src/sim/hf-game.ts';
import { nativeNotebook } from '../src/ui/native-notebook.ts';

vi.mock('@adam0white/lab-client', async (original) => ({
  ...(await original<object>()),
  createLab: () => ({}),
}));
vi.mock('@adam0white/lab-kit', () => ({ feedbackPersonaControl: vi.fn(), feedbackSharePlay: vi.fn() }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
test('the downloaded complete native notebook uses the exact compact encoding', async () => {
  vi.useFakeTimers();
  let downloaded: Blob | undefined;
  const click = vi.fn();
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    if (!(blob instanceof Blob)) throw Error('Expected complete notebook Blob');
    downloaded = blob;
    return 'blob:owned-download';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.stubGlobal('document', { createElement: () => ({ click }) });
  const notebook = nativeNotebook(openBuilding(7));
  const { downloadRun } = await import('../src/ui/lab.ts');
  downloadRun(notebook);
  expect(click).toHaveBeenCalledOnce();
  expect(downloaded).toBeDefined();
  if (!downloaded) throw Error('Missing download');
  const encoded = await downloaded.text();
  expect(encoded).toBe(JSON.stringify(notebook));
  expect(downloaded.size).toBe(Buffer.byteLength(JSON.stringify(notebook)));
  expect(JSON.parse(encoded)).toEqual(notebook);
  await vi.runAllTimersAsync();
});

test('an unopened download preserves JSON contents without legacy compaction', async () => {
  vi.useFakeTimers();
  const blobs: Blob[] = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    if (!(blob instanceof Blob)) throw Error('Expected raw Blob');
    blobs.push(blob);
    return 'blob:unopened';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.stubGlobal('document', { createElement: () => ({ click: vi.fn() }) });
  const { downloadRawRun } = await import('../src/ui/lab.ts');
  const values = [{ format: 'unknown/99', state: { original: ['kept'] } }, null, false, 0, ''];
  for (const value of values) downloadRawRun(value);
  expect(await Promise.all(blobs.map((blob) => blob.text()))).toEqual(
    values.map((value) => JSON.stringify(value)),
  );
  await vi.runAllTimersAsync();
});

test('an unopened download refuses values that JSON would change or omit', async () => {
  const create = vi.spyOn(URL, 'createObjectURL');
  const { downloadRawRun } = await import('../src/ui/lab.ts');
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  const accessor = Object.defineProperty({}, 'value', {
    enumerable: true,
    get() {
      throw Error('Getter ran');
    },
  });
  for (const value of [
    undefined,
    NaN,
    Infinity,
    -0,
    new Date(),
    new Map(),
    { omitted: undefined },
    { omitted() {} },
    [undefined],
    Array(1),
    cycle,
    accessor,
  ]) {
    expect(() => downloadRawRun(value)).toThrow();
  }
  expect(create).not.toHaveBeenCalled();
});
