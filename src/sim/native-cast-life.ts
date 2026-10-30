/** Retained admission and its pinned source recipe. These are source records,
 * not shelf ownership, new memories, duty settlement or a religious ruling.
 */

import type { DeepReadonly, PersonAuthoring, RunArchive } from '@adam0white/human-framework';
import {
  canonicalPersona,
  castForGame,
  claimPortablePerson,
  createPersona,
  type LifePreparation,
  lifeAdmission,
  type PersonaEnvelope,
  portablePersonRole,
  preparePersonaLife,
  validatePersona,
} from '@adam0white/lab-client';
import { RESIDENTS, type Rid } from './building-cast.ts';
import { assertPlainBuildingData } from './building-decode.ts';
import { OPENING, openingPerson } from './hf-authoring.ts';
import { retainedOpening } from './hf-cast.ts';
import type { BuildingEdition, BuildingWorld } from './hf-world.ts';

// Only these roles can leave this authored chapter without outstanding local duties.
// Other residents remain authored local cast; their shelf histories are untouched.
export const ALLOCATION = castForGame('stairwell').filter(
  (person) => person.castId === RESIDENTS.hacer.castId || person.castId === RESIDENTS.sevim.castId,
);
export type NativeCastChapter = {
  version: 'stairwell-cast/2' | 'stairwell-cast/3';
  denials?: NativeCastDenial[];
  inputs: LifePreparation[];
  expectedHeads: Record<string, string | null>;
  arrivals: PersonAuthoring[];
  claims: PersonaEnvelope[];
};
export const NATIVE_CAST_AUTHORITY = 'stairwell-authority/2' as const;
export type NativeCastDenial = { castId: string; revision: string; reason: string };

/** Only denial metadata belongs to an opening; refused raw histories stay on the shelf. */
export function validateNativeDenials(value: unknown): NativeCastDenial[] {
  assertPlainBuildingData(value);
  if (!Array.isArray(value) || value.length > ALLOCATION.length)
    throw Error('The saved character refusals are missing or invalid. Keep the file.');
  const ids = new Set<string>();
  for (const denial of value) {
    if (
      !denial ||
      typeof denial !== 'object' ||
      Array.isArray(denial) ||
      Object.keys(denial).sort().join(',') !== 'castId,reason,revision' ||
      !ALLOCATION.some((person) => person.castId === denial.castId) ||
      ids.has(denial.castId) ||
      typeof denial.revision !== 'string' ||
      !/^[a-f0-9]{64}$/.test(denial.revision) ||
      typeof denial.reason !== 'string' ||
      !denial.reason.trim() ||
      denial.reason.length > 2000 ||
      !denial.reason.includes(RESIDENTS[roleFor(denial.castId)].name)
    )
      throw Error('A saved character refusal is invalid. Keep the file.');
    ids.add(denial.castId);
  }
  return structuredClone(value);
}

/** Structural authority gate shared by the controller and worker, before activation. */
export function validateNativeReceiptMetadata(input: unknown): NativeCastDenial[] | undefined {
  if (input === undefined) return undefined;
  assertPlainBuildingData(input);
  const record = input as Record<string, unknown>;
  const object = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);
  if (
    !object(record) ||
    Object.keys(record).some(
      (key) =>
        !['authority', 'denials', 'owned', 'sources', 'authored', 'fileOrigin', 'chapter'].includes(key),
    ) ||
    !object(record.owned) ||
    !object(record.sources) ||
    typeof record.authored !== 'boolean' ||
    typeof record.fileOrigin !== 'boolean' ||
    (record.authority !== undefined &&
      record.authority !== 'stairwell-authority/1' &&
      record.authority !== NATIVE_CAST_AUTHORITY)
  )
    throw Error('The saved character receipts are invalid. Keep the file.');
  if (record.authority !== NATIVE_CAST_AUTHORITY) return undefined;
  const denials = validateNativeDenials(record.denials);
  const chapter = record.chapter as NativeCastChapter | undefined;
  if (
    chapter !== undefined &&
    (!object(chapter) ||
      chapter.version !== 'stairwell-cast/3' ||
      canonicalPersona(chapter.denials) !== canonicalPersona(denials))
  )
    throw Error('The saved character refusals do not match the opening. Keep the file.');
  if (!chapter && denials.length)
    throw Error('The refused characters have no opening recipe. Keep the file.');
  if (chapter && (!Array.isArray(chapter.inputs) || !Array.isArray(chapter.claims)))
    throw Error('The saved character opening is invalid. Keep the file.');
  for (const denial of denials) {
    if (
      Object.hasOwn(record.owned, denial.castId) ||
      Object.hasOwn(record.sources, roleFor(denial.castId)) ||
      chapter?.inputs.some((input) => input?.parent?.castId === denial.castId) ||
      chapter?.claims.some((claim) => claim?.castId === denial.castId)
    )
      throw Error('A refused character cannot own a claim or source pin. Keep the file.');
  }
  return denials;
}

