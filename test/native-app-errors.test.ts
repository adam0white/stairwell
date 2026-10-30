/** DOM fault controls only. No browser, storage service or shelf is launched. */
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { openBuilding } from '../src/sim/hf-game.ts';
import { nativeNotebook } from '../src/ui/native-notebook.ts';

const io = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  recoveries: vi.fn(),
  read: vi.fn(),
  update: vi.fn(),
  validate: vi.fn(),
  mode: 'native' as 'native' | 'file',
  candidate: undefined as ReturnType<typeof openBuilding> | undefined,
  dialog: false,
  invalidate: vi.fn(),
  gate: vi.fn(),
  recoveryBusy: false,
  arrive: vi.fn(),
  AdmissionFailure: class extends Error {
    constructor(
      cause: Error,
      readonly submitted: boolean,
      readonly accepted: boolean,
      readonly recoveryKey?: string,
    ) {
      super(cause.message);
    }
  },
}));
vi.mock('@adam0white/lab-kit', () => ({ telemetryNotice: () => null }));
vi.mock('../src/ui/lab.ts', () => ({
  get fileMode() {
    return io.mode;
  },
  lab: {
    captureSave: vi.fn(),
    setPersonaRecording: vi.fn(),
    trackRun: vi.fn(),
  },
  labScreen: vi.fn(),
  downloadRun: vi.fn(),
  downloadRawRun: vi.fn(),
  gameMenu: vi.fn(),
  openFeedback: vi.fn(),
  setRunDownload: vi.fn(),
}));
vi.mock('../src/ui/native-storage.ts', async (original) => ({
  ...(await original<object>()),
  loadNativeSaved: io.load,
  saveNativeJournal: io.save,
}));
vi.mock('../src/ui/native-owner.ts', () => {
  // These controls deliberately install local, faulted host worlds. Production
  // has no local fallback; its owner protocol is exercised in native-owner.test.
  return {
    bindNativeOwner: vi.fn(),
    nativeOwner: (world: Parameters<typeof nativeNotebook>[0]) => ({
      journal: async () => ({ token: 1, world }),
      commitJournal: async () => {},
      snapshot: async (receipts: unknown) =>
        (await import('../src/ui/native-notebook.ts')).nativeNotebook(world, receipts),
      update: async (operation: unknown) => {
        await io.update(operation);
        return { world };
      },
      dispose: vi.fn(),
      promote: vi.fn(),
      disposed: false,
      export: async () => ({ complete: 'fault-control packet' }),
    }),
    createNativeOwner: () => ({
      update: async (operation: { input: unknown }) => {
        await io.read(operation.input);
        if (io.candidate) return { world: io.candidate, provenance: {} };
        throw Error('This fault control does not accept a replacement.');
      },
      dispose: vi.fn(),
      promote: vi.fn(),
      disposed: false,
    }),
  };
});
vi.mock('../src/ui/native-cast-continuity.ts', () => ({
  AdmissionFailure: io.AdmissionFailure,
  arrive: io.arrive,
  installContinuity: vi.fn(),
  invalidateContinuity: io.invalidate,
  recoveryPending: () => io.recoveryBusy,
  validateContinuity: io.validate,
  gateContinuity: io.gate,
  acknowledgeContinuity: vi.fn(),
  checkpointContinuity: vi.fn(),
  castReceipts: () => undefined,
  restoreCastReceipts: vi.fn(),
  acceptedCastRecoveries: io.recoveries,
}));
class ElementStub {
  children: ElementStub[] = [];
  id = '';
  className = '';
  private html = '';
  private selected = new Map<string, ElementStub>();
  private listeners = new Map<string, (() => unknown)[]>();
  get innerHTML() {
    return this.html;
  }
  set innerHTML(value: string) {
    this.html = value;
    this.selected.clear();
  }
  textContent = '';
  hidden = false;
  open = false;
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  attributes: Record<string, string> = {};
  constructor(readonly tag: string) {}
  append(...children: ElementStub[]) {
    this.children.push(...children);
  }
  setAttribute(name: string, value: string) {
    this.attributes[name] = value;
  }
  addEventListener(name: string, listener: () => unknown) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
  }
  click() {
    this.fire('click');
  }
  fire(event: string) {
    for (const listener of this.listeners.get(event) ?? []) listener();
  }
  querySelector(selector: string): ElementStub | null {
    const attribute = /^\[([a-z-]+)(?:="?([^"\]]+)"?)?\]$/.exec(selector);
    const present =
      attribute &&
      (attribute[2]
        ? this.innerHTML.includes(`${attribute[1]}="${attribute[2]}"`)
        : this.innerHTML.includes(attribute[1] ?? ''));
    if (
      (selector === 'input' && this.innerHTML.includes('<input')) ||
      present ||
      (selector === '.new-confirm' && this.innerHTML.includes('class="new-confirm"'))
    ) {
      if (!this.selected.has(selector)) {
        const found = new ElementStub('button');
        found.hidden = selector === '.new-confirm';
        this.selected.set(selector, found);
      }
      return this.selected.get(selector) ?? null;
    }
    return (
      this.children.find(
        (child) =>
          child.tag === selector ||
          (selector === '[data-save-status]' && Object.hasOwn(child.dataset, 'saveStatus')),
      ) ?? null
    );
  }
  querySelectorAll() {
    return [];
  }
  showModal() {
    this.open = true;
  }
  close() {
    this.open = false;
  }
  remove() {}
}
let body: ElementStub, app: ElementStub;
beforeEach(() => {
  vi.resetModules();
  io.load.mockReset();
  io.save.mockReset();
  io.recoveries.mockReset();
  io.read.mockReset();
  io.update.mockReset();
  io.validate.mockReset();
  io.mode = 'native';
  io.candidate = undefined;
  io.dialog = false;
  io.invalidate.mockReset();
  io.gate.mockReset();
  io.recoveryBusy = false;
  io.arrive.mockReset();
  body = new ElementStub('body');
  app = new ElementStub('main');
  app.id = 'app';
  body.append(app);
  vi.stubGlobal('document', {
    body,
    createElement: (name: string) => new ElementStub(name),
    getElementById: (id: string) => body.children.find((element) => element.id === id) ?? null,
    querySelectorAll: () => [],
    querySelector: () => (io.dialog ? {} : null),
    fonts: { addEventListener() {} },
    addEventListener() {},
  });
  vi.stubGlobal('window', { addEventListener() {} });
  vi.stubGlobal('navigator', {});
  vi.stubGlobal('requestAnimationFrame', vi.fn());
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
test('a failed complete worker check leaves the title and original notebook unchanged', async () => {
  const packet = nativeNotebook(openBuilding(7));
  packet.engine.world.k.money += 123;
  const before = structuredClone(packet);
  io.load.mockResolvedValue(packet);
  const { _debug } = await import('../src/ui/app.ts');
  await _debug.titlePage();
  expect(app.innerHTML).toContain('Check and continue');
  io.read.mockRejectedValue(Error('The complete replay refused the forged host state.'));
  await _debug.continueNotebook(packet);
  expect(body.children.some((element) => element.tag === 'dialog' && element.open)).toBe(true);
  expect(app.innerHTML).toContain('Check and continue');
  expect(packet).toEqual(before);
  expect(io.save).not.toHaveBeenCalled();
  expect(_debug.s).toBeNull();
});
test('a failed recovery-store read cannot prevent the primary error dialog', async () => {
  io.recoveries.mockRejectedValue(Error('IDB unavailable'));
  const { _debug } = await import('../src/ui/app.ts');
  await _debug.showLoadError(
    new io.AdmissionFailure(Error('lost reply'), true, false, 'recovery'),
    'The game could not start.',
  );
  const dialog = body.children.find((element) => element.tag === 'dialog');
  expect(dialog?.open).toBe(true);
  const words = (element: ElementStub): string => element.textContent + element.children.map(words).join(' ');
  expect(words(dialog as ElementStub)).toContain('Recovery records could not be read');
  expect(words(dialog as ElementStub)).toContain('Your saved notebook has not been replaced.');
  expect(words(dialog as ElementStub)).toContain('Back');
});
test('normal title storage failures have a visible save-status and download action', async () => {
  io.load.mockRejectedValue(Error('private technical failure'));
  const { _debug } = await import('../src/ui/app.ts');
  await _debug.titlePage();
  const status = body.children.find((element) => element.id === 'native-save-status');
  expect(status?.hidden).toBe(false);
  expect(status?.children[0]?.textContent).toBe(
    'The saved notebook could not be checked. Retry later or confirm before beginning a new game.',
  );
  expect(status?.children[1]?.textContent).toBe('Download this run');
  expect(status?.children[1]?.hidden).toBe(true);
  expect(status?.children[0]?.textContent).not.toContain('private technical');
});

test('unreadable IDB content downloads unchanged and needs explicit replacement', async () => {
  const { UnreadableNativeSaveError } = await import('../src/ui/native-storage.ts');
  const raw = { format: 'unsupported/99', state: { original: ['keep'] } };
  io.load.mockRejectedValue(new UnreadableNativeSaveError(raw, Error('Unsupported version')));
  const { _debug } = await import('../src/ui/app.ts');
  await _debug.titlePage();
  expect(app.innerHTML).toContain('Download unopened notebook');
  app.querySelector('[data-download-unopened]')?.click();
  const { downloadRawRun } = await import('../src/ui/lab.ts');
  expect(downloadRawRun).toHaveBeenCalledWith(raw);
  app.querySelector('[data-a=new]')?.click();
  expect(app.querySelector('.new-confirm')?.hidden).toBe(false);
  expect(io.arrive).not.toHaveBeenCalled();
  expect(io.save).not.toHaveBeenCalled();
});

test('an unknown saved presence needs confirmation and advertises no invented download', async () => {
  io.load.mockRejectedValue(Error('Storage get failed'));
  const { _debug } = await import('../src/ui/app.ts');
  await _debug.titlePage();
  app.querySelector('[data-a=new]')?.click();
  expect(app.querySelector('.new-confirm')?.hidden).toBe(false);
  expect(io.arrive).not.toHaveBeenCalled();
  const status = body.children.find((element) => element.id === 'native-save-status');
  expect(status?.children[1]?.hidden).toBe(true);
});

test('startup retains even a null unreadable record for download and confirmation', async () => {
  const { UnreadableNativeSaveError } = await import('../src/ui/native-storage.ts');
  io.load.mockRejectedValue(new UnreadableNativeSaveError(null, Error('Invalid envelope')));
  const { start } = await import('../src/ui/app.ts');
  await start();
  app.querySelector('[data-download-unopened]')?.click();
  const { downloadRawRun } = await import('../src/ui/lab.ts');
  expect(downloadRawRun).toHaveBeenCalledWith(null);
  app.querySelector('[data-a=new]')?.click();
  expect(io.arrive).not.toHaveBeenCalled();
});

test('a failed title read preserves the existing run and reports the failure', async () => {
  const { openBuilding: openCurrentBuilding } = await import('../src/sim/hf-game.ts');
  const world = openCurrentBuilding(7);
  world.phase = 'night'; // UI fault premise only.
  const { _debug } = await import('../src/ui/app.ts');
  await _debug.begin(world);
  const before = app.innerHTML;
  io.load.mockRejectedValue(Error('Storage read failed'));
  await _debug.titlePage();
  expect(_debug.s).toBe(world);
  expect(app.innerHTML).toBe(before);
  expect(body.children.find((element) => element.id === 'native-save-status')?.hidden).toBe(false);
});

test('a successful replacement save clears the retained unreadable copy', async () => {
  const { UnreadableNativeSaveError } = await import('../src/ui/native-storage.ts');
  io.load.mockRejectedValue(new UnreadableNativeSaveError(false, Error('Invalid envelope')));
  const { _debug } = await import('../src/ui/app.ts');
  await _debug.titlePage();
  expect(app.innerHTML).toContain('Download unopened notebook');
  const { openBuilding: openCurrentBuilding } = await import('../src/sim/hf-game.ts');
  const { nativeNotebook: currentNotebook } = await import('../src/ui/native-notebook.ts');
  const world = openCurrentBuilding(7);
  world.phase = 'night'; // UI fault premise only.
  await _debug.begin(world);
  io.load.mockResolvedValue(currentNotebook(world));
  await _debug.titlePage();
  expect(app.innerHTML).not.toContain('Download unopened notebook');
  expect(app.innerHTML).toContain('Check and continue');
});

test('a rejected raw download remains visible and never saves over the source', async () => {
  const { UnreadableNativeSaveError } = await import('../src/ui/native-storage.ts');
  io.load.mockRejectedValue(new UnreadableNativeSaveError({ original: true }, Error('Invalid envelope')));
  const { _debug } = await import('../src/ui/app.ts');
  await _debug.titlePage();
  const { downloadRawRun } = await import('../src/ui/lab.ts');
  vi.mocked(downloadRawRun).mockImplementationOnce(() => {
    throw Error('Not JSON');
  });
  app.querySelector('[data-download-unopened]')?.click();
  const status = body.children.find((element) => element.id === 'native-save-status');
  expect(status?.hidden).toBe(false);
  expect(status?.children[0]?.textContent).toContain('could not be downloaded unchanged');
  expect(io.save).not.toHaveBeenCalled();
  expect(app.innerHTML).toContain('Download unopened notebook');
});

test('a pending replacement check blocks old game actions and preserves continuity on refusal', async () => {
  const { openBuilding: openCurrentBuilding } = await import('../src/sim/hf-game.ts');
  const world = openCurrentBuilding(7);
  // A night page needs no canvas or generated day DOM in this fault-control stub.
  world.phase = 'night';
  const { _debug } = await import('../src/ui/app.ts');
  await _debug.begin(world);
  const before = structuredClone(world);
  const invalidations = io.invalidate.mock.calls.length;
  let rejectRead!: (reason: Error) => void;
  io.read.mockImplementation(
    () =>
      new Promise((_, reject) => {
        rejectRead = reject;
      }),
  );
  const { nativeNotebook: currentNotebook } = await import('../src/ui/native-notebook.ts');
  const loading = _debug.continueNotebook(currentNotebook(world));
  let actionError: unknown;
  try {
    _debug.send({ kind: 'next' });
  } catch (error) {
    actionError = error;
  }
  expect(world.minute).toBe(before.minute);
  expect(world.inputs).toEqual(before.inputs);
  expect(actionError).toBeUndefined();
  expect(world).toEqual(before);
  expect(io.invalidate).toHaveBeenCalledTimes(invalidations);
  rejectRead(Error('The replacement notebook failed complete replay.'));
  await loading;
  expect(_debug.s).toBe(world);
  expect(world).toEqual(before);
  expect(io.invalidate).toHaveBeenCalledTimes(invalidations);
  io.recoveryBusy = true;
  _debug.send({ kind: 'next' });
  expect(world).toEqual(before);
  io.recoveryBusy = false;
});

test.each(['hidden', 'dialog', 'pending load', 'replacement'] as const)(
  'an awaited clock step stops before its next mutation or old-world effects after %s',
  async (change) => {
    const { openBuilding: openCurrentBuilding } = await import('../src/sim/hf-game.ts');
    const { nativeNotebook: currentNotebook } = await import('../src/ui/native-notebook.ts');
    const world = openCurrentBuilding(7);
    world.phase = 'night';
    const { _debug } = await import('../src/ui/app.ts');
    await _debug.begin(world);
    const savesBefore = io.save.mock.calls.length;
    world.phase = 'day';
    world.k.at = 'bakery';
    world.k.busyUntil = world.minute + 100;
    let finishStep!: () => void;
    io.update.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishStep = resolve;
        }),
    );
    _debug.queueMinutes(3);
    const frame = _debug.frame(1000);
    expect(io.update).toHaveBeenCalledTimes(1);
    let loading: Promise<void> | undefined, rejectRead: ((error: Error) => void) | undefined;
    if (change === 'hidden') Object.assign(document, { hidden: true });
    if (change === 'dialog') io.dialog = true;
    if (change === 'pending load') {
      io.read.mockImplementation(
        () =>
          new Promise((_, reject) => {
            rejectRead = reject;
          }),
      );
      loading = _debug.continueNotebook(currentNotebook(world));
    }
    if (change === 'replacement') {
      const replacement = openCurrentBuilding(8);
      replacement.phase = 'night';
      await _debug.begin(replacement);
      expect(_debug.s).toBe(replacement);
    }
    finishStep();
    await frame;
    expect(io.update).toHaveBeenCalledTimes(1);
    expect(io.save).toHaveBeenCalledTimes(savesBefore + (change === 'replacement' ? 1 : 0));
    if (rejectRead) rejectRead(Error('Cancelled replacement'));
    if (loading) await loading;
  },
);

