import { PEOPLE_ACROSS_GAMES } from '@adam0white/lab-kit';
/**
 * The Stairwell UI: a page from the kapıcı's notebook. Plain DOM, no framework. The shared native Run owns people.
 * This file reads public projections and queues host inputs. IndexedDB stores complete checkpoints at save boundaries.
 */

import { type phoneStage, telemetryNotice } from '@adam0white/lab-kit';
import { RESIDENTS, RIDS, type Rid } from '../sim/building-cast.ts';
import { decodeBuildingWorld } from '../sim/building-decode.ts';
import { canReplyBuilding } from '../sim/hf-player-actions.ts';
import type { BuildingCheckpoint } from '../sim/hf-run.ts';
import {
  canStartWork,
  clockOf,
  dayLabel,
  dayName,
  dayOf,
  dayStart,
  faceToFace,
  floorOf,
  type GameState,
  INVENTABLE,
  legsLine,
  MONTH_VERSION,
  type NewInput,
  nameOf,
  openTasks,
  type Place,
  placeName,
  readOf,
  rOf,
  type Said,
  SECRET_PROPS,
  type Task,
  TOP_FLOOR,
  tellables,
  WORK_START_VERSION,
  wordHint,
} from '../sim/hf-view.ts';
import { PRIVATE_WORK } from '../sim/month.ts';
import { PRIVATE_FACTS, PRIVATE_SECRETS, STORY_SECRETS } from '../sim/stories.ts';
import {
  downloadRawRun,
  downloadRun,
  fileMode,
  gameMenu,
  lab,
  labScreen,
  openFeedback,
  setRunDownload,
} from './lab.ts';
import type { NativeGameAccess } from './native-cast-continuity.ts';
import {
  AdmissionFailure,
  acceptedCastRecoveries,
  acknowledgeContinuity,
  arrive,
  castReceipts,
  checkpointContinuity,
  chooseContinuityRecording,
  continuityPanel,
  gateContinuity,
  installContinuity,
  invalidateContinuity,
  type PublicationResult,
  recoveryPending,
  restoreCastReceipts,
  validateContinuity,
} from './native-cast-continuity.ts';
import { NATIVE_FILE_MAX_BYTES } from './native-file.ts';
import type { NativeNotebook } from './native-notebook.ts';
import { bindNativeOwner, createNativeOwner, type NativeOwner, nativeOwner } from './native-owner.ts';
import type { OwnerOperation } from './native-owner-core.ts';
import {
  projectedBins as binsWarning,
  hasNativeForecast,
  projectedTravel as travelMinutes,
} from './native-reads.ts';
import { createNativeSaveCoordinator } from './native-save-coordinator.ts';
import {
  clearNativeSaved,
  LegacyNativeSaveError,
  loadNativeSaved,
  saveNativeSaved,
  UnreadableNativeSaveError,
} from './native-storage.ts';
import { canWait, playback } from './playback.ts';

const candidates = new Set<NativeOwner>();
let activeOwner: NativeOwner | undefined;
const reader = {
  cancel() {
    for (const candidate of candidates) candidate.dispose();
    candidates.clear();
  },
};
async function ownerCandidate(operation: OwnerOperation) {
  const owner = createNativeOwner();
  candidates.add(owner);
  try {
    const view = await owner.update(operation);
    if (owner.disposed) throw new DOMException('The game was discarded.', 'AbortError');
    bindNativeOwner(view.world, owner);
    return view;
  } catch (error) {
    candidates.delete(owner);
    owner.dispose();
    throw error;
  }
}
function discardCandidate(world: GameState) {
  const owner = nativeOwner(world);
  if (owner === activeOwner) return;
  candidates.delete(owner);
  owner.dispose();
}
function promoteOwner(world: GameState) {
  const owner = nativeOwner(world);
  const previous = activeOwner;
  owner.promote();
  activeOwner = owner;
  gameStopped = false;
  candidates.delete(owner);
  if (previous !== owner) previous?.dispose();
}
const gameAccess: NativeGameAccess = {
  open: async (...args) => (await ownerCandidate({ kind: 'open', args })).world,
  reopen: async (world, ...args) => {
    const owner = nativeOwner(world);
    if (owner === activeOwner) throw Error('An active game cannot be reopened as a candidate.');
    return (await owner.update({ kind: 'open', args })).world;
  },
  checkpoint: (world) => nativeOwner(world).request<BuildingCheckpoint<GameState>>({ kind: 'checkpoint' }),
  person: (world, id) => nativeOwner(world).person(id),
  notebook: (world, receipts) => nativeOwner(world).snapshot(receipts),
  discard: discardCandidate,
  admit: (world, input, edition) => nativeOwner(world).request({ kind: 'admit', input, edition }),
  chapter: (world, value) => nativeOwner(world).request({ kind: 'chapter', value }),
};
let gameBusy = false;
let gameStopped = false;
async function mutate(world: GameState, operation: OwnerOperation) {
  if (gameBusy) return false;
  gameBusy = true;
  try {
    await nativeOwner(world).update({ ...operation, forecasts: selection ? [selection.to] : [] });
    return ui.s === world;
  } finally {
    gameBusy = false;
  }
}
const completeSnapshots = new WeakMap<GameState, unknown>();
async function latestRun(world = ui.s): Promise<unknown> {
  if (!world) return undefined;
  const packet =
    fileMode === 'file'
      ? await nativeOwner(world).export(originalProvenance, castReceipts(world))
      : await nativeOwner(world).snapshot(castReceipts(world));
  completeSnapshots.set(world, packet);
  return packet;
}
async function downloadLatest(world = ui.s) {
  try {
    const packet = world ? await latestRun(world) : cachedSaved;
    if (packet) downloadRun(packet);
    else if (unreadableSaved) downloadRawRun(unreadableSaved.value);
  } catch (error) {
    showDownloadFailure(error);
  }
}
let readingNotebook = false;
let readerSequence = 0;
let stage: ReturnType<typeof phoneStage> | null = null;

let selectedSpeed: number | null = null;
let infoOpen = false;
let selection: { to: Place; person: Rid | null; task: number | null } | null = null;
const journalResizes = new WeakMap<HTMLElement, ResizeObserver>();
const journalPositions = new WeakMap<
  HTMLElement,
  { position: ReturnType<typeof journalPosition>; top: number }
>();

interface Ui {
  s: GameState | null;
  sheet: 'none' | 'tell' | 'invent' | 'notebook' | 'place' | 'orders' | 'residents';
  inventAbout: Rid | null;
  sheetFor: Rid | null;
  acc: number;
  last: number;
  pendingTo: Place | null;
  pendingPerson: Rid | null;
  lastKey: string;
  sheetKey: string;
  dismissed: string;
  grudgeSaid: Set<string>;
  readUntil: number;
}

const ui: Ui = {
  s: null,
  sheet: 'none',
  inventAbout: null,
  sheetFor: null,
  acc: 0,
  last: 0,
  pendingTo: null,
  pendingPerson: null,
  lastKey: '',
  sheetKey: '',
  dismissed: '',
  grudgeSaid: new Set(),
  readUntil: 0,
};

const notice = telemetryNotice();
// Use portable footer metrics without changing the shared node, type size or body typography.
if (notice) {
  notice.style.paddingInline = '2px';
  notice.style.fontFamily = 'Arial, "Liberation Sans", sans-serif';
}
function mountSaveStatus() {
  let status = document.getElementById('native-save-status');
  if (!status) {
    status = document.createElement('aside');
    status.id = 'native-save-status';
    status.className = 'native-save-status';
    status.setAttribute('role', 'status');
    const words = document.createElement('span');
    words.dataset.saveStatus = '';
    const download = document.createElement('button');
    download.textContent = 'Download this run';
    download.addEventListener('click', () => {
      void downloadLatest();
    });
    const fallback = document.createElement('button');
    fallback.dataset.lastComplete = '';
    fallback.textContent = 'Download the last complete notebook';
    fallback.addEventListener('click', () => {
      const packet = runOf() ?? cachedSaved;
      if (packet) {
        try {
          downloadRun(packet);
        } catch (error) {
          showDownloadFailure(error);
        }
      }
    });
    status.append(words, download, fallback);
    document.body.append(status);
  }
  const file = fileMode === 'file' && !!ui.s && !fileChoosing;
  status.hidden = !saveFailure && !file;
  const words = status.querySelector('[data-save-status]');
  if (words)
    words.textContent = file ? 'Progress stays in this page. Download this run before closing.' : saveFailure;
  const download = status.querySelector<HTMLButtonElement>('button');
  if (download) download.hidden = !ui.s && !cachedSaved && !unreadableSaved;
  const fallback = status.querySelector<HTMLElement>('[data-last-complete]');
  if (fallback) fallback.hidden = !saveFailure || !(runOf() ?? cachedSaved);
}
function mountNotice() {
  if (!notice || document.getElementById('telemetry-footer')) return;
  const footer = document.createElement('footer');
  footer.id = 'telemetry-footer';
  footer.append(notice);
  document.body.append(footer);
}
async function showLoadError(error: unknown, action: string) {
  if (error instanceof Error && error.name === 'AbortError') return;
  console.error(action, error);
  const detail = error instanceof Error ? error.message : '';
  const submitted = error instanceof AdmissionFailure && error.submitted;
  const accepted = error instanceof AdmissionFailure && error.accepted;
  const connection = !submitted && /unavailable|local to this game|timeout|network|fetch/i.test(detail);
  const reason = accepted
    ? 'The shared history accepted the new game, but this page could not finish saving it.'
    : submitted
      ? 'The shared history may have changed, but no confirmation reached this page. Do not start another game yet.'
      : /opening work duty|opening is already on duty|already doing something at the start/i.test(detail)
        ? 'A resident must finish their current work before this chapter can start. Continue in the earlier game, then return here.'
        : /source.*(dues|account|duty)|obligations|duties/i.test(detail)
          ? 'This history still has duties or payments in the earlier game. Finish them there before returning.'
          : /closed|death|terminal/i.test(detail)
            ? 'A resident’s earlier story has ended. That story cannot continue here.'
            : /unsupported|older|passport|biography|mismatch|edition|binding|does not match|older or different version/i.test(
                  detail,
                )
              ? 'This history cannot continue in this version of The Stairwell. You can keep playing your saved game or return to the earlier game through All games.'
              : connection
                ? 'The game could not check the shared history. You can try the connection again.'
                : 'This game could not be checked. Use Feedback for help.';
  const dialog = document.createElement('dialog');
  dialog.className = 'sw-feedback';
  dialog.setAttribute('aria-label', action);
  const heading = document.createElement('h2');
  heading.className = 'sw-dialog-header';
  heading.textContent = action;
  const body = document.createElement('div');
  body.className = 'sw-feedback-body';
  const explanation = document.createElement('p');
  explanation.textContent = `${reason} Your saved notebook has not been replaced.`;
  body.append(explanation);
  const actions = document.createElement('div');
  actions.className = 'sw-dialog-actions load-actions';
  const close = () => {
    dialog.close();
    dialog.remove();
  };
  const add = (label: string, run: () => void) => {
    const button = document.createElement('button');
    button.textContent = label;
    button.addEventListener('click', () => {
      close();
      run();
    });
    actions.append(button);
  };
  if (connection)
    add('Try again', () => {
      void startFresh();
    });
  if (submitted) {
    let recoveries: Awaited<ReturnType<typeof acceptedCastRecoveries>> = [];
    try {
      recoveries = await acceptedCastRecoveries();
    } catch (secondary) {
      console.error('Recovery records could not be read.', secondary);
      const warning = document.createElement('p');
      warning.textContent =
        'Recovery records could not be read. Keep your saved notebook. You can retry later.';
      body.append(warning);
    }
    for (const recovery of recoveries.filter(
      (recovery) => error instanceof AdmissionFailure && recovery.key === error.recoveryKey,
    )) {
      add('Open recovered game', () => {
        void continueNotebook(recovery.notebook);
      });
    }
  }
  const games = document.createElement('a');
  games.href = 'https://human.adamwhite.work/games/';
  games.textContent = 'All games';
  actions.append(games);
  add('Feedback', () => {
    openFeedback(() => runOf());
  });
  add('Back', () => {});
  dialog.append(heading, body, actions);
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  document.body.append(dialog);
  dialog.showModal();
}
const app = () => document.getElementById('app') as HTMLElement;

function requiredUiValue<T>(value: T | null | undefined, context: string): T {
  if (value === null || value === undefined) throw new Error(`Missing Stairwell UI ${context}`);
  return value;
}
const esc = (x: string) => x.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

// ---------- saves ----------

