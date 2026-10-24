/** Browser-owned whole-cast receipts, outside deterministic simulation. Loaded actors never read latest shelf. */
import { snapshot } from '@adam0white/human-framework';
import {
  anchorPersonaLife,
  canonicalPersona,
  claimCastChapterBatch,
  closePersonaBranch,
  createPersona,
  initialPersonaLife,
  type PersonaEnvelope,
  type PersonaLife,
  personaChannel,
  validatePersona,
  watchPersonaCheckpoint,
} from '@adam0white/lab-client';
import { ALLOCATION, admitCast, type CastChapter, roleFor, sourceTransfer } from '../sim/cast-life.ts';
import { act, GAME_VERSION, type GameState, newGame, personOf, replay } from '../sim/game.ts';
import { RESIDENTS, RIDS, type Rid } from '../sim/people.ts';
import { lab } from './lab.ts';
export const shelf = personaChannel();
export interface CastReceipts {
  owned: Record<string, PersonaEnvelope>;
  fileOrigin: boolean;
  authored: boolean;
  sources: Partial<Record<Rid, unknown>>;
}
interface Runtime extends CastReceipts {
  localChoice?: boolean;
  rawOwned?: unknown;
  recordingKey?: string;
}
const runtimes = new WeakMap<GameState, Runtime>();
const runtime = (g: GameState): Runtime => {
  let r = runtimes.get(g);
  if (!r) {
    r = { owned: {}, fileOrigin: false, authored: !g.castChapter?.inputs.length, sources: {} };
    runtimes.set(g, r);
  }
  return r;
};
let generation = 0;
let current: () => GameState | undefined = () => undefined;
let store: () => void = () => {};
let resumeGame: ((g: GameState) => Promise<void>) | undefined;
let selected: Rid = 'hacer';
let status = '';
let pending = Promise.resolve();
const source = () => ({
  game: 'stairwell',
  build: lab.build().c ?? 'development',
  engine: '2.17.0',
  rules: '7',
});
const history = (g: GameState) => {
  const heads = Object.fromEntries((g.castChapter?.claims ?? []).map((h) => [h.castId, h]));
  Object.assign(heads, runtime(g).owned);
  return ALLOCATION.flatMap((c) => (heads[c.castId] ? [heads[c.castId]!] : []));
};
const pin = (g: GameState) =>
  history(g)
    .map((h) => h.revision)
    .join('/');
const errorText = (e: unknown) =>
  e instanceof Error ? e.message : 'Continuity unavailable. Keep a local export.';
