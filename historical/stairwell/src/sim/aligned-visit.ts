/** Finite headless source12 departure and Task3 return over an immutable edition11 prefix.
 * No shelf writes, ownership or ordinary player entry. Complete raw stays exact.
 * INERT finite-capture prototype, not ordinary-player admission or arbitrary seeds/owned heads.
 * Task4 must separately implement a trusted current-controller/native publication contract
 * before exposing a general source entry. General admission remains pending.
 */

import { DEFAULT_NORMS, restore, snapshot } from '@adam0white/human-framework';
import {
  boundedPersonaJson,
  canonicalPersona,
  checkRun,
  createPersona,
  type PersonaEnvelope,
  validatePersona,
  validatePersonaLife,
} from '@adam0white/lab-client';
import { exportGardenVisit, type GardenVisitSave, replayGardenVisit } from '@stairwell/garden-replay-history';
import { isSaved, type Saved } from '../ui/save.ts';
import { CALENDAR_ACTIONS, sourceTransfer } from './cast-life.ts';
import { type GameState, personOf, replay, rOf, step } from './game.ts';

export const ALIGNED_GAME = 'stairwell@12';
export const ALIGNED_CHAPTER = 'stairwell-aligned-visit/1';
const DIALECT = 'derya-aligned-visit/1';
const CAST = 'hf.cast.derya.stairwell';
// SHA256(UTF8(canonicalPersona(JSON.parse(original E file bytes)))).
// Retained derya-source-capture-evidence: native-passport.json, notebook.json, full-state.json.
// These independent pins identify one immutable capture, not caller assertions or ownership.
const CAPTURE_PREDECESSOR = '07c66193b91a1787b68bfb0bb99fa79ae6bc1530f2a5313a3ead8684f6e03316';
const CAPTURE_PREFIX = 'f89a9ba3785b952d06b67362fe19dce72ba90eb0f38c2da8eb6b7e906e5e083b';
const CAPTURE_WORLD = '0a7dafcdd09ed4f1a15b373af8204683411a178513af2e994c413426b9f65d68';
const START = 930;
const RETURN_BEFORE = 1170;
export interface AlignedBuild {
  app: string;
  framework: string;
  commit: string;
  dirty: boolean;
}
export interface AlignedVisitState {
  game: typeof ALIGNED_GAME;
  chapter: typeof ALIGNED_CHAPTER;
  prefix: Saved;
  predecessor: PersonaEnvelope;
  provenance: AlignedBuild;
  inputs:
    | [{ at: 930; kind: 'aligned-visit-depart' }]
    | [
        { at: 930; kind: 'aligned-visit-depart' },
        { at: 990; kind: 'aligned-visit-return'; gardenRef: string },
      ];
  external?: Record<string, GardenVisitSave>;
  departure: PersonaEnvelope;
  submitted: false;
  accepted: false;
  origin: 'controlled-local';
  world: GameState;
}
export type AlignedVisitSave = Omit<AlignedVisitState, 'world'> & { state?: { world: GameState } };
const fail = (message: string): never => {
  throw new Error(`Aligned visit: ${message}`);
};
function equal(a: unknown, b: unknown, message: string): void {
  if (canonicalPersona(a) !== canonicalPersona(b)) fail(message);
}
async function sha(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalPersona(value)));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
function buildStamp(value: AlignedBuild): void {
  boundedPersonaJson(value);
  if (
    Object.keys(value).sort().join(',') !== 'app,commit,dirty,framework' ||
    value.app !== '0.1.0' ||
    value.framework !== '3.0.0' ||
    !/^[a-f0-9]{40}$/.test(value.commit) ||
    typeof value.dirty !== 'boolean'
  )
    fail('unsupported actual build stamp');
}
/** Audit the actual host, separately from the calendar projection's hostObligations field. */
function hostAudit(world: GameState): string[] {
  const month = world.month;
  if (!month) throw new Error('Aligned visit: missing month world');
  const actor = personOf(world, 'derya');
  const resident = rOf(world, 'derya');
  if (
    world.version !== 'stairwell@11' ||
    !world.month ||
    world.minute !== START ||
    world.phase !== 'day' ||
    world.castPauses?.derya !== 'paused' ||
    resident.where !== 'paused' ||
    actor.now !== START ||
    actor.id !== 'derya' ||
    actor.schema !== 'human/person@1' ||
    actor.engine !== '2.23.0' ||
    actor.activity
  )
    fail('Derya is not at the actual supported departure boundary');
  const obligations: string[] = [];
  for (const task of world.tasks) {
    if (task.done === undefined && (task.custody === 'derya' || task.wrongDoor === 'derya'))
      obligations.push(`Unfinished parcel custody ${task.id}`);
  }
  for (const visit of month.visits) {
    if (visit.done === undefined && (visit.actor === 'derya' || visit.other === 'derya'))
      obligations.push(`Unfinished ${visit.kind} visit at ${visit.startedAt}`);
  }
  if (resident.word === 'yes') obligations.push('Unfinished Sunday support promise');
  // Dues promises and parcel/support promises also live in the HF agenda. Unknown conduct refuses.
  for (const commitment of actor.agenda.commitments) {
    if (
      commitment.status === 'pending' &&
      (commitment.actions.some((action) => !CALENDAR_ACTIONS.has(action)) ||
        (commitment.violatedBy ?? []).some((action) => !CALENDAR_ACTIONS.has(action)) ||
        [commitment.toId, commitment.targetId].some((id) => id && !['self', 'god', 'Allah'].includes(id)))
    )
      obligations.push(`Unsupported source promise ${commitment.id}`);
  }
  for (const owed of actor.agenda.owed ?? []) {
    if (owed.actions.some((action) => !CALENDAR_ACTIONS.has(action)))
      obligations.push(`Unsupported source debt ${owed.ofId}`);
  }
  return obligations;
}
function prefixWorld(prefix: Saved): GameState {
  // The immutable prefix is local/export data, never recursively embedded in the shelf passport.
  boundedPersonaJson(prefix);
  if (
    !isSaved(prefix) ||
    prefix.game !== 'stairwell@11' ||
    prefix.minute !== START ||
    prefix.oneCast?.admission ||
    prefix.oneCast?.departure ||
    prefix.castChapter
  )
    fail('unsupported predecessor notebook');
  if (
    prefix.castReceipts &&
    (Object.keys(prefix.castReceipts.owned).length ||
      Object.keys(prefix.castReceipts.sources).length ||
      prefix.castReceipts.fileOrigin ||
      !prefix.castReceipts.authored)
  )
    fail('this task supports only the unsubmitted local predecessor');
  const world = replay(prefix.seed, prefix.inputs, prefix.minute, prefix.game);
  if (prefix.oneCast) world.oneCast = structuredClone(prefix.oneCast);
  return world;
}
async function expectedTransfer(prefix: Saved, previous: PersonaEnvelope, stamp: AlignedBuild) {
  buildStamp(stamp);
  const predecessor = await validatePersona(previous);
  if (
    predecessor.castId !== CAST ||
    predecessor.castRevision !== '2' ||
    predecessor.terminal ||
    predecessor.parentRevision !== null ||
    predecessor.source.game !== 'stairwell' ||
    predecessor.source.rules !== '11' ||
    predecessor.source.engine !== '2.23.0' ||
    predecessor.transfer.castPassport !== 'stairwell-cast/1' ||
    predecessor.transfer.sourceRole !== 'derya'
  )
    fail('unsupported unsubmitted predecessor');
  // The entire original envelope pins revision, branch, source build and complete life.
  // A public rehash or structurally valid life clone cannot authenticate a replacement.
  if ((await sha(predecessor)) !== CAPTURE_PREDECESSOR) fail('immutable E predecessor binding mismatch');
  if ((await sha(prefix)) !== CAPTURE_PREFIX) fail('immutable E prefix binding mismatch');
  const world = prefixWorld(prefix);
  if ((await sha(world)) !== CAPTURE_WORLD) fail('immutable E full-world binding mismatch');
  const obligations = hostAudit(world);
  if (obligations.length) fail(obligations.join('; '));
  const raw = snapshot(personOf(world, 'derya'));
  equal(snapshot(restore(raw)), raw, 'complete snapshot/restore mismatch');
  // Actual released projection supplies health/activity/goal/project/calendar/owed guards.
  const projected = await sourceTransfer(restore(raw), obligations);
  for (const norm of projected.transfer.person.calendar.norms) {
    const known = DEFAULT_NORMS.find((candidate) => candidate.id === norm.id);
    if (!known) fail('unsupported personal conduct');
    equal(norm, known, 'changed personal conduct');
  }
  equal(
    predecessor.transfer.checkpoint,
    projected.transfer.checkpoint,
    'predecessor raw checkpoint mismatch',
  );
  equal(predecessor.transfer.person, projected.transfer.person, 'predecessor projection mismatch');
  equal(predecessor.transfer.hostObligations, obligations, 'predecessor obligations mismatch');
  // Life is retained exactly. No wall-time call, invented preparation or re-anchoring of E.
  const life = validatePersonaLife(predecessor.transfer.life, CAST);
  equal(life, predecessor.transfer.life, 'changed predecessor life');
  const prefixSHA256 = await sha(prefix);
  const transfer = {
    castPassport: DIALECT,
    sourceRole: 'derya',
    phase: 'departure',
    person: projected.transfer.person,
    complete: { schema: raw.schema, engine: raw.engine, raw, sha256: await sha(raw) },
    checkpoint: projected.transfer.checkpoint,
    hostObligations: obligations,
    retainedSchedule: [{ role: 'derya', kind: 'night-duty', at: RETURN_BEFORE }],
    life: structuredClone(life),
    provenance: structuredClone(stamp),
    visit: {
      version: DIALECT,
      start: START,
      plannedEnd: 990,
      returnBefore: RETURN_BEFORE,
      predecessor: {
        game: 'stairwell',
        rules: '11',
        source: predecessor.source,
        revision: predecessor.revision,
        branchId: predecessor.branchId,
        checkpointSHA256: projected.transfer.checkpoint.sha256,
        prefixSHA256,
      },
      departureBranchId: predecessor.branchId,
      sourceChapter: ALIGNED_CHAPTER,
      receiverEdition: 'hearsay-cast/7',
      receiverRole: 'garden-visitor',
      absence: 'paused-person-world-steps/1',
      returnRole: 'derya',
    },
  };
  boundedPersonaJson(transfer);
  return { world, transfer, predecessor };
}
/** Explicitly start a new outer chapter. This does not publish or acquire a shelf head. */
export async function departAlignedVisit(
  prefix: Saved,
  previous: PersonaEnvelope,
  provenance: AlignedBuild,
): Promise<AlignedVisitState> {
  // Detach before awaits; caller mutation cannot change the pinned proof.
  const pinned = structuredClone({ prefix, previous, provenance });
  const { world, transfer, predecessor } = await expectedTransfer(
    pinned.prefix,
    pinned.previous,
    pinned.provenance,
  );
  const departure = await createPersona({
    format: 'hf-persona/1',
    castId: CAST,
    castRevision: '2',
    branchId: predecessor.branchId,
    parentRevision: null,
    source: {
      game: 'stairwell',
      rules: '12',
      engine: '2.23.0',
      build: pinned.provenance.commit.slice(0, 12),
    },
    transfer,
    limitations: [
      ...predecessor.limitations,
      'The person field is partial. complete.raw retains the full Person. The source world stays in the local chapter export.',
      'Controlled local departure only: unsubmitted and not accepted. Night duty at1170 remains due.',
    ],
  });
  return {
    game: ALIGNED_GAME,
    chapter: ALIGNED_CHAPTER,
    prefix: pinned.prefix,
    predecessor,
    provenance: pinned.provenance,
    inputs: [{ at: START, kind: 'aligned-visit-depart' }],
    departure,
    submitted: false,
    accepted: false,
    origin: 'controlled-local',
    world,
  };
}
/** Native exports share one discriminator. Compact omits only the derived nested world. */
export function exportAlignedVisit(state: AlignedVisitState, compact = false): AlignedVisitSave {
  const { world, ...chapter } = structuredClone(state);
  return compact ? chapter : { ...chapter, state: { world } };
}
/** This is a finite native file, not a Shelf transfer. Metadata keeps the SDK's
 * 256KiB/depth24/node20000 limits; Garden validates its own finite resource graph.
 * The complete chapter (including derived world) keeps the native 4MiB guard.
 */
