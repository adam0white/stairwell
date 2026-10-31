import { replay } from '@adam0white/human-framework';
import { expect, test, vi } from 'vitest';
import { RESIDENTS, RIDS, type Rid } from '../src/sim/building-cast.ts';
import type { Place, Task } from '../src/sim/building-types.ts';
import { actBuilding, advanceBuildingMinute, buildingEngine, openBuilding } from '../src/sim/hf-game.ts';
import { admitted } from '../src/sim/hf-run.ts';
import { faceToFace } from '../src/sim/hf-view.ts';
import { nativeNotebook, restoreNativeNotebook } from '../src/ui/native-notebook.ts';
import { nativeOwnerProjection } from '../src/ui/native-owner-core.ts';
import { installNativeProjection } from '../src/ui/native-reads.ts';
import {
  journalRows,
  parcelNotices,
  parcelStatus,
  pauseNotice,
  REPLY_STORED,
  replyWording,
  speakerLabel,
  splitTip,
  spokenLine,
  tellLabel,
} from '../src/ui/plain-guidance.ts';

test('a parcel left with a neighbour cannot be collected again and is passed on once, with a complete replay', () => {
  // Ordinary play: collect the first parcel, then visit doors until someone else is home to leave it with.
  const world = openBuilding(1);
  while (!world.tasks.some((entry) => entry.kind === 'parcel' && entry.from <= world.minute))
    advanceBuildingMinute(world);
  const task = world.tasks.find((entry) => entry.kind === 'parcel') as Task;
  const pickup = task.pickup as Place;
  actBuilding(world, { kind: 'go', to: pickup });
  while (world.k.walk) advanceBuildingMinute(world);
  expect(task.carried).toBe(true);
  let holder: Rid | undefined;
  for (let round = 0; round < 40 && !holder; round++)
    for (const id of RIDS.filter((entry) => entry !== task.for)) {
      actBuilding(world, { kind: 'go', to: `door:${id}` });
      while (world.k.walk) advanceBuildingMinute(world);
      if (faceToFace(world).includes(id)) {
        holder = id;
        break;
      }
    }
  if (!holder) throw Error('Nobody was at home to leave the parcel with.');
  actBuilding(world, { kind: 'misdeliver', who: holder, task: task.id });
  expect(parcelStatus(task)).toMatchObject({ kind: 'left' });
  // Returning to the pickup place finds nothing: the parcel is with the neighbour.
  actBuilding(world, { kind: 'go', to: pickup });
  while (world.k.walk) advanceBuildingMinute(world);
  expect(world.k.at).toBe(pickup);
  expect(task.carried).toBe(false);
  // Complete native replay. The same real player commands then go to the live and the restored world.
  const restored = restoreNativeNotebook(JSON.parse(JSON.stringify(nativeNotebook(world)))).world;
  expect(buildingEngine(restored).checkpoint()).toEqual(buildingEngine(world).checkpoint());
  const restoredTask = restored.tasks.find((entry) => entry.id === task.id) as Task;
  const both = [world, restored];
  for (const command of [
    { kind: 'go', to: `door:${holder}` },
    { kind: 'go', to: pickup },
  ] as const)
    for (const each of both) {
      actBuilding(each, command);
      while (each.k.walk) advanceBuildingMinute(each);
    }
  // Arriving at the pickup place again, now on the restored world too, collects nothing.
  for (const each of both) expect(each.k.at).toBe(pickup);
  expect(task.carried).toBe(false);
  expect(restoredTask.carried).toBe(false);
  expect(buildingEngine(restored).checkpoint()).toEqual(buildingEngine(world).checkpoint());
  // The scheduled pass-on completes the parcel once, identically, with nothing carried.
  for (let i = 0; i < 75 && (task.done === undefined || restoredTask.done === undefined); i++)
    for (const each of both) advanceBuildingMinute(each);
  expect(task.done).toBeDefined();
  expect(restoredTask.done).toBe(task.done);
  expect(task.carried).toBe(false);
  expect(parcelStatus(task)).toMatchObject({ kind: 'delivered' });
  expect(buildingEngine(restored).checkpoint()).toEqual(buildingEngine(world).checkpoint());
  const complete = buildingEngine(world).checkpoint();
  expect(admitted(replay(complete.archive)).fullHash).toBe(complete.archive.hashes.full);
  console.log(
    'RT1-3 complete current HF replay/fullHash and native whole-checkpoint + identical go/advance continuation:',
    complete.archive.hashes.full,
  );
});

