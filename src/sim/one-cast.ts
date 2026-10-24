/** Derya's bounded source and return chapters. Full checkpoints and world prefixes stay local. */
import {
  admitPersona,
  type Person,
  projectPersona,
  snapshot,
  validatePersonaProjection,
} from '@adam0white/human-framework';
import {
  canonicalPersona,
  createPersona,
  type PersonaEnvelope,
  validatePersona,
} from '@adam0white/lab-client';
import { GAME_VERSION, type GameState, type Input, personOf, replay } from './game.ts';

export const DERYA_CAST = 'hf.cast.derya.stairwell';
export const ONE_CAST_ADAPTER = 'stairwell-one-cast/1';
export type OneCastRow = {
  v: 1;
  probe: 'derya';
  arm: 'fresh' | 'biography' | 'continuing';
  scope: 'shared' | 'local' | 'file';
  castId: string;
  branchId: string;
  revision: string;
  parentRevision: string | null;
  stage: string;
  outcome: string;
};
export interface DeryaReturnAdmission {
  adapter: typeof ONE_CAST_ADAPTER;
  envelope: PersonaEnvelope;
  person: Person;
  prefix: {
    seed: number;
    inputs: Input[];
    minute: number;
    edition: string;
    checkpointDigest: string;
    sourceHead: PersonaEnvelope;
  };
  targetBuild: string;
}
export interface DeryaContinuity {
  sourcePrefix?: { seed: number; inputs: Input[]; minute: number; edition: string };
  originScope?: OneCastRow['scope'];
  recordingFileKey?: string;
  departureRequested?: boolean;
  departure?: { at: number; episodeId: string };
  admission?: DeryaReturnAdmission;
  head?: PersonaEnvelope;
  scope?: OneCastRow['scope'];
  rows: OneCastRow[];
  lastCheckpoint?: Person;
}
const fail = (s: string): never => {
  throw new Error(`One cast: ${s}`);
};
const hash = /^[a-f0-9]{64}$/;
export async function checkpointPerson(person: Person) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonicalPersona(snapshot(person))),
  );
  return {
    sourceSchema: person.schema,
    sourceNow: person.now,
    sourceRng: structuredClone(person.rng),
    checkpointDigest: Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, '0')).join(''),
  };
}
export async function createDeryaCheckpoint(
  s: GameState,
  options: { build: string; branchId: string; parentRevision: string | null },
): Promise<PersonaEnvelope> {
  const departure = s.oneCast?.departure;
  if (s.version !== GAME_VERSION || !departure) return fail('played source departure is required');
  const person = personOf(s, 'derya');
  const episode = person.memory.episodes.find(
    (e) => e.id === departure.episodeId && e.action === 'night-work',
  );
  if (!episode || person.activity) return fail('attended source night work is unavailable');
  const projection = projectPersona(person, {
    version: 'stairwell-hearsay/1',
    skills: {},
    episodes: { [episode.id]: { id: 'stairwell-night-work', action: 'work', actorId: 'derya', tags: [] } },
  });
  return createPersona({
    format: 'hf-persona/1',
    castId: DERYA_CAST,
    castRevision: '2',
    branchId: options.branchId,
    parentRevision: options.parentRevision,
    source: { game: 'stairwell', build: options.build, engine: person.engine, rules: '6' },
    transfer: {
      person: projection,
      history: [
        {
          id: 'stairwell-night-work',
          kind: 'night-work',
          sourceGame: 'stairwell',
          episodeId: 'stairwell-night-work',
          disclosed: true,
        },
      ],
      checkpoint: await checkpointPerson(person),
      departure: { adapter: ONE_CAST_ADAPTER, rotaPaused: true, minute: departure.at },
    },
    limitations: projection.limitations.slice(0, 64),
  });
}
/** The returning body uses its actual carried fitness only after strict clinical and circadian compatibility. */
export async function prepareDeryaReturn(
  input: unknown,
  prefix: GameState,
  options: { build: string },
): Promise<DeryaReturnAdmission> {
  const envelope = await validatePersona(input);
  if (
    envelope.castId !== DERYA_CAST ||
    envelope.castRevision !== '2' ||
    envelope.source.game !== 'hearsay' ||
    envelope.source.engine !== '2.14.1' ||
    !['4', '5'].includes(envelope.source.rules)
  )
    return fail('unsupported returning source');
  if (
    Object.keys(envelope.transfer).some(
      (k) => !['person', 'history', 'checkpoint', 'admission', 'departure'].includes(k),
    )
  )
    return fail('unsupported transfer field');
  const projection = validatePersonaProjection(envelope.transfer.person);
  if (
    projection.mappingVersion !== 'hearsay-stairwell/1' ||
    projection.source.id !== 'derya' ||
    projection.life.sex !== 'female' ||
    projection.name !== 'Derya' ||
    Object.keys(projection.skills).length ||
    projection.commitments.length ||
    projection.episodes.length > 1
  )
    return fail('unsupported returning mapping');
  if (!prefix.oneCast?.departure || prefix.oneCast.admission || prefix.version !== GAME_VERSION)
    return fail('local source departure prefix is unavailable; fresh authored play remains available');
  const sourceHead = prefix.oneCast.head;
  if (!sourceHead || sourceHead.branchId !== envelope.branchId)
    return fail('return branch does not match local source receipt');
  await validatePersona(sourceHead);
  const metadata = envelope.transfer.admission as Record<string, unknown> | undefined;
  const sourceStamp = sourceHead.transfer.checkpoint as Record<string, unknown>;
  if (
    metadata?.adapter !== 'hearsay-one-cast/1' ||
    metadata.mapping !== 'hearsay-stairwell/1' ||
    metadata.openingMinute !== projection.source.now ||
    metadata.sourceRevision !== sourceHead.revision ||
    metadata.sourceCheckpointDigest !== sourceStamp.checkpointDigest
  )
    return fail('return source receipt does not match local departure');
  const original = personOf(prefix, 'derya');
  if ((await checkpointPerson(original)).checkpointDigest !== sourceStamp.checkpointDigest)
    return fail('local source checkpoint digest conflict');
  const rebuilt = replay(prefix.seed, prefix.inputs, prefix.minute, prefix.version);
  if (
    canonicalPersona(snapshot(personOf(rebuilt, 'derya'))) !== canonicalPersona(snapshot(original)) ||
    canonicalPersona(rebuilt.oneCast?.departure) !== canonicalPersona(prefix.oneCast.departure)
  )
    return fail('local source departure prefix is invalid');
  const c = envelope.transfer.checkpoint as ReturnTypeShape;
  if (
    !c ||
    Object.keys(c).sort().join(',') !== 'checkpointDigest,sourceNow,sourceRng,sourceSchema' ||
    !hash.test(c.checkpointDigest) ||
    String(c.sourceSchema) !== String(projection.source.schema) ||
    c.sourceNow !== projection.source.now ||
    canonicalPersona(c.sourceRng) !== canonicalPersona(projection.rng)
  )
    return fail('invalid checkpoint stamps');
  const history = envelope.transfer.history;
  if (!Array.isArray(history) || history.length > 1) return fail('unsupported return history');
  for (const fact of history) {
    if (!fact || typeof fact !== 'object') return fail('invalid encounter history');
    const f = fact as Record<string, unknown>;
    if (
      Object.keys(f).some(
        (k) => !['id', 'kind', 'sourceGame', 'episodeId', 'disclosed', 'outcome'].includes(k),
      ) ||
      f.id !== 'hearsay-encounter' ||
      f.kind !== 'hearsay-encounter' ||
      f.sourceGame !== 'hearsay' ||
      f.disclosed !== true ||
      !['accepted', 'declined'].includes(String(f.outcome)) ||
      typeof f.episodeId !== 'string' ||
      f.episodeId.length > 128
    )
      return fail('unsupported encounter history');
    if (
      projection.episodes.length &&
      !projection.episodes.some(
        (e) => e.id === f.episodeId && e.action === 'talk' && (!e.actorId || e.actorId === 'hearsay-hatice'),
      )
    )
      return fail('encounter provenance mismatch');
  }
  if (projection.episodes.length && history.length !== 1) return fail('unapproved return episode');
  if (
    original.body.health !== projection.health.health ||
    original.body.circadianPeak !== projection.health.circadianPeak
  )
    return fail('clinical health or circadian conflict');
  const opening = snapshot(original);
  opening.body.fitness = projection.health.fitness;
  const originalAge = original.now - original.life.bornAt;
  const carriedAge = projection.source.now - projection.life.bornAt;
  if (carriedAge < originalAge || carriedAge >= 45 * 365 * 1440) return fail('return age conflict');
  opening.life.bornAt = projection.life.bornAt + opening.now - projection.source.now;
  // A new local chapter starts at the local boundary, never at an earlier source opening.
  const admitted = admitPersona(projection, opening, {
    mappingVersion: 'hearsay-stairwell/1',
    sourceId: 'derya',
    targetId: 'derya',
  });
  return {
    adapter: ONE_CAST_ADAPTER,
    envelope: structuredClone(envelope),
    person: snapshot(admitted.person),
    targetBuild: options.build,
    prefix: {
      seed: prefix.seed,
      inputs: structuredClone(prefix.inputs),
      minute: prefix.minute,
      edition: prefix.version,
      checkpointDigest: (await checkpointPerson(original)).checkpointDigest,
      sourceHead: structuredClone(sourceHead),
    },
  };
}
type ReturnTypeShape = {
  sourceSchema: Person['schema'];
  sourceNow: number;
  sourceRng: Person['rng'];
  checkpointDigest: string;
};
export function applyDeryaReturn(prefix: GameState, admission: DeryaReturnAdmission): GameState {
  const s = structuredClone(prefix);
  if (
    !s.oneCast?.departure ||
    s.minute !== admission.prefix.minute ||
    s.seed !== admission.prefix.seed ||
    canonicalPersona(s.inputs) !== canonicalPersona(admission.prefix.inputs)
  )
    return fail('return prefix mismatch');
  s.people = s.people.map((p) => (p.id === 'derya' ? snapshot(admission.person) : p));
  s.oneCast = {
    ...s.oneCast,
    admission: structuredClone(admission),
    head: structuredClone(admission.envelope),
  };
  const resident = s.residents.find((r) => r.id === 'derya');
  if (resident) {
    resident.where = 'asleep';
    resident.doing = 'sleep';
    resident.until = s.minute;
  }
  s.said.push({
    at: s.minute,
    who: 'derya',
    kind: 'voice',
    text: 'Back at flat 5. I still need my morning sleep.',
  });
  return s;
}
export async function validateDeryaContinuity(s: GameState): Promise<void> {
  if (!s.oneCast) return;
  const token = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  if (!Array.isArray(s.oneCast.rows) || s.oneCast.rows.length > 128) return fail('invalid measurement rows');
  for (const row of s.oneCast.rows) {
    if (
      !row ||
      Object.keys(row).sort().join(',') !==
        'arm,branchId,castId,outcome,parentRevision,probe,revision,scope,stage,v' ||
      row.v !== 1 ||
      row.probe !== 'derya' ||
      row.castId !== DERYA_CAST ||
      !['fresh', 'biography', 'continuing'].includes(row.arm) ||
      !['shared', 'local', 'file'].includes(row.scope) ||
      !hash.test(row.revision) ||
      !(row.parentRevision === null || hash.test(row.parentRevision)) ||
      ![row.branchId, row.stage, row.outcome].every((v) => typeof v === 'string' && token.test(v))
    )
      return fail('invalid measurement row');
  }

  if (s.oneCast.head) {
    const head = await validatePersona(s.oneCast.head);
    if (head.castId !== DERYA_CAST || head.castRevision !== '2') return fail('saved head cast conflict');
    if (!s.oneCast.admission) {
      if (head.source.game !== 'stairwell' || head.source.rules !== '6')
        return fail('saved source head conflict');
      const checkpoint = s.oneCast.lastCheckpoint ?? personOf(s, 'derya');
      const stamp = head.transfer.checkpoint as ReturnTypeShape;
      if (!stamp || (await checkpointPerson(checkpoint)).checkpointDigest !== stamp.checkpointDigest)
        return fail('saved source checkpoint conflict');
      const pinned = s.oneCast.sourcePrefix ?? {
        seed: s.seed,
        inputs: s.inputs,
        minute: s.minute,
        edition: s.version,
      };
      const reconstructed = replay(pinned.seed, pinned.inputs, pinned.minute, pinned.edition);
      if (
        canonicalPersona(snapshot(personOf(reconstructed, 'derya'))) !==
        canonicalPersona(snapshot(checkpoint))
      )
        return fail('saved source checkpoint is not replayed');
      const expected = await createDeryaCheckpoint(reconstructed, {
        build: head.source.build,
        branchId: head.branchId,
        parentRevision: head.parentRevision,
      });
      if (canonicalPersona(expected) !== canonicalPersona(head))
        return fail('saved source projection conflict');
    }
  }
  const admission = s.oneCast.admission;
  if (admission) {
    const p = admission.prefix;
    const prefix = replay(p.seed, p.inputs, p.minute, p.edition);
    if (!prefix.oneCast) return fail('pinned prefix edition conflict');
    prefix.oneCast.head = structuredClone(p.sourceHead);
    if ((await checkpointPerson(personOf(prefix, 'derya'))).checkpointDigest !== p.checkpointDigest)
      return fail('pinned prefix digest conflict');
    const expected = await prepareDeryaReturn(admission.envelope, prefix, { build: admission.targetBuild });
    if (canonicalPersona(expected) !== canonicalPersona(admission))
      return fail('pinned return admission conflict');
  }
}