test('an unreadable accepted recovery remains offered and is checked only when opened', async () => {
  const unreadable = { original: ['keep this recovery'] };
  io.recoveries.mockResolvedValue([{ key: 'recovery', notebook: unreadable, accepted: true }]);
  const { _debug } = await import('../src/ui/app.ts');
  await _debug.showLoadError(
    new io.AdmissionFailure(Error('lost reply'), true, false, 'recovery'),
    'The game could not start.',
  );
  const labels = (element: ElementStub): string[] => [
    element.textContent,
    ...element.children.flatMap(labels),
  ];
  expect(labels(body)).toContain('Open recovered game');
  expect(io.read).not.toHaveBeenCalled();
  expect(io.save).not.toHaveBeenCalled();
  expect(unreadable).toEqual({ original: ['keep this recovery'] });
});

test('file replacement holds old actions through late source validation and releases on refusal', async () => {
  io.mode = 'file';
  const { openBuilding: openCurrentBuilding } = await import('../src/sim/hf-game.ts');
  const world = openCurrentBuilding(7);
  world.phase = 'night'; // UI fault premise only.
  const { _debug, importFileText } = await import('../src/ui/app.ts');
  await _debug.begin(world, true);
  io.candidate = openCurrentBuilding(8);
  io.candidate.phase = 'night';
  let rejectValidation!: (error: Error) => void;
  io.validate.mockImplementationOnce(
    () =>
      new Promise<void>((_resolve, reject) => {
        rejectValidation = reject;
      }),
  );
  const loading = importFileText('complete source is checked by the owner');
  const refused = expect(loading).rejects.toThrow('Source refused');
  await vi.waitFor(() => expect(rejectValidation).toBeTypeOf('function'));
  try {
    await _debug.send({ kind: 'next' });
    expect(io.update).not.toHaveBeenCalled();
    expect(_debug.s).toBe(world);
  } finally {
    rejectValidation(Error('Source refused'));
    await refused;
  }
  io.update.mockClear();
  await _debug.send({ kind: 'next' });
  expect(io.update).toHaveBeenCalledTimes(1);
  expect(_debug.s).toBe(world);
  expect(io.save).not.toHaveBeenCalled();
});

