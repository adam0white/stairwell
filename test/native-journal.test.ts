import { exportRun, restoreRunJournal } from '@adam0white/human-framework';
import { expect, test } from 'vitest';
import { advanceBuildingMinute, buildingEngine, openBuilding } from '../src/sim/hf-game.ts';

test('journal chunks restore the complete run and reject reordered or changed history', () => {
  const world = openBuilding(7);
  const engine = buildingEngine(world);
  const first = engine.exportJournal();
  advanceBuildingMinute(world);
  const second = engine.exportJournal(first.cursor);
  expect(first.opening).toBeDefined();
  expect(second.chunk).not.toBeNull();
  const chunks = [first.chunk, second.chunk].filter((chunk) => chunk !== null);
  const archive = { opening: first.opening!, chunks, head: second.head };
  const restored = restoreRunJournal(archive);
  expect(restored.ok).toBe(true);
  if (restored.ok) expect(exportRun(restored.value.run)).toEqual(engine.checkpoint().archive);
  expect(restoreRunJournal({ ...archive, chunks: [...chunks].reverse() }).ok).toBe(false);
  expect(
    restoreRunJournal({
      ...archive,
      head: { ...archive.head, ordinal: archive.head.ordinal + 1 },
    }).ok,
  ).toBe(false);
});

test('IndexedDB commits chunks with the matching host snapshot and rejects a stale predecessor', async () => {
  const fake = await import('fake-indexeddb');
  Object.assign(globalThis, {
    indexedDB: fake.indexedDB,
    IDBKeyRange: fake.IDBKeyRange,
  });
  const { saveNativeJournal, loadNativeSaved, clearNativeSaved } = await import(
    '../src/ui/native-storage.ts'
  );
  const { createNativeOwnerDispatcher } = await import('../src/ui/native-owner-core.ts');
  const dispatch = createNativeOwnerDispatcher({
    project: () => ({}) as never,
  });
  dispatch({ kind: 'open', args: [7] });
  const first = dispatch({
    kind: 'journal',
  }) as import('../src/ui/native-notebook.ts').NativeJournalSnapshot;
  await saveNativeJournal(first);
  dispatch({ kind: 'journal-commit', token: first.token });
  dispatch({ kind: 'step' });
  const second = dispatch({
    kind: 'journal',
  }) as import('../src/ui/native-notebook.ts').NativeJournalSnapshot;
  const invalid = structuredClone(second);
  invalid.journal.head.ordinal++;
  await expect(saveNativeJournal(invalid)).rejects.toThrow();
  expect((await loadNativeSaved())?.minute).toBe(first.world.minute);
  await saveNativeJournal(second);
  dispatch({ kind: 'journal-commit', token: second.token });
  dispatch({ kind: 'journal-commit', token: second.token });
  const loaded = await loadNativeSaved();
  expect(loaded?.minute).toBe(second.world.minute);
  expect(loaded?.engine.archive).toEqual(
    (
      dispatch({
        kind: 'checkpoint',
      }) as import('../src/sim/hf-run.ts').BuildingCheckpoint<unknown>
    ).archive,
  );
  const reopened = createNativeOwnerDispatcher({
    project: () => ({}) as never,
  });
  reopened({ kind: 'notebook', input: loaded });
  dispatch({ kind: 'step' });
  reopened({ kind: 'step' });
  expect(reopened({ kind: 'checkpoint' })).toEqual(dispatch({ kind: 'checkpoint' }));
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('stairwell-native-notebook', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('notebook', 'readwrite');
    tx.objectStore('notebook').delete(`journal:${second.journal.head.digest}`);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  await expect(loadNativeSaved()).rejects.toThrow(/cannot be opened/i);
  db.close();
  await clearNativeSaved();
});
