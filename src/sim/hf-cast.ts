/** Current-source exchange uses HF's public projection and mapped authoring.
 * The shelf still owns identity, transport and CAS. A file never owns a head.
 */
import {
  admitPortablePerson,
  canonicalCast,
  type PersonaEnvelope,
  portablePersonRole,
  validatePortablePerson,
} from '@adam0white/lab-client';
import type { PersonAuthoring, PortablePerson } from '@stairwell/hf4';
import { RESIDENTS, type Rid } from './building-cast.ts';
import type { BuildingRun } from './hf-run.ts';

export function retainedOpening(
  parent: PersonaEnvelope,
  at: number,
  opening: PersonAuthoring,
): PersonAuthoring {
  const role = portablePersonRole(parent, 'stairwell');
  const portable = validatePortablePerson(parent.transfer.portable);
  if (portable.version !== 2)
    throw new Error(
      'This older summary needs its verified source archive to retain memories. Keep the file.',
    );
  if (
    role !== opening.id ||
    !Array.isArray(parent.transfer.hostObligations) ||
    parent.transfer.hostObligations.length
  )
    throw new Error(
      'This character still needs its source chapter. Keep the file and finish its responsibilities there.',
    );
  const arrival = structuredClone(opening);
  // These are fresh-opening seeds, not the incoming remembered life. HF requires
  // an empty authoring slot and installs the complete retained memory and duties
  // atomically. Local roles and relationships remain receiving-world authoring.
  arrival.biography = [];
  arrival.state.beliefs = [];
  arrival.state.expectations = [];
  arrival.state.sourceTrust = [];
  arrival.state.heldNorms = [];
  arrival.state.agenda.commitments = [];
  arrival.state.agenda.owed = [];
  arrival.state.agenda.goals = [];
  arrival.state.agenda.precommitments = [];
  return admitPortablePerson(parent, 'stairwell', arrival, {
    offsetMs: at - portable.retained.at,
    references:
      portable.source.personId === role
        ? []
        : [
            { kind: 'entity', source: portable.source.personId, target: role },
            { kind: 'source', source: portable.source.personId, target: role },
          ],
  });
}

export function currentDeparture<W>(run: BuildingRun<W>, id: Rid, hostObligations: readonly string[]) {
  if (
    hostObligations.length ||
    run.pendingRequests.some((request) =>
      request.kind === 'action'
        ? request.person === id
        : request.speaker === id || request.recipients.includes(id),
    )
  )
    throw new Error(
      'This person still has unfinished responsibilities here. Keep this chapter and finish them first.',
    );
  const castId = RESIDENTS[id].castId;
  const projection = run.inspect({
    perspective: { kind: 'host' },
    people: [id],
    select: ['persona'],
    portable: { person: id, castId, castRevision: canonicalCast(castId).revision },
  });
  const part = projection.people[0]?.parts.find((item) => item.select === 'persona');
  if (part?.select !== 'persona') throw new Error('HF did not provide the character projection.');
  const portable = part.value as PortablePerson;
  if (portable.version !== 2) throw new Error('HF did not provide retained character history.');
  return {
    transfer: {
      castPassport: 'hf-portable-person/2',
      sourceRole: id,
      hostObligations: [],
      portable,
      portableLimitations:
        'Supported history and responsibilities continue with explicit calendar and reference mapping. The source runtime and RNG stay archived.',
    },
    // This complete source stays in the local recovery/export record. It is not
    // replaced by the shelf summary or decoded as an ordinary actor reading.
    source: run.checkpoint(),
  };
}