test('two derived parcel rows keep distinct display anchors that never equal a stored line number', () => {
  const left = (id: number, done: number): Task =>
    ({ id, kind: 'parcel', for: 'burak', wrongDoor: 'hacer', done, carried: false }) as unknown as Task;
  const stored = [10, 11, 12].map((n) => ({
    n,
    at: 100 + n,
    who: 'narrator',
    kind: 'event',
    text: `line ${n}`,
  }));
  const before = JSON.stringify(stored);
  const rows = journalRows(stored as never, parcelNotices([left(4, 105), left(9, 111)]));
  const keys = rows.map((row) => row.key);
  expect(new Set(keys).size).toBe(rows.length);
  expect(keys.filter((key) => key.startsWith('parcel:'))).toEqual(['parcel:4', 'parcel:9']);
  // The second notice resolves to itself, not the first, and stored rows keep their line numbers.
  expect(rows.find((row) => row.key === 'parcel:9')?.said.at).toBe(111);
  expect(rows.filter((row) => !row.key.startsWith('parcel:')).map((row) => row.key)).toEqual([
    '10',
    '11',
    '12',
  ]);
  expect(JSON.stringify(stored)).toBe(before);
});

vi.mock('@adam0white/lab-kit', () => ({ telemetryNotice: () => null }));
vi.mock('../src/ui/lab.ts', () => ({
  fileMode: 'native',
  lab: { captureSave: vi.fn(), setPersonaRecording: vi.fn(), trackRun: vi.fn() },
  labScreen: vi.fn(),
  downloadRun: vi.fn(),
  downloadRawRun: vi.fn(),
  gameMenu: vi.fn(),
  openFeedback: vi.fn(),
  setRunDownload: vi.fn(),
}));

test('an authentic completed reply that HF declined shows the resident’s wording in the conversation panel', async () => {
  // Real sit then real reply, completed through the host. The resident is placed at home (a fixture, as in
  // followthrough-host.test.ts). HF made the decision; nothing here sets or forces it.
  const { _debug } = await import('../src/ui/app.ts');
  const world = openBuilding(7);
  (world.residents.find((entry) => entry.id === 'sevim') as { where: string }).where = 'home';
  world.k.at = 'door:sevim';
  actBuilding(world, { kind: 'sit', who: 'sevim' });
  for (let i = 0; i < 10; i++) advanceBuildingMinute(world);
  actBuilding(world, { kind: 'reply', who: 'sevim', reply: 'thank' });
  const recorded = world.pendingReply;
  if (!recorded) throw Error('The reply was not accepted by the host.');
  // The decision HF made and recorded, before anything is shown: she chose to leave the subject.
  expect(recorded.accepted).toBe(false);
  expect(
    buildingEngine(world).active.some(
      (activity) => activity.person === 'sevim' && activity.offer.id === 'reply-stop',
    ),
  ).toBe(true);
  for (let i = 0; i < 3; i++) advanceBuildingMinute(world);
  // The host stores the outcome line only once HF has recorded both reply activities as completed.
  const stored = world.said.filter((entry) => entry.who === 'sevim').at(-1);
  expect(stored?.text).toBe(REPLY_STORED.declined);
  // The conversation panel, the actual consumer, shows her wording; the stored line is untouched.
  const html = _debug.doorHtml(world, 'sevim', ['sevim']);
  expect(html).toContain(replyWording('sevim', REPLY_STORED.declined));
  expect(html).not.toContain(`>${REPLY_STORED.declined}<`);
  expect(stored?.text).toBe(REPLY_STORED.declined);
});

