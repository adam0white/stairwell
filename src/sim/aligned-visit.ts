/** Task1 only: controlled headless source12 departure, over an immutable edition11 prefix.
 * No shelf writes, ownership, garden, return or ordinary player entry. Complete raw stays exact.
 * INERT finite-capture prototype, not ordinary-player admission or arbitrary seeds/owned heads.
 * Task4 must separately implement a trusted current-controller/native publication contract
 * before exposing a general source entry. Garden and return remain pending.
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
import { isSaved, type Saved } from '../ui/save.ts';
import { CALENDAR_ACTIONS, sourceTransfer } from './cast-life.ts';
import { type GameState, personOf, replay, rOf } from './game.ts';

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
  inputs: [{ at: 930; kind: 'aligned-visit-depart' }];
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
/** Reconstruct the entire predecessor with old11 rules, then validate the new12 input and packet. */
export async function replayAlignedVisit(value: unknown): Promise<AlignedVisitState> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid native chapter');
  const save = structuredClone(value) as AlignedVisitSave;
  const { state, ...chapter } = save;
  // The passport's public bounds apply to the complete packet, not the much larger source world.
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
  equal(save.inputs, [{ at: START, kind: 'aligned-visit-depart' }], 'unsupported phase/input');
  await validatePersona(save.departure);
  const expected = await departAlignedVisit(save.prefix, save.predecessor, save.provenance);
  equal(save.departure, expected.departure, 'complete packet or source binding mismatch');
  if (state !== undefined) equal(state, { world: expected.world }, 'native full state mismatch');
  return expected;
}
/** File bounds are explicit; malformed/unsafe JSON is rejected before any Person is restored. */
export async function importAlignedVisit(text: string): Promise<AlignedVisitState> {
  if (new TextEncoder().encode(text).length > 4 * 1024 * 1024 || !checkRun(text))
    fail('native file exceeds size/depth/complexity bounds');
  const parsed: unknown = JSON.parse(text, (key, value) => {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('unsafe JSON key');
    return value;
  });
  return replayAlignedVisit(parsed);
}