let cachedSaved: NativeNotebook | null = null;
let legacySaved = false;
// A wrapper distinguishes a stored null/false/0/string from no unreadable record.
let unreadableSaved: { value: unknown } | undefined;
let savedReadFailed = false;
let saveFailure = '';
let capturedPacket: NativeNotebook | undefined;
const saves = createNativeSaveCoordinator<GameState>({
  current: () => ui.s ?? undefined,
  enabled: () => fileMode !== 'file',
  snapshot: async (world) => {
    const packet = await nativeOwner(world).snapshot(castReceipts(world));
    completeSnapshots.set(world, packet);
    return packet;
  },
  save: saveNativeSaved,
  clear: clearNativeSaved,
});
async function save(): Promise<boolean> {
  if (!ui.s || fileMode === 'file') return false;
  try {
    const result = await saves.requestSave();
    if (result.kind === 'saved' && result.current) {
      cachedSaved = result.notebook;
      unreadableSaved = undefined;
      savedReadFailed = false;
      saveFailure = '';
      mountSaveStatus();
      if (capturedPacket !== cachedSaved) {
        capturedPacket = cachedSaved;
        try {
          lab.captureSave(cachedSaved);
        } catch (error) {
          console.error('The complete saved notebook could not be attached to telemetry.', error);
        }
      }
      return true;
    }
    return false;
  } catch (error) {
    saveFailure = 'Progress could not be saved. Download this run before closing.';
    console.error('The notebook could not be saved.', error);
    mountSaveStatus();
    return false;
  }
}
function rememberSavedReadFailure(error: unknown): void {
  if (error instanceof LegacyNativeSaveError) {
    legacySaved = true;
    savedReadFailed = false;
    return;
  }
  if (error instanceof UnreadableNativeSaveError) {
    unreadableSaved = { value: error.raw };
    savedReadFailed = false;
    saveFailure = 'This saved notebook could not be opened. Download it before replacing it.';
  } else {
    savedReadFailed = true;
    saveFailure =
      'The saved notebook could not be checked. Retry later or confirm before beginning a new game.';
  }
}
function showDownloadFailure(error: unknown): void {
  console.error('The original notebook could not be downloaded unchanged.', error);
  saveFailure =
    'This notebook could not be downloaded unchanged. This page has not replaced its stored copy.';
  mountSaveStatus();
}
function downloadUnopened(value: unknown): void {
  try {
    downloadRawRun(value);
  } catch (error) {
    showDownloadFailure(error);
  }
}
function mountReaderStatus() {
  let status = document.getElementById('native-reader-status');
  if (!status) {
    status = document.createElement('aside');
    status.id = 'native-reader-status';
    status.className = 'native-save-status';
    status.setAttribute('role', 'status');
    const words = document.createElement('span');
    words.textContent = 'Checking the complete saved notebook…';
    const cancel = document.createElement('button');
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => {
      ++loadSerial;
      ++fileImportSerial;
      reader.cancel();
    });
    status.append(words, cancel);
    document.body.append(status);
  }
  status.hidden = !readingNotebook;
}
async function readInBackground<T>(operation: () => Promise<T>): Promise<T> {
  const sequence = ++readerSequence;
  readingNotebook = true;
  mountReaderStatus();
  try {
    return await operation();
  } finally {
    if (sequence === readerSequence) {
      readingNotebook = false;
      mountReaderStatus();
    }
  }
}
async function restoreRecoveryNotebook(value: NativeNotebook): Promise<GameState> {
  return holdLoad(
    async () => (await readInBackground(() => ownerCandidate({ kind: 'notebook', input: value }))).world,
  );
}
async function restoreNotebook(value: unknown, file = false): Promise<GameState> {
  const view = await readInBackground(() => ownerCandidate({ kind: 'notebook', input: value }));
  try {
    restoreCastReceipts(view.world, view.receipts, file);
    completeSnapshots.set(view.world, value);
    return view.world;
  } catch (error) {
    discardCandidate(view.world);
    throw error;
  }
}
async function continueNotebook(value: unknown, file = false): Promise<void> {
  try {
    await begin(() => restoreNotebook(value, file), file);
  } catch (error) {
    await showLoadError(error, 'The saved game could not open.');
  }
}
function olderNotebook(): boolean {
  return legacySaved;
}
function runOf(world = ui.s) {
  if (!world) return;
  return completeSnapshots.get(world);
}

function importRun(file: File) {
  if (fileMode === 'file') {
    const serial = ++fileImportSerial;
    reader.cancel();
    if (file.size > FILE_BYTES) {
      setFileStatus(
        'The game could not read that complete file within the size limit. Your current run has not changed.',
      );
      return;
    }
    void file
      .arrayBuffer()
      .then((bytes) => {
        if (serial !== fileImportSerial) return;
        const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
        return importFileCandidate(text, serial);
      })
      .catch(() => {
        if (serial === fileImportSerial)
          setFileStatus('The game could not read that file. Your current run has not changed.');
      });
    return;
  }
  throw new Error('Open Play a saved file before choosing a file.');
}

// Local complete files use a separate finite bound from telemetry packets.
// This provisional bound must be checked against the complete month artifact.
const FILE_BYTES = NATIVE_FILE_MAX_BYTES;
let originalProvenance: unknown = {};
let fileImportSerial = 0;
let fileStatus = '';
let fileChoosing = false;
function setFileStatus(text: string) {
  fileStatus = text;
  for (const line of document.querySelectorAll('[data-file-status]')) line.textContent = text;
}
export async function fileSessionExport(world = ui.s) {
  if (fileMode !== 'file' || !world) throw Error('No saved-file run is open.');
  return nativeOwner(world).export(originalProvenance, castReceipts(world));
}
export function importFileText(text: string): Promise<void> {
  reader.cancel();
  return importFileCandidate(text, ++fileImportSerial);
}
async function importFileCandidate(text: string, serial: number): Promise<void> {
  return holdLoad(async () => {
    if (fileMode !== 'file') throw Error('Use Play a saved file first.');
    if (serial !== fileImportSerial) return;
    const { world, provenance } = await readInBackground(() => ownerCandidate({ kind: 'file', input: text }));
    if (serial !== fileImportSerial) {
      discardCandidate(world);
      return;
    }
    try {
      const receipts =
        provenance && typeof provenance === 'object' && !Array.isArray(provenance)
          ? (provenance as Record<string, unknown>).nativeCast
          : undefined;
      restoreCastReceipts(world, receipts, true);
      await validateContinuity(world);
      const packet = await nativeOwner(world).export(provenance, castReceipts(world));
      if (serial !== fileImportSerial) {
        discardCandidate(world);
        return;
      }
      ++loadSerial;
      saves.invalidate();
      invalidateContinuity();
      // The file gate is synchronous. Commit its metadata and worker ownership
      // in the same turn after the last selection check.
      gateContinuity(world, true);
      promoteOwner(world);
      originalProvenance = provenance;
      ui.s = world;
      completeSnapshots.set(world, packet);
      fileChoosing = false;
      ui.sheet = 'none';
      ui.sheetFor = null;
      selection = null;
      ui.pendingPerson = null;
      ui.acc = 0;
      ui.readUntil = 0;
      ui.dismissed = '';
      render(true);
      setFileStatus(
        'Loaded the complete saved file. Download this run before closing the page. This file owns no shared person.',
      );
    } catch (error) {
      discardCandidate(world);
      throw error;
    }
  });
}
function fileChooser() {
  fileChoosing = true;
  ++fileImportSerial;
  ++loadSerial;
  reader.cancel();
  stage?.destroy();
  stage = null;
  // A rejected replacement file must leave the current memory run available.
  invalidateContinuity();
  app().innerHTML = `<div class="page title">${topbar('', true)}<main class="page-body"><h1>Play a saved file</h1><p>Your saved game stays unchanged. Progress stays in this page. Download this run before closing the page. Reload returns here.</p><label>Choose a saved file<input type="file" accept="application/json,.json,.txt"></label><p role="status" data-file-status></p>${ui.s ? '<button data-file-resume>Resume current file</button>' : ''}<p>To leave file play and open your saved local game, use the link below. That game uses this browser’s saved notebook.</p><a href="/">Leave file play and open my saved local game</a></main></div>`;
  mountMenu(app().querySelector('.menu-slot'), null);
  app()
    .querySelector('[data-file-resume]')
    ?.addEventListener('click', () => {
      ++fileImportSerial;
      reader.cancel();
      render(true);
    });
  app()
    .querySelector('input')
    ?.addEventListener('cancel', () => {
      ++fileImportSerial;
      reader.cancel();
    });
  app()
    .querySelector('input')
    ?.addEventListener('change', (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (file) importRun(file);
      else {
        ++fileImportSerial;
        reader.cancel();
      }
    });
}

// ---------- flow ----------

async function send(inp: NewInput) {
  const s = ui.s;
  if (!s || gameStopped || gameBusy || readingNotebook || pendingLoads > 0 || recoveryPending()) return;
  const lines = s.lineNo;
  try {
    if (!(await mutate(s, { kind: 'act', input: inp }))) return;
  } catch (error) {
    if (ui.s !== s) return;
    gameStopped = nativeOwner(s).disposed;
    console.error('The game command could not be completed.', error);
    saveFailure = 'The game could not complete that action. Download the last complete notebook or reload.';
    mountSaveStatus();
    return inp.kind === 'next'
      ? {
          ok: false as const,
          failures: [{ name: 'This game', error: 'The closing action could not be completed.' }],
        }
      : undefined;
  }
  ui.acc = 0;
  if (inp.kind === 'go') ui.readUntil = 0;
  else if (s.said.some((line) => (line.n ?? -1) >= lines && line.kind !== 'journal'))
    ui.readUntil = performance.now() + 6000;
  save();
  const checkpoint = inp.kind === 'next' ? checkpointContinuity() : undefined;
  render(false);
  return checkpoint;
}

let loadSerial = 0;
let pendingLoads = 0;
async function holdLoad<T>(run: () => Promise<T>): Promise<T> {
  pendingLoads++;
  try {
    return await run();
  } finally {
    pendingLoads--;
  }
}
async function startFresh(authored = false, month = false, workStart = false) {
  if (fileMode === 'file') throw new Error('Choose a saved file to play.');
  return holdLoad(async () => {
    const serial = ++loadSerial;
    reader.cancel();
    invalidateContinuity();
    let s: GameState;
    try {
      s = await arrive(
        (Date.now() % 1_000_000) + 1,
        authored || workStart,
        workStart ? WORK_START_VERSION : month ? MONTH_VERSION : undefined,
      );
    } catch (error) {
      showLoadError(error, 'The new game could not start.');
      return;
    }
    if (serial !== loadSerial) {
      discardCandidate(s);
      return;
    }
    await begin(s).catch((error) => showLoadError(error, 'The new game could not start.'));
  });
}

async function begin(candidate: GameState | (() => Promise<GameState>), file = false) {
  return holdLoad(async () => {
    const serial = ++loadSerial;
    const s = typeof candidate === 'function' ? await candidate() : candidate;
    try {
      if (serial !== loadSerial) {
        discardCandidate(s);
        return;
      }
      await validateContinuity(s);
      if (serial !== loadSerial) {
        discardCandidate(s);
        return;
      }
      invalidateContinuity();
      await gateContinuity(s, file);
      if (serial !== loadSerial) {
        discardCandidate(s);
        return;
      }
      saves.invalidate();
      promoteOwner(s);
      ui.s = s;
      selection = null;
      ui.sheet = 'none';
      ui.sheetFor = null;
      ui.pendingPerson = null;
      ui.acc = 0;
      ui.readUntil = 0;
      ui.dismissed = '';
      if (await save()) acknowledgeContinuity(s);
      render(true);
    } catch (error) {
      discardCandidate(s);
      throw error;
    }
  });
}

export async function start() {
  setRunDownload(() => downloadLatest());
  lab.setPersonaRecording('pending-history');
  installContinuity(
    () => ui.s ?? undefined,
    async () => {
      if (!(await save()) && fileMode !== 'file') throw Error('The complete notebook has not been saved.');
    },
    async (s) => {
      await begin(s);
    },
    {
      game: gameAccess,
      build: () => lab.build().c ?? 'development',
      restoreNotebook: restoreRecoveryNotebook,
      recording: (key, allowed) => {
        lab.setPersonaRecording(key);
        lab.allowPersonaRecording(allowed);
      },
    },
  );
  lab.trackRun(() => runOf(), {
    runKey: () => ui.s?.seed ?? 'title',
    getLogs: () => ui.s?.said.slice(-40).map((line) => line.text) ?? [],
  });
  if (fileMode !== 'file') {
    try {
      cachedSaved = await loadNativeSaved();
      unreadableSaved = undefined;
      savedReadFailed = false;
    } catch (error) {
      rememberSavedReadFailure(error);
      if (!(error instanceof LegacyNativeSaveError) && !(error instanceof UnreadableNativeSaveError))
        void showLoadError(error, 'The saved notebook could not be read.');
    }
  }
  await titlePage();
  // Font swaps can reflow the log after render, without advancing the game clock.
  document.fonts.addEventListener('loadingdone', () => {
    const el = app().querySelector<HTMLElement>('.journal');
    if (el) restoreJournalAfterReflow(el);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) save();
  });
  window.addEventListener('pagehide', () => reader.cancel());
  window.addEventListener(
    'pagehide',
    fileMode === 'file'
      ? () => {
          ++fileImportSerial;
          save();
        }
      : save,
  );
  window.addEventListener('resize', () => {
    if (ui.s?.phase === 'day' && !fileChoosing) render(false);
  });
  requestAnimationFrame(loop);
  if (fileMode !== 'file' && 'serviceWorker' in navigator && !import.meta.env.DEV)
    navigator.serviceWorker.register('/sw.js').catch(() => {});
}