export function roleFor(castId: string): Rid {
  const role = (Object.keys(RESIDENTS) as Rid[]).find((id) => RESIDENTS[id].castId === castId);
  if (!role) throw new Error('This person has no role in this building. Keep the file.');
  return role;
}
export function refuseWorkTransfer(edition: string): void {
  if (edition === 'stairwell@16')
    throw new Error('Character transfer is unavailable in the Start work option. Keep the file.');
}

/** Cold host validation is synchronous. The browser separately verifies each
 * envelope's checksum before submitting any ownership claim. */
export function validateNativeLifeInputs(value: unknown): LifePreparation[] {
  assertPlainBuildingData(value);
  if (!Array.isArray(value) || value.length > ALLOCATION.length)
    throw new Error('The opening has an invalid list of earlier histories. Keep the file.');
  const ids = new Set<string>();
  for (const input of value as LifePreparation[]) {
    if (!input || typeof input !== 'object' || !input.parent || typeof input.parent.castId !== 'string')
      throw new Error('An earlier character history is missing. Keep the file.');
    const parent = input.parent;
    if (ids.has(parent.castId)) throw new Error('Two histories occupy the same role. Keep the file.');
    ids.add(parent.castId);
    if (canonicalPersona(preparePersonaLife(parent, input.clockMs)) !== canonicalPersona(input))
      throw new Error('The pinned time away does not match this source history. Keep the file.');
    lifeAdmission(input, 'stairwell');
    if (parent.transfer.castPassport !== 'hf-portable-person/2')
      throw new Error('This older summary needs its verified full source to retain history. Keep the file.');
    const role = roleFor(parent.castId);
    if (portablePersonRole(parent, 'stairwell') !== role)
      throw new Error('The source person does not match the receiving role. Keep the file.');
    if (role === 'burak' || role === 'tarik')
      throw new Error(
        `${RESIDENTS[role].name} has building accounts that cannot leave this chapter. Keep the source chapter.`,
      );
    if (RESIDENTS[role].nights)
      throw new Error(
        `${RESIDENTS[role].name} has an opening night-work duty here. Keep the source chapter.`,
      );
    retainedOpening(parent, OPENING, openingPerson(role));
  }
  return structuredClone(value) as LifePreparation[];
}

export function validateNativeLifeOpening(
  value: unknown,
  initial: DeepReadonly<RunArchive>['initial']['people'],
): void {
  const inputs = validateNativeLifeInputs(value);
  if (!inputs.length) return;
  if (initial.filter((person) => person.portable).length !== inputs.length)
    throw new Error('The earlier histories do not match every retained opening. Keep the file.');
  for (const input of inputs) {
    const role = roleFor(input.parent.castId);
    const arrival = retainedOpening(input.parent, OPENING, openingPerson(role));
    if (
      canonicalPersona(initial.find((person) => person.id === role)?.portable) !==
      canonicalPersona(arrival.portable)
    )
      throw new Error('The earlier history differs from the admitted person. Keep the file.');
  }
}

/** The same authored opening effects as the earlier host: a place, a note and
 * an optional errand. This never changes an actor or completes a source duty. */
export function applyHostLife(world: BuildingWorld, value: readonly LifePreparation[]): void {
  const inputs = validateNativeLifeInputs(value);
  if (!inputs.length) return;
  world.lifeNotes = {};
  for (const input of inputs) {
    const id = roleFor(input.parent.castId);
    const life = lifeAdmission(input, 'stairwell');
    world.lifeNotes[id] = life.line;
    const resident = world.residents.find((person) => person.id === id);
    if (!resident) throw new Error('This earlier history has no resident role. Keep the file.');
    if (!RESIDENTS[id].nights && !RESIDENTS[id].work) {
      resident.where = life.life.place === 'public-garden' ? 'step' : life.startsAtHome ? 'home' : 'shop';
      resident.until = 480;
    }
    if (life.availableForExtraWork || life.life.work === 'local-help') {
      const item =
        id === 'hacer'
          ? input.life.assignment === 0
            ? 'clean packaging'
            : 'a folded shop notice'
          : id === 'burak'
            ? 'a blank account sheet'
            : id === 'sevim'
              ? 'a clear notice draft'
              : id === 'tarik'
                ? 'a recorder battery'
                : 'supplies quietly to the door hook';
      world.tasks.push({
        id: world.nextTask++,
        kind: 'job',
        for: id,
        label: `Bring ${item}.`,
        place: `door:${id}`,
        from: 960,
        by: 1140,
        work: 8,
      });
    }
  }
}

