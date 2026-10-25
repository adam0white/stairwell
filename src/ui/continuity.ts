/** Browser-local continuity. Saves retain their accepted head, never the latest shelf head. */
import {
  createPersona,
  type PersonaEnvelope,
  personaChannel,
  validatePersona,
  watchPersonaCheckpoint,
} from '@adam0white/lab-client';
import { personaControls } from '@adam0white/lab-kit';
import { act, type GameState, newGame, personOf } from '../sim/game.ts';
import { applyDeryaReturn, createDeryaCheckpoint, prepareDeryaReturn } from '../sim/one-cast.ts';
import { lab } from './lab.ts';
import { acceptLocalPersona } from './local-persona.ts';
export const shelf = personaChannel();
let current: () => GameState | undefined = () => undefined;
let store: () => void = () => {};
let loadArrival: ((game: GameState) => Promise<void>) | undefined;
let pending: Promise<void> = Promise.resolve();
let bridgeStatus = '';
let linkageKnown = false;
let gateSerial = 0;
let gatedGame: GameState | undefined;
let gatedFile = false;
let manualDenied: GameState | undefined;
const choices: Promise<void> = Promise.resolve();
/** Invalidate before any asynchronous run/load/reset work. Never consult gated playerId. */
export function invalidateContinuity(): void {
  ++gateSerial;
  gatedGame = undefined;
  gatedFile = false;
  linkageKnown = false;
  lab.setPersonaRecording('pending-history');
  lab.allowPersonaRecording(true);
}
if (typeof window !== 'undefined') {
  const identityChanged = () => {
    const g = gatedGame;
    const file = gatedFile || Boolean(g?.oneCast?.scope === 'file');
    invalidateContinuity();
    void gateContinuity(g, file).catch(() => {});
  };
  window.addEventListener('storage', (event) => {
    if (event.key === null) identityChanged();
  });
}
const build = () => lab.build().c ?? 'development';
const message = (error: unknown) =>
  error instanceof Error ? error.message : 'Character history is unavailable. Download a copy of your game.';
const recordingKey = (g: GameState) => g.oneCast?.head?.branchId ?? g.oneCast?.recordingFileKey ?? null;
const headsOf = (g: GameState) => (g.oneCast?.head ? [g.oneCast.head] : []);
const selected = (g: GameState) =>
  headsOf(g)
    .map((h) => `${h.castId}/${h.branchId}/${h.revision}`)
    .join(':');
export async function gateContinuity(g: GameState | undefined, file = false): Promise<void> {
  ++gateSerial;
  gatedGame = g;
  gatedFile = file;
  linkageKnown = true;
  lab.setPersonaRecording(null);
  lab.allowPersonaRecording(true);
}
export async function chooseContinuityRecording(_value: boolean): Promise<void> {
  // Compatibility only. Recording is controlled by the menu switch.
}
const CAST = 'hf.cast.derya.stairwell';
let candidate: PersonaEnvelope | null = null;
type Arrival = { envelope: PersonaEnvelope; prefix: GameState; seed: number; scope: 'shared' | 'file' };
let pendingArrival: Arrival | undefined;
let conflict: { envelope: PersonaEnvelope; game: GameState; prefix: GameState } | undefined;
const RECOVERY_INDEX = 'stairwell-one-cast-recoveries';
function ensureGeneration(serial: number): void {
  if (serial !== gateSerial)
    throw new Error(
      'The character history action was cancelled because you selected another game or recording identity.',
    );
}
type Recovery =
  | { game: GameState }
  | { arrival: Arrival; admission: Awaited<ReturnType<typeof prepareDeryaReturn>> };