test('the same resident news reads as that resident’s own claim in the conversation panel', async () => {
  const { _debug } = await import('../src/ui/app.ts');
  const shown = new Set<string>();
  for (const who of ['hacer', 'sevim', 'burak', 'derya'] as const) {
    const world = openBuilding(7);
    (world.residents.find((entry) => entry.id === who) as { where: string }).where = 'home';
    world.k.at = `door:${who}`;
    actBuilding(world, { kind: 'news', who });
    const claim = world.said
      .filter((entry) => entry.who === who)
      .find((entry) => entry.text === 'Tarık is kind.');
    if (!claim) throw Error(`${who} did not pass on the opening claim about Tarık.`);
    const html = _debug.doorHtml(world, who, [who]);
    expect(html).toContain(`${RESIDENTS[who].name} says Tarık is kind.`);
    expect(claim.text).toBe('Tarık is kind.');
    shown.add(spokenLine(who, claim.text));
  }
  expect(shown.size).toBe(4);
});

test('synthetic display data only: positive reply wording and the lines that must stay as stored', () => {
  // These strings are display inputs, not an HF-accepted branch: the host has not been made to accept anything.
  const accepted = RIDS.map((who) => replyWording(who, REPLY_STORED.accepted));
  expect(new Set(accepted).size).toBe(RIDS.length);
  expect(replyWording('kapici', REPLY_STORED.declined)).toBe(REPLY_STORED.declined);
  expect(spokenLine('sevim', 'The water will be off on Wednesday from 10:00 to 12:00.')).toBe(
    'The water will be off on Wednesday from 10:00 to 12:00.',
  );
  expect(spokenLine('tarik', 'Tarık is kind.')).toBe('Tarık is kind.');
});

test('display projections name the real cause, speaker, tip and claim without changing stored text', () => {
  expect(speakerLabel('kapici')).toBe('You (the caretaker)');
  expect(speakerLabel('hacer')).toBe('Hacer');
  expect(splitTip('Thank you. (₺5)')).toEqual({ text: 'Thank you.', tip: 5 });
  expect(splitTip('Tarık is kind.')).toEqual({ text: 'Tarık is kind.' });
  const a = tellLabel({ words: 'Tarık is kind.' }, false);
  const b = tellLabel({ words: 'The water will be off.' }, false);
  expect(new Set([a, b, tellLabel({ words: 'Tarık is kind.' }, true)]).size).toBe(3);
  expect(a.startsWith('as I heard it')).toBe(true);
  const base = { talking: false, inspecting: false, holding: false, month: false };
  expect(pauseNotice({ ...base, inspecting: true, reading: 'notebook' })).toContain('the notebook');
  expect(pauseNotice({ ...base, talking: true, who: 'hacer' })).toContain('Hacer is talking');
  expect(pauseNotice({ ...base, holding: true })).toContain('New words');
  expect(pauseNotice(base)).toBeUndefined();
});

test('a known generic claim is displayed without adding an unheard candy detail', async () => {
  const { notebookClaimTitle } = await import('../src/ui/plain-guidance.ts');
  expect(notebookClaimTitle('tarik:kind', 'Mr Tarık would give you his last lemon candy.')).toBe(
    'Tarık is said to be kind.',
  );
  expect(notebookClaimTitle('hacer:nosy', 'Hacer notices people.')).toBe('Hacer notices people.');
});

test('waiting at the recipient door is limited to an open carried parcel with its recipient out', async () => {
  const { pendingParcelAtDoor } = await import('../src/ui/plain-guidance.ts');
  const world = openBuilding(7);
  const task: Task = {
    id: 999,
    kind: 'parcel',
    for: 'burak',
    label: 'parcel',
    place: 'door:burak',
    from: 0,
    by: 999,
    carried: true,
  };
  world.k.at = 'door:burak';
  const burak = world.residents.find((entry) => entry.id === 'burak');
  if (!burak) throw Error('Missing Burak');
  burak.where = 'work';
  expect(pendingParcelAtDoor(world, task, 'door:burak')).toBe(true);
  expect(pendingParcelAtDoor(world, task, 'door:hacer')).toBe(false);
  for (const changed of [
    { ...task, done: 1 },
    { ...task, carried: false },
    { ...task, wrongDoor: 'hacer' as const },
    { ...task, custody: 'hacer' as const },
    { ...task, kind: 'shopping' as const },
    { ...task, place: 'door:hacer' as const },
    { ...task, from: world.minute + 1 },
  ])
    expect(pendingParcelAtDoor(world, changed, 'door:burak')).toBe(false);
  burak.where = 'home';
  expect(pendingParcelAtDoor(world, task, 'door:burak')).toBe(false);
});

