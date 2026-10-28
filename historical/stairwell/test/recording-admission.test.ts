import { afterEach, expect, it, vi } from 'vitest';

const control = vi.hoisted(() => ({ ready: Promise.resolve(true) }));
vi.mock('@adam0white/lab-client', async (original) => ({
  ...(await original<typeof import('@adam0white/lab-client')>()),
  personaChannel: () => ({
    get ready() {
      return control.ready;
    },
    enabled: false,
    setEnabled() {},
    request: vi.fn(),
  }),
  watchPersonaCheckpoint: () => () => {},
}));
vi.mock('../src/ui/lab.ts', () => ({
  lab: { build: () => ({ c: 'test' }), setPersonaRecording() {}, allowPersonaRecording() {} },
}));
afterEach(() => vi.unstubAllGlobals());
it('does not cancel a pending stairwell start for a recording identity acknowledgment', async () => {
  vi.stubGlobal('window', new EventTarget());
  let release!: (value: boolean) => void;
  control.ready = new Promise<boolean>((resolve) => {
    release = resolve;
  });
  const { arrive } = await import('../src/ui/cast-continuity.ts');
  const pending = arrive(42, true);
  window.dispatchEvent(new Event('hf-lab-preference'));
  const storage = new Event('storage');
  Object.defineProperty(storage, 'key', { value: 'hf-lab-player' });
  window.dispatchEvent(storage);
  release(true);
  await expect(pending).resolves.toHaveProperty('seed', 42);
});
