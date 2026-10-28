/** Privileged readings for actual building rules. UI knowledge must use its own
 * explicit person perspective; these readings do not grant the caretaker facts.
 */
import type { PersonView } from '@stairwell/hf4';
import type { BuildingRun } from './hf-run.ts';

type HostPart = Extract<PersonView, { kind: 'host' }>['parts'][number];
type HostParts = { [K in HostPart['select']]: Extract<HostPart, { select: K }>['value'] };

function hostPart<W, K extends keyof HostParts>(
  run: BuildingRun<W>,
  person: string,
  select: K,
): HostParts[K] {
  const reading = run.inspect({ perspective: { kind: 'host' }, people: [person], select: [select] });
  const found = reading.people[0];
  if (found?.kind !== 'host') throw Error('HF did not provide a privileged building reading.');
  const part = found.parts.find((part) => part.select === select);
  if (!part) throw Error(`HF did not provide ${select}.`);
  return part.value as HostParts[K];
}

export const currentBody = <W>(run: BuildingRun<W>, person: string) => hostPart(run, person, 'body');
export const currentBeliefs = <W>(run: BuildingRun<W>, person: string) => hostPart(run, person, 'beliefs');
export const currentAgenda = <W>(run: BuildingRun<W>, person: string) => hostPart(run, person, 'agenda');
export const currentTraits = <W>(run: BuildingRun<W>, person: string) => hostPart(run, person, 'traits');
export const currentNormUnderstanding = <W>(run: BuildingRun<W>, person: string) =>
  hostPart(run, person, 'heldNorms');
export const currentTies = <W>(run: BuildingRun<W>, person: string) =>
  hostPart(run, person, 'relationships').ties;
export const currentSourceTrust = <W>(run: BuildingRun<W>, person: string) =>
  hostPart(run, person, 'sourceTrust');

/** A probability representation of HF's log odds, with no belief update. */
export function beliefProbability<W>(run: BuildingRun<W>, person: string, proposition: string): number {
  const belief = currentBeliefs(run, person).find((belief) => belief.prop === proposition);
  return belief ? 1 / (1 + Math.exp(-belief.logOdds)) : 0.5;
}