function requiredOrderValue<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw Error('Missing control fixture.');
  return value;
}

// Bounded DOM stand-ins: only retained order buttons, action markup and scene events.
// They do not implement layout, pointer hit testing, or a general browser DOM.
class OrderElement {
  dataset: Record<string, string> = {};
  className = '';
  disabled = false;
  children: OrderElement[] = [];
  attrs = new Map<string, string>();
  listeners = new Map<string, ((event: unknown) => void)[]>();
  html = '';
  textContent = '';
  hidden = false;
  classList = {
    remove: (word: string) => {
      this.className = this.className
        .split(' ')
        .filter((x) => x !== word)
        .join(' ');
    },
    toggle: (word: string, on: boolean) => {
      this.classList.remove(word);
      if (on) this.className += ` ${word}`;
    },
  };
  set innerHTML(html: string) {
    this.html = html;
    if (html.startsWith('<button')) {
      const button = new OrderElement();
      button.dataset.t = /data-t="(\d+)"/.exec(html)?.[1] ?? '';
      button.className = /class="([^"]*)"/.exec(html)?.[1] ?? '';
      button.disabled = /\sdisabled[\s>]/.test(html);
      button.setAttribute('aria-pressed', /aria-pressed="([^"]*)"/.exec(html)?.[1] ?? '');
      button.html = html.slice(html.indexOf('>') + 1, html.lastIndexOf('</button>'));
      this.children = [button];
    }
  }
  get innerHTML() {
    return this.html;
  }
  insertAdjacentHTML(_where: string, html: string) {
    this.html += html;
  }
  get firstElementChild() {
    return this.children[0];
  }
  append(...nodes: OrderElement[]) {
    this.children.push(...nodes);
  }
  setAttribute(key: string, value: string) {
    this.attrs.set(key, value);
  }
  getAttribute(key: string) {
    return this.attrs.get(key) ?? null;
  }
  querySelector(selector: string): OrderElement | null {
    const id = /data-t="(\d+)"/.exec(selector)?.[1];
    return id ? (this.children.find((b) => b.dataset.t === id) ?? null) : null;
  }
  querySelectorAll() {
    return this.children;
  }
  addEventListener(kind: string, listener: (event: unknown) => void) {
    this.listeners.set(kind, [...(this.listeners.get(kind) ?? []), listener]);
  }
  fire(kind = 'click', event: unknown = {}) {
    for (const listener of this.listeners.get(kind) ?? []) listener(event);
  }
  closest() {
    return this;
  }
}
function orderDom() {
  const body = new OrderElement();
  const status = new OrderElement();
  vi.stubGlobal('document', {
    body,
    getElementById: () => status,
    createElement: () => new OrderElement(),
  });
  return { items: new OrderElement(), action: new OrderElement() };
}

test('retained production order handler uses the current world and pickup, then carried destination', async () => {
  const { orderRows } = await import('../src/ui/order-rows.ts');
  const { _debug } = await import('../src/ui/app.ts');
  const { items, action } = orderDom();
  try {
    _debug.clearSelection();
    const old = openBuilding(7);
    old.k.walk = { from: 'room', to: 'bakery', at0: old.minute, at1: old.minute + 10 };
    let live = old;
    const draw = () =>
      orderRows(live, items as unknown as HTMLElement, _debug.selection, _debug.choose, () => live);
    draw();
    const task = old.tasks[1] as Task;
    const button = requiredOrderValue(items.children.find((b) => b.dataset.t === String(task.id)));
    live = openBuilding(7);
    live.k.walk = null;
    draw();
    expect(items.children.find((b) => b.dataset.t === String(task.id))).toBe(button);
    button.fire();
    expect(_debug.selection).toEqual({ to: task.pickup, person: null, task: task.id });
    draw();
    installNativeProjection(live, nativeOwnerProjection(live, ['bakery', 'door:tarik', task.place]));
    _debug.tripActions(live, action as unknown as HTMLElement);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.className.split(' ')).toContain('current');
    expect(action.innerHTML).toContain('Go to the bakery');
    const currentTask = requiredOrderValue(live.tasks.find((t) => t.id === task.id));
    currentTask.carried = true;
    _debug.tripActions(live, action as unknown as HTMLElement);
    expect(_debug.selection?.to).toBe(currentTask.place);
    button.fire();
    expect(_debug.selection?.to).toBe(currentTask.place);
    expect(action.innerHTML).toContain('Go to flat 2');
  } finally {
    vi.unstubAllGlobals();
  }
});

