import { expect, test, vi } from 'vitest';
import { RESIDENTS, RIDS, type Rid } from '../src/sim/building-cast.ts';
import type { Place, Task } from '../src/sim/building-types.ts';
import { actBuilding, advanceBuildingMinute, buildingEngine, openBuilding } from '../src/sim/hf-game.ts';
import { faceToFace } from '../src/sim/hf-view.ts';
import { nativeNotebook, restoreNativeNotebook } from '../src/ui/native-notebook.ts';
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
