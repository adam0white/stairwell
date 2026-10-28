import { expect, test } from 'vitest';
import { actBuilding, advanceBuildingMinute, openBuilding } from '../src/sim/hf-game.ts';
import { nativeNotebook } from '../src/ui/native-notebook.ts';
import { createNativeOwner } from '../src/ui/native-owner.ts';
import {
  createNativeOwnerDispatcher,
  nativeOwnerProjection,
  type OwnerView,
} from '../src/ui/native-owner-core.ts';
import type { NativeReaderWorker } from '../src/ui/native-reader.ts';
import { projectedTravel, readOf } from '../src/ui/native-reads.ts';

class ControlledWorker implements NativeReaderWorker {
  listeners = new Map<string, Set<(event: any) => void>>();
  sent: any[] = [];
  terminated = 0;
  addEventListener(type: string, listener: (event: any) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }
  removeEventListener(type: string, listener: (event: any) => void) {
    this.listeners.get(type)?.delete(listener);
  }
  postMessage(value: unknown) {
    this.sent.push(value);
  }
  terminate() {
    this.terminated++;
  }
  reply(index: number, value: unknown, ok = true) {
    for (const listener of this.listeners.get('message') ?? [])
      listener({
        data: {
          id: this.sent[index].id,
          ok,
          revision: (value as any)?.revision ?? this.sent[index].operation.expectedRevision,
          value,
          error: 'Rejected game action',
        },
      });
  }
}

test('game-level dispatcher retains the actual Run across commands and complete snapshots', async () => {
  const dispatch = createNativeOwnerDispatcher();
  const opened = (await dispatch({ kind: 'open', args: [17, 'stairwell@16'] })) as OwnerView;
  const local = openBuilding(17, 'stairwell@16');
  expect(() => projectedTravel(opened.world, 'room', 'roof')).toThrow();
  await dispatch({ kind: 'act', input: { kind: 'go', to: 'bakery' } });
  actBuilding(local, { kind: 'go', to: 'bakery' });
  for (let i = 0; i < 2; i++) {
    await dispatch({ kind: 'step' });
    advanceBuildingMinute(local);
  }
  expect(await dispatch({ kind: 'snapshot' })).toEqual(nativeNotebook(local));
  const restored = createNativeOwnerDispatcher();
  await restored({ kind: 'notebook', input: await dispatch({ kind: 'snapshot' }) });
  expect(await restored({ kind: 'snapshot' })).toEqual(nativeNotebook(local));
});

test('client keeps one DTO identity and public projections, and rejects stale revisions', async () => {
  const dispatch = createNativeOwnerDispatcher(),
    worker = new ControlledWorker(),
    owner = createNativeOwner(() => worker);
  const first = owner.update({ kind: 'open', args: [7, 'stairwell@16'] });
  await Promise.resolve();
  worker.reply(0, await dispatch(worker.sent[0].operation));
  const opened = await first;
  const second = owner.update({ kind: 'step' });
  await Promise.resolve();
  worker.reply(1, await dispatch(worker.sent[1].operation));
  const stepped = await second;
  expect(stepped.world).toBe(opened.world);
  expect(projectedTravel(stepped.world, 'room', 'roof')).toBeGreaterThan(0);
  expect(readOf(stepped.world, 'hacer')).toEqual(stepped.projection.reads.hacer);
  const stale = owner.update({ kind: 'step' });
  await Promise.resolve();
  worker.reply(2, opened);
  await expect(stale).rejects.toThrow(/Stale/);
  owner.dispose();
  expect(worker.terminated).toBe(1);
});

test('discarded candidate cannot mutate active DTO or complete a late command', async () => {
  const activeWorker = new ControlledWorker(),
    candidateWorker = new ControlledWorker();
  const active = createNativeOwner(() => activeWorker),
    candidate = createNativeOwner(() => candidateWorker);
  const dispatch = createNativeOwnerDispatcher();
  const start = active.update({ kind: 'open', args: [7, 'stairwell@16'] });
  await Promise.resolve();
  activeWorker.reply(0, await dispatch(activeWorker.sent[0].operation));
  const view = await start,
    before = structuredClone(view.world);
  const pending = candidate.update({ kind: 'open', args: [8, 'stairwell@16'] });
  const cancelled = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await Promise.resolve();
  candidate.dispose();
  await cancelled;
  candidateWorker.reply(0, { world: {}, projection: {}, revision: 999 });
  expect(view.world).toEqual(before);
  expect(activeWorker.terminated).toBe(0);
  expect(candidateWorker.terminated).toBe(1);
  const bad = active.update({ kind: 'step' });
  await Promise.resolve();
  activeWorker.reply(1, undefined, false);
  await expect(bad).rejects.toThrow(/Rejected/);
  expect(view.world).toEqual(before);
  active.dispose();
});