function canAdvance(world: GameState) {
  return (
    ui.s === world &&
    !fileChoosing &&
    !readingNotebook &&
    !gameBusy &&
    !gameStopped &&
    pendingLoads === 0 &&
    !recoveryPending() &&
    !document.hidden &&
    !document.querySelector('dialog[open], [role=dialog][aria-modal=true]')
  );
}

async function loop(t: number) {
  const loopWorld = ui.s;
  // Keep reading position current even while the clock is held. Browser scroll
  // events can remain queued until after a late font changes the line heights.
  try {
    const overlay = app().querySelector<HTMLElement>('.speech-overlay');
    if (overlay && t >= ui.readUntil) overlay.textContent = '';
    const log = app().querySelector<HTMLElement>('.journal');
    if (log) rememberJournalScroll(log);
    const s = ui.s;
    const dt = ui.last ? Math.min(0.25, (t - ui.last) / 1000) : 0;
    ui.last = t;
    if (s && s.phase === 'day' && canAdvance(s)) {
      const timing = clockPlayback(s);
      const rate = s.month && t < ui.readUntil ? Math.min(0.6, timing.rate) : timing.rate;
      if (rate === 0 || (!s.month && t < ui.readUntil)) ui.acc = 0;
      else ui.acc += dt * rate;
      let n = 0;
      while (ui.acc >= 1 && n < 30 && s.phase === 'day' && canAdvance(s)) {
        ui.acc -= 1;
        const lines = s.lineNo;
        const tasks = openTasks(s)
          .map((task) => task.id)
          .join(',');
        const faces = faceToFace(s).join(',');
        if (!(await mutate(s, { kind: 'step' }))) break;
        n++;
        if (!canAdvance(s)) break;
        if (
          s.said.some((line) => (line.n ?? -1) >= lines && line.kind !== 'journal') ||
          openTasks(s)
            .map((task) => task.id)
            .join(',') !== tasks ||
          faceToFace(s).join(',') !== faces
        ) {
          const words = s.said
            .filter((line) => (line.n ?? -1) >= lines)
            .map((line) => line.text)
            .join(' ');
          ui.readUntil = Math.max(t, performance.now()) + Math.min(12000, Math.max(4000, words.length * 45));
          ui.acc = 0;
          break;
        }
        if (clockPlayback(s).rate !== rate) {
          ui.acc = 0;
          break;
        }
      }
      if (!canAdvance(s)) return;
      if (n > 0) render(false);
      if (n > 0 && s.minute % 60 === 0) save();
      if (s.phase !== 'day') {
        save();
        void checkpointContinuity();
        render(true);
      }
    }
  } catch (error) {
    if (ui.s !== loopWorld) return;
    gameStopped = true;
    saveFailure = 'The game could not advance. Download the last complete notebook or reload.';
    console.error('The game worker could not advance.', error);
    mountSaveStatus();
  } finally {
    requestAnimationFrame(loop);
  }
}

function pacingContext(s: GameState) {
  const faces = faceToFace(s);
  const who = ui.sheetFor ?? faces[0];
  const talking =
    !s.k.walk && s.k.busyTask === null && !!who && faces.includes(who) && ui.dismissed !== `${s.k.at}:${who}`;
  const inspecting = infoOpen || ['notebook', 'orders', 'residents', 'tell', 'invent'].includes(ui.sheet);
  return { talking, inspecting };
}

function clockPlayback(s: GameState) {
  const { talking, inspecting } = pacingContext(s);
  return playback(s, talking, inspecting, selectedSpeed);
}

// ---------- pages ----------

const footer = `<div class="footer"><a href="https://human.adamwhite.work">People by the Human Framework</a></div>`;

function topbar(words: string, title = false) {
  return `<header class="topbar"><div class="topbar-words">${title ? '<a href="https://human.adamwhite.work/games/">All games</a>' : esc(words)}</div><button class="info" aria-label="Information" popovertarget="game-info">i</button><span class="menu-slot"></span></header><div id="game-info" class="info-popover" popover="auto"><button class="x" data-info-close aria-label="Close information">×</button><div class="info-content"></div></div>`;
}
function infoContent(s: GameState | null) {
  const who = s && (ui.sheetFor ?? faceToFace(s)[0]);
  const phase = s?.phase;
  const [heading, text] = !s
    ? [
        'The job',
        'Rıza worked here as the caretaker for forty years. Deliver bread by eight. Then deliver shopping and parcels, do small jobs, and take the bins down by 20:45. Money is in Turkish lira, shown as ₺. The people in seven flats will tell you things. On Sunday they vote on your tea money, the extra pay for your work. Nothing happens while you are away.',
      ]
    : phase === 'night'
      ? [
          'The night page',
          'This page shows your earnings, the money in your tin, and what people said on the stairs while you worked.',
        ]
      : phase !== 'day'
        ? [
            'The meeting',
            'Each flat can vote for your raise by raising a hand. Rıza adds up your completed jobs and the votes for your raise. His total counts what happened in the game. It does not measure anyone’s worth.',
          ]
        : who && ui.dismissed !== `${s.k.at}:${who}`
          ? [
              'Talking',
              'Ask for news once a day. Choose Tell… to repeat what you heard. Say whether you are certain. If you make up a story, people may find out. You can sit together once a day. From Thursday you can ask residents to support your raise on Sunday. They may break a promise.',
            ]
          : [
              'Orders and the stairs',
              'Tap an order, a name or a place on the building to see the trip. Choose Go to start walking. You cannot turn back during a walk. You pick up or deliver items automatically when you arrive. A dot over a door means you have something to deliver to that flat. Climbing tires you. The trip preview tells you how tiring it will be. Time slows while orders wait. When you are waiting at a door with a parcel, it follows your chosen speed. Time pauses while you talk or read a list in the week.',
            ];
  return `<h2>${heading}</h2><p>${text}</p>`;
}
function mountMenu(target: Element | null, s: GameState | null) {
  if (!target) return;
  if (fileMode === 'file' && !document.querySelector('[data-file-status]')) {
    const status = document.createElement('span');
    // Completion marker for the chooser handler; the visible memory-only explanation lives in the menu.
    status.hidden = true;
    status.dataset.fileStatus = '';
    status.textContent = fileStatus;
    target.append(status);
  }
  target.append(
    gameMenu({
      hasRun: !!ui.s,
      chooseFile: fileMode === 'file' ? fileChooser : undefined,
      newGame: () => {
        void startFresh();
      },
      getRun: () => runOf(ui.s),
      chooseRecording: chooseContinuityRecording,
      speed: () => selectedSpeed,
      setSpeed: (speed) => {
        selectedSpeed = speed;
        ui.acc = 0;
      },
      beforeOpen: save,
      beforeClose:
        fileMode === 'file'
          ? () => {
              if (target.isConnected) {
                ++fileImportSerial;
                reader.cancel();
              }
            }
          : undefined,
      onClose: () => {
        if (fileMode === 'file' && !target.isConnected) return;
        if (ui.s && (fileMode === 'file' || ui.s.phase === 'day')) render(false);
      },
      readNotebook:
        s?.phase === 'day' && ui.s
          ? () => {
              ui.sheet = 'notebook';
              ui.sheetKey = '';
              render(false);
            }
          : undefined,
      title: ui.s ? titlePage : undefined,
    }),
  );
  if (s?.phase === 'day') {
    const controls = document.createElement('details');
    controls.className = 'clock-controls';
    controls.innerHTML = `<summary>Clock speed</summary><p>Reading and conversation ${s.month ? 'slow' : 'pause'} time. Waiting orders slow time. Choose the speed for travel, work and quiet time.</p>`;
    for (const [label, value] of [
      ['Automatic', null],
      ['Slow', 3],
      ['Steady', 6],
      ['Fast', 12],
    ] as const) {
      const button = document.createElement('button');
      button.textContent = label;
      button.setAttribute('aria-pressed', String(selectedSpeed === value));
      button.addEventListener('click', () => {
        selectedSpeed = value;
        ui.acc = 0;
        for (const other of controls.querySelectorAll('button'))
          other.setAttribute('aria-pressed', String(other === button));
      });
      controls.append(button);
    }
    app().querySelector('.info-content')?.after(controls);
  }
  const info = app().querySelector<HTMLElement>('#game-info');
  if (info) {
    requiredUiValue(info.querySelector('.info-content'), 'information content').innerHTML = infoContent(ui.s);
    info.addEventListener('toggle', () => {
      infoOpen = info.matches(':popover-open');
      ui.acc = 0;
      if (ui.s?.phase === 'day' && !fileChoosing) render(false);
    });
    info.querySelector('[data-info-close]')?.addEventListener('click', () => info.hidePopover());
  }
}

async function titlePage() {
  if (fileMode === 'file') {
    fileChooser();
    return;
  }
  const serial = ++loadSerial;
  reader.cancel();
  pendingLoads++;
  let loaded: NativeNotebook | null;
  try {
    const saved = await save();
    if (ui.s && !saved) {
      mountSaveStatus();
      return;
    }
    await saves.flush();
    loaded = await loadNativeSaved();
    unreadableSaved = undefined;
    savedReadFailed = false;
  } catch (error) {
    loaded = cachedSaved;
    rememberSavedReadFailure(error);
    if (ui.s) {
      mountSaveStatus();
      return;
    }
  } finally {
    pendingLoads--;
  }
  if (serial !== loadSerial) return;
  let savedState: GameState | null = null;
  let titleFailure = false;
  try {
    if (loaded) savedState = decodeBuildingWorld(loaded.engine.world);
  } catch (error) {
    console.error('The complete saved notebook could not be opened.', error);
    titleFailure = true;
    if (ui.s) {
      await showLoadError(error, 'The saved notebook could not be opened.');
      return;
    }
  }
  if (serial !== loadSerial) return;
  cachedSaved = loaded;
  labScreen('title');
  stage?.destroy();
  stage = null;
  saves.invalidate();
  ui.s = null;
  invalidateContinuity();
  infoOpen = false;
  const saved = loaded;
  const unopened = unreadableSaved ?? (titleFailure && saved ? { value: saved } : undefined);
  const needsReplacement = !!saved || !!unopened || savedReadFailed;
  app().innerHTML = `<div class="page title">${topbar('', true)}<main class="page-body"><div class="title-premise"><h1>The Stairwell</h1>${unopened ? '<p role="status">This saved notebook could not be opened. It has been kept. Download it before starting a new game.</p><button data-download-unopened>Download unopened notebook</button>' : ''}${olderNotebook() ? '<p role="status">This old notebook cannot open in this version. The old save has been kept.</p>' : ''}<p>Deliver supplies to the five occupied flats through Saturday. On Sunday, the residents vote on your tea money, the extra pay for your work.</p><p>You are the building’s caretaker. Rıza left you his notebook.</p><p class="soft small">You work for six days, then attend the Sunday meeting. Nothing happens while you are away.</p></div><label><input type="checkbox" data-month>Play four weeks, ending with a vote on whether you stay.</label><label><input type="checkbox" data-work-start>Play four weeks without earlier shared character history. Character transfer is unavailable. You can download this run.</label><button data-a="other">Other ways to begin ▸</button><div class="title-spacer"></div></main><div class="action-bar">
    ${savedState ? `<button class="primary" data-a="continue" aria-describedby="saved-summary">Check and continue</button><span class="soft small" id="saved-summary" data-save-summary>${dayLabel(savedState)} · ${clockOf(savedState.minute)} · ${esc(placeName(savedState.k.at))}${savedState.phase !== 'day' ? ` · ${savedState.phase === 'night' ? 'night page' : 'the meeting'}` : ''}</span>` : ''}
    <button class="${needsReplacement ? '' : 'primary'}" data-a="new">${needsReplacement ? 'New game' : 'Begin on Monday'}</button><div class="new-confirm" hidden>${savedReadFailed ? 'The saved notebook could not be checked. Beginning may replace an existing notebook.' : 'The old notebook will be replaced.'}<div class="row"><button data-a="yes-new">Yes, begin</button><button data-a="no-new">No</button></div></div>${footer}</div></div>`;
  mountNotice();
  mountMenu(app().querySelector('.menu-slot'), null);
  mountSaveStatus();
  app()
    .querySelector('[data-download-unopened]')
    ?.addEventListener('click', () => {
      if (unopened) downloadUnopened(unopened.value);
    });
  app()
    .querySelector('[data-a=continue]')
    ?.addEventListener('click', () => {
      if (saved && savedState) void continueNotebook(saved);
    });
  const fresh = () =>
    startFresh(
      false,
      app().querySelector<HTMLInputElement>('[data-month]')?.checked === true,
      app().querySelector<HTMLInputElement>('[data-work-start]')?.checked === true,
    );
  app()
    .querySelector('[data-a=new]')
    ?.addEventListener('click', () => {
      if (needsReplacement)
        requiredUiValue(app().querySelector<HTMLElement>('.new-confirm'), 'new-game confirmation').hidden =
          false;
      else fresh();
    });
  app().querySelector('[data-a=yes-new]')?.addEventListener('click', fresh);
  app()
    .querySelector('[data-a=no-new]')
    ?.addEventListener('click', () => {
      requiredUiValue(app().querySelector<HTMLElement>('.new-confirm'), 'new-game confirmation').hidden =
        true;
    });
  app()
    .querySelector('[data-a=other]')
    ?.addEventListener('click', () => {
      const dialog = document.createElement('dialog');
      dialog.className = 'other-ways';
      dialog.innerHTML = `<div class="who"><b>Other ways to begin</b><button class="x" data-a="close" aria-label="Close other ways in">×</button></div><div class="sheet-body"><a href="/file/">Play a saved file</a><a href="https://human.adamwhite.work/lab/people/">${PEOPLE_ACROSS_GAMES} (Hacer and Sevim can transfer here)</a></div>`;
      document.body.append(dialog);
      dialog.showModal();
      const authored = document.createElement('button');
      authored.textContent = needsReplacement
        ? 'Replace the saved notebook and begin without earlier character history'
        : 'Begin a new week without earlier character history';
      authored.addEventListener('click', async () => {
        dialog.close();
        await startFresh(true);
      });
      dialog.querySelector('.sheet-body')?.append(authored);
      void continuityPanel().then((panel) => {
        if (dialog.isConnected) dialog.querySelector('.sheet-body')?.append(panel);
      });
      dialog.querySelector('[data-a=close]')?.addEventListener('click', () => dialog.close());
      dialog.addEventListener('close', () => dialog.remove());
    });
}