test('same-minute production rows, map choice and preview share pressed/current selection', async () => {
  const { orderRows } = await import('../src/ui/order-rows.ts');
  const { _debug } = await import('../src/ui/app.ts');
  const { items, action } = orderDom();
  try {
    _debug.clearSelection();
    let live = openBuilding(7);
    const draw = () =>
      orderRows(live, items as unknown as HTMLElement, _debug.selection, _debug.choose, () => live);
    draw();
    const button = requiredOrderValue(items.children[1]);
    const task = requiredOrderValue(live.tasks.find((t) => t.id === Number(button.dataset.t)));
    button.fire();
    draw();
    expect(items.children.filter((b) => b.getAttribute('aria-pressed') === 'true')).toEqual([button]);
    const scene = new OrderElement();
    _debug.bindSceneChoices(scene as unknown as Element, () => live);
    live = openBuilding(7);
    live.k.walk = { from: 'room', to: 'bakery', at0: live.minute, at1: live.minute + 10 };
    const hit = new OrderElement();
    hit.setAttribute('data-go', 'door:tarik');
    const before = _debug.selection;
    scene.fire('click', { target: hit });
    expect(_debug.selection).toEqual(before);
    live.k.walk = null;
    scene.fire('keydown', { key: 'Enter', target: hit, preventDefault() {} });
    expect(_debug.selection).toEqual({ to: 'door:tarik', task: null, person: null });
    _debug.sceneChoices(live, [hit] as unknown as SVGElement[]);
    expect(hit.getAttribute('aria-pressed')).toBe('true');
    expect(hit.getAttribute('tabindex')).toBe('0');
    draw();
    expect(items.children.every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true);
    installNativeProjection(live, nativeOwnerProjection(live, ['bakery', 'door:tarik']));
    _debug.tripActions(live, action as unknown as HTMLElement);
    expect(action.innerHTML).toContain('Go to flat 7');
    expect(task.done).toBeUndefined();
  } finally {
    vi.unstubAllGlobals();
  }
});

test('same-minute actual orders sheet refreshes its retained row pressed state', async () => {
  const { _debug } = await import('../src/ui/app.ts');
  const { items } = orderDom();
  try {
    const world = openBuilding(7);
    _debug.clearSelection();
    _debug.setSheet('orders');
    const panel = new OrderElement();
    panel.dataset.directory = 'orders';
    panel.querySelector = (selector) => (selector === '.directory-items' ? items : null);
    _debug.sheet(world, panel as unknown as HTMLElement);
    const button = requiredOrderValue(items.children[1]);
    const task = requiredOrderValue(world.tasks.find((t) => t.id === Number(button.dataset.t)));
    _debug.choose(world, requiredOrderValue(task.pickup), null, task.id);
    _debug.sheet(world, panel as unknown as HTMLElement);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(items.children[0]?.getAttribute('aria-pressed')).toBe('false');
  } finally {
    _debug.setSheet('none');
    vi.unstubAllGlobals();
  }
});