test('malformed frames and fatal worker errors reject work and terminate once', async () => {
  for (const frame of [null, {}, { id: 1, ok: true, revision: 'wrong' }]) {
    const worker = new ControlledWorker(),
      owner = createNativeOwner(() => worker);
    const pending = owner.update({ kind: 'open', args: [7] });
    const rejected = expect(pending).rejects.toThrow(/invalid/);
    await Promise.resolve();
    for (const listener of worker.listeners.get('message') ?? []) listener({ data: frame });
    await rejected;
    expect(owner.disposed).toBe(true);
    expect(worker.terminated).toBe(1);
  }
  const worker = new ControlledWorker(),
    owner = createNativeOwner(() => worker);
  const pending = owner.snapshot();
  const rejected = expect(pending).rejects.toThrow(/failed/);
  await Promise.resolve();
  for (const listener of worker.listeners.get('error') ?? []) listener({ message: 'Worker failed' });
  await rejected;
  expect(owner.disposed).toBe(true);
  expect(worker.terminated).toBe(1);
});

test('unmatched responses cannot settle a request and snapshots follow the accepted revision', async () => {
  const worker = new ControlledWorker(),
    owner = createNativeOwner(() => worker),
    dispatch = createNativeOwnerDispatcher();
  const opening = owner.update({ kind: 'open', args: [9, 'stairwell@16'] });
  const snapshot = owner.snapshot();
  await Promise.resolve();
  for (const listener of worker.listeners.get('message') ?? [])
    listener({ data: { id: 999, ok: true, revision: 999, value: {} } });
  expect(worker.sent).toHaveLength(1);
  worker.reply(0, await dispatch(worker.sent[0].operation));
  await opening;
  await Promise.resolve();
  expect(worker.sent[1].operation.expectedRevision).toBe(1);
  worker.reply(1, await dispatch(worker.sent[1].operation));
  expect((await snapshot).seed).toBe(9);
  owner.dispose();
});

test('rejected game commands and stale expected revisions preserve the actual checkpoint', async () => {
  const dispatch = createNativeOwnerDispatcher();
  await dispatch({ kind: 'open', args: [7, 'stairwell@16'] });
  const before = await dispatch({ kind: 'snapshot' });
  expect(() => dispatch({ kind: 'act', input: { kind: 'unknown' } as any })).toThrow();
  expect(dispatch.revision()).toBe(1);
  expect(await dispatch({ kind: 'snapshot' })).toEqual(before);
  expect(() => dispatch({ kind: 'step', expectedRevision: 0 })).toThrow(/Stale/);
  expect(await dispatch({ kind: 'snapshot' })).toEqual(before);
});

test('a promoted owner rejects replacement opens without sending them to the actual Run', async () => {
  const worker = new ControlledWorker(),
    owner = createNativeOwner(() => worker),
    dispatch = createNativeOwnerDispatcher();
  const opening = owner.update({ kind: 'open', args: [7, 'stairwell@16'] });
  await Promise.resolve();
  worker.reply(0, await dispatch(worker.sent[0].operation));
  const view = await opening,
    before = structuredClone(view.world);
  owner.promote();
  await expect(owner.update({ kind: 'open', args: [8] })).rejects.toThrow(/active game/);
  expect(worker.sent).toHaveLength(1);
  expect(view.world).toEqual(before);
  owner.dispose();
});

test('post-mutation projection failure reports changed revision and fatally stops the client', async () => {
  let failProjection = false;
  const dispatch = createNativeOwnerDispatcher({
    project: (world, forecasts) => {
      if (failProjection) throw Error('Projection failed');
      return nativeOwnerProjection(world, forecasts);
    },
  });
  const worker = new ControlledWorker(),
    owner = createNativeOwner(() => worker);
  const opening = owner.update({ kind: 'open', args: [7, 'stairwell@16'] });
  await Promise.resolve();
  worker.reply(0, await dispatch(worker.sent[0].operation));
  const view = await opening,
    before = structuredClone(view.world);
  failProjection = true;
  const step = owner.update({ kind: 'step' });
  const failed = expect(step).rejects.toThrow(/changed revision/);
  await Promise.resolve();
  expect(() => dispatch(worker.sent[1].operation)).toThrow(/Projection failed/);
  expect(dispatch.revision()).toBe(2);
  for (const listener of worker.listeners.get('message') ?? [])
    listener({
      data: { id: worker.sent[1].id, ok: false, revision: dispatch.revision(), error: 'Projection failed' },
    });
  await failed;
  expect(owner.disposed).toBe(true);
  expect(view.world).toEqual(before);
  expect(worker.terminated).toBe(1);
});

test('a partially accepted Skip reports changed revision when a later minute fails', async () => {
  const dispatch = createNativeOwnerDispatcher({
    wait: (world) => {
      advanceBuildingMinute(world);
      throw Error('Later minute failed');
    },
  });
  const view = (await dispatch({ kind: 'open', args: [7, 'stairwell@16'] })) as OwnerView;
  expect(() => dispatch({ kind: 'wait', expectedRevision: 1 })).toThrow(/Later minute/);
  expect(dispatch.revision()).toBe(2);
  expect(((await dispatch({ kind: 'snapshot' })) as ReturnType<typeof nativeNotebook>).minute).toBe(
    view.world.minute + 1,
  );
});