function recordingKey(r: Runtime): string {
  if (!r.recordingKey) r.recordingKey = `stairwell-group:${crypto.randomUUID()}`;
  return r.recordingKey;
}
export function castReceipts(g: GameState): CastReceipts {
  const r = runtime(g);
  return structuredClone({
    owned: r.owned,
    fileOrigin: r.fileOrigin,
    authored: r.authored,
    sources: r.sources,
  });
}
/** Only a trusted local save may restore accepted ownership; file origin survives local reload. */
export function restoreCastReceipts(g: GameState, value: unknown, file = false): void {
  const r = runtime(g);
  const raw = value as Partial<CastReceipts> | undefined;
  r.fileOrigin = file || raw?.fileOrigin === true;
  r.authored = !r.fileOrigin && !g.castChapter?.inputs.length;
  r.sources = raw?.sources && typeof raw.sources === 'object' ? structuredClone(raw.sources) : {};
  if (!file) r.rawOwned = raw?.owned;
  r.owned = {};
}
interface RecoveryNotebook {
  game: string;
  seed: number;
  inputs: GameState['inputs'];
  minute: number;
  oneCast?: GameState['oneCast'];
  castChapter?: CastChapter;
  castReceipts: CastReceipts;
}
interface Recovery {
  key: string;
  notebook: RecoveryNotebook;
}
const recoveryIndex = 'stairwell-cast-recovery-index';
function recoveryNotebook(
  g: GameState,
  owned: Record<string, PersonaEnvelope>,
  sources = runtime(g).sources,
): RecoveryNotebook {
  return structuredClone({
    game: g.version,
    seed: g.seed,
    inputs: g.inputs,
    minute: g.minute,
    oneCast: g.oneCast,
    castChapter: g.castChapter,
    castReceipts: { ...castReceipts(g), owned, sources },
  });
}
function persistRecovery(key: string, notebook: RecoveryNotebook, accepted: boolean) {
  if (typeof localStorage === 'undefined') return;
  const keys = JSON.parse(localStorage.getItem(recoveryIndex) ?? '[]') as string[];
  if (!keys.includes(key) && keys.length >= 8)
    throw new Error(
      'Local recovery archive is full. Export accepted recovery chapters before more checkpoints.',
    );
  const text = JSON.stringify({ accepted, notebook });
  if (new TextEncoder().encode(text).length > 2 * 1024 * 1024)
    throw new Error('Recovery chapter exceeds the local bound. Keep a run export.');
  localStorage.setItem(key, text);
  if (!keys.includes(key)) localStorage.setItem(recoveryIndex, JSON.stringify([...keys, key]));
}
export function acceptedCastRecoveries(): Recovery[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const keys = JSON.parse(localStorage.getItem(recoveryIndex) ?? '[]') as string[];
    return keys.slice(0, 8).flatMap((key) => {
      const value = JSON.parse(localStorage.getItem(key) ?? 'null');
      return value?.accepted === true && value.notebook?.game === GAME_VERSION
        ? [{ key, notebook: value.notebook }]
        : [];
    });
  } catch {
    return [];
  }
}
export function invalidateContinuity(): void {
  generation++;
  const g = current();
  if (g) runtime(g).localChoice = undefined;
  lab.setPersonaRecording('pending-cast-group');
  lab.allowPersonaRecording(false);
}
if (typeof window !== 'undefined') {
  const changed = () => {
    const g = current();
    invalidateContinuity();
    if (g) void gateContinuity(g).catch(() => {});
  };
  window.addEventListener('hf-lab-preference', changed);
  window.addEventListener('storage', (e) => {
    if (
      e.key === null ||
      ['hf-lab-player', 'hf-lab-recording-off', 'hf-lab-events-off:stairwell', 'hf-persona-opt-in'].includes(
        e.key,
      )
    )
      changed();
  });
}
function requireCurrent(serial: number) {
  if (serial !== generation) throw new Error('Run or identity changed. Choose again.');
}
export async function arrive(seed: number, fresh = false): Promise<GameState> {
  const serial = generation;
  lab.setPersonaRecording('pending-cast-group');
  lab.allowPersonaRecording(false);
  await shelf.ready;
  requireCurrent(serial);
  if (fresh || !shelf.enabled) return newGame(seed);
  const opening = newGame(seed);
  let draftInputs: CastChapter['inputs'] = [];
  let draftInitial: CastChapter['initial'] = {};
  const recoveryKey = `stairwell-cast-recovery:${seed}:admission`;
  const transport: typeof shelf = {
    ...shelf,
    request: async <T>(request: Parameters<typeof shelf.request>[0]): Promise<T> => {
      if (request.action !== 'putBatch') return shelf.request<T>(request);
      const chapter: CastChapter = {
        version: 'stairwell-cast/1',
        inputs: structuredClone(draftInputs),
        initial: structuredClone(draftInitial),
        claims: request.envelopes ?? [],
        expectedHeads: request.expectedHeads ?? {},
      };
      const draft = newGame(seed, GAME_VERSION, chapter);
      const owned = Object.fromEntries(chapter.claims.map((h) => [h.castId, h]));
      const notebook = recoveryNotebook(draft, owned);
      persistRecovery(recoveryKey, notebook, false);
      const result = await shelf.request<T>(request);
      persistRecovery(recoveryKey, notebook, true);
      return result;
    },
  };
  const prepared = await claimCastChapterBatch(
    transport,
    ALLOCATION.map((c) => c.castId),
    source(),
    async (inputs) => {
      const initial: CastChapter['initial'] = {};
      for (const input of inputs) {
        const id = roleFor(input.parent.castId);
        const target = personOf(opening, id);
        if (target.activity)
          throw new Error(
            `${RESIDENTS[id].name} has a real opening work duty. Use a supported source-bound return or play fresh locally.`,
          );
        initial[id] = snapshot(admitCast(input, target));
      }
      draftInputs = structuredClone(inputs);
      draftInitial = structuredClone(initial);
      return initial;
    },
    { isCurrent: () => serial === generation },
  );
  requireCurrent(serial);
  const chapter: CastChapter = {
    version: 'stairwell-cast/1',
    expectedHeads: Object.fromEntries(
      ALLOCATION.map((c) => [
        c.castId,
        prepared?.inputs.find((i) => i.parent.castId === c.castId)?.parent.revision ?? null,
      ]),
    ),
    inputs: prepared?.inputs ?? [],
    initial: prepared?.initial ?? {},
    claims: prepared?.claims ?? [],
  };
  const g = newGame(seed, GAME_VERSION, chapter);
  const r = runtime(g);
  r.owned = Object.fromEntries(chapter.claims.map((h) => [h.castId, h]));
  r.authored = chapter.inputs.length === 0;
  return g;
}
export async function validateContinuity(g: GameState): Promise<void> {
  const header = g.castChapter;
  if (header) {
    if (
      header.version !== 'stairwell-cast/1' ||
      header.inputs.length > 8 ||
      header.claims.length !== header.inputs.length ||
      new Set(header.inputs.map((i) => i.parent.castId)).size !== header.inputs.length
    )
      throw new Error('Invalid whole-cast replay header.');
    const expected = Object.fromEntries(
      ALLOCATION.map((c) => [
        c.castId,
        header.inputs.find((i) => i.parent.castId === c.castId)?.parent.revision ?? null,
      ]),
    );
    if (
      canonicalPersona(expected) !== canonicalPersona(header.expectedHeads) ||
      Object.keys(header.initial).length !== header.inputs.length
    )
      throw new Error('Cast collection or expected absence pin mismatch.');
    const opening = newGame(g.seed);
    for (const input of header.inputs) {
      await validatePersona(input.parent);
      const id = roleFor(input.parent.castId);
      const target = personOf(opening, id);
      const expected = admitCast(input, target);
      if (canonicalPersona(snapshot(expected)) !== canonicalPersona(header.initial[id]))
        throw new Error('Initial admitted person differs from pinned source.');
      const claim = header.claims.find((h) => h.castId === input.parent.castId);
      if (!claim) throw new Error('Missing initial claim.');
      await validatePersona(claim);
      if (
        claim.parentRevision !== input.parent.revision ||
        claim.branchId !== input.parent.branchId ||
        claim.source.game !== 'stairwell' ||
        claim.source.rules !== '7' ||
        canonicalPersona(claim.transfer.life) !== canonicalPersona(input.life)
      )
        throw new Error('Initial claim binding mismatch.');
    }
  }
  const r = runtime(g);
  if (r.rawOwned && typeof r.rawOwned === 'object')
    for (const [id, raw] of Object.entries(r.rawOwned)) {
      const head = await validatePersona(raw);
      roleFor(id);
      if (
        head.castId !== id ||
        head.castRevision !== RESIDENTS[roleFor(id)].castRevision ||
        head.source.game !== 'stairwell' ||
        head.source.rules !== '7'
      )
        throw new Error('Invalid saved ownership receipt.');
      const claim = header?.claims.find((h) => h.castId === id);
      if (claim && head.branchId !== claim.branchId)
        throw new Error('Saved branch differs from this chapter.');
      r.owned[id] = head;
    }
  delete r.rawOwned;
}
export async function gateContinuity(g: GameState | undefined, file = false): Promise<void> {
  const serial = generation;
  if (!g) {
    lab.setPersonaRecording('pending-cast-group');
    lab.allowPersonaRecording(false);
    return;
  }
  const r = runtime(g);
  if (file) {
    r.fileOrigin = true;
    r.authored = false;
    r.owned = {};
    r.localChoice = undefined;
  }
  const heads = history(g);
  const captured = pin(g);
  if (!r.fileOrigin && r.authored && heads.length === 0) {
    lab.setPersonaRecording(null);
    return;
  }
  lab.setPersonaRecording(recordingKey(r));
  lab.allowPersonaRecording(false);
  if (r.fileOrigin) {
    if (r.localChoice === true && Object.keys(r.owned).length) lab.allowPersonaRecording(true);
    return;
  }
  if (r.localChoice === false) return;
  await shelf.ready;
  if (serial !== generation || pin(g) !== captured) return;
  if (!heads.length) return;
  try {
    const result = await shelf.request<{
      sameEpoch: boolean;
      revisions: string[];
      recordingEpoch: string | null;
    }>({ action: 'recordingBatch', envelopes: heads });
    if (
      serial === generation &&
      pin(g) === captured &&
      result.revisions.join('/') === captured &&
      result.sameEpoch
    )
      lab.allowPersonaRecording(true);
  } catch {
    /* Remain gated on unavailable bridge or incomplete permission. */
  }
}
export async function chooseContinuityRecording(value: boolean): Promise<void> {
  const g = current();
  if (!g) return;
  const serial = ++generation;
  const r = runtime(g);
  r.localChoice = undefined;
  const heads = history(g);
  const captured = pin(g);
  lab.setPersonaRecording(recordingKey(r));
  lab.allowPersonaRecording(false);
  await shelf.ready;
  requireCurrent(serial);
  if (current() !== g || pin(g) !== captured) return;
  if (value && r.fileOrigin && !Object.keys(r.owned).length)
    throw new Error(
      'Keep this file local until an explicit played pause creates its first alternate shelf head.',
    );
  if (heads.length && (!r.fileOrigin || Object.keys(r.owned).length)) {
    const epoch = await shelf.request<{ revisions: string[]; recordingEpoch: string | null }>({
      action: 'recordingBatch',
      envelopes: heads,
    });
    requireCurrent(serial);
    if (current() !== g || pin(g) !== captured || epoch.revisions.join('/') !== captured)
      throw new Error('Pinned group changed. Choose again.');
    await shelf.request({
      action: 'recordingBatch',
      envelopes: heads,
      allowRecording: value,
      recordingEpoch: epoch.recordingEpoch ?? undefined,
    });
    requireCurrent(serial);
  }
  if (current() !== g || pin(g) !== captured) return;
  r.localChoice = value;
  lab.allowPersonaRecording(value);
  store();
}
export function acknowledgeContinuity(_g: GameState): void {
  /* Receipt is saved with the current local notebook. */
}
async function checkpoint(g: GameState, id: Rid, fork = false) {
  const serial = generation;
  const r = runtime(g);
  const castId = RESIDENTS[id].castId;
  const old = r.owned[castId];
  const actual = personOf(g, id);
  if (r.fileOrigin && !fork)
    throw new Error(
      'Imported file receipts do not grant ownership. Keep a local export or explicitly fork this played pause.',
    );
  if (!actual.body.alive || actual.body.health <= 0) {
    if (!old) throw new Error('No owned branch to close.');
    const closed = await closePersonaBranch(old, source(), actual.now);
    requireCurrent(serial);
    const recoveryKey = `stairwell-cast-recovery:${old.branchId}:${id}`;
    const notebook = recoveryNotebook(
      g,
      { ...r.owned, [castId]: closed },
      { ...r.sources, [id]: snapshot(actual) },
    );
    persistRecovery(recoveryKey, notebook, false);
    await shelf.request({ action: 'put', envelope: closed });
    persistRecovery(recoveryKey, notebook, true);
    requireCurrent(serial);
    if (current() !== g) return;
    r.owned[castId] = closed;
    store();
    return;
  }
  if (g.castPauses?.[id] !== 'paused' || actual.activity)
    throw new Error(
      `${RESIDENTS[id].name} has not reached a played pause. Close the menu and continue through actual duties.`,
    );
  const captured = snapshot(actual);
  const projected = await sourceTransfer(
    captured,
    id === 'burak'
      ? [
          'The source building account and supplier balance remain at Lale Apartmanı. No ledger handover is implemented.',
        ]
      : id === 'tarik'
        ? ['The source dues and private repayment arrangement are not discharged.']
        : [],
  );
  requireCurrent(serial);
  if (
    !fork &&
    old &&
    (old.transfer.checkpoint as { sha256?: string } | undefined)?.sha256 ===
      projected.transfer.checkpoint.sha256
  ) {
    await shelf.request({ action: 'put', envelope: old });
    requireCurrent(serial);
    status = 'The unchanged accepted checkpoint is still active.';
    return;
  }
  if (current() !== g || canonicalPersona(snapshot(personOf(g, id))) !== canonicalPersona(captured))
    throw new Error('Person changed during capture. Pause again.');
  if (new TextEncoder().encode(JSON.stringify({ ...r.sources, [id]: projected.raw })).length > 1024 * 1024)
    throw new Error('Full local source archive is full. Keep a run export before another checkpoint.');
  const branchId = fork ? crypto.randomUUID() : (old?.branchId ?? crypto.randomUUID());
  const life =
    old?.transfer.life && !fork
      ? anchorPersonaLife(old.transfer.life as PersonaLife, castId, Date.now())
      : initialPersonaLife(castId, branchId, Date.now());
  const envelope = await createPersona({
    format: 'hf-persona/1',
    castId,
    castRevision: RESIDENTS[id].castRevision,
    branchId,
    parentRevision: fork ? null : (old?.revision ?? null),
    source: source(),
    transfer: { ...projected.transfer, life },
    limitations: projected.transfer.person.person.limitations,
  });
  requireCurrent(serial);
  const canAuthor = r.authored && !g.castChapter?.inputs.length && !fork && !old;
  const epoch = canAuthor
    ? await shelf.request<{ recordingEpoch: string | null }>({ action: 'recordingBatch', envelopes: [] })
    : null;
  requireCurrent(serial);
  if (current() !== g) return;
  const recoveryKey = `stairwell-cast-recovery:${branchId}:${id}`;
  const notebook = recoveryNotebook(
    g,
    { ...r.owned, [castId]: envelope },
    { ...r.sources, [id]: projected.raw },
  );
  persistRecovery(recoveryKey, notebook, false);
  await shelf.request({
    action: 'put',
    envelope,
    fork,
    authored: canAuthor,
    recordingEpoch: epoch?.recordingEpoch ?? undefined,
  });
  persistRecovery(recoveryKey, notebook, true);
  requireCurrent(serial);
  if (current() !== g) return;
  r.owned[castId] = envelope;
  r.localChoice = undefined;
  r.sources[id] = projected.raw;
  store();
  status = `${RESIDENTS[id].name}: accepted played chapter checkpoint.`;
  await gateContinuity(g);
}
export function checkpointContinuity(): Promise<void> {
  const g = current();
  if (!g || !shelf.enabled) return Promise.resolve();
  const task = pending
    .catch(() => {})
    .then(async () => {
      if (current() !== g) return;
      for (const id of RIDS)
        if (
          g.castPauses?.[id] === 'paused' ||
          !personOf(g, id).body.alive ||
          personOf(g, id).body.health <= 0
        ) {
          try {
            await checkpoint(g, id);
          } catch (e) {
            status = errorText(e);
          }
        }
    });
  pending = task;
  return task;
}
export function installContinuity(
  getGame: () => GameState | undefined,
  save: () => void,
  load?: (g: GameState) => Promise<void>,
): void {
  current = getGame;
  store = save;
  resumeGame = load;
  watchPersonaCheckpoint(checkpointContinuity);
}
function button(label: string, run: () => void | Promise<void>) {
  const b = document.createElement('button');
  b.textContent = label;
  b.type = 'button';
  b.addEventListener('click', () => {
    void Promise.resolve(run()).catch((e) => {
      status = errorText(e);
      const line = b.closest('section')?.querySelector('[data-cast-status]');
      if (line) line.textContent = status;
    });
  });
  return b;
}
export function continuityPanel(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'sw-cast-controls';
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = shelf.enabled;
  const label = document.createElement('label');
  label.append(toggle, 'Keep fictional people between games in this browser');
  section.append(label);
  toggle.addEventListener('change', () => {
    invalidateContinuity();
    shelf.setEnabled(toggle.checked);
    const g = current();
    if (g) void gateContinuity(g);
  });
  const line = document.createElement('p');
  line.dataset.castStatus = '';
  line.textContent =
    status ||
    'Fresh chapters consider all five people together. Loaded chapters keep their pinned people. Unsupported histories refuse; local fresh play remains available.';
  section.append(line);
  const link = document.createElement('a');
  link.href = 'https://human.adamwhite.work/lab/people/';
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = 'Inspect, download or delete your people';
  section.append(link);
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Person for chapter checkpoint');
  for (const id of RIDS) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = RESIDENTS[id].name;
    select.append(opt);
  }
  select.value = selected;
  select.addEventListener('change', () => {
    selected = select.value as Rid;
    invalidateContinuity();
    const g = current();
    if (g) void gateContinuity(g);
  });
  section.append(select);
  section.append(
    button('Pause selected person after actual duties', () => {
      const g = current();
      if (!g) return;
      act(g, { kind: 'cast-pause', who: selected });
      store();
      line.textContent = 'Close the menu and continue play. Work and sleep boundaries still apply.';
    }),
  );
  section.append(
    button('Save selected person checkpoint', async () => {
      const g = current();
      if (!g) return;
      if (!shelf.enabled) throw new Error('Enable browser continuity first, or keep a local run export.');
      await checkpoint(g, selected);
      line.textContent = status;
    }),
  );
  section.append(
    button('Begin an explicit alternate branch from this played pause', async () => {
      const g = current();
      if (!g) return;
      if (!shelf.enabled) throw new Error('Enable browser continuity first.');
      await checkpoint(g, selected, true);
      line.textContent = status;
    }),
  );
  section.append(
    button('Keep selected person file', () => {
      const g = current();
      if (!g) return;
      const envelope =
        runtime(g).owned[RESIDENTS[selected].castId] ??
        g.castChapter?.claims.find((h) => h.castId === RESIDENTS[selected].castId);
      if (!envelope) throw new Error('No accepted person checkpoint yet. Keep a run export instead.');
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = `stairwell-${selected}-person.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }),
  );
  const privacy = document.createElement('p');
  privacy.textContent =
    'Recording linked histories is a separate choice for this complete pinned group. No keeps all play and exports local.';
  section.append(privacy);
  section.append(
    button('Allow recording all these linked histories', async () => {
      await chooseContinuityRecording(true);
      line.textContent = 'Recording choice accepted for this pinned group and current identity.';
    }),
  );
  section.append(
    button('Keep these linked histories local', async () => {
      await chooseContinuityRecording(false);
      line.textContent = 'These histories remain local.';
    }),
  );
  for (const recovery of acceptedCastRecoveries()) {
    section.append(
      button('Resume an accepted saved cast chapter', async () => {
        if (!resumeGame) throw new Error('Open this chapter from the game menu.');
        const saved = recovery.notebook;
        const g = replay(
          saved.seed,
          saved.inputs,
          saved.minute,
          saved.game,
          saved.oneCast?.admission,
          saved.castChapter,
        );
        if (saved.oneCast) g.oneCast = structuredClone(saved.oneCast);
        restoreCastReceipts(g, saved.castReceipts, false);
        await resumeGame(g);
      }),
    );
    section.append(
      button('Keep this accepted recovery file', () => {
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(recovery.notebook, null, 2)], { type: 'application/json' }),
        );
        const link = document.createElement('a');
        link.href = url;
        link.download = 'stairwell-recovery.json';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }),
    );
    section.append(
      button('Remove this recovery copy after keeping an export', () => {
        const keys = JSON.parse(localStorage.getItem(recoveryIndex) ?? '[]') as string[];
        localStorage.removeItem(recovery.key);
        localStorage.setItem(recoveryIndex, JSON.stringify(keys.filter((key) => key !== recovery.key)));
        line.textContent =
          'This local recovery copy was removed. The current notebook, source shelf and exported file were not changed.';
      }),
    );
  }
  return section;
}