function render(full: boolean) {
  mountSaveStatus();
  labScreen('play');
  const s = ui.s;
  if (s && fileMode === 'file') fileChoosing = false;
  if (!s) return;
  if (s.phase !== 'day') {
    stage?.destroy();
    stage = null;
  }
  if (s.phase === 'night') return nightPage(s);
  if (s.phase === 'sunday' || s.phase === 'end') return sundayPage(s);
  dayView(s, full);
}

// ---------- the day ----------

function dayView(s: GameState, full: boolean) {
  const oldLog = app().querySelector<HTMLElement>('.journal');
  const position =
    oldLog && oldLog.clientHeight === 0
      ? (journalPositions.get(oldLog)?.position ?? journalPosition(oldLog))
      : !oldLog && s.inputs.length === 0 && s.minute === 7 * 60
        ? // Open the new notebook at the start of Rıza’s instruction. Longer
          // resumed notebooks still follow the newest entry by default.
          { atEnd: false, n: undefined, offset: 0 }
        : journalPosition(oldLog);
  let root = app().querySelector<HTMLElement>('.day');
  if (!root || full) {
    app().innerHTML = `<div class="day game tab-here">${topbar('')}<div class="state-strip"><div class="order-pips"></div><span class="next-due"></span><span class="clock-rate"></span></div><section class="scene" aria-label="Building view"><div class="scene-drawing"></div><div class="speech-overlay" aria-live="polite"></div></section><div class="play-panel"><nav class="sheet-tabs" aria-label="Views"><button data-tab="none">Here</button><button data-tab="orders">Orders</button><button data-tab="residents">Residents</button><button data-tab="notebook" aria-label="Read the residents’ notebook">Notebook</button></nav><section class="sheet" aria-label="Neighbour or orders"></section><section class="journal" aria-label="Journal"></section></div><div class="action-bar"></div></div>`;
    root = requiredUiValue(app().querySelector<HTMLElement>('.day'), 'day root');
    stage?.destroy();
    stage = null;
    mountMenu(root.querySelector('.menu-slot'), s);
    root.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => {
      b.addEventListener('click', () => {
        ui.sheet = b.dataset.tab as Ui['sheet'];
        if (ui.sheet === 'none') selection = null;
        ui.sheetKey = '';
        render(false);
      });
    });
    root.querySelector('.scene')?.addEventListener('click', (e) => {
      const hit = (e.target as Element).closest('[data-go]');
      if (hit) choose(s, hit.getAttribute('data-go') as Place);
    });
    root.querySelector('.scene')?.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
        const hit = (e.target as Element).closest('[data-go]');
        if (hit) {
          e.preventDefault();
          choose(s, hit.getAttribute('data-go') as Place);
        }
      }
    });
    ui.sheetKey = '';
  }
  const d = dayOf(s.minute);
  const faces = faceToFace(s);
  requiredUiValue(root.querySelector('.topbar-words'), 'day topbar words').textContent =
    `${dayLabel(s)} ${clockOf(s.minute)} · ${s.k.walk ? `→ ${placeName(s.k.walk.to)}` : placeName(s.k.at)}`;
  requiredUiValue(root.querySelector('.info-content'), 'day information content').innerHTML = infoContent(s);
  const ctx = pacingContext(s);
  const who = ui.sheetFor ?? faces[0];
  const slowed = ctx.inspecting
    ? s.month
      ? 'You are reading. Time moves slowly.'
      : 'You are reading. Time is paused.'
    : ctx.talking
      ? `${who ? RESIDENTS[who].name : 'Someone'} is talking. Time ${s.month ? 'moves slowly' : 'is paused'}.`
      : !s.k.walk && s.k.busyUntil <= s.minute && openTasks(s).length
        ? playback(s, false, false, selectedSpeed).reason
        : `${clockPlayback(s).rate} game minutes/second`;
  requiredUiValue(root.querySelector('.clock-rate'), 'day clock rate').textContent = slowed;
  const tasks = openTasks(s).sort((a, b) => Number(!!b.carried) - Number(!!a.carried) || a.by - b.by);
  requiredUiValue(root.querySelector('.order-pips'), 'day order pips').innerHTML = s.tasks
    .filter((t) => dayOf(t.by) === d)
    .map(
      (t) =>
        `<span class="pip ${t.done ? 'done' : ''} ${!t.done && s.minute > t.by ? 'late' : ''}">${t.done ? '■' : '□'}</span>`,
    )
    .join('');
  requiredUiValue(root.querySelector('.next-due'), 'day next deadline').textContent = tasks.length
    ? `next by ${clockOf(requiredUiValue(tasks[0], 'first open task').by)}`
    : '';
  for (const b of root.querySelectorAll<HTMLElement>('[data-tab]')) {
    const active =
      b.dataset.tab === ui.sheet ||
      (b.dataset.tab === 'none' && !['orders', 'residents', 'notebook'].includes(ui.sheet));
    b.setAttribute('aria-pressed', String(active));
    b.textContent =
      b.dataset.tab === 'orders'
        ? `Orders ${tasks.length}`
        : b.dataset.tab === 'notebook'
          ? 'Notebook'
          : b.dataset.tab === 'residents'
            ? 'Residents'
            : who
              ? RESIDENTS[who].name
              : 'Here';
  }
  root.classList.toggle('tab-here', !['orders', 'residents', 'notebook'].includes(ui.sheet));
  root.classList.toggle('decision', ['tell', 'invent'].includes(ui.sheet));
  root.classList.toggle('travelling', !!s.k.walk || s.k.busyTask !== null);
  requiredUiValue(root.querySelector('.scene-drawing'), 'day scene drawing').innerHTML = sceneSvg(s);
  for (const hit of root.querySelectorAll<SVGElement>('.scene [data-go]')) {
    hit.setAttribute('tabindex', s.k.walk || s.k.busyTask !== null ? '-1' : '0');
    hit.setAttribute('role', 'button');
    hit.setAttribute('aria-label', placeName(hit.getAttribute('data-go') as Place));
    hit.setAttribute('aria-pressed', String(selection?.to === hit.getAttribute('data-go')));
  }
  const voice = [...s.said].reverse().find((x) => x.kind === 'voice');
  requiredUiValue(root.querySelector<HTMLElement>('.speech-overlay'), 'day speech overlay').textContent =
    voice && performance.now() < ui.readUntil ? `${nameOf(voice.who)}: ${voice.text}` : '';
  const panel = requiredUiValue(root.querySelector<HTMLElement>('.sheet'), 'day sheet');
  const action = requiredUiValue(root.querySelector<HTMLElement>('.action-bar'), 'day action bar');
  const previousVerbs = action.querySelector('.verbs');
  if (previousVerbs && panel.classList.contains('conversation')) panel.append(previousVerbs);
  const expectedSubmenu = `${ui.sheetFor ?? faces[0] ?? null}:${ui.sheet}:${ui.inventAbout}`;
  if (['tell', 'invent'].includes(ui.sheet) && panel.dataset.submenu === expectedSubmenu) {
    while (action.firstChild) panel.append(action.firstChild);
  }

  // Keep the journal node stable while lists and conversation content change.
  const scroll = panel.scrollTop;
  const detailsOpen = !!panel.querySelector('details[open]');
  ui.sheetKey = '';
  sheet(s, panel);
  panel.scrollTop = scroll;
  if (detailsOpen) panel.querySelector('details')?.setAttribute('open', '');
  const verbs = panel.querySelector<HTMLElement>('.verbs');
  const submenu = ui.sheet === 'tell' || ui.sheet === 'invent';
  if (submenu && who && !faces.includes(who)) {
    const status = panel.querySelector('.availability');
    if (status) status.textContent = departureLine(s, who);
    for (const b of panel.querySelectorAll<HTMLButtonElement>(
      'button:not([data-a=close]):not([data-a=back])',
    ))
      b.disabled = true;
  }
  root.classList.toggle('has-conversation', panel.classList.contains('conversation'));
  if (selection && !submenu && ui.sheet !== 'notebook') {
    tripActions(s, action);
  } else if (verbs) {
    action.replaceChildren(verbs);
  } else if (submenu) {
    const commit = panel.lastElementChild;
    action.replaceChildren();
    if (commit) action.append(commit);
  } else if (ui.sheet === 'notebook') action.innerHTML = '';
  else tripActions(s, action);
  journal(s, requiredUiValue(root.querySelector<HTMLElement>('.journal'), 'day journal'), position);
}

function choose(s: GameState, to: Place, person: Rid | null = null, task: number | null = null) {
  if (s.k.walk || s.k.busyTask !== null) return;
  if (to === s.k.at && task === null) {
    selection = null;
    goTo(s, to, person);
    return;
  }
  selection = { to, person, task };
  render(false);
}
function tripActions(s: GameState, el: HTMLElement) {
  if (s.k.walk) {
    el.innerHTML = `<div class="travel-status">${s.k.walk.from === s.k.walk.to ? 'Sitting together · finished' : `On the way to ${esc(placeName(s.k.walk.to))} · there`} about ${clockOf(s.k.walk.at1)}</div>`;
    return;
  }
  if (s.k.busyTask !== null) {
    const t = s.tasks.find((t) => t.id === s.k.busyTask);
    el.innerHTML = `<div class="travel-status">Working: ${esc(t?.label ?? '')} · done about ${clockOf(s.k.busyUntil)}</div>`;
    return;
  }
  const tasks = openTasks(s).sort((a, b) => Number(!!b.carried) - Number(!!a.carried) || a.by - b.by);
  const task = selection
    ? selection.task !== null
      ? tasks.find((t) => t.id === selection?.task)
      : tasks.find((t) => t.place === selection?.to && (t.carried || !t.pickup))
    : tasks[0];
  const to = selection?.to ?? (task ? (task.carried || !task.pickup ? task.place : task.pickup) : null);
  if (task && canStartWork(s, task)) {
    el.innerHTML = `<div class="trip-line"><b>${esc(task.label)}</b><span>${task.work} minutes of work here</span></div><button class="primary" data-start-work>Start work</button>`;
    el.querySelector('[data-start-work]')?.addEventListener('click', () => {
      send({ kind: 'start-work', task: task.id });
      selection = null;
      render(false);
    });
    return;
  }
  if (to) {
    const first = travelMinutes(s, s.k.at, to);
    const second = task && !task.carried && task.pickup ? travelMinutes(s, to, task.place) : 0;
    const arrive = s.minute + first + second;
    const forecast = legsLine(s, to);
    if (!hasNativeForecast(s, to) && !gameBusy) {
      gameBusy = true;
      void (async () => {
        try {
          await nativeOwner(s).update({ kind: 'project', forecasts: [to] });
        } catch (error) {
          console.error('The route forecast could not be read.', error);
          return;
        } finally {
          gameBusy = false;
        }
        if (ui.s === s) render(false);
      })();
    }
    const person = selection?.person;
    const title = task
      ? `${task.kind === 'bins' ? 'Bins' : RESIDENTS[task.for].name} · ${task.label}`
      : person
        ? `${RESIDENTS[person].name} · flat ${RESIDENTS[person].flat}`
        : placeName(to);
    el.innerHTML = `<div class="trip-line"><b>${esc(title)}</b><span>${esc(placeName(to))} · ${first} min walk${second ? `, then ${esc(placeName(requiredUiValue(task, 'second trip task').place))} · ${second} min walk` : ''} · there about ${clockOf(arrive)}${task ? ` · due ${clockOf(task.by)}` : ''}${task && arrive > task.by ? `<strong class="late"> · about ${arrive - task.by} min late</strong>` : ''}${!task && to.startsWith('door:') && rOf(s, to.slice(5) as Rid).where === 'work' ? ` · ${RESIDENTS[to.slice(5) as Rid].name} is out` : ''}</span>${forecast ? `<span class="soft">${esc(forecast)}</span>` : ''}</div><button class="primary" data-a="go">Go to ${esc(placeName(to))}</button>${selection && !task ? '<button data-a="clear-trip">Back</button>' : ''}`;
    el.insertAdjacentHTML('beforeend', '<button data-rest-trip>Take a ten-minute break</button>');
    el.querySelector('[data-rest-trip]')?.addEventListener('click', () => send({ kind: 'rest' }));
    el.querySelector('[data-a=go]')?.addEventListener('click', () => {
      const p = selection?.person ?? null;
      selection = null;
      goTo(s, to, p);
    });
    el.querySelector('[data-a=clear-trip]')?.addEventListener('click', () => {
      selection = null;
      render(false);
    });
  } else {
    const { talking, inspecting } = pacingContext(s);
    el.innerHTML = canWait(s, talking, inspecting)
      ? '<button class="primary" data-a="wait" aria-label="Skip to the next event">Skip ⏩</button>'
      : '';
    el.querySelector('[data-a=wait]')?.addEventListener('click', async () => {
      const ctx = pacingContext(s);
      if (!canWait(s, ctx.talking, ctx.inspecting)) return;
      if (!canAdvance(s)) return;
      try {
        if (!(await mutate(s, { kind: 'wait' })) || !canAdvance(s)) return;
      } catch (error) {
        gameStopped = true;
        showDownloadFailure(error);
        return;
      }
      ui.acc = 0;
      ui.readUntil = performance.now() + 8000;
      save();
      render(false);
    });
  }
}
function goTo(s: GameState, to: Place, person: Rid | null = null) {
  if (s.k.walk || s.k.busyTask !== null) return;
  ui.pendingPerson = person;
  ui.sheetFor = null;
  if (to === s.k.at) {
    ui.dismissed = '';
    ui.sheet = 'none';
    ui.sheetKey = '';
    send({ kind: 'go', to });
    return;
  }
  ui.sheet = 'none';
  ui.dismissed = '';
  send({ kind: 'go', to });
}