function nativeValue(value: unknown): unknown {
  let nodes = 0;
  const walk = (child: unknown, depth: number): void => {
    if (++nodes > 480000 || depth > 64) fail('native data is too complex');
    if (child === null || typeof child === 'boolean' || typeof child === 'string') return;
    if (typeof child === 'number' && Number.isFinite(child)) return;
    if (Array.isArray(child)) {
      for (const item of child) walk(item, depth + 1);
      return;
    }
    if (
      !child ||
      typeof child !== 'object' ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(child))
    )
      throw new Error('Aligned visit: native data must be plain JSON');
    for (const [key, item] of Object.entries(child)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('unsafe JSON key');
      walk(item, depth + 1);
    }
  };
  walk(value, 0);
  const text = JSON.stringify(value);
  if (typeof text !== 'string' || !checkRun(text)) fail('native file exceeds size/depth/complexity bounds');
  return JSON.parse(text, (key, child) => {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('unsafe JSON key');
    return child;
  });
}
/** Install only a validated, independently replayed finite Garden closing. */
async function installReturn(expected: AlignedVisitState, garden: unknown): Promise<AlignedVisitState> {
  const run = await replayGardenVisit(garden);
  if (run.phase !== 'closed' || run.actualEnd !== 990 || run.minute !== 990 || !run.closing)
    return fail('unsupported finite return boundary');
  const resources = run.resources;
  // Rehydrate the published normalized graph, never tick that normalized world.
  const packet = structuredClone(resources[run.source.packet]) as PersonaEnvelope;
  const complete = packet.transfer.complete as { rawRef?: string; raw?: unknown };
  if (complete.rawRef !== run.source.raw || packet.transfer.lifeRef !== run.source.life)
    fail('source references mismatch');
  delete complete.rawRef;
  complete.raw = structuredClone(resources[run.source.raw]);
  delete packet.transfer.lifeRef;
  packet.transfer.life = structuredClone(resources[run.source.life]);
  const predecessor = structuredClone(resources[run.source.predecessor]) as PersonaEnvelope;
  if (predecessor.transfer.lifeRef !== run.source.life) fail('predecessor life mismatch');
  delete predecessor.transfer.lifeRef;
  predecessor.transfer.life = structuredClone(resources[run.source.life]);
  const sourceWorld = structuredClone(resources[run.source.world]) as { people: unknown[] };
  let refs = 0;
  sourceWorld.people = sourceWorld.people.map((row) => {
    const ref = row as { rawRef?: string };
    if (ref.rawRef === undefined) return row;
    if (Object.keys(ref).join(',') !== 'rawRef' || ref.rawRef !== run.source.raw)
      fail('source actor reference mismatch');
    refs++;
    return structuredClone(resources[run.source.raw]);
  });
  if (refs !== 1) fail('expected one source Derya reference');
  equal(packet, expected.departure, 'original departure binding mismatch');
  equal(predecessor, expected.predecessor, 'original predecessor binding mismatch');
  equal(resources[run.source.prefix], expected.prefix, 'original prefix binding mismatch');
  equal(sourceWorld, expected.world, 'original full world binding mismatch');
  const claim = resources[run.closing] as { rawRef: string };
  const raw = snapshot(run.people.derya);
  equal(raw, resources[claim.rawRef], 'closing complete raw mismatch');
  equal(snapshot(restore(raw)), raw, 'closing snapshot/restore mismatch');
  if (raw.now !== 990 || raw.id !== 'derya' || raw.engine !== '2.23.0' || raw.activity)
    fail('unsupported closing actor boundary');
  const compact = await exportGardenVisit(run, true);
  const gardenRef = await sha(compact);
  const world = expected.world;
  const frozen = snapshot(personOf(world, 'derya'));
  for (let minute = START + 1; minute <= 990; minute++) {
    step(world);
    if (world.minute !== minute || world.phase !== 'day' || world.castPauses?.derya !== 'paused')
      fail('source absence did not advance normally');
    equal(snapshot(personOf(world, 'derya')), frozen, 'source Derya changed while absent');
  }
  if (
    world.people.filter((person) => person.id === 'derya').length !== 1 ||
    world.residents.filter((resident) => resident.id === 'derya').length !== 1
  )
    fail('expected exactly one return slot');
  const slot = world.people.findIndex((person) => person.id === 'derya');
  world.people[slot] = restore(raw);
  if (world.castPauses) delete world.castPauses.derya;
  Object.assign(rOf(world, 'derya'), { where: 'home', doing: 'home', until: 990, stairsUntil: 0 });
  return {
    ...expected,
    inputs: [
      { at: START, kind: 'aligned-visit-depart' },
      { at: 990, kind: 'aligned-visit-return', gardenRef },
    ],
    external: { [gardenRef]: compact },
  };
}
/** Append one finite local return. Arguments detach before the first await. */
export async function returnAlignedVisit(
  chapter: AlignedVisitSave,
  garden: unknown,
): Promise<AlignedVisitState> {
  const pinned = nativeValue({ chapter, garden }) as { chapter: AlignedVisitSave; garden: unknown };
  const expected = await replayAlignedVisit(pinned.chapter);
  if (expected.external) fail('duplicate return');
  return installReturn(expected, pinned.garden);
}
/** Reconstruct the exact old11 prefix, validate all external input, then derive world. */
export async function replayAlignedVisit(value: unknown): Promise<AlignedVisitState> {
  const save = nativeValue(value) as AlignedVisitSave;
  if (!save || typeof save !== 'object' || Array.isArray(save)) fail('invalid native chapter');
  const { state, external, ...chapter } = save;
  boundedPersonaJson(chapter);
  if (
    Object.keys(chapter).sort().join(',') !==
      'accepted,chapter,departure,game,inputs,origin,predecessor,prefix,provenance,submitted' ||
    save.game !== ALIGNED_GAME ||
    save.chapter !== ALIGNED_CHAPTER ||
    save.submitted !== false ||
    save.accepted !== false ||
    save.origin !== 'controlled-local'
  )
    fail('unsupported dialect or ownership claim');
  const returning = external !== undefined;
  if (!returning)
    equal(save.inputs, [{ at: START, kind: 'aligned-visit-depart' }], 'unsupported phase/input');
  else {
    const input = save.inputs[1];
    if (!input || !('gardenRef' in input) || !/^[a-f0-9]{64}$/.test(input.gardenRef))
      return fail('missing return reference');
    equal(
      save.inputs,
      [
        { at: START, kind: 'aligned-visit-depart' },
        { at: 990, kind: 'aligned-visit-return', gardenRef: input.gardenRef },
      ],
      'unsupported return input',
    );
    if (
      !external ||
      typeof external !== 'object' ||
      Array.isArray(external) ||
      Object.keys(external).join(',') !== input.gardenRef
    )
      fail('missing or extra external Garden resource');
    if ((await sha(external[input.gardenRef])) !== input.gardenRef) fail('external Garden digest mismatch');
  }
  await validatePersona(save.departure);
  let expected = await departAlignedVisit(save.prefix, save.predecessor, save.provenance);
  equal(save.departure, expected.departure, 'complete packet or source binding mismatch');
  if (external) {
    const input = save.inputs[1];
    if (!input || !('gardenRef' in input)) return fail('missing return');
    expected = await installReturn(expected, external[input.gardenRef]);
    equal(expected.external, external, 'noncanonical external Garden');
  }
  if (state !== undefined) equal(state, { world: expected.world }, 'native full state mismatch');
  return expected;
}
/** File and direct replay use identical finite and unsafe-key guards. */
export async function importAlignedVisit(text: string): Promise<AlignedVisitState> {
  if (!checkRun(text)) fail('native file exceeds size/depth/complexity bounds');
  const parsed: unknown = JSON.parse(text, (key, value) => {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('unsafe JSON key');
    return value;
  });
  return replayAlignedVisit(parsed);
}
