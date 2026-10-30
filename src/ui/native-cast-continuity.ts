/** Browser ownership and durable recovery around the sole SDK shelf route.
 * Files keep provenance; only an acknowledged native write owns a shelf head.
 */
import {
  anchorPersonaLife,
  canonicalPersona,
  claimCastChapterBatch,
  claimPortablePerson,
  closePersonaBranch,
  createPersona,
  initialPersonaLife,
  type LifeBatchPreparation,
  type LifePreparation,
  type PersonaEnvelope,
  type PersonaLife,
  type PersonaRequest,
  personaChannel,
  portablePassport,
  portablePersonOwner,
  preparePersonaLife,
  validatePersona,
  watchPersonaCheckpoint,
} from '@adam0white/lab-client';
import { RESIDENTS, RIDS, type Rid } from '../sim/building-cast.ts';
import { assertPlainBuildingData } from '../sim/building-decode.ts';
import { currentDeparture } from '../sim/hf-cast.ts';
import { buildingEngine, openBuilding } from '../sim/hf-game.ts';
import { currentBody } from '../sim/hf-readings.ts';
import { replayBuilding } from '../sim/hf-replay.ts';
import type { BuildingCheckpoint } from '../sim/hf-run.ts';
import type { BuildingEdition, BuildingWorld } from '../sim/hf-world.ts';
import {
  ALLOCATION,
  admitNativeCast,
  NATIVE_CAST_AUTHORITY,
  type NativeCastChapter,
  type NativeCastDenial,
  refuseWorkTransfer,
  roleFor,
  validateNativeChapter,
  validateNativeReceiptMetadata,
} from '../sim/native-cast-life.ts';
import { type NativeNotebook, nativeNotebook, readNativeNotebook } from './native-notebook.ts';
import { requirePortableWrite } from './portable-write-guard.ts';
import { fileMode } from './session-route.ts';

type Shelf = ReturnType<typeof personaChannel>;
type SourceProof = { checkpoint: BuildingCheckpoint<BuildingWorld> };
export type CastReceipts = {
  authority?: 'stairwell-authority/1' | typeof NATIVE_CAST_AUTHORITY;
  denials?: NativeCastDenial[];
  owned: Record<string, PersonaEnvelope>;
  fileOrigin: boolean;
  authored: boolean;
  sources: Partial<Record<Rid, SourceProof>>;
  chapter?: NativeCastChapter;
};
type Runtime = CastReceipts & { rawOwned?: unknown; recordingKey?: string };
export type NativeRecovery = {
  key: string;
  operation: 'admission' | 'departure' | 'fork';
  accepted: boolean;
  expectedHeads: Record<string, string | null>;
  notebook: NativeNotebook;
};
export type RecoveryStore = {
  list(): Promise<NativeRecovery[]>;
  put(record: NativeRecovery): Promise<void>;
  remove(key: string): Promise<void>;
};

/** Full archives exceed localStorage. This store preserves complete checkpoints
 * and never deletes an older recovery automatically to make room. */