// The building, drawn: floors from the top, flats on each landing, the stair zigzag on the left.
const W = 360;
const FLOOR_H = 44;
const TOP_Y = 16;
const floorY = (f: number) => TOP_Y + (TOP_FLOOR + 1 - f) * FLOOR_H;

function wob(x1: number, y1: number, x2: number, y2: number, k: number): string {
  const j = (n: number) => ((Math.sin(n * 12.9898 + k * 78.233) * 43758.5453) % 1) * 1.6;
  const mx = (x1 + x2) / 2 + j(1);
  const my = (y1 + y2) / 2 + j(2);
  return `M${x1.toFixed(1)} ${y1.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

function doorX(id: Rid): number {
  const same = RIDS.filter((r) => RESIDENTS[r].floor === RESIDENTS[id].floor);
  const i = same.indexOf(id);
  return same.length === 1 ? 196 : i === 0 ? 132 : 222;
}

function kapiciPos(s: GameState): { x: number; y: number } {
  const pos = (pl: Place) => {
    if (pl === 'bakery') return { x: 330, y: floorY(0) + 8 };
    if (pl === 'shop') return { x: 330, y: floorY(0) - 16 };
    if (pl === 'room') return { x: 70, y: floorY(-1) + 4 };
    if (pl === 'step') return { x: 100, y: floorY(0) + 4 };
    if (pl === 'roof') return { x: 200, y: floorY(TOP_FLOOR + 1) };
    if (pl.startsWith('door:')) return { x: doorX(pl.slice(5) as Rid) - 22, y: floorY(floorOf(pl)) };
    return { x: 74, y: floorY(floorOf(pl)) };
  };
  const w = s.k.walk;
  if (!w) return pos(s.k.at);
  const a = pos(w.from);
  const b = pos(w.to);
  const f = Math.min(1, Math.max(0, (s.minute - w.at0) / Math.max(1, w.at1 - w.at0)));
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

function figure(x: number, y: number, cls: string, lean = 0): string {
  return `<g class="${cls}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${lean})">
    <circle cx="0" cy="-27" r="4.5"/><path d="M0 -22 L0 -9 M0 -18 L-5 -12 M0 -18 L5 -12 M0 -9 L-4 0 M0 -9 L4 0"/></g>`;
}

const guestsOf = (s: GameState, host: Rid): Rid[] =>
  RIDS.filter((id) => rOf(s, id).where === `visit:${host}`);

function sceneSvg(s: GameState): string {
  const cropped = (ui.sheet === 'tell' || ui.sheet === 'invent') && matchMedia('(max-width: 899px)').matches;
  const focusFloor = floorOf(s.k.walk?.to ?? s.k.at);
  const parts: string[] = [];
  const H = 288;
  // Roof line and floors.
  parts.push(`<path class="ink" d="${wob(30, TOP_Y + 4, 300, TOP_Y + 4, 1)}"/>`);
  parts.push(`<rect class="hit" data-go="roof" x="98" y="0" width="62" height="44"/>`);
  parts.push(`<text class="lbl soft" x="130" y="${TOP_Y - 2}" text-anchor="middle">roof</text>`);
  for (let f = TOP_FLOOR; f >= 0; f--) {
    const y = floorY(f);
    parts.push(`<path class="ink" d="${wob(30, y, 300, y, f + 3)}"/>`);
    parts.push(`<path class="soft-ink" d="${wob(48, y, 96, y - FLOOR_H + 4, f + 9)}"/>`);
    parts.push(
      `<rect class="hit" data-go="landing:${f}" x="30" y="${y - FLOOR_H + 6}" width="64" height="${FLOOR_H}"/>`,
    );
    parts.push(`<text class="lbl soft" x="34" y="${y - 4}">${f === 0 ? 'G' : f}</text>`);
  }
  // Targets occupy disjoint columns or rows. The bottom row starts after the ground-floor targets.
  // Ground: your room below, the step and the street.
  const g = floorY(0);
  parts.push(`<path class="ink" d="${wob(30, g + 28, 300, g + 28, 21)}"/>`);
  parts.push(`<rect class="hit" data-go="room" x="30" y="${g + 6}" width="90" height="46"/>`);
  parts.push(`<text class="lbl" x="44" y="${g + 26}">your room</text>`);
  parts.push(`<rect class="hit" data-go="step" x="122" y="${g + 6}" width="70" height="46"/>`);
  parts.push(`<text class="lbl" x="128" y="${g + 26}">the step</text>`);
  parts.push(
    `<path class="ink" d="${wob(300, TOP_Y + 4, 300, g + 28, 30)}"/><path class="ink" d="${wob(30, TOP_Y + 4, 30, g + 28, 31)}"/>`,
  );
  parts.push(`<rect class="hit" data-go="shop" x="304" y="${g - 50}" width="56" height="46"/>`);
  parts.push(`<text class="lbl" x="306" y="${g - 18}">shop</text>`);
  parts.push(`<rect class="hit" data-go="bakery" x="304" y="${g + 6}" width="56" height="46"/>`);
  parts.push(`<text class="lbl" x="306" y="${g + 26}">bakery</text>`);
  // Doors and residents.
  const carriedFor = new Set(
    openTasks(s)
      .filter((t) => t.carried)
      .map((t) => t.place),
  );
  const wantedAt = new Set(
    openTasks(s)
      .filter((t) => !t.carried && !t.pickup)
      .map((t) => t.place),
  );
  for (const id of RIDS) {
    const r = rOf(s, id);
    const info = RESIDENTS[id];
    if (cropped && info.floor !== focusFloor) continue;
    const x = doorX(id);
    const hitWidth = x === 132 ? 86 : 296 - (x - 34);
    const y = floorY(info.floor);
    const pl = `door:${id}` as Place;
    const want = carriedFor.has(pl) || wantedAt.has(pl);
    parts.push(`<g class="door${selection?.to === pl ? ' selected' : ''}${want ? ' want' : ''}" data-go="${pl}" tabindex="0" role="button" aria-label="${info.name}, flat ${info.flat}">
      <rect class="hit" x="${x - 34}" y="${y - FLOOR_H + 6}" width="${hitWidth}" height="${FLOOR_H}"/>
      <path class="ink" d="${wob(x, y, x, y - 30, info.flat)} ${wob(x, y - 30, x + 16, y - 30, info.flat + 1)} ${wob(x + 16, y - 30, x + 16, y, info.flat + 2)}"/>
      <text class="lbl hand" x="${x + 20}" y="${y - 18}">${info.flat} ${info.name}</text>
      ${
        r.where === 'asleep'
          ? `<text class="lbl soft" x="${x + 20}" y="${y - 4}">asleep</text>`
          : r.where === 'home'
            ? `<text class="lbl soft${guestsOf(s, id).length ? ' visit' : ''}" x="${x + 20}" y="${y - 4}">${
                guestsOf(s, id).length
                  ? `in, with ${guestsOf(s, id)
                      .map((g) => RESIDENTS[g].name)
                      .join(', ')}`
                  : 'in'
              }</text>`
            : ''
      }
      ${want ? `<circle class="dot" cx="${x + 8}" cy="${y - 36}" r="3"/>` : ''}
    </g>`);
  }
  // Residents out and about: on the step, on the roof, visiting (drawn at the host's door), on the stairs.
  const stepPeople = RIDS.filter((id) => rOf(s, id).where === 'step');
  stepPeople.forEach((id, i) => {
    const x = 128 + i * 26;
    parts.push(figure(x, g + 26, 'res'));
    parts.push(
      `<text class="lbl hand" x="${x}" y="${g - 4 - (i % 3) * 12}" text-anchor="middle">${RESIDENTS[id].name}</text>`,
    );
  });
  const roofPeople = RIDS.filter((id) => rOf(s, id).where === 'roof');
  roofPeople.forEach((id, i) => {
    parts.push(figure(170 + i * 20, TOP_Y + 4, 'res'));
    parts.push(`<text class="lbl hand" x="${190 + i * 40}" y="${TOP_Y - 4}">${RESIDENTS[id].name}</text>`);
  });
  // The kapıcı.
  const kp = kapiciPos(s);
  parts.push(figure(kp.x, kp.y, 'me', s.k.walk ? 6 : 0));
  if (s.k.busyTask !== null)
    parts.push(`<text class="lbl hand me-t" x="${kp.x + 8}" y="${kp.y - 30}">working…</text>`);
  const cropY = Math.max(0, Math.min(H - 88, floorY(focusFloor) - 64));
  return `<svg viewBox="0 ${cropped ? cropY : 0} ${W} ${cropped ? 88 : H}" preserveAspectRatio="none" role="group" aria-label="${cropped ? 'Current floor' : 'The building'}">${parts.join('')}</svg>`;
}

function taskLine(s: GameState, t: Task, current: boolean): string {
  const late = s.minute > t.by;
  const who = t.kind === 'bins' ? 'Bins' : RESIDENTS[t.for].name;
  const where = t.carried
    ? `to ${placeName(t.place)}`
    : t.pickup
      ? `from ${placeName(t.pickup)}`
      : `at ${placeName(t.place)}`;
  const what = t.kind === 'bins' ? 'down from the fourth floor' : t.label;
  const when = t.kind === 'bins' ? 'by 20:45' : `by ${clockOf(t.by)}`;
  return `<button class="task${current ? ' current' : ''}${late ? ' late' : ''}${t.carried ? ' carried' : ''}" data-t="${t.id}" aria-pressed="${current}">
    <span class="t">${t.carried ? '◼ ' : ''}${esc(who)}</span> <span>${esc(what)}</span>
    <span class="hand soft">${t.custody ? `safe with ${esc(nameOf(t.custody))}; waiting for both residents to be home` : where}, ${when}${late ? ' · late' : ''} · ${travelMinutes(s, s.k.at, t.carried || !t.pickup ? t.place : t.pickup)}${!t.carried && t.pickup ? ` + ${travelMinutes(s, t.pickup, t.place)}` : ''} min${t.kind === 'bins' ? ` · ${esc(binsWarning(s, t.carried ? 'step' : requiredUiValue(t.pickup, 'bins pickup')))}` : ''}</span></button>`;
}

function saidLine(x: Said): string {
  const id = `data-n="${x.n ?? ''}"`;
  if (x.kind === 'margin')
    return `<div ${id} class="margin hand">${esc(x.text)} <span class="soft">— R.</span></div>`;
  if (x.kind === 'voice')
    return `<div ${id}><span class="soft small">${esc(nameOf(x.who))}:</span> <span class="hand">${esc(x.text)}</span></div>`;
  if (x.kind === 'heard') return `<div ${id} class="heard">… ${esc(x.text)}</div>`;
  return `<div ${id} class="${x.kind === 'event' ? 'event' : ''}">${esc(x.text)}</div>`;
}

function journalPosition(el: HTMLElement | null) {
  const atEnd = !el || el.scrollHeight - el.clientHeight - el.scrollTop <= 2;
  const bounds = el?.getBoundingClientRect();
  const row =
    !atEnd && bounds
      ? [...el.children].find((row) => {
          const rect = row.getBoundingClientRect();
          return rect.bottom > bounds.top && rect.top < bounds.bottom;
        })
      : undefined;
  return {
    atEnd,
    n: row?.getAttribute('data-n'),
    offset: row && bounds ? row.getBoundingClientRect().top - bounds.top : 0,
  };
}

function restoreJournalAfterReflow(el: HTMLElement) {
  const saved = journalPositions.get(el);
  if (!saved || el.clientHeight === 0) return;
  // Honour a reader's scroll even when its scroll event is still queued.
  const position = el.scrollTop === saved.top ? saved.position : journalPosition(el);
  restoreJournalPosition(el, position);
}

function rememberJournalScroll(el: HTMLElement) {
  if (el.clientHeight === 0) return;
  const saved = journalPositions.get(el);
  if (saved && el.scrollTop !== saved.top)
    journalPositions.set(el, { position: journalPosition(el), top: el.scrollTop });
}

function journal(s: GameState, el: HTMLElement, position: ReturnType<typeof journalPosition>) {
  if (!journalResizes.has(el)) {
    el.addEventListener('scroll', () => rememberJournalScroll(el));
    const observer = new ResizeObserver(() => {
      if (!el.isConnected) observer.disconnect();
      else restoreJournalAfterReflow(el);
    });
    journalResizes.set(el, observer);
  }
  const lines = s.said.filter((x) => dayOf(x.at) === dayOf(s.minute) || x.kind === 'margin').slice(-40);
  const key = lines.map((x) => `${x.n}:${x.at}:${x.text}`).join('|');
  if (el.dataset.k !== key) {
    el.dataset.k = key;
    el.innerHTML = lines.map(saidLine).join('');
    const observer = journalResizes.get(el);
    observer?.disconnect();
    for (const row of el.children) observer?.observe(row);
  }
  restoreJournalPosition(el, position);
}

function restoreJournalPosition(el: HTMLElement, position: ReturnType<typeof journalPosition>) {
  if (el.clientHeight === 0) return;
  if (position.atEnd) el.scrollTop = el.scrollHeight;
  else {
    const row = [...el.children].find((row) => row.getAttribute('data-n') === position.n);
    if (row)
      el.scrollTop += row.getBoundingClientRect().top - el.getBoundingClientRect().top - position.offset;
    else el.scrollTop = 0; // The entry was removed: resume at the oldest surviving entry.
  }
  journalPositions.set(el, { position: journalPosition(el), top: el.scrollTop });
}

// ---------- the sheet: whoever is in front of you ----------

function sheet(s: GameState, el: HTMLElement) {
  const faces = faceToFace(s);
  const at = s.k.at;
  let key = '';
  if (ui.sheet === 'orders' || ui.sheet === 'residents') key = `${ui.sheet}:${s.minute}`;
  else if (ui.sheet === 'notebook') key = `nb:${Object.keys(s.secrets).length}:${s.minute >> 4}`;
  else if (s.k.walk) key = `walk:${s.k.walk.to}`;
  else if (s.k.busyTask !== null) key = 'busy';
  else
    key = `at:${at}:${faces.join(',')}:${ui.sheet}:${ui.sheetFor}:${ui.inventAbout}:${ui.dismissed}:${s.minute}:${lastVoice(s)}`;
  if (key === ui.sheetKey) return;
  ui.sheetKey = key;
  const directory = ui.sheet === 'orders' || ui.sheet === 'residents';
  el.classList.toggle('directory', directory);
  if (ui.sheet !== 'none' || s.k.walk || s.k.busyTask !== null) el.classList.remove('conversation');
  if (directory) {
    const kind = ui.sheet;
    const orders = kind === 'orders';
    if (el.dataset.directory !== kind) {
      el.innerHTML = `<div class="who"><b>${orders ? 'All orders' : 'Residents'}</b><button class="x" data-a="close" aria-label="Close">✕</button></div><div class="directory-items${orders ? '' : ' resident-list'}"></div>`;
      el.dataset.directory = kind;
      el.querySelector('[data-a=close]')?.addEventListener('click', () => {
        ui.sheet = 'none';
        ui.sheetKey = '';
        render(false);
        app()
          .querySelector<HTMLElement>(`.navigation [data-a=${orders ? 'orders' : 'residents'}]`)
          ?.focus();
      });
    }
    const items = el.querySelector('.directory-items') as HTMLElement;
    if (orders && canSwap(s) && !el.querySelector('[data-a=swap]')) {
      const b = document.createElement('button');
      b.className = 'prank';
      b.dataset.a = 'swap';
      b.textContent = 'Swap Hacer’s and Sevim’s newspapers';
      b.addEventListener('click', () => send({ kind: 'prank', what: 'swap' }));
      el.insertBefore(b, items);
    }
    if (orders) {
      // Keep existing rows in place. Requests that arrive while reading append below.
      const open = openTasks(s).sort((a, b) => Number(!!b.carried) - Number(!!a.carried) || a.by - b.by);
      for (const task of open) {
        let button = items.querySelector<HTMLButtonElement>(`[data-t="${task.id}"]`);
        const fresh = document.createElement('div');
        fresh.innerHTML = taskLine(s, task, task.id === (selection?.task ?? open[0]?.id));
        const next = fresh.firstElementChild as HTMLButtonElement;
        if (!button) {
          button = next;
          button.addEventListener('click', () => {
            if (!task.done) choose(s, task.carried || !task.pickup ? task.place : task.pickup, null, task.id);
          });
          items.append(button);
        } else {
          button.className = next.className;
          if (button.innerHTML !== next.innerHTML) button.innerHTML = next.innerHTML;
        }
      }
      for (const button of items.querySelectorAll<HTMLButtonElement>('[data-t]')) {
        if (open.some((task) => task.id === Number(button.dataset.t))) continue;
        button.disabled = true;
        button.classList.remove('current');
        button.setAttribute('aria-label', `${button.textContent} · delivered`);
      }
      if (!items.children.length) items.textContent = 'There are no orders on the board.';
    } else {
      for (const id of RIDS) {
        const info = RESIDENTS[id];
        const where = rOf(s, id).where;
        const to: Place =
          where === 'step' || where === 'roof' || where === 'shop'
            ? where
            : where.startsWith('visit:')
              ? `door:${where.slice(6) as Rid}`
              : `door:${id}`;
        const status =
          where === 'home'
            ? 'in'
            : where === 'asleep'
              ? 'asleep'
              : where === 'work'
                ? 'out'
                : `at ${placeName(to)}`;
        let button = items.querySelector<HTMLButtonElement>(`[data-resident=${id}]`);
        if (!button) {
          button = document.createElement('button');
          button.dataset.resident = id;
          button.addEventListener('click', () => {
            const row = items.querySelector<HTMLButtonElement>(`[data-resident=${id}]`);
            if (row) choose(s, row.dataset.go as Place, id);
          });
          items.append(button);
        }
        button.dataset.go = to;
        button.setAttribute('aria-pressed', String(selection?.person === id));
        const html = `${esc(info.name)} <span class="soft">· flat ${info.flat} · ${esc(status)} · ${travelMinutes(s, s.k.at, to)} min</span>`;
        if (button.innerHTML !== html) button.innerHTML = html;
      }
    }
    return;
  }
  delete el.dataset.directory;
  if (ui.sheet === 'notebook') {
    el.innerHTML = notebookHtml(s);
    el.querySelector('[data-a="close"]')?.addEventListener('click', () => {
      ui.sheet = 'none';
      ui.sheetKey = '';
      render(false);
      app().querySelector<HTMLElement>('.game-menu')?.focus();
    });
    return;
  }
  if (s.k.walk || s.k.busyTask !== null) {
    ui.sheetFor = null;
    el.innerHTML = '';
    return;
  }
  if (ui.pendingPerson) {
    if (faces.includes(ui.pendingPerson) || faces.length) ui.sheetFor = ui.pendingPerson;
    ui.pendingPerson = null;
  }
  // A departure disables the chosen person's controls; only Close reveals routes.
  const who = ui.sheetFor ?? faces[0] ?? null;
  if (who) ui.sheetFor = who;
  const submenu = `${who}:${ui.sheet}:${ui.inventAbout}`;
  if (who && (ui.sheet === 'tell' || ui.sheet === 'invent') && el.dataset.submenu === submenu) {
    const present = faces.includes(who);
    const status = el.querySelector('.availability');
    if (status) status.textContent = present ? '' : departureLine(s, who);
    for (const button of el.querySelectorAll<HTMLButtonElement>(
      'button:not([data-a=close]):not([data-a=back])',
    ))
      button.disabled = !present;
    return;
  }
  const conversation = !!who && ui.sheet === 'none' && ui.dismissed !== `${at}:${who}`;
  if (!conversation) el.classList.remove('conversation');
  if (!who) {
    el.innerHTML = placeHtml(s);
    el.querySelector('[data-a=swap]')?.addEventListener('click', () => send({ kind: 'prank', what: 'swap' }));
    el.querySelector('[data-a="gate"]')?.addEventListener('click', () =>
      send({ kind: 'prank', what: 'gate' }),
    );
    el.querySelector('[data-a="knock"]')?.addEventListener('click', () => {
      if (at.startsWith('door:')) send({ kind: 'knock', who: at.slice(5) as Rid });
    });
    for (const b of el.querySelectorAll<HTMLElement>('[data-go]'))
      b.addEventListener('click', () => choose(s, b.dataset.go as Place));
    return;
  }
  if (ui.dismissed === `${at}:${who}`) {
    el.innerHTML = `<button data-a="reopen">Talk to ${esc(RESIDENTS[who].name)}</button>${placeHtml(s, true)}`;
    el.querySelector('[data-a="reopen"]')?.addEventListener('click', () => {
      ui.dismissed = '';
      ui.sheetKey = '';
      render(false);
    });
    for (const b of el.querySelectorAll<HTMLElement>('[data-go]'))
      b.addEventListener('click', () => choose(s, b.dataset.go as Place));
    return;
  }
  const html = doorHtml(s, who, faces);
  if (conversation && el.classList.contains('conversation') && el.dataset.who === who) {
    // Preserve the actual action buttons through asynchronous speech and departures.
    const fresh = document.createElement('div');
    fresh.innerHTML = html;
    const context = el.querySelector('.door-context') as HTMLElement;
    const next = fresh.querySelector('.door-context') as HTMLElement;
    if (context.querySelector('details')?.open) next.querySelector('details')?.setAttribute('open', '');
    if (context.innerHTML !== next.innerHTML) {
      context.innerHTML = next.innerHTML;
      wireDoor(s, context, who);
    }
    for (const button of el.querySelectorAll<HTMLButtonElement>('.verbs button')) {
      const nextButton = fresh.querySelector<HTMLButtonElement>(`[data-a=${button.dataset.a}]`);
      if (!nextButton) continue;
      button.disabled = nextButton.disabled;
      if (button.innerHTML !== nextButton.innerHTML) button.innerHTML = nextButton.innerHTML;
    }
  } else {
    el.classList.toggle('conversation', conversation);
    el.dataset.who = who;
    el.dataset.submenu = submenu;
    el.innerHTML = html;
    wireDoor(s, el, who);
  }
}

function lastVoice(s: GameState): string {
  const x = s.said.at(-1);
  return x ? `${x.at}${x.text.length}` : '';
}

function canSwap(s: GameState) {
  const open = openTasks(s);
  return (
    s.swappedDay !== dayOf(s.minute) &&
    ['hacer', 'sevim'].every((id) => open.some((t) => t.carried && t.kind === 'bread' && t.for === id))
  );
}

function placeHtml(s: GameState, _small = false): string {
  const at = s.k.at;
  const bits: string[] = [];
  if (canSwap(s))
    bits.push('<button class="prank" data-a="swap">Swap Hacer’s and Sevim’s newspapers</button>');

  if (at.startsWith('door:')) {
    const id = at.slice(5) as Rid;
    const r = rOf(s, id);
    if (r.where === 'asleep')
      bits.push(
        `<div class="hand soft">It is quiet behind the door.</div><button data-a="knock">Ring the bell anyway</button>`,
      );
    else if (r.where !== 'home') bits.push(`<div class="hand soft">${esc(RESIDENTS[id].name)} is out.</div>`);
  }
  if ((at === 'step' || at === 'room') && s.gateUntil < s.minute)
    bits.push(`<button class="prank" data-a="gate">Leave the courtyard gate open</button>`);
  return bits.join('');
}

function departureLine(s: GameState, who: Rid) {
  return rOf(s, who).where === 'asleep'
    ? `${RESIDENTS[who].name} has gone back to sleep.`
    : `${RESIDENTS[who].name} has gone.`;
}

function doorHtml(s: GameState, who: Rid, faces: Rid[]): string {
  const info = RESIDENTS[who];
  const r = rOf(s, who);
  const read = readOf(s, who);
  const lastLine = [...s.said]
    .reverse()
    .find((x) => x.who === who && dayOf(x.at) === dayOf(s.minute) && s.minute - x.at < 30);
  const tabs =
    faces.length > 1
      ? `<div class="faces">${faces.map((f) => `<button class="${f === who ? 'on' : ''}" data-face="${f}" aria-pressed="${f === who}">${RESIDENTS[f].name}</button>`).join('')}</div>`
      : '';
  const head = `${tabs}<div class="who"><b>${esc(info.call)}</b><span class="soft small">flat ${info.flat} · ${esc(read.warmth)} ${esc(read.word)}</span><button class="x" data-a="close" aria-label="Close conversation">✕</button></div>
    <div class="availability soft" aria-live="polite"></div>${lastLine ? `<div class="hand said">${esc(lastLine.text)}</div>` : `<div class="soft small">${esc(info.blurb)}</div>`}`;
  const grudge = r.grudges.find((g) => !ui.grudgeSaid.has(`${who}:${g.at}`));
  if (ui.sheet === 'tell') {
    const items = tellables(s, who);
    return `${head}<div class="soft small">Tell ${esc(info.name)}…</div><div class="tells">${items
      .map(
        (t, i) => `<div class="tell"><span>${esc(t.words)} <span class="hand soft">${t.sure}</span></span>
        <span class="row"><button data-tell="${i}" data-sure="0">as I heard it</button><button data-tell="${i}" data-sure="1">for certain</button></span></div>`,
      )
      .join('')}${items.length === 0 ? '<div class="soft">You have no news to pass on yet.</div>' : ''}</div>
      <div class="row"><button data-a="invent">Make something up…</button><button data-a="back">Back</button></div>`;
  }
  if (ui.sheet === 'invent') {
    if (!ui.inventAbout)
      return `${head}<div class="soft small">About whom?</div><div class="chips">${RIDS.filter(
        (x) => x !== who,
      )
        .map((x) => `<button data-about="${x}">${RESIDENTS[x].name}</button>`)
        .join('')}</div><button data-a="back">Back</button>`;
    const about = ui.inventAbout;
    const sweet = RESIDENTS[about].single
      ? RIDS.filter((x) => x !== about && RESIDENTS[x].single)
          .map(
            (x) => `<button data-trait="sweet:${x}">has romantic feelings for ${RESIDENTS[x].name}</button>`,
          )
          .join('')
      : '';
    return `${head}<div class="soft small">${esc(RESIDENTS[about].name)}…</div><div class="chips">${INVENTABLE.map(
      (t) => `<button data-trait="${t}">${INVENT_WORDS[t]}</button>`,
    ).join('')}${sweet}</div><button data-a="back">Back</button>`;
  }
  const carriedOther = openTasks(s).filter((t) => t.carried && t.kind === 'parcel' && t.for !== who);
  const present = faces.includes(who);
  const departure = departureLine(s, who);
  const asked = r.newsDay === dayOf(s.minute);
  const sat = r.sitDay === dayOf(s.minute);
  const speech = lastLine?.text ?? '';
  const longSpeech = speech.length > 240;
  const spoken = longSpeech
    ? `<details><summary>Read ${esc(info.name)}’s full answer</summary><div class="hand said">${esc(speech)}</div></details>`
    : `<div class="hand said">${esc(speech)}</div>`;
  const title = `<div class="who"><b>${esc(info.call)}</b><button class="x" data-a="close" aria-label="Close conversation">✕</button></div>`;
  return `${title}<div class="door-context">${tabs}<div class="soft small">flat ${info.flat} · ${esc(read.warmth)} ${esc(read.word)}</div>
    ${present ? (lastLine ? spoken : `<div class="soft small">${esc(info.blurb)}</div>`) : `<div class="hand departure">${esc(departure)}</div>`}
    ${grudge ? `<div class="hand rope">“I hear you’ve been saying things about me.”</div>` : ''}
    ${present && s.month ? carriedOther.map((t) => `<button data-entrust="${t.id}">Ask ${esc(info.name)} to keep ${esc(nameOf(t.for))}’s parcel sealed</button>`).join('') : ''}
    ${present ? carriedOther.map((t) => `<button class="prank" data-mis="${t.id}">Leave ${esc(RESIDENTS[t.for].name)}’s ${esc(t.label.replace(/^a /, ''))} here</button>`).join('') : ''}</div>
    <div class="verbs lk-commit">
      <button data-a="news" ${asked || !present ? 'disabled' : ''}>Anything new?${asked ? '<span class="h">You asked today. Ask again tomorrow.</span>' : ''}</button>
      <button data-rest>Take a ten-minute break</button>
      <button data-a="tell" ${!present ? 'disabled' : ''}>Tell…</button>
      ${canReplyBuilding(s, who) ? `<button data-reply="thank">Thank you for telling me</button><button data-reply="listen">I am listening</button><p class="soft small">A reply takes two minutes. They can choose to leave the subject.</p>` : ''}
      <button data-a="sit" ${sat || !present ? 'disabled' : ''}>Sit together${sat ? '<span class="h">You sat together today. Return tomorrow.</span>' : ''}</button>
      ${who === 'derya' ? `<button data-a="sit-boundaries" ${sat || !present ? 'disabled' : ''}>Ask about work boundaries and training${sat ? '<span class="h">You sat together today. Return tomorrow.</span>' : ''}</button>` : ''}
${s.month && dayOf(s.minute) >= 15 && s.secrets[PRIVATE_FACTS[who]] !== undefined && !s.month.helped[who] ? `<button data-help-story ${!present || s.k.at !== `door:${who}` ? 'disabled' : ''}>Offer to ${esc(PRIVATE_WORK[who].label)}<span class="h">A private confidence and their agreement are needed. It takes time before seven.</span></button>` : ''}
      ${
        s.month
          ? `<details><summary>Ask about Sunday seating</summary>${RIDS.filter((id) => id !== who)
              .map(
                (id) =>
                  `<button data-seat="${id}" ${!present ? 'disabled' : ''}>Would you sit beside ${esc(nameOf(id))}?</button>`,
              )
              .join('')}<p>Both residents must agree. Their votes stay their own.</p></details>`
          : ''
      }
${s.month && who === 'tarik' && s.stories?.fund.agreed && s.month.duesBalance > 0 ? `<button data-repayment ${!present ? 'disabled' : ''}>Offer to arrange the private repayment<span class="h">Tarık needs the agreed money. Both residents must be free at home.</span></button>` : ''}
      <button data-a="word" ${r.word || !present ? 'disabled' : ''}>${s.month && dayOf(s.minute) >= 22 ? 'Will you support renewing my agreement on Sunday?' : 'Will you support my raise on Sunday?'}<span class="h">${r.word ? (r.word === 'yes' ? 'promised' : 'said no') : wordHint(s, who)}</span></button>
    </div>`;
}

const INVENT_WORDS: Record<string, string> = {
  stingy: 'is unwilling to spend money',
  nosy: 'is nosy',
  lazy: 'is lazy',
  unreliable: 'is unreliable',
  kind: 'is kind',
  generous: 'is generous',
  hardworking: 'works hard',
};

function wireDoor(s: GameState, el: HTMLElement, who: Rid) {
  const on = (sel: string, f: (b: HTMLElement) => void) => {
    for (const b of el.querySelectorAll<HTMLElement>(sel)) b.addEventListener('click', () => f(b));
  };
  const reset = () => {
    ui.sheetKey = '';
    render(false);
  };
  const r = rOf(s, who);
  for (const g of r.grudges) ui.grudgeSaid.add(`${who}:${g.at}`);
  on('[data-face]', (b) => {
    selection = null;
    ui.sheetFor = b.dataset.face as Rid;
    ui.sheet = 'none';
    reset();
  });
  on('[data-a="close"]', () => {
    ui.dismissed = `${s.k.at}:${who}`;
    ui.sheetFor = who;
    ui.sheet = 'none';
    reset();
  });
  on('[data-a="news"]', () => send({ kind: 'news', who }));
  on('[data-rest]', () => send({ kind: 'rest' }));
  on('[data-a="word"]', () => send({ kind: 'word', who }));
  on('[data-a="sit"]', () => send({ kind: 'sit', who }));
  on('[data-reply]', (b) => send({ kind: 'reply', who, reply: b.dataset.reply as 'thank' | 'listen' }));
  on('[data-a="sit-boundaries"]', () => send({ kind: 'sit', who, topic: 'boundaries' }));
  on('[data-a="tell"]', () => {
    ui.sheet = 'tell';
    ui.sheetFor = who;
    reset();
  });
  on('[data-a="invent"]', () => {
    ui.sheet = 'invent';
    ui.inventAbout = null;
    reset();
  });
  on('[data-a="back"]', () => {
    ui.sheet = ui.sheet === 'invent' && ui.inventAbout ? 'invent' : ui.sheet === 'invent' ? 'tell' : 'none';
    ui.inventAbout = null;
    reset();
  });
  on('[data-about]', (b) => {
    ui.inventAbout = b.dataset.about as Rid;
    reset();
  });
  on('[data-trait]', (b) => {
    const about = ui.inventAbout;
    if (!about) return;
    ui.sheet = 'none';
    ui.inventAbout = null;
    send({ kind: 'invent', who, about, trait: b.dataset.trait as string });
  });
  const displayedTellables = tellables(s, who);
  on('[data-tell]', (b) => {
    const t = displayedTellables[Number(b.dataset.tell)];
    if (!t) return;
    ui.sheet = 'none';
    send({ kind: 'tell', who, prop: t.prop, value: t.value, sure: b.dataset.sure === '1' });
  });
  on('[data-entrust]', (b) => send({ kind: 'entrust', who, task: Number(b.dataset.entrust) }));
  on('[data-help-story]', () => send({ kind: 'help-story', who }));
  on('[data-repayment]', () => send({ kind: 'repayment' }));
  on('[data-seat]', (b) => send({ kind: 'seat', who, beside: b.dataset.seat as Rid }));
  on('[data-mis]', (b) => send({ kind: 'misdeliver', who, task: Number(b.dataset.mis) }));
}

// ---------- the notebook ----------

function secretProps(s: GameState) {
  return s.stories ? [...SECRET_PROPS, ...STORY_SECRETS, ...PRIVATE_SECRETS] : SECRET_PROPS;
}

function notebookHtml(s: GameState): string {
  const props = secretProps(s);
  const found = props.filter((x) => s.secrets[x.prop] !== undefined);
  const flats = RIDS.map((id) => {
    const rd = readOf(s, id);
    return `<div class="flatline"><b>flat ${RESIDENTS[id].flat}</b> <span class="hand soft">${esc(rd.warmth)} ${esc(rd.word)}</span></div>`;
  }).join('');
  return `<div class="who"><b>The notebook</b><button class="x" data-a="close">✕</button></div>
    <div class="nb">
    <h3>The flats</h3>${flats}
    <h3>What you have learned <span class="soft small">${found.length} of ${props.length}</span></h3>
    ${props.map((x) => (s.secrets[x.prop] !== undefined ? `<div>· ${esc(x.title)}</div>` : `<div class="soft">· …</div>`)).join('')}
    <h3>Stamps: things you have done</h3><div>${s.stamps.length ? s.stamps.map((x) => esc(STAMPS[x.id] ?? x.id)).join(' · ') : '<span class="soft">none yet</span>'}</div>
    </div>`;
}

const STAMPS: Record<string, string> = {
  safe_parcel: 'A sealed parcel reached its owner',
  kept_dates: 'Tarık completed the agreed building payments',
  private_hacer: 'Held the walls of Hacer’s paper room',
  private_sevim: 'Helped with Sevim’s unnamed lesson example',
  private_burak: 'Helped Burak finish his moving ferry',
  private_derya: 'Helped Derya arrange her private letters',
  private_tarik: 'Helped Tarık listen to his chosen bird recording',
  two_cups: 'Two cups',
  warm_stairs: 'Warm stairs',
  caught: 'Caught telling different stories',
  treat: 'Received a snack for gossip',
  wrong_door: 'The wrong door',
  gate: 'The gate left open',
  swap: 'Swapped newspapers',
  confided: 'Derya trusted you',
  envelope: 'Tarık’s envelope',
  paper_ferry: 'Held the fold in Burak’s paper harbour',
  raise: 'Tea money increased',
  cat: 'Pamuk',
  word_back: 'They heard what you said',
};

// ---------- night and Sunday ----------

function nightPage(s: GameState) {
  const d = dayOf(s.minute);
  const rep = s.reports.find((x) => x.day === d);
  const tonight = s.said.filter((x) => x.at >= dayStart(d) + 20 * 60 && x.kind !== 'heard');
  const heard = s.said.filter((x) => dayOf(x.at) === d && x.kind === 'heard').slice(-3);
  const talks = s.talks.filter((t) => dayOf(t.at) === d && t.props.length > 0).length;
  const margin = nightMargin(s, d);
  const open =
    OPEN_Q[d] ??
    (s.month && d % 7 === 6
      ? 'Tomorrow at eleven, the residents meet again. Everyone keeps their own vote.'
      : '');
  app().innerHTML = `<div class="page night">${topbar(`${dayLabel(s)}, night`)}<div class="state-strip"><div class="order-pips">${s.tasks
    .filter((t) => dayOf(t.by) === d)
    .map(
      (t) =>
        `<span class="pip ${t.done ? (t.done > t.by ? 'late' : 'done') : 'missed'}">${t.done ? (t.done > t.by ? '◩' : '■') : '□'}</span>`,
    )
    .join('')}</div><span>₺${s.k.money} in the tin</span></div><main class="page-body">
    <p>${rep ? `You completed ${rep.done} ${rep.done === 1 ? 'job' : 'jobs'} on time.${rep.late ? ` You completed ${rep.late} ${rep.late === 1 ? 'job' : 'jobs'} late.` : ''}${rep.missed ? ` You did not complete ${rep.missed} ${rep.missed === 1 ? 'job' : 'jobs'}.` : ''}` : ''} You received <span class="money">₺${rep?.tips ?? 0}</span> in tips. You have <span class="money">₺${s.k.money}</span> in your tin.</p>
    ${rep?.treats.length ? `<p>You received ${rep.treats.map(esc).join(', ')}.</p>` : ''}
    <p class="soft">The residents talked ${talks === 0 ? 'about nothing much' : talks < 6 ? 'a little' : talks < 14 ? 'a fair bit' : 'all day'} on the stairs and the step.</p>
    ${heard.length ? `<div class="heardbox">${heard.map((x) => `<div class="heard">… ${esc(x.text)}</div>`).join('')}</div>` : ''}
    ${tonight.map(saidLine).join('')}
    <div class="flats">${RIDS.map((id) => {
      const rd = readOf(s, id);
      return `<div class="flatline"><b>${esc(rd.warmth)}</b> <span class="hand soft">${esc(rd.word)}</span></div>`;
    }).join('')}</div>
    ${margin ? `<div class="margin hand">${esc(margin)} <span class="soft">— R.</span></div>` : ''}
    ${open ? `<p class="open hand">${esc(open)}</p>` : ''}
    </main><div class="action-bar"><button class="primary" data-a="next">${d % 7 === 6 ? 'Sunday: the meeting' : `Turn the page: ${dayName(d + 1)}`}</button>
    </div>
  </div>`;
  mountMenu(app().querySelector('.menu-slot'), s);
  app()
    .querySelector('[data-a="next"]')
    ?.addEventListener('click', () => send({ kind: 'next' }));
  app().querySelector('[data-a="title"]')?.addEventListener('click', titlePage);
}

const OPEN_Q: Record<number, string> = {
  1: 'A courier will come tomorrow. Rıza wrote: “Read the labels. Everyone does.”',
  2: 'The radiators ticked and went quiet around midnight.',
  3: 'Who is the man at flat 5?',
  4: 'Tomorrow is Friday. Mr Tarık has been wanting to talk with you.',
  5: 'Burak asked what the weather will be like on the roof on Saturday evening.',
  6: 'The meeting is tomorrow at eleven. The residents will vote on your tea money.',
};

function nightMargin(s: GameState, d: number): string {
  const told = s.residents.filter((r) => r.told.some((x) => dayOf(x.at) === d)).map((r) => r.id);
  const caught = s.residents.some(
    (r) => r.caught.some((m) => dayOf(m) === d) || r.grudges.some((g) => dayOf(g.at) === d),
  );
  if (caught)
    return 'People heard what you said about them. That always happens in a building. Stay quiet for a day.';
  if (told.includes('hacer')) return 'Whatever you tell Hacer, people on the step hear by six.';
  if (told.length === 0 && d === 1)
    return 'You said nothing to anyone today. They will decide whether you are wise or dull.';
  if (d === 2)
    return 'I did the same with a parcel in 1994. I decided never to do it again. I mostly kept to that.';
  if (d === 3)
    return 'Burak is careful, not dishonest. When the building is cold, people forget the difference.';
  if (d === 4)
    return 'Derya treats the people in this building well. Remember that when people talk about her.';
  if (d === 5) return 'Mr Tarık is proud. Carry his shopping and never mention the stairs.';
  return 'Go to sleep. You need to collect bread at seven.';
}

/** Rıza's optional game reckoning uses only recorded work and the meeting's hands. */
function weekTallyHtml(s: GameState): string {
  const onTime = s.reports.reduce((n, day) => n + day.done, 0);
  const late = s.reports.reduce((n, day) => n + day.late, 0);
  const hands = s.meeting?.yes ?? 0;
  const total = 2 * onTime + late + 5 * hands;
  return `<section data-week-tally id="week-tally" hidden aria-label="Rıza’s week tally">
    <h3>Rıza’s week tally: ${total}</h3>
    <p>On-time jobs ${onTime} × 2 + late jobs ${late} × 1 + hands raised ${hands} × 5 = ${total}.</p>
    <p class="hand soft">This total counts your work in the game. It does not measure anyone’s worth. “I added it up for the notebook.” — Rıza</p>
  </section>`;
}

const closingPending = new WeakSet<GameState>();
const closingFailures = new WeakMap<GameState, string>();
async function closeNotebook(s: GameState): Promise<void> {
  if (closingPending.has(s)) return;
  closingPending.add(s);
  closingFailures.delete(s);
  // Record the existing closing input once. A retry only repeats publication.
  let result: PublicationResult | undefined;
  try {
    const publication = s.phase === 'sunday' ? send({ kind: 'next' }) : checkpointContinuity();
    render(false);
    result = await publication;
  } finally {
    closingPending.delete(s);
  }
  if (ui.s !== s) return;
  if (result && !result.ok) {
    closingFailures.set(s, result.failures.map((failure) => `${failure.name}: ${failure.error}`).join(' '));
    render(false);
  } else if (result?.cancelled) render(false);
  else titlePage();
}

function sundayPage(s: GameState) {
  labScreen('ending');
  const m = s.meeting;
  const lines = s.said.filter((x) => dayOf(x.at) === dayOf(s.minute));
  const total = s.reports.reduce((a, x) => a + x.tips, 0);
  const secrets = Object.keys(s.secrets).length;
  const caught = s.residents.reduce((a, r) => a + r.caught.length + r.grudges.length, 0);
  const share = `In my ${s.month ? 'month' : 'first week'} in The Stairwell, I saved ₺${s.k.money} and found ${secrets} of ${secretProps(s).length} secrets. I was caught telling stories ${caught} ${caught === 1 ? 'time' : 'times'}. My tea money ${m?.raise ? 'went up' : 'stayed the same'}, with ${m?.yes ?? 0} ${m?.yes === 1 ? 'vote' : 'votes'} for a raise.${s.ring.answer === 'yes' ? ' I helped with a paper ferry.' : ''}${s.catHome ? ' A cat lives on the step.' : ''}`;
  app().innerHTML = `<div class="page sunday">${topbar(`${dayLabel(s)} · the meeting`)}<main class="page-body">
    ${lines.map(saidLine).join('')}
    <div class="votes">${RIDS.map((id) => {
      const r = rOf(s, id);
      const kept = r.word === 'yes' && r.vote === 'yes';
      const broke = r.word === 'yes' && r.vote === 'no';
      return `<div class="flatline"><b>${RESIDENTS[id].name}</b> <span class="hand ${r.vote === 'yes' ? 'moss' : 'soft'}">${r.vote === 'yes' ? (s.month?.stay !== null && s.month ? 'voted to renew your agreement' : 'voted for your raise') : r.vote === 'away' ? 'did not come' : (s.month?.stay !== null && s.month ? 'voted against renewing your agreement' : 'voted against your raise')}</span>${kept ? ' <span class="soft small">as promised</span>' : broke ? ' <span class="rope small">despite a promise</span>' : ''}</div>`;
    }).join('')}</div>
    <p>You received <span class="money">₺${total}</span> in tips ${s.month ? 'so far this month' : 'over six days'}.${m?.raise ? ' Your tea money will increase.' : ''} You have <span class="money">₺${s.k.money}</span> in your tin.</p>
    <p>${s.ring.answer === 'yes' ? 'Burak showed his moving paper ferry. ' : s.ring.answer === 'not yet' ? 'Burak kept his paper project private. ' : 'Burak has his own unfinished work. '}${s.catHome ? 'Pamuk sleeps on the step.' : ''}</p>
    <p class="story-outcomes">${s.stories?.feud.reconciled ? 'Hacer and Sevim rewrote the notice over tea. ' : ''}${s.stories?.fund.repaired ? 'The new pump is running. The repair is recorded in the fund book.' : ''}</p>
    <div class="margin hand">${s.month ? (s.month.stay === null ? 'There is another working week ahead. The building remembers this one.' : s.month.stay ? 'Your agreement is renewed. The building still needs its daily work.' : 'The agreement ends here. Your work and the people you met remain in this notebook.') : m?.raise ? 'You did well in your first week. They will want more next week.' : 'Your first week is over. Next week they will know you better.'} <span class="soft">— R.</span></div>
    <button data-a="see-tally" aria-controls="week-tally" aria-expanded="false">See the tally</button>${weekTallyHtml(s)}
    <div class="share"><div class="soft small">To share:</div><div class="hand">${esc(share)}</div><button data-a="copy">Copy</button></div>
    <p class="soft small" data-save-status>${fileMode === 'file' ? 'Progress stays in this page. Download this run before closing.' : saveFailure ? esc(saveFailure) : cachedSaved ? `Saved through ${dayLabel(cachedSaved.engine.world)} ${clockOf(cachedSaved.minute)}.` : 'The complete notebook has not been saved yet.'}</p>
    ${closingFailures.has(s) ? `<section data-publication-failure><p role="status">Character progress could not be saved to ${PEOPLE_ACROSS_GAMES}. Your local notebook is saved. ${esc(closingFailures.get(s) ?? '')} Download this run to keep a copy. Use the recovery controls below if the local recovery archive is full, then retry Close the notebook.</p><a href="https://human.adamwhite.work/lab/people/" target="_blank" rel="noopener">Check ${PEOPLE_ACROSS_GAMES} (Hacer and Sevim can transfer here)</a></section>` : ''}
    </main><div class="action-bar"><div class="row"><button data-a="feedback">Feedback</button><button data-a="download">Download this run</button></div>${s.month && s.month.stay === null ? '<button class="primary" data-a="next">Begin the next week</button>' : `<button class="primary" data-a="title" ${closingPending.has(s) ? 'disabled' : ''}>Close the notebook</button>`}</div>
  </div>`;
  mountMenu(app().querySelector('.menu-slot'), s);
  if (closingFailures.has(s))
    void continuityPanel().then((panel) => {
      if (ui.s === s) app().querySelector('[data-publication-failure]')?.append(panel);
    });
  app()
    .querySelector('[data-a="see-tally"]')
    ?.addEventListener('click', (event) => {
      const tally = app().querySelector<HTMLElement>('[data-week-tally]');
      if (!tally) return;
      tally.hidden = !tally.hidden;
      (event.currentTarget as HTMLElement).setAttribute('aria-expanded', String(!tally.hidden));
    });
  app()
    .querySelector('[data-a="copy"]')
    ?.addEventListener('click', () => navigator.clipboard?.writeText(share).catch(() => {}));
  app()
    .querySelector('[data-a="feedback"]')
    ?.addEventListener('click', () => openFeedback(() => runOf(s), undefined, chooseContinuityRecording));
  app()
    .querySelector('[data-a="download"]')
    ?.addEventListener('click', () => {
      void downloadLatest(s);
    });
  app()
    .querySelector('[data-a="title"]')
    ?.addEventListener('click', () => {
      void closeNotebook(s);
    });
  app()
    .querySelector('[data-a="next"]')
    ?.addEventListener('click', () => send({ kind: 'next' }));
}

export const _debug = {
  begin,
  titlePage,
  continueNotebook,
  showLoadError,
  get s() {
    return ui.s;
  },
  send,
  frame: loop,
  queueMinutes: (minutes: number) => {
    ui.acc = minutes;
  },
  render: () => render(false),
  advance: async (n: number) => {
    if (!ui.s) return;
    for (let i = 0; i < n && ui.s.phase === 'day'; i++) await mutate(ui.s, { kind: 'step' });
    render(false);
  },
  step: async (n: number) => {
    const s = ui.s;
    if (!s) return;
    for (let i = 0; i < n && s.phase === 'day'; i++) await mutate(s, { kind: 'step' });
    render(true);
  },
};
