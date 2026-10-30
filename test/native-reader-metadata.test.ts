/** Synthetic transport only. The installed reader, SDK and peer catalog stay real. */
import { expect, test } from 'vitest';
import { openBuilding } from '../src/sim/hf-game.ts';
import { ALLOCATION } from '../src/sim/native-cast-life.ts';
import { createNativeContinuity, type NativeGameAccess } from '../src/ui/native-cast-continuity.ts';
import { nativeNotebook } from '../src/ui/native-notebook.ts';
import { createNativeOwnerDispatcher } from '../src/ui/native-owner-core.ts';

test('invalid prepared metadata refuses before creating a game worker or recovery', async () => {
  let opens = 0;
  const game: NativeGameAccess = {
    async open(...args: Parameters<typeof openBuilding>) {
      opens++;
      return openBuilding(...args);
    },
    discard() {},
    async reopen() {
      throw Error('Metadata must refuse before reopening.');
    },
    async checkpoint() {
      throw Error('Metadata must refuse before checkpointing.');
    },
    async person() {
      throw Error('Metadata must refuse before projection.');
    },
    async notebook() {
      throw Error('Metadata must refuse before storage.');
    },
    async admit() {
      throw Error('Metadata must refuse before admission.');
    },
    async chapter() {
      throw Error('Metadata must refuse before chapter validation.');
    },
  };
  const controller = createNativeContinuity({
    current: () => undefined,
    save() {},
    recording() {},
    build: () => 'synthetic-metadata-control',
    game,
    shelf: {
      enabled: true,
      ready: Promise.resolve(true),
      setEnabled() {},
      async request<T>(): Promise<T> {
        return {
          expectedHeads: Object.fromEntries(ALLOCATION.map((c) => [c.castId, null])),
          blocked: [],
        } as T;
      },
    },
  });
  await expect(controller.arrive(7)).rejects.toThrow();
  expect(opens).toBe(0);
});

test('same-engine receipts without current authority remain read-only before any outgoing side effect', async () => {
  const world = openBuilding(7);
  const worker = createNativeOwnerDispatcher();
  worker({ kind: 'notebook', input: nativeNotebook(openBuilding(7)) });

  let requests = 0;
  const controller = createNativeContinuity({
    current: () => world,
    save() {},
    recording() {},
    build: () => 'synthetic-old-authority-control',
    shelf: {
      enabled: true,
      ready: Promise.resolve(true),
      setEnabled() {},
      async request<T>(): Promise<T> {
        requests++;
        throw Error('Old authority must refuse before transport.');
      },
    },
  });
  controller.restoreCastReceipts(world, { owned: {}, sources: {}, authored: true, fileOrigin: false });
  world.phase = 'end';
  expect(await controller.checkpointContinuity()).toEqual({ ok: true });
  expect(await controller.checkpointContinuity()).toEqual({ ok: true });
  await expect(controller.forkPerson('hacer')).rejects.toThrow(/Start a new game to share them/i);
  expect(() => worker({ kind: 'person', id: 'hacer' })).toThrow(/Start a new game to share them/i);
  expect(requests).toBe(0);
});