export function browserRecoveryStore(): RecoveryStore {
  let database: Promise<IDBDatabase> | undefined;
  function db() {
    database ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('stairwell-native-cast-v4', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('recoveries', { keyPath: 'key' });
      let failed = false;
      const fail = (error: unknown) => {
        failed = true;
        database = undefined;
        reject(error);
      };
      request.onsuccess = () => {
        if (failed) request.result.close();
        else resolve(request.result);
      };
      request.onerror = () => fail(request.error);
      request.onblocked = () => fail(new Error('Close the other recovery view and try again.'));
    });
    return database;
  }
  return {
    async list() {
      const connection = await db();
      return new Promise((resolve, reject) => {
        const transaction = connection.transaction('recoveries', 'readonly');
        const request = transaction.objectStore('recoveries').getAll();
        transaction.oncomplete = () => resolve(request.result as NativeRecovery[]);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    },
    async put(record) {
      const connection = await db();
      await new Promise<void>((resolve, reject) => {
        const transaction = connection.transaction('recoveries', 'readwrite');
        const store = transaction.objectStore('recoveries');
        const count = store.count();
        count.onsuccess = () => {
          const old = store.get(record.key);
          old.onsuccess = () => {
            if (!old.result && count.result >= 8) {
              transaction.abort();
              reject(
                new Error('Eight recovery chapters are saved. Download and remove one before continuing.'),
              );
            } else store.put(structuredClone(record));
          };
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error ?? new Error('Recovery could not be saved.'));
      });
    },
    async remove(key) {
      const connection = await db();
      await new Promise<void>((resolve, reject) => {
        const transaction = connection.transaction('recoveries', 'readwrite');
        transaction.objectStore('recoveries').delete(key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    },
  };
}

export type NativeGameAccess = {
  open(...args: Parameters<typeof openBuilding>): Promise<BuildingWorld>;
  reopen(world: BuildingWorld, ...args: Parameters<typeof openBuilding>): Promise<BuildingWorld>;
  checkpoint(world: BuildingWorld): Promise<BuildingCheckpoint<BuildingWorld>>;
  person(
    world: BuildingWorld,
    id: Rid,
  ): Promise<{
    body: ReturnType<typeof currentBody>['state'];
    now: number;
    departure?: Pick<ReturnType<typeof currentDeparture>, 'transfer'>;
  }>;
  notebook(world: BuildingWorld, receipts: unknown): Promise<NativeNotebook>;
  discard(world: BuildingWorld): void;
  admit(
    world: BuildingWorld,
    ...args: Parameters<typeof admitNativeCast>
  ): ReturnType<typeof admitNativeCast>;
  chapter(
    world: BuildingWorld,
    value: Parameters<typeof validateNativeChapter>[2],
  ): ReturnType<typeof validateNativeChapter>;
};
const localGame: NativeGameAccess = {
  open: async (...args) => openBuilding(...args),
  reopen: async (_world, ...args) => openBuilding(...args),
  checkpoint: async (world) => buildingEngine(world).checkpoint(),
  person: async (world, id) => {
    requirePortableWrite(id);
    return {
      body: currentBody(buildingEngine(world), id).state,
      now: buildingEngine(world).now,
      departure: currentBody(buildingEngine(world), id).state.alive
        ? { transfer: currentDeparture(buildingEngine(world), id, []).transfer }
        : undefined,
    };
  },
  notebook: async (world, receipts) => nativeNotebook(world, receipts),
  discard: () => {},
  admit: async (_world, ...args) => admitNativeCast(...args),
  chapter: async (world, value) =>
    validateNativeChapter(world.version, buildingEngine(world).checkpoint().archive.initial.people, value),
};
export type NativeContinuityOptions = {
  game?: NativeGameAccess;
  current(): BuildingWorld | undefined;
  save(): void | Promise<void>;
  build(): string;
  recording(key: string, allowed: boolean): void;
  load?(world: BuildingWorld): Promise<void>;
  /** Browser callers verify complete replay in the shared cancellable reader.
   * This returns no shelf ownership; the controller checks the exact checkpoint
   * and validates receipts below before admitting the recovered chapter. */
  restoreNotebook?(notebook: NativeNotebook): Promise<BuildingWorld>;
  shelf?: Shelf;
  recoveries?: RecoveryStore;
  file?: boolean;
  now?(): number;
  uuid?(): string;
};
export class AdmissionFailure extends Error {
  readonly submitted: boolean;
  readonly accepted: boolean;
  readonly recoveryKey?: string;
  constructor(cause: unknown, submitted: boolean, accepted: boolean, recoveryKey?: string) {
    super(cause instanceof Error ? cause.message : 'History could not be checked. Keep the file.', { cause });
    this.submitted = submitted;
    this.accepted = accepted;
    this.recoveryKey = recoveryKey;
    this.name = 'AdmissionFailure';
  }
}
export type PublicationResult =
  | { ok: true; cancelled?: boolean }
  | { ok: false; cancelled?: boolean; accepted?: string[]; failures: { name: string; error: string }[] };
const text = (error: unknown) =>
  error instanceof Error ? error.message : 'Character history is unavailable. Keep the file.';
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const sha256 = async (value: unknown): Promise<string> =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalPersona(value)))),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');

export function createNativeContinuity(options: NativeContinuityOptions) {
  const game = options.game ?? localGame;
  const file = options.file ?? fileMode === 'file';
  const runtimes = new WeakMap<BuildingWorld, Runtime>();
  let shelf = options.shelf;
  let recoveries = options.recoveries;
  let generation = 0;
  let pending: Promise<unknown> = Promise.resolve();
  let status = '';
  const uuid = () => options.uuid?.() ?? crypto.randomUUID();
  const now = () => options.now?.() ?? Date.now();
  function nativeShelf(): Shelf {
    if (file) throw new Error('Saved-file play cannot change shared character history. Download this run.');
    shelf ??= personaChannel();
    return shelf;
  }
  function store(): RecoveryStore {
    if (file) throw new Error('Saved-file play cannot write native recovery history.');
    recoveries ??= browserRecoveryStore();
    return recoveries;
  }
  async function stageRecovery(
    recovery: NativeRecovery,
    serial: number,
    captured: BuildingWorld | undefined,
  ): Promise<void> {
    // Capture can await worker work. Invalidation must prevent a new pre-CAS write.
    requireCurrent(serial, captured);
    await store().put(recovery);
    requireCurrent(serial, captured);
  }
  function runtime(world: BuildingWorld): Runtime {
    let value = runtimes.get(world);
    if (!value) {
      value = { owned: {}, sources: {}, fileOrigin: file, authored: true };
      runtimes.set(world, value);
    }
    return value;
  }
  async function source(
    world: BuildingWorld,
    checkpoint?: BuildingCheckpoint<BuildingWorld>,
  ): Promise<PersonaEnvelope['source']> {
    const engine = (checkpoint ?? (await game.checkpoint(world))).archive.engine.package.split('@').at(-1);
    if (!engine) throw new Error('The character chapter has no engine identity.');
    return { game: 'stairwell', build: options.build(), engine, rules: world.version.split('@')[1] ?? '' };
  }
  function requireCurrent(serial: number, captured: BuildingWorld | undefined): void {
    if (serial !== generation || options.current() !== captured)
      throw new Error('The game or player identity changed. Use the saved recovery chapter.');
  }
  async function ready(): Promise<Shelf> {
    const channel = nativeShelf();
    await channel.ready;
    if (!channel.enabled) {
      channel.setEnabled(true);
      await channel.ready;
    }
    if (!channel.enabled) throw new Error('Shared character history could not be enabled.');
    return channel;
  }
  function castReceipts(world: BuildingWorld): CastReceipts {
    const value = runtime(world);
    return structuredClone({
      ...(value.authority ? { authority: value.authority } : {}),
      ...(value.denials ? { denials: value.denials } : {}),
      owned: value.owned,
      sources: value.sources,
      authored: value.authored,
      fileOrigin: value.fileOrigin,
      ...(value.chapter ? { chapter: value.chapter } : {}),
    });
  }
  function restoreCastReceipts(world: BuildingWorld, input: unknown, imported = false): void {
    const denials = validateNativeReceiptMetadata(input);
    const record = input as CastReceipts | undefined;
    const value = runtime(world);
    value.owned = {};
    value.rawOwned = undefined;
    value.sources = structuredClone(record?.sources ?? {});
    value.chapter = structuredClone(record?.chapter);
    value.fileOrigin = file || imported || !!record?.fileOrigin;
    value.authored = !value.fileOrigin && !!record?.authored;
    value.authority = denials ? NATIVE_CAST_AUTHORITY : undefined;
    value.denials = denials;
    if (!value.fileOrigin && record) value.rawOwned = structuredClone(record.owned);
  }
  async function validateContinuity(world: BuildingWorld): Promise<void> {
    const serial = generation,
      captured = options.current();
    const value = runtime(world);
    const checkpoint = await game.checkpoint(world);
    value.chapter = await game.chapter(world, value.chapter);
    validateNativeReceiptMetadata(castReceipts(world));
    const life = (world as BuildingWorld & { nativeLife?: LifePreparation[] }).nativeLife ?? [];
    if (canonicalPersona(life) !== canonicalPersona(value.chapter?.inputs ?? []))
      throw new Error('The opening life inputs do not match their source recipe. Keep the file.');
    if (file || value.fileOrigin) {
      value.owned = {};
      delete value.rawOwned;
      return;
    }
    if (value.rawOwned !== undefined) {
      if (!object(value.rawOwned)) throw new Error('The saved ownership record is invalid. Keep the file.');
      const channel = await ready();
      const accepted: Record<string, PersonaEnvelope> = {};
      for (const [id, raw] of Object.entries(value.rawOwned)) {
        const head = await validatePersona(raw);
        const role = roleFor(id);
        if (head.castId !== id) throw new Error('The saved ownership identity is invalid. Keep the file.');
        const openingClaim = value.chapter?.claims.find((claim) => claim.castId === id);
        if (head.revision !== openingClaim?.revision) {
          const proof = value.sources[role];
          if (
            !proof ||
            canonicalPersona(proof.checkpoint) !== canonicalPersona(checkpoint) ||
            head.source.game !== 'stairwell' ||
            head.source.rules !== (await source(world, checkpoint)).rules ||
            head.source.engine !== (await source(world, checkpoint)).engine
          )
            throw new Error('The source checkpoint for this accepted character is missing. Keep the file.');
          if (
            !head.terminal &&
            (!object(head.transfer.checkpoint) ||
              head.transfer.checkpoint.person !== role ||
              head.transfer.checkpoint.fullHash !== checkpoint.archive.hashes.full ||
              head.transfer.checkpoint.sha256 !== (await sha256(proof.checkpoint)))
          )
            throw new Error(
              'The character source digest does not match the complete checkpoint. Keep the file.',
            );
          if (value.authority !== NATIVE_CAST_AUTHORITY)
            throw new Error(
              'This saved game began before an update and cannot continue. Download it if you want to keep it, then start a new game.',
            );
          const person = await game.person(world, role),
            body = person.body;
          if (head.terminal) {
            if (body.alive || head.terminal.at !== person.now)
              throw new Error('The terminal receipt does not match the actual actor. Keep the file.');
          } else if (
            canonicalPersona(person.departure?.transfer.portable) !== canonicalPersona(head.transfer.portable)
          )
            throw new Error(
              'The accepted character differs from its complete source checkpoint. Keep the file.',
            );
        }
        const actual = await channel.request<PersonaEnvelope | null>({ action: 'get', castId: id });
        if (!actual || canonicalPersona(await validatePersona(actual)) !== canonicalPersona(head))
          throw new Error(
            'This saved chapter no longer owns the current shelf head. Keep the file; no actor was replaced.',
          );
        accepted[id] = head;
      }
      requireCurrent(serial, captured);
      value.owned = accepted;
      delete value.rawOwned;
    }
  }
  function gateContinuity(world: BuildingWorld | undefined, imported = false) {
    if (!world) return;
    const value = runtime(world);
    if (file || imported) {
      value.fileOrigin = true;
      value.owned = {};
      delete value.rawOwned;
    }
    value.recordingKey ??= `stairwell-group:${uuid()}`;
    options.recording(value.recordingKey, true);
  }
  function invalidateContinuity() {
    generation++;
    const world = options.current();
    if (world) delete runtime(world).recordingKey;
    options.recording('pending-cast-group', false);
  }
  async function arrive(
    seed: number,
    fresh = false,
    edition: BuildingEdition = 'stairwell@14',
  ): Promise<BuildingWorld> {
    if (file) throw new Error('Saved-file play cannot start a shared character chapter.');
    const serial = generation,
      previous = options.current();
    options.recording('pending-cast-group', false);
    if (edition === 'stairwell@16') {
      if (!fresh) refuseWorkTransfer(edition);
      const world = await game.open(seed, edition);
      runtime(world).authority = NATIVE_CAST_AUTHORITY;
      runtime(world).denials = [];
      return world;
    }
    if (fresh) {
      const world = await game.open(seed, edition);
      runtime(world).authority = NATIVE_CAST_AUTHORITY;
      runtime(world).denials = [];
      return world;
    }
    const channel = await ready();
    requireCurrent(serial, previous);
    const preparedBatch = structuredClone(
      await channel.request<LifeBatchPreparation>({
        action: 'prepareBatch',
        castIds: ALLOCATION.map((c) => c.castId),
      }),
    );
    requireCurrent(serial, previous);
    assertPlainBuildingData(preparedBatch);
    // Validate transport structure and parent integrity before creating a worker.
    // These errors must never become per-person semantic refusals.
    if (
      !preparedBatch ||
      Object.keys(preparedBatch).sort().join(',') !== 'blocked,expectedHeads,inputs' ||
      !object(preparedBatch.expectedHeads) ||
      !Array.isArray(preparedBatch.inputs) ||
      !Array.isArray(preparedBatch.blocked) ||
      Object.keys(preparedBatch.expectedHeads).sort().join(',') !==
        ALLOCATION.map((person) => person.castId)
          .sort()
          .join(',')
    )
      throw new Error('The prepared character histories are invalid. Keep the source chapter.');
    const preparedIds = new Set<string>();
    for (const input of preparedBatch.inputs) {
      if (!object(input) || !object(input.parent))
        throw new Error('A prepared character parent is missing. Keep the source chapter.');
      const parent = await validatePersona(input.parent);
      if (
        !ALLOCATION.some((person) => person.castId === parent.castId) ||
        preparedIds.has(parent.castId) ||
        preparedBatch.expectedHeads[parent.castId] !== parent.revision
      )
        throw new Error('The prepared parents do not match the requested shelf heads.');
      if (
        typeof input.clockMs !== 'number' ||
        !Number.isFinite(input.clockMs) ||
        canonicalPersona(preparePersonaLife(parent, input.clockMs)) !== canonicalPersona(input)
      )
        throw Error('The prepared time away does not match its parent. Keep the source chapter.');
      preparedIds.add(parent.castId);
    }
    for (const blocked of preparedBatch.blocked) {
      if (
        !object(blocked) ||
        Object.keys(blocked).sort().join(',') !== 'castId,reason' ||
        !ALLOCATION.some((person) => person.castId === blocked.castId) ||
        typeof blocked.castId !== 'string' ||
        preparedIds.has(blocked.castId) ||
        typeof blocked.reason !== 'string' ||
        !blocked.reason.trim() ||
        blocked.reason.length > 1500 ||
        preparedBatch.expectedHeads[blocked.castId] === null
      )
        throw new Error('A prepared character refusal is invalid. Keep the source chapter.');
      preparedIds.add(blocked.castId);
    }
    for (const person of ALLOCATION) {
      const revision = preparedBatch.expectedHeads[person.castId];
      if (
        revision !== null &&
        (typeof revision !== 'string' || !/^[a-f0-9]{64}$/.test(revision) || !preparedIds.has(person.castId))
      )
        throw new Error('The prepared shelf revision is invalid. Keep the source chapter.');
    }
    const denials: NativeCastDenial[] = preparedBatch.blocked.map((blocked) => ({
      castId: blocked.castId,
      revision: preparedBatch.expectedHeads[blocked.castId] as string,
      reason: `${RESIDENTS[roleFor(blocked.castId)].name}: ${blocked.reason}`,
    }));
    const candidates: LifePreparation[] = [];
    for (const input of preparedBatch.inputs) {
      // Pure SDK/HF semantics only. No channel or worker transport is inside this catch.
      try {
        if (portablePassport(input.parent)) {
          const owner = portablePersonOwner(input.parent);
          if (owner && owner !== 'stairwell')
            throw Error(`The shared history is still in ${owner}. Continue or export that chapter.`);
        }
        await admitNativeCast(input, edition);
        claimPortablePerson(input.parent, 'stairwell');
        candidates.push(input);
      } catch (error) {
        denials.push({
          castId: input.parent.castId,
          revision: input.parent.revision,
          reason: `${RESIDENTS[roleFor(input.parent.castId)].name}: ${text(error)} The shared history was kept. A local character starts here.`,
        });
      }
    }
    const admissionBatch = {
      ...preparedBatch,
      inputs: candidates,
      blocked: denials.map(({ castId, reason }) => ({ castId, reason })),
    };
    requireCurrent(serial, previous);
    let world = await game.open(seed, edition);
    let inputs: LifePreparation[] = [],
      arrivals: NativeCastChapter['arrivals'] = [];
    const expectedHeads = structuredClone(preparedBatch.expectedHeads);
    const key = `admission:${uuid()}`;
    let submitted = false,
      accepted = false;
    const transport: Shelf = {
      get enabled() {
        return channel.enabled;
      },
      ready: channel.ready,
      setEnabled: (value) => channel.setEnabled(value),
      async request<T>(request: PersonaRequest): Promise<T> {
        if (request.action === 'prepareBatch') {
          const batch = admissionBatch;
          requireCurrent(serial, previous);
          const uncertain = (await store().list()).find(
            (record) =>
              record.operation === 'admission' &&
              !record.accepted &&
              canonicalPersona(record.expectedHeads) === canonicalPersona(expectedHeads),
          );
          if (uncertain)
            throw new Error(
              'An earlier admission has an unconfirmed result. Check its saved recovery before trying again.',
            );
          requireCurrent(serial, previous);
          return batch as T;
        }
        if (request.action !== 'putBatch') return channel.request<T>(request);
        requireCurrent(serial, previous);
        const claims = request.envelopes ?? [];
        if (canonicalPersona(request.expectedHeads) !== canonicalPersona(expectedHeads))
          throw new Error('The submitted parents differ from the prepared shelf heads.');
        const chapter: NativeCastChapter = {
          version: 'stairwell-cast/3',
          denials,
          inputs,
          expectedHeads,
          arrivals,
          claims,
        };
        await game.chapter(world, chapter);
        requireCurrent(serial, previous);
        const receipts: CastReceipts = {
          authority: NATIVE_CAST_AUTHORITY,
          denials,
          owned: Object.fromEntries(claims.map((claim) => [claim.castId, claim])),
          sources: {},
          fileOrigin: false,
          authored: !inputs.length,
          chapter,
        };
        const recovery: NativeRecovery = {
          key,
          operation: 'admission',
          accepted: false,
          expectedHeads,
          notebook: await game.notebook(world, receipts),
        };
        await stageRecovery(recovery, serial, previous);
        requireCurrent(serial, previous);
        submitted = true;
        const reply = await channel.request<unknown>(request);
        if (canonicalPersona(reply) !== canonicalPersona(claims))
          throw new Error(
            'The shelf reply did not confirm these exact claims. The saved recovery must be checked.',
          );
        accepted = true;
        await store().put({ ...recovery, accepted: true });
        return reply as T;
      },
    };
    try {
      const result = await claimCastChapterBatch(
        transport,
        ALLOCATION.map((c) => c.castId),
        await source(world),
        async (prepared) => {
          inputs = structuredClone(prepared);
          arrivals = await Promise.all(inputs.map((input) => game.admit(world, input, edition)));
          world = await game.reopen(world, seed, edition, arrivals, inputs);
          return arrivals;
        },
        {
          isCurrent: () => serial === generation && options.current() === previous,
          admitPerson: async (input) => {
            await admitNativeCast(input, edition);
          },
        },
      );
      requireCurrent(serial, previous);
      const value = runtime(world);
      value.authority = NATIVE_CAST_AUTHORITY;
      value.denials = denials;
      value.chapter = {
        version: 'stairwell-cast/3',
        denials,
        inputs,
        expectedHeads,
        arrivals,
        claims: result?.claims ?? [],
      };
      value.owned = Object.fromEntries((result?.claims ?? []).map((claim) => [claim.castId, claim]));
      value.authored = !inputs.length;
      return world;
    } catch (cause) {
      game.discard(world);
      throw new AdmissionFailure(cause, submitted, accepted, key);
    }
  }
  async function acceptedCastRecoveries() {
    return file ? [] : (await store().list()).filter((record) => record.accepted);
  }
  async function restoreRecoveryNotebook(
    notebook: NativeNotebook,
    serial: number,
    captured: BuildingWorld | undefined,
  ): Promise<BuildingWorld> {
    requireCurrent(serial, captured);
    const expected = canonicalPersona(notebook.engine);
    const world = options.restoreNotebook
      ? await options.restoreNotebook(notebook)
      : replayBuilding(notebook.engine);
    try {
      requireCurrent(serial, captured);
      if (canonicalPersona(await game.checkpoint(world)) !== expected)
        throw new Error('The recovered checkpoint does not match the complete notebook. Keep the file.');
      return world;
    } catch (error) {
      game.discard(world);
      throw error;
    }
  }
  let recoveryOperations = 0;
  async function recoveryOperation<T>(run: () => Promise<T>): Promise<T> {
    recoveryOperations++;
    try {
      return await run();
    } finally {
      recoveryOperations--;
    }
  }
  const reconcileRecovery = (key: string) => recoveryOperation(() => reconcileRecoveryImpl(key));
  const resumeRecovery = (key: string) => recoveryOperation(() => resumeRecoveryImpl(key));
  async function reconcileRecoveryImpl(key: string): Promise<boolean> {
    const serial = generation,
      captured = options.current();
    const record = (await store().list()).find((item) => item.key === key);
    if (!record) throw new Error('The recovery chapter is missing. Keep the downloaded file.');
    const notebook = readNativeNotebook(record.notebook);
    const receipts = notebook.castReceipts as CastReceipts;
    if (!object(receipts) || !object(receipts.owned) || !object(record.expectedHeads))
      throw new Error('The recovery is missing its submitted character records. Keep the file.');
    const ids = Object.keys(record.expectedHeads);
    if (record.operation === 'admission') {
      if (
        !receipts.chapter ||
        canonicalPersona(record.expectedHeads) !== canonicalPersona(receipts.chapter.expectedHeads) ||
        canonicalPersona([...ids].sort()) !==
          canonicalPersona(ALLOCATION.map((person) => person.castId).sort()) ||
        canonicalPersona(Object.values(receipts.owned).sort((a, b) => a.castId.localeCompare(b.castId))) !==
          canonicalPersona([...receipts.chapter.claims].sort((a, b) => a.castId.localeCompare(b.castId)))
      )
        throw new Error('The recovery parent map differs from its submitted opening. Keep the file.');
    } else if (record.operation === 'departure' || record.operation === 'fork') {
      const id = ids[0];
      if (ids.length !== 1 || !id || !receipts.owned[id])
        throw new Error('The recovery has no exact submitted character save. Keep the file.');
      roleFor(id);
      const parent = record.operation === 'fork' ? null : record.expectedHeads[id];
      if (receipts.owned[id]?.parentRevision !== parent)
        throw new Error('The recovery does not match its source parent. Keep the file.');
    } else throw new Error('This recovery uses an unknown acceptance operation. Keep the file.');
    const channel = await ready();
    for (const id of Object.keys(record.expectedHeads)) {
      const desired = receipts.owned[id]?.revision ?? record.expectedHeads[id];
      const actual = await channel.request<PersonaEnvelope | null>({ action: 'get', castId: id });
      if ((actual ? (await validatePersona(actual)).revision : null) !== desired) return false;
    }
    const candidate = await restoreRecoveryNotebook(notebook, serial, captured);
    try {
      restoreCastReceipts(candidate, receipts);
      await validateContinuity(candidate);
      requireCurrent(serial, captured);
      await store().put({ ...record, accepted: true });
      return true;
    } finally {
      game.discard(candidate);
    }
  }
  async function resumeRecoveryImpl(key: string): Promise<BuildingWorld> {
    const serial = generation,
      captured = options.current();
    const record = (await store().list()).find((item) => item.key === key && item.accepted);
    if (!record) throw new Error('This recovery has no confirmed acceptance. Check it first.');
    const notebook = readNativeNotebook(record.notebook);
    const world = await restoreRecoveryNotebook(notebook, serial, captured);
    try {
      restoreCastReceipts(world, notebook.castReceipts);
      await validateContinuity(world);
      requireCurrent(serial, captured);
      return world;
    } catch (error) {
      game.discard(world);
      throw error;
    }
  }
  function endedBoundary(world: BuildingWorld, id: Rid) {
    if (world.phase !== 'end' || (id !== 'hacer' && id !== 'sevim')) return false;
    const minute = world.minute % 1440,
      weekday = (Math.floor(world.minute / 1440) % 7) + 1,
      info = RESIDENTS[id];
    if (info.nights && (minute < 930 || minute >= 1170)) return false;
    if (info.work && weekday <= 5 && minute >= info.work[0] && minute < info.work[1]) return false;
    return true;
  }
  async function checkpointPerson(world: BuildingWorld, id: Rid, fork = false, serial = generation) {
    requireCurrent(serial, world);
    if (file) throw new Error('Saved-file play cannot write shared character history.');
    if (runtime(world).authority !== NATIVE_CAST_AUTHORITY)
      throw new Error(
        'Hacer and Sevim cannot be saved for other games from this saved game. Start a new game to share them.',
      );
    const denial = runtime(world).denials?.find((item) => item.castId === RESIDENTS[id].castId);
    if (denial) throw Error(denial.reason);
    requirePortableWrite(id);
    const channel = await ready();
    refuseWorkTransfer(world.version);
    const value = runtime(world),
      castId = RESIDENTS[id].castId,
      old = value.owned[castId];
    requireCurrent(serial, world);
    if (value.fileOrigin && !fork && !old)
      throw new Error(
        'This file owns no shared history. Create an explicit separate history or download it.',
      );
    if (!endedBoundary(world, id))
      throw new Error(`${RESIDENTS[id].name} still has duties in this chapter. Continue here.`);
    const checkpoint = await game.checkpoint(world),
      person = await game.person(world, id),
      body = person.body;
    const digest = await sha256(checkpoint);
    const recoveryKey = fork
      ? `fork:${uuid()}`
      : `departure:${digest}:${castId}:${old?.revision ?? 'authored'}`;
    if (!fork && (await store().list()).some((record) => record.key === recoveryKey))
      throw new Error('This departure already has a saved recovery. Check or resume it before trying again.');
    let envelope: PersonaEnvelope;
    if (!body.alive) {
      if (!old) throw new Error('This chapter owns no character branch it can close.');
      if (old.terminal) {
        const actual = await channel.request<PersonaEnvelope | null>({ action: 'get', castId });
        requireCurrent(serial, world);
        if (!actual || canonicalPersona(await validatePersona(actual)) !== canonicalPersona(old))
          throw new Error('The shelf head changed. This chapter has not overwritten it.');
        return;
      }
      envelope = await closePersonaBranch(old, await source(world, checkpoint), person.now);
    } else {
      const departure = person.departure;
      if (!departure) throw Error('The living character has no departure projection.');
      if (!fork && old && object(old.transfer.checkpoint) && old.transfer.checkpoint.sha256 === digest) {
        const actual = await channel.request<PersonaEnvelope | null>({ action: 'get', castId });
        requireCurrent(serial, world);
        if (!actual || canonicalPersona(await validatePersona(actual)) !== canonicalPersona(old))
          throw new Error('The shelf head changed. This chapter has not overwritten it.');
        return;
      }
      const branchId = fork ? uuid() : (old?.branchId ?? uuid());
      const life =
        old?.transfer.life && !fork
          ? anchorPersonaLife(old.transfer.life as PersonaLife, castId, now())
          : initialPersonaLife(castId, branchId, now());
      envelope = await createPersona({
        format: 'hf-persona/1',
        castId,
        castRevision: RESIDENTS[id].castRevision,
        branchId,
        parentRevision: fork ? null : (old?.revision ?? null),
        source: await source(world, checkpoint),
        transfer: {
          ...departure.transfer,
          life,
          checkpoint: {
            format: 'stairwell-native-source/1',
            sha256: digest,
            person: id,
            fullHash: checkpoint.archive.hashes.full,
          },
        },
        limitations: [],
      });
    }
    requireCurrent(serial, world);
    const finalCheckpoint = await game.checkpoint(world);
    requireCurrent(serial, world);
    if (canonicalPersona(finalCheckpoint) !== canonicalPersona(checkpoint))
      throw new Error('The game changed while its source was being saved. Pause and try again.');
    const sources = { ...value.sources, [id]: { checkpoint } };
    const receipts = { ...castReceipts(world), owned: { ...value.owned, [castId]: envelope }, sources };
    const expectedHeads = { [castId]: old?.revision ?? null };
    const recovery: NativeRecovery = {
      key: recoveryKey,
      operation: fork ? 'fork' : 'departure',
      accepted: false,
      expectedHeads,
      notebook: await game.notebook(world, receipts),
    };
    await stageRecovery(recovery, serial, world);
    requireCurrent(serial, world);
    let submitted = false,
      accepted = false;
    try {
      submitted = true;
      const reply = await channel.request<unknown>({
        action: 'put',
        envelope,
        fork,
        authored:
          !fork &&
          !old &&
          !value.fileOrigin &&
          !value.chapter?.inputs.some((input) => input.parent.castId === castId),
      });
      if (canonicalPersona(reply) !== canonicalPersona(envelope))
        throw new Error('The exact character save is unconfirmed. Check its saved recovery.');
      accepted = true;
      await store().put({ ...recovery, accepted: true });
      requireCurrent(serial, world);
      value.owned[castId] = envelope;
      value.sources = sources;
      await options.save();
      status = `The character save for ${RESIDENTS[id].name} was accepted.`;
      return recovery.key;
    } catch (cause) {
      throw new AdmissionFailure(cause, submitted, accepted, recovery.key);
    }
  }
  function checkpointContinuity(): Promise<PublicationResult> {
    if (file) return Promise.resolve({ ok: true });
    const world = options.current(),
      serial = generation;
    if (!world || world.version === 'stairwell@16') return Promise.resolve({ ok: true });
    const task = pending
      .catch(() => {})
      .then(async (): Promise<PublicationResult> => {
        if (serial !== generation || options.current() !== world) return { ok: true, cancelled: true };
        const failures: { name: string; error: string }[] = [],
          accepted: string[] = [];
        for (const id of RIDS) {
          if (serial !== generation || options.current() !== world)
            return accepted.length || failures.length
              ? { ok: false, cancelled: true, accepted, failures }
              : { ok: true, cancelled: true };
          const value = runtime(world);
          if (
            !endedBoundary(world, id) ||
            value.authority !== NATIVE_CAST_AUTHORITY ||
            value.denials?.some((denial) => denial.castId === RESIDENTS[id].castId)
          )
            continue;
          try {
            const key = await checkpointPerson(world, id, false, serial);
            if (key) accepted.push(key);
          } catch (error) {
            if (error instanceof AdmissionFailure && error.accepted && error.recoveryKey)
              accepted.push(error.recoveryKey);
            failures.push({ name: RESIDENTS[id].name, error: text(error) });
            if (serial !== generation || options.current() !== world)
              return { ok: false, cancelled: true, accepted, failures };
          }
        }
        return failures.length ? { ok: false, accepted, failures } : { ok: true };
      });
    pending = task;
    return task;
  }
  async function continuityPanel(): Promise<HTMLElement> {
    const section = document.createElement('section');
    if (file) {
      section.textContent =
        'This file keeps source history as provenance. It cannot change the shared shelf.';
      return section;
    }
    const line = document.createElement('p');
    line.textContent = status;
    section.append(line);
    function button(label: string, run: () => Promise<void>) {
      const element = document.createElement('button');
      element.type = 'button';
      element.textContent = label;
      element.addEventListener('click', () => {
        void run().catch((error) => {
          line.textContent = text(error);
        });
      });
      section.append(element);
    }
    for (const record of await store().list()) {
      button(
        record.accepted ? 'Resume an accepted recovery chapter' : 'Check an unconfirmed recovery chapter',
        () =>
          recoveryOperation(async () => {
            if (!record.accepted && !(await reconcileRecovery(record.key)))
              throw new Error('The shelf has not confirmed these exact heads. No history was replaced.');
            if (!options.load) throw new Error('Open this chapter from the game menu.');
            await options.load(await resumeRecovery(record.key));
          }),
      );
      button('Download this recovery chapter', async () => {
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(record.notebook)], { type: 'application/json' }),
        );
        const link = document.createElement('a');
        link.href = url;
        link.download = 'stairwell-recovery.json';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
      button('Remove this recovery copy after downloading it', async () => {
        await store().remove(record.key);
        line.textContent = 'The recovery copy was removed. The shelf and current notebook have not changed.';
      });
    }
    const world = options.current();
    if (world)
      for (const id of RIDS.filter((id) => endedBoundary(world, id)))
        button(`Save ${RESIDENTS[id].name} as a separate character history`, async () => {
          await checkpointPerson(world, id, true);
        });
    return section;
  }
  return {
    arrive,
    castReceipts,
    continuityRefusals: (world: BuildingWorld, diagnostic = false) =>
      (runtime(world).denials ?? []).map((denial) => {
        if (diagnostic) return denial.reason;
        const name = RESIDENTS[roleFor(denial.castId)].name;
        return `${name} could not join the building this time. ${name} starts fresh here. Their saved history in other games has not changed.`;
      }),
    restoreCastReceipts,
    validateContinuity,
    gateContinuity,
    invalidateContinuity,
    checkpointContinuity,
    acceptedCastRecoveries,
    reconcileRecovery,
    resumeRecovery,
    recoveryPending: () => recoveryOperations > 0,
    continuityPanel,
    chooseContinuityRecording: async (_value: boolean) => gateContinuity(options.current()),
    forkPerson: (id: Rid) => {
      const world = options.current();
      if (!world) return Promise.reject(new Error('Open a chapter first.'));
      return checkpointPerson(world, id, true);
    },
  };
}