test('retained production rows refuse removed, completed, future, disabled, custody and current busy choices', async () => {
  const { orderRows } = await import('../src/ui/order-rows.ts');
  const { _debug } = await import('../src/ui/app.ts');
  const { items } = orderDom();
  try {
    const original = openBuilding(7);
    const projection = nativeOwnerProjection(original, ['bakery']);
    let live = original;
    const draw = () =>
      orderRows(live, items as unknown as HTMLElement, _debug.selection, _debug.choose, () => live);
    _debug.clearSelection();
    draw();
    const button = requiredOrderValue(items.children[1]);
    const id = Number(button.dataset.t);
    const originalTask = requiredOrderValue(original.tasks.find((t) => t.id === id));
    for (const reason of [
      'removed',
      'completed',
      'future',
      'disabled',
      'walking',
      'busy',
      'busyUntil',
      'wrongDoor',
      'custody',
    ] as const) {
      live = structuredClone(original);
      installNativeProjection(live, projection);
      const task = requiredOrderValue(live.tasks.find((t) => t.id === id));
      if (reason === 'removed') live.tasks = live.tasks.filter((t) => t.id !== id);
      if (reason === 'completed') task.done = live.minute;
      if (reason === 'future') task.from = live.minute + 1;
      if (reason === 'disabled') button.disabled = true;
      if (reason === 'walking')
        live.k.walk = { from: 'room', to: 'bakery', at0: live.minute, at1: live.minute + 1 };
      if (reason === 'busy') live.k.busyTask = id;
      if (reason === 'busyUntil') live.k.busyUntil = live.minute + 1;
      if (reason === 'wrongDoor') task.wrongDoor = 'hacer';
      if (reason === 'custody') task.custody = 'hacer';
      _debug.clearSelection();
      const before = structuredClone(live);
      // Fire the installed listener even for disabled rows: guards must survive delayed dispatch.
      button.fire();
      expect(_debug.selection, reason).toBeNull();
      expect(live, reason).toEqual(before);
      if (reason === 'removed' || reason === 'completed') {
        draw();
        expect(button.disabled).toBe(true);
        expect(button.getAttribute('aria-pressed')).toBe('false');
        expect(button.className.split(' ')).not.toContain('current');
      }
      button.disabled = false;
    }
    expect(originalTask.done).toBeUndefined();
  } finally {
    vi.unstubAllGlobals();
  }
});

