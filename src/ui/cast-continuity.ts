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
import { act, canReplay, GAME_VERSION, type GameState, newGame, personOf, replay } from '../sim/game.ts';
import { WORK_START_VERSION } from '../sim/month.ts';
import { RESIDENTS, RIDS, type Rid } from '../sim/people.ts';
import { lab } from './lab.ts';

// Keep the boundary independent of Lab construction and native-route test doubles.
const fileParameters =
  typeof location === 'undefined' ? [] : new URLSearchParams(location.search).getAll('file');
const fileMode = fileParameters.length === 0 ? 'native' : 'file';
export const shelf = fileMode === 'file' ? null : personaChannel();
function nativeShelf(): ReturnType<typeof personaChannel> {
  if (fileMode === 'file' || !shelf)
    throw new Error('Saved-file play cannot change shared character history. Download this run.');
  return shelf;
}
function requireNative(): void {
  nativeShelf();
}
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
function refuseWorkTransfer(edition: string): void {
  if (edition === WORK_START_VERSION)
    throw new Error(
      'Character transfer is not available for this work option yet. Download a copy of your game, or start without earlier character history.',
    );
}
const source = (edition = GAME_VERSION) => {
  refuseWorkTransfer(edition);
  const build = lab.build().c ?? 'development';
  const rules = edition.split('@')[1];
  if (rules === undefined) throw new Error('The character chapter has no rules edition.');
  return {
    game: 'stairwell',
    build,
    engine: '2.23.0',
    rules,
  };
};
const errorText = (e: unknown) =>
  e instanceof Error ? e.message : 'Character history is unavailable. Download a copy of your game.';
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
  if (g.version === WORK_START_VERSION && raw?.owned && Object.keys(raw.owned).length)
    refuseWorkTransfer(g.version);
  r.fileOrigin = file || raw?.fileOrigin === true;
  r.authored = !r.fileOrigin && !g.castChapter?.inputs.length;
  r.sources = raw?.sources && typeof raw.sources === 'object' ? structuredClone(raw.sources) : {};
  if (!file && fileMode !== 'file') r.rawOwned = raw?.owned;
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
  if (fileMode === 'file') throw new Error('Saved-file play cannot write recovery history.');
  if (typeof localStorage === 'undefined') return;
  const keys = JSON.parse(localStorage.getItem(recoveryIndex) ?? '[]') as string[];
  if (!keys.includes(key) && keys.length >= 8)
    throw new Error(
      'The local recovery archive is full. Download the accepted recovery chapters before saving more character progress.',
    );
  const text = JSON.stringify({ accepted, notebook });
  if (new TextEncoder().encode(text).length > 2 * 1024 * 1024)
    throw new Error(
      'The recovery chapter is larger than the local storage limit. Download a copy of this game.',
    );
  localStorage.setItem(key, text);
  if (!keys.includes(key)) localStorage.setItem(recoveryIndex, JSON.stringify([...keys, key]));
}
export function acceptedCastRecoveries(): Recovery[] {
  if (fileMode === 'file') return [];
  if (typeof localStorage === 'undefined') return [];
  try {
    const keys = JSON.parse(localStorage.getItem(recoveryIndex) ?? '[]') as string[];
    return keys.slice(0, 8).flatMap((key) => {
      const value = JSON.parse(localStorage.getItem(key) ?? 'null');
      return value?.accepted === true && canReplay(value.notebook?.game)
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
  window.addEventListener('storage', (e) => {
    if (e.key === null || e.key === 'hf-persona-opt-in') changed();
  });
}
function requireCurrent(serial: number) {
  if (serial !== generation) throw new Error('The game or player identity changed. Choose again.');
}
/** Distinguish a refused preparation from a submitted claim with a lost reply. */
export class AdmissionFailure extends Error {
  constructor(
    cause: unknown,
    readonly submitted: boolean,
    readonly accepted: boolean,
    readonly recoveryKey?: string,
  ) {
    super(cause instanceof Error ? cause.message : 'History could not be checked.', { cause });
    this.name = 'AdmissionFailure';
  }
}
export async function arrive(seed: number, fresh = false, edition = GAME_VERSION): Promise<GameState> {
  requireNative();
  const serial = generation;
  lab.setPersonaRecording('pending-cast-group');
  lab.allowPersonaRecording(false);
  if (edition === WORK_START_VERSION) {
    if (!fresh && nativeShelf().enabled) refuseWorkTransfer(edition);
    return newGame(seed, edition);
  }
  await nativeShelf().ready;
  requireCurrent(serial);
  if (fresh || !nativeShelf().enabled) return newGame(seed, edition);
  const opening = newGame(seed, edition);
  let draftInputs: CastChapter['inputs'] = [];
  let draftInitial: CastChapter['initial'] = {};
  const recoveryKey = `stairwell-cast-recovery:${seed}:admission`;
  let submitted = false;
  let accepted = false;
  const transport: ReturnType<typeof personaChannel> = {
    ...nativeShelf(),
    request: async <T>(request: Parameters<ReturnType<typeof personaChannel>['request']>[0]): Promise<T> => {
      if (request.action !== 'putBatch') return nativeShelf().request<T>(request);
      const chapter: CastChapter = {
        version: 'stairwell-cast/1',
        inputs: structuredClone(draftInputs),
        initial: structuredClone(draftInitial),
        claims: request.envelopes ?? [],
        expectedHeads: request.expectedHeads ?? {},
      };
      const draft = newGame(seed, edition, chapter);
      const owned = Object.fromEntries(chapter.claims.map((h) => [h.castId, h]));
      const notebook = recoveryNotebook(draft, owned);
      persistRecovery(recoveryKey, notebook, false);
      submitted = true;
      const result = await nativeShelf().request<T>(request);
      accepted = true;
      persistRecovery(recoveryKey, notebook, true);
      return result;
    },
  };
  const prepared = await claimCastChapterBatch(
    transport,
    ALLOCATION.map((c) => c.castId),
    source(edition),
    async (inputs) => {
      const initial: CastChapter['initial'] = {};
      for (const input of inputs) {
        const id = roleFor(input.parent.castId);
        const target = personOf(opening, id);
        if (target.activity)
          throw new Error(
            `${RESIDENTS[id].name} has an opening work duty. Continue from a supported earlier save, or start a new game in this browser.`,
          );
        initial[id] = snapshot(admitCast(input, target));
      }
      draftInputs = structuredClone(inputs);
      draftInitial = structuredClone(initial);
      return initial;
    },
    { isCurrent: () => serial === generation },
  ).catch((cause) => {
    throw new AdmissionFailure(cause, submitted, accepted, recoveryKey);
  });
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
  const g = newGame(seed, edition, chapter);
  const r = runtime(g);
  r.owned = Object.fromEntries(chapter.claims.map((h) => [h.castId, h]));
  r.authored = chapter.inputs.length === 0;
  return g;
}
export async function validateContinuity(g: GameState): Promise<void> {
  if (g.version === WORK_START_VERSION) {
    if (g.castChapter || (runtime(g).rawOwned && Object.keys(runtime(g).rawOwned as object).length))
      refuseWorkTransfer(g.version);
    return;
  }
  const header = g.castChapter;
  if (header) {
    if (
      header.version !== 'stairwell-cast/1' ||
      header.inputs.length > 8 ||
      header.claims.length !== header.inputs.length ||
      new Set(header.inputs.map((i) => i.parent.castId)).size !== header.inputs.length
    )
      throw new Error('The saved chapter has an invalid record of its character histories.');
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
      throw new Error(
        'There is a mismatch between the character histories saved with this chapter and the histories it expects.',
      );
    const opening = newGame(g.seed, g.version);
    for (const input of header.inputs) {
      await validatePersona(input.parent);
      const id = roleFor(input.parent.castId);
      const target = personOf(opening, id);
      // A replay validates the admitted narration choice, not today's fresh-game default.
      const savedLexicon = header.initial[id]?.lexicon;
      if (savedLexicon) target.lexicon = structuredClone(savedLexicon);
      else delete target.lexicon;
      const expected = admitCast(input, target);
      if (canonicalPersona(snapshot(expected)) !== canonicalPersona(header.initial[id]))
        throw new Error(
          'The character at the start of this chapter does not match the earlier state saved with it.',
        );
      const claim = header.claims.find((h) => h.castId === input.parent.castId);
      if (!claim) throw new Error('The record of this game accepting the character is missing.');
      await validatePersona(claim);
      if (
        claim.parentRevision !== input.parent.revision ||
        claim.branchId !== input.parent.branchId ||
        claim.source.game !== 'stairwell' ||
        claim.source.rules !== g.version.split('@')[1] ||
        claim.source.engine !== '2.23.0' ||
        canonicalPersona(claim.transfer.life) !== canonicalPersona(input.life)
      )
        throw new Error(
          'There is a mismatch in the record that links this game to its starting character history.',
        );
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
        head.source.rules !== g.version.split('@')[1] ||
        head.source.engine !== '2.23.0'
      )
        throw new Error('The saved record of this game’s control of the character history is invalid.');
      const claim = header?.claims.find((h) => h.castId === id);
      if (claim && head.branchId !== claim.branchId)
        throw new Error('The saved character history does not match this chapter.');
      r.owned[id] = head;
    }
  delete r.rawOwned;
}
export async function gateContinuity(g: GameState | undefined, file = false): Promise<void> {
  if (!g) return;
  const r = runtime(g);
  if (file || fileMode === 'file') {
    r.fileOrigin = true;
    r.authored = false;
    r.owned = {};
    r.localChoice = undefined;
  }
  lab.setPersonaRecording(recordingKey(r));
  lab.allowPersonaRecording(true);
}
export async function chooseContinuityRecording(_value: boolean): Promise<void> {
  await gateContinuity(current());
}
export function acknowledgeContinuity(_g: GameState): void {
  /* Receipt is saved with the current local notebook. */
}
async function checkpoint(g: GameState, id: Rid, fork = false) {
  requireNative();
  refuseWorkTransfer(g.version);
  const serial = generation;
  const r = runtime(g);
  const castId = RESIDENTS[id].castId;
  const old = r.owned[castId];
  const actual = personOf(g, id);
  if (r.fileOrigin && !fork)
    throw new Error(
      'An imported file does not give this game control of the shared character history. Download a copy of your game or create a separate history from this pause.',
    );
  if (!actual.body.alive || actual.body.health <= 0) {
    if (!old) throw new Error('This game does not control a character history it can close.');
    const closed = await closePersonaBranch(old, source(g.version), actual.now);
    requireCurrent(serial);
    const recoveryKey = `stairwell-cast-recovery:${old.branchId}:${id}`;
    const notebook = recoveryNotebook(
      g,
      { ...r.owned, [castId]: closed },
      { ...r.sources, [id]: snapshot(actual) },
    );
    persistRecovery(recoveryKey, notebook, false);
    await nativeShelf().request({ action: 'put', envelope: closed });
    persistRecovery(recoveryKey, notebook, true);
    requireCurrent(serial);
    if (current() !== g) return;
    r.owned[castId] = closed;
    store();
    return;
  }
  if (g.castPauses?.[id] !== 'paused' || actual.activity)
    throw new Error(
      `${RESIDENTS[id].name} has not reached a pause in the game. Close the menu and continue until their duties are complete.`,
    );
  const captured = snapshot(actual);
  const projected = await sourceTransfer(
    captured,
    id === 'burak'
      ? [
          'The building account and the money owed to the supplier remain at Lale Apartmanı. The game cannot transfer the account book.',
        ]
      : id === 'tarik'
        ? ['The earlier building fees and private repayment agreement remain unpaid.']
        : [],
  );
  requireCurrent(serial);
  if (
    !fork &&
    old &&
    (old.transfer.checkpoint as { sha256?: string } | undefined)?.sha256 ===
      projected.transfer.checkpoint.sha256
  ) {
    await nativeShelf().request({ action: 'put', envelope: old });
    requireCurrent(serial);
    status = 'The accepted character save is still active and has not changed.';
    return;
  }
  if (current() !== g || canonicalPersona(snapshot(personOf(g, id))) !== canonicalPersona(captured))
    throw new Error('The character changed while the game was saving them. Pause again.');
  if (new TextEncoder().encode(JSON.stringify({ ...r.sources, [id]: projected.raw })).length > 1024 * 1024)
    throw new Error(
      'The local archive of earlier character states is full. Download a copy of your game before saving more character progress.',
    );
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
    source: source(g.version),
    transfer: { ...projected.transfer, life },
    limitations: projected.transfer.person.person.limitations,
  });
  requireCurrent(serial);
  const canAuthor = r.authored && !g.castChapter?.inputs.length && !fork && !old;
  requireCurrent(serial);
  if (current() !== g) return;
  const recoveryKey = `stairwell-cast-recovery:${branchId}:${id}`;
  const notebook = recoveryNotebook(
    g,
    { ...r.owned, [castId]: envelope },
    { ...r.sources, [id]: projected.raw },
  );
  persistRecovery(recoveryKey, notebook, false);
  await nativeShelf().request({
    action: 'put',
    envelope,
    fork,
    authored: canAuthor,
  });
  persistRecovery(recoveryKey, notebook, true);
  requireCurrent(serial);
  if (current() !== g) return;
  r.owned[castId] = envelope;
  r.localChoice = undefined;
  r.sources[id] = projected.raw;
  store();
  status = `The saved progress for ${RESIDENTS[id].name} in this chapter was accepted.`;
  await gateContinuity(g);
}
export function checkpointContinuity(): Promise<void> {
  if (fileMode === 'file') return Promise.resolve();
  const g = current();
  if (!g || !nativeShelf().enabled) return Promise.resolve();
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
  if (fileMode !== 'file') watchPersonaCheckpoint(checkpointContinuity);
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
  if (fileMode === 'file') {
    const section = document.createElement('section');
    section.textContent =
      'This file keeps earlier character histories as provenance. Shared history controls are unavailable. Download this run to keep progress.';
    return section;
  }
  const section = document.createElement('section');
  section.className = 'sw-cast-controls';
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = nativeShelf().enabled;
  const label = document.createElement('label');
  label.append(toggle, 'Keep fictional characters between games in this browser');
  section.append(label);
  toggle.addEventListener('change', () => {
    requireNative();
    invalidateContinuity();
    nativeShelf().setEnabled(toggle.checked);
    const g = current();
    if (g) void gateContinuity(g);
  });
  const line = document.createElement('p');
  line.dataset.castStatus = '';
  line.textContent =
    status ||
    'A new chapter checks all five characters together. A loaded chapter keeps the character histories saved with it. Unsupported histories cannot continue. You can still start a new game without earlier character history.';
  section.append(line);
  const link = document.createElement('a');
  link.href = 'https://human.adamwhite.work/lab/people/';
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = 'View, download or delete your characters';
  section.append(link);
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Character whose progress you want to save');
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
    button('Pause the selected character after their duties', () => {
      const g = current();
      if (!g) return;
      act(g, { kind: 'cast-pause', who: selected });
      store();
      line.textContent =
        g.castPauses?.[selected] === 'requested'
          ? 'Close the menu and continue playing. The character must still finish their work and sleep.'
          : g.castPauses?.[selected] === 'paused'
            ? 'This character has reached the pause in the game.'
            : (g.said.at(-1)?.text ?? 'The game cannot pause this chapter during this duty.');
    }),
  );
  section.append(
    button('Save the selected character’s progress', async () => {
      const g = current();
      if (!g) return;
      if (!nativeShelf().enabled)
        throw new Error('Turn on character history in this browser first, or download a copy of your game.');
      await checkpoint(g, selected);
      line.textContent = status;
    }),
  );
  section.append(
    button('Create a separate character history from this pause', async () => {
      const g = current();
      if (!g) return;
      if (!nativeShelf().enabled) throw new Error('Turn on character history in this browser first.');
      await checkpoint(g, selected, true);
      line.textContent = status;
    }),
  );
  section.append(
    button('Download the selected character’s file', () => {
      const g = current();
      if (!g) return;
      const envelope =
        runtime(g).owned[RESIDENTS[selected].castId] ??
        g.castChapter?.claims.find((h) => h.castId === RESIDENTS[selected].castId);
      if (!envelope)
        throw new Error('No character save has been accepted yet. Download a copy of your game instead.');
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
  for (const recovery of acceptedCastRecoveries()) {
    section.append(
      button('Resume an accepted chapter saved for recovery', async () => {
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
      button('Download this accepted recovery file', () => {
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
      button('Remove this recovery copy after downloading it', () => {
        const keys = JSON.parse(localStorage.getItem(recoveryIndex) ?? '[]') as string[];
        localStorage.removeItem(recovery.key);
        localStorage.setItem(recoveryIndex, JSON.stringify(keys.filter((key) => key !== recovery.key)));
        line.textContent =
          'This recovery copy was removed from this browser. Your current notebook, shared character history and downloaded file have not changed.';
      }),
    );
  }
  return section;
}