type Controller = ReturnType<typeof createNativeContinuity>;
let installed: Controller | undefined;
let uninstall: (() => void) | undefined;
function active(): Controller {
  if (!installed) throw new Error('Native continuity is not installed.');
  return installed;
}
export function installContinuity(
  current: NativeContinuityOptions['current'],
  save: NativeContinuityOptions['save'],
  load: NativeContinuityOptions['load'],
  options: Omit<NativeContinuityOptions, 'current' | 'save' | 'load'>,
): () => void {
  uninstall?.();
  const controller = createNativeContinuity({ ...options, current, save, load });
  installed = controller;
  const stop =
    (options.file ?? fileMode === 'file')
      ? () => {}
      : watchPersonaCheckpoint(async () => {
          await controller.checkpointContinuity();
        });
  const changed = (event: StorageEvent) => {
    if (event.key === null || event.key === 'hf-persona-opt-in') {
      controller.invalidateContinuity();
      void controller.gateContinuity(current());
    }
  };
  if (typeof window !== 'undefined') window.addEventListener('storage', changed);
  uninstall = () => {
    stop();
    if (typeof window !== 'undefined') window.removeEventListener('storage', changed);
    if (installed === controller) installed = undefined;
  };
  return uninstall;
}
export const arrive = (seed: number, fresh = false, edition?: BuildingEdition) =>
  active().arrive(seed, fresh, edition);
export const castReceipts = (world: BuildingWorld) => active().castReceipts(world);
export const restoreCastReceipts = (world: BuildingWorld, value: unknown, file = false) =>
  active().restoreCastReceipts(world, value, file);
export const validateContinuity = (world: BuildingWorld) => active().validateContinuity(world);
export const gateContinuity = (world: BuildingWorld | undefined, file = false) =>
  active().gateContinuity(world, file);
export const invalidateContinuity = () => active().invalidateContinuity();
export const checkpointContinuity = () => active().checkpointContinuity();
export const acceptedCastRecoveries = () => active().acceptedCastRecoveries();
export const continuityPanel = () => active().continuityPanel();
export const recoveryPending = () => installed?.recoveryPending() ?? false;
export const chooseContinuityRecording = async (value: boolean) => active().chooseContinuityRecording(value);
export const acknowledgeContinuity = (_world: BuildingWorld) => {};

export const continuityRefusals = (world: BuildingWorld, diagnostic = false) =>
  active().continuityRefusals(world, diagnostic);