test('accepted file continuity and worker promotion commit before another selection can run', async () => {
  io.mode = 'file';
  const { openBuilding: openCurrentBuilding } = await import('../src/sim/hf-game.ts');
  const original = openCurrentBuilding(7);
  original.phase = 'night';
  const { _debug, importFileText } = await import('../src/ui/app.ts');
  await _debug.begin(original, true);
  const accepted = openCurrentBuilding(8);
  accepted.phase = 'night';
  io.candidate = accepted;
  let atNextSelection: unknown;
  io.gate.mockImplementationOnce(() => {
    queueMicrotask(() => {
      atNextSelection = _debug.s;
    });
  });
  await importFileText('complete file, checked by owner');
  expect(atNextSelection).toBe(accepted);
  expect(_debug.s).toBe(accepted);
  expect(io.save).not.toHaveBeenCalled();
});

test('native file-picker cancel prevents an already selected pending file from installing', async () => {
  io.mode = 'file';
  const { openBuilding: openCurrentBuilding } = await import('../src/sim/hf-game.ts');
  const original = openCurrentBuilding(7);
  original.phase = 'night';
  const { _debug, importFileText } = await import('../src/ui/app.ts');
  await _debug.begin(original, true);
  await _debug.titlePage();
  const candidate = openCurrentBuilding(8);
  candidate.phase = 'night';
  io.candidate = candidate;
  let finish!: () => void;
  io.validate.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const loading = importFileText('complete detached pending file');
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  const input = app.querySelector('input');
  expect(input).not.toBeNull();
  input?.fire('cancel');
  finish();
  await loading;
  expect(_debug.s).toBe(original);
  expect(io.save).not.toHaveBeenCalled();
});

