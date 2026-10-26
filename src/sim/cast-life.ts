/** Stairwell's declared Coast passport dialect. Calendar duties remain actual HF duties.
 * No skills, relationships or host-specific memories acquire a new meaning by sharing a name.
 * Full raw sources remain in source-local saves/exports. Coarse life does not heal or complete work.
 */
import {
  admitCalendarPersona,
  DEFAULT_NORMS,
  isContinuingCommitment,
  type Person,
  projectCalendarPersona,
  restore,
  snapshot,
  validateCalendarPersona,
} from '@adam0white/human-framework';
import {
  canonicalCast,
  canonicalPersona,
  castForGame,
  type LifePreparation,
  lifeAdmission,
  type PersonaEnvelope,
  preparePersonaLife,
} from '@adam0white/lab-client';
import { RESIDENTS, type Rid } from './people.ts';
export const ALLOCATION = castForGame('stairwell');
export const CAST_MAP = 'stairwell-calendar/1';
export const CALENDAR_ACTIONS = new Set([
  'eat',
  'drink',
  'sleep',
  'rest',
  'tea',
  'pray',
  'pray-home',
  'pray-qada',
  'pray-eid',
]);
export interface CastChapter {
  version: 'stairwell-cast/1';
  inputs: LifePreparation[];
  expectedHeads: Record<string, string | null>;
  initial: Partial<Record<Rid, Person>>;
  claims: PersonaEnvelope[];
}
export const roleFor = (castId: string): Rid => {
  const role = (Object.keys(RESIDENTS) as Rid[]).find((id) => RESIDENTS[id].castId === castId);
  if (!role) throw new Error('This character does not have a role in The Stairwell.');
  return role;
};
export function admitCast(input: LifePreparation, opening: Person): Person {
  const { parent } = input;
  const canonical = canonicalCast(parent.castId);
  if (parent.castRevision !== canonical.revision || roleFor(parent.castId) !== opening.id)
    throw new Error(
      'This character belongs to an older or different version. Export the file or start a new character history.',
    );
  if (canonicalPersona(preparePersonaLife(parent, input.clockMs)) !== canonicalPersona(input))
    throw new Error('The saved time away does not match the character’s history.');
  lifeAdmission(input, 'stairwell');
  if (parent.transfer.castPassport === 'authored-cast/1')
    throw new Error(
      'This file contains only a biography, without a saved character. Keep its archive or start a new local story.',
    );
  const own =
    parent.source.game === 'stairwell' &&
    ((parent.source.rules === '8' && parent.source.engine === '2.21.0') ||
      (['9', '10'].includes(parent.source.rules) && parent.source.engine === '2.23.0')) &&
    parent.transfer.castPassport === 'stairwell-cast/1';
  const voice =
    parent.source.game === 'voice' &&
    parent.source.rules === 'cast-1' &&
    parent.source.engine === '2.21.0' &&
    parent.castId === 'hf.cast.hacer.voice' &&
    parent.transfer.castPassport === 'site-cast/1';
  if ((!own && !voice) || parent.transfer.sourceRole !== opening.id)
    throw new Error(
      'This source role or character format is unsupported. Keep the chapter or export it. It will not be replaced with a new story.',
    );
  if (own && (!Array.isArray(parent.transfer.hostObligations) || parent.transfer.hostObligations.length))
    throw new Error(
      'The building account or dues still need attention in the source game. Keep that chapter. Starting here cannot remove those duties.',
    );
  const portable = validateCalendarPersona(parent.transfer.person);
  const mapping = own ? CAST_MAP : 'site-cast-calendar/1';
  if (
    portable.person.mappingVersion !== mapping ||
    portable.person.source.id !== opening.id ||
    portable.person.source.engine !== parent.source.engine
  )
    throw new Error('The character file does not match its source game.');
  const receipt = parent.transfer.checkpoint as
    | { schema?: unknown; sourceMinute?: unknown; rng?: unknown; sha256?: unknown }
    | undefined;
  if (
    !receipt ||
    Object.keys(receipt).sort().join(',') !== 'rng,schema,sha256,sourceMinute' ||
    receipt.schema !== portable.person.source.schema ||
    receipt.sourceMinute !== portable.person.source.now ||
    canonicalPersona(receipt.rng) !== canonicalPersona(portable.person.rng) ||
    typeof receipt.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(receipt.sha256)
  )
    throw new Error('The file is missing the record needed to verify its source.');
  const norms = portable.calendar.norms.map((norm) => {
    const known = DEFAULT_NORMS.find((n) => n.id === norm.id);
    if (!known || canonicalPersona(known) !== canonicalPersona(norm))
      throw new Error('The game cannot carry one of this character’s personal rules.');
    return known;
  });
  const obligations = [...portable.calendar.commitments, ...portable.calendar.owed];
  if (
    obligations.some(
      (c) =>
        c.actions.some((a) => !CALENDAR_ACTIONS.has(a)) ||
        (c.violatedBy ?? []).some((a) => !CALENDAR_ACTIONS.has(a)) ||
        ('toId' in c && c.toId && !['self', 'god', 'Allah'].includes(c.toId)),
    )
  )
    throw new Error('A duty still needs someone or somewhere in the source game. You cannot cancel it here.');
  const shifted = structuredClone(portable);
  const offset = opening.now - portable.person.source.now;
  shifted.calendar.offset = offset;
  for (const c of shifted.calendar.commitments) {
    c.from += offset;
    c.until += offset;
    if (c.recurUntil !== undefined) c.recurUntil += offset;
    if (c.exempt) c.exempt.at += offset;
  }
  for (const owed of shifted.calendar.owed) {
    owed.at += offset;
    if (owed.lapseSince !== undefined) owed.lapseSince += offset;
  }
  if (shifted.calendar.lapse) shifted.calendar.lapse.since += offset;
  const target = restore(snapshot(opening));
  if (target.activity) throw new Error('This character is already doing something at the start of the game.');
  target.body.fitness = portable.person.health.fitness;
  const age = portable.person.source.now - portable.person.life.bornAt;
  if (age < canonical.age * 525600 || age > (canonical.age + 200) * 525600)
    throw new Error('The character’s age does not match the saved history.');
  target.life.bornAt = portable.person.life.bornAt + offset;
  // Unknown skills retain their source archive and are explicitly omitted, never recertified.
  const omitted = Object.keys(shifted.person.skills);
  shifted.person.skills = {};
  shifted.person.skillRetention = null;
  if (omitted.length)
    shifted.person.limitations.push(
      `These skills remain in the earlier game’s archive because The Stairwell has no evidence for them: ${omitted.join(', ')}.`,
    );
  target.agenda.commitments = [];
  delete target.agenda.owed;
  delete target.agenda.lapse;
  return admitCalendarPersona(shifted, target, {
    mappingVersion: mapping,
    sourceId: opening.id,
    targetId: opening.id,
    targetNorms: norms,
  }).person;
}
export async function sourceTransfer(person: Person, hostObligations: string[]) {
  const retained = person.agenda.commitments.filter((c) => isContinuingCommitment(person.agenda, c));
  const owed = person.agenda.owed ?? [];
  const identity = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, id]));
  const portable = projectCalendarPersona(person, {
    version: CAST_MAP,
    skills: {},
    calendar: {
      version: 'hf-persona-calendar-map/1',
      offset: 0,
      references: {
        commitments: identity([
          ...retained.flatMap((c) => [c.id, ...(c.makeUpOf ? [c.makeUpOf] : [])]),
          ...owed.flatMap((d) => [d.ofId, ...(d.scheduledAs ? [d.scheduledAs] : [])]),
        ]),
        chains: identity(retained.flatMap((c) => (c.chain ? [c.chain] : []))),
        actions: identity([
          ...retained.flatMap((c) => [...c.actions, ...(c.violatedBy ?? [])]),
          ...owed.flatMap((d) => [...d.actions, ...(d.violatedBy ?? [])]),
        ]),
        entities: identity(
          retained.flatMap((c) => [c.toId, c.targetId].filter((x): x is string => x !== undefined)),
        ),
        norms: identity(DEFAULT_NORMS.map((n) => n.id)),
      },
      sourceNorms: DEFAULT_NORMS,
    },
  });
  portable.person.limitations.push(
    'Beliefs, trust, relationships, building accounts, visitor secrets and memories remain in the full archive of this game. Moving to another game does not finish work, pay debts or resolve private matters.',
  );
  const raw = snapshot(person);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalPersona(raw)));
  return {
    transfer: {
      castPassport: 'stairwell-cast/1',
      hostObligations: hostObligations.slice(),
      sourceRole: person.id,
      person: portable,
      checkpoint: {
        schema: person.schema,
        sourceMinute: person.now,
        rng: structuredClone(person.rng),
        sha256: Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join(''),
      },
    },
    raw,
  };
}