function keepRecovery(revision: string, recovery: Recovery, accepted = true): void {
  localStorage.setItem(`stairwell-one-cast-recovery:${revision}`, JSON.stringify({ ...recovery, accepted }));
  const revisions = JSON.parse(localStorage.getItem(RECOVERY_INDEX) ?? '[]') as string[];
  if (!revisions.includes(revision))
    localStorage.setItem(RECOVERY_INDEX, JSON.stringify([...revisions, revision]));
}
function departureKey(branch: string, revision: string): string {
  return `stairwell-one-cast-prefix:${branch}:${revision}`;
}
function savePrefix(envelope: PersonaEnvelope, prefix: GameState, accepted = false): void {
  localStorage.setItem(departureKey(envelope.branchId, envelope.revision), JSON.stringify(prefix));
  if (accepted) localStorage.setItem(`stairwell-one-cast-active:${envelope.branchId}`, envelope.revision);
}
function readPrefix(envelope: PersonaEnvelope): GameState | undefined {
  const admission = envelope.transfer.admission as { sourceRevision?: string } | undefined;
  const revision = admission?.sourceRevision;
  if (typeof revision !== 'string' || !/^[a-f0-9]{64}$/.test(revision))
    throw new Error(
      'This character cannot return because the file does not identify the exact earlier save it needs.',
    );
  const raw = localStorage.getItem(departureKey(envelope.branchId, revision));
  return raw ? (JSON.parse(raw) as GameState) : undefined;
}
function addRow(s: GameState, envelope: PersonaEnvelope, stage: string): void {
  s.oneCast ??= { rows: [] };
  s.oneCast.rows.push({
    v: 1,
    probe: 'derya',
    arm: s.oneCast.admission ? 'continuing' : 'fresh',
    scope: s.oneCast.originScope ?? s.oneCast.scope ?? 'shared',
    castId: envelope.castId,
    branchId: envelope.branchId,
    revision: envelope.revision,
    parentRevision: envelope.parentRevision,
    stage,
    outcome: 'accepted',
  });
}
/** Only a new chapter can admit an arriving person. Current runs remain pinned. */
export async function arrive(seed: number, fresh = false): Promise<GameState> {
  const serial = gateSerial;
  await shelf.ready;
  ensureGeneration(serial);
  lab.setPersonaRecording('pending-history');
  let game = newGame(seed);
  try {
    const envelope =
      !fresh &&
      (candidate ??
        (shelf.enabled
          ? await shelf.request<PersonaEnvelope | null>({ action: 'get', castId: CAST })
          : null));
    ensureGeneration(serial);
    if (envelope && envelope.source.game === 'hearsay') {
      const prefix = readPrefix(envelope);
      if (!prefix)
        throw new Error(
          'This character cannot return because this browser has no matching save from when they left The Stairwell. You can still start a new week without earlier character history.',
        );
      const scope = candidate?.revision === envelope.revision ? 'file' : 'shared';
      pendingArrival = { envelope, prefix, scope, seed };
      game = await claimArrival(pendingArrival, undefined, serial);
      ensureGeneration(serial);
      pendingArrival = undefined;
      candidate = null;
      lab.milestone('one cast eligible');
      lab.milestone('one cast import');
    }
  } catch (error) {
    if (serial !== gateSerial) throw error;
    bridgeStatus = message(error);
    if (!/conflict/i.test(bridgeStatus)) pendingArrival = undefined;
    lab.milestone('one cast bridgefail');
  }
  return game;
}
async function claimArrival(
  arrival: Arrival,
  pinnedAdmission?: Awaited<ReturnType<typeof prepareDeryaReturn>>,
  serial = gateSerial,
): Promise<GameState> {
  const admission =
    pinnedAdmission ?? (await prepareDeryaReturn(arrival.envelope, arrival.prefix, { build: build() }));
  ensureGeneration(serial);
  const { revision, ...body } = arrival.envelope;
  const claim = await createPersona({
    ...body,
    parentRevision: revision,
    source: { game: 'stairwell', build: build(), engine: '2.21.0', rules: '8' },
    transfer: {
      ...body.transfer,
      admission: { adapter: 'stairwell-one-cast/1', claimId: crypto.randomUUID() },
    },
  });
  ensureGeneration(serial);
  const game = applyDeryaReturn(arrival.prefix, admission);
  game.oneCast!.head = claim;
  game.oneCast!.scope = arrival.scope;
  addRow(game, claim, 'admitted');
  // Persist recoverable full state before the atomic claim can leave this origin.
  keepRecovery(claim.revision, { game }, false);
  if (arrival.scope === 'file') await acceptLocalPersona(claim, { arrival: arrival.envelope });
  else await shelf.request({ action: 'put', envelope: claim });
  keepRecovery(claim.revision, { game });
  if (serial !== gateSerial) {
    throw new Error(
      'The continued game was accepted and saved for recovery because you selected another game.',
    );
  }

  return game;
}
/** Call only after this exact accepted game has validated, gated and saved successfully. */
export function acknowledgeContinuity(game: GameState): void {
  const revision = game.oneCast?.head?.revision;
  if (!revision) return;
  localStorage.removeItem(`stairwell-one-cast-recovery:${revision}`);
  const revisions = JSON.parse(localStorage.getItem(RECOVERY_INDEX) ?? '[]') as string[];
  localStorage.setItem(RECOVERY_INDEX, JSON.stringify(revisions.filter((r) => r !== revision)));
}
export async function validateContinuity(game: GameState): Promise<void> {
  const cast = game.oneCast;
  if (!cast) return;
  if (!Array.isArray(cast.rows) || cast.rows.length > 128)
    throw new Error('This character history save is unsupported.');
  if (cast.head) await validatePersona(cast.head);
  if (cast.head || cast.admission) {
    // Adapter validation checks the replay-pinned admission, never the current shared head.
    const { validateDeryaContinuity } = await import('../sim/one-cast.ts');
    await validateDeryaContinuity(game);
  }
}
export function checkpointContinuity(): Promise<void> {
  const game = current();
  if (!game?.oneCast?.departure || (!shelf.enabled && game.oneCast.scope !== 'file'))
    return Promise.resolve();
  const queued = gateSerial;
  pending = pending
    .catch(() => {})
    .then(async () => {
      if (current() !== game || queued !== gateSerial) return;
      let envelope: PersonaEnvelope | undefined;
      let prefix: GameState | undefined;
      try {
        const serial = gateSerial;
        const prior = game.oneCast?.head;
        const scope = game.oneCast?.scope ?? 'shared';
        const author = !prior && !game.oneCast?.originScope && gatedGame === game;
        if (serial !== gateSerial || current() !== game) return;
        prefix = structuredClone(game);
        envelope = await createDeryaCheckpoint(prefix, {
          build: build(),
          branchId: prior?.branchId ?? crypto.randomUUID(),
          parentRevision: prior?.revision ?? null,
        });
        if (
          prior &&
          JSON.stringify(prior.transfer.checkpoint) === JSON.stringify(envelope.transfer.checkpoint)
        ) {
          envelope = prior;
          if (serial !== gateSerial || current() !== game) return;
          if (scope === 'file') await acceptLocalPersona(prior);
          else await shelf.request({ action: 'put', envelope: prior });
          if (serial === gateSerial && current() === game)
            bridgeStatus = 'The accepted character save is still active and has not changed.';
          return;
        }
        if (serial !== gateSerial || current() !== game) return;
        // Retain the complete source prefix before advertising its projection.
        savePrefix(envelope, prefix);
        if (scope === 'file') await acceptLocalPersona(envelope);
        else {
          const request = {
            action: 'put' as const,
            envelope,
            authored: author,
          };
          await shelf.request(request);
        }
        const owner = current() === game && serial === gateSerial;
        const record = owner ? game : prefix;
        record.oneCast!.head = envelope;
        record.oneCast!.scope = scope;
        record.oneCast!.lastCheckpoint = structuredClone(personOf(prefix, 'derya'));
        record.oneCast!.sourcePrefix = {
          seed: prefix.seed,
          inputs: structuredClone(prefix.inputs),
          minute: prefix.minute,
          edition: prefix.version,
        };
        addRow(record, envelope, 'checkpoint');
        prefix.oneCast = structuredClone(record.oneCast);
        savePrefix(envelope, prefix, true);
        if (owner) {
          await gateContinuity(game, scope === 'file');
          if (current() === game) store();
        }
        bridgeStatus = 'Derya’s progress in this chapter is saved in this browser.';
        conflict = undefined;
        lab.milestone('one cast source completion');
      } catch (error) {
        bridgeStatus = message(error);
        if (envelope && prefix && /conflict/i.test(bridgeStatus)) conflict = { envelope, game, prefix };
        lab.milestone('one cast bridgefail');
      }
    });
  return pending;
}
export function installContinuity(
  getGame: () => GameState | undefined,
  save: () => void,
  load?: (game: GameState) => Promise<void>,
): void {
  current = getGame;
  store = save;
  loadArrival = load;
  watchPersonaCheckpoint(checkpointContinuity);
}
function downloadEnvelope(envelope: PersonaEnvelope): void {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'stairwell-person.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function continuityPanel(): HTMLElement {
  const box = document.createElement('section');
  box.className = 'continuity-panel';
  const status = document.createElement('p');
  status.role = 'status';
  status.textContent =
    bridgeStatus ||
    'This browser saves character history between games. You can always start a new week without earlier character history.';
  box.append(
    personaControls({
      enabled: shelf.enabled,
      setEnabled(value) {
        shelf.setEnabled(value);
      },
      recordingAllowed:
        !current() || !recordingKey(current()!) || linkageKnown || lab.personaRecordingAllowed,
      allowRecording(value) {
        void chooseContinuityRecording(value).catch((e) => {
          status.textContent = message(e);
        });
      },
    }),
    status,
  );
  const add = (text: string, action: () => Promise<void> | void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.onclick = () => {
      void Promise.resolve()
        .then(action)
        .catch((e) => {
          status.textContent = message(e);
        });
    };
    box.append(b);
  };
  add('Pause after Derya’s shift', async () => {
    const game = current();
    if (!game) return;
    act(game, { kind: 'one-cast-depart' });
    store();
    await checkpointContinuity();
    status.textContent = game.oneCast?.departure
      ? bridgeStatus
      : game.oneCast?.departureRequested
        ? 'You requested a pause. Derya must finish her shift at 08:00 first. She still needs her morning sleep and remains tired.'
        : 'Request this pause on the first morning between 07:00 and 08:00. You can still start a new week without earlier character history.';
  });
  add('Save character progress in this chapter', async () => {
    await checkpointContinuity();
    status.textContent = bridgeStatus;
  });
  add('Download a character file', async () => {
    const game = current();
    if (!game) return;
    if (!game.oneCast?.head) {
      const serial = gateSerial;
      const prefix = structuredClone(game);
      const envelope = await createDeryaCheckpoint(prefix, {
        build: build(),
        branchId: crypto.randomUUID(),
        parentRevision: null,
      });
      if (current() !== game || serial !== gateSerial) return;
      savePrefix(envelope, prefix);
      await acceptLocalPersona(envelope);
      game.oneCast!.head = envelope;
      game.oneCast!.scope = 'file';
      game.oneCast!.lastCheckpoint = structuredClone(personOf(prefix, 'derya'));
      game.oneCast!.sourcePrefix = {
        seed: prefix.seed,
        inputs: structuredClone(prefix.inputs),
        minute: prefix.minute,
        edition: prefix.version,
      };
      addRow(game, envelope, 'checkpoint');
      prefix.oneCast = structuredClone(game.oneCast);
      savePrefix(envelope, prefix, true);
      if (current() !== game || serial !== gateSerial) return;
      if (current() === game && serial === gateSerial) {
        await gateContinuity(game, true);
        if (current() === game) store();
      }
    }
    downloadEnvelope(game.oneCast!.head!);
  });
  add('Open a character file', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      void (async () => {
        const file = input.files?.[0];
        if (!file) return;
        if (file.size > 256 * 1024) throw new Error('The character file is larger than the 256 KiB limit.');
        const envelope = await validatePersona(JSON.parse(await file.text()));
        if (envelope.castId !== CAST || envelope.source.game !== 'hearsay')
          throw new Error('This character file is unsupported for Derya’s return.');
        candidate = envelope;
        status.textContent =
          'The character file has been checked. Begin a new week to continue from the matching earlier save in this browser. Your current game has not changed.';
      })().catch((e) => {
        status.textContent = message(e);
      });
    };
    input.click();
  });
  if (pendingArrival)
    add('Create a separate copy of the arriving character history', async () => {
      const held = pendingArrival;
      if (!held || !loadArrival) return;
      const serial = gateSerial;
      const owner = current();
      const valid = () => {
        ensureGeneration(serial);
        if (current() !== owner || pendingArrival !== held)
          throw new Error('You selected a different arriving character.');
      };
      const admission = await prepareDeryaReturn(held.envelope, held.prefix, { build: build() });
      valid();
      const { revision: _, ...body } = held.envelope;
      const fork = await createPersona({ ...body, branchId: crypto.randomUUID(), parentRevision: null });
      valid();
      if (held.scope === 'file') await acceptLocalPersona(fork, { fork: true });
      else await shelf.request({ action: 'put', envelope: fork, fork: true });
      const forkArrival = { ...held, envelope: fork };
      if (serial !== gateSerial || current() !== owner) {
        keepRecovery(fork.revision, { arrival: forkArrival, admission });
        return;
      }
      valid();
      savePrefix(fork, held.prefix);
      const game = await claimArrival(forkArrival, admission, serial);
      valid();
      pendingArrival = undefined;
      candidate = null;
      await loadArrival(game);
      status.textContent = 'A separate copy of this character history was accepted for a new chapter.';
    });
  if (conflict)
    add('Create a separate copy of this continued game', async () => {
      const held = conflict;
      if (!held || current() !== held.game) return;
      const serial = gateSerial;
      const valid = () => {
        ensureGeneration(serial);
        if (current() !== held.game || conflict !== held)
          throw new Error('You selected a different continued game.');
      };
      const { revision: _, ...body } = held.envelope;
      const fork = await createPersona({ ...body, branchId: crypto.randomUUID(), parentRevision: null });
      valid();
      const scope = held.game.oneCast?.scope ?? 'shared';
      const record = structuredClone(held.prefix);
      record.oneCast!.head = fork;
      record.oneCast!.scope = scope;
      record.oneCast!.lastCheckpoint = structuredClone(personOf(held.prefix, 'derya'));
      record.oneCast!.sourcePrefix = {
        seed: held.prefix.seed,
        inputs: structuredClone(held.prefix.inputs),
        minute: held.prefix.minute,
        edition: held.prefix.version,
      };
      addRow(record, fork, 'checkpoint');
      savePrefix(fork, record);
      if (scope === 'file') await acceptLocalPersona(fork, { fork: true });
      else await shelf.request({ action: 'put', envelope: fork, fork: true });
      savePrefix(fork, record, true);
      if (serial !== gateSerial || current() !== held.game) {
        keepRecovery(fork.revision, { game: record });
        return;
      }
      valid();
      Object.assign(held.game, record);
      held.game.oneCast!.head = fork;
      held.game.oneCast!.scope = scope;
      held.game.oneCast!.lastCheckpoint = structuredClone(personOf(held.prefix, 'derya'));
      held.prefix.oneCast = structuredClone(held.game.oneCast);
      savePrefix(fork, held.prefix, true);
      conflict = undefined;
      await gateContinuity(held.game);
      if (current() === held.game) store();
      status.textContent = 'A separate copy of this character history was saved.';
    });
  const recoveries = JSON.parse(localStorage.getItem(RECOVERY_INDEX) ?? '[]') as string[];
  for (const revision of recoveries) {
    const raw = localStorage.getItem(`stairwell-one-cast-recovery:${revision}`);
    if (!raw || (JSON.parse(raw) as { accepted?: boolean }).accepted === false) continue;
    add(`Resume accepted continued game ${revision.slice(0, 8)}`, async () => {
      if (!loadArrival) return;
      const serial = gateSerial;
      const recovery = JSON.parse(raw) as Recovery;
      const game =
        'game' in recovery ? recovery.game : await claimArrival(recovery.arrival, recovery.admission, serial);
      await validateContinuity(game);
      ensureGeneration(serial);
      await loadArrival(game);
      // The app acknowledges only after validation, gating and a successful durable save.
    });
  }
  return box;
}
