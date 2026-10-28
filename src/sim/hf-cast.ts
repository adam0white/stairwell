/** Current-source exchange uses HF's public projection and mapped authoring.
 * The shelf still owns identity, transport and CAS. A file never owns a head.
 */

import type { PersonAuthoring, PortablePerson, RunSpec } from '@adam0white/human-framework';
import {
  admitPortablePerson,
  canonicalCast,
  canonicalPersona,
  type PersonaEnvelope,
  portablePersonRole,
  validatePortablePerson,
} from '@adam0white/lab-client';
import { RESIDENTS, RIDS, type Rid } from './building-cast.ts';
import { buildingSpec, emptyPortableOpening } from './hf-authoring.ts';
import type { BuildingRun } from './hf-run.ts';

/** Shared ingress/recovery guard. Valid HF portability alone cannot change
 * the building's shared calendar or authorize another local reference mapping. */
export function checkBuildingPortable(
  admission: NonNullable<PersonAuthoring['portable']>,
  role: string,
  at: number,
  calendar: RunSpec['definitions']['calendar'] = buildingSpec(0).definitions.calendar,
): void {
  const portable = validatePortablePerson(admission.person);
  if (
    portable.version !== 2 ||
    !RIDS.includes(role as Rid) ||
    portable.castId !== RESIDENTS[role as Rid].castId ||
    portable.castRevision !== canonicalCast(portable.castId).revision ||
    admission.mapping.offsetMs !== at - portable.retained.at
  )
    throw new Error('This retained source or clock mapping cannot continue here. Keep the file.');
  const references =
    portable.source.personId === role
      ? []
      : [
          { kind: 'entity', source: portable.source.personId, target: role },
          { kind: 'source', source: portable.source.personId, target: role },
        ];
  if (canonicalPersona(references) !== canonicalPersona(admission.mapping.references))
    throw new Error('This character needs a reference mapping from its source chapter. Keep the file.');
  // A run has one authored calendar for the entire building. A remembered
  // foreign window cannot silently replace that shared world calendar or vanish.
  const offset = admission.mapping.offsetMs;
  const sourceCalendar = portable.retained.calendar.definition;
  if (sourceCalendar.dayMs !== calendar.dayMs)
    throw new Error('This calendar needs its source chapter. Keep the file.');
  for (const day of sourceCalendar.days) {
    if (!day.prayers && !day.fasting && !day.eid && !day.windows.length && day.nextFajrMs === undefined)
      continue;
    const mapped = structuredClone(day);
    mapped.start += offset;
    if (mapped.fasting) {
      mapped.fasting.from += offset;
      mapped.fasting.until += offset;
    }
    if (mapped.eid) {
      mapped.eid.from += offset;
      mapped.eid.until += offset;
    }
    mapped.windows = mapped.windows.map((window) => ({
      ...window,
      from: window.from + offset,
      until: window.until + offset,
    }));
    const target = calendar.days.find((candidate) => candidate.start === mapped.start);
    if (!target || canonicalPersona({ ...mapped, dayIndex: target.dayIndex }) !== canonicalPersona(target))
      throw new Error(
        'This character’s calendar windows need their source chapter. Keep the file; no duties have been removed.',
      );
  }
}

export function retainedOpening(
  parent: PersonaEnvelope,
  at: number,
  opening: PersonAuthoring,
  calendar: RunSpec['definitions']['calendar'] = buildingSpec(0).definitions.calendar,
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
  const arrival = emptyPortableOpening(opening);
  const admitted = admitPortablePerson(parent, 'stairwell', arrival, {
    offsetMs: at - portable.retained.at,
    references:
      portable.source.personId === role
        ? []
        : [
            { kind: 'entity', source: portable.source.personId, target: role },
            { kind: 'source', source: portable.source.personId, target: role },
          ],
  });
  if (!admitted.portable) throw new Error('This character needs its retained source. Keep the file.');
  checkBuildingPortable(admitted.portable, role, at, calendar);
  return admitted;
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