export async function admitNativeCast(
  input: LifePreparation,
  edition: BuildingEdition = 'stairwell@14',
): Promise<PersonAuthoring> {
  refuseWorkTransfer(edition);
  const parent = await validatePersona(input.parent);
  validateNativeLifeInputs([input]);
  const role = roleFor(parent.castId);
  return retainedOpening(parent, OPENING, openingPerson(role));
}

/** Validate every source and claim against the actor authoring actually used by
 * this Run. A checksum establishes record integrity, never current shelf control.
 */
export async function validateNativeChapter(
  edition: string,
  initial: DeepReadonly<RunArchive>['initial']['people'],
  value: unknown,
): Promise<NativeCastChapter | undefined> {
  if (value === undefined) {
    if (initial.some((person) => person.portable))
      throw new Error('This retained opening is missing its source recipe. Keep the file.');
    return undefined;
  }
  refuseWorkTransfer(edition);
  assertPlainBuildingData(value);
  const chapter = value as NativeCastChapter;
  if (
    !chapter ||
    typeof chapter !== 'object' ||
    Array.isArray(chapter) ||
    !['stairwell-cast/2', 'stairwell-cast/3'].includes(chapter.version) ||
    Object.keys(chapter).sort().join(',') !==
      (chapter.version === 'stairwell-cast/3'
        ? 'arrivals,claims,denials,expectedHeads,inputs,version'
        : 'arrivals,claims,expectedHeads,inputs,version') ||
    !Array.isArray(chapter.inputs) ||
    !Array.isArray(chapter.arrivals) ||
    !Array.isArray(chapter.claims) ||
    chapter.inputs.length > ALLOCATION.length ||
    chapter.claims.length !== chapter.inputs.length
  )
    throw new Error('The retained opening recipe is invalid. Keep the file.');
  validateNativeLifeInputs(chapter.inputs);
  const denials = chapter.version === 'stairwell-cast/3' ? validateNativeDenials(chapter.denials) : [];
  for (const denial of denials)
    if (
      chapter.inputs.some((input) => input.parent.castId === denial.castId) ||
      chapter.claims.some((claim) => claim?.castId === denial.castId)
    )
      throw Error('A refused character cannot have an opening claim. Keep the file.');
  const expectedHeads = Object.fromEntries(
    ALLOCATION.map((c) => [
      c.castId,
      chapter.inputs.find((input) => input.parent.castId === c.castId)?.parent.revision ??
        denials.find((denial) => denial.castId === c.castId)?.revision ??
        null,
    ]),
  );
  if (canonicalPersona(expectedHeads) !== canonicalPersona(chapter.expectedHeads))
    throw new Error('The source parents do not match the prepared shelf heads. Keep the file.');
  const arrivals = await Promise.all(
    chapter.inputs.map((input) => admitNativeCast(input, edition as BuildingEdition)),
  );
  if (
    canonicalPersona(arrivals) !== canonicalPersona(chapter.arrivals) ||
    initial.filter((person) => person.portable).length !== arrivals.length
  )
    throw new Error('The source recipe does not match the retained arrivals. Keep the file.');
  for (let index = 0; index < chapter.inputs.length; index++) {
    const input = chapter.inputs[index];
    const arrival = arrivals[index];
    if (
      !input ||
      !arrival ||
      canonicalPersona(initial.find((person) => person.id === arrival.id)?.portable) !==
        canonicalPersona(arrival.portable)
    )
      throw new Error('The actual opening differs from its source history. Keep the file.');
    const { revision, ...body } = input.parent;
    const expected = await createPersona({
      ...body,
      parentRevision: revision,
      transfer: { ...claimPortablePerson(input.parent, 'stairwell'), life: input.life },
    });
    const claim = chapter.claims.find((candidate) => candidate?.castId === input.parent.castId);
    if (!claim || canonicalPersona(await validatePersona(claim)) !== canonicalPersona(expected))
      throw new Error('The receiving claim differs from its actual source parent. Keep the file.');
  }
  return structuredClone(chapter);
}
