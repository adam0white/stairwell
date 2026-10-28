import { expect, test } from 'vitest';
import { createNativeReader, type NativeReaderWorker } from '../src/ui/native-reader.ts';

class ControlledWorker implements NativeReaderWorker {
  listeners = new Map<string, Set<(event: any) => void>>();
  sent: any[] = [];
  terminated = 0;
  failPost = false;
  addEventListener(type: string, listener: (event: any) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)?.add(listener);
  }
  removeEventListener(type: string, listener: (event: any) => void) {
    this.listeners.get(type)?.delete(listener);
  }
  postMessage(value: unknown) {
    if (this.failPost) throw new DOMException('Cannot clone', 'DataCloneError');
    this.sent.push(value);
  }
  terminate() {
    this.terminated++;
  }
  emit(type: string, event: unknown) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }
  reply(value: unknown) {
    this.emit('message', { data: { ...this.sent[0], ok: true, value } });
  }
}

function setup() {
  const workers: ControlledWorker[] = [];
  const reader = createNativeReader({
    createWorker: () => {
      const worker = new ControlledWorker();
      workers.push(worker);
      return worker;
    },
  });
  return { reader, workers };
}

// Omitting ID/kind checks, termination, or abort cleanup makes these controls fail.
test('creates workers lazily and accepts only the active request ID and kind', async () => {
  const { reader, workers } = setup();
  expect(workers).toHaveLength(0);
  const pending = reader.readNotebook({});
  const worker = workers[0]!;
  const request = worker.sent[0];
  worker.emit('message', { data: { ...request, id: request.id + 1, ok: true, value: 'wrong' } });
  worker.emit('message', { data: { ...request, kind: 'file', ok: true, value: 'wrong' } });
  worker.reply('verified');
  await expect(pending).resolves.toBe('verified');
  expect(worker.terminated).toBe(1);
  expect([...worker.listeners.values()].every((set) => set.size === 0)).toBe(true);
});

test('preaborted, superseded, cancelled and disposed jobs cannot complete later', async () => {
  const { reader, workers } = setup();
  const aborted = new AbortController();
  aborted.abort();
  await expect(reader.readNotebook({}, aborted.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(workers).toHaveLength(0);
  const first = reader.readNotebook({});
  const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
  const second = reader.readFile('{}');
  await rejected;
  workers[0]!.reply('stale');
  const secondRejected = expect(second).rejects.toMatchObject({ name: 'AbortError' });
  reader.cancel();
  await secondRejected;
  const third = reader.readNotebook({});
  const thirdRejected = expect(third).rejects.toMatchObject({ name: 'AbortError' });
  reader.dispose();
  await thirdRejected;
  await expect(reader.readNotebook({})).rejects.toThrow(/disposed/i);
  expect(workers.every((worker) => worker.terminated === 1)).toBe(true);
});

test('signal abort terminates exact worker and removes listeners', async () => {
  const { reader, workers } = setup();
  const controller = new AbortController();
  const pending = reader.readNotebook({}, controller.signal);
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort();
  await rejected;
  workers[0]!.reply('stale');
  expect(workers[0]!.terminated).toBe(1);
});

test.each(['error', 'messageerror', 'postMessage', 'response'])(
  'rejects worker %s failure and releases the worker',
  async (kind) => {
    const worker = new ControlledWorker();
    if (kind === 'postMessage') worker.failPost = true;
    const reader = createNativeReader({ createWorker: () => worker });
    const pending = reader.readNotebook({});
    const rejected = expect(pending).rejects.toThrow();
    if (kind === 'response')
      worker.emit('message', { data: { ...worker.sent[0], ok: false, error: 'Rejected' } });
    else if (kind !== 'postMessage') worker.emit(kind, { message: 'Worker failed' });
    await rejected;
    expect(worker.terminated).toBe(1);
    expect([...worker.listeners.values()].every((set) => set.size === 0)).toBe(true);
  },
);

test('rejects worker construction failure without a replay fallback', async () => {
  const unavailable = createNativeReader({
    createWorker: () => {
      throw new Error('Worker unavailable');
    },
  });
  await expect(unavailable.readNotebook({})).rejects.toThrow(/unavailable/);
});