test('actual tripActions shows the public pending parcel and preserves other routes and negative states', async () => {
  const { _debug } = await import('../src/ui/app.ts');
  const { action } = orderDom();
  try {
    const world = openBuilding(1);
    while (!world.tasks.some((t) => t.kind === 'parcel' && t.from <= world.minute))
      advanceBuildingMinute(world);
    const parcel = requiredOrderValue(world.tasks.find((t) => t.kind === 'parcel'));
    actBuilding(world, { kind: 'go', to: requiredOrderValue(parcel.pickup) });
    while (world.k.walk) advanceBuildingMinute(world);
    actBuilding(world, { kind: 'go', to: parcel.place });
    while (world.k.walk) advanceBuildingMinute(world);
    while (world.k.busyTask !== null) advanceBuildingMinute(world);
    expect(parcel.carried).toBe(true);
    expect(parcel.done).toBeUndefined();
    expect(world.k.at).toBe(parcel.place);
    expect(world.residents.find((r) => r.id === parcel.for)?.where).not.toBe('home');
    const projection = nativeOwnerProjection(world, [
      'room',
      'bakery',
      'shop',
      'door:hacer',
      'door:burak',
      'door:tarik',
    ]);
    installNativeProjection(world, projection);
    _debug.clearSelection();
    _debug.choose(world, parcel.place, null, parcel.id);
    const checkpoint = buildingEngine(world).checkpoint();
    _debug.tripActions(world, action as unknown as HTMLElement);
    expect(action.innerHTML).toContain('You are waiting here with the parcel.');
    expect(action.innerHTML).not.toContain('data-a="go"');
    expect(action.innerHTML).toContain('Take a ten-minute break');
    expect(buildingEngine(world).checkpoint()).toEqual(checkpoint);
    // Another actual open order and an unrelated building destination retain their routes.
    const other = requiredOrderValue(
      world.tasks.find(
        (t) => t.id !== parcel.id && !t.done && t.from <= world.minute && t.place !== world.k.at,
      ),
    );
    expect(other).toBeDefined();
    _debug.choose(world, other.pickup ?? other.place, null, other.id);
    _debug.tripActions(world, action as unknown as HTMLElement);
    expect(action.innerHTML).not.toContain('You are waiting here with the parcel.');
    expect(action.innerHTML).toContain('data-a="go"');
    _debug.choose(world, 'shop');
    _debug.tripActions(world, action as unknown as HTMLElement);
    expect(action.innerHTML).toContain('Go to the corner shop');
    for (const reason of [
      'home',
      'caretaker away',
      'missing resident',
      'wrong recipient door',
      'custody',
      'wrongDoor',
      'delivered',
      'future',
      'uncarried',
      'nonparcel',
    ] as const) {
      // Detached public display fixture, derived from the authentic state above. No HF state is fabricated.
      const view = structuredClone(world);
      installNativeProjection(view, projection);
      const t = requiredOrderValue(view.tasks.find((entry) => entry.id === parcel.id));
      if (reason === 'home') requiredOrderValue(view.residents.find((r) => r.id === t.for)).where = 'home';
      if (reason === 'caretaker away') view.k.at = 'room';
      if (reason === 'missing resident') view.residents = view.residents.filter((r) => r.id !== t.for);
      if (reason === 'wrong recipient door') t.place = t.for === 'hacer' ? 'door:burak' : 'door:hacer';
      if (reason === 'custody') t.custody = 'hacer';
      if (reason === 'wrongDoor') t.wrongDoor = 'hacer';
      if (reason === 'delivered') t.done = view.minute;
      if (reason === 'future') t.from = view.minute + 1;
      if (reason === 'uncarried') t.carried = false;
      if (reason === 'nonparcel') t.kind = 'shopping';
      _debug.clearSelection();
      _debug.choose(view, t.place, null, t.id);
      const before = structuredClone(view);
      _debug.tripActions(view, action as unknown as HTMLElement);
      expect(action.innerHTML, reason).not.toContain('You are waiting here with the parcel.');
      expect(view, reason).toEqual(before);
      if (
        reason === 'home' ||
        reason === 'caretaker away' ||
        reason === 'wrong recipient door' ||
        reason === 'uncarried' ||
        reason === 'nonparcel'
      )
        expect(action.innerHTML, reason).toContain('data-a="go"');
    }
    _debug.clearSelection();
    _debug.choose(world, 'door:tarik');
    _debug.tripActions(world, action as unknown as HTMLElement);
    expect(action.innerHTML).toContain('Go to flat 7');
    expect(action.innerHTML).not.toContain('You are waiting here with the parcel.');
    for (const mode of ['walk', 'work'] as const) {
      const view = structuredClone(world);
      if (mode === 'walk')
        view.k.walk = { from: 'room', to: 'bakery', at0: view.minute, at1: view.minute + 1 };
      else view.k.busyTask = other.id;
      _debug.tripActions(view, action as unknown as HTMLElement);
      expect(action.innerHTML).toContain('travel-status');
      expect(action.innerHTML).not.toContain('data-a="go"');
      expect(action.innerHTML).not.toContain('You are waiting here with the parcel.');
    }
  } finally {
    vi.unstubAllGlobals();
  }
});