test('an accepted pre-update save explains starting fresh and leaves New game reachable', async () => {
  const packet = nativeNotebook(openBuilding(7));
  const before = structuredClone(packet);
  io.load.mockResolvedValue(packet);
  io.candidate = openBuilding(7);
  const { _debug } = await import('../src/ui/app.ts');
  await _debug.titlePage();
  const message =
    'This saved game began before an update and cannot continue. Download it if you want to keep it, then start a new game.';
  io.validate.mockRejectedValueOnce(Error(message));
  await _debug.continueNotebook(packet);
  const dialog = body.children.find((element) => element.tag === 'dialog');
  const words = (element: ElementStub): string => element.textContent + element.children.map(words).join(' ');
  expect(dialog?.open).toBe(true);
  expect(words(dialog as ElementStub)).toContain(message);
  expect(words(dialog as ElementStub)).not.toContain('This game could not be checked');
  const buttons = (element: ElementStub): ElementStub[] => [element, ...element.children.flatMap(buttons)];
  buttons(dialog as ElementStub)
    .find((element) => element.textContent === 'Back')
    ?.click();
  expect(dialog?.open).toBe(false);
  expect(app.innerHTML).toContain('data-a="new"');
  app.querySelector('[data-a=new]')?.click();
  expect(app.querySelector('.new-confirm')?.hidden).toBe(false);
  expect(packet).toEqual(before);
  expect(io.save).not.toHaveBeenCalled();
});