test('actual notebook gates unknown, real generic news, repeated news and private disclosure without rewriting records', async () => {
  const { _debug } = await import('../src/ui/app.ts');
  const { buildingTransaction, applyBuildingEvents } = await import('../src/sim/hf-game.ts');
  const { storySittingBuilding, trustedStoryListenerBuilding } = await import('../src/sim/hf-stories.ts');
  const { PRIVATE_FACTS, PRIVATE_SECRETS, PRIVATE_LINES } = await import('../src/sim/stories.ts');
  const { SECRET_PROPS } = await import('../src/sim/hf-view.ts');
  const world = openBuilding(7, 'stairwell@16');
  const resident = requiredOrderValue(world.residents.find((r) => r.id === 'hacer'));
  // Encounter fixture, as in the existing speech tests. HF decides which generic claims are told.
  resident.where = 'home';
  world.k.at = 'door:hacer';
  const privateTitle = requiredOrderValue(PRIVATE_SECRETS.find((p) => p.prop === PRIVATE_FACTS.hacer)).title;
  const storedTitle = requiredOrderValue(SECRET_PROPS.find((p) => p.prop === 'tarik:kind')).title;
  const render = () => {
    // Includes complete host journal/facts, HF archive and event-time phrasebook words.
    const before = buildingEngine(world).checkpoint();
    const html = _debug.notebookHtml(world);
    expect(buildingEngine(world).checkpoint()).toEqual(before);
    expect(requiredOrderValue(SECRET_PROPS.find((p) => p.prop === 'tarik:kind')).title).toBe(storedTitle);
    return html;
  };
  expect(world.secrets['tarik:kind']).toBeUndefined();
  expect(render()).not.toContain('Tarık is said to be kind.');
  expect(render()).not.toContain(privateTitle);
  actBuilding(world, { kind: 'news', who: 'hacer' });
  expect(world.said.some((line) => line.who === 'hacer' && line.text === 'Tarık is kind.')).toBe(true);
  expect(world.secrets['tarik:kind']).toBe(1);
  expect(render()).toContain('Tarık is said to be kind.');
  expect(render()).not.toContain('lemon candy');
  expect(render()).not.toContain('Hacer says Tarık');
  expect(render()).not.toContain(privateTitle);
  const facts = structuredClone(world.secrets);
  const additions = world.said.filter((line) => line.text === 'You added a new line to the notebook.').length;
  const oldJournal = structuredClone(world.said);
  actBuilding(world, { kind: 'news', who: 'hacer' });
  expect(world.secrets).toEqual(facts);
  expect(world.said.slice(0, oldJournal.length)).toEqual(oldJournal);
  expect(world.said.filter((line) => line.text === 'You added a new line to the notebook.')).toHaveLength(
    additions,
  );
  expect(render().match(/Tarık is said to be kind\./g)).toHaveLength(1);
  // Generic receipt never grants the separate private confidence. Test the actual authored gate.
  resident.sits = 3;
  expect(trustedStoryListenerBuilding(world, 'hacer')).toBe(false);
  buildingTransaction(world, (w) => storySittingBuilding(w, 'hacer'));
  expect(render()).not.toContain(privateTitle);
  for (let i = 0; i < 30 && !trustedStoryListenerBuilding(world, 'hacer'); i++)
    buildingTransaction(world, (w) =>
      applyBuildingEvents(w, [
        {
          kind: 'social.received',
          payload: {
            person: 'hacer',
            other: 'kapici',
            evidenceId: `notebook-private-gate:${i}`,
            event: { kind: 'gift', byMe: false, magnitude: 1 },
          },
        },
      ]),
    );
  expect(trustedStoryListenerBuilding(world, 'hacer')).toBe(true);
  resident.sits = 2;
  buildingTransaction(world, (w) => storySittingBuilding(w, 'hacer'));
  expect(render()).not.toContain(privateTitle);
  resident.sits = 3;
  buildingTransaction(world, (w) => storySittingBuilding(w, 'hacer'));
  expect(world.secrets[PRIVATE_FACTS.hacer]).toBe(1);
  expect(world.said.some((line) => line.who === 'hacer' && line.text === PRIVATE_LINES.hacer)).toBe(true);
  expect(render()).toContain(privateTitle);
  expect(render()).toContain('Tarık is said to be kind.');
  const complete = buildingEngine(world).checkpoint();
  render();
  render();
  expect(buildingEngine(world).checkpoint()).toEqual(complete);
});

test('retained production map handler checks the current walking/busy state on click and keyboard', async () => {
  const { _debug } = await import('../src/ui/app.ts');
  orderDom();
  try {
    _debug.clearSelection();
    let live = openBuilding(7);
    const scene = new OrderElement();
    _debug.bindSceneChoices(scene as unknown as Element, () => live);
    const hit = new OrderElement();
    hit.setAttribute('data-go', 'door:tarik');
    live = openBuilding(7);
    live.k.walk = { from: 'room', to: 'bakery', at0: live.minute, at1: live.minute + 10 };
    scene.fire('click', { target: hit });
    expect(_debug.selection).toBeNull();
    live.k.walk = null;
    live.k.busyTask = requiredOrderValue(live.tasks[0]).id;
    scene.fire('keydown', { key: 'Enter', target: hit, preventDefault() {} });
    expect(_debug.selection).toBeNull();
    live.k.busyTask = null;
    scene.fire('keydown', { key: ' ', target: hit, preventDefault() {} });
    expect(_debug.selection).toEqual({ to: 'door:tarik', person: null, task: null });
  } finally {
    vi.unstubAllGlobals();
  }
});
